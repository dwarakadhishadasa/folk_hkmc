---
title: 'Polish Gita Life UI'
type: 'feature'
created: '2026-06-13'
status: 'in-review'
baseline_commit: 'b494d1ec1f1d7680b7ae0e5d6ac2ca479d82cadf'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Gita Life has many routes in place, but key user journeys are not yet wired into accessible, usable UI flows, especially staff operations. The existing surfaces also need a calmer, more professional finish: older rectangular controls, hard-coded FOLK text colors, uneven spacing, and less refined loading/empty/error states make the app feel incomplete.

**Approach:** Preserve existing route paths, auth, data flows, program branding, and displayed vocabulary while making the existing journeys reachable and polished. Use current components and patterns, especially FOLK-like compact pill controls, clear staff operation navigation, stronger spacing, quieter typography hierarchy, cleaner cards, responsive layout, and accessible focus/state treatment.

## Boundaries & Constraints

**Always:** Preserve Gita Life branding, existing copy/vocabulary, public and staff route paths, Supabase auth flow, Airtable-backed reads/writes, role authorization boundaries, offline queue behavior, and all form field names and payload shapes. Make existing staff operations discoverable and usable through UI/navigation without changing server contracts. Use program CSS variables where shared components need color so FOLK keeps its own branding.

**Ask First:** Any server behavior change, route path change, copy rewrite beyond spelling-level fixes, new dependency, data-model/API change, auth/authorization change, or design direction that departs from the current Gita Life maroon/saffron/ivory brand.

**Never:** Do not remove fields, change validation rules, alter attendance/session/contact/invite fetch calls, change service worker/offline semantics, weaken role gates, introduce a new design system, or make a marketing landing page in place of existing app and staff-operation surfaces.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Staff navigation | Admin/Preacher/Volunteer is logged in | Header, desktop nav, mobile nav, logout/login actions expose the appropriate existing staff operations with polished pill treatment and role visibility | Pending navigation and focus states remain visible |
| Public registration or attendance | Empty, invalid, loading, success, duplicate, offline, and error states | Same messages and transitions render with calmer cards, inputs, buttons, and spacing | Existing error/offline messages are preserved |
| Staff contact/session/invite/dashboard | Existing role-scoped data from server props or API fetches | Existing staff operation routes become reachable and render usable forms, lists, QR tools, empty states, and alerts with better hierarchy and responsive spacing | Existing API errors display without layout breakage |

</frozen-after-approval>

## Code Map

- `apps/gita-life/app/globals.css` -- Program theme tokens and any Gita Life-only surface polish that should not leak into app logic.
- `apps/gita-life/app/page.tsx` -- Public Gita Life landing page with existing imagery, CTA pills, info cards, and footer sections.
- `apps/gita-life/app/login/login-page-client.tsx` -- Gita Life staff sign-in and OTP UI, including auth redirect loading state.
- `apps/gita-life/app/register/page.tsx` -- Public registration form and session-registration success/error states.
- `apps/gita-life/app/attend/page.tsx` -- Attendance page wrapper around the shared attendance form.
- `apps/gita-life/app/dashboard/page.tsx`, `apps/gita-life/app/contact/page.tsx`, `apps/gita-life/app/sessions/page.tsx`, `apps/gita-life/app/admin/invite/page.tsx`, `apps/gita-life/app/volunteers/page.tsx`, `apps/gita-life/app/manage/page.tsx` -- Staff route shells, operation entry points, and responsive page spacing.
- `components/header.tsx` -- Shared program header, desktop pill nav, mobile bottom nav, login/logout buttons, pending and focus states.
- `components/contact-form.tsx` -- Shared staff contact form, status messages, inputs, selects, textarea, submit button.
- `components/sessions-manager.tsx` -- Shared session loading, empty/error, form, and start-session surface.
- `components/live-attendance-dashboard.tsx` -- Shared live attendance QR/list dashboard, empty/error/loading/action states.
- `components/attendance-form.tsx` -- Shared public attendance form and success/duplicate/error states.
- `components/invite-user-form.tsx` -- Shared admin/volunteer invite form, location picker, status messages, actions.

## Tasks & Acceptance

**Execution:**
- [x] `apps/gita-life/app/globals.css` -- Refine Gita Life theme tokens and optional app-scoped utility styles for calmer surfaces, inputs, pills, and focus rings.
- [x] `components/header.tsx` -- Polish desktop and mobile nav as pill controls and expose existing staff operation routes according to role while preserving pending navigation feedback.
- [x] `components/contact-form.tsx`, `components/sessions-manager.tsx`, `components/live-attendance-dashboard.tsx`, `components/attendance-form.tsx`, `components/invite-user-form.tsx` -- Replace hard-coded FOLK color references with program variables where appropriate, tighten cards, inputs, buttons, status blocks, empty/loading/error states, and responsive spacing without changing form behavior.
- [x] `apps/gita-life/app/login/login-page-client.tsx`, `apps/gita-life/app/register/page.tsx`, `apps/gita-life/app/attend/page.tsx`, staff route wrappers -- Apply consistent Gita Life page spacing, typography hierarchy, button/card polish, loading states, operation entry points, and accessibility treatment while preserving vocabulary.
- [x] Browser verification -- Run the Gita Life app locally and inspect mobile and desktop viewports for public, auth, attendance, and staff UI surfaces available without breaking auth/data boundaries.

**Acceptance Criteria:**
- Given any existing Gita Life route, when it renders after the polish, then route paths, auth behavior, API calls, form fields, validation rules, and displayed vocabulary are unchanged.
- Given an authorized staff user, when they enter the portal, then the appropriate existing staff operation routes are discoverable and usable from the UI for their role.
- Given desktop width, when viewing public and staff Gita Life surfaces, then cards, buttons, form fields, and status blocks have consistent calm spacing, typography hierarchy, and polished pill/action treatment.
- Given mobile width, when viewing the same surfaces, then text and controls do not overlap, bottom navigation remains usable with safe-area spacing, and tap targets/focus states are clear.
- Given loading, empty, success, duplicate, offline, or error states, when they appear, then the original messages remain readable and accessible with professional visual treatment.

## Design Notes

Visual thesis: calm devotional operations with warm ivory surfaces, deep maroon structure, restrained saffron action accents, and compact FOLK-like pill controls. Content plan: preserve existing public hero, support/info, detail, and CTA sections; staff surfaces should remain operational, starting with forms, dashboards, QR tools, and role-scoped actions. Interaction thesis: keep existing route progress and loading animations, improve hover/focus affordances, and avoid new ornamental motion.

## Verification

**Commands:**
- `pnpm --filter @hkmc/gita-life typecheck` -- expected: TypeScript passes for the Gita Life app.
- `pnpm guardrails` -- expected: monorepo guardrails pass after shared component edits.

**Manual checks:**
- Start `pnpm dev:gita-life` and inspect desktop and mobile browser viewports for `/`, `/login`, `/register`, `/attend`, and staff-authenticated shells where accessible. Confirm no vocabulary, route, auth, data-flow, or form behavior changes.
