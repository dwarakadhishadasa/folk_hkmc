---
title: 'Campaign progress API route'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/stories/1-9-campaign-overview-server.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `lib/dialer/progress.ts` now owns the only call site of `campaign_progress` — the function AD-5 names as the single funnel, outcome mix, caller rollup, summary and recent-activity computation — but no route reaches it. Without an HTTP surface the Overview screen would have to import a `server-only` module into the client graph, or call the RPC itself and reconstruct the scope argument, and the reconstruction is exactly where a Preacher's `p_scope_preacher_id` could become `null` and widen the read to the whole programme. The AD-8 sweep also has no row for the read, so the route the Overview will call could ship with no boundary test.

**Approach:** One route file under the campaign's `progress/` segment. `GET` is a thin delegate: `getStaffContext()` first, then `await context.params`, then `getCampaignProgress(staff, campaignId)`, answered as `200 { progress }` with the service DTO verbatim. Every throw — including the service's `403 forbidden`, `404 campaign_not_found`, `403 campaign_scope_missing` and `500 campaign_progress_read_failed` — funnels through `dialerErrorResponse`. The route validates nothing, resolves no scope and recomputes no count. The sweep gains one `kind: "admin"` row against a fourth disposable campaign with a real `[200]` owner case, and four payload contracts: the zeroed funnel on a campaign nothing is assigned into, a Preacher's `programScope: false`, the absent-campaign `404 campaign_not_found`, and the `405` that proves the file exports no second method.

## Boundaries & Constraints

**Always:**
- The handler declares `export const dynamic = "force-dynamic"`, calls `await getStaffContext()` first, and returns `dialerErrorResponse(error)` from its catch.
- The gate order is the service's: `requireCampaignAdmin` (AD-2) → campaign id shape → `campaignScope` (AD-3) → `getCampaign` → the RPC. The route issues no read of its own, so it cannot reorder a refusal.
- The body is `{ progress }`, the `CampaignProgress` DTO verbatim: `campaignId`, `programId`, `programScope`, the eight-count `summary`, and the `outcomes`, `callers` and `recent` arrays.
- Every route file has a sweep row whose `route:` is exactly the guardrail's directory-derived path, brackets included. Every existing row stays.
- The owner sweep row runs against a campaign the fixture creates in `beforeAll` and removes in `afterAll` through `deleteDisposableCampaign`'s local `/pg/query` SQL, and pins `200` because a fresh campaign's summary is a true zero, not an error.
- `pnpm test:static` and `pnpm test:e2e dialer-route` both pass.

**Never:**
- No second scope resolution, funnel computation, status filter or list sort in the route.
- No route under `/api/dialer/caller/**` in this story, and no change to `lib/**`.
- The sweep never writes an assignment: `dialer_assignments.campaign_id` is `ON DELETE RESTRICT`, so a written row would block the fixture campaign's cleanup.
- Do not edit `components/**`, `apps/folk/app/campaigns/**`, `public/sw.js`, the proxies, the migrations, `playwright.config.ts` or `package.json`.
- Do not weaken a gate to make a run pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Progress as an Admin | Admin session, campaign in their program | `200 { progress }`, `programScope: true`, RPC called with a null scope id | — |
| Progress as a Preacher | Preacher session, same campaign | `200`, `programScope: false`, RPC called with that user id | — |
| Progress as an Assistant with an active preacher | Assistant session, same campaign | `200`, `programScope: false` | — |
| Progress as a Volunteer | Volunteer session | No read issued | `403 forbidden`, JSON body |
| Progress, no session | No cookie | No staff context resolved | `401 unauthenticated` |
| Progress, malformed campaign id | `"abc"` | No scope read, no RPC | `404 campaign_not_found` |
| Progress, missing or other-program campaign | Valid UUID with no row in `staff.programId` | No RPC | `404 campaign_not_found` |
| Progress, Assistant with no active preacher | No `assigned_preacher_id` | Scope resolved before the RPC | `403 campaign_scope_missing` |
| Progress, campaign removed between reads | RPC raises `P0002` | No payload | `404 campaign_not_found` |
| Progress, any other RPC failure | Unrecognised SQLSTATE or message | No payload | `500 campaign_progress_read_failed` |
| Progress, unreadable payload | A count missing or not an integer | No DTO | `500 campaign_progress_read_failed` (service parse) |
| Progress, fresh campaign | No assignment in scope | `200`, `summary` all eight zeroes, three empty arrays | — |
| Progress, any other method | `POST`, `PATCH`, `DELETE` | `405` | — |

