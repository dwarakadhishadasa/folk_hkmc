---
title: 'Caller roster service layer'
type: 'feature'
created: '2026-10-26'
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

**Problem:** `dialer_callers` exists and `campaignScope` already computes the AD-3 assignable set, but nothing in the server layer can list the roster, switch a caller's `is_active`, or promote an eligible staff user on first assignment. Without that service, the Callers screen and Story 1.8's assignment write would each re-implement the Admin/Preacher/Assistant scope, the row-retention rule that keeps a deactivated caller's history visible, and the never-reactivate rule that makes an inactive caller a refusal rather than a silent upsert. The screen also has no add, invite or import control (UX-DR32), so there is no creation path other than promotion.

**Approach:** Add one server-only module, `lib/dialer/callers.ts`, with four operations: list the scoped roster, set one caller profile's active flag (Admin only), promote one eligible staff user, and promote a batch. The roster reuses `campaignScope` for the active staff half and reads the `dialer_callers` profiles separately to add back the deactivated callers that the assignable set deliberately excludes. Promotion classifies every requested user before the first write: an inactive profile is `409 caller_inactive`, an id outside the assignable set is `403 caller_not_assignable`, an active profile is returned unchanged, and an absent profile is inserted with `promoted_by = staff.userId`. No `public.users` or `auth.users` row is created, no role is changed, and the batch has no partial success.

## Boundaries & Constraints

**Always:**
- `listRoster`, `promoteCaller` and `promoteCallers` open with `requireCampaignAdmin(staff)`; `setCallerActive` opens with `requireRole(staff, ["Admin"])`. A Volunteer is refused before any read in every operation, and a Preacher or Assistant is refused by `setCallerActive` even though they may read the roster.
- The roster scope comes from `campaignScope(staff)`: Admin = the program, Preacher = `{ kind: "preacher", userId: staff.userId }`, Assistant = `{ kind: "preacher", userId: staff.assignedPreacherUserId }`. A Preacher or Assistant with no scope id keeps `campaignScope`'s `403 campaign_scope_missing` and is never widened to the program.
- The active staff half of the roster is `campaignScope(staff).assignableCallers`. The `dialer_callers` read then adds the profiles of everyone in the same scope, so a profile with `is_active = false` stays on the roster even though the assignable set excluded it. Deduplication is by `user_id`; a profile never produces a second row.
- Every read and write filters `program_id`; every profile read is by the user ids already established as in-scope. List reads page through `lib/supabase/paging.ts` (AD-16) and throw rather than return a short list.
- Roster order is deterministic: active callers first by `displayName` (falling back to the staff name), then staff without a profile by `name`, then deactivated callers by `displayName` (falling back to the staff name). Every group breaks ties on `name`, then `userId`.
- Each row is `userId, name, email, role, callerId?, displayName?, isActive, promotedAt?, deactivated`. `isActive` is true only when a profile exists **and** `is_active` is true; `deactivated` is true only when a profile exists with `is_active = false`; a staff user with no profile is neither.
- `setCallerActive` checks the UUID shape, maps a malformed id to `404 caller_not_found`, validates that `isActive` is a boolean, updates only `(id, program_id)`, returns the updated `CallerProfile`, and never touches another program's row. Malformed, missing and foreign ids are indistinguishable.
- `promoteCaller` / `promoteCallers` validate every id before writing. An inactive profile is `409 caller_inactive` and is never reactivated. An id outside the assignable set is `403 caller_not_assignable`. An active profile is returned unchanged (idempotent). An absent profile is inserted with `display_name` = the staff user's name (falling back to email), `promoted_by = staff.userId`, `promoted_at = now()` and `is_active = true`.
- `promoteCallers` deduplicates by user id, classifies the whole batch first, then writes all new profiles in one multi-row insert. It returns `{ promoted, existing }`, refusing the whole batch rather than reporting a partial success. A `23505` unique violation is re-read as an idempotent result only when every target is now an active profile; otherwise it is `500 caller_write_failed`.
- The module is `import "server-only"`, uses double quotes, `@/*` alias imports, the service-role client, `Database` row aliases and camelCase DTOs.

