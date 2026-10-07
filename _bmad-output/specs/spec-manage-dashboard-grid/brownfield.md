# Brownfield: the `/manage` portal as it exists today

Load-bearing inventory of the code this redesign touches. Every claim is anchored to a file and line so a downstream agent can verify rather than rediscover.

## Route surface

| Path | File | Notes |
|---|---|---|
| `/manage` | `apps/folk/app/manage/page.tsx` (56 lines) | `force-dynamic`; single server component; resolves staff, requires `Admin` or `Preacher` role, loads the whole portal payload, renders `<ManagePortal>` |
| `/manage` | `apps/gita-life/app/manage/page.tsx` (56 lines) | Byte-identical to the folk copy |
| `/api/manage/contacts` | `apps/folk/app/api/manage/route.ts` → `lib/manage/api-handlers.ts` (314 lines) | The one write path; accepts `MANAGE_CONTACT_PATCH_KEYS` |

`page.tsx:28-33` reads `?view=` and `?mode=` from `searchParams`, validates the view through `isManageView`, defaults to `"dashboard"`, and calls `loadManagePortalData({ staff, mode })` once for all five views.

## Current navigation: tabs, not routes

`components/manage/manage-portal.tsx` (141 lines) is the tab shell.

- `TAB_LABELS` (lines 14-20) fixes the five views: `dashboard`, `contacts`, `sessions`, `attendance`, `favorites`.
- `handleViewChange` (lines 45-56) sets local state and syncs the URL with `window.history.replaceState`. It cannot fail the tab switch; the `catch` is empty by design.
- The scope toggle (lines 77 and 91) is a `<Link>`, deliberately a real navigation. The comment at lines 26-33 states the reason: switching tabs is local state, switching scope changes what the server reads.

This asymmetry is the strongest argument for route-per-table. Once every table is a route, `view` stops being a special client-side concern and every view becomes one uniform mechanism the server reads.

## Component inventory (`components/manage/`, 3227 lines)

| File | Lines | Role |
|---|---|---|
| `manage-favorites-view.tsx` | 581 | favorites table |
| `manage-dashboard.tsx` | 377 | overview + charts |
| `manage-contacts-table.tsx` | 341 | **the refactor target** |
| `manage-attendance-view.tsx` | 291 | attendance table |
| `manage-portal.tsx` | 141 | tab shell |
| `manage-sessions-view.tsx` | 106 | sessions table |
| `manage-types.ts` | 192 | client-safe types, imports nothing |

`manage-types.ts` is the seam that makes this work: it holds every payload shape (`ManageContact`, `ManageSession`, `ManageAttendanceRecord`, `ManageDashboardCharts`, `ManagePortalPayload`) while importing nothing, so client components stay plain typed props and `lib/supabase/manage.ts` stays the owner of the Supabase surface.

## The table being replaced

`manage-contacts-table.tsx`:
- `"use client"` (line 1).
- Eight sortable columns declared as a `SortKey` union (lines 24-32) and a `COLUMNS` array (lines 54+).
- Sorting is `useMemo` over the in-memory `payload.contacts` array.
- A `ALL_LOCATIONS = "all"` sentinel drives a `Select` filter over locations.
- A `Status` union (`idle` / `busy` / `ok` / `error`) tracks in-flight edits.
- `readError` (lines 43-51) defensively narrows an unknown payload before surfacing a message.

None of this is wrong; it is simply unbounded. Cost is O(n) per keystroke and O(n log n) per sort click on the full scoped row set, with no row virtualization, so it degrades exactly where Airtable is strongest.

## Guardrails an implementation must not break

- **`scripts/verify-monorepo-guardrails.mjs:10-17`** defines `serverOnlySpecifierPrefixes`: `@hkmc/authz`, `@hkmc/program-config/server`, `@/lib/authz`, `@/lib/invite-log`, `@/lib/supabase/admin`, `@/lib/supabase/server`. A client component importing any of these fails the guard.
- **`scripts/verify-airtable-removal.mjs:628-636`** asserts that guard still names `@/lib/authz`, `@/lib/invite-log`, `@/lib/supabase/admin`, `@hkmc/authz`, and asserts two stale prefixes are *absent*. Editing the prefix list breaks this gate.
- **`manage-types.ts:5-6` claims `@/lib/supabase/manage` is guarded, but it is not in that list.** The comment is stale. Treat the boundary as real and keep it enforced by convention; do not rely on the comment, and do not "fix" the list without checking `verify-airtable-removal.mjs` first.

## RLS and authorization

`page.tsx:24-26` calls `getStaffContext()` then `requireRole(staff, ["Admin", "Preacher"])`. Failure modes are distinct: a 401 `AuthzError` redirects to `/login?redirect=/manage`; any other `AuthzError` redirects to `/auth/error?code=staff-authorization-failed`; anything else is logged and rethrown (lines 45-56).

Row-level scoping is server-side. `ManageScope` carries `mode`, `role`, `staffUserId`, `locationIds`, and `programId`; `ManageContact.locationIds` and the attendance rollups are described as "already RLS-scoped" (`manage-types.ts:58-65`). A client-side re-check would duplicate policy that already lives in the database, and the two would drift.

## Scope and mode

- `ManageMode = "admin" | "preacher"`; `resolveManageMode` (`manage-types.ts:190-192`) coerces anything that is not the literal `"preacher"` to `"admin"`.
- `preacher` mode surfaces an inline explanatory banner (`manage-portal.tsx:108-113`).
- A non-Admin sees a static `Preacher scope` badge instead of the toggle (lines 103-105).

Under route-per-table this becomes `?mode=` carried on every table route, which is why CAP-10 exists.

## Bulk note on the 60-second reads

`loadManagePortalData` returns `contacts`, `sessions`, `attendance`, `charts`, `locations`, `staffNames`, and `booksReadOptions` together. Every tab switch pays for the tabs not being viewed. This is the defect CAP-7 addresses, and it is also why the dashboard question (whether it needs the full payload) must be answered before the split is designed.