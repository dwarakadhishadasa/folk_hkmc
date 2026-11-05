import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { normalizeGridViewConfig, type GridViewConfig } from "@/components/grid/grid-view-config"
import type {
  ContactViewVisibility,
  ManageContactView,
} from "@/components/manage/manage-view-types"

/**
 * Saved contacts-grid views.
 *
 * A view is shared by the programme rather than owned by the person who saved
 * it: the read policy admits every operational role, and this module never
 * narrows by author. That is the Airtable behaviour the grid is modelled on —
 * a view is a working surface, and a personal one is a different feature.
 *
 * Reads go through the caller's session so RLS does the programme scoping.
 * Writes go through the service role because the table has no write policy:
 * every write passes the route's `requireRole` first.
 */

const VIEW_COLUMNS =
  "id, name, view_type, config, position, owner_user_id, visibility, created_at, updated_at"

const MAX_CONFIG_BYTES = 32_768

const POSITION_STEP = 1024

interface ContactViewRow {
  id: string
  name: string
  view_type: string
  config: unknown
  position: number
  owner_user_id: string | null
  visibility: ContactViewVisibility
  created_at: string
  updated_at: string
}

function toManageContactView(row: ContactViewRow): ManageContactView {
  return {
    id: row.id,
    name: row.name,
    viewType: "grid",
    config: normalizeGridViewConfig(row.config),
    position: row.position,
    ownerUserId: row.owner_user_id,
    visibility: row.visibility === "collaborative" ? "collaborative" : "personal",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Whether the caller may change a view's configuration or delete it.
 *
 * Personal views belong to one person; collaborative ones belong to the
 * programme and any operational writer may reshape them. An ownerless row
 * predates ownership and is treated as the shared view it was.
 */
/**
 * Whether the caller may see — and therefore open, remember, or change — a view.
 *
 * Reading and writing share one rule today: a personal view has exactly one
 * person who can do either, and a collaborative one is open to every operational
 * role. Two predicates that agree would be one more place for the rules to drift
 * apart.
 */
function canAccessView(staff: StaffContext, row: Pick<ContactViewRow, "owner_user_id" | "visibility">): boolean {
  return (
    row.visibility === "collaborative" ||
    row.owner_user_id === null ||
    row.owner_user_id === staff.userId
  )
}

async function readViewRow(staff: StaffContext, viewId: string): Promise<ContactViewRow> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .select(VIEW_COLUMNS)
    .eq("program_id", staff.programId)
    .eq("id", viewId)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "contact_views_read_failed", "Unable to read saved views.")
  }

  if (!data) {
    throw new AuthzError(404, "contact_view_not_found", "That view does not exist.")
  }

  return data as ContactViewRow
}

/**
 * The view this person last opened, wherever they signed in from.
 *
 * Server-side rather than a browser cache: the preference belongs to the
 * account, so a different machine opens the same view.
 */
export async function loadLastContactView(staff: StaffContext): Promise<string | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("staff_view_preferences")
    .select("last_contact_view_id")
    .eq("user_id", staff.userId)
    .maybeSingle()

  if (error) {
    // A preference that cannot be read costs the next visit its remembered
    // view; it must never take the grid down with it.
    return null
  }

  return (data as { last_contact_view_id: string | null } | null)?.last_contact_view_id ?? null
}

export async function setLastContactView(staff: StaffContext, viewId: string): Promise<void> {
  const existing = await readViewRow(staff, viewId)

  if (!canAccessView(staff, existing)) {
    throw new AuthzError(403, "contact_view_forbidden", "That view belongs to someone else.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { error } = await supabaseAdmin.from("staff_view_preferences").upsert(
    {
      user_id: staff.userId,
      program_id: staff.programId,
      last_contact_view_id: viewId,
    },
    { onConflict: "user_id" },
  )

  if (error) {
    throw new AuthzError(500, "contact_view_preference_failed", "Unable to remember that view.")
  }
}

export async function loadContactViews(staff: StaffContext): Promise<ManageContactView[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("contact_views")
    .select(VIEW_COLUMNS)
    .eq("program_id", staff.programId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    throw new AuthzError(500, "contact_views_read_failed", "Unable to read saved views.")
  }

  return ((data ?? []) as ContactViewRow[]).map(toManageContactView)
}

function assertConfigSize(config: GridViewConfig): void {
  if (JSON.stringify(config).length > MAX_CONFIG_BYTES) {
    throw new AuthzError(400, "contact_view_config_too_large", "That view configuration is too large.")
  }
}

async function nextPosition(staff: StaffContext): Promise<number> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .select("position")
    .eq("program_id", staff.programId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "contact_views_read_failed", "Unable to place a new view.")
  }

  const current = (data as { position: number } | null)?.position ?? 0

  return current + POSITION_STEP
}

