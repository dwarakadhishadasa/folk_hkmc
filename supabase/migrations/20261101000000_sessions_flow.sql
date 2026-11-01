-- Migration: Sessions overview, reports and attendee reads.
-- Date: 2026-11-01
-- Spec: _bmad-output/specs/spec-sessions-flow/
--
-- Read-only functions behind `/sessions`, its reports and its attendee detail.
-- No table or column changes: `sessions`, `attendance`, `contacts` and
-- `locations` stay as they are.
--
-- Every function is `security invoker`, revoked from public/anon/authenticated
-- and granted to `service_role` only. The app calls them with `.rpc()` after
-- `getStaffContext()` and `requireRole`, so the explicit `p_role` predicate is
-- the scope; the database is not asked to re-derive it from `auth.uid()`.
--
-- Status is derived, never stored. `sessions_status` is the one definition the
-- overview and the stats share. `session_date` is a `DATE`; when a timestamp is
-- needed it is cast at `Asia/Kolkata` midnight, never parsed as text.
--
-- The `sessions` SELECT policy gains the assistant-created term so a Preacher's
-- database scope matches the app scope. `caller_assistant_user_ids` is the
-- `security definer` helper that makes it readable under RLS.

CREATE OR REPLACE FUNCTION public.caller_assistant_user_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(u.id), ARRAY[]::UUID[])
  FROM public.users u
  WHERE u.assigned_preacher_id = auth.uid()
    AND u.status = 'Active'
$$;

DROP POLICY IF EXISTS "Sessions are scoped by creator, preacher and program" ON public.sessions;

CREATE POLICY "Sessions are scoped by creator, preacher and program" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (
        public.caller_role() IN ('Preacher', 'Assistant')
        AND (
          created_by = auth.uid()
          OR preacher_id = auth.uid()
          OR created_by = public.caller_assigned_preacher_id()
          OR preacher_id = public.caller_assigned_preacher_id()
          OR created_by = ANY(public.caller_assistant_user_ids())
        )
      )
    )
  );

-- Public attendance is always on. The column is not read when deriving status;
-- this backfill is what makes the statement true for rows written before the
-- creation path started setting it.
UPDATE public.sessions
SET public_attendance_enabled = true
WHERE public_attendance_enabled IS DISTINCT FROM true;

-- The scope predicate every other function uses. An Assistant with no active
-- assigned preacher passes a null `p_assigned_preacher_id` and keeps only their
-- own creations; it never widens to the programme.
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
      p_role = 'Admin'
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

-- One session's visibility, for the live dashboard's attendance poll. It is the
-- same predicate as the overview, so a session the list shows can also be read
-- live.
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
      p_assigned_preacher_id
    ) v
    WHERE v.id = p_session_id
  )
$$;

