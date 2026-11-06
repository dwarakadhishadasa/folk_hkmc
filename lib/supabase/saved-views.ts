import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { normalizeGridViewConfig, type GridViewConfig } from "@/components/grid/grid-view-config"
import type {
  SavedGridView,
  SavedViewSurface,
  SavedViewVisibility,
} from "@/components/grid/saved-view-types"

/**
 * Saved grid views, for every surface that renders a `Grid`.
 *
 * One table holds a view per (programme, surface, owner, name). A view is
 * personal by default; a collaborative one is open to every operational role in
 * the programme. That is the Airtable behaviour the grid is modelled on — a view
 * is a working surface, and a personal one is a different feature.
 *
 * Reads go through the caller's session so RLS does the programme scoping.
 * Writes go through the service role because the table has no write policy:
 * every write passes the route's `requireRole` first.
 */

const VIEW_COLUMNS =
  "id, name, view_type, config, position, owner_user_id, visibility, surface, created_at, updated_at"

const MAX_CONFIG_BYTES = 32_768

const POSITION_STEP = 1024

const LAST_VIEW_COLUMN: Record<SavedViewSurface, string> = {
  contacts: "last_contact_view_id",
  campaigns: "last_campaign_view_id",
}

interface SavedViewRow {
  id: string
  name: string
  view_type: string
  config: unknown
  position: number
  owner_user_id: string | null
  visibility: SavedViewVisibility
  surface: SavedViewSurface
  created_at: string
  updated_at: string
}

function toSavedGridView(row: SavedViewRow): SavedGridView {
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
 * Whether the caller may see — and therefore open, remember, or change — a view.
 *
 * Reading and writing share one rule today: a personal view has exactly one
 * person who can do either, and a collaborative one is open to every operational
 * role. Two predicates that agree would be one more place for the rules to drift
 * apart.
 */
function canAccessView(
  staff: StaffContext,
  row: Pick<SavedViewRow, "owner_user_id" | "visibility">,
): boolean {
  return (
    row.visibility === "collaborative" ||
    row.owner_user_id === null ||
    row.owner_user_id === staff.userId
  )
}

async function readViewRow(
  staff: StaffContext,
  surface: SavedViewSurface,
  viewId: string,
): Promise<SavedViewRow> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .select(VIEW_COLUMNS)
    .eq("program_id", staff.programId)
    .eq("surface", surface)
    .eq("id", viewId)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "saved_views_read_failed", "Unable to read saved views.")
  }

  if (!data) {
    throw new AuthzError(404, "saved_view_not_found", "That view does not exist.")
  }

  return data as SavedViewRow
}

/**
 * The view this person last opened on a surface, wherever they signed in from.
 *
 * Server-side rather than a browser cache: the preference belongs to the
 * account, so a different machine opens the same view.
 */
export async function loadLastSavedView(
  staff: StaffContext,
  surface: SavedViewSurface,
): Promise<string | null> {
  const column = LAST_VIEW_COLUMN[surface]
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("staff_view_preferences")
    .select(column)
    .eq("user_id", staff.userId)
    .maybeSingle()

  if (error) {
    // A preference that cannot be read costs the next visit its remembered
    // view; it must never take the grid down with it.
    return null
  }

  return (data as Record<string, string | null> | null)?.[column] ?? null
}

export async function setLastSavedView(
  staff: StaffContext,
  surface: SavedViewSurface,
  viewId: string,
): Promise<void> {
  const existing = await readViewRow(staff, surface, viewId)

  if (!canAccessView(staff, existing)) {
    throw new AuthzError(403, "saved_view_forbidden", "That view belongs to someone else.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { error } = await supabaseAdmin.from("staff_view_preferences").upsert(
    {
      user_id: staff.userId,
      program_id: staff.programId,
      [LAST_VIEW_COLUMN[surface]]: viewId,
    },
    { onConflict: "user_id" },
  )

  if (error) {
    throw new AuthzError(500, "saved_view_preference_failed", "Unable to remember that view.")
  }
}

export async function loadSavedViews(
  staff: StaffContext,
  surface: SavedViewSurface,
): Promise<SavedGridView[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("contact_views")
    .select(VIEW_COLUMNS)
    .eq("program_id", staff.programId)
    .eq("surface", surface)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    throw new AuthzError(500, "saved_views_read_failed", "Unable to read saved views.")
  }

  return ((data ?? []) as SavedViewRow[]).map(toSavedGridView)
}

function assertConfigSize(config: GridViewConfig): void {
  if (JSON.stringify(config).length > MAX_CONFIG_BYTES) {
    throw new AuthzError(400, "saved_view_config_too_large", "That view configuration is too large.")
  }
}

