---
title: 'Caller roster API routes'
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

**Problem:** `lib/dialer/callers.ts` can list the AD-3-scoped roster and switch a caller's `is_active`, but nothing in the app reaches it. Without HTTP routes the Callers screen would import a `server-only` module into a client graph and re-invent the AD-2 split — Admin, Preacher and Assistant may read, only an Admin may deactivate — along with the roster scope and the "deactivated, never deleted" rule. The AD-8 denial sweep also has no row for the roster population, so the routes it will ship could exist without a boundary test.

**Approach:** Two route files under `/api/dialer/admin/callers` as thin delegates over the service: `GET` on the collection answers `200 { callers }` through `listRoster`; `PATCH` on `[callerId]` answers `200 { caller }` through `setCallerActive`. Every handler is `force-dynamic`, resolves `getStaffContext()` before anything else, reads the body through the shared `readJsonBody` (`400 invalid_body`, never a 500), and funnels every throw through `dialerErrorResponse`. No `DELETE` is exported: a caller is deactivated, never removed. The sweep gains two `kind: "admin"` rows whose owner cases pin a refusal, plus four payload-contract tests.

## Boundaries & Constraints

**Always:**
- Every handler declares `export const dynamic = "force-dynamic"`, calls `await getStaffContext()` first, and returns `dialerErrorResponse(error)` from its catch.
- The gates are the service's own: `listRoster` opens with `requireCampaignAdmin` (AD-2) and `setCallerActive` opens with `requireRole(staff, ["Admin"])`, then checks the id shape, then the boolean. The routes add no role logic, no scope filter and no `isActive` validation.
- `GET` the collection answers `200 { callers }`; `PATCH` one caller answers `200 { caller }`.
- Next 16's dynamic `params` is a Promise: `const { callerId } = await context.params`.
- A body that is not a JSON object is `400 invalid_body` through `_lib/request-body.ts`, not a route-local parse.
- Every route file has a sweep row whose `route:` is exactly the guardrail's directory-derived path, brackets included. `[callerId]` carries a `PATCH` row whose `url` is a concrete id.
- Every existing sweep row stays, and `sweepRoute` stays one helper with two shapes (`kind: "caller"` / `kind: "admin"`).

**Never:**
- No create, invite, import, promote or manage-user route. Promotion is Story 1.8's assignment write; a roster route that writes a profile would be the invite flow AD-2 and UX-DR32 removed.
- No `DELETE` handler. Deactivation is the `is_active` switch, history stays, and no route removes a caller profile, a staff user or an auth user.
- No `/api/dialer/caller/**` route in this story.
- The sweep never creates or toggles a caller profile. Both owner rows pin a refusal, so no shared fixture state changes between runs.
- Do not edit `lib/**`, `components/**`, `apps/folk/app/campaigns/**`, `public/sw.js`, the proxies, the migrations or `package.json`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List as an Admin | Admin session, seeded program | `200 { callers: [...] }`, one row per in-scope staff user and profile | — |
| List as a Preacher | Preacher session | `200`, roster scoped to their assignees plus themselves | — |
| List as an Assistant | Assistant session with `assigned_preacher_id` | `200`, the preacher's assignees plus the Assistant | — |
| List as an Assistant without a preacher | `assigned_preacher_id` absent | No roster read | `403 campaign_scope_missing` |
| List as a Volunteer | Volunteer session | No read issued | `403 forbidden`, JSON body |
| List with no session | No cookie | No staff context resolved | `401 unauthenticated` |
| List, unsupported stored role | `users.role` outside `StaffRole` | No partial roster | `500 unsupported_role` |
| List, staff read fails | PostgREST error | No partial roster | `500 caller_roster_read_failed` / `dialer_roster_read_failed` |
| List, a read truncates | Full final page at the page budget | No short roster | `500 caller_roster_truncated` / `dialer_roster_truncated` |
| Deactivate | Admin, real caller id, `{ isActive: false }` | `200 { caller }` with `isActive: false` | — |
| Reactivate | Admin, real caller id, `{ isActive: true }` | `200 { caller }` with `isActive: true` | — |
| Deactivate as a Preacher | Any caller id | No read or write | `403 forbidden` |
| Deactivate as an Assistant | Any caller id | No read or write | `403 forbidden` |
| Deactivate as a Volunteer | Any caller id | No read or write | `403 forbidden` |
| Malformed caller id | `"abc"` | No read or write | `404 caller_not_found` |
| Absent or foreign caller id | Valid UUID with no row in `staff.programId` | No write | `404 caller_not_found` |
| Non-boolean flag | `"false"`, `null`, `1` | No write; checked before the lookup | `400 invalid_is_active` |
| Malformed JSON | `{not json`, `[]`, `null` | No service call | `400 invalid_body` |
| Absent id plus non-boolean flag | Both faults at once | The flag is the answer | `400 invalid_is_active` |
| Any route with no session | No cookie, any body or id | Nothing read | `401` regardless of body |
| `DELETE` any caller | Valid UUID | No handler exists | `405` from Next's method dispatch |
| Update rejected | Permission, constraint or transport error | No DTO returned | `500 caller_write_failed` |

