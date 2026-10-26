---
title: 'Assign-contacts selection API routes'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/design-coverage.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `lib/dialer/assignments.ts` can page the AD-3-scoped contact set, join the four calling facets and build whole-set facet options, but no route reaches it. Without an HTTP surface the assign-contacts screen would have to import a `server-only` module into the client graph, or re-derive scope, paging and validation in a second implementation — the exact drift AD-3 and AD-16 exist to prevent. The AD-8 sweep also has no row for the selection read, so a route the UI will call could ship without a boundary test.

**Approach:** One route file, `GET /api/dialer/admin/campaigns/[campaignId]/contacts`, a thin delegate over `listAssignableContacts`. It resolves `getStaffContext()` first, forwards `page`, `pageSize`, `search`, `centre`, `level`, `gender` and `language` from the query string, and returns the service's page object unchanged — `200 { rows, page, pageSize, total, totalPages, facets }`. The handler is `force-dynamic`, takes `params` as a Promise, and funnels every throw through `dialerErrorResponse`. The sweep gains one `kind: "admin"` row whose owner case runs against a real disposable campaign, plus five payload-contract tests for the envelope and the four named page refusals. There is no `POST` here; the write is Story 1.8.

## Boundaries & Constraints

**Always:**
- The handler declares `export const dynamic = "force-dynamic"`, calls `await getStaffContext()` first, and returns `dialerErrorResponse(error)` from its catch.
- The gates are the service's own: `listAssignableContacts` opens with `requireCampaignAdmin` (AD-2), resolves the campaign with `getCampaign` (so a malformed, missing or other-program id is `404 campaign_not_found`), reads the contact predicate from `campaignScope` (AD-3), then validates `page` and `pageSize`.
- The route adds no role logic, no scope filter, no facet logic and no paging arithmetic. It forwards the query string and returns the service's `AssignableContactPage` as the response body — no key is renamed, dropped or added.
- `page` and `pageSize` are optional: an absent parameter is `undefined`, so the service's defaults (1 and 25) apply. A present but non-numeric value reaches `Number.isInteger` as `NaN` and becomes the service's named `400 invalid_page` / `invalid_page_size`, never a silent page 1.
- `search`, `centre`, `level`, `gender` and `language` are forwarded as raw strings; the service trims them.
- Next 16's dynamic `params` is a Promise: `const { campaignId } = await context.params`.
- Every route file has a sweep row whose `route:` is exactly the guardrail's directory-derived path, brackets included. Every existing sweep row stays.
- The route's owner row runs against a campaign the fixture creates in `beforeAll` and removes in `afterAll` through `deleteDisposableCampaign`'s local `/pg/query` SQL.

**Never:**
- No `POST` on this route. The weighted, conflict-aware write is Story 1.8.
- No route under `/api/dialer/caller/**` in this story.
- No second paging, facet or scope implementation in the route, and no re-shaping of the service's page object.
- The sweep never creates a contact, a profile, a caller or an assignment: the owner row is a pure read, so the seeded database is unchanged except for the fixture campaign's own row, created and removed in the same run.
- Do not edit `lib/**`, `components/**`, `apps/folk/app/campaigns/**`, `public/sw.js`, the proxies, the migrations or the page/UI layer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List as an Admin | Admin session, real campaign, no query | `200` with the service's page object: `rows`, `page = 1`, `pageSize = 25`, real `total` / `totalPages`, four facet arrays | — |
| List as a Preacher / Assistant | Either session, real campaign | `200`, rows scoped by `campaignScope` | — |
| List as a Volunteer | Volunteer session | No read issued | `403 forbidden`, JSON body |
| List with no session | No cookie | No staff context resolved | `401 unauthenticated` |
| List a malformed campaign id | `"abc"` | No contact read | `404 campaign_not_found` |
| List a missing or other-program campaign | Valid UUID with no row in `staff.programId` | No contact read | `404 campaign_not_found` |
| Page past the end | `page = 99` | `200`, `rows: []`, real `total`, `page = 99` | — |
| Page not a whole number | `page = abc`, `page = 0`, `page = 1.5` | No page slice | `400 invalid_page` |
| Page size above the cap | `pageSize = 101` | No page slice | `400 invalid_page_size` |
| Page size not a whole number | `pageSize = abc`, `0`, `2.5` | No page slice | `400 invalid_page_size` |
| Search | `search = anand` | Case-insensitive substring over name and phone | — |
| One or more facet filters | `centre`, `level`, `gender`, `language` | Exact trimmed matches, intersected | — |
| Facets | Any page | Whole-set options, identical across pages | — |
| Contact without a profile | No `dialer_contact_profiles` row | Row returned with an all-null profile | — |
| Contact read fails | PostgREST error | No partial page | `500 contact_list_read_failed` / `contact_profile_read_failed` |
| Contact read truncates | Full final page at the page budget | No short list | `500 contact_list_truncated` |

