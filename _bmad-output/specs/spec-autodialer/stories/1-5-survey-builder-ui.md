---
title: 'The per-campaign survey builder'
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

**Problem:** `lib/dialer/surveys.ts` and the four `/questions` route files can
add, edit, order, retire and delete a campaign's survey, but no screen reaches
them. Frame 279 shows the panel an Admin uses, and it also shows a `Status?`
RADIO question whose options are the 13 dispositions — a duplicate status the
product removed on purpose. UX-DR13's Retire/Delete states are not drawn at all,
so the panel alone cannot say what a question with recorded answers offers.

**Approach:** `/campaigns/[campaignId]` reads the campaign and its survey
(`includeRetired: true`) behind the same admin gate, then mounts one client
builder below the lifecycle strip. The builder renders the design's header,
subtitle, numbered question rows with a type pill, a `Required`/`Optional` pill
and the choice options as chips, then a full-width `Add question` button. A
question's controls are driven by its recorded response count and by the
campaign's status; the editor is an inline panel that posts the route's own body
shape and shows the route's own named message on a refusal. An e2e spec owns one
disposable campaign per test, proves each control transition, and removes the
campaign and every question and option in a `finally`.

## Boundaries & Constraints

**Always:**
- `/campaigns/[campaignId]` stays a server component; only the builder is
  `"use client"`. The page applies the admin gate before the survey read, so a
  Volunteer is refused before learning whether the campaign exists.
- The builder reads with `includeRetired: true`. A retired question is history
  this surface shows read-only; the service's live-only default is for the
  caller's new dispositions, not for the builder.
- The panel is frame 279's: the `Call-outcome survey` heading, the subtitle
  `Every caller records these answers, for this campaign only.`, numbered rows,
  a type pill (`TEXT`, `DROPDOWN`, `RADIO`, `MULTI_SELECT`, `DATE`), a
  `Required`/`Optional` pill, choices as chips, and a full-width
  `Add question` button under the rows.
- The builder **never seeds and never offers a `Status?` question**. The 13-chip
  disposition is the only status. The frame's `Status?` card is its known defect,
  not a requirement.
- A choice question (`DROPDOWN`, `RADIO`, `MULTI_SELECT`) is saved with at least
  one option. The builder does not block a zero-option save silently: it posts and
  shows the route's `400 options_required` message verbatim.
- `TEXT` and `DATE` render no option editor and post `options: []`, so switching a
  question away from a choice type removes the stored options instead of leaving
  them behind.
- The survey stays editable in `DRAFT` and `ACTIVE` with no transition required.
  `COMPLETED` and `CANCELLED` render it read-only with a note that the campaign
  is closed.
- Shared primitives and program tokens only: `Button`, `Input`, `Label`,
  `Checkbox`, `AlertDialog`, `--program-text`, `--muted`,
  `--muted-foreground`, `--grid-linked-fg`, `--success`, `--destructive`,
  `--border`, `--card`. Double quotes, the `@/*` alias, `cn` from `@/lib/utils`.
- Every control is reachable by keyboard and has an accessible name; the
  move-order buttons are icon-only and carry `aria-label`s that name the
  question.
- `pnpm test:e2e campaign-` keeps the two existing campaign specs green.

**Never:**
- Do not seed, pre-fill or offer a `Status?` question, and do not render the 13
  disposition chips as survey options.
- Do not render `Delete` for a question with one or more responses — not
  disabled, not hidden-but-present: it is not rendered at all.
- Do not let the client restate the server's validation. `options_required`,
  `invalid_question_title`, `invalid_option_label` and `question_type_locked`
  are shown in the server's words.
- Do not claim the server refuses survey writes on a terminal campaign. It does
  not; this layer's read-only state is a surface rule and is recorded as such.
- Do not edit `lib/**`, `apps/folk/app/api/**`, `components/header.tsx`, the
  proxies, `public/sw.js`, `e2e/fixtures/**`, `e2e/auth/**`,
  `playwright.config.ts` or `package.json`.
