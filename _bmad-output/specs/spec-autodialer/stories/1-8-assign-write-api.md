---
title: 'Assignment pre-check and weighted write API routes'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/stories/1-8-assign-write-server.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `lib/dialer/assignments.ts` now holds both halves of Story 1.8 — `precheckAssignments` names every selected contact already assigned in the campaign, and `writeAssignments` applies the skip/move decision, auto-promotes callers, computes the weighted split and writes the batch in one RPC — but no route reaches either. Without an HTTP surface the assign-contacts screen would have to import a `server-only` module into the client graph, or re-derive the conflict list, the split and the refusals in a second implementation, which is the drift AD-11 exists to prevent. The AD-8 sweep also has no row for the two writes, so the routes the assign screen will call could ship with no boundary test.

**Approach:** Two route files under the campaign's `assignments/` segment. `POST …/assignments/precheck` is a thin delegate over `precheckAssignments`, returning the service's `{ conflicts, assignableCount, conflictCount }` unchanged. `POST …/assignments` is a thin delegate over `writeAssignments`, returning `201 { written, skipped, split }`. Both resolve `getStaffContext()` first, take `params` as a Promise, read the body through the shared `readJsonBody` (so a parse failure is `400 invalid_body`, not a 500), and funnel every throw through `dialerErrorResponse`. Neither route validates, defaults or reshapes anything the service owns — `mode` in particular is forwarded exactly as it arrived, `undefined` included, so the service's `409 conflicts_require_decision` survives. The sweep gains two `kind: "admin"` rows against a third disposable campaign, both sending `{}` to prove the gate without writing, plus six payload-contract tests for the two routes' named refusals.

## Boundaries & Constraints

**Always:**
- The handler declares `export const dynamic = "force-dynamic"`, calls `await getStaffContext()` first, and returns `dialerErrorResponse(error)` from its catch.
- Both routes open with `getStaffContext()`, then `await context.params`, then the shared body reader, then the service. The gate runs before the body is parsed, so an unauthenticated malformed body is `401 unauthenticated`, not `400 invalid_body`.
- The body is opaque to the route. `contactIds`, `callers` and `mode` are handed to the service as they arrived; the service owns id validation, the campaign 404, the AD-3 scope refusal, weight validation, the mode check and every write-time refusal.
- `mode` is not defaulted in the route. A route that defaulted it would turn an undecided conflict list into a write, which is the one thing AD-11 forbids.
- Every route file has a sweep row whose `route:` is exactly the guardrail's directory-derived path, brackets included. Every existing row stays.
- Both owner sweep rows run against a campaign the fixture creates in `beforeAll` and removes in `afterAll` through `deleteDisposableCampaign`'s local `/pg/query` SQL. Both services resolve the campaign before reading a contact, so an absent id would be a 404 and would prove only that the gate admits the Admin.
- `pnpm test:static` and `pnpm test:e2e dialer-route` both pass.

