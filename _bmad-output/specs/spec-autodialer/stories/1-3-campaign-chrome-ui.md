---
title: 'Campaign surfaces and the shared Campaign sub-nav'
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

**Problem:** Campaign had no surfaces. The programme's two entry points — the admin overview and a caller's own queue — had no shells, no role boundaries and no empty states, and the shared Campaign chrome (the sub-nav) had nowhere to live. A Volunteer following a Campaign link into the admin overview would have landed on a refusal with no way back, and a caller with an empty queue would have landed on a blank page.

**Approach:** Build the Campaign section as a shell. One server layout resolves the staff member and renders the shared sub-nav; two server pages own their own boundaries — `requireCampaignAdmin` for the overview, `requireDialerCaller` for the caller's queue — and each renders a title row plus an actionable empty state. Three shared components under `components/campaign/` carry the sub-nav, the title row and the empty state. An e2e spec proves the three role behaviours against the local stack.

## Boundaries & Constraints

**Always:**
- `/campaigns` is a server component. It calls `getStaffContext()` and then `requireCampaignAdmin(staff)`, which admits Admin, Preacher and Assistant and refuses a Volunteer. The title row reads "Overview" over the scope line "Campaigns · folk programme", with a "New campaign" action on the right. The body is an empty state that names "Create campaign" and links to `/campaigns/new`.
- `/campaigns/assignments` is a server component. It calls `getStaffContext()` and then `requireDialerCaller(staff)`, which admits any staff member holding an active `dialer_callers` profile and refuses a missing or deactivated one. The body is an actionable empty state — never a blank page.
- The Campaign sub-nav is a shared component under `components/campaign/`, driven by the staff role and the active-caller flag rather than by the page underneath: Overview `/campaigns`, Callers `/campaigns/callers`, Reports `/campaigns/reports` for Admin, Preacher and Assistant; Assignments `/campaigns/assignments` only for a staff member with an active caller profile; no admin tab for a Volunteer; no tab at all for a Volunteer without a profile.
- The current tab is marked with `aria-current="page"`, resolved by the longest matching href so `/campaigns` and `/campaigns/assignments` never mark two tabs at once.
- The shared components reuse the `components/ui/*` primitives (`Button`, `Empty`) and the shared tab tokens (`--tab-border`, `--tab-active-underline`, `--tab-inactive-text`), so light and dark both hold.
- App and feature code uses double quotes; local modules are imported through the `@/*` alias.
- The e2e spec runs under `pnpm test:e2e campaign-` and selects six real tests.

**Never:**
- Do not render the admin surface to a Volunteer, not even a disabled or empty one. A Volunteer without a caller profile sees no Campaign chrome at all.
- Do not call `campaignScope(staff)` on either page. `campaignScope` refuses an Assistant who has no assigned preacher, and this surface admits one; the scope helpers belong to the story that lists campaigns.
- Do not read `dialer_campaigns` or `dialer_assignments` here. The overview body and the caller's queue are shells; a value that cannot be computed yet is not replaced by a count of `0`.
- Do not edit `components/header.tsx`, `lib/**`, `apps/folk/app/api/**`, `e2e/fixtures/**`, `e2e/auth/**`, `playwright.config.ts` or `package.json`. The header pill, the phone bottom-nav entry, the proxy matchers and the service worker rules are the chrome layer's scope.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin, Preacher or Assistant opens `/campaigns` | Active staff session | "Overview" title, "New campaign" action, empty state naming "Create campaign" and linking to `/campaigns/new`; sub-nav shows Overview, Callers, Reports | — |
| A staff member with a caller profile opens `/campaigns` | Active staff session, active `dialer_callers` row | The same overview, plus an Assignments tab second in the strip | — |
| Volunteer opens `/campaigns` | Active staff session, no caller profile | Refused; no heading, no "Create campaign" link, no admin tab | 403 → `/auth/error?code=staff-authorization-failed` |
| Staff member opens `/campaigns/assignments` with no caller profile | Active staff session, no `dialer_callers` row | Refused; no heading, no empty state | 403 → `/auth/error?code=staff-authorization-failed` |
| Staff member opens `/campaigns/assignments` with a deactivated profile | Active staff session, `is_active = false` | Refused, identically to a missing profile | 403 → `/auth/error?code=staff-authorization-failed` |
| Active caller opens `/campaigns/assignments` | Active staff session, active `dialer_callers` row | "Assignments" title, "Your call queue" scope line, actionable empty state; the strip shows Assignments alone | — |
| Unauthenticated visitor opens either route | No session | Redirected to sign in, with the requested path named | 401 → `/login?redirect=/campaigns` or `/login?redirect=/campaigns/assignments` |

