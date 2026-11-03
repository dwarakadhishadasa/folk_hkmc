-- Admin-supervised Assistants: the patch owner may be an Admin or a Preacher.
--
-- Spec: _bmad-output/specs/spec-admin-assistants/
-- Spine: _bmad-output/planning-artifacts/architecture/architecture-folk_hkmc-2026-11-03/ARCHITECTURE-SPINE.md
--
-- The app resolves one patch owner per staff member (Admin/Preacher: self,
-- Assistant: the assigned Active Admin or Preacher). These helpers and policies
-- grant exactly that patch. The Admin branch of every policy stays
-- programme-wide; an Assistant never receives programme scope.

-- ============================================================================
-- 1. Helpers
-- ============================================================================

-- The caller's assigned Preacher, only when the caller and the assigned row are
-- Active, in the same programme, and the assigned row is an Admin or Preacher.
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
    AND p.program_id = u.program_id
    AND p.role IN ('Admin', 'Preacher')
$$;

-- A Preacher's own location_ids; a Volunteer's or Assistant's active assigned
-- Admin/Preacher's location_ids; empty otherwise. The Volunteer branch stays
-- the form's reference list, not a patch.
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
        AND p.program_id = u.program_id
        AND p.role IN ('Admin', 'Preacher')
    )
    ELSE '{}'::uuid[]
  END
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.status = 'Active'
$$;

-- The attendance predicate matches the session predicate exactly:
--   Admin     any session in the programme;
--   Preacher  preached, created, or created by active staff assigned to them;
--   Assistant preached/created by the assigned Preacher, or created by them.
-- A null owner yields FALSE.
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
        public.caller_role() = 'Admin'
        OR (
          public.caller_role() = 'Preacher'
          AND (
            s.preacher_id = auth.uid()
            OR s.created_by = auth.uid()
            OR s.created_by IN (
              SELECT u.id
              FROM public.users u
              WHERE u.assigned_preacher_id = auth.uid()
                AND u.status = 'Active'
            )
          )
        )
        OR (
          public.caller_role() = 'Assistant'
          AND public.caller_assigned_preacher_id() IS NOT NULL
          AND (
            s.preacher_id = public.caller_assigned_preacher_id()
            OR s.created_by = public.caller_assigned_preacher_id()
            OR s.created_by = auth.uid()
          )
        )
      )
  )
$$;

-- ============================================================================
-- 2. Sessions SELECT policy — the same predicate as sessions_visible
-- ============================================================================

DROP POLICY IF EXISTS "Sessions are scoped by creator, preacher and program" ON public.sessions;

CREATE POLICY "Sessions are scoped by creator, preacher and program" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (
        public.caller_role() = 'Preacher'
        AND (
          preacher_id = auth.uid()
          OR created_by = auth.uid()
          OR created_by IN (
            SELECT u.id
            FROM public.users u
            WHERE u.assigned_preacher_id = auth.uid()
              AND u.status = 'Active'
          )
        )
      )
      OR (
        public.caller_role() = 'Assistant'
        AND public.caller_assigned_preacher_id() IS NOT NULL
        AND (
          preacher_id = public.caller_assigned_preacher_id()
          OR created_by = public.caller_assigned_preacher_id()
          OR created_by = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- 3. The scope functions
-- ============================================================================

-- The full actor/owner vector. The owner's role is deliberately absent: a
-- scope function cannot widen an Assistant by learning the owner is an Admin.
CREATE OR REPLACE FUNCTION public.sessions_visible(
  p_program_id TEXT,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_owner_id UUID,
  p_owner_location_ids UUID[]
)
RETURNS SETOF public.sessions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT s.*
  FROM public.sessions s
  WHERE s.program_id = p_program_id
    AND (
      (p_actor_role = 'Admin' AND s.created_by = p_actor_id)
      OR (
        p_actor_role = 'Preacher'
        AND p_owner_id IS NOT NULL
        AND (
          s.preacher_id = p_owner_id
          OR s.created_by = p_owner_id
          OR s.created_by IN (
            SELECT u.id
            FROM public.users u
            WHERE u.assigned_preacher_id = p_owner_id
              AND u.status = 'Active'
          )
        )
      )
      OR (
        p_actor_role = 'Assistant'
        AND p_owner_id IS NOT NULL
        AND (
          s.preacher_id = p_owner_id
          OR s.created_by = p_owner_id
          OR s.created_by = p_actor_id
        )
      )
    )
$$;

-- Compatibility wrapper for the existing 4-argument callers. `p_assigned_preacher_id`
-- now carries the owner id; the location list is not part of a session predicate.
CREATE OR REPLACE FUNCTION public.sessions_visible(
  p_program_id TEXT,
  p_user_id UUID,
  p_role TEXT,
  p_assigned_preacher_id UUID
)
RETURNS SETOF public.sessions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.sessions_visible(
    p_program_id,
    p_user_id,
    p_role,
    p_assigned_preacher_id,
    NULL::UUID[]
  )
$$;

-- One session's visibility, for the live dashboard's attendance poll. It calls
-- the same predicate as the overview, so a session the list shows can also be
-- read live.
CREATE OR REPLACE FUNCTION public.session_visible(
  p_session_id UUID,
  p_program_id TEXT,
  p_user_id UUID,
  p_role TEXT,
  p_assigned_preacher_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sessions_visible(
      p_program_id,
      p_user_id,
      p_role,
      p_assigned_preacher_id,
      NULL::UUID[]
    ) v
    WHERE v.id = p_session_id
  )
$$;

REVOKE ALL ON FUNCTION public.sessions_visible(TEXT, UUID, TEXT, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sessions_visible(TEXT, UUID, TEXT, UUID, UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.sessions_visible(TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sessions_visible(TEXT, UUID, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.session_visible(UUID, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_visible(UUID, TEXT, UUID, TEXT, UUID) TO service_role;
