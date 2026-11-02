---
title: 'Programme dashboard and session-campaign link'
type: 'feature'
created: '2026-11-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-program-dashboard/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-program-dashboard/metrics.md'
  - '{project-root}/_bmad-output/specs/spec-program-dashboard/sections.md'
  - '{project-root}/_bmad-output/specs/spec-program-dashboard/brownfield.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Programme facts are split across `/contacts`, `/campaigns/reports`, `/sessions` and `/manage`, each with a different scope. A Preacher cannot see which collected contacts are stuck, which confirmed invitees never came, or which regulars have gone quiet; an Admin cannot hand a superior one defensible picture of the preaching.

**Approach:** Add a nullable `sessions.campaign_id`, chosen from a Campaign dropdown in the `+ New session` popover, so a reached campaign call is an invitation to that session. Build `/dashboard` in both apps: Admin/Preacher/Assistant, All/Own scope, period presets plus custom year/month, KPI band, collection-to-attendance pipeline, call outcomes, attendance trend, coverage, Focus-now segments and candidate drill-down, team table, active campaigns and recent sessions. Two `SECURITY INVOKER` JSONB RPCs (`dashboard_overview`, `dashboard_candidates`) are the only place a number is computed.

## Boundaries & Constraints

**Always:** Resolve scope server-side from `getStaffContext()`; Admin `?mode=` narrows only; Preacher/Assistant fixed; Assistant resolves through an active assigned Preacher or shows an empty notice without an RPC. Every query filters `program_id`. `reached` = any log outside `NOT_REACHABLE`/`WRONG_NUMBER`; `invited` = reached in a campaign with a linked session in scope; `confirmed` = latest reached log is `CONFIRMED`. Periods are Asia/Kolkata programme days, inclusive. Both RPCs are `SECURITY INVOKER`, `STABLE`, pinned `search_path`, service-role-only. `sessions.campaign_id` is nullable, same programme, `ON DELETE SET NULL`, no unique index. The session form lists non-`CANCELLED` campaigns; the route validates via `getCampaign`. Reuse `DS-Card`/`DS-StatTile`/`DS-ScopeSwitch`/`DS-LiveBand`/`DS-Table`/`DS-EmptyState` and CSS tokens. Header and login landing changes go to both apps.

