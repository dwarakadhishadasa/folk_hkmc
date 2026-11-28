# FOLK loading-state audit

**Scope:** FOLK routes and the shared code they actively mount. Gita Life is excluded.
**Status:** static source audit plus read-only timing samples of public preview routes. No test suite was run.

**Priority:**

- **P0:** blank or misleading primary experience, lost work, or false success/empty semantics.
- **P1:** missing refresh, recovery, action, or partial-data feedback.
- **P2:** scalability, redundancy, accessibility, and secondary-surface polish.

---

## 1. Executive summary

FOLK is a Next.js App Router application whose substantive staff and public pages generally await Supabase work in a server component. Except for `/login` and `/register`, the audited FOLK route tree has no route-owned `loading.tsx` or `error.tsx`. Cold loads therefore have no page-shaped fallback, and unexpected read failures reach the framework error surface.

The highest-impact loading defects are:

1. **Blank route handoffs:** `/register` has a `loading.tsx` that returns `null`; `/login` returns `null` while redirecting an authenticated user.
2. **No cold-load treatment for data-heavy pages:** Dashboard, Contacts, Manage, Sessions, Campaigns, assignment, and caller routes all wait for server reads without a skeleton or retryable route error.
3. **Loading is confused with empty:** live attendance displays “No attendance recorded yet” before its first request and after a failed first request.
4. **Failures become empty or success:** a failed caller-queue refresh becomes “No calls assigned yet”; failed progress reads can become zeroes; several operations use definitive failure copy after an unknowable network outcome.
5. **Pending state is inconsistent:** FOLK uses spinners, custom SVGs, `Loader2`, pulse skeletons, Framer shimmer, route progress, disabled-only controls, text swaps, and completely silent operations.
6. **Background refresh is not consistently distinguished from initial load:** some controls preserve data well; others replace content, refetch the entire route, or leave the previous content unmarked as stale.
7. **Accessibility is uneven:** some regions have strong `aria-busy` and polite status announcements, while grids hide loading rows with no status and several errors lack `role="alert"`.
8. **Reduced motion is fragmented:** the base spinner and skeleton animate unconditionally; the login loading spinner merely slows down under reduced motion.

The strongest foundations to preserve and extend are the grid’s typed loading/error/empty model, the contact-comments skeleton, the dashboard period control’s transition semantics, the caller disposition receipt model, the delayed route-progress bar, and the semantic light/dark token system.

### Observed public-preview baseline

Single anonymous requests against the documented FOLK preview URL produced these measurements:

| Route | HTTP | Time to first byte | Total |
|---|---:|---:|---:|
| `/` | 200 | 2.725s | 2.788s |
| `/login` | 200 | 0.544s | 0.547s |
| `/register` | 200 | 0.723s | 0.725s |
| `/attend?session=audit-invalid` | 200 | 0.459s | 0.466s |

These are individual connectivity samples, not benchmarks or a service-level measurement. They confirm that a cold request to the DB-backed home route can have a visible server wait. Authenticated staff-route timings and post-implementation preview comparisons remain unverified.

---

## 2. Runtime and design-system foundations

### Server and client data flow

- Staff pages resolve Supabase auth and `public.users` server-side. Sessions and Campaigns layouts mount `StaffAuthShell`, `Header`, and the page shell only after staff resolution.
- Most pages use `dynamic = "force-dynamic"` and await all required reads before rendering.
- There is no React Query or SWR layer. Client operations use direct `fetch`, local booleans, manual optimism, and occasional `useTransition`/`useLinkStatus`.
- Initial page data is therefore server-rendered; component-level loading applies mainly to polling, overlays, mutations, filters, and programmatic navigation.
- Shared `components/*` code is mounted by both programs. FOLK-only loading behavior must be introduced through FOLK-local components or explicit opt-in props, not unconditional shared changes.

### Theme and design tokens

- FOLK uses Tailwind CSS v4 through `apps/folk/app/globals.css`; there is no active Tailwind config file.
- Light and dark semantic tokens are defined in `apps/folk/app/globals.css:102-332`.
- Loading surfaces should use `bg-muted`, `bg-accent`, `bg-card`, `text-muted-foreground`, `border-border`, and `ring-ring` rather than hard-coded gray or white.
- `next-themes` uses `attribute="class"`, `defaultTheme="dark"`, and `enableSystem` in `components/providers.tsx:14-29`.
- Token-driven loaders automatically follow the active theme and should not read `resolvedTheme` during SSR.

