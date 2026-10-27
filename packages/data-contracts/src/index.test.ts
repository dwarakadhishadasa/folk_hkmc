import { describe, expect, it } from "vitest"

import {
  PROGRAM_IDS,
  STAFF_MEMBERSHIP_STATUSES,
  STAFF_ROLES,
  isProgramId,
  isStaffMembershipStatus,
  isStaffRole,
} from "./index"

/**
 * These guards are the boundary between an untrusted string and a narrowed
 * type: `isProgramId` decides whether a route may read `folk` or `gita-life`,
 * and `isStaffRole` decides whether a roster row is representable at all.
 *
 * The last case in each block is the one that matters. A lookup implemented
 * with `in` or a bare object index answers `true` for `constructor` and
 * `__proto__`, which is how a prototype key becomes an authorization value.
 */

describe("isProgramId", () => {
  it.each([...PROGRAM_IDS])("accepts the known program %s", (value) => {
    expect(isProgramId(value)).toBe(true)
  })

  it.each(["", "FOLK", "gita", "folk ", "constructor", "__proto__"])("rejects %j", (value) => {
    expect(isProgramId(value)).toBe(false)
  })
})

describe("isStaffRole", () => {
  it("accepts exactly the four roles the schema defines", () => {
    expect([...STAFF_ROLES]).toEqual(["Admin", "Preacher", "Volunteer", "Assistant"])
  })

  it.each([...STAFF_ROLES])("accepts %s", (value) => {
    expect(isStaffRole(value)).toBe(true)
  })

  it.each(["admin", "SuperAdmin", "", "toString"])("rejects %j", (value) => {
    expect(isStaffRole(value)).toBe(false)
  })
})

describe("isStaffMembershipStatus", () => {
  it.each([...STAFF_MEMBERSHIP_STATUSES])("accepts %s", (value) => {
    expect(isStaffMembershipStatus(value)).toBe(true)
  })

  it.each(["active", "Deleted", ""])("rejects %j", (value) => {
    expect(isStaffMembershipStatus(value)).toBe(false)
  })
})
