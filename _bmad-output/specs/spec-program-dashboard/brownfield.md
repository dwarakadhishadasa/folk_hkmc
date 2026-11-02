# Brownfield — what exists, what changes, what to verify

## 1. Starting point

`dev` at `a15eb57` already carries:

- `/dashboard` in both apps as a **legacy entry point**: it redirects to the newest live
  session's `/sessions/{id}/live`, otherwise renders the live-attendance empty state.
- `/sessions` with overview, insights and live detail; the live-attendance surface lives
  there.
- `/contacts` with Overview, Reports and a filterable Grid. `lib/contacts/metrics.ts` is
  the one-definition module; `ContactsPeriodSelect` and `ContactsMonthYearFilter` are the
  period patterns; `gridFilterHref` deep-links a figure to its row set.
- `/campaigns` with `campaign_progress` (assignment-grain funnel), `/campaigns/reports`,
  and the CSV export route.
- `/manage` with the Admin/Preacher `?mode=` scope switch and the old `ManageDashboard`
  charts, including the derived `status quo` pie.
- `components/header.tsx` shared by both apps, with `Contact · Sessions · Invite · Manage ·
  Campaign`. There is no Dashboard item.
- `proxy.ts` already matches `/dashboard/:path*`, so session refresh runs there.

**This branch is rebased onto `dev` at `a15eb57`.** It carries the sessions live routes
and the contacts section. Extend those surfaces; do not re-create them.

The WDS page and `_bmad-output/D-Design-System/00-design-system.md` are untracked in this
worktree. Commit them with this spec; the `companions:` paths depend on them.

## 2. Schema changes

### 2.1 Session to campaign link

`supabase/migrations/20261029000000_add_session_campaign_link.sql`:

```sql
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.dialer_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_campaign_id
  ON public.sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sessions_campaign_date
  ON public.sessions(campaign_id, session_date DESC);
```

- No RLS change: the column rides the existing `sessions` policies. The write path is the
  service-role session create route.
- `ON DELETE SET NULL` keeps a session when its campaign is removed. Campaigns are never
  deleted by a role (no `DELETE` grant), so this is a safety valve, not a workflow.
- `campaign_id` must be a campaign in the same `program_id` and inside the staff member's
  campaign scope. Enforce it in `POST /api/sessions` / `createSession`, not only by
  filtering the dropdown.
- One session holds one campaign; a campaign may be linked to more than one session. The
  dashboard aggregates across linked sessions. Do **not** add a unique index on
  `campaign_id`.
- Update `lib/supabase/types.ts` for the new column and the two RPCs. The file is checked
  in; `pnpm typecheck:workspace` catches a missed shape.

### 2.2 Dashboard functions and indexes

`supabase/migrations/20261029010000_dashboard_rpcs.sql`:

- The indexes listed in `metrics.md` §11.
- `dashboard_overview` and `dashboard_candidates`, exactly as contracted in `metrics.md`
  §10. Both `SECURITY INVOKER`, `STABLE`, pinned `search_path`, service-role-only
  `EXECUTE`.
- `p_has_dialer BOOLEAN` on both RPCs: when false, every `dialer_*` CTE is skipped and
  `outcomes`, `campaigns`, and call-dependent pipeline stages are empty/zero. Gita Life
  must not read campaign rows it never shows.
- Function bodies are one statement with CTEs. Do not call `campaign_progress` once per
  campaign from the overview.

The local migration order is after `20261028000000_dialer_survey_responses.sql`. Use
`pnpm supabase:push` / `pnpm supabase:reset`, never a bare `supabase` CLI.

## 3. New session form and read path

The `+ New session` action is `components/sessions/new-session-popover.tsx`, a popover on
`/sessions` that starts a session immediately. Add a Campaign select between Location and
Duration.

- `components/sessions/new-session-popover.tsx`
  - New prop `campaigns: Array<{ id: string; name: string; status: string; campaignDate: string }>`.
  - A labelled `Campaign` select: `No campaign` (default), then the campaigns sorted
    ACTIVE first, then `campaign_date` desc, then name. Label each
    `{name} · {date} · {status}`.
  - The field is absent when the programme has no Campaign module. In Gita Life the prop
    is empty and the select never renders.
  - Submit `campaignId` with `name`, `locationId`, `durationMinutes`.
