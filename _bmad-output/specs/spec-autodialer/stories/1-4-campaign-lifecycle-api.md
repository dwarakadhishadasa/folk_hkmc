---
title: 'Campaign lifecycle API routes'
type: 'feature'
created: '2026-10-26'
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

**Problem:** `lib/dialer/campaigns.ts` can list, read, create and transition a campaign, but nothing in the app reaches it. Without HTTP routes the UI layer would have to import the server-only module into a client graph, and each surface would re-invent the admin gate, the `DRAFT` default and the body contract. The denial sweep also modelled only the caller boundary, so an admin route had no row shape to register under.

**Approach:** Three route files under `/api/dialer/admin/campaigns` as thin delegates over the service: `GET`/`POST` on the collection, `GET` on one campaign, `POST` on its transition. Every handler is `force-dynamic`, resolves `getStaffContext()` before touching the body, and funnels every throw through `dialerErrorResponse`. The one route-owned rule is the body: malformed or non-object JSON is `400 invalid_body`, never a 500. The denial sweep gains a discriminated `kind` — the caller shape asserts a body-less 404, the admin shape asserts a JSON 403 and an owner status the row pins — and a separate `url` so a dynamic route's guardrail string and its real request path can differ.

## Boundaries & Constraints

**Always:**
- Every handler declares `export const dynamic = "force-dynamic"`, calls `await getStaffContext()` first, and returns `dialerErrorResponse(error)` from its catch. `getStaffContext()` before the body read is what makes an unauthenticated malformed request a 401, not a 400.
- The gate is the service's own `requireCampaignAdmin` (AD-2) reached through `listCampaigns` / `getCampaign` / `createCampaign` / `transitionCampaign`. The route adds no role logic of its own.
- `GET` the collection answers `200 { campaigns }`; `POST` answers `201 { campaign }`; `GET` one answers `200 { campaign }`; `POST` a transition answers `200 { campaign }`.
- A body that is not a JSON object — unparseable text, `null`, an array — is `400 invalid_body` with the repo's `{ error, code }` shape.
- Next 16's dynamic `params` is a Promise: `const { campaignId } = await context.params`.
- The sweep keeps the name `sweepRoute` (the guardrail parses that identifier), defaults `kind` to `"caller"` and `ownerStatuses` to `[200, 201, 202, 204]`, and takes `url` as a request path that defaults to `route`.
- Every route file has a sweep row whose `route:` is exactly the guardrail's directory-derived path, `[campaignId]` brackets included.

**Never:**
- No `/api/dialer/caller/**` route in this story. The caller boundary has no endpoint until the queue story.
- No create-field validation in the route. The service owns every named validation error; the route forwards the fields and lets them surface.
- No second action validation in the transition route. `invalid_campaign_action` is the service's error and is mapped, not re-implemented.
- The sweep never creates a campaign. The POST owner case sends `{}` and accepts `400` — a created row would change every later run's campaign counts.
- Do not fork `sweepRoute` for admin routes. One helper, two shapes.
- Do not edit `lib/**`, `components/**`, `apps/folk/app/campaigns/**`, `public/sw.js` or the proxies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List as an admin | Admin session, any number of rows | `200 { campaigns: [...] }`, every status | — |
| List as a Volunteer | Volunteer session | No read issued | `403 forbidden`, JSON body |
| List with no session | No cookie | No staff context resolved | `401` |
| Create, valid body | `{ name, campaignDate }`, optional description/time/gap/attempts | `201 { campaign }`, `status: "DRAFT"`, service defaults applied | — |
| Create, `{}` | Empty object | No insert | `400 invalid_name` |
| Create, malformed JSON | `{not json` | No parse result reaches the service | `400 invalid_body` |
| Create, JSON array or `null` | `[]`, `null` | No insert | `400 invalid_body` |
| Create as a Volunteer | Valid body | Refused before validation | `403 forbidden` |
| Read one | `campaignId` in the caller's program | `200 { campaign }` | — |
| Read one, absent id | Valid UUID with no row | Nothing returned | `404 campaign_not_found` |
| Read one, malformed id | `"abc"` | No query issued | `404 campaign_not_found` |
| Transition, `start` on a `DRAFT` | `{ action: "start" }` | `200 { campaign }`, `status: "ACTIVE"` | — |
| Transition, stale status | `{ action: "complete" }` on `DRAFT` | No write | `409 campaign_status_conflict` |
| Transition, absent campaign | Valid UUID with no row | Nothing returned | `404 campaign_not_found` |
| Transition, unknown action | `{ action: "pause" }` | No write | `400 invalid_campaign_action` |
| Transition, non-object body | `"start"`, `[]` | No write | `400 invalid_body` |
| Any route as a Volunteer | Volunteer session | Refused before the body or the id is read | `403 forbidden`, JSON body |