**Never:**
- Do not invent the Caller / Contact / Campaigns / Calls made / Reached columns. `campaign_progress` is created by Story 1.9; this layer returns roster facts only, and the UI shows no count columns yet. No client-side count and no second query shape is allowed.
- Do not add an invite, add, import, manage-user or reactivate-on-promotion path. The Import roster and Invite caller controls were removed deliberately (UX-DR32), and an inactive profile is never brought back by assignment.
- Do not create or update a `public.users` or `auth.users` row, and do not change a user's role. Promotion writes only `dialer_callers`.
- Do not add an `/api` route, page, component, migration, e2e spec, package manifest or Playwright config.
- Do not hard-delete a caller profile. Deactivation is the `is_active` switch; history stays.
- Do not return a `403` for an inactive profile on the promotion path or widen the roster scope to make an empty state look populated.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Roster, Admin, active staff only | Program with active staff, no caller profiles | One row per active staff user, any role; `isActive = false`, `deactivated = false` | — |
| Roster, Admin, active caller | Staff user with an active profile | Caller row first by `displayName`, `callerId`, `isActive = true` | — |
| Roster, Admin, deactivated caller | Staff user with a profile whose `is_active = false` | Row retained last, `callerId` set, `isActive = false`, `deactivated = true` | — |
| Roster, Admin, inactive staff with a profile | `users.status` not `Active`, profile exists | Row retained (history); active profile state is reported as stored | — |
| Roster, Admin, inactive staff without a profile | `users.status` not `Active`, no profile | Row omitted | — |
| Roster, Preacher | Preacher's assignees plus the Preacher | Assignees and the Preacher; another preacher's staff absent | — |
| Roster, Preacher, inactive assignee with a profile | Assignee `status` not `Active`, profile exists | Row retained last as deactivated or active per the profile | — |
| Roster, Preacher, inactive assignee without a profile | Assignee `status` not `Active`, no profile | Row omitted | — |
| Roster, Assistant | `assigned_preacher_id` set | The preacher's assignees plus the Assistant themselves; the preacher is not added unless assigned to themselves | — |
| Roster, Assistant without a preacher | `assigned_preacher_id` absent | No roster read | `403 campaign_scope_missing` |
| Roster, Volunteer | Any staff role without admin access | No read | `403 forbidden` |
| Roster, unsupported stored role | `users.role` outside `StaffRole` | No partial roster | `500 unsupported_role` |
| Roster, staff read fails | PostgREST error | No partial roster | `500 caller_roster_read_failed` |
| Roster, profile read fails | PostgREST error | No partial roster | `500 caller_read_failed` |
| Roster, a read truncates | Full final page at the page budget | No short roster | `500 caller_roster_truncated` |
| Roster, `campaignScope` read fails | Its own staff or profile read fails | No roster | `500 dialer_roster_read_failed` / `500 dialer_roster_truncated` |
| Roster, two people share a display name | Equal sort names | Stable order | `userId` tie-break |
| Roster only, no performance asked | A caller with history | No Contact / Campaigns / Calls made / Reached field is returned | — |
| Set active, Admin deactivates | Valid caller id in the program, `false` | Updated `CallerProfile`, `isActive = false` | — |
| Set active, Admin reactivates | Valid caller id in the program, `true` | Updated `CallerProfile`, `isActive = true` | — |
| Set active, Preacher or Assistant | Any caller id | No read or write | `403 forbidden` |
| Set active, Volunteer | Any caller id | No read or write | `403 forbidden` |
| Set active, malformed id | `"abc"` | No read or write | `404 caller_not_found` |
| Set active, missing or foreign id | Valid UUID, no row in `staff.programId` | No write | `404 caller_not_found` |
| Set active, non-boolean flag | `"true"`, `null`, `1` | No write | `400 invalid_is_active` |
| Set active, update rejected | Any update error | No DTO returned | `500 caller_write_failed` |
| Set active, row vanishes | Update matches no row | No DTO returned | `404 caller_not_found` |
| Set active, same value twice | `true` on an already-active row | Row returned; no second row | — |
| Promote one, absent profile | Eligible user in the assignable set, no profile | One insert with `promoted_by`, `promoted_at`, `is_active = true`, `display_name` from the user | — |
| Promote one, active profile | Eligible user, profile `is_active = true` | The existing `CallerProfile`, unchanged | — |
| Promote one, inactive profile | Eligible user, profile `is_active = false` | No write, no reactivation; message names the caller when they are in the requester's roster scope | `409 caller_inactive` |
| Promote one, out of the assignable set | In-scope staff user not assignable | No write; message names the user when in roster scope, otherwise the id | `403 caller_not_assignable` |
| Promote one, inactive staff, no profile | `users.status` not `Active` | No write | `403 caller_not_assignable` |
| Promote one, malformed id | `"abc"` | No profile read | `403 caller_not_assignable` |
| Promote one, Volunteer | Any id | No read or write | `403 forbidden` |
| Promote one, Assistant without a preacher | Any id | No write | `403 campaign_scope_missing` |
| Promote one, self | Preacher or Assistant promoting themselves | Eligible; insert or existing profile | — |
| Promote batch, all new | Several eligible users, no profiles | One multi-row insert; every row gets `promoted_by`; `{ promoted: [...], existing: [] }` | — |
| Promote batch, mixed | One new user, one active profile | `{ promoted: [new], existing: [active] }`; two DTOs, no duplicate | — |
| Promote batch, duplicate ids | The same id twice | One profile and one DTO | — |
| Promote batch, one inactive | One inactive profile among eligible users | No insert for any id; the inactive caller is named | `409 caller_inactive` |
| Promote batch, one out of scope | One id outside the assignable set | No insert for any id; in-scope offenders are named, out-of-scope ids are not | `403 caller_not_assignable` |
| Promote batch, mixed refusals | One inactive and one out-of-scope | No insert for any id; message names both groups | `403 caller_not_assignable` |
| Promote batch, non-list input | `"a,b"`, `{}` | No read or write | `400 invalid_user_ids` |
| Promote batch, empty list | `[]` | `{ promoted: [], existing: [] }` after the role and scope gates | — |
| Promote batch, concurrent duplicate | Insert returns `23505`, every target now active | All targets returned as `existing`; no duplicate row | — |
| Promote batch, concurrent duplicate with a gap | `23505`, not every target active | No row from this call; no partial success | `500 caller_write_failed` |
| Promote batch, insert returns short | Insert succeeds but a target row is absent | No partial result | `500 caller_write_failed` |
| Promote batch, any other insert error | Permission, constraint or transport error | No row from this call | `500 caller_write_failed` |

