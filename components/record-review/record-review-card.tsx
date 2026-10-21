"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * One card in the roster.
 *
 * The shape is the one the Airtable interface uses: a thumbnail on the left, a
 * title, and one secondary line under it. It is a component rather than a
 * layout baked into the list so a consumer that has no thumbnail, or a second
 * line it does not want, can leave the slot out without the list growing a
 * conditional.
 *
 * The card carries no click handler and no selection state of its own: the
 * list owns both, because the list is what knows which record is focused and
 * what the selection means. What the card owns is the *content* — the parts a
 * consumer composes and the primitive arranges.
 */
export interface RecordReviewCardProps {
  /** The record's title. */
  title: ReactNode
  /** The one secondary line under the title. */
  subtitle?: ReactNode
  /** The thumbnail. Omit it and the title starts at the left edge. */
  thumbnail?: ReactNode
  /** Applied to the content column, for a consumer that needs to align it. */
  className?: string
}

export function RecordReviewCard({ title, subtitle, thumbnail, className }: RecordReviewCardProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {thumbnail ? <div className="flex-none">{thumbnail}</div> : null}
      <div className="min-w-0 flex-auto">
        <div className="truncate text-[13px] font-medium text-[var(--program-text)]">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
    </div>
  )
}
