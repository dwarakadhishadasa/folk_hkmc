---
title: 'Survey builder service layer'
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

**Problem:** `dialer_survey_questions` and `dialer_survey_options` exist, but nothing in the server layer can read, create, edit, order, retire or delete a campaign's survey. Without that service, the survey routes and the builder page would each re-implement the same program filter, the choice/option rules, the retire-not-delete rule, and the response-count read that decides which of Retire and Delete a question offers — and Story 2.3's response table does not exist yet, so the count has to answer honestly before the relation is created.

**Approach:** Add one server-only module, `lib/dialer/surveys.ts`, with six operations: list a campaign's questions with their ordered options and response counts, create a question with its options, update a question and replace its option set, reorder the live questions, retire a question, and delete a question that has no responses. Every operation opens with `requireCampaignAdmin`, resolves the campaign through the campaign service so a missing or foreign campaign keeps its `404 campaign_not_found` shape, filters every read and write by `program_id` and `campaign_id`, and returns camelCase DTOs. No question is seeded, and no route, page or disposition write is added.

## Boundaries & Constraints

**Always:**
- Every operation calls `requireCampaignAdmin(staff)` first, so a Volunteer is refused before any read or write, including for a malformed id.
- The campaign is resolved with `getCampaign(staff, campaignId)` from `lib/dialer/campaigns.ts`, so a malformed id, a missing campaign and another program's campaign are all `404 campaign_not_found` with the existing message. A survey read failure of that campaign stays `500 campaign_read_failed`.
- Every question read and write is filtered by `program_id` and `campaign_id`; every option read and write is filtered by `program_id` and the question id. The service-role client bypasses RLS, so the predicate is the enforcement.
- `listCampaignQuestions` orders by `sort_order`, then `created_at`, then `id`; options are ordered by `sort_order`, then `id`. List reads page through `lib/supabase/paging.ts` (AD-16) and throw rather than return a short list.
- `createQuestion` inserts `sort_order = max(sort_order) + 1` across the whole campaign, including retired rows, so a new question lands at the end of the live order.
- `questionTitle` is trimmed, 1–200 characters. `isRequired` defaults to `true` only when the key is absent; `null` is invalid. `questionType` is one of exactly `TEXT`, `DROPDOWN`, `RADIO`, `MULTI_SELECT`, `DATE`, checked with an own-key test so `"constructor"` is a `400`, not a `500`.
- `DROPDOWN`, `RADIO` and `MULTI_SELECT` require at least one option; a zero-option choice question is `400 options_required`. `TEXT` and `DATE` accept no options. An empty array is "no options".
- Each option label is trimmed, 1–120 characters, unique within the question. Each option value is trimmed, 1–120 characters, unique within the question, derived from the label by a lowercase slug unless supplied.
- `updateQuestion` replaces the option set by id: matched ids are updated, unknown ids are inserted, stored ids missing from the list are deleted. `reorderQuestions` takes the exact live question set as a permutation and writes `sort_order` 0..n-1.
- A type change is allowed only while `responseCount === 0`; after the first response it is `409 question_type_locked`. A retired question is read-only: `updateQuestion` is `409 question_retired`.
- `retireQuestion` sets `retired_at` and never deletes. `deleteQuestion` is allowed only at `responseCount === 0`; otherwise `409 question_has_responses`. A deleted question's options go with it through `ON DELETE CASCADE`, and the remaining live questions are renumbered 0..n-1.
- The module is `import "server-only"`, uses double quotes, `@/*` alias imports, the service-role client, and `Database` row aliases.

