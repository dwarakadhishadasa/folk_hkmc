-- Migration: Add public.users (all staff roles), backfill FK constraints on
-- contacts/sessions, add Airtable-mirrored contact columns, expose per-contact
-- attendance counts as a view, and provision the private contact-photos bucket.
-- Date: 2026-10-06
-- Story: 1 — Schema migration — users table and contact field gaps
-- Additive only: does not alter 20261004000000_create_core_tables.sql or the
-- bridge tables (staff_memberships / staff_profiles / airtable_identities /
-- audit_events). No RLS changes in this story (deferred to story 2).

-- ============================================================================
-- 1. public.users — Supabase-native users table covering all staff roles.
--    Distinct from auth.users; id references auth.users(id) so the Supabase
--    auth account and the staff record share one UUID.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Preacher', 'Volunteer', 'Assistant')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended', 'Revoked')),
  location_ids UUID[] DEFAULT '{}',
  assigned_preacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_program_id ON public.users(program_id);
CREATE INDEX IF NOT EXISTS idx_users_assigned_preacher_id ON public.users(assigned_preacher_id);

-- ============================================================================
-- 2. Backfill FK constraints the core-tables migration left as plain UUIDs.
--    SET NULL on user FKs so removing a user never deletes operational
--    history; RESTRICT on sessions.location_id so a location with sessions
--    cannot be deleted silently.
-- ============================================================================
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_assigned_preacher_id_fkey
  FOREIGN KEY (assigned_preacher_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_collected_by_id_fkey
  FOREIGN KEY (collected_by_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_preacher_id_fkey
  FOREIGN KEY (preacher_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE RESTRICT;

-- ============================================================================
-- 3. Contact column gaps mirrored from Airtable (data-model-mapping.md).
-- ============================================================================
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS photo_path TEXT,
  ADD COLUMN IF NOT EXISTS rounds TEXT,
  ADD COLUMN IF NOT EXISTS books_read TEXT[],
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- ============================================================================
-- 4. contact_attendance_counts — per-contact attendance rollups for the
--    /manage portal. The 60-day rolling window is computed against
--    Asia/Kolkata program-day semantics.
-- ============================================================================
CREATE OR REPLACE VIEW public.contact_attendance_counts AS
SELECT
  c.id AS contact_id,
  COUNT(a.id) AS total_attendance_count,
  COUNT(a.id) FILTER (
    WHERE a.created_at >= (now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '60 days'
  ) AS past_60_day_attendance_count
FROM public.contacts c
LEFT JOIN public.attendance a ON a.contact_id = c.id
GROUP BY c.id;

-- ============================================================================
-- 5. contact-photos — private Storage bucket. Only the service role mints
--    signed URLs (story 6); anon/authenticated have no access.
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('contact-photos', 'contact-photos', false)
ON CONFLICT (id) DO NOTHING;
