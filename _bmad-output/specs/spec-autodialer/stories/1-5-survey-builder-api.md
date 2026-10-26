---
title: 'Survey builder API routes'
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

**Problem:** `lib/dialer/surveys.ts` can list, create, edit, order, retire and delete a campaign's survey, but nothing in the app reaches it. Without HTTP routes the builder would import a `server-only` module into a client graph and re-invent the admin gate, the `includeRetired` switch, the option-set body shape and the retire/delete distinction on every surface. The denial sweep also has no row shape for a route nested two dynamic segments deep under a route that already exists.

**Approach:** Four route files under `/api/dialer/admin/campaigns/[campaignId]/questions` as thin delegates over the service: `GET`/`POST` on the collection, `PATCH`/`DELETE` on one question, `POST` on its retire, `POST` on the static `order` segment. Every handler is `force-dynamic`, resolves `getStaffContext()` before the body, reads the body through the shared `readJsonBody` (`400 invalid_body`, never a 500), and funnels every throw through `dialerErrorResponse`. The sweep gains six rows, and its owner case resolves `url` lazily against a campaign created for the file, because the service resolves the campaign before it validates anything.

## Boundaries & Constraints

**Always:**
- Every handler declares `export const dynamic = "force-dynamic"`, calls `await getStaffContext()` first, and returns `dialerErrorResponse(error)` from its catch.
- The gate is the service's own `requireCampaignAdmin` (AD-2), reached through the six operations. The routes add no role logic of their own.
- `GET` the collection answers `200 { questions }`, with `includeRetired=true` forwarded from the query string; `POST` answers `201 { question }`; `PATCH` answers `200 { question }`; `POST /retire` answers `200 { question }`; `POST /order` answers `200 { questions }`; `DELETE` answers `204` with no body.
- Next 16's dynamic `params` is a Promise: `const { campaignId, questionId } = await context.params`.
- Every route file has a sweep row whose `route:` is exactly the guardrail's directory-derived path, brackets included. `[questionId]` carries two rows (`PATCH`, `DELETE`).
- A body that is not a JSON object is `400 invalid_body` through `_lib/request-body.ts`, not a route-local parse.

**Never:**
- No create-field, option, order or retire validation in a route. The service owns every named error; the route forwards the fields and lets them surface.
- No `/api/dialer/caller/**` route in this story.
- No status gate on survey edits. `DRAFT`/`ACTIVE` editability is a positive rule from AD-12, and no text says what `COMPLETED`/`CANCELLED` must do — the routes do not invent it.
- The sweep never creates a question. A question would make the fixture campaign's cleanup `DELETE` fail (`dialer_survey_questions.campaign_id` is `ON DELETE RESTRICT`), and no sweep row needs one.
- Do not fork `sweepRoute`. One helper, two shapes (`kind: "caller"` / `kind: "admin"`).
- Do not edit `lib/**`, `components/**`, `apps/folk/app/campaigns/**`, `public/sw.js`, the proxies or the migrations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List as an admin | Admin session, campaign in the program | `200 { questions: [...] }`, live questions only | — |
| List with history | `?includeRetired=true` | Retired rows included | — |
| List as a Volunteer | Volunteer session | No read issued | `403 forbidden`, JSON body |
| List with no session | No cookie | No staff context resolved | `401` |
| List an absent campaign | Valid UUID with no row | No survey read issued | `404 campaign_not_found` |
| Create, valid body | `{ questionTitle, questionType, isRequired?, options? }` | `201 { question }`, service rules applied | — |
| Create, `{}` | Empty object | No insert | `400 invalid_question_title` |
| Create, choice with zero options | `questionType: "DROPDOWN"`, no `options` | No insert | `400 options_required` |
| Create, explicit empty options | `options: []` on `RADIO`/`MULTI_SELECT` | No insert | `400 options_required` |
| Create, options on `TEXT` | `options: [{ label }]` | No insert | `400 options_not_allowed` |
| Create, prototype-key type | `questionType: "constructor"` | No insert | `400 invalid_question_type` |
| Create, malformed JSON | `{not json`, `[]`, `null` | No parse result reaches the service | `400 invalid_body` |
| Create as a Volunteer | Valid body | Refused before the body or the campaign is read | `403 forbidden` |
| Update one | `{ questionTitle? , questionType?, isRequired?, options? }` | `200 { question }` | `400`/`409` codes from the service |
| Update an absent question | Valid UUID with no row | Nothing written | `404 question_not_found` |
| Update a retired question | `retired_at` set | Nothing written | `409 question_retired` |
| Delete a question with no responses | Valid id, `responseCount = 0` | `204`, no body | — |
| Delete a question with responses | `responseCount > 0` | No delete | `409 question_has_responses` |
| Delete an absent question | Valid UUID with no row | Nothing deleted | `404 question_not_found` |
| Retire a question | Valid id | `200 { question }`, `retiredAt` set; row and answers kept | — |
| Retire an already-retired question | `retired_at` set | `200 { question }`, no write | — |
| Reorder, full live set | `{ orderedIds: [...] }`, every live id once | `200 { questions }` in the new order | — |
| Reorder, missing/extra/duplicate id | Subset, unknown id, repeat | No write | `400 invalid_question_order` |
| Reorder, `{}` | No `orderedIds` | No write | `400 invalid_question_order` |
| Any route as a Volunteer | Volunteer session | Refused before the body or the id is read | `403 forbidden`, JSON body |

