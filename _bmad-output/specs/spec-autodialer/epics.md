---
status: final
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/specs/spec-autodialer/SPEC.md
  - _bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md
  - _bmad-output/specs/spec-autodialer/architecture.md
  - _bmad-output/specs/spec-autodialer/data-model.md
  - _bmad-output/specs/spec-autodialer/calling-mechanism.md
  - _bmad-output/specs/spec-autodialer/ux-flows.md
  - _bmad-output/specs/spec-autodialer/design-coverage.md
  - _bmad-output/specs/spec-autodialer/parity-matrix.md
  - _bmad-output/specs/spec-autodialer/diagrams.md
  - _bmad-output/specs/spec-autodialer/reviews/review-adversarial.md
  - _bmad-output/specs/spec-autodialer/reviews/review-reality.md
  - _bmad-output/specs/spec-autodialer/reviews/review-rubric.md
  - _bmad-output/specs/spec-autodialer/reviews/review-security.md
  - _bmad-output/E-Assets/page-designs/campaign.figcraft
  - AGENTS.md
  - docs/architecture/testing.md
  - _bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md
  - docs/claiming-a-matrix-row.md
outputLocationNote: >-
  Written to the spec folder, not _bmad-output/planning-artifacts/epics.md.
  planning-artifacts/epics.md is the pre-existing whole-project breakdown for the
  retired Airtable-era plan; overwriting it would destroy user work. Every
  recent spec in this repo keeps its breakdown beside its SPEC (for example
  spec-contacts-premium-grid/epics.md).
validation:
  fr_coverage: pass
  ux_dr_coverage: pass
  nfr_coverage: pass
  story_quality: pass
  story_dependencies: pass
  epic_independence: pass
  file_churn: pass
  open_checks: none
---

# folk_hkmc — FOLK Autodialer / Campaign — Epic Breakdown

## Overview

This is the epic and story decomposition for `SPEC-autodialer`: the Campaign
surface and the caller call session in `folk_hkmc`, built as a `folk`-only
vertical slice. It turns nine capabilities (`CAP-1`…`CAP-9`), sixteen binding
architecture decisions (`AD-1`…`AD-16`), and the design coverage contract into
stories a dev agent can implement and verify one at a time.

**Source shape.** There is no current PRD/Architecture/UX trio for this work.
The contract is spec-shaped, and the mapping is:

| This document | Source of truth |
|---|---|
| Functional Requirements | `SPEC.md` § Capabilities and § Constraints |
| NonFunctional Requirements | `SPEC.md` § Constraints/§ Non-goals; `ARCHITECTURE-SPINE.md` AD-1…AD-16 |
| Additional Requirements | `ARCHITECTURE-SPINE.md`, `data-model.md`, `calling-mechanism.md` |
| UX Design Requirements | `ux-flows.md`, `design-coverage.md`, and the live `campaign.figcraft` frames |
| Test policy | `AGENTS.md`, `docs/architecture/testing.md`, `matrix-coverage-map.md`, `docs/claiming-a-matrix-row.md` |

### Decisions recorded before epics (Dwaraka, 2026-10-25)

| # | Decision | Consequence carried into stories |
|---|---|---|
| D1 | The session summary and recall are **caller-grain**, not campaign-grain. | A scoped caller-summary read (or a caller-scoped block in the queue payload) is required; recall touches only the caller's own `NOT_REACHABLE` assignments. `campaign_progress` stays campaign-grain and is not repurposed. |
| D2 | `dialer_contact_profiles` is **data-only in v1**: no editor, no `/manage` fields. | Facets derive from existing rows and degrade to an empty option list. Populating the four fields is deferred and explicitly not a story. |
| D3 | Mobile reports **add Confirmed** and state that they are a reduced view. | Frame 1968 gains the Confirmed stat; mix and recent activity remain desktop detail with a visible reduced-view statement. |
| D4 | Four epics, as presented. | The full suite executes at two points only: Story 1.3 (shared header) and the Epic 4 release gate. The release gate's determinism run is two back-to-back full executions, so the feature pays four full-suite executions in total — never one per story. |

**Design authority.** `_bmad-output/E-Assets/page-designs/campaign.figcraft`
(open in FigCraft as **FOLK Campaign — design set**) is the final UI authority
for layout, navigation, labels and visible states. It wins on those; the spec
wins on capabilities, data, security and backend behaviour. A state the design
does not show is a **design omission**, not a descope; `design-coverage.md` is
the frame-by-frame record and every omission is carried as a UX-DR below.

### FigCraft screen index (linked, not paraphrased)

Machine links resolve through the FigCraft MCP resource
`figcraft://node/{id}`. Human links are the same frame opened in the live
document. Page names and frame ids are from the open document, not from a
summary.

**Page: Desktop — Campaign**

