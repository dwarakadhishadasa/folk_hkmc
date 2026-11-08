"use client"

import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { createColumnHelper } from "@tanstack/react-table"
import type {
  OnChangeFn,
  RowSelectionState,
  Table,
  TableState,
} from "@tanstack/react-table"
import { Minus, Plus, TriangleAlert, X } from "lucide-react"

import { AssignContactsAssignedBar } from "@/components/campaign/assign-contacts-assigned-bar"
import {
  type AssignableCallerView,
  type AssignableContactView,
  type AssignmentConflictView,
  type AssignmentSplitEntryView,
  type LocationOption,
} from "@/components/campaign/assign-contacts-types"
import {
  Grid,
  GridRowExpandControl,
  GRID_DEFAULT_DENSITY,
  useGridViewState,
  type GridColumnDef,
  type GridDensity,
  type GridFieldType,
  type GridRowContextMenuProps,
} from "@/components/grid"
import {
  createFilterGroup,
  filterGroupToSerialized,
  flattenConditions,
  type GridFilterGroup,
} from "@/components/grid/grid-filter-tree"
import { gridViewConfigToParams, type GridViewConfig } from "@/components/grid/grid-view-config"
import { applyGridParams, isGridParamKey } from "@/components/grid/grid-view-state"
import { SavedViewsBar, type ViewSaveState } from "@/components/grid/saved-views-bar"
import { useGridRowPosition } from "@/components/grid/grid-row-position"
import {
  CAMPAIGNS_VIEWS_ENDPOINT,
  createSavedViewRequest,
  deleteSavedViewRequest,
  markSavedViewUsed,
  updateSavedViewRequest,
} from "@/components/grid/saved-views-client"
import {
  mergeSavedViews,
  suggestSavedViewName,
  type SavedGridView,
  type SavedViewVisibility,
} from "@/components/grid/saved-view-types"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { useContactRecordContext } from "@/components/contacts/contact-record-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const SELECT_COLUMN_ID = "select"
const NAME_COLUMN_ID = "name"
const PHONE_COLUMN_ID = "phone"
const INITIAL_CONTACT_COLUMN_ID = "initialContact"
const LOCATION_COLUMN_ID = "location"
const ASSIGNED_TO_COLUMN_ID = "assignedTo"
const RECENT_STATUS_COLUMN_ID = "recentStatus"
const COLLECTED_BY_COLUMN_ID = "collectedBy"
const NOTES_COLUMN_ID = "notes"
const CENTRE_COLUMN_ID = "centre"
const LEVEL_COLUMN_ID = "level"
const GENDER_COLUMN_ID = "gender"
const LANGUAGE_COLUMN_ID = "language"

/**
 * Frame 324's grid: the five columns the frame draws, the contact's latest
 * call status across the programme, then the four calling facets the
 * assignment rules actually filter on.
 *
 * The facet columns ship hidden. The frame's own toolbar reports hidden fields,
 * and these are the fields this screen has that the frame's five do not: an
 * operator who wants "everyone in Adyar who speaks Tamil" unhides them and
 * filters without leaving the screen.
 */
const COLUMN_IDS = [
  SELECT_COLUMN_ID,
  NAME_COLUMN_ID,
  PHONE_COLUMN_ID,
  INITIAL_CONTACT_COLUMN_ID,
  LOCATION_COLUMN_ID,
  ASSIGNED_TO_COLUMN_ID,
  RECENT_STATUS_COLUMN_ID,
  COLLECTED_BY_COLUMN_ID,
  NOTES_COLUMN_ID,
  CENTRE_COLUMN_ID,
  LEVEL_COLUMN_ID,
  GENDER_COLUMN_ID,
  LANGUAGE_COLUMN_ID,
] as const

const DEFAULT_HIDDEN_COLUMNS: readonly string[] = [
  CENTRE_COLUMN_ID,
  LEVEL_COLUMN_ID,
  GENDER_COLUMN_ID,
  LANGUAGE_COLUMN_ID,
]

const FIELD_TYPES: Record<string, GridFieldType> = {
  [NAME_COLUMN_ID]: "text",
  [PHONE_COLUMN_ID]: "text",
  [INITIAL_CONTACT_COLUMN_ID]: "date",
  [LOCATION_COLUMN_ID]: "linked",
  [ASSIGNED_TO_COLUMN_ID]: "text",
  [RECENT_STATUS_COLUMN_ID]: "text",
  [COLLECTED_BY_COLUMN_ID]: "text",
  [NOTES_COLUMN_ID]: "longtext",
  [CENTRE_COLUMN_ID]: "text",
  [LEVEL_COLUMN_ID]: "text",
  [GENDER_COLUMN_ID]: "text",
  [LANGUAGE_COLUMN_ID]: "text",
}

const RECENT_STATUS_PILL =
  "inline-flex max-w-full items-center truncate rounded-full px-2 py-[3px] text-[11px] font-medium"

/** The same fills the campaign status pill uses, keyed by the call's group. */
const RECENT_STATUS_CLASSES: Record<string, string> = {
  CONFIRMED: "bg-[#e8f5ec] text-[#15803d] dark:bg-[#10331c] dark:text-[#7ee2a3]",
  MAY_COME: "bg-[color-mix(in_oklab,var(--info)_10%,var(--card))] text-[var(--info)]",
  DEFERRED: "bg-[var(--muted)] text-[var(--grid-linked-fg)]",
  NOT_REACHABLE: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  WRONG_NUMBER: "bg-[color-mix(in_oklab,var(--destructive)_10%,var(--card))] text-[var(--destructive)]",
  NOT_INTERESTED: "bg-[color-mix(in_oklab,var(--destructive)_10%,var(--card))] text-[var(--destructive)]",
}

const RECENT_STATUS_FALLBACK = "bg-[var(--muted)] text-[var(--muted-foreground)]"

/** A status group is data, so an own-key lookup keeps `constructor` out of `cn`. */
function recentStatusClass(group: string): string {
  return Object.prototype.hasOwnProperty.call(RECENT_STATUS_CLASSES, group)
    ? RECENT_STATUS_CLASSES[group]
    : RECENT_STATUS_FALLBACK
}

const CALLED_AT_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
})

const UNRESOLVED_LOCATION = "Unknown location"
const PREVIEW_DEBOUNCE_MS = 250
const PRECHECK_DEBOUNCE_MS = 300
const MIN_WEIGHT = 1
const MAX_WEIGHT = 10
const PRIMARY_BUTTON_CLASS =
  "h-11 w-full rounded-lg bg-[var(--program-primary)] text-primary-foreground shadow-sm hover:bg-[var(--program-primary)]/90 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"

const VIEW_SIDEBAR_STORAGE_KEY = "hkmc.campaigns.viewSidebarConfig"

interface PickerEntry {
  userId: string
  name: string
  /** Held as text so a half-typed weight does not become `NaN` in state. */
  weight: string
}

