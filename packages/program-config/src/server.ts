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
