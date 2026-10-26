---
title: 'Assign-contacts selection service layer'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/data-model.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ux-flows.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `campaignScope` already computes the AD-3 contact predicate and the assignable caller set, and `dialer_contact_profiles` already holds the four calling facets, but nothing in the server layer can answer the assign-contacts screen. Without this service the API layer would re-derive the scope, invent its own paging, and build facets from the page it happened to load — the exact defect AD-11 and AD-16 exist to prevent. The weighted split also has no single implementation, so the preview the admin sees and the rows Story 1.8 writes could disagree.

**Approach:** Add one server-only module, `lib/dialer/assignments.ts`, with three operations. `listAssignableContacts` resolves the campaign through `getCampaign` (so a missing, malformed or other-program id is `404 campaign_not_found`), takes the contact predicate from `campaignScope`, reads the whole scoped contact set through the shared AD-16 pager, joins `dialer_contact_profiles` by contact id, and returns one page plus the real total and whole-set facets. `listAssignableCallers` returns `campaignScope(staff).assignableCallers` unchanged. `previewAssignmentSplit` is the pure floor-plus-largest-remainder distribution that Story 1.8's write will reuse, so the preview and the persisted counts cannot diverge.

## Boundaries & Constraints

**Always:**
- `listAssignableContacts` and `listAssignableCallers` open with `requireCampaignAdmin(staff)`. A Volunteer is refused with `403 forbidden` before any read.
- `listAssignableContacts` resolves the campaign with `getCampaign(staff, campaignId)` before reading contacts. A malformed id, a missing row and another program's campaign are all `404 campaign_not_found`.
- The contact predicate comes from `campaignScope(staff)`: `kind: "program"` reads every contact in the program; `kind: "preacher"` reads `contacts.assigned_preacher_id = scope.userId`. A Preacher or Assistant with no scope id keeps `403 campaign_scope_missing` and is never widened to the program.
- The caller picker is `campaignScope(staff).assignableCallers` exactly — Admin: the program; Preacher: assignees plus self; Assistant: the preacher's assignees plus self; a user with an inactive `dialer_callers` profile is absent. No second read and no re-derivation.
- Contacts are read through `lib/supabase/paging.ts` (AD-16) ordered by `id`, so a page boundary is stable; a read error is `500 contact_list_read_failed` and a read that exhausts the page budget is `500 contact_list_truncated`, never a short list.
- Profiles are read by the in-scope contact ids in chunks of 200, filtered by `program_id`, also through the shared pager. A contact with no profile row is returned with `profile: { centre: null, level: null, gender: null, language: null }` and is fully selectable.
- `page` defaults to 1 and must be a whole number ≥ 1; `pageSize` defaults to 25 and must be a whole number between 1 and 100. `page` beyond the last page returns `rows: []` with the real `total`, never an error and never a clamped page number.
- Every row is `contactId, name, phone, locationIds, assignedPreacherUserId?, profile`. `locationIds` is `[]` when `contacts.location_ids` is null; `assignedPreacherUserId` is absent, not null, when the column is null.
- Search is a case-insensitive substring over `contacts.name` and `contacts.phone`, applied after trimming; an empty or non-string value means no search.
- Facet filters (`centre`, `level`, `gender`, `language`) are exact matches against the trimmed profile value. A null profile value, a missing profile row and a padded-empty value are excluded when that facet is filtered. Two or more facet filters intersect.
- `facets` is the distinct, sorted, non-null values of each facet across the **whole scoped set**, computed before search and facet filters. A scope with no profile rows yields four empty arrays.
- `total` is the count of scoped contacts after search and facet filters. `totalPages` is `Math.ceil(total / pageSize)` and is 0 when `total` is 0.
- `previewAssignmentSplit(total, callers)` validates at least one caller, each `callerId` a non-empty string appearing once, each `weight` a positive safe integer, and `total` a non-negative safe integer. It returns one entry per input caller in input order with `{ callerId, weight, count }`, and the counts sum exactly to `total`.
- The module is `import "server-only"`, uses double quotes, `@/*` alias imports, the service-role client, `Database` row aliases and camelCase DTOs. DTOs and the split function are exported for the API layer.

