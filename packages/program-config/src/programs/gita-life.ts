import type { ServerProgramProfile } from "../types"
import { adminPortalInterface, operationalTables } from "./shared-airtable"

const writable = "writable" as const

const gitaLifeTables = {
  ...operationalTables,
  contacts: {
    ...operationalTables.contacts,
    fields: {
      ...operationalTables.contacts.fields,
      address: { id: "fldvXxsgxnybw6nPA", label: "Address", type: "singleLineText", access: writable },
      designation: { id: "fldVkz3c5p6GuFBrg", label: "Designation", type: "singleLineText", access: writable },
    },
  },
}

export const gitaLifeProgramProfile = {
  id: "gita-life",
  envPrefix: "GITA_LIFE",
  branding: {
    name: "Gita Life",
    shortName: "Gita Life",
    portalLabel: "Gita Life Portal",
    publicPath: "/activities/gita-life",
    primaryColor: "#2D0A0A",
    accentColor: "#EA580C",
    logoSrc: "/assets/activities/gita-life/Gita_life_logo.png",
    logoAlt: "Gita Life Logo",
    headerLogoSrc: "/assets/activities/gita-life/iskcon-thiruvanmiyur-header.webp",
    headerLogoAlt: "Srila Prabhupada's ISKCON Thiruvanmiyur Chennai Logo",
  },
  modules: {
    publicRegistration: true,
    publicAttendance: true,
    staffContacts: true,
    sessions: true,
    staffInvites: true,
    airtableManage: true,
  },
  airtable: {
    baseId: "appzbssqNK53yqjZH",
    baseName: "Gita Life",
    tables: gitaLifeTables,
    interfaces: {
      adminPortal: adminPortalInterface,
    },
  },
} satisfies ServerProgramProfile
