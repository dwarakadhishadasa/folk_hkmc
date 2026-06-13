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
    primaryColor: "#2D0A0A",
    accentColor: "#EA580C",
    logoSrc: "/assets/activities/gita-life/Gita_life_logo.png",
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