## Human Decisions

1. **The sweep grows a shape, it does not fork.** AD-8 names one sweep, and the guardrail parses `sweepRoute(` as text. A second helper (`sweepAdminRoute`) would pass the parse only if every route also carried a caller row it does not have. `kind` selects the non-owner default (`volunteer`), the refusal assertion (403 with JSON, not a body-less 404) and which statuses count as the owner succeeding.
2. **`route` and `url` are separate options.** The guardrail derives `/api/dialer/admin/campaigns/[campaignId]` from the directory name and will never understand a concrete id; Next treats the literal bracket string as a real `[campaignId]` value and answers the service's own 404, which proves nothing about the gate. `route` stays the bracketed path for the parse, `url` carries the absent-but-valid UUID the request actually needs.
3. **The POST create owner case is a `400`, not a `201`.** The owner case exists to prove the gate admits an Admin, not that a campaign can be written. `{}` fails the service's name check before any insert, so the assertion is real and the database is untouched; a `201` row would pollute every later run's campaign counts, and the sweep has no delete path (AD-12 grants no `DELETE`).
4. **A missing campaign is a `404` for the admin too.** AD-7 keeps the 403/404 distinction on the admin surface, so the two dynamic rows pin `ownerStatuses: [404]`. A 403 on that row would mean `requireCampaignAdmin` refused an Admin — the failure the row is there to catch.
5. **The body helper sits under the route tree.** `lib/**` belongs to the server layer, and this layer's scope is `apps/folk/app/api/dialer/**`. `_lib/request-body.ts` is a private App Router folder (never a route file, so the coverage guardrail ignores it) and is the one place the 400-not-500 rule lives.
6. **The body-contract assertions live in the sweep spec.** This layer owns no other route-level test surface, and `pnpm test:e2e dialer-route` is its verify filter. The envelope and action-mapping tests are declared beside the sweep rows, not inside `sweepRoute`, because they assert one route's payload rather than the three-case denial shape.

</frozen-after-approval>

## Code Map