## Human Decisions

1. **One route file, one method.** The selection read is a single `GET`; the write, the pre-check and the skip/move decision are Story 1.8's, so exporting a stub `POST` here would advertise a write that does not exist. Next answers `405` for it, and the sweep registers only the row that exists.
2. **The route returns the service's page object verbatim.** `Response.json(page)` means the envelope is `AssignableContactPage`'s own contract. A route that nested it under `{ contacts }` or renamed `rows` would create a second shape for the UI layer to reconcile, and would put the route in the business of shaping data it does not own.
3. **Page validation stays in the service.** The route converts the two numeric parameters because `AssignableContactQuery` is numeric, but it does not validate them: a non-numeric value becomes `NaN` and `Number.isInteger` refuses it with the named 400. The four payload tests exist so the difference between "passed through" and "silently defaulted" is asserted, not assumed.
4. **The owner sweep row uses a real campaign.** `listAssignableContacts` resolves the campaign before it reads a contact, so an absent id is a `404` and the owner row would prove only that the gate admits the Admin. The fixture already owns the create/delete path for this file's survey rows, so the assign row reuses `createDisposableCampaign` / `deleteDisposableCampaign` and adds a second fixture row rather than a second cleanup mechanism.
5. **A second `beforeAll`/`afterAll` pair, not a widened survey pair.** Each fixture campaign is created and removed by the group that uses it, so a failure in one group cannot leave the other without a campaign, and the pair is readable as a unit.
6. **The envelope test is shape-only, never value-bound.** `total`, `totalPages` and the facet contents depend on the seeded contact population, which other specs mutate; asserting exact numbers here would make the sweep flaky and would bind one route's gate to another feature's fixtures. The UI layer's `campaign-assign-select` spec owns the values.
7. **No caller-picker route and no preview route in this layer.** The packet's scope names the contacts read only. `listAssignableCallers` and `previewAssignmentSplit` remain route-less; see "What this layer does not prove".

</frozen-after-approval>

## Code Map

- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/contacts/route.ts` — `GET` through `listAssignableContacts`.
- `apps/folk/app/api/dialer/_lib/request-body.ts` — read-only here; this route has no body.
- `lib/dialer/assignments.ts` — `listAssignableContacts`, `AssignableContactQuery`, `AssignableContactPage` and every named error (read-only here).
- `lib/dialer/scope.ts` — `dialerErrorResponse`, `requireCampaignAdmin`, `campaignScope` (read-only here).
- `lib/dialer/campaigns.ts` — `getCampaign`, the campaign 404 gate (read-only here).
- `lib/authz.ts` — `getStaffContext`, `AuthzError`, `authzErrorResponse` (read-only here).
- `e2e/specs/dialer-route-sweep.spec.ts` — one admin row, a second fixture campaign pair, five payload-contract tests.
- `scripts/verify-dialer-route-coverage.mjs` — read-only here; it needed no change (`All 10 route(s) covered`).
- `_bmad-output/specs/spec-autodialer/stories/1-7-assign-select-api.md` — this record.

## Tasks & Acceptance

**Execution:**
- [x] `.../admin/campaigns/[campaignId]/contacts/route.ts` — `GET` assignable contacts, query forwarded, page object returned verbatim.
- [x] `e2e/specs/dialer-route-sweep.spec.ts` — one `kind: "admin"` row against a disposable campaign, the second fixture pair, five payload contracts.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-7-assign-select-api.md` — this record.

