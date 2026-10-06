import type { ProgramId } from "@hkmc/data-contracts"

export interface ProgramBranding {
  name: string
  shortName: string
  portalLabel: string
  publicPath: string
  primaryColor: string
  accentColor: string
  logoSrc: string
  logoAlt: string
  headerLogoSrc?: string
  headerLogoAlt?: string
}

export interface PublicProgramProfile {
  id: ProgramId
  branding: ProgramBranding
  modules: {
    publicRegistration: boolean
    publicAttendance: boolean
    staffContacts: boolean
    sessions: boolean
    staffInvites: boolean
  }
}

export interface ServerProgramProfile extends PublicProgramProfile {
  envPrefix: "FOLK" | "GITA_LIFE"
}
