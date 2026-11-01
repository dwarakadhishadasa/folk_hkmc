import type { ReactNode } from "react"

/**
 * The white insight card every Overview chart uses: a Poppins title, a muted
 * scope line and a small badge, on the same border and radius as the KPI
 * tiles. One shell for four charts is what keeps their headers on one baseline.
 */
export function SessionChartCard({
  title,
  subtitle,
  badge,
  children,
  className,
}: {
  title: string
  subtitle: string
  badge: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`flex flex-col rounded-xl border border-[var(--border)] bg-card p-4 md:p-5 ${className ?? ""}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]">
            {title}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">{subtitle}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
          {badge}
        </span>
      </div>
      {children}
    </section>
  )
}
