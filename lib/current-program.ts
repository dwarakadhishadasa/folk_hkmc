import { isProgramId } from "@hkmc/data-contracts"
import { getPublicProgramProfile } from "@hkmc/program-config"

export function getCurrentProgramProfile() {
  const configuredProgramId = process.env.NEXT_PUBLIC_PROGRAM_ID
  return getPublicProgramProfile(configuredProgramId && isProgramId(configuredProgramId) ? configuredProgramId : "folk")
}

export const currentProgramProfile = getCurrentProgramProfile()
