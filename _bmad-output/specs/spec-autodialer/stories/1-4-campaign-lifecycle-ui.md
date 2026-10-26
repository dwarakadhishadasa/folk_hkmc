---
title: 'The campaign list, the create form and the lifecycle controls'
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

**Problem:** Story 1.3 shipped the Campaign shell with an unconditional empty state, and Story 1.4's service and routes could create and transition a campaign that no screen could reach. An admin could not see which campaigns exist, could not create one, and could not start, complete or cancel one. The frame that shows the list also shows four count columns and a survey step whose data and builder do not exist yet, so a literal build would have rendered zeros and dead controls as if they were facts.

**Approach:** `/campaigns` reads `listCampaigns` and branches between the existing empty state and a three-column table (`Campaign`, `End Date`, `Status`) whose rows link to a detail page. `/campaigns/new` is a server page behind `requireCampaignAdmin` holding one client form — hand-written state and `fetch` — with the design's three fields plus the gap duration and attempt cap the frame omits. `/campaigns/[campaignId]` is a server page behind the same gate that reads `getCampaign`, shows the campaign's settings, and mounts the only client lifecycle control: exactly the transitions AD-12 permits for the rendered status, each confirmed then POSTed, with a `409` shown in the server's own words and the rendered status left alone. An e2e spec establishes the empty state as a precondition, proves create, list and all four transitions, pins the count columns' absence, and deletes every row it creates.

## Boundaries & Constraints

**Always:**
- Every page is a server component. `requireCampaignAdmin(staff)` runs before any read on all three routes, and the server routes re-apply the same gate, so hiding a control is never the boundary.
- `/campaigns` keeps the existing title row ("Overview", "Campaigns · folk programme", "New campaign" → `/campaigns/new`) and the shared sub-nav, and keeps the existing "No campaigns yet" / "Create campaign" empty state when the program has no campaigns.
- With campaigns present, the table's columns are exactly **Campaign**, **End Date** and **Status**. The name cell links to `/campaigns/<id>`, the date is `campaign_date` formatted `14 Nov 2026` (UTC, so the picked day never shifts), and the status is a pill whose `DRAFT`, `ACTIVE`, `COMPLETED` and `CANCELLED` fills are visibly distinct.
- The footer names the row count the page actually listed ("1 campaign", "3 campaigns"). No draft/cancelled sub-counts are invented beyond what the listed rows contain.
- The create form captures **Campaign name**, **Description**, **Campaign end date**, **Time** (optional), **Gap duration** (presets 5/10/20/30/60 plus a numeric field, default 20) and **Max attempts** (1–10, default 3). It submits `{ name, description, campaignDate, campaignTime, gapDuration, maxAttempts }` to `POST /api/dialer/admin/campaigns`, disables the submit while in flight, keeps every entered value on a refusal, and shows the server's named message verbatim.
- A `201` navigates to `/campaigns/<id>` — the detail page — so the campaign's `DRAFT` status and its one legal action are visible immediately.
- The detail page shows name, description, end date, time, gap duration, max attempts and status, plus a link back to `/campaigns`.
- The lifecycle matrix is exactly: `DRAFT` → one **Start campaign**; `ACTIVE` → **Complete** and **Cancel**; `COMPLETED` and `CANCELLED` → no control at all. Each offered action opens a confirmation dialog, then POSTs `{ action }` to `/api/dialer/admin/campaigns/<id>/transition`, then refreshes the server render. A refused transition shows the server's message and does not change the rendered status.
- A missing, malformed or foreign campaign id renders Next's not-found page via `notFound()`, never a blank detail.
- Only a `403` is reported as `staff-authorization-failed`. A `500` from a read or a write keeps its own status and surfaces as an error, not as a role refusal.
- Shared primitives and tokens only: `Button`, `Table`, `Input`, `Textarea`, `Label`, `AlertDialog`, `--program-text`, `--muted`, `--card`, `--success`, `--info`, `--destructive`, `--grid-linked-fg`. Double quotes, the `@/*` alias, and `cn` from `@/lib/utils`.
- `pnpm test:e2e campaign-` selects and passes the new spec's nine tests plus the six 1.3 tests.