## Human Decisions

1. **The envelope is `{ progress }`, not a bare DTO.** The packet names it, and it matches the sibling routes' named objects (`{ campaign }`, `{ questions }`, `{ callers }`). The DTO inside is the service's own shape, unrenamed, so the Overview reads one contract and not a route-specific copy.
2. **The owner row is a real `200` on a fourth disposable campaign.** `getCampaignProgress` resolves the campaign through `getCampaign` before the RPC, so an absent id is `404` and would prove only that the gate admits the Admin before the lookup — which every `kind: "admin"` row already shares. A campaign with no assignments answers a measured zero, so a `200` row costs a fixture row and proves the route reaches `campaign_progress`.
3. **The zeroed funnel is the payload contract.** A fresh campaign is the only state this file can own without writing an assignment, and there every count's true answer is `0`. The test pins all eight summary keys and the presence of the three arrays, which is the half of the DTO that a route could silently wrap, drop or rename.
4. **A Preacher row pins `programScope: false`.** The counts cannot distinguish an Admin's read from a Preacher's on an empty campaign — both are zeros — so the payload's own `programScope` is the one visible evidence that `getStaffContext()`'s role reached `campaignScope` and travelled as an RPC argument. A route that dropped the scope would still pass the Admin row; it fails this one.
5. **The `405` test is how "no other method" is proven.** Next answers `405` for a method a route file does not export, so `POST` on this path is a contract assertion rather than an invented endpoint. The caller `[callerId]` row uses the same shape for its missing `DELETE`.
6. **The absent-campaign `404` is the progress route's own row, not the `[campaignId]` row's.** They read the same program-scoped lookup, but this one proves the refusal survives the progress handler's own prologue and that no RPC is called with a campaign the caller's programme does not hold.
7. **`scripts/verify-dialer-route-coverage.mjs` needed no change.** It enumerates route files and parses the spec as text, so one new file plus one new `sweepRoute()` call is the whole registration; it now reports `All 15 route(s) covered by denial sweep.`

</frozen-after-approval>

## Code Map

- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/progress/route.ts` — `GET` through `getCampaignProgress`, answering `{ progress }`.
- `lib/dialer/progress.ts` — `getCampaignProgress`, the `CampaignProgress` DTO, the payload parser and the RPC error mapping (read-only here).
- `lib/dialer/scope.ts` — `dialerErrorResponse`, `requireCampaignAdmin`, `campaignScope` (read-only here).
- `lib/dialer/campaigns.ts` — `getCampaign`, the program-scoped campaign 404 (read-only here).
- `lib/authz.ts` — `getStaffContext`, `AuthzError`, `authzErrorResponse` (read-only here).
- `e2e/specs/dialer-route-sweep.spec.ts` — one admin row, a fourth fixture campaign pair, four payload-contract tests.
- `e2e/fixtures/dialer-campaign.ts` — reused unchanged (`createDisposableCampaign` / `deleteDisposableCampaign`).
- `scripts/verify-dialer-route-coverage.mjs` — read-only here; it needed no change (`All 15 route(s) covered`).
- `_bmad-output/specs/spec-autodialer/stories/1-9-campaign-overview-api.md` — this record.

## Tasks & Acceptance

**Execution:**
- [x] `.../campaigns/[campaignId]/progress/route.ts` — `GET` progress, staff context first, service result returned verbatim, `dialerErrorResponse` on every throw.
- [x] `e2e/specs/dialer-route-sweep.spec.ts` — one `kind: "admin"` row against a fourth disposable campaign with a `[200]` owner case, the fourth fixture pair, four payload contracts.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-9-campaign-overview-api.md` — this record.