## Human Decisions

1. **The roster is the assignable set plus the deactivated rows the set excludes.** `campaignScope` returns only active staff without a deactivated profile, which is exactly right for a picker and exactly wrong for a history screen. `listRoster` therefore takes its active staff from `assignableCallers` and then reads the `dialer_callers` profiles for the same scope, adding back only users the set omitted. Re-deriving the active set from `users` would let the roster and the picker drift.
2. **The inactive-profile refusal comes before set membership in promotion.** An inactive profile is, by definition, absent from `assignableCallers`; checking membership first would make `409 caller_inactive` unreachable and report the wrong refusal. The state check is scoped first, so an out-of-scope inactive profile is still `403 caller_not_assignable` by id, not a named `409` that would disclose another preacher's staff.
3. **A mixed batch is `403`, not `409`.** If any id is outside the assignable set, authorization has failed for the whole batch and `caller_not_assignable` wins; only an all-inactive batch is `409 caller_inactive`. Both messages name every offender, but an out-of-scope user is named by id only.
4. **Deactivation is `requireRole(staff, ["Admin"])`, not `requireCampaignAdmin`.** A Preacher or Assistant may read the scoped roster; only an Admin may switch `is_active` off or on. Reactivation is an explicit Admin action here and only here.
5. **No performance columns in this layer.** The design's Contact / Campaigns / Calls made / Reached columns need `campaign_progress`, which Story 1.9 creates. This layer returns roster facts only; the UI layer must not render those columns yet, and must not compute them from client-side call or assignment reads.
6. **`isActive` and `deactivated` describe the caller profile, not the staff account.** A staff user with no profile is neither active nor deactivated; a staff user with an active profile is reported active even if their `users.status` later changes, because the dialer's own switch is the only status this screen owns. Sign-in is still refused for a non-Active staff account by `lib/authz.ts`.
7. **`promoteCaller` delegates to `promoteCallers`.** Single and batch cannot disagree about the inactive, idempotent and insert paths. Duplicate ids collapse to the first occurrence, so a batch never creates two profiles for one user.
8. **A non-list `userIds` is `400 invalid_user_ids`.** The API layer owns body parsing; this layer still refuses the wrong shape rather than iterating it.
9. **A concurrent duplicate insert is idempotent only when it is complete.** On `23505`, the service re-reads every target; if all are now active profiles, they are returned as `existing`. If any is missing or inactive, the answer stays `500 caller_write_failed` and this call has written nothing.
10. **Promotion never writes a user row and never changes a role.** `public.users` and `auth.users` are the core app's staff invite path; a `users` row without a matching `auth.users` row cannot sign in, so this layer only attaches the calling profile.

