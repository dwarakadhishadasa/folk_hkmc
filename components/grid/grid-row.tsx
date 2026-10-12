"use client"

import { useEffect, useRef } from "react"
import type { KeyboardEvent } from "react"
import type { Row } from "@tanstack/react-table"

import type { GridCellView, GridDensity, GridFrozenColumn } from "@/components/grid/grid-types"
import { GRID_EMPTY_TEXT, gridCellKey } from "@/components/grid/use-grid-keyboard"
import { cn } from "@/lib/utils"

/**
 * Design-contract geometry, owned here rather than added to either app's
 * `globals.css`: the two themes already diverge and the grid is shared by both,
 * so a token added to one file would break the other app's build of this
 * component. `text-[13px]` plus inline heights keep both apps byte-identical.
 */
export const GRID_BASE_FONT_CLASS = "text-[13px]"

export const GRID_ROW_HEIGHT: Record<GridDensity, number> = {
  default: 32,
  dense: 28,
}

export const GRID_SKELETON_ROWS = 8

const ALIGN_CLASS: Record<GridCellView["align"], string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
}

/**
 * The in-cell editor for a column with no `meta.grid.editor`.
 *
 * It takes focus and selects the current value on mount, so the first keystroke
 * *replaces* the value rather than appending to it. Without the selection the
 * caret lands at the end of the pre-filled text and the first keystroke after a
 * double-click silently commits a concatenation — the worst possible failure for
 * a write that looks like it succeeded. Focus and select are done in an effect
 * rather than through `autoFocus` because `select()` needs the input mounted and
 * focused first.
 */
function GridCellEditor({
  draft,
  onDraftChange,
  onDraftKeyDown,
  onDraftBlur,
}: {
  draft: string
  onDraftChange: (value: string) => void
  onDraftKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onDraftBlur: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const input = inputRef.current

    input?.focus()
    input?.select()
  }, [])

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(event) => onDraftChange(event.target.value)}
      onKeyDown={onDraftKeyDown}
      // Blur commits, through the one path the hook owns: an untouched draft is
      // a no-op there, so a double-click followed by a stray click writes
      // nothing.
      onBlur={onDraftBlur}
      onPointerDown={(event) => event.stopPropagation()}
      aria-label="Edit cell value"
      className="border-ring bg-card focus-visible:ring-ring/50 h-full w-full rounded-[3px] border bg-transparent px-1 text-[13px] outline-none focus-visible:ring-[2px]"
    />
  )
}

/**
 * One cell's contents, for a column that opted into a typed editor.
 *
 * **This is the DW-27 fix site.** A cell has two possible renderers beyond the
 * plain text — the consumer's own `cell` widget and a typed editor's
 * `renderDisplay` — and `cell.text` is where the optimistic override, the `—`
 * placeholder and the `title` tooltip all live. A renderer that re-reads the
 * stored value instead of the text it was handed therefore shows the *prior*
 * value for the whole round trip, with nothing in the console and no failing
 * type check.
 *
 * So the rule here is one line: **the editor receives `cell.text`, and whatever
 * it returns is what renders; `undefined` falls back to `cell.text`.** An editor
 * is free to return `undefined` (a plain text column) and free to return a
 * widget (a checkbox, a pill) — but a widget that ignores the override is the
 * defect, and it is a defect in the editor, not here.
 *
 * The editor's renderer wins over `cell.render` rather than losing to it: a
 * column that opts into an editor is asking the grid to draw the cell, so a
 * consumer `cell` on the same column is not a competing claim.
 */
function GridCellContents<TData>({
  cell,
  editor,
}: {
  cell: GridCellView<TData>
  editor: NonNullable<GridCellView<TData>["editor"]>
}) {
  if (cell.editing) {
    // The open control, rendered here rather than by the consumer because the
    // grid owns the draft, the commit and the revert.
    return editor.definition.renderEditor(editor.context)
  }

  const display = editor.definition.renderDisplay?.(editor.context)

  if (display !== undefined) {
    return display
  }

  // An editor that renders no widget of its own falls back to the overridden
  // text, exactly like a column with no editor at all.
  return cell.text
}

export interface GridRowProps<TData> {
  row: Row<TData>
  cells: GridCellView<TData>[]
  /** The leading pinned run, in display order; empty when nothing is frozen. */
  frozenColumns: readonly GridFrozenColumn[]
  density: GridDensity
  isFocused: boolean
  isEditing: boolean
  /** DOM id referenced by the container's `aria-activedescendant`. */
  domId?: string
  /**
   * Pointer activation on one cell. `extend` carries the `Shift` modifier, which
   * is what separates "focus this cell" from "extend the range to this cell".
   */
  onCellPointerDown: (rowId: string, columnId: string, extend: boolean) => void
  /**
   * Double-click on one cell: the sole opener, and the commit route when the
   * cell's editor is already open. Read-only and checkbox columns no-op.
   */
  onCellDoubleClick: (rowId: string, columnId: string) => void
}