## Human Decisions

1. **Two route files, and no `DELETE`.** Deactivation is the switch; the "never removed" rule is structural — a method the file does not export — rather than a conditional the handler could lose. The sweep asserts Next's `405` so the absence is a documented contract, not a gap.
2. **The sweep's owner rows pin refusals, not a write.** A successful `PATCH` needs a real `dialer_callers` row, and every row in the shared seed belongs to another spec's fixture set: toggling one would change another spec's input and leave the flag flipped if a run aborted. The `404` row proves the Admin gate admitted the actor and that the missing row is reported as `caller_not_found`, which is the whole of this layer's refusal contract. The `200 { caller }` arm is left to the UI layer's `campaign-callers` spec, which can own a disposable caller.
3. **A Preacher read and a Preacher refusal are asserted explicitly.** The Volunteer `403` row cannot prove AD-2's split — it would also pass if the roster read were Admin-only. Only a Preacher that reads `200` and is then refused the status switch with `403 forbidden` shows the read and the write have different gates.
4. **The non-boolean row uses an absent caller id on purpose.** `setCallerActive` validates the flag before it reads a row, so a `400` proves the flag check ran rather than the row's absence. A pre-existing caller would make the same assertion prove less.
5. **`body.isActive` is forwarded unchecked.** The route casts the parsed field and lets `setCallerActive` own `invalid_is_active`; a route-local type check would be a second copy of a service rule, the same division the campaign routes use.
6. **No fixture campaign, and no new fixture.** The roster read has no parent row, and the status row is deliberately absent, so this route family adds nothing to `beforeAll`/`afterAll` and leaves the seeded database untouched.
7. **The roster's row order is not asserted here.** It is `listRoster`'s contract (active by display name, staff without a profile, then deactivated) and binds to a seed other specs change. This layer asserts the envelope and the gate; the UI layer asserts the rendered order.

</frozen-after-approval>

## Code Map

