import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The white card every Overview section uses.
 *
 * A Poppins title, a muted scope line, and an optional control or badge on the
 * title row, on the same border, radius and padding as the KPI tiles. Sessions
 * and Contacts share this shell so their section headers sit on one baseline.
 */
export function SectionCard({
  title,
  subtitle,
  mobileSubtitle,
  badge,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  /** A shorter line shown under the title on the phone, when the desktop subtitle is too long. */
  mobileSubtitle?: string
  /** A short label on the title row, e.g. the card's window. */
  badge?: string
  /** A control on the title row, e.g. the card's period filter. Takes precedence over `badge`. */
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const phoneSubtitle = mobileSubtitle ?? subtitle

  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border border-[var(--border)] bg-card p-4 md:p-5",
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]">
            {title}
          </h2>
          {phoneSubtitle ? (
            <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)] md:hidden">
              {phoneSubtitle}
            </p>
          ) : null}
          {subtitle ? (
            <p className="mt-0.5 hidden text-[12px] text-[var(--muted-foreground)] md:block">
              {subtitle}
            </p>
          ) : null}
        </div>

        {action ? (
          <div className="shrink-0">{action}</div>
        ) : badge ? (
          <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
            {badge}
          </span>
        ) : null}
      </div>

      {children}
    </section>
  )
}
