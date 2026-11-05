import "server-only"

import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { CONTACT_COMMENT_ROLES } from "@/lib/staff-roles"
import { CONTACT_COMMENT_MAX_LENGTH } from "@/components/manage/manage-comment-types"
import {
  createManageContactComment,
  deleteManageContactComment,
  listManageContactComments,
  setManageCommentReaction,
  updateManageContactComment,
} from "@/lib/supabase/contact-comments"

/**
 * Route handlers for record comments.
 *
 * Every handler opens the same way — `getStaffContext()` then
 * `requireRole(staff, CONTACT_COMMENT_ROLES)` — because the role gate is the
 * feature's whole access rule, not a wrapper around a wider surface. The role
 * gate admits Admin, Preacher and Assistant; the *patch* gate lives one layer
 * down, in `lib/supabase/contact-comments.ts`, because scope depends on the
 * contact rather than on the caller alone.
 *
 * `apps/folk` and `apps/gita-life` each delegate here so the validation
 * contract exists once.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Local 400 so a malformed body never reaches the database. */
class CommentBadRequest extends Error {
  status = 400
}

function badRequestResponse(error: unknown): Response | null {
  if (error instanceof CommentBadRequest) {
    return Response.json({ error: error.message }, { status: error.status })
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeUuid(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : ""
  return UUID_PATTERN.test(candidate) ? candidate : null
}

/** The comment body, trimmed and bounded. The table's CHECK is the backstop. */
function parseBody(value: unknown): string {
  if (typeof value !== "string") {
    throw new CommentBadRequest("body must be a string.")
  }

  const trimmed = value.trim()

  if (trimmed.length === 0) {
    throw new CommentBadRequest("A comment needs some text.")
  }

  if (trimmed.length > CONTACT_COMMENT_MAX_LENGTH) {
    throw new CommentBadRequest(`A comment may be at most ${CONTACT_COMMENT_MAX_LENGTH} characters.`)
  }

  return trimmed
}

function contactIdFromQuery(request: Request): string {
  const value = new URL(request.url).searchParams.get("contactId")
  const contactId = normalizeUuid(value)

  if (!contactId) {
    throw new CommentBadRequest("contactId must be a UUID.")
  }

  return contactId
}

export async function handleContactCommentList(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, CONTACT_COMMENT_ROLES)

    const contactId = contactIdFromQuery(request)
    const result = await listManageContactComments({ staff, contactId })

    return Response.json(result, { status: 200 })
  } catch (error) {
    return badRequestResponse(error) ?? authzErrorResponse(error)
  }
}

export async function handleContactCommentCreate(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, CONTACT_COMMENT_ROLES)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      throw new CommentBadRequest("A JSON object body is required.")
    }

    const record = asRecord(payload)
    const contactId = normalizeUuid(record?.contactId)

    if (!contactId) {
      throw new CommentBadRequest("contactId must be a UUID.")
    }

    const body = parseBody(record?.body)
    const cellFieldId = record?.cellFieldId === undefined ? null : record?.cellFieldId

    if (cellFieldId !== null && typeof cellFieldId !== "string") {
      throw new CommentBadRequest("cellFieldId must be a string or null.")
    }

    const rootCommentId = normalizeUuid(record?.rootCommentId)

    if (record?.rootCommentId !== undefined && record?.rootCommentId !== null && !rootCommentId) {
      throw new CommentBadRequest("rootCommentId must be a UUID.")
    }

    const comment = await createManageContactComment({
      staff,
      contactId,
      body,
      cellFieldId: cellFieldId as string | null,
      rootCommentId,
    })

    return Response.json({ comment }, { status: 201 })
  } catch (error) {
    return badRequestResponse(error) ?? authzErrorResponse(error)
  }
}

export async function handleContactCommentUpdate(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, CONTACT_COMMENT_ROLES)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      throw new CommentBadRequest("A JSON object body is required.")
    }

    const record = asRecord(payload)
    const contactId = normalizeUuid(record?.contactId)
    const commentId = normalizeUuid(record?.commentId)

    if (!contactId) {
      throw new CommentBadRequest("contactId must be a UUID.")
    }

    if (!commentId) {
      throw new CommentBadRequest("commentId must be a UUID.")
    }

    const comment = await updateManageContactComment({
      staff,
      contactId,
      commentId,
      body: parseBody(record?.body),
    })

    return Response.json({ comment }, { status: 200 })
  } catch (error) {
    return badRequestResponse(error) ?? authzErrorResponse(error)
  }
}

/**
 * Adds or removes one reaction. `active` is the desired state, so a retried
 * request converges rather than toggling twice.
 */
export async function handleCommentReactionSet(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, CONTACT_COMMENT_ROLES)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      throw new CommentBadRequest("A JSON object body is required.")
    }

    const record = asRecord(payload)
    const contactId = normalizeUuid(record?.contactId)
    const commentId = normalizeUuid(record?.commentId)

    if (!contactId) {
      throw new CommentBadRequest("contactId must be a UUID.")
    }

    if (!commentId) {
      throw new CommentBadRequest("commentId must be a UUID.")
    }

    if (typeof record?.emoji !== "string") {
      throw new CommentBadRequest("emoji must be a string.")
    }

    if (typeof record?.active !== "boolean") {
      throw new CommentBadRequest("active must be a boolean.")
    }

    await setManageCommentReaction({
      staff,
      contactId,
      commentId,
      emoji: record.emoji,
      active: record.active,
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return badRequestResponse(error) ?? authzErrorResponse(error)
  }
}

export async function handleContactCommentDelete(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, CONTACT_COMMENT_ROLES)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      throw new CommentBadRequest("A JSON object body is required.")
    }

    const record = asRecord(payload)
    const contactId = normalizeUuid(record?.contactId)
    const commentId = normalizeUuid(record?.commentId)

    if (!contactId) {
      throw new CommentBadRequest("contactId must be a UUID.")
    }

    if (!commentId) {
      throw new CommentBadRequest("commentId must be a UUID.")
    }

    await deleteManageContactComment({ staff, contactId, commentId })

    return new Response(null, { status: 204 })
  } catch (error) {
    return badRequestResponse(error) ?? authzErrorResponse(error)
  }
}