**Never:**
- Do not exclude contacts already assigned in the campaign. Story 1.8's pre-check names them by current caller; hiding them here would make the conflict list disagree with what the admin selected.
- Do not store an audience filter, a weight or a split. AD-11 makes both selection-time values; the database keeps only the resulting `(contact_id, campaign_id, caller_id)` rows.
- Do not derive facets from the current page or from the filtered set. The source app's defect was a facet list that changed while paging.
- Do not silently clamp `pageSize` or a page beyond the end. The caller gets the real page number and the real total, or a named `400`.
- Do not create a contact, a caller profile or a campaign, and do not write anything. This layer issues no insert, update or delete.
- Do not add a `dialer_assignments` read, a conflict list or a transaction; those are Story 1.8.
- Do not read `dialer_contact_profiles` by `program_id` alone for a preacher scope. Profiles are read by the contact ids already proven in scope, so another preacher's facet values never leak.
- Do not add an `/api` route, page, component, migration, e2e spec, package manifest or Playwright config.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Contacts, Admin | Program with contacts | Every program contact, page 1, `pageSize = 25`, real `total`, `totalPages` | — |
| Contacts, Preacher | Contacts owned by the Preacher and by others | Only `assigned_preacher_id = staff.userId` | — |
| Contacts, Assistant | `assigned_preacher_id` set | Only the preacher's contacts | — |
| Contacts, Assistant without a preacher | `assigned_preacher_id` absent | No read | `403 campaign_scope_missing` |
| Contacts, Volunteer | Any query | No read | `403 forbidden` |
| Contacts, malformed campaign id | `"abc"` | No contact read | `404 campaign_not_found` |
| Contacts, missing or other-program campaign | Valid UUID, no row in `staff.programId` | No contact read | `404 campaign_not_found` |
| Contacts, second page | `page = 2`, `pageSize = 25` | Rows 26–50 of the same ordered set; same `total` | — |
| Contacts, page past the end | `page = 99` with 10 contacts | `rows: []`, `total = 10`, `totalPages = 1`, `page = 99` | — |
| Contacts, page size default | `pageSize` absent | `pageSize = 25` | — |
| Contacts, page size at the cap | `pageSize = 100` | 100 rows | — |
| Contacts, page size above the cap | `pageSize = 101` | No read | `400 invalid_page_size` |
| Contacts, page size not a positive integer | `0`, `-1`, `2.5`, `NaN` | No read | `400 invalid_page_size` |
| Contacts, page not a positive integer | `0`, `-1`, `1.5` | No read | `400 invalid_page` |
| Contacts, search matches a name | `"anand"` with `"Anand Kumar"` | The contact is returned; matching is case-insensitive | — |
| Contacts, search matches a phone fragment | `"98765"` | Contacts whose phone contains the fragment | — |
| Contacts, search matches nothing | `"zzzz"` | `rows: []`, `total = 0`, `totalPages = 0`; facets still whole-set | — |
| Contacts, search padded or empty | `"  "` | Treated as no search | — |
| Contacts, one facet filter | `centre = "Kolkata"` | Only contacts whose trimmed centre equals it; no-profile and null-centre contacts excluded | — |
| Contacts, facet filters intersect | `centre` and `gender` set | Only contacts matching both | — |
| Contacts, facet value absent from the scope | `level = "PhD"` with no such profile | `rows: []`, `total = 0`; facets unchanged | — |
| Contacts, filter contradicts another facet | `centre` excludes every `gender` option | `rows: []`, `total = 0`; no crash | — |
| Contacts, contact without a profile row | No `dialer_contact_profiles` row | Row returned, `profile` all null, contributes nothing to facets | — |
| Contacts, profile row with null fields | Some or all facet columns null | Row returned with those fields null; only non-null values reach facets | — |
| Contacts, padded stored value | `centre = " Kolkata "` | Offered and matched as `"Kolkata"` | — |
| Contacts, facets ignore the current page | Page 2 of 3 | Facets identical to page 1 | — |
| Contacts, selection already assigned | Contact has a `dialer_assignments` row in this campaign | Contact is still returned; this layer reads no assignments | — |
| Contacts, two contacts share a name | Equal names | Stable order | `contactId` tie-break |
| Contacts, contact read fails | PostgREST error | No partial page | `500 contact_list_read_failed` |
| Contacts, contact read truncates | Full final page at the page budget | No short list | `500 contact_list_truncated` |
| Contacts, profile read fails | PostgREST error | No partial page | `500 contact_profile_read_failed` |
| Contacts, profile read truncates | Full final page at the page budget | No short list | `500 contact_list_truncated` |
| Contacts, `campaignScope` read fails | Its own staff or caller-profile read fails | No contact read | `500 dialer_roster_read_failed` / `500 dialer_roster_truncated` |
| Callers, Admin | Program with active staff and caller profiles | Every active staff user, sorted by name, `callerId` present when a profile exists | — |
| Callers, Preacher | Preacher's assignees plus self | Assignees and the Preacher; another preacher's staff absent | — |
| Callers, Assistant | `assigned_preacher_id` set | The preacher's assignees plus the Assistant | — |
| Callers, inactive caller | `dialer_callers.is_active = false` | Absent from the list | — |
| Callers, Volunteer | Any request | No read | `403 forbidden` |
| Split, zero contacts | `total = 0`, one or more callers | Every `count = 0` | — |
| Split, one caller | `total = 120`, one weight | That caller gets 120 | — |
| Split, uneven weights | `total = 120`, weights 3 / 2 / 2 | `52 / 34 / 34`, summing to 120 | — |
| Split, remainder tie | Equal remainders, different weights | Higher weight takes the leftover first | — |
| Split, remainder and weight tie | Equal remainders and weights | Earlier list position takes the leftover first | — |
| Split, weight not a positive integer | `0`, `-1`, `2.5`, `NaN` | No split | `400 invalid_weight` |
| Split, no callers | `[]` | No split | `400 invalid_caller_list` |
| Split, duplicate caller | The same `callerId` twice | No split | `400 invalid_caller_list` |
| Split, empty caller id | `""` or whitespace | No split | `400 invalid_caller_list` |
| Split, bad count | `-1`, `2.5`, `NaN` | No split | `400 invalid_total` |

