"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { ManageAttendanceView } from "@/components/manage/manage-attendance-view"
import { ManageContactsTable } from "@/components/manage/manage-contacts-table"
import { ManageDashboard } from "@/components/manage/manage-dashboard"
import { ManageFavoritesView } from "@/components/manage/manage-favorites-view"
import { ManageSessionsView } from "@/components/manage/manage-sessions-view"
import { type ManagePortalPayload, type ManageView } from "@/components/manage/manage-types"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TAB_LABELS: Array<{ value: ManageView; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
  { value: "contacts", label: "Contacts" },
  { value: "sessions", label: "Sessions" },
  { value: "attendance", label: "Attendance" },
  { value: "favorites", label: "Favorites" },
]

function portalHref(view: ManageView, mode: string): string {
  return `/manage?view=${view}&mode=${mode}`
}

/**
 * Tab shell for the `/manage` portal.
 *
 * The payload is resolved once by the server component so the whole portal is
 * role-scoped before it reaches the browser. Switching tabs is local state
 * (the URL is kept in sync with `history.replaceState` so a reload keeps the
 * tab), while the Admin admin/preacher toggle is a real navigation because it
 * changes what the server reads.
 */
export function ManagePortal({
  payload,
  initialView,
}: {
  payload: ManagePortalPayload
  initialView: ManageView
}) {
  const [view, setView] = useState<ManageView>(initialView)
  const { scope } = payload

  const handleViewChange = useCallback((next: string) => {
    setView(next as ManageView)

    try {
      const url = new URL(window.location.href)
      url.searchParams.set("view", next)
      url.searchParams.set("mode", scope.mode)
      window.history.replaceState(null, "", url.toString())
    } catch {
      // A history failure must never break the tab switch.
    }
  }, [scope.mode])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-[var(--program-text)] sm:text-3xl">
            Manage
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {payload.scope.staffName} · {payload.contacts.length.toLocaleString("en-IN")} contacts ·{" "}
            {payload.locations.length.toLocaleString("en-IN")} locations
          </p>
        </div>

        {scope.role === "Admin" ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Scope
            </span>
            <div className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--border)] bg-card p-1">
              <Link
                href={portalHref(view, "admin")}
                scroll={false}
                aria-current={scope.mode === "admin" ? "page" : undefined}
                className={
                  scope.mode === "admin"
                    ? "rounded-full bg-[var(--program-primary)] px-4 py-1.5 text-sm font-semibold text-white"
                    : "rounded-full px-4 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-black/5"
                }
              >
                All preachers
              </Link>
              <Link
                href={portalHref(view, "preacher")}
                scroll={false}
                aria-current={scope.mode === "preacher" ? "page" : undefined}
                className={
                  scope.mode === "preacher"
                    ? "rounded-full bg-[var(--program-primary)] px-4 py-1.5 text-sm font-semibold text-white"
                    : "rounded-full px-4 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-black/5"
                }
              >
                Own scope
              </Link>
            </div>
          </div>
        ) : (
          <Badge variant="secondary">Preacher scope</Badge>
        )}
      </div>

      {scope.mode === "preacher" ? (
        <p className="rounded-lg border border-[var(--border)] bg-card px-4 py-3 text-sm text-[var(--muted-foreground)]">
          Showing only rows scoped to your own staff account. Switch to the program-wide scope to see every
          preacher.
        </p>
      ) : null}

      <Tabs value={view} onValueChange={handleViewChange} className="gap-4">
        <TabsList className="h-auto w-full max-w-full flex-wrap justify-start gap-1">
          {TAB_LABELS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-none">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dashboard">
          <ManageDashboard payload={payload} />
        </TabsContent>
        <TabsContent value="contacts">
          <ManageContactsTable payload={payload} />
        </TabsContent>
        <TabsContent value="sessions">
          <ManageSessionsView payload={payload} />
        </TabsContent>
        <TabsContent value="attendance">
          <ManageAttendanceView payload={payload} />
        </TabsContent>
        <TabsContent value="favorites">
          <ManageFavoritesView payload={payload} />
        </TabsContent>
      </Tabs>
    </div>
  )
}