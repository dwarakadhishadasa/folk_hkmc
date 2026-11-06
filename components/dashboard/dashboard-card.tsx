import type { ReactNode } from "react"
import Link from "next/link"

import { SectionCard } from "@/components/section-card"
import { cn } from "@/lib/utils"

/**
 * The white section card the Contacts Overview uses, under the Dashboard's own
 * name. Every section on the page is this frame; a section that needs a badge
 * passes it as `action`, never as a second header shape.
 */
export function DashboardCard({
  title,
  subtitle,
  badge,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string
  subtitle?: string
  badge?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      badge={badge}
      action={action}
      className={cn("overflow-hidden", className)}
    >
      <div className={cn("flex flex-1 flex-col", bodyClassName)}>{children}</div>
    </SectionCard>
  )
}

/** A text link in the card header. */
export function DashboardCardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm font-semibold text-[var(--program-primary)] underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {children}
    </Link>
  )
}

/** In-card empty text: names what is missing and, when there is one, the next step. */
export function DashboardInlineEmpty({
  children,
  href,
  action,
}: {
  children: ReactNode
  href?: string
  action?: string
}) {
  return (
    <div className="px-2 py-10 text-center">
      <p className="text-sm text-[var(--muted-foreground)]">{children}</p>
      {href && action ? (
        <Link
          href={href}
          className="mt-3 inline-flex text-sm font-semibold text-[var(--program-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {action}
        </Link>
      ) : null}
    </div>
  )
}