**Never:**
- Do not render Assigned, Reached, Confirmed or Never attempted, not even as `0` or `—`. Those are Story 1.9's `campaign_progress` counts; a placeholder would claim a measurement this surface cannot take.
- Do not render a survey section, an `Add question` control, a `Next` step or any other Story 1.5 control.
- Do not render a disabled or hidden lifecycle button as if it were an action, and do not invent a transition outside AD-12.
- Do not delete a campaign anywhere in the product — AD-12 cancels, never deletes. The spec's SQL delete is test cleanup, not a product path.
- Do not call `campaignScope(staff)` on these pages: campaign rows are program-level (AD-3) and `listCampaigns` already scopes by program.
- Do not add a dependency, a new palette token, or edit `lib/**`, `apps/folk/app/api/**`, `components/header.tsx`, the proxies, `public/sw.js`, `e2e/fixtures/**`, `e2e/auth/**`, `playwright.config.ts` or `package.json`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin opens `/campaigns`, program has none | Zero `dialer_campaigns` rows | "No campaigns yet" empty state with "Create campaign" → `/campaigns/new`; no table | — |
| Admin opens `/campaigns`, program has rows | One or more rows | Three-column table; the created row links to its detail and shows its pill; the footer names the count | — |
| Preacher or Assistant opens `/campaigns` | Any rows | The same table — campaign rows are program-level | — |
| Volunteer opens `/campaigns` | No caller profile | Refused before any read | `403` → `/auth/error?code=staff-authorization-failed` |
| Admin opens `/campaigns/new` | Active admin session | Title, subtitle, back link and the six-field form | — |
| Admin submits a valid form | Name, date, gap 30, attempts 5 | `201 { campaign }`, navigation to `/campaigns/<id>`, `DRAFT`, exactly one `Start campaign`, `30 seconds`, `5 attempts` | — |
| Admin submits an invalid field | Empty name, gap 4, attempts 11 | No request for a client-detectable mistake; server-side mistakes show the route's `{ error }` | Named message under the form, values kept, submit re-enabled |
| Admin starts a `DRAFT` | `{ action: "start" }` | `ACTIVE`; `Start campaign` gone, `Complete` and `Cancel` offered | — |
| Admin completes an `ACTIVE` | `{ action: "complete" }` | `COMPLETED`; no lifecycle control | — |
| Admin cancels an `ACTIVE` | `{ action: "cancel" }`, confirmed | `CANCELLED`; no lifecycle control | — |
| A transition loses a race | Row moved before the POST | No write; the server's message is shown; the rendered status is unchanged | `409 campaign_status_conflict`, message verbatim |
| Detail id is absent, malformed or foreign | Any non-matching id | Next's not-found page | `404 campaign_not_found` → `notFound()` |
| Volunteer opens `/campaigns/new` or a detail | No caller profile | Refused before the read, so existence is not disclosed | `403` → `/auth/error?code=staff-authorization-failed` |
| No session on any route | No cookie | Redirected to sign in, naming the requested path | `401` → `/login?redirect=…` |

## Human Decisions

1. **Three columns, not seven.** Frame 32 shows Assigned, Reached, Confirmed and Never attempted beside the three columns this story owns. Those four are `campaign_progress` counts from Story 1.9, and this surface cannot compute them; rendering `0` would state that a campaign reached nobody. The omission is pinned by an e2e assertion so 1.9 has to add them deliberately.

2. **The empty-state assertion moved, it was not deleted.** Story 1.3 asserted the "Create campaign" empty state on `/campaigns` because the page was unconditional. With data, that state is a precondition, not a default, so the assertion now lives in `campaign-campaigns.spec.ts`, which deletes the program's campaigns first. The 1.3 admin test keeps what is data-independent: the "Overview" heading, the "New campaign" action, the admin sub-nav and the Assignments absence.

3. **The subtitle drops the survey clause.** Frame 212 reads "Name it, choose when it ends, and define the call-out survey". The survey builder is Story 1.5 and this page has no survey control, so the shipped line is "Name it, choose when it ends, and set the calling pace." A subtitle promising a control that is not there is a false affordance, and the deviation is recorded here rather than hidden.

4. **Every action confirms; Cancel's dialog says it is terminal.** The story asks for a confirm-then-POST for each action, and each of the three changes a state the page cannot undo. The confirmation is the design system's `AlertDialog`, not `window.confirm`, so the consequence is stated in the campaign's own words and the dialog is assertable by role.

5. **Creation lands on the detail page, not the list.** The outcome the story cares about is a campaign that is `DRAFT` with one legal action. Landing on the list would make the admin hunt for the row to check the status; the detail page shows it, and the list test still proves the row appears where the table expects it.

6. **The 1.3 route refuses only a 403.** The pages now read campaigns, so an `AuthzError` can be a `500` as well as the gate's `403`. Redirecting every `AuthzError` to `staff-authorization-failed` would blame the reader's role for a database fault; only `401` and `403` have redirect arms, and anything else is rethrown to the error page.

