/**
 * Fixtures shared by the caller-session specs.
 *
 * Every row is created for one spec and removed in the same run. The service
 * role holds INSERT/UPDATE but no DELETE on the dialer tables, so cleanup goes
 * through the local stack's SQL endpoint after the target is asserted loopback
 * by `e2e/fixtures/dialer-caller.ts`.
 */

import { expect, type APIRequestContext, type Page } from "@playwright/test"

import { createDisposableCampaign } from "../fixtures/dialer-campaign"
import { ensureActiveCaller, firstContactId, serviceRoleClient } from "../fixtures/dialer-caller"
import { readEnvValue } from "../fixtures/auth-users"
import { e2eProgramId, fixtureEmail } from "../fixtures/roles"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requireUuid(value: string, what: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Refusing to interpolate a non-UUID ${what} into SQL: ${value}`)
  }

  return value
}

export async function runLocalSql(query: string): Promise<void> {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing; run `pnpm supabase:env`.")
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/pg/query`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`The caller-session fixture cleanup failed: ${response.status} ${response.statusText}`)
  }
}

/**
 * Navigate to a caller session and wait for hydration.
 *
 * The screen's chips and buttons exist in the server-rendered HTML before React
 * attaches handlers, so a click can land on an inert node on a slow dev server.
 * `CallerSession` sets `data-caller-session` on the body from its mount effect;
 * this is the one signal a spec can wait on without a sleep.
 */
export async function gotoCallerSession(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForFunction(() => document.body.dataset.callerSession === "ready")
}

export interface ContactFixture {
  id: string
  name: string
  phone: string
}

export interface AssignmentFixtureRow {
  id: string
  contact_id: string
  caller_id: string
  sort_order: number
}

export interface ActiveCampaignOptions {
  gapDuration?: number
  maxAttempts?: number
  start?: boolean
}

/** A campaign this run owns, ACTIVE by default, plus its cleanup. */
export async function createCallerCampaign(
  request: APIRequestContext,
  label: string,
  options: ActiveCampaignOptions = {},
): Promise<{ campaignId: string; cleanup: () => Promise<void> }> {
  const campaignId = await createDisposableCampaign(request, label)

  const gapDuration = options.gapDuration ?? 20
  const maxAttempts = options.maxAttempts ?? 3

  if (!Number.isInteger(gapDuration) || gapDuration < 5 || gapDuration > 300) {
    throw new Error(`The fixture gap duration must be a whole number between 5 and 300: ${gapDuration}`)
  }

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error(`The fixture attempt cap must be a whole number between 1 and 10: ${maxAttempts}`)
  }

  // The shared campaign fixture creates with the product defaults; a caller
  // spec that needs a short gap or a low cap updates the row before it starts.
  await runLocalSql(
    `UPDATE public.dialer_campaigns
     SET gap_duration = ${gapDuration}, max_attempts = ${maxAttempts}
     WHERE id = '${requireUuid(campaignId, "campaign id")}'`,
  )

  if (options.start !== false) {
    const started = await request.post(`/api/dialer/admin/campaigns/${campaignId}/transition`, {
      data: { action: "start" },
    })
    expect(started.status(), `starting ${label}: ${await started.text()}`).toBe(200)
  }

  return {
    campaignId,
    cleanup: async () => {
      await cleanupCampaign(campaignId)
    },
  }
}

/** Remove every row this run could have created under the campaign, in FK order. */
export async function cleanupCampaign(campaignId: string): Promise<void> {
  const id = requireUuid(campaignId, "campaign id")
  await runLocalSql(
    `DELETE FROM public.dialer_survey_responses WHERE call_log_id IN (
       SELECT id FROM public.dialer_call_logs WHERE assignment_id IN (
         SELECT id FROM public.dialer_assignments WHERE campaign_id = '${id}'
       )
     );
     DELETE FROM public.dialer_call_logs WHERE assignment_id IN (
       SELECT id FROM public.dialer_assignments WHERE campaign_id = '${id}'
     );
     DELETE FROM public.dialer_assignments WHERE campaign_id = '${id}';
     DELETE FROM public.dialer_survey_options WHERE question_id IN (
       SELECT id FROM public.dialer_survey_questions WHERE campaign_id = '${id}'
     );
     DELETE FROM public.dialer_survey_questions WHERE campaign_id = '${id}';
     DELETE FROM public.dialer_campaigns WHERE id = '${id}';`,
  )
}

/** Seeded contacts in the program, ordered by name for deterministic fixtures. */
export async function seededContacts(count: number): Promise<ContactFixture[]> {
  const { data, error } = await serviceRoleClient()
    .from("contacts")
    .select("id,name,phone")
    .eq("program_id", e2eProgramId())
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .limit(count)

  if (error || !data || data.length < count) {
    throw new Error(
      `Reading ${count} contacts for the caller session failed: ${error?.message ?? `only ${data?.length ?? 0} rows`}`,
    )
  }

  return data as ContactFixture[]
}

