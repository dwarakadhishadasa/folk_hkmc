import type { ProgramId } from "@hkmc/data-contracts"
import type { PublicProgramProfile } from "./types"
import { folkProgramProfile } from "./programs/folk"
import { gitaLifeProgramProfile } from "./programs/gita-life"

export type { ProgramBranding, PublicProgramProfile } from "./types"
export type { ProgramId } from "@hkmc/data-contracts"

export const publicProgramProfiles = {
  folk: {
    id: folkProgramProfile.id,
    branding: folkProgramProfile.branding,
    modules: folkProgramProfile.modules,
  },
  "gita-life": {
    id: gitaLifeProgramProfile.id,
    branding: gitaLifeProgramProfile.branding,
    modules: gitaLifeProgramProfile.modules,
  },
} satisfies Record<ProgramId, PublicProgramProfile>

export function getPublicProgramProfile(programId: ProgramId): PublicProgramProfile {
  return publicProgramProfiles[programId]
}
