import type { ServerProgramProfile } from "../types"
import { adminPortalInterface, operationalTables } from "./shared-airtable"

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
    tables: operationalTables,
    interfaces: {
      adminPortal: adminPortalInterface,
    },
  },
} satisfies ServerProgramProfile