async function nextPosition(staff: StaffContext, surface: SavedViewSurface): Promise<number> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .select("position")
    .eq("program_id", staff.programId)
    .eq("surface", surface)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "saved_views_read_failed", "Unable to place a new view.")
  }

  const current = (data as { position: number } | null)?.position ?? 0

  return current + POSITION_STEP
}

/**
 * A name that is not already taken for this owner on this surface.
 *
 * The unique indexes are the real guard; this is the friendly path so two
 * requests racing for "Grid 3" do not both surface an index error.
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

async function takenNames(staff: StaffContext, surface: SavedViewSurface): Promise<Set<string>> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .select("name")
    .eq("program_id", staff.programId)
    .eq("surface", surface)
    // Names are unique per owner: someone else's "My grid" is not in the way of
    // yours, which is the point of personal views.
    .eq("owner_user_id", staff.userId)

  if (error) {
    throw new AuthzError(500, "saved_views_read_failed", "Unable to read saved views.")
  }

  return new Set(
    ((data ?? []) as Array<{ name: string }>).map((row) => row.name.trim().toLowerCase()),
  )
}

export async function createSavedView(params: {
  staff: StaffContext
  surface: SavedViewSurface
  name: string
  config: GridViewConfig
  visibility: SavedViewVisibility
}): Promise<SavedGridView> {
  const { staff, surface } = params
  const config = normalizeGridViewConfig(params.config)

  assertConfigSize(config)

  const supabaseAdmin = createSupabaseAdminClient()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const name = freeName(params.name, await takenNames(staff, surface))
    const { data, error } = await supabaseAdmin
      .from("contact_views")
      .insert({
        program_id: staff.programId,
        surface,
        name,
        view_type: "grid",
        config,
        position: await nextPosition(staff, surface),
        created_by: staff.userId,
        owner_user_id: staff.userId,
        visibility: params.visibility,
      })
      .select(VIEW_COLUMNS)
      .single()

    if (!error && data) {
      return toSavedGridView(data as SavedViewRow)
    }

    // 23505 is the unique-name index losing a race. The next pass picks the
    // suffixed name the winner took.
    if (error?.code !== "23505") {
      throw new AuthzError(500, "saved_view_create_failed", "Unable to create that view.")
    }
  }

  throw new AuthzError(409, "saved_view_name_taken", "That view name is taken.")
}

export async function updateSavedView(params: {
  staff: StaffContext
  surface: SavedViewSurface
  viewId: string
  name?: string
  config?: GridViewConfig
}): Promise<SavedGridView> {
  const { staff, surface, viewId } = params
  const patch: Record<string, unknown> = {}

  if (params.name !== undefined) {
    const name = params.name.trim()

    if (name.length === 0 || name.length > 80) {
      throw new AuthzError(400, "saved_view_name_invalid", "A view name needs 1 to 80 characters.")
    }

    patch.name = name
  }

  if (params.config !== undefined) {
    const config = normalizeGridViewConfig(params.config)
    assertConfigSize(config)
    patch.config = config
  }

  if (Object.keys(patch).length === 0) {
    throw new AuthzError(400, "saved_view_patch_empty", "Nothing to change.")
  }

  const existing = await readViewRow(staff, surface, viewId)

  if (!canAccessView(staff, existing)) {
    throw new AuthzError(403, "saved_view_forbidden", "That view belongs to someone else.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .update(patch)
    .eq("program_id", staff.programId)
    .eq("surface", surface)
    .eq("id", viewId)
    .select(VIEW_COLUMNS)
    .maybeSingle()

  if (error?.code === "23505") {
    throw new AuthzError(409, "saved_view_name_taken", "That view name is already used.")
  }

  if (error) {
    throw new AuthzError(500, "saved_view_update_failed", "Unable to update that view.")
  }

  if (!data) {
    throw new AuthzError(404, "saved_view_not_found", "That view does not exist.")
  }

  return toSavedGridView(data as SavedViewRow)
}

export async function deleteSavedView(params: {
  staff: StaffContext
  surface: SavedViewSurface
  viewId: string
}): Promise<void> {
  const { staff, surface, viewId } = params
  const existing = await readViewRow(staff, surface, viewId)

  if (!canAccessView(staff, existing)) {
    throw new AuthzError(403, "saved_view_forbidden", "That view belongs to someone else.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_views")
    .delete()
    .eq("program_id", staff.programId)
    .eq("surface", surface)
    .eq("id", viewId)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "saved_view_delete_failed", "Unable to delete that view.")
  }

  if (!data) {
    throw new AuthzError(404, "saved_view_not_found", "That view does not exist.")
  }
}