### Framer Motion

- Installed version: **12.43.0** (`node_modules/framer-motion/package.json`).
- Existing APIs in use: `motion`, `animate`, `AnimatePresence`, `useReducedMotion`.
- Existing Framer patterns live in:
  - `components/route-progress-bar.tsx`
  - `components/page-transition-controller.tsx`
  - `components/dashboard/aurora-ring.tsx`
  - `components/dashboard/kpi-band.tsx`
  - `components/manage/contact-comments-pane.tsx`
- `useReducedMotion()` is nullable in the installed typings and initializes from a snapshot; do not assume a mounted loader reacts immediately to an OS preference change.
- CSS `motion-reduce:` variants are still required for continuous CSS animations such as `animate-spin` and `animate-pulse`.
- Shimmer should animate only transform/opacity, not width, height, margin, or layout properties.

### Existing loading, empty, and error assets

| Asset | Current role | Limitation |
|---|---|---|
| `components/ui/skeleton.tsx` | Generic `bg-accent animate-pulse` block | No reduced-motion or accessibility defaults |
| `components/ui/spinner.tsx` | Lucide `Loader2` with `role="status"` | Always spins |
| `components/ui/empty.tsx` | Token-based empty-state composition | Not a loading primitive |
| `components/ui/alert.tsx` | Alert primitive | Most features hand-write error panels |
| `components/grid/grid-panel.tsx` | Typed loading/error/empty grid panel | Production grids normally receive resolved rows; loading state is mostly preview-only |
| `components/manage/contact-comments-pane.tsx` | Accessible skeleton with polite status and reduced-motion fallback | Local, not shared |
| `components/dashboard/aurora-ring.tsx` | Pending ring for controls | Requires a positioned parent and plate |
| `components/route-progress-bar.tsx` | Delayed navigation progress | Only active for opted-in navigation |
| `components/ui/progress.tsx` | Determinate Radix progress | No active FOLK consumer; no indeterminate variant |
| `components/sessions-manager.tsx` | Full accessible sessions skeleton | Not mounted by the audited FOLK routes |

### Navigation feedback

- `components/navigation-feedback-provider.tsx` tracks an opt-in pending path and clears it on arrival or after 12 seconds.
- `components/route-progress-bar.tsx` delays display by 150 ms, stages progress, and respects reduced motion.
- Header links use the provider and show pending spinners.
- Ordinary `next/link` calls, most `router.push()` calls, filters, report pickers, saved-view changes, and `router.refresh()` calls do not opt in.
- The dashboard period control is the only `useTransition` implementation; the dashboard scope link is the only `useLinkStatus` consumer.

---

## 3. Route inventory

### Public and authentication routes

| Route/component | Data dependency | Current behavior | Recommended treatment | Priority |
|---|---|---|---|---|
| `/` | `listLocations()`; `POST /api/gita-life/registration` with payment screenshot upload; external images/video; clipboard | No route fallback. Location read can delay first paint. Empty locations are not explained. Landing → registration → payment → success are synchronous local view changes until payment. Payment form remains visible with a spinner and disabled submit; clipboard/payment failures need clearer semantics. | Hero/form-shaped fallback; explicit unavailable-locations state; preserve payment form with accurate upload/submit status and retryable errors; no loader for synchronous local step changes. | **P0/P1** |
| `/register` | Search params; `POST /api/registration`; offline queue | `apps/folk/app/register/loading.tsx` returns `null`; Suspense fallback is bare text; submit changes to “Registering...”; success/duplicate/queued outcomes share limited semantics. | Form-shaped skeleton, stable header, reusable button loading, distinct queued/success/error/duplicate states. | **P0** |
| `/attend` | `POST /attendance`; registration handoff; offline queue | Form paints immediately. Custom spinning SVG and “Checking...”; unknown-mobile redirect has an unexplained delay; errors lack alert semantics. | No blocking initial loader; explicit registration handoff, accessible submit status, distinct queued/error states. | **P1** |
| `/login` | `/api/auth/me`, OTP send/verify, staff sync | Unhydrated page is replaced by text-only “Loading...”; authenticated redirect returns `null`; verification pending resets before the new document finishes. | Preserve header/login shell; explicit “opening your portal” state; retain verification pending through navigation; bounded failure/retry. | **P0** |
| `/auth/hash-callback` | Supabase session setup and staff sync | Static handoff text with no live status, timeout, or recovery. | Branded handoff, polite status, bounded failure, retry/back-to-login. | **P0/P1** |
| `/auth/error` | Query parsing and optional auth callback | Static error card; invalid-invite callback may wait indefinitely; authenticated redirect has no explicit state. | Keep static error card; add bounded handoff status and retry. | **P1** |
| `/preview-login` | Fixture account DB read; server-action sign-in | No initial route fallback; fixture read errors and empty accounts already have explicit states; submit text changes correctly. | Account-picker/form skeleton and polite pending status; preserve the existing empty/error treatment. | **P2** |
| `/auth/confirm` | Code exchange or token-hash OTP verification and staff sync | Non-visual route handler that redirects to the destination or `/auth/error`; browser-native waiting only. | No skeleton in the route handler; keep the handoff bounded and make the destination/error surface communicate progress and recovery. | **P1** |
| Logout action | `/auth/signout` | Client clears local staff immediately, races sign-out against 1.5 seconds, and redirects without a pending label. | “Signing out…” state and bounded failure handling. | **P2** |

