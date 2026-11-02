/**
 * A disposable programme slice for the dashboard specs.
 *
 * The seed holds contacts collected today and no campaigns, so every number a
 * dashboard spec asserts about a *cohort* would depend on unrelated seed
 * changes. The fixture owns a tag-prefixed set instead: two ACTIVE campaigns
 * (one with two linked sessions, one with none), eight contacts covering every
 * pipeline stage and focus segment, and the attendance that makes the
 * invitation arithmetic real.
 *
 * Writes go through the service role against the loopback stack. Cleanup uses
 * the local SQL endpoint for the dialer rows, which hold no DELETE grant, and
 * removes attendance before its sessions because the FK has no cascade.
 */

import type { APIRequestContext } from "@playwright/test"
import type { SupabaseClient } from "@supabase/supabase-js"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "./auth-users"
import { createDisposableCampaign, deleteDisposableCampaign } from "./dialer-campaign"
import { ensureActiveCaller, serviceRoleClient, type CallerFixture } from "./dialer-caller"
import { e2eProgramId, fixtureEmail } from "./roles"
import {
  addDays,
  programDateToday,
  readFixtureLocations,
  readFixtureStaff,
  type FixtureLocation,
  type FixtureStaff,
} from "./sessions"

function localSqlEndpoint(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot clean up a dashboard fixture: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
        "Run `pnpm supabase:env` to write the local credentials into apps/folk/.env.local.",
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(`Refusing a dashboard fixture against a non-local Supabase URL: ${supabaseUrl}`)
  }

  return { url: supabaseUrl.replace(/\/+$/, ""), serviceRoleKey }
}

async function runLocalSql(query: string): Promise<void> {
  const { url, serviceRoleKey } = localSqlEndpoint()
  const response = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`Dashboard fixture SQL failed: ${response.status} ${response.statusText}`)
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuid(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Refusing to interpolate a non-UUID into SQL: ${value}`)
  }

  return value
}

export interface DashboardContactNames {
  confirmedAttended: string
  confirmedAbsent: string
  calledNotReached: string
  readyToInvite: string
  organic: string
  newUntouched: string
  fading: string
  committed: string
}

export interface DashboardFixture {
  tag: string
  preacher: FixtureStaff
  admin: FixtureStaff
  location: FixtureLocation
  campaignId: string
  campaignName: string
  unlinkedCampaignId: string
  unlinkedCampaignName: string
  contactNames: DashboardContactNames
  contactIds: Record<keyof DashboardContactNames, string>
  sessionIds: string[]
  /** Today's programme day at the moment the fixture was built. */
  today: string
  cleanup: () => Promise<void>
}

function sessionIso(date: string, hour = 10): string {
  return `${date}T${String(hour).padStart(2, "0")}:00:00+05:30`
}

async function insertSession(
  client: SupabaseClient,
  input: {
    name: string
    sessionDate: string
    preacherId: string
    createdBy: string
    locationId: string
    campaignId: string | null
  },
): Promise<string> {
  const { data, error } = await client
    .from("sessions")
    .insert({
      program_id: e2eProgramId(),
      name: input.name,
      session_date: input.sessionDate,
      preacher_id: input.preacherId,
      location_id: input.locationId,
      campaign_id: input.campaignId,
      public_attendance_enabled: true,
      attendance_opens_at: sessionIso(input.sessionDate, 10),
      attendance_closes_at: sessionIso(input.sessionDate, 11),
      duration_minutes: 60,
      created_by: input.createdBy,
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Creating the dashboard fixture session failed: ${error?.message ?? "no row"}`)
  }

  return (data as { id: string }).id
}

async function insertContact(
  client: SupabaseClient,
  input: {
    name: string
    phone: string
    preacherId: string
    locationId: string
    initialContact: string
  },
): Promise<string> {
  const { data, error } = await client
    .from("contacts")
    .insert({
      program_id: e2eProgramId(),
      name: input.name,
      phone: input.phone,
      location_ids: [input.locationId],
      assigned_preacher_id: input.preacherId,
      collected_by_id: input.preacherId,
      initial_contact: input.initialContact,
      source: "e2e-dashboard",
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Creating the dashboard fixture contact failed: ${error?.message ?? "no row"}`)
  }

  return (data as { id: string }).id
}

async function insertAssignment(
  client: SupabaseClient,
  input: { campaignId: string; callerId: string; contactId: string },
): Promise<string> {
  const { data, error } = await client
    .from("dialer_assignments")
    .insert({
      program_id: e2eProgramId(),
      campaign_id: input.campaignId,
      caller_id: input.callerId,
      contact_id: input.contactId,
      status: "PENDING",
      sort_order: 0,
      assigned_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Creating the dashboard fixture assignment failed: ${error?.message ?? "no row"}`)
  }

  return (data as { id: string }).id
}

