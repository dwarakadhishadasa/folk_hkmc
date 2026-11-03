"use client"

import type { ReactNode } from "react"
import { AuthProvider } from "@/lib/auth-context"
import type { ClientStaff } from "@/lib/staff-dto"

export function StaffAuthShell({ children, staff }: { children: ReactNode; staff: ClientStaff }) {
  return <AuthProvider initialStaff={staff}>{children}</AuthProvider>
}
