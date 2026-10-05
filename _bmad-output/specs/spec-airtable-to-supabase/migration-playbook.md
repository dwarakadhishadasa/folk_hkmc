# Migration Playbook

Ordered procedure for the Airtable → Supabase migration, captured so it can be replayed on main/prod (CAP-8). Steps marked ✅ were already done on `feature/migrate-airtable-to-supabase` when this spec was written (2026-10-05); the rest are pending.

**Strategy (decided 2026-10-05):** the migration targets a **new, separate Supabase project** — already provisioned as `etwunirahuucodcxydgs` (region ap-south-1) and linked to Vercel, which syncs its env vars. The existing project (`cparpinmalqsimninyfw.supabase.co`) and Airtable base (`appqea9DRLOXqErXb`) stay untouched throughout — they are the archive and the fallback. The app flips to the new project only after testing, with a one-shot delta sync at flip time.

**Environment workflow (decided 2026-10-05):** no local Supabase stack. All development, migration testing, and verification run directly against the hosted new project, which is disposable pre-cutover — full wipes and re-seeds are permitted. Local dev points at the hosted project via gitignored `.env` files; secrets live only in env vars (Vercel integration + local `.env`), never in the repo, and the current credential set is scheduled for rotation after setup.

## Phase 0 — Branch & baseline

1. ✅ Cut a feature branch (`feature/migrate-airtable-to-supabase`) off the target base.
2. ~~Confirm Supabase local stack works~~ **Superseded (2026-10-05):** no local stack. Instead: confirm access to the hosted project (`etwunirahuucodcxydgs`), place its env vars in gitignored local `.env` files, and verify connectivity (`supabase link` / a test query). Auth-email testing happens on the hosted project, not Mailpit.
3. Inventory Airtable touchpoints: `lib/airtable.ts` (sole access layer), `packages/airtable`, `packages/program-config/.../shared-airtable.ts`, all routes/pages importing them, and every `AIRTABLE_*` env var per program prefix (`FOLK_`, `GITA_LIFE_`).

## Phase 1 — Schema

4. ✅ Create core tables migration (`20261004000000_create_core_tables.sql`): `contacts`, `locations`, `sessions`, `attendance` — UUID PKs, `program_id`, FKs, unique indexes (`phone+program`, `contact+session`).
5. Create the Supabase-native staff table(s) replacing the Airtable Users source and the `staff_memberships` / `staff_profiles` / `airtable_identities` bridge (keep `audit_events`).
6. Fix schema gaps found during mapping: `contacts.source` column; drop the `Analytics` linkage everywhere (decided 2026-10-05).
7. Replace placeholder RLS with the scoped policies in `rls-policy-matrix.md` (contacts, attendance, sessions, locations; program-scoped; service-role writes only).

## Phase 2 — Data layer swap

8. Write a Supabase data-access module paralleling `lib/airtable.ts`'s exported surface (same function names/return shapes where possible) so route diffs are import-only.
9. Update every consumer: `attendance`, `registration`, `contact`, `sessions`, `admin/locations`, `volunteers/invite`, `admin/invite-user`, `auth/signin` routes; `dashboard`, `manage`, `sessions`, `contact`, `admin/invite` pages — for **both** `apps/folk` and `apps/gita-life`.
10. Rework `lib/authz.ts`: staff context resolves from the Supabase staff table; delete `findStaffUserByEmail` / `syncStaffSupabaseUserId` Airtable sync; keep `audit_events` writes.
11. Update all `rec*` ID validation to UUIDs (`parseKnownAttendanceIds`, any client-side checks).
12. Preserve behavior contracts while swapping: `/attendance` POST/GET semantics (CAP-5), offline queue endpoints and 409 handling (CAP-6), Asia/Kolkata date logic, `unstable_cache` equivalents for locations/preachers if still needed.
13. **Build the `/manage` replacement (CAP-9):** in-app management portal per `manage-interface.md` — dashboard stats/charts, contacts table, sessions view, per-contact attendance history, favorites/contact editing with photo upload to Supabase Storage. Includes the new contact columns (`photo_path`, `rounds`, `books_read`, `is_favorite`) and the computed attendance-count views. `/manage` stops redirecting to Airtable.

## Phase 3 — Cleanup

14. Delete `lib/airtable.ts`, `packages/airtable`, `shared-airtable.ts`; remove `@hkmc/airtable` from both apps' `package.json`.
15. Remove `AIRTABLE_*` env vars (both prefixes) from env files, deployment config, and docs.
16. `grep -ri airtable` over runtime code returns nothing; build, lint, typecheck pass with no Airtable env set.

## Phase 4 — Verify on the new project

17. ✅/⏳ New Supabase project: **created and Vercel-linked by the user (2026-10-05)** — `etwunirahuucodcxydgs` (ap-south-1). Remaining: push all migrations to it (`supabase db push` against the linked hosted project); configure auth (site URL, redirect URLs, email templates from `supabase/templates`, SMTP). Confirm Vercel env-var scoping per OQ-7 — Production must still resolve the old project's vars.
18. Seed test staff/contacts/sessions (wipe/re-seed freely — the hosted project is disposable pre-cutover); use the **`feature/migrate-airtable-to-supabase` branch as the preview deployment** (decided 2026-10-05), with the new project's env vars (`NEXT_PUBLIC_SUPABASE_URL`, anon/publishable key, service-role key) scoped to preview — **production keeps pointing at the old project** (verify per OQ-7).
19. Run the CAP-3 RLS verification: per role, per table, confirm out-of-scope rows are unreadable with a user JWT.
20. Run the CAP-5/CAP-6 contract checks: attendance POST/GET shapes, offline queue replay, duplicate-409 handling.
21. Smoke-test PWA install + offline flow on a device/emulator against the preview deployment.
22. Update `docs/data-models.md`, `docs/architecture.md`, `docs/api-contracts.md` to the Supabase-only reality.

## Phase 5 — Cutover (when testing passes)

23. Freeze writes briefly (maintenance window) so no new data lands in Airtable or the old Supabase project during the flip.
24. **Initial load:** export Airtable tables (contacts, attendance history, sessions, locations, users/staff) to CSV; transform IDs (`rec*` → UUID with a persisted mapping table); resolve free-text locations; load into the new project via service role; verify counts per table per program.
25. **Auth users (decided):** migrate `auth.users` from the old project to the new one preserving UUIDs (dump/restore of the auth schema), so staff links, sessions, and `audit_events` references survive; verify each staff member can still sign in before the flip.
26. **Delta sync:** copy rows created in the old Supabase project after the testing window opened (`audit_events`, any staff/identity rows, anything else written meanwhile) into the new project.
27. Flip production env vars to the new project; deploy. Confirm `/attendance`, offline replay, dashboard scoping, and sign-in on prod.
28. Post-cutover: keep the old Supabase project and Airtable base **read-only and preserved** (no deletes); monitor for a bake period; only decommission after explicit approval, if ever.
