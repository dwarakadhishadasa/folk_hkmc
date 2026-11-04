-- Migration: close an ACTIVE campaign at the end of its end date in IST.
--
-- `dialer_campaigns.campaign_date` is a DATE with no time. The original function
-- compared it to `current_date`, which the database resolves in UTC: an ACTIVE
-- campaign was completed at 05:30 IST on its end date, before that date had
-- begun for the programme. The programme runs on IST, so the boundary is the
-- IST day.
--
-- Boundary: `campaign_date < (now() AT TIME ZONE 'Asia/Kolkata')::date` keeps
-- the campaign ACTIVE for the whole end date and closes it at 00:00 IST the
-- next day. `campaign_date` is a date, so this is a pure date comparison; no
-- timestamp is stored or inferred.
--
-- The function stays the single definition: pg_cron and every read path call it
-- before they read, so a database that was asleep still converges on the first
-- request of the day.

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
       AND campaign_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
    RETURNING 1
  )
  SELECT count(*) INTO completed FROM expired;

  RETURN completed;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_expired_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_expired_campaigns() TO authenticated, service_role;

-- The read-path sweep is the guarantee; the cron is the backstop for a project
-- with no page open at midnight. Supabase's pg_cron runs in UTC, so 00:00 IST
-- is 18:30 UTC the previous day. Scheduling is best-effort: a missing extension
-- must not fail the migration.
DO $$
BEGIN
  PERFORM cron.unschedule('complete-expired-campaigns')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'complete-expired-campaigns');
  PERFORM cron.schedule(
    'complete-expired-campaigns',
    '30 18 * * *',
    $cron$SELECT public.complete_expired_campaigns();$cron$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron rescheduling skipped: %', SQLERRM;
END;
$$;
