import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** The page title every section opens with: Poppins 22px over the muted scope line. */
export const SECTION_TITLE_CLASS =
  "font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]"

export const SECTION_SUBTITLE_CLASS = "mt-0.5 text-xs text-[var(--muted-foreground)]"

/**
 * The title row Contacts, Campaigns, Sessions and the Dashboard share.
 *
 * The section supplies its own page name, scope line and controls; this shell
 * fixes the typography, the gap and the alignment so the four sections cannot
 * drift apart. `menu` is the phone-only chevron a section with tabs renders
 * beside the title.
 */
export function SectionPageHeader({
  title,
  subtitle,
  meta,
  menu,
  filters,
  action,
  className,
}: {
  title: string
  subtitle: string
  /** A third, micro line under the scope line, e.g. the Dashboard's `Updated` time. */
  meta?: ReactNode
  menu?: ReactNode
  filters?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {/*
          `relative` is what gives a section's menu trigger its hit area. The
          trigger draws an absolutely positioned overlay against this row rather
          than against itself, so tapping the title beside the chevron opens the
          menu too. The chevron alone is an 18px target and reads as decoration.
        */}
        <div className="relative flex items-center gap-1">
          <h1 className={cn(SECTION_TITLE_CLASS, "truncate")}>{title}</h1>
          {menu}
        </div>
        <p className={SECTION_SUBTITLE_CLASS}>{subtitle}</p>
        {meta}
      </div>

      {filters || action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
          {filters}
          {action}
        </div>
      ) : null}
    </div>
  )
}