</frozen-after-approval>

## Code Map

- `lib/dialer/callers.ts` — `listRoster`, `setCallerActive`, `promoteCaller`, `promoteCallers`, the roster/profile DTOs, the scope-aware reads, the deterministic roster order and the batch refusal planner.
- `lib/dialer/scope.ts` — `campaignScope`, `requireCampaignAdmin` and the `AssignableCaller` DTO, reused as the scope and active-staff source (read-only here).
- `lib/supabase/paging.ts` — `collectPagedRows`, AD-16's shared pager, used by every list and by-id read (read-only here).
- `lib/supabase/admin.ts` — `createSupabaseAdminClient`, the service-role client (read-only here).
- `lib/supabase/types.ts` — the generated `users` and `dialer_callers` row aliases (read-only here).
- `lib/authz.ts` — `AuthzError`, `requireRole`, `StaffContext` and `StaffRole` (read-only here).
- `supabase/migrations/20261025000000_create_dialer_tables.sql` — `dialer_callers` columns, the `(program_id, user_id)` unique key and the `ON DELETE RESTRICT` user reference this layer writes against (read-only here).
- `_bmad-output/E-Assets/page-designs/campaign/document.json` — node 645, the desktop Callers frame; the two header buttons are deliberately not modelled (read-only here).
- `_bmad-output/specs/spec-autodialer/stories/1-6-caller-roster-server.md` — this record.

## Tasks & Acceptance