async function insertLog(
  client: SupabaseClient,
  input: {
    assignmentId: string
    callerId: string
    phone: string
    dispositionStatus: string
    calledAt: string
  },
): Promise<void> {
  const { error } = await client.from("dialer_call_logs").insert({
    program_id: e2eProgramId(),
    assignment_id: input.assignmentId,
    caller_id: input.callerId,
    dial_phone: input.phone,
    attempt: 1,
    disposition_status: input.dispositionStatus,
    called_at: input.calledAt,
  })

  if (error) {
    throw new Error(`Creating the dashboard fixture call log failed: ${error.message}`)
  }
}

async function insertAttendance(
  client: SupabaseClient,
  input: { sessionId: string; contactId: string; name: string; phone: string },
): Promise<void> {
  const { error } = await client.from("attendance").insert({
    program_id: e2eProgramId(),
    session_id: input.sessionId,
    contact_id: input.contactId,
    name: input.name,
    phone: input.phone,
  })

  if (error) {
    throw new Error(`Creating the dashboard fixture attendance failed: ${error.message}`)
  }
}

/** Make a fixture campaign ACTIVE without driving the lifecycle UI. */
async function activateCampaign(client: SupabaseClient, campaignId: string): Promise<void> {
  const { error } = await client
    .from("dialer_campaigns")
    .update({ status: "ACTIVE" })
    .eq("id", campaignId)
    .eq("program_id", e2eProgramId())

  if (error) {
    throw new Error(`Activating the dashboard fixture campaign failed: ${error.message}`)
  }
}