/**
 * One virtualized row.
 *
 * Height is fixed at 32px / 28px because the design constraint states those
 * numbers and the virtualizer estimates from them — `measureElement` would let
 * the DOM and the estimate disagree. The consequence is that cells truncate to
 * a single line; a port that needs wrapping must not reintroduce it.
 *
 * Selection is expressed through `data-state="selected"` so a consumer's select
 * column and the `hover`/`selected` idioms from `components/ui/table.tsx` land
 * without re-styling this component. That attribute is **row** selection and
 * belongs to the consumer; the cell range is `data-grid-cell-selected`, and the
 * two never share a signal.
 */
export function GridRow<TData>({
  row,
  cells,
  frozenColumns,
  density,
  isFocused,
  isEditing,
  domId,
  onCellPointerDown,
  onCellDoubleClick,
}: GridRowProps<TData>) {
  const stickyLeftByColumn = new Map(frozenColumns.map((entry) => [entry.columnId, entry.left]))
  const lastFrozenColumnId =
    frozenColumns.length === 0 ? null : frozenColumns[frozenColumns.length - 1].columnId

  return (
    <tr
      id={domId}
      data-grid-row={row.id}
      data-state={row.getIsSelected() ? "selected" : undefined}
      data-grid-row-focused={isFocused ? "true" : undefined}
      style={{ height: GRID_ROW_HEIGHT[density] }}
      className={cn(
        GRID_BASE_FONT_CLASS,
        "bg-card transition-colors",
        // The row owns the hairline and the hover/selected surfaces; the sticky
        // frozen cell needs an opaque background of its own to cover what
        // scrolls beneath it, so the states are driven per-cell.
        "[&>td]:border-b [&>td]:border-border",
        "[&>td]:bg-card [&:hover>td]:bg-muted/50",
        "data-[state=selected]:[&>td]:bg-muted",
        isFocused && "[&>td]:bg-muted/40",
        // The cell range, applied per cell rather than per row. It has to be
        // qualified by the cell's own attribute instead of being a `bg-*` on the
        // `<td>`: the four rules above target `>td` from this row and would
        // otherwise win on specificity, and the double attribute raises this one
        // above all of them without an `!important` anywhere.
        "[&>td[data-grid-cell-selected][data-grid-cell-selected]]:bg-accent/30",
        isEditing && "[&>td]:bg-accent/40",
      )}
    >
      {cells.map((cell) => {
        const stickyLeft = stickyLeftByColumn.get(cell.columnId)

        return (
          <td
            key={cell.columnId}
            data-grid-cell={gridCellKey(row.id, cell.columnId)}
            data-grid-cell-selected={cell.isSelected ? "true" : undefined}
            tabIndex={-1}
            title={
              cell.render || cell.text === GRID_EMPTY_TEXT
                ? undefined
                : (cell.error ?? cell.text)
            }
            onPointerDown={(event) => onCellPointerDown(row.id, cell.columnId, event.shiftKey)}
            // `preventDefault` is OQ-7's answer, and it is load-bearing: the
            // browser selects a word under the cursor on a double-click, before
            // any handler runs, and inside a 32px fixed-height cell a selected
            // word is not something an operator can read or act on. Editing
            // wins. On the *open* editor the default is left alone, because
            // selecting a word inside a text field is exactly what one wants.
            onDoubleClick={(event) => {
              if (!cell.editing) {
                event.preventDefault()
              }

              onCellDoubleClick(row.id, cell.columnId)
            }}
            className={cn(
              "truncate px-2 align-middle text-[13px]",
              ALIGN_CLASS[cell.align],
              cell.tabular && "tabular-nums",
              cell.isFocused && "ring-ring relative z-[5] ring-1 ring-inset",
              cell.error && "text-destructive",
              // 1px divider instead of a scroll shadow, which design-constraints.md bans —
              // and on the last pinned column only, so the frozen region is separated from the
              // scrolling region by one line rather than one line per pinned cell.
              stickyLeft !== undefined && "sticky z-10 bg-card",
              cell.columnId === lastFrozenColumnId && "border-r border-border",
            )}
            style={stickyLeft === undefined ? undefined : { left: stickyLeft }}
          >
            {cell.editor ? (
              <GridCellContents cell={cell} editor={cell.editor} />
            ) : cell.editing ? (
              <GridCellEditor
                draft={cell.draft}
                onDraftChange={cell.onDraftChange}
                onDraftKeyDown={cell.onDraftKeyDown}
                onDraftBlur={cell.onDraftBlur}
              />
            ) : cell.render !== undefined ? (
              cell.render
            ) : (
              cell.text
            )}
          </td>
        )
      })}
    </tr>
  )
}