- Do not weaken, delete or renumber an existing campaign assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin opens a campaign with no questions | Zero survey rows | `Call-outcome survey`, the subtitle, `No questions yet`, `Add question`; no `Status?` row and no disposition chip | — |
| Admin opens the builder | `DRAFT` | Every control enabled | — |
| Admin opens the builder | `ACTIVE` | Every control enabled; no transition needed | — |
| Admin opens the builder | `COMPLETED` or `CANCELLED` | Rows and chips render read-only with a closed-campaign note; no `Edit`, `Retire`, `Delete`, move or `Add question` | — |
| Admin adds a choice question | title + type + ≥1 option | `201 { question }`, row appears numbered in order with its type pill, required pill and option chips | — |
| Admin adds a choice question with no options | `DROPDOWN`, no options | No insert; the editor shows `A DROPDOWN question needs at least one option.` | `400 options_required`, message verbatim |
| Admin adds a `TEXT`/`DATE` question | type `TEXT` or `DATE`, required unticked | No option editor; row appears with `Optional` where `Required` goes, no chips | — |
| Admin edits a live question | title, required, options | `200 { question }`, row re-renders in place, order unchanged | `400`/`409` message verbatim |
| Admin edits a question with responses | `responseCount > 0` | Type renders as text with a note; title, required and options still editable | `409 question_type_locked` if the type were sent |
| Admin reorders | move up / move down | `POST …/questions/order` with every live id once; the new order survives a reload | `400 invalid_question_order` shown verbatim |
| Admin moves the first question up or the last down | ends of the live order | The button is disabled | — |
| Admin retires a live question | `POST …/[questionId]/retire` | Confirmed first; the row stays, labelled `Retired`, read-only, chips kept | Server message verbatim on failure |
| Admin deletes a question with no responses | `DELETE …/[questionId]` | Confirmed first; `204`, the row disappears, the API list is empty | Server message verbatim on failure |
| Admin deletes a question with responses | `responseCount > 0` | `Delete` is not rendered at all | `409 question_has_responses` shown if reached by another path |
| Admin opens an absent campaign | Any non-matching id | Next's not-found page | `404 campaign_not_found` → `notFound()` |
| Volunteer opens the detail | No caller profile | Refused before the read; no survey region, no `Add question` | `403` → `/auth/error?code=staff-authorization-failed` |
| No session | No cookie | Redirected to sign in, naming the path | `401` → `/login?redirect=/campaigns/<id>` |

## Human Decisions

1. **Retired questions stay in the builder, read-only.** UX-DR13 and this
   packet's control matrix both name a `Retired` state with no controls, which
   only exists if the panel lists the row. The page therefore reads with
   `includeRetired: true`; the service's live-only default still governs the
   caller's new dispositions. A retired row keeps its title, type, options and
   chips — history, not a live question.

2. **The terminal-campaign read-only state is a surface rule, not an enforced
   one.** The story says survey edits are allowed in `DRAFT` and `ACTIVE` and
   says nothing about `COMPLETED`/`CANCELLED`; the service does not refuse them
   either (server layer Decision 9, inherited here). The builder renders closed
   campaigns read-only because a survey on a completed campaign is history, and
   the note says the campaign is closed rather than claiming the server would
   refuse a write. Enforcing it belongs to a service-layer change.

3. **`Delete` is absent, not disabled, once a question has responses.** UX-DR13
   says the builder offers Retire rather than Delete for such a question. A
   disabled Delete would still advertise a control the product refuses, so the
   row renders only the controls that work: `Edit` and `Retire`, plus the copy
   that Retire keeps the recorded answers.

4. **The type is read-only text at one or more responses, and the server stays
   the enforcer.** `updateQuestion` refuses a type change with
   `409 question_type_locked`; the editor mirrors that by not offering a
   selector, and still does not pre-validate anything else.

5. **The client mirrors the survey DTO instead of importing the service.** The
   service module is `server-only`, so the builder's prop types live in
   `components/campaign/campaign-survey-types.ts`. The page passes the service's
   own objects, which are structurally those types, and the client graph never
   reaches `lib/dialer/*` — the rule Story 1.3 set and Story 1.4 kept.

6. **No client-side validation of the option set or the title.** The route owns
   those rules and names them; the builder posts and displays. The one client
   check the 1.4 form makes (an empty name never leaves the browser) has no
   equivalent here, because a choice question with zero options is exactly the
   case the story wants the server to answer.

