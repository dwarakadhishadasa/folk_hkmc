import "server-only"

import { redirect } from "next/navigation"

import type { ContactsSectionPayload } from "@/components/contacts/contacts-types"
import { AuthzError, getStaffContext, type StaffContext } from "@/lib/authz"
import { loadContactsSectionData } from "@/lib/supabase/manage"

/**
 * The read every `/contacts*` page performs before it renders.
 *
 * The role refusal is a redirect to the form rather than the generic auth
 * error: `Volunteer` and `Assistant` keep the form-only path, and landing them
 * on an error page for a section they were never given would be a punishment
 * for following a link. An unauthenticated request still goes to `/login` with
 * the path it asked for.
 *
 * `redirect()` throws a control-flow error, so each one is called outside a
 * `try` that could swallow it. A redirect logged as a data-load failure reads
 * like an outage in the logs.
 */
export async function loadContactsSectionPage(params: {
  /** The path, including its query string, to return to after sign-in. */
  redirectTo: string
}): Promise<{ staff: StaffContext; payload: ContactsSectionPayload }> {
  let staff: StaffContext

  try {
    staff = await getStaffContext()
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect(`/login?redirect=${encodeURIComponent(params.redirectTo)}`)
    }

    if (error instanceof AuthzError) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    throw error
  }

  if (staff.role !== "Admin" && staff.role !== "Preacher") {
    redirect("/contact")
  }

  try {
    const payload = await loadContactsSectionData({ staff })

    return { staff, payload }
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect(`/login?redirect=${encodeURIComponent(params.redirectTo)}`)
    }

    if (error instanceof AuthzError) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[contacts] section data load failed", error)
    throw error
  }
}
