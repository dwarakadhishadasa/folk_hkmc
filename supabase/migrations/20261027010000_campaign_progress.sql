-- Migration: one progress computation for a campaign, shared by every screen.
-- Date: 2026-10-27
-- Story: 1.9 — campaign overview and the one progress computation.
--
-- AD-16: the overview, the roster's performance columns and the reports screen
-- must read the same numbers. One function answers all of them, so a funnel
-- cannot disagree with a leaderboard.
--
-- Grain: funnel and campaign counts are assignment-grain (one row per assigned
-- contact); the leaderboard's calls-made and the recent-activity list are
-- log-grain. A queued disposition is not visible here because it has no call
-- log until its replay lands (Story 2.3).
--
-- Scope: p_program_scope = true reads the whole programme. Otherwise the
-- predicate is the assignment's contact's assigned_preacher_id. A null
-- preacher id with program_scope = false is refused — it never widens.

CREATE OR REPLACE FUNCTION public.campaign_progress(
  p_campaign_id UUID,
  p_scope_preacher_id UUID,
  p_program_scope BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_program_id TEXT;
  v_result JSONB;
BEGIN
  IF p_program_scope IS NULL THEN
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE = '22023';
  END IF;

  IF NOT p_program_scope AND p_scope_preacher_id IS NULL THEN
    RAISE EXCEPTION 'scope_preacher_required' USING ERRCODE = '22023';
  END IF;

  SELECT program_id INTO v_program_id
  FROM public.dialer_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH scoped AS (
    SELECT
      a.id AS assignment_id,
      a.caller_id,
      a.status AS assignment_status,
      ct.name AS contact_name
    FROM public.dialer_assignments a
    JOIN public.contacts ct ON ct.id = a.contact_id
    WHERE a.campaign_id = p_campaign_id
      AND a.program_id = v_program_id
      AND (p_program_scope OR ct.assigned_preacher_id = p_scope_preacher_id)
  ),
  logs AS (
    SELECT l.id, l.assignment_id, l.caller_id, l.status_group, l.called_at
    FROM public.dialer_call_logs l
    JOIN scoped s ON s.assignment_id = l.assignment_id
  ),
  stats AS (
    SELECT
      s.assignment_id,
      s.caller_id,
      s.assignment_status,
      EXISTS (SELECT 1 FROM logs lg WHERE lg.assignment_id = s.assignment_id) AS attempted,
      EXISTS (
        SELECT 1 FROM logs lg
        WHERE lg.assignment_id = s.assignment_id
          AND lg.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
      ) AS reached,
      COALESCE(
        (
          SELECT lg.status_group
          FROM logs lg
          WHERE lg.assignment_id = s.assignment_id
            AND lg.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
          ORDER BY lg.called_at DESC, lg.id DESC
          LIMIT 1
        ) = 'CONFIRMED',
        false
      ) AS confirmed
    FROM scoped s
  ),
  summary AS (
    SELECT
      count(*)::INT AS assigned,
      count(*) FILTER (WHERE attempted)::INT AS attempted,
      count(*) FILTER (WHERE reached)::INT AS reached,
      count(*) FILTER (WHERE confirmed)::INT AS confirmed,
      count(*) FILTER (WHERE NOT attempted)::INT AS never_attempted,
      count(*) FILTER (WHERE assignment_status = 'COMPLETED')::INT AS completed,
      count(*) FILTER (WHERE assignment_status = 'SKIPPED')::INT AS skipped,
      count(*) FILTER (WHERE assignment_status = 'PENDING')::INT AS pending
    FROM stats
  ),
  outcomes AS (
    SELECT
      lg.status_group,
      count(*)::INT AS count,
      max(lg.called_at) AS last_called_at
    FROM logs lg
    GROUP BY lg.status_group
    ORDER BY count(*) DESC, lg.status_group
  ),
  callers AS (
    SELECT
      s.caller_id,
      COALESCE(dc.display_name, dc.user_id::TEXT) AS caller_name,
      count(*)::INT AS assigned,
      count(*) FILTER (WHERE s.attempted)::INT AS attempted,
      count(*) FILTER (WHERE s.reached)::INT AS reached,
      count(*) FILTER (WHERE s.confirmed)::INT AS confirmed,
      count(*) FILTER (WHERE NOT s.attempted)::INT AS never_attempted,
      (SELECT count(*)::INT FROM logs lg WHERE lg.caller_id = s.caller_id) AS calls_made
    FROM stats s
    LEFT JOIN public.dialer_callers dc ON dc.id = s.caller_id
    GROUP BY s.caller_id, dc.display_name, dc.user_id
    ORDER BY count(*) DESC, caller_name
  ),
  recent AS (
    SELECT
      lg.id,
      lg.called_at,
      lg.status_group,
      s.contact_name,
      COALESCE(dc.display_name, dc.user_id::TEXT) AS caller_name
    FROM logs lg
    JOIN scoped s ON s.assignment_id = lg.assignment_id
    LEFT JOIN public.dialer_callers dc ON dc.id = lg.caller_id
    ORDER BY lg.called_at DESC, lg.id DESC
    LIMIT 20
  )
  SELECT jsonb_build_object(
    'campaignId', p_campaign_id,
    'programId', v_program_id,
    'programScope', p_program_scope,
    'summary', (SELECT to_jsonb(summary) FROM summary),
    'outcomes', COALESCE((SELECT jsonb_agg(to_jsonb(outcomes)) FROM outcomes), '[]'::jsonb),
    'callers', COALESCE((SELECT jsonb_agg(to_jsonb(callers)) FROM callers), '[]'::jsonb),
    'recent', COALESCE((SELECT jsonb_agg(to_jsonb(recent)) FROM recent), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.campaign_progress(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_progress(UUID, UUID, BOOLEAN) TO service_role;