**Never:**
- Do not seed a status question. The 13-chip disposition is the only status; the builder owns free-form questions only.
- Do not write a disposition, a response, or any `dialer_survey_responses` row. Story 2.3 owns that table and the RPC.
- Do not add an `/api` route, a page, a component, or a migration. No `dialer_survey_responses` table is created here.
- Do not invent a campaign-status gate. `DRAFT`/`ACTIVE` editability is a positive rule; no text says what `COMPLETED`/`CANCELLED` must do.
- Do not delete a campaign or a question that has responses. There is no hard-delete path for either.
- Do not return `null` for a response count. Absent relation and zero responses both mean `0`.
- Do not edit `apps/**`, `e2e/**`, `components/**`, `package.json` or `playwright.config.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List, no questions | Admin in a program, campaign with zero rows | `[]` | — |
| List, mixed order | Questions with duplicate/absent `sort_order` values | Ordered by `sort_order`, then `created_at`, then `id` | — |
| List, retired present | One live, one retired question | Retired row omitted by default | — |
| List, history requested | `{ includeRetired: true }` | Both rows, each with options and `responseCount` | — |
| List, options | Choice question with three options | Options in `sort_order`, then id; labels may contain commas | — |
| List as a Volunteer | Active staff session, role `Volunteer` | No read attempted | `403 forbidden` |
| List a missing, foreign or malformed campaign | Unknown id, another program's id, `"abc"` | No survey read issued | `404 campaign_not_found` |
| List a campaign that vanished mid-read | PostgREST read error | No partial list | `500 campaign_read_failed` |
| List more than one page | More than 1,000 questions or options | Pages concatenated; a full final page at the budget throws | `500 survey_list_truncated`, `500 question_read_failed`, `500 option_read_failed` |
| Create, TEXT | `{ questionTitle, questionType: "TEXT" }` | Row with `is_required = true`, `sort_order = max + 1`, no options | — |
| Create, DATE, optional | `isRequired: false`, no options | Row with `is_required = false`, no options | — |
| Create, choice with options | `RADIO` + two labels | Question and both options in one save; values are slugs | — |
| Create, choice with no options | `DROPDOWN` with absent or `[]` options | No insert attempted | `400 options_required` |
| Create, TEXT with options | `TEXT` + one option | No insert attempted | `400 options_not_allowed` |
| Create, blank or long title | `""`, `"   "`, 201 characters, non-string | No insert attempted | `400 invalid_question_title` |
| Create, unknown type | `"CHOICE"`, `"constructor"`, non-string | No insert attempted | `400 invalid_question_type` |
| Create, bad required flag | `"true"`, `null`, `1` | No insert attempted | `400 invalid_is_required` |
| Create, options not a list | `"a,b"`, `{}` | No insert attempted | `400 invalid_options` |
| Create, blank or long label | `""`, 121 characters, non-string | No insert attempted | `400 invalid_option_label` |
| Create, blank or long value | `""`, 121 characters | No insert attempted | `400 invalid_option_value` |
| Create, duplicate label | `"Yes"` twice | No insert attempted | `400 duplicate_option_label` |
| Create, slug collision | `"Yes!"` then `"Yes?"` (both `yes`) | No insert attempted; the value is named | `400 duplicate_option_value` |
| Create, option carries an id | `{ id, label }` | No insert attempted | `400 invalid_option_id` |
| Create, question insert rejected | Any question write error | No row returned | `500 question_write_failed` |
| Create, option insert rejected | Any option write error, compensation succeeds | Question and options removed | `500 question_write_rolled_back` |
| Create, compensation also fails | Question delete rejected | The message names the leftover question id | `500 question_write_rollback_failed` |
| Update, title and required | New title, `isRequired: false` | Row updated; type and options unchanged | — |
| Update, rename an option | Existing id, new label, no value | Label changes; stored value survives | — |
| Update, replace the set | Two stored ids kept, one removed, one new | Matched updated, new inserted, removed deleted, order 0..n-1 | — |
| Update, change a stored value | Existing id with a different `value` | No write | `409 option_value_locked` |
| Update, foreign option id | An id from another question | No write | `400 invalid_option_id` |
| Update, choice to zero options | `options: []` on `RADIO` | No write | `400 options_required` |
| Update, choice to TEXT | `questionType: "TEXT"`, `options: []` | Type and options written; options removed | — |
| Update, choice to TEXT without options | `questionType: "TEXT"`, options absent, stored options exist | No write; the empty list is required explicitly | `400 options_not_allowed` |
| Update, TEXT with options | `options` non-empty | No write | `400 options_not_allowed` |
| Update, type change before any response | `responseCount = 0`, new type | Type written once the option set matches | — |
| Update, type change after a response | `responseCount > 0`, new type | No write | `409 question_type_locked` |
| Update, retired question | `retired_at` set | No write | `409 question_retired` |
| Update, vanished question | Read succeeds, row deleted before the update | The final read answers | `404 question_not_found` |
| Update, option write rejected | Any option write error | No retry | `500 option_write_failed`, message says the question may be partially updated |
| Reorder, full live set | Every live id exactly once | `sort_order` 0..n-1; the reordered DTO list | — |
| Reorder, missing or extra id | A subset, an unknown id, a retired id | No write | `400 invalid_question_order` |
| Reorder, duplicate id | The same id twice | No write | `400 invalid_question_order` |
| Reorder, write rejected | Any order update error | No retry | `500 question_reorder_failed`, message says the order may be partial |
| Retire a live question | `responseCount` any value | `retired_at` set; options and history stay; not listed by default | — |
| Retire an already-retired question | `retired_at` already set | The row returned unchanged, no write | — |
| Retire a missing question | Unknown or malformed id | No write | `404 question_not_found` |
| Delete with zero responses | `responseCount = 0` | Row and options deleted; live questions renumbered | — |
| Delete with responses | `responseCount > 0` | No delete; message names the count and Retire | `409 question_has_responses` |
| Delete a retired question with zero responses | `retired_at` set, no responses | Allowed | — |
| Delete, row vanished | Row deleted between read and delete | Nothing to renumber | `404 question_not_found` |
| Delete, renumber fails | Delete succeeds, an order write fails | Question stays deleted | `500 question_reorder_failed`, message says the deletion stands |
| Count with the response relation absent | PostgREST `PGRST205` or Postgres `42P01` | `0` for every question | — |
| Count with the relation present | Response rows per question | Exact `responseCount` per question | — |
| Count read fails otherwise | Any other PostgREST error | No question list returned | `500 response_count_read_failed` |
| Count read truncated | A full final page at the page budget | No short count returned | `500 response_count_truncated` |

## Human Decisions

1. **Retire is idempotent, not a conflict.** Retiring an already-retired question returns the row unchanged instead of `409`; a double-clicked Retire control is not an error, and the read-only rule is still enforced by `updateQuestion`'s `409 question_retired`. The alternative — `409` on the second call — is what this layer would have to do to make Retire look like a state transition, and nothing in the story asks for that.
2. **Reorder requires the exact live set, not a subset.** A partial list cannot produce contiguous `sort_order` without inventing where the omitted questions go. The builder holds the whole list, so it sends the whole list; anything else is `400 invalid_question_order`.
3. **An option's `value` is immutable once stored.** A rename that omits `value` inherits the stored value, which is what makes "rename the label, keep the answers" true. Supplying a different value for an existing id is `409 option_value_locked` rather than a silent write that would orphan recorded answers.
4. **Slug collisions are refused, not suffixed.** Two labels that slug to the same value (`"Yes!"`, `"Yes?"`) are `400 duplicate_option_value`; the message names the value. An automatic `-2` suffix would make the stable key depend on sibling order, which is exactly what the child table exists to avoid. The client can supply explicit values.
5. **Only `undefined` takes the `isRequired` default.** A clear of the required flag is `false`; a malformed value (`null`, `"true"`) is `400`. This mirrors the campaign service's default rule.
6. **Changing a question to `TEXT`/`DATE` requires an explicit empty options list.** The options are deleted only when the request says so, instead of inferring a destructive write from a type change. `TEXT`/`DATE` with stored options and no `options` key is `400 options_not_allowed` with the fix in the message.
7. **Delete is gated by responses, not by retirement.** A retired question with zero responses is still deletable; UX-DR13 offers Delete only for a question with no responses, and retirement does not create history by itself.
8. **Delete renumbers the live questions only.** Retired rows keep the `sort_order` they had when retired; they are outside the live order and are listed separately with `includeRetired`. When a retired row is included, it may interleave with live rows and is ordered by `sort_order`, then `created_at`.
9. **Campaign status is not consulted.** The story says survey edits remain allowed in `DRAFT` and `ACTIVE`; it does not say `COMPLETED`/`CANCELLED` must refuse them. This layer does not invent that gate — the API and UI layers own the decision whether to render the builder for a terminal campaign, and this limitation is reported below.
10. **The response count is honest before the table exists.** `PGRST205`/`42P01` means the relation is absent; no response row can exist, so `0` is a true count. The table is not created here; Story 2.3 creates it with the disposition RPC.

</frozen-after-approval>

## Code Map

- `lib/dialer/surveys.ts` — the six operations, the question/option DTOs, the input types, the type guards, the slug/value rule, the response-count helper, the compensating delete and the order writer.
- `lib/dialer/campaigns.ts` — `getCampaign`, reused as the campaign existence and program-scope check (read-only here).
- `lib/dialer/scope.ts` — `requireCampaignAdmin`, the gate every operation applies (read-only here).
- `lib/supabase/paging.ts` — `collectPagedRows`, AD-16's shared pager, used by every list and count read (read-only here).
- `lib/supabase/admin.ts` — `createSupabaseAdminClient`, the service-role client (read-only here).
- `lib/supabase/types.ts` — the generated `dialer_survey_questions` and `dialer_survey_options` row aliases (read-only here).
- `lib/authz.ts` — `AuthzError` and `StaffContext` (read-only here).
- `supabase/migrations/20261025000000_create_dialer_tables.sql` — the column set, the `question_type` CHECK and the two `ON DELETE` rules this layer writes against (read-only here).
- `_bmad-output/specs/spec-autodialer/stories/1-5-survey-builder-server.md` — this record.

## Tasks & Acceptance

**Execution:**
- [x] `lib/dialer/surveys.ts` — `listCampaignQuestions`, `createQuestion`, `updateQuestion`, `reorderQuestions`, `retireQuestion`, `deleteQuestion`.
- [x] `lib/dialer/surveys.ts` — field and option validation, slug-derived values, and the type × options rule.
- [x] `lib/dialer/surveys.ts` — the response-count helper with the absent-relation answer.
- [x] `lib/dialer/surveys.ts` — the compensating delete for a failed option insert, and the renumber writer.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-5-survey-builder-server.md` — this record.

