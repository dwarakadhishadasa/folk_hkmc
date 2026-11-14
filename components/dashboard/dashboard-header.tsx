import { Info } from "lucide-react"

import { DashboardPeriodControl } from "@/components/dashboard/dashboard-period-control"
import { DashboardScopeLink } from "@/components/dashboard/dashboard-scope-link"
import { SectionPageHeader } from "@/components/section-page-header"
import { formatCount, formatUpdated } from "@/lib/dashboard/format"
import { dashboardPeriodQuery, type DashboardPeriod } from "@/lib/dashboard/period"
import type { DashboardScope, DashboardScopeCounts } from "@/lib/dashboard/types"

function scopeHref(mode: "admin" | "preacher", period: DashboardPeriod): string {
  const params = new URLSearchParams({ mode, ...dashboardPeriodQuery(period) })
  return `/dashboard?${params.toString()}`
}

/**
 * The Admin's All/Own switch. It is the same pill on both surfaces; the header
 * only decides where the pill sits.
 */
function DashboardScopeSwitch({ mode, period }: { mode: "admin" | "preacher"; period: DashboardPeriod }) {
  return (
    <nav
      aria-label="Data scope"
      className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--border)] bg-card p-1"
    >
      <DashboardScopeLink href={scopeHref("admin", period)} active={mode === "admin"}>
        All preachers
      </DashboardScopeLink>
      <DashboardScopeLink href={scopeHref("preacher", period)} active={mode === "preacher"}>
        Own scope
      </DashboardScopeLink>
    </nav>
  )
}

/**
 * The Dashboard's title row, on the same shape as Contacts, Campaigns and
 * Sessions: the page name, the whole-scope counts, and the controls on the
 * right. On a phone the scope switch and the period control move below the
 * title, where the other sections put their own actions.
 */
export function DashboardHeader({
  scope,
  scopeCounts,
  period,
  today,
  generatedAt,
}: {
  scope: DashboardScope
  scopeCounts: DashboardScopeCounts | null
  period: DashboardPeriod
  today: string
  generatedAt: string | null
}) {
  const updated = generatedAt ? formatUpdated(generatedAt) : ""
  const scopeLine = scopeCounts
    ? `${formatCount(scopeCounts.contacts)} contacts · ${formatCount(scopeCounts.locations)} locations · ${formatCount(scopeCounts.sessions)} sessions`
    : ""
  const isAdmin = scope.role === "Admin"

  return (
    <div className="flex flex-col gap-3">
      <SectionPageHeader
        title="Dashboard"
        subtitle={scopeLine}
        meta={
          updated ? (
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">Updated {updated}</p>
          ) : undefined
        }
        filters={<DashboardPeriodControl period={period} today={today} />}
        action={isAdmin ? <DashboardScopeSwitch mode={scope.mode} period={period} /> : undefined}
      />
    </div>
  )
}

/**
 * The own-scope explanation. An Assistant is told whose patch they are
 * reading, and an Assistant with no assignment is told why the page is empty.
 * A reader in their own scope needs no notice: the scope switch already names
 * it, and a Preacher has no switch to be pointed at.
 */
export function DashboardScopeNotice({ scope }: { scope: DashboardScope }) {
  const copy = scope.assistantUnassigned
    ? "No active preacher is assigned to your account, so this dashboard is empty. Ask an Admin to assign you to a preacher."
    : scope.role === "Assistant"
      ? `Showing only rows scoped to ${scope.assistantPreacherName ?? "the preacher you assist"}, the preacher you assist.`
      : null

  if (!copy) {
    return null
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-card px-4 py-3 text-sm text-[var(--muted-foreground)]">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{copy}</p>
    </div>
  )
}
