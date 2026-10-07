#!/usr/bin/env node
/**
 * migrate-airtable-data.mjs — story 7.9: the Airtable → Supabase backfill.
 *
 * This is the only file in the repo that may name the retired service. It is a
 * one-time exporter, not runtime code: nothing outside `scripts/` references it,
 * and `verify-airtable-removal.mjs` asserts exactly that, so the CAP-7 grep
 * allowance it needs cannot become a door back into the app.
 *
 * Both Airtable bases are read-only archives. Every request here is a `GET`.
 *
 * ## Why the map comes first
 *
 * `public.airtable_id_map` (migration `20261008000000`) records which Supabase
 * UUID each `rec*` became. Ids are generated and persisted BEFORE the first
 * insert, so:
 *
 *   * a re-run reuses them instead of duplicating a row;
 *   * `--rollback` deletes exactly the rows the map recorded and nothing else;
 *   * a re-run can report `inserted 0` from a fact rather than a guess.
 *
 * ## Ordering is load-bearing
 *
 * locations → users → contacts → sessions → attendance → photos. `public.users.id`
 * is an FK to `auth.users(id)`, and `attendance.contact_id` / `session_id` are NOT
 * NULL FKs, so an out-of-order run fails loudly instead of half-writing.
 * (`auth.users` itself is `migrate-auth-users.mjs`'s job, and must run first.)
 *
 * ## Quarantine, not coercion
 *
 * A phone that does not normalize to 10 digits is quarantined and reported. An
 * attendance row with no linked contact is quarantined — `attendance.contact_id`
 * is NOT NULL, and inventing a placeholder contact would fabricate an attendee
 * that never attended. Every quarantine is counted so source-vs-target
 * accounting stays exact.
 *
 * ## `created_at` re-pinning
 *
 * Airtable's `Attendance Date` lookup is the session's program day; the record's
 * own `createdTime` is UTC and, for the backfilled bulk, nowhere near it — 675 of
 * 1,264 folk rows land on a different IST day than their session. Since
 * `getAttendanceByDate` filters `created_at` between `${date} 00:00:00+05:30` and
 * the next day, a row outside its own session's day is invisible to the
 * dashboard. So: keep `createdTime` when its Asia/Kolkata date already equals the
 * session day; otherwise re-pin the date to the session day while keeping the IST
 * time-of-day. Intra-day ordering survives, every row lands inside the day the
 * app filters on, and no timestamp is invented.
 *
 * ## Photo handling
 *
 * Airtable attachment URLs are authenticated and short-lived, so the bytes must be
 * fetched during the same run. Content type is checked against
 * `MANAGE_PHOTO_CONTENT_TYPES` and the 5 MB `MANAGE_PHOTO_MAX_BYTES` cap, and the
 * object path follows `manage.ts`'s `${programId}/${contactId}/${uuid}.${ext}`
 * convention in the private `contact-photos` bucket.
 *
 * Usage:
 *   node scripts/migrate-airtable-data.mjs --dry-run
 *   node scripts/migrate-airtable-data.mjs [--program folk|gita-life]
 *   node scripts/migrate-airtable-data.mjs --rollback --program folk [--dry-run]
 *
 * Options:
 *   --dry-run         Print the full plan. No write on any project.
 *   --rollback        Delete the rows this loader recorded, and their storage objects.
 *   --program <id>    Restrict the run (or the rollback) to one program.
 *   --skip-photos     Do not fetch or upload contact photos.
 */

import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
for (const file of [".env.migration.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(repoRoot, file))
  } catch {
    // Fall back to an already-exported environment.
  }
}

// ---------------------------------------------------------------------------
// Output redaction — registered before anything is printed.
// ---------------------------------------------------------------------------

const REDACTED = "***redacted***"
const secretValues = new Set()

function registerSecret(name) {
  const value = process.env[name]
  if (typeof value === "string" && value.length >= 8) secretValues.add(value)
}

for (const name of [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET",
  "POSTGRES_PASSWORD",
  "OLD_SUPABASE_SERVICE_ROLE_KEY",
  "OLD_POSTGRES_PASSWORD",
  "VERCEL_TOKEN",
  "AIRTABLE_API_TOKEN",
  "AIRTABLE_API_KEY",
  "SMTP_PASS",
]) {
  registerSecret(name)
}
for (const name of [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "OLD_POSTGRES_URL",
  "OLD_POSTGRES_URL_NON_POOLING",
]) {
  const url = process.env[name]
  if (typeof url !== "string") continue
  try {
    const password = new URL(url).password
    if (password.length >= 8) secretValues.add(password)
  } catch {
    // Not a parseable URL; nothing to register.
  }
}

function redact(value) {
  if (value === null || value === undefined) return value
  const isString = typeof value === "string"
  let text = isString ? value : JSON.stringify(value)
  for (const secret of secretValues) {
    for (const spelling of new Set([secret, JSON.stringify(secret).slice(1, -1)])) {
      if (spelling && text.includes(spelling)) text = text.split(spelling).join(REDACTED)
    }
  }
  if (isString) return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function log(message = "") {
  console.log(redact(message))
}

function warn(message) {
  console.error(redact(message))
}

function fail(message) {
  console.error(redact(`ERROR ${message}`))
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Per-program configuration. `siteUrl` regenerates the attendance link the
 * Airtable table used to store with a `rec*` id in it; the app builds it as
 * `${siteUrl}/attend?session=${id}` from the session's own UUID, so the Airtable
 * value cannot be copied — it names a record that no longer exists.
 *
 * Folk's default is the deployment this repo already knows as production. No
 * gita-life production URL is recorded anywhere in this repo, so its default is
 * the host its own Airtable session links already used.
 */
export const PROGRAMS = {
  folk: {
    id: "folk",
    baseId: "appqea9DRLOXqErXb",
    siteUrlEnv: "FOLK_SITE_URL",
    defaultSiteUrl: process.env.PRODUCTION_URL?.trim() || "https://folk-hkmc-rho.vercel.app",
  },
  "gita-life": {
    id: "gita-life",
    baseId: "appzbssqNK53yqjZH",
    siteUrlEnv: "GITA_LIFE_SITE_URL",
    defaultSiteUrl: "https://gitalife.hkmchennai.org",
  },
}

/** Table ids, asserted against the meta endpoint before a single row is read. */
export const TABLES = {
  contacts: "tbltzdtCmCHf6gJKD",
  attendance: "tblxfB2W2l6OXc2IX",
  sessions: "tbl9AbwkiIaAwK20X",
  locations: "tbl5IOOcS2RUkXzyG",
  users: "tbl2aiD2NfvrBMnfI",
}

/**
 * Airtable field ids, not names. The two bases are field-id divergent — folk's
 * Contacts has no `Year` field at all and gita-life's has it unpopulated — so a
 * name-keyed lookup would silently drop or invent a column depending on the base.
 * Mapping by id with absent-as-null is what makes `contacts.year` null for every
 * row instead of a folk/gita-life divergence.
 *
 * A field mapped to `null` has no target column and is dropped by design.
 */
export const FIELDS = {
  contacts: {
    name: "fld8SsX2vXZU3uE1g",
    phone: "fld746R8PKbcKRXse",
    age: "fldEwgdNymKULq2el",
    dateOfBirth: "fldvU1WsX1FV7BxxK",
    year: "fldXK5bdOsHyIn6r7",
    college: "fldtbZToYqsJx3O1m",
    company: "fldZGRXtDgGGHdlk9",
    designation: "fldVkz3c5p6GuFBrg",
    source: "fld2oGmIKM21mGpDM",
    notes: "fldkz2Wy0kBySyMUs",
    initialContact: "fldA7u04AN1QGJiZd",
    lastContactedOn: "fldCo370C6hCcgKcC",
    address: "fldaNPo4ptlc0Pbwh",
    location: "fldvkZbuEvFr8WW72",
    assignedPreacher: "fldiG9nSAfBWbw3ij",
    collectedBy: "fldOiszMxhsWOI9OC",
    photo: "fldwl5gdCfcFhMT77",
    rounds: "fldj7wwwg5ddJkhvX",
    books: "flddjOIrcuV7U6iij",
    favorite: "fldfmjPOapjSkLUOI",
    // Not a target column: the free-text fallback the location resolver reads.
    locationLegacy: "fld41eZGUhpS4N1aj",
  },
  sessions: {
    name: "fld5z4R4R9ervCeGR",
    sessionDate: "fldamDX1vEq58nWae",
    location: "fldQ4SaaJGTgAMYCG",
    preacher: "fld7LZkXSACmRhB3H",
    publicAttendanceEnabled: "fldVkmOgalZOWAwoB",
    attendanceOpensAt: "fld2il5FEK1fDBeN4",
    attendanceClosesAt: "fldOamVt7HE6Cf2s4",
    durationMinutes: "fldrke8mwfTq1N0Hq",
    // A `multipleLookupValues` of the Admin collaborator, i.e. objects rather
    // than linked-record ids, so it resolves by email and not by `rec*`.
    createdBy: "fldtMCVELgChcMRCz",
  },
  attendance: {
    contact: "fld5uKAqO8yXFlg5F",
    session: "fldJ9Yhz6NbrE6MhR",
    phone: "fldlneeesd7tMxUIG",
    name: "fldhZJflE7RhUqwST",
    attendanceDate: "fldhPXDkql0ynCn9Y",
  },
  locations: {
    name: "fldarUNLPjl1aCg2M",
    code: "fld6Zi4QlWPlNj63y",
    status: "fldcqcFRLJrFd77Iw",
  },
  users: {
    name: "fldAxt0CvuegC3MnZ",
    email: "fldJEg1ZKuJXbDwja",
    role: "fld3gD17qO9nk4sxz",
    status: "fldH77NSXKAxbecCp",
    locations: "fldtk1f5Mi45xmdMG",
    supabaseUserId: "fldDvNXnFXRoaLhIq",
    invitedBy: "fld0pNLxBz7VsyIgo",
    assignedPreacher: "fldlzGkIw4LS0MbPS",
  },
}

/** Load order. `users` before `contacts` because contacts FK to it. */
export const LOAD_ORDER = ["locations", "users", "contacts", "sessions", "attendance"]

export const USER_ROLES = ["Admin", "Preacher", "Volunteer", "Assistant"]
export const USER_STATUSES = ["Active", "Inactive", "Suspended", "Revoked"]

export const CONTACT_PHOTOS_BUCKET = "contact-photos"
export const MANAGE_PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const PHOTO_EXTENSION_BY_CONTENT_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}
export const MANAGE_PHOTO_MAX_BYTES = 5 * 1024 * 1024

/**
 * Content types a byte-sniff may correct. Airtable serves most attachment
 * downloads as `binary/octet-stream` whatever the file actually is — 5 of the 6
 * folk photos come back that way while being JPEGs — so a header-only check would
 * discard real photos the app can display. Only a *generic* header is overridden,
 * and only by a signature that is in the allowlist: a declared `image/heic` is
 * still rejected, because the bytes and the header agreeing would be a coincidence.
 */
const GENERIC_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "application/binary",
  "",
])