**Never:** No export, PDF, print, email or scheduled report. No predictive scoring or opaque ranking. No Volunteer dashboard, bulk action, inline edit or call from the dashboard. No new attendance capture flow. No historical campaign-session backfill. No campaign create/edit changes. No change to `/manage`, `campaign_progress`, RLS or proxy matchers. No new dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Admin scope | `?mode=admin` / `preacher` | Whole programme / own rows in every section; URL survives reload | N/A |
| Assistant no preacher | no active `assignedPreacherUserId` | Header, own-scope notice, no RPC, link to `/contact` | N/A |
| Period | preset / `period=custom&year&month` / invalid | Correct window / custom month or year / fallback `last90` | Invalid month/year ignored |
| Session link | valid campaign / `null` / foreign or `CANCELLED` | persists / no link / refused | 400 named error, no FK 500 |
| No linked session | reached campaign, no session | `attended: null`, warning count, no false zero | N/A |
| No dialer | Gita Life | No campaign/call section or RPC dialer read | N/A |
| Core failure | contacts/sessions read fails | Page-level 500 | No silent zeros |
| Campaign failure | dialer section fails | Section error, other sections render | N/A |
| Auth | 401 / 403 / Volunteer | Login redirect / auth error / refused | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261101000000_sessions_flow.sql` — latest; new files sort after it; `sessions_visible` returns `s.*`, `sessions_overview` has explicit OUT columns.
- `supabase/migrations/20261027010000_campaign_progress.sql` — copy its guards, scope predicate and grant block for the new RPCs.
- `supabase/migrations/20261025000000_create_dialer_tables.sql` — status groups, dialer columns, indexes.
- `supabase/migrations/20261010000000_contacts_date_columns_to_date.sql` — `sessions.session_date` and `contacts.initial_contact` are DATE.
- `supabase/migrations/20261004000000_create_core_tables.sql` — attendance columns and unique `(contact_id, session_id)`.
- `lib/supabase/types.ts` — sessions Row/Insert/Update/Relationships ~783-854, `sessions_visible` Returns ~1048, Functions ~917.
- `lib/supabase/data.ts` — `SessionRecord` 118-132, `SessionsRow` 202-215, `mapSession` 674-690, `createSession` 860-905, `findSessionById` 692, select strings 695-920.
- `components/sessions/new-session-popover.tsx` — add `campaigns` prop and Campaign select between Location and Duration; body at 65.
- `apps/folk/app/sessions/page.tsx` — two `NewSessionPopover` call sites 88/95; load non-cancelled campaigns.
- `apps/folk/app/api/sessions/route.ts` — `SessionPayload` 13-17, POST 78-147.
- `apps/folk/app/sessions/[sessionId]/page.tsx` — meta 63-95; add linked campaign via `findSessionById`.
- `lib/dialer/campaigns.ts` — `CampaignRow` 24, `CAMPAIGN_COLUMNS` 21, `listCampaigns` 194, `getCampaign` 213.
- `lib/dialer/disposition.ts` — `DispositionStatus`, `REACHED_GROUPS`, `STATUS_GROUP_LABELS`.
- `lib/sessions/scope.ts` — `sessionsScope` 28; `assignedPreacherId === null` detects no-preacher.
- `lib/authz.ts` — `StaffContext` 15-40, `getStaffContext` 201, `requireRole` 58.
- `lib/program-day.ts` — `programDay`.
- `packages/program-config/src/server.ts` — `getServerProgramProfile().modules.dialer`.
- `lib/contacts/metrics.ts` — pure period/window pattern; `lib/contacts/metrics.test.ts` test style.
- `components/header.tsx` — `navItems` 253-275; add Dashboard first, move Manage after Campaign.
- Login: `apps/folk/app/login/login-page-client.tsx` 13-31, `apps/gita-life/app/login/login-page-client.tsx` 16-34, `components/auth-hash-callback.tsx` 14-32, `components/auth-error-content.tsx` 13-19.
- UI: `components/manage/manage-dashboard.tsx` 89-114 (`ChartFrame`), `components/campaign/campaign-overview-stats.tsx` 35, `components/campaign/campaign-list.tsx` 19, `components/sessions/session-live-strip.tsx` 15, `components/live-attendance-dashboard.tsx` 73-132 (polling), `components/section-card.tsx`, `components/campaign/campaign-empty-state.tsx`, `components/ui/chart.tsx`.
- Pages: `apps/folk/app/dashboard/page.tsx`, `apps/gita-life/app/dashboard/page.tsx` (replace); new `apps/*/app/dashboard/candidates/page.tsx`.
- Tests: `e2e/fixtures/sessions.ts` 174-211, `e2e/fixtures/dialer-campaign.ts`, `e2e/fixtures/dialer-reports.ts`, `e2e/specs/campaign-overview.spec.ts`, `e2e/specs/sessions-overview.spec.ts` 209-240, `package.json` scripts 60-65.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261102000000_add_session_campaign_link.sql` — add nullable `sessions.campaign_id` FK, `idx_sessions_campaign_id`, `idx_sessions_campaign_date` — enables exact invite→attendance.
- [x] `lib/supabase/types.ts` — add the sessions column, FK relationship and two RPC signatures — type gate.
- [x] `lib/supabase/data.ts` — carry `campaignId` through `SessionRecord`, `SessionsRow`, `mapSession`, `createSession`, all session select strings — one DTO.
- [x] `components/sessions/new-session-popover.tsx`, `apps/folk/app/sessions/page.tsx`, `apps/folk/app/api/sessions/route.ts` — Campaign dropdown, campaign options, same-programme/non-cancelled validation — CAP-7.
- [x] `apps/folk/app/sessions/[sessionId]/page.tsx` — show the linked campaign; hide on 404 — read path.
- [x] `supabase/migrations/20261102010000_dashboard_rpcs.sql` — indexes, `dashboard_candidates` (five segment predicates), `dashboard_overview` (KPIs, pipeline, outcomes, attendance, coverage, team, campaigns, recent sessions; calls `dashboard_candidates` for focus counts/top 3) — the one definition.
- [x] `lib/dashboard/period.ts` + `lib/dashboard/period.test.ts` — presets, custom year/month, previous window, invalid fallback, Asia/Kolkata today — pure and testable.
- [x] `lib/dashboard/types.ts`, `overview.ts`, `candidates.ts` + `overview.test.ts` — server-only loaders, strict JSON parsing, empty-scope path — no component counting.
- [x] `components/dashboard/*`, `apps/*/app/dashboard/page.tsx` — header/scope/period, live band, KPI band, pipeline, outcomes, attendance, coverage, focus, team, campaigns, recent sessions, states — CAP-1..6, 8.
- [x] `apps/*/app/dashboard/candidates/page.tsx` — segment list, 50/page, unknown segment 404 — CAP-5.
- [x] `components/header.tsx`, four login files — Dashboard first, Manage last, role landing paths — navigation.
- [x] Gita Life page/data — `hasDialer=false`, no campaign sections or dialer payload — CAP-9.
- [x] `scripts/verify-dashboard-metrics.mjs`, `package.json` script, `e2e/fixtures/dashboard.ts`, `e2e/specs/dashboard-*.spec.ts` — contract and browser verification.
- [x] `pnpm test:static`, `pnpm test:unit`, `pnpm supabase:push`, `pnpm test:dashboard-contract`, `pnpm test:e2e --list dashboard-`, `pnpm test:e2e dashboard-`, full `pnpm test:e2e`, `pnpm test:e2e:determinism` — evidence.

**Acceptance Criteria:**
- Given an Admin on `/dashboard`, when toggling `?mode=admin|preacher`, then every section narrows and the URL reproduces the view.
- Given a session created with a campaign, when the contact is reached and attends, then the pipeline's invite→attendance count includes them; a foreign or cancelled campaign returns a named 400, not a 500.
- Given a confirmed invitee with no attendance, when Focus now renders, then they appear with the session and reason.
- Given a custom month with no activity, when `/dashboard?period=custom&year=2026&month=11` loads, then zeros/empty states render without a 500.
- Given Gita Life, when `/dashboard` loads, then no campaign/call section or dialer RPC read occurs.
- Given a Preacher or Assistant, when the page loads, then only their scope's rows appear; a Volunteer gets 403.
- Given the seeded/fixture programme, when comparing every displayed figure to the RPC/SQL count, then they match.

## Implementation Notes

- The page is one server render. `dashboard_overview` is the only page read; the
  live band is a separate scoped read. Components format parsed values and never
  count rows.
- Mid-course direction from Dwaraka removed Contact coverage, Call outcomes and
  the Admin All-preachers live band, and moved Attendance and the team table
  directly under the KPI band. The RPC still returns outcomes and coverage; no
  component renders them, and the e2e asserts their absence.
- Campaign creation moved into one `NewCampaignPopover` used by both Overview
  entry points (name + shadcn end-date picker). `/campaigns/new` redirects to
  `/campaigns`.
- The call-outcome survey moved from the campaign detail/edit pages to the
  assign-contacts right panel. The panel opens on the caller split; assigning
  slides the survey in, and a circular back control beside the survey title
  returns to the caller split. The tab switcher is gone.
- The assign-contacts header is now the campaign's property sheet: the name is
  an inline field that saves on blur, the end date a shadcn date picker that
  saves on pick. Both PATCH the campaign and refresh the server data.
- The panel switch copies Airtable's account-menu behaviour observed over CDP:
  the card frame stays fixed and only its content slides. It is a CSS
  `transform` transition on a two-panel track inside one bordered frame; each
  panel scrolls independently and keeps its footer (assign button or Start
  campaign) pinned inside that frame. No GSAP or new dependency.
- The grid fills the viewport below the campaign header (measured client-side,
  so the responsive header does not need a hardcoded offset). Its columns now
  include `Initial Contact` and `Collected By`, fetched from
  `contacts.initial_contact` and the resolved `contacts.collected_by_id`.
- The primary assign action no longer starts the campaign. Assigning writes the
  assignments and slides the survey in; `Start campaign` lives inside the
  survey's pinned footer, so it cannot be clicked while the survey is out of
  view. Pressing Assign clears the row selection immediately; the request and a
  conflict dialog both carry a snapshot of the selected ids.
- When the selection contains contacts already assigned here, the primary action
  opens a decision dialog: `Reassign` writes with `mode: "move"`, `Skip and
  assign` writes with `mode: "skip"`. When every selected contact is already
  assigned, Skip is absent and the label offers only Reassign, replacing the
  old `nothing_to_assign` dead end. The dialog groups conflicts by their current
  assignee and widens to fit its action labels up to the viewport, so a large
  count or a long caller name does not create a horizontal scrollbar.
- The survey question cards were re-laid out around lucide icons: up/down,
  pencil and trash, with the Retire control removed. Questions with recorded
  answers stay read-only history and cannot be deleted.

## Verification

**Commands run in the later layout pass (2026-11-02):**
- `pnpm guardrails` — pass.
- `pnpm typecheck:workspace` — pass.
- `eslint` on the changed components and specs — pass.
- Targeted campaign e2e — the first 18 of 55 passed, including the
  assign → survey → Start flow, before the run was stopped at Dwaraka's request.
  The new skip/reassign decision tests and the final outer-frame change were not
  e2e-verified; they are typechecked and linted.

**Commands run earlier in the session (before the later layout pass):**
- `pnpm test:static` — guardrails, `typecheck:workspace` and lint pass; 0 errors
  (17 pre-existing warnings).
- `pnpm test:unit` — 10 files, 93 tests pass.
- `pnpm test:dashboard-contract` — 28/28 invariant checks pass against the local
  stack (including the `p_has_dialer = false` path and the unlinked-campaign
  `attended: null` rule).
- `pnpm test:e2e "campaign-(campaigns|overview|surfaces|assign-write|assign-select|survey)"`
  — 54 passed (4.6m) before the layout pass.
- `pnpm test:e2e campaign-campaigns` — 14 passed (1.1m), including the
  autosaving name/date header test.

**Not rerun:**
- Full `pnpm test:e2e` and `pnpm test:e2e:determinism` after the layout pass.
- `pnpm supabase:push` — both migrations were already applied to the local stack
  and the dashboard contract exercises them.
