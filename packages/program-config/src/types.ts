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
    airtableManage: boolean
  }
}

export type AirtableFieldAccess = "writable" | "read-only"

export interface AirtableFieldMapping {
  id: string
  label: string
  type: string
  access: AirtableFieldAccess
}

export interface AirtableTableMapping {
  id: string
  name: string
  primaryFieldId: string
  fields: Record<string, AirtableFieldMapping>
}

export interface AirtableInterfaceMapping {
  id: string
  name: string
  pages: Record<string, { id: string; name: string; type: string; sourceTable?: string }>
}

export interface ServerProgramProfile extends PublicProgramProfile {
  envPrefix: "FOLK" | "GITA_LIFE"
  airtable: {
    baseId: string
    baseName: string
    tables: {
      contacts: AirtableTableMapping
      attendance: AirtableTableMapping
      sessions: AirtableTableMapping
      users: AirtableTableMapping
      locations: AirtableTableMapping
    }
    interfaces: {
      adminPortal: AirtableInterfaceMapping
    }
  }
}
