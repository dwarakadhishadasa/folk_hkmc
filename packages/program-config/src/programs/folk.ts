import type { ServerProgramProfile } from "../types"
import { adminPortalInterface, operationalTables } from "./shared-airtable"

const writable = "writable" as const

const folkTables = {
  ...operationalTables,
  contacts: {
    ...operationalTables.contacts,
    fields: {
      ...operationalTables.contacts.fields,
      address: { id: "fldaNPo4ptlc0Pbwh", label: "Address", type: "singleLineText", access: writable },
    },
  },
}

export const folkProgramProfile = {
  id: "folk",
  envPrefix: "FOLK",
  branding: {
    name: "FOLK Chennai",
    shortName: "FOLK",
    portalLabel: "FOLK Portal",
    publicPath: "/activities/folk",
    primaryColor: "#0F1E54",
    accentColor: "#F98B1C",
    logoSrc: "/images/folk-logo.jpg",
    logoAlt: "FOLK Chennai Logo",
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
    baseId: "appqea9DRLOXqErXb",
    baseName: "FOLK Chennai",
    tables: folkTables,
    interfaces: {
      adminPortal: adminPortalInterface,
    },
  },
} satisfies ServerProgramProfile