**Never:**
- No route under `/api/dialer/caller/**` in this story, and no change to `lib/**`.
- No second validation, scope filter, split computation or conflict list in either route.
- The sweep never writes an assignment: `dialer_assignments.campaign_id` is `ON DELETE RESTRICT`, so a written row would block the fixture campaign's cleanup. Both owner rows send `{}` and are refused before any read or write.
- Do not edit `components/**`, `apps/folk/app/campaigns/**`, `public/sw.js`, the proxies, the migrations, `playwright.config.ts` or `package.json`.
- Do not weaken a gate to make a run pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pre-check as an Admin | Admin session, real campaign, `{ contactIds: [uuid] }` | `200 { conflicts, assignableCount, conflictCount }`, nothing written | — |
| Pre-check with a conflict | Contact already assigned in the campaign | Conflict names the contact and the current caller's `display_name`, with the stored status | — |
| Pre-check as a Preacher / Assistant | Either session, real campaign | `200`, scoped by `campaignScope` | — |
| Pre-check as a Volunteer | Volunteer session | No read issued | `403 forbidden`, JSON body |
| Both, no session | No cookie | No staff context resolved | `401 unauthenticated` |
| Both, malformed campaign id | `"abc"` | No contact read | `404 campaign_not_found` |
| Both, missing or other-program campaign | Valid UUID with no row in `staff.programId` | No contact read | `404 campaign_not_found` |
| Both, body is not JSON | `"{not json"` | No service call | `400 invalid_body` (shared reader) |
| Both, body is a JSON array | `[]` | No service call | `400 invalid_body` (shared reader) |
| Both, empty or malformed selection | `{}`, `{ contactIds: [] }`, `{ contactIds: ["abc"] }` | No contact read | `400 invalid_contact_ids` |
| Both, out-of-set contact | Valid UUID with no row in the program, or another preacher's contact | No assignment read | `403 contact_not_assignable` naming the id |
| Write, no callers | `{ contactIds: [uuid] }` | No promotion, no RPC | `400 invalid_caller_list` |
| Write, bad weight | `weight: 0`, `-1`, `2.5` | No promotion, no RPC | `400 invalid_weight` |
| Write, unknown mode | `mode: "pause"` | No promotion, no RPC | `400 invalid_mode` |
| Write, conflicts, no mode | Any selection with an existing row and `mode` absent | No promotion, no RPC | `409 conflicts_require_decision` naming contact and current caller |
| Write, conflicts, `skip` / `move` | Any selection with an existing row | `201`, `written + skipped` equals the validated selection size | — |
| Write, confirmed set empty, `skip` | Every contact already assigned | No RPC | `409 nothing_to_assign` |
| Write, caller outside the set | Valid staff user outside `assignableCallers` | No assignment row | `403 caller_not_assignable` naming the caller |
| Write, inactive caller | Existing profile with `is_active = false` | No reactivation, no assignment row | `409 caller_inactive` naming the caller |
| Write, campaign left `DRAFT`/`ACTIVE` | `COMPLETED` or `CANCELLED` before the RPC | Whole batch rolled back | `409 campaign_not_assignable` naming the status |
| Write, RPC failure | Any other SQLSTATE | Whole batch rolled back | `500 assignment_write_failed`, "nothing was written" |
| Write, unreadable RPC result | Result not `{ written, skipped }` | Batch may have committed | `500 assignment_write_unverified` |

## Human Decisions

1. **Two route files, no shared handler.** The pre-check and the write answer different shapes (`200` DTO vs `201` result) and the pre-check is useful alone — it is what makes the conflict list readable before the decision. A shared helper would only share the four-line prologue.
2. **Both routes return the service object verbatim.** `Response.json(precheck)` and `Response.json(result, { status: 201 })` mean the envelope is `AssignmentPrecheck`'s and `WriteAssignmentsResult`'s own contract. A route that nested or renamed them would create a second shape for the UI to reconcile.
3. **The route does not validate `contactIds`, `callers` or `mode`.** The service already refuses each with a named 400/403/409, and a route-side guard would either duplicate the rule or disagree with it. The payload tests assert the *service's* codes through the route, so "forwarded" is proven rather than assumed.
4. **`mode` is forwarded untouched, including `undefined`.** The service's `409 conflicts_require_decision` is the contract that nothing is written before the assigner chooses. Defaulting to `"move"` in the route — even though the service uses `move` as its own no-conflict default — would move the decision to the wrong layer.
5. **The owner rows are `400` gate proofs against a real campaign.** `{}` carries no `contactIds`, so both services refuse it before any read or write. A `200`/`201` owner row would need a contact and, for the write, an assignment row whose `campaign_id` is `ON DELETE RESTRICT` — the fixture's cleanup would then fail. The successful write belongs to the UI layer's `campaign-assign-write` spec, which can own its own fixture and clean up in dependency order.
6. **A third disposable campaign, not a widened second one.** Each fixture campaign is created and removed by the group that uses it, so a failure in one group cannot leave another without a campaign, and the pair is readable as a unit.
7. **`mode: "pause"` is the mode-pass-through test.** It is the only mode assertion that needs no assignment row: an unknown value reaches `normalizeAssignmentMode` and answers `400 invalid_mode`, which proves the route neither defaulted nor rewrote the field.

