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

import type { KeyboardEvent, ReactNode } from "react"
import type { RowData } from "@tanstack/react-table"

import type {
  GridEditorContext,
  GridEditorDefinition,
  GridEditorKey,
  GridEditorOptions,
} from "@/components/grid/grid-editor-types"

export type GridDensity = "default" | "dense"

export type GridColumnAlign = "left" | "right" | "center"

/**
 * What a cell *holds*, as opposed to `GridEditorKey`, which is how it is edited.
 *
 * These are deliberately separate keys on `GridColumnMeta`. The joined accessor
 * columns — a row's locations, who collected it — carry no editor and no stored
 * value, because their value is derived at render time from ids the consumer has
 * already resolved. A renderer keyed on `editor` renders nothing for them, which
 * is why they fell through to bare text while a stored field rendered a pill.
 *
 * `linked` is the type those columns declare. The grid renders it as a single
 * label and never invents one: an id with no matching lookup must arrive from
 * the consumer already carrying its own honest marker, because whether a miss
 * means "unresolved" is the consumer's lookup that knows, and this module has no
 * vocabulary for any entity.
 */
export type GridFieldType =
  | "text"
  | "select"
  | "multiselect"
  | "date"
  | "number"
  | "boolean"
  | "linked"
  | "longtext"

/**
 * The `meta.grid` extension the grid reads off every column def.
 *
 * `editable` gates the `e` key. `align` and `tabular` are presentation-only and
 * reach the cell directly.
 *
 * `frozen` pins the column to the left edge while the table scrolls sideways;
 * `selectable` marks the column as the row-selection control; `hideable: false`
 * opts a column out of the visibility menu.
 *
 * `fieldType` is also the FILTER registry key. It used to have a second key
 * beside it, `filter: "text" | "number"`, whose only remaining job was choosing
 * a comparison — and that job is gone, because the operator now travels inside
 * the filter condition. Declaring the same fact twice is how two keys drift.
 *
 * `editor` names the typed editor for the cell and is resolved against the
 * registry in `grid-editors.tsx`. It is a closed union rather than `string`, so
 * an unknown editor is a compile error at the column definition instead of a
 * blank cell at runtime; the keyboard layer additionally reads it for
 * `"checkbox"` (the `Space` toggle) and to exempt an editor column from the
 * consumer-renderer skip.
 *
 * `editorOptions` is presentation-only configuration for that editor — the
 * allowed options, the known users, a currency code. Like every other key here
 * it describes how the cell is edited and never carries a value. The filter
 * surface reads `options` from here rather than asking a consumer to declare
 * the same option list twice.
 */
export interface GridColumnMeta {
  editable?: boolean
  editor?: GridEditorKey
  editorOptions?: GridEditorOptions
  /**
   * What the cell holds, resolved against `grid-cell-renderers.tsx`.
   *
   * Independent of `editor` on purpose — see `GridFieldType`. A column with
   * neither key renders `cell.text` unadorned, which is the correct outcome
   * rather than a fallback.
   */
  fieldType?: GridFieldType
  /**
   * The marker a linked accessor substitutes for an id its lookup cannot
   * resolve, so the `linked` renderer can mark it as unresolved rather than
   * guessing.
   *
   * The wording belongs to the consumer because the grid has no vocabulary for
   * any entity — "Unknown location" is meaningful in a contacts table and
   * meaningless in a primitive. Supplying it also keeps the two sides from
   * drifting: a consumer that reworded its marker would otherwise stop being
   * recognised, silently, with the raw id back on screen.
   */
  unresolvedText?: string
  align?: GridColumnAlign
  tabular?: boolean
  frozen?: boolean
  selectable?: boolean
  hideable?: boolean
  /**
   * Marks the one column per row that carries the row's identity, so a scan
   * finds it without reading every value.
   *
   * Weight and space only. A colour here would be a second accent competing
   * with selection and focus, which `design-constraints.md` forbids outright.
   */
  emphasis?: boolean
}

/**
 * One member of the leading pinned run, with the `left` offset it sticks at.
 *
 * A run rather than a single column because a selection control in front of the
 * identity column must be pinned too, and because each member needs its own
 * cumulative offset — one frozen column only ever needs `left: 0`.
 */
export interface GridFrozenColumn {
  columnId: string
  /** Distance from the frozen region's left edge, in px. */
  left: number
}

/**
 * Teaches TanStack about `meta.grid`, which is how a column def declares that
 * it is editable, typed, numeric or right-aligned. Augmenting the library's
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
 * A newly created row, as the consumer hands it back.
 *
 * `id` is separate because the grid has to address the row it is about to
 * render — that is what focus is moved to — while the row *value* is the
 * consumer's business. A consumer that creates against a server returns the
 * server's id, so focus lands on the row that actually exists rather than on a
 * client-only placeholder.
 */
export interface GridNewRow<TData> {
  id: string
  row: TData
}

/**
 * The row lifecycle, opted into by supplying it.
 *
 * Four things and no more, because the primitive must never grow an opinion
 * about what a row is:
 *
 * - `createRow` builds the blank row and appends it to the **consumer's** row
 *   state. The grid cannot append to a prop it does not own.
 * - `getRowLabel` names a row in the delete confirmation and in each outcome
 *   line. The grid has no way to derive a human name from an arbitrary `TData`.
 * - `onDeleteRow` is the delete write. It resolves once the row is gone and
 *   rejects with a message when it is not, which is what makes a per-row
 *   outcome possible rather than a collapsed toast.
 * - `canCreate` renders the add control disabled rather than hiding it, so an
 *   operator who cannot add is told the control exists and is unavailable.
 *
 * Deliberately absent: a row shape, a validation rule, a "save" concept, and
 * any knowledge of what a create is. A typed editor supplies parsing and
 * validation and gets the one commit path; this slot supplies the affordance
 * and the write, and nothing else.
 */
