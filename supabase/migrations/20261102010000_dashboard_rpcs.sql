-- Migration: the two dashboard read functions and their indexes.
-- Date: 2026-11-02
-- Spec: _bmad-output/specs/spec-program-dashboard/ (metrics.md §10, §11)
--
-- One definition per number. `dashboard_overview` answers the page and
-- `dashboard_candidates` answers the focus drill-down; both read the same
-- `dashboard_focus_rows` predicate so a segment's card count and its list total
-- cannot disagree.
--
-- Scope is resolved by the server from `getStaffContext()` and passed as
-- `p_program_scope` / `p_scope_preacher_id`. The functions are SECURITY INVOKER,
-- STABLE, pin `search_path`, and are executable by `service_role` only.
--
-- Every boundary comes from the caller: `p_today` is the programme day and
-- `p_start`/`p_end` are inclusive. The functions never call `now()` for a
-- period boundary.
--
-- `p_has_dialer = false` gates every `dialer_*` CTE, so a programme without the
-- Campaign module reads no campaign rows and gets empty outcomes/campaigns.

-- ---------------------------------------------------------------------------
-- Indexes (metrics.md §11). The session-campaign indexes ship with the link
-- migration; these are the reads the dashboard issues.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contacts_program_assigned_preacher
  ON public.contacts(program_id, assigned_preacher_id);

CREATE INDEX IF NOT EXISTS idx_contacts_program_initial_contact
  ON public.contacts(program_id, initial_contact);

