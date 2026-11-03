import type { ReactNode } from "react"

import { Header } from "@/components/header"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, type StaffContext } from "@/lib/authz"
import { toClientStaff } from "@/lib/staff-dto"

import { getCampaignStaff } from "./staff"

export const dynamic = "force-dynamic"

/**
 * The Campaign shell.
 *
 * The header and the sub-nav belong here rather than in each page: the tabs a
 * staff member may see are a property of the role and the caller profile, not
 * of the page underneath, and a page that rendered its own tabs could render
 * the wrong set.
 *
 * An unresolved staff context is **not** refused here. The page owns the
 * refusal, because only the page knows which boundary it applies and which
 * page the reader asked for; refusing in the layout would send every refusal
 * to the section root.
 */
export default async function CampaignsLayout({ children }: { children: ReactNode }) {
  let staff: StaffContext | null = null

  try {
    staff = await getCampaignStaff()
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
      {/*
        The height is the viewport **less the fixed bottom nav** on a phone.
        The nav is `fixed`, so it floats over the page; the body's padding
        reserves the space for scrolling pages, but a shell that claims the
        whole viewport has to subtract the same reservation or its last
        element ends underneath the nav. `--mobile-app-nav-inset` is that
        reservation, and it is `0` on a desktop, where there is no nav.
      */}
      <div className="flex min-h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col bg-background">
        <Header />
        <main className="flex w-full flex-1 flex-col gap-5 p-6">
          {children}
        </main>
      </div>
    </StaffAuthShell>
  )
}
