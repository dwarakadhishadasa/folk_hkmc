-- The Sessions Overview's Top 5 attendees: the five contacts with the most
-- check-ins inside the reporting window. Scope and window are the same
-- predicates `sessions_report` uses, so a contact outside the caller's visible
-- sessions can never appear here.
--
-- A separate function rather than another key on `sessions_report` keeps the
-- report's own JSON stable for the cards that already read it; the page calls
-- both in one `Promise.all`.

CREATE OR REPLACE FUNCTION public.sessions_top_attendees(
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
  ranked AS (
    SELECT
      a.contact_id,
      c.name,
      count(*) AS attendance_count
    FROM public.attendance a
    JOIN ranged r ON r.id = a.session_id
    JOIN public.contacts c ON c.id = a.contact_id
    GROUP BY a.contact_id, c.name
    ORDER BY attendance_count DESC, c.name, a.contact_id
    LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(ranked)), '[]'::JSONB)
  INTO v_result
  FROM ranked;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.sessions_top_attendees(TEXT, UUID, TEXT, UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sessions_top_attendees(TEXT, UUID, TEXT, UUID, DATE, DATE) TO service_role;