CREATE INDEX IF NOT EXISTS idx_dialer_call_logs_program_called_at
  ON public.dialer_call_logs(program_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_dialer_call_logs_assignment_called_at
  ON public.dialer_call_logs(assignment_id, called_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_session_created_at
  ON public.attendance(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sessions_program_preacher_date
  ON public.sessions(program_id, preacher_id, session_date);

CREATE INDEX IF NOT EXISTS idx_sessions_program_location_date
  ON public.sessions(program_id, location_id, session_date);

-- ---------------------------------------------------------------------------
-- The disposition label shown in a focus reason. The database stores the
-- status; the UI and the SQL reason must not disagree about what it is called.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_disposition_label(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_status
    WHEN 'CONFIRMED' THEN 'Confirmed'
    WHEN 'MAY_COME' THEN 'May come'
    WHEN 'WILL_COME_NEXT_CLASS' THEN 'Will come next class'
    WHEN 'WILL_COME_NEXT_WEEK' THEN 'Will come next week'
    WHEN 'VISITING_HOME_TOWN' THEN 'Visiting home town'
    WHEN 'CALL_ME_BACK' THEN 'Call me back'
    WHEN 'CALL_DID_NOT_CONNECT' THEN 'Call did not connect'
    WHEN 'HEALTH_IS_NOT_GOOD' THEN 'Health is not good'
    WHEN 'SWITCHED_OFF' THEN 'Switched off'
    WHEN 'OUT_OF_STATION' THEN 'Out of station'
    WHEN 'BUSY_CANNOT_COME' THEN 'Busy cannot come'
    WHEN 'WRONG_NUMBER' THEN 'Wrong number'
    WHEN 'NOT_INTERESTED' THEN 'Not interested — do not call again'
    ELSE p_status
  END
$$;

-- ---------------------------------------------------------------------------
-- The five focus predicates, in one place.
--
-- Focus is `now`, not the reporting window: the thresholds are constants here
-- and do not move with `?period=`. Every segment reads the scoped contact set,
-- so a contact outside the reader's scope can never appear. Segments overlap;
-- their counts are never summed.
--
-- Rows are returned in the segment's own order, ending with contact_id so a
-- paginated list is stable across pages.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_focus_rows(
  p_program_id TEXT,
  p_scope_preacher_id UUID,
  p_program_scope BOOLEAN,
  p_has_dialer BOOLEAN,
  p_today DATE,
  p_segment TEXT
)
RETURNS TABLE (
  contact_id UUID,
  name TEXT,
  phone TEXT,
  preacher_name TEXT,
  location_name TEXT,
  last_activity DATE,
  reason TEXT,
  session_id UUID,
  session_name TEXT,
  session_date DATE,
  last_called_at TIMESTAMPTZ,
  disposition TEXT,
  campaign_name TEXT,
  lifetime_attendance BIGINT,
  last_attended_at DATE,
  initial_contact DATE,
  days_waiting INT,
  collector_name TEXT,
  days_since INT,
  sort_position BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH
scoped_contacts AS (
  SELECT
    c.id,
    c.name,
    c.phone,
    c.initial_contact,
    c.location_ids,
    c.assigned_preacher_id,
    c.collected_by_id
  FROM public.contacts c
  WHERE c.program_id = p_program_id
    AND (p_program_scope OR c.assigned_preacher_id = p_scope_preacher_id)
),
scoped_sessions AS (
  SELECT
    s.id,
    s.name,
    s.session_date,
    s.preacher_id,
    s.location_id,
    s.campaign_id,
    s.created_by
  FROM public.sessions s
  WHERE s.program_id = p_program_id
    AND (
      p_program_scope
      OR s.preacher_id = p_scope_preacher_id
      OR s.created_by = p_scope_preacher_id
    )
),
session_attendance AS (
  SELECT
    a.id,
    a.contact_id,
    a.session_id,
    COALESCE(
      s.session_date,
      (a.created_at AT TIME ZONE 'Asia/Kolkata')::date
    ) AS attended_on
  FROM public.attendance a
  JOIN scoped_sessions s ON s.id = a.session_id
  WHERE a.program_id = p_program_id
),
attendance_rollup AS (
  SELECT
    sa.contact_id,
    count(*) AS lifetime_attendance,
    max(sa.attended_on) AS last_attended_on,
    count(*) FILTER (WHERE sa.attended_on >= p_today - 30) AS recent_30,
    count(*) FILTER (WHERE sa.attended_on >= p_today - 60) AS recent_60
  FROM session_attendance sa
  GROUP BY sa.contact_id
),
scoped_assignments AS (
  SELECT
    a.id AS assignment_id,
    a.contact_id,
    a.campaign_id
  FROM public.dialer_assignments a
  JOIN scoped_contacts c ON c.id = a.contact_id
  WHERE p_has_dialer
    AND a.program_id = p_program_id
),
scoped_logs AS (
  SELECT
    l.id,
    l.assignment_id,
    l.status_group,
    l.disposition_status,
    l.called_at,
    (l.called_at AT TIME ZONE 'Asia/Kolkata')::date AS called_on,
    a.contact_id,
    a.campaign_id
  FROM public.dialer_call_logs l
  JOIN scoped_assignments a ON a.assignment_id = l.assignment_id
  WHERE p_has_dialer
    AND l.program_id = p_program_id
),
last_call AS (
  SELECT sl.contact_id, max(sl.called_on) AS last_called_on
  FROM scoped_logs sl
  WHERE sl.called_on <= p_today
  GROUP BY sl.contact_id
),
latest_reached AS (
  SELECT DISTINCT ON (sl.contact_id)
    sl.contact_id,
    sl.campaign_id,
    sl.status_group,
    sl.disposition_status,
    sl.called_at,
    sl.called_on
  FROM scoped_logs sl
  WHERE sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
    AND sl.called_on <= p_today
  ORDER BY sl.contact_id, sl.called_at DESC, sl.id DESC
),
first_reached_campaign AS (
  SELECT
    sl.contact_id,
    sl.campaign_id,
    min(sl.called_on) AS first_reached_on
  FROM scoped_logs sl
  WHERE sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
    AND sl.called_on <= p_today
  GROUP BY sl.contact_id, sl.campaign_id
),
campaign_attendance AS (
  SELECT
    sa.contact_id,
    s.campaign_id,
    min(sa.attended_on) AS first_attended_on
  FROM session_attendance sa
  JOIN scoped_sessions s ON s.id = sa.session_id
  WHERE s.campaign_id IS NOT NULL
  GROUP BY sa.contact_id, s.campaign_id
),
confirmed_target AS (
  SELECT
    lr.contact_id,
    lr.campaign_id,
    lr.called_at,
    lr.disposition_status,
    dc.name AS campaign_name,
    target.id AS session_id,
    target.name AS session_name,
    target.session_date
  FROM latest_reached lr
  JOIN public.dialer_campaigns dc
    ON dc.id = lr.campaign_id
   AND dc.program_id = p_program_id
  LEFT JOIN LATERAL (
    SELECT s.id, s.name, s.session_date
    FROM scoped_sessions s
    WHERE s.campaign_id = lr.campaign_id
      AND s.session_date IS NOT NULL
      AND s.session_date <= p_today
    ORDER BY s.session_date DESC, s.id
    LIMIT 1
  ) target ON true
  WHERE p_segment = 'confirmed_not_attended'
    AND p_has_dialer
    AND lr.status_group = 'CONFIRMED'
    AND target.id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM first_reached_campaign fr
      JOIN campaign_attendance ca
        ON ca.contact_id = fr.contact_id
       AND ca.campaign_id = fr.campaign_id
       AND ca.first_attended_on >= fr.first_reached_on
      WHERE fr.contact_id = lr.contact_id
        AND fr.campaign_id = lr.campaign_id
    )
),
ready_to_invite AS (
  SELECT
    c.id AS contact_id,
    lr.called_at AS padded_called_at,
    lr.called_on,
    lr.campaign_id,
    lr.disposition_status,
    dc.name AS campaign_name,
    ar.last_attended_on
  FROM scoped_contacts c
  JOIN latest_reached lr ON lr.contact_id = c.id
  JOIN public.dialer_campaigns dc
    ON dc.id = lr.campaign_id
   AND dc.program_id = p_program_id
  LEFT JOIN attendance_rollup ar ON ar.contact_id = c.id
  WHERE p_segment = 'ready_to_invite'
    AND p_has_dialer
    AND lr.disposition_status IN (
      'MAY_COME',
      'CALL_ME_BACK',
      'WILL_COME_NEXT_CLASS',
      'WILL_COME_NEXT_WEEK'
    )
    AND COALESCE(ar.recent_30, 0) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM scoped_assignments a
      JOIN public.dialer_campaigns ac
        ON ac.id = a.campaign_id
       AND ac.program_id = p_program_id
       AND ac.status = 'ACTIVE'
      WHERE a.contact_id = c.id
        AND EXISTS (
          SELECT 1
          FROM scoped_sessions s
          WHERE s.campaign_id = a.campaign_id
            AND s.session_date >= p_today
        )
    )
),
committed_not_invited AS (
  SELECT
    c.id AS contact_id,
    ar.lifetime_attendance,
    ar.last_attended_on
  FROM scoped_contacts c
  JOIN attendance_rollup ar ON ar.contact_id = c.id
  WHERE p_segment = 'committed_not_invited'
    AND p_has_dialer
    AND (ar.lifetime_attendance >= 3 OR ar.recent_60 >= 2)
    AND NOT EXISTS (
      SELECT 1
      FROM scoped_assignments a
      JOIN public.dialer_campaigns ac
        ON ac.id = a.campaign_id
       AND ac.program_id = p_program_id
       AND ac.status = 'ACTIVE'
      WHERE a.contact_id = c.id
    )
),
new_untouched AS (
  SELECT
    c.id AS contact_id,
    c.initial_contact,
    p_today - c.initial_contact AS days_waiting
  FROM scoped_contacts c
  WHERE p_segment = 'new_untouched'
    AND c.initial_contact >= p_today - 90
    AND c.initial_contact <= p_today - 7
    AND (
      NOT p_has_dialer
      OR NOT EXISTS (SELECT 1 FROM scoped_logs sl WHERE sl.contact_id = c.id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM session_attendance sa WHERE sa.contact_id = c.id
    )
),
fading AS (
  SELECT
    c.id AS contact_id,
    ar.lifetime_attendance,
    ar.last_attended_on,
    p_today - ar.last_attended_on AS days_since
  FROM scoped_contacts c
  JOIN attendance_rollup ar ON ar.contact_id = c.id
  WHERE p_segment = 'fading'
    AND ar.lifetime_attendance >= 2
    AND ar.recent_60 = 0
),
selected AS (
  SELECT
    c.id,
    c.name,
    c.phone,
    c.initial_contact,
    c.collected_by_id,
    c.assigned_preacher_id,
    COALESCE(
      GREATEST(
        COALESCE(lc.last_called_on, DATE '0001-01-01'),
        COALESCE(ar.last_attended_on, DATE '0001-01-01')
      ),
      DATE '0001-01-01'
    ) AS raw_last_activity,
    lc.last_called_on,
    ar.last_attended_on,
    ar.lifetime_attendance,
    ct.session_id,
    ct.session_name,
    ct.session_date,
    ct.called_at AS confirmed_called_at,
    ct.disposition_status AS confirmed_disposition,
    ct.campaign_name AS confirmed_campaign_name,
    rt.padded_called_at AS ready_called_at,
    rt.disposition_status AS ready_disposition,
    rt.campaign_name AS ready_campaign_name,
    rt.last_attended_on AS ready_last_attended,
    cm.lifetime_attendance AS committed_lifetime,
    cm.last_attended_on AS committed_last_attended,
    nt.initial_contact AS untouched_initial_contact,
    nt.days_waiting,
    fd.lifetime_attendance AS fading_lifetime,
    fd.last_attended_on AS fading_last_attended,
    fd.days_since
  FROM scoped_contacts c
  LEFT JOIN attendance_rollup ar ON ar.contact_id = c.id
  LEFT JOIN last_call lc ON lc.contact_id = c.id
  LEFT JOIN confirmed_target ct ON ct.contact_id = c.id
  LEFT JOIN ready_to_invite rt ON rt.contact_id = c.id
  LEFT JOIN committed_not_invited cm ON cm.contact_id = c.id
  LEFT JOIN new_untouched nt ON nt.contact_id = c.id
  LEFT JOIN fading fd ON fd.contact_id = c.id
  WHERE
    (p_segment = 'confirmed_not_attended' AND ct.contact_id IS NOT NULL)
    OR (p_segment = 'ready_to_invite' AND rt.contact_id IS NOT NULL)
    OR (p_segment = 'committed_not_invited' AND cm.contact_id IS NOT NULL)
    OR (p_segment = 'new_untouched' AND nt.contact_id IS NOT NULL)
    OR (p_segment = 'fading' AND fd.contact_id IS NOT NULL)
)
SELECT
  s.id AS contact_id,
  s.name,
  s.phone,
  preacher.name AS preacher_name,
  location.name AS location_name,
  CASE
    WHEN s.raw_last_activity = DATE '0001-01-01' THEN NULL
    ELSE s.raw_last_activity
  END AS last_activity,
  CASE p_segment
    WHEN 'confirmed_not_attended' THEN format(
      'Confirmed for %s on %s; no check-in.',
      s.session_name,
      to_char(s.session_date, 'DD Mon YYYY')
    )
    WHEN 'ready_to_invite' THEN format(
      '%s on %s; last attended %s.',
      public.dashboard_disposition_label(s.ready_disposition),
      to_char(s.ready_called_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY'),
      COALESCE(to_char(s.ready_last_attended, 'DD Mon YYYY'), 'never')
    )
    WHEN 'committed_not_invited' THEN format(
      'Attended %s times; last on %s. Not in an active campaign.',
      s.committed_lifetime,
      to_char(s.committed_last_attended, 'DD Mon YYYY')
    )
    WHEN 'new_untouched' THEN format(
      'Collected %s; waiting %s days; never called.',
      to_char(s.untouched_initial_contact, 'DD Mon YYYY'),
      s.days_waiting
    )
    WHEN 'fading' THEN format(
      'Attended %s times; last on %s, %s days ago.',
      s.fading_lifetime,
      to_char(s.fading_last_attended, 'DD Mon YYYY'),
      s.days_since
    )
  END AS reason,
  s.session_id,
  s.session_name,
  s.session_date,
  s.confirmed_called_at AS last_called_at,
  CASE
    WHEN p_segment = 'confirmed_not_attended' THEN public.dashboard_disposition_label(s.confirmed_disposition)
    WHEN p_segment = 'ready_to_invite' THEN public.dashboard_disposition_label(s.ready_disposition)
  END AS disposition,
  CASE
    WHEN p_segment = 'confirmed_not_attended' THEN s.confirmed_campaign_name
    WHEN p_segment = 'ready_to_invite' THEN s.ready_campaign_name
  END AS campaign_name,
  CASE
    WHEN p_segment = 'committed_not_invited' THEN s.committed_lifetime
    WHEN p_segment = 'fading' THEN s.fading_lifetime
    ELSE s.lifetime_attendance
  END AS lifetime_attendance,
  CASE
    WHEN p_segment = 'committed_not_invited' THEN s.committed_last_attended
    WHEN p_segment = 'fading' THEN s.fading_last_attended
    ELSE s.last_attended_on
  END AS last_attended_at,
  s.untouched_initial_contact AS initial_contact,
  s.days_waiting,
  collector.name AS collector_name,
  s.days_since,
  row_number() OVER (
    ORDER BY
      CASE WHEN p_segment = 'confirmed_not_attended' THEN s.session_date END DESC NULLS LAST,
      CASE WHEN p_segment = 'ready_to_invite' THEN s.ready_called_at END DESC NULLS LAST,
      CASE WHEN p_segment = 'committed_not_invited' THEN s.committed_lifetime END DESC NULLS LAST,
      CASE WHEN p_segment = 'committed_not_invited' THEN s.committed_last_attended END DESC NULLS LAST,
      CASE WHEN p_segment = 'new_untouched' THEN s.untouched_initial_contact END ASC NULLS LAST,
      CASE WHEN p_segment = 'fading' THEN s.fading_last_attended END ASC NULLS LAST,
      s.name ASC,
      s.id ASC
  ) AS sort_position
FROM selected s
LEFT JOIN public.users preacher
  ON preacher.id = s.assigned_preacher_id
 AND preacher.program_id = p_program_id
LEFT JOIN LATERAL (
  SELECT l.name
  FROM public.locations l
  WHERE l.program_id = p_program_id
    AND l.status = 'Active'
    AND l.id::text = (
      SELECT c3.location_ids[1]
      FROM public.contacts c3
      WHERE c3.id = s.id
        AND c3.location_ids IS NOT NULL
        AND cardinality(c3.location_ids) >= 1
    )
  LIMIT 1
) location ON true
LEFT JOIN public.users collector
  ON collector.id = s.collected_by_id
 AND collector.program_id = p_program_id
ORDER BY sort_position
$$;

-- ---------------------------------------------------------------------------
-- The drill-down: one segment, one page, the full total.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_candidates(
  p_program_id TEXT,
  p_scope_preacher_id UUID,
  p_program_scope BOOLEAN,
  p_has_dialer BOOLEAN,
  p_today DATE,
  p_segment TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
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

  IF p_today IS NULL THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  IF p_segment IS NULL OR p_segment NOT IN (
    'confirmed_not_attended',
    'ready_to_invite',
    'committed_not_invited',
    'new_untouched',
    'fading'
  ) THEN
    RAISE EXCEPTION 'invalid_segment' USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023';
  END IF;

  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'invalid_offset' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.programs pr WHERE pr.id = p_program_id) THEN
    RAISE EXCEPTION 'program_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH rows AS MATERIALIZED (
    SELECT *
    FROM public.dashboard_focus_rows(
      p_program_id,
      p_scope_preacher_id,
      p_program_scope,
      p_has_dialer,
      p_today,
      p_segment
    )
  ),
  page AS (
    SELECT * FROM rows ORDER BY rows.sort_position ASC LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'segment', p_segment,
    'total', (SELECT count(*) FROM rows),
    'limit', p_limit,
    'offset', p_offset,
    'rows', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'contactId', page.contact_id,
            'name', page.name,
            'phone', page.phone,
            'preacherName', page.preacher_name,
            'locationName', page.location_name,
            'lastActivity', page.last_activity,
            'reason', page.reason,
            'sessionId', page.session_id,
            'sessionName', page.session_name,
            'sessionDate', page.session_date,
            'lastCalledAt', page.last_called_at,
            'disposition', page.disposition,
            'campaignName', page.campaign_name,
            'lifetimeAttendance', page.lifetime_attendance,
            'lastAttendedAt', page.last_attended_at,
            'initialContact', page.initial_contact,
            'daysWaiting', page.days_waiting,
            'collectorName', page.collector_name,
            'daysSince', page.days_since
          )
        )
        FROM page
      ),
      '[]'::JSONB
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- The page payload.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_overview(
  p_program_id TEXT,
  p_scope_preacher_id UUID,
  p_program_scope BOOLEAN,
  p_start DATE,
  p_end DATE,
  p_today DATE,
  p_prev_start DATE,
  p_prev_end DATE,
  p_has_dialer BOOLEAN
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
  scoped_contacts AS (
    SELECT
      c.id,
      c.name,
      c.phone,
      c.initial_contact,
      c.location_ids,
      c.assigned_preacher_id,
      c.collected_by_id
    FROM public.contacts c
    WHERE c.program_id = p_program_id
      AND (p_program_scope OR c.assigned_preacher_id = p_scope_preacher_id)
  ),
  scoped_sessions AS (
    SELECT
      s.id,
      s.name,
      s.session_date,
      s.preacher_id,
      s.location_id,
      s.campaign_id,
      s.created_by,
      s.created_at
    FROM public.sessions s
    WHERE s.program_id = p_program_id
      AND (
        p_program_scope
        OR s.preacher_id = p_scope_preacher_id
        OR s.created_by = p_scope_preacher_id
      )
  ),
  session_attendance AS (
    SELECT
      a.id,
      a.contact_id,
      a.session_id,
      COALESCE(
        s.session_date,
        (a.created_at AT TIME ZONE 'Asia/Kolkata')::date
      ) AS attended_on
    FROM public.attendance a
    JOIN scoped_sessions s ON s.id = a.session_id
    WHERE a.program_id = p_program_id
  ),
  period_attendance AS (
    SELECT sa.*
    FROM session_attendance sa
    WHERE (p_start IS NULL OR sa.attended_on >= p_start)
      AND sa.attended_on <= p_end
  ),
  programme_attendance AS (
    SELECT
      a.contact_id,
      COALESCE(
        s.session_date,
        (a.created_at AT TIME ZONE 'Asia/Kolkata')::date
      ) AS attended_on
    FROM public.attendance a
    JOIN public.sessions s
      ON s.id = a.session_id
     AND s.program_id = p_program_id
    WHERE a.program_id = p_program_id
  ),
  first_ever_attendance AS (
    SELECT pa.contact_id, min(pa.attended_on) AS first_on
    FROM programme_attendance pa
    GROUP BY pa.contact_id
  ),
  cohort AS (
    SELECT sc.*
    FROM scoped_contacts sc
    WHERE p_start IS NULL
      OR (
        sc.initial_contact IS NOT NULL
        AND sc.initial_contact >= p_start
        AND sc.initial_contact <= p_end
      )
  ),
  previous_cohort AS (
    SELECT sc.id
    FROM scoped_contacts sc
    WHERE p_prev_start IS NOT NULL
      AND p_prev_end IS NOT NULL
      AND sc.initial_contact IS NOT NULL
      AND sc.initial_contact >= p_prev_start
      AND sc.initial_contact <= p_prev_end
  ),
  scoped_assignments AS (
    SELECT
      a.id AS assignment_id,
      a.contact_id,
      a.campaign_id,
      a.status
    FROM public.dialer_assignments a
    JOIN scoped_contacts c ON c.id = a.contact_id
    WHERE p_has_dialer
      AND a.program_id = p_program_id
  ),
  scoped_logs AS (
    SELECT
      l.id,
      l.assignment_id,
      l.status_group,
      l.disposition_status,
      l.called_at,
      (l.called_at AT TIME ZONE 'Asia/Kolkata')::date AS called_on,
      a.contact_id,
      a.campaign_id
    FROM public.dialer_call_logs l
    JOIN scoped_assignments a ON a.assignment_id = l.assignment_id
    WHERE p_has_dialer
      AND l.program_id = p_program_id
  ),
  period_logs AS (
    SELECT sl.*
    FROM scoped_logs sl
    WHERE (p_start IS NULL OR sl.called_on >= p_start)
      AND sl.called_on <= p_end
  ),
  latest_reached_window AS (
    SELECT DISTINCT ON (sl.contact_id)
      sl.contact_id,
      sl.status_group
    FROM period_logs sl
    WHERE sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
    ORDER BY sl.contact_id, sl.called_at DESC, sl.id DESC
  ),
  latest_reached AS (
    SELECT DISTINCT ON (sl.contact_id)
      sl.contact_id,
      sl.status_group,
      sl.campaign_id,
      sl.called_on
    FROM scoped_logs sl
    WHERE sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
      AND sl.called_on <= p_today
    ORDER BY sl.contact_id, sl.called_at DESC, sl.id DESC
  ),
  scoped_campaigns AS (
    SELECT dc.id, dc.name, dc.status, dc.campaign_date
    FROM public.dialer_campaigns dc
    WHERE p_has_dialer
      AND dc.program_id = p_program_id
      AND (
        p_program_scope
        OR EXISTS (
          SELECT 1 FROM scoped_assignments a WHERE a.campaign_id = dc.id
        )
        OR EXISTS (
          SELECT 1 FROM scoped_sessions s WHERE s.campaign_id = dc.id
        )
      )
  ),
  linked_sessions AS (
    SELECT s.campaign_id, s.id, s.name, s.session_date
    FROM scoped_sessions s
    WHERE s.campaign_id IS NOT NULL
  ),
  first_reached_campaign AS (
    SELECT
      sl.contact_id,
      sl.campaign_id,
      min(sl.called_on) AS first_reached_on
    FROM scoped_logs sl
    WHERE sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
      AND sl.called_on <= p_today
    GROUP BY sl.contact_id, sl.campaign_id
  ),
  campaign_attendance AS (
    SELECT
      sa.contact_id,
      s.campaign_id,
      min(sa.attended_on) AS first_attended_on
    FROM session_attendance sa
    JOIN scoped_sessions s ON s.id = sa.session_id
    WHERE s.campaign_id IS NOT NULL
    GROUP BY sa.contact_id, s.campaign_id
  ),
  campaign_invited_attended AS (
    SELECT DISTINCT fr.campaign_id, fr.contact_id
    FROM first_reached_campaign fr
    JOIN campaign_attendance ca
      ON ca.contact_id = fr.contact_id
     AND ca.campaign_id = fr.campaign_id
     AND ca.first_attended_on >= fr.first_reached_on
  ),
  campaign_attended_counts AS (
    SELECT cia.campaign_id, count(*)::int AS attended
    FROM campaign_invited_attended cia
    GROUP BY cia.campaign_id
  ),
  assignment_log_summary AS (
    SELECT
      sl.assignment_id,
      count(*)::int AS log_count,
      count(*) FILTER (
        WHERE sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
      )::int AS reached_count
    FROM scoped_logs sl
    GROUP BY sl.assignment_id
  ),
  latest_reached_by_assignment AS (
    SELECT DISTINCT ON (sl.assignment_id)
      sl.assignment_id,
      sl.status_group
    FROM scoped_logs sl
    WHERE sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
    ORDER BY sl.assignment_id, sl.called_at DESC, sl.id DESC
  ),
  campaign_assignment_stats AS (
    SELECT
      a.campaign_id,
      a.assignment_id,
      a.contact_id,
      (als.log_count IS NOT NULL) AS attempted,
      (COALESCE(als.reached_count, 0) > 0) AS reached,
      COALESCE(lra.status_group = 'CONFIRMED', false) AS confirmed
    FROM scoped_assignments a
    LEFT JOIN assignment_log_summary als ON als.assignment_id = a.assignment_id
    LEFT JOIN latest_reached_by_assignment lra ON lra.assignment_id = a.assignment_id
  ),
  campaign_stats AS (
    SELECT
      cas.campaign_id,
      count(*)::int AS assigned,
      count(*) FILTER (WHERE cas.attempted)::int AS attempted,
      count(*) FILTER (WHERE cas.reached)::int AS reached,
      count(*) FILTER (WHERE cas.confirmed)::int AS confirmed,
      count(*) FILTER (WHERE NOT cas.attempted)::int AS never_attempted
    FROM campaign_assignment_stats cas
    GROUP BY cas.campaign_id
  ),
  campaign_latest_session AS (
    SELECT DISTINCT ON (ls.campaign_id)
      ls.campaign_id,
      ls.id,
      ls.name,
      ls.session_date
    FROM linked_sessions ls
    ORDER BY ls.campaign_id, ls.session_date DESC NULLS LAST, ls.id DESC
  ),
  campaign_session_counts AS (
    SELECT ls.campaign_id, count(*)::int AS session_count
    FROM linked_sessions ls
    GROUP BY ls.campaign_id
  ),
  campaigns_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'status', c.status,
          'campaignDate', c.campaign_date,
          'sessionCount', COALESCE(sc.session_count, 0),
          'sessionId', cls.id,
          'sessionName', cls.name,
          'sessionDate', cls.session_date,
          'assigned', COALESCE(cs.assigned, 0),
          'attempted', COALESCE(cs.attempted, 0),
          'reached', COALESCE(cs.reached, 0),
          'confirmed', COALESCE(cs.confirmed, 0),
          'neverAttempted', COALESCE(cs.never_attempted, 0),
          'attended', CASE
            WHEN COALESCE(sc.session_count, 0) = 0 THEN NULL
            ELSE COALESCE(cac.attended, 0)
          END
        )
        ORDER BY c.campaign_date ASC, c.name ASC, c.id ASC
      ),
      '[]'::JSONB
    ) AS payload
    FROM scoped_campaigns c
    LEFT JOIN campaign_stats cs ON cs.campaign_id = c.id
    LEFT JOIN campaign_session_counts sc ON sc.campaign_id = c.id
    LEFT JOIN campaign_latest_session cls ON cls.campaign_id = c.id
    LEFT JOIN campaign_attended_counts cac ON cac.campaign_id = c.id
    WHERE c.status = 'ACTIVE'
  ),
  outcomes_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'statusGroup', grouped.status_group,
          'count', grouped.calls
        )
        ORDER BY grouped.calls DESC, grouped.status_group ASC
      ),
      '[]'::JSONB
    ) AS payload
    FROM (
      SELECT pl.status_group, count(*)::int AS calls
      FROM period_logs pl
      GROUP BY pl.status_group
    ) grouped
  ),
  cohort_reached_campaign AS (
    SELECT DISTINCT sl.contact_id, sl.campaign_id
    FROM scoped_logs sl
    JOIN cohort co ON co.id = sl.contact_id
    WHERE sl.called_on <= p_today
      AND sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
      AND EXISTS (
        SELECT 1 FROM linked_sessions ls WHERE ls.campaign_id = sl.campaign_id
      )
  ),
  pipeline_attended AS (
    SELECT DISTINCT fr.contact_id
    FROM first_reached_campaign fr
    JOIN cohort co ON co.id = fr.contact_id
    JOIN linked_sessions ls ON ls.campaign_id = fr.campaign_id
    JOIN campaign_attendance ca
      ON ca.contact_id = fr.contact_id
     AND ca.campaign_id = fr.campaign_id
     AND ca.first_attended_on >= fr.first_reached_on
  ),
  pipeline_attended_confirmed AS (
    SELECT pa.contact_id
    FROM pipeline_attended pa
    JOIN latest_reached lr ON lr.contact_id = pa.contact_id
    WHERE lr.status_group = 'CONFIRMED'
  ),
  completed_call_contacts AS (
    SELECT DISTINCT sl.contact_id
    FROM scoped_logs sl
    WHERE sl.called_on <= p_today
  ),
  completed_reached_contacts AS (
    SELECT DISTINCT sl.contact_id
    FROM scoped_logs sl
    WHERE sl.called_on <= p_today
      AND sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
  ),
  assigned_contacts AS (
    SELECT DISTINCT a.contact_id FROM scoped_assignments a
  ),
  pipeline_counts AS (
    SELECT
      (SELECT count(*)::int FROM cohort) AS collected,
      (
        SELECT count(*)::int
        FROM cohort co
        JOIN assigned_contacts ac ON ac.contact_id = co.id
      ) AS assigned,
      (
        SELECT count(*)::int
        FROM cohort co
        JOIN completed_call_contacts cc ON cc.contact_id = co.id
      ) AS called,
      (
        SELECT count(*)::int
        FROM cohort co
        JOIN completed_reached_contacts rc ON rc.contact_id = co.id
      ) AS reached,
      (
        SELECT count(*)::int
        FROM cohort co
        JOIN latest_reached lr ON lr.contact_id = co.id
        WHERE lr.status_group = 'CONFIRMED'
      ) AS confirmed,
      (SELECT count(DISTINCT crc.contact_id)::int FROM cohort_reached_campaign crc) AS invited,
      (SELECT count(*)::int FROM pipeline_attended) AS attended,
      (SELECT count(*)::int FROM pipeline_attended_confirmed) AS attended_confirmed,
      (
        SELECT count(DISTINCT sl.campaign_id)::int
        FROM scoped_logs sl
        JOIN cohort co ON co.id = sl.contact_id
        JOIN scoped_campaigns sc ON sc.id = sl.campaign_id
        WHERE sl.called_on <= p_today
          AND sl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
          AND NOT EXISTS (
            SELECT 1 FROM linked_sessions ls WHERE ls.campaign_id = sl.campaign_id
          )
      ) AS unlinked_campaigns
  ),
  attendance_totals AS (
    SELECT
      count(*)::int AS records,
      count(DISTINCT pa.contact_id)::int AS attendees
    FROM period_attendance pa
  ),
  new_attendees AS (
    SELECT count(*)::int AS attendees
    FROM (
      SELECT DISTINCT pa.contact_id FROM period_attendance pa
    ) period_contacts
    JOIN first_ever_attendance fea ON fea.contact_id = period_contacts.contact_id
    WHERE (p_start IS NULL OR fea.first_on >= p_start)
      AND fea.first_on <= p_end
  ),
  repeat_attendees AS (
    SELECT count(*)::int AS attendees
    FROM (
      SELECT pa.contact_id
      FROM period_attendance pa
      GROUP BY pa.contact_id
      HAVING count(*) >= 2
    ) repeated
  ),
  invited_attendees AS (
    SELECT count(DISTINCT pa.contact_id)::int AS attendees
    FROM period_attendance pa
    JOIN scoped_sessions s ON s.id = pa.session_id
    JOIN first_reached_campaign fr
      ON fr.contact_id = pa.contact_id
     AND fr.campaign_id = s.campaign_id
     AND fr.first_reached_on <= pa.attended_on
    WHERE s.campaign_id IS NOT NULL
  ),
  sessions_held AS (
    SELECT count(*)::int AS sessions
    FROM scoped_sessions s
    WHERE s.session_date IS NOT NULL
      AND (p_start IS NULL OR s.session_date >= p_start)
      AND s.session_date <= p_end
  ),
  kpi_raw AS (
    SELECT
      (SELECT count(*)::int FROM cohort) AS contacts_collected,
      (SELECT count(*)::int FROM previous_cohort) AS contacts_collected_prev,
      (SELECT count(*)::int FROM period_logs) AS calls_made,
      (SELECT count(DISTINCT pl.contact_id)::int FROM period_logs pl) AS contacts_called,
      (
        SELECT count(DISTINCT pl.contact_id)::int
        FROM period_logs pl
        WHERE pl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
      ) AS contacts_reached,
      (
        SELECT count(*)::int
        FROM latest_reached_window lrw
        WHERE lrw.status_group = 'CONFIRMED'
      ) AS contacts_confirmed,
      (SELECT sessions FROM sessions_held) AS sessions_held,
      (SELECT attendees FROM attendance_totals) AS unique_attendees,
      (SELECT records FROM attendance_totals) AS attendance_records,
      (SELECT attendees FROM new_attendees) AS new_attendees,
      (SELECT attendees FROM repeat_attendees) AS repeat_attendees,
      (SELECT attendees FROM invited_attendees) AS invited_attendees
  ),
  kpi AS (
    SELECT
      k.*,
      (k.unique_attendees - k.new_attendees) AS returning_attendees,
      (k.unique_attendees - k.invited_attendees) AS organic_attendees,
      CASE
        WHEN k.contacts_called = 0 THEN 0
        ELSE round(k.contacts_reached::numeric * 100 / k.contacts_called)::int
      END AS reach_rate,
      CASE
        WHEN k.contacts_reached = 0 THEN 0
        ELSE round(k.contacts_confirmed::numeric * 100 / k.contacts_reached)::int
      END AS confirmation_rate,
      CASE
        WHEN k.unique_attendees = 0 THEN 0
        ELSE round(k.repeat_attendees::numeric * 100 / k.unique_attendees)::int
      END AS repeat_rate,
      CASE
        WHEN k.sessions_held = 0 THEN 0
        ELSE round(k.attendance_records::numeric / k.sessions_held, 1)
      END AS average_attendance,
      CASE
        WHEN p_prev_start IS NULL THEN NULL
        ELSE k.contacts_collected - k.contacts_collected_prev
      END AS contacts_collected_delta,
      CASE
        WHEN p_prev_start IS NULL OR k.contacts_collected_prev = 0 THEN NULL
        ELSE round(
          (k.contacts_collected - k.contacts_collected_prev)::numeric
          * 100 / k.contacts_collected_prev
        )::int
      END AS contacts_collected_delta_pct
    FROM kpi_raw k
  ),
  coverage AS (
    SELECT
      count(*)::int AS contacts,
      count(*) FILTER (
        WHERE sc.location_ids IS NOT NULL
          AND cardinality(sc.location_ids) >= 1
          AND EXISTS (
            SELECT 1
            FROM public.locations l
            WHERE l.program_id = p_program_id
              AND l.status = 'Active'
              AND l.id::text = sc.location_ids[1]
          )
      )::int AS with_location,
      count(*) FILTER (
        WHERE sc.assigned_preacher_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = sc.assigned_preacher_id
              AND u.program_id = p_program_id
          )
      )::int AS with_assigned_preacher,
      count(*) FILTER (WHERE sc.initial_contact IS NOT NULL)::int AS with_initial_contact,
      count(*) FILTER (
        WHERE sc.collected_by_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = sc.collected_by_id
              AND u.program_id = p_program_id
          )
      )::int AS with_collector
    FROM scoped_contacts sc
  ),
  scope_user_locations AS (
    SELECT unnest(u.location_ids) AS location_id
    FROM public.users u
    WHERE u.id = p_scope_preacher_id
      AND u.program_id = p_program_id
  ),
  preacher_keys AS (
    SELECT
      u.id AS key,
      COALESCE(NULLIF(btrim(u.name), ''), u.email) AS name
    FROM public.users u
    WHERE u.program_id = p_program_id
      AND u.role = 'Preacher'
      AND u.status = 'Active'
    UNION
    SELECT
      u.id,
      COALESCE(NULLIF(btrim(u.name), ''), u.email)
    FROM public.users u
    WHERE u.program_id = p_program_id
      AND u.id IN (
        SELECT s.preacher_id FROM scoped_sessions s WHERE s.preacher_id IS NOT NULL
        UNION
        SELECT c.assigned_preacher_id FROM scoped_contacts c WHERE c.assigned_preacher_id IS NOT NULL
      )
  ),
  location_keys AS (
    SELECT l.id AS key, l.name
    FROM public.locations l
    WHERE l.program_id = p_program_id
      AND l.status = 'Active'
      AND (p_program_scope OR l.id IN (SELECT sul.location_id FROM scope_user_locations sul))
    UNION
    SELECT l.id, l.name
    FROM public.locations l
    WHERE l.program_id = p_program_id
      AND l.id IN (
        SELECT s.location_id FROM scoped_sessions s WHERE s.location_id IS NOT NULL
        UNION
        SELECT l2.id
        FROM public.locations l2
        WHERE l2.program_id = p_program_id
          AND l2.id::text IN (
            SELECT c.location_ids[1]
            FROM scoped_contacts c
            WHERE c.location_ids IS NOT NULL
              AND cardinality(c.location_ids) >= 1
          )
      )
  ),
  preacher_contacts AS (
    SELECT
      c.id,
      c.assigned_preacher_id AS key,
      c.initial_contact
    FROM scoped_contacts c
    WHERE c.assigned_preacher_id IS NOT NULL
  ),
  preacher_contact_counts AS (
    SELECT
      pc.key,
      count(*) FILTER (
        WHERE pc.initial_contact IS NOT NULL
          AND (p_start IS NULL OR pc.initial_contact >= p_start)
          AND pc.initial_contact <= p_end
      )::int AS contacts_collected
    FROM preacher_contacts pc
    GROUP BY pc.key
  ),
  preacher_call_counts AS (
    SELECT
      pc.key,
      count(*)::int AS calls_made,
      count(DISTINCT pl.contact_id) FILTER (
        WHERE pl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
      )::int AS reached
    FROM period_logs pl
    JOIN preacher_contacts pc ON pc.id = pl.contact_id
    GROUP BY pc.key
  ),
  preacher_confirmed AS (
    SELECT pc.key, count(*)::int AS confirmed
    FROM latest_reached_window lrw
    JOIN preacher_contacts pc ON pc.id = lrw.contact_id
    WHERE lrw.status_group = 'CONFIRMED'
    GROUP BY pc.key
  ),
  preacher_session_rows AS (
    SELECT
      COALESCE(s.preacher_id, s.created_by) AS key,
      s.id,
      s.session_date
    FROM scoped_sessions s
    WHERE COALESCE(s.preacher_id, s.created_by) IS NOT NULL
      AND s.session_date IS NOT NULL
      AND (p_start IS NULL OR s.session_date >= p_start)
      AND s.session_date <= p_end
  ),
  preacher_session_counts AS (
    SELECT psr.key, count(*)::int AS sessions
    FROM preacher_session_rows psr
    GROUP BY psr.key
  ),
  preacher_attendee_counts AS (
    SELECT psr.key, count(DISTINCT pa.contact_id)::int AS attendees
    FROM preacher_session_rows psr
    JOIN period_attendance pa ON pa.session_id = psr.id
    GROUP BY psr.key
  ),
  preacher_last_call AS (
    SELECT pc.key, max(sl.called_on) AS last_on
    FROM scoped_logs sl
    JOIN preacher_contacts pc ON pc.id = sl.contact_id
    WHERE sl.called_on <= p_today
    GROUP BY pc.key
  ),
  preacher_last_session AS (
    SELECT
      COALESCE(s.preacher_id, s.created_by) AS key,
      max(s.session_date) AS last_on
    FROM scoped_sessions s
    WHERE COALESCE(s.preacher_id, s.created_by) IS NOT NULL
      AND s.session_date IS NOT NULL
      AND s.session_date <= p_today
    GROUP BY 1
  ),
  preacher_rows AS (
    SELECT
      pk.key,
      pk.name,
      COALESCE(pcc.contacts_collected, 0) AS contacts_collected,
      COALESCE(pcl.calls_made, 0) AS calls_made,
      COALESCE(pcl.reached, 0) AS reached,
      COALESCE(pc.confirmed, 0) AS confirmed,
      COALESCE(psc.sessions, 0) AS sessions,
      COALESCE(pac.attendees, 0) AS attendees,
      GREATEST(
        COALESCE(plc.last_on, DATE '0001-01-01'),
        COALESCE(pls.last_on, DATE '0001-01-01')
      ) AS last_activity
    FROM preacher_keys pk
    LEFT JOIN preacher_contact_counts pcc ON pcc.key = pk.key
    LEFT JOIN preacher_call_counts pcl ON pcl.key = pk.key
    LEFT JOIN preacher_confirmed pc ON pc.key = pk.key
    LEFT JOIN preacher_session_counts psc ON psc.key = pk.key
    LEFT JOIN preacher_attendee_counts pac ON pac.key = pk.key
    LEFT JOIN preacher_last_call plc ON plc.key = pk.key
    LEFT JOIN preacher_last_session pls ON pls.key = pk.key
  ),
  location_contacts AS (
    SELECT
      c.id,
      l.id AS key,
      c.initial_contact
    FROM scoped_contacts c
    JOIN public.locations l
      ON l.program_id = p_program_id
     AND c.location_ids IS NOT NULL
     AND cardinality(c.location_ids) >= 1
     AND l.id::text = c.location_ids[1]
  ),
  location_contact_counts AS (
    SELECT
      lc.key,
      count(*) FILTER (
        WHERE lc.initial_contact IS NOT NULL
          AND (p_start IS NULL OR lc.initial_contact >= p_start)
          AND lc.initial_contact <= p_end
      )::int AS contacts_collected
    FROM location_contacts lc
    GROUP BY lc.key
  ),
  location_call_counts AS (
    SELECT
      lc.key,
      count(*)::int AS calls_made,
      count(DISTINCT pl.contact_id) FILTER (
        WHERE pl.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
      )::int AS reached
    FROM period_logs pl
    JOIN location_contacts lc ON lc.id = pl.contact_id
    GROUP BY lc.key
  ),
  location_confirmed AS (
    SELECT lc.key, count(*)::int AS confirmed
    FROM latest_reached_window lrw
    JOIN location_contacts lc ON lc.id = lrw.contact_id
    WHERE lrw.status_group = 'CONFIRMED'
    GROUP BY lc.key
  ),
  location_session_rows AS (
    SELECT s.location_id AS key, s.id, s.session_date
    FROM scoped_sessions s
    WHERE s.location_id IS NOT NULL
      AND s.session_date IS NOT NULL
      AND (p_start IS NULL OR s.session_date >= p_start)
      AND s.session_date <= p_end
  ),
  location_session_counts AS (
    SELECT lsr.key, count(*)::int AS sessions
    FROM location_session_rows lsr
    GROUP BY lsr.key
  ),
  location_attendee_counts AS (
    SELECT lsr.key, count(DISTINCT pa.contact_id)::int AS attendees
    FROM location_session_rows lsr
    JOIN period_attendance pa ON pa.session_id = lsr.id
    GROUP BY lsr.key
  ),
  location_last_call AS (
    SELECT lc.key, max(sl.called_on) AS last_on
    FROM scoped_logs sl
    JOIN location_contacts lc ON lc.id = sl.contact_id
    WHERE sl.called_on <= p_today
    GROUP BY lc.key
  ),
  location_last_session AS (
    SELECT s.location_id AS key, max(s.session_date) AS last_on
    FROM scoped_sessions s
    WHERE s.location_id IS NOT NULL
      AND s.session_date IS NOT NULL
      AND s.session_date <= p_today
    GROUP BY s.location_id
  ),
  location_rows AS (
    SELECT
      lk.key,
      lk.name,
      COALESCE(lcc.contacts_collected, 0) AS contacts_collected,
      COALESCE(lcl.calls_made, 0) AS calls_made,
      COALESCE(lcl.reached, 0) AS reached,
      COALESCE(lc.confirmed, 0) AS confirmed,
      COALESCE(lsc.sessions, 0) AS sessions,
      COALESCE(lac.attendees, 0) AS attendees,
      GREATEST(
        COALESCE(llc.last_on, DATE '0001-01-01'),
        COALESCE(lls.last_on, DATE '0001-01-01')
      ) AS last_activity
    FROM location_keys lk
    LEFT JOIN location_contact_counts lcc ON lcc.key = lk.key
    LEFT JOIN location_call_counts lcl ON lcl.key = lk.key
    LEFT JOIN location_confirmed lc ON lc.key = lk.key
    LEFT JOIN location_session_counts lsc ON lsc.key = lk.key
    LEFT JOIN location_attendee_counts lac ON lac.key = lk.key
    LEFT JOIN location_last_call llc ON llc.key = lk.key
    LEFT JOIN location_last_session lls ON lls.key = lk.key
  ),
  team_rows AS (
    SELECT
      'preacher'::text AS group_by,
      pr.key::text AS key,
      pr.name,
      pr.contacts_collected,
      pr.calls_made,
      pr.reached,
      pr.confirmed,
      pr.sessions,
      pr.attendees,
      pr.last_activity
    FROM preacher_rows pr
    WHERE p_program_scope
    UNION ALL
    SELECT
      'location'::text,
      lr.key::text,
      lr.name,
      lr.contacts_collected,
      lr.calls_made,
      lr.reached,
      lr.confirmed,
      lr.sessions,
      lr.attendees,
      lr.last_activity
    FROM location_rows lr
    WHERE NOT p_program_scope
  ),
  team_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'key', tr.key,
          'name', tr.name,
          'contactsCollected', tr.contacts_collected,
          'callsMade', tr.calls_made,
          'reached', tr.reached,
          'confirmed', tr.confirmed,
          'sessions', tr.sessions,
          'attendees', tr.attendees,
          'lastActivity', CASE
            WHEN tr.last_activity = DATE '0001-01-01' THEN NULL
            ELSE tr.last_activity
          END
        )
        ORDER BY tr.attendees DESC, tr.sessions DESC, tr.name ASC, tr.key ASC
      ),
      '[]'::JSONB
    ) AS payload
    FROM team_rows tr
  ),
  scope_counts AS (
    SELECT
      (SELECT count(*)::int FROM scoped_contacts) AS contacts,
      (SELECT count(*)::int FROM scoped_sessions) AS sessions,
      CASE
        WHEN p_program_scope THEN (
          SELECT count(*)::int
          FROM public.locations l
          WHERE l.program_id = p_program_id
            AND l.status = 'Active'
        )
        ELSE (
          SELECT count(*)::int
          FROM public.locations l
          JOIN public.users u
            ON u.id = p_scope_preacher_id
           AND u.program_id = p_program_id
          WHERE l.program_id = p_program_id
            AND l.status = 'Active'
            AND l.id = ANY(COALESCE(u.location_ids, ARRAY[]::UUID[]))
        )
      END AS locations
  ),
  trend_months AS (
    SELECT
      (date_trunc('month', p_today)::date - make_interval(months => m))::date AS month_start
    FROM generate_series(11, 0, -1) AS m
  ),
  attendance_by_month AS (
    SELECT
      date_trunc('month', sa.attended_on)::date AS month_start,
      sa.contact_id
    FROM session_attendance sa
    WHERE sa.attended_on >= (date_trunc('month', p_today)::date - interval '11 months')
      AND sa.attended_on < (date_trunc('month', p_today)::date + interval '1 month')
  ),
  trend_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'month', to_char(tm.month_start, 'YYYY-MM'),
          'sessions', (
            SELECT count(*)::int
            FROM scoped_sessions s
            WHERE s.session_date IS NOT NULL
              AND s.session_date >= tm.month_start
              AND s.session_date < (tm.month_start + interval '1 month')::date
          ),
          'attendees', (
            SELECT count(DISTINCT abm.contact_id)::int
            FROM attendance_by_month abm
            WHERE abm.month_start = tm.month_start
          ),
          'checkIns', (
            SELECT count(*)::int
            FROM attendance_by_month abm
            WHERE abm.month_start = tm.month_start
          )
        )
        ORDER BY tm.month_start ASC
      ),
      '[]'::JSONB
    ) AS payload
    FROM trend_months tm
  ),
  recent_sessions AS (
    SELECT
      s.id,
      s.name,
      s.session_date,
      s.preacher_id,
      s.location_id,
      s.created_at,
      count(a.id)::int AS attendees
    FROM scoped_sessions s
    LEFT JOIN public.attendance a ON a.session_id = s.id
    WHERE s.session_date IS NULL OR s.session_date <= p_today
    GROUP BY s.id, s.name, s.session_date, s.preacher_id, s.location_id, s.created_at
    ORDER BY
      COALESCE(s.session_date, (s.created_at AT TIME ZONE 'Asia/Kolkata')::date) DESC NULLS LAST,
      s.created_at DESC NULLS LAST,
      s.id
    LIMIT 5
  ),
  recent_sessions_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', rs.id,
          'name', rs.name,
          'sessionDate', rs.session_date,
          'preacherName', (
            SELECT COALESCE(NULLIF(btrim(u.name), ''), u.email)
            FROM public.users u
            WHERE u.id = rs.preacher_id
              AND u.program_id = p_program_id
          ),
          'locationName', (
            SELECT l.name
            FROM public.locations l
            WHERE l.id = rs.location_id
              AND l.program_id = p_program_id
          ),
          'attendees', rs.attendees
        )
        ORDER BY
          COALESCE(rs.session_date, (rs.created_at AT TIME ZONE 'Asia/Kolkata')::date) DESC NULLS LAST,
          rs.created_at DESC NULLS LAST,
          rs.id
      ),
      '[]'::JSONB
    ) AS payload
    FROM recent_sessions rs
  ),
  focus_keys AS (
    SELECT key, ord
    FROM (
      VALUES
        ('confirmed_not_attended', 1),
        ('ready_to_invite', 2),
        ('committed_not_invited', 3),
        ('new_untouched', 4),
        ('fading', 5)
    ) AS keys(key, ord)
  ),
  focus_payload AS (
    SELECT
      fk.key,
      fk.ord,
      public.dashboard_candidates(
        p_program_id,
        p_scope_preacher_id,
        p_program_scope,
        p_has_dialer,
        p_today,
        fk.key,
        3,
        0
      ) AS payload
    FROM focus_keys fk
  ),
  focus_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'key', fp.key,
          'count', COALESCE((fp.payload ->> 'total')::int, 0),
          'rows', COALESCE(fp.payload -> 'rows', '[]'::JSONB)
        )
        ORDER BY fp.ord
      ),
      '[]'::JSONB
    ) AS payload
    FROM focus_payload fp
  )
  SELECT
    jsonb_build_object(
      'programId', p_program_id,
      'programScope', p_program_scope,
      'scopePreacherId', p_scope_preacher_id,
      'period', jsonb_build_object(
        'start', p_start,
        'end', p_end,
        'today', p_today,
        'previousStart', p_prev_start,
        'previousEnd', p_prev_end
      ),
      'scope', jsonb_build_object(
        'contacts', sc.contacts,
        'locations', sc.locations,
        'sessions', sc.sessions
      ),
      'kpis', jsonb_build_object(
        'contactsCollected', k.contacts_collected,
        'contactsCollectedPrev', k.contacts_collected_prev,
        'contactsCollectedDelta', k.contacts_collected_delta,
        'contactsCollectedDeltaPct', k.contacts_collected_delta_pct,
        'callsMade', k.calls_made,
        'contactsCalled', k.contacts_called,
        'contactsReached', k.contacts_reached,
        'contactsConfirmed', k.contacts_confirmed,
        'reachRate', k.reach_rate,
        'confirmationRate', k.confirmation_rate,
        'sessionsHeld', k.sessions_held,
        'uniqueAttendees', k.unique_attendees,
        'attendanceRecords', k.attendance_records,
        'newAttendees', k.new_attendees,
        'returningAttendees', k.returning_attendees,
        'repeatAttendees', k.repeat_attendees,
        'repeatRate', k.repeat_rate,
        'averageAttendance', k.average_attendance,
        'invitedAttendees', k.invited_attendees,
        'organicAttendees', k.organic_attendees
      ),
      'pipeline', jsonb_build_object(
        'cohort', pc.collected,
        'stages', jsonb_build_array(
          jsonb_build_object('key', 'collected', 'count', pc.collected),
          jsonb_build_object('key', 'assigned', 'count', pc.assigned),
          jsonb_build_object('key', 'called', 'count', pc.called),
          jsonb_build_object('key', 'reached', 'count', pc.reached),
          jsonb_build_object('key', 'confirmed', 'count', pc.confirmed)
        ),
        'attended', jsonb_build_object(
          'invited', pc.invited,
          'attended', pc.attended,
          'confirmed', pc.attended_confirmed,
          'unconfirmed', pc.attended - pc.attended_confirmed
        ),
        'unlinkedCampaigns', pc.unlinked_campaigns
      ),
      'outcomes', op.payload,
      'attendanceTrend', tp.payload,
      'coverage', jsonb_build_object(
        'contacts', cv.contacts,
        'withLocation', cv.with_location,
        'withAssignedPreacher', cv.with_assigned_preacher,
        'withInitialContact', cv.with_initial_contact,
        'withCollector', cv.with_collector
      ),
      'team', jsonb_build_object(
        'groupBy', CASE WHEN p_program_scope THEN 'preacher' ELSE 'location' END,
        'rows', team.payload
      ),
      'campaigns', cp.payload,
      'recentSessions', rsp.payload,
      'focus', fj.payload,
      'generatedAt', to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') || '+05:30'
    )
  INTO v_result
  FROM kpi k
  CROSS JOIN pipeline_counts pc
  CROSS JOIN attendance_totals att
  CROSS JOIN sessions_held sh
  CROSS JOIN coverage cv
  CROSS JOIN scope_counts sc
  CROSS JOIN outcomes_payload op
  CROSS JOIN trend_payload tp
  CROSS JOIN team_payload team
  CROSS JOIN campaigns_payload cp
  CROSS JOIN recent_sessions_payload rsp
  CROSS JOIN focus_json fj;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_disposition_label(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_focus_rows(TEXT, UUID, BOOLEAN, BOOLEAN, DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_candidates(TEXT, UUID, BOOLEAN, BOOLEAN, DATE, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_overview(TEXT, UUID, BOOLEAN, DATE, DATE, DATE, DATE, DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dashboard_disposition_label(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_focus_rows(TEXT, UUID, BOOLEAN, BOOLEAN, DATE, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_candidates(TEXT, UUID, BOOLEAN, BOOLEAN, DATE, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_overview(TEXT, UUID, BOOLEAN, DATE, DATE, DATE, DATE, DATE, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';