**Acceptance Criteria:**
- Given an admin, when they list a campaign's survey, then live questions come back in order with their ordered options and an exact `responseCount`, and retired questions appear only when asked for.
- Given a missing, foreign or malformed campaign id, when any survey operation runs, then the answer is `404 campaign_not_found`.
- Given a choice question with zero options, when it is created or updated, then the request is refused with `400 options_required` and nothing is written.
- Given a question with responses, when its type is changed, then `409 question_type_locked` and no write; before any response the change is allowed once the option set matches.
- Given a question with responses, when Delete is attempted, then `409 question_has_responses`; Retire sets `retired_at` and keeps the row, its options and its answers.
- Given a question with zero responses, when Delete is attempted, then the row and its options are removed and the live order is renumbered.
- Given a Volunteer, when any operation runs, then `403 forbidden` before a read or write.

## Implementation Notes

### Exported surface

| Export | Signature |
|---|---|
| `SurveyQuestionType` | `"TEXT" \| "DROPDOWN" \| "RADIO" \| "MULTI_SELECT" \| "DATE"` |
| `SurveyQuestionRow` | `Database["public"]["Tables"]["dialer_survey_questions"]["Row"]` |
| `SurveyOptionRow` | `Database["public"]["Tables"]["dialer_survey_options"]["Row"]` |
| `SurveyOption` | `{ id; label; value; sortOrder }` |
| `SurveyQuestion` | `{ id; campaignId; questionTitle; questionType; sortOrder; isRequired; retiredAt; responseCount; options; createdAt; updatedAt }` |
| `SurveyOptionInput` | `{ id?; label; value? }` |
| `CreateQuestionInput` | `{ questionTitle; questionType; isRequired?; options? }` |
| `UpdateQuestionInput` | `{ questionTitle?; questionType?; isRequired?; options? }` |
| `ListCampaignQuestionsOptions` | `{ includeRetired? }` |
| `listCampaignQuestions` | `(staff, campaignId, options?) => Promise<SurveyQuestion[]>` |
| `createQuestion` | `(staff, campaignId, input) => Promise<SurveyQuestion>` |
| `updateQuestion` | `(staff, campaignId, questionId, input) => Promise<SurveyQuestion>` |
| `reorderQuestions` | `(staff, campaignId, orderedIds: string[]) => Promise<SurveyQuestion[]>` |
| `retireQuestion` | `(staff, campaignId, questionId) => Promise<SurveyQuestion>` |
| `deleteQuestion` | `(staff, campaignId, questionId) => Promise<void>` |