7. **The 1.4 spec text was left untouched.** The detail page's new section adds
   `Add question`, `Edit`, `Retire`, `Delete` and the editor's `Cancel`/`Save
   question` controls, but none of them collides with the lifecycle buttons
   (`Start campaign`, `Complete`, `Cancel` on a campaign, not a question), the
   `DRAFT`/`ACTIVE` text or the `Delete`-free existing assertions. No existing
   selector was renamed or loosened.

</frozen-after-approval>

## Code Map

- `apps/folk/app/campaigns/[campaignId]/page.tsx` — the admin gate, the campaign read, the survey read with `includeRetired: true`, the detail fields and the builder mount.
- `components/campaign/campaign-survey-builder.tsx` — the panel, the question rows, the response-count and status control matrix, the inline editor, the retire/delete confirmations and the order writer.
- `components/campaign/campaign-survey-types.ts` — the browser-safe DTO mirror and the five types.
- `e2e/specs/campaign-survey.spec.ts` — nine tests: empty survey, add RADIO, zero-option refusal, add TEXT, edit, reorder, retire, delete, Volunteer refusal; one disposable campaign per test and a loopback-guarded `finally` cleanup.
- `e2e/fixtures/dialer-campaign.ts` — `createDisposableCampaign` / `deleteDisposableCampaign` reused unchanged (read-only here).
- `e2e/specs/campaign-campaigns.spec.ts`, `e2e/specs/campaign-surfaces.spec.ts` — unchanged, re-run and green (read-only here).
- `lib/dialer/surveys.ts` — `listCampaignQuestions`, `createQuestion`, `updateQuestion`, `reorderQuestions`, `retireQuestion`, `deleteQuestion` and the named errors (read-only here).
- `lib/dialer/campaigns.ts` — `getCampaign` (read-only here).
- `components/ui/{button,input,label,checkbox,alert-dialog}.tsx` — the primitives the builder reuses (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `apps/folk/app/campaigns/[campaignId]/page.tsx` — read the survey behind the same gate; mount the builder below the lifecycle section.
- [x] `components/campaign/campaign-survey-types.ts` — the client-side DTO and the five types.
- [x] `components/campaign/campaign-survey-builder.tsx` — header, subtitle, numbered rows, pills, chips, add/edit/order/retire/delete, the closed-campaign read-only state.
- [x] `e2e/specs/campaign-survey.spec.ts` — nine tests with a disposable campaign and an ordered cleanup.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-5-survey-builder-ui.md` — this record.

**Acceptance Criteria:**
- Given a new campaign, then its survey says `No questions yet`, offers `Add question`, and renders no `Status?` row or disposition chip.
- Given `Add question`, then the type selector offers exactly `TEXT`, `DROPDOWN`, `RADIO`, `MULTI_SELECT` and `DATE`.
- Given a choice question with zero options, then the save is refused with the server's `options_required` message and no question is added.
- Given an added `RADIO` question with two options and required, then it appears as `1` with the `RADIO`, `Required` and both option chips.
- Given an added `TEXT` question with required unticked, then it appears as `2`, labelled `Optional`, with no chips.
- Given a rename, then the title changes and the question keeps its position.
- Given `Move … up`, then the order changes, survives a reload and matches the API's list.
- Given a retired question, then it reads `Retired`, keeps its chips and offers no `Edit`, `Retire`, `Delete` or move control.
- Given a question with no responses, then `Delete` is offered, confirmed, returns `204`, and the row and the API list are empty.
- Given `pnpm test:e2e campaign-`, then 28 tests run (4 role setups + 24 spec tests) and all pass.

## Implementation Notes

### The control matrix the builder renders

| Campaign status | Question state | Recorded answers | Controls |
|---|---|---|---|
| `DRAFT` / `ACTIVE` | live | 0 | `Edit`, `Retire`, `Delete`, move up/down |
| `DRAFT` / `ACTIVE` | live | ≥ 1 | `Edit`, `Retire`, move up/down; no `Delete`; "N recorded answers. Retiring keeps them." |
| `DRAFT` / `ACTIVE` | retired | any | none — `Retired` pill, title, type, options; no editor |
| `COMPLETED` / `CANCELLED` | live or retired | any | none; a "campaign is closed" note replaces the `Add question` button |

