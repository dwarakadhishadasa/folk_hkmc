import type { ReactNode } from "react"

import { SectionCard } from "@/components/section-card"
import { cn } from "@/lib/utils"

/**
 * A reports card. It is the same white `SectionCard` every other Overview
 * uses — Contacts, Sessions and the Dashboard — so the campaign reports sit on
 * the same title baseline, border and padding as the rest of the product
 * rather than on a second card shape of their own.
 */
export function ReportCard({
  title,
  subtitle,
  badge,
  children,
  className,
}: {
  title: string
  subtitle?: string
  /** A short label on the title row, e.g. the card's scope. */
  badge?: string
  children: ReactNode
  className?: string
}) {
  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      badge={badge}
      className={cn("overflow-hidden", className)}
    >
      {children}
    </SectionCard>
  )
}
