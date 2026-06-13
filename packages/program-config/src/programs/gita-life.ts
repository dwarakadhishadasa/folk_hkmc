import type { ServerProgramProfile } from "../types"
import { adminPortalInterface, operationalTables } from "./shared-airtable"

export const gitaLifeProgramProfile = {
  id: "gita-life",
  envPrefix: "GITA_LIFE",
  branding: {
    name: "Gita Life",
    shortName: "Gita Life",
    portalLabel: "Gita Life Portal",
    publicPath: "/activities/gita-life",
    primaryColor: "#123A5A",
    accentColor: "#D99A20",
    logoAlt: "Gita Life Logo",
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
    tables: operationalTables,
    interfaces: {
      adminPortal: adminPortalInterface,
    },
  },
} satisfies ServerProgramProfile