| Link | Frame | What it settles |
|---|---|---|
| [`figcraft://node/32`](figcraft://node/32) | **Campaign — Campaigns (light)** | Campaign nav pill, Overview/Callers/Reports sub-nav, five stat cards including Confirmed, campaign table with `CANCELLED`, no row actions |
| [`figcraft://node/212`](figcraft://node/212) | **Campaign — New campaign & survey (light)** | Name, description, end date, survey builder with `Add question`, `Next`; no seeded status question |
| [`figcraft://node/324`](figcraft://node/324) | **Campaign — Assign contacts (light, desktop only)** | Contact grid, desktop-only selection, weighted multi-caller split, conflict warning, `Assign 120 contacts` |
| [`figcraft://node/645`](figcraft://node/645) | **Campaign — Callers (light)** | Roster only; no add/invite/import; all-roles copy; active/inactive |
| [`figcraft://node/790`](figcraft://node/790) | **Campaign — Reports (light)** | Four-bucket funnel with amber Never attempted, outcome mix, leaderboard disclaimer, recent activity, Export CSV |
| [`figcraft://node/961`](figcraft://node/961) | **Campaign — Campaigns (dark)** | Dark-theme parity for 32 |
| [`figcraft://node/1141`](figcraft://node/1141) | **Campaign — Reports (dark)** | Dark-theme parity for 790 |

**Page: Mobile — Campaign**

| Link | Frame | What it settles |
|---|---|---|
| [`figcraft://node/1752`](figcraft://node/1752) | **Campaign (phone) — Overview** | Admin stats, active campaign cards, Campaign bottom-nav item |
| [`figcraft://node/1968`](figcraft://node/1968) | **Campaign (phone) — Reports** | Mobile funnel and leaderboard, Export CSV |
| [`figcraft://node/2068`](figcraft://node/2068) | **Campaign (phone) — Overview (dark)** | Dark-theme parity for 1752 |
| [`figcraft://node/2217`](figcraft://node/2217) | **Campaign (phone) — Menu** | Overview / Assignments / Callers / Reports navigation |
| [`figcraft://node/2263`](figcraft://node/2263) | **Campaign (phone) — Assignments** | Caller call card: campaign context, progress, Queue entry, phone + Copy, history, `Call Priya` |
| [`figcraft://node/2360`](figcraft://node/2360) | **Campaign (phone) — Queue** | Queue list: `showing 12 of 487`, session counts, current `← you`, tap to jump |
| [`figcraft://node/2456`](figcraft://node/2456) | **Campaign (phone) — Disposition** | `How did it go?`, required Status chips, Notes, `Save & continue` |
| [`figcraft://node/2639`](figcraft://node/2639) | **Campaign (phone) — Callers** | Mobile caller roster |
| [`figcraft://node/2737`](figcraft://node/2737) | **Campaign (phone) — Assignments** | Second call-card state for Sanjay K; **known defect:** button label still reads `Call Priya` |

**Reference frames** (`References` page, ids 8–29) are screenshots of the
existing `/manage` surfaces and headers. They are context for app chrome, not
new UI to build. They are deliberately not linked per story.

---

## Requirements Inventory

### Functional Requirements

**CAP-1 — Caller access to their own queue**

- **FR1** — A signed-in staff member with an active `dialer_callers` profile can open `/campaigns/assignments` and receives only their own `PENDING` assignments on `ACTIVE` campaigns, scoped to their program.
- **FR2** — Every caller read resolves `dialer_assignments → dialer_callers` by `caller_id`, `user_id = staff.userId` and `program_id`; a missing assignment and another caller's assignment both return `404` with no row and no id.
- **FR3** — A caller with no prior configuration lands on a usable queue once assigned; there is no separate caller setup, invite or activation step.
- **FR4** — The caller id used by any read or write comes from `getStaffContext()`, never from the request payload.

**CAP-2 — Campaigns with a call-outcome survey**

- **FR5** — An Admin, Preacher or Assistant can create a campaign with name, description, campaign date/time, gap duration (5–300 s), and `max_attempts` (1–10); it is created in `DRAFT`.
- **FR6** — Campaign detail shows the campaign's identity, status, survey, assignments and progress, and offers exactly the lifecycle actions legal from its current status.
- **FR7** — The only lifecycle transitions are `DRAFT → ACTIVE`, `ACTIVE → COMPLETED`, `ACTIVE → CANCELLED`, `DRAFT → CANCELLED`; `COMPLETED` and `CANCELLED` are terminal in v1, and nothing auto-activates or auto-completes.
- **FR8** — A campaign's survey is free-form: `TEXT`, `DROPDOWN`, `RADIO`, `MULTI_SELECT`, `DATE` questions with ordered options; a choice question with zero options is rejected; `is_required` is enforced; a question with responses is retired, never deleted.
- **FR9** — Assignments and survey edits are allowed in `DRAFT`; the queue offers only `PENDING` assignments on `ACTIVE` campaigns; a disposition, Skip or recall against any non-`ACTIVE` campaign returns a terminal `409`.
- **FR10** — The target audience is selected at assignment time from `dialer_contact_profiles` facets; no `audience_filter` is stored on the campaign.

**CAP-3 — Contact universe**

- **FR11** — The Campaign surface reuses the existing `contacts` table and `/manage` create/edit; it creates no contacts, keeps no second contact store, and has no contact CSV import/export in v1.
- **FR12** — `dialer_contact_profiles` adds exactly `centre`, `level`, `gender`, `language` (all nullable) plus `program_id`; a contact with no profile row is fully callable.

**CAP-4 — Caller roster**

- **FR13** — The Callers screen lists the roster in the viewer's scope with per-campaign performance: Admin = the program; Preacher = staff whose `assigned_preacher_id` is the Preacher, plus themselves; Assistant = their preacher's assignees, plus themselves.
- **FR14** — Any staff role can be a caller; there is no invite, add or import control, and no dialer path creates `public.users` or `auth.users`.
- **FR15** — First assignment of an eligible staff user auto-promotes them to a `dialer_callers` row with `promoted_by` = assigner; an existing inactive caller is refused, never reactivated.
- **FR16** — An Admin can deactivate a caller; an inactive caller disappears from assignment pickers and is refused at the disposition write; history is retained.
- **FR17** — The roster and assignment picker exclude inactive callers and anyone outside the viewer's assignable set.

**CAP-5 — Batch assignment with conflict detection**

- **FR18** — An admin-surface user can select contacts in their scope, choose a campaign and one or more callers, and request a batch assignment.
- **FR19** — Before any write, the server names every selected contact already assigned in that campaign; the assigner chooses **skip** or **move**; nothing is written until that choice.
- **FR20** — The write is one transaction: it re-runs the pre-check, inserts exactly the confirmed set, and reports offending rows by name with no partial success.
- **FR21** — `unique (contact_id, campaign_id)` makes assignment a move, never a second row for the same contact in one campaign.
- **FR22** — Weights distribute `N = selected − skipped` by floor division plus largest remainder (ties: higher weight, then list order); counts are whole numbers summing to `N`; no weight is stored.
- **FR23** — A destination caller outside the assigner's assignable set is rejected by name, not silently dropped.
- **FR24** — The assignment grid offers pagination-aware selection with an explicit hidden-selected count, and facets derived from the whole contact set, not the current page.

**CAP-6 — The call session**

- **FR25** — The caller session has one primary action per phase, labelled with its consequence: `Call <name>` → `I'm back` → `Save & continue` → `Next call in Ns`.
- **FR26** — The call action opens `tel:` and copies the number to the clipboard; an empty phone number produces a visible failure, never silence.
- **FR27** — The queue shows the whole queue with the current row marked, the next row below it, and jump-to-row; it is a virtualised window with an honest `Showing X of Y` count.
- **FR28** — Gap duration is per campaign (5–300 s; presets 5/10/20/30/60; default 20), admin-settable, derived from `Date.now()` against a target timestamp, gates the call button rather than navigation, and renders a visible countdown.
- **FR29** — Pause, Skip and the campaign-switch notice are reachable from every live state; Pause reads as a normal state; Skip writes `SKIPPED` and is bounded; the notice is awaited, pauses the gap and blocks the next call until dismissed.
- **FR30** — The session summary reports what the session achieved and offers to re-queue the caller's own `NOT_REACHABLE` assignments within `max_attempts`; a reached contact and `WRONG_NUMBER` are never re-queued; at the cap the contact shows closed after N attempts.
- **FR31** — A second tab on the same queue is refused loudly; `unique (assignment_id, attempt)` is the database guarantee.
- **FR32** — Session position and the in-flight draft survive a reload or tab loss: same contact, same answers, resumed from the URL plus a re-fetch.
- **FR33** — The call card shows the contact's last N prior calls across campaigns in the program, read-only and contact-scoped, directly above the call button.

**CAP-7 — Call disposition that never loses data**

- **FR34** — The disposition screen records exactly one `disposition_status` from the design's 13 chips plus notes; notes always render; the campaign survey renders only for a reached call (`status_group` not `NOT_REACHABLE`/`WRONG_NUMBER`).
- **FR35** — `Save & continue` commits in one transaction: call log (with `dial_phone` snapshot), survey responses and assignment status; idempotent on `(assignment_id, attempt)`; same payload `200`, different payload `409`, never `500`.
- **FR36** — The disposition screen shows a persistent receipt: `Saving…`, `Saved HH:MM`, `Queued — will send`, or `Save failed — session paused`.
- **FR37** — A failed save keeps every answer and pauses the session; a queued write is a success state; a network gap never produces a false `Save failed`.
- **FR38** — A permanently refused replay (reassigned, deactivated, cancelled) returns `409` and drains the service-worker queue; the local draft survives and is surfaced next session as a call that could not be saved.
- **FR39** — Cross-tab refusal, inactive caller, reassigned assignment and cancelled campaign each render a named blocking state, pause the session and keep answers.

**CAP-8 — Reporting and export**

- **FR40** — One `campaign_progress` read returns the funnel (Assigned, Attempted, Reached, Confirmed, Never attempted), outcome mix by `status_group`, per-caller rollup, the session-summary counts, and recent activity.
- **FR41** — Reporting is scoped exactly as assignment is; a Preacher or Assistant never widens to program scope; a scope with no id returns zero rows, never program scope.
- **FR42** — The reports screen shows the funnel with Never attempted distinct, the outcome mix, a caller leaderboard ranked on completed attempts with no quality claim, and recent activity; `Export CSV` downloads the same numbers.
- **FR43** — A queued disposition is not counted until its replay lands.

**CAP-9 — Intuitive by default**

- **FR44** — Every empty state names the next action: no campaigns → create one; no assignments → ask an admin; empty queue → the summary; no report data → the action that creates data.
- **FR45** — The header Campaign item is visible to Admin/Preacher/Assistant always (`/campaigns`) and to a Volunteer only with an active caller profile (`/campaigns/assignments`); the Assignments sub-nav item appears only for an active caller.
- **FR46** — An Assistant who cannot correct a wrong number sees `Ask an Admin or Preacher`, not a control that fails.
- **FR47** — Every Campaign control is labelled and keyboard-reachable; paused, queued and failed states are communicated in text, not colour alone.

### Non-Functional Requirements

- **NFR1 — Program scope is absolute.** `program_id` on every dialer row; no query, export or assertion crosses programs. `folk` only in v1: no Campaign route exists under `apps/gita-life`; `modules.dialer` hides the shared nav item only and is never the authorization gate.
- **NFR2 — Server-enforced authorization.** Every mutation passes `getStaffContext()` + `requireRole()` + a scope assertion. Writes are `service_role` only; there is no client-side Supabase write anywhere.
- **NFR3 — The caller boundary is asserted, never implied.** `assertCallerAssignmentInScope` returns `404` for both a missing and a foreign assignment; the denial sweep asserts three cases per route; a static route-coverage guardrail runs in `pnpm guardrails`.
- **NFR4 — RLS is defence in depth.** All eight dialer tables have RLS enabled through the existing `caller_role()` / `caller_program_id()` / `caller_assigned_preacher_id()` helpers; authenticated receives `SELECT` only; the `rls-policy-matrix.md` row lands in the same commit as the migration.
- **NFR5 — Every list read pages and fails loudly.** One shared pager (extracted from `collectPagedRows`) concatenates pages and throws when its page budget is exhausted rather than returning a short list. PostgREST caps at 1,000 rows and folk holds about 1,030 contacts.
- **NFR6 — No new runtime service.** No cron, worker, job queue or telephony provider. Recall and export are request-time actions. Credentials are read only through server-only modules; `turbo.json` build env is not widened.
- **NFR7 — The session stays responsive.** The queue is a virtualised window; a 300–500 contact queue must not jank on advance. Counts are exact, and a slow response is discarded rather than painted over a newer one.
- **NFR8 — Data integrity is transactional.** One transactional disposition; a landed attempt is immutable; campaigns are cancelled, never deleted; questions with responses are retired, never deleted; FKs are `ON DELETE RESTRICT` where history would be destroyed.
- **NFR9 — Reporting is computed once.** One `campaign_progress` function is the only source of funnel, mix, rollup, summary and activity numbers. No screen recomputes a definition differently.
- **NFR10 — Offline is the disposition write, not the app shell.** Only `/api/dialer/caller/disposition` joins Background Sync; `sw.js` drains on `ok || 409`; no app-shell offline promise.
- **NFR11 — Verification is demonstration, not build success.** `pnpm typecheck:workspace` and `pnpm guardrails` are the gates; `next build` ignores type errors. E2E is local-only, one runner at a time; CI does not run e2e. Gates are never weakened to pass.
- **NFR12 — Migration discipline.** One additive timestamped migration; `lib/supabase/types.ts` regenerated; no `DELETE` granted to any role.
- **NFR13 — UI follows repo conventions and design tokens.** The manual-form pattern (`useState` + hand-written handlers + `fetch`; no `react-hook-form` or `zod`); `@/*` imports; double quotes in app/feature code; no hardcoded colours; no dynamic SQL, ever.
- **NFR14 — Legibility and accessibility.** Real contrast in both themes; every control labelled and keyboard-reachable; paused/queued/failed states are not colour-only.
- **NFR15 — Test economy.** No duplicate e2e coverage of surfaces already covered by the 27 existing specs, the 19-row matrix, or the gate scripts. Campaign stories run only the campaign filter plus the narrowest existing spec affected by the change.
- **NFR16 — No production action.** Never run a production deploy or touch production secrets for this feature; production is owner-controlled.

### Additional Requirements

- **AR1 — `ARCHITECTURE-SPINE.md` is binding.** `AD-1`…`AD-16` are the architecture contract; when the narrative (`architecture.md`) and the spine disagree, the spine wins.
- **AR2 — No starter template.** This is brownfield work inside an existing Next.js 16 App Router monorepo; there is no greenfield scaffold step.
- **AR3 — One route tree and a split API.** Browser routes live under `apps/folk/app/campaigns/**`; handlers under `apps/folk/app/api/dialer/caller/**` and `apps/folk/app/api/dialer/admin/**`; `/dialer` does not exist. Each handler is a thin delegate over `lib/dialer/api-handlers.ts` with `export const dynamic = "force-dynamic"`.
- **AR4 — App-level proxy matchers.** Add `/campaigns/:path*` and `/api/dialer/:path*` to `apps/folk/proxy.ts` **and** `apps/gita-life/proxy.ts` (Next reads the app-level file), keeping the root `proxy.ts` handler and matcher in sync. A root-only edit refreshes nothing.
- **AR5 — One service worker.** `apps/*/public` are symlinks to the root `public/`. Add `/campaigns` to `NETWORK_ONLY_PATH_PREFIXES` and `/api/dialer/caller/disposition` to `QUEUED_POST_PATHS` in the one root `public/sw.js`.
- **AR6 — `modules.dialer` is a type change.** Add `dialer: boolean` to `packages/program-config/src/types.ts` and both program profiles (`true` folk, `false` gita-life). This is the first live read of any `modules` flag; it gates rendering only.
- **AR7 — Schema and generated artefacts land together.** Migration + `rls-policy-matrix.md` row + regenerated `lib/supabase/types.ts` in one commit.
- **AR8 — Static guardrail.** `scripts/verify-dialer-route-coverage.mjs` enumerates every route under `apps/folk/app/api/dialer/**` and fails inside `pnpm guardrails` when one has no denial-sweep row.
- **AR9 — Test harness additions.** Add an `assistant` role to `e2e/fixtures/roles.ts`, a `setup-assistant` Playwright project, and a `test:e2e:campaign` script. The seeder already writes an Assistant (`suresh.kannan@folk.fixture.test`), so this is wiring, not new seed data.
- **AR10 — `/manage` delete collision.** `dialer_assignments.contact_id` is `ON DELETE RESTRICT`; `lib/supabase/manage.ts` currently maps **any** foreign-key violation (`23503`) to "has attendance". Distinguish dialer history from attendance history without weakening or breaking `manage-contacts-row-lifecycle.spec.ts`, which pins the current 409 message.
- **AR11 — Schema constraints.** `(assignment_id, attempt)` and `(contact_id, campaign_id)` are unique; `status_group` is a stored generated column whose `CASE` is total over the 13 chips; both RPCs are `SECURITY INVOKER`, `SET search_path = public, pg_temp`, revoked from `PUBLIC`/`anon`/`authenticated` and granted to `service_role` only.
- **AR12 — Deferred and out of scope.** CAP-10 campaign assistant, CAP-11 member RSVP, telephony provider, app-shell offline, contact CSV import/export, phone admin contact grid, audit trail, dialer in gita-life, survey drag-and-drop, native clients. The Next 16.0.7 CVE upgrade is a separate repo change and is explicitly not in this feature.
- **AR13 — Design coverage.** `design-coverage.md` is the frame-by-frame record; the 13 "required omissions to restore" are binding UX work, and the four design defects it lists are corrected in code, not copied.
- **AR14 — No production surface.** `apps/gita-life` gains only the matcher line and the hidden nav flag. No campaign page, API, seed or test target exists there.

### UX Design Requirements

- **UX-DR1** — The disposition is a dedicated screen, never a floating window, dialog, or second route; the save receipt is always visible on it (`ux-flows.md` §1).
- **UX-DR2** — The queue opens over the call card as a full-screen drawer/list; the current row is marked `← you`, the next row is immediately below it, and every row is tappable to jump (`ux-flows.md` §2).
- **UX-DR3** — One primary action per phase, and its label states the consequence. No control whose meaning changes invisibly (`ux-flows.md` §3, source defect: "Call Now" silently means skip).
- **UX-DR4** — Skip and Pause live in the call-card header, are always present and bounded, and Skip writes `SKIPPED`; Paused reads as a normal state, not an error (`ux-flows.md` §3/§4).
- **UX-DR5** — The call action copies the number before the `tel:` handoff, the call button pins above the phone's bottom chrome, and an empty number is a visible failure (`ux-flows.md` §3; `calling-mechanism.md`).
- **UX-DR6** — The history panel shows the last N prior calls for this contact across campaigns, read-only, contact-scoped, directly above the call button (`ux-flows.md` §3).
- **UX-DR7** — The summary screen reports session counts and offers `Re-queue those N and continue` plus `Done — back to my queue`; only `NOT_REACHABLE` is eligible; the attempt cap is explicit (`ux-flows.md` §3a).
- **UX-DR8** — A campaign-switch notice names the incoming campaign and date, is awaited, pauses the gap and blocks the next call until dismissed (`ux-flows.md` §5).
- **UX-DR9** — Assignment conflicts are a readable list the admin acts on; the primary button's count is the count that will actually be assigned; the admin chooses skip or move (`ux-flows.md` §6).
- **UX-DR10** — Pagination-aware bulk selection shows `Showing X–Y of N`, a hidden-selected indicator, and facets derived from the whole set, not the current page (`ux-flows.md` §7).
- **UX-DR11** — Every empty state names the next action; no screen of zeroes and no silent failure (`ux-flows.md` §11).
- **UX-DR12** — The campaign survey renders only for a reached call; notes always render; the required marker is enforced or not rendered (`ux-flows.md` §10).
- **UX-DR13** — A question with responses offers Retire, not Delete; a zero-response question may be deleted and says so (`ux-flows.md` §10a).
- **UX-DR14** — Progressive detail: name, number and outcome are primary; profile fields stay one tap away (`ux-flows.md` §9).
- **UX-DR15** — The layout is phone-first for callers and desktop for admins; a tablet uses the phone layout, and there is no desktop caller layout (`ux-flows.md` §2; `SPEC.md` assumptions).
- **UX-DR16** — The 13 disposition chips are the stored data model and use the design's exact labels (`CONFIRMED` … `NOT_INTERESTED — do not call again`) — frame 2456.
- **UX-DR17** — Lifecycle controls: one **Start campaign** for a `DRAFT`; explicit Complete/Cancel for `ACTIVE`; a never-started campaign never looks like a live campaign with an empty queue (design omission 12).
- **UX-DR18** — The campaign form exposes gap duration (5–300 s) and attempt cap; the design's 212 frame omits both (design omission; `design-coverage.md` CAP-2 partial).
- **UX-DR19** — Skip and Pause appear on the call card and Queue (design omission 2; frame 2263/2360 show neither).
- **UX-DR20** — A readable gap countdown gates the call button (design omission 3).
- **UX-DR21** — The campaign survey sits below Status on the disposition screen, conditional on a reached call (design omission 5; frame 2456 omits it).
- **UX-DR22** — Persistent `Saving…` / `Saved 12:04` / `Save failed — session paused` receipt and the keep-answers state (design omission 6).
- **UX-DR23** — Session summary and re-queue screen (design omission 7).
- **UX-DR24** — Empty states for no campaigns, no assignments and an empty queue, each actionable (design omission 8).
- **UX-DR25** — Resume session after tab loss: return to the same contact and keep the in-flight disposition (design omission 9).
- **UX-DR26** — `Queued — will send` offline receipt, never a false `Save failed` (design omission 10).
- **UX-DR27** — Loud, explicit cross-tab refusal, deactivated caller and reassignment `403`/`409` states (design omission 11).
- **UX-DR28** — Non-caller navigation: a Volunteer without an active caller profile sees no Campaign item rather than a 403; an admin without a caller profile sees no Assignments item; an Assistant sees `Ask an Admin or Preacher` for a wrong number (design omission 13).
- **UX-DR29** — Dark-theme parity for frames 32→961, 790→1141, 1752→2068 comes from existing tokens; no per-screen dark overrides.
- **UX-DR30** — Mobile reporting adds the Confirmed stat and states that it is a reduced view (design defect: 1968 omits Confirmed, mix and activity).
- **UX-DR31** — The call-button label follows the current contact; frame 2737's stuck `Call Priya` label is a prototype defect, not the contract.
- **UX-DR32** — The Callers screen has no add, invite or import control (frame 645; both were removed deliberately).

### Additional Test Policy (derived from AGENTS.md, testing.md, matrix-coverage-map.md)

This is not a requirement to re-derive; it is the rule every story's
`Verification` section must obey.

- **TP1** — `pnpm test` runs zero tests and exits 0. It is never a test run and is never reported as one.
- **TP2** — Gate order per story: `pnpm typecheck:workspace` → `pnpm lint` → `pnpm guardrails` → the narrowest e2e filter. `pnpm test:static` may replace the first three.
- **TP3** — E2E always runs through `pnpm test:e2e` or a `test:e2e:*` script. Never `pnpm exec playwright test`; the readiness gate lives in the script.
- **TP4** — Filter with a regex, never a glob. `pnpm test:e2e campaign-callers` selects tests; `... "e2e/specs/campaign-*.spec.ts"` selects nothing and exits 0.
- **TP5** — Check scope with `pnpm test:e2e:list <filter>` first; it starts no browser and costs seconds.
- **TP6** — One runner at a time; every spec shares one seeded database.
- **TP7** — Do not duplicate existing coverage. `manage-contacts-*`, `grid-*`, `theme-switch`, `smoke`, `record-review-*`, `harness-guards`, `mailpit-reader` and the 19-row matrix are already covered; a campaign story may run them only when it changes one of their source files, and then only the narrowest affected filter.
- **TP8** — Do not add a new test for sign-in/OTP, theme switching, `/manage` grid behaviour, contact CRUD, or the 19-row matrix. Reuse `e2e/fixtures/auth.ts`, `roles.ts`, `manage-grid.ts` and `bulk-contacts.ts`.
- **TP9** — A story that touches `components/header.tsx`, `components/providers.tsx`, `lib/authz.ts`, `lib/supabase/*`, `proxy.ts`/`apps/*/proxy.ts`, or a shared `components/ui/*` primitive escalates to full `pnpm test:e2e` (~5–7 min) — once, in that story, not per story.
- **TP10** — A story that edits specs, fixtures or `playwright.config.ts` runs `pnpm test:e2e:determinism` once (~12 min). For this feature the run is deliberately deferred to Story 4.2 because Story 1.3's full run immediately exercises the changed harness and the release gate runs determinism over the accumulated suite; story 1.2 records the deferral. Do not run it for product-code-only stories, and do not run it per story.
- **TP11** — Never leave a deliberately broken spec under `e2e/specs/`. A failing row is recorded as failing with a `test.fail` tripwire and its reason; the day it passes, remove the marker **and** update `matrix-coverage-map.md` in the same commit.
- **TP12** — A story adds its denial-sweep row in the same commit as its route, or `pnpm guardrails` fails. Do not defer the row to the closing story.
- **TP13** — Report actual commands and real pass counts; name any pre-existing failure (`test:airtable-removal` 3/30; rows 17/18 and 18 `grid-*` tests per `testing.md` §6) rather than fixing the gate.
- **TP14** — Never weaken `package.json` or `playwright.config.ts` assertions to make a run green; the suite asserts them as text on purpose.
- **TP15** — Tests are campaign-scoped: `e2e/specs/campaign-*.spec.ts` plus `e2e/specs/dialer-route-sweep.spec.ts`. Do not add campaign rows to the 19-row manage matrix; that map claims only story 2's rows.

---

## FR Coverage Map

| FR | Epic | What the epic delivers |
|---|---|---|
| FR1 | Epic 2 | Caller opens Assignments and receives only their own queue |
| FR2 | Epic 2 (proved in Epic 4) | Assignment→caller resolution; foreign and missing both `404` |
| FR3 | Epic 2 | First assignment is the whole caller setup |
| FR4 | Epic 2 | Caller id from `getStaffContext()`, never the payload |
| FR5 | Epic 1 | Create campaign in `DRAFT` with gap and attempt cap |
| FR6 | Epic 1 | Campaign detail with only the legal lifecycle actions |
| FR7 | Epic 1 | The four transitions; terminal states; no auto-transition |
| FR8 | Epic 1 | Free-form survey builder, options table, retire, required enforced |
| FR9 | Epic 1 | Prepare while `DRAFT`; queue only on `ACTIVE`; terminal `409` |
| FR10 | Epic 1 | Audience chosen at assignment time; no stored filter |
| FR11 | Epic 1 | Reuse `contacts` and `/manage`; no contact CSV |
| FR12 | Epic 1 | Four nullable enrichment fields; no profile still callable |
| FR13 | Epic 1 | Roster scoped per role, including Preacher/Assistant self |
| FR14 | Epic 1 | Any staff role is a caller; no invite/add/import |
| FR15 | Epic 1 | Auto-promote on first assignment; never reactivate |
| FR16 | Epic 1 | Admin deactivation; picker exclusion and write refusal |
| FR17 | Epic 1 | Inactive and out-of-scope callers excluded everywhere |
| FR18 | Epic 1 | Select scoped contacts, campaign, one or more callers |
| FR19 | Epic 1 | Conflict list before any write; skip or move |
| FR20 | Epic 1 | One transaction, no partial success, offenders named |
| FR21 | Epic 1 | `unique (contact_id, campaign_id)` makes assignment a move |
| FR22 | Epic 1 | Weighted floor + largest remainder; counts sum to N |
| FR23 | Epic 1 | Out-of-set caller rejected by name |
| FR24 | Epic 1 | Paged selection, hidden-selected count, whole-set facets |
| FR25 | Epic 2 | One primary action per phase, consequence-named |
| FR26 | Epic 2 | `tel:` + clipboard; empty number is a visible failure |
| FR27 | Epic 2 | Whole queue, current/next, jump, virtualised, honest count |
| FR28 | Epic 2 | Per-campaign gap from `Date.now()`, gates the call button |
| FR29 | Epic 2 | Pause, bounded Skip writing `SKIPPED`, awaited switch notice |
| FR30 | Epic 2 (proved in Epic 4) | Summary counts; caller-grain recall within `max_attempts` |
| FR31 | Epic 2 | Second tab refused; `(assignment_id, attempt)` guarantee |
| FR32 | Epic 2 | URL position + refetch; draft survives reload |
| FR33 | Epic 2 | Last N cross-campaign contact history above the call button |
| FR34 | Epic 2 | 13 chips + notes always + survey only when reached |
| FR35 | Epic 2 | One transactional, idempotent disposition write |
| FR36 | Epic 2 | Persistent `Saving…`/`Saved`/`Queued`/`Save failed` receipt |
| FR37 | Epic 2 | Failed save keeps answers and pauses; queued is success |
| FR38 | Epic 2 (proved in Epic 4) | Terminal `409` drains the queue; draft survives |
| FR39 | Epic 2 (proved in Epic 4) | Named blocking states pause without discarding answers |
| FR40 | Epic 1 (function), Epic 3 (screen) | One `campaign_progress`; funnel consumed by Overview and Reports |
| FR41 | Epic 1 (scope), Epic 3 (consumption) | Same predicate everywhere; no-id scope is zero rows |
| FR42 | Epic 3 | Funnel, mix, leaderboard, activity, CSV |
| FR43 | Epic 1 (contract), Epic 3 (display) | Queued dispositions excluded until replay |
| FR44 | Epic 1 (admin), Epic 2 (caller), Epic 3 (report) | Every empty state names the next action |
| FR45 | Epic 1 (nav), Epic 2 (real Volunteer entry) | Role/caller-profile-resolved header and sub-nav |
| FR46 | Epic 2 (proved in Epic 4) | `Ask an Admin or Preacher` wrong-number state |
| FR47 | Epic 1 (admin), Epic 2 (caller), Epic 3 (report) | Labelled, keyboard-reachable, text-not-colour states |

No FR is unmapped. FR2, FR30, FR38, FR39, FR45 and FR46 are implemented in
their primary epic and re-proved in Epic 4, which is the release gate.

## Epic List

### Epic 1: An admin can prepare a campaign and put it in callers' hands

A staff Admin, Preacher or Assistant signs in and finds Campaign as a
first-class destination. They create a campaign with a free-form survey, a gap
duration and an attempt cap; they assign a scoped batch of contacts across one
or more callers, see every conflict named before anything is written, and start
the campaign. The Overview shows live funnel counts from the same function the
Reports screen will later use. A Volunteer without a caller profile sees no
Campaign item; an assigned caller reaches an actionable no-queue state, not a
dead link or a 403.

**FRs covered:** FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15,
FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR40, FR41, FR43, FR44
(admin), FR45, FR47 (admin).

**Notes.** This epic owns the one-time foundation: the eight-table migration,
generated `status_group`, RLS and matrix row, regenerated types, `lib/dialer/`
scope and handlers, the static route-coverage guardrail, and the nav/proxy/sw
wiring. It is also the only story that may run the full e2e suite before the
release gate, because it edits `components/header.tsx`.

### Epic 2: A caller can work the whole queue without losing an outcome

Any staff member with an active caller profile opens Assignments and sees only
their own queue. They call through `tel:` with the number copied as fallback,
read the next person during a gap that cannot drift, skip or pause without
wedging the session, and record one of the 13 statuses plus notes and the
campaign survey when the call reached a conversation. A reload, a lost tab, an
offline gap or a refused write never discards an answer, and finishing shows
what the session achieved and offers to re-queue the caller's own unreachable
contacts.

**FRs covered:** FR1, FR2, FR3, FR4, FR25, FR26, FR27, FR28, FR29, FR30, FR31,
FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR44 (caller), FR46, FR47
(caller).

**Notes.** No desktop caller layout: a wide viewport gets the phone-first
session or an explicit open-on-phone state. The queue is caller-grain (D1);
`campaign_progress` is not repurposed. Each caller route adds its denial-sweep
row in the same commit.

### Epic 3: The team can see and export what the campaign achieved

An Admin, Preacher or Assistant opens Reports and can answer "of the 200 people
we assigned, how many were called, how many we reached, how many confirmed,
what were the outcomes, and who was never called at all" from that screen
alone, then export those exact numbers as CSV. The phone gets the same funnel
including Confirmed, with a visible statement that mix and recent activity are
desktop detail.

**FRs covered:** FR42, and the consumption half of FR40, FR41 and FR43; FR44
(report); FR47 (report).

**Notes.** Rendering and export only. `campaign_progress` was built in Epic 1
and is the sole source of every number; a CSV row and an on-screen number
cannot disagree. Does not re-count anything in the client.

### Epic 4: Trust under failure — no leak, no lost answer

The release gate. Every dialer route refuses unauthenticated requests; every
non-owning read returns `404` with no row; the owning caller succeeds. Assistant
scope is exercised, not assumed. Every named refusal state and empty state is
reached and recorded. The FigCraft frames are graded by eye at desktop and phone
in both themes. The full suite is green once at the end, and the claim is
reported with real pass counts.

**FRs verified:** FR2, FR30, FR38, FR39, FR45, FR46; NFR3 and AD-8. No new
capability is introduced here.

**Notes.** Not a place to write new feature code. A failure found here is fixed
in the owning story's files and its narrow spec, then this gate re-runs only
what the fix affects.

## Epic 1: An admin can prepare a campaign and put it in callers' hands

**Epic goal.** A staff Admin, Preacher or Assistant signs in, finds Campaign as
a first-class destination, creates a campaign with a free-form survey, a gap
duration and an attempt cap, assigns a scoped batch of contacts across one or
more callers with every conflict named before a write, starts it, and sees live
progress. A Volunteer without a caller profile never sees the item; an assigned
caller reaches an actionable state rather than a dead link.

**Requirements:** FR5–FR24, FR40, FR41, FR43, FR44 (admin), FR45, FR47 (admin);
AD-1, AD-2, AD-3, AD-8, AD-11, AD-12, AD-13, AD-14, AD-16; UX-DR9, UX-DR10,
UX-DR17, UX-DR18, UX-DR24, UX-DR28, UX-DR29, UX-DR32.

### Story 1.1: Dialer data model, generated status group, and RLS

As a staff operator,
I want campaign, caller, assignment, contact-profile, call-log and survey storage that is program-scoped and read-only to browser clients,
So that no campaign number, phone number or call outcome can cross programs or be written around the server.

**Requirements:** FR5, FR7, FR12, FR21, FR31, FR35 (schema half) · AD-4, AD-11, AD-12, AD-13, AD-14 · UX-DR16 · NFR1, NFR4, NFR8, NFR12

**Design:** no screen. The 13 stored statuses are frame 2456's chip labels; the
generated groups are the reporting buckets frame 790 renders.

**Acceptance Criteria:**

**Given** the local stack and the additive migration
**When** it is applied
**Then** seven tables exist — `dialer_campaigns`, `dialer_callers`, `dialer_assignments`, `dialer_contact_profiles`, `dialer_call_logs`, `dialer_survey_questions`, `dialer_survey_options` — each with `program_id TEXT NOT NULL` and exactly the columns in `data-model.md`
**And** `dialer_survey_responses` is deliberately not created here; story 2.3 adds it with the disposition RPC.

**Given** one of the 13 `disposition_status` values
**When** a call log is inserted
**Then** `status_group` is generated to exactly one of `CONFIRMED`, `MAY_COME`, `DEFERRED`, `NOT_REACHABLE`, `WRONG_NUMBER`, `NOT_INTERESTED`
**And** an unknown status violates the CHECK; the `CASE` is total and `status_group` is `NOT NULL`.

**Given** `(contact_id, campaign_id)`
**When** a second assignment for the same contact and campaign is inserted
**Then** the unique constraint rejects it; a move updates the existing row.

**Given** `(assignment_id, attempt)`
**When** a duplicate call log is inserted
**Then** the unique constraint rejects it; `dialer_call_logs` has `called_at` and no `updated_at`.

**Given** an authenticated or anon role
**When** it attempts `INSERT`, `UPDATE` or `DELETE` on any dialer table
**Then** the grant is absent and the statement is denied
**And** `SELECT` policies filter on `program_id = caller_program_id()` and the existing role helpers.

**Given** the migration commit
**Then** `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md` has a row for every dialer table
**And** `lib/supabase/types.ts` is regenerated and checked in.

**Given** a contact, caller, campaign or staff identity with dialer history
**When** a delete is attempted
**Then** the `ON DELETE RESTRICT` FK refuses it.

**Test scope:** `pnpm test:static`; `pnpm supabase:push` against the local stack;
`pnpm seed:local`. SQL probes for the generated column, the two unique
constraints, the six grants and the four RESTRICT FKs are recorded in the story
file. No e2e — there is no UI yet, and the full suite would prove nothing about
the schema. Do **not** run `pnpm test` (zero tests).

---

### Story 1.2: The Campaign access boundary, and a guardrail that keeps it covered

As a staff member,
I want every Campaign page and dialer endpoint to reject people outside its scope, with a static check that no route ships unlisted,
So that a caller can never enumerate another caller's queue and a forgotten guard fails the build rather than production.

**Requirements:** FR1, FR2, FR4, FR13, FR17, FR23, FR41, FR45 (boundary half) · AD-2, AD-3, AD-7, AD-8, AD-14 · UX-DR27, UX-DR28 · NFR2, NFR3

**Design:** no screen. The role/nav contract this enforces is frames 32, 1752
and 2217; the caller boundary is frame 2263.

**Acceptance Criteria:**

**Given** an unauthenticated request
**When** it reaches any `/api/dialer/**` route
**Then** it is refused (401/403) with no row and no partial payload.

**Given** a signed-in caller and another caller's assignment id
**When** they request the queue, card, history or disposition
**Then** the response is `404` with no row and no id — never `403`, so it cannot be used as an existence oracle.

**Given** the owning caller
**When** the same request is made
**Then** it succeeds and contains only that caller's row.

**Given** `requireCampaignAdmin`
**Then** it is exactly `requireRole(staff, ["Admin", "Preacher", "Assistant"])` and guards every admin page and every `/api/dialer/admin/**` handler.

**Given** `requireDialerCaller`
**Then** it resolves the `dialer_callers` row by `user_id` and `program_id`, refuses a missing profile, and refuses `is_active = false`.

**Given** `campaignScope(staff)`
**Then** Admin is program, Preacher is `staff.userId`, Assistant is `staff.assignedPreacherUserId`, and a Preacher or Assistant with no scope id is refused with 403 — never widened to program
**And** it also returns the assignable caller set described in AD-3, including the caller themselves.

**Given** `scripts/verify-dialer-route-coverage.mjs`
**When** a route file exists with no denial-sweep row
**Then** `pnpm guardrails` fails
**And** the script is verified to fail against a temporary unlisted route that is removed immediately after the check.

**Given** the denial sweep spec
**Then** every row asserts unauthenticated refused, non-owner `404` with no payload, and owning caller succeeds
**And** the sweep uses the per-role `storageState` fixtures rather than a second sign-in flow.

**Given** the e2e harness
**Then** `e2e/fixtures/roles.ts`, `e2e/auth/assistant.setup.ts` and `playwright.config.ts` add an `assistant` role
**And** `package.json` adds `test:e2e:campaign` delegating to `pnpm test:e2e campaign-`.

**Test scope:** `pnpm test:static`; `pnpm guardrails`;
`pnpm test:e2e dialer-route`; `pnpm test:e2e:list campaign-` to confirm the
filter wiring. **Determinism is deliberately deferred to Story 4.2** even though
this story edits `e2e/fixtures/roles.ts` and `playwright.config.ts`: Story 1.3's
full run immediately exercises the changed harness, and the release gate runs
determinism over the accumulated suite. Running it here would add two full
suites (~12 min) for a change the next full run already proves. Record the
deferral in the story file. Do **not** re-run `smoke` — the sweep owns denial
cases and `smoke` owns sign-in.

---

### Story 1.3: Campaign is a first-class destination, and shared chrome changes land once

As an Admin, Preacher, Assistant or assigned Volunteer,
I want Campaign in the header only when my role or caller profile can actually use it,
So that I never follow a link into a 403 and never lose the item I need.

**Requirements:** FR9 (DRAFT shell), FR11, FR44 (admin), FR45 · AD-1, AD-2, AD-14 · UX-DR11, UX-DR24, UX-DR28 · NFR1, NFR11

**Design:** [`figcraft://node/32`](figcraft://node/32) (desktop Campaign pill and
sub-nav), [`figcraft://node/1752`](figcraft://node/1752) (phone Overview + bottom
nav), [`figcraft://node/2217`](figcraft://node/2217) (phone Campaign menu),
[`figcraft://node/961`](figcraft://node/961) (dark parity). Header chrome
reference: nodes 14 and 29 on the References page.

**Acceptance Criteria:**

**Given** an Admin, Preacher or Assistant
**Then** Campaign appears in the desktop pill and the phone bottom nav with href `/campaigns`, whether or not they hold a caller profile.

**Given** a Volunteer with an active `dialer_callers` profile
**Then** Campaign appears with href `/campaigns/assignments`.

**Given** a Volunteer without an active caller profile
**Then** no Campaign item is rendered — not a disabled item, not a link that lands on 403.

**Given** an active caller
**Then** the Campaign sub-nav includes Assignments
**And** an admin without a caller profile never sees that item.

**Given** `/campaigns` with no campaigns
**Then** the empty state names the next action (`Create campaign`) and links to it.

**Given** a Volunteer who opens `/campaigns`
**Then** the page refuses them
**And** `/campaigns/assignments` without a queue renders an actionable empty state, not a blank page.

**Given** `apps/gita-life`
**Then** no Campaign route exists there, and `modules.dialer: false` hides the shared nav item in both apps.

**Given** `apps/folk/proxy.ts` and `apps/gita-life/proxy.ts`
**Then** both matchers cover `/campaigns/:path*` and `/api/dialer/:path*`
**And** the root `proxy.ts` matcher is kept in sync as the shared source.

**Given** the root `public/sw.js` (served through the symlinked `apps/*/public`)
**Then** `/campaigns` is network-only and `/api/dialer/caller/disposition` is a queued POST.

**Given** a `/manage` contact delete where dialer history is the blocker
**Then** the 409 names dialer history, not attendance
**And** the existing attendance-only message and code still hold.

**Given** the full suite
**Then** it is green, because `components/header.tsx` is a 22-surface shared component and `lib/supabase/manage.ts` changed.

**Test scope:** `pnpm test:static`; **full `pnpm test:e2e` once** (header +
`lib/supabase/*` change; this is the only mid-feature full run). The run
includes `campaign-navigation`, `smoke`, `theme-switch`,
`manage-contacts-row-lifecycle` and the Assistant setup. Do **not** add a
separate theme or nav run, and do **not** re-run the manage suite after the
full run.

---

### Story 1.4: Create a campaign, and move it through its lifecycle

As an Admin, Preacher or Assistant,
I want to create a campaign with its date, gap and attempt cap, and start, complete or cancel it explicitly,
So that nothing reaches a caller's queue until I have prepared it, and a never-started campaign never looks live.

**Requirements:** FR5, FR6, FR7, FR9 · AD-12 · UX-DR17, UX-DR18

**Design:** [`figcraft://node/212`](figcraft://node/212) (form layout, name,
description, end date, survey step), [`figcraft://node/32`](figcraft://node/32)
(campaign table and `CANCELLED` state), [`figcraft://node/1752`](figcraft://node/1752)
(phone campaign card).
**Design omissions to implement:** gap duration (5–300 s; presets 5/10/20/30/60;
default 20), `max_attempts` (1–10, default 3), and the Start/Complete/Cancel
controls (UX-DR17, UX-DR18).

**Acceptance Criteria:**

**Given** the new-campaign form
**Then** it captures name, description, campaign date/time, gap duration and max attempts
**And** the gap is settable by the admin, unlike the source app where no screen could set it.

**Given** a saved campaign
**Then** it is `DRAFT`, appears in the campaign table with that status, and appears in no caller's queue.

**Given** a `DRAFT` campaign
**Then** exactly one `Start campaign` action is offered
**And** starting sets `ACTIVE` and makes its `PENDING` assignments callable.

**Given** an `ACTIVE` campaign
**Then** `Complete` and `Cancel` are offered, and both are terminal in v1.

**Given** a `COMPLETED` or `CANCELLED` campaign
**Then** no lifecycle action is offered and the status is visible in the table.

**Given** a transition against a stale status
**Then** the conditional update returns `409` and no state is double-applied.

**Given** a non-admin role
**Then** create and lifecycle actions are refused server-side, not merely hidden.

**Given** a cancelled campaign
**Then** new queues exclude it and any in-flight disposition write returns a terminal `409`.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-campaigns`. Do **not**
run the full suite — this story touches only campaign files.

---

### Story 1.5: The per-campaign survey builder

As an Admin, Preacher or Assistant,
I want a free-form survey per campaign with ordered questions and options, enforced required answers, and retire-not-delete,
So that every caller records the same answers for this campaign and history survives later edits.

**Requirements:** FR8, FR9 · AD-12 · UX-DR13 · NFR8

**Design:** [`figcraft://node/212`](figcraft://node/212) (survey step,
`Add question`, `Next`).
**Design omission/defect:** the frame's redundant `Status?` survey card is
removed — the 13-chip disposition is the only status. Retire/Delete states are
not in the frame (UX-DR13).

**Acceptance Criteria:**

**Given** the builder
**Then** `Add question` offers `TEXT`, `DROPDOWN`, `RADIO`, `MULTI_SELECT` and `DATE`
**And** options can be added, edited and ordered
**And** the builder does not seed a status question.

**Given** a choice question with zero options
**When** it is saved
**Then** the request is rejected with a named validation error.

**Given** `is_required`
**Then** the builder renders the marker only because the RPC will enforce it in story 2.3
**And** it never renders a marker it does not enforce.

**Given** a question with at least one response
**Then** only Retire is offered; Delete is not
**And** retiring keeps the row and historical answers, and removes it from the builder and new dispositions.

**Given** a question with zero responses
**Then** Delete is offered and the control says it is safe.

**Given** a campaign in `DRAFT` or `ACTIVE`
**Then** the survey remains editable, subject to the response-driven retire rule; no status transition is required to edit it.

**Given** a second program
**Then** questions and options are program-scoped and never appear across programs.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-survey`. Do **not**
re-test the disposition's survey rendering here; story 2.3 owns it.

---

### Story 1.6: The caller roster, and auto-promotion on first assignment

As an Admin, Preacher or Assistant,
I want to see the callers in my scope with their status and performance, and have an eligible staff member become a caller on first assignment,
So that calling starts without an invite flow and a deactivated caller cannot be handed more work.

**Requirements:** FR13, FR14, FR15, FR16, FR17 · AD-2, AD-3, AD-7, AD-13 · UX-DR32

**Design:** [`figcraft://node/645`](figcraft://node/645) (desktop roster,
active/inactive, all-roles copy, no invite), [`figcraft://node/2639`](figcraft://node/2639)
(mobile roster).
**Design contract:** no add, invite, import or manage-user control; both header
buttons were removed deliberately (UX-DR32).

**Acceptance Criteria:**

**Given** an Admin
**Then** the roster shows every active staff user in the program plus existing caller profiles with their status.

**Given** a Preacher
**Then** the roster contains staff whose `assigned_preacher_id` is the Preacher, plus the Preacher themselves.

**Given** an Assistant
**Then** the roster contains their preacher's assignees, plus themselves.

**Given** an `INACTIVE` caller
**Then** the status is shown, the row remains for history, and the caller is excluded from every assignment picker.

**Given** an Admin
**Then** they can deactivate and reactivate a caller
**And** a Preacher or Assistant never sees that control, because deactivation remains an Admin action.

**Given** an eligible staff user chosen for assignment
**Then** a `dialer_callers` row is created with `promoted_by` = the assigner
**And** no `public.users` or `auth.users` row is ever created by the dialer.

**Given** an inactive caller in a batch request
**Then** it is refused by name and never reactivated.

**Given** the roster's performance columns
**Then** they come from `campaign_progress`, not a client-side count.

**Given** no callers in scope
**Then** the empty state says what to do next, not a table of zeroes.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-callers`. Do **not**
re-run `smoke` for role access — the roster spec asserts scope and `smoke` already
owns sign-in.

---

### Story 1.7: Assign-contacts selection surface

As an Admin, Preacher or Assistant,
I want to choose contacts in my scope with facets and paging, see how many are selected including hidden pages, and add callers with weights and a live count,
So that I assign exactly the people I mean, not the current page.

**Requirements:** FR10, FR18, FR24 · AD-3, AD-11, AD-16 · UX-DR9, UX-DR10 · NFR5

**Design:** [`figcraft://node/324`](figcraft://node/324) (contact grid,
`125 of 272 selected`, `12 hidden on other pages`, `Assign to`, weighted
callers, conflict warning, `Assign 120 contacts`).
**Design contract:** desktop only; the phone admin surface does not reproduce
this grid (UX-DR9, UX-DR10).

**Acceptance Criteria:**

**Given** the assign-contacts screen at a desktop viewport
**Then** it renders the scoped contact grid, the caller picker and the weight inputs
**And** a narrow viewport gets an explicit "open this on a desktop" state, never a broken mini-grid.

**Given** the contact list
**Then** it pages server-side and shows `Showing X–Y of N`.

**Given** a selection that spans pages
**Then** the selection count persists and a visible `+ N hidden selected` indicator names the off-page count.

**Given** the facets (`centre`, `level`, `gender`, `language`)
**Then** their options derive from the whole scoped set, not the current page
**And** a missing profile value produces an empty option list, not a crash.

**Given** the caller picker
**Then** it contains only the assigner's assignable set (Admin: program; Preacher: assignees + self; Assistant: preacher's assignees + self) and excludes inactive callers.

**Given** one or more callers and weights
**Then** the preview shows the per-caller counts, summing to N
**And** no weight is persisted anywhere.

**Given** zero selected contacts
**Then** the primary action is disabled and issues no request.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-assign-select`. Do
**not** re-test the grid primitives (`grid-*`); this screen composes campaign
components and does not change `components/grid/**`.

---

### Story 1.8: Conflict-aware weighted assignment write

As an Admin, Preacher or Assistant,
I want every already-assigned contact named before anything is written, and one transaction that writes only the confirmed set,
So that I can move or skip conflicts deliberately and never get a partial batch.

**Requirements:** FR15, FR19, FR20, FR21, FR22, FR23 · AD-3, AD-11 · UX-DR9 · NFR8

**Design:** [`figcraft://node/324`](figcraft://node/324) (conflict warning,
weighted split, `Assign 120 contacts`).
**Design contract:** the primary button's count is the count that will actually
be written; conflicts are a readable list, not a uniqueness error (UX-DR9).

**Acceptance Criteria:**

**Given** a selection containing contacts already assigned in that campaign
**Then** the pre-check returns every conflict by contact name and current caller
**And** nothing is written until the assigner chooses skip or move.

**Given** **skip**
**Then** only the unassigned contacts are distributed and the button count equals the rows written.

**Given** **move**
**Then** the existing `(contact_id, campaign_id)` row is updated to the new caller; no second row is created.

**Given** a confirmed set of N and weighted callers
**Then** each caller receives `floor(N × weight ÷ total weight)`, leftovers go one at a time to the largest remainders (tie: higher weight, then list order), and the counts sum exactly to N.

**Given** a destination caller outside the assignable set
**Then** the request is refused with `403` naming that caller and no rows are written.

**Given** an inactive caller
**Then** the request is refused with the named inactive state; nothing is reactivated.

**Given** a failure part-way through the batch
**Then** the transaction rolls back, the offending rows are named, and no partial success is reported.

**Given** a `DRAFT` campaign
**Then** assignment is allowed; given `COMPLETED` or `CANCELLED`, it is refused.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-assign-write`. The
spec may reuse `e2e/fixtures/bulk-contacts.ts` but must restore any renamed
fixture in a `finally`, per `matrix-coverage-map.md`.

**Split point if this exceeds one context:** (a) the pre-check endpoint and
conflict UI, then (b) the transactional weighted write and its named refusals.
The pre-check is read-only and safe to land first.

---

### Story 1.9: Campaign overview and the one progress computation

As an Admin, Preacher or Assistant,
I want the campaign list and Overview to show the funnel counts for my scope, computed once,
So that I can see a stalled campaign before it ends and every later screen agrees.

**Requirements:** FR40, FR41, FR43, FR44 (admin) · AD-5, AD-16 · UX-DR24, UX-DR29 · NFR9

**Design:** [`figcraft://node/32`](figcraft://node/32) (five stat cards
including Confirmed; campaign table with `CANCELLED`, no row actions),
[`figcraft://node/1752`](figcraft://node/1752) (phone Overview),
[`figcraft://node/961`](figcraft://node/961) (dark parity),
[`figcraft://node/790`](figcraft://node/790) (Never attempted is the amber
bucket).
**Design omission:** empty state for no campaigns (UX-DR24).

**Acceptance Criteria:**

**Given** `campaign_progress(campaign_id, scope_preacher_id, program_scope)`
**Then** it returns the funnel, outcome mix by `status_group`, per-caller rollup, summary counts and recent activity in one call
**And** it is `SECURITY INVOKER`, `SET search_path = public, pg_temp`, revoked from `PUBLIC`/`anon`/`authenticated` and granted to `service_role`.

**Given** `program_scope = false` with a null `scope_preacher_id`
**Then** the function raises; it never widens to the program.

**Given** an Assistant with no active preacher
**Then** the handler refuses before calling; no program data is returned.

**Given** the definitions
**Then** Attempted = assignments with at least one log, Reached = at least one log outside `NOT_REACHABLE`/`WRONG_NUMBER`, Confirmed = the latest reached log is `CONFIRMED`, Never attempted = assigned − attempted
**And** funnel/campaign counts are assignment-grain while leaderboard/activity are log-grain.

**Given** the Overview
**Then** the five stat cards and campaign table match frame 32, the phone view matches 1752, and dark matches 961 using tokens only.

**Given** `Never attempted`
**Then** it is a distinct bucket, not folded into another number.

**Given** a queued disposition
**Then** it is excluded until its replay lands, and the UI says queued work is not counted yet.

**Given** a Preacher
**Then** every count includes only their contacts, while the campaign row remains visible.

**Given** zero campaigns
**Then** the empty state offers `Create campaign`.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-overview`. Do **not**
re-test the reports screen; story 3.1 consumes this function and owns that
screen.

## Epic 2: A caller can work the whole queue without losing an outcome

**Epic goal.** Any staff member with an active caller profile opens Assignments,
sees only their own queue, calls through `tel:` with a clipboard fallback,
paces with a countdown that cannot drift, skips or pauses without wedging the
session, records one of 13 statuses plus notes and the conditional survey in one
transaction, survives reload/offline/refusal states, and finishes with a summary
that re-queues their own unreachable contacts.

**Requirements:** FR1–FR4, FR25–FR39, FR44 (caller), FR46, FR47 (caller); AD-1,
AD-2, AD-6, AD-7, AD-9, AD-10, AD-12, AD-16; UX-DR1–UX-DR8, UX-DR11, UX-DR12,
UX-DR14–UX-DR16, UX-DR19–UX-DR23, UX-DR25–UX-DR28, UX-DR31.

### Story 2.1: The caller queue, the call card, and contact history

As a caller,
I want my own queue and a call card that keeps the current contact and their history on screen,
So that I always know who I am calling and what was said last time.

**Requirements:** FR1, FR2, FR3, FR4, FR25, FR26, FR27, FR33, FR44 (caller) · AD-1, AD-7, AD-9, AD-16 · UX-DR2, UX-DR3, UX-DR5, UX-DR6, UX-DR11, UX-DR14, UX-DR15, UX-DR31 · NFR7

**Design:** [`figcraft://node/2263`](figcraft://node/2263) (call card: campaign
context, progress, Queue entry, phone + Copy, Previous history, `Call Priya`),
[`figcraft://node/2737`](figcraft://node/2737) (second card state; **known
defect:** the button label must follow the current contact),
[`figcraft://node/2360`](figcraft://node/2360) (queue list, `showing 12 of 487`,
session counts, `← you`, tap-to-jump).
**Design contract:** phone-first; a wide viewport gets the same session or an
explicit open-on-phone state, never a desktop rail (UX-DR15, UX-DR31).

**Acceptance Criteria:**

**Given** an active caller with `PENDING` assignments on `ACTIVE` campaigns
**When** they open `/campaigns/assignments`
**Then** the queue contains only their own assignments, program-scoped, ordered deterministically by campaign date, campaign, `sort_order`, then assignment id.

**Given** no assignments
**Then** an actionable empty state explains that no contacts are assigned and what to ask for — not a screen of zeroes.

**Given** the call card
**Then** it shows the campaign context, progress, contact name, phone, `Copy`, a `Queue` entry and one primary `Call <name>` action
**And** the label follows the current contact, not frame 2737's stuck `Call Priya`.

**Given** the call action
**Then** the number is copied to the clipboard before `tel:` opens
**And** an empty phone number produces a visible failure and does not advance the session.

**Given** the history panel
**Then** it shows the last N prior calls for this contact across campaigns in the program, read-only, directly above the call button
**And** the payload contains no other contact's history and no general contacts read.

**Given** the `Queue` entry
**Then** the queue opens over the card, marks the current row `← you`, shows the next row immediately below, allows any row to be tapped to jump, and reports an honest `Showing X of Y` from a virtualised window.

**Given** another caller's assignment id
**Then** the response is `404` with no payload (denial-sweep row).

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-queue`. Do **not**
re-test `tel:`/clipboard behaviour in a second spec; story 2.2 owns pacing and
controls.

---

### Story 2.2: Pacing, Skip, Pause, campaign switch, single tab, and resume

As a caller,
I want a gap that cannot drift, controls that cannot wedge the session, and my place restored after a reload,
So that a call never starts late, skips never lose a contact, and a lost tab does not lose my place.

**Requirements:** FR28, FR29, FR31, FR32, FR39 (base) · AD-9, AD-12 · UX-DR3, UX-DR4, UX-DR8, UX-DR19, UX-DR20, UX-DR25, UX-DR27

**Design:** [`figcraft://node/2263`](figcraft://node/2263) and
[`figcraft://node/2360`](figcraft://node/2360) are the base card and queue.
**Design omissions to implement:** Skip and Pause in the card header (UX-DR19),
the visible gap countdown (UX-DR20), the awaited campaign-switch notice
(UX-DR8), resume after tab loss (UX-DR25), and the cross-tab refusal (UX-DR27).

**Acceptance Criteria:**

**Given** a campaign gap of 5–300 seconds
**Then** the countdown is derived from `Date.now()` against a target timestamp, not a decrementing counter
**And** it survives a backgrounded tab, gates the call button rather than navigation, and is visible
**And** a value outside the presets still renders as the current value.

**Given** `Pause`
**Then** the session reads as paused without error colouring, the call button is unavailable, and `Resume` restores the same card and the in-flight draft.

**Given** `Skip`
**Then** the assignment is written as `SKIPPED`, the last-row case is bounded and does not crash, and the next card opens
**And** skipping never drops the contact without a written state.

**Given** the next assignment belongs to another campaign
**Then** a notice names the incoming campaign and date, is awaited, pauses the gap, and blocks the next call until dismissed.

**Given** a second tab on the same queue
**Then** a `BroadcastChannel` lock with a `localStorage` fallback refuses it loudly
**And** `unique (assignment_id, attempt)` remains the database guarantee.

**Given** a reload or tab loss
**Then** `/campaigns/assignments?campaign=<id>` plus a re-fetch restores the same contact and the in-flight draft.

**Given** a 300–500 contact queue
**Then** advancing renders a bounded window with no measurable jank.

**Given** a campaign that is not `ACTIVE`
**Then** Skip returns a terminal `409` and no state changes.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-session`. Do **not**
run `theme-switch` or `grid-*`; nothing shared changed.

---

### Story 2.3: The disposition screen and the one-transaction save

As a caller,
I want to record one status, notes, and — only when we talked — the campaign survey, and commit with one action,
So that every outcome is stored whole and a retry can never half-save it.

**Requirements:** FR8 (enforcement), FR34, FR35 · AD-4, AD-6, AD-12 · UX-DR1, UX-DR12, UX-DR16, UX-DR21 · NFR8, NFR12

**Design:** [`figcraft://node/2456`](figcraft://node/2456) (`How did it go?`,
required Status chips, Notes, `Save & continue`).
**Design omission:** the campaign survey below Status, conditional on a reached
call (UX-DR21). The 13 chips are the stored model (UX-DR16).

**Acceptance Criteria:**

**Given** the disposition screen
**Then** it is a dedicated screen with the 13 chips exactly as frame 2456 (including `Not interested — do not call again`), Notes always rendered, and one `Save & continue`.

**Given** the selected status groups to `NOT_REACHABLE` or `WRONG_NUMBER`
**Then** the campaign survey is hidden and notes remain
**And** for any other group the survey renders.

**Given** an `is_required` question with no answer
**When** save is attempted
**Then** the RPC rejects with a named validation error and no row is written.

**Given** a choice question with zero options
**Then** the RPC rejects it.

**Given** `Save & continue`
**Then** `record_call_disposition` writes the call log (with `dial_phone` snapshotted from the contact at save time), the survey responses and the assignment status in one transaction.

**Given** a replay of the same `(assignment_id, attempt)` with the same payload
**Then** it returns `200` and the stored row
**And** a different payload for that attempt returns `409` and changes nothing
**And** neither path returns `500`.

**Given** `attempt`
**Then** it is supplied by the queue payload and accepted only as the next attempt or an existing attempt owned by the same caller; the RPC never invents it.

**Given** the caller id appears in the request body
**Then** it is ignored; `getStaffContext()` is the only source.

**Given** an inactive caller
**Then** the transaction refuses and writes no row.

**Given** this story's migration
**Then** `dialer_survey_responses` exists with `unique (call_log_id, question_id)`, its RLS row is added to the matrix, and `lib/supabase/types.ts` is regenerated.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-disposition`. The
spec may use `page.route` to hold the PATCH open; release it before `unroute`,
per `matrix-coverage-map.md`'s teardown lesson.

**Split point if this exceeds one context:** (a) the screen and conditional
survey, then (b) the migration, RPC and idempotency. The screen can render
against a stub handler; do not split the RPC across stories.

---

### Story 2.4: Save receipts, failure states, and named refusals

As a caller,
I want to see exactly what happened to my save and why a save was refused,
So that I never believe an answer was stored when it was not, and never lose it when it was refused.

**Requirements:** FR36, FR37, FR39, FR46, FR47 · AD-7, AD-10 · UX-DR22, UX-DR27, UX-DR28 · NFR14

**Design:** [`figcraft://node/2456`](figcraft://node/2456) is the base screen;
the receipt and refusal states are **design omissions** (UX-DR22, UX-DR27,
UX-DR28).
**Design contract:** the receipt is persistent on the screen; it is not a toast.

**Acceptance Criteria:**

**Given** a save in flight
**Then** `Saving…` is visible; on success `Saved HH:MM` persists on the screen.

**Given** a network gap
**Then** the receipt reads `Queued — will send` and it is treated as a success state, never `Save failed`.

**Given** a rejected or failed write
**Then** `Save failed — session paused` is loud, the session pauses, and every answer remains editable and retryable.

**Given** a deactivated caller
**Then** the refusal is named (`Caller deactivated`), the session pauses, and answers are kept.

**Given** a reassigned assignment
**Then** the refusal is named (`Assignment reassigned`), the session pauses, and answers are kept.

**Given** a cancelled campaign
**Then** the refusal is named and the session pauses.

**Given** a second tab
**Then** the refusal is named, not a generic save failure.

**Given** an Assistant who cannot correct a wrong number
**Then** the screen says `Ask an Admin or Preacher` and offers no `/manage` link that would fail.

**Given** any refusal
**Then** no answer is discarded.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-receipts`. Do **not**
re-test the offline queue; story 2.5 owns it.

---

### Story 2.5: Offline disposition queue and draft recovery

As a caller,
I want a disposition saved offline to survive a killed tab and replay exactly once, and a permanently refused replay to drain,
So that a dead zone or a closed tab does not lose the call I just made.

**Requirements:** FR37 (queued), FR38, FR43 (queued not counted) · AD-10 · UX-DR25, UX-DR26 · NFR10

**Design:** [`figcraft://node/2456`](figcraft://node/2456) is the base screen;
`Queued — will send` and the unsaved-draft recovery are **design omissions**
(UX-DR26, UX-DR25).

**Acceptance Criteria:**

**Given** a network gap during save
**Then** `/api/dialer/caller/disposition` returns the existing `202 {success:false, queued:true, message}` contract and the receipt says `Queued — will send`.

**Given** the root `public/sw.js`
**Then** the disposition path is in `QUEUED_POST_PATHS` and `/campaigns` is in `NETWORK_ONLY_PATH_PREFIXES`
**And** no other dialer path is queued.

**Given** reconnect
**Then** the queue drains on `ok || 409`, and a `200` replay does not duplicate the call log.

**Given** a permanent refusal on replay (reassigned, deactivated, cancelled)
**Then** the replay returns `409`, the queue entry drains, and the localStorage draft remains keyed `dialer:disposition:<assignmentId>:<attempt>`.

**Given** the next session
**Then** the unsaved draft is surfaced as a call that could not be saved, with its answers intact.

**Given** a draft whose assignment or attempt changed
**Then** it is discarded rather than replayed against the wrong row.

**Given** a cold load with no network
**Then** no app-shell offline promise is made; the tab must already be open.

**Given** `pnpm test:offline-queue`
**Then** the existing 19 rows still pass and the dialer path is covered by a new row.

**Test scope:** `pnpm test:static`; `pnpm test:offline-queue` (existing contract
gate, needs the stack); `pnpm test:e2e campaign-offline`;
`pnpm test:e2e:guards` (21 s) because `sw.js` is a shared contract. Do **not**
run the full suite for a `sw.js`-only change; no §5 shared component changed.

**Split point if this exceeds one context:** (a) the `sw.js` queue join and the
202 receipt, then (b) the localStorage draft and recovery surface. The two
depend on each other's shape; define the draft key first.

---

### Story 2.6: Session summary and caller-grain recall

As a caller,
I want to see what my session achieved and put unreachable contacts back in my queue within the cap,
So that a busy contact is not lost and an infinite recall loop cannot start.

**Requirements:** FR30, FR44 (empty queue) · AD-5, AD-12 · UX-DR7, UX-DR23

**Design:** no frame. The summary is a **design omission** (UX-DR7, UX-DR23);
build it from `ux-flows.md` §3a and the decided caller-grain rule (D1).

**Acceptance Criteria:**

**Given** the queue empties
**Then** `Session complete` shows the counts: called, reached, no answer, wrong number, skipped early
**And** the counts are the caller's own work, not campaign-wide.

**Given** `NOT_REACHABLE` assignments under `max_attempts`
**Then** `Re-queue those N and continue` returns only those to `PENDING`
**And** reached and `WRONG_NUMBER` assignments are never re-queued.

**Given** an assignment at the cap
**Then** the summary reports it as `closed after N attempts` and it is not offered again.

**Given** a recall
**Then** `attempt` is not bumped; the next call log is the next attempt.

**Given** a non-`ACTIVE` campaign
**Then** recall returns a terminal `409`.

**Given** `Done — back to my queue`
**Then** the session returns to the updated queue.

**Given** another caller's `NOT_REACHABLE` row
**Then** it is absent from the count and cannot be recalled (404).

**Given** the phone summary
**Then** the recall is the primary action and Done is secondary.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-summary`. Do **not**
re-run `campaign-reports`; the campaign-grain funnel is a different surface and
story 3.1 owns it.

## Epic 3: The team can see and export what the campaign achieved

**Epic goal.** An Admin, Preacher or Assistant can answer, from the reports
screen alone, how many people were assigned, attempted, reached, confirmed and
never attempted, what the outcomes were, and who was never called — then export
those exact numbers. The phone gets the funnel including Confirmed and says
plainly which parts are desktop detail.

**Requirements:** FR42, and the consumption half of FR40, FR41 and FR43;
FR44 (report); FR47 (report); AD-3, AD-5, AD-16; UX-DR24, UX-DR29, UX-DR30.

### Story 3.1: Desktop reports — funnel, outcome mix, leaderboard, activity

As an Admin, Preacher or Assistant,
I want one reports screen that answers how many were assigned, called, reached, confirmed and never called,
So that I can see a stalled caller before the campaign ends.

**Requirements:** FR40 (consumption), FR41 (consumption), FR42, FR43, FR44 (report) · AD-3, AD-5 · UX-DR24, UX-DR29 · NFR9

**Design:** [`figcraft://node/790`](figcraft://node/790) (four-bucket funnel
with amber Never attempted, outcome mix, leaderboard disclaimer, recent
activity, Export CSV), [`figcraft://node/1141`](figcraft://node/1141) (dark
parity).

**Acceptance Criteria:**

**Given** the reports screen
**Then** the funnel shows Assigned, Attempted, Reached, Confirmed and Never attempted, with Never attempted visually distinct as designed.

**Given** the funnel definitions
**Then** they match AD-5 exactly: Attempted = at least one log; Reached = at least one log outside `NOT_REACHABLE`/`WRONG_NUMBER`; Confirmed = the latest reached log is `CONFIRMED`; Never attempted = assigned − attempted.

**Given** the outcome mix
**Then** it groups by `status_group` (six groups), never by the 13 chips.

**Given** the caller leaderboard
**Then** it ranks completed attempts and carries the design's no-quality-signal disclaimer.

**Given** recent activity
**Then** it is log-grain and scoped to the viewer's people.

**Given** a Preacher or Assistant
**Then** every number is scoped exactly as assignment is; a campaign row is visible but the counts include only their contacts.

**Given** a queued disposition
**Then** it is not counted until its replay lands.

**Given** zero data
**Then** the empty state names the next action (assign contacts, start the campaign).

**Given** dark theme
**Then** the screen matches frame 1141 using tokens only.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-reports`. Do **not**
re-assert the RPC's arithmetic here; story 1.9 owns the function and this story
asserts the screen's rendering and scope. Do **not** run `theme-switch`.

---

### Story 3.2: CSV export of the same numbers

As an Admin, Preacher or Assistant,
I want to export exactly the funnel, mix and rollup I am looking at,
So that I can take the campaign result away without re-deriving it.

**Requirements:** FR41, FR42, FR43 · AD-3, AD-5, AD-15, AD-16 · NFR5, NFR6

**Design:** [`figcraft://node/790`](figcraft://node/790) (`Export CSV`),
[`figcraft://node/1968`](figcraft://node/1968) (phone control).

**Acceptance Criteria:**

**Given** `Export CSV`
**Then** the file contains the funnel, outcome mix, caller rollup and activity rows shown on screen
**And** no column appears that the product cannot fill (`call_duration` is absent).

**Given** the export request
**Then** it reads `campaign_progress` with the same scope arguments as the screen
**And** a Preacher's or Assistant's file cannot contain another scope's rows.

**Given** a 1,000+ row set
**Then** the export uses the shared pager and throws loudly rather than truncating.

**Given** an unauthenticated or out-of-scope request
**Then** it is refused with no file.

**Given** a transient failure
**Then** the user sees a named error, never an empty file that looks like a successful export.

**Given** a queued disposition
**Then** it is absent until replay.

**Given** a phone
**Then** the Export CSV control is reachable and downloads the same file.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-export`;
`pnpm guardrails` (shared-pager extraction). Do **not** duplicate the reports
rendering assertions.

---

### Story 3.3: Mobile reports — funnel with Confirmed, reduced-view statement

As a staff member on a phone,
I want the same funnel including Confirmed, with a clear statement of what is desktop-only,
So that I can judge a campaign from my phone without believing a partial view is complete.

**Requirements:** FR42, FR44 (report), FR47 · AD-3, AD-5 · UX-DR29, UX-DR30

**Design:** [`figcraft://node/1968`](figcraft://node/1968) (mobile funnel and
leaderboard, Export CSV), [`figcraft://node/2068`](figcraft://node/2068)
(dark Overview parity).
**Decision D3 / design defect:** add Confirmed to the phone funnel and state
that outcome mix and recent activity are desktop detail. Do not silently omit
them.

**Acceptance Criteria:**

**Given** the phone reports screen
**Then** it shows Assigned, Attempted, Reached, Confirmed and Never attempted, plus Export CSV.

**Given** the desktop-only parts
**Then** the screen says `Outcome mix and recent activity are available on desktop` rather than omitting them without explanation.

**Given** the leaderboard
**Then** it matches frame 1968 and is scoped to the viewer.

**Given** a phone viewport
**Then** there is no horizontal scroll, the export control is not clipped, and the Campaign bottom nav remains usable.

**Given** dark theme
**Then** no per-screen dark overrides are introduced; tokens carry it.

**Given** a desktop viewport
**Then** the desktop reports screen is shown, not the mobile one.

**Test scope:** `pnpm test:static`; `pnpm test:e2e campaign-reports-mobile`. Do
**not** re-run the desktop reports spec; it is unchanged.

## Epic 4: Trust under failure — no leak, no lost answer

**Epic goal.** Prove the boundary and the recovery paths hold across every role
and route, grade the surfaces against the design, and report the release on
real evidence. This epic adds no capability; it is the gate the rest of the
feature is judged by.

**Requirements:** verification of FR2, FR30, FR38, FR39, FR45, FR46; NFR3,
NFR11, NFR14; AD-7, AD-8, AD-14; UX-DR27, UX-DR29.

### Story 4.1: The denial sweep is complete, and Assistant scope is proven

As a security owner,
I want every dialer route to prove unauth refusal, foreign 404 and owning success, including an Assistant with no preacher and a deactivated caller,
So that the only thing between a caller and 1,030 phone numbers is a tested assertion, not a remembered one.

**Requirements:** FR2, FR13, FR16, FR17, FR41, FR45, FR46 · AD-3, AD-7, AD-8, AD-14 · UX-DR27, UX-DR28 · NFR3

**Design:** no screen. The nav behaviour being proved is frames 32, 1752 and
2217; the caller boundary is frames 2263/2360.

**Acceptance Criteria:**

**Given** every route file under `apps/folk/app/api/dialer/**`
**Then** the sweep has a row for it, and `pnpm guardrails` fails when one is missing.

**Given** each sweep row
**Then** it asserts unauthenticated refused, non-owner `404` with no row or id, and owner succeeds.

**Given** an inactive caller
**Then** the queue, disposition and Skip write paths refuse and write no row.

**Given** an Assistant with `assigned_preacher_id = NULL`
**Then** campaign counts and reports are refused (403) or return zero rows — never program scope.

**Given** an Assistant with a preacher
**Then** only that preacher's contacts appear in the roster and reports.

**Given** a Volunteer who is not an active caller
**Then** the Campaign nav item is absent and `/campaigns` is refused.

**Given** a Preacher
**Then** another preacher's contact, assignment and report rows are not readable.

**Given** the sweep spec
**Then** it uses per-role `storageState` and does not duplicate `smoke.spec.ts`'s sign-in assertions.

**Given** a failure that is pre-existing on `dev`
**Then** it is reported as pre-existing with evidence, not silently fixed or hidden.

**Test scope:** `pnpm test:static`; `pnpm guardrails`;
`pnpm test:e2e dialer-route`. Do **not** run the full suite here; story 4.2 is
the one release run.

---

### Story 4.2: Release gate — full suite, determinism, and the recorded visual pass

As the product owner,
I want one final proof that the whole feature is green and matches the design, with real commands and counts,
So that the release is judged on evidence rather than on a green build.

**Requirements:** FR30, FR38, FR39, FR45, FR46, FR47 · AD-8, AD-15 · UX-DR29, UX-DR30, UX-DR31, UX-DR32 · NFR11, NFR14, NFR16

**Design:** all 16 campaign frames:
[32](figcraft://node/32), [212](figcraft://node/212), [324](figcraft://node/324),
[645](figcraft://node/645), [790](figcraft://node/790), [961](figcraft://node/961),
[1141](figcraft://node/1141), [1752](figcraft://node/1752),
[1968](figcraft://node/1968), [2068](figcraft://node/2068),
[2217](figcraft://node/2217), [2263](figcraft://node/2263),
[2360](figcraft://node/2360), [2456](figcraft://node/2456),
[2639](figcraft://node/2639), [2737](figcraft://node/2737).

**Acceptance Criteria:**

**Given** the finished feature and a warm local stack
**Then** `pnpm test:e2e` is run once, single worker, and the actual pass count is recorded.

**Given** specs or fixtures changed across the feature
**Then** `pnpm test:e2e:determinism` is run once and both consecutive runs are green with no reset.

**Given** the 16 campaign frames
**Then** a recorded visual pass at 1440×900 and 390×844, light and dark, grades layout, labels and visible states
**And** every state implemented from the spec rather than the frame is named as a design omission that was restored.

**Given** the four design defects
**Then** 2737's call label follows the contact, mobile reports include Confirmed, frame 212 has no status question, and frame 645 has no invite/import control.

**Given** `pnpm test:static`
**Then** guardrails, typecheck and lint are green
**And** `pnpm test:airtable-removal` and the known `grid-*` failures are reported as pre-existing if still red, with `git stash` evidence.

**Given** the release
**Then** no production deploy, production secret or production environment config was touched.

**Given** the report
**Then** it names the exact commands, pass counts, revision, `baseURL` and worker count
**And** `pnpm test` is never reported as a test run.

**Given** a failure
**Then** it is fixed in the owning story's files and only the affected filter is re-run; the full suite is not re-run merely to "see".

**Test scope:** `pnpm test:e2e` (full, recorded once); `pnpm test:e2e:determinism`
(once — two back-to-back full runs, the second of which is also valid evidence
for the recorded run); `pnpm test:static`; the manual visual pass. No other
suite is added. Total full-suite executions for the whole feature: Story 1.3's
one, plus these three.


---

## Requirements Coverage Audit

Run at step 4 against the finished story set. Every check below was computed
from the document, not asserted from memory.

| Check | Result | Evidence |
|---|---|---|
| FR coverage | **Pass — 47 / 47** | Every `FR1`…`FR47` appears in at least one story-level `**Requirements:**` line and is addressed by that story's AC. Computed by regex over the 20 story sections. |
| UX-DR coverage | **Pass — 32 / 32** | Every `UX-DR1`…`UX-DR32` appears in at least one story's requirements. The 13 required omissions (UX-DR17–UX-DR28, excluding UX-DR29–31 which are design-defect parity) each have an owning story. |
| NFR coverage | **Pass — 16 / 16** | NFR1–NFR16 each appear in a story or in the global test-policy block; NFR3 is owned by 1.2 and re-proved by 4.1, NFR10 by 2.5, NFR11 by every story's test scope. |
| Additional requirements | **Pass — 14 / 14** | AR1 (spine) binds every story; AR2 (no starter) is recorded in 1.1; AR3–AR8 are wired by 1.1–1.3; AR9 by 1.2; AR10 by 1.3; AR11 by 1.1/2.3; AR12 is the explicit deferral list below; AR13 by every design link; AR14 by 1.3. |
| Starter template | **Not applicable** | Brownfield: no starter template is specified, and no story clones or scaffolds a project. |
| Database creation timing | **Pass** | Story 1.1 creates the seven tables the admin surface actually reads (campaign, caller, assignment, contact profile, call log for the funnel, question, option). Story 2.3 creates `dialer_survey_responses` with the RPC that writes it. Nothing is created speculatively. |
| Forward dependencies | **Pass** | No story requires a later story. The dependency chain is `1.1 → 1.2 → {1.3, 1.4, 1.6}`, `1.4 → 1.5`, `1.6 → 1.7 → 1.8 → 1.9`, `1.9 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6`, `{1.9, 2.6} → 3.1 → {3.2, 3.3}`, `3.3 → 4.1 → 4.2`. |
| Story sizing | **Pass with split points** | 20 stories. Stories 1.8, 2.3 and 2.5 carry an explicit split point because their cross-layer surface is the largest. 1.1/1.2/2.3/2.5 are `spec_checkpoint`; 4.2 is `done_checkpoint`. |
| Epic independence | **Pass** | Epic 2 does not need Epic 3. Epic 3 needs 1 and 2 for data, which is the allowed cumulative direction. Epic 4 needs all prior work by definition; it is the release gate, not a capability. |
| File churn | **Pass — considered and accepted** | Epics 1–3 each touch `components/campaign/**`, but different sub-trees: admin views (Epic 1), caller session shell (Epic 2), reports (Epic 3). Shared repo files are touched once each: `components/header.tsx` + `lib/supabase/manage.ts` in 1.3, `public/sw.js` in 2.5, `apps/*/proxy.ts` in 1.3. No file is rewritten by two epics. |
| Test economy | **Pass** | Full `pnpm test:e2e` executes only at Story 1.3 (1) and the release gate (1 recorded + 2 determinism) — four full-suite executions for the whole feature. No other story runs the full suite. Determinism is deliberately deferred from 1.2 to 4.2 and the deferral is recorded in both stories. |

### File overlap assessment (why four epics, not two)

The three user-value epics map to three disjoint surfaces inside
`components/campaign/`: `admin/**` (Epic 1), `caller/**` (Epic 2),
`reports/**` (Epic 3). They share types and the `lib/dialer/` boundary, but no
story rewrites another epic's components. Consolidating reporting into Epic 1
would make a single 13-story epic and delay the caller surface — the riskiest
part of the port — behind reporting polish. Keeping Epic 4 separate gives the
security boundary a named gate and a single release run, which is the risk
boundary worth isolating.

### Recorded decisions and assumptions

These are stated so a dev agent does not silently invent a different answer.
They do not change `SPEC.md`; if a reviewer disagrees, the owning story's file
records the change.

- **A1 — Create/detail URLs.** `/campaigns/new` creates; `/campaigns/[campaignId]`
  is detail and edit; the survey builder lives on the detail route. The spine
  fixes only the `/campaigns` prefix and gate, so this is a routing choice, not
  a capability change.
- **A2 — Queue order.** Cross-campaign order is campaign date, campaign id,
  `sort_order`, assignment id. The source app wrote `sort_order` and never read
  it; the campaign-switch notice needs a deterministic boundary.
- **A3 — Survey edits.** The builder is editable while `DRAFT` and `ACTIVE`,
  subject to the response-driven retire rule. A question with responses can
  never be deleted; a zero-response question can.
- **A4 — Caller reactivation.** An Admin's active/inactive switch can
  reactivate. Assignment never reactivates an inactive caller; that is the
  AD-3/AD-11 rule, not a contradiction.
- **A5 — Caller-grain summary (D1).** The session summary and recall count and
  touch only the signed-in caller's own work. `campaign_progress` is not
  repurposed for it.
- **A6 — Profile fields are data-only (D2).** No editor ships in v1; facets
  degrade to an empty option list when no profile rows exist.
- **A7 — Mobile reports (D3).** Confirmed is added to the phone funnel, and the
  screen states that outcome mix and recent activity are desktop detail.

### Explicitly deferred (not missing)

CAP-10 campaign assistant, CAP-11 member RSVP, telephony provider, app-shell
offline, contact CSV import/export, phone admin contact grid, campaign/survey
audit trail, dialer in gita-life, survey drag-and-drop, native clients, and the
Next 16.0.7 CVE framework upgrade. These are `SPEC.md` non-goals or the spine's
Deferred list; none is a hidden story.

### Known pre-existing failures

`pnpm test:airtable-removal` fails 3 of 30 checks on `dev`/`main` as of
`44d9812`; rows 17/18 of `manage-contacts-filter` and 18 `grid-*` tests fail on
fixture/data drift as recorded in `docs/architecture/testing.md` §6. Stories
must report these as pre-existing with `git stash` evidence and must not edit a
gate to hide them. Story 4.2 names them in the release report.
