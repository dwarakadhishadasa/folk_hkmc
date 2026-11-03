import { describe, expect, it } from "vitest"

import {
  supervisorErrorForRequirement,
  supervisorRequirementForRole,
  supervisorSatisfiesRequirement,
} from "./invite-supervisor"

describe("supervisorRequirementForRole", () => {
  it("clears the binding for Admin and Preacher", () => {
    expect(supervisorRequirementForRole("Admin")).toBe("none")
    expect(supervisorRequirementForRole("Preacher")).toBe("none")
  })

  it("requires an Admin or Preacher for Assistant", () => {
    expect(supervisorRequirementForRole("Assistant")).toBe("admin-or-preacher")
  })

  it("requires a Preacher for Volunteer", () => {
    expect(supervisorRequirementForRole("Volunteer")).toBe("preacher")
  })
})

describe("supervisorSatisfiesRequirement", () => {
  const programId = "folk"

  it("accepts an Active Admin for an Assistant", () => {
    expect(
      supervisorSatisfiesRequirement(
        "admin-or-preacher",
        { programId, role: "Admin", status: "Active" },
        programId,
      ),
    ).toBe(true)
  })

  it("accepts an Active Preacher for an Assistant", () => {
    expect(
      supervisorSatisfiesRequirement(
        "admin-or-preacher",
        { programId, role: "Preacher", status: "Active" },
        programId,
      ),
    ).toBe(true)
  })

  it("rejects a wrong role, an inactive row and a cross-programme row", () => {
    expect(
      supervisorSatisfiesRequirement(
        "admin-or-preacher",
        { programId, role: "Volunteer", status: "Active" },
        programId,
      ),
    ).toBe(false)
    expect(
      supervisorSatisfiesRequirement(
        "admin-or-preacher",
        { programId, role: "Admin", status: "Inactive" },
        programId,
      ),
    ).toBe(false)
    expect(
      supervisorSatisfiesRequirement(
        "admin-or-preacher",
        { programId: "gita-life", role: "Admin", status: "Active" },
        programId,
      ),
    ).toBe(false)
  })

  it("keeps the Volunteer binding Preacher-only", () => {
    expect(
      supervisorSatisfiesRequirement("preacher", { programId, role: "Admin", status: "Active" }, programId),
    ).toBe(false)
    expect(
      supervisorSatisfiesRequirement("preacher", { programId, role: "Preacher", status: "Active" }, programId),
    ).toBe(true)
  })
})

describe("supervisorErrorForRequirement", () => {
  it("keeps the user-facing label Preacher", () => {
    expect(supervisorErrorForRequirement("admin-or-preacher")).toBe("The assigned Preacher must be active.")
    expect(supervisorErrorForRequirement("preacher")).toBe("The assigned Preacher must be an active Preacher.")
    expect(supervisorErrorForRequirement("none")).toBeNull()
  })

  it("never says Supervisor", () => {
    for (const requirement of ["none", "preacher", "admin-or-preacher"] as const) {
      expect(supervisorErrorForRequirement(requirement) ?? "").not.toMatch(/supervisor/i)
    }
  })
})