### Validation matrix

| Effective type | Options in the request | Stored options | Create | Update |
|---|---|---|---|---|
| `TEXT`, `DATE` | absent | 0 | accepted | accepted |
| `TEXT`, `DATE` | absent | > 0 | — | `400 options_not_allowed` "send an empty list" |
| `TEXT`, `DATE` | `[]` | any | accepted | accepted; stored options deleted |
| `TEXT`, `DATE` | ≥ 1 | any | `400 options_not_allowed` | `400 options_not_allowed` |
| `DROPDOWN`, `RADIO`, `MULTI_SELECT` | absent | 0 | `400 options_required` | `400 options_required` |
| `DROPDOWN`, `RADIO`, `MULTI_SELECT` | absent | ≥ 1 | — | accepted; stored options kept |
| `DROPDOWN`, `RADIO`, `MULTI_SELECT` | `[]` | any | `400 options_required` | `400 options_required` |
| `DROPDOWN`, `RADIO`, `MULTI_SELECT` | ≥ 1 | any | accepted | accepted; set replaced |

`isRequired` is `true` when the key is absent on create, unchanged when absent on update, and must be a boolean otherwise. Each option is `{ label, value? , id? }`; `id` is accepted only on update and must belong to the question.

A type change is a separate refusal: if `responseCount > 0` and the requested type differs from the stored type, the answer is `409 question_type_locked` (checked before the option-set rule). If the question is retired, the first refusal is `409 question_retired`.

