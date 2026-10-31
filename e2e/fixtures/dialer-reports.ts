/**
 * One campaign with a known funnel, for the three reports specs.
 *
 * The fixture is the same shape each spec needs: a campaign, two caller
 * profiles, five assignments (four inside a Preacher's scope, one outside it)
 * and four call logs. The numbers that follow from it are written into the
 * specs so a reader can check the screen against a stated expectation rather
 * than against whatever the database happened to hold.
 *
 * Call logs are inserted through the service role because the reports screens
 * read them through `campaign_progress`; no disposition route is needed here.
 * Cleanup removes assignments before the campaign, because
 * `dialer_assignments.campaign_id` is `ON DELETE RESTRICT`; the logs go with
 * their assignments (`ON DELETE CASCADE`).
 */

import { expect, type APIRequestContext } from "@playwright/test"

import { e2eProgramId, fixtureEmail } from "./roles"
import { createDisposableCampaign, deleteDisposableCampaign } from "./dialer-campaign"
import {
  createCallerAssignment,
  ensureActiveCaller,
  fixtureStaffId,
  serviceRoleClient,
  type AssignmentFixture,
  type CallerFixture,
} from "./dialer-caller"

interface ContactRow {
  id: string
  name: string
  phone: string | null
}

export interface ReportFixture {
  campaignId: string
  campaignName: string
  /** The campaign is ACTIVE, so a report can be read while callers are working it. */
  adminCaller: CallerFixture
  preacherCaller: CallerFixture
  contactNames: {
    inScope: string[]
    outOfScope: string
  }
  cleanup: () => Promise<void>
}

async function scopedContacts(preacherUserId: string, count: number): Promise<ContactRow[]> {
  const { data, error } = await serviceRoleClient()
    .from("contacts")
    .select("id,name,phone")
    .eq("program_id", e2eProgramId())
    .eq("assigned_preacher_id", preacherUserId)
    .order("created_at", { ascending: true })
    .limit(count)

  if (error) {
    throw new Error(`Reading contacts in the Preacher's scope failed: ${error.message}`)
  }

  const contacts = (data ?? []) as ContactRow[]

  if (contacts.length < count) {
    throw new Error(
      `The seed holds ${contacts.length} contacts in the Preacher's scope; the reports fixture needs ${count}.`,
    )
  }

  return contacts
}

async function contactOutsideScope(preacherUserId: string): Promise<ContactRow> {
  const { data, error } = await serviceRoleClient()
    .from("contacts")
    .select("id,name,phone")
    .eq("program_id", e2eProgramId())
    .not("assigned_preacher_id", "is", null)
    .neq("assigned_preacher_id", preacherUserId)
    .order("created_at", { ascending: true })
    .limit(1)

  if (error) {
    throw new Error("Reading a contact outside the Preacher's scope failed: " + error.message)
  }

  const contact = ((data ?? []) as ContactRow[])[0]

  if (!contact) {
    throw new Error("The seed holds no contact assigned to another preacher; the reports fixture needs one.")
  }

  return contact
}

async function insertCallLog(
  assignmentId: string,
  callerId: string,
  phone: string,
  dispositionStatus: string,
  calledAt: string,
): Promise<void> {
  const { error } = await serviceRoleClient()
    .from("dialer_call_logs")
    .insert({
      program_id: e2eProgramId(),
      assignment_id: assignmentId,
      caller_id: callerId,
      dial_phone: phone,
      attempt: 1,
      disposition_status: dispositionStatus,
      called_at: calledAt,
    })

  if (error) {
    throw new Error(`Inserting the reports fixture call log failed: ${error.message}`)
  }
}

/**
 * Build the fixture and start it. If any step fails, the rows created so far
 * are removed before the error is rethrown, so a failed build does not leave a
 * campaign behind for the next run's counts.
 */
export async function buildReportFixture(
  request: APIRequestContext,
  label: string,
): Promise<ReportFixture> {
  let campaignId: string | null = null
  const assignments: AssignmentFixture[] = []
  const callers: CallerFixture[] = []

  try {
    campaignId = await createDisposableCampaign(request, label)

    const started = await request.post(`/api/dialer/admin/campaigns/${campaignId}/transition`, {
      data: { action: "start" },
    })
    expect(started.status(), `starting the reports fixture campaign: ${await started.text()}`).toBe(200)

    const preacherUserId = await fixtureStaffId(fixtureEmail("preacher"))
    const adminCaller = await ensureActiveCaller(fixtureEmail("admin"))
    const preacherCaller = await ensureActiveCaller(fixtureEmail("preacher"))
    callers.push(adminCaller, preacherCaller)

    const inScope = await scopedContacts(preacherUserId, 4)
    const outside = await contactOutsideScope(preacherUserId)

    // Four inside the Preacher's scope, one outside it. The out-of-scope call
    // is CONFIRMED so an Admin's Confirmed count and a Preacher's must differ.
    const rows: Array<{
      contact: ContactRow
      caller: CallerFixture
      status: string | null
      calledAt: string
    }> = [
      { contact: inScope[0]!, caller: adminCaller, status: "CONFIRMED", calledAt: "2026-11-14T09:04:00.000Z" },
      { contact: inScope[1]!, caller: adminCaller, status: "CALL_DID_NOT_CONNECT", calledAt: "2026-11-14T09:12:00.000Z" },
      { contact: inScope[2]!, caller: preacherCaller, status: "WRONG_NUMBER", calledAt: "2026-11-14T09:31:00.000Z" },
      { contact: inScope[3]!, caller: preacherCaller, status: null, calledAt: "" },
      { contact: outside, caller: adminCaller, status: "CONFIRMED", calledAt: "2026-11-14T09:42:00.000Z" },
    ]

    for (const row of rows) {
      const assignment = await createCallerAssignment(campaignId, row.caller.callerId, row.contact.id)
      assignments.push(assignment)

      if (row.status) {
        await insertCallLog(
          assignment.assignmentId,
          row.caller.callerId,
          row.contact.phone ?? "+910000000000",
          row.status,
          row.calledAt,
        )
      }
    }

    const { data: campaign, error: campaignError } = await serviceRoleClient()
      .from("dialer_campaigns")
      .select("name")
      .eq("id", campaignId)
      .single()

    if (campaignError || !campaign) {
      throw new Error(`Reading the reports fixture campaign name failed: ${campaignError?.message ?? "no row"}`)
    }

    return {
      campaignId,
      campaignName: (campaign as { name: string }).name,
      adminCaller,
      preacherCaller,
      contactNames: {
        inScope: inScope.slice(0, 3).map((contact) => contact.name),
        outOfScope: outside.name,
      },
      cleanup: async () => {
        for (const assignment of assignments) {
          await assignment.cleanup()
        }

        for (const caller of callers) {
          await caller.cleanup()
        }

        if (campaignId) {
          await deleteDisposableCampaign(campaignId)
        }
      },
    }
  } catch (error) {
    for (const assignment of assignments) {
      await assignment.cleanup().catch(() => undefined)
    }

    for (const caller of callers) {
      await caller.cleanup().catch(() => undefined)
    }

    if (campaignId) {
      await deleteDisposableCampaign(campaignId).catch(() => undefined)
    }

    throw error
  }
}