### Dashboard and contacts

| Route/component | Data dependency | Current behavior | Recommended treatment | Priority |
|---|---|---|---|---|
| `/dashboard` | `dashboard_overview`, `dashboard_people_series`, live sessions, birthdays | No initial fallback. Period control has `useTransition`, `aria-busy`, progress ring, and screen-reader text; scope link has local pending feedback. Other dashboard links do not. Live-count polling retains counts and exposes failure/Retry, but manual retry and timer/visibility requests are not fully serialized. | Dashboard-shaped skeleton; retain old figures during period/scope changes; mark the data region busy; add retryable read error; single-flight live-count refresh and manual Retry feedback. | **P0/P1** |
| `/dashboard/candidates` | `dashboard_candidates` with 50-row pagination | No initial list skeleton or paging pending state. | Candidate-row skeleton; keep current rows during pagination; disable repeated paging; retryable error. | **P0/P1** |
| `/contacts` | Contacts, locations, attendance/comment rollups, staff names, saved views | No initial fallback; metric-link navigation is mostly uninstrumented; chart appears after viewport detection. Month/Year filtering recomputes locally and needs no request loader. The common payload also pays for grid-only saved-view reads. | Metric/card/chart skeletons; reserve chart height; add metric-link pending feedback; keep synchronous filtering spinner-free; separately consider splitting grid-only reads to reduce waiting. | **P0/P1** |
| `/contacts/reports` | Same common section payload; period from URL | No initial fallback. Period select pushes a URL without transition or busy state, so the old report remains unmarked. | Report-shaped skeleton; retain old report while marking it updating; reflect selected period immediately; prevent stale responses. | **P0/P1** |
| `/contacts/grid` | Common contacts payload; mutations; saved views | Blank primary area while `useDeviceView()` returns `null`; production grid does not pass loading/error panel state. Cell edits are optimistic without a confirmed/pending marker. Delete/reorder feedback is limited. Saved views have Saving/Saved labels but weak failure retry and operation locking; favorite pending is mainly dimming. | Neutral grid/list frame during hydration; toolbar/header/row skeletons; per-cell saving state; delete/reorder progress; saved-view retry and guarded actions; accessible favorite pending. | **P0/P1** |

### Manage and staff forms

| Route/component | Data dependency | Current behavior | Recommended treatment | Priority |
|---|---|---|---|---|
| `/manage` | Contacts, sessions, attendance, locations, charts, record availability | Heavy all-tab server read blocks the initial shell; record-availability work also delays unrelated tabs. Local tab switching and local chart/filter controls need no spinner. Attendance/Favorites signed photos can show the previous contact while a new URL is loading. Favorites save/upload states do not fully lock conflicting operations. | Tab-appropriate initial skeletons; keyed photo loading/error states; scope-switch busy state; separate save/upload states with conflicting actions guarded; independently consider deferring Sessions-only availability work. | **P0/P1** |
| `/contact` | Preacher/location reads; contact POST | No initial form fallback; text-only “Saving...”; fields remain editable while the request is in flight; some operational read failures are redirected as authorization failures. Empty preacher options need actionable guidance. | Form-card skeleton; duplicate-submit protection; preserve edits; distinguish auth and server errors; explicit empty reference-data state. | **P1** |
| `/volunteers` | Staff context; invite POST | No initial fallback; text-only pending state; fields remain editable during submit. | Invite-form skeleton; guarded operation state; preserve edits; distinct success/error announcements. | **P1** |
| `/admin` | Redirect to `/manage` | No data of its own. | No dedicated loader unless redirect handoff is visibly slow. | **P2** |
| `/admin/invite` | Preacher/location reads; location and invite POSTs | No initial fallback; add-location and invite operations can overlap; Enter can bypass the disabled Add button. A useful no-locations state already exists. | Invite-card skeleton; one operation state machine; guard Enter and conflicting writes; preserve the no-locations guidance. | **P1** |