**Acceptance Criteria:**
- Given an Admin and a campaign in their program, when they `GET` the progress, then the answer is `200 { progress }` with `programScope: true` and the eight-count summary.
- Given a Preacher, then the same route answers `200` with `programScope: false` — the scope is never widened to the programme.
- Given a campaign with no assignments in scope, then every summary count is `0` and `outcomes`, `callers` and `recent` are empty arrays.
- Given a valid UUID naming no campaign in the program, then the route answers `404 campaign_not_found` and calls no RPC.
- Given a Volunteer, then the route answers `403 forbidden` before any read.
- Given no session, then the route answers `401 unauthenticated`.
- Given any method other than `GET`, then the route answers `405`.
- Given `pnpm guardrails`, then it sees a sweep row for the new route file and prints `All 15 route(s) covered by denial sweep.`
- Given `pnpm test:e2e dialer-route`, then 88 tests run (4 role setups + 84 spec tests) and all pass.

## Implementation Notes

### Route table

| Method | Path | Gate | Success | Refusals |
|---|---|---|---|---|
| `GET` | `/api/dialer/admin/campaigns/[campaignId]/progress` | `getStaffContext()` → `getCampaignProgress`' `requireCampaignAdmin` (AD-2), then the campaign id's UUID shape, then `campaignScope` (AD-3), then `getCampaign` (404), then the `campaign_progress` RPC | `200 { progress }` — `campaignId`, `programId`, `programScope`, the eight-count `summary`, `outcomes[]`, `callers[]`, `recent[]` | `401 unauthenticated`; `403 forbidden`; `403 campaign_scope_missing`; `404 campaign_not_found`; `500 campaign_read_failed` / `dialer_roster_read_failed` / `dialer_roster_truncated` / `campaign_progress_read_failed` |

The file exports no other method; Next answers `405` for `POST`, `PATCH` and `DELETE`. `getStaffContext()` is the first statement, so an unauthenticated request is `401` before the campaign id is read.

### Sweep row

| Method | `route:` (guardrail) | `url:` (request) | Owner statuses | Why that status |
|---|---|---|---|---|
| `GET` | `/api/dialer/admin/campaigns/[campaignId]/progress` | `/api/dialer/admin/campaigns/<fixture id>/progress` | `[200]` | the campaign exists, so the service resolves it and the function answers an all-zero summary for a campaign with no assignments — the row proves the route reaches the RPC, not just the gate |

The campaign is created in a fourth `beforeAll`/`afterAll` pair via `createDisposableCampaign(adminRequest, "campaign progress")` and removed with `deleteDisposableCampaign`. Nothing is assigned into it, so the delete cannot be blocked by `dialer_assignments.campaign_id`'s `ON DELETE RESTRICT`.

### Payload contracts beside the rows

| Test | Asserts |
|---|---|
| `Campaign progress envelope › is { progress } with a zeroed funnel for a campaign nothing is assigned into` | the envelope is `{ progress }`; `campaignId` is the requested id; `programScope` is `true` for an Admin; all eight summary counts are `0`; the five funnel keys survive the route; `outcomes`, `callers` and `recent` are arrays, empty |
| `Campaign progress: the scope the function is called with › answers programScope false for a Preacher, never the programme` | the signed-in role reaches `campaignScope`: a Preacher's read is `200` with `programScope: false` |
| `Campaign progress: a read-only route › has no POST handler` | the file exports `GET` only — Next answers `405` |
| `Campaign progress: a campaign that is not in the program › is a 404 campaign_not_found naming no counts` | an absent UUID is refused by the program-scoped campaign read before any RPC, with the named code and no payload counts |

### What this layer does not prove

