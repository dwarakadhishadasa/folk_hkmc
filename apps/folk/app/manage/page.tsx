import { redirect } from "next/navigation"
import { isGridParamKey } from "@/components/grid/grid-view-state"
import { Header } from "@/components/header"
import { ManagePortal } from "@/components/manage/manage-portal"
import { isManageView, resolveManageMode } from "@/components/manage/manage-types"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"
import { loadContactRecordAvailability } from "@/lib/contacts/record"
import { OPERATIONAL_ROLES } from "@/lib/staff-roles"
import { toClientStaff } from "@/lib/staff-dto"
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

/**
 * The grid parameters a retired `/manage?view=contacts` link carries forward.
 *
 * Only grid-owned keys travel: `mode` is deliberately dropped, because the
 * section is personal-scope and has no scope switch. Keeping it would make a
 * shared link look like it carried a choice the destination cannot honour.
 */
function contactsGridRedirect(params: Record<string, string | string[] | undefined>): string {
  const next = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || !isGridParamKey(key)) {
      continue
    }

    for (const entry of Array.isArray(value) ? value : [value]) {
      next.append(key, entry)
    }
  }

  const query = next.toString()

  return query.length > 0 ? `/contacts/grid?${query}` : "/contacts/grid"
}

export default async function ManagePage({ searchParams }: ManagePageProps) {
  const params = await searchParams
  const requestedView = firstValue(params.view)

  /*
   * A retired link, rewritten before any staff read. Doing it outside the
   * `try` is load-bearing: `redirect()` throws a control-flow error that must
   * not be caught and reported as a data-load failure.
   */
  if (requestedView === "contacts") {
    redirect(contactsGridRedirect(params))
  }

  try {
    const staff = await getStaffContext()
    requireRole(staff, OPERATIONAL_ROLES)

    const initialView = isManageView(requestedView) ? requestedView : "dashboard"
    const mode = staff.role === "Admin" ? resolveManageMode(firstValue(params.mode)) : "preacher"

    const payload = await loadManagePortalData({ staff, mode })

    // The manage Sessions pills are triggers only where the record gateway
    // would authorize the contact. One availability read over this session
    // set; the payload's contact set is not a second rule.
    const attendeeIds = [
      ...new Set(payload.sessions.flatMap((session) => session.attendees.map((attendee) => attendee.contactId))),
    ]
    const recordAvailability = await loadContactRecordAvailability({
      staff,
      contactIds: attendeeIds,
    })

    return (
      <StaffAuthShell staff={toClientStaff(staff)}>
        {/*
          `overflow-hidden`, and `main` a bounded flex column: this is
          where the height the grid fills is established. Nothing below may assert
          a viewport fraction — the offset above the grid is not a constant (the
          header height, a tab row that wraps at narrow widths, and a scope notice
          that renders only in preacher mode all move it), so the chain has to
          carry the height down instead. Each remaining tab is then its own
          scroller; the contacts grid now lives in its own section at
          `/contacts/grid`.

          The height is the viewport **less the fixed bottom nav** on a phone.
          The nav is `fixed`, so it floats over the page; the space it takes is
          reserved by the body's padding, and a page that claims the whole
          viewport has to subtract the same reservation or it ends underneath
          it. `--mobile-app-nav-inset` is that reservation, and it is `0` on a
          desktop, where there is no nav.
        */}
        <div className="flex h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col overflow-hidden bg-background">
          <Header />
          {/*
             * `sm:px-6`, matching the app header's own gutter at the same
             * breakpoint (`header.tsx`'s `px-4 sm:px-6`). The two were `px-4`
             * against `sm:px-6`, so the logo sat 8px right of the grid's left
             * edge on every desktop width — a visible jog on the one axis a page
             * is read along, and one that could only be fixed here rather than in
             * the header: `components/header.tsx` is consumed by 22 route
             * surfaces, and its gutter is the thing that was already correct.
             *
             * The grid's outer border is 1px inside this padding, so the table's
             * edge lands one pixel in from the logo's — the frame's own hairline,
             * not a misalignment.
             */}
          <main className="flex min-h-0 w-full flex-1 flex-col px-4 py-6 sm:px-6">
            <ManagePortal
              payload={payload}
              initialView={initialView}
              recordAvailableContactIds={[...recordAvailability]}
            />
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