### Sessions

| Route/component | Data dependency | Current behavior | Recommended treatment | Priority |
|---|---|---|---|---|
| `/sessions` | Six parallel overview/report/campaign reads plus contact availability; new-session POST | No initial fallback. Location filter reruns all reads and gives no pending state. Empty/filtered-empty states are explicit. Auto-refresh is silent. New-session creation has “Starting...” but separate insert/URL-update writes and an unawaited destination navigation can leave an uncertain outcome or unresponsive handoff. | Overview-shaped skeleton; retain current content during filter refresh; partial insight failures; visible background refresh status; keep creation pending through handoff and distinguish confirmed failure from outcome-unknown. | **P0/P1** |
| `/sessions/[sessionId]` | Scoped overview lookup, session row, campaign, attendee RPC, contact availability | No initial detail fallback; zero attendees produce empty chrome and “0 attendees”; phone sort reruns all reads; out-of-patch summary is text-only with no retry. | Detail/list skeleton; real zero-attendee state; preserve list during sort; summary skeleton and retry. | **P0/P1** |
| `/sessions/[sessionId]/live` | Initial and 20-second `/attendance` polling | **Shows “No attendance recorded yet” before the first response and after a failed first response.** Background failures keep rows but do not mark them stale. Refresh becomes `"..."`; overlapping requests are possible. | Separate initial-loading, empty-confirmed, populated, refreshing, and stale-error states; keep QR and rows; single-flight requests; manual Refresh feedback. | **P0** |

### Campaigns

| Route/component | Data dependency | Current behavior | Recommended treatment | Priority |
|---|---|---|---|---|
| `/campaigns` | Campaign scope, expiry, campaign list, per-campaign progress RPCs; new-campaign POST | No initial fallback; any progress failure fails the whole overview; status filter reruns the full read with no pending state. New-campaign creation disables its button but uses definitive failure copy after network loss and lacks destination-navigation feedback. | KPI/table/card skeleton; retryable error; preserve list during filter; explicit unavailable progress rather than zeroes; outcome-neutral create failure and pending destination handoff. | **P0/P1** |
| `/campaigns/new` | Redirect | No data or form. | No dedicated loader. | **P2** |
| `/campaigns/reports` | Campaign list plus selected progress | No initial fallback; report picker navigation has no pending state and the previous report remains unmarked. No-campaigns, no-assignments, no-calls, empty activity, and empty leaderboard states are explicit. Export has good disabled/error behavior. | Report-shaped skeleton; retain previous report with busy state; preserve selected campaign on error; preserve the distinct empty states; export completion status. | **P0/P1** |
| `/campaigns/callers` | Roster reads plus campaign progress aggregates | No initial fallback; roster and progress run serially; progress failure removes the roster; Reactivate only disables without a pending label. | Roster skeleton; independent “performance unavailable” panel; per-row mutation pending; retry after refresh failure. | **P0/P1** |
| `/campaigns/[campaignId]/assign-contacts` | Full scoped contacts, callers, locations, saved views, precheck, preview | No initial grid/sidebar skeleton. First client paint can show “Open this on a desktop” before device detection. Preview pending is screen-reader-only; selection is cleared before assignment succeeds; failure copy can claim nothing was assigned after an unknowable outcome. | Responsive neutral loading frame; grid/sidebar skeletons; visible precheck/preview states; preserve or restore selection; outcome-neutral failure and recovery. | **P0** |
| `/campaigns/assignments` | Caller queue, campaigns, contacts, logs, surveys, summary/recall | No initial call-card/queue skeleton. Failed queue refresh becomes an empty queue. Summary data is not keyed by campaign and can race; recall refresh is silent. | Call-card/queue skeleton; never map refresh failure to empty; retain confirmed queue and summary; key/abort summary reads; retry. | **P0** |