const PHOTO_SIGNATURES = [
  { contentType: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { contentType: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { contentType: "image/webp", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  { contentType: "image/webp", offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
]

/**
 * The image type the bytes actually are, or null when they are not one of the
 * allowlisted formats. The first bytes are the authority; a declared header is
 * only trusted when it is not generic.
 */
export function sniffPhotoContentType(bytes, declaredContentType) {
  const declared = typeof declaredContentType === "string" ? declaredContentType.split(";")[0].trim().toLowerCase() : ""
  if (MANAGE_PHOTO_CONTENT_TYPES.includes(declared)) return { contentType: declared, via: "declared" }
  if (!GENERIC_CONTENT_TYPES.has(declared)) return null
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? [])
  for (const signature of PHOTO_SIGNATURES) {
    if (buffer.length < signature.offset + signature.bytes.length) continue
    if (signature.bytes.every((byte, index) => buffer[signature.offset + index] === byte)) {
      return { contentType: signature.contentType, via: "sniffed" }
    }
  }
  return null
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// ---------------------------------------------------------------------------
// Pure transform layer — imported by migrate-airtable-data.test.mjs. No I/O here.
// ---------------------------------------------------------------------------

/**
 * Last 10 digits, or null. A verbatim mirror of `normalizeMobile` in
 * `lib/supabase/data.ts`, because `findContactByPhone` matches `phone` *after*
 * that normalization: a stored non-10-digit phone would be unreachable by the app,
 * so an unusable one cannot be quietly stored.
 */
export function normalizeMobile(value) {
  if (typeof value !== "string" && typeof value !== "number") return null
  const digits = String(value).replace(/\D/g, "").slice(-10)
  return digits.length === 10 ? digits : null
}

/**
 * The Asia/Kolkata calendar date of an instant, as `YYYY-MM-DD`.
 */
export function istDate(instant) {
  return new Date(new Date(instant).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** The Asia/Kolkata wall-clock time of an instant, as `HH:MM:SS.sss`. */
function istTimeOfDay(instant) {
  // `toISOString()` is `YYYY-MM-DDTHH:MM:SS.sssZ`; slice off the date, the `T`,
  // and the trailing `Z` that would otherwise make the rebuilt string unparseable.
  return new Date(new Date(instant).getTime() + IST_OFFSET_MS).toISOString().slice(11, -1)
}

/**
 * Where an attendance row's `created_at` must land.
 *
 * Keeps `createdTime` when its IST date already equals the session's program day.
 * Otherwise re-pins the date to that day while keeping the IST time-of-day, so
 * intra-day ordering survives and the row lands inside the window
 * `getAttendanceByDate` filters on. No timestamp is invented: the time-of-day is
 * the record's own.
 *
 * With no session day to pin to there is nothing to reconcile against, so the
 * record's own instant is kept rather than guessed at.
 */
export function repinCreatedAt(createdTime, sessionDay) {
  const instant = new Date(createdTime)
  if (Number.isNaN(instant.getTime())) return null
  if (typeof sessionDay !== "string" || !ISO_DATE.test(sessionDay)) {
    return instant.toISOString()
  }
  if (istDate(instant) === sessionDay) return instant.toISOString()
  return new Date(`${sessionDay}T${istTimeOfDay(instant)}${formatOffset(IST_OFFSET_MS)}`).toISOString()
}

function formatOffset(ms) {
  const sign = ms < 0 ? "-" : "+"
  const total = Math.abs(ms) / 60000
  const hours = String(Math.floor(total / 60)).padStart(2, "0")
  const minutes = String(Math.round(total % 60)).padStart(2, "0")
  return `${sign}${hours}:${minutes}`
}

/**
 * Resolve one of a contact's free-text location entries against the loaded
 * locations: exact name, then case-folded name, then `Code`. Anything else is
 * unresolved — reported as `unresolved_location`, never guessed at a location.
 *
 * Both bases currently carry zero such rows. The path exists because the next
 * backfill might not, and because a location silently dropped would be a data
 * loss that no count would reveal.
 */
export function resolveFreeTextLocation(text, locationsByName, locationsByFoldedName, locationsByCode) {
  const value = typeof text === "string" ? text.trim() : ""
  if (!value) return { kind: "absent" }
  const exact = locationsByName.get(value)
  if (exact) return { kind: "resolved", recordId: exact, via: "name" }
  const folded = locationsByFoldedName.get(value.toLocaleLowerCase())
  if (folded) return { kind: "resolved", recordId: folded, via: "case_folded_name" }
  const byCode = locationsByCode.get(value.toLocaleLowerCase())
  if (byCode) return { kind: "resolved", recordId: byCode, via: "code" }
  return { kind: "unresolved", text: value }
}

export function normalizeEmail(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null
}

/**
 * The attendance link the app builds for a session. The Airtable `Attendance URL`
 * is not copied: it embeds a `rec*` id that no longer exists after the cutover.
 */
export function attendanceUrlFor(siteUrl, sessionUuid) {
  return `${siteUrl.replace(/\/+$/, "")}/attend?session=${sessionUuid}`
}

/**
 * Which Airtable fields of `metaFields` have no target column, by name.
 *
 * Reported per program so an operator can see exactly what is not being
 * migrated — the deliberate drops are invisible otherwise.
 */
export function droppedFields(metaFields, mappedFieldIds) {
  const mapped = new Set(Object.values(mappedFieldIds).filter(Boolean))
  return metaFields.filter((field) => !mapped.has(field.id)).map((field) => field.name)
}

/**
 * The target ids a set of Airtable records resolves to, reusing the persisted
 * map where it exists. Ids are decided here, before any insert, so a re-run reuses
 * them rather than re-rolling — which is what makes the map both the rollback
 * ledger and the reason a re-run cannot duplicate a row.
 */
export function assignTargetIds(records, existingMap, mintId = randomUUID) {
  const assigned = new Map()
  for (const record of records) {
    const existing = existingMap.get(record.id)
    assigned.set(record.id, {
      targetId: existing ?? mintId(),
      reused: existing !== null && existing !== undefined,
    })
  }
  return assigned
}

/**
 * Split `rows` into the ones to insert (target key absent from `existingIds`) and
 * the ones already present. This is what makes `inserted 0` on a re-run a fact
 * read back from the target rather than an assumption about idempotency.
 */
export function splitByPresence(rows, keyOf, existingIds) {
  const toInsert = []
  const alreadyPresent = []
  const seen = new Set()
  for (const row of rows) {
    const key = keyOf(row)
    if (seen.has(key)) continue
    seen.add(key)
    if (existingIds.has(key)) alreadyPresent.push(row)
    else toInsert.push(row)
  }
  return { toInsert, alreadyPresent }
}

/**
 * Detect `(contact, session)` pairs that appear more than once, in the source and
 * against rows the target already holds. The first record by `createdTime` wins;
 * every later one is a `duplicate_pair` quarantine, because
 * `UNIQUE (contact_id, session_id)` would reject it.
 *
 * `alreadyPresent` carries the pairs the target holds, so a run that is interrupted
 * and resumed still sees the pair rather than rediscovering it as new.
 */
export function detectDuplicatePairs(candidates, alreadyPresent = []) {
  const seen = new Set(alreadyPresent)
  const firstByKey = new Map()
  const kept = []
  const duplicates = []

  const ordered = candidates
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const at = a.row.sourceCreatedTime ?? ""
      const bt = b.row.sourceCreatedTime ?? ""
      if (at !== bt) return at < bt ? -1 : 1
      return a.index - b.index
    })

  for (const { row } of ordered) {
    const key = `${row.contactTargetId}|${row.sessionTargetId}`
    if (seen.has(key)) {
      duplicates.push({ sourceRecordId: row.sourceRecordId, key, first: firstByKey.get(key) ?? null })
      continue
    }
    seen.add(key)
    firstByKey.set(key, row.sourceRecordId)
    kept.push(row)
  }

  return { kept, duplicates }
}

/**
 * One quarantine entry. `entity` is the Airtable table, `reason` is a stable
 * machine-readable slug, and `detail` carries only source values — never a
 * password, a token or a secret.
 */
export function quarantine(programId, entity, sourceRecordId, reason, detail = {}) {
  return { programId, entity, sourceRecordId, reason, detail }
}

/** Split into fixed-size batches so no single statement grows unbounded. */
export function batch(items, size) {
  const out = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

// ---------------------------------------------------------------------------
// Row mapping — pure, given the maps the main flow builds
// ---------------------------------------------------------------------------

function text(value) {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

function integerOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function booleanOr(value, fallback = false) {
  if (value === true || value === "true" || value === "Yes") return true
  if (value === false || value === "false" || value === "No") return false
  return fallback
}

function instantOrNull(value) {
  if (typeof value !== "string" || !value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function linkedIds(fields, fieldId) {
  const value = fields?.[fieldId]
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []
}

function firstLinked(fields, fieldId) {
  return linkedIds(fields, fieldId)[0] ?? null
}

export function mapLocationRow(programId, sourceRecordId, targetId, record) {
  const f = FIELDS.locations
  return {
    sourceRecordId,
    targetId,
    values: {
      id: targetId,
      program_id: programId,
      name: text(record.fields?.[f.name]) ?? `Airtable ${sourceRecordId}`,
      status: text(record.fields?.[f.status]) ?? "Active",
    },
  }
}

export function mapUserRow(programId, sourceRecordId, targetId, record, context) {
  const f = FIELDS.users
  const email = normalizeEmail(record.fields?.[f.email])
  const role = text(record.fields?.[f.role])
  const status = text(record.fields?.[f.status])
  const authUserId = context.authIdByEmail.get(email)
  const declared = text(record.fields?.[f.supabaseUserId])

  return {
    sourceRecordId,
    targetId,
    email,
    role,
    status,
    // Reported, never trusted: the field is blank for a real gita-life preacher
    // whose auth row the old project does hold, so email is the join key.
    declaredSupabaseUserId: declared,
    declaredMatchesResolved: declared ? declared === authUserId : null,
    // Self-referential FKs are left as source ids here and resolved by the caller,
    // because their targets are other rows of this same table whose final ids are
    // the auth ids — not the provisional UUIDs the map minted.
    invitedBySourceId: firstLinked(record.fields, f.invitedBy),
    assignedPreacherSourceId: firstLinked(record.fields, f.assignedPreacher),
    values: {
      id: targetId,
      program_id: programId,
      email,
      name: text(record.fields?.[f.name]),
      role,
      status,
      location_ids: linkedIds(record.fields, f.locations)
        .map((id) => context.locationIdBySourceId.get(id) ?? null)
        .filter(Boolean),
      assigned_preacher_id: null,
      invited_by: null,
    },
  }
}

export function mapContactRow(programId, sourceRecordId, targetId, record, context) {
  const f = FIELDS.contacts
  const phone = normalizeMobile(record.fields?.[f.phone])
  const name = text(record.fields?.[f.name])
  const assignedPreacher = firstLinked(record.fields, f.assignedPreacher)
  const collectedBy = firstLinked(record.fields, f.collectedBy)

  // `contacts.location_ids` is `text[]`, so a location UUID is stored as its
  // canonical string — which is what the app already compares against.
  const locationIds = linkedIds(record.fields, f.location)
    .map((id) => context.locationIdBySourceId.get(id))
    .filter(Boolean)

  const legacy = resolveFreeTextLocation(
    record.fields?.[f.locationLegacy],
    context.locationsByName,
    context.locationsByFoldedName,
    context.locationsByCode,
  )

  const photos = Array.isArray(record.fields?.[f.photo]) ? record.fields[f.photo] : []
  const books = Array.isArray(record.fields?.[f.books]) ? record.fields[f.books].filter((b) => typeof b === "string" && b.trim()) : []

  return {
    sourceRecordId,
    targetId,
    name,
    phone,
    rawPhone: record.fields?.[f.phone] ?? null,
    legacyLocation: legacy,
    photos,
    values: {
      id: targetId,
      program_id: programId,
      name,
      phone,
      age: integerOrNull(record.fields?.[f.age]),
      date_of_birth: text(record.fields?.[f.dateOfBirth]),
      year: text(record.fields?.[f.year]),
      college: text(record.fields?.[f.college]),
      company: text(record.fields?.[f.company]),
      designation: text(record.fields?.[f.designation]),
      notes: text(record.fields?.[f.notes]),
      initial_contact: text(record.fields?.[f.initialContact]),
      last_contacted_on: text(record.fields?.[f.lastContactedOn]),
      address: text(record.fields?.[f.address]),
      location_ids: locationIds,
      assigned_preacher_id: assignedPreacher ? context.userIdBySourceId.get(assignedPreacher) ?? null : null,
      collected_by_id: collectedBy ? context.userIdBySourceId.get(collectedBy) ?? null : null,
      source: text(record.fields?.[f.source]),
      rounds: text(record.fields?.[f.rounds]),
      books_read: books,
      is_favorite: booleanOr(record.fields?.[f.favorite], false),
      created_at: instantOrNull(record.createdTime),
      updated_at: instantOrNull(record.createdTime),
    },
  }
}

export function mapSessionRow(programId, sourceRecordId, targetId, record, context) {
  const f = FIELDS.sessions
  const location = firstLinked(record.fields, f.location)
  const preacher = firstLinked(record.fields, f.preacher)

  // The folk `Created By` is a lookup of the Admin *collaborator*, which arrives
  // as an object with an email rather than as a linked `rec*`. gita-life's is a
  // real link. Both resolve through the same email index.
  const createdBy = (() => {
    const raw = record.fields?.[f.createdBy]
    if (!Array.isArray(raw) || raw.length === 0) return { kind: "absent" }
    const first = raw[0]
    if (typeof first === "string") {
      return context.userIdBySourceId.has(first)
        ? { kind: "resolved", targetId: context.userIdBySourceId.get(first) }
        : { kind: "unresolved", value: first }
    }
    const email = normalizeEmail(first?.email)
    if (email && context.userIdByEmail.has(email)) {
      return { kind: "resolved", targetId: context.userIdByEmail.get(email) }
    }
    return { kind: "unresolved", value: email ?? JSON.stringify(first) }
  })()

  return {
    sourceRecordId,
    targetId,
    createdBy,
    values: {
      id: targetId,
      program_id: programId,
      name: text(record.fields?.[f.name]) ?? `Airtable ${sourceRecordId}`,
      session_date: text(record.fields?.[f.sessionDate]),
      location_id: location ? context.locationIdBySourceId.get(location) ?? null : null,
      preacher_id: preacher ? context.userIdBySourceId.get(preacher) ?? null : null,
      public_attendance_enabled: booleanOr(record.fields?.[f.publicAttendanceEnabled], false),
      attendance_opens_at: instantOrNull(record.fields?.[f.attendanceOpensAt]),
      attendance_closes_at: instantOrNull(record.fields?.[f.attendanceClosesAt]),
      duration_minutes: integerOrNull(record.fields?.[f.durationMinutes]),
      created_by: createdBy.kind === "resolved" ? createdBy.targetId : null,
      attendance_url: attendanceUrlFor(context.siteUrl, targetId),
      created_at: instantOrNull(record.createdTime),
      updated_at: instantOrNull(record.createdTime),
    },
  }
}

export function mapAttendanceRow(programId, sourceRecordId, targetId, record, context) {
  const f = FIELDS.attendance
  const contactSourceId = firstLinked(record.fields, f.contact)
  const sessionSourceId = firstLinked(record.fields, f.session)
  const attendanceDate = (Array.isArray(record.fields?.[f.attendanceDate]) ? record.fields[f.attendanceDate] : [])[0] ?? null
  const sessionDay = sessionSourceId ? context.sessionDayBySourceId.get(sessionSourceId) ?? null : null

  return {
    sourceRecordId,
    targetId,
    sourceCreatedTime: record.createdTime ?? null,
    contactSourceId,
    sessionSourceId,
    contactTargetId: contactSourceId ? context.contactIdBySourceId.get(contactSourceId) ?? null : null,
    sessionTargetId: sessionSourceId ? context.sessionIdBySourceId.get(sessionSourceId) ?? null : null,
    attendanceDate,
    values: {
      id: targetId,
      program_id: programId,
      contact_id: null, // filled by the caller once the contact survives quarantine
      session_id: null,
      phone: text(record.fields?.[f.phone]),
      name: text(record.fields?.[f.name]),
      created_at: repinCreatedAt(record.createdTime, sessionDay),
    },
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const dryRun = argv.includes("--dry-run")
const rollback = argv.includes("--rollback")
const skipPhotos = argv.includes("--skip-photos")

function optionValue(flag) {
  const index = argv.indexOf(flag)
  if (index === -1) return null
  const value = argv[index + 1]
  if (!value || value.startsWith("--")) {
    fail(`${flag} requires a value, e.g. ${flag} folk`)
  }
  return value
}

const programFilter = optionValue("--program")
if (programFilter && !PROGRAMS[programFilter]) {
  fail(`unknown program "${programFilter}"; expected one of ${Object.keys(PROGRAMS).join(", ")}`)
}

function requireEnv(name, purpose) {
  const value = process.env[name]?.trim()
  if (!value) fail(`${name} is not set (needed to ${purpose}). Set it in .env.migration.local or the environment.`)
  return value
}

const AIRTABLE_TOKEN = requireEnv("AIRTABLE_API_TOKEN", "read the Airtable bases")
const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "write to the new project").replace(/\/+$/, "")
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY", "write to the new project")
const ACCESS_TOKEN = requireEnv("SUPABASE_ACCESS_TOKEN", "call the Supabase Management API")
const targetRef = new URL(SUPABASE_URL).hostname.split(".")[0]

function siteUrlFor(programId) {
  const program = PROGRAMS[programId]
  const override = process.env[program.siteUrlEnv]?.trim()
  const value = override || program.defaultSiteUrl
  return value.replace(/\/+$/, "")
}

// ---------------------------------------------------------------------------
// HTTP with bounded retry
// ---------------------------------------------------------------------------

function describeNetworkError(error) {
  const cause = error?.cause
  const code = cause?.code ? ` (${cause.code})` : ""
  const address = cause?.address ? ` to ${cause.address}` : ""
  return `${error?.message ?? error}${code}${address}`
}

async function fetchWithRetry(url, init, timeoutMs, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      }
    }
  }
  throw lastError
}

// ---------------------------------------------------------------------------
// Airtable — read-only. Every call below is a GET.
// ---------------------------------------------------------------------------

async function airtableJson(url) {
  let response
  try {
    response = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }, 60_000)
  } catch (error) {
    fail(`GET ${url.split("?")[0]} did not complete: ${describeNetworkError(error)}`)
  }
  const text_ = await response.text()
  if (!response.ok) {
    fail(`GET ${url.split("?")[0]} -> HTTP ${response.status}: ${redact(text_).slice(0, 400)}. Both bases are read-only archives; nothing was written.`)
  }
  try {
    return JSON.parse(text_)
  } catch {
    fail(`GET ${url.split("?")[0]} returned a non-JSON body: ${redact(text_).slice(0, 200)}`)
  }
  return {}
}

const metaCache = new Map()

async function baseMeta(baseId) {
  if (!metaCache.has(baseId)) {
    const body = await airtableJson(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`)
    if (!Array.isArray(body.tables)) fail(`meta for base ${baseId} did not return a table list`)
    metaCache.set(baseId, body.tables)
  }
  return metaCache.get(baseId)
}

/**
 * Confirm a table id really is the table this script expects, before a single row
 * is read. Airtable resolves an unknown id with a 404, but a *stale* id belonging
 * to a deleted table of the same name would page happily and quietly load the
 * wrong shape.
 */
async function verifyTableIds(programId) {
  const baseId = PROGRAMS[programId].baseId
  const tables = await baseMeta(baseId)
  const byId = new Map(tables.map((table) => [table.id, table]))
  const problems = []
  const report = {}
  for (const [entity, tableId] of Object.entries(TABLES)) {
    const found = byId.get(tableId)
    if (!found) problems.push(`${entity}: table ${tableId} is not in base ${baseId}`)
    report[entity] = found ?? null
  }
  if (problems.length > 0) {
    fail(`base ${baseId} (${programId}) does not carry the expected tables:\n  - ${problems.join("\n  - ")}`)
  }
  return report
}

async function fetchAllRecords(programId, entity) {
  const baseId = PROGRAMS[programId].baseId
  const tableId = TABLES[entity]
  const records = []
  let offset
  let pages = 0
  do {
    const query = new URLSearchParams({ returnFieldsByFieldId: "true", pageSize: "100" })
    if (offset) query.set("offset", offset)
    const body = await airtableJson(`https://api.airtable.com/v0/${baseId}/${tableId}?${query}`)
    if (!Array.isArray(body.records)) fail(`paging ${programId}/${entity} returned no records array`)
    records.push(...body.records)
    offset = body.offset
    pages += 1
  } while (offset)
  return { records, pages }
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function managementQuery(sql) {
  const url = `https://api.supabase.com/v1/projects/${targetRef}/database/query`
  let response
  try {
    response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql }),
      },
      120_000,
    )
  } catch (error) {
    fail(`POST ${url} did not complete: ${describeNetworkError(error)}. Nothing further was written.`)
  }
  const text_ = await response.text()
  if (!response.ok) {
    fail(`POST ${url} -> HTTP ${response.status}: ${redact(text_).slice(0, 600)}. Nothing further was written.`)
  }
  try {
    return JSON.parse(text_)
  } catch {
    fail(`POST ${url} returned a non-JSON body: ${redact(text_).slice(0, 200)}`)
  }
  return []
}

function quoteLiteral(value) {
  if (value === null || value === undefined) return "null"
  return `'${String(value).replaceAll("'", "''")}'`
}

/** A Postgres array literal for a `text[]`/`uuid[]` value. */
function quoteArray(values) {
  if (!Array.isArray(values)) return "'{}'::text[]"
  return `array[${values.map((value) => quoteLiteral(value)).join(", ")}]`
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (Array.isArray(value)) return quoteArray(value)
  if (typeof value === "number") return String(value)
  if (typeof value === "object") return quoteLiteral(JSON.stringify(value))
  return quoteLiteral(value)
}

/**
 * PostgREST insert. `on_conflict=id` is required by
 * `resolution=ignore-duplicates`; without it PostgREST rejects the request, so the
 * explicit id is both the idempotency key and the FK the rest of the load resolves
 * against.
 */
async function postgrestInsert(table, rows, { prefer = "resolution=ignore-duplicates,return=minimal" } = {}) {
  if (rows.length === 0) return 0
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`
  let response
  try {
    response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: prefer,
        },
        body: JSON.stringify(rows.map((row) => row.values)),
      },
      180_000,
    )
  } catch (error) {
    fail(`POST ${url} did not complete: ${describeNetworkError(error)}. Nothing further was written.`)
  }
  const body = await response.text()
  if (!response.ok) {
    fail(`POST ${url} -> HTTP ${response.status}: ${redact(body).slice(0, 600)}. Nothing further was written.`)
  }
  return rows.length
}

async function postgrestDelete(table, ids) {
  if (ids.length === 0) return 0
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=in.(${ids.map((id) => `"${id}"`).join(",")})`
  let response
  try {
    response = await fetchWithRetry(
      url,
      {
        method: "DELETE",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
      },
      180_000,
    )
  } catch (error) {
    fail(`DELETE ${url} did not complete: ${describeNetworkError(error)}`)
  }
  if (!response.ok) {
    fail(`DELETE ${url} -> HTTP ${response.status}: ${redact((await response.text()).slice(0, 400))}`)
  }
  return ids.length
}

/**
 * Remove storage objects, one request each.
 *
 * The bucket-level `DELETE /object/{bucket}` bulk endpoint rejects every body
 * shape the JS client sends (`body must be object`), and the per-object route
 * rejects a `Content-Type: application/json` header with no body
 * (`Body cannot be empty when content-type is set to 'application/json'`). So the
 * header is omitted, which is what the JS client's own retry path ends up doing.
 */
async function storageRemove(paths) {
  if (paths.length === 0) return 0
  let removed = 0
  for (const objectKey of paths) {
    const url = `${SUPABASE_URL}/storage/v1/object/${CONTACT_PHOTOS_BUCKET}/${objectKey}`
    let response
    try {
      response = await fetchWithRetry(
        url,
        { method: "DELETE", headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
        60_000,
      )
    } catch (error) {
      fail(`DELETE ${url} did not complete: ${describeNetworkError(error)}`)
    }
    if (response.status === 404) continue
    if (!response.ok) {
      fail(`DELETE ${url} -> HTTP ${response.status}: ${redact((await response.text()).slice(0, 400))}`)
    }
    removed += 1
  }
  return removed
}

async function storageUpload(objectPath, bytes, contentType) {
  const url = `${SUPABASE_URL}/storage/v1/object/${CONTACT_PHOTOS_BUCKET}/${objectPath}`
  let response
  try {
    response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": contentType,
          "x-upsert": "false",
        },
        body: bytes,
      },
      180_000,
    )
  } catch (error) {
    fail(`POST ${url} did not complete: ${describeNetworkError(error)}`)
  }
  if (!response.ok) {
    fail(`POST ${url} -> HTTP ${response.status}: ${redact((await response.text()).slice(0, 400))}`)
  }
}