-- Upcoming before the window, Live now inside it, Completed at the close. A
-- missing open resolves to Completed, never an endless live session. A missing
-- close falls back to the session's duration, then to an hour.
CREATE OR REPLACE FUNCTION public.sessions_status(
  p_opens_at TIMESTAMPTZ,
  p_closes_at TIMESTAMPTZ,
  p_duration_minutes INT
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_opens_at IS NULL THEN 'Completed'
    WHEN now() >= COALESCE(
      p_closes_at,
      p_opens_at + make_interval(mins => COALESCE(p_duration_minutes, 60))
    ) THEN 'Completed'
    WHEN now() < p_opens_at THEN 'Upcoming'
    ELSE 'Live now'
  END
$$;

CREATE OR REPLACE FUNCTION public.sessions_overview(
  p_program_id TEXT,
  p_user_id UUID,
  p_role TEXT,
  p_assigned_preacher_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  session_date DATE,
  location_id UUID,
  location_name TEXT,
  attendance_count BIGINT,
  status TEXT,
  attendance_url TEXT,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH visible AS (
    SELECT
      v.*,
      COALESCE(
        v.attendance_opens_at,
        v.session_date::timestamp AT TIME ZONE 'Asia/Kolkata'
      ) AS opens_ts,
      COALESCE(
        v.attendance_closes_at,
        COALESCE(
          v.attendance_opens_at,
          v.session_date::timestamp AT TIME ZONE 'Asia/Kolkata'
        ) + make_interval(mins => COALESCE(v.duration_minutes, 60))
      ) AS closes_ts
    FROM public.sessions_visible(
      p_program_id,
      p_user_id,
      p_role,
      p_assigned_preacher_id
    ) v
  )
  SELECT
    v.id,
    v.name,
    v.session_date,
    v.location_id,
    l.name,
    COALESCE(counts.attendance_count, 0)::BIGINT,
    public.sessions_status(v.opens_ts, v.closes_ts, v.duration_minutes),
    v.attendance_url,
    v.opens_ts,
    v.closes_ts
  FROM visible v
  LEFT JOIN public.locations l
    ON l.id = v.location_id
   AND l.program_id = v.program_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS attendance_count
    FROM public.attendance a
    WHERE a.session_id = v.id
  ) counts ON true
  ORDER BY v.opens_ts DESC NULLS LAST, v.id
$$;

CREATE OR REPLACE FUNCTION public.sessions_overview_stats(
  p_program_id TEXT,
  p_user_id UUID,
  p_role TEXT,
  p_assigned_preacher_id UUID
)
RETURNS TABLE (
  sessions_count BIGINT,
  attendees_total BIGINT,
  avg_attendance_current NUMERIC,
  avg_attendance_previous NUMERIC,
  repeat_attendees BIGINT,
  upcoming_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH visible AS (
    SELECT
      v.id,
      COALESCE(
        v.attendance_opens_at,
        v.session_date::timestamp AT TIME ZONE 'Asia/Kolkata'
      ) AS opens_ts,
      v.attendance_closes_at,
      v.duration_minutes,
      v.session_date
    FROM public.sessions_visible(
      p_program_id,
      p_user_id,
      p_role,
      p_assigned_preacher_id
    ) v
  ),
  bounds AS (
    SELECT
      (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata' AS current_start,
      (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 month') AT TIME ZONE 'Asia/Kolkata' AS current_end,
      (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - interval '1 month') AT TIME ZONE 'Asia/Kolkata' AS previous_start
  ),
  attendance_rows AS (
    SELECT a.contact_id, a.session_id
    FROM public.attendance a
    JOIN visible v ON v.id = a.session_id
  ),
  current AS (
    SELECT
      count(*) FILTER (WHERE a.id IS NOT NULL) AS attendance,
      count(DISTINCT v.id) AS sessions
    FROM visible v
    CROSS JOIN bounds b
    LEFT JOIN public.attendance a ON a.session_id = v.id
    WHERE v.opens_ts >= b.current_start
      AND v.opens_ts < b.current_end
  ),
  previous AS (
    SELECT
      count(*) FILTER (WHERE a.id IS NOT NULL) AS attendance,
      count(DISTINCT v.id) AS sessions
    FROM visible v
    CROSS JOIN bounds b
    LEFT JOIN public.attendance a ON a.session_id = v.id
    WHERE v.opens_ts >= b.previous_start
      AND v.opens_ts < b.current_start
  ),
  repeat AS (
    SELECT count(*) AS repeat_attendees
    FROM (
      SELECT contact_id
      FROM attendance_rows
      GROUP BY contact_id
      HAVING count(*) >= 2
    ) r
  ),
  upcoming AS (
    SELECT count(*) AS upcoming_count
    FROM visible v
    WHERE public.sessions_status(
      v.opens_ts,
      COALESCE(
        v.attendance_closes_at,
        v.opens_ts + make_interval(mins => COALESCE(v.duration_minutes, 60))
      ),
      v.duration_minutes
    ) = 'Upcoming'
  )
  SELECT
    (SELECT count(*) FROM visible)::BIGINT,
    (SELECT count(*) FROM attendance_rows)::BIGINT,
    CASE WHEN c.sessions = 0 THEN 0 ELSE c.attendance::NUMERIC / c.sessions END,
    CASE WHEN p.sessions = 0 THEN 0 ELSE p.attendance::NUMERIC / p.sessions END,
    (SELECT repeat_attendees FROM repeat)::BIGINT,
    (SELECT upcoming_count FROM upcoming)::BIGINT
  FROM current c, previous p
$$;

CREATE OR REPLACE FUNCTION public.sessions_report(
  p_program_id TEXT,
  p_user_id UUID,
  p_role TEXT,
  p_assigned_preacher_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'range_required' USING ERRCODE = '22023';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  v_from := p_from::timestamp AT TIME ZONE 'Asia/Kolkata';
  -- Inclusive end date: the next midnight in the programme's time zone.
  v_to := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata';

  WITH visible AS (
    SELECT
      v.*,
      COALESCE(
        v.attendance_opens_at,
        v.session_date::timestamp AT TIME ZONE 'Asia/Kolkata'
      ) AS opens_ts
    FROM public.sessions_visible(
      p_program_id,
      p_user_id,
      p_role,
      p_assigned_preacher_id
    ) v
  ),
  ranged AS (
    SELECT v.*
    FROM visible v
    WHERE v.opens_ts >= v_from
      AND v.opens_ts < v_to
  ),
  session_counts AS (
    SELECT
      r.id,
      r.name,
      r.session_date,
      r.opens_ts,
      count(a.id) AS attendance_count
    FROM ranged r
    LEFT JOIN public.attendance a ON a.session_id = r.id
    GROUP BY r.id, r.name, r.session_date, r.opens_ts
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM ranged) AS sessions_run,
      COALESCE((SELECT sum(attendance_count) FROM session_counts), 0) AS total_attendance,
      (SELECT count(DISTINCT a.contact_id)
       FROM public.attendance a
       JOIN ranged r ON r.id = a.session_id) AS contacts_in_range
  ),
  repeats AS (
    SELECT count(*) AS repeat_contacts
    FROM (
      SELECT a.contact_id
      FROM public.attendance a
      JOIN ranged r ON r.id = a.session_id
      GROUP BY a.contact_id
      HAVING count(*) >= 2
    ) r
  ),
  by_session AS (
    SELECT id, name, session_date, attendance_count
    FROM session_counts
    WHERE attendance_count > 0
    ORDER BY attendance_count DESC, opens_ts DESC NULLS LAST, id
    LIMIT 4
  ),
  top_sessions AS (
    SELECT id, name, session_date, attendance_count
    FROM session_counts
    WHERE attendance_count > 0
    ORDER BY attendance_count DESC, opens_ts DESC NULLS LAST, id
    LIMIT 3
  ),
  weekly AS (
    SELECT
      date_trunc(
        'week',
        GREATEST(
          LEAST(
            COALESCE(
              a.created_at,
              r.attendance_opens_at,
              r.session_date::timestamp AT TIME ZONE 'Asia/Kolkata',
              v_from
            ),
            v_to
          ),
          v_from
        ) AT TIME ZONE 'Asia/Kolkata'
      )::DATE AS week_start,
      count(*) AS attendance_count
    FROM ranged r
    JOIN public.attendance a ON a.session_id = r.id
    GROUP BY 1
    ORDER BY 1
  )
  SELECT jsonb_build_object(
    'sessions_run', (SELECT sessions_run FROM totals),
    'total_attendance', (SELECT total_attendance FROM totals),
    'avg_per_session', CASE
      WHEN (SELECT sessions_run FROM totals) = 0 THEN 0
      ELSE (SELECT total_attendance FROM totals)::NUMERIC / (SELECT sessions_run FROM totals)
    END,
    'repeat_rate', CASE
      WHEN (SELECT contacts_in_range FROM totals) = 0 THEN 0
      ELSE (SELECT repeat_contacts FROM repeats)::NUMERIC / (SELECT contacts_in_range FROM totals)
    END,
    'by_session', COALESCE((SELECT jsonb_agg(to_jsonb(by_session)) FROM by_session), '[]'::JSONB),
    'weekly', COALESCE((SELECT jsonb_agg(to_jsonb(weekly)) FROM weekly), '[]'::JSONB),
    'top', COALESCE((SELECT jsonb_agg(to_jsonb(top_sessions)) FROM top_sessions), '[]'::JSONB)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.session_attendees(
  p_session_id UUID,
  p_program_id TEXT,
  p_user_id UUID,
  p_role TEXT,
  p_assigned_preacher_id UUID
)
RETURNS TABLE (
  contact_id UUID,
  name TEXT,
  phone TEXT,
  location_names TEXT,
  sessions_attended BIGINT,
  first_session DATE
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH visible AS (
    SELECT
      v.id,
      COALESCE(
        v.attendance_opens_at,
        v.session_date::timestamp AT TIME ZONE 'Asia/Kolkata'
      ) AS opens_ts
    FROM public.sessions_visible(
      p_program_id,
      p_user_id,
      p_role,
      p_assigned_preacher_id
    ) v
  ),
  target AS (
    SELECT v.id FROM visible v WHERE v.id = p_session_id
  ),
  attendance_rows AS (
    SELECT a.id, a.contact_id, a.name, a.phone, a.created_at
    FROM public.attendance a
    JOIN target t ON t.id = a.session_id
  ),
  rollup AS (
    SELECT
      a.contact_id,
      count(*) AS sessions_attended,
      min(v.opens_ts) AS first_session_ts
    FROM public.attendance a
    JOIN visible v ON v.id = a.session_id
    WHERE a.contact_id IN (SELECT contact_id FROM attendance_rows)
    GROUP BY a.contact_id
  )
  SELECT
    r.contact_id,
    COALESCE(c.name, r.name),
    COALESCE(c.phone, r.phone),
    (
      SELECT string_agg(l.name, ', ' ORDER BY l.name)
      FROM public.locations l
      WHERE l.program_id = p_program_id
        AND l.id::text = ANY(COALESCE(c.location_ids, ARRAY[]::text[]))
    ),
    COALESCE(roll.sessions_attended, 0)::BIGINT,
    (roll.first_session_ts AT TIME ZONE 'Asia/Kolkata')::DATE
  FROM attendance_rows r
  LEFT JOIN public.contacts c
    ON c.id = r.contact_id
   AND c.program_id = p_program_id
  LEFT JOIN rollup roll ON roll.contact_id = r.contact_id
  ORDER BY r.created_at ASC NULLS LAST, COALESCE(c.name, r.name)
$$;

CREATE OR REPLACE FUNCTION public.contact_attendance_summary(
  p_contact_id UUID,
  p_program_id TEXT,
  p_user_id UUID,
  p_role TEXT,
  p_assigned_preacher_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = p_contact_id
      AND c.program_id = p_program_id
  ) THEN
    RETURN NULL;
  END IF;

  WITH visible AS (
    SELECT
      v.id,
      v.name,
      v.session_date,
      COALESCE(
        v.attendance_opens_at,
        v.session_date::timestamp AT TIME ZONE 'Asia/Kolkata'
      ) AS opens_ts
    FROM public.sessions_visible(
      p_program_id,
      p_user_id,
      p_role,
      p_assigned_preacher_id
    ) v
  ),
  attended AS (
    SELECT v.id, v.name, v.session_date, v.opens_ts
    FROM visible v
    WHERE EXISTS (
      SELECT 1
      FROM public.attendance a
      WHERE a.session_id = v.id
        AND a.contact_id = p_contact_id
    )
  )
  SELECT jsonb_build_object(
    'name', c.name,
    'phone', c.phone,
    'notes', c.notes,
    'location_names', (
      SELECT string_agg(l.name, ', ' ORDER BY l.name)
      FROM public.locations l
      WHERE l.program_id = p_program_id
        AND l.id::text = ANY(COALESCE(c.location_ids, ARRAY[]::text[]))
    ),
    'preacher_name', u.name,
    'first_contact', COALESCE(
      c.initial_contact,
      (c.created_at AT TIME ZONE 'Asia/Kolkata')::DATE
    ),
    'last_contacted', c.last_contacted_on,
    'collected_by_name', cu.name,
    'favorite', COALESCE(c.is_favorite, false),
    'sessions_attended', (SELECT count(*) FROM attended),
    'past_60_day_attendance', (
      SELECT count(*)
      FROM public.attendance a
      JOIN visible v ON v.id = a.session_id
      WHERE a.contact_id = p_contact_id
        AND v.opens_ts >= now() - interval '60 days'
    ),
    'last_attended', (
      SELECT (max(a.opens_ts) AT TIME ZONE 'Asia/Kolkata')::DATE
      FROM attended a
    ),
    'history', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'session_name', a.name,
            'session_date', a.session_date
          )
          ORDER BY a.opens_ts DESC NULLS LAST, a.id
        )
        FROM attended a
      ),
      '[]'::JSONB
    )
  )
  INTO v_result
  FROM public.contacts c
  LEFT JOIN public.users u ON u.id = c.assigned_preacher_id
  LEFT JOIN public.users cu ON cu.id = c.collected_by_id
  WHERE c.id = p_contact_id
    AND c.program_id = p_program_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.caller_assistant_user_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sessions_visible(TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.session_visible(UUID, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sessions_status(TIMESTAMPTZ, TIMESTAMPTZ, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sessions_overview(TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sessions_overview_stats(TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sessions_report(TEXT, UUID, TEXT, UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.session_attendees(UUID, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contact_attendance_summary(UUID, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.caller_assistant_user_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sessions_visible(TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_visible(UUID, TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.sessions_status(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sessions_overview(TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.sessions_overview_stats(TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.sessions_report(TEXT, UUID, TEXT, UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_attendees(UUID, TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.contact_attendance_summary(UUID, TEXT, UUID, TEXT, UUID) TO service_role;
