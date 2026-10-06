# Epic 7: Airtable to Supabase Migration

Authoritative source: `_bmad-output/specs/spec-airtable-to-supabase/` (SPEC.md, data-model-mapping.md, rls-policy-matrix.md, manage-interface.md, migration-playbook.md, stories.yaml). This file mirrors the 9 stories in stories.yaml so sprint tracking can parse them.

## Epic 7: Airtable to Supabase Migration

### Story 7.1: Schema Migration — Users Table And Contact Field Gaps

Adds the Supabase-native public.users table covering all roles, the missing contact columns, computed attendance-count views, and a contact-photos storage bucket. Implements CAP-1, CAP-2, CAP-9 schema.

### Story 7.2: Scoped RLS Policies On Contacts Attendance Sessions Locations

Replaces placeholder authenticated-read-all policies with per-role, program-scoped policies backed by SECURITY DEFINER helper functions. Implements CAP-3.

### Story 7.3: Supabase Data-Access Module Mirroring lib/airtable.ts

Creates lib/supabase/data.ts exporting the same function names and return shapes as lib/airtable.ts so route diffs in story 7.5 are import-only. Foundation for CAP-4.

### Story 7.4: Authz Rework — Staff Context Resolves From Supabase

Rewires lib/authz.ts so getStaffContext reads public.users; deletes the Airtable sync path; keeps audit_events logging. Implements CAP-2.

### Story 7.5: Route And Page Swap To Supabase In Both Apps

Moves every route and page in apps/folk and apps/gita-life from lib/airtable to the new data module; preserves /attendance and offline-queue contracts byte-for-byte. Implements CAP-4, CAP-5, CAP-6.

### Story 7.6: In-App /manage Portal Replacing The Airtable Interface

Builds the Supabase-backed management portal at /manage per manage-interface.md. Implements CAP-9.

### Story 7.7: Airtable Removal And Dependency Cleanup

Deletes lib/airtable.ts, packages/airtable, shared-airtable.ts, @hkmc/airtable workspace deps, and all AIRTABLE_* env config; proves the repo builds clean. Implements CAP-7.

### Story 7.8: Configure And Verify The Hosted Supabase Project And Preview Deployment

Pushes migrations and auth config to the hosted project (etwunirahuucodcxydgs), seeds test data, runs CAP-3/5/6 verification plus PWA smoke test. Implements playbook Phase 4.

### Story 7.9: Cutover — Backfill, Auth Migration, Delta Sync, Go-Live

Executes playbook Phase 5: one-time Airtable export/transform/load with rec*→UUID mapping, auth.users migration preserving UUIDs, delta sync, go-live. Implements CAP-8's cutover half.