interface PreviewState {
  /** The selection and weights this split was computed for. */
  key: string
  split: AssignmentSplitEntryView[]
}

interface PrecheckState {
  key: string
  conflictCount: number
  conflicts: AssignmentConflictView[]
}

/** The selection captured when Assign is pressed, before the rows are cleared. */
interface PendingAssignment {
  contactIds: string[]
  selectedCount: number
  conflictCount: number
  assignableCount: number
  conflicts: AssignmentConflictView[]
}

/** The server's named refusal, never a generic failure. */
function errorMessage(payload: { error?: string; code?: string } | null): string {
  if (!payload) {
    return "The server refused the request."
  }

  if (payload.code && payload.error) {
    return `${payload.code} — ${payload.error}`
  }

  return payload.error ?? payload.code ?? "The server refused the request."
}

/** The two initials the frame's avatars carry. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return "?"
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

/** A whole number in the stepper's 1–10 range, or `null` for a half-typed value. */
function parseWeight(value: string): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= MIN_WEIGHT && parsed <= MAX_WEIGHT ? parsed : null
}

/**
 * Frame 324's selection control: tick a row, or tick the header to take every
 * row the current filter shows.
 *
 * Toggling the header acts on the visible rows only, so narrowing a filter never
 * silently discards a selection made before it.
 */
function SelectAllControl({
  table,
  onToggle,
}: {
  table: Table<AssignableContactView>
  onToggle: (selected: boolean, visibleIds: readonly string[]) => void
}) {
  const visibleRows = table.getRowModel().rows
  const visibleIds = visibleRows.map((row) => row.id)
  const selectedInView = visibleRows.filter((row) => row.getIsSelected()).length

  return (
    <span
      className="flex justify-center"
      onPointerDown={(event) => {
        // Without this the cell takes the pointer, the grid moves cell focus to
        // a non-editable column, and the next double-click becomes a no-op.
        event.stopPropagation()
      }}
    >
      <Checkbox
        checked={
          selectedInView === 0 ? false : selectedInView === visibleIds.length ? true : "indeterminate"
        }
        disabled={visibleIds.length === 0}
        onCheckedChange={(checked) => onToggle(checked === true, visibleIds)}
        aria-label={
          selectedInView > 0
            ? `Select all contacts in view (${selectedInView} of ${visibleIds.length} in view selected)`
            : "Select all contacts in view"
        }
      />
    </span>
  )
}

/**
 * The gutter's serial: the row's position in the current view. Same shape as
 * the contacts grid's, because it is the same gutter.
 */
function RowSerial({ fallback }: { fallback: number }) {
  const position = useGridRowPosition()

  return <>{position ?? fallback}</>
}

/**
 * The row context menu's one record verb.
 *
 * The expand control in the gutter is pointer/touch, matching the Contacts
 * grid's `tabIndex={-1}` modality; this menu is the required keyboard route,
 * reached with Shift+F10 or the Menu key. It is offered for one row only —
 * an expanded record is a single record, so a multi-row target would need a
 * choice the menu cannot make.
 */
const AssignRecordOpenContext = createContext<
  ((contactId: string, trigger?: HTMLElement | null) => void) | null
>(null)

function AssignContactsRowContextMenu({ rowIds }: GridRowContextMenuProps) {
  const openRecord = useContext(AssignRecordOpenContext)
  const count = rowIds.length

  return (
    <>
      <ContextMenuLabel className="text-[13px]">
        {count} selected row{count === 1 ? "" : "s"}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      {count === 1 && openRecord ? (
        <ContextMenuItem
          className="text-[13px]"
          onSelect={() => {
            const trigger =
              typeof document !== "undefined" && document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null

            openRecord(rowIds[0], trigger)
          }}
        >
          Expand record
        </ContextMenuItem>
      ) : null}
    </>
  )
}

/**
 * Frame 324's assign-contacts surface: the shared grid on the left, the
 * weighted caller panel on the right, and one primary action.
 *
 * Every contact in scope is handed to the grid in one read, because the grid's
 * search, sort, filters and selection all describe the whole set — a page at a
 * time would make the toolbar and the "N of M selected" footer describe
 * different populations.
 *
 * The primary action assigns with `skip`: the frame states that a selected
 * contact already assigned in this campaign "will be skipped". Starting a DRAFT
 * campaign is the page head's action, because it is a lifecycle change, not a
 * property of the selection.
 */