- `apps/folk/app/sessions/page.tsx`
  - Load the campaign options with `listCampaigns(staff)` (already scope-aware) when
    `modules.dialer`; pass every non-`CANCELLED` campaign. This is the reader's existing
    list, not a new trust boundary.
  - `listCampaigns` throws `campaign_scope_missing` for an Assistant with no assigned
    Preacher. Catch that case and pass `[]`; `/sessions` must still render its existing
    empty-location state rather than a 403.
  - `apps/gita-life/app/sessions/page.tsx` passes `[]`.
- `apps/folk/app/api/sessions/route.ts`
  - `SessionPayload` gains `campaignId?: string | null`.
  - Absent, null or empty means no link. A provided id must be a UUID, exist in the same
    programme, be readable by the caller's `campaignScope`, and not be `CANCELLED`. A
    failure is a named `400`/`403`, not a foreign-key `500`.
  - Pass `campaignId` to `createSession`.
- `lib/supabase/data.ts`
  - `createSession` accepts `campaignId?: string | null`, inserts `campaign_id`, selects
    it, and `SessionRecord` carries `campaignId`.
  - Every session select string that feeds a DTO includes `campaign_id`.
- `apps/folk/app/sessions/[sessionId]/page.tsx` — show the linked campaign with a link to
  `/campaigns/{id}`, or nothing when unlinked. Resolve it through the reader's campaign
  scope; if the campaign is not readable, show no link rather than a 403.
- `lib/sessions/data.ts` — `SessionOverviewRow` and the detail read carry `campaignId` when
  the detail page needs it.
- The campaign create/edit forms, campaign list, reports, export and caller queue are
  unchanged. They do not carry a session.
- `e2e/fixtures/dialer-campaign.ts` — the campaign fixture is unchanged; the dashboard
  fixture creates its session through `POST /api/sessions` with `campaignId`, or updates
  the session's `campaign_id` through the loopback SQL endpoint.

## 4. Dashboard module

Suggested shape (keep the server/client boundary explicit):

```
lib/dashboard/
  period.ts          pure parser/resolver; no React, no server imports
  types.ts           client-safe DTOs; imports nothing server-only
  overview.ts        server-only loader; calls the RPCs; parses JSON
  candidates.ts      server-only loader for the drill-down
components/dashboard/
  dashboard-page.tsx        server-rendered composition
  dashboard-header.tsx      title, scope line, scope switch, period control
  dashboard-period-control.tsx  client; URL navigation
  live-sessions-band.tsx    client; 20 s polling
  kpi-band.tsx
  pipeline-card.tsx
  outcomes-card.tsx
  attendance-card.tsx
  coverage-card.tsx
  focus-card.tsx
  team-table.tsx
  campaigns-card.tsx
  recent-sessions-card.tsx
  dashboard-empty.tsx
apps/folk/app/dashboard/page.tsx
apps/folk/app/dashboard/candidates/page.tsx
apps/gita-life/app/dashboard/page.tsx
apps/gita-life/app/dashboard/candidates/page.tsx
```

- `overview.ts` starts with `import "server-only"` and uses
  `createSupabaseAdminClient()`. It resolves the scope from `StaffContext`; it never takes
  a scope id from the URL.
- `overview.ts` parses the RPC payload with the same discipline as
  `lib/dialer/progress.ts`: a missing count is a read failure, never a `0`; a text field
  is checked; an array is mapped explicitly.
- `types.ts` imports nothing. `components/dashboard/*` may import it; they may not import
  `@/lib/supabase/*` or `@/lib/authz`.
- `period.ts` exports `parseDashboardPeriod(searchParams, today)`,
  `resolveDashboardWindow(period, today)` and the labels. It is unit-tested without a
  database. It returns the current and previous windows so the RPC does not do calendar
  math.
- The page resolves `hasDialer` from `currentProgramProfile.modules.dialer` (or the
  existing server helper), not from an env var.

Scope resolution:

- Reuse the existing Assistant resolution (`assignedPreacherUserId` must resolve to an
  Active Preacher in the same programme). `lib/sessions/scope.ts` already does this for
  Sessions; extract one shared helper if it is a third copy.
- Do not re-implement the predicates. The RPC takes the resolved `programScope` and
  `scopePreacherId`; the loader passes them.

## 5. Navigation and landing paths

