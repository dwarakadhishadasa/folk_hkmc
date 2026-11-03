import { describe, expect, it } from "vitest"

import { isEligiblePatchOwnerRow, resolvePatchOwner, type PatchOwnerRow } from "./staff-patch"

function row(overrides: Partial<PatchOwnerRow> = {}): PatchOwnerRow {
  return {
    id: "user-1",
    programId: "folk",
    name: "Anand",
    role: "Preacher",
    status: "Active",
    locationIds: ["loc-1"],
    ...overrides,
  }
}

describe("resolvePatchOwner", () => {
  it("resolves an Admin to themselves", () => {
    expect(resolvePatchOwner(row({ role: "Admin" }), null)).toEqual({
      userId: "user-1",
      role: "Admin",
      name: "Anand",
      locationIds: ["loc-1"],
    })
  })

  it("resolves a Preacher to themselves", () => {
    expect(resolvePatchOwner(row(), null)).toEqual({
      userId: "user-1",
      role: "Preacher",
      name: "Anand",
      locationIds: ["loc-1"],
    })
  })

  it("resolves an Assistant to an Active Admin", () => {
    const assistant = row({ id: "assistant-1", role: "Assistant" })
    const admin = row({ id: "admin-1", role: "Admin", name: "Kavitha" })

    expect(resolvePatchOwner(assistant, admin)).toEqual({
      userId: "admin-1",
      role: "Admin",
      name: "Kavitha",
      locationIds: ["loc-1"],
    })
  })

  it("resolves an Assistant to an Active Preacher", () => {
    const assistant = row({ id: "assistant-1", role: "Assistant" })
    expect(resolvePatchOwner(assistant, row({ id: "preacher-1" }))?.userId).toBe("preacher-1")
  })

  it("yields null for an inactive assignee", () => {
    const assistant = row({ id: "assistant-1", role: "Assistant" })
    expect(resolvePatchOwner(assistant, row({ status: "Inactive" }))).toBeNull()
  })

  it("yields null for a wrong-role assignee", () => {
    const assistant = row({ id: "assistant-1", role: "Assistant" })
    expect(resolvePatchOwner(assistant, row({ role: "Volunteer" }))).toBeNull()
  })

  it("yields null for a cross-programme assignee", () => {
    const assistant = row({ id: "assistant-1", role: "Assistant", programId: "folk" })
    expect(resolvePatchOwner(assistant, row({ programId: "gita-life" }))).toBeNull()
  })

  it("yields null for an Assistant with no assignee", () => {
    expect(resolvePatchOwner(row({ role: "Assistant" }), null)).toBeNull()
  })

  it("yields null for a Volunteer", () => {
    expect(resolvePatchOwner(row({ role: "Volunteer" }), row({ id: "preacher-1" }))).toBeNull()
  })
})

describe("isEligiblePatchOwnerRow", () => {
  it("accepts only an Active Admin or Preacher in the same programme", () => {
    expect(isEligiblePatchOwnerRow(row(), "folk")).toBe(true)
    expect(isEligiblePatchOwnerRow(row({ role: "Admin" }), "folk")).toBe(true)
    expect(isEligiblePatchOwnerRow(row({ status: "Suspended" }), "folk")).toBe(false)
    expect(isEligiblePatchOwnerRow(row({ role: "Assistant" }), "folk")).toBe(false)
    expect(isEligiblePatchOwnerRow(row({ programId: "gita-life" }), "folk")).toBe(false)
    expect(isEligiblePatchOwnerRow(null, "folk")).toBe(false)
  })
})
