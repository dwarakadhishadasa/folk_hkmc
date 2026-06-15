import "server-only"

import { isProgramId, type ProgramId } from "@hkmc/data-contracts"
import type { ServerProgramProfile } from "./types"
import { folkProgramProfile } from "./programs/folk"
import { gitaLifeProgramProfile } from "./programs/gita-life"

export type { ServerProgramProfile } from "./types"

export const serverProgramProfiles = {
  folk: folkProgramProfile,
  "gita-life": gitaLifeProgramProfile,
} satisfies Record<ProgramId, ServerProgramProfile>

export function resolveProgramId(value = process.env.PROGRAM_ID || process.env.NEXT_PUBLIC_PROGRAM_ID): ProgramId {
  if (!value) {
    return "folk"
  }

  if (!isProgramId(value)) {
    throw new Error(`Unsupported PROGRAM_ID: ${value}`)
  }

  return value
}

export function getServerProgramProfile(programId: ProgramId = resolveProgramId()): ServerProgramProfile {
  return serverProgramProfiles[programId]
}

export function getProgramScopedEnv(profile: Pick<ServerProgramProfile, "envPrefix">, name: string): string | undefined {
  return process.env[`${profile.envPrefix}_${name}`] || process.env[name]
}

function getProgramScopedIdEnv(profile: ServerProgramProfile, name: string): string | undefined {
  const prefixedValue = process.env[`${profile.envPrefix}_${name}`]?.trim()
  if (prefixedValue) {
    return prefixedValue
  }

  return profile.id === "folk" ? process.env[name]?.trim() || undefined : undefined
}

export function getProgramAirtableManagementUrl(programId: ProgramId = resolveProgramId()): string | null {
  const profile = getServerProgramProfile(programId)
  const explicitUrl = getProgramScopedIdEnv(profile, "AIRTABLE_MANAGEMENT_URL")

  if (explicitUrl) {
    try {
      const url = new URL(explicitUrl)
      return url.protocol === "https:" && url.hostname.endsWith("airtable.com") ? url.toString() : null
    } catch {
      return null
    }
  }

  const baseId = getProgramScopedIdEnv(profile, "AIRTABLE_BASE_ID") || profile.airtable.baseId
  const pageId =
    getProgramScopedIdEnv(profile, "AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID") ||
    profile.airtable.interfaces.adminPortal.pages.dashboard.id

  if (!baseId || !pageId) {
    return null
  }

  return `https://airtable.com/${baseId}/${pageId}`
}