- `apps/folk/app/api/dialer/admin/callers/route.ts` — `GET` list through `listRoster`.
- `apps/folk/app/api/dialer/admin/callers/[callerId]/route.ts` — `PATCH` status through `setCallerActive`.
- `apps/folk/app/api/dialer/_lib/request-body.ts` — the JSON-object body reader, reused unchanged.
- `e2e/specs/dialer-route-sweep.spec.ts` — two new admin rows, `ABSENT_CALLER_ID`, and four payload-contract tests.
- `scripts/verify-dialer-route-coverage.mjs` — read-only here; it needed no change (`All 9 route(s) covered`).
- `lib/dialer/callers.ts` — `listRoster`, `setCallerActive`, the DTOs and every named error (read-only here).
- `lib/dialer/scope.ts` — `requireCampaignAdmin`, `campaignScope`, `dialerErrorResponse` (read-only here).
- `lib/authz.ts` — `getStaffContext`, `AuthzError`, `authzErrorResponse` (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `.../admin/callers/route.ts` — `GET` roster.
- [x] `.../admin/callers/[callerId]/route.ts` — `PATCH` status, no `DELETE`.
- [x] `e2e/specs/dialer-route-sweep.spec.ts` — two rows, `ABSENT_CALLER_ID`, four payload contracts.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-6-caller-roster-api.md` — this record.

**Acceptance Criteria:**
- Given an Admin, when they `GET /api/dialer/admin/callers`, then the answer is `200 { callers }`.
- Given a Preacher or Assistant, when they list the roster, then the answer is `200` for their scope; when they `PATCH` a caller, then the answer is `403 forbidden` with a JSON `code`.
- Given a Volunteer, when they call either route, then the answer is `403` before any read or write.
- Given no session, when either route is called, then the answer is `401` regardless of body or id.
- Given a body that is not a JSON object, then the answer is `400 invalid_body`.
- Given a non-boolean `isActive`, then the answer is `400 invalid_is_active` before the caller is looked up.
- Given an absent or malformed caller id with a valid boolean, then the answer is `404 caller_not_found` and nothing is written.
- Given `DELETE /api/dialer/admin/callers/[callerId]`, then the answer is `405`: there is no removal path.
- Given `pnpm test:e2e dialer-route`, then 55 tests run (4 role setups + 51 spec tests) and all pass.

## Implementation Notes

### Route table

| Method | Path | Gate | Success | Refusals |
|---|---|---|---|---|
| `GET` | `/api/dialer/admin/callers` | `getStaffContext()` → `requireCampaignAdmin` inside `listRoster`, then `campaignScope` | `200 { callers }` | `401 unauthenticated`; `403 forbidden`; `403 campaign_scope_missing`; `500 unsupported_role` / `caller_roster_read_failed` / `caller_read_failed` / `caller_roster_truncated` / `dialer_roster_read_failed` / `dialer_roster_truncated` |
| `PATCH` | `/api/dialer/admin/callers/[callerId]` | `getStaffContext()` → `requireRole(staff, ["Admin"])` inside `setCallerActive`, then the UUID shape, then the boolean | `200 { caller }` | `401 unauthenticated`; `400 invalid_body`; `400 invalid_is_active`; `403 forbidden`; `404 caller_not_found`; `500 caller_write_failed` |

There is no `DELETE` handler and no `/api/dialer/caller/**` route in this story.

**Order inside `PATCH`:** role → id shape → boolean → update. A Preacher or Volunteer sending a valid body gets `403 forbidden` even with a malformed id, and a caller with an invalid flag is `400` even when the id is absent. The one ordering the route controls is that the body is parsed before the service gate runs, so a malformed body from a non-Admin is `400 invalid_body`; that is the same order the campaign routes use and the reason the sweep's non-owner rows send a well-formed body.

**`dialerErrorResponse`, not a bare `Response.json`.** `caller_not_found` is a normal `AuthzError`, so the admin surface keeps its JSON `{ error, code }` body — AD-7's body-less 404 belongs only to `CallerAssignmentNotFoundError` on the caller path, which these routes do not reach.

### Sweep rows

| Method | `route:` (guardrail) | `url:` (request) | Body | Owner statuses | Why that status |
|---|---|---|---|---|---|
| `GET` | `/api/dialer/admin/callers` | same | — | `[200]` | the roster read for the seeded program |
| `PATCH` | `/api/dialer/admin/callers/[callerId]` | `/api/dialer/admin/callers/00000000-0000-4000-8000-000000000002` | `{ isActive: false }` | `[404]` | `caller_not_found`: the Admin gate passed and the row is deliberately absent, so nothing is toggled |

The absent id is valid in shape and absent by construction — `dialer_callers.id` is generated with `gen_random_uuid()`, so neither the seed nor a prior run can hold it.

### Payload contracts beside the rows

| Test | Asserts |
|---|---|
| `Caller roster list envelope › is `{ callers }` for a roster read` | the list answers a `callers` array, never a bare array or a different key |
| `Caller status: a flag that is not a boolean › is a 400 invalid_is_active` | `"false"` is refused by the service, before the caller lookup |
| `Caller roster: a Preacher reads it but cannot switch is_active › lists their scoped roster` | a Preacher's read is `200` (AD-2's read half) |
| `… › is refused a deactivation with 403 forbidden` | the same Preacher is `403 forbidden` on the switch (AD-2's write half) |
| `Caller status: a caller is deactivated, never removed › has no DELETE handler` | `405`; there is no removal path |

### What this layer does not prove

- **`PATCH 200 { caller }` is unproven by the gate.** Both owner rows pin a refusal; a successful write needs a real `dialer_callers` row and none exists that this layer may own. Toggling a seeded caller would change another spec's input and could leave the flag flipped after an aborted run. The UI layer's `campaign-callers` spec is the natural owner, because it can create or take over a caller profile and restore it.
- **Roster row membership and order are not asserted.** The gate proves the envelope and that the Preacher/Assistant gate admits them; it does not prove that an Admin sees the program, a Preacher sees exactly their assignees, or that a deactivated caller sorts last. Those are `listRoster`'s contract (Story 1.6's server layer), and asserting them here would bind the sweep to a seed other specs mutate.
- **Promotion has no route in this story.** The intent's "assigning an eligible staff user creates the `dialer_callers` row with `promoted_by`" is Story 1.8's assignment write calling `promoteCaller`/`promoteCallers`; a roster route that promotes would be the invite flow AD-2 forbids. Until 1.8 lands, the promotion half of the intent has no HTTP surface.
- **No performance columns.** Contact / Campaigns / Calls made / Reached need `campaign_progress` (Story 1.9). The DTO carries no count and the route computes none.
- **No `/api/dialer/caller/**` route**, so the caller boundary and the inactive-caller refusal are not exercised by this layer's rows.
- **`pnpm test:e2e campaign-callers` matches no tests.** The story's test-scope line names a spec the UI layer has not written; the packet's own filter is `dialer-route`, which is what this layer ran.
- **`pnpm test:e2e:determinism` was not run.** The repository defers it to Story 4.2; this file creates and removes one campaign per run and never writes a caller row.

## Spec Change Log

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e dialer-route` (the packet's VERIFICATION command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `[verify-dialer-route-coverage] All 9 route(s) covered by denial sweep.` and `Monorepo guardrails passed.`, with the same four pre-existing type-import warnings (`lib/auth-context.tsx`, `components/auth-hash-callback.tsx`, `components/invite-user-form.tsx`, `components/staff-auth-shell.tsx`).
  - `pnpm typecheck:workspace` — all six workspace projects `Done`, `apps/folk` included.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm test:e2e dialer-route` — **PASS**, exit 0. `55 passed (29.4s)` — the four role setup projects plus fifty-one spec tests.

**Spec tests added:**
- `Denial sweep: GET /api/dialer/admin/callers — {unauthenticated, non-owner (volunteer), owner (admin)}`
- `Denial sweep: PATCH /api/dialer/admin/callers/[callerId] — {unauthenticated, non-owner (volunteer), owner (admin)}`
- `Caller roster list envelope › is `{ callers }` for a roster read`
- `Caller status: a flag that is not a boolean › is a 400 invalid_is_active, mapped from the service`
- `Caller status: a caller is deactivated, never removed › has no DELETE handler`
- `Caller roster: a Preacher reads it but cannot switch is_active › lists their scoped roster`
- `Caller roster: a Preacher reads it but cannot switch is_active › is refused a deactivation with 403 forbidden`

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `dialer-route`, and the full suite belongs to the join layer.
- `pnpm test:e2e campaign-callers` was not run: it selects no tests (see above).

**Post-run state:** the seeded database is unchanged — no caller profile was created or toggled, and the fixture campaign is the existing sweep's own row, created and removed per run.

**Scope note:** this story record sits at
`_bmad-output/specs/spec-autodialer/stories/1-6-caller-roster-api.md`, which the api layer's
entry in `.hedgehog/core.yaml` does not list (the schema and server layers both do). `hedgehog
verify` needs the path granted before it runs:

```bash
hedgehog override add STORY-1-6-CALLER-ROSTER-API \
  --scope '_bmad-output/specs/spec-autodialer/stories/**' \
  --reason 'api layer records its story beside the code, as every prior layer did'
```

The packet's FIRST ARRIVAL block says `apps/folk/app/api/dialer`, `e2e/auth` and `e2e/fixtures`
do not exist yet; all three were already present (campaign routes, role setups and fixtures), so
no package shell was created and nothing outside the packet's ALLOWED SCOPE was written.
