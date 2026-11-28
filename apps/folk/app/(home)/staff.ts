import "server-only"

import { cache } from "react"

import { AuthzError, getStaffContext } from "@/lib/authz"
import { toClientStaff, type ClientStaff } from "@/lib/staff-dto"
import { listLocations } from "@/lib/supabase/data"

/**
 * Home is public, so an unresolved session is not an error: it means the
 * anonymous header. Request-cached so the route fallback and the page share
 * one read.
 */
export const loadHomeStaff = cache(async (): Promise<ClientStaff | null> => {
  try {
    return toClientStaff(await getStaffContext())
  } catch (error) {
    if (!(error instanceof AuthzError) || error.status >= 500) {
      console.error("[home] staff resolution failed", error)
    }

    return null
  }
})

/**
 * Started by the layout and awaited by the page, so the venue read overlaps the
 * staff read instead of queueing behind it.
 */
export const loadHomeLocations = cache(async () => listLocations())
