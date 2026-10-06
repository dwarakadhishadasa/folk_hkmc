import "server-only"

import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import {
  MANAGE_CONTACT_PATCH_KEYS,
  type ManageContactPatch,
  type ManageContactPatchKey,
} from "@/components/manage/manage-types"
import {
  MANAGE_PHOTO_CONTENT_TYPES,
  MANAGE_PHOTO_MAX_BYTES,
  createManageContactPhotoUrl,
  updateManageContact,
  uploadManageContactPhoto,
} from "@/lib/supabase/manage"

/**
 * Route-handler factories shared by `apps/folk` and `apps/gita-life`.
 *
 * Both apps resolve the same program through the same server-only data layer,
 * so the validation contract lives here once and each per-app route file stays
 * an import-and-delegate. `never` list: this module never reads env directly —
 * Supabase configuration is resolved by `lib/supabase/env.ts`.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT_LENGTH = 2000
const MAX_PHONE_LENGTH = 20
const MAX_NAME_LENGTH = 120

const ALLOWED_PATCH_KEYS = new Set<string>(MANAGE_CONTACT_PATCH_KEYS)
const ALLOWED_PHOTO_CONTENT_TYPES = new Set<string>(MANAGE_PHOTO_CONTENT_TYPES)

/** Local 400 so validation short-circuits before any Supabase call. */
class AuthzBadRequest extends Error {
  status = 400

  constructor(message: string) {
    super(message)
    this.name = "AuthzBadRequest"
  }
}

function badRequestResponse(error: unknown): Response | null {
  if (error instanceof AuthzBadRequest) {
    return Response.json({ error: error.message }, { status: error.status })
  }

  return null
}

function normalizeContactId(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : ""
  return UUID_PATTERN.test(candidate) ? candidate : null
}

function boundedText(value: unknown, field: string, maxLength: number): string | null {
  if (typeof value !== "string") {
    throw new AuthzBadRequest(`${field} must be a string.`)
  }

  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    throw new AuthzBadRequest(`${field} must be ${maxLength} characters or fewer.`)
  }

  return trimmed || null
}

/**
 * `initial_contact` and `date_of_birth` are read as ISO dates, so an
 * unparseable value makes the row disappear from the Contact Generation chart
 * with no error anywhere. Blank is allowed, and anything after a leading
 * `YYYY-MM-DD` is allowed, so contacts already holding a full ISO timestamp
 * still round-trip.
 */
function optionalIsoDate(value: unknown, field: string): string | null {
  const date = boundedText(value, field, 40)

  if (date === null) {
    return null
  }

  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
    throw new AuthzBadRequest(`${field} must be blank or start with YYYY-MM-DD.`)
  }

  return date
}

/**
 * `file.type` is client-supplied, so it only narrows what we accept. The leading
 * bytes have to agree with it before anything is written to the private bucket,
 * otherwise arbitrary content could later be served through a signed URL.
 */
function matchesImageSignature(contentType: string, bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) {
    return false
  }

  const view = new Uint8Array(bytes)

  if (contentType === "image/jpeg") {
    return view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff
  }

  if (contentType === "image/png") {
    return (
      view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47
    )
  }

  if (contentType === "image/webp") {
    return (
      view[0] === 0x52 &&
      view[1] === 0x49 &&
      view[2] === 0x46 &&
      view[3] === 0x46 &&
      view[8] === 0x57 &&
      view[9] === 0x45 &&
      view[10] === 0x42 &&
      view[11] === 0x50
    )
  }

  return false
}