**Acceptance Criteria:**
- Given an Admin and a real campaign, when they `GET` the contacts route, then the answer is `200` with `{ rows, page, pageSize, total, totalPages, facets }` and `page`/`pageSize` default to 1/25.
- Given `page=2` and `pageSize=25`, then rows 26–50 of the same ordered set and the same `total` are returned.
- Given a page past the end, then `rows: []` and the real `total` are returned, with the requested `page` unchanged.
- Given `page=abc`, `page=0` or `pageSize=101`, then the answer is the service's named 400, not a silent default.
- Given a Volunteer, then the answer is `403 forbidden` before any read.
- Given no session, then the answer is `401 unauthenticated`.
- Given a malformed, missing or other-program campaign id, then the answer is `404 campaign_not_found`.
- Given the route file exists, then `pnpm guardrails` sees a sweep row for it and prints `All 10 route(s) covered by denial sweep.`
- Given `pnpm test:e2e dialer-route`, then 63 tests run (4 role setups + 59 spec tests) and all pass.

## Implementation Notes

### Route table

| Method | Path | Gate | Success | Refusals |
|---|---|---|---|---|
| `GET` | `/api/dialer/admin/campaigns/[campaignId]/contacts` | `getStaffContext()` → `requireCampaignAdmin` inside `listAssignableContacts`, then `getCampaign` (404), then `campaignScope`, then page/pageSize validation | `200 { rows, page, pageSize, total, totalPages, facets }` | `401 unauthenticated`; `403 forbidden`; `403 campaign_scope_missing`; `404 campaign_not_found`; `400 invalid_page`; `400 invalid_page_size`; `500 contact_list_read_failed` / `contact_profile_read_failed` / `contact_list_truncated` / `dialer_roster_read_failed` / `dialer_roster_truncated` |

There is no `POST` handler on this route: the assignment write is Story 1.8.

**Order inside `GET`:** staff context → campaign id → campaign resolution → scope → page validation → contact read → profile join → filter → slice. The order is the service's; the route only reads the query string before it calls it, so nothing the route does can reorder a refusal.

**The route reads the query string, not the body.** `page` and `pageSize` go through a local `readNumberParam` that returns `undefined` for an absent key and `Number(raw)` otherwise. `Number("abc")` is `NaN`, which `requirePage`/`requirePageSize` reject; `Number("")` is `0`, likewise rejected. Nothing defaults a malformed value to a page.

### The query contract, as the service reads it

| Parameter | Route hands over | Service behaviour |
|---|---|---|
| `page` | `number \| undefined` (`NaN` when non-numeric) | default 1; non-integer or `< 1` → `400 invalid_page` |
| `pageSize` | `number \| undefined` (`NaN` when non-numeric) | default 25; non-integer, `< 1` or `> 100` → `400 invalid_page_size` |
| `search` | raw string or `null` | trimmed; empty means no search; case-insensitive over name and phone |
| `centre` / `level` / `gender` / `language` | raw string or `null` | trimmed; exact match; empty means no filter |

### Sweep rows

| Method | `route:` (guardrail) | `url:` (request) | Owner statuses | Why that status |
|---|---|---|---|---|
| `GET` | `/api/dialer/admin/campaigns/[campaignId]/contacts` | `/api/dialer/admin/campaigns/<fixture id>/contacts` | `[200]` | the real campaign exists, so the read reaches the contacts and answers a page |

The campaign is created in a second `beforeAll`/`afterAll` pair via `createDisposableCampaign(adminRequest, "assign contacts")` and removed with `deleteDisposableCampaign`. Both reuse the fixture's existing local-SQL cleanup; the route creates no contact, profile, caller or assignment, so the delete cannot be blocked by a foreign key.

### Payload contracts beside the rows

| Test | Asserts |
|---|---|
| `Assignable contacts envelope › is `{ rows, page, pageSize, total, totalPages, facets }`` | `rows` is an array, page/pageSize default to 1/25, `total`/`totalPages` are numbers, all four facets are arrays |
| `Assignable contacts query: page validation is the service's › is a 400 invalid_page for a page that is not a whole number` | `page=abc` is a named 400, never a silent page 1 |
| `… › is a 400 invalid_page for a page below 1` | `page=0` is the same named 400 |
| `… › is a 400 invalid_page_size above the 100-row cap` | `pageSize=101` is a 400, not a clamp |
| `… › is a 400 invalid_page_size for a size that is not a whole number` | `pageSize=abc` is a 400 |

