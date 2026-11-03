-- The Assistant's assignable caller set includes the patch owner.
--
-- AD-3 of the autodialer spine, amended by SPEC-admin-assistants: an Assistant's
-- owner may be an Admin, and the owner joins the assignable set alongside the
-- actor and the staff assigned to the owner. The app-level set is built in
-- `lib/dialer/scope.ts`; this helper keeps the RLS roster read in step.
CREATE OR REPLACE FUNCTION public.caller_assignable_user_ids()
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller public.users%ROWTYPE;
  v_base UUID[];
BEGIN
  SELECT u.* INTO v_caller
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.status = 'Active';

  IF NOT FOUND THEN
    RETURN '{}'::uuid[];
  END IF;

  v_base := CASE v_caller.role
    WHEN 'Admin' THEN (
      SELECT COALESCE(array_agg(s.id), '{}'::uuid[])
      FROM public.users s
      WHERE s.program_id = v_caller.program_id
        AND s.status = 'Active'
    )
    WHEN 'Preacher' THEN (
      SELECT COALESCE(array_agg(s.id), '{}'::uuid[])
      FROM public.users s
      WHERE s.program_id = v_caller.program_id
        AND s.status = 'Active'
        AND s.assigned_preacher_id = v_caller.id
    ) || v_caller.id
    WHEN 'Assistant' THEN (
      SELECT COALESCE(array_agg(s.id), '{}'::uuid[])
      FROM public.users s
      WHERE s.program_id = v_caller.program_id
        AND s.status = 'Active'
        AND s.assigned_preacher_id = public.caller_assigned_preacher_id()
    ) || v_caller.id || CASE
      WHEN public.caller_assigned_preacher_id() IS NOT NULL
        THEN ARRAY[public.caller_assigned_preacher_id()]::uuid[]
      ELSE '{}'::uuid[]
    END
    ELSE '{}'::uuid[]
  END;

  RETURN (
    SELECT COALESCE(array_agg(candidate.id), '{}'::uuid[])
    FROM unnest(v_base) AS candidate(id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.dialer_callers dc
      WHERE dc.user_id = candidate.id
        AND dc.is_active = false
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.caller_assignable_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_assignable_user_ids() TO authenticated, service_role;
