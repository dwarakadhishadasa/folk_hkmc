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
  children,
  className,
}: {
  title: string
  subtitle?: string
  /** A shorter line shown under the title on the phone, when the desktop subtitle is too long. */
  mobileSubtitle?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--border)] bg-card",
        className,
      )}
    >
      <header className="hidden bg-[var(--primary)] px-6 py-4 text-white md:block">
        <h2 className="font-[family-name:var(--font-poppins)] text-[18px] font-semibold leading-tight">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-[13px] leading-5 text-white/75">{subtitle}</p>
        ) : null}
      </header>

      <div className="px-5 pt-5 md:hidden">
        <h2 className="font-[family-name:var(--font-poppins)] text-[16px] font-semibold leading-tight text-[var(--program-text)]">
          {title}
        </h2>
        {mobileSubtitle ?? subtitle ? (
          <p className="mt-1 text-[11px] leading-4 text-[var(--muted-foreground)]">
            {mobileSubtitle ?? subtitle}
          </p>
        ) : null}
      </div>

      <div className="p-5 md:p-6">{children}</div>
    </section>
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
