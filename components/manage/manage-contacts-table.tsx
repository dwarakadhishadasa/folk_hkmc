"use client"

import { useCallback, useMemo, useState } from "react"
import { createColumnHelper } from "@tanstack/react-table"
import type { RowSelectionState, Table } from "@tanstack/react-table"

import type {
  ManageContact,
  ManageContactBulkItem,
  ManageContactBulkResult,
  ManageContactPatch,
  ManageContactPatchKey,
  ManageContactWriteResult,
  ManagePortalPayload,
} from "@/components/manage/manage-types"
import {
  Grid,
  useGridViewState,
  type GridCellCommit,
  type GridColumnDef,
  type GridDensity,
} from "@/components/grid"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

const columnHelper = createColumnHelper<ManageContact>()

/**
 * Defensively narrows an unknown response body before its message is shown.
 *
 * Every fetch path in this component routes through this, including the batch:
 * a malformed payload once meant a render crash, and a bulk response that cannot
 * be verified must never be reported as a success.
 */
function readError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value) {
      return value
    }
  }

  return fallback
}

const SELECT_COLUMN_ID = "select"
const NAME_COLUMN_ID = "name"
const PHONE_COLUMN_ID = "phone"
const LOCATION_COLUMN_ID = "location"
const TOTAL_COLUMN_ID = "totalAttendanceCount"
const PAST_60_COLUMN_ID = "past60DayAttendanceCount"
const LAST_CONTACTED_COLUMN_ID = "lastContactedOn"
const NOTES_COLUMN_ID = "notes"
const COLLECTED_BY_COLUMN_ID = "collectedBy"
const FAVORITE_COLUMN_ID = "favorite"

/**
 * Display order, and the layout every later `/manage` table copies: the selection
 * control leads, the frozen identity column follows it, and the row action closes
 * the table. `name` is frozen because `design-constraints.md` requires that
 * scrolling right never loses the row's identity, and the select column is in
 * front of it — which is why freezing is a marked run with cumulative offsets
 * rather than "whichever column happens to be first".
 */
const COLUMN_IDS: readonly string[] = [
  SELECT_COLUMN_ID,
  NAME_COLUMN_ID,
  PHONE_COLUMN_ID,
  LOCATION_COLUMN_ID,
  TOTAL_COLUMN_ID,
  PAST_60_COLUMN_ID,
  LAST_CONTACTED_COLUMN_ID,
  NOTES_COLUMN_ID,
  COLLECTED_BY_COLUMN_ID,
  FAVORITE_COLUMN_ID,
]

const COLUMN_LABELS: Record<string, string> = {
  [NAME_COLUMN_ID]: "Name",
  [PHONE_COLUMN_ID]: "Phone",
  [LOCATION_COLUMN_ID]: "Location",
  [TOTAL_COLUMN_ID]: "Total Attendance",
  [PAST_60_COLUMN_ID]: "Past 60 Days",
  [LAST_CONTACTED_COLUMN_ID]: "Last Contacted On",
  [NOTES_COLUMN_ID]: "Notes",
  [COLLECTED_BY_COLUMN_ID]: "Collected By",
  [FAVORITE_COLUMN_ID]: "Favorite",
}

/**
 * The only columns an inline edit may write, mapped to their patch key.
 *
 * An id absent from this table rejects the commit rather than sending a patch:
 * the server's `MANAGE_CONTACT_PATCH_KEYS` allow-list is the real boundary, and
 * this map is what keeps a column that merely *looks* editable from reaching it.
 */
const PATCH_KEY_BY_COLUMN: Partial<Record<string, ManageContactPatchKey>> = {
  [NAME_COLUMN_ID]: "name",
  [PHONE_COLUMN_ID]: "phone",
  [NOTES_COLUMN_ID]: "notes",
}

/** Per-row bulk outcome. `message` is the server's wording, never a summary. */
interface BulkRowOutcome {
  contactId: string
  name: string
  ok: boolean
  message: string
}

interface BulkReport {
  /** Counts only. Never the sole record of what happened. */
  heading: string
  rows: BulkRowOutcome[]
}

interface Notice {
  kind: "ok" | "error"
  message: string
}

/**
 * The header's select-all.
 *
 * Its state describes the rows currently in view rather than the whole selection,
 * so a mixed view renders "indeterminate" and names both counts. Toggling it acts
 * on the visible rows only, leaving rows selected outside the current filter
 * alone — narrowing a filter must not silently discard what the operator picked.
 */
function SelectAllControl({
  table,
  onToggle,
}: {
  table: Table<ManageContact>
  onToggle: (selected: boolean, visibleIds: readonly string[]) => void
}) {
  const visibleRows = table.getRowModel().rows
  const visibleIds = visibleRows.map((row) => row.id)
  const selectedInView = visibleRows.filter((row) => row.getIsSelected()).length

  return (
    <span
      className="flex justify-center"
      onPointerDown={(event) => {
        // Without this the cell takes the pointer, the grid moves cell focus to a
        // non-editable column, and the next `e` becomes a no-op.
        event.stopPropagation()
      }}
    >
      <Checkbox
        checked={
          selectedInView === 0 ? false : selectedInView === visibleIds.length ? true : "indeterminate"
        }
        disabled={visibleIds.length === 0}
        onCheckedChange={(checked) => {
          onToggle(checked === true, visibleIds)
        }}
        aria-label={
          selectedInView > 0
            ? `Select all rows in view (${selectedInView} of ${visibleIds.length} in view selected)`
            : "Select all rows in view"
        }
      />
    </span>
  )
}

/**
 * One line per selected row.
 *
 * A collapsed toast fails the capability even when every row succeeded, so
 * successes are listed individually too, and a failure always names the row it
 * happened on together with the server's own reason.
 */
function BulkReportPanel({
  report,
  onDismiss,
}: {
  report: BulkReport
  onDismiss: () => void
}) {
  return (
    <section
      aria-label="Bulk action results"
      className="rounded-md border border-border bg-card px-3 py-2 text-[13px]"
    >
      <div className="flex items-start justify-between gap-3">
        <p role="status" className="font-medium">
          {report.heading}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[13px]"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>

      <ul aria-live="polite" className="text-muted-foreground mt-1 divide-y divide-border">
        {report.rows.map((row) => (
          <li key={row.contactId} className="flex items-baseline gap-2 py-1">
            <span aria-hidden="true">{row.ok ? "✓" : "✕"}</span>
            <span className="text-foreground min-w-0 flex-1 truncate font-medium">{row.name}</span>
            <span className={row.ok ? "shrink-0" : "text-destructive shrink-0"}>{row.message}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ManageContactsTable({ payload }: { payload: ManagePortalPayload }) {
  const [density, setDensity] = useState<GridDensity>("default")
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pendingContactId, setPendingContactId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [bulkReport, setBulkReport] = useState<BulkReport | null>(null)
  const [bulkRunning, setBulkRunning] = useState(false)

  /**
   * The committed rows, mirrored from the payload so a write can be applied
   * optimistically without a round trip.
   *
   * A new payload identity replaces the mirror wholesale. That is the only thing
   * that can change scope or carry a re-read row, and resetting during render
   * rather than in an effect is what keeps the previous scope's rows from being
   * painted even for one frame.
   */
  const [mirror, setContacts] = useState<{ source: ManageContact[]; rows: ManageContact[] }>(
    () => ({ source: payload.contacts, rows: payload.contacts }),
  )

  if (mirror.source !== payload.contacts) {
    setContacts({ source: payload.contacts, rows: payload.contacts })
  }

  const contacts = mirror.rows

  const {
    state: viewState,
    onStateChange,
    clearFilters,
    beginTransientChange,
    commitTransientChange,
    cancelTransientChange,
  } = useGridViewState({ columnIds: COLUMN_IDS })

  const locationNameById = useMemo(
    () => new Map(payload.locations.map((location) => [location.id, location.name])),
    [payload.locations],
  )

  const applyWrite = useCallback((written: ManageContactWriteResult) => {
    setContacts((current) => ({
      ...current,
      rows: current.rows.map((contact) =>
        contact.id === written.id ? { ...contact, ...written } : contact,
      ),
    }))
  }, [])

  /**
   * The one write path an inline edit and a row action both take.
   *
   * It throws with the server's message, because `use-grid-keyboard` resolves a
   * rejected commit into a visible revert and a status line — a second error
   * surface here would be a third thing to keep in step.
   */
  const patchContact = useCallback(async (contactId: string, patch: ManageContactPatch) => {
    let response: Response

    try {
      response = await fetch("/api/manage/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, ...patch }),
      })
    } catch (cause) {
      // Named rather than passed through: a raw `TypeError: fetch failed` is not
      // something an operator can act on.
      throw new Error("Unable to reach the server.", { cause })
    }

    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(readError(body, "The change could not be saved."))
    }

    const written = (body as { contact?: ManageContactWriteResult } | null)?.contact

    if (!written || typeof written !== "object") {
      throw new Error("The server did not return the saved row.")
    }

    return written
  }, [])

  const handleCellCommit = useCallback(
    async (commit: GridCellCommit<ManageContact>) => {
      const patchKey = PATCH_KEY_BY_COLUMN[commit.columnId]

      if (!patchKey) {
        const label = COLUMN_LABELS[commit.columnId] ?? commit.columnId
        throw new Error(`${label} cannot be edited here.`)
      }

      applyWrite(await patchContact(commit.rowId, { [patchKey]: commit.value }))
    },
    [applyWrite, patchContact],
  )

  const toggleFavorite = useCallback(
    async (contact: ManageContact) => {
      setPendingContactId(contact.id)
      setNotice(null)

      try {
        const written = await patchContact(contact.id, { isFavorite: !contact.isFavorite })
        applyWrite(written)
        setNotice({
          kind: "ok",
          message: `${written.name} ${written.isFavorite ? "added to" : "removed from"} favorites.`,
        })
      } catch (cause) {
        setNotice({
          kind: "error",
          message: cause instanceof Error ? cause.message : "Unable to save the favorite.",
        })
      } finally {
        setPendingContactId(null)
      }
    },
    [applyWrite, patchContact],
  )

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

  const runBulkFavorite = useCallback(async () => {
    const targets = contacts.filter((contact) => rowSelection[contact.id] === true)

    if (targets.length === 0) {
      // No request is issued for an empty selection, and the control is not
      // offered in that state.
      return
    }

    setBulkRunning(true)
    setBulkReport(null)

    /** One entry per selected row, whatever the batch turns out to have done. */
    const failed = (message: string): BulkReport => ({
      heading: `Nothing was saved. ${targets.length} row${targets.length === 1 ? "" : "s"} failed.`,
      rows: targets.map((contact) => ({
        contactId: contact.id,
        name: contact.name,
        ok: false,
        message,
      })),
    })

    try {
      let response: Response
      const items: ManageContactBulkItem[] = targets.map((contact) => ({
        contactId: contact.id,
        patch: { isFavorite: true },
      }))

      try {
        response = await fetch("/api/manage/contacts/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        })
      } catch {
        setBulkReport(failed("Unable to reach the server."))
        return
      }

      const body: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        setBulkReport(failed(readError(body, "The bulk update was rejected.")))
        return
      }

      const results = (body as { results?: unknown } | null)?.results

      // Never report success on a payload that cannot be verified: an
      // unverifiable batch leaves every row showing its prior value.
      if (!Array.isArray(results)) {
        setBulkReport(failed("The server's response did not include per-row results."))
        return
      }

      const outcomeById = new Map<string, ManageContactBulkResult>()
      for (const entry of results) {
        const result = entry as ManageContactBulkResult | null
        if (result && typeof result.contactId === "string") {
          outcomeById.set(result.contactId, result)
        }
      }

      const writes = new Map<string, ManageContactWriteResult>()

      const rows = targets.map((contact) => {
        const result = outcomeById.get(contact.id)

        if (!result) {
          return {
            contactId: contact.id,
            name: contact.name,
            ok: false,
            message: "The server did not report a result for this row.",
          }
        }

        if (result.ok && result.contact) {
          writes.set(result.contact.id, result.contact)
          return { contactId: contact.id, name: contact.name, ok: true, message: "Saved." }
        }

        return {
          contactId: contact.id,
          name: contact.name,
          ok: false,
          message: result.error ?? "The row could not be saved.",
        }
      })

      // Only the rows the server confirmed are applied; a failed row keeps the
      // value the operator can already see.
      if (writes.size > 0) {
        setContacts((current) => ({
          ...current,
          rows: current.rows.map((contact) => {
            const written = writes.get(contact.id)
            return written ? { ...contact, ...written } : contact
          }),
        }))
      }

      const succeeded = rows.filter((row) => row.ok).length
      setBulkReport({
        heading: `${succeeded} of ${rows.length} rows saved.`,
        rows,
      })
    } finally {
      setBulkRunning(false)
      // Cleared once the run is over, never during it: the operator has to be
      // able to read the per-row outcomes and then select again.
      setRowSelection({})
    }
  }, [contacts, rowSelection])

  const columns = useMemo<GridColumnDef<ManageContact>[]>(() => {
    return [
      columnHelper.display({
        id: SELECT_COLUMN_ID,
        header: ({ table }) => (
          <SelectAllControl table={table} onToggle={setVisibleSelection} />
        ),
        cell: ({ row }) => (
          <span
            className="flex justify-center"
            onPointerDown={(event) => {
              // Without this the cell takes the pointer, the grid moves cell focus
              // to a non-editable column, and the next `e` becomes a no-op.
              event.stopPropagation()
            }}
          >
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => {
                row.toggleSelected(checked === true)
              }}
              aria-label={`Select ${row.original.name}`}
            />
          </span>
        ),
        size: 40,
        // Pinned to a narrow gutter: the grid's shared `minSize` would otherwise
        // widen a one-checkbox column to 72px, and the width is what the next
        // column's pinned offset is computed from.
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableHiding: false,
        meta: { grid: { selectable: true, align: "center" } },
      }),

      columnHelper.accessor("name", {
        id: NAME_COLUMN_ID,
        header: COLUMN_LABELS[NAME_COLUMN_ID],
        size: 200,
        // Pinned: scrolling right must never lose the row's identity. `hideable:
        // false` because a column that cannot scroll away cannot be hidden either.
        meta: { grid: { frozen: true, editable: true, filter: "text", hideable: false } },
      }),

      columnHelper.accessor("phone", {
        id: PHONE_COLUMN_ID,
        header: COLUMN_LABELS[PHONE_COLUMN_ID],
        size: 140,
        meta: { grid: { editable: true, filter: "text" } },
      }),

      // Joined rather than an array so both the per-column text filter and the
      // sort order read the same value the operator sees in the cell.
      columnHelper.accessor(
        (contact) => contact.locationIds.map((id) => locationNameById.get(id) ?? id).join(", "),
        {
          id: LOCATION_COLUMN_ID,
          header: COLUMN_LABELS[LOCATION_COLUMN_ID],
          size: 180,
          meta: { grid: { filter: "text" } },
        },
      ),

      columnHelper.accessor("totalAttendanceCount", {
        id: TOTAL_COLUMN_ID,
        header: COLUMN_LABELS[TOTAL_COLUMN_ID],
        size: 130,
        meta: { grid: { filter: "number", align: "right", tabular: true } },
      }),

      columnHelper.accessor("past60DayAttendanceCount", {
        id: PAST_60_COLUMN_ID,
        header: COLUMN_LABELS[PAST_60_COLUMN_ID],
        size: 110,
        meta: { grid: { filter: "number", align: "right", tabular: true } },
      }),

      // Read as an ISO date by the server, so it sorts correctly as text.
      columnHelper.accessor("lastContactedOn", {
        id: LAST_CONTACTED_COLUMN_ID,
        header: COLUMN_LABELS[LAST_CONTACTED_COLUMN_ID],
        size: 140,
      }),

      // Truncates to one line at the fixed row height; the cell's `title` carries
      // the full text, because reintroducing wrapping would break the density
      // contract the whole grid is built on.
      columnHelper.accessor("notes", {
        id: NOTES_COLUMN_ID,
        header: COLUMN_LABELS[NOTES_COLUMN_ID],
        size: 240,
        meta: { grid: { editable: true } },
      }),

      columnHelper.accessor(
        (contact) =>
          contact.collectedById ? (payload.staffNames[contact.collectedById] ?? "") : "",
        {
          id: COLLECTED_BY_COLUMN_ID,
          header: COLUMN_LABELS[COLLECTED_BY_COLUMN_ID],
          size: 160,
          meta: { grid: { filter: "text" } },
        },
      ),

      columnHelper.display({
        id: FAVORITE_COLUMN_ID,
        header: COLUMN_LABELS[FAVORITE_COLUMN_ID],
        cell: ({ row }) => (
          <span
            className="flex justify-center"
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
          >
            <button
              type="button"
              disabled={pendingContactId === row.original.id}
              aria-pressed={row.original.isFavorite}
              aria-label={
                row.original.isFavorite
                  ? `Remove ${row.original.name} from favorites`
                  : `Add ${row.original.name} to favorites`
              }
              onClick={() => {
                void toggleFavorite(row.original)
              }}
              className="text-[var(--program-accent)] text-lg leading-none disabled:opacity-40"
            >
              {row.original.isFavorite ? "★" : "☆"}
            </button>
          </span>
        ),
        size: 48,
        minSize: 48,
        maxSize: 48,
        enableSorting: false,
        meta: { grid: { align: "center" } },
      }),
    ]
  }, [locationNameById, payload.staffNames, pendingContactId, setVisibleSelection, toggleFavorite])

  const selectedCount = useMemo(
    () =>
      contacts.reduce(
        (total, contact) => total + (rowSelection[contact.id] === true ? 1 : 0),
        0,
      ),
    [contacts, rowSelection],
  )

  const toolbarExtra = (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-[13px] tabular-nums" data-bulk-selection-count="">
        {selectedCount} selected
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[13px]"
        disabled={selectedCount === 0 || bulkRunning}
        onClick={() => {
          void runBulkFavorite()
        }}
      >
        {bulkRunning ? "Saving…" : "Add selected to favorites"}
      </Button>
    </div>
  )

  return (
    <div className="space-y-3">
      <h2 className="font-[family-name:var(--font-poppins)] text-lg font-semibold text-[var(--program-text)]">
        Contacts
      </h2>

      {notice ? (
        <p
          role="status"
          className={
            notice.kind === "error"
              ? "text-sm font-medium text-red-700"
              : "text-sm font-medium text-[var(--muted-foreground)]"
          }
        >
          {notice.message}
        </p>
      ) : null}

      <Grid<ManageContact>
        rows={contacts}
        columns={columns}
        getRowId={(contact) => contact.id}
        state={{ ...viewState, rowSelection }}
        onStateChange={onStateChange}
        onRowSelectionChange={setRowSelection}
        ariaLabel="Contacts"
        density={density}
        onDensityChange={setDensity}
        transient={{
          begin: beginTransientChange,
          commit: commitTransientChange,
          cancel: cancelTransientChange,
        }}
        onCellCommit={handleCellCommit}
        onClearFilters={clearFilters}
        toolbarExtra={toolbarExtra}
      />

      {bulkReport ? (
        <BulkReportPanel report={bulkReport} onDismiss={() => setBulkReport(null)} />
      ) : null}
    </div>
  )
}