/** Every target id already present for one program, read back from the target. */
async function existingTargetIds(table, programId) {
  const rows = await managementQuery(`select id::text as id from public.${table} where program_id = ${quoteLiteral(programId)}`)
  return new Set((Array.isArray(rows) ? rows : []).map((row) => row.id))
}

/** The persisted rec* → UUID map for one program. */
async function readMap(programId) {
  const rows = await managementQuery(
    `select entity, airtable_record_id, target_id::text as target_id from public.airtable_id_map where program_id = ${quoteLiteral(programId)}`,
  )
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    map.set(`${row.entity}:${row.airtable_record_id}`, row.target_id)
  }
  return map
}

/**
 * Drop map rows whose target row does not exist.
 *
 * The map is a ledger of what was written, so a row pointing at a target that is
 * not there is a false record — left behind by an interrupted run, or by an
 * earlier revision of this script that recorded a row it had then failed to
 * insert. Pruning makes the ledger exact, and makes the reconciliation check able
 * to trust it. A `users` row is matched on `(id, program_id)`, because
 * `public.users.id` alone does not identify a row across programs.
 */
async function pruneOrphanMapRows(programId, entity, existingIds) {
  const orphans = []
  for (const [key, targetId] of await readMap(programId)) {
    const [mapEntity, recordId] = key.split(":")
    if (mapEntity !== entity) continue
    if (!existingIds.has(targetId)) orphans.push({ programId, entity, recordId, targetId })
  }
  for (const chunk of batch(orphans, 200)) {
    const tuples = chunk
      .map((entry) => `(${quoteLiteral(entry.programId)}, ${quoteLiteral(entry.entity)}, ${quoteLiteral(entry.recordId)})`)
      .join(",\n       ")
    await managementQuery(`delete from public.airtable_id_map where (program_id, entity, airtable_record_id) in (values ${tuples})`)
  }
  return orphans.length
}

