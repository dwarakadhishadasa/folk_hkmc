import type { LucideIcon } from "lucide-react"

/**
 * The KPI tile ring shared by the Overview pages: the gradient wash, the
 * Poppins figure, and the icon set into the top-right corner on desktop.
 *
 * Each page owns its data and its link wrappers; these constants keep the
 * measurements in one place so a Sessions tile and a Contacts tile render at
 * the same size.
 */
export const STAT_TILE_CLASS =
  "relative flex flex-col gap-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-gradient-to-t from-[color-mix(in_oklab,var(--primary)_6%,var(--card))] to-card p-4 md:p-5"

export const STAT_TILE_LABEL_CLASS =
  "text-[11px] font-semibold tracking-[0.04em] text-[#64748b] uppercase md:pr-9 dark:text-[var(--muted-foreground)]"

export const STAT_TILE_VALUE_CLASS =
  "block font-[family-name:var(--font-poppins)] text-[24px] leading-none font-bold md:text-[32px]"

export const STAT_TILE_CAPTION_CLASS =
  "block text-[12px] text-[#64748b] dark:text-[var(--muted-foreground)]"

export const STAT_TILE_ICON_CLASS =
  "absolute top-3 right-3 hidden size-8 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))] text-[var(--primary)] md:top-4 md:right-4 md:flex"

export function StatTileIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className={STAT_TILE_ICON_CLASS} aria-hidden="true">
      <Icon className="size-4" />
    </span>
  )
}