</frozen-after-approval>

## Code Map

- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/assignments/precheck/route.ts` — `POST` through `precheckAssignments`.
- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/assignments/route.ts` — `POST` through `writeAssignments`.
- `apps/folk/app/api/dialer/_lib/request-body.ts` — `readJsonBody`, the shared `400 invalid_body` reader (read-only here).
- `lib/dialer/assignments.ts` — `precheckAssignments`, `writeAssignments`, `WriteAssignmentsInput`, `AssignmentPrecheck`, `WriteAssignmentsResult` and every named error (read-only here).
- `lib/dialer/scope.ts` — `dialerErrorResponse`, `requireCampaignAdmin`, `campaignScope` (read-only here).
- `lib/dialer/campaigns.ts` — `getCampaign`, the campaign 404 gate (read-only here).
- `lib/authz.ts` — `getStaffContext`, `AuthzError`, `authzErrorResponse` (read-only here).
- `e2e/specs/dialer-route-sweep.spec.ts` — two admin rows, a third fixture campaign pair, six payload-contract tests.
- `e2e/fixtures/dialer-campaign.ts` — reused unchanged (`createDisposableCampaign` / `deleteDisposableCampaign`).
- `scripts/verify-dialer-route-coverage.mjs` — read-only here; it needed no change (`All 14 route(s) covered`).
- `_bmad-output/specs/spec-autodialer/stories/1-8-assign-write-api.md` — this record.

## Tasks & Acceptance

