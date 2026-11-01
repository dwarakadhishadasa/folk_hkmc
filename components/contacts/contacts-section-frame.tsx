import type { ReactNode } from "react"

import { ContactsSectionShell } from "@/components/contacts/contacts-section-shell"
import { summarizeContactsSection } from "@/components/contacts/contacts-types"
import type { ContactsSectionPayload } from "@/components/contacts/contacts-types"
import { Header } from "@/components/header"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import type { StaffContext } from "@/lib/authz"

/**
 * The section frame every `/contacts*` page shares.
 *
 * The height is a bounded column, not the page-scrolling shape Campaigns uses:
 * the grid must own the only scroller on its page, and a page-level scroller
 * above it is the nested scrollbar `grid-scroll-surface.spec.ts` exists to
 * prevent. Overview and Reports scroll inside the same bound instead.
 */
export function ContactsSectionFrame({
  staff,
  title,
  payload,
  headerAction,
  phoneAction,
  children,
}: {
  staff: StaffContext
  title: string
  payload: ContactsSectionPayload
  headerAction?: ReactNode
  phoneAction?: ReactNode
  children: ReactNode
}) {
  const summary = summarizeContactsSection(payload)

  return (
    <StaffAuthShell staff={staff}>
      <div className="flex h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col overflow-hidden bg-background">
        <Header />
        <main className="flex min-h-0 w-full flex-1 flex-col px-4 py-6 sm:px-6">
          <ContactsSectionShell
            title={title}
            contactCount={summary.contactCount}
            locationCount={summary.locationCount}
            headerAction={headerAction}
            phoneAction={phoneAction}
          >
            {children}
          </ContactsSectionShell>
        </main>
      </div>
    </StaffAuthShell>
  )
}
