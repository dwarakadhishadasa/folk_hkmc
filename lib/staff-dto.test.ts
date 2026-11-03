import { describe, expect, it } from "vitest"

import type { StaffContext } from "./authz"
import { toClientStaff } from "./staff-dto"

function staff(overrides: Partial<StaffContext> = {}): StaffContext {
  return {
    programId: "folk",
    supabaseUserId: "user-1",
    email: "anand@example.com",
    userId: "user-1",
    name: "Anand",
    role: "Preacher",
    status: "Active",
    locationIds: ["loc-1"],
    patchOwner: { userId: "user-1", role: "Preacher", name: "Anand", locationIds: ["loc-1"] },
    hasActiveCallerProfile: false,
    lastSyncedAt: "2026-11-03T00:00:00.000Z",
    ...overrides,
  }
}

describe("toClientStaff", () => {
  it("never carries the server-only patch owner or its locations", () => {
    const result = toClientStaff(
      staff({
        role: "Assistant",
        userId: "assistant-1",
        name: "Suresh",
        locationIds: [],
        patchOwner: {
          userId: "admin-1",
          role: "Admin",
          name: "Kavitha",
          locationIds: ["loc-9"],
        },
      }),
    )

    expect(result).not.toHaveProperty("patchOwner")
    expect(result.locationIds).toEqual([])
    expect(result.supervisorName).toBe("Kavitha")
    expect(result.supervisorRole).toBe("Admin")
  })

  it("gives an Admin the operational surfaces and the campaign admin surface", () => {
    const result = toClientStaff(
      staff({
        role: "Admin",
        patchOwner: { userId: "user-1", role: "Admin", name: "Anand", locationIds: ["loc-1"] },
      }),
    )

    expect(result.hasPatchScope).toBe(true)
    expect(result.canReadContacts).toBe(true)
    expect(result.canManage).toBe(true)
    expect(result.canInviteVolunteers).toBe(false)
    expect(result.canUseCampaignAdmin).toBe(true)
    expect(result.supervisorName).toBeNull()
    expect(result.supervisorRole).toBeNull()
  })

  it("gives a Preacher the volunteer invite surface", () => {
    const result = toClientStaff(staff())
    expect(result.canReadContacts).toBe(true)
    expect(result.canManage).toBe(true)
    expect(result.canInviteVolunteers).toBe(true)
  })

  it("gives an Assistant with a patch the contacts and manage surfaces", () => {
    const result = toClientStaff(
      staff({
        role: "Assistant",
        userId: "assistant-1",
        name: "Suresh",
        patchOwner: {
          userId: "admin-1",
          role: "Admin",
          name: "Kavitha",
          locationIds: ["loc-1"],
        },
      }),
    )

    expect(result.hasPatchScope).toBe(true)
    expect(result.canReadContacts).toBe(true)
    expect(result.canManage).toBe(true)
    expect(result.canInviteVolunteers).toBe(false)
    expect(result.canUseCampaignAdmin).toBe(true)
  })

  it("hides the contacts and manage surfaces for an Assistant without a patch", () => {
    const result = toClientStaff(
      staff({
        role: "Assistant",
        userId: "assistant-1",
        name: "Suresh",
        patchOwner: null,
      }),
    )

    expect(result.hasPatchScope).toBe(false)
    expect(result.canReadContacts).toBe(false)
    expect(result.canManage).toBe(false)
    expect(result.canInviteVolunteers).toBe(false)
    expect(result.supervisorName).toBeNull()
    expect(result.supervisorRole).toBeNull()
  })

  it("keeps a Volunteer on the contact form and caller queue", () => {
    const result = toClientStaff(
      staff({
        role: "Volunteer",
        hasActiveCallerProfile: true,
        patchOwner: null,
      }),
    )

    expect(result.canReadContacts).toBe(false)
    expect(result.canManage).toBe(false)
    expect(result.canUseCampaignAdmin).toBe(false)
    expect(result.canUseCallerQueue).toBe(true)
  })
})