- `components/header.tsx`: add `Dashboard` first, `LayoutDashboard` icon, href `/dashboard`.
  Admin, Preacher and Assistant see it. Volunteer does not. Keep `Manage` at the end of
  the desktop row. The mobile bar goes to six items for an Admin; check the 360 px and
  390 px fit without truncation.

  | Role | Dashboard | Contact | Sessions | Invite | Campaign | Manage |
  |---|---|---|---|---|---|---|
  | Admin | `/dashboard` | `/contact` | `/sessions` | `/admin/invite` | `/campaigns` | `/manage` |
  | Preacher | `/dashboard` | `/contacts` | `/sessions` | `/volunteers` | `/campaigns` | `/manage` |
  | Assistant | `/dashboard` | `/contact` | `/sessions` | — | `/campaigns` | — |
  | Volunteer | — | `/contact` | — | — | `/campaigns/assignments` when an active caller | — |

  The matrix preserves every existing gate. The only additions are Dashboard for the three
  dashboard roles and Manage moving to the end of the row. A Preacher's Contact href is
  the `/contacts` section on `dev`; leave that as it is.
- This file is shared by both apps and by every staff route. A change here escalates
  verification to the full e2e suite.
- Login landing paths must agree in all four copies:
  - `apps/folk/app/login/login-page-client.tsx`
  - `apps/gita-life/app/login/login-page-client.tsx`
  - `components/auth-hash-callback.tsx`
  - `components/auth-error-content.tsx`
  Admin and Preacher land on `/dashboard`; Assistant lands on `/dashboard` and may be
  redirected to `/dashboard`, `/sessions` or `/contact`; Volunteer stays `/contact`.
  The Assistant redirect guard is a UX guard, not authorization; every page keeps its own
  `requireRole`.
- `proxy.ts` already matches `/dashboard`, so no matcher change is needed.

## 6. Gita Life parity

- The page and components are shared. `modules.dialer` false removes the KPI calls/
  reached/confirmed tiles, the outcomes card, the campaign card, and the call-based focus
  segments.
- The loader must not read the dialer path at all. Pass `p_has_dialer = false`; both
  functions skip every `dialer_*` CTE. The module flag hides the feature; it is not a
  schema boundary, so this is a read-surface rule, not a migration rule.
- The team table is still by preacher (All) or location (Own). Attendance, coverage,
  recent sessions and the attendance-based focus segments are unchanged.

## 7. Seed and end-to-end fixtures

The seed (`scripts/seed-preview-fixtures.mjs`, via `pnpm seed:local`) creates staff,
locations, contacts, sessions and attendance, but **no campaigns**. Campaign E2E specs
create disposable campaigns through the real admin route. The dashboard spec should do
the same:

- Create a disposable campaign, then create a session linked to it
  (`sessions.campaign_id`) through the real session route.
- Create contacts in scope with distinct outcomes: one assigned and never called, one
  called and not reached, one reached but not confirmed, one confirmed and attended, one
  confirmed and absent, one organic attendee, one untouched new contact, one fading
  regular.
- Insert call logs and attendance through the service role using the loopback-guarded SQL
  endpoint (`e2e/fixtures/dialer-campaign.ts` pattern), not through a UI path that would
  make the test depend on the disposition screen.
- Remove the session, the campaign, its assignments, call logs, survey responses and any
  promoted caller profiles in a `finally`. Never leave a deliberately broken fixture.
- Use a unique run prefix; the database is shared by every spec and one e2e runner must
  run at a time.

If the spec asserts a count, compute the expected value from the fixture it created, not
from the global seed, so an unrelated seed change does not turn the gate red.

## 8. Tests

### Unit (Vitest, node environment)

- `lib/dashboard/period.test.ts`: every preset, custom year, custom month, invalid values
  falling back to `last90`, leap day, month-end, current-month clipping, previous-window
  math.
- `lib/dashboard/overview.test.ts`: payload parsing accepts a complete payload and rejects
  a missing count, a wrong type and a missing segment. No React, no DOM.
- `lib/dashboard/candidates.test.ts`: segment key validation, limit/offset coercion.

### Contract against the local database

Add `scripts/verify-dashboard-metrics.mjs` and a `pnpm test:dashboard-contract` script.
It reads the local credentials, calls both RPCs with a service-role client, and asserts
the reconciled figures for the seeded programme and a disposable fixture:

