import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Closes the campaigns whose end date has arrived.
 *
 * The UPDATE itself lives in `public.complete_expired_campaigns()` — see
 * `20261102040000_auto_complete_campaigns.sql` — because pg_cron and every read
 * path must close campaigns the same way. Calling it before a read makes the
 * result independent of whether the scheduler ran.
 *
 * A failure is logged, not thrown: the read that triggered the sweep is still
 * valid, its statuses are at worst one sweep stale, and the next read retries.
 * Turning a stale status into a failed page would be the worse trade.
 */
export async function completeExpiredCampaigns(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc("complete_expired_campaigns")

  if (error) {
    console.warn("[dialer] the campaign expiry sweep did not run:", error.message)
  }
}