## Human Decisions

1. **The module is `lib/dialer/assignments.ts`.** It is named for the thing it prepares (`dialer_assignments`), not for the screen. `listAssignableContacts`, `listAssignableCallers` and `previewAssignmentSplit` are the only exports besides the DTOs, and Story 1.8 imports the split from here rather than re-deriving it.
2. **The whole scoped set is read per request and paged in memory.** AD-16's pager already reads every page; joining profiles needs the contact ids anyway; and one contact read answers both the page slice and `total`, so there is no separate count query to disagree with the page at a boundary. At ~1,030 folk contacts this is two contact pages and ~6 profile chunks. A program above the pager's 50,000-row budget fails loudly rather than degrading.
3. **Facets ignore the search and the facet filters.** The design requirement is "from the whole scoped set, not the current page", and the source app's defect was options that moved underneath the admin. A selected facet can therefore offer a combination with zero results; that is rendered as the ordinary empty state, not as a filter that silently disappeared.
4. **Facet values are trimmed once, on read.** `" Kolkata "` and `"Kolkata"` become one option and one filter value, and a padded-empty string is absent. Case is not folded: `"Kolkata"` and `"kolkata"` remain two options, because exact match is the contract and inventing a collation would make the stored data and the option disagree.
5. **`pageSize` above 100 is a `400`, not a silent clamp.** "Max 100" is read as a contract with the caller, not as advice; a clamped page reported as the requested size would misstate what the page contains. A page past the end is the other half of the same rule: the response keeps the requested `page` and the real `total` rather than pretending page 99 is page 1.
6. **Already-assigned contacts stay in the list.** AD-11's pre-check names them by current caller and the admin chooses skip or move; the selection surface must offer the same population the pre-check will report, or the conflict list is about people the admin could not see.
7. **The split's invalid count is `invalid_total`.** The layer brief names `invalid_weight` and `invalid_caller_list`; a non-integer or negative `total` needs its own named refusal rather than being coerced to 0, which would claim a preview of an unknown selection is empty.
8. **A duplicated `callerId` is `invalid_caller_list`.** Two entries for one caller would produce two rows in the preview and an ambiguous write; the UI has one weight input per caller, so a duplicate is a malformed request, not a case to merge.
9. **The facet filter is exclusive of missing data.** Filtering `gender = "Female"` excludes a contact with no profile row and a contact whose profile row has `gender = null`. "Unknown" is not a selectable facet value; an admin who wants everyone clears the filter.
10. **Search is a substring, not tokenised and not phone-normalised.** Name and phone are matched case-insensitively against the trimmed term; `+91`/spacing variants in the phone are not normalised, so a term must appear in the stored digits as typed. Normalisation would be a new contract, not an implementation detail.