export function AssignContactsSelect({
  campaignId,
  campaignStatus,
  contacts,
  callers,
  locations,
  views: viewsProp,
  lastViewId = null,
  currentUserId,
}: {
  campaignId: string
  campaignStatus: string
  contacts: AssignableContactView[]
  callers: AssignableCallerView[]
  locations: LocationOption[]
  /** Saved views for this grid, in display order. */
  views: SavedGridView[]
  /** The view this person last opened, from the server. Used once, on a bare landing. */
  lastViewId?: string | null
  /** The signed-in operator, for "can I edit this view". */
  currentUserId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [density, setDensity] = useState<GridDensity>(GRID_DEFAULT_DENSITY)

  /**
   * The record host mounted by the staff shell.
   *
   * The assign grid is contact-scoped by construction — the page read the same
   * scope — so every row is a trigger and no extra availability read is made.
   * The sequence is the grid's visible, filtered/sorted order, supplied by
   * `onVisibleRowIdsChange`, never the unfiltered `contacts` prop.
   */
  const recordContext = useContactRecordContext()
  const [visibleRowIds, setVisibleRowIds] = useState<readonly string[]>([])

  const openRecord = useCallback(
    (contactId: string, trigger: HTMLElement | null = null) => {
      recordContext?.openContactRecord({ contactId, sequence: visibleRowIds, trigger })
    },
    [recordContext, visibleRowIds],
  )

  // The open record's chevrons follow the grid's current filtered/sorted view,
  // including when a filter hides the record the operator is reading.
  useEffect(() => {
    recordContext?.updateContactRecordSequence(visibleRowIds)
  }, [recordContext, visibleRowIds])

  /**
   * The view the operator is working in.
   *
   * Set the moment a view is chosen, not when the navigation lands: a grid edit
   * made during that round trip still belongs to the view that was picked, and
   * `searchParams` will not name it yet.
   */
  const [selectedViewId, setSelectedViewId] = useState<string | null>(() => searchParams.get("view"))

  /** The view id every grid write must keep, whatever its `searchParams` snapshot says. */
  const stickyParams = useMemo(
    () => (selectedViewId ? { view: selectedViewId } : undefined),
    [selectedViewId],
  )

  /**
   * Whether the saved-views sidebar is showing. A way of looking at the grid,
   * not part of the shareable arrangement, so it is a local preference.
   */
  const [viewsSidebarOpen, setViewsSidebarOpen] = useState(true)

  /*
   * Airtable persists this preference across reloads. The read runs after mount,
   * because reading storage during the first render would make the server and
   * client markup disagree.
   */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIEW_SIDEBAR_STORAGE_KEY)
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw) as { shouldExpandOnBaseOpen?: unknown }
      if (typeof parsed.shouldExpandOnBaseOpen === "boolean") {
        setViewsSidebarOpen(parsed.shouldExpandOnBaseOpen)
      }
    } catch {
      // A corrupt or unavailable store falls back to the default, open.
    }
  }, [])

  const toggleViewsSidebar = () => {
    setViewsSidebarOpen((open) => {
      const next = !open
      try {
        window.localStorage.setItem(
          VIEW_SIDEBAR_STORAGE_KEY,
          JSON.stringify({ version: 2, shouldExpandOnBaseOpen: next }),
        )
      } catch {
        // The preference is a convenience; a blocked store must not stop the
        // toggle from working for this visit.
      }
      return next
    })
  }
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const [picker, setPicker] = useState<PickerEntry[]>([])
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  const [precheck, setPrecheck] = useState<PrecheckState | null>(null)
  const [isPrechecking, setIsPrechecking] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [isWriting, setIsWriting] = useState(false)
  const [assignDecisionOpen, setAssignDecisionOpen] = useState(false)
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [surfaceHeight, setSurfaceHeight] = useState<number | null>(null)

  // The campaign shell lets its pages grow; the assign surface is the one page
  // that should end at the viewport instead of scrolling the whole document.
  // Measuring the space above it is the only offset that survives the responsive
  // header and the editable campaign title.
  useEffect(() => {
    const measure = () => {
      const element = surfaceRef.current
      if (!element) {
        return
      }

      const top = element.getBoundingClientRect().top
      setSurfaceHeight(Math.max(420, Math.floor(window.innerHeight - top - 24)))
    }

    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  const locationNames = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  )

  const {
    state: viewState,
    filterTree,
    onStateChange,
    onFilterTreeChange,
    clearFilters,
    beginTransientChange,
    commitTransientChange,
    cancelTransientChange,
  } = useGridViewState({
    columnIds: COLUMN_IDS,
    fieldTypes: FIELD_TYPES,
    defaultHiddenColumnIds: DEFAULT_HIDDEN_COLUMNS,
    stickyParams,
  })

  /*
   * Saved views.
   *
   * The URL stays the single source of truth for what the grid is showing; a
   * saved view is a snapshot written into it. Selecting a view therefore
   * *replaces* every grid-owned key with that view's, rather than merging: a
   * merge would let the sort of the view you just left survive into the one you
   * opened, which is the same as not having per-view sort at all.
   */
  const [views, setViews] = useState<SavedGridView[]>(() => viewsProp)
  const [viewsSource, setViewsSource] = useState<SavedGridView[]>(viewsProp)
  const [saveState, setSaveState] = useState<ViewSaveState>("idle")
  /** Views deleted here, so a payload read before the delete cannot bring one back. */
  const removedViewIdsRef = useRef<Set<string>>(new Set())

  if (viewsProp !== viewsSource) {
    setViewsSource(viewsProp)
    setViews((current) => mergeSavedViews(current, viewsProp, removedViewIdsRef.current))
  }

  const activeViewId = searchParams.get("view")
  const activeView = activeViewId
    ? views.find((view) => view.id === activeViewId) ?? null
    : null

  /**
   * Which view's configuration the URL was last seeded from.
   *
   * Claimed only after the effect has seen that view in `searchParams` — never
   * when a navigation is merely requested, so a superseded push cannot re-apply
   * the old view's arrangement over the edit the operator just made.
   */
  const hydratedViewRef = useRef<string | null>(null)
  /**
   * Whether the landing URL carried grid keys of its own.
   *
   * A link with `?f.status=…&view=…` is a shared arrangement of that view, and
   * the first hydration must not overwrite it. Read once, so a later switch
   * still replaces everything.
   */
  const landingHadGridKeysRef = useRef<boolean | null>(null)

  if (landingHadGridKeysRef.current === null) {
    landingHadGridKeysRef.current = [...searchParams.keys()].some(isGridParamKey)
  }

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * The edit the operator has made and the view it belongs to. Recorded by the
   * edit handlers themselves, not by an effect watching the URL, because both
   * `useSearchParams` and `window.location` lag `router.push` by a round trip.
   */
  const pendingSaveRef = useRef<{ viewId: string; config: GridViewConfig } | null>(null)

  /** Writes a config to the view it belongs to. */
  const saveViewConfig = useCallback(async (viewId: string, config: GridViewConfig) => {
    try {
      const updated = await updateSavedViewRequest(CAMPAIGNS_VIEWS_ENDPOINT, viewId, { config })

      setViews((current) => current.map((view) => (view.id === updated.id ? updated : view)))
      setSaveState("saved")
    } catch {
      setSaveState("error")
    }
  }, [])

  /**
   * Queues the arrangement the operator just produced. One entry: the newest
   * edit replaces the one before it, because a view stores a whole
   * configuration and only the last one is true.
   */
  const scheduleSave = useCallback(
    (config: GridViewConfig, viewId: string | null = selectedViewId) => {
      if (!viewId) {
        return
      }

      pendingSaveRef.current = { viewId, config }

      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
      }

      setSaveState("saving")

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        const pending = pendingSaveRef.current
        pendingSaveRef.current = null

        if (pending) {
          void saveViewConfig(pending.viewId, pending.config)
        }
      }, 800)
    },
    [saveViewConfig, selectedViewId],
  )

  /** Writes whatever is queued, right now. Called when leaving a view. */
  const flushPendingSave = useCallback(() => {
    const pending = pendingSaveRef.current

    pendingSaveRef.current = null

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (pending) {
      void saveViewConfig(pending.viewId, pending.config)
    }
  }, [saveViewConfig])

  const currentConfig = useMemo<GridViewConfig>(
    () => ({
      sorting: viewState.sorting ?? [],
      globalFilter: typeof viewState.globalFilter === "string" ? viewState.globalFilter : "",
      filter: flattenConditions(filterTree).length > 0 ? filterGroupToSerialized(filterTree) : null,
      columnOrder: viewState.columnOrder ?? [],
      hiddenColumnIds: Object.keys(viewState.columnVisibility ?? {}).filter(
        (id) => viewState.columnVisibility?.[id] === false,
      ),
      columnSizing: viewState.columnSizing ?? {},
      density,
    }),
    [density, filterTree, viewState],
  )

  const viewHref = useCallback(
    (view: SavedGridView) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("view", view.id)

      const query = applyGridParams(
        params,
        gridViewConfigToParams(view.config, COLUMN_IDS, {
          fieldTypes: FIELD_TYPES,
          defaultHiddenColumnIds: DEFAULT_HIDDEN_COLUMNS,
        }),
      ).toString()

      return query.length > 0 ? `${pathname}?${query}` : pathname
    },
    [pathname, searchParams],
  )

  /**
   * Opens a view: its config replaces the grid's, and its row height its own.
   * This writes the URL but does not mark the view as hydrated — hydration is a
   * fact about what `searchParams` shows, and only the effect below observes it.
   */
  const activateView = useCallback(
    (view: SavedGridView, mode: "push" | "replace" = "push") => {
      // The view being left may still owe a write; flush it before its URL is
      // replaced, or the edit dies with the timer that was going to send it.
      flushPendingSave()
      setSelectedViewId(view.id)
      setDensity(view.config.density)
      setSaveState("saved")
      markSavedViewUsed(CAMPAIGNS_VIEWS_ENDPOINT, view.id)

      if (mode === "push") {
        router.push(viewHref(view), { scroll: false })
      } else {
        router.replace(viewHref(view), { scroll: false })
      }
    },
    [flushPendingSave, router, viewHref],
  )

  /*
   * Seeding the URL from the selected view. Skipped on the one landing that
   * carried its own grid keys, and skipped once a view has already been
   * hydrated, so this is not a second writer racing `activateView`.
   */
  useEffect(() => {
    if (!activeViewId || hydratedViewRef.current === activeViewId) {
      return
    }

    const view = views.find((entry) => entry.id === activeViewId)

    if (!view) {
      return
    }

    hydratedViewRef.current = view.id
    setSelectedViewId(view.id)
    setDensity(view.config.density)
    setSaveState("saved")
    markSavedViewUsed(CAMPAIGNS_VIEWS_ENDPOINT, view.id)

    if (landingHadGridKeysRef.current) {
      landingHadGridKeysRef.current = false
      return
    }

    const href = viewHref(view)
    const current = searchParams.toString()

    if (href !== `${pathname}${current.length > 0 ? `?${current}` : ""}`) {
      router.replace(href, { scroll: false })
    }
  }, [activeViewId, pathname, router, searchParams, viewHref, views])

  const selectView = useCallback(
    (viewId: string) => {
      const view = views.find((entry) => entry.id === viewId)

      if (view) {
        activateView(view)
      }
    },
    [activateView, views],
  )

  /** Back to the unsaved arrangement: no `view` and no grid keys at all. */
  const selectUnsaved = useCallback(() => {
    flushPendingSave()
    hydratedViewRef.current = null
    setSelectedViewId(null)
    setSaveState("idle")
    setDensity(GRID_DEFAULT_DENSITY)

    // `view` must go with the grid keys: leaving it would keep the view
    // selected, and the hydration effect would write its arrangement straight
    // back over the one the operator just asked for.
    const params = applyGridParams(new URLSearchParams(searchParams.toString()), {})
    params.delete("view")
    const query = params.toString()

    router.push(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [flushPendingSave, pathname, router, searchParams])

  const createView = useCallback(
    async (name: string, visibility: SavedViewVisibility) => {
      const created = await createSavedViewRequest(CAMPAIGNS_VIEWS_ENDPOINT, {
        name,
        config: currentConfig,
        visibility,
      })

      setViews((current) => [...current, created])
      activateView(created)
    },
    [activateView, currentConfig],
  )

  const renameView = useCallback(async (viewId: string, name: string) => {
    const updated = await updateSavedViewRequest(CAMPAIGNS_VIEWS_ENDPOINT, viewId, { name })

    setViews((current) => current.map((view) => (view.id === updated.id ? updated : view)))
    setSaveState("saved")
  }, [])

  const duplicateView = useCallback(
    async (viewId: string) => {
      const source = views.find((view) => view.id === viewId)

      if (!source) {
        return
      }

      const created = await createSavedViewRequest(CAMPAIGNS_VIEWS_ENDPOINT, {
        name: `${source.name} copy`,
        config: currentConfig,
        // A copy belongs to whoever made it, even when the source is shared.
        visibility: source.visibility,
      })

      setViews((current) => [...current, created])
      activateView(created)
    },
    [activateView, currentConfig, views],
  )

  const deleteView = useCallback(
    async (viewId: string) => {
      // Nothing to flush *to* once the view is gone; a pending write would 404.
      pendingSaveRef.current = null

      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      await deleteSavedViewRequest(CAMPAIGNS_VIEWS_ENDPOINT, viewId)
      removedViewIdsRef.current.add(viewId)

      const remaining = views.filter((view) => view.id !== viewId)
      setViews(remaining)

      if (activeViewId === viewId) {
        if (remaining.length > 0) {
          activateView(remaining[0], "replace")
        } else {
          selectUnsaved()
        }
      }
    },
    [activateView, activeViewId, selectUnsaved, views],
  )

  /*
   * The last view this operator opened, restored on a bare campaign landing.
   * A landing link with grid keys is left alone: it is an arrangement, not a
   * request for "wherever I was last". Runs once per mount.
   */
  const restoredLastViewRef = useRef(false)

  useEffect(() => {
    if (restoredLastViewRef.current) {
      return
    }

    restoredLastViewRef.current = true

    if (activeViewId || landingHadGridKeysRef.current) {
      return
    }

    if (!lastViewId) {
      return
    }

    const view = views.find((entry) => entry.id === lastViewId)

    if (view) {
      activateView(view, "replace")
    }
  }, [activateView, activeViewId, lastViewId, views])

  /* A pending edit has to survive leaving the page, not just leaving the view. */
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
      }

      const pending = pendingSaveRef.current
      pendingSaveRef.current = null

      if (pending) {
        void updateSavedViewRequest(CAMPAIGNS_VIEWS_ENDPOINT, pending.viewId, {
          config: pending.config,
        }).catch(() => {})
      }
    }
  }, [])

  /**
   * A table state as the configuration a view stores. `currentConfig` reads the
   * URL-derived state, which is a beat behind an edit; this builds from the
   * state the handler was handed.
   */
  const configForState = useCallback(
    (
      state: Partial<TableState>,
      tree: GridFilterGroup,
      nextDensity: GridDensity = density,
    ): GridViewConfig => ({
      sorting: state.sorting ?? [],
      globalFilter: typeof state.globalFilter === "string" ? state.globalFilter : "",
      filter: flattenConditions(tree).length > 0 ? filterGroupToSerialized(tree) : null,
      columnOrder: state.columnOrder ?? [],
      hiddenColumnIds: Object.keys(state.columnVisibility ?? {}).filter(
        (id) => state.columnVisibility?.[id] === false,
      ),
      columnSizing: state.columnSizing ?? {},
      density: nextDensity,
    }),
    [density],
  )

  /** Every edit path queues its own save: sort, fields, order, width, search. */
  const handleGridStateChange = useCallback<OnChangeFn<TableState>>(
    (updater) => {
      const resolved =
        typeof updater === "function"
          ? (updater as (previous: Partial<TableState>) => Partial<TableState>)(viewState)
          : updater

      scheduleSave(configForState(resolved, filterTree))
      onStateChange(updater)
    },
    [configForState, filterTree, onStateChange, scheduleSave, viewState],
  )

  const handleDensityChange = useCallback(
    (next: GridDensity) => {
      scheduleSave(configForState(viewState, filterTree, next))
      setDensity(next)
    },
    [configForState, filterTree, scheduleSave, viewState],
  )

  const handleFilterTreeChange = useCallback<typeof onFilterTreeChange>(
    (next, immediate) => {
      scheduleSave(configForState(viewState, next))
      onFilterTreeChange(next, immediate)
    },
    [configForState, onFilterTreeChange, scheduleSave, viewState],
  )

  const handleClearFilters = useCallback(() => {
    const cleared = configForState(viewState, createFilterGroup())

    scheduleSave({ ...cleared, sorting: [], globalFilter: "", filter: null })
    clearFilters()
  }, [clearFilters, configForState, scheduleSave, viewState])

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id] === true),
    [rowSelection],
  )
  const selectedCount = selectedIds.length
  const selectionKey = selectedIds.join(",")

  // A pre-check answers for one exact selection; anything else on screen is
  // stale and is treated as if it had never been asked.
  const conflictCount = precheck !== null && precheck.key === selectionKey ? precheck.conflictCount : 0
  const conflicts = useMemo(
    () => (precheck !== null && precheck.key === selectionKey ? precheck.conflicts : []),
    [precheck, selectionKey],
  )
  const assignableCount = Math.max(selectedCount - conflictCount, 0)

  const weightsKey = picker.map((entry) => `${entry.userId}:${entry.weight}`).join("|")
  const previewKey = `${assignableCount}|${weightsKey}`
  const allWeightsValid = picker.every((entry) => parseWeight(entry.weight) !== null)
  const currentPreview = preview !== null && preview.key === previewKey ? preview : null

  const availableCallers = callers.filter((caller) => !picker.some((entry) => entry.userId === caller.userId))
  const weightsAreEqual =
    picker.length > 0 && picker.every((entry) => entry.weight === picker[0].weight)

  useEffect(() => {
    if (selectedCount === 0) {
      setPrecheck(null)
      setIsPrechecking(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setIsPrechecking(true)

      void (async () => {
        try {
          const response = await fetch(`/api/dialer/admin/campaigns/${campaignId}/assignments/precheck`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactIds: selectedIds }),
            signal: controller.signal,
          })
          const payload = (await response.json().catch(() => null)) as
            | { conflicts?: AssignmentConflictView[]; error?: string; code?: string }
            | null

          if (controller.signal.aborted) {
            return
          }

          setIsPrechecking(false)

          if (!response.ok || !payload || !Array.isArray(payload.conflicts)) {
            setPrecheck(null)
            setWriteError(errorMessage(payload))
            return
          }

          setPrecheck({ key: selectionKey, conflictCount: payload.conflicts.length, conflicts: payload.conflicts })
        } catch {
          if (controller.signal.aborted) {
            return
          }

          setIsPrechecking(false)
          setPrecheck(null)
        }
      })()
    }, PRECHECK_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [campaignId, selectedCount, selectedIds, selectionKey])

  useEffect(() => {
    if (assignableCount === 0 || picker.length === 0 || !allWeightsValid) {
      setPreview(null)
      setPreviewError(null)
      setIsPreviewing(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setIsPreviewing(true)

      void (async () => {
        try {
          const response = await fetch(`/api/dialer/admin/campaigns/${campaignId}/assignments/preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              total: assignableCount,
              // The picker's identity is the staff user, not `dialer_callers.id`:
              // AD-13's auto-promote means most eligible callers have no profile
              // row until their first assignment writes one.
              callers: picker.map((entry) => ({ callerId: entry.userId, weight: parseWeight(entry.weight) })),
            }),
            signal: controller.signal,
          })

          const payload = (await response.json().catch(() => null)) as
            | { split?: AssignmentSplitEntryView[]; error?: string; code?: string }
            | null

          if (controller.signal.aborted) {
            return
          }

          if (!response.ok || !payload || !Array.isArray(payload.split)) {
            setPreview(null)
            setPreviewError(errorMessage(payload))
            setIsPreviewing(false)
            return
          }

          setPreview({ key: previewKey, split: payload.split })
          setPreviewError(null)
          setIsPreviewing(false)
        } catch {
          if (controller.signal.aborted) {
            return
          }

          setPreview(null)
          setPreviewError("Unable to reach the server. The split was not previewed.")
          setIsPreviewing(false)
        }
      })()
    }, PREVIEW_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [assignableCount, campaignId, picker, allWeightsValid, previewKey])

  const setVisibleSelection = useCallback((selected: boolean, visibleIds: readonly string[]) => {
    setRowSelection((current) => {
      const next: RowSelectionState = { ...current }

      for (const id of visibleIds) {
        if (selected) {
          next[id] = true
        } else {
          delete next[id]
        }
      }

      return next
    })
  }, [])

  const addCaller = (caller: AssignableCallerView) => {
    setPicker((current) => [...current, { userId: caller.userId, name: caller.name, weight: "1" }])
  }

  const updateWeight = (userId: string, weight: string) => {
    setPicker((current) => current.map((entry) => (entry.userId === userId ? { ...entry, weight } : entry)))
  }

  const stepWeight = (entry: PickerEntry, direction: -1 | 1) => {
    const current = parseWeight(entry.weight) ?? MIN_WEIGHT
    const next = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, current + direction))

    updateWeight(entry.userId, String(next))
  }

  const removeCaller = (userId: string) => {
    setPicker((current) => current.filter((entry) => entry.userId !== userId))
  }

  const locationLabel = (row: AssignableContactView): string => {
    const names = row.locationIds
      .map((id) => locationNames.get(id))
      .filter((name): name is string => typeof name === "string" && name.length > 0)

    if (names.length > 0) {
      return names.join(", ")
    }

    // A contact whose stored id has no row in this programme's lexicon is
    // surfaced as unknown, never silently rendered as "no location".
    return row.locationIds.length > 0 ? UNRESOLVED_LOCATION : ""
  }

  const columns = useMemo<GridColumnDef<AssignableContactView>[]>(() => {
    const helper = createColumnHelper<AssignableContactView>()

    return [
      helper.display({
        id: SELECT_COLUMN_ID,
        header: ({ table }) => (
          <span className="flex w-full items-center gap-1 px-1">
            <span aria-hidden="true" className="w-3 shrink-0" />
            <span className="flex w-4 shrink-0 justify-center">
              <SelectAllControl table={table} onToggle={setVisibleSelection} />
            </span>
            <span aria-hidden="true" className="w-8 shrink-0" />
          </span>
        ),
        cell: ({ row }) => {
          const selected = row.getIsSelected()

          return (
            <span
              className="flex items-center gap-1"
              onPointerDown={(event) => {
                // Without this the cell takes the pointer, the grid moves cell
                // focus to a non-editable column, and the next double-click
                // becomes a no-op.
                event.stopPropagation()
              }}
            >
              <span aria-hidden="true" className="w-3 shrink-0" />
              {/*
                One 16px slot, not two: the row number at rest, the selection
                checkbox once the row is hovered or selected. Both were measured
                at the same x, as on the contacts grid.
              */}
              {selected ? (
                <span className="flex w-4 shrink-0 justify-center">
                  <Checkbox
                    className="rounded-[3px]"
                    checked
                    onCheckedChange={(checked) => {
                      row.toggleSelected(checked === true)
                    }}
                    aria-label={`Select ${row.original.name}`}
                  />
                </span>
              ) : (
                <>
                  <span className="w-4 shrink-0 text-center text-[12px] tabular-nums text-[var(--grid-row-number-ink)] [tr:hover_&]:hidden">
                    <RowSerial fallback={row.index + 1} />
                  </span>
                  <span className="hidden w-4 shrink-0 justify-center [tr:hover_&]:flex">
                    <Checkbox
                      className="rounded-[3px]"
                      checked={false}
                      onCheckedChange={(checked) => {
                        row.toggleSelected(checked === true)
                      }}
                      aria-label={`Select ${row.original.name}`}
                    />
                  </span>
                </>
              )}

              <span className="flex w-8 shrink-0 justify-center">
                {recordContext?.canOpenContactRecord ? (
                  <GridRowExpandControl
                    label={`Expand ${row.original.name}`}
                    onExpand={(trigger) => openRecord(row.original.contactId, trigger)}
                  />
                ) : null}
              </span>
            </span>
          )
        },
        // The contacts grid's row-actions width: padding (16) + drag-grip
        // spacer (12) + serial/checkbox slot (16) + expand slot (32) and two
        // 4px gaps. The grip is a spacer here because this gutter has no drag;
        // 84 keeps the expand control on the same x as the Contacts grid.
        size: 84,
        minSize: 84,
        maxSize: 84,
        enableSorting: false,
        enableHiding: false,
        meta: { grid: { selectable: true, align: "center" } },
      }),

      helper.accessor("name", {
        id: NAME_COLUMN_ID,
        header: "Name",
        size: 220,
        meta: {
          grid: {
            frozen: true,
            fieldType: "text",
            emphasis: true,
            hideable: false,
          },
        },
      }),

      helper.accessor("phone", {
        id: PHONE_COLUMN_ID,
        header: "Phone",
        size: 150,
        meta: { grid: { fieldType: "text" } },
      }),

      helper.accessor((row) => row.initialContact ?? "", {
        id: INITIAL_CONTACT_COLUMN_ID,
        header: "Initial Contact",
        size: 140,
        meta: { grid: { fieldType: "date" } },
      }),

      helper.accessor((row) => locationLabel(row), {
        id: LOCATION_COLUMN_ID,
        header: "Location",
        size: 160,
        meta: { grid: { fieldType: "linked", unresolvedText: UNRESOLVED_LOCATION } },
      }),

      helper.accessor((row) => row.assignedCallerName ?? "", {
        id: ASSIGNED_TO_COLUMN_ID,
        header: "Assigned To",
        size: 170,
        cell: ({ getValue }) => {
          const value = getValue()

          return value.length > 0 ? (
            <span className="truncate text-[var(--program-text)]">{value}</span>
          ) : (
            <span className="text-[var(--muted-foreground)]">—</span>
          )
        },
        meta: { grid: { fieldType: "text" } },
      }),

      helper.accessor((row) => row.recentStatus?.label ?? "", {
        id: RECENT_STATUS_COLUMN_ID,
        header: "Recent status",
        size: 170,
        cell: ({ row }) => {
          const recent = row.original.recentStatus

          if (!recent) {
            return <span className="text-[var(--muted-foreground)]">—</span>
          }

          return (
            <span
              className={cn(RECENT_STATUS_PILL, recentStatusClass(recent.group))}
              title={`Called ${CALLED_AT_FORMATTER.format(new Date(recent.calledAt))}`}
            >
              {recent.label}
            </span>
          )
        },
        meta: { grid: { fieldType: "text" } },
      }),

      helper.accessor((row) => row.collectedByName ?? "", {
        id: COLLECTED_BY_COLUMN_ID,
        header: "Collected By",
        size: 170,
        cell: ({ getValue }) => {
          const value = getValue()

          return value.length > 0 ? (
            <span className="truncate text-[var(--program-text)]">{value}</span>
          ) : (
            <span className="text-[var(--muted-foreground)]">—</span>
          )
        },
        meta: { grid: { fieldType: "text" } },
      }),

      helper.accessor((row) => row.notes ?? "", {
        id: NOTES_COLUMN_ID,
        header: "Notes",
        size: 220,
        meta: { grid: { fieldType: "longtext" } },
      }),

      helper.accessor((row) => row.profile.centre ?? "", {
        id: CENTRE_COLUMN_ID,
        header: "Centre",
        size: 140,
        meta: { grid: { fieldType: "text" } },
      }),

      helper.accessor((row) => row.profile.level ?? "", {
        id: LEVEL_COLUMN_ID,
        header: "Level",
        size: 120,
        meta: { grid: { fieldType: "text" } },
      }),

      helper.accessor((row) => row.profile.gender ?? "", {
        id: GENDER_COLUMN_ID,
        header: "Gender",
        size: 120,
        meta: { grid: { fieldType: "text" } },
      }),

      helper.accessor((row) => row.profile.language ?? "", {
        id: LANGUAGE_COLUMN_ID,
        header: "Language",
        size: 140,
        meta: { grid: { fieldType: "text" } },
      }),
    ]
    // `locationLabel` reads the location lexicon, so the defs depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setVisibleSelection, locationNames, recordContext, openRecord])

  const submit = async (mode: "skip" | "move", pending: PendingAssignment | null = null) => {
    const contactIds = pending?.contactIds ?? selectedIds

    if (contactIds.length === 0 || picker.length === 0 || !allWeightsValid || isWriting) {
      return
    }

    setWriteError(null)
    setIsWriting(true)

    const callersPayload = picker.map((entry) => ({
      userId: entry.userId,
      weight: parseWeight(entry.weight) as number,
    }))

    try {
      const response = await fetch(`/api/dialer/admin/campaigns/${campaignId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds,
          callers: callersPayload,
          // The dialog asks for the decision only when a conflict exists.
          mode,
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { written?: number; error?: string; code?: string }
        | null

      if (!response.ok || !payload || typeof payload.written !== "number") {
        setWriteError(errorMessage(payload))
        setIsWriting(false)
        return
      }

      // Submitting is also the campaign's lifecycle action: a DRAFT starts on
      // the same click that assigns its contacts, and a campaign that is
      // already active is only assigned. Either way the operator leaves the
      // setup surface for the Overview, where the campaign now lives.
      if (campaignStatus === "DRAFT") {
        const started = await fetch(`/api/dialer/admin/campaigns/${campaignId}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        })
        const startPayload = (await started.json().catch(() => null)) as
          | { error?: string }
          | null

        if (!started.ok) {
          setWriteError(
            `The contacts were assigned, but the campaign was not started: ${
              startPayload?.error ?? "the server refused the transition."
            }`,
          )
          setIsWriting(false)
          return
        }
      }

      setIsWriting(false)
      router.push("/campaigns")
    } catch {
      setWriteError("Unable to reach the server. Nothing was assigned; your selection and callers are unchanged.")
      setIsWriting(false)
    }
  }

  const primaryLabel = (() => {
    if (isWriting) {
      return "Submitting…"
    }

    if (selectedCount === 0) {
      return "Select contacts to assign"
    }

    if (picker.length === 0) {
      return "Add a caller to assign"
    }

    return "Submit"
  })()

  const primaryDisabled =
    selectedCount === 0 ||
    picker.length === 0 ||
    !allWeightsValid ||
    isWriting ||
    isPrechecking ||
    (assignableCount === 0 && conflictCount === 0)

  const chosenCallerLabel =
    picker.length === 1
      ? picker[0]?.name ?? "the chosen caller"
      : picker.length > 1
        ? "the chosen callers"
        : "the chosen caller"

  const decision = pendingAssignment
  const decisionConflictCount = decision?.conflictCount ?? conflictCount
  const decisionSelectedCount = decision?.selectedCount ?? selectedCount
  const decisionAssignableCount = decision?.assignableCount ?? assignableCount
  const decisionConflicts = decision?.conflicts ?? conflicts

  const conflictGroups = useMemo(() => {
    const groups = new Map<string, AssignmentConflictView[]>()

    for (const conflict of decisionConflicts) {
      const caller = conflict.callerName || "another caller"
      const rows = groups.get(caller)

      if (rows) {
        rows.push(conflict)
      } else {
        groups.set(caller, [conflict])
      }
    }

    return [...groups.entries()]
  }, [decisionConflicts])

  const handleAssignClick = () => {
    if (
      selectedCount === 0 ||
      picker.length === 0 ||
      !allWeightsValid ||
      isPrechecking ||
      isWriting
    ) {
      return
    }

    const pending: PendingAssignment = {
      contactIds: selectedIds,
      selectedCount,
      conflictCount,
      assignableCount,
      conflicts,
    }

    // The click itself ends the selection; the write carries its own copy so a
    // dialog opened for a conflict still has the rows it is naming.
    setRowSelection({})
    setPrecheck(null)
    setPreview(null)
    setWriteError(null)

    if (pending.conflictCount > 0) {
      setPendingAssignment(pending)
      setAssignDecisionOpen(true)
      return
    }

    void submit("skip", pending)
  }

  return (
    <div
      ref={surfaceRef}
      className="flex min-h-0 items-stretch"
      style={{ height: surfaceHeight ?? undefined }}
    >
      {/*
        The saved-views sidebar, flush against the grid the way `/contacts`
        mounts it: the bar's 48px header lines up with the grid's toolbar, and
        the grid owns the rest of the height.
      */}
      <SavedViewsBar
        views={views}
        activeView={activeView}
        saveState={saveState}
        defaultName={suggestSavedViewName(views)}
        onSelectView={selectView}
        onSelectUnsaved={selectUnsaved}
        onCreateView={createView}
        onRenameView={renameView}
        onDuplicateView={duplicateView}
        onDeleteView={deleteView}
        currentUserId={currentUserId}
        open={viewsSidebarOpen}
        onToggle={toggleViewsSidebar}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-0">
          <section
            aria-label="Contacts in scope"
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <div className="flex h-[520px] min-h-0 flex-col lg:h-full">
              <AssignRecordOpenContext.Provider
                value={recordContext?.canOpenContactRecord ? openRecord : null}
              >
                <Grid<AssignableContactView>
                  rows={contacts}
                  columns={columns}
                  getRowId={(contact) => contact.contactId}
                  state={{ ...viewState, rowSelection }}
                  onStateChange={handleGridStateChange}
                  filterTree={filterTree}
                  onFilterTreeChange={handleFilterTreeChange}
                  onRowSelectionChange={setRowSelection}
                  onVisibleRowIdsChange={setVisibleRowIds}
                  rowContextMenu={AssignContactsRowContextMenu}
                  ariaLabel="Contacts in scope"
                  density={density}
                  onDensityChange={handleDensityChange}
                  transient={{
                    begin: beginTransientChange,
                    commit: commitTransientChange,
                    cancel: cancelTransientChange,
                  }}
                  onClearFilters={handleClearFilters}
                  className={cn(
                    // A collapsed bar leaves its toggle floating over the grid's
                    // leading edge; the toolbar shifts right to make room for it.
                    viewsSidebarOpen ? undefined : "[&_[data-grid-toolbar]]:pl-[292px]",
                  )}
                />
              </AssignRecordOpenContext.Provider>
            </div>
          </section>

          <aside
            aria-label="Assignment"
            className="flex min-h-0 w-full shrink-0 flex-col lg:w-[408px]"
          >
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-none border border-[var(--border)] bg-card">
          <div aria-label="Assign contacts" className="flex h-full min-h-0 w-full flex-col">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2
                id="assign-contacts-callers-heading"
                className="font-[family-name:var(--font-poppins)] text-[16px] font-semibold text-[var(--program-text)]"
              >
                Assign to
              </h2>
            </div>

                <section
                  aria-labelledby="assign-contacts-callers-heading"
                  className="min-h-0 flex-1 overflow-y-auto p-4"
                >
                  <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-[14px] font-medium text-[var(--program-text)]">Callers</p>
            <p className="text-[12px] text-[var(--muted-foreground)]">
              Higher weight gets more contacts. Equal weights split evenly.
            </p>
          </div>

          {picker.length === 0 ? (
            <p className="text-[13px] text-[var(--muted-foreground)]">No callers chosen yet.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[12px] text-[var(--muted-foreground)]">
                  <th scope="col" className="pb-1 text-left font-normal">
                    Caller
                  </th>
                  <th scope="col" className="w-[100px] pb-1 text-center font-normal">
                    Weight
                  </th>
                  <th scope="col" className="w-11 pb-1 text-right font-normal">
                    Contacts
                  </th>
                  <th scope="col" className="w-4 pb-1">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {picker.map((entry) => {
                  const count = currentPreview?.split.find((part) => part.callerId === entry.userId)?.count
                  const weight = parseWeight(entry.weight)

                  return (
                    <tr key={entry.userId} className="border-t border-[var(--border)] first:border-t-0">
                      <td className="pr-2">
                        <div className="flex h-12 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--program-primary)] text-[11px] font-semibold text-white"
                          >
                            {initials(entry.name)}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-[14px] text-[var(--program-text)]"
                            title={entry.name}
                          >
                            {entry.name}
                          </span>
                        </div>
                      </td>

                      <td className="px-0">
                        <div className="mx-auto flex h-8 w-[100px] items-center overflow-hidden rounded-lg border border-[var(--border)] bg-card">
                          <button
                            type="button"
                            aria-label={`Decrease weight for ${entry.name}`}
                            disabled={(weight ?? MIN_WEIGHT) <= MIN_WEIGHT}
                            onClick={() => stepWeight(entry, -1)}
                            className="flex h-full w-8 items-center justify-center text-[var(--muted-foreground)] disabled:opacity-40"
                          >
                            <Minus className="size-3.5" aria-hidden="true" />
                          </button>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={MIN_WEIGHT}
                            max={MAX_WEIGHT}
                            step={1}
                            aria-label={`Weight for ${entry.name}`}
                            value={entry.weight}
                            onChange={(event) => updateWeight(entry.userId, event.target.value)}
                            className="h-full w-9 rounded-none border-x border-y-0 px-0 text-center text-[15px] font-semibold tabular-nums"
                          />
                          <button
                            type="button"
                            aria-label={`Increase weight for ${entry.name}`}
                            disabled={(weight ?? MIN_WEIGHT) >= MAX_WEIGHT}
                            onClick={() => stepWeight(entry, 1)}
                            className="flex h-full w-8 items-center justify-center text-[var(--muted-foreground)] disabled:opacity-40"
                          >
                            <Plus className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>

                      <td className="text-right text-[16px] font-semibold tabular-nums text-[var(--program-text)]">
                        {typeof count === "number" ? count : "—"}
                      </td>

                      <td className="pl-1">
                        <button
                          type="button"
                          aria-label={`Remove ${entry.name}`}
                          onClick={() => removeCaller(entry.userId)}
                          className="flex size-4 items-center justify-center text-[var(--muted-foreground)] transition-colors hover:text-[var(--program-text)]"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          <div className="flex items-center justify-between gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={availableCallers.length === 0}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--muted-foreground)] transition-colors hover:text-[var(--program-text)] disabled:opacity-50"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add caller
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                {availableCallers.map((caller) => (
                  <DropdownMenuItem key={caller.userId} onSelect={() => addCaller(caller)} className="text-[13px]">
                    {caller.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {weightsAreEqual ? null : (
              <button
                type="button"
                onClick={() => {
                  setPicker((current) => current.map((entry) => ({ ...entry, weight: "1" })))
                }}
                className="text-[13px] text-[var(--muted-foreground)] hover:text-[var(--program-text)]"
              >
                Reset to equal
              </button>
            )}
          </div>
        </div>

        {!allWeightsValid ? (
          <p role="alert" className="text-[13px] text-[var(--destructive)]">
            Weights must be whole numbers between {MIN_WEIGHT} and {MAX_WEIGHT}.
          </p>
        ) : null}

        {previewError ? (
          <p role="alert" className="text-[13px] text-[var(--destructive)]">
            {previewError}
          </p>
        ) : null}

        {conflictCount > 0 ? (
          <p className="flex items-start gap-2 text-[13px] text-[var(--grid-warning-ink)]">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {conflictCount} selected {conflictCount === 1 ? "contact is" : "contacts are"} already assigned in
              this campaign.
            </span>
          </p>
        ) : null}

        {writeError ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--destructive)] px-3 py-2 text-[13px] text-[var(--destructive)]"
          >
            {writeError}
          </p>
        ) : null}

        {isPreviewing ? <p className="sr-only">Previewing the split</p> : null}
                </section>

                <AssignContactsAssignedBar campaignStatus={campaignStatus} contacts={contacts} />

                <div className="border-t border-[var(--border)] p-3">
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
                    <span className="font-medium text-[var(--program-text)]">
                      {selectedCount} of {contacts.length} selected
                    </span>
                    {isPrechecking ? <span>Checking assignments…</span> : null}
                  </p>
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    disabled={primaryDisabled}
                    onClick={handleAssignClick}
                  >
                    {primaryLabel}
                  </Button>
                </div>
          </div>
        </div>
      </aside>

      <AlertDialog
        open={assignDecisionOpen}
        onOpenChange={(open) => {
          setAssignDecisionOpen(open)
          if (!open) {
            setPendingAssignment(null)
          }
        }}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-x-hidden overflow-y-auto sm:w-fit sm:min-w-[30rem] sm:max-w-[min(42rem,calc(100vw-2rem))]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {decisionAssignableCount > 0
                ? `${decisionConflictCount} of ${decisionSelectedCount} ${
                    decisionSelectedCount === 1 ? "contact" : "contacts"
                  } ${decisionConflictCount === 1 ? "is" : "are"} already assigned`
                : decisionSelectedCount === 1
                  ? "This contact is already assigned"
                  : `All ${decisionSelectedCount} contacts are already assigned`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              {decisionAssignableCount > 0
                ? `Skip ${decisionConflictCount === 1 ? "it" : "them"} and assign the ${decisionAssignableCount} remaining ${
                    decisionAssignableCount === 1 ? "contact" : "contacts"
                  }, or reassign ${decisionConflictCount === 1 ? "it" : "them"} to ${chosenCallerLabel}.`
                : `Reassign ${decisionConflictCount === 1 ? "it" : "them"} to ${chosenCallerLabel}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {conflictGroups.length > 0 ? (
            <div
              role="group"
              aria-label="Contacts already assigned"
              className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3"
            >
              {conflictGroups.map(([callerName, rows]) => (
                <div key={callerName}>
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">
                    Currently assigned to {callerName}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {rows.map((row) => (
                      <li
                        key={row.contactId}
                        className="break-words text-[13px] leading-5 text-[var(--program-text)]"
                      >
                        {row.contactName}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {decisionAssignableCount > 0 ? (
                <Button
                  type="button"
                  className="bg-[var(--program-primary)] text-primary-foreground hover:bg-[var(--program-primary)]/90 h-auto min-h-9 w-full max-w-full py-2 text-[13px] whitespace-normal sm:w-auto"
                  disabled={isWriting}
                  onClick={() => {
                    setAssignDecisionOpen(false)
                    void submit("skip", pendingAssignment)
                  }}
                >
                  Skip {decisionConflictCount} and assign {decisionAssignableCount}
                </Button>
              ) : null}
              <Button
                type="button"
                variant={decisionAssignableCount > 0 ? "outline" : "default"}
                className={
                  decisionAssignableCount > 0
                    ? "h-auto min-h-9 w-full max-w-full py-2 text-[13px] whitespace-normal sm:w-auto"
                    : "bg-[var(--program-primary)] text-primary-foreground hover:bg-[var(--program-primary)]/90 h-auto min-h-9 w-full max-w-full py-2 text-[13px] whitespace-normal sm:w-auto"
                }
                disabled={isWriting}
                onClick={() => {
                  setAssignDecisionOpen(false)
                  void submit("move", pendingAssignment)
                }}
              >
                Reassign all
              </Button>
            </div>
            <AlertDialogCancel
              disabled={isWriting}
              className="border-transparent bg-transparent text-[13px] text-[var(--muted-foreground)] shadow-none hover:bg-[var(--muted)] hover:text-[var(--program-text)] w-full sm:ml-auto sm:w-auto"
            >
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </div>
      </div>
    </div>
  )
}