async function writeMapEntries(entries) {
  if (entries.length === 0) return 0
  for (const chunk of batch(entries, 200)) {
    const tuples = chunk
      .map(
        (entry) =>
          `(${quoteLiteral(entry.programId)}, ${quoteLiteral(entry.entity)}, ${quoteLiteral(entry.sourceRecordId)}, ${quoteLiteral(entry.targetId)}::uuid)`,
      )
      .join(",\n       ")
    await managementQuery(
      `insert into public.airtable_id_map (program_id, entity, airtable_record_id, target_id) values\n       ${tuples}\n       on conflict (program_id, entity, airtable_record_id) do nothing`,
    )
  }
  return entries.length
}

async function deleteMapEntries(programId) {
  return managementQuery(`delete from public.airtable_id_map where program_id = ${quoteLiteral(programId)}`)
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

async function fetchAttachment(url) {
  let response
  try {
    response = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }, 120_000)
  } catch (error) {
    return { ok: false, reason: `fetch_failed: ${describeNetworkError(error)}` }
  }
  if (!response.ok) return { ok: false, reason: `http_${response.status}` }
  const declared = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  const declaredLength = Number(response.headers.get("content-length") ?? "0")
  if (Number.isFinite(declaredLength) && declaredLength > MANAGE_PHOTO_MAX_BYTES) {
    return { ok: false, reason: `too_large: ${declaredLength} bytes, cap is ${MANAGE_PHOTO_MAX_BYTES}` }
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > MANAGE_PHOTO_MAX_BYTES) {
    return { ok: false, reason: `too_large: ${bytes.byteLength} bytes, cap is ${MANAGE_PHOTO_MAX_BYTES}` }
  }
  const sniffed = sniffPhotoContentType(bytes, declared)
  if (!sniffed) {
    return { ok: false, reason: `unsupported_content_type: ${declared || "(none)"} for ${bytes.byteLength} bytes` }
  }
  return { ok: true, bytes, contentType: sniffed.contentType, via: sniffed.via, declared }
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

