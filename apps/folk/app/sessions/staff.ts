import { cache } from "react"

import { getStaffContext } from "@/lib/authz"

/**
 * The staff context for the Sessions shell, resolved once per request. The
 * layout needs it for the header, the page for its own role gate, and React's
 * `cache` collapses the calls within a request.
 */
export const getSessionsStaff = cache(() => getStaffContext())