The move buttons are disabled at the ends of the live order. A retired row is
outside the live order and contributes no id to the order request: the service
requires exactly the live set (`invalid_question_order` otherwise), and a retired
question keeps the `sort_order` it had when it was retired.

### Confirmation copy

`Retire` with recorded answers: "This question has N recorded answers; retiring
keeps them and stops the question appearing in new call outcomes." `Retire` with
none: "The question stops appearing in new call outcomes and stays in the
campaign's history." `Delete` (zero responses only): "This question has no
responses, so deleting it loses nothing. This cannot be undone." Each is the
design system's `AlertDialog`, not `window.confirm`, so the consequence is
assertable by role and stated in the campaign's words.

### The no-status-question rule

Frame 279's first card is a RADIO question titled `Status?` whose option chips
are the 13 dispositions. The disposition is the only status in this product, so a
second, per-campaign status question is a defect: it would let the same campaign
record two contradictory answers and it would let an Admin reword the
dispositions. The builder seeds nothing, the type selector offers no status
shortcut, and the spec asserts both the absence of the `Status?` text and the
absence of `Confirmed`, so a later edit cannot quietly reintroduce the card.

### Where the response count comes from

`listCampaignQuestions` computes `responseCount` per question. Until Story 2.3
creates `dialer_survey_responses`, the helper treats the absent relation
(`42P01` / `PGRST205`) as an honest `0` — no response row can exist yet — so every
live question in this build renders the zero-response controls. The ≥ 1 branch is
implemented and unreachable, not unimplemented.

### The read and the ordering

`page.tsx` reads the campaign, then the survey with `includeRetired: true`, so a
retired question appears once as read-only history. Rows render in the service's
order (`sort_order`, then `created_at`), and the displayed number is the live
position (`1..n`) rather than `sort_order`, because `Delete` renumbers the live
set while a retired row keeps its old slot: an absolute `sort_order + 1` could
print two `1`s. A retired row renders no number at all.

### Tokens

| Element | Design | Shipped |
|---|---|---|
| Type pill | `#e2e8f0` fill, dark ink | `--muted` fill, `--grid-linked-fg` ink |
| `Required` pill | `#e8f5ec` fill, `#15803d` ink | `--success` mixed 12% into `--card`, `--success` ink |
| `Optional` pill | `#f2f4f7` fill | `--muted` fill, `--muted-foreground` ink |
| `Retired` pill | not drawn (UX-DR13) | `--border` outline, `--muted-foreground` ink |
| Option chip | white fill, `#e2e8f0` border | `--card` fill, `--border` outline |
| Question row | `#f8fafc` fill, `#e2e8f0` border | `--muted` mixed 35% into `--card`, `--border` outline |

The required/optional tints reuse the status pill's `color-mix` technique, so a
theme switch flips one token. No new palette entry was added.

### The delete grant

The API layer recorded that `service_role` held no `DELETE` on
`dialer_survey_questions` / `dialer_survey_options`, so a real delete ended in
`500 question_write_failed`. The schema layer's
`supabase/migrations/20261026000000_grant_dialer_survey_delete.sql` grants both,
and this spec is the first automated proof: the delete test observes `204`, the
row leaves the page and the API list is empty. Removing an option on edit uses
the same grant.

### The e2e fixture and cleanup

`e2e/fixtures/dialer-campaign.ts` is read-only here, so the spec owns its own
loopback-guarded `runLocalSql`: the service-role credential is read from the
app's env file at runtime, the target is asserted loopback with
`isLocalSupabaseUrl`, and the campaign id is UUID-checked before interpolation.
Cleanup runs `dialer_survey_options` → `dialer_survey_questions` →
`dialer_campaigns` in that order, because options cascade from a question and a
question restricts its campaign. Each test creates its own campaign through
`POST /api/dialer/admin/campaigns` and removes it in a `finally`, so no test
depends on another's order. Preconditions that are not the behaviour under test
(a first RADIO question, a second TEXT question) are created through the same
route the builder posts to.

## Spec Change Log