### What this layer does not prove

- **The caller picker has no HTTP surface.** `listAssignableCallers` returns AD-3's assignable set, but this layer's scope names only the contacts read. The selection UI's "Assign to" picker therefore has no endpoint that returns exactly that set; the roster read (`GET /api/dialer/admin/callers`) is a different population — it includes inactive callers and carries roster semantics. Story 1.7's UI layer cannot finish the picker from this layer alone.
- **The weighted preview has no route.** `previewAssignmentSplit` is exported and used by Story 1.8's write, but nothing serves it to the browser. The live preview the story's outcome asks for must either recompute the formula client-side (a second implementation, with the divergence risk AD-11 exists to prevent) or wait for a preview endpoint.
- **Facet and paging values are unasserted by the gate.** The sweep proves the envelope, the named refusals and the gate. It does not prove that `total` equals the scoped contact count, that page 2 continues page 1, or that facet options come from the whole set — those depend on the seeded contact population other specs mutate. The UI layer's `campaign-assign-select` spec owns them.
- **The browser surface.** The desktop-only gate, `Showing X–Y of N`, the hidden-selected count, the selection surviving a page change and the disabled primary action at zero selection are client state and belong to the UI layer.
- **The conflict pre-check and the write.** Story 1.8 owns naming already-assigned contacts, the skip/move choice and the transaction. This route reads no assignment and writes nothing.
- **`pnpm test:e2e campaign-assign-select` matches no tests**, because that spec is the UI layer's. The packet's filter is `dialer-route`, which is what this layer ran.
- **`pnpm test:e2e:determinism` was not run.** The packet's verification is the single `dialer-route` filter and only one runner may be active; this file creates and removes one campaign per run and writes nothing else.

## Spec Change Log

None.

## Review Triage Log

None.

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e dialer-route` (the packet's VERIFICATION command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `[verify-dialer-route-coverage] All 10 route(s) covered by denial sweep.` and `Monorepo guardrails passed.`, with the same four pre-existing type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects passed (implied by `test:static`'s exit 0).
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm test:e2e dialer-route` — **PASS**, exit 0. `63 passed (31.6s)` — the four role setup projects plus fifty-nine spec tests.

**Spec tests added (5):**
- `Assignable contacts envelope › is `{ rows, page, pageSize, total, totalPages, facets }``
- `Assignable contacts query: page validation is the service's › is a 400 invalid_page for a page that is not a whole number`
- `… › is a 400 invalid_page for a page below 1`
- `… › is a 400 invalid_page_size above the 100-row cap`
- `… › is a 400 invalid_page_size for a size that is not a whole number`

**Sweep rows added (1):**
- `Denial sweep: GET /api/dialer/admin/campaigns/[campaignId]/contacts — {unauthenticated, non-owner (volunteer), owner (admin)}`

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `dialer-route`, and the full suite belongs to the join layer.
- `pnpm test:e2e campaign-assign-select` was not run: it selects no tests (see above).

**Post-run state:** `public.dialer_campaigns` holds zero rows after the run — both fixture campaigns, this layer's and the survey group's, were removed in `afterAll`.

**Scope note:** this story record sits at
`_bmad-output/specs/spec-autodialer/stories/1-7-assign-select-api.md`, which the api layer's
entry in `.hedgehog/core.yaml` does not list (the server layer's does). `hedgehog verify`
needs the path granted before it runs:

```bash
hedgehog override add STORY-1-7-ASSIGN-SELECT-API \
  --scope '_bmad-output/specs/spec-autodialer/stories/**' \
  --reason 'api layer records its story beside the code, as every prior layer did'
```

The packet's FIRST ARRIVAL block lists `apps/folk/app/api/dialer`, `e2e/auth` and `e2e/fixtures`
as absent; all three were already present, so no package shell was created and nothing outside
the packet's ALLOWED SCOPE was written.
