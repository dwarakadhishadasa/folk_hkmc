import { AuthzError, authzErrorResponse, getStaffContext, requireRole, type StaffContext } from "@/lib/authz"
import { getCampaign } from "@/lib/dialer/campaigns"
import {
  createSession,
  findLocationById,
  findStaffUserById,
  updateSessionAttendanceUrl,
} from "@/lib/supabase/data"
import { listVisibleSessions } from "@/lib/sessions/data"
import { sessionsScope } from "@/lib/sessions/scope"
import { programDay } from "@/lib/program-day"

export const dynamic = "force-dynamic"

interface SessionPayload {
  name?: string
  locationId?: string
  campaignId?: string | null
  durationMinutes?: string | number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const DEFAULT_SESSION_DURATION_MINUTES = 15
const MIN_SESSION_DURATION_MINUTES = 1
const MAX_SESSION_DURATION_MINUTES = 24 * 60
const MINUTE_MS = 60 * 1000

function requireSiteUrl(): URL {
  const value = process.env.NEXT_PUBLIC_SITE_URL
  if (!value) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required to generate attendance links.")
  }

  return new URL(value)
}

function parseDurationMinutes(value: unknown): { durationMinutes?: number; error?: string } {
  if (value === undefined || value === null || value === "") {
    return { durationMinutes: DEFAULT_SESSION_DURATION_MINUTES }
  }

  const durationMinutes = typeof value === "number" ? value : Number(String(value).trim())
  if (!Number.isInteger(durationMinutes)) {
    return { error: "Duration must be a whole number of minutes." }
  }

  if (durationMinutes < MIN_SESSION_DURATION_MINUTES || durationMinutes > MAX_SESSION_DURATION_MINUTES) {
    return {
      error: `Duration must be between ${MIN_SESSION_DURATION_MINUTES} and ${MAX_SESSION_DURATION_MINUTES} minutes.`,
    }
  }

  return { durationMinutes }
}

/**
 * The optional Campaign link. Absent, null and empty all mean `No campaign`.
 * A provided id must exist in this programme, be readable through the caller's
 * campaign scope, and not be CANCELLED; anything else is a named 4xx rather
 * than a foreign-key 500 from the insert.
 */
async function parseCampaignId(
  staff: StaffContext,
  value: unknown,
): Promise<{ campaignId: string | null; response?: Response }> {
  if (value === undefined || value === null || value === "") {
    return { campaignId: null }
  }

  if (typeof value !== "string") {
    return {
      campaignId: null,
      response: Response.json({ error: "Selected campaign is invalid.", code: "invalid_campaign" }, { status: 400 }),
    }
  }

  const campaignId = value.trim()
  if (!campaignId) {
    return { campaignId: null }
  }

  if (!UUID_PATTERN.test(campaignId)) {
    return {
      campaignId: null,
      response: Response.json({ error: "Selected campaign does not exist.", code: "campaign_not_found" }, { status: 400 }),
    }
  }

  let campaign
  try {
    campaign = await getCampaign(staff, campaignId)
  } catch (error) {
    if (error instanceof AuthzError) {
      // A create body's campaign is input, not a resource the caller asked to
      // read: a foreign or missing id is a named 400, never a 500 and never a
      // 404 that would suggest the session was the missing thing.
      const status = error.status === 404 ? 400 : error.status
      return {
        campaignId: null,
        response: Response.json({ error: error.message, code: error.code }, { status }),
      }
    }

    throw error
  }

  if (campaign.status === "CANCELLED") {
    return {
      campaignId: null,
      response: Response.json(
        { error: "A cancelled campaign cannot invite people to a session.", code: "campaign_cancelled" },
        { status: 400 },
      ),
    }
  }

  return { campaignId: campaign.id }
}

export async function GET() {
  try {
    const staff = await getStaffContext({ refresh: true })
    requireRole(staff, ["Admin", "Preacher", "Assistant"])

    const scope = await sessionsScope(staff)
    const sessions = await listVisibleSessions(scope)

    return Response.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        name: session.name,
        sessionDate: session.sessionDate || null,
        locationIds: session.locationIds,
        preacherIds: session.preacherIds,
        publicAttendanceEnabled: session.publicAttendanceEnabled,
        attendanceOpensAt: session.attendanceOpensAt || null,
        attendanceClosesAt: session.attendanceClosesAt || null,
        attendanceUrl: session.attendanceUrl || null,
      })),
    })
  } catch (error) {
    return authzErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext({ refresh: true })
    requireRole(staff, ["Admin", "Preacher", "Assistant"])

    const payload = (await request.json()) as SessionPayload
    const name = payload.name?.trim()
    const locationId = payload.locationId?.trim()
    const duration = parseDurationMinutes(payload.durationMinutes)

    if (!name || !locationId) {
      return Response.json({ error: "Session name and location are required." }, { status: 400 })
    }

    if (duration.error || !duration.durationMinutes) {
      return Response.json({ error: duration.error }, { status: 400 })
    }

    const location = await findLocationById(locationId)
    if (!location) {
      return Response.json({ error: "Selected location does not exist." }, { status: 400 })
    }

    const campaign = await parseCampaignId(staff, payload.campaignId)
    if (campaign.response) {
      return campaign.response
    }

    let owningPreacherId = staff.userId
    let owningPreacherLocationIds: string[] = staff.locationIds

    if (staff.role === "Assistant") {
      if (!staff.assignedPreacherUserId) {
        return Response.json(
          { error: "Assistant sessions require an assigned Preacher." },
          { status: 400 },
        )
      }

      const assignedPreacher = await findStaffUserById(staff.assignedPreacherUserId)
      if (!assignedPreacher || assignedPreacher.role !== "Preacher" || assignedPreacher.status !== "Active") {
        return Response.json({ error: "Assigned Preacher is not an active Preacher." }, { status: 403 })
      }

      owningPreacherId = assignedPreacher.id
      owningPreacherLocationIds = assignedPreacher.locationIds
    }

    if (!owningPreacherLocationIds.includes(locationId)) {
      return Response.json({ error: "This location is outside your allowed scope." }, { status: 403 })
    }

    const siteUrl = requireSiteUrl()
    const startsAt = new Date()
    const closesAt = new Date(startsAt.getTime() + duration.durationMinutes * MINUTE_MS)
    const session = await createSession({
      name,
      sessionDate: programDay(startsAt),
      locationId,
      preacherUserId: owningPreacherId,
      campaignId: campaign.campaignId,
      durationMinutes: duration.durationMinutes,
      publicAttendanceEnabled: true,
      attendanceOpensAt: startsAt.toISOString(),
      attendanceClosesAt: closesAt.toISOString(),
      createdBy: staff.userId,
    })

    const attendanceUrl = new URL("/attend", siteUrl)
    attendanceUrl.searchParams.set("session", session.id)

    const updated = await updateSessionAttendanceUrl(session.id, attendanceUrl.toString())
    return Response.json({ session: updated }, { status: 201 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