/** One contact, for the paths that only need a real parent row. */
export async function oneContact(): Promise<ContactFixture> {
  const id = await firstContactId()
  const { data, error } = await serviceRoleClient()
    .from("contacts")
    .select("id,name,phone")
    .eq("id", id)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`Reading contact ${id} failed: ${error?.message ?? "no row"}`)
  }

  return data as ContactFixture
}

/** Insert PENDING assignments for one caller, in the order given. */
export async function assignContacts(
  campaignId: string,
  callerId: string,
  contacts: ContactFixture[],
): Promise<AssignmentFixtureRow[]> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_assignments")
    .insert(
      contacts.map((contact, index) => ({
        program_id: e2eProgramId(),
        campaign_id: campaignId,
        caller_id: callerId,
        contact_id: contact.id,
        status: "PENDING",
        sort_order: index,
        assigned_at: new Date().toISOString(),
      })),
    )
    .select("id,contact_id,caller_id,sort_order")

  if (error || !data) {
    throw new Error(`Creating the caller assignments failed: ${error?.message ?? "no rows"}`)
  }

  return data as AssignmentFixtureRow[]
}

/** One call log, for the history panel and the receipt/summary fixtures. */
export async function createCallLog(input: {
  assignmentId: string
  callerId: string
  phone: string
  attempt: number
  dispositionStatus: string
  notes?: string | null
  calledAt?: string
}): Promise<{ id: string }> {
  const calledAt = input.calledAt ?? new Date().toISOString()
  const { data, error } = await serviceRoleClient()
    .from("dialer_call_logs")
    .insert({
      program_id: e2eProgramId(),
      assignment_id: input.assignmentId,
      caller_id: input.callerId,
      dial_phone: input.phone,
      attempt: input.attempt,
      disposition_status: input.dispositionStatus,
      follow_up_notes: input.notes ?? null,
      called_at: calledAt,
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Creating the call log failed: ${error?.message ?? "no row"}`)
  }

  return data as { id: string }
}

/** A campaign survey question with its options, created via the service role. */
export async function createQuestion(input: {
  campaignId: string
  title: string
  type: "TEXT" | "DROPDOWN" | "RADIO" | "MULTI_SELECT" | "DATE"
  required?: boolean
  sortOrder?: number
  options?: Array<{ label: string; value: string }>
}): Promise<{ questionId: string }> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_survey_questions")
    .insert({
      program_id: e2eProgramId(),
      campaign_id: input.campaignId,
      question_title: input.title,
      question_type: input.type,
      sort_order: input.sortOrder ?? 0,
      is_required: input.required ?? true,
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Creating the survey question failed: ${error?.message ?? "no row"}`)
  }

  const questionId = (data as { id: string }).id
  const options = input.options ?? []

  if (options.length > 0) {
    const { error: optionError } = await serviceRoleClient()
      .from("dialer_survey_options")
      .insert(
        options.map((option, index) => ({
          program_id: e2eProgramId(),
          question_id: questionId,
          label: option.label,
          value: option.value,
          sort_order: index,
        })),
      )

    if (optionError) {
      throw new Error(`Creating the survey options failed: ${optionError.message}`)
    }
  }

  return { questionId }
}

/** The active caller profile for a role, with the cleanup that restores it. */
export async function callerForRole(role: "admin" | "preacher" | "volunteer" | "assistant") {
  return ensureActiveCaller(fixtureEmail(role))
}

/** Read one call log by assignment, newest first, for a save assertion. */
export async function latestCallLog(assignmentId: string): Promise<{
  id: string
  attempt: number
  disposition_status: string
  status_group: string
  follow_up_notes: string | null
} | null> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_call_logs")
    .select("id,attempt,disposition_status,status_group,follow_up_notes")
    .eq("assignment_id", assignmentId)
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Reading the call log failed: ${error.message}`)
  }

  return (data as {
    id: string
    attempt: number
    disposition_status: string
    status_group: string
    follow_up_notes: string | null
  } | null) ?? null
}

/** The survey rows stored for a call log, for the transactional-save assertion. */
export async function surveyResponses(callLogId: string): Promise<
  Array<{ question_id: string; answer: string | null; answer_values: string[] | null }>
> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_survey_responses")
    .select("question_id,answer,answer_values")
    .eq("call_log_id", callLogId)

  if (error) {
    throw new Error(`Reading the survey responses failed: ${error.message}`)
  }

  return (data as Array<{ question_id: string; answer: string | null; answer_values: string[] | null }>) ?? []
}

/** The assignment row's status, for a skip or recall assertion. */
export async function setAssignmentStatus(assignmentId: string, status: "PENDING" | "COMPLETED" | "SKIPPED"): Promise<void> {
  const { error } = await serviceRoleClient()
    .from("dialer_assignments")
    .update({ status })
    .eq("id", assignmentId)

  if (error) {
    throw new Error(`Updating the assignment status failed: ${error.message}`)
  }
}

/** The assignment row's status, for a skip or recall assertion. */
export async function assignmentStatus(assignmentId: string): Promise<string | null> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_assignments")
    .select("status")
    .eq("id", assignmentId)
    .maybeSingle()

  if (error) {
    throw new Error(`Reading the assignment status failed: ${error.message}`)
  }

  return (data as { status: string } | null)?.status ?? null
}