## Human Decisions

1. **The six owner rows need a real campaign, so the sweep owns a fixture campaign.** `lib/dialer/surveys.ts` resolves the campaign with `getCampaign` before every validation, so an absent campaign id makes `GET`/`POST`/`order` answer `404 campaign_not_found` — never `200` or `400`. Pinning `404` on those three rows would only re-prove that the gate admits an Admin, which all six rows already share. The file therefore creates one DRAFT campaign in `beforeAll` through the admin route and removes it in `afterAll`; no question is ever created.
2. **`url` accepts a resolver.** The campaign id exists only after `beforeAll`, while `sweepRoute` builds its request path at module load. `url` now takes `string | (() => string)`, and the request path is resolved per request. The guardrail only parses `route:`, so its contract is unchanged and no assertion was weakened.
3. **The fixture campaign is removed through the local SQL endpoint.** `service_role` holds SELECT/INSERT/UPDATE on `dialer_campaigns` and no DELETE (AD-12 grants no delete), so PostgREST cannot remove the row. The cleanup reuses `campaign-campaigns.spec.ts`'s pattern: service-role credentials read from the app env file, the target asserted loopback, the id UUID-checked before interpolation.
4. **The `POST` owner case is `{}` → `400`, not a created question.** It proves the gate admits an Admin and the service's own title refusal, and the shared database is untouched. A created question would also block the fixture campaign's `ON DELETE RESTRICT` cleanup.
5. **`DELETE` answers `204` with no body.** The route has nothing to return, and the builder reads the refusal (`409 question_has_responses`) as the signal to offer Retire (UX-DR13).
6. **`order` is a static segment, and the sibling `[questionId]` cannot shadow it.** The App Router ranks a static segment above a dynamic one, and `[questionId]/route.ts` exports only `PATCH` and `DELETE`, so no method collision exists either way.
7. **The payload contracts sit beside the rows, not inside them.** The zero-option refusal, the options-on-`TEXT` refusal, the prototype-key type refusal and the list envelope are one route family's contract, not the three-case population gate; `sweepRoute` stays one helper with two shapes.

</frozen-after-approval>

## Code Map

- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/questions/route.ts` — `GET` list (with `includeRetired`), `POST` create.
- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/questions/[questionId]/route.ts` — `PATCH` update, `DELETE` 204.
- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/questions/[questionId]/retire/route.ts` — `POST` retire.
- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/questions/order/route.ts` — `POST` reorder.
- `apps/folk/app/api/dialer/_lib/request-body.ts` — the JSON-object body reader, reused unchanged.
- `e2e/specs/dialer-route-sweep.spec.ts` — six new admin rows, the lazy `url` resolver, the file's fixture campaign, and the survey payload contracts.
- `e2e/fixtures/dialer-campaign.ts` — `createDisposableCampaign`, `deleteDisposableCampaign`.
- `scripts/verify-dialer-route-coverage.mjs` — read-only here; it needed no change (`All 7 route(s) covered`).
- `lib/dialer/surveys.ts` — `listCampaignQuestions`, `createQuestion`, `updateQuestion`, `reorderQuestions`, `retireQuestion`, `deleteQuestion` (read-only here).
- `lib/dialer/scope.ts` — `dialerErrorResponse` (read-only here).
- `lib/authz.ts` — `getStaffContext`, `AuthzError`, `authzErrorResponse` (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `.../questions/route.ts` — list and create.
- [x] `.../questions/[questionId]/route.ts` — update and delete.
- [x] `.../questions/[questionId]/retire/route.ts` — retire.
- [x] `.../questions/order/route.ts` — reorder.
- [x] `e2e/fixtures/dialer-campaign.ts` — the disposable campaign the owner rows read.
- [x] `e2e/specs/dialer-route-sweep.spec.ts` — six rows, lazy `url`, payload contracts.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-5-survey-builder-api.md` — this record.

**Acceptance Criteria:**
- Given an Admin, when they `GET /api/dialer/admin/campaigns/[campaignId]/questions`, then the answer is `200 { questions }` for that campaign, live rows only unless `includeRetired=true`.
- Given a Volunteer, when they call any of the four route files, then the answer is `403` with a JSON `code` before any read or write.
- Given no session, when any route is called, then the answer is `401` regardless of the body or the ids.
- Given a choice question with no options, when it is posted, then the answer is `400 options_required` and nothing is written.
- Given `{ questionType: "constructor" }`, then the answer is `400 invalid_question_type`, never a 500.
- Given `POST .../questions/order` with `{}`, then the answer is `400 invalid_question_order`.
- Given an absent question id under a real campaign, when it is patched, deleted or retired, then the answer is `404 question_not_found`.
- Given `pnpm test:e2e dialer-route`, then 44 tests run (4 role setups + 40 spec tests) and all pass.

## Implementation Notes

### Route table

| Method | Path | Gate | Success | Refusals |
|---|---|---|---|---|
| `GET` | `/api/dialer/admin/campaigns/[campaignId]/questions` | `getStaffContext()` → `requireCampaignAdmin` inside `listCampaignQuestions` | `200 { questions }` | `401`; `403 forbidden`; `404 campaign_not_found`; `500 question_read_failed` / `option_read_failed` / `response_count_*` / `survey_list_truncated` |
| `POST` | `.../questions` | same, inside `createQuestion` | `201 { question }` | `401`; `403`; `400 invalid_body`; `400 invalid_question_title` / `invalid_question_type` / `invalid_is_required` / `invalid_options` / `invalid_option_*` / `options_required` / `options_not_allowed` / `duplicate_option_*`; `404 campaign_not_found`; `500 question_write_*` |
| `PATCH` | `.../questions/[questionId]` | same, inside `updateQuestion` | `200 { question }` | `401`; `403`; `400 invalid_body` + the create set; `404 campaign_not_found` / `question_not_found`; `409 question_retired` / `question_type_locked` / `option_value_locked`; `500 question_write_failed` / `option_write_failed` |
| `DELETE` | `.../questions/[questionId]` | same, inside `deleteQuestion` | `204` no body | `401`; `403`; `404 campaign_not_found` / `question_not_found`; `409 question_has_responses`; `500 question_write_failed` / `question_reorder_failed` |
| `POST` | `.../questions/[questionId]/retire` | same, inside `retireQuestion` | `200 { question }` with `retiredAt` | `401`; `403`; `404 campaign_not_found` / `question_not_found`; `500 question_write_failed` |
| `POST` | `.../questions/order` | same, inside `reorderQuestions` | `200 { questions }` | `401`; `403`; `400 invalid_body` / `invalid_question_order`; `404 campaign_not_found`; `500 question_reorder_failed` |

There is no `/api/dialer/caller/**` route in this story.

### Sweep rows

| Method | `route:` (guardrail) | `url:` (request) | Owner statuses | Why that status |
|---|---|---|---|---|
| `GET` | `.../[campaignId]/questions` | fixture campaign `/questions` | `[200]` | the list envelope for a campaign with no questions |
| `POST` | `.../[campaignId]/questions` | fixture campaign `/questions`, body `{}` | `[400]` | `invalid_question_title`; the gate admits the owner and nothing is written |
| `PATCH` | `.../[campaignId]/questions/[questionId]` | fixture campaign + absent question, `{ questionTitle: "x" }` | `[404]` | `question_not_found` under a campaign that exists |
| `DELETE` | `.../[campaignId]/questions/[questionId]` | fixture campaign + absent question | `[404]` | `question_not_found` |
| `POST` | `.../[campaignId]/questions/[questionId]/retire` | fixture campaign + absent question | `[404]` | `question_not_found` |
| `POST` | `.../[campaignId]/questions/order` | fixture campaign `/order`, body `{}` | `[400]` | `invalid_question_order`; no write |

The fixture campaign is created once per file and deleted in `afterAll`. Post-run counts are `dialer_campaigns = 0`, `dialer_survey_questions = 0`, `dialer_survey_options = 0`.

### The `DELETE` grant defect (outside this layer's scope)

`supabase/migrations/20261025000000_create_dialer_tables.sql` revokes `ALL` on `dialer_survey_questions` and `dialer_survey_options` from `service_role` and grants back only `SELECT, INSERT, UPDATE`. The service-role client bypasses RLS but not table privileges, so:

- `deleteQuestion` on a real zero-response question ends in `500 question_write_failed` (`42501`), not `204`. Observed by a one-off probe against the local dev server.
- `updateQuestion` that removes an option ends in `500 option_write_failed`.
- `rollbackQuestionInsert` cannot roll back a failed option insert, so that path reports `500 question_write_rollback_failed` with the leftover question id.

The routes are correct as thin delegates; the fix is a migration grant (or a SECURITY DEFINER function), which `supabase/migrations/**` owns. Recorded as debt, not worked around here.

### What this layer does not prove

- **Create, update and retire success are unproven by the gate.** No test creates a question: the sweep's `POST` is a `400` refusal, and a created question would block the fixture campaign's `ON DELETE RESTRICT` cleanup. The `201 { question }`, `PATCH 200`, `retire 200` and reorder success paths are proven by code reading and by the one-off probe below, not by an automated assertion. The UI layer's `campaign-survey` spec is the natural owner; it can clean up through `/pg/query`.
- **`DELETE 204` is currently unreachable** for a real question — see the grant defect above. The automated row only proves the `404` arm.
- **Campaign status is not consulted.** Survey edits are allowed on a `COMPLETED` or `CANCELLED` campaign because no rule says otherwise (inherited from the server layer's Decision 9). If the UI must refuse the builder for a terminal campaign, that gate does not exist server-side yet.
- **`pnpm test:e2e campaign-survey` matches no tests.** The story's test-scope line names a spec the UI layer has not written; the packet's own filter is `dialer-route`, which is what this layer ran.
- `pnpm test:e2e:determinism` was not run. The repository defers it to Story 4.2; this spec creates and removes one campaign per run and depends on no other spec's leftovers.

## Spec Change Log

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e dialer-route` (the packet's VERIFICATION command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `[verify-dialer-route-coverage] All 7 route(s) covered by denial sweep.` and `Monorepo guardrails passed.`, with the same four pre-existing type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`. `apps/folk/.next/dev/types/validator.ts` names all four new routes as `RouteHandlerConfig<"...">`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm test:e2e:list dialer-route` was not needed: the run itself reported its scope.
- `pnpm test:e2e dialer-route` — **PASS**, exit 0. `44 passed (26.7s)` — the four role setup projects plus forty spec tests.

**One-off manual probe (not part of the gate):** the local dev server was booted on `127.0.0.1:3000`, the seeded Admin `storageState` cookie was replayed, and the server was stopped afterwards. Observed: `POST /api/dialer/admin/campaigns` → `201`; `POST .../questions` with `{ questionTitle: "Notes", questionType: "TEXT" }` → `201` with the question DTO; `POST .../questions/<id>/retire` → `200` with `retiredAt` set; `DELETE .../questions/<id>` → **`500 {"error":"Unable to delete the question.","code":"question_write_failed"}`** — the grant defect above. The campaign and its question were then removed through the local SQL endpoint, and the three tables were confirmed back at zero rows.

**Spec tests added:**
- `Denial sweep: GET /api/dialer/admin/campaigns/[campaignId]/questions — {unauthenticated, non-owner (volunteer), owner (admin)}`
- `Denial sweep: POST /api/dialer/admin/campaigns/[campaignId]/questions — {…}`
- `Denial sweep: PATCH /api/dialer/admin/campaigns/[campaignId]/questions/[questionId] — {…}`
- `Denial sweep: DELETE /api/dialer/admin/campaigns/[campaignId]/questions/[questionId] — {…}`
- `Denial sweep: POST /api/dialer/admin/campaigns/[campaignId]/questions/[questionId]/retire — {…}`
- `Denial sweep: POST /api/dialer/admin/campaigns/[campaignId]/questions/order — {…}`
- `Campaign survey list envelope › is `{ questions }` for a campaign with none, with and without retired rows`
- `Campaign survey create: the option rule › is a 400 options_required for a choice question with no options`
- `Campaign survey create: the option rule › is a 400 options_required for an explicitly empty options list`
- `Campaign survey create: the option rule › is a 400 options_not_allowed for options on a TEXT question`
- `Campaign survey create: the option rule › is a 400 invalid_question_type for an Object.prototype key`

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `dialer-route`, and the full suite belongs to the join layer.
- `pnpm test:e2e campaign-survey` was not run: it selects no tests (see above).
- `pnpm test:e2e:determinism` was not run — see "What this layer does not prove".

**Post-run state:** `dialer_campaigns`, `dialer_survey_questions` and `dialer_survey_options` hold zero rows after both the gated run and the manual probe.

**Scope note:** this story record sits at
`_bmad-output/specs/spec-autodialer/stories/1-5-survey-builder-api.md`,
which the packet's ALLOWED SCOPE does not list (the schema and server layers both list it;
the api layer's entry in `.hedgehog/core.yaml` omits it). `hedgehog verify` therefore needs
the path granted before it runs:

```bash
hedgehog override add STORY-1-5-SURVEY-BUILDER-API \
  --scope '_bmad-output/specs/spec-autodialer/stories/**' \
  --reason 'api layer records its story beside the code, as every prior layer did'
```
