import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import {
  getContactAttendanceSummary,
  getSessionAttendees,
  isSessionId,
} from "@/lib/sessions/data"
import { sessionsScope } from "@/lib/sessions/scope"

export const dynamic = "force-dynamic"

/**
 * One attendee's full contact record for the session detail modal.
 *
 * The id must belong to an attendee of a session the caller can see, not just
 * to any contact in the programme: the modal is opened from an attendee row,
 * and a crafted id should not turn into a general contact reader.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string; contactId: string }> },
) {
  try {
    const staff = await getStaffContext({ refresh: true })
    requireRole(staff, ["Admin", "Preacher", "Assistant"])

    const { sessionId, contactId } = await params
    if (!isSessionId(sessionId) || !isSessionId(contactId)) {
      return Response.json({ error: "Contact not found." }, { status: 404 })
    }

    const scope = await sessionsScope(staff)
    const attendees = await getSessionAttendees(scope, sessionId)
    const attendee = attendees.find((entry) => entry.contactId === contactId)

    if (!attendee) {
      return Response.json({ error: "Contact not found." }, { status: 404 })
    }

    const summary = await getContactAttendanceSummary(scope, contactId)
    if (!summary) {
      return Response.json({ error: "Contact not found." }, { status: 404 })
    }

    return Response.json({ name: attendee.name, summary })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