export async function buildDashboardFixture(request: APIRequestContext): Promise<DashboardFixture> {
  const tag = Date.now().toString(36)
  const client = serviceRoleClient()
  const program = e2eProgramId()
  const preacher = await readFixtureStaff(client, "preacher")
  const admin = await readFixtureStaff(client, "admin")
  const locations = await readFixtureLocations(client)
  const location =
    locations.find((entry) => preacher.locationIds.includes(entry.id)) ?? locations[0]

  if (!location) {
    throw new Error("The seed holds no location; the dashboard fixture needs one.")
  }

  const today = programDateToday()
  const created = {
    campaignIds: [] as string[],
    sessionIds: [] as string[],
    contactIds: [] as string[],
  }
  let caller: CallerFixture | null = null

  const cleanup = async () => {
    // Attendance first: it references both a session and a contact with no
    // cascade. Assignments before contacts and campaigns; logs cascade with an
    // assignment.
    if (created.sessionIds.length > 0) {
      await client.from("attendance").delete().in("session_id", created.sessionIds)
    }

    for (const campaignId of created.campaignIds) {
      await runLocalSql(
        `DELETE FROM public.dialer_assignments WHERE campaign_id = '${uuid(campaignId)}'`,
      )
    }

    if (created.sessionIds.length > 0) {
      await client.from("sessions").delete().in("id", created.sessionIds)
    }

    if (created.contactIds.length > 0) {
      await client.from("contacts").delete().in("id", created.contactIds)
    }

    for (const campaignId of created.campaignIds) {
      await deleteDisposableCampaign(campaignId)
    }

    await caller?.cleanup()
  }

  try {
    caller = await ensureActiveCaller(fixtureEmail("preacher"))

    const campaignName = `ZDash ${tag} linked`
    const campaignId = await createDisposableCampaign(request, `dashboard-linked-${tag}`)
    created.campaignIds.push(campaignId)
    await activateCampaign(client, campaignId)
    // The route names the campaign with its own prefix; use the fixture's own
    // label so a spec can find it by name.
    await client
      .from("dialer_campaigns")
      .update({ name: campaignName })
      .eq("id", campaignId)
      .eq("program_id", program)

    const unlinkedCampaignName = `ZDash ${tag} unlinked`
    const unlinkedCampaignId = await createDisposableCampaign(request, `dashboard-unlinked-${tag}`)
    created.campaignIds.push(unlinkedCampaignId)
    await activateCampaign(client, unlinkedCampaignId)
    await client
      .from("dialer_campaigns")
      .update({ name: unlinkedCampaignName })
      .eq("id", unlinkedCampaignId)
      .eq("program_id", program)

    const linkedSessionA = await insertSession(client, {
      name: `ZDash ${tag} linked session A`,
      sessionDate: addDays(today, -10),
      preacherId: preacher.id,
      createdBy: preacher.id,
      locationId: location.id,
      campaignId,
    })
    const linkedSessionB = await insertSession(client, {
      name: `ZDash ${tag} linked session B`,
      sessionDate: addDays(today, -3),
      preacherId: preacher.id,
      createdBy: preacher.id,
      locationId: location.id,
      campaignId,
    })
    const oldSessionA = await insertSession(client, {
      name: `ZDash ${tag} old session A`,
      sessionDate: addDays(today, -90),
      preacherId: preacher.id,
      createdBy: preacher.id,
      locationId: location.id,
      campaignId: null,
    })
    const oldSessionB = await insertSession(client, {
      name: `ZDash ${tag} old session B`,
      sessionDate: addDays(today, -80),
      preacherId: preacher.id,
      createdBy: preacher.id,
      locationId: location.id,
      campaignId: null,
    })
    created.sessionIds.push(linkedSessionA, linkedSessionB, oldSessionA, oldSessionB)

    const names: DashboardContactNames = {
      confirmedAttended: `ZDash ${tag} Confirmed Attended`,
      confirmedAbsent: `ZDash ${tag} Confirmed Absent`,
      calledNotReached: `ZDash ${tag} Called Not Reached`,
      readyToInvite: `ZDash ${tag} Ready To Invite`,
      organic: `ZDash ${tag} Organic`,
      newUntouched: `ZDash ${tag} New Untouched`,
      fading: `ZDash ${tag} Fading`,
      committed: `ZDash ${tag} Committed`,
    }

    const phoneBase = String(Date.now()).slice(-8)
    const phoneKeys = Object.keys(names) as Array<keyof DashboardContactNames>
    const phones = Object.fromEntries(
      phoneKeys.map((key, index) => [key, `9${phoneBase}${index}`]),
    ) as Record<keyof DashboardContactNames, string>

    const initialRecent = addDays(today, -20)
    const ids = {} as Record<keyof DashboardContactNames, string>
    for (const key of phoneKeys) {
      const initialContact =
        key === "newUntouched" ? addDays(today, -30) : key === "fading" || key === "committed" ? addDays(today, -200) : initialRecent
      ids[key] = await insertContact(client, {
        name: names[key],
        phone: phones[key],
        preacherId: preacher.id,
        locationId: location.id,
        initialContact,
      })
      created.contactIds.push(ids[key])
    }

    const assignmentIds = {
      confirmedAttended: await insertAssignment(client, {
        campaignId,
        callerId: caller.callerId,
        contactId: ids.confirmedAttended,
      }),
      confirmedAbsent: await insertAssignment(client, {
        campaignId,
        callerId: caller.callerId,
        contactId: ids.confirmedAbsent,
      }),
      calledNotReached: await insertAssignment(client, {
        campaignId: unlinkedCampaignId,
        callerId: caller.callerId,
        contactId: ids.calledNotReached,
      }),
      readyToInvite: await insertAssignment(client, {
        campaignId: unlinkedCampaignId,
        callerId: caller.callerId,
        contactId: ids.readyToInvite,
      }),
    }

    await insertLog(client, {
      assignmentId: assignmentIds.confirmedAttended,
      callerId: caller.callerId,
      phone: phones.confirmedAttended,
      dispositionStatus: "CONFIRMED",
      calledAt: `${addDays(today, -15)}T10:00:00+05:30`,
    })
    await insertLog(client, {
      assignmentId: assignmentIds.confirmedAbsent,
      callerId: caller.callerId,
      phone: phones.confirmedAbsent,
      dispositionStatus: "CONFIRMED",
      calledAt: `${addDays(today, -9)}T10:00:00+05:30`,
    })
    await insertLog(client, {
      assignmentId: assignmentIds.calledNotReached,
      callerId: caller.callerId,
      phone: phones.calledNotReached,
      dispositionStatus: "CALL_DID_NOT_CONNECT",
      calledAt: `${addDays(today, -8)}T10:00:00+05:30`,
    })
    await insertLog(client, {
      assignmentId: assignmentIds.readyToInvite,
      callerId: caller.callerId,
      phone: phones.readyToInvite,
      dispositionStatus: "MAY_COME",
      calledAt: `${addDays(today, -7)}T10:00:00+05:30`,
    })

    await insertAttendance(client, {
      sessionId: linkedSessionA,
      contactId: ids.confirmedAttended,
      name: names.confirmedAttended,
      phone: phones.confirmedAttended,
    })
    await insertAttendance(client, {
      sessionId: linkedSessionA,
      contactId: ids.organic,
      name: names.organic,
      phone: phones.organic,
    })
    await insertAttendance(client, {
      sessionId: oldSessionA,
      contactId: ids.fading,
      name: names.fading,
      phone: phones.fading,
    })
    await insertAttendance(client, {
      sessionId: oldSessionB,
      contactId: ids.fading,
      name: names.fading,
      phone: phones.fading,
    })
    await insertAttendance(client, {
      sessionId: oldSessionA,
      contactId: ids.committed,
      name: names.committed,
      phone: phones.committed,
    })
    await insertAttendance(client, {
      sessionId: linkedSessionA,
      contactId: ids.committed,
      name: names.committed,
      phone: phones.committed,
    })
    await insertAttendance(client, {
      sessionId: linkedSessionB,
      contactId: ids.committed,
      name: names.committed,
      phone: phones.committed,
    })

    return {
      tag,
      preacher,
      admin,
      location,
      campaignId,
      campaignName,
      unlinkedCampaignId,
      unlinkedCampaignName,
      contactNames: names,
      contactIds: ids,
      sessionIds: created.sessionIds,
      today,
      cleanup,
    }
  } catch (error) {
    await cleanup().catch(() => undefined)
    throw error
  }
}

/**
 * Remove the fixture in a `finally`. A spec that leaves rows behind would make
 * the next run's focus counts include names from a dead run.
 */
export async function cleanupDashboardFixture(fixture: DashboardFixture | null): Promise<void> {
  if (!fixture) {
    return
  }

  await fixture.cleanup()
}
