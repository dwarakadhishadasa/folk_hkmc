import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { Header } from "@/components/header"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, getStaffContext } from "@/lib/authz"
import { toClientStaff } from "@/lib/staff-dto"
import { loadDashboardCandidates } from "@/lib/dashboard/candidates"
import { formatCount, formatDay } from "@/lib/dashboard/format"
import { resolveDashboardScope, requireDashboardRole } from "@/lib/dashboard/scope"
import {
  focusSegment,
  isFocusSegmentKey,
  type CandidatePage,
  type DashboardMode,
} from "@/lib/dashboard/types"
import { programDay } from "@/lib/program-day"

const PAGE_SIZE = 50

type CandidatesSearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parsePage(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value.trim())) {
    return 1
  }

  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function candidateHref(segment: string, mode: DashboardMode, page: number): string {
  const params = new URLSearchParams({ segment })
  if (mode === "preacher") {
    params.set("mode", "preacher")
  }
  if (page > 1) {
    params.set("page", String(page))
  }
  return `/dashboard/candidates?${params.toString()}`
}

function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}

/**
 * One focus segment's full list, 50 per page. The segment's predicate is the
 * same SQL function the dashboard's card counted, so the total here and the
 * card's count are one definition.
 */
export async function DashboardCandidatesRoute({
  searchParams,
}: {
  searchParams: CandidatesSearchParams
}) {
  const params = await searchParams
  const segmentKey = firstValue(params.segment)?.trim() ?? ""

  try {
    const staff = await getStaffContext({ refresh: true })
    requireDashboardRole(staff)

    if (!isFocusSegmentKey(segmentKey)) {
      notFound()
    }

    const definition = focusSegment(segmentKey)
    if (!definition) {
      notFound()
    }

    const scope = await resolveDashboardScope(staff, firstValue(params.mode))
    const page = parsePage(firstValue(params.page))

    let result: CandidatePage | null = null
    if (!scope.assistantUnassigned) {
      result = await loadDashboardCandidates(scope, {
        segment: segmentKey,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        today: programDay(),
      })
    }

    return (
      <StaffAuthShell staff={toClientStaff(staff)}>
        <div className="flex min-h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col bg-background">
          <Header />
          <main className="flex w-full flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
            <div className="flex flex-col gap-2">
              <Link
                href={scope.mode === "preacher" ? "/dashboard?mode=preacher" : "/dashboard"}
                className="w-fit text-[13px] font-medium text-[var(--muted-foreground)] underline-offset-2 transition-colors hover:text-[var(--program-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                ← Back to dashboard
              </Link>
              <div>
                <h1 className="font-[family-name:var(--font-poppins)] text-[22px] leading-tight font-semibold tracking-tight text-[var(--program-text)]">
                  {definition.label}
                </h1>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{definition.rule}</p>
                {result ? (
                  <p className="mt-1 text-sm text-[var(--program-text)]">
                    {formatCount(result.total)} {result.total === 1 ? "candidate" : "candidates"}
                  </p>
                ) : null}
              </div>
            </div>

            {scope.assistantUnassigned ? (
              <p className="rounded-lg border border-[var(--border)] bg-card px-4 py-3 text-sm text-[var(--muted-foreground)]">
                No active preacher is assigned to your account, so there are no candidates to show. Ask an
                Admin to assign you to a preacher.
              </p>
            ) : result && result.rows.length > 0 ? (
              <CandidateList
                rows={result.rows}
                segment={segmentKey}
                total={result.total}
                offset={result.offset}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-[var(--border)] bg-card px-5 py-12 text-center text-sm text-[var(--muted-foreground)]">
                {definition.empty}
              </p>
            )}

            {result && result.total > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-3">
                {page > 1 ? (
                  <Link
                    href={candidateHref(segmentKey, scope.mode, page - 1)}
                    className="inline-flex h-9 items-center rounded-md border border-[var(--border)] px-3 text-sm font-semibold text-[var(--program-text)] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    Previous
                  </Link>
                ) : (
                  <span />
                )}
                {page * PAGE_SIZE < result.total ? (
                  <Link
                    href={candidateHref(segmentKey, scope.mode, page + 1)}
                    className="inline-flex h-9 items-center rounded-md border border-[var(--border)] px-3 text-sm font-semibold text-[var(--program-text)] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            ) : null}
          </main>
        </div>
      </StaffAuthShell>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect(`/login?redirect=/dashboard/candidates?segment=${segmentKey}`)
    }

    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    throw error
  }
}

function CandidateList({
  rows,
  segment,
  total,
  offset,
}: {
  rows: CandidatePage["rows"]
  segment: string
  total: number
  offset: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-[var(--muted-foreground)]">
        Showing {formatCount(offset + 1)}–{formatCount(offset + rows.length)} of {formatCount(total)}
      </p>
      <ul className="flex flex-col divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-card">
        {rows.map((row) => (
          <li
            key={`${segment}-${row.contactId}`}
            data-dashboard-candidate={row.contactId}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--program-text)]">{row.name}</p>
              <p className="mt-0.5 text-[12px] leading-4 text-[var(--muted-foreground)]">{row.reason}</p>
              <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                {[row.preacherName, row.locationName].filter(Boolean).join(" · ") || "No preacher or location"}
                {row.lastActivity ? ` · last activity ${formatDay(row.lastActivity)}` : ""}
              </p>
            </div>
            <a
              href={phoneHref(row.phone)}
              aria-label={`Call ${row.name}`}
              className="inline-flex h-9 w-fit shrink-0 items-center rounded-md border border-[var(--border)] px-3 text-sm font-semibold text-[var(--program-primary)] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Call {row.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

