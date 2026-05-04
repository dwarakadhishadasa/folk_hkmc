---
status: done
intent: implement all stories from all epics in dependency order
date: 2026-05-04
---

# All Epics Implementation Notes

## Dependency Order

1. Staff auth foundation and Supabase bridge.
2. Airtable adapters for staff, contacts, sessions, attendance, locations, and users.
3. Protected staff APIs for contacts, sessions, volunteer invites, and admin invites.
4. Session-linked public attendance and registration follow-through.
5. Role-specific portal pages and offline/PWA boundary updates.
6. Supabase and Vercel release-readiness checks.

## Code Map

- `supabase/migrations/20260504100000_create_staff_identity_bridge.sql`
- `supabase/migrations/20260504101000_harden_staff_bridge_advisor_findings.sql`
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/admin.ts`
- `lib/supabase/proxy.ts`
- `lib/supabase/types.ts`
- `proxy.ts`
- `lib/authz.ts`
- `lib/airtable.ts`
- `lib/invite-log.ts`
- `app/auth/confirm/route.ts`
- `app/auth/signout/route.ts`
- `app/auth/error/page.tsx`
- `app/api/auth/me/route.ts`
- `app/api/contact/route.ts`
- `app/api/sessions/route.ts`
- `app/api/volunteers/invite/route.ts`
- `app/api/admin/invite-user/route.ts`
- `app/api/registration/route.ts`
- `app/attendance/route.ts`
- `app/contact/page.tsx`
- `app/dashboard/page.tsx`
- `app/sessions/page.tsx`
- `app/volunteers/page.tsx`
- `app/admin/invite/page.tsx`
- `app/attend/page.tsx`
- `app/register/page.tsx`
- `components/contact-form.tsx`
- `components/attendance-form.tsx`
- `components/live-attendance-dashboard.tsx`
- `components/sessions-manager.tsx`
- `components/invite-user-form.tsx`
- `components/header.tsx`
- `public/sw.js`
- `lib/offline-sync.ts`
- `.env.example`

## Verification

- Applied Supabase MCP migration `create_staff_identity_bridge`.
- Applied Supabase MCP migration `harden_staff_bridge_advisor_findings`.
- Verified Supabase tables `public.staff_profiles` and `public.invite_log` exist with role/status constraints and RLS enabled.
- Ran Supabase MCP security advisors after hardening.
  - Remaining info: RLS enabled with no policies on both bridge tables. This is intentional because these tables are server-maintained through the service role and not browser-queryable app data.
- Ran Supabase MCP performance advisors after hardening.
  - Remaining info: new indexes are unused before live traffic. No action needed before rollout.
- Generated Supabase TypeScript types and captured the staff bridge subset in `lib/supabase/types.ts`.
- Vercel MCP verification was attempted, but the Vercel MCP returned `Auth required`; deployment/build/runtime log inspection remains blocked until the Vercel connector is authenticated.
- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed with dummy non-secret env values.
- `pnpm lint` could not run because `eslint` is not installed even though `package.json` contains `eslint .`.

## Rollout Notes

- Supabase invite email template should point to `/auth/confirm?token_hash={{ .TokenHash }}&type=invite`.
- Production env must provide the Airtable table IDs listed in `.env.example`; there are no Airtable base/table fallbacks in server helpers.
- Staff contact creation is online-only by design. Public attendance and registration can queue offline, and duplicate replay is treated as completed.
