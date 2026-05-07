"use client"

import type { ReactNode } from "react"
import { AuthProvider } from "@/lib/auth-context"
import type { StaffContext } from "@/lib/authz"

export function StaffAuthShell({ children, staff }: { children: ReactNode; staff: StaffContext }) {
  return <AuthProvider initialStaff={staff}>{children}</AuthProvider>
}
