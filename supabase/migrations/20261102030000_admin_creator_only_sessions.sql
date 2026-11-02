-- An Admin's Sessions view is creator-only.
--
-- `/sessions` is a personal surface: a staff member works the sessions they
-- started. A Preacher and an Assistant already read through the narrower
-- creator/preacher/assistant predicate; an Admin used to read the whole
-- programme, which put sessions other staff created into the Admin's own list.
--
-- The Admin branch now matches the page's promise: `created_by = p_user_id`.
-- The other branches are unchanged, so an assigned assistant's session still
-- reaches the Preacher it belongs to, and an Assistant still sees their
-- preacher's sessions.
--
-- RLS is deliberately untouched: `/manage` is the programme-wide portal and
-- reads through the authenticated client, while `/sessions` reads through this
-- service-role function. Narrowing the policy here would also narrow `/manage`,
-- which this change does not cover.
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
  SELECT s.*
  FROM public.sessions s
  WHERE s.program_id = p_program_id
    AND (
      (p_role = 'Admin' AND s.created_by = p_user_id)
      OR (
        p_role IN ('Preacher', 'Assistant')
        AND (
          s.created_by = p_user_id
          OR s.preacher_id = p_user_id
          OR (
            p_assigned_preacher_id IS NOT NULL
            AND (
              s.created_by = p_assigned_preacher_id
              OR s.preacher_id = p_assigned_preacher_id
            )
          )
          OR (
            p_role = 'Preacher'
            AND s.created_by IN (
              SELECT u.id
              FROM public.users u
              WHERE u.assigned_preacher_id = p_user_id
                AND u.status = 'Active'
            )
          )
        )
      )
    )
$$;

REVOKE ALL ON FUNCTION public.sessions_visible(TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sessions_visible(TEXT, UUID, TEXT, UUID) TO service_role;