### Error codes

| Code | HTTP | Raised by | Trigger |
|---|---|---|---|
| `forbidden` | 403 | all six | `requireRole` refuses a Volunteer |
| `campaign_not_found` | 404 | all six | malformed campaign id, or no campaign in this program |
| `question_not_found` | 404 | update, retire, delete | malformed question id, no row in this campaign, or the row vanished |
| `invalid_question_title` | 400 | create, update | empty after trim, over 200 characters, or not a string |
| `invalid_question_type` | 400 | create, update | not one of the five DB values, including prototype keys |
| `invalid_is_required` | 400 | create, update | present and not a boolean |
| `invalid_options` | 400 | create, update | `options` present and not a list |
| `options_required` | 400 | create, update | a choice question would end with zero options |
| `options_not_allowed` | 400 | create, update | a `TEXT`/`DATE` question would have options |
| `invalid_option_id` | 400 | create, update | an id on create; a non-uuid or foreign id on update |
| `invalid_option_label` | 400 | create, update | empty after trim, over 120 characters, or not a string |
| `invalid_option_value` | 400 | create, update | empty after trim, over 120 characters, or not a string |
| `duplicate_option_label` | 400 | create, update | the same trimmed label twice |
| `duplicate_option_value` | 400 | create, update | two labels resolve to one value |
| `option_value_locked` | 409 | update | a supplied value differs from the stored value for an existing option |
| `question_retired` | 409 | update | the question has `retired_at` |
| `question_type_locked` | 409 | update | a type change on a question with at least one response |
| `question_has_responses` | 409 | delete | `responseCount > 0` |
| `invalid_question_order` | 400 | reorder | not a list, not a permutation of the campaign's live question ids |
| `campaign_read_failed` | 500 | all six | `getCampaign` cannot read the campaign |
| `question_read_failed` | 500 | list, create, update, reorder, retire, delete | PostgREST question read error, or a stored type outside the CHECK |
| `option_read_failed` | 500 | list, update, retire | PostgREST option read error |
| `survey_list_truncated` | 500 | list | the page budget ran out on a full final question or option page |
| `response_count_read_failed` | 500 | list, update, retire, delete | the response relation exists but the count read failed |
| `response_count_truncated` | 500 | list, update, retire, delete | the count read hit the page budget |
| `question_write_failed` | 500 | create, update, retire, delete | question insert/update/delete error |
| `option_write_failed` | 500 | update | option delete/update/insert error; the message says the question may be partially updated |
| `question_write_rolled_back` | 500 | create | the option insert failed and both compensating deletes succeeded |
| `question_write_rollback_failed` | 500 | create | the option insert failed and the leftover question could not be removed; the message carries its id |
| `question_reorder_failed` | 500 | reorder, delete | an order write failed; the message says the order (or the deletion's renumber) is partial |

### The absent response table

`dialer_survey_responses` is not created by Story 1.1 and is not created here. Story 2.3 adds it beside the disposition RPC, then regenerates `lib/supabase/types.ts`. The count helper therefore reaches the relation through one explicitly cast read, and treats PostgREST's `PGRST205` ("table not found in the schema cache") and Postgres's `42P01` (`undefined_table`) as "the relation is absent". In that state `0` is not a default — no response row can exist, so `0` is the exact count. A count the layer cannot compute (any other error, or a truncated read) throws instead of returning `0`.

### The compensating delete

There is no transaction across two PostgREST statements. `createQuestion` inserts the question, then its options; if the option insert fails, it deletes that question's options and then the question itself. If both compensating deletes succeed, the caller gets `500 question_write_rolled_back`; if either fails, `500 question_write_rollback_failed` names the leftover question id. `updateQuestion` cannot replay a transaction either: a failed option write is reported as `500 option_write_failed` with a message saying the question may be partially updated, rather than pretending the set is consistent.

### The type lock and the option contract

A recorded answer's shape is its question's type plus its option values. The type is locked once `responseCount > 0`; before that, a type change is allowed only if the resulting option set matches the new type. An option's `value` is locked once stored, while its label stays editable — that is what lets a rename keep historical answers resolvable. Option rows are a child table, never a delimited string, so a label may contain a comma.

### What this layer does not prove

There is no unit runner in this repo, no `/api/dialer/**` survey route calls these functions yet, and `dialer_survey_responses` does not exist, so `pnpm test:static` proves types, import boundaries and lint only. No question, option or count was exercised against a database by an automated check. The runtime behaviour described above is unproven until the API layer's route sweep and the UI layer's `campaign-survey` spec reach it.

The story's `pnpm test:e2e campaign-survey` scope belongs to the UI layer; this layer has no route or page and ran no e2e command.

Two things this layer deliberately cannot account for:

- **Option deletion after responses.** The type lock protects an answer's shape, but the option set can still be replaced on a question with responses. Renaming is safe because `value` is stable; removing an option that already has answers would leave the stored `answer`/`answer_values` with no label to resolve. No rule in the story settles this, and the response table does not exist yet; Story 2.3 should decide whether option removal is locked once responses exist.
- **Campaign status.** No gate is applied, by Decision 9. The API/UI layers must decide whether the builder is offered for a `COMPLETED` or `CANCELLED` campaign.

Two smaller limits are recorded as debt candidates in the layer report: `sort_order = max + 1` has no race guard across concurrent creates (PostgREST cannot serialize it), and PostgREST's `PGRST205` also covers a stale schema cache after Story 2.3's migration — a transient that would report `0` until the cache reloads.

## Spec Change Log

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0, at `9dc79af`.
  - `pnpm guardrails` — "Monorepo guardrails passed." with the four pre-existing type-import warnings in `lib/auth-context.tsx`, `components/auth-hash-callback.tsx`, `components/invite-user-form.tsx` and `components/staff-auth-shell.tsx`, and `[verify-dialer-route-coverage] All 3 route(s) covered by denial sweep.`
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — "✖ 16 problems (0 errors, 16 warnings)"; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm exec eslint lib/dialer/surveys.ts` — no output, exit 0 (a targeted check before the full gate).

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- No e2e command was run. This layer has no route or page, and the story's `pnpm test:e2e campaign-survey` scope belongs to the UI layer.
- No runtime smoke test was possible: the module is `server-only`, has no route, the response table does not exist, and the repo has no unit runner. See "What this layer does not prove".

**Post-run state:** no database was contacted, so no row was created or changed.
