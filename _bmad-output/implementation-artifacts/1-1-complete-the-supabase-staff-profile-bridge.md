# Story 1.1: Complete The Supabase Staff Profile Bridge

Status: review

## Story

As a staff user,
I want the server to have enough synced staff profile data locally,
so that protected pages can authorize me without asking Airtable on every page load.

## Acceptance Criteria

1. Given the existing `staff_profiles` table lacks staff scope fields, when the developer adds a Supabase migration, then `staff_profiles` can store the staff Airtable user id, email, name, role, status, location ids, assigned preacher Airtable user id, and last synced timestamp, and generated TypeScript types include the new fields.
2. Given the Supabase migration defines the new staff scope fields, when the developer chooses column shapes, then location scope uses a Postgres-friendly `location_ids text[]` or equivalent typed array representation, and volunteer assignment uses nullable `assigned_preacher_airtable_user_id text` or equivalent.
3. Given `syncStaffProfileByEmail()` loads a staff user from Airtable, when the staff profile is upserted into Supabase, then the synced row includes `locationIds` and `assignedPreacherAirtableUserId` data needed to reconstruct `StaffContext`, and missing optional volunteer assignment is stored as `null` or equivalent rather than causing sync failure.
4. Given a synced profile has role `Admin`, `Preacher`, or `Volunteer`, when the profile is read from Supabase, then the row can be mapped into the existing `StaffContext` shape without an Airtable lookup.
5. Given the migration is applied, when Supabase advisors and type generation are run, then no new high-severity security issue is introduced, and any advisory that remains is documented as accepted or remediated.

## Tasks / Subtasks

- [x] Add a new Supabase migration after `20260504101000_harden_staff_bridge_advisor_findings.sql` for the staff scope bridge fields. (AC: 1, 2)
  - [x] Add `location_ids text[] not null default '{}'::text[]` or an equivalent typed array column to `public.staff_profiles`.
  - [x] Add `assigned_preacher_airtable_user_id text null` to `public.staff_profiles`.
  - [x] Keep existing `role` and `status` constraints intact.
- [x] Update `lib/supabase/types.ts` so `staff_profiles.Row`, `Insert`, and `Update` include the new fields. (AC: 1, 5)
- [x] Update `lib/authz.ts` profile sync code to upsert `staffUser.locationIds` and `staffUser.assignedPreacherAirtableUserId ?? null`. (AC: 3)
- [x] Add a mapper in `lib/authz.ts` from `staff_profiles` rows to `StaffContext`; this can be used directly by Story 1.2. (AC: 4)
- [x] Run or document Supabase advisor and type-generation verification. (AC: 5)

## Dev Notes

- Current `supabase/migrations/20260504100000_create_staff_identity_bridge.sql` has `staff_profiles` columns for identity, role/status, and timestamps, but does not store `location_ids` or `assigned_preacher_airtable_user_id`.
- Current `lib/supabase/types.ts` mirrors the old schema, so it must be updated alongside the migration. Do not rely on `next build`, because `next.config.mjs` ignores TypeScript build errors; `pnpm exec tsc --noEmit` is the real type gate.
- Current `lib/authz.ts` defines `StaffContext` with `locationIds` and `assignedPreacherAirtableUserId`, but `syncStaffProfileByEmail()` only upserts `id`, `email`, `airtable_user_id`, `name`, `role`, `status`, and `last_synced_at`.
- `lib/airtable.ts` already maps Airtable `Users.Locations` and `Users.Assigned Preacher` into `StaffUser.locationIds` and `StaffUser.assignedPreacherAirtableUserId`; reuse that data instead of re-querying Airtable.
- Supabase should stay a small staff bridge only. Do not duplicate Contacts, Sessions, Attendance, Locations, or Analytics into Supabase.
- Airtable remains the operational source of truth at sync boundaries. This story prepares local staff scope data; Story 1.2 changes the hot-path read behavior.
- The `project-context.md` auth note is stale for this project state. Follow the current Supabase implementation in `lib/authz.ts`, `lib/supabase/*`, `proxy.ts`, and `app/api/auth/me/route.ts`.

### Project Structure Notes

- Put schema changes in `supabase/migrations/`.
- Keep Supabase client/admin/server helpers under `lib/supabase/`.
- Keep authorization and `StaffContext` mapping in `lib/authz.ts`; do not add a browser query path to `staff_profiles`.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-1.1]
- [Source: _bmad-output/planning-artifacts/nextjs-supabase-staff-auth-plan.md#Supabase-Schema]
- [Source: _bmad-output/implementation-artifacts/spec-all-epics-staff-auth-attendance.md#Verification]
- [Source: supabase/migrations/20260504100000_create_staff_identity_bridge.sql]
- [Source: lib/authz.ts]
- [Source: lib/airtable.ts]
- [Source: lib/supabase/types.ts]
- [Latest: Supabase TypeScript type generation docs, https://supabase.com/docs/guides/api/rest/generating-types]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Supabase remote advisor/type generation not run; local migration and local generated type mirror were updated, with release-time Supabase checks documented in `performance-responsiveness-implementation-report.md`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added `location_ids` and `assigned_preacher_airtable_user_id` schema support for `staff_profiles`.
- Updated local Supabase types and profile sync to persist Airtable staff scope fields.
- Added `mapStaffProfileRowToStaffContext()` for reconstructing `StaffContext` from Supabase rows without Airtable.

### File List

- `supabase/migrations/20260504102000_add_staff_profile_scope_fields.sql`
- `lib/supabase/types.ts`
- `lib/authz.ts`

### Change Log

- 2026-05-07: Completed Supabase staff profile scope bridge and local type/auth mapper updates.