- `apps/folk/app/api/dialer/admin/campaigns/route.ts` — `GET` list, `POST` create.
- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/route.ts` — `GET` one campaign.
- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/transition/route.ts` — `POST` one lifecycle action.
- `apps/folk/app/api/dialer/_lib/request-body.ts` — the JSON-object body reader; `400 invalid_body` on anything else.
- `e2e/specs/dialer-route-sweep.spec.ts` — the two-shape denial sweep, four admin rows, the payload contracts, and the guardrail's own probe.
- `scripts/verify-dialer-route-coverage.mjs` — the static check that every route file has a row (read-only here; it needed no change).
- `lib/dialer/campaigns.ts` — `listCampaigns`, `getCampaign`, `createCampaign`, `transitionCampaign` (read-only here).
- `lib/dialer/scope.ts` — `dialerErrorResponse`, which preserves every `AuthzError` status and code and strips the body from a caller not-found (read-only here).
- `lib/authz.ts` — `getStaffContext`, `AuthzError`, `authzErrorResponse` (read-only here).
- `e2e/fixtures/roles.ts` — `storageStatePath` and `E2ERole`, the sweep's per-role sessions (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `apps/folk/app/api/dialer/_lib/request-body.ts` — the body reader and its `invalid_body` error.
- [x] `apps/folk/app/api/dialer/admin/campaigns/route.ts` — list and create.
- [x] `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/route.ts` — read one.
- [x] `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/transition/route.ts` — start, complete, cancel.
- [x] `e2e/specs/dialer-route-sweep.spec.ts` — `kind`/`ownerStatuses`/`url`, four admin rows, payload contracts, updated header.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-4-campaign-lifecycle-api.md` — this record.

**Acceptance Criteria:**
- Given an Admin, when they `GET /api/dialer/admin/campaigns`, then the answer is `200 { campaigns }` for their program.
- Given a Volunteer, when they call any of the three routes, then the answer is `403` with a JSON `code` before any read or write.
- Given no session, when any route is called, then the answer is `401` regardless of the body or the id.
- Given a malformed or non-object body to `POST /api/dialer/admin/campaigns`, then the answer is `400 invalid_body`, not a 500.
- Given `POST /api/dialer/admin/campaigns` with a valid body, then the answer is `201 { campaign }` in `DRAFT`.
- Given `POST .../[campaignId]/transition` with `{ action: "pause" }`, then the answer is `400 invalid_campaign_action`.
- Given an absent campaign, when an Admin reads or transitions it, then the answer is `404 campaign_not_found` — the sweep row would fail on a 403.
- Given `pnpm test:e2e dialer-route`, then 21 tests run (4 role setups + 17 spec tests) and all pass.

## Implementation Notes

### Route table

| Method | Path | Gate | Success | Refusals |
|---|---|---|---|---|
| `GET` | `/api/dialer/admin/campaigns` | `getStaffContext()` → `requireCampaignAdmin` inside `listCampaigns` | `200 { campaigns }` | `401` no session; `403 forbidden` Volunteer; `500 campaign_read_failed` / `campaign_list_truncated` |
| `POST` | `/api/dialer/admin/campaigns` | same, inside `createCampaign` | `201 { campaign }`, `status: "DRAFT"` | `401`; `403 forbidden`; `400 invalid_body`; `400 invalid_name` / `invalid_description` / `invalid_campaign_date` / `invalid_campaign_time` / `invalid_gap_duration` / `invalid_max_attempts`; `500 campaign_write_failed` |
| `GET` | `/api/dialer/admin/campaigns/[campaignId]` | same, inside `getCampaign` | `200 { campaign }` | `401`; `403 forbidden`; `404 campaign_not_found` (absent, foreign or malformed id); `500 campaign_read_failed` |
| `POST` | `/api/dialer/admin/campaigns/[campaignId]/transition` | same, inside `transitionCampaign` | `200 { campaign }` | `401`; `403 forbidden`; `400 invalid_body`; `400 invalid_campaign_action`; `404 campaign_not_found`; `409 campaign_status_conflict`; `500 campaign_write_failed` |

There is no `/api/dialer/caller/**` route in this story, and no `DELETE` anywhere.

### The two sweep shapes

| | `kind: "caller"` (default) | `kind: "admin"` |
|---|---|---|
| Non-owner default role | `preacher` | `volunteer` |
| Non-owner assertion | `404`, response body must be `""` | `403`, `application/json`, body carries a string `code` |
| Owner assertion | status in `ownerStatuses` (default `200/201/202/204`) | status in `ownerStatuses` (rows pin it) |
| Why | AD-7: a caller learns nothing about another caller's row | AD-7/AD-2: the admin surface keeps the 403/404 distinction |

Rows registered:

| Method | `route:` (guardrail) | `url:` (request) | Kind | Owner statuses |
|---|---|---|---|---|
| `GET` | `/api/dialer/admin/campaigns` | same as `route` | admin | `[200]` |
| `POST` | `/api/dialer/admin/campaigns` | same as `route`, body `{}` | admin | `[400]` |
| `GET` | `/api/dialer/admin/campaigns/[campaignId]` | `…/campaigns/00000000-0000-4000-8000-000000000000` | admin | `[404]` |
| `POST` | `/api/dialer/admin/campaigns/[campaignId]/transition` | `…/00000000-0000-4000-8000-000000000000/transition`, body `{ action: "start" }` | admin | `[404]` |

The absent UUID is valid in shape and impossible to seed — every campaign row is generated with `gen_random_uuid()` — so `[404]` is stable across runs and across whatever the UI layer creates later.

### Why the POST owner case is a `400`

The three-case shape asks "does the owner succeed". For create, "succeed" would mean a real row, and this suite has no way to remove it: AD-12 grants no `DELETE` to any role, and the seeded database is shared by every spec. A stray campaign would then change counts in the campaign table, the reporting story's funnel and the UI layer's list assertions. `{}` therefore exercises the gate and the service's own validation arm — an Admin reaches `requireCampaignName`, gets `400 invalid_name`, and writes nothing. The row proves the gate admits Admin, which is its job. The `201` path was verified once by hand and deleted; it becomes repeatable when a layer owns a disposable campaign fixture.

### Next 16's async `params`

Both dynamic routes take `context: { params: Promise<{ campaignId: string }> }` and await it. This is checked for real, not just by shape: `pnpm typecheck:workspace` after the e2e run includes Next's generated `apps/folk/.next/dev/types/validator.ts`, which names all three new route handlers and asserts each against `RouteHandlerConfig<"...">`.

### What this layer does not prove

- **Unknown actions that are also `Object.prototype` keys are a 500, not a 400 — observed.** `lib/dialer/campaigns.ts` looks the action up with `CAMPAIGN_TRANSITIONS[action]`, so `{ action: "constructor" }` finds a truthy inherited value, skips the `invalid_campaign_action` guard, and throws a `TypeError` on `transition.from.length`. Against the local dev server the route answered `500 {"error":"Cannot read properties of undefined (reading 'length')"}` for `constructor`, `toString` and `hasOwnProperty` — so the internal TypeError message leaks too. `{ action: "pause" }` is proven to be `400 invalid_campaign_action`; the prototype-key class is not asserted in the sweep, because asserting it would keep this layer red. The fix belongs in the service layer (an own-key check or a `Map`), which this layer's scope excludes — recorded as debt #11, not worked around in the route.
- **The create success path is not exercised by any automated check.** The sweep's owner case is deliberately `400` (see "Why the POST owner case is a 400"), so `201 { campaign }` has no repeatable test. It was proven once by hand — one campaign created through the local dev server with the seeded Admin session, then deleted through the local SQL endpoint — and the row count returned to zero. A repeatable check needs a layer that owns a disposable campaign fixture (debt #10).
- **A populated list and a real read were proven by hand, not by a test.** The same one-off sequence returned `200 { campaigns }` containing the created row and `200 { campaign }` for it, then `ACTIVE` and `COMPLETED` through the transition route, and `409 campaign_status_conflict` for a `cancel` and a `start` against the terminal row. The automated envelope assertion still runs against a program with zero campaigns.
- **Completed/cancelled display, the gap presets, and the form payload shape** belong to the UI layer.
- `pnpm test:e2e:determinism` was not run. It is a two-full-suite gate that the repository defers to the release story (Epic 4, Story 4.2), and the added spec is self-contained: it creates no row, deletes no row, and leaves `dialer_campaigns`, `dialer_callers` and `dialer_assignments` at zero rows (verified after the run).

## Spec Change Log

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `[verify-dialer-route-coverage] All 3 route(s) covered by denial sweep.` and `Monorepo guardrails passed.`, with the same four pre-existing type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm test:e2e:list dialer-route` — **PASS**, exit 0. `Total: 21 tests in 5 files`.
- `pnpm test:e2e dialer-route` — **PASS**, exit 0. `21 passed (51.1s)` — the four role setup projects plus seventeen spec tests.
- `pnpm typecheck:workspace` (re-run after Playwright booted `next dev`, which regenerated `apps/folk/.next/dev/types/validator.ts` with the three new routes) — **PASS**, exit 0.

**One-off manual probe (not part of the gate):** the local dev server was booted on `127.0.0.1:3000`, the seeded Admin `storageState` cookie was replayed against the four routes, and the server was stopped afterwards. Observed: `POST /api/dialer/admin/campaigns` → `201` with `status: "DRAFT"`, `gap_duration: 20`, `max_attempts: 3`; `GET` the list → `200` containing the row; `GET` one → `200`; `start` → `200 ACTIVE`; `complete` → `200 COMPLETED`; `cancel` and `start` on the terminal row → `409 campaign_status_conflict`; `{name: ""}` → `400 invalid_name`; `2026-02-30` → `400 invalid_campaign_date`; gap `4` → `400 invalid_gap_duration`; `{action: "constructor"}` / `"toString"` / `"hasOwnProperty"` → `500` (the service-level defect above). The created row was then deleted through the local SQL endpoint, and the three dialer tables were confirmed back at zero rows.

**Spec tests:**
- `Denial sweep: GET /api/dialer/admin/campaigns — unauthenticated › is refused`
- `Denial sweep: GET /api/dialer/admin/campaigns — non-owner (volunteer) › is refused as a 403 with a JSON error`
- `Denial sweep: GET /api/dialer/admin/campaigns — owner (admin) › is not denied`
- `Denial sweep: POST /api/dialer/admin/campaigns — unauthenticated › is refused`
- `Denial sweep: POST /api/dialer/admin/campaigns — non-owner (volunteer) › is refused as a 403 with a JSON error`
- `Denial sweep: POST /api/dialer/admin/campaigns — owner (admin) › is not denied` (the `{}` → `400` case)
- `Denial sweep: GET /api/dialer/admin/campaigns/[campaignId] — unauthenticated › is refused`
- `Denial sweep: GET /api/dialer/admin/campaigns/[campaignId] — non-owner (volunteer) › is refused as a 403 with a JSON error`
- `Denial sweep: GET /api/dialer/admin/campaigns/[campaignId] — owner (admin) › is not denied` (the absent-row `404`)
- `Denial sweep: POST /api/dialer/admin/campaigns/[campaignId]/transition — unauthenticated › is refused`
- `Denial sweep: POST /api/dialer/admin/campaigns/[campaignId]/transition — non-owner (volunteer) › is refused as a 403 with a JSON error`
- `Denial sweep: POST /api/dialer/admin/campaigns/[campaignId]/transition — owner (admin) › is not denied` (the absent-row `404`)
- `Campaign create body: a body that is not a JSON object › is a 400 invalid_body for unparseable JSON`
- `Campaign create body: a body that is not a JSON object › is a 400 invalid_body for a JSON array`
- ``Campaign list envelope › is `{ campaigns }` even when the program has none``
- `Campaign transition body: an action outside start|complete|cancel › is a 400 invalid_campaign_action, mapped from the service`
- `the route-coverage guardrail itself › a route file with no sweep row fails the guardrail`

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `dialer-route`, and the full suite belongs to the join layer.
- `pnpm test:e2e:determinism` was not run — see "What this layer does not prove".
- `pnpm test:airtable-removal` was not run. It is a known pre-existing failure on this branch and is unrelated to these files.

**Post-run state:** `dialer_campaigns`, `dialer_callers` and `dialer_assignments` hold zero rows; the sweep wrote nothing.

**Scope note:** this story record sits at
`_bmad-output/specs/spec-autodialer/stories/1-4-campaign-lifecycle-api.md`,
which the packet's ALLOWED SCOPE does not list (the schema and server layers
both list it; the api layer's entry in `.hedgehog/core.yaml` omits it).
`hedgehog verify` therefore needs the path granted before it runs:

```bash
hedgehog override add STORY-1-4-CAMPAIGN-LIFECYCLE-API \
  --scope '_bmad-output/specs/spec-autodialer/stories/**' \
  --reason 'api layer records its story beside the code, as every prior layer did'
```
