---
title: 'Conflict-aware assignment write service layer'
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

**Problem:** The assignment screen can list what it may assign (Story 1.7) but nothing can tell it which selected contacts are already assigned in the campaign, and nothing can write the confirmed set. After Story 1.7 the pieces exist separately: `campaignScope` holds the AD-3 contact predicate and the assignable caller set, `promoteCallers` holds auto-promotion and the never-reactivate rule, `previewAssignmentSplit` holds the weighted distribution, and `assign_dialer_contacts` holds the transaction. Without one service that composes them, the API layer would build its own conflict list (and could trust a client-supplied one), re-derive the split, and have no single place that decides what "skip" and "move" mean. AD-11's guarantee — the primary button's count is the count that will actually be written — then has no owner.

**Approach:** Extend `lib/dialer/assignments.ts` with the write half. `precheckAssignments` gates on the admin surface, resolves the campaign through `getCampaign`, takes the contact predicate from `campaignScope`, validates the selection (non-empty, UUID-shaped, de-duplicated, every contact in the caller's AD-3 scope), and reads the campaign's existing assignment rows for exactly those contacts in one read per 200-id chunk, joined to the contact name and the current caller's `display_name`. It returns the conflict list and the two counts the button needs. `writeAssignments` re-runs that same pre-check on the same selection, refuses an undecided conflict list with `409 conflicts_require_decision`, derives the confirmed set from `skip` or `move`, validates the weights through `previewAssignmentSplit`, auto-promotes through `promoteCallers`, maps each user to their `dialer_callers.id`, computes the split with the same function, builds rows in a stable order and calls the RPC once. Nothing is written by PostgREST directly: a sequential write is not transactional, and AD-11 forbids a partial batch.

## Boundaries & Constraints

**Always:**
- Both operations open with `requireCampaignAdmin(staff)`. A Volunteer is refused with `403 forbidden` before any read.
- Both operations resolve the campaign with `getCampaign(staff, campaignId)` before reading contacts. A malformed id, a missing row and another program's campaign are all `404 campaign_not_found`.
- The contact predicate is `campaignScope`'s: `kind: "program"` accepts every contact in the program; `kind: "preacher"` accepts only `contacts.assigned_preacher_id = scope.userId`. A Preacher or Assistant with no scope id keeps `403 campaign_scope_missing` and is never widened.
- `contactIds` must be a non-empty array of UUID-shaped strings. Entries are lowercased and de-duplicated in request order; a duplicate counts once.
- Every selected contact must exist in `staff.programId` and satisfy the AD-3 predicate. A foreign or absent one is `403 contact_not_assignable` naming the id. A contact is never silently dropped: the conflict list, `assignableCount` and the confirmed set all describe the full selection or the request fails.
- Contacts are read by id in chunks of 200 through the shared pager (AD-16), filtering `program_id`, never through a `.range()` loop of their own.
- Existing `dialer_assignments` rows for the selection are read by `contact_id` in chunks of 200, filtered by `program_id` and `campaign_id`, paginated (AD-16), and joined to `contacts(name)` and `dialer_callers(display_name)` in the select string. One read per chunk, no read per contact.
- Each conflict is `{ contactId, contactName, callerId, callerName, status }` in the selection order. `assignableCount` is the number of selected contacts with no row in this campaign; `conflictCount` is the length of the conflict list.
- `writeAssignments` re-runs `precheckAssignments` on the same selection. A conflict list supplied by a client is not an input, and the decision is made against rows as they are now.
- `mode` absent while the conflict list is non-empty is `409 conflicts_require_decision`, with every conflict named in the message by contact and current caller.
- Confirmed set: `move` = every validated contact; `skip` = only the contacts with no existing row. An empty confirmed set is `409 nothing_to_assign`.
- Every caller `userId` must be in `campaignScope(staff).assignableCallers`; one outside it is `403 caller_not_assignable` naming the caller, and no assignment row is written.
- Weights are validated by `previewAssignmentSplit` — at least one caller, each caller once with a non-empty id, each weight a positive safe integer. No second formula, no stored weight.
- Eligible callers are auto-promoted with `promoteCallers(staff, userIds)` before the split is computed. An existing inactive profile is `409 caller_inactive` naming the caller and is never reactivated; the whole batch is refused.
- Each caller user maps to their `dialer_callers.id`; the split is `previewAssignmentSplit(confirmedCount, [{ callerId: profileId, weight }])`.
- Rows are built in a stable order: callers in request order, contacts in the confirmed `contactIds` order, `sortOrder` restarting at 0 for each caller.
- The write is one `createSupabaseAdminClient().rpc("assign_dialer_contacts", { p_program_id, p_campaign_id, p_assigned_by, p_rows, p_mode })` call. This module issues no insert, update or delete on `dialer_assignments`; the only other write on this path is `promoteCallers`' `dialer_callers` insert.
- RPC failures map to named `AuthzError`s: `campaign_not_found`/`P0002` → `404 campaign_not_found`; `campaign_not_assignable` → `409 campaign_not_assignable`; `caller_not_assignable:<id>` → `403 caller_not_assignable` naming the caller; `caller_inactive:<id>` → `409 caller_inactive` naming the caller; `invalid_rows`/`invalid_mode` → `400`; anything else → `500 assignment_write_failed` whose message says the whole batch was rolled back and nothing was written.
- The result is `{ written, skipped, split }`. `written` is the RPC's written count, `skipped` is the contacts the `skip` decision left alone plus any the RPC skipped, so `written + skipped` equals the validated selection size. `split`'s counts sum to the confirmed set size.
- The module stays `import "server-only"`, double quotes, `@/*` imports, the service-role client and camelCase DTOs.

**Never:**
- Do not issue a PostgREST insert, update or delete for `dialer_assignments`. A sequence of PostgREST calls is not a transaction, and AD-11 forbids a partial batch.
- Do not insert a second row for a contact already assigned in the campaign. `unique (contact_id, campaign_id)` is the rule; a `move` updates the existing row.
- Do not trust, accept or merge a client-supplied conflict list, count or split.
- Do not store a weight, a split or an audience filter.
- Do not reactivate an inactive caller profile, and do not create, invite or promote a staff user who is not already an active member of the assignable set.
- Do not reassign a contact that is outside the caller's AD-3 scope to make a batch succeed.
- Do not add an `/api` route, page, component, migration, e2e spec, package manifest or Playwright config.
- Do not re-derive the split in the UI layer's shape: `previewAssignmentSplit` is the only distribution formula.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pre-check, no assignment | 5 selected contacts, none assigned | `conflicts: []`, `assignableCount = 5`, `conflictCount = 0` | — |
| Pre-check, one conflict | Contact assigned to caller A, status `PENDING` | One conflict with contact name, A's `display_name`, `status = "PENDING"` | — |
| Pre-check, every contact assigned | 3 selected, 3 assigned | 3 conflicts, `assignableCount = 0` | — |
| Pre-check, conflicting caller deactivated | Assignment's caller has `is_active = false` | Conflict still named by the stored display name; the pre-check refuses nothing | — |
| Pre-check, duplicate ids | Same contact id twice | Counted once; de-duplicated in request order | — |
| Pre-check, empty selection | `[]` | No contact read | `400 invalid_contact_ids` |
| Pre-check, malformed id | `"abc"` | No contact read | `400 invalid_contact_ids` |
| Pre-check, absent or other-program contact | Valid UUID, no row in `staff.programId` | No assignment read | `403 contact_not_assignable` naming the id |
| Pre-check, other preacher's contact | Preacher scope, contact owned by another preacher | No assignment read | `403 contact_not_assignable` naming the id |
| Pre-check, Volunteer | Any request | No read | `403 forbidden` |
| Pre-check, malformed campaign id | `"abc"` | No contact read | `404 campaign_not_found` |
| Pre-check, missing or other-program campaign | Valid UUID, no row in `staff.programId` | No contact read | `404 campaign_not_found` |
| Pre-check, campaign read fails | `getCampaign` read fails | No contact read | `500 campaign_read_failed` |
| Pre-check, contact read fails | PostgREST error | No conflict list | `500 contact_list_read_failed` |
| Pre-check, contact read truncates | Full final page at the page budget | No short list | `500 contact_list_truncated` |
| Pre-check, assignment read fails | PostgREST error | No conflict list | `500 assignment_read_failed` |
| Pre-check, assignment read truncates | Full final page at the page budget | No short list | `500 assignment_read_truncated` |
| Write, no conflicts, no mode | 10 contacts, 2 callers | All 10 written; `mode` defaults to `move` | — |
| Write, conflicts, no mode | 3 of 10 already assigned | No promotion, no RPC call | `409 conflicts_require_decision` naming contact and current caller |
| Write, conflicts, `skip` | 3 of 10 already assigned | 7 rows submitted; `written + skipped = 10` | — |
| Write, conflicts, `move` | 3 of 10 already assigned | 10 rows submitted; the 3 existing rows are updated, no second row | — |
| Write, every contact conflicted, `skip` | 5 of 5 already assigned | No RPC call | `409 nothing_to_assign` |
| Write, invalid mode value | `"SKIP"` or any other string | No promotion, no RPC call | `400 invalid_mode` |
| Write, no callers | `[]` | No promotion, no RPC call | `400 invalid_caller_list` |
| Write, duplicate caller | Same `userId` twice | No promotion, no RPC call | `400 invalid_caller_list` |
| Write, weight not a positive integer | `0`, `-1`, `2.5`, `NaN` | No promotion, no RPC call | `400 invalid_weight` |
| Write, caller outside the assignable set | Valid staff user, another preacher's assignee | No assignment row | `403 caller_not_assignable` naming the caller |
| Write, inactive caller | Profile with `is_active = false` | No reactivation, no assignment row | `409 caller_inactive` naming the caller |
| Write, caller without a profile | Eligible staff user | Auto-promoted once, split uses the new `dialer_callers.id` | — |
| Write, split | N = 120, weights 3 / 2 / 2 | `52 / 34 / 34`, summing to 120 | — |
| Write, split remainder tie | Equal remainders, different weights | Higher weight takes the leftover first | — |
| Write, split remainder and weight tie | Equal remainders and weights | Earlier request position takes the leftover first | — |
| Write, row order | Two callers, six contacts | Caller 1's rows first with `sortOrder` 0..n-1, then caller 2's, contacts in selection order | — |
| Write, `DRAFT` campaign | Any valid selection | Assignment allowed | — |
| Write, `ACTIVE` campaign | Any valid selection | Assignment allowed | — |
| Write, `COMPLETED` or `CANCELLED` campaign | Any valid selection | No assignment row | `409 campaign_not_assignable` naming the status |
| Write, campaign vanished between reads | RPC raises `P0002` | No partial batch | `404 campaign_not_found` |
| Write, caller deactivated between promotion and RPC | RPC raises `caller_inactive:<id>` | Whole batch rolled back | `409 caller_inactive` naming the caller |
| Write, caller's profile removed between promotion and RPC | RPC raises `caller_not_assignable:<id>` | Whole batch rolled back | `403 caller_not_assignable` naming the caller |
| Write, RPC rejects the rows | RPC raises `invalid_rows` | Whole batch rolled back | `400 invalid_rows` |
| Write, RPC rejects the mode | RPC raises `invalid_mode` | Whole batch rolled back | `400 invalid_mode` |
| Write, any other RPC failure | Unrecognised SQLSTATE or message | Whole batch rolled back | `500 assignment_write_failed`, message says nothing was written |
| Write, unreadable RPC result | Result not `{ written, skipped }`, or counts that do not match the rows | Batch may have committed | `500 assignment_write_unverified`, message says the batch may have been written |

## Human Decisions

1. **The write half lives in `lib/dialer/assignments.ts`.** That module already owns the split and the selection DTOs; a second module would make `previewAssignmentSplit` the only shared symbol and leave the skip/move decision homeless. The pre-check endpoint and the write share one file, one campaign gate and one contact-scope predicate.
2. **A malformed contact id is `400 invalid_contact_ids`; a well-formed id that is absent or foreign is `403 contact_not_assignable`.** The brief names the 403 for a contact outside the scope; a string that is not a UUID cannot name a contact at all, so it is a malformed request, not a permission fact.
3. **Contact ids are lowercased before de-duplication.** The database returns lowercase UUIDs, so `"AB…"` and `"ab…"` would otherwise survive as two entries, reach the RPC twice, and turn a duplicate selection into a `23505` instead of one row.
4. **The `409 conflicts_require_decision` carries the conflicts in its message, not in a structured `details` field.** `AuthzError` is `{ status, code, message }` and is shared by every route; adding a `details` field to the auth surface is a change to serialization this layer should not make alone. The structured list is `precheckAssignments`' return, which the UI has before it can offer skip or move.
5. **No-conflict writes default to `mode: "move"`.** With nothing to skip, `skip` and `move` write the same rows; `move` is chosen because a contact assigned concurrently between the pre-check and the RPC is then updated rather than silently skipped, which keeps `written` equal to the count the button promised.
6. **`previewAssignmentSplit` is called twice on purpose.** The first call, keyed by user id, validates the weights before `promoteCallers` can write a profile; the second, keyed by profile id, produces the counts. Both calls run the same function over the same weights in the same order, so there is one formula and one tie-break.
7. **Promotion runs before the membership assertion.** `campaignScope`'s assignable set deliberately excludes a deactivated profile, so checking membership first would turn `409 caller_inactive` into a `403` and lose the named state AD-11 asks for. `promoteCallers` classifies the whole batch before it writes, so no profile is created for a request it then refuses.
8. **Contacts are read by id, not by reading the whole scope.** The predicate is the same in-memory comparison `listAssignableContacts` applies, but the query is bounded by the selection: 2,000 selected contacts are ten chunked reads, while the whole-scope read would fetch every contact in the program to discard most of them.
9. **The RPC error mapping keys on SQLSTATE and message, not on HTTP status.** PostgREST answers `P0002` with HTTP 500 (verified against the local stack), so a status-driven mapping would report a campaign that vanished as a server fault.
10. **`lib/supabase/types.ts` gains the `assign_dialer_contacts` Functions entry.** The migration is committed and the local database has the function, but the declared schema did not. The admin client is untyped today, so nothing changes at a call site; the entry keeps the declared schema truthful for the next typed read.
11. **An unreadable RPC result is its own failure.** If the RPC returns something other than `{ written, skipped }`, or counts that do not account for every row, the function may already have committed. `500 assignment_write_unverified` says the batch may have been written rather than reusing `assignment_write_failed`'s "nothing was written".
12. **`mode: null` is treated as absent.** A JSON client sends `null` for "no choice yet"; refusing it as a malformed mode would be pedantry about a value that means the same thing as omission.

</frozen-after-approval>

## Code Map

- `lib/dialer/assignments.ts` — `precheckAssignments`, `writeAssignments`, the conflict and write DTOs, the selection normaliser, the caller/weight normaliser, the by-id contact and assignment reads, the split composition, the stable row builder and the RPC error mapper.
- `lib/dialer/callers.ts` — `promoteCallers` and `CallerProfile`, reused for auto-promotion and the user-to-profile mapping (read-only here).
- `lib/dialer/scope.ts` — `campaignScope`, `requireCampaignAdmin`, `AssignableCaller`, the contact predicate and the assignable caller set (read-only here).
- `lib/dialer/campaigns.ts` — `getCampaign` and `CampaignRow`, the campaign 404 shape and the status named in the `campaign_not_assignable` refusal (read-only here).
- `lib/supabase/paging.ts` — `collectPagedRows`, AD-16's shared pager, used by both the contact and the assignment read (read-only here).
- `lib/supabase/admin.ts` — `createSupabaseAdminClient`, the service-role client that calls the RPC (read-only here).
- `lib/supabase/types.ts` — the `assign_dialer_contacts` Functions entry, written here to match `20261027000000_assign_dialer_contacts.sql`.
- `lib/authz.ts` — `AuthzError` and `StaffContext` (read-only here).
- `supabase/migrations/20261027000000_assign_dialer_contacts.sql` — the transactional write this module calls, and the SQLSTATE contract it maps (read-only here).
- `_bmad-output/specs/spec-autodialer/stories/1-8-assign-write-server.md` — this record.

## Tasks & Acceptance

**Execution:**
- [x] `lib/dialer/assignments.ts` — `precheckAssignments` with the admin gate, the campaign 404, the scope, the selection normaliser, the by-id contact read with the AD-3 predicate, and the chunked assignment read joined to contact and caller names.
- [x] `lib/dialer/assignments.ts` — `writeAssignments` re-running the pre-check, refusing an undecided conflict list, deriving the skip/move confirmed set, validating weights, promoting callers, computing the split, building stable rows and calling the RPC once.
- [x] `lib/dialer/assignments.ts` — the RPC error mapper for `P0002`, `campaign_not_assignable`, `caller_not_assignable:<id>`, `caller_inactive:<id>`, `invalid_rows`, `invalid_mode` and the rolled-back fallback.
- [x] `lib/dialer/assignments.ts` — the exported `AssignmentConflict`, `AssignmentPrecheck`, `AssignmentWriteMode`, `AssignmentCallerInput`, `WriteAssignmentsInput`, `AssignmentWriteRow` and `WriteAssignmentsResult` DTOs.
- [x] `lib/supabase/types.ts` — the `assign_dialer_contacts` Functions entry.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-8-assign-write-server.md` — this record.

**Acceptance Criteria:**
- Given a selection containing contacts already assigned in the campaign, when the pre-check runs, then every conflict is returned by contact name, current caller name and status, and no row is written.
- Given contacts that are absent, from another program, or outside the caller's AD-3 scope, when the pre-check runs, then the request is `403 contact_not_assignable` naming the ids and no assignment read happens.
- Given a selection with conflicts and no mode, when the write runs, then it is `409 conflicts_require_decision` and no caller is promoted and no row is written.
- Given `skip`, then only the unassigned contacts are distributed and `written + skipped` equals the validated selection size.
- Given `move`, then every selected contact is submitted and the existing `(contact_id, campaign_id)` row is updated rather than duplicated.
- Given a confirmed set of N and weighted callers, then the split is the floor plus largest remainder distribution from `previewAssignmentSplit`, sums exactly to N, and no weight is stored.
- Given a caller outside the assignable set, then the request is `403 caller_not_assignable` naming them and no row is written.
- Given an inactive caller, then the request is `409 caller_inactive` naming them, the whole batch is refused, and nothing is reactivated.
- Given an RPC failure, then the mapped `AuthzError` names the offending caller or campaign where the SQLSTATE carries one, and the fallback says the batch was rolled back with nothing written.
- Given the same selection twice, then the rows are built in the same order: callers in request order, contacts in selection order, `sortOrder` 0..n-1 per caller.

## Implementation Notes

### Exported surface

| Export | Signature |
|---|---|
| `AssignmentConflict` | `{ contactId: string; contactName: string; callerId: string; callerName: string; status: string }` |
| `AssignmentPrecheck` | `{ conflicts: AssignmentConflict[]; assignableCount: number; conflictCount: number }` |
| `AssignmentWriteMode` | `"skip" \| "move"` |
| `AssignmentCallerInput` | `{ userId: string; weight: number }` |
| `WriteAssignmentsInput` | `{ contactIds: string[]; callers: AssignmentCallerInput[]; mode?: AssignmentWriteMode }` |
| `AssignmentWriteRow` | `{ contactId: string; callerId: string; sortOrder: number }` |
| `WriteAssignmentsResult` | `{ written: number; skipped: number; split: AssignmentSplitEntry[] }` |
| `precheckAssignments` | `(staff: StaffContext, campaignId: string, contactIds: string[]) => Promise<AssignmentPrecheck>` |
| `writeAssignments` | `(staff: StaffContext, campaignId: string, input: WriteAssignmentsInput) => Promise<WriteAssignmentsResult>` |

`listAssignableContacts`, `listAssignableCallers` and `previewAssignmentSplit` from Story 1.7 are unchanged.

### The RPC contract

```sql
public.assign_dialer_contacts(
  p_program_id  text,
  p_campaign_id uuid,
  p_assigned_by uuid,
  p_rows        jsonb,   -- [{ "contactId": uuid, "callerId": uuid, "sortOrder": int }]
  p_mode        text     -- 'skip' | 'move'
) returns jsonb            -- { "written": int, "skipped": int }
```

The function re-validates what a concurrent request could have changed — campaign status, caller membership, caller activity, and whether the contact already has a row — and raises on the first violation, which rolls back every row written earlier in the same call. `callerId` is a `dialer_callers.id`, never a `public.users.id`.

| SQLSTATE | Raised message | Meaning | Mapped to |
|---|---|---|---|
| `P0002` | `campaign_not_found` | No campaign with that id in that program | `404 campaign_not_found` |
| `P0001` | `campaign_not_assignable` | Campaign is not `DRAFT` or `ACTIVE` | `409 campaign_not_assignable`, status named from the read |
| `P0001` | `caller_not_assignable:<dialer_callers.id>` | No caller profile with that id in the program | `403 caller_not_assignable`, caller named |
| `P0001` | `caller_inactive:<dialer_callers.id>` | The profile was deactivated | `409 caller_inactive`, caller named |
| `22023` | `invalid_rows` | `p_rows` is not an array, or a row lacks an id | `400 invalid_rows` |
| `22023` | `invalid_mode` | `p_mode` is not `skip` or `move` | `400 invalid_mode` |
| anything else | — | Including a failed UUID cast (`22P02`) | `500 assignment_write_failed`, "the whole batch was rolled back; nothing was written" |

The mapping reads the SQLSTATE and message, not the HTTP status: PostgREST answers `P0002` with HTTP 500.

### Why the write re-runs the pre-check

`precheckAssignments` is called from `writeAssignments` with the same normalised selection. The pre-check the assigner saw may be minutes old, another admin may have assigned the same contacts in between, and a client-supplied conflict list is trivially forgeable. Re-running it means the skip/move decision is applied to rows as they are at write time, and it costs two reads — contacts by id and assignments by id — not a second implementation. The RPC then re-checks the same population inside the transaction, so a row that appears between the re-check and the call is still handled: `move` updates it, `skip` leaves it and reports the extra skip.

A consequence worth naming: `getCampaign` runs twice per write (once in the write, once inside the pre-check) and `campaignScope` runs three times (the write, the pre-check and `promoteCallers`), each resolving the staff roster and caller profiles. That is six small reads plus two campaign reads per batch write; it is the cost of composing the existing single-source helpers instead of duplicating their predicates, and it is paid once per batch, not once per contact.

### Skip, move and the counts

| Mode | Rows submitted | RPC work | `written` | `skipped` |
|---|---|---|---|---|
| `move` (also the no-conflict default) | Every validated contact | update the existing row or insert a new one | N | 0 |
| `skip` | Only contacts with no row at pre-check time | insert (an existing row is skipped) | N − conflicts | conflicts + any concurrent skip |

`written + skipped` always equals the validated selection size, and `split`'s counts always sum to the confirmed set size. The two differ only when the RPC reports a skip in `skip` mode — a contact taken by a concurrent assignment after the re-check — and in that case the response reports what happened rather than the plan.

### Row order

`previewAssignmentSplit` keeps the request order of its callers, so the split array is walked in request order. Each entry contributes its `count` contacts from the front of the confirmed list, with `sortOrder` counting 0, 1, 2… within that caller. Caller A's rows therefore precede caller B's, and each caller's contacts keep the order the admin selected them in. The queue rail reads `sort_order`, so this order is part of the contract, not a convenience.

### Promotion before the write, and what it leaves behind

`promoteCallers` classifies every requested user before its multi-row insert: an inactive profile is `409 caller_inactive`, a user outside the set is `403 caller_not_assignable`, an active profile is returned unchanged, an absent profile is inserted with `promoted_by = staff.userId`. Because the split's weight validation runs *before* promotion, a bad weight cannot create a profile. A failure *after* promotion — an RPC refusal, for example — can leave a newly promoted active profile with no assignment for it; that profile is a legitimate caller profile and appears on the roster, but it was created by a batch that then failed. The assignment rows themselves are never partial.

### Added named failures

| Code | HTTP | Raised by | Trigger |
|---|---|---|---|
| `forbidden` | 403 | both | Volunteer |
| `campaign_scope_missing` | 403 | both | Preacher/Assistant with no scope id (inherited from `campaignScope`) |
| `campaign_not_found` | 404 | both | malformed, missing or other-program campaign id |
| `invalid_contact_ids` | 400 | both | not a list, empty, or an entry that is not a UUID |
| `contact_not_assignable` | 403 | both | a selected contact absent from the program or outside the AD-3 scope |
| `contact_list_read_failed` | 500 | both | the `contacts` by-id read failed |
| `contact_list_truncated` | 500 | both | the `contacts` by-id read exhausted the page budget |
| `assignment_read_failed` | 500 | pre-check | the `dialer_assignments` read failed |
| `assignment_read_truncated` | 500 | pre-check | the assignment read exhausted the page budget |
| `campaign_read_failed` | 500 | both | the campaign read failed |
| `dialer_roster_read_failed` / `dialer_roster_truncated` | 500 | both | inherited from `campaignScope` |
| `conflicts_require_decision` | 409 | write | conflicts present and no mode |
| `nothing_to_assign` | 409 | write | the confirmed set is empty |
| `invalid_mode` | 400 | write | mode is not `skip` or `move` |
| `invalid_caller_list` | 400 | write | no callers, a duplicate caller or an empty caller id |
| `invalid_weight` | 400 | write | a weight that is not a positive safe integer |
| `caller_not_assignable` | 403 | write | a caller outside `assignableCallers` |
| `caller_inactive` | 409 | write | an existing inactive caller profile |
| `caller_profile_missing` | 500 | write | promotion returned no profile for a requested caller |
| `campaign_not_assignable` | 409 | write | the campaign left `DRAFT`/`ACTIVE` before the RPC |
| `invalid_rows` | 400 | write | the RPC rejected its rows |
| `assignment_write_failed` | 500 | write | any other RPC failure; the batch was rolled back |
| `assignment_write_unverified` | 500 | write | the RPC result was unreadable or did not account for every row |

## Spec Change Log

None.

## Review Triage Log

None.

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — "Monorepo guardrails passed." with the four pre-existing type-import warnings in `lib/auth-context.tsx`, `components/auth-hash-callback.tsx`, `components/invite-user-form.tsx` and `components/staff-auth-shell.tsx`, and `[verify-dialer-route-coverage] All 12 route(s) covered by denial sweep.`
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — "✖ 16 problems (0 errors, 16 warnings)"; all sixteen warnings pre-existing and in files this layer did not touch.
- `pnpm exec eslint lib/dialer/assignments.ts lib/supabase/types.ts` — no output, exit 0.
- Read-only probes against the already-running local Supabase stack (`SUPABASE_URL` from `apps/folk/.env.local`, service-role key, no writes):
  - `GET /rest/v1/dialer_assignments?select=contact_id,caller_id,status,contacts(name),dialer_callers(display_name)&limit=1` → `200 []`. The same request with a deliberately wrong embed returns `400 PGRST200`, so the 200 proves PostgREST resolves both relationships; `dialer_assignments` is empty locally, which is why the array is empty.
  - `POST /rest/v1/rpc/assign_dialer_contacts` with `p_mode = "bogus"` → `400 {"code":"22023","message":"invalid_mode"}`.
  - `POST /rest/v1/rpc/assign_dialer_contacts` with a campaign id that does not exist → `500 {"code":"P0002","message":"campaign_not_found"}`. This is the evidence for mapping on SQLSTATE rather than HTTP status.
  - Both RPC probes raise before the row loop, so neither wrote anything. The first embed probe already returned `[]` and `select count(*) from public.dialer_assignments` was 0 after the probes; no campaign, contact, caller or assignment row was created or changed.

**Not run:**
- `pnpm test` was not run: no package defines a `test` script, so it would exit 0 without executing anything.
- No e2e command was run, per this layer's verification scope. `pnpm test:e2e campaign-assign-write` belongs to the API/UI layers: it needs a route, a screen and seeded campaigns, none of which exist yet.
- No promotion, split or RPC write path was exercised at runtime: there is no route, no unit runner, and driving it would have written rows into the shared local database.

## What this layer does not prove

There is no unit runner in this repo and no `/api/dialer/**` route reaches this module yet, so `pnpm test:static` proves types, import boundaries and lint only. Everything with a branch in it — the AD-3 comparison, the chunked reads, the skip/move set arithmetic, the promotion ordering, the row builder and every entry of the SQLSTATE table except `invalid_mode` and `campaign_not_found` — is verified by reading the code and by the live PostgREST probes above, not by an executed test path.

Three things this layer deliberately cannot account for:

- **The API surface and the screen.** Refusal status codes reaching the browser, the skip/move prompt, the button count and the conflict list rendering are the API and UI layers' work.
- **The transaction itself.** `assign_dialer_contacts` is a committed migration outside this layer's scope; this layer proves only that it calls it with the documented payload and maps its documented SQLSTATEs.
- **A move's preserved state.** The RPC updates `caller_id` and `sort_order` only, so a contact moved to another caller keeps its existing `status`, `assigned_at` and `assigned_by`. If a `COMPLETED` or `SKIPPED` row is moved, it stays terminal for the new caller and never re-enters their queue. Story 1.8's acceptance criteria do not say whether a move should re-open the row (re-assign it as `PENDING`, with a new `assigned_by`/`assigned_at`); this layer does not decide it, and changing it needs a migration edit outside this scope.
