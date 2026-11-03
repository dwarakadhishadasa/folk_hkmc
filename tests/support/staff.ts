/**
 * Staff fixtures for unit tests.
 *
 * Every authorization decision in this repo starts from a `StaffContext`, so a
 * test that needs "an Admin" or "an Assistant routed through a Preacher" should
 * build one here rather than hand-rolling the eight fields. Overrides are
 * shallow on purpose: each test names only the field it actually cares about,
 * which is what makes the assertion legible.
 */

import type { StaffContext } from "@/lib/authz"

/** A complete, valid context. Tests override one field at a time from here. */
const DEFAULT_STAFF: StaffContext = {
  programId: "folk",
  supabaseUserId: "00000000-0000-4000-8000-000000000101",
  email: "staff@example.test",
  userId: "00000000-0000-4000-8000-000000000102",
  name: "Test Staff",
  role: "Admin",
  status: "Active",
  locationIds: [],
  patchOwner: {
    userId: "00000000-0000-4000-8000-000000000102",
    role: "Admin",
    name: "Test Staff",
    locationIds: [],
  },
  hasActiveCallerProfile: false,
  lastSyncedAt: "2026-01-01T00:00:00.000Z",
}

export function staffContext(overrides: Partial<StaffContext> = {}): StaffContext {
  const merged = { ...DEFAULT_STAFF, ...overrides }

  if (overrides.patchOwner === undefined) {
    merged.patchOwner =
      merged.role === "Admin" || merged.role === "Preacher"
        ? {
            userId: merged.userId,
            role: merged.role,
            name: merged.name,
            locationIds: merged.locationIds,
          }
        : null
  }

  return merged
}