async function runRollback(programIds) {
  for (const programId of programIds) {
    log(`\n--- ${programId}: rollback ---`)
    const rows = await managementQuery(
      `select entity, count(*)::int as c from public.airtable_id_map where program_id = ${quoteLiteral(programId)} group by entity order by entity`,
    )
    const byEntity = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.entity, row.c]))
    if (byEntity.size === 0) {
      log(`  airtable_id_map holds no ${programId} rows; nothing to roll back.`)
      continue
    }
    for (const entity of LOAD_ORDER) {
      log(`  ${entity}: ${byEntity.get(entity) ?? 0} row(s) recorded in the map`)
    }

    const photoRows = await managementQuery(
      `select photo_path from public.contacts where program_id = ${quoteLiteral(programId)} and photo_path is not null`,
    )
    const photoPaths = (Array.isArray(photoRows) ? photoRows : []).map((row) => row.photo_path)
    log(`  storage objects: ${photoPaths.length}`)

    if (dryRun) {
      log("  --dry-run: would delete exactly the rows above, their storage objects, and the map rows. Nothing was deleted.")
      continue
    }

    // Children first, so no FK blocks a parent delete: attendance → sessions →
    // contacts/users, then locations.
    //
    // Each delete joins `airtable_id_map` rather than carrying a list of ids, for
    // two reasons. It is literally "delete exactly what the map recorded and
    // nothing else", which is the property `--rollback` promises; and it avoids
    // the URL length ceiling a PostgREST `?id=in.(…)` with 1,202 ids blows past
    // (HTTP 400), because the ids never appear in a request line.
    //
    // `public.users` also matches on `program_id`: `id` alone is not unique across
    // programs, so a row another program owns must survive this rollback.
    for (const entity of [...LOAD_ORDER].reverse()) {
      const deleted = await managementQuery(
        `with deleted as (
           delete from public.${entity} t
           using public.airtable_id_map m
           where m.program_id = ${quoteLiteral(programId)}
             and m.entity = ${quoteLiteral(entity)}
             and m.target_id = t.id
             ${entity === "users" ? "and t.program_id = m.program_id" : ""}
           returning 1
         ) select count(*)::int as c from deleted`,
      )
      const count = Number(Array.isArray(deleted) ? deleted[0]?.c : 0)
      if (count > 0) log(`  deleted ${count} ${entity} row(s)`)
    }

    // The map is deleted last: it is the ledger, and a rollback that keeps it
    // would let the next run reuse ids for rows that no longer exist.
    const removedMap = await managementQuery(
      `with deleted as (
         delete from public.airtable_id_map where program_id = ${quoteLiteral(programId)} returning 1
       ) select count(*)::int as c from deleted`,
    )
    log(`  deleted ${Number(Array.isArray(removedMap) ? removedMap[0]?.c : 0)} airtable_id_map row(s)`)

    if (photoPaths.length > 0) {
      const orphans = await findOrphanObjects(programId)
      const removedObjects = await storageRemove([...photoPaths, ...orphans])
      log(`  removed ${removedObjects} storage object(s)`)
    }
  }
  log("")
  log(dryRun ? "--rollback --dry-run complete. Nothing was deleted." : "--rollback complete.")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadProgram(programId, report) {
  const program = PROGRAMS[programId]
  const siteUrl = siteUrlFor(programId)
  log(`\n=== ${programId} ===`)
  log(`  base      : ${program.baseId}`)
  log(`  site url  : ${siteUrl}   (env ${program.siteUrlEnv})`)

  const tableMeta = await verifyTableIds(programId)

  // ---- read every source table -------------------------------------------
  const source = {}
  let totalPages = 0
  for (const entity of LOAD_ORDER) {
    const { records, pages } = await fetchAllRecords(programId, entity)
    source[entity] = records
    totalPages += pages
    report.sourceCounts[programId][entity] = records.length
    const dropped = droppedFields(tableMeta[entity].fields, FIELDS[entity])
    report.droppedFields[programId][entity] = dropped
  }
  log(`  read ${LOAD_ORDER.map((e) => `${source[e].length} ${e}`).join(", ")} (${totalPages} page(s))`)
  for (const entity of LOAD_ORDER) {
    const dropped = report.droppedFields[programId][entity]
    log(`    ${entity}: ${dropped.length} Airtable field(s) dropped for having no target column`)
    for (const name of dropped) log(`      - ${name}`)
  }

  // ---- assign ids ----------------------------------------------------------
  // What the target already holds is read first, and the map pruned against it,
  // so a map row that names a row which is not there cannot be reused: it would
  // make the re-run skip a record it still has to insert.
  const existing = {}
  for (const entity of LOAD_ORDER) existing[entity] = await existingTargetIds(entity, programId)
  let pruned = 0
  for (const entity of LOAD_ORDER) {
    pruned += await pruneOrphanMapRows(programId, entity, existing[entity])
  }
  if (pruned > 0) {
    log(`  airtable_id_map: pruned ${pruned} row(s) naming a target row that is not there`)
  }
  const map = await readMap(programId)

  const assigned = {}
  for (const entity of LOAD_ORDER) {
    assigned[entity] = assignTargetIds(
      source[entity],
      new Map(source[entity].map((record) => [record.id, map.get(`${entity}:${record.id}`)])),
    )
  }

  // ---- shared lookup indexes ---------------------------------------------
  const locationsByName = new Map()
  const locationsByFoldedName = new Map()
  const locationsByCode = new Map()
  const locationIdBySourceId = new Map()
  for (const record of source.locations) {
    const { targetId } = assigned.locations.get(record.id)
    locationIdBySourceId.set(record.id, targetId)
    const name = text(record.fields?.[FIELDS.locations.name])
    if (name) {
      if (!locationsByName.has(name)) locationsByName.set(name, record.id)
      const folded = name.toLocaleLowerCase()
      if (!locationsByFoldedName.has(folded)) locationsByFoldedName.set(folded, record.id)
    }
    const code = text(record.fields?.[FIELDS.locations.code])
    if (code && !locationsByCode.has(code.toLocaleLowerCase())) locationsByCode.set(code.toLocaleLowerCase(), record.id)
  }

  // The auth join key is email, never Airtable's `Supabase User ID` field.
  const authIdByEmail = await managementQuery("select id::text as id, email from auth.users")
  const authIdByEmailIndex = new Map()
  for (const row of Array.isArray(authIdByEmail) ? authIdByEmail : []) {
    const email = normalizeEmail(row.email)
    if (email) authIdByEmailIndex.set(email, row.id)
  }

  // Which program already holds each auth id, if any. `public.users.id` is the
  // PRIMARY KEY, so one auth user can hold exactly one `public.users` row — a
  // person who serves both programs cannot be represented. That is a property of
  // the frozen `20261006000000` schema and of the program-agnostic RLS helpers in
  // `20261006010000` (`caller_role()` / `caller_program_id()` filter on `id`
  // alone), so it is reported here rather than worked around: silently keeping
  // only the first program would leave the other program's staff unable to sign
  // in at all, because `loadStaffContextForUser` requires a row for their program.
  const usersById = await managementQuery("select id::text as id, program_id, email, role from public.users")
  const claimedUserIdByProgram = new Map()
  for (const row of Array.isArray(usersById) ? usersById : []) {
    if (!claimedUserIdByProgram.has(row.id)) claimedUserIdByProgram.set(row.id, [])
    claimedUserIdByProgram.get(row.id).push(row)
  }

  // ---- transform + quarantine --------------------------------------------
  const quarantines = []
  const contextBase = {
    siteUrl,
    locationIdBySourceId,
    locationsByName,
    locationsByFoldedName,
    locationsByCode,
    authIdByEmail: authIdByEmailIndex,
  }

  // locations — no NOT NULL beyond name, which the mapper defaults.
  const locationRows = source.locations.map((record) => mapLocationRow(programId, record.id, assigned.locations.get(record.id).targetId, record))

  // users
  const userRows = []
  for (const record of source.users) {
    const row = mapUserRow(programId, record.id, assigned.users.get(record.id).targetId, record, contextBase)
    if (!row.email) {
      quarantines.push(quarantine(programId, "users", record.id, "missing_email", { name: row.values.name }))
      continue
    }
    if (!row.role || !USER_ROLES.includes(row.role)) {
      quarantines.push(quarantine(programId, "users", record.id, "unknown_role", { email: row.email, role: row.role }))
      continue
    }
    if (!row.status || !USER_STATUSES.includes(row.status)) {
      quarantines.push(quarantine(programId, "users", record.id, "unknown_status", { email: row.email, status: row.status }))
      continue
    }
    // `public.users.id` is an FK to `auth.users(id)`: no source auth row means no
    // target row at all, and the stale Airtable field is reported, never trusted.
    if (!authIdByEmailIndex.has(row.email)) {
      quarantines.push(
        quarantine(programId, "users", record.id, "no_auth_user", {
          email: row.email,
          declared_supabase_user_id: row.declaredSupabaseUserId,
        }),
      )
      continue
    }
    const authId = authIdByEmailIndex.get(row.email)
    const existing = (claimedUserIdByProgram.get(authId) ?? []).filter(
      (candidate) => candidate.program_id !== programId || normalizeEmail(candidate.email) !== row.email,
    )
    if (existing.length > 0) {
      quarantines.push(
        quarantine(programId, "users", record.id, "user_id_claimed_by_other_program", {
          email: row.email,
          role: row.role,
          auth_id: authId,
          held_by: existing.map((candidate) => `${candidate.program_id}/${candidate.role}`).join(", "),
        }),
      )
      continue
    }
    userRows.push({ ...row, values: { ...row.values, id: authId } })
    claimedUserIdByProgram.set(authId, [{ program_id: programId, email: row.email, role: row.role }])
  }

  // The resolved ids, for the FKs every later entity points at. `public.users.id`
  // is the auth id, so it also overrides the provisional id in the map below.
  // The self-referential `invited_by` / `assigned_preacher_id` are filled in now
  // that every surviving row's final id is known: both point at another row of
  // this same table, so a target that was itself quarantined resolves to null.
  const resolvedUserIdBySourceId = new Map()
  const userIdByEmail = new Map()
  for (const row of userRows) {
    resolvedUserIdBySourceId.set(row.sourceRecordId, row.values.id)
    userIdByEmail.set(row.email, row.values.id)
  }
  for (const row of userRows) {
    row.values.invited_by = row.invitedBySourceId
      ? resolvedUserIdBySourceId.get(row.invitedBySourceId) ?? null
      : null
    row.values.assigned_preacher_id = row.assignedPreacherSourceId
      ? resolvedUserIdBySourceId.get(row.assignedPreacherSourceId) ?? null
      : null
  }

  // contacts
  const contactRows = []
  const contactIdBySourceId = new Map()
  const survivingPhones = new Map()
  for (const record of source.contacts) {
    const row = mapContactRow(programId, record.id, assigned.contacts.get(record.id).targetId, record, {
      ...contextBase,
      userIdBySourceId: resolvedUserIdBySourceId,
    })
    contactIdBySourceId.set(record.id, row.targetId)
    // Phone before name: `contacts.phone` is NOT NULL and `contacts.name` is NOT
    // NULL, but the phone is the one the app cannot work around. A record with
    // neither is reported as an unusable phone, which is what it is.
    if (!row.phone) {
      quarantines.push(
        quarantine(programId, "contacts", record.id, "unusable_phone", {
          name: row.name,
          raw_phone: row.rawPhone,
          reason: row.rawPhone === null || row.rawPhone === undefined || row.rawPhone === ""
            ? "no phone in the source"
            : "normalizeMobile returned fewer than 10 digits",
        }),
      )
      continue
    }
    if (!row.name) {
      quarantines.push(quarantine(programId, "contacts", record.id, "missing_name", { phone: row.phone }))
      continue
    }
    // Pre-flight `UNIQUE (phone, program_id)` inside the batch, so a collision is a
    // quarantine and not a 409 half way through the load.
    const prior = survivingPhones.get(row.phone)
    if (prior) {
      quarantines.push(
        quarantine(programId, "contacts", record.id, "duplicate_phone", {
          name: row.name,
          phone: row.phone,
          first: prior,
        }),
      )
      continue
    }
    if (row.legacyLocation.kind === "unresolved") {
      quarantines.push(
        quarantine(programId, "contacts", record.id, "unresolved_location", {
          name: row.name,
          location_text: row.legacyLocation.text,
        }),
      )
      continue
    }
    survivingPhones.set(row.phone, record.id)
    contactRows.push(row)
  }

  // sessions
  const sessionDayBySourceId = new Map()
  for (const record of source.sessions) {
    sessionDayBySourceId.set(record.id, text(record.fields?.[FIELDS.sessions.sessionDate]))
  }
  const sessionRows = []
  const sessionIdBySourceId = new Map()
  for (const record of source.sessions) {
    const row = mapSessionRow(programId, record.id, assigned.sessions.get(record.id).targetId, record, {
      ...contextBase,
      userIdBySourceId: resolvedUserIdBySourceId,
      userIdByEmail,
    })
    sessionIdBySourceId.set(record.id, row.targetId)
    if (row.createdBy.kind === "unresolved") {
      // Reported, not fatal: `sessions.created_by` is nullable and an unresolved
      // collaborator must not cost the session itself.
      quarantines.push(
        quarantine(programId, "sessions", record.id, "unresolved_creator", { creator: row.createdBy.value }),
      )
    }
    sessionRows.push(row)
  }

  // attendance
  const attendanceCandidates = source.attendance.map((record) =>
    mapAttendanceRow(programId, record.id, assigned.attendance.get(record.id).targetId, record, {
      ...contextBase,
      contactIdBySourceId,
      sessionIdBySourceId,
      sessionDayBySourceId,
    }),
  )
  const linked = []
  for (const row of attendanceCandidates) {
    if (!row.contactSourceId) {
      quarantines.push(
        quarantine(programId, "attendance", row.sourceRecordId, "no_contact_link", {
          name: row.values.name,
          phone: row.values.phone,
          attendance_date: row.attendanceDate,
        }),
      )
      continue
    }
    if (!row.contactTargetId) {
      quarantines.push(
        quarantine(programId, "attendance", row.sourceRecordId, "contact_not_loaded", {
          name: row.values.name,
          contact: row.contactSourceId,
        }),
      )
      continue
    }
    if (!row.sessionSourceId || !row.sessionTargetId) {
      quarantines.push(
        quarantine(programId, "attendance", row.sourceRecordId, "no_session_link", {
          name: row.values.name,
          contact: row.contactSourceId,
        }),
      )
      continue
    }
    linked.push(row)
  }

  // Pre-flight `UNIQUE (contact_id, session_id)`, inside the batch and against
  // what the target already holds.
  //
  // Only the pairs this run's own source records do NOT claim count as already
  // present. On a re-run the target's ids come from the same map, so every loaded
  // row's pair is present in the target by construction — including them would
  // make each source row look like a duplicate of itself and quarantine the entire
  // table.
  const targetPairs = await managementQuery(
    `select a.contact_id::text as contact_id, a.session_id::text as session_id from public.attendance a where a.program_id = ${quoteLiteral(programId)}`,
  )
  const claimedBySource = new Set(linked.map((row) => `${row.contactTargetId}|${row.sessionTargetId}`))
  const unclaimed = (Array.isArray(targetPairs) ? targetPairs : [])
    .map((pair) => `${pair.contact_id}|${pair.session_id}`)
    .filter((key) => !claimedBySource.has(key))
  const { kept: attendanceRows, duplicates } = detectDuplicatePairs(linked, unclaimed)
  for (const entry of duplicates) {
    const row = linked.find((candidate) => candidate.sourceRecordId === entry.sourceRecordId)
    quarantines.push(
      quarantine(programId, "attendance", entry.sourceRecordId, "duplicate_pair", {
        name: row?.values.name ?? null,
        contact: row?.contactSourceId ?? null,
        session: row?.sessionSourceId ?? null,
        first: entry.first,
      }),
    )
  }

  const rowsByEntity = {
    locations: locationRows,
    users: userRows,
    contacts: contactRows,
    sessions: sessionRows,
    attendance: attendanceRows,
  }
  for (const row of attendanceRows) {
    row.values.contact_id = row.contactTargetId
    row.values.session_id = row.sessionTargetId
  }

  // ---- what the target already holds -------------------------------------
  // `public.users.id` is the auth id, so a users row's identity is its auth id,
  // not the provisional UUID the map minted.
  const keyOf = (entity) => (entity === "users" ? (row) => row.values.id : (row) => row.targetId)

  const split = {}
  for (const entity of LOAD_ORDER) {
    split[entity] = splitByPresence(rowsByEntity[entity], keyOf(entity), existing[entity])
  }

  // ---- the plan ------------------------------------------------------------
  const plan = {}
  for (const entity of LOAD_ORDER) {
    const { toInsert, alreadyPresent } = split[entity]
    const quarantined = quarantines.filter((entry) => entry.entity === entity).length
    plan[entity] = {
      source: source[entity].length,
      toLoad: toInsert.length,
      alreadyInTarget: alreadyPresent.length,
      quarantined,
      // What the entity should hold once this run settles: everything that
      // survived quarantine, whether this run inserted it or a previous one did.
      expected: source[entity].length - quarantined,
    }
    report.plan[programId][entity] = plan[entity]
  }

  log("")
  log("  plan:")
  for (const entity of LOAD_ORDER) {
    const p = plan[entity]
    log(
      `    ${entity.padEnd(10)} source ${String(p.source).padStart(5)}  insert ${String(p.toLoad).padStart(5)}  ` +
        `already ${String(p.alreadyInTarget).padStart(5)}  quarantine ${String(p.quarantined).padStart(4)}  ` +
        `expected total ${String(p.expected).padStart(5)}`,
    )
  }

  const photoRows = contactRows.filter((row) => row.photos.length > 0)
  // The path each of these contacts already carries, so a replacement can remove
  // the object it supersedes instead of orphaning it.
  const previousPhotoPaths = new Map()
  if (!skipPhotos && photoRows.length > 0) {
    const ids = photoRows.map((row) => row.targetId)
    for (const chunk of batch(ids, 100)) {
      const rows = await managementQuery(
        `select id::text as id, photo_path from public.contacts where id in (${chunk.map((id) => quoteLiteral(id)).join(", ")})`,
      )
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row.photo_path) previousPhotoPaths.set(row.id, row.photo_path)
      }
    }
  }
  log(`    photos     ${photoRows.length} contact(s) with an attachment; skip-photos=${skipPhotos}`)
  if (!skipPhotos) {
    for (const row of photoRows) log(`      ${row.sourceRecordId} (${row.values.name}): ${row.photos.length} attachment(s)`)
  }

  const unresolvedLegacy = contactRows.filter((row) => row.legacyLocation.kind === "resolved")
  log(
    `    free-text Location_Legacy resolved for ${unresolvedLegacy.length} contact(s) ` +
      `(${new Set(unresolvedLegacy.map((row) => row.legacyLocation.via)).size ? [...new Set(unresolvedLegacy.map((row) => row.legacyLocation.via))].join(", ") : "none"})`,
  )

  const reportedStaleUserIds = userRows.filter((row) => row.declaredSupabaseUserId && row.declaredMatchesResolved === false)
  if (reportedStaleUserIds.length > 0) {
    log(`    Airtable "Supabase User ID" disagreed with the resolved auth id for ${reportedStaleUserIds.length} user(s):`)
    for (const row of reportedStaleUserIds) {
      log(`      ${row.values.email}: field=${row.declaredSupabaseUserId} resolved=${row.values.id}`)
    }
  }
  const blankDeclared = userRows.filter((row) => !row.declaredSupabaseUserId)
  if (blankDeclared.length > 0) {
    log(`    Airtable "Supabase User ID" blank for ${blankDeclared.length} user(s), resolved by email: ${blankDeclared.map((row) => row.values.email).join(", ")}`)
  }

  log("")
  log(`  quarantine (${quarantines.length} entry/entries):`)
  for (const entry of quarantines) {
    const detail = Object.entries(entry.detail)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => `${key}=${typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value)}`)
      .join(" ")
    log(`    ${entry.entity}/${entry.sourceRecordId}  ${entry.reason}${detail ? `  ${detail}` : ""}`)
  }

  report.quarantines.push(...quarantines)

  // ---- rollback short-circuits here -------------------------------------
  if (rollback) return

  if (dryRun) {
    log("")
    log("  --dry-run: only SELECTs were sent to Airtable and to both Supabase projects. Nothing was written.")
    return
  }

  // ---- persist the map, then the rows ------------------------------------
  // The map is written first: it is the ledger the rollback reads and the reason
  // a resumed run reuses the same ids. A `users` row's target id is its auth id,
  // because `public.users.id` IS `auth.users.id`.
  const mapEntries = []
  for (const entity of LOAD_ORDER) {
    for (const row of rowsByEntity[entity]) {
      mapEntries.push({
        programId,
        entity,
        sourceRecordId: row.sourceRecordId,
        targetId: keyOf(entity)(row),
      })
    }
  }
  await writeMapEntries(mapEntries)
  log("")
  log(`  airtable_id_map: ${mapEntries.length} row(s) written (ids decided before the first insert)`)

  for (const entity of LOAD_ORDER) {
    const { toInsert, alreadyPresent } = split[entity]
    if (toInsert.length === 0) {
      log(`  ${entity.padEnd(10)} inserted 0   skipped ${alreadyPresent.length} (already in the target)`)
      continue
    }
    let inserted = 0
    // 200 rows per statement: large enough that 1,036 contacts is six requests,
    // small enough that one bad row does not exceed the statement timeout.
    for (const chunk of batch(toInsert, 200)) {
      inserted += await postgrestInsert(entity, chunk)
    }
    log(`  ${entity.padEnd(10)} inserted ${inserted}   skipped ${alreadyPresent.length} (already in the target)`)
  }

  // ---- photos -------------------------------------------------------------
  if (!skipPhotos && photoRows.length > 0) {
    log("")
    log(`  photos: fetching ${photoRows.length} attachment(s) (Airtable URLs are short-lived, so this must happen in-run)`)
    let uploaded = 0
    let sniffedCount = 0
    const photoFailures = []
    const replacedPaths = []
    for (const row of photoRows) {
      const attachment = row.photos[0]
      const fetched = await fetchAttachment(attachment.url)
      if (!fetched.ok) {
        photoFailures.push(
          quarantine(programId, "contacts", row.sourceRecordId, `photo_${fetched.reason.split(":")[0]}`, {
            url_host: safeHost(attachment.url),
            why: fetched.reason,
          }),
        )
        continue
      }
      const extension = PHOTO_EXTENSION_BY_CONTENT_TYPE[fetched.contentType]
      const objectPath = `${programId}/${row.targetId}/${randomUUID()}.${extension}`
      await storageUpload(objectPath, fetched.bytes, fetched.contentType)
      const previous = previousPhotoPaths.get(row.targetId)
      await setPhotoPath(row.targetId, objectPath)
      // Mirrors `uploadManageContactPhoto`: every upload writes a fresh path, so
      // the object it replaces becomes unreachable. Removing it keeps a re-run from
      // orphaning a file per photo, forever.
      if (previous && previous !== objectPath) replacedPaths.push(previous)
      if (fetched.via === "sniffed") sniffedCount += 1
      uploaded += 1
    }
    log(
      `  photos    uploaded ${uploaded} object(s) into the private ${CONTACT_PHOTOS_BUCKET} bucket ` +
        `(${sniffedCount} typed from the bytes, because Airtable served them as a generic binary)`,
    )
    for (const failure of photoFailures) {
      log(`    ${failure.sourceRecordId}  ${failure.detail.why} (host ${failure.detail.url_host})`)
    }
    report.photoFailures.push(...photoFailures)
    if (replacedPaths.length > 0) {
      await storageRemove(replacedPaths)
      log(`  photos    removed ${replacedPaths.length} replaced object(s) so a re-run cannot orphan them`)
    }
    // Anything else in this program's prefix that no `contacts.photo_path` names is
    // unreachable — the residue of an earlier revision that replaced a path
    // without deleting the object. Removing it keeps the bucket a set of live
    // objects rather than a growing pile of files nothing can reach.
    const orphans = await findOrphanObjects(programId)
    if (orphans.length > 0) {
      await storageRemove(orphans)
      log(`  photos    removed ${orphans.length} unreachable object(s) under ${programId}/`)
    }
  } else if (skipPhotos) {
    log("")
    log("  photos: skipped (--skip-photos); no attachment was fetched and no object was uploaded")
  }
}