## Human Decisions

1. **The page owns the refusal, the layout renders the chrome.** The layout resolves the staff member and renders the sub-nav; it tolerates an unresolved context and lets the page apply its own boundary. A refusal raised in the layout would send every refusal to the section root, so `/campaigns/assignments` would redirect to `/login?redirect=/campaigns` instead of naming the page the reader asked for. A non-`AuthzError` is rethrown rather than swallowed.
2. **The sub-nav sits above the title row.** The Campaign frame (32) places the title above the strip. The shipped order is strip, title, body, because the strip is a property of the shell and the title a property of the page, and reading order that follows the layout's own nesting keeps the two concerns separable without a CSS `order` trick.
3. **The strip is a desktop control.** It is hidden below the `md` breakpoint. The phone frame (1752) carries Campaign in the bottom nav rather than in a tab strip, and five labels wrap onto two rows at 390px.
4. **The Overview body is unconditional.** It renders the empty state without reading `dialer_campaigns`. A count is a value that cannot be computed until the listing story lands, and an unavailable value is surfaced as unavailable rather than replaced with `0`.

</frozen-after-approval>

## Code Map

- `apps/folk/app/campaigns/layout.tsx` — the Campaign shell: `StaffAuthShell`, `Header`, the sub-nav and the page area.
- `apps/folk/app/campaigns/page.tsx` — `/campaigns`, the admin overview.
- `apps/folk/app/campaigns/assignments/page.tsx` — `/campaigns/assignments`, the caller's queue.
- `apps/folk/app/campaigns/staff.ts` — the request-scoped staff context both the layout and the pages read.
- `components/campaign/campaign-sub-nav.tsx` — the role- and profile-gated tab strip.
- `components/campaign/campaign-page-header.tsx` — the title row: title, scope line, primary action.
- `components/campaign/campaign-empty-state.tsx` — the dashed empty state with an optional action link.
- `e2e/specs/campaign-surfaces.spec.ts` — the six role tests.
- `lib/dialer/scope.ts` — `requireCampaignAdmin` and `requireDialerCaller`, the two boundaries these pages apply (read-only here).
- `lib/authz.ts` — `getStaffContext`, `StaffContext.hasActiveCallerProfile` and `AuthzError` (read-only here).
- `components/manage/manage-portal.tsx` — the tab-strip precedent this sub-nav follows.

## Tasks & Acceptance

**Execution:**
- [x] `apps/folk/app/campaigns/staff.ts` — one request-scoped staff resolution shared by the layout and the pages.
- [x] `apps/folk/app/campaigns/layout.tsx` — the Campaign shell with the shared sub-nav.
- [x] `apps/folk/app/campaigns/page.tsx` — the admin overview and its empty state.
- [x] `apps/folk/app/campaigns/assignments/page.tsx` — the caller's queue and its empty state.
- [x] `components/campaign/campaign-sub-nav.tsx` — the role- and profile-gated strip.
- [x] `components/campaign/campaign-page-header.tsx` — the title row.
- [x] `components/campaign/campaign-empty-state.tsx` — the actionable empty state.
- [x] `e2e/specs/campaign-surfaces.spec.ts` — six tests over the three role behaviours.

**Acceptance Criteria:**
- Given an Admin, Preacher or Assistant, when they open `/campaigns`, then the empty state names "Create campaign", links to `/campaigns/new`, and the admin sub-nav shows Overview, Callers and Reports.
- Given a Volunteer with no caller profile, when they open `/campaigns`, then the page refuses them and no admin surface is rendered.
- Given a staff member with no caller profile, when they open `/campaigns/assignments`, then the page refuses them.
- Given an active caller, when they open `/campaigns/assignments`, then the strip shows Assignments and no admin tab, and the queue renders an actionable empty state.
- Given `pnpm test:e2e campaign-`, when it runs, then six real tests are selected and pass.

## Implementation Notes

### Route map

| Route | Renders | Admits | Refusal |
|---|---|---|---|
| `/campaigns` | Campaign shell → sub-nav → "Overview" title row ("Campaigns · folk programme", "New campaign" → `/campaigns/new`) → empty state "No campaigns yet" with a "Create campaign" link to `/campaigns/new` | Admin, Preacher, Assistant | Volunteer → 403 → `/auth/error?code=staff-authorization-failed`; no session → 401 → `/login?redirect=/campaigns` |
| `/campaigns/assignments` | Campaign shell → sub-nav → "Assignments" title row ("Your call queue") → empty state "No calls assigned yet" with the guidance that an Admin or Preacher assigns contacts and the next call appears as soon as one is assigned | Any staff member with an active `dialer_callers` profile | missing or deactivated profile → 403 → `/auth/error?code=staff-authorization-failed`; no session → 401 → `/login?redirect=/campaigns/assignments` |