**Execution:**
- [x] `.../assignments/precheck/route.ts` — `POST` pre-check, body forwarded, `AssignmentPrecheck` returned verbatim.
- [x] `.../assignments/route.ts` — `POST` write, `contactIds`/`callers`/`mode` forwarded, `201 WriteAssignmentsResult`.
- [x] `e2e/specs/dialer-route-sweep.spec.ts` — two `kind: "admin"` rows against a third disposable campaign, the third fixture pair, six payload contracts.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-8-assign-write-api.md` — this record.

**Acceptance Criteria:**
- Given an Admin and a real campaign, when they `POST` the pre-check with a selection, then the answer is `200 { conflicts, assignableCount, conflictCount }` with every conflict named by contact and current caller.
- Given an Admin and a real campaign, when they `POST` the write with a confirmed selection, then the answer is `201 { written, skipped, split }`, and `written + skipped` equals the validated selection size.
- Given `{}`, then both routes answer `400 invalid_contact_ids` and nothing is read or written.
- Given a body that is not a JSON object, then both routes answer `400 invalid_body`.
- Given an out-of-set contact, then both routes answer `403 contact_not_assignable` naming the id.
- Given `mode: "pause"`, then the write answers the service's `400 invalid_mode` — the route neither defaults nor rewrites the mode.
- Given a Volunteer, then both routes answer `403 forbidden` before any read.
- Given no session, then both routes answer `401 unauthenticated`.
- Given `pnpm guardrails`, then it sees a sweep row for each route file and prints `All 14 route(s) covered by denial sweep.`
- Given `pnpm test:e2e dialer-route`, then 81 tests run (4 role setups + 77 spec tests) and all pass.

## Implementation Notes

### Route table

| Method | Path | Gate | Success | Refusals |
|---|---|---|---|---|
| `POST` | `/api/dialer/admin/campaigns/[campaignId]/assignments/precheck` | `getStaffContext()` → `precheckAssignments`' `requireCampaignAdmin` (AD-2), then `getCampaign` (404), then `campaignScope` (AD-3), then `normalizeContactIds` | `200 { conflicts, assignableCount, conflictCount }` | `401 unauthenticated`; `403 forbidden`; `403 campaign_scope_missing`; `400 invalid_body`; `404 campaign_not_found`; `400 invalid_contact_ids`; `403 contact_not_assignable`; `500 campaign_read_failed` / `dialer_roster_read_failed` / `dialer_roster_truncated` / `contact_list_read_failed` / `contact_list_truncated` / `assignment_read_failed` / `assignment_read_truncated` |
| `POST` | `/api/dialer/admin/campaigns/[campaignId]/assignments` | the pre-check's gate, then `requireCallerWeights`, `normalizeAssignmentMode`, a re-run of `precheckAssignments`, `previewAssignmentSplit` weight validation, `promoteCallers`, the assignable-set assertion and the `assign_dialer_contacts` RPC | `201 { written, skipped, split }` | every pre-check refusal, plus `400 invalid_caller_list` / `invalid_weight` / `invalid_mode` / `invalid_rows`; `409 conflicts_require_decision` / `nothing_to_assign` / `caller_inactive` / `campaign_not_assignable`; `403 caller_not_assignable`; `500 caller_profile_missing` / `caller_write_failed` / `assignment_write_failed` / `assignment_write_unverified` |

Neither route exports any other method; Next answers `405` for `GET` on both.

**Order inside the handlers:** staff context → campaign id → body read → service. The service's own order is untouched, so nothing the route does can reorder a refusal. `getStaffContext()` is the first statement, so an unauthenticated request with an unparseable body is `401`, not `400`.

### Reading the two bodies

Both routes use `_lib/request-body.ts`'s `readJsonBody`, the one shared reader. It catches `request.json()`'s throw and turns it into `AuthzError(400, "invalid_body")`, and it refuses a non-object payload (an array, `null`, a scalar) with the same code. The cast that follows is a typing convenience only — every field is validated by the service, which is why `{}` and `{ contactIds: ["abc"] }` reach the same named 400.

| Route | Fields the service reads | Fields the route touches |
|---|---|---|
| pre-check | `contactIds` | none |
| write | `contactIds`, `callers[]`, `mode` | none; `mode` is passed as `body.mode`, so an absent key stays `undefined` |

### Sweep rows

| Method | `route:` (guardrail) | `url:` (request) | Owner statuses | Why that status |
|---|---|---|---|---|
| `POST` | `/api/dialer/admin/campaigns/[campaignId]/assignments/precheck` | `/api/dialer/admin/campaigns/<fixture id>/assignments/precheck` | `[400]` | `{}` has no `contactIds`, so the service refuses it with `400 invalid_contact_ids` before any read — the campaign exists, so the row proves the gate admits the Admin and nothing is written |
| `POST` | `/api/dialer/admin/campaigns/[campaignId]/assignments` | `/api/dialer/admin/campaigns/<fixture id>/assignments` | `[400]` | the same `{}` refusal reaches the write's own `normalizeContactIds`, before weight validation, promotion or the RPC |

The campaign is created in a third `beforeAll`/`afterAll` pair via `createDisposableCampaign(adminRequest, "assign write")` and removed with `deleteDisposableCampaign`. Both reuse the fixture's local-SQL cleanup; neither row writes a contact, caller or assignment, so the delete cannot be blocked by a foreign key. `dialer_assignments.campaign_id` is `ON DELETE RESTRICT`, which is the reason the successful write is not attempted here.

### Payload contracts beside the rows

| Test | Asserts |
|---|---|
| `Assignment pre-check: the selection gate is the service's › is a 400 invalid_body for unparseable JSON` | the shared reader turns a parse failure into the caller's named 400, not a 500 |
| `… › is a 403 contact_not_assignable naming an out-of-set contact, and writes nothing` | an absent contact is refused by id, never silently dropped from a shorter list |
| `Assignment write: the pre-check runs inside the write › is a 400 invalid_body for a JSON array` | an array is valid JSON but not a request body |
| `… › is a 400 invalid_caller_list before any contact is read` | a selection with no callers is refused before the pre-check |
| `… › is a 403 contact_not_assignable naming an out-of-set contact, and writes nothing` | the write re-runs the pre-check instead of trusting the client |
| `… › forwards mode untouched: an unknown mode is the service's 400 invalid_mode` | the route neither defaults nor rewrites `mode`; the refusal is the service's |

### What this layer does not prove