- **Every non-zero funnel state is unasserted.** `assigned`, `attempted`, `reached`, `confirmed` and `neverAttempted` are all `0` in the only state this file can create, because an assignment row's `campaign_id` is `ON DELETE RESTRICT` and would block the fixture's cleanup. The definitions themselves — assignment-grain funnel against log-grain rollup, and the queued-disposition exclusion — are the UI layer's `campaign-overview` spec, which can own its fixture and delete in dependency order.
- **A Preacher's *counts* are unasserted.** The Preacher row pins `programScope: false`, which is the argument the function receives; it cannot show that the predicate excluded another preacher's contacts, because both roles read zeros on an empty campaign. Proving it needs assignments whose contacts carry different `assigned_preacher_id` values.
- **The state-bearing refusals are unasserted.** `403 campaign_scope_missing` needs an Assistant with no `assigned_preacher_id` (a seeded-user mutation this file may not make), and `500 campaign_progress_read_failed` needs a database fault the sweep cannot inject. The route forwards the staff context and returns the service's error unchanged; those branches are proven by reading `lib/dialer/progress.ts`, not by this gate.
- **`pnpm test:e2e campaign-overview` matches no tests.** The spec is the UI layer's; the packet's filter is `dialer-route`, which is what this layer ran.
- **The screen is not built here.** The five stat cards, the campaign table, the phone and dark parity, the no-campaign empty state (UX-DR24) and the queued-work notice are the ui and chrome layers' work. This layer supplies the numbers and the refusal states; it renders nothing.

## Spec Change Log

None.

## Review Triage Log

None.

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e dialer-route` (the packet's VERIFICATION command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `[verify-dialer-route-coverage] All 15 route(s) covered by denial sweep.` and `Monorepo guardrails passed.`, with the same four pre-existing type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm test:e2e dialer-route` — **PASS**, exit 0. `88 passed (36.9s)` — the four role setup projects plus eighty-four spec tests. Run three times as the contract set grew: `87 passed` on the first two runs (three sweep cases and three payload tests), `88 passed` on the final run after the absent-campaign contract was added.
- `pnpm test:e2e:list dialer-route` — `Total: 88 tests in 5 files`, confirming the filter's scope before the run.

**Spec tests added (4):**
- `Campaign progress envelope › is { progress } with a zeroed funnel for a campaign nothing is assigned into`
- `Campaign progress: the scope the function is called with › answers programScope false for a Preacher, never the programme`
- `Campaign progress: a read-only route › has no POST handler`
- `Campaign progress: a campaign that is not in the program › is a 404 campaign_not_found naming no counts`

**Sweep rows added (1 row, 3 cases):**
- `Denial sweep: GET /api/dialer/admin/campaigns/[campaignId]/progress — {unauthenticated, non-owner (volunteer), owner (admin)}`

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `dialer-route`, and the full suite belongs to the join layer.
- `pnpm test:e2e:determinism` was not run: only one runner may be active, and this file creates and removes one more campaign per run and writes nothing else.

**Post-run state:** `public.dialer_campaigns` holds zero rows after the runs (`SELECT count(*) … WHERE name LIKE 'e2e-dialer-fixture-%'` → `0`), so all four fixture campaigns were removed in `afterAll`. No assignment, caller or contact row was created or changed.

**Scope note:** this story record sits at
`_bmad-output/specs/spec-autodialer/stories/1-9-campaign-overview-api.md`, which the api layer's
entry in `.hedgehog/core.yaml` does not list (the schema layer's does). `hedgehog verify`
needs the path granted before it runs:

```bash
hedgehog override add STORY-1-9-CAMPAIGN-OVERVIEW-API \
  --scope '_bmad-output/specs/spec-autodialer/stories/**' \
  --reason 'api layer records its story beside the code, as every prior layer did'
```

The packet's FIRST ARRIVAL block lists `apps/folk/app/api/dialer`, `e2e/auth` and `e2e/fixtures`
as absent; all three were already present, so no package shell was created and nothing outside
the packet's ALLOWED SCOPE was written.
