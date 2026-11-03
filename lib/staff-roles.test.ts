import { describe, expect, it } from "vitest"

import {
  CAMPAIGN_ADMIN_ROLES,
  CONTACT_FORM_ROLES,
  MANAGE_CONTACT_WRITE_ROLES,
  OPERATIONAL_ROLES,
  STAFF_ADMIN_ROLES,
  VOLUNTEER_INVITE_ROLES,
} from "./staff-roles"

describe("staff role sets", () => {
  it("defines the operational set once", () => {
    expect(OPERATIONAL_ROLES).toEqual(["Admin", "Preacher", "Assistant"])
  })

  it("keeps the manage write gate equal to the operational set", () => {
    expect(MANAGE_CONTACT_WRITE_ROLES).toBe(OPERATIONAL_ROLES)
  })

  it("keeps the campaign admin surface on the operational set", () => {
    expect(CAMPAIGN_ADMIN_ROLES).toEqual(["Admin", "Preacher", "Assistant"])
  })

  it("keeps the contact form open to all four roles", () => {
    expect(CONTACT_FORM_ROLES).toEqual(["Admin", "Preacher", "Volunteer", "Assistant"])
  })

  it("keeps the volunteer invite surface Preacher-only", () => {
    expect(VOLUNTEER_INVITE_ROLES).toEqual(["Preacher"])
  })

  it("keeps staff administration Admin-only", () => {
    expect(STAFF_ADMIN_ROLES).toEqual(["Admin"])
  })
})
