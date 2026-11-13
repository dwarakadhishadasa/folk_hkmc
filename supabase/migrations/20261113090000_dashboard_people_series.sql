-- The dashboard's people-first series: preacher by location counts and the
-- twelve-month attendee lines. Kept out of `dashboard_overview` so that the
-- call-shaped payload stays untouched while the page moves to contact, session
-- and attendance reporting.

CREATE OR REPLACE FUNCTION public.dashboard_people_series(
  p_program_id TEXT,
  p_scope_preacher_id UUID,
  p_program_scope BOOLEAN,
  p_start DATE,
  p_end DATE,
  p_today DATE
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
  IF p_program_scope IS NULL THEN
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE = '22023';
  END IF;

  IF NOT p_program_scope AND p_scope_preacher_id IS NULL THEN
    RAISE EXCEPTION 'scope_preacher_required' USING ERRCODE = '22023';
  END IF;

  IF p_end IS NULL
    OR p_today IS NULL
    OR (p_start IS NOT NULL AND p_start > p_end) THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.programs pr WHERE pr.id = p_program_id) THEN
    RAISE EXCEPTION 'program_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH
  scoped_sessions AS (
    SELECT s.id, s.session_date, s.preacher_id, s.location_id, s.created_by
    FROM public.sessions s
    WHERE s.program_id = p_program_id
      AND (
        p_program_scope
        OR s.preacher_id = p_scope_preacher_id
        OR s.created_by = p_scope_preacher_id
      )
  ),
  scoped_contacts AS (
    SELECT c.id, c.initial_contact, c.location_ids, c.assigned_preacher_id
    FROM public.contacts c
    WHERE c.program_id = p_program_id
      AND (p_program_scope OR c.assigned_preacher_id = p_scope_preacher_id)
  ),
  preacher_keys AS (
    SELECT
      u.id AS key,
      COALESCE(NULLIF(btrim(u.name), ''), u.email) AS name
    FROM public.users u
    WHERE u.program_id = p_program_id
      AND (
        (p_program_scope AND u.role = 'Preacher' AND u.status = 'Active')
        OR (NOT p_program_scope AND u.id = p_scope_preacher_id)
      )
    UNION
    SELECT
      u.id,
      COALESCE(NULLIF(btrim(u.name), ''), u.email)
    FROM public.users u
    WHERE p_program_scope
      AND u.program_id = p_program_id
      AND u.id IN (
        SELECT s.preacher_id FROM scoped_sessions s WHERE s.preacher_id IS NOT NULL
        UNION
        SELECT s.created_by FROM scoped_sessions s WHERE s.created_by IS NOT NULL
        UNION
        SELECT c.assigned_preacher_id FROM scoped_contacts c WHERE c.assigned_preacher_id IS NOT NULL
      )
  ),
  location_names AS (
    SELECT l.id::text AS key, l.name
    FROM public.locations l
    WHERE l.program_id = p_program_id
  ),
  unassigned_key AS (
    SELECT '00000000-0000-0000-0000-000000000000'::uuid AS key, 'Unassigned'::text AS name
  ),
  session_rows AS (
    SELECT
      COALESCE(s.preacher_id, s.created_by, (SELECT key FROM unassigned_key)) AS preacher_id,
      COALESCE(s.location_id::text, 'unassigned') AS location_key,
      count(*)::int AS value
    FROM scoped_sessions s
    WHERE s.session_date IS NOT NULL
      AND (p_start IS NULL OR s.session_date >= p_start)
      AND s.session_date <= p_end
    GROUP BY 1, 2
  ),
  contact_rows AS (
    SELECT
      COALESCE(c.assigned_preacher_id, (SELECT key FROM unassigned_key)) AS preacher_id,
      COALESCE(NULLIF(c.location_ids[1], ''), 'unassigned') AS location_key,
      count(*)::int AS value
    FROM scoped_contacts c
    WHERE c.initial_contact IS NOT NULL
      AND (p_start IS NULL OR c.initial_contact >= p_start)
      AND c.initial_contact <= p_end
    GROUP BY 1, 2
  ),
  period_attendance AS (
    SELECT
      COALESCE(s.preacher_id, s.created_by, (SELECT key FROM unassigned_key)) AS preacher_id,
      a.contact_id,
      COALESCE(s.location_id::text, 'unassigned') AS location_key,
      COALESCE(s.session_date, (a.created_at AT TIME ZONE 'Asia/Kolkata')::date) AS attended_on
    FROM public.attendance a
    JOIN scoped_sessions s ON s.id = a.session_id
    WHERE a.program_id = p_program_id
      AND (
        p_start IS NULL
        OR COALESCE(s.session_date, (a.created_at AT TIME ZONE 'Asia/Kolkata')::date) >= p_start
      )
      AND COALESCE(s.session_date, (a.created_at AT TIME ZONE 'Asia/Kolkata')::date) <= p_end
  ),
  preacher_repeat_attendees AS (
    SELECT preacher_id, count(*)::int AS value
    FROM (
      SELECT preacher_id, contact_id
      FROM period_attendance
      GROUP BY 1, 2
      HAVING count(*) >= 2
    ) repeated
    GROUP BY 1
  ),
  -- One row per attendee: the first location they attended in the period. That
  -- keeps the location segments a partition of the unique-attendee total.
  first_period_attendance AS (
    SELECT DISTINCT ON (preacher_id, contact_id)
      preacher_id,
      contact_id,
      location_key
    FROM period_attendance
    ORDER BY preacher_id, contact_id, attended_on ASC, location_key ASC
  ),
  preacher_keys_with_unassigned AS (
    SELECT key, name FROM preacher_keys
    UNION ALL
    SELECT key, name FROM unassigned_key
    WHERE EXISTS (
        SELECT 1 FROM contact_rows cr
        WHERE cr.preacher_id = (SELECT key FROM unassigned_key)
      )
      OR EXISTS (
        SELECT 1 FROM session_rows sr
        WHERE sr.preacher_id = (SELECT key FROM unassigned_key)
      )
      OR EXISTS (
        SELECT 1 FROM period_attendance pa
        WHERE pa.preacher_id = (SELECT key FROM unassigned_key)
      )
  ),
  preacher_attendee_segments AS (
    SELECT preacher_id, location_key, count(*)::int AS value
    FROM first_period_attendance
    GROUP BY 1, 2
  ),
  preacher_period_attendees AS (
    SELECT preacher_id, count(*)::int AS value
    FROM first_period_attendance
    GROUP BY 1
  ),
  session_series AS (
    SELECT DISTINCT
      sr.location_key,
      CASE
        WHEN sr.location_key = 'unassigned' THEN 'Unassigned'
        ELSE COALESCE(ln.name, 'Unknown location')
      END AS label
    FROM session_rows sr
    LEFT JOIN location_names ln ON ln.key = sr.location_key
  ),
  contact_series AS (
    SELECT DISTINCT
      cr.location_key,
      CASE
        WHEN cr.location_key = 'unassigned' THEN 'Unassigned'
        ELSE COALESCE(ln.name, 'Unknown location')
      END AS label
    FROM contact_rows cr
    LEFT JOIN location_names ln ON ln.key = cr.location_key
  ),
  session_series_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('key', ss.location_key, 'label', ss.label)
        ORDER BY ss.label, ss.location_key
      ),
      '[]'::JSONB
    ) AS payload
    FROM session_series ss
  ),
  contact_series_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('key', cs.location_key, 'label', cs.label)
        ORDER BY cs.label, cs.location_key
      ),
      '[]'::JSONB
    ) AS payload
    FROM contact_series cs
  ),
  session_rows_payload AS (
    SELECT COALESCE(
      jsonb_agg(row_json ORDER BY preacher_name ASC, preacher_id ASC),
      '[]'::JSONB
    ) AS payload
    FROM (
      SELECT
        pk.key AS preacher_id,
        pk.name AS preacher_name,
        jsonb_build_object(
          'preacherId', pk.key,
          'preacherName', pk.name,
          'total', COALESCE(
            (SELECT sum(sr.value)::int FROM session_rows sr WHERE sr.preacher_id = pk.key),
            0
          ),
          'segments', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'key', ss.location_key,
                  'label', ss.label,
                  'value', COALESCE(
                    (SELECT sr.value FROM session_rows sr
                     WHERE sr.preacher_id = pk.key
                       AND sr.location_key = ss.location_key),
                    0
                  )
                )
                ORDER BY ss.label, ss.location_key
              ),
              '[]'::JSONB
            )
            FROM session_series ss
          )
        ) AS row_json
      FROM preacher_keys_with_unassigned pk
    ) rows
  ),
  contact_rows_payload AS (
    SELECT COALESCE(
      jsonb_agg(row_json ORDER BY preacher_name ASC, preacher_id ASC),
      '[]'::JSONB
    ) AS payload
    FROM (
      SELECT
        pk.key AS preacher_id,
        pk.name AS preacher_name,
        jsonb_build_object(
          'preacherId', pk.key,
          'preacherName', pk.name,
          'total', COALESCE(
            (SELECT sum(cr.value)::int FROM contact_rows cr WHERE cr.preacher_id = pk.key),
            0
          ),
          'segments', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'key', cs.location_key,
                  'label', cs.label,
                  'value', COALESCE(
                    (SELECT cr.value FROM contact_rows cr
                     WHERE cr.preacher_id = pk.key
                       AND cr.location_key = cs.location_key),
                    0
                  )
                )
                ORDER BY cs.label, cs.location_key
              ),
              '[]'::JSONB
            )
            FROM contact_series cs
          )
        ) AS row_json
      FROM preacher_keys_with_unassigned pk
    ) rows
  ),
  totals_rows_payload AS (
    SELECT COALESCE(
      jsonb_agg(row_json ORDER BY preacher_name ASC, preacher_id ASC),
      '[]'::JSONB
    ) AS payload
    FROM (
      SELECT
        pk.key AS preacher_id,
        pk.name AS preacher_name,
        jsonb_build_object(
          'preacherId', pk.key,
          'preacherName', pk.name,
          'contacts', COALESCE(
            (SELECT sum(cr.value)::int FROM contact_rows cr WHERE cr.preacher_id = pk.key),
            0
          ),
          'sessions', COALESCE(
            (SELECT sum(sr.value)::int FROM session_rows sr WHERE sr.preacher_id = pk.key),
            0
          ),
          'attendees', COALESCE(
            (SELECT ppa.value FROM preacher_period_attendees ppa WHERE ppa.preacher_id = pk.key),
            0
          ),
          'repeatAttendees', COALESCE(
            (SELECT pra.value FROM preacher_repeat_attendees pra WHERE pra.preacher_id = pk.key),
            0
          ),
          'attendeeSegments', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'key', pas.location_key,
                  'label', CASE
                    WHEN pas.location_key = 'unassigned' THEN 'Unassigned'
                    ELSE COALESCE(ln.name, 'Unknown location')
                  END,
                  'value', pas.value
                )
                ORDER BY CASE
                  WHEN pas.location_key = 'unassigned' THEN 'Unassigned'
                  ELSE COALESCE(ln.name, 'Unknown location')
                END, pas.location_key
              ),
              '[]'::JSONB
            )
            FROM preacher_attendee_segments pas
            LEFT JOIN location_names ln ON ln.key = pas.location_key
            WHERE pas.preacher_id = pk.key
          )
        ) AS row_json
      FROM preacher_keys_with_unassigned pk
    ) rows
  ),
  months AS (
    SELECT
      (date_trunc('month', p_today)::date - make_interval(months => m))::date AS month_start
    FROM generate_series(11, 0, -1) AS m
  ),
  session_attendance AS (
    SELECT
      COALESCE(s.preacher_id, s.created_by, (SELECT key FROM unassigned_key)) AS preacher_id,
      date_trunc(
        'month',
        COALESCE(s.session_date, (a.created_at AT TIME ZONE 'Asia/Kolkata')::date)
      )::date AS month_start,
      a.contact_id
    FROM public.attendance a
    JOIN scoped_sessions s ON s.id = a.session_id
    WHERE a.program_id = p_program_id
  ),
  attendee_counts AS (
    SELECT
      sa.preacher_id,
      sa.month_start,
      count(DISTINCT sa.contact_id)::int AS value
    FROM session_attendance sa
    WHERE sa.month_start >= (date_trunc('month', p_today)::date - interval '11 months')
      AND sa.month_start < (date_trunc('month', p_today)::date + interval '1 month')
    GROUP BY 1, 2
  ),
  months_payload AS (
    SELECT COALESCE(
      jsonb_agg(to_char(m.month_start, 'YYYY-MM') ORDER BY m.month_start),
      '[]'::JSONB
    ) AS payload
    FROM months m
  ),
  attendee_rows_payload AS (
    SELECT COALESCE(
      jsonb_agg(row_json ORDER BY preacher_name ASC, preacher_id ASC),
      '[]'::JSONB
    ) AS payload
    FROM (
      SELECT
        pk.key AS preacher_id,
        pk.name AS preacher_name,
        jsonb_build_object(
          'preacherId', pk.key,
          'preacherName', pk.name,
          'values', (
            SELECT COALESCE(
              jsonb_agg(COALESCE(ac.value, 0) ORDER BY m.month_start),
              '[]'::JSONB
            )
            FROM months m
            LEFT JOIN attendee_counts ac
              ON ac.preacher_id = pk.key
             AND ac.month_start = m.month_start
          )
        ) AS row_json
      FROM preacher_keys_with_unassigned pk
    ) rows
  )
  SELECT
    jsonb_build_object(
      'sessionsByPreacher', jsonb_build_object(
        'series', ssp.payload,
        'rows', srp.payload
      ),
      'contactsByPreacher', jsonb_build_object(
        'series', csp.payload,
        'rows', crp.payload
      ),
      'totals', jsonb_build_object(
        'rows', trp.payload
      ),
      'attendeesByPreacher', jsonb_build_object(
        'months', mp.payload,
        'series', arp.payload
      )
    )
  INTO v_result
  FROM session_series_payload ssp
  CROSS JOIN session_rows_payload srp
  CROSS JOIN contact_series_payload csp
  CROSS JOIN contact_rows_payload crp
  CROSS JOIN totals_rows_payload trp
  CROSS JOIN months_payload mp
  CROSS JOIN attendee_rows_payload arp;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_people_series(TEXT, UUID, BOOLEAN, DATE, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_people_series(TEXT, UUID, BOOLEAN, DATE, DATE, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';