### Shared components and development routes

| Component | Current behavior | Recommended treatment | Priority |
|---|---|---|---|
| Contact record overlay | Lazy-loaded desktop/phone frame; centered “Loading contact…”; record and comments fetched in parallel. Comments have a good skeleton; main record error closes the frame with only Close. | Immediate overlay frame; record-shaped skeleton; retry on record and comments errors; per-field pending state. | **P1** |
| Shared grid | Typed loading/error/empty panel exists, but production assignment/grid routes normally supply resolved rows. | Reuse the visual language for route-level loading; add a visible loading status to the hidden skeleton rows. | **P1** |
| Offline indicator | Shows online state and service-worker pending count; manual Sync has no busy/disabled state. The caller’s separate local outbox is not represented by the service-worker count. | Show queued/syncing/synced/failed state and prevent repeated manual sync; reconcile the two outbox presentations without losing permanent failures. | **P1** |
| Theme toggle | Returns `null` before mount to avoid hydration mismatch, leaving a small header layout shift. | Reserve the control’s dimensions with a stable placeholder; no spinner is needed. | **P2** |
| PWA install prompt | Awaits the browser install prompt without local pending/disabled state. | Guard duplicate activation and expose a subtle pending state while retaining the browser-owned confirmation. | **P2** |
| `/dev/grid-preview` | Development loading/error state harness | Retain for development coverage; not a product priority. | **P2** |

---

## 4. API and asynchronous-operation inventory

All handlers perform common staff-context reads unless noted.

| Operation | Consumer and current UI |
|---|---|
| `POST /api/registration` | `/register`; text-only submit and limited queued/success/error separation; offline `202 { queued: true }` is a queued outcome, not a failure |
| `POST /api/gita-life/registration` | Active FOLK home payment flow despite its route name; multipart registration, Supabase Storage upload, contact creation and upload cleanup; payment form has spinner but no offline queue |
| `POST /attendance` | `/attend`; custom spinner, inline errors, offline 202 |
| `POST /api/contact` | `/contact`; “Saving...”, toast/status, editable fields during submit |
| `POST /api/volunteers/invite`, `POST /api/admin/invite-user` | Invite forms; text-only pending, overlapping operations possible |
| `POST /api/admin/locations` | Admin invite; “Adding...”, Enter can bypass disabled button |
| `POST /api/sessions` | New session popover; “Starting...”, separate insert and attendance-URL update |
| `GET /attendance` | Live dashboard; initial/empty ambiguity, overlapping polls, stale rows unmarked |
| `GET /api/sessions/[sessionId]/attendees/[contactId]` | Out-of-patch attendee summary; text-only loading, no retry |
| `GET /api/manage/contacts/[contactId]/record` | Contact record; centered text loading, error dialog without retry |
| `GET /api/manage/contacts/comments` | Comments; strong skeleton and error/empty states, no read retry |
| `PATCH/POST/DELETE /api/manage/contacts/*` | Grid edits, favorites, reorder; optimistic values, limited per-action pending state |
| `GET/POST /api/manage/views*`, `/api/dialer/campaign-views*` | Contact/campaign saved views; saving/saved/error labels, limited operation locking, fire-and-forget last-used writes |
| `GET /api/auth/me` | Auth bootstrap and campaign-page background refresh; silent failure |
| `POST /api/auth/signin`, `/api/auth/complete-implicit` | Login/callback; text states, bounded callback absent |
| `GET /auth/confirm`, `/auth/signout` | Non-visual auth route handlers; code exchange/token verification or sign-out followed by redirect |
| `POST /api/dialer/admin/campaigns` | New campaign; “Creating…”, definitive failure copy after network loss |
| `PATCH /api/dialer/admin/campaigns/[campaignId]` | Campaign name/date; no saving state or rollback |
| `PATCH /api/dialer/admin/callers/[callerId]` | Caller status; deactivation pending text, weak reactivation pending |
| `POST .../assignments/precheck` | Assignment selection; debounced, abortable, network failure silently clears result |
| `POST .../assignments/preview` | Weighted preview; visible counts become dashes, pending is screen-reader-only |
| `POST .../assignments`, `POST .../transition` | Assignment and optional campaign start; selection cleared early, uncertain outcomes |
| `GET .../export` | Report export; disabled button, “Exporting…”, inline failure |
| `GET /api/dialer/caller/queue` | Queue refresh, Done, recall; failure returns `null` and can become an empty state |
| `POST /api/dialer/caller/disposition` | Caller disposition; strong Saving/Saved/Queued/refused model |
| `GET /api/dialer/caller/session/summary` | Caller summary; text-only loading, no request keying or retry |
| `POST /api/dialer/caller/session/recall` | Requeue; pending label, silent queue refresh |
| `GET /api/dialer/caller/pending-count` | Mobile menu badge; background and silent stale/zero-on-error behavior |

