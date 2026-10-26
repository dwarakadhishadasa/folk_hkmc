/**
 * A dialer campaign this run owns, for the routes that need a real parent row.
 *
 * `dialer_campaigns` rows are only ever created by tests — the seed has none —
 * and AD-12 grants no `DELETE` to any role, so `service_role` holds SELECT,
 * INSERT and UPDATE through PostgREST and cannot remove one. The local SQL
 * endpoint runs as the table owner and is the only cleanup path; it is reached
 * only after the target is asserted loopback, so a fixture can never clean up
 * against the hosted project while the assertions ran against the local stack.
 *
 * The row is created through the admin route the campaign surface itself uses,
 * so the fixture exercises the same write path rather than inserting behind it.
 */

import { expect, type APIRequestContext } from "@playwright/test"
import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "./auth-users"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Names carry this run's stamp, so a leftover is distinguishable from a live fixture. */
const RUN_PREFIX = `e2e-dialer-fixture-${Date.now().toString(36)}`

function resolveLocalServiceRole(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot clean up a dialer fixture campaign: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
        "Run `pnpm supabase:env` to write the local credentials into apps/folk/.env.local, or export them.",
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to delete a dialer fixture campaign at "${supabaseUrl}": it is not a loopback address, so the ` +
        "cleanup would run against the hosted database instead of the local stack.",
    )
  }

  return { url: supabaseUrl, serviceRoleKey }
}

async function runLocalSql(query: string): Promise<void> {
  const { url, serviceRoleKey } = resolveLocalServiceRole()
  const response = await fetch(`${url.replace(/\/+$/, "")}/pg/query`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`The dialer fixture cleanup failed: ${response.status} ${response.statusText}`)
  }
}

/** A DRAFT campaign created through `POST /api/dialer/admin/campaigns`. */
export async function createDisposableCampaign(request: APIRequestContext, label: string): Promise<string> {
  const response = await request.post("/api/dialer/admin/campaigns", {
    data: {
      name: `${RUN_PREFIX} ${label}`,
      description: "Created by the dialer route sweep; removed in the same run.",
      campaignDate: "2026-11-14",
      gapDuration: 20,
      maxAttempts: 3,
    },
  })

  expect(
    response.status(),
    `the fixture campaign could not be created: ${await response.text()}`,
  ).toBe(201)

  const body = (await response.json()) as { campaign?: { id?: string } }
  const campaignId = body.campaign?.id

  if (!campaignId) {
    throw new Error("The campaign create route answered 201 without a campaign id.")
  }

  return campaignId
}

/**
 * Remove the fixture campaign. `dialer_survey_questions.campaign_id` is
 * `ON DELETE RESTRICT`, so a sweep that created a question would make this
 * throw; this sweep never does, and a rejection is louder than a silent leftover.
 */
export async function deleteDisposableCampaign(campaignId: string): Promise<void> {
  if (!UUID_PATTERN.test(campaignId)) {
    throw new Error(`Refusing to delete a dialer campaign with a non-UUID id: ${campaignId}`)
  }

  await runLocalSql(`DELETE FROM public.dialer_campaigns WHERE id = '${campaignId}'`)
}