- **The `201` success path has no assertion in this gate.** A real write creates a `dialer_assignments` row whose `campaign_id` is `ON DELETE RESTRICT`, so the fixture's campaign delete would fail; the sweep cannot own that fixture without duplicating the cleanup contract. The `{ written, skipped, split }` envelope, `move` updating rather than duplicating, `skip`'s counts and the split's sum are the UI layer's `campaign-assign-write` spec.
- **The conflict decision is unasserted.** `409 conflicts_require_decision`, `409 nothing_to_assign`, `409 caller_inactive`, `403 caller_not_assignable`, `409 campaign_not_assignable` and auto-promotion all need either a pre-existing assignment row or a caller profile. The route forwards the inputs and returns the service's error unchanged — that plumbing is what these tests prove; the states are proven nowhere in this layer.
- **`mode` absent is only indirectly proven.** The `mode: "pause"` test proves the route does not rewrite the field, but a route that defaulted an *absent* mode would still pass every row here. The `409 conflicts_require_decision` assertion is the one that catches it, and it lives with the conflict fixture in the UI spec.
- **No Preacher or Assistant owner row.** Both rows run as Admin; AD-3's preacher predicate for these two routes is the service's and is unexercised by this sweep.
- **`pnpm test:e2e campaign-assign-write` matches no tests**, because that spec is the UI layer's. The packet's filter is `dialer-route`, which is what this layer ran.
- **`pnpm test:e2e:determinism` was not run.** The packet's verification is the single `dialer-route` filter and only one runner may be active; this file creates and removes three campaigns per run and writes nothing else.

## Spec Change Log

None.

## Review Triage Log

None.

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e dialer-route` (the packet's VERIFICATION command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `[verify-dialer-route-coverage] All 14 route(s) covered by denial sweep.` and `Monorepo guardrails passed.`, with the same four pre-existing type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm test:e2e dialer-route` — **PASS**, exit 0. `81 passed (35.4s)` — the four role setup projects plus seventy-seven spec tests.
- `pnpm test:e2e:list dialer-route` — `Total: 81 tests in 5 files`, confirming the filter's scope before the run.

**Spec tests added (6):**
- `Assignment pre-check: the selection gate is the service's › is a 400 invalid_body for unparseable JSON`
- `… › is a 403 contact_not_assignable naming an out-of-set contact, and writes nothing`
- `Assignment write: the pre-check runs inside the write › is a 400 invalid_body for a JSON array`
- `… › is a 400 invalid_caller_list before any contact is read`
- `… › is a 403 contact_not_assignable naming an out-of-set contact, and writes nothing`
- `… › forwards mode untouched: an unknown mode is the service's 400 invalid_mode`

**Sweep rows added (2 rows, 6 cases):**
- `Denial sweep: POST /api/dialer/admin/campaigns/[campaignId]/assignments/precheck — {unauthenticated, non-owner (volunteer), owner (admin)}`
- `Denial sweep: POST /api/dialer/admin/campaigns/[campaignId]/assignments — {unauthenticated, non-owner (volunteer), owner (admin)}`

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `dialer-route`, and the full suite belongs to the join layer.
- `pnpm test:e2e campaign-assign-write` was not run: it selects no tests (see above).

**Post-run state:** `public.dialer_campaigns` holds zero rows after the run — all three fixture campaigns, this layer's and the two earlier groups', were removed in `afterAll`. No assignment, caller or contact row was created or changed.

**Scope note:** this story record sits at
`_bmad-output/specs/spec-autodialer/stories/1-8-assign-write-api.md`, which the api layer's
entry in `.hedgehog/core.yaml` does not list (the server layer's does). `hedgehog verify`
needs the path granted before it runs:

```bash
hedgehog override add STORY-1-8-ASSIGN-WRITE-API \
  --scope '_bmad-output/specs/spec-autodialer/stories/**' \
  --reason 'api layer records its story beside the code, as every prior layer did'
```

The packet's FIRST ARRIVAL block lists `apps/folk/app/api/dialer`, `e2e/auth` and `e2e/fixtures`
as absent; all three were already present, so no package shell was created and nothing outside
the packet's ALLOWED SCOPE was written.