Browser/platform asynchronous work also includes:

- Clipboard and Web Share operations on the live QR and FOLK payment surfaces; completion is shown in some paths, but rejection handling is incomplete.
- Service-worker registration, which is non-blocking and correctly needs no loading indicator.
- Offline queue status and synchronization through `MessageChannel`, plus the caller’s separate local outbox.
- External image/video loading on the FOLK home; fixed media dimensions and reduced-motion handling matter more than a page loader.
- `next/dynamic` contact-record frame downloads with hover/focus preloading but no explicit first-open fallback.

---

## 5. Cross-cutting state findings

### Initial loading versus background refresh

- Dashboard period changes and live-count polling preserve existing content relatively well.
- Contacts period, session location filter, campaign status filter, report picker, and attendee sort generally leave old content visible without marking it stale.
- Live attendance does not distinguish first load from a confirmed empty result.
- The contact grid has a device-detection blank window; assignment has an incorrect desktop/phone first paint.
- Route progress only appears for opted-in header links; it is not a cold-load fallback.

### Error versus empty

- Live attendance and caller Done can present request failure as empty data.
- Campaign progress failure can eliminate the entire overview rather than rendering identities with unavailable metrics.
- Contact record read failure is recoverable only by closing the dialog.
- Many errors are plain text without retry; some are not `role="alert"`.

### Button and form states

- Most forms disable their submit button and change text, but do not consistently:
  - expose `aria-busy`;
  - prevent conflicting controls from changing;
  - retain edits made during the request;
  - keep pending through the subsequent navigation.
- Campaign name/date autosave has no saving state at all.
- Grid favorite/reorder/delete operations rely on disabling, optimism, or internal state without a clear in-flight presentation.
- Offline replay can silently discard a permanently refused entry while the last receipt remains “Queued — will send.”

### Partial data

- Sessions, Campaigns, Callers, Dashboard, and assignment read optional/secondary data in the same blocking path as primary data.
- A secondary failure should not erase a usable primary surface.
- Never substitute zeroes or an empty state for unavailable data.

### Request sequencing and stale responses

- Live attendance, caller summary, campaign autosave, and saved-view autosave lack complete abort/sequence guards.
- AbortControllers exist in precheck/preview and contact-record loads; preserve those patterns.
- Background polling should be single-flight or supersede older responses deterministically.

### Accessibility and reduced motion

Strengths:

- Contact comments: polite status, screen-reader text, shaped skeleton, reduced-motion handling.
- Dashboard period: `aria-busy`, visible ring, screen-reader update.
- Header navigation: pending link `aria-busy`, decorative spinner hidden.
- Grid errors: `role="alert"` and retry.
- Caller disposition receipts: persistent named states.

Gaps:

- Base skeleton and spinner have no reduced-motion behavior.
- Grid loading rows are `aria-hidden` without a status announcement.
- Text-only record loading lacks `aria-busy` on the region.
- Several public form errors lack alert semantics.
- Most button pending states do not expose `aria-busy`.
- Public ambient CSS animations and autoplay media lack a reduced-motion override.

---

## 6. Existing test coverage and gaps

Relevant specs exist for route behavior, but not for most loading/error/refresh states. No test suite was run for this audit.

### Sessions and live attendance

Existing coverage:

- `e2e/specs/sessions-overview.spec.ts`: rows/status/live navigation, creation, charts, records, location filter, boundary refresh, phone/scope, one live attendance response.
- `e2e/specs/sessions-detail.spec.ts`: attendees, premium record, phone sort, authorization and gateway failures.
- `e2e/specs/dashboard-campaign-link.spec.ts`: session creation linked to campaigns.

Missing:

