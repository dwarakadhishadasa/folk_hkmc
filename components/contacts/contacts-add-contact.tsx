"use client"

import Link from "next/link"
import { Plus } from "lucide-react"

import { useNavigationFeedback } from "@/components/navigation-feedback-provider"

/**
 * The section's one create control.
 *
 * It opens the form rather than an inline draft: only the form lets the
 * operator choose the preacher and the location, and the grid's own
 * `Add record` is deliberately not rendered on the Contacts tab.
 *
 * Desktop is a 40px button with an 8px radius; the phone is a pill on the title
 * row. One control, two shapes — not two controls.
 */
export function ContactsAddContact() {
  const { startNavigation } = useNavigationFeedback()

  return (
    <Link
      href="/contact"
      onClick={() => startNavigation("/contact")}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)] focus-visible:ring-offset-2 md:h-10 md:rounded-lg md:px-4 md:text-[13px]"
    >
      <Plus aria-hidden="true" className="size-4" />
      Add contact
    </Link>
  )
}
