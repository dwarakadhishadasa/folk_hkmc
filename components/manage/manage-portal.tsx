"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { ManageAdminPanel } from "@/components/manage/manage-admin-panel"
import { ManageAttendanceView } from "@/components/manage/manage-attendance-view"
import { ManageDashboard } from "@/components/manage/manage-dashboard"
import { ManageFavoritesView } from "@/components/manage/manage-favorites-view"
import { ManageSessionsView } from "@/components/manage/manage-sessions-view"
import { type ManagePortalPayload, type ManageView } from "@/components/manage/manage-types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDeviceView } from "@/hooks/use-mobile"

const TAB_LABELS: Array<{ value: ManageView; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
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
  recordAvailableContactIds = [],
}: {
  payload: ManagePortalPayload
  initialView: ManageView
  /** The manage Sessions pills' availability set, computed by the page. */
  recordAvailableContactIds?: readonly string[]
}) {
  const [view, setView] = useState<ManageView>(initialView)
  const { scope } = payload

  /**
   * Whether this device is a phone.
   *
   * The tab strip and the Admin Panel are the same navigation in two shapes,
   * and the viewport picks the shape: the strip on a desktop, the panel on a
   * phone. `useDeviceView()` answers `null` until the viewport is known, so
   * the first render shows the strip — the shape that does not hide a page
   * behind a panel the operator has not opened yet.
   */
  const isPhone = useDeviceView() === "mobile"

  /** The Admin Panel's open state. */
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)

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
          {/*
            On a phone the title is the panel's handle: the same label, with a
            chevron, that opens the Admin Panel. It is a button rather than a
            heading with a button beside it, because the design treats the
            title *and* the chevron as one target — and because a heading whose
            only child is a button still reads as the heading it is, the
            chevron being `aria-hidden`.
          */}
          <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
            {isPhone ? (
              <button
                type="button"
                onClick={() => setAdminPanelOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={adminPanelOpen}
                className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
              >
                {activeTabLabel}
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-[var(--program-primary)]"
                />
              </button>
            ) : (
              activeTabLabel
            )}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {payload.contacts.length.toLocaleString("en-IN")} contacts ·{" "}
            {payload.locations.length.toLocaleString("en-IN")} locations
          </p>
        </div>

        {/*
          The scope switch is a desktop control. On a phone the screen belongs
          to the list, and the switch is two taps away in the panel's own
          place rather than a row of its own above every page.
        */}
        {scope.role === "Admin" ? (
          <div className="hidden w-fit items-center gap-1 rounded-full border border-[var(--border)] bg-card p-1 md:inline-flex">
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
          {scope.patchOwnerId === null
            ? "No active Preacher is assigned to your account, so this page is empty. Ask an Admin to assign you to a preacher."
            : scope.patchOwnerId !== scope.actorUserId
              ? `Showing only rows scoped to ${scope.patchOwnerName ?? "the Preacher you assist"}, the Preacher you assist.`
              : "Showing only rows scoped to your own staff account. Switch to the program-wide scope to see every preacher."}
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

        The strip is a **desktop** control. At 390px five labels wrap onto two
        rows, and the second row is a third of the screen a list of contacts
        needs; the Admin Panel carries the same navigation on a phone.
      */}
      <Tabs value={view} onValueChange={handleViewChange} className="min-h-0 flex-1 gap-4">
        <TabsList className="hidden h-auto w-full max-w-full shrink-0 flex-wrap items-center justify-start gap-x-6 gap-y-2 rounded-none border-b border-[var(--tab-border)] bg-transparent p-0 md:flex">
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
          Three of the four tabs scroll inside the bounded frame — they exceed
          the viewport and would otherwise be clipped by it. Attendance is the
          exception: it is a two-canvas surface that takes the height it is
          given, and its canvases scroll inside themselves.

          The Contacts grid no longer lives here; it is the Contacts section's
          own tab at `/contacts/grid`.
        */}
        <TabsContent value="dashboard" className="min-h-0 overflow-auto">
          <ManageDashboard payload={payload} />
        </TabsContent>
        <TabsContent value="sessions" className="min-h-0 overflow-auto">
          <ManageSessionsView
            payload={payload}
            recordAvailableContactIds={recordAvailableContactIds}
          />
        </TabsContent>
        {/*
          The attendance tab is a record review: a roster of contacts beside the
          focused contact's record. It is a two-canvas surface, so the canvases
          scroll inside themselves and the page does not.
        */}
        <TabsContent value="attendance" className="flex min-h-0 flex-col">
          <ManageAttendanceView payload={payload} />
        </TabsContent>
        <TabsContent value="favorites" className="min-h-0 overflow-auto">
          <ManageFavoritesView payload={payload} />
        </TabsContent>
      </Tabs>

      {/*
        The Admin Panel: the phone's navigation, opened from the page title.

        It is rendered outside the `Tabs` on purpose — it is not one of the
        portal's pages, it is the way *between* them — and it is a fixed
        takeover, so it sits above the app bar and the bottom nav alike.
      */}
      {adminPanelOpen ? (
        <ManageAdminPanel
          views={TAB_LABELS}
          activeView={view}
          onSelect={(next) => {
            handleViewChange(next)
            setAdminPanelOpen(false)
          }}
          onClose={() => setAdminPanelOpen(false)}
        />
      ) : null}
    </div>
  )
}