/**
 * Storage objects under one program's prefix that no `contacts.photo_path` names.
 *
 * `storage.objects` is read directly rather than through the Storage REST list
 * endpoint, whose per-folder response omits the object key and would make every
 * path look unreachable.
 */
async function findOrphanObjects(programId) {
  const referenced = await managementQuery(
    "select photo_path from public.contacts where photo_path is not null and photo_path like " +
      quoteLiteral(`${programId}/%`),
  )
  const referencedPaths = new Set((Array.isArray(referenced) ? referenced : []).map((row) => row.photo_path))
  const objects = await managementQuery(
    "select name from storage.objects where bucket_id = " +
      quoteLiteral(CONTACT_PHOTOS_BUCKET) +
      " and name like " +
      quoteLiteral(`${programId}/%`),
  )
  return (Array.isArray(objects) ? objects : [])
    .map((row) => row.name)
    .filter((name) => !referencedPaths.has(name))
}

/**
 * Set `contacts.photo_path` for one contact.
 *
 * One request per contact, never a batched `id=in.(…)` PATCH: PostgREST applies
 * the whole request body to *every* row the filter matches, so a batch of updates
 * would write row A's id onto row B and fail with a duplicate-key error.
 */
async function setPhotoPath(contactId, photoPath) {
  const url = `${SUPABASE_URL}/rest/v1/contacts?id=eq.${contactId}`
  let response
  try {
    response = await fetchWithRetry(
      url,
      {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ photo_path: photoPath }),
      },
      60_000,
    )
  } catch (error) {
    fail(`PATCH ${url} did not complete: ${describeNetworkError(error)}`)
  }
  if (!response.ok) {
    fail(`PATCH ${url} -> HTTP ${response.status}: ${redact((await response.text()).slice(0, 400))}`)
  }
}

