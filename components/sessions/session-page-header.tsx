import type { ReactNode } from "react"

/**
 * The title row every Sessions page opens with: the page's own name, the scope
 * line beneath it, and the page's controls on the right.
 *
 * Poppins 22px over Inter 12px is the pairing the Campaign header and the
 * manage portal use. There is no chevron menu: the module has one destination
 * now that Reports is retired.
 */
export function SessionPageHeader({
  title,
  subtitle,
  filters,
  action,
}: {
  title: string
  subtitle: string
  filters?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-row items-start justify-between gap-3 sm:items-end">
      <div className="min-w-0">
        <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
          {title}
        </h1>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{subtitle}</p>
      </div>

      {filters || action ? (
        <div className="flex shrink-0 items-center gap-2">
          {filters}
          {action}
        </div>
      ) : null}
    </div>
  )
}
