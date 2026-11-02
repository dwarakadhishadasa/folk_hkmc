import type { ReactNode } from "react"

import { SectionPageHeader } from "@/components/section-page-header"

/**
 * The title row every Sessions page opens with: the page's own name, the scope
 * line beneath it, and the page's controls on the right.
 *
 * The shape lives in `SectionPageHeader`, so Campaigns, Sessions and the
 * Dashboard share one typography and one alignment. There is no chevron menu:
 * the module has one destination now that Reports is retired.
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
    <SectionPageHeader title={title} subtitle={subtitle} filters={filters} action={action} />
  )
}