- Delayed initial RSC response and visible skeleton.
- Filter/sort pending state while preserving content.
- Zero-attendee state.
- Initial live-attendance loading versus confirmed empty.
- Failed initial and background polls; stale-row presentation.
- Overlapping poll requests and manual Refresh pending.
- Session-create outcome-unknown handling.

### Campaigns and caller

Existing coverage:

- `e2e/specs/campaign-campaigns.spec.ts`: empty/create/list/actions.
- `e2e/specs/campaign-overview.spec.ts`: counts, phone cards, scope.
- `e2e/specs/campaign-reports.spec.ts`, `campaign-reports-mobile.spec.ts`, `campaign-export.spec.ts`.
- `e2e/specs/campaign-callers.spec.ts`: roster and status mutations.
- `e2e/specs/campaign-assign-select.spec.ts`, `campaign-assign-write.spec.ts`, `campaign-views.spec.ts`.
- `e2e/specs/campaign-queue.spec.ts`, `campaign-session.spec.ts`, `campaign-disposition.spec.ts`, `campaign-receipts.spec.ts`, `campaign-offline.spec.ts`, `campaign-summary.spec.ts`.

Missing:

- Delayed initial route and skeleton assertions.
- Precheck/preview pending and network failure.
- Selection preservation after assignment failure.
- Assignment-succeeded/start-failed recovery.
- Campaign metadata saving state.
- Failed queue refresh after Done.
- Stale/out-of-order caller summaries.
- Offline replay in-progress and terminal failure notices.
- Partial roster/progress failure.

### Dashboard, contacts, and manage

Existing coverage:

- Dashboard overview/scope/period/candidates specs.
- Contacts overview, reports, grid, saved views, and record specs.
- Manage contact editing, filtering, selection, lifecycle, and list specs.
- Record-review attendance specs.

Missing:

- Cold-load skeletons for dashboard, candidates, contacts, manage, and grid.
- Background refresh with old content retained and `aria-busy`.
- Period/scope/filter/pagination pending and stale-response behavior.
- Device-detection loading frame.
- Signed-photo A-to-B loading correctness.
- Grid cell-saving/reorder/delete progress.
- Contact-record delayed chunk, loading skeleton, and retry.

### Public and auth

Existing coverage:

- Smoke/auth behavior and theme switching.
- Registration and attendance API contracts.
- Some contact-form and invite form theme checks.

Missing:

- Register route fallback.
- Login authenticated redirect and OTP handoff pending.
- Attendance registration handoff and offline queue states.
- Payment submission and upload error states.
- Initial reference-data failures on contact/invite forms.

---

## 7. Consolidated implementation architecture

Place the reusable system under `apps/folk/app/_components/loading/`. The private folder is FOLK-owned, excluded from routing, and covered by the existing `@source "./**/*.{ts,tsx}"` declaration in `apps/folk/app/globals.css`.

### Components

- `Skeleton`
- `SkeletonText`
- `SkeletonAvatar`
- `SkeletonCard`
- `SkeletonTable`
- `SkeletonList`
- `SkeletonImage`
- `ShimmerEffect`
- `LoadingSpinner`
- `InlineLoader`
- `PageLoading`
- `ButtonLoading`
- `LoadingRegion` for `aria-busy` and one polite status announcement
- Retryable error and distinct empty-state composition

Feature-specific loading shells should live beside the FOLK routes they represent. Shared root components must not receive unconditional behavior changes; FOLK-specific rendering requires a local wrapper or an explicit opt-in prop whose default preserves the current shared behavior.

### Visual and motion rules

1. Match real content dimensions, spacing, radii, table columns, and row heights.
2. Use existing `bg-muted`, `bg-accent`, `bg-card`, foreground, border, ring, and radius tokens in both themes.
3. Implement subtle Framer Motion shimmer using transform and opacity only; do not animate layout properties.
4. Make continuous shimmer and spinning static under reduced motion. Preserve text/status feedback when motion is removed.
5. Use short opacity/transform transitions for loaded content only when they do not delay interaction.
6. Avoid staggered animation on large lists and avoid a full-screen animation when only one region changes.
7. Hide decorative visuals from assistive technology and expose one concise live status per region.

### State rules