</frozen-after-approval>

## Code Map

- `lib/dialer/assignments.ts` — `listAssignableContacts`, `listAssignableCallers`, `previewAssignmentSplit`, the DTOs, the scoped contact read, the chunked profile join, the in-memory search/facet filter and the whole-set facet builder.
- `lib/dialer/scope.ts` — `campaignScope`, `requireCampaignAdmin` and the `AssignableCaller` DTO, reused as the scope, caller-set and contact-predicate source (read-only here).
- `lib/dialer/campaigns.ts` — `getCampaign`, the campaign 404 shape this read reuses (read-only here).
- `lib/supabase/paging.ts` — `collectPagedRows`, AD-16's shared pager, used by both contact and profile reads (read-only here).
- `lib/supabase/admin.ts` — `createSupabaseAdminClient`, the service-role client (read-only here).
- `lib/supabase/types.ts` — the generated `contacts` and `dialer_contact_profiles` row aliases (read-only here).
- `lib/authz.ts` — `AuthzError`, `StaffContext` and `requireRole` (read-only here).
- `supabase/migrations/20261025000000_create_dialer_tables.sql` — `dialer_contact_profiles` columns, the nullable facets and the `contact_id` primary key this layer reads against (read-only here).
- `_bmad-output/specs/spec-autodialer/stories/1-7-assign-select-server.md` — this record.

## Tasks & Acceptance