/**
 * A name that is not already taken in this programme.
 *
 * The table has a unique index on the lowercased name, so this is the friendly
 * path rather than the guard: two requests racing for "Grid 3" both resolve to
 * it here, and the loser gets the index error and retries through the same
 * function.
 */
function freeName(desired: string, taken: ReadonlySet<string>): string {
  const base = desired.trim() || "Grid"
  const normalized = base.toLowerCase()

  if (!taken.has(normalized)) {
    return base
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`

    if (!taken.has(candidate.toLowerCase())) {
      return candidate
    }
  }

  return `${base} ${Date.now()}`
}

async function takenNames(staff: StaffContext): Promise<Set<string>> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .select("name")
    .eq("program_id", staff.programId)
    // Names are unique per owner: someone else's "My grid" is not in the way of
    // yours, which is the point of personal views.
    .eq("owner_user_id", staff.userId)

  if (error) {
    throw new AuthzError(500, "contact_views_read_failed", "Unable to read saved views.")
  }

  return new Set(
    ((data ?? []) as Array<{ name: string }>).map((row) => row.name.trim().toLowerCase()),
  )
}

export async function createContactView(params: {
  staff: StaffContext
  name: string
  config: GridViewConfig
  visibility: ContactViewVisibility
}): Promise<ManageContactView> {
  const { staff } = params
  const config = normalizeGridViewConfig(params.config)

  assertConfigSize(config)

  const supabaseAdmin = createSupabaseAdminClient()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const name = freeName(params.name, await takenNames(staff))
    const { data, error } = await supabaseAdmin
      .from("contact_views")
      .insert({
        program_id: staff.programId,
        name,
        view_type: "grid",
        config,
        position: await nextPosition(staff),
        created_by: staff.userId,
        owner_user_id: staff.userId,
        visibility: params.visibility,
      })
      .select(VIEW_COLUMNS)
      .single()

    if (!error && data) {
      return toManageContactView(data as ContactViewRow)
    }

    // 23505 is the unique-name index losing a race. The next pass picks the
    // suffixed name the winner took.
    if (error?.code !== "23505") {
      throw new AuthzError(500, "contact_view_create_failed", "Unable to create that view.")
    }
  }

  throw new AuthzError(409, "contact_view_name_taken", "That view name is taken.")
}

export async function updateContactView(params: {
  staff: StaffContext
  viewId: string
  name?: string
  config?: GridViewConfig
}): Promise<ManageContactView> {
  const { staff, viewId } = params
  const patch: Record<string, unknown> = {}

  if (params.name !== undefined) {
    const name = params.name.trim()

    if (name.length === 0 || name.length > 80) {
      throw new AuthzError(400, "contact_view_name_invalid", "A view name needs 1 to 80 characters.")
    }

    patch.name = name
  }

  if (params.config !== undefined) {
    const config = normalizeGridViewConfig(params.config)
    assertConfigSize(config)
    patch.config = config
  }

  if (Object.keys(patch).length === 0) {
    throw new AuthzError(400, "contact_view_patch_empty", "Nothing to change.")
  }

  const existing = await readViewRow(staff, viewId)

  if (!canAccessView(staff, existing)) {
    throw new AuthzError(403, "contact_view_forbidden", "That view belongs to someone else.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .update(patch)
    .eq("program_id", staff.programId)
    .eq("id", viewId)
    .select(VIEW_COLUMNS)
    .maybeSingle()

  if (error?.code === "23505") {
    throw new AuthzError(409, "contact_view_name_taken", "That view name is already used.")
  }

  if (error) {
    throw new AuthzError(500, "contact_view_update_failed", "Unable to update that view.")
  }

  if (!data) {
    throw new AuthzError(404, "contact_view_not_found", "That view does not exist.")
  }

  return toManageContactView(data as ContactViewRow)
}

export async function deleteContactView(params: {
  staff: StaffContext
  viewId: string
}): Promise<void> {
  const { staff, viewId } = params
  const existing = await readViewRow(staff, viewId)

  if (!canAccessView(staff, existing)) {
    throw new AuthzError(403, "contact_view_forbidden", "That view belongs to someone else.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .delete()
    .eq("program_id", staff.programId)
    .eq("id", viewId)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "contact_view_delete_failed", "Unable to delete that view.")
  }

  if (!data) {
    throw new AuthzError(404, "contact_view_not_found", "That view does not exist.")
  }
}
