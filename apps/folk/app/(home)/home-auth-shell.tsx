"use client"

import type { ReactNode } from "react"

import { AuthProvider } from "@/lib/auth-context"
import type { ClientStaff } from "@/lib/staff-dto"

/**
 * Seeds the FOLK home's header from the server-resolved staff row. Anonymous
 * visitors keep the root provider so the shared auth fetch still runs on the
 * paths that need it.
 */
export function HomeAuthShell({
  staff,
  children,
}: {
  staff: ClientStaff | null
  children: ReactNode
}) {
  if (!staff) {
    return <>{children}</>
  }

  return <AuthProvider initialStaff={staff}>{children}</AuthProvider>
}
