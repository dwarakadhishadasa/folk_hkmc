"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { ManageAttendanceView } from "@/components/manage/manage-attendance-view"
import { ManageContactsTable } from "@/components/manage/manage-contacts-table"
import { ManageDashboard } from "@/components/manage/manage-dashboard"
import { ManageFavoritesView } from "@/components/manage/manage-favorites-view"
import { ManageSessionsView } from "@/components/manage/manage-sessions-view"
import { type ManagePortalPayload, type ManageView } from "@/components/manage/manage-types"
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
  const [contactCount, setContactCount] = useState(payload.contacts.length)

  /*
    The title is the active tab's own name: with the per-table name between the
    tab strip and the table removed, the page needs exactly one label for what
    it is showing, and the operator already chose it in the strip above.
  */
  const activeTabLabel = TAB_LABELS.find((tab) => tab.value === view)?.label ?? "Manage"

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

  /*
   * A bounded flex column, all the way down. `gap-6` → `gap-4` is the CAP-1
   * compaction: the composition's page header carries 12px beneath it and the
   * tab row 4px above it, which is the same 16px the content gap already had,
   * so the header block above the tab list was the only slack. Every `min-h-0`
   * here is load-bearing rather than decorative, because a flex item's default
   * `min-height: auto` refuses to shrink below its content and a chain missing
   * one silently grows the page again — which reads as "the page scrolls again"
   * rather than as a missing class.
   */
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/*
        CAP-1: the title and its metadata are ONE optical unit — the 22px
        Poppins title with the count/location scope line tight beneath it
        — and the scope indicator aligns to that unit's baseline
        (`sm:items-end`), not to a label of its own in a separate column.
      */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
            {activeTabLabel}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {contactCount.toLocaleString("en-IN")} contacts ·{" "}
            {payload.locations.length.toLocaleString("en-IN")} locations
          </p>
        </div>

        {scope.role === "Admin" ? (
          <div className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--border)] bg-card p-1">
            <Link
              href={portalHref(view, "admin")}
              scroll={false}
              aria-current={scope.mode === "admin" ? "page" : undefined}
              className={
                scope.mode === "admin"
                  ? "rounded-full bg-[var(--program-primary)] px-4 py-1.5 text-sm font-semibold text-white"
                  : "rounded-full px-4 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-foreground/5"
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
                  : "rounded-full px-4 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-foreground/5"
              }
            >
              Own scope
            </Link>
          </div>
        ) : null}
      </div>

      {scope.mode === "preacher" ? (
        <p className="shrink-0 rounded-lg border border-[var(--border)] bg-card px-4 py-3 text-sm text-[var(--muted-foreground)]">
          Showing only rows scoped to your own staff account. Switch to the program-wide scope to see every
          preacher.
        </p>
      ) : null}

      {/*
        CAP-1: an underline tab strip, not shadcn's pill. The strip is a hairline
        row; inactive tabs are 13px medium in the muted ink with a transparent
        underline, and the active one is unmistakable — weight plus a 2px
        underline, never a new colour. Both inks come from tokens so the active
        tab can be white-on-near-black in `.dark` while staying navy on the light
        canvas; the old version hard-wired `--program-primary` here, which
        measures ~1.6:1 against the dark bar. The trigger's own active surface is
        switched off on both themes: under `.dark` the primitive's variants would
        otherwise win on specificity and repaint the active tab. `gap-y-2` only
        matters where the row wraps at narrow widths.
      */}
      <Tabs value={view} onValueChange={handleViewChange} className="min-h-0 flex-1 gap-4">
        <TabsList className="h-auto w-full max-w-full shrink-0 flex-wrap items-center justify-start gap-x-6 gap-y-2 rounded-none border-b border-[var(--tab-border)] bg-transparent p-0">
          {TAB_LABELS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 py-0 pb-2.5 text-[13px] font-medium whitespace-nowrap text-[var(--tab-inactive-text)] shadow-none transition-colors h-auto hover:text-[var(--tab-active-text)] data-[state=active]:border-[var(--tab-active-underline)] data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[var(--tab-active-text)] data-[state=active]:shadow-none dark:data-[state=active]:border-[var(--tab-active-underline)] dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-[var(--tab-active-text)]"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/*
          The four non-grid tabs each scroll inside the bounded frame — they all
          exceed the viewport and would otherwise be clipped by it. Contacts is
          the exception: it continues the chain so the grid is the only scroll
          container on the page, and a second one above it is what put the
          horizontal scrollbar where the final column was clipped.
        */}
        <TabsContent value="dashboard" className="min-h-0 overflow-auto">
          <ManageDashboard payload={payload} />
        </TabsContent>
        <TabsContent value="contacts" className="flex min-h-0 flex-col">
          <ManageContactsTable payload={payload} onRowCountChange={setContactCount} />
        </TabsContent>
        <TabsContent value="sessions" className="min-h-0 overflow-auto">
          <ManageSessionsView payload={payload} />
        </TabsContent>
        <TabsContent value="attendance" className="min-h-0 overflow-auto">
          <ManageAttendanceView payload={payload} />
        </TabsContent>
        <TabsContent value="favorites" className="min-h-0 overflow-auto">
          <ManageFavoritesView payload={payload} />
        </TabsContent>
      </Tabs>
    </div>
  )
}