**Execution:**
- [x] `lib/dialer/assignments.ts` — `listAssignableContacts` with the campaign 404 gate, the AD-3 contact predicate, the AD-16 contact read, the chunked profile join, the search/facet filter and the page slice.
- [x] `lib/dialer/assignments.ts` — whole-set facets for `centre`, `level`, `gender`, `language`, ignoring search and facet filters, sorted and distinct.
- [x] `lib/dialer/assignments.ts` — `listAssignableCallers`, delegating to `campaignScope` with no second derivation.
- [x] `lib/dialer/assignments.ts` — `previewAssignmentSplit` with weight, caller-list and count validation and the floor-plus-largest-remainder distribution.
- [x] `lib/dialer/assignments.ts` — the exported `AssignableContact`, `AssignableContactProfile`, `AssignableContactQuery`, `AssignableContactPage`, `ContactFacets`, `AssignmentWeight` and `AssignmentSplitEntry` DTOs.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-7-assign-select-server.md` — this record.

**Acceptance Criteria:**
- Given an Admin, when they list assignable contacts, then every contact in the program is reachable across pages and `total` is the scoped count, not the page length.
- Given a Preacher, when they list assignable contacts, then only contacts with `assigned_preacher_id = staff.userId` are returned; an Assistant sees only their preacher's contacts, and an Assistant without a preacher is `403 campaign_scope_missing`.
- Given a Volunteer, when either list runs, then `403 forbidden` is returned before a read.
- Given a campaign id that is malformed, missing or belongs to another program, when contacts are listed, then no contact is read and `404 campaign_not_found` is returned.
- Given a facet filter, then the result contains only contacts whose profile value matches exactly, and a contact with no profile row or a null value in that field is excluded.
- Given any page of a scope, then `facets` is identical across pages and contains the distinct non-null values of the whole scope.
- Given a contact with no `dialer_contact_profiles` row, then it is returned with a null profile and is still selectable.
- Given a selection, then a contact already assigned in the campaign is still returned by this layer; the conflict list belongs to Story 1.8.
- Given any page request, then the page size is at most 100, the page slice comes from a stable order, and a truncated read is a 500 rather than a short list.
- Given callers and weights, then the preview's per-caller counts sum exactly to the contact count and no weight is stored or written.
- Given a zero-length caller list, a duplicate caller, a non-positive weight or a negative count, then the split is refused with a 400 named error and returns no counts.

## Implementation Notes

### Exported surface

| Export | Signature |
|---|---|
| `AssignableContactProfile` | `{ centre: string \| null; level: string \| null; gender: string \| null; language: string \| null }` |
| `AssignableContact` | `{ contactId: string; name: string; phone: string; locationIds: string[]; assignedPreacherUserId?: string; profile: AssignableContactProfile }` |
| `AssignableContactQuery` | `{ page?; pageSize?; search?; centre?; level?; gender?; language? }` |
| `AssignableContactPage` | `{ rows: AssignableContact[]; page; pageSize; total; totalPages; facets }` |
| `ContactFacetKey` | `"centre" \| "level" \| "gender" \| "language"` |
| `ContactFacets` | `Record<ContactFacetKey, string[]>` |
| `AssignmentWeight` | `{ callerId: string; weight: number }` |
| `AssignmentSplitEntry` | `{ callerId: string; weight: number; count: number }` |
| `listAssignableContacts` | `(staff: StaffContext, campaignId: string, query?: AssignableContactQuery) => Promise<AssignableContactPage>` |
| `listAssignableCallers` | `(staff: StaffContext) => Promise<AssignableCaller[]>` |
| `previewAssignmentSplit` | `(total: number, callers: AssignmentWeight[]) => AssignmentSplitEntry[]` |

### Paging and total

`readScopedContacts` orders by `contacts.id` before `.range(from, to)`, so consecutive pages cannot overlap or skip while the set is unchanged. `collectPagedRows` fails at `POSTGREST_MAX_PAGES` (50) with `contact_list_truncated`; it never returns a partial set. The page is sliced from the same in-memory sorted array that produced `total`, so `Showing X–Y of N` cannot contradict the rows.

- `page` default 1, integer ≥ 1, else `400 invalid_page`.
- `pageSize` default 25, integer 1–100, else `400 invalid_page_size`.
- `totalPages = ceil(total / pageSize)`; `0` when there are no matches.
- A page beyond `totalPages` returns no rows and keeps the requested `page`; `total` remains real.

### Facet contract

Each row's profile is normalised once: `trim()`, then `null` for an absent profile row, a null column or a padded-empty string. Facets are accumulated from every entry in the scoped read, before `search` and the four filters are applied, then sorted with `localeCompare` and deduplicated with a `Set`. Filtering compares the normalised profile value to the normalised query value exactly, so a missing profile and a null field both fail a filter.

The design's requirement is that the option lists describe the whole scope. That means a selected combination may return zero rows (for example `centre` chosen together with a `gender` that exists only in another centre); the response is then `rows: []`, `total: 0`, with the facets unchanged. No request recomputes options from the result.

### Weighted split

For `N` contacts and `k` callers with positive integer weights `w₁…wₖ`:

1. `W = Σ wᵢ`.
2. `baseᵢ = ⌊N × wᵢ ÷ W⌋`.
3. `rᵢ = (N × wᵢ) mod W`.
4. `leftover = N − Σ baseᵢ`, which is always less than `k`.
5. Sort by `rᵢ` descending, then `wᵢ` descending, then input position; give the first `leftover` entries one extra unit.

Input order is preserved in the returned array, so the UI's rows and the preview's rows line up. The multiplication and remainder run in `BigInt` so a large weight cannot lose a remainder unit to floating-point rounding. The counts always sum to `N`.

**Worked example:** `N = 120`, weights A = 3, B = 2, C = 2 (`W = 7`).

| Caller | `N × w` | base | remainder |
|---|---|---|---|
| A | 360 | 51 | 3 |
| B | 240 | 34 | 2 |
| C | 240 | 34 | 2 |

Base total is 119, so one unit is left. A has the largest remainder and receives it: **A = 52, B = 34, C = 34**, summing to 120. Ties are honest too: with `N = 2`, weights 3 and 1, both remainders are 2, so the higher weight takes the unit (2 and 0); with `N = 3`, equal weights, both remainders are 1 and the first listed caller takes it (2 and 1).

### Error codes

| Code | HTTP | Raised by | Trigger |
|---|---|---|---|
| `forbidden` | 403 | both lists | Volunteer |
| `campaign_scope_missing` | 403 | both lists | a Preacher/Assistant scope with no scope id |
| `campaign_not_found` | 404 | contacts | malformed, missing or other-program campaign id |
| `invalid_page` | 400 | contacts | `page` not an integer ≥ 1 |
| `invalid_page_size` | 400 | contacts | `pageSize` not an integer 1–100 |
| `contact_list_read_failed` | 500 | contacts | a `contacts` read error |
| `contact_list_truncated` | 500 | contacts | a `contacts` or profile read exhausted the page budget |
| `contact_profile_read_failed` | 500 | contacts | a `dialer_contact_profiles` read error |
| `dialer_roster_read_failed` / `dialer_roster_truncated` | 500 | both lists | inherited from `campaignScope`'s assignable-set read |
| `invalid_total` | 400 | split | `total` not an integer ≥ 0 |
| `invalid_caller_list` | 400 | split | no callers, a duplicate caller, or an empty caller id |
| `invalid_weight` | 400 | split | a weight not a positive integer |

### No stored audience filter, and no stored weight

AD-11 makes the target audience a selection-time facet over `dialer_contact_profiles` and the weight a write-time distribution rule. This module persists neither: it reads `contacts` plus the profile join and computes the distribution in memory. There is no `audience_filter` column and no weights table to keep in sync. The same reasoning keeps contacts already assigned in the campaign visible — the pre-check is Story 1.8's, and this layer reads no `dialer_assignments` row at all.

### The caller picker is not a second query

`listAssignableCallers` calls `campaignScope` and returns its `assignableCallers` untouched. That set already excludes a user with an inactive `dialer_callers` profile, already includes the Preacher or Assistant themselves, and already carries `callerId` when a profile exists. A second `users` read here would let the picker and the roster disagree about who may receive work, which is the failure AD-3 exists to prevent.

## Spec Change Log

None.

## Review Triage Log

None.

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0, at `1623cb7`.
  - `pnpm guardrails` — "Monorepo guardrails passed." with the four pre-existing type-import warnings in `lib/auth-context.tsx`, `components/auth-hash-callback.tsx`, `components/invite-user-form.tsx` and `components/staff-auth-shell.tsx`, and `[verify-dialer-route-coverage] All 9 route(s) covered by denial sweep.`
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — "✖ 16 problems (0 errors, 16 warnings)"; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm exec eslint lib/dialer/assignments.ts` — no output, exit 0 (targeted check before the full gate).

An out-of-repo `node` replica of the split formula was run against 20,923 totals and weight triples: every result summed exactly to the total and every count was the floor or ceiling of its exact share. That checks the formula, not the module — the module itself has no caller in this layer.

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- No e2e command was run. This layer has no route or page, and the story's `pnpm test:e2e campaign-assign-select` scope belongs to the UI layer.
- No runtime smoke test was possible: the module is `server-only`, has no route, and the repo has no unit runner. See "What this layer does not prove".

**Post-run state:** no database was contacted, so no contact, profile, campaign or assignment row was created or changed.

## What this layer does not prove

There is no unit runner in this repo and no `/api/dialer/**` route reaches this module yet, so `pnpm test:static` proves types, import boundaries and lint only. The paging arithmetic, the facet exclusion rule and the split's remainder ordering are unproven until the API layer's route sweep and Story 1.8's write exercise them. In particular, `previewAssignmentSplit` has no consumer in this layer and is verified only by reading it.

Two things this layer deliberately cannot account for:

- **The browser surface.** `pnpm test:e2e campaign-assign-select` belongs to the UI layer: the desktop-only gate, the hidden-selected count, the selection that survives a page change and the disabled primary action at zero selection are all client state. This layer supplies `total`, `page`, `pageSize` and the rows; it cannot prove what the screen does with them.
- **The conflict pre-check and the write.** Story 1.8 owns naming already-assigned contacts, the skip/move choice and the one transaction that writes the confirmed set. This layer returns those contacts in the selection population but reads no assignment and writes nothing.

A smaller limitation: the whole scoped set and its profiles are read on every page request, which is correct at ~1,030 contacts and bounded by AD-16's 50,000-row pager budget, but it does not scale to a much larger programme without moving the search and facet predicates into the query. That is recorded as debt rather than invented as a database-side filter this layer cannot test. A second: facet matching is exact and case-sensitive after trimming, so mixed-case stored values become separate options; folding case would need a collation decision from Dwaraka.