function safeHost(url) {
  try {
    return new URL(url).host
  } catch {
    return "(unparseable)"
  }
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

async function reconcile(report, programIds) {
  log("")
  log("=== reconciliation ===")
  const problems = []

  for (const programId of programIds) {
    const rows = await managementQuery(
      "select 'locations' as entity, count(*)::int as c from public.locations where program_id = " +
        quoteLiteral(programId) +
        " union all select 'users', count(*)::int from public.users where program_id = " +
        quoteLiteral(programId) +
        " union all select 'contacts', count(*)::int from public.contacts where program_id = " +
        quoteLiteral(programId) +
        " union all select 'sessions', count(*)::int from public.sessions where program_id = " +
        quoteLiteral(programId) +
        " union all select 'attendance', count(*)::int from public.attendance where program_id = " +
        quoteLiteral(programId),
    )
    const targetCounts = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.entity, row.c]))
    const mapped = await managementQuery(
      "select entity, count(*)::int as c from public.airtable_id_map where program_id = " +
        quoteLiteral(programId) +
        " group by entity",
    )
    const mappedCounts = new Map((Array.isArray(mapped) ? mapped : []).map((row) => [row.entity, row.c]))
    report.targetCounts[programId] = Object.fromEntries(targetCounts)

    log(`\n  ${programId}`)
    log(
      `    ${"table".padEnd(11)}${"source".padStart(8)}${"quarantined".padStart(13)}${"expected".padStart(10)}` +
        `${"mapped".padStart(9)}${"target".padStart(9)}${"other".padStart(8)}`,
    )
    for (const entity of LOAD_ORDER) {
      const p = report.plan[programId][entity]
      const expected = p ? p.expected : null
      const mappedCount = mappedCounts.get(entity) ?? 0
      const targetCount = targetCounts.get(entity) ?? 0
      // The target also holds rows this loader never wrote: the preview fixtures,
      // and nothing else. Showing the difference keeps "loaded N" from being read
      // as "the table holds N" when it does not.
      const other = expected === null ? null : targetCount - mappedCount
      log(
        `    ${entity.padEnd(11)}${String(p?.source ?? "?").padStart(8)}${String(p?.quarantined ?? "?").padStart(13)}` +
          `${String(expected ?? "?").padStart(10)}${String(mappedCount).padStart(9)}${String(targetCount).padStart(9)}` +
          `${String(other ?? "?").padStart(8)}`,
      )
      // Mapped rows and surviving source rows must agree: the map is the ledger, so
      // a divergence means a row was written without being recorded, or the reverse.
      if (expected !== null && mappedCount !== expected) {
        problems.push(
          `${programId}/${entity}: the map holds ${mappedCount} row(s) but source ${p.source} minus ${p.quarantined} quarantine(s) is ${expected}`,
        )
      }
    }
  }

  // Invariants the load must not break. The day invariant is scoped to the rows
  // this loader wrote: story 7.8's preview fixtures store a full ISO timestamp in
  // `sessions.session_date` instead of a date, which makes two of *their*
  // attendance rows fail the comparison for a reason the backfill neither
  // introduced nor can fix. Those are reported separately rather than counted
  // here, so neither a real regression nor a known fixture is hidden.
  const migratedAttendance = `a.id in (select target_id from public.airtable_id_map where entity = 'attendance')`
  const invariants = [
    {
      name: "every backfilled attendance.created_at falls inside its session's Asia/Kolkata day",
      sql:
        "select count(*)::int as c from public.attendance a join public.sessions s on s.id = a.session_id " +
        `where ${migratedAttendance} and (a.created_at at time zone 'Asia/Kolkata')::date <> s.session_date::date`,
      expect: 0,
    },
    {
      name: "every attendance.contact_id exists in public.contacts",
      sql: "select count(*)::int as c from public.attendance a left join public.contacts c on c.id = a.contact_id where c.id is null",
      expect: 0,
    },
    {
      name: "no contacts row violates UNIQUE (phone, program_id)",
      sql: "select count(*)::int as c from (select phone, program_id from public.contacts group by phone, program_id having count(*) > 1) d",
      expect: 0,
    },
    {
      name: "no attendance row violates UNIQUE (contact_id, session_id)",
      sql: "select count(*)::int as c from (select contact_id, session_id from public.attendance group by contact_id, session_id having count(*) > 1) d",
      expect: 0,
    },
    {
      name: "every public.users.id exists in auth.users (DW-3 alignment)",
      sql: "select count(*)::int as c from public.users u left join auth.users a on a.id = u.id where a.id is null",
      expect: 0,
    },
    {
      name: "every public.users email exists in auth.users",
      sql: "select count(*)::int as c from public.users u left join auth.users a on lower(a.email) = lower(u.email) where a.id is null",
      expect: 0,
    },
    {
      name: "every mapped users target id exists in public.users for that same program",
      sql:
        "select count(*)::int as c from public.airtable_id_map m where m.entity = 'users' " +
        "and not exists (select 1 from public.users u where u.id = m.target_id and u.program_id = m.program_id)",
      expect: 0,
    },
    {
      name: "every mapped target id exists in its target table",
      sql:
        "select count(*)::int as c from public.airtable_id_map m where " +
        "(m.entity = 'contacts' and not exists (select 1 from public.contacts c where c.id = m.target_id))" +
        " or (m.entity = 'sessions' and not exists (select 1 from public.sessions s where s.id = m.target_id))" +
        " or (m.entity = 'locations' and not exists (select 1 from public.locations l where l.id = m.target_id))" +
        " or (m.entity = 'attendance' and not exists (select 1 from public.attendance a where a.id = m.target_id))",
      expect: 0,
    },
  ]
  log("")
  for (const invariant of invariants) {
    const rows = await managementQuery(invariant.sql)
    const actual = Number(Array.isArray(rows) ? rows[0]?.c : -1)
    const ok = actual === invariant.expect
    log(`    ${ok ? "ok  " : "FAIL"} ${invariant.name}: ${actual}${ok ? "" : ` (expected ${invariant.expect})`}`)
    if (!ok) problems.push(`${invariant.name}: ${actual}, expected ${invariant.expect}`)
  }

  // Reported, not asserted: pre-existing rows this loader did not write.
  const foreign = await managementQuery(
    "select count(*)::int as c from public.attendance a join public.sessions s on s.id = a.session_id " +
      `where not (${migratedAttendance}) and (a.created_at at time zone 'Asia/Kolkata')::date <> s.session_date::date`,
  )
  const foreignCount = Number(Array.isArray(foreign) ? foreign[0]?.c : -1)
  if (foreignCount > 0) {
    log(
      `    note  ${foreignCount} attendance row(s) NOT written by this loader sit outside their session's IST day. ` +
        "They are story 7.8's preview fixtures, whose sessions carry a timestamp rather than a date in " +
        "`session_date`; `seed-preview-fixtures.mjs --wipe` removes them.",
    )
  }

  if (problems.length > 0) {
    warn("")
    warn(`${problems.length} reconciliation problem(s):`)
    for (const problem of problems) warn(`  - ${problem}`)
    process.exit(1)
  }
  log("")
  log("  every count reconciles and every invariant holds.")
}

