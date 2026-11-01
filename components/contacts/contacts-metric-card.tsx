import type { ReactNode } from "react"

import { SectionCard } from "@/components/section-card"
import { cn } from "@/lib/utils"

/**
 * A card on the Contacts Overview and Reports.
 *
 * It is the same white section card as the Sessions Overview — Poppins title,
 * muted subtitle, and the card's own control on the title row — so the two
 * sections cannot disagree about their chrome.
 */
export function ContactsMetricCard({
  title,
  subtitle,
  mobileSubtitle,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  /** A shorter line shown under the title on the phone, when the desktop subtitle is too long. */
  mobileSubtitle?: string
  /** A short badge or control on the title row, e.g. the card's window. */
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      mobileSubtitle={mobileSubtitle}
      action={action}
      className={cn("overflow-hidden", className)}
    >
      <div className="flex flex-1 flex-col">{children}</div>
    </SectionCard>
  )
}

/**
 * The quiet sentence a card shows when its own window holds nothing.
 *
 * Not a zero bar and not an empty panel: a bar of length zero reads as a value,
 * and the reader needs to know the difference between "none here" and "none at
 * all".
 */
export function ContactsCardEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-center text-[12px] leading-5 text-[var(--muted-foreground)]">
      {children}
    </p>
  )
}