export interface GridRowLifecycle<TData> {
  /** Builds a blank row, adds it to consumer state, and returns its id. */
  createRow: () => GridNewRow<TData>
  /** The row's human name, for the confirmation and each outcome line. */
  getRowLabel: (row: TData) => string
  /** The delete write. Rejecting surfaces as that row's failure. */
  onDeleteRow: (row: TData) => Promise<void>
  /** Whether the add control is offered. Defaults to true. */
  canCreate?: boolean
}

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
  /**
   * Value parsed from the draft.
   *
   * An unchanged value still commits on `Enter`: an operator who retyped what
   * was already there has expressed an intent, and the create path depends on an
   * unchanged-but-complete draft committing. **Blur is the stricter rule** — a
   * draft with zero keystrokes since the editor opened is a no-op and issues no
   * request, because `openEditor` seeds the draft from the cell's current value
   * and committing that would PATCH on every stray cell click.
   */
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
 * Address of a cell in the **selection** model: a visible-row index plus a column id.
 *
 * Deliberately not `GridCellCoordinate`. That one addresses a row by `rowId`,
 * which is what a commit needs — the write has to name a row that survives
 * re-sorting. A selection is the opposite requirement: it is a *view* over the
 * cells currently on screen, so it must never name a row that is not rendered.
 * A `rowId` anchor keeps pointing at its row after a filter removes it, which
 * leaves the highlight drawn over a cell that no longer exists and makes the
 * range unresolvable at all. Indexing by visible-row position means the anchor
 * always addresses something the grid is showing, whatever the row set did.
 */
export interface GridSelectionCoordinate {
  /** Index into the table's current (sorted, filtered) row model. */
  rowIndex: number
  columnId: string
}

/**
 * The cell range: a rectangle between two corners, plus the cell plain arrows
 * move on their own.
 *
 * - `anchor` — where the selection started; survives `Shift`+arrow and
 *   `Shift`+click, and is what `Escape` collapses back to.
 * - `focus` — the cell the operator is on. Plain arrows move it.
 * - `extent` — the moving corner of the range. `Shift`+arrow and `Shift`+click
 *   move it.
 *
 * A range is active when `anchor` and `extent` differ, and its cells are every
 * cell of the rectangle between them, inclusive. Rectangular, not a linear walk:
 * a spreadsheet range is a rectangle, and a walk would drag in columns the
 * operator never selected.
 */
export interface GridCellSelection {
  anchor: GridSelectionCoordinate
  focus: GridSelectionCoordinate
  extent: GridSelectionCoordinate
}

/**
 * A resolved editor, carried by a cell view.
 *
 * The definition and its context travel together because they are two halves of
 * one thing: the definition is what renders, the context is what it renders
 * *with*. Splitting them across two optional fields would let them disagree — a
 * context with no definition, or a definition holding another cell's row.
 */
export interface GridCellEditorView<TData = unknown> {
  definition: GridEditorDefinition<unknown>
  context: GridEditorContext<TData>
}

/**
 * Everything `GridRow` needs to render one cell, resolved by the keyboard hook
 * so that row rendering stays free of edit-state plumbing.
 *
 * Generic only so the editor context can carry the row; `TData` defaults to
 * `unknown` so a caller that never renders an editor does not have to name it.
 */
export interface GridCellView<TData = unknown> {
  columnId: string
  /** Already-resolved display text. Empty means empty; nothing stands in for it. */
  text: string
  /**
   * The consumer's own `columnDef.cell` output, when it supplied one. Supplied
   * through TanStack's renderer rather than a bespoke prop so a column def owns
   * its cells the same way it owns its header; absent for a plain value column.
   */
  render?: ReactNode
  align: GridColumnAlign
  tabular: boolean
  /**
   * What the cell holds, for the renderer registry. Absent for a column that
   * declares no `fieldType`, and for a column supplying its own widget — a
   * widget has already chosen its appearance and is left alone.
   */
  fieldType?: GridFieldType
  /**
   * Whether the column can be edited, which is what separates a read-only value
   * from an editable one on screen.
   *
   * Read from `meta.grid.editable` rather than inferred from `editor` above:
   * the two are separate declarations, and a column can legitimately be
   * read-only while still rendering an editor's closed display.
   */
  editable: boolean
  /** The row's identity column. See `GridColumnMeta.emphasis`. */
  emphasis: boolean
  /** See `GridColumnMeta.unresolvedText`; only meaningful for a `linked` cell. */
  unresolvedText?: string
  isFocused: boolean
  /**
   * Inside the current cell range, which is not the same thing as the focused
   * cell and not the same thing as a selected row. Rendered as its own surface
   * so a range reads as a block rather than as eleven separately focused cells.
   */
  isSelected: boolean
  editing: boolean
  draft: string
  /**
   * The resolved editor, or `undefined` for a column with no
   * `meta.grid.editor`.
   *
   * Built by the keyboard hook rather than by `grid-row.tsx` because every
   * closure in the context terminates in `runCommit`, and that is the one write
   * path: an editor has no route, no `fetch` and no second mutation channel.
   *
   * Its presence is also the DW-27 resolution: `text` above already carries the
   * optimistic override, and the editor receives that rather than the stored
   * value, so a display widget cannot show the prior value for the round trip.
   */
  editor?: GridCellEditorView<TData>
  /** Set when the last commit for this cell was rejected. */
  error?: string
  onDraftChange: (value: string) => void
  onDraftKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  /**
   * The editor lost the pointer. Commits a touched draft through the one write
   * path and no-ops an untouched one, and never pulls focus back to the cell.
   */
  onDraftBlur: () => void
}