1. Use skeletons for initial loads and retain confirmed content for background refreshes.
2. Keep `initial-loading`, `refreshing`, `ready-populated`, `ready-empty`, `failed`, and `offline/queued` states distinct.
3. Never convert a failed request into empty data, zero metrics, or confirmed failure when the outcome is unknowable.
4. Keep pending state on the initiating control and mark only the affected region busy.
5. Prevent duplicate and conflicting operations without disabling unrelated reading or navigation.
6. Preserve user edits, selections, and scroll position through uncertain or failed writes.
7. Use route-level error boundaries with retry for failed server reads; do not expose internal error details.
8. Preserve the current empty states and do not add loaders to synchronous local filters, tabs, or view changes.
9. Keep polling and autosave single-flight or sequence responses so stale responses cannot overwrite newer data.
10. Do not introduce artificial production delays, global loading state, another animation library, unnecessary dependencies, or unrelated API/query refactors.

---

## 8. Incremental implementation sequence

### Batch 1 — Foundation and immediate blank-screen fixes

- Build the FOLK loading primitives and their reduced-motion/accessibility behavior.
- Fix Register’s blank fallback and Login’s `null` authenticated redirect.
- Add Home and Auth form-shaped route fallbacks.
- Standardize public form button, queued-result, and navigation-handoff states.
- Validate public/auth flows in both themes.

### Batch 2 — Dashboard and Contacts

- Add Dashboard, Candidates, Contacts Overview/Reports/Grid loading boundaries.
- Add period, scope, pagination, filter, and metric-link refresh feedback.
- Add a neutral Contacts hydration frame and stable chart geometry.
- Verify delayed responses, empty results, failed reads, and preservation of confirmed data.

### Batch 3 — Sessions and live attendance

- Add Overview, Detail, and Live loading shells.
- Separate live initial loading from confirmed empty and failed states.
- Make polling single-flight and expose stale-data/manual-refresh feedback.
- Add session-creation and attendee-summary pending/handoff treatments.
- Run session and attendance-focused verification.

### Batch 4 — Campaigns

- Add Overview, Callers, Reports, Assignment, and Caller Session loading shells.
- Add precheck/preview pending, stale, and failure states.
- Prevent failed queue refreshes from becoming empty queues.
- Add assignment/summary request sequencing, selection preservation, and recovery behavior.
- Run campaign-focused verification.

### Batch 5 — Manage, contact records, and secondary forms

- Add tab-specific Manage fallbacks.
- Key signed-photo state by contact and add unavailable/retry treatment.
- Add FOLK-opt-in structured contact-record loading and comments retry.
- Add Contact, Invite, Location, and Manage mutation feedback.
- Run Manage, grid, and contact-record verification.

### Batch 6 — Application-wide consistency and QA

- Recheck every FOLK route for blank regions, inconsistent indicators, layout shifts, and unbounded pending states.
- Verify fast, delayed, high-latency, failed, offline, empty, large, and concurrent responses using test-only request interception.
- Verify keyboard usability, focus/status announcements, both themes, and reduced motion.
- Use the preview site for non-destructive validation after the relevant changes are deployed; do not perform deployment or remote branch operations without approval.

---

## 9. Verification plan

### Every batch

Run the real repository gates and report their actual results:

```bash
pnpm test:static
pnpm test:unit
```

Then run the feature-scoped Playwright script for the affected surface through the approved readiness-gated commands. Do not use a bare Playwright invocation.

### Loading-state scenarios

Add focused e2e coverage for:

- Delayed initial document/RSC responses and route-shaped skeleton visibility.
- Skeleton disappearance when real content arrives without unexpected layout shift.
- Delayed background refresh retaining confirmed content with `aria-busy`.
- HTTP errors, malformed responses, network failure, offline behavior, and retry.
- Confirmed empty responses remaining distinct from loading and failure.
- Large datasets and stable table/list geometry.
- Overlapping polls, autosaves, filter changes, and out-of-order responses.
- Duplicate-submit attempts and pending navigation after a successful mutation.
- Reduced-motion emulation and light/dark rendering.
- Status announcements, alert semantics, focus movement, and keyboard operation.

### Final verification

```bash
pnpm test:static
pnpm test:unit
pnpm test:e2e
pnpm test:e2e:determinism
```

Feature suites should also be run at the end of their respective batches. If shared files with a wider regression blast radius are touched, escalate to the full e2e suite as required by `docs/architecture/testing.md`.

The final report must state the exact commands, pass counts, worker count, target environment, and any pre-existing failures. A green unit run is not evidence of route behavior, and a green CI run does not include the e2e suite.