- `contactsConfirmed` matches the fixture's confirmed contacts.
- The pipeline stages are stacked: each stage <= the previous.
- `sum(outcomes) = callsMade`.
- `uniqueAttendees = invitedAttendees + organicAttendees`.
- The campaign card's `assigned/attempted/reached/confirmed/neverAttempted` equals
  `campaign_progress` for the same campaign and scope.
- An unlinked campaign returns `attended: null`.
- A campaign with two linked sessions aggregates `attended` across them.

This gate needs the local stack up once (`pnpm dev:local`) and must never run against a
non-loopback URL. Follow the `scripts/verify-attendance-contract.mjs` guard pattern.

### E2E (Playwright)

- `e2e/specs/dashboard-overview.spec.ts` — the KPI band, pipeline, attendance, coverage,
  team and campaign card for a disposable fixture; assert displayed numbers, not just
  labels.
- `e2e/specs/dashboard-scope.spec.ts` — Admin All/Own narrows every section; Preacher
  sees own only with no switch; Assistant sees their preacher's patch; Volunteer is
  refused; a shared URL reproduces the period and scope.
- `e2e/specs/dashboard-period.spec.ts` — a preset and a custom month change the figures;
  an invalid period falls back to `last90`; the URL is the state.
- `e2e/specs/dashboard-candidates.spec.ts` — each segment's count and rows, pagination,
  unknown segment 404.
- `e2e/specs/dashboard-campaign-link.spec.ts` — from the `+ New session` popover, start a
  session with a campaign, start one with `No campaign`, reject another programme's
  campaign, and see the dashboard conversion change.
- `e2e/specs/dashboard-no-dialer.spec.ts` (gita-life) — no campaign surface, no dialer
  request, attendance sections render.
- Add `test:e2e:dashboard` to `package.json` as `pnpm test:e2e dashboard-`. The suite
  asserts `package.json` and `playwright.config.ts` as text; update the assertion in the
  same change if it enumerates scripts. Never edit the assertion to hide a real change.

Commands, in order:

```
pnpm test:static
pnpm test:unit
pnpm test:dashboard-contract        # local stack up
pnpm test:e2e --list dashboard-
pnpm test:e2e dashboard-
pnpm test:e2e                       # full: header + login paths changed
pnpm test:e2e:determinism           # specs/fixtures changed
```

State the actual pass counts in the story report. CI does not run e2e or the contract
gate.

## 9. Blast radius and risks

| Risk | Mitigation |
|---|---|
| This branch is rebased onto `dev` at `a15eb57` for this spec | Re-check `dev` before implementation; extend the contacts/sessions surfaces rather than re-creating them. |
| `components/header.tsx` is shared by both apps and every staff route | Full e2e; check the 6-item mobile bar at 360 px and 390 px. |
| Login landing paths exist in four files | Update all four; assert each role in e2e. |
| `campaign_progress` and the dashboard duplicate funnel definitions | Contract test compares them for seeded campaigns; fix the definition, not the test. |
| A session linked to another programme's campaign | Server-side validation in `POST /api/sessions`; RLS alone does not cover a service-role write. |
| A deleted session leaves its campaign unlinked | Dashboard renders `No session linked` and `attended: null`; no orphan or 500. |
| A campaign linked to more than one session | The card aggregates `attended` across linked sessions and shows `{newest} +N more`; a contact is counted once. |
| All-time window over a large table | `p_start NULL` path uses the indexes; benchmark with 5k contacts / 50k logs. |
| Live band polling leaks after navigation | Reuse the existing visibility-aware interval and clear it on unmount. |
| Period math drifts at month/year boundaries | Pure `period.ts` with fixed `today` fixtures; no `new Date()` in components. |
| Payload parser silently turns a missing key into 0 | Parse strictly; throw a 500 on a missing count, matching `lib/dialer/progress.ts`. |
| `/manage` still shows old charts and could disagree | The new page does not repeat the status-quo metric; any shared figure is reconciled in the contract test. The retirement question is open in `SPEC.md`. |

## 10. Out of scope for this change

- Retiring or redirecting the `/manage` Dashboard tab.
- A Volunteer dashboard.
- Bulk assignment or calling from the dashboard.
- Export, print or email.
- Historical campaign-session backfill.
- Predictive scoring or AI recommendations.
