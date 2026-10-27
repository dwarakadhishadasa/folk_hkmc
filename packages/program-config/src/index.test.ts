import { describe, expect, it } from "vitest"

import { PROGRAM_IDS } from "@hkmc/data-contracts"

import { getPublicProgramProfile, publicProgramProfiles } from "./index"

/**
 * The public profile map is `satisfies Record<ProgramId, PublicProgramProfile>`,
 * which is a compile-time promise only. These tests are the runtime half: a new
 * id added to `PROGRAM_IDS` without a matching profile compiles fine and fails
 * here.
 */

describe("publicProgramProfiles", () => {
  it("keys exactly the program ids, with nothing extra", () => {
    expect(Object.keys(publicProgramProfiles).sort()).toEqual([...PROGRAM_IDS].sort())
  })

  it.each([...PROGRAM_IDS])("gives %s branding and the six module flags", (programId) => {
    const profile = getPublicProgramProfile(programId)

    expect(profile.id).toBe(programId)
    expect(profile.branding.name).toBeTypeOf("string")
    expect(profile.branding.publicPath.startsWith("/")).toBe(true)
    expect(Object.keys(profile.modules).sort()).toEqual([
      "dialer",
      "publicAttendance",
      "publicRegistration",
      "sessions",
      "staffContacts",
      "staffInvites",
    ])
    expect(Object.values(profile.modules).every((enabled) => typeof enabled === "boolean")).toBe(true)
  })
})

describe("getPublicProgramProfile", () => {
  it("returns distinct profiles for the two programs", () => {
    const folk = getPublicProgramProfile("folk")
    const gitaLife = getPublicProgramProfile("gita-life")

    expect(folk).not.toBe(gitaLife)
    expect(folk.id).not.toBe(gitaLife.id)
  })
})