### The sub-nav rule

| Staff member | Tabs, in order |
|---|---|
| Admin / Preacher / Assistant without a caller profile | Overview, Callers, Reports |
| Admin / Preacher / Assistant with an active caller profile | Overview, Assignments, Callers, Reports |
| Volunteer with an active caller profile | Assignments |
| Volunteer without a caller profile | none — the strip renders nothing |

Assignments sits second because that is the order the phone Campaign menu uses (frame 2217). The active tab is the longest matching href, so `/campaigns/assignments` marks Assignments and not Overview.

### One staff resolution per request

`getStaffContext()` is a session read plus two table reads, and both the layout and the page need it. `apps/folk/app/campaigns/staff.ts` wraps it in React's `cache`, which collapses the two calls into one within a request. The same wrapper is what makes the two refusals agree: the layout tolerates an unresolved context, so the page is the one that redirects, and the redirect names the page the reader asked for.

### The shared components are client components

`components/ui/button` imports `@radix-ui/react-slot`, whose `React.forwardRef` is absent from the react-server build; importing it from a server graph fails at runtime. All three campaign components are therefore `"use client"`, which is also what lets the sub-nav read the current path with `usePathname`. The sub-nav imports `StaffRole` from `@hkmc/data-contracts` rather than from `@/lib/authz`, so the client boundary does not reach into the server-only module.

### The chrome this layer does not own

The desktop Campaign pill and the phone bottom-nav entry are the chrome layer's scope (`components/header.tsx`, `packages/program-config/src/**`), and the proxy matchers and the service-worker rules sit with it too. `/campaigns/new`, `/campaigns/callers` and `/campaigns/reports` belong to later stories; their links are live before their pages, and the admin gate refuses them exactly as it refuses the section root.

### The caller fixture in the e2e spec

The seed creates no `dialer_callers` row, so the caller test provisions one through the service-role PostgREST client, with the credential read at runtime from the app's env file. The target is asserted loopback with `isLocalSupabaseUrl`, and a missing credential throws rather than skipping: a skip would leave the caller's empty state unproven, and a hosted URL would write the fixture to the hosted project while the assertions ran against the local stack.

`service_role` holds SELECT, INSERT and UPDATE on `dialer_callers` and no DELETE — the dialer migration grants it exactly three privileges — so a row the spec creates cannot be removed through PostgREST. The cleanup therefore goes through the local stack's SQL endpoint, which runs as the table owner, and the id is shape-checked as a UUID before it is interpolated into the statement. A row that already existed is reactivated for the test and then restored to its own values; a row the spec created is deleted. Either way the table is left as it was found.

## Spec Change Log

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0. Guardrails: "Monorepo guardrails passed." with the same four pre-existing type-import warnings; every workspace typecheck project Done; ESLint "✖ 16 problems (0 errors, 16 warnings)" — the warnings are pre-existing and in files this layer did not touch.
- `pnpm test:e2e:list campaign-` — **PASS**, exit 0. Six tests selected in `campaign-surfaces.spec.ts`, plus the four setup projects.
- `pnpm test:e2e campaign-` — **PASS**, exit 0. "10 passed (44.7s)" — the four role setup projects plus the six spec tests.

**Spec tests:**
- `the Campaign overview — admin › shows the Create campaign empty state and the admin sub-nav`
- `the Campaign overview — preacher › shows the Create campaign empty state and the admin sub-nav`
- `the Campaign overview — assistant › shows the Create campaign empty state and the admin sub-nav`
- `the Campaign overview — a Volunteer with no caller profile › is refused and never shows the admin surface`
- `the Campaign assignments — a staff member with no caller profile › is refused`
- `the Campaign assignments — a Volunteer with an active caller profile › shows the Assignments tab and an actionable empty queue`

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- `pnpm test:e2e:determinism` was deliberately not run. It is deferred to Epic 4 (Story 4.2), which owns the release gate over the accumulated suite; this layer touches no fixture or harness file, and running it here would add two full suites for a change the next full run already proves.
- The full `pnpm test:e2e` was not run at this layer. Its scope belongs to the join layer, which is the only layer whose scope is the whole repository.

**Post-run state:** `dialer_callers`, `dialer_campaigns` and `dialer_assignments` hold zero rows, so the caller's fixture left the table as it was found.
