-- Migration: Scoped RLS policies on contacts, attendance, sessions, locations,
-- and public.users (CAP-3 per-role, program-scoped visibility at the database).
-- Date: 2026-10-06
-- Story: 2 — Scoped RLS policies on contacts, attendance, sessions, locations
-- Additive only: drops exactly the four placeholder
-- "… viewable by authenticated users" SELECT USING (true) policies and leaves
-- the service-role INSERT/UPDATE policies untouched. No authenticated write
-- policies are created — writes stay service-role only.
--
-- Read-scope contract: _bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md
--
--   sessions   : program + (Admin | (Preacher/Assistant) created_by = caller |
--                Assistant created_by = caller's active assigned preacher)
--   attendance : program + (Admin | (Preacher/Assistant) parent session
--                preacher_id = caller | caller's active assigned preacher)
--   contacts   : program + (Admin | Preacher assigned_preacher_id = caller |
--                Assistant assigned_preacher_id = caller's active assigned
--                preacher)
--   locations  : program + (Admin | id = ANY(caller effective location_ids))
--   users      : caller Active AND (own row | Admin in same program)
--
-- Non-Admin terms are role-gated so a Volunteer with an assigned preacher
-- falls through to zero rows everywhere except locations (matrix: Volunteer
-- has no contact/session/attendance read).
--
-- Scope resolves through the caller's public.users row keyed by auth.uid() and
-- only when that row is status = 'Active'; a missing or non-Active row yields
-- NULL/empty scope (zero visible rows). Volunteer/Assistant location and
-- contact scope resolves through assigned_preacher_id, and only when the
-- assigned preacher's row is Active.

-- ============================================================================
-- 1. SECURITY DEFINER helpers over public.users.
--    Owned by the table owner (postgres) so RLS on public.users does not
--    recurse; no table has FORCE ROW LEVEL SECURITY, so the owner bypasses RLS
--    inside these functions (standard Supabase pattern). STABLE + pinned
--    search_path. Only authenticated and service_role may EXECUTE.
-- ============================================================================

-- Caller's role, NULL when the caller has no users row or it is not Active.
CREATE OR REPLACE FUNCTION public.caller_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.role
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.status = 'Active'
$$;

-- Caller's program, NULL when the caller has no users row or it is not Active.
CREATE OR REPLACE FUNCTION public.caller_program_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.program_id
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.status = 'Active'
$$;

-- Caller's assigned preacher id, only when both the caller and the assigned
-- preacher are Active; NULL otherwise (empty scope).
CREATE OR REPLACE FUNCTION public.caller_assigned_preacher_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id
  FROM public.users u
  JOIN public.users p ON p.id = u.assigned_preacher_id
  WHERE u.id = auth.uid()
    AND u.status = 'Active'
    AND p.status = 'Active'
$$;

-- Caller's effective location ids: a Preacher's own location_ids; a
-- Volunteer's/Assistant's active assigned preacher's location_ids; empty
-- otherwise (Admin is covered by the Admin term in the locations policy).
CREATE OR REPLACE FUNCTION public.caller_effective_location_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN u.role = 'Preacher' THEN COALESCE(u.location_ids, '{}'::uuid[])
    WHEN u.role IN ('Volunteer', 'Assistant') THEN (
      SELECT COALESCE(p.location_ids, '{}'::uuid[])
      FROM public.users p
      WHERE p.id = u.assigned_preacher_id
        AND p.status = 'Active'
    )
    ELSE '{}'::uuid[]
  END
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.status = 'Active'
$$;

-- Attendance-session visibility: TRUE when the session is in the caller's
-- program and its preacher_id is the caller or the caller's active assigned
-- preacher. Runs SECURITY DEFINER so the lookup is not wrongly intersected
-- with sessions' own creator-scoped RLS.
CREATE OR REPLACE FUNCTION public.caller_can_read_attendance_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = p_session_id
      AND s.program_id = public.caller_program_id()
      AND (
        s.preacher_id = auth.uid()
        OR s.preacher_id = public.caller_assigned_preacher_id()
      )
  )
$$;

REVOKE ALL ON FUNCTION public.caller_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.caller_program_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.caller_assigned_preacher_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.caller_effective_location_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.caller_can_read_attendance_session(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.caller_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_program_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_assigned_preacher_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_effective_location_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_can_read_attendance_session(UUID) TO authenticated, service_role;

-- ============================================================================
-- 2. public.users — enable RLS (story 1 deliberately left it off).
--    SELECT: caller must be Active (caller_role() IS NOT NULL) and may read
--    their own row, or every row in their program when Admin. No writes.
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own row or program rows as admin" ON public.users
  FOR SELECT TO authenticated
  USING (
    public.caller_role() IS NOT NULL
    AND (
      id = auth.uid()
      OR (public.caller_role() = 'Admin' AND program_id = public.caller_program_id())
    )
  );

-- ============================================================================
-- 3. Drop the four placeholder SELECT policies.
-- ============================================================================
DROP POLICY "Contacts are viewable by authenticated users" ON public.contacts;
DROP POLICY "Locations are viewable by authenticated users" ON public.locations;
DROP POLICY "Sessions are viewable by authenticated users" ON public.sessions;
DROP POLICY "Attendance is viewable by authenticated users" ON public.attendance;

-- ============================================================================
-- 4. Scoped SELECT policies (exact rls-policy-matrix.md read scope).
-- ============================================================================
CREATE POLICY "Contacts are scoped by caller role and program" ON public.contacts
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (public.caller_role() = 'Preacher' AND assigned_preacher_id = auth.uid())
      OR (public.caller_role() = 'Assistant' AND assigned_preacher_id = public.caller_assigned_preacher_id())
    )
  );

CREATE POLICY "Sessions are scoped by creator and program" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (public.caller_role() IN ('Preacher', 'Assistant') AND created_by = auth.uid())
      OR (public.caller_role() = 'Assistant' AND created_by = public.caller_assigned_preacher_id())
    )
  );

CREATE POLICY "Attendance is scoped by session preacher and program" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (
        public.caller_role() IN ('Preacher', 'Assistant')
        AND public.caller_can_read_attendance_session(session_id)
      )
    )
  );

CREATE POLICY "Locations are scoped by effective locations and program" ON public.locations
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR id = ANY (public.caller_effective_location_ids())
    )
  );
