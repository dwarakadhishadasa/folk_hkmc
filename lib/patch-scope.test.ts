import { describe, expect, it } from "vitest"

import {
  campaignScopeKind,
  contactInPatch,
  contactWriteAttribution,
  locationInPatch,
  sessionInPatch,
} from "./patch-scope"

describe("contactInPatch", () => {
  it("keeps only the owner's contacts", () => {
    expect(contactInPatch("owner-1", "owner-1")).toBe(true)
    expect(contactInPatch("owner-2", "owner-1")).toBe(false)
    expect(contactInPatch(null, "owner-1")).toBe(false)
  })

  it("yields nothing for a null owner, including unassigned rows", () => {
    expect(contactInPatch(null, null)).toBe(false)
    expect(contactInPatch("owner-1", null)).toBe(false)
  })
})

describe("sessionInPatch", () => {
  const assistantVector = { actorId: "assistant-1", actorRole: "Assistant" as const, ownerId: "admin-1" }

  it("includes the owner's preached and created sessions", () => {
    expect(sessionInPatch({ preacherId: "admin-1", createdById: "someone" }, assistantVector)).toBe(true)
    expect(sessionInPatch({ preacherId: "someone", createdById: "admin-1" }, assistantVector)).toBe(true)
  })

  it("includes the actor's own creations", () => {
    expect(sessionInPatch({ preacherId: "admin-1", createdById: "assistant-1" }, assistantVector)).toBe(true)
  })

  it("excludes a legacy row where the actor is preacher_id but not created_by", () => {
    expect(sessionInPatch({ preacherId: "assistant-1", createdById: "admin-2" }, assistantVector)).toBe(false)
  })

  it("yields nothing for a null owner, including the actor's own creations", () => {
    expect(
      sessionInPatch(
        { preacherId: "admin-1", createdById: "assistant-1" },
        { actorId: "assistant-1", actorRole: "Assistant", ownerId: null },
      ),
    ).toBe(false)
  })

  it("includes assistant-created sessions for a Preacher", () => {
    const preacherVector = { actorId: "preacher-1", actorRole: "Preacher" as const, ownerId: "preacher-1" }
    expect(
      sessionInPatch({ preacherId: "preacher-1", createdById: "assistant-1" }, preacherVector, ["assistant-1"]),
    ).toBe(true)
  })

  it("does not use the assistant-created term for an Assistant", () => {
    expect(
      sessionInPatch(
        { preacherId: "admin-2", createdById: "assistant-2" },
        assistantVector,
        ["assistant-2"],
      ),
    ).toBe(false)
  })
})

describe("locationInPatch", () => {
  it("uses the owner's location list", () => {
    expect(locationInPatch("loc-1", ["loc-1", "loc-2"])).toBe(true)
    expect(locationInPatch("loc-3", ["loc-1", "loc-2"])).toBe(false)
  })
})

describe("campaignScopeKind", () => {
  it("keeps an Admin at programme scope", () => {
    expect(campaignScopeKind("Admin", "admin-1")).toEqual({ kind: "program" })
  })

  it("scopes a Preacher or Assistant to the owner", () => {
    expect(campaignScopeKind("Preacher", "preacher-1")).toEqual({ kind: "preacher", userId: "preacher-1" })
    expect(campaignScopeKind("Assistant", "admin-1")).toEqual({ kind: "preacher", userId: "admin-1" })
  })

  it("refuses a null owner rather than widening", () => {
    expect(campaignScopeKind("Preacher", null)).toBeNull()
    expect(campaignScopeKind("Assistant", null)).toBeNull()
    expect(campaignScopeKind("Volunteer", "preacher-1")).toBeNull()
  })
})

describe("contactWriteAttribution", () => {
  it("stamps the owner and the actor separately", () => {
    expect(contactWriteAttribution({ actorId: "assistant-1", ownerId: "admin-1" })).toEqual({
      assignedPreacherId: "admin-1",
      collectedById: "assistant-1",
    })
  })

  it("refuses a create with no owner", () => {
    expect(contactWriteAttribution({ actorId: "assistant-1", ownerId: null })).toBeNull()
  })
})
