import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { ManagePortal } from "@/components/manage/manage-portal"
import { isManageView, resolveManageMode } from "@/components/manage/manage-types"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"
import { loadManagePortalData } from "@/lib/supabase/manage"

export const dynamic = "force-dynamic"

interface ManagePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export default async function ManagePage({ searchParams }: ManagePageProps) {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])

    const params = await searchParams
    const requestedView = firstValue(params.view)
    const initialView = isManageView(requestedView) ? requestedView : "dashboard"
    const mode = resolveManageMode(firstValue(params.mode))

    const payload = await loadManagePortalData({ staff, mode })

    return (
      <StaffAuthShell staff={staff}>
        {/*
          `h-dvh` + `overflow-hidden`, and `main` a bounded flex column: this is
          where the height the grid fills is established. Nothing below may assert
          a viewport fraction — the offset above the grid is not a constant (the
          header height, a tab row that wraps at narrow widths, and a scope notice
          that renders only in preacher mode all move it), so the chain has to
          carry the height down instead. Each tab is then its own scroller, and
          Contacts is the one surface with a single one.
        */}
        <div className="flex h-dvh flex-col overflow-hidden bg-background">
          <Header />
          <main className="container mx-auto flex min-h-0 flex-1 flex-col px-4 py-6">
            <ManagePortal payload={payload} initialView={initialView} />
          </main>
        </div>
      </StaffAuthShell>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/manage")
    }

    if (error instanceof AuthzError) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[manage] portal data load failed", error)
    throw error
  }
}