7. **`DRAFT → CANCELLED` is legal in AD-12 and is not offered in the UI.** The packet's matrix, UX-DR17 and the detail acceptance tie `DRAFT` to exactly one `Start campaign`; the service still accepts the transition. The UI follows the packet. Whether a draft should be cancellable from the surface is a product question, recorded as an open item rather than guessed at.

</frozen-after-approval>

## Code Map

- `apps/folk/app/campaigns/page.tsx` — `/campaigns`: the admin gate, the list read, the empty-state/table branch.
- `apps/folk/app/campaigns/new/page.tsx` — `/campaigns/new`: the gate, the back link, the title row and the form.
- `apps/folk/app/campaigns/[campaignId]/page.tsx` — `/campaigns/[campaignId]`: the gate, the detail fields, the status pill and the lifecycle control; `404` → `notFound()`.
- `components/campaign/campaign-list.tsx` — the three-column table and the count footer.
- `components/campaign/campaign-status-pill.tsx` — the four status fills, server-rendered.
- `components/campaign/campaign-format.ts` — `formatCampaignDate` (UTC) and `formatGapDuration`.
- `components/campaign/new-campaign-form.tsx` — the client form: state, presets, validation, POST and navigation.
- `components/campaign/campaign-lifecycle-actions.tsx` — the client lifecycle matrix, the confirmation dialogs, the `409` message.
- `e2e/specs/campaign-campaigns.spec.ts` — nine tests: empty state, create, list, start, complete, cancel, `409`, not-found, refusal.
- `e2e/specs/campaign-surfaces.spec.ts` — the 1.3 admin test loses the data-dependent empty-state assertion (comment and test name updated).
- `lib/dialer/campaigns.ts` — `listCampaigns`, `getCampaign`, `createCampaign`, `transitionCampaign` and the status/action types (read-only here).
- `lib/dialer/scope.ts` — `requireCampaignAdmin` (read-only here).
- `components/ui/{button,table,input,textarea,label,alert-dialog}.tsx` — the primitives the surfaces reuse (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `apps/folk/app/campaigns/page.tsx` — read `listCampaigns`; branch to the table or the existing empty state; 403-only refusal.
- [x] `apps/folk/app/campaigns/new/page.tsx` — the gated create page with the back control and title row.
- [x] `apps/folk/app/campaigns/[campaignId]/page.tsx` — the gated detail page with the lifecycle strip and the not-found path.
- [x] `components/campaign/campaign-list.tsx` — the three columns, row links and honest count footer.
- [x] `components/campaign/campaign-status-pill.tsx` — four distinct status fills on program tokens.
- [x] `components/campaign/campaign-format.ts` — UTC date and duration formatting.
- [x] `components/campaign/new-campaign-form.tsx` — name, description, end date, time, gap presets + numeric field, max attempts; POST; keep values on refusal.
- [x] `components/campaign/campaign-lifecycle-actions.tsx` — Start/Complete/Cancel per status, confirmation, `409` message, refresh on success.
- [x] `e2e/specs/campaign-campaigns.spec.ts` — nine tests with a controlled empty-state precondition and a `finally` delete per created campaign.
- [x] `e2e/specs/campaign-surfaces.spec.ts` — relocate the empty-state assertion, keep the data-independent admin checks.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-4-campaign-lifecycle-ui.md` — this record.

**Acceptance Criteria:**
- Given the form, when an Admin submits a valid campaign, then it is created in `DRAFT` and the detail page offers exactly one `Start campaign`.
- Given the list, when campaigns exist, then each appears with `Campaign`, `End Date` and `Status` only, its row links to the detail, and the four reporting counts are absent.
- Given a `DRAFT`, when the Admin starts it, then it is `ACTIVE` and offers `Complete` and `Cancel`.
- Given an `ACTIVE` campaign, when the Admin completes or cancels it, then it is terminal and no lifecycle action is offered.
- Given a stale transition, when the server refuses it with `409`, then the server's message is shown and the rendered status does not change.
- Given a Volunteer, when they open the create form or a detail, then they are refused server-side and see no campaign surface.
- Given `pnpm test:e2e campaign-`, then 19 tests run (4 role setups + 15 spec tests) and all pass.

## Implementation Notes

### Route map

| Route | Renders | Admits | Refusal |
|---|---|---|---|
| `/campaigns` | Campaign shell → sub-nav → "Overview" title row ("Campaigns · folk programme", "New campaign") → the three-column table, or the "No campaigns yet" empty state with "Create campaign" | Admin, Preacher, Assistant | Volunteer → `403` → `/auth/error?code=staff-authorization-failed`; no session → `401` → `/login?redirect=/campaigns` |
| `/campaigns/new` | Campaign shell → sub-nav → "Back to campaigns", "New campaign" title and subtitle → the six-field form | Admin, Preacher, Assistant | as above, with `/login?redirect=/campaigns/new` |
| `/campaigns/[campaignId]` | Campaign shell → sub-nav → "Back to campaigns", the campaign name, the status pill and the lifecycle strip, then description, end date, time, gap duration and max attempts | Admin, Preacher, Assistant | Volunteer → `403` → auth error; absent/foreign/malformed id → `404` → `notFound()`; no session → `401` → `/login?redirect=/campaigns/<id>` |

### The transition matrix the surface offers

| Rendered status | Buttons | Confirm action | Result |
|---|---|---|---|
| `DRAFT` | `Start campaign` | "Start campaign" | `ACTIVE` |
| `ACTIVE` | `Complete`, `Cancel` | "Complete campaign" / "Cancel campaign" | `COMPLETED` / `CANCELLED` |
| `COMPLETED` | none | — | — |
| `CANCELLED` | none | — | — |

`DRAFT → CANCELLED` remains legal in AD-12 and in the service; the surface does not offer it (Human Decision 7).

### Why the four count columns are absent

Frame 32's Assigned / Reached / Confirmed / Never attempted are `campaign_progress` values. That view and its read belong to Story 1.9, so this layer has no honest value for them: `0` would assert that no contact was assigned or reached, which is a measurement this surface cannot take. The columns are omitted, and `campaign-campaigns.spec.ts` asserts their headers are absent, so adding them becomes a deliberate 1.9 change rather than a silent regression.

### The 1.3 assertion relocation

`campaign-surfaces.spec.ts` used to assert the "Create campaign" empty state for all three admin roles. `/campaigns` is data-driven now, so that assertion became order-dependent on whatever a previous run left behind. It moved to `campaign-campaigns.spec.ts`, whose empty-state test deletes the program's campaigns first. The 1.3 admin test still asserts the "Overview" heading, the "New campaign" action, the admin sub-nav and the Assignments absence — everything that does not depend on the table's contents. The Volunteer and caller refusal rows are unchanged.

### `status` is a `string` at the type boundary

`dialer_campaigns.status` is generated as `string` in `lib/supabase/types.ts` even though the database CHECK restricts it to four values. The pill falls back to the neutral `DRAFT` fill for an unrecognised value and still renders the stored word; the lifecycle component offers no action for an unrecognised value rather than guessing a transition the server would refuse. Both lookups are own-key, so a status of `"constructor"` cannot reach `Object.prototype`.

### Client and server boundaries

Only the form and the lifecycle controls are `"use client"`. The table, the pill and the formatting helper stay in the server graph, and none of the client components imports the server-only service module — the action union is declared locally, and `status` crosses the boundary as a plain string. This follows the 1.3 rule that the client graph must not reach `lib/dialer/*`.

### The visual tokens

| Status | Design fill / ink | Shipped |
|---|---|---|
| `DRAFT` | `#f2f2f2` / `#3b3f4b` | `--muted` / `--grid-linked-fg` |
| `ACTIVE` | `#e8f5ec` / `#15803d` | `--success` mixed 12% into `--card`, ink `--success` |
| `COMPLETED` | `#e8eefc` / `#1e40af` | `--info` mixed 10% into `--card`, ink `--info` |
| `CANCELLED` | `#fdeee7` / `#c2410c` | `--destructive` mixed 10% into `--card`, ink `--destructive` |

Mixing against `--card` is the repo's existing tag-pill technique (`components/grid/grid-cell-renderers.tsx`), so the tints hold in dark mode from one switch. No new token was added — `apps/folk/app/globals.css` is outside this layer's scope.

### The e2e fixture and cleanup

The seed creates no `dialer_campaigns` rows, and AD-12 grants no `DELETE` to any role, so the spec cleans up through the local stack's `/pg/query` endpoint, exactly as the 1.3 caller fixture does: the credential comes from the app's env file at runtime, the target is asserted loopback with `isLocalSupabaseUrl`, and a missing credential throws rather than skipping. Cleanup is unconditional (`DELETE … WHERE program_id = 'folk'` in the empty-state test, `DELETE … WHERE id = …` in each lifecycle test's `finally`, plus an `afterAll` sweep), so a failed test cannot leave a campaign that breaks the 1.3 surface or Story 1.9's counts. The `deleteCampaignsForProgram` statement is deliberately not guarded by an assignment check: if a later story's rows reference a campaign, the foreign key fails the statement and this spec goes red rather than reporting an empty list it did not establish.

The create test drives the real form. The list and lifecycle tests create their fixture through `POST /api/dialer/admin/campaigns` with the same admin session, so each test is independent of the others' order — a failure in one cannot cascade into a skipped transition in the next.

## Spec Change Log

- The 1.3 spec's data-dependent `Create campaign` empty-state assertion moved to `campaign-campaigns.spec.ts` (see "The 1.3 assertion relocation"). No frozen intent changed: the empty state is still `/campaigns`' body when the program has no campaigns.

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e campaign-` (the packet's VERIFICATION command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `Monorepo guardrails passed.`, with the same four pre-existing type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen warnings are pre-existing and in files this layer did not touch.
- `pnpm test:e2e:list campaign-` — **PASS**, exit 0. `Total: 19 tests in 6 files`.
- `pnpm test:e2e campaign-` — **PASS**, exit 0. `19 passed (1.7m)` — the four role setup projects plus fifteen spec tests.
- Manual visual check (not part of the gate): the local dev server was booted, a throwaway campaign was created through the route, and `/campaigns`, `/campaigns/new` and `/campaigns/<id>` were captured at 1440px light, 1440px dark and 390px light. The phone table fits all three columns without clipping after the cell padding was tightened; the `CANCELLED` pill reads distinctly from `ACTIVE`/`COMPLETED` in both themes. The throwaway row was deleted afterwards.

**Spec tests added (`campaign-campaigns.spec.ts`):**
- `the campaign list — an Admin with no campaigns › shows the Create campaign empty state`
- `the new-campaign form — an Admin › creates a campaign in DRAFT and lands on its detail page`
- `the campaign list — an Admin with a campaign › lists the campaign with its status and links to the detail`
- `the campaign lifecycle — an Admin › starts a DRAFT campaign and offers Complete and Cancel`
- `the campaign lifecycle — an Admin › completes an ACTIVE campaign and offers no further action`
- `the campaign lifecycle — an Admin › cancels an ACTIVE campaign and offers no further action`
- `the campaign lifecycle — an Admin › shows the server's 409 message and keeps the rendered status`
- `the campaign detail — an Admin with an absent id › lands on the not-found page, not a blank detail`
- `the campaign surfaces — a Volunteer with no caller profile › is refused at the create form and at a campaign detail`

**Spec tests kept (`campaign-surfaces.spec.ts`):**
- `the Campaign overview — admin › shows the Overview title, the New campaign action and the admin sub-nav`
- `the Campaign overview — preacher › shows the Overview title, the New campaign action and the admin sub-nav`
- `the Campaign overview — assistant › shows the Overview title, the New campaign action and the admin sub-nav`
- `the Campaign overview — a Volunteer with no caller profile › is refused and never shows the admin surface`
- `the Campaign assignments — a staff member with no caller profile › is refused`
- `the Campaign assignments — a Volunteer with an active caller profile › shows the Assignments tab and an actionable empty queue`

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `campaign-`, and the full suite belongs to the join layer.
- `pnpm test:e2e:determinism` was not run. The repository defers it to Epic 4, Story 4.2, and this spec is self-contained: every row it creates is deleted, and the program's campaign table is empty after the run.
- `pnpm test:airtable-removal` was not run. It is a known pre-existing failure on this branch and is unrelated to these files.

**Post-run state:** `dialer_campaigns`, `dialer_callers` and `dialer_assignments` hold zero rows.

## What this layer does not prove

- **The form's server-side refusal path is implemented but not exercised in the browser.** `invalid_name`, `invalid_gap_duration` and `invalid_max_attempts` are asserted at the route by the API layer's sweep; the UI's "keep the values, show the message" branch has no e2e row, and a client-detectable mistake (empty name, gap 4) never reaches the server.
- **The in-flight disabled state is implemented but not asserted.** The submit button disables on `isSubmitting`; no test holds the request open long enough to check it.
- **A foreign program's campaign id is not exercised at the UI.** The absent-id path is; `getCampaign`'s program predicate is proven at the service layer, not here.
- **The unauthenticated `401` redirect is not asserted for the two new routes.** `/login?redirect=/campaigns/new` and `/login?redirect=/campaigns/<id>` exist in code; the 1.3 spec does not cover an unauthenticated visit either, and no spec in this filter does.
- **List ordering and paging are not asserted.** The service orders by `campaign_date` descending; a run with more than one row does not prove the order, and the 1,000-row pager is the service layer's contract.
- **Dark mode and the 390px layout were checked by screenshot, not by an assertion.** No theme or mobile spec covers the campaign surfaces yet.
- **`DRAFT → CANCELLED` is unreachable from the UI** by design (Human Decision 7). If a draft should be cancellable, the matrix and this spec's cancel test change together.
