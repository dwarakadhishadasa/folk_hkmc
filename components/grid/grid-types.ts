/**
 * Shared, table-agnostic shapes for the `/manage` grid primitives.
 *
 * Type-only: no runtime imports and no `"use client"`. Everything under
 * `components/grid/` is a client component set, and
 * `scripts/verify-monorepo-guardrails.mjs:542-596` walks the whole transitive
 * runtime import graph of every client root, so this module deliberately
 * contributes zero edges.
 *
 * Nothing here knows about contacts, sessions, attendance or any other
 * `/manage` entity. A grid primitive is consumed by four tables; the moment a
 * shape here becomes contacts-shaped it stops being a primitive.
 */

import type { KeyboardEvent } from "react"
import type { RowData } from "@tanstack/react-table"

export type GridDensity = "default" | "dense"

export type GridColumnAlign = "left" | "right" | "center"

/**
 * The `meta.grid` extension the grid reads off every column def.
 *
 * `editable` gates the `e` key. `filter` chooses the per-column filter control
 * (`number` filters compare numerically, `text` filters substring-match).
 * `align` and `tabular` are presentation-only and reach the cell directly.
 */
export interface GridColumnMeta {
  editable?: boolean
  filter?: "text" | "number"
  align?: GridColumnAlign
  tabular?: boolean
}

/**
 * Teaches TanStack about `meta.grid`, which is how a column def declares that
 * it is editable, filterable, numeric or right-aligned. Augmenting the library's
 * interface keeps `column.columnDef.meta?.grid` typed everywhere the grid reads
 * it instead of casting at each site.
 */
declare module "@tanstack/react-table" {
  // Merging an interface requires the same type parameters, and this one uses
  // neither of them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    grid?: GridColumnMeta
  }
}

/**
 * CAP-9 panel model. Modelled as a discriminated union rather than three
 * remembered class sets so that "visually distinct" is structural: a new
 * variant does not compile until it is rendered.
 */
export type GridPanelState =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "error"; message: string; onRetry?: () => void }
  | { kind: "empty"; reason: "no-records" | "no-matches" }

/**
 * One cell write. `rowId` comes from the consumer's `getRowId`, so it must be
 * stable and URL-safe — an array index would address the wrong row the moment
 * the set is sorted or filtered.
 */
export interface GridCellCommit<TData> {
  rowId: string
  columnId: string
  row: TData
  /** Displayed value before the edit, used to revert a rejected write. */
  previousValue: unknown
  /** Value parsed from the draft. Unchanged text still commits. */
  value: unknown
}

/**
 * A rejected `GridCellCommit`. `message` is already human-readable; `cause` is
 * the original rejection for logging.
 */
export interface GridEditError<TData> {
  rowId: string
  columnId: string
  row: TData
  previousValue: unknown
  attemptedValue: unknown
  message: string
  cause: unknown
}

export type GridCellCommitHandler<TData> = (
  commit: GridCellCommit<TData>,
) => void | Promise<void>

export type GridEditErrorHandler<TData> = (error: GridEditError<TData>) => void

/**
 * Escape hatch between an in-flight gesture and the view-state hook.
 *
 * Continuous interaction cannot round-trip through the URL on every frame, so a
 * column-resize drag keeps its width in component state, calls `begin`, and then
 * either `commit` once on pointer-up or `cancel` if the drag is abandoned. This
 * is not grid state living in component state: the committed value is always
 * written to the URL, and a cancelled drag restores the URL-derived width.
 */
export interface GridTransientHandle {
  begin: () => void
  commit: () => void
  cancel: () => void
}

/** Address of a single cell, used to key the keyboard hook's edit state. */
export interface GridCellCoordinate {
  rowId: string
  columnId: string
}

/**
 * Everything `GridRow` needs to render one cell, resolved by the keyboard hook
 * so that row rendering stays free of edit-state plumbing.
 */
export interface GridCellView {
  columnId: string
  /** Already-resolved display text, including the empty-value placeholder. */
  text: string
  align: GridColumnAlign
  tabular: boolean
  isFocused: boolean
  editing: boolean
  draft: string
  /** Set when the last commit for this cell was rejected. */
  error?: string
  onDraftChange: (value: string) => void
  onDraftKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}
