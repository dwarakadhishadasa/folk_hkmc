"use client"

/**
 * CAP-6 row lifecycle — the grid's half.
 *
 * Three pieces, all table-agnostic:
 *
 * 1. `GridRowAddControl` — a small `+ Add record` in the grid's own chrome. It
 *    asks the consumer for a new row and then hands the id back to the grid,
 *    which focuses it through the keyboard model. It is deliberately small: a
 *    permanently large footer bar is a permanent claim on vertical space for a
 *    control most sessions use once.
 * 2. `GridRowDeleteControl` — a per-row affordance that opens a confirmation
 *    naming the row, then reports one outcome line per row rather than a
 *    collapsed toast.
 * 3. `GridRowLifecycleProvider` — the plumbing between them and `Grid`.
 *
 * **No fetch, no route, no table vocabulary.** Everything that touches
 * persistence arrives as a prop from the consumer; the provider only sequences
 * the affordance, the confirmation and the report. A primitive that knew what a
 * contact was would stop being a primitive — `components/grid/` is consumed by
 * four tables.
 *
 * **Why the report is per row rather than a count.** A count is a summary of
 * something; the operator needs to know *which* row failed and what the server
 * said about it, and the successes have to be listed too so a partial run is
 * legible as partial. The same rule the bulk action already follows, for the
 * same reason: the next `/manage` table copies this, and copying a collapsed
 * toast copies a capability that cannot be debugged.
 *
 * **Why the delete control is a `<button>`.** A story-4 note forbids a
 * `<button>` in a cell's *closed display*, because `favoriteStar` resolved
 * `getByRole("button")` unscoped inside a row. That constraint was about a
 * control that renders a value. This is an action in its own column with its own
 * accessible name, so the honest fix is a precise locator on the star rather
 * than suppressing a real control.
 *
 * **A `<TData,>` in the add control's props.** The control holds no row, so the
 * generic parameter is unconstrained; `TData,` is the trailing-comma idiom for
 * "not generic here" that keeps `Grid`'s single type argument flowing through.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Plus, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { GRID_BASE_FONT_CLASS } from "@/components/grid/grid-row"
import type { GridRowLifecycle } from "@/components/grid/grid-types"

/** One row's delete outcome. Successes are reported as well as failures. */
export interface GridRowDeleteOutcome {
  rowId: string
  label: string
  ok: boolean
  /** The server's own wording, never a summary. */
  message: string
}

interface GridRowLifecycleContextValue {
  /** Opens the confirmation for `rowId`; nothing is written until it is confirmed. */
  requestDelete: (rowId: string) => void
  /** True while that row's delete is in flight, so its control can be disabled. */
  isDeleting: (rowId: string) => boolean
}

const GridRowLifecycleContext = createContext<GridRowLifecycleContextValue | null>(null)

/**
 * The delete side of the lifecycle, for a column that renders one control.
 *
 * Null when the surrounding `Grid` was given no `rowLifecycle`, which is what
 * makes the affordance genuinely opt-in rather than present-but-inert.
 */
export function useGridRowLifecycle(): GridRowLifecycleContextValue | null {
  return useContext(GridRowLifecycleContext)
}

/**
 * The `+ Add record` control.
 *
 * Calls `createRow()` and reports the new row's id back through `onCreated` so
 * the grid can focus it through the keyboard model. Disabled while the create is
 * in flight, so a double click cannot append two blank rows.
 */
export function GridRowAddControl({
  canCreate,
  onAdd,
}: {
  /** Whether the control is offered. Rendered disabled, never hidden. */
  canCreate: boolean
  /** Appends a row and reports whether focus could be landed on it. */
  onAdd: () => boolean
}) {
  const [creating, setCreating] = useState(false)

  const handleAdd = useCallback(() => {
    setCreating(true)

    try {
      onAdd()
    } finally {
      setCreating(false)
    }
  }, [onAdd])

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 px-2 text-[13px]"
      disabled={!canCreate || creating}
      data-grid-add-record=""
      aria-label={canCreate ? "Add record" : "Add record is unavailable"}
      onClick={handleAdd}
    >
      <Plus aria-hidden="true" className="size-3.5" />
      Add record
    </Button>
  )
}

/**
 * A row's delete affordance.
 *
 * Rendered by the consumer inside its own row-action column, so which column it
 * lands in and how wide it is stay the consumer's decisions — the primitive
 * supplies the behaviour, not the layout.
 */
export function GridRowDeleteControl({
  rowId,
  label,
  className,
}: {
  rowId: string
  label: string
  className?: string
}) {
  const lifecycle = useGridRowLifecycle()

  if (!lifecycle) {
    return null
  }

  const deleting = lifecycle.isDeleting(rowId)

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className ?? "text-destructive hover:text-destructive size-6"}
      disabled={deleting}
      data-grid-delete-row={rowId}
      aria-label={`Delete ${label}`}
      onClick={() => {
        lifecycle.requestDelete(rowId)
      }}
    >
      <Trash2 aria-hidden="true" className="size-3.5" />
    </Button>
  )
}

/**
 * One visible result line per deleted row.
 *
 * A collapsed toast fails this even when every row succeeded, so successes are
 * listed individually too, and a failure always names the row it happened on
 * together with the server's own reason.
 */
export function GridRowDeleteReport({
  outcomes,
  onDismiss,
}: {
  outcomes: readonly GridRowDeleteOutcome[]
  onDismiss: () => void
}) {
  const deleted = outcomes.filter((outcome) => outcome.ok).length

  return (
    <section
      aria-label="Delete results"
      data-grid-delete-report=""
      className={`${GRID_BASE_FONT_CLASS} bg-card rounded-md border border-border px-3 py-2`}
    >
      <div className="flex items-start justify-between gap-3">
        <p role="status" className="font-medium">
          {deleted} of {outcomes.length} row{outcomes.length === 1 ? "" : "s"} deleted.
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
        {outcomes.map((outcome) => (
          <li key={outcome.rowId} className="flex items-baseline gap-2 py-1">
            <span aria-hidden="true">{outcome.ok ? "✓" : "✕"}</span>
            <span className="text-foreground min-w-0 flex-1 truncate font-medium">
              {outcome.label}
            </span>
            <span className={outcome.ok ? "shrink-0" : "text-destructive shrink-0"}>
              {outcome.message}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const GENERIC_DELETE_FAILURE = "The row could not be deleted."

/** Resolves a rejected delete into one human-readable line. */
function readDeleteFailure(cause: unknown): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message
  }

  return GENERIC_DELETE_FAILURE
}

/**
 * The confirmation, the delete write, and the per-row report.
 *
 * Rendered by `Grid` around the whole grid, so a consumer only has to render the
 * control. Present only when a `rowLifecycle` was supplied, which is what makes
 * `useGridRowLifecycle()` returning null *be* the "no delete here" answer.
 */
export function GridRowLifecycleProvider<TData>({
  lifecycle,
  rows,
  getRowId,
  onRowRemoved,
  children,
}: {
  lifecycle: GridRowLifecycle<TData>
  /** The consumer's current rows, so a row id can be resolved back to its value. */
  rows: readonly TData[]
  /** The consumer's own id resolver, so this module never invents one. */
  getRowId: (row: TData, index: number) => string
  /** Called only for a row the server confirmed. */
  onRowRemoved: (rowId: string) => void
  children: ReactNode
}) {
  const [pendingRowId, setPendingRowId] = useState<string | null>(null)
  const [deletingRowIds, setDeletingRowIds] = useState<ReadonlySet<string>>(() => new Set())
  const [outcomes, setOutcomes] = useState<readonly GridRowDeleteOutcome[] | null>(null)

  /**
   * Resolved on every render rather than memoized: it is a linear scan over the
   * row set that only runs inside the confirm handler and while a control asks
   * whether it is disabled, and a cache here would be a second place to keep in
   * step with the consumer's own id scheme.
   */
  const findRow = useCallback(
    (rowId: string): TData | undefined =>
      rows.find((row, index) => getRowId(row, index) === rowId),
    [getRowId, rows],
  )

  const requestDelete = useCallback((rowId: string) => {
    setOutcomes(null)
    setPendingRowId(rowId)
  }, [])

  const isDeleting = useCallback((rowId: string) => deletingRowIds.has(rowId), [deletingRowIds])

  /**
   * The row the dialog is naming, or `null` when it is closed or the row is gone
   * from the consumer's set between the click and the confirmation.
   */
  const pendingRow = pendingRowId === null ? undefined : findRow(pendingRowId)
  const pendingLabel = pendingRow === undefined ? null : lifecycle.getRowLabel(pendingRow)

  const confirmDelete = useCallback(async () => {
    const rowId = pendingRowId

    setPendingRowId(null)

    if (rowId === null) {
      return
    }

    const row = findRow(rowId)

    if (!row) {
      return
    }

    // Resolved here rather than when the control was pressed: by the time the
    // operator confirms, the grid may have re-sorted, and a row's *position* is
    // not its identity.
    const label = lifecycle.getRowLabel(row)

    setDeletingRowIds((current) => new Set(current).add(rowId))

    let outcome: GridRowDeleteOutcome

    try {
      await lifecycle.onDeleteRow(row)
      // Only a confirmed delete is applied locally. A refused row keeps the
      // value the operator can already see; nothing is removed that was not.
      onRowRemoved(rowId)
      outcome = { rowId, label, ok: true, message: "Deleted." }
    } catch (cause) {
      outcome = { rowId, label, ok: false, message: readDeleteFailure(cause) }
    } finally {
      setDeletingRowIds((current) => {
        const next = new Set(current)
        next.delete(rowId)
        return next
      })
    }

    // One report per run, not per row: a second delete replaces the first
    // rather than appending to it, so the report always describes the last
    // action and never accumulates stale lines.
    setOutcomes([outcome])
  }, [findRow, lifecycle, onRowRemoved, pendingRowId])

  const value = useMemo<GridRowLifecycleContextValue>(
    () => ({ requestDelete, isDeleting }),
    [isDeleting, requestDelete],
  )

  return (
    <GridRowLifecycleContext.Provider value={value}>
      {children}

      <AlertDialog
        open={pendingRowId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRowId(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[13px]">Delete this record?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              {pendingLabel === null
                ? "This record will be removed from this table. This cannot be undone."
                : `${pendingLabel} will be removed from this table. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              // The destructive token pair, not a hand-written foreground
              // colour: `buttonVariants` already owns that pairing, and a raw
              // colour literal under `components/grid/` is exactly what the
              // theme story has to be able to assert is absent.
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-[13px]"
              onClick={(event) => {
                // The dialog's own close is deferred: the write resolves after
                // this handler returns, so closing on navigation would unmount
                // the report before the outcome could be shown.
                event.preventDefault()
                void confirmDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {outcomes && outcomes.length > 0 ? (
        <div className="mt-2">
          <GridRowDeleteReport
            outcomes={outcomes}
            onDismiss={() => {
              setOutcomes(null)
            }}
          />
        </div>
      ) : null}
    </GridRowLifecycleContext.Provider>
  )
}