- No frozen intent changed. This layer is the UI half of Story 1.5; the service
  and route halves are `1-5-survey-builder-server.md` and
  `1-5-survey-builder-api.md`.

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e campaign-` (the packet's VERIFICATION
  command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `Monorepo guardrails passed.`, `[verify-dialer-route-coverage] All 7 route(s) covered by denial sweep.`, with the four pre-existing type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen are pre-existing and in files this layer did not touch.
- `pnpm test:e2e:list campaign-` — `Total: 28 tests in 7 files`.
- `pnpm test:e2e:list campaign-survey` — `Total: 13 tests in 5 files` (4 role setups + 9 spec tests), so the story's filter selects real tests.
- `pnpm test:e2e campaign-` — **PASS**, exit 0. `28 passed (1.1m)` — the four role setup projects plus twenty-four spec tests.
- `pnpm exec eslint components/campaign/campaign-survey-builder.tsx components/campaign/campaign-survey-types.ts "apps/folk/app/campaigns/[campaignId]/page.tsx" e2e/specs/campaign-survey.spec.ts` — no output, exit 0 (a targeted check before the full gate).

**Spec tests added (`campaign-survey.spec.ts`):**
- `the campaign survey — a new campaign › renders no seeded Status? question`
- `the survey builder — an Admin adding questions › adds a RADIO question with required options`
- `the survey builder — an Admin adding questions › rejects a choice question with no options in the server's words`
- `the survey builder — an Admin adding questions › adds a TEXT question as optional with no options`
- `the survey builder — an Admin editing and ordering › renames a question and keeps its position`
- `the survey builder — an Admin editing and ordering › moves a question up and the order survives a reload`
- `the survey builder — retire and delete › retires a question and leaves it read-only`
- `the survey builder — retire and delete › deletes a question with no responses`
- `the campaign detail — a Volunteer › is refused before the survey is read`

**Spec tests kept, unchanged:** the nine in `campaign-campaigns.spec.ts` and the
six in `campaign-surfaces.spec.ts` all pass inside the same run.

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0
  without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `campaign-`, and
  the full suite belongs to the join layer.
- `pnpm test:e2e:determinism` was not run. The repository defers it to Epic 4,
  Story 4.2; every row this spec creates is deleted, and the four dialer tables
  were confirmed back at zero rows after the run.
- `pnpm test:airtable-removal` was not run. It is a known pre-existing failure on
  this branch and is unrelated to these files.

**Post-run state:** `dialer_campaigns`, `dialer_survey_questions`,
`dialer_survey_options` and `dialer_callers` hold zero rows after the gated run.

## What this layer does not prove

- **The ≥ 1 response branch is implemented but unreachable.** No
  `dialer_survey_responses` relation exists until Story 2.3, so every question
  reads `responseCount = 0`. The missing `Delete`, the "Retiring keeps them" copy,
  the read-only type and the `409 question_has_responses` refusal are proven by
  code reading only; the first automated proof is Story 2.3's own surface.
- **Option removal and option reordering are implemented but not asserted.** The
  editor's `Remove option N` and `Move option N up/down` controls post a shortened
  or reordered option list; the spec adds and edits two option labels and proves
  the chips, not the removal path (which is also the batch that needed the
  `dialer_survey_options` delete grant).
- **The move controls' disabled ends are not asserted.** They are disabled at the
  first and last live position; the reorder test moves the second of two, so the
  ends are code-only.
- **The terminal-campaign read-only state is not asserted.** There is no spec row
  that completes a campaign and asserts the builder's controls disappear, and the
  server does not refuse the write anyway (Human Decision 2).
- **A second program's questions are not exercised.** The service scopes every
  read and write by `staff.programId`; the repo has no second-program staff
  fixture, so cross-program isolation is the service layer's contract, not this
  spec's.
- **`is_required` is rendered but not enforced anywhere.** The story says the
  marker is honest only because the disposition RPC will enforce it in Story 2.3;
  until then the marker is a promise the product has not yet kept, and the spec
  asserts only that it renders.
- **`question_retired`, `option_value_locked` and the duplicate-option refusals
  are not exercised in the browser.** The route layer's sweep owns the codes; this
  spec reaches the success paths and the one zero-option refusal.
- **Dark mode and the 390px layout were not checked at all.** No screenshot pass
  was made for this section, and no theme or mobile spec covers the campaign
  surfaces.
- **The unauthenticated `401` redirect on the detail page is not asserted.** It is
  unchanged from Story 1.4 and no spec in this filter covers it.
