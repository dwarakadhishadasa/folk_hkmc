# Addendum: Technical Notes for HKM Program Operations Portals

This addendum preserves technical decisions and implementation guidance that informed the PRD but should not dominate the product requirements.

## Current Repo Context

Verified in this workspace on 2026-06-11:

- Next.js 16.0.7 App Router, React 19.2.0, TypeScript 5, and Tailwind CSS 4.1.9.
- Deployment targets Cloudflare Pages, so new API routes should remain Edge-compatible unless intentionally changed.
- Airtable helper code exists in `lib/airtable.ts`; keep this integration server-only.
- Current FOLK operational routes include `/attendance`, `/api/registration`, `/api/contact`, `/api/sessions`, auth routes, invite routes, and staff/admin surfaces.
- No active Gita Life route or `/api/gita-life` endpoint was found in this workspace during finalization; confirm whether Gita Life public-page ownership lives in this repo or another HKM site before implementation.
- Existing `/admin` redirects into `/manage`; current staff/admin surfaces are brownfield FOLK operations surfaces and should not be reused as the foundation for the two new Program Apps without explicit architecture review.

## Recommended App Boundary and Route Shape

```txt
/activities/gita-life
/activities/folk

Gita Life operations app:
  gitalife.hkmchennai.org
  /, /portal, /ops, or equivalent app-local route

FOLK operations app:
  folk.hkmchennai.org
  /, /portal, /ops, or equivalent app-local route
```

The recommended architecture is two program-specific Next.js App Router applications, not one runtime app that multiplexes both programs. The apps should share data contracts, auth helpers, schema conventions, and reusable UI primitives where practical. Public program pages can remain in the existing public site and link to the appropriate Program App.

## Recommended Supabase Auth Mirror

```txt
auth.users
profiles
organizations
organization_memberships
organization_roles
staff_profiles
airtable_identities
airtable_sync_state
audit_log
```

Both Program Apps should use one shared Supabase project/database. One person should have one Supabase Auth user across Gita Life and FOLK. Program membership and Role records are scoped per organization/program.

## Airtable Integration Notes

- Use separate Airtable Bases for Gita Life and FOLK.
- Use separate scoped Airtable PATs where possible.
- Frontend should not call Airtable directly.
- Each Program App should read and write only its own Program's Airtable Base.
- Airtable data should sync into the shared Supabase database for fast auth and permission checks.
- Airtable remains the source of truth for operational records, but Supabase enforces runtime access.

## Edge Compatibility Notes

- Use `fetch` for Airtable API calls from server routes in each Program App.
- Keep tokens in server-only environment variables.
- Avoid Node-only packages in Edge routes unless runtime is explicitly changed.
- Existing attendance, authz, and Supabase helper constraints in `lib/attendance-session.ts`, `lib/authz.ts`, and `lib/supabase/*` should be respected where code is reused or migrated.

## Future Mobile/PWA Notes

- Keep API contracts program-scoped so a future mobile app can reuse the same shared Supabase identity and permission model.
- Attendance actions should support offline queueing.
- Avoid hard-coding web-only assumptions into Program models.