function parseContactPatch(payload: unknown): ManageContactPatch {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AuthzBadRequest("A JSON object body is required.")
  }

  const record = payload as Record<string, unknown>
  const patch: ManageContactPatch = {}

  for (const [key, value] of Object.entries(record)) {
    if (key === "contactId") {
      continue
    }

    if (!ALLOWED_PATCH_KEYS.has(key)) {
      throw new AuthzBadRequest(`Field "${key}" cannot be edited here.`)
    }

    switch (key as ManageContactPatchKey) {
      case "name": {
        const name = boundedText(value, "Name", MAX_NAME_LENGTH)
        if (!name) {
          throw new AuthzBadRequest("Name is required.")
        }
        patch.name = name
        break
      }
      case "phone": {
        const phone = boundedText(value, "Phone", MAX_PHONE_LENGTH)
        if (!phone) {
          throw new AuthzBadRequest("Phone is required.")
        }
        patch.phone = phone
        break
      }
      case "college":
        patch.college = boundedText(value, "College", MAX_TEXT_LENGTH)
        break
      case "company":
        patch.company = boundedText(value, "Company", MAX_TEXT_LENGTH)
        break
      case "rounds":
        patch.rounds = boundedText(value, "Rounds", MAX_TEXT_LENGTH)
        break
      case "notes":
        patch.notes = boundedText(value, "Notes", MAX_TEXT_LENGTH)
        break
      case "initialContact":
        patch.initialContact = optionalIsoDate(value, "Initial Contact")
        break
      case "dateOfBirth":
        patch.dateOfBirth = optionalIsoDate(value, "Date of Birth")
        break
      case "isFavorite": {
        if (typeof value !== "boolean") {
          throw new AuthzBadRequest("Favorite must be a boolean.")
        }
        patch.isFavorite = value
        break
      }
      case "booksRead": {
        if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
          throw new AuthzBadRequest("Books Read must be an array of strings.")
        }
        const booksRead = value.map((item) => String(item).trim()).filter(Boolean)
        if (booksRead.length > 20) {
          throw new AuthzBadRequest("Books Read must have 20 entries or fewer.")
        }
        patch.booksRead = booksRead
        break
      }
      case "locationIds": {
        if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
          throw new AuthzBadRequest("Location must be an array of location ids.")
        }
        const locationIds = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
        if (locationIds.length > 50) {
          throw new AuthzBadRequest("Location must have 50 ids or fewer.")
        }
        patch.locationIds = locationIds
        break
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new AuthzBadRequest("No editable fields were supplied.")
  }

  return patch
}

export async function handleManageContactUpdate(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      throw new AuthzBadRequest("A JSON object body is required.")
    }

    const contactId = normalizeContactId((payload as { contactId?: unknown } | null)?.contactId)
    if (!contactId) {
      throw new AuthzBadRequest("contactId must be a UUID.")
    }

    const patch = parseContactPatch(payload)
    const contact = await updateManageContact({ staff, contactId, patch })

    return Response.json({ contact }, { status: 200 })
  } catch (error) {
    return badRequestResponse(error) ?? authzErrorResponse(error)
  }
}

export async function handleManageContactPhotoUpload(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new AuthzBadRequest("A multipart form body is required.")
    }

    const contactId = normalizeContactId(form.get("contactId"))
    if (!contactId) {
      throw new AuthzBadRequest("contactId must be a UUID.")
    }

    const file = form.get("file")
    if (!(file instanceof File)) {
      throw new AuthzBadRequest("A photo file is required.")
    }

    if (!ALLOWED_PHOTO_CONTENT_TYPES.has(file.type)) {
      throw new AuthzBadRequest("Photos must be JPEG, PNG or WebP images.")
    }

    if (file.size <= 0) {
      throw new AuthzBadRequest("The photo is empty.")
    }

    if (file.size > MANAGE_PHOTO_MAX_BYTES) {
      throw new AuthzBadRequest("Photos must be 5 MB or smaller.")
    }

    const bytes = await file.arrayBuffer()

    if (!matchesImageSignature(file.type, bytes)) {
      throw new AuthzBadRequest("The uploaded file is not a valid JPEG, PNG or WebP image.")
    }

    const photo = await uploadManageContactPhoto({
      staff,
      contactId,
      contentType: file.type,
      bytes,
    })

    return Response.json({ photoPath: photo.photoPath }, { status: 201 })
  } catch (error) {
    return badRequestResponse(error) ?? authzErrorResponse(error)
  }
}

export async function handleManageContactPhotoUrl(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])

    const contactId = normalizeContactId(new URL(request.url).searchParams.get("contactId"))
    if (!contactId) {
      throw new AuthzBadRequest("contactId must be a UUID.")
    }

    const photo = await createManageContactPhotoUrl({ staff, contactId })
    return Response.json({ url: photo.url }, { status: 200 })
  } catch (error) {
    return badRequestResponse(error) ?? authzErrorResponse(error)
  }
}