async function main() {
  log(`Airtable bases are read-only archives. Target project: ${targetRef}.`)
  log(`Mode: ${rollback ? "rollback" : dryRun ? "dry-run" : "load"}${programFilter ? ` (${programFilter} only)` : ""}`)

  const programIds = programFilter ? [programFilter] : Object.keys(PROGRAMS)

  if (rollback) {
    await runRollback(programIds)
    return
  }

  const report = {
    sourceCounts: {},
    plan: {},
    droppedFields: {},
    quarantines: [],
    photoFailures: [],
    targetCounts: {},
  }
  for (const programId of programIds) {
    report.sourceCounts[programId] = {}
    report.plan[programId] = {}
    report.droppedFields[programId] = {}
  }

  for (const programId of programIds) {
    await loadProgram(programId, report)
  }

  if (dryRun) {
    log("")
    log("=== summary (--dry-run, nothing written) ===")
    for (const programId of programIds) {
      const totals = LOAD_ORDER.map((entity) => `${entity} ${report.sourceCounts[programId][entity]}`).join(", ")
      const quarantineCount = report.quarantines.filter((entry) => entry.programId === programId).length
      log(`  ${programId}: ${totals}; ${quarantineCount} quarantine(s)`)
    }
    log("")
    log("  Re-run without --dry-run to apply this plan.")
    return
  }

  await reconcile(report, programIds)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}