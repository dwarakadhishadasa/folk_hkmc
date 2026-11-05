"use client"

/**
 * CAP-6 row lifecycle — the grid's half.
 *
 * Two pieces, all table-agnostic:
 *
 * 1. `GridRowAddControl` — a small `+ Add record` in the grid's own chrome. It
 *    asks the consumer for a new row and then hands the id back to the grid,
 *    which focuses it through the keyboard model. It is deliberately small: a
 *    permanently large footer bar is a permanent claim on vertical space for a
 *    control most sessions use once.
 * 2. `GridRowLifecycleProvider` — the confirmation, the delete write and the
 *    per-row report, exposed through `useGridRowLifecycle()` so a consumer's
 *    own affordance (today, the row context menu) can request N rows at once.
 *
 * The delete is confirmed and then reported one outcome line per row rather
 * than a collapsed toast, whether the request covered one row or forty.
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
 * **Why a set is deleted sequentially.** One request at a time keeps a partial
 * run legible: the report is appended in the order the rows were addressed, and
 * a refusal never cancels the rows after it. A parallel burst would interleave
 * the outcomes and could exhaust the browser's connection pool on a large
 * selection.
 *
 * **A `<TData,>` in the add control's props.** The control holds no row, so the
 * generic parameter is unconstrained; `TData,` is the trailing-comma idiom for
 * "not generic here" that keeps `Grid`'s single type argument flowing through.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Plus } from "lucide-react"

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

/** One row's delete outcome. Only failures reach the screen. */
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
  /**
   * Opens one confirmation for every id in `rowIds`, then deletes them
   * sequentially. The menu passes the resolved selection; `requestDelete` is the
   * one-row case of the same path.
   */
  requestDeleteMany: (rowIds: readonly string[]) => void
  /** True while that row's delete is in flight, so its control can be disabled. */
  isDeleting: (rowId: string) => boolean
}

const GridRowLifecycleContext = createContext<GridRowLifecycleContextValue | null>(null)

/**
 * The delete side of the lifecycle, for whatever affordance the consumer
 * renders — the row context menu today.
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
 * Hands `onAdd` the click; the grid's own handler runs `createRow()`, queues the
 * returned id for the keyboard model and retries the focus against the rendered
 * window. Nothing about a row is decided here.
 *
 * **No local "in flight" state.** `createRow` appends to the consumer's own
 * state and returns synchronously, so there is nothing to await here and a
 * `creating` flag could only ever render for the span of a single click. The
 * double-add that flag was meant to prevent is the consumer's to prevent, and
 * `canCreate` is where it does: the contacts table disables this control while a
 * draft is unresolved. Re-entrantly guarding a synchronous callback here would
 * be a guard that cannot fire.
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
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      // Airtable's record-creation affordance is a quiet plus in the toolbar,
      // not a filled primary button: the grid's rows are the subject, and a
      // second filled control competes with them. The control stays in the one
      // slot beside the density selector.
      className="hover:bg-[var(--grid-chrome-hover)] text-[var(--grid-control-ink)] h-[26px] gap-1.5 rounded-[3px] px-2 text-[13px] font-normal has-[>svg]:px-2"
      disabled={!canCreate}
      data-grid-add-record=""
      // No `aria-label`: the button's own text is its accessible name, and a
      // label that swapped with `canCreate` would rename the control the moment it
      // became disabled — so a locator written against the enabled state would
      // stop resolving at exactly the moment the operator most needs it.
      onClick={() => {
        onAdd()
      }}
    >
      <Plus aria-hidden="true" className="size-4 text-[var(--grid-control-icon)]" />
      Add record
    </Button>
  )
}

/**
 * The refusal report: one visible line per row the server would not delete.
 *
 * A successful delete needs no report — the row disappearing is the whole
 * message, and the operator already knows what they asked for. A refusal is the
 * opposite case: the row is still there, so without this the click would look
 * like it did nothing. The server's own wording is carried through rather than
 * summarised, because the reason is the only thing that tells the operator what
 * to do next.
 */
export function GridRowDeleteReport({
  outcomes,
  onDismiss,
  label = "Delete results",
}: {
  outcomes: readonly GridRowDeleteOutcome[]
  onDismiss: () => void
  /** The region's accessible name. Consumer-supplied, defaulted for the common case. */
  label?: string
}) {
  const deleted = outcomes.filter((outcome) => outcome.ok).length

  return (
    <section
      aria-label={label}
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
 * Rendered by `Grid` around the whole grid, so a consumer only has to render an
 * affordance and call `requestDelete` / `requestDeleteMany`. Present only when a
 * `rowLifecycle` was supplied, which is what makes `useGridRowLifecycle()`
 * returning null *be* the "no delete here" answer.
 */
export function GridRowLifecycleProvider<TData>({
  lifecycle,
  rows,
  getRowId,
  onRowRemoved,
  reportLabel = "Delete results",
  children,
}: {
  lifecycle: GridRowLifecycle<TData>
  /** The consumer's current rows, so a row id can be resolved back to its value. */
  rows: readonly TData[]
  /** The consumer's own id resolver, so this module never invents one. */
  getRowId: (row: TData, index: number) => string
  /** Called only for a row the server confirmed. */
  onRowRemoved: (rowId: string) => void
  /** The report region's accessible name. Defaulted for the common case. */
  reportLabel?: string
  children: ReactNode
}) {
  const [pendingRowIds, setPendingRowIds] = useState<readonly string[] | null>(null)
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

  const requestDeleteMany = useCallback((rowIds: readonly string[]) => {
    if (rowIds.length === 0) {
      return
    }

    setOutcomes(null)
    setPendingRowIds([...rowIds])
  }, [])

  const requestDelete = useCallback(
    (rowId: string) => {
      requestDeleteMany([rowId])
    },
    [requestDeleteMany],
  )

  const isDeleting = useCallback((rowId: string) => deletingRowIds.has(rowId), [deletingRowIds])

  /**
   * The rows the dialog is naming, resolved per render so a row that disappears
   * between the request and the confirmation simply drops out of the count.
   */
  const pendingRows =
    pendingRowIds === null
      ? []
      : pendingRowIds.flatMap((rowId) => {
          const row = findRow(rowId)

          return row === undefined ? [] : [{ rowId, label: lifecycle.getRowLabel(row) }]
        })

  const pendingLabel = pendingRows.length === 1 ? pendingRows[0].label : null

  const confirmDelete = useCallback(async () => {
    const rowIds = pendingRowIds

    setPendingRowIds(null)

    if (rowIds === null || rowIds.length === 0) {
      return
    }

    // Resolved here rather than when the affordance was pressed: by the time the
    // operator confirms, the grid may have re-sorted, and a row's *position* is
    // not its identity.
    const targets = rowIds.flatMap((rowId) => {
      const row = findRow(rowId)

      return row === undefined
        ? []
        : [{ rowId, row, label: lifecycle.getRowLabel(row) }]
    })

    if (targets.length === 0) {
      return
    }

    setDeletingRowIds((current) => {
      const next = new Set(current)

      for (const target of targets) {
        next.add(target.rowId)
      }

      return next
    })

    const nextOutcomes: GridRowDeleteOutcome[] = []

    // Sequential, not parallel: the report is appended in the order the rows
    // were addressed, one refusal never cancels the rows after it, and a large
    // selection cannot exhaust the browser's connection pool.
    for (const target of targets) {
      try {
        await lifecycle.onDeleteRow(target.row)
        // Only a confirmed delete is applied locally. A refused row keeps the
        // value the operator can already see; nothing is removed that was not.
        onRowRemoved(target.rowId)
        nextOutcomes.push({
          rowId: target.rowId,
          label: target.label,
          ok: true,
          message: "Deleted.",
        })
      } catch (cause) {
        nextOutcomes.push({
          rowId: target.rowId,
          label: target.label,
          ok: false,
          message: readDeleteFailure(cause),
        })
      } finally {
        setDeletingRowIds((current) => {
          const next = new Set(current)
          next.delete(target.rowId)
          return next
        })
      }
    }

    // One report per run, not per row: a second delete replaces the first
    // rather than appending to it, so the report always describes the last
    // action and never accumulates stale lines.
    setOutcomes(nextOutcomes)
  }, [findRow, lifecycle, onRowRemoved, pendingRowIds])

  const value = useMemo<GridRowLifecycleContextValue>(
    () => ({ requestDelete, requestDeleteMany, isDeleting }),
    [isDeleting, requestDelete, requestDeleteMany],
  )

  return (
    <GridRowLifecycleContext.Provider value={value}>
      {children}

      <AlertDialog
        open={pendingRowIds !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRowIds(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[13px]">
              {pendingRows.length > 1
                ? `Delete ${pendingRows.length} records?`
                : "Delete this record?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              {pendingRows.length > 1
                ? `The ${pendingRows.length} selected records will be removed from this table. This cannot be undone.`
                : pendingLabel === null
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

      {outcomes && outcomes.some((outcome) => !outcome.ok) ? (
        <div className="mt-2">
          <GridRowDeleteReport
            label={reportLabel}
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
