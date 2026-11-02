-- Migration: complete an ACTIVE campaign once its end date arrives.
--
-- `dialer_campaigns.campaign_date` is the campaign's end date. An ACTIVE
-- campaign is callable — the caller queue, the survey write and the dashboard
-- all gate on `status = 'ACTIVE'` — so a campaign left ACTIVE past its end date
-- would keep calling. This function is the single place that closes them, and
-- because it writes `status` every consumer sees COMPLETED without changing its
-- own predicate.
--
-- Boundary: `campaign_date <= current_date` completes the campaign at 00:00 on
-- its end date, which is the "end date at 12:00 AM" rule. A campaign that ends
-- today is therefore already complete when today starts.
--
-- Two triggers, one definition:
--   * pg_cron runs it at midnight where the extension is available, and
--   * `listCampaigns` and the caller queue call it before they read, so a
--     project without pg_cron (or a database that was asleep) still converges
--     on the first request of the day.
-- Both are idempotent: the UPDATE only touches rows still ACTIVE and expired.

CREATE OR REPLACE FUNCTION public.complete_expired_campaigns()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completed integer;
BEGIN
  WITH expired AS (
    UPDATE public.dialer_campaigns
       SET status = 'COMPLETED'
     WHERE status = 'ACTIVE'
       AND campaign_date <= current_date
    RETURNING 1
  )
  SELECT count(*) INTO completed FROM expired;

  RETURN completed;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_expired_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_expired_campaigns() TO authenticated, service_role;

-- Scheduling is best-effort: pg_cron is preloaded on Supabase but the extension
-- may not be installed, and a migration must not fail over a missing scheduler.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule('complete-expired-campaigns')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'complete-expired-campaigns');
  PERFORM cron.schedule(
    'complete-expired-campaigns',
    '0 0 * * *',
    $cron$SELECT public.complete_expired_campaigns();$cron$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END;
$$;
