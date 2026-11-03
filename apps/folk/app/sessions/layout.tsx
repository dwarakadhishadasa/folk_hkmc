import type { ReactNode } from "react"

import { Header } from "@/components/header"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, type StaffContext } from "@/lib/authz"
import { toClientStaff } from "@/lib/staff-dto"

import { getSessionsStaff } from "./staff"

export const dynamic = "force-dynamic"

/**
 * The Sessions shell. The header belongs here rather than in each page, and the
 * page owns the role refusal: only the page knows which route the reader asked
 * for, so redirecting from the layout would always name the section root.
 */
export default async function SessionsLayout({ children }: { children: ReactNode }) {
  let staff: StaffContext | null = null

  try {
    staff = await getSessionsStaff()
  } catch (error) {
    if (!(error instanceof AuthzError)) {
      throw error
    }
  }

  if (!staff) {
    return <>{children}</>
  }

  return (
    <StaffAuthShell staff={toClientStaff(staff)}>
      <div className="flex min-h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col bg-background">
        <Header />
        <main className="flex w-full flex-1 flex-col gap-5 p-6">{children}</main>
      </div>
    </StaffAuthShell>
  )
}
