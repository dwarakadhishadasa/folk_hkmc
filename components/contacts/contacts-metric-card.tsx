import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * A card on Overview or Reports.
 *
 * The desktop frame gives each card a navy panel header with the title and its
 * subtitle; the phone frames drop the panel and set the title on the card. One
 * component carries both, so the two shapes cannot disagree about the title or
 * the population the card covers.
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
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-card",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 md:flex-nowrap md:gap-4 md:bg-[var(--section-header)] md:px-6 md:py-4">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-poppins)] text-[16px] font-semibold leading-tight text-[var(--program-text)] md:text-[18px] md:text-white">
            {title}
          </h2>
          {mobileSubtitle ?? subtitle ? (
            <p className="mt-1 text-[11px] leading-4 text-[var(--muted-foreground)] md:hidden">
              {mobileSubtitle ?? subtitle}
            </p>
          ) : null}
          {subtitle ? (
            <p className="mt-1 hidden text-[13px] leading-5 text-white/75 md:block">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <div className="shrink-0 text-[var(--muted-foreground)] md:text-white/75">{action}</div>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col p-5 md:p-6">{children}</div>
    </section>
  )
}

/**
 * A quiet pill on a card's title row.
 *
 * It takes its colour from its wrapper, so the same node reads as white on the
 * navy desktop header and as muted ink on the phone's bare card.
 */
export function ContactsCardBadge({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]",
        className,
      )}
      style={{ backgroundColor: "color-mix(in oklab, currentColor 12%, transparent)" }}
    >
      {children}
    </span>
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
    <p className="py-6 text-center text-[13px] leading-5 text-[var(--muted-foreground)]">
      {children}
    </p>
  )
}