**Execution:**
- [x] `lib/dialer/callers.ts` — `listRoster` with the AD-3 scope, the profile-retention read, the dedupe and the deterministic sort.
- [x] `lib/dialer/callers.ts` — `setCallerActive` with the Admin-only gate, the UUID and boolean checks, and the program-filtered update.
- [x] `lib/dialer/callers.ts` — `promoteCaller` and `promoteCallers` with the inactive-profile refusal, the assignable-set refusal, the idempotent existing path, the single multi-row insert and the `{ promoted, existing }` result.
- [x] `lib/dialer/callers.ts` — the exported `CallerRosterEntry`, `CallerProfile` and `PromoteCallersResult` DTOs.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-6-caller-roster-server.md` — this record.

**Acceptance Criteria:**
- Given an Admin, when they list the roster, then every active staff user in the program appears, every existing caller profile in the program appears, and a deactivated caller is retained last with `isActive = false` and `deactivated = true`.
- Given a Preacher, when they list the roster, then their assignees and themselves appear and another preacher's staff do not; the same holds for an Assistant against their preacher's assignees and themselves, and an Assistant without a preacher is `403 campaign_scope_missing`.
- Given a Volunteer, when any operation runs, then `403 forbidden` is returned before a read or write.
- Given an Admin, when they deactivate or reactivate a caller, then the profile's `is_active` changes and the updated DTO is returned; a Preacher or Assistant gets `403 forbidden`.
- Given an eligible staff user with no profile, when they are promoted, then a `dialer_callers` row is created with `promoted_by = staff.userId`, `promoted_at` set and `is_active = true`, and no `public.users` or `auth.users` row is written.
- Given an existing active profile, when the same user is promoted again, then the profile is returned unchanged.
- Given an inactive profile, when the user is promoted singly or in a batch, then `409 caller_inactive` names the caller and nothing is reactivated or inserted.
- Given a batch with any id outside the assignable set, when promotion runs, then `403 caller_not_assignable` names every offender and no profile is written.
- Given a roster caller with call history, when the roster is listed, then no performance count is returned from this layer; those columns wait for Story 1.9's `campaign_progress`.

## Implementation Notes

### Exported surface

| Export | Signature |
|---|---|
| `CallerRosterEntry` | `{ userId; name; email; role; callerId?; displayName?; isActive; promotedAt?; deactivated }` |
| `CallerProfile` | `{ id; userId; displayName; isActive; promotedBy; promotedAt; createdAt; updatedAt }` |
| `PromoteCallersResult` | `{ promoted: CallerProfile[]; existing: CallerProfile[] }` |
| `listRoster` | `(staff: StaffContext) => Promise<CallerRosterEntry[]>` |
| `setCallerActive` | `(staff: StaffContext, callerId: string, isActive: boolean) => Promise<CallerProfile>` |
| `promoteCaller` | `(staff: StaffContext, userId: string) => Promise<CallerProfile>` |
| `promoteCallers` | `(staff: StaffContext, userIds: string[]) => Promise<PromoteCallersResult>` |

### Roster scope matrix

| Viewer | Rows listed | May set `is_active` |
|---|---|---|
| Admin | Every active staff user in the program, plus every `dialer_callers` profile in the program whose user is not already listed (including users no longer `Active`) | Yes |
| Preacher | Active staff with `assigned_preacher_id = staff.userId`, plus the Preacher, plus the profiles of that scope (including inactive users) | No — `403 forbidden` |
| Assistant | Active staff with `assigned_preacher_id = staff.assignedPreacherUserId`, plus the Assistant, plus the profiles of that scope (including inactive users) | No — `403 forbidden` |
| Volunteer | None | No — `403 forbidden` |

The active staff half is `campaignScope(...).assignableCallers`; the profile half is the `dialer_callers` read. A `dialer_callers` profile with `is_active = false` is on the roster but not in the assignable set, which is what keeps history visible without making the caller assignable again.

### Ordering

`rosterRank` is 0 for a profile with `is_active = true`, 1 for a staff user with no profile, and 2 for a profile with `is_active = false`. Within a rank the sort key is `displayName` (falling back to `name`) for a profile holder and `name` for a non-caller, then `name`, then `userId`. The last two comparisons make the order stable when two people share a display name.

### Promotion decision table

| Target state | Classified as | Result |
|---|---|---|
| Inactive profile in the requester's roster scope | inactive | `409 caller_inactive`, named by `displayName` |
| Inactive profile outside the roster scope | not assignable | `403 caller_not_assignable`, named by id only |
| Not in `assignableCallers`, in roster scope | not assignable | `403 caller_not_assignable`, named by staff name |
| Not in `assignableCallers`, out of scope or unknown | not assignable | `403 caller_not_assignable`, named by id only |
| In `assignableCallers`, active profile | existing | Returned unchanged, no write |
| In `assignableCallers`, no profile | target | Inserted with `promoted_by`, `promoted_at`, `is_active = true` |

A batch runs the whole table for every id before writing. If any row is not assignable the batch is `403` (even when an inactive row is also present); if every offender is inactive the batch is `409`. `{ promoted, existing }` preserves the first-occurrence order of `userIds`.

### Error codes

| Code | HTTP | Raised by | Trigger |
|---|---|---|---|
| `forbidden` | 403 | all four | Volunteer, or a Preacher/Assistant calling `setCallerActive` |
| `campaign_scope_missing` | 403 | list, promote | `campaignScope` refuses a Preacher/Assistant with no scope id |
| `caller_not_found` | 404 | set active | malformed id, no row in this program, or the row vanished before the update |
| `invalid_is_active` | 400 | set active | `isActive` is not a boolean |
| `invalid_user_ids` | 400 | promote batch | `userIds` is not a list |
| `caller_not_assignable` | 403 | promote | an id outside `assignableCallers`, including malformed ids |
| `caller_inactive` | 409 | promote | an existing profile with `is_active = false` |
| `unsupported_role` | 500 | list, promote | a stored `users.role` outside `StaffRole` (directly in the roster, or via `campaignScope`) |
| `caller_roster_read_failed` | 500 | list, promote | a `users` or scope-roster read failed |
| `caller_read_failed` | 500 | list, promote | a `dialer_callers` read failed |
| `caller_roster_truncated` | 500 | list, promote | a roster read hit the page budget |
| `caller_write_failed` | 500 | set active, promote | an update or insert failed, returned short, or lost the concurrent-duplicate race |
| `dialer_roster_read_failed` / `dialer_roster_truncated` | 500 | list, promote | inherited from `campaignScope`'s own assignable-set read |

### The roster and the assignable set are not the same list

The picker and the roster answer different questions. The picker asks "who may receive work now?" and must exclude a deactivated caller; the roster asks "who has been a caller, and what is their state?" and must keep that person visible. `listRoster` therefore reads the scope twice: once through `campaignScope` for the active staff half, once through `dialer_callers` for the profile half. Both reads are `program_id`-bounded and the profile read is by user id, so an Admin cannot see another program's caller and a Preacher/Assistant cannot see another preacher's assignee.

### The performance columns are deferred, not stubbed

The desktop frame shows Caller / Contact / Campaigns / Calls made / Reached / Status, but the counts come from `campaign_progress(campaign_id, scope_preacher_id, program_scope)`, the one reporting computation Story 1.9 creates (AD-5). This layer has no campaign id argument, no progress function and no dict of arrays to join. Returning `0` or a locally counted number would be a second computation with a different denominator, which AD-5 exists to prevent. The DTO therefore carries no count field; the UI layer shows the Caller and Status columns until 1.9 lands, and the "3 active · 1 inactive · folk programme" subtitle is derived from `isActive` / `deactivated` on the returned rows.

### The never-reactivate rule

`dialer_callers.is_active = false` is a terminal state for promotion. The assignable set excludes the user, and `planPromotion` checks the stored profile before it checks membership, so the refusal is `409 caller_inactive` rather than `403 caller_not_assignable`. The only path back to active is `setCallerActive(staff, callerId, true)` with an Admin session. Nothing in the dialer inserts, updates or upserts a profile on the caller's behalf, and no staff-user or role write is possible here.

### What this layer does not prove

There is no unit runner in this repo, no `/api/dialer/**` caller route calls these functions yet, and no seeded caller profile is exercised by an automated check. `pnpm test:static` proves types, import boundaries and lint only. The runtime behaviour described above is unproven until the API layer's route sweep and the UI layer's `campaign-callers` spec reach it.

The story's `pnpm test:e2e campaign-callers` scope belongs to the UI layer; this layer has no route or page and ran no e2e command.

Two things this layer deliberately cannot account for:

- **Performance columns.** Contact / Campaigns / Calls made / Reached need `campaign_progress`, which Story 1.9 creates. The UI must not add a count column or compute one from call logs until that function exists.
- **The assignment write's transaction.** Story 1.8 owns the pre-check and the transactional batch that calls `promoteCallers`. This layer re-checks the assignable set when it is called, but it cannot make the promotion and the assignment rows one transaction; Story 1.8 must call it inside its own write path and re-check after its conflict decision.

A smaller limitation is recorded as debt: the staff `status` is read during the `campaignScope` snapshot and is not re-read at insert time, so a user who becomes `Inactive` between those two moments can still receive a caller profile in this call. Story 1.8's write path should re-validate the set inside its transaction. A second small limit: `dialer_callers.user_id` has an `ON DELETE RESTRICT` FK to `users` but no composite same-program constraint, so an Admin roster would skip a profile whose user belongs to another program because the user read is program-filtered; no path in this app creates such a row.

## Spec Change Log

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0, at `8c2686e`.
  - `pnpm guardrails` — "Monorepo guardrails passed." with the four pre-existing type-import warnings in `lib/auth-context.tsx`, `components/auth-hash-callback.tsx`, `components/invite-user-form.tsx` and `components/staff-auth-shell.tsx`, and `[verify-dialer-route-coverage] All 7 route(s) covered by denial sweep.`
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — "✖ 16 problems (0 errors, 16 warnings)"; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm exec eslint lib/dialer/callers.ts` — no output, exit 0 (a targeted check before the full gate).

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- No e2e command was run. This layer has no route or page, and the story's `pnpm test:e2e campaign-callers` scope belongs to the UI layer.
- No runtime smoke test was possible: the module is `server-only`, has no route, and the repo has no unit runner. See "What this layer does not prove".

**Post-run state:** no database was contacted, so no caller profile, staff row or campaign row was created or changed.
