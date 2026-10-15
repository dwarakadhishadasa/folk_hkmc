"use client"

import { useEffect, useRef } from "react"
import type { KeyboardEvent } from "react"
import type { Row } from "@tanstack/react-table"

import type { GridCellView, GridDensity, GridFrozenColumn } from "@/components/grid/grid-types"
import { gridCellKey } from "@/components/grid/use-grid-keyboard"
import { resolveGridCellRenderer } from "@/components/grid/grid-cell-renderers"
import { cn } from "@/lib/utils"

/**
 * Design-contract geometry, owned here rather than added to either app's
 * `globals.css`: the two themes already diverge and the grid is shared by both,
 * so a token added to one file would break the other app's build of this
 * component. `text-[13px]` plus inline heights keep both apps byte-identical.
 */
export const GRID_BASE_FONT_CLASS = "text-[13px]"

/**
 * One row-density option, and everything the two halves of the contract need.
 *
 * `label` is what the density trigger reads while the option is selected;
 * `height` is what the row actually renders. They used to live apart — two
 * `SelectItem` children in `grid-toolbar.tsx` and one height map here — which
 * meant the control could read "Default rows" over a grid drawing 28px, and
 * nothing failed. Hoisting both onto one record keyed by the option's own value
 * makes that unrepresentable: an option that exists has a height, and a height
 * that changes moves its label with it.
 */
export interface GridDensityOption {
  /** The option's control value, and the key `GRID_ROW_HEIGHT` is derived by. */
  density: GridDensity
  /** What the density trigger reads while this option is selected. */
  label: string
  /**
   * The rendered row height, in px. Load-bearing rather than cosmetic: the
   * virtualizer estimates from it (`grid.tsx`), so it and the estimate cannot
   * disagree. `design-constraints.md` mandates both numbers.
   */
  height: number
}

/**
 * Every density the grid offers, in the order the control lists them.
 *
 * **The first entry is the default**, and `GRID_DEFAULT_DENSITY` reads it from
 * here rather than from a `"default"` literal in each consumer — which is the
 * other half of the same drift, since a consumer's initial state and the
 * control's initial readout are two more places the value was written down.
 */
export const GRID_DENSITY_OPTIONS = [
  { density: "default", label: "Default rows", height: 32 },
  { density: "dense", label: "Dense rows", height: 28 },
] as const satisfies readonly GridDensityOption[]

/** The density every consumer initialises from, and OQ-4's 32px default. */
export const GRID_DEFAULT_DENSITY = GRID_DENSITY_OPTIONS[0].density

/**
 * The height map, derived rather than written.
 *
 * Kept a `Record<GridDensity, number>` because `grid.tsx` (twice) and
 * `grid-panel.tsx` index it by the live density, and a derived array would force
 * a lookup at each of those sites for no gain. The cast is what
 * `Object.fromEntries` needs to say "these keys are all of `GridDensity`" —
 * `_EveryDensityHasAnOption` below is what makes that claim true.
 */
export const GRID_ROW_HEIGHT: Record<GridDensity, number> = Object.fromEntries(
  GRID_DENSITY_OPTIONS.map((option) => [option.density, option.height]),
) as Record<GridDensity, number>

/**
 * Compile-time proof that `GRID_DENSITY_OPTIONS` covers every `GridDensity`.
 *
 * `Object.fromEntries` happily returns a map missing a key, and the failure it
 * produces is a `style={{ height: undefined }}` on a real row — a silently
 * collapsed table rather than a compile error. A density added to the union and
 * not to the record above fails here instead: `Assert<T extends true>` is what
 * turns the `false` branch into an error rather than into a type nobody reads.
 */
type Assert<T extends true> = T

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _EveryDensityHasAnOption = Assert<
  Exclude<GridDensity, (typeof GRID_DENSITY_OPTIONS)[number]["density"]> extends never ? true : false
>

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
      className="border-ring bg-card focus-visible:ring-ring/50 h-full w-full rounded-[3px] border bg-transparent px-1 text-[13px] outline-none select-text focus-visible:ring-[2px]"
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
        // scrolls beneath it, so the states are driven per-cell. A translucent
        // `bg-*` on a frozen cell turns it into a window: scrolled content
        // bleeds through on hover. Frozen cells therefore keep `bg-card` and
        // take the same tint as an inset shadow, which paints over the opaque
        // background instead of replacing it.
        "[&>td]:border-b [&>td]:border-border",
        "[&>td]:bg-card",
        "[&:hover>td:not([data-grid-frozen])]:bg-muted/50",
        "[&:hover>td[data-grid-frozen]]:shadow-[inset_0_0_0_999px_color-mix(in_oklab,var(--muted)_50%,transparent)]",
        "data-[state=selected]:[&>td]:bg-muted",
        isFocused && "[&>td:not([data-grid-frozen])]:bg-muted/40",
        isFocused &&
          "[&>td[data-grid-frozen]]:shadow-[inset_0_0_0_999px_color-mix(in_oklab,var(--muted)_40%,transparent)]",
        // The cell range, applied per cell rather than per row. It has to be
        // qualified by the cell's own attribute instead of being a `bg-*` on the
        // `<td>`: the four rules above target `>td` from this row and would
        // otherwise win on specificity, and the double attribute raises this one
        // above all of them without an `!important` anywhere.
        "[&>td[data-grid-cell-selected][data-grid-cell-selected]:not([data-grid-frozen])]:bg-accent/30",
        "[&>td[data-grid-cell-selected][data-grid-cell-selected][data-grid-frozen]]:shadow-[inset_0_0_0_999px_color-mix(in_oklab,var(--accent)_30%,transparent)]",
        isEditing && "[&>td:not([data-grid-frozen])]:bg-accent/40",
        isEditing &&
          "[&>td[data-grid-frozen]]:shadow-[inset_0_0_0_999px_color-mix(in_oklab,var(--accent)_40%,transparent)]",
      )}
    >
      {cells.map((cell) => {
        const stickyLeft = stickyLeftByColumn.get(cell.columnId)

        // Resolved here rather than in the keyboard hook because it needs both
        // the type and the resolved renderer, and because `GridCellView` carries
        // no row value for a renderer to reach past — the registry reads
        // `cell.text`, which is where the optimistic override already lives.
        //
        // Guarded on `render` as well as on `fieldType`, so a column supplying
        // its own widget cannot be restyled by a data renderer even if it also
        // declares a type. The hook already withholds `fieldType` in that case;
        // this is the second half of the same rule, and the cheaper of the two to
        // keep honest.
        const typeRender =
          cell.render === undefined
            ? resolveGridCellRenderer(cell.fieldType)?.render({
                text: cell.text,
                unresolvedText: cell.unresolvedText,
              })
            : undefined

        return (
          <td
            key={cell.columnId}
            data-grid-cell={gridCellKey(row.id, cell.columnId)}
            data-grid-cell-selected={cell.isSelected ? "true" : undefined}
            // The **active** cell — the one the pointer or an arrow is on — named
            // as a seam rather than asserted through the ring class beside it.
            // `ring-1` is a Tailwind detail: renaming it to a `box-shadow`
            // silently breaks a spec that was never about rings, while this
            // attribute is the statement that exactly one cell is active at a
            // time. Presence-only, like `-selected` and `-emphasis`, so "exactly
            // one" is a count rather than a scan for `="false"`.
            data-grid-cell-active={cell.isFocused ? "true" : undefined}
            // The two attributes a spec reads to tell an editable cell from a
            // read-only one, and to find the identity column. Both are on every
            // cell rather than only on the ones carrying a class, so the
            // distinction is assertable without a screenshot.
            data-grid-cell-editable={cell.editable ? "true" : "false"}
            data-grid-cell-emphasis={cell.emphasis ? "true" : undefined}
            data-grid-field-type={cell.fieldType}
            // The refusal message, as a real attribute rather than only as `title`.
            // The grid has no status line any more, so the cell is the only place
            // the message can be read from — and `title` is suppressed below for
            // any column carrying a custom renderer, which is exactly the case
            // (`booksRead`, `assignee`) a rejection is most likely to come from.
            data-grid-cell-error={cell.error ?? undefined}
            // The seam the row's state surfaces scope on: translucent tints
            // stop at scrolling cells, and frozen cells take the same tint as
            // an inset shadow over their opaque background.
            data-grid-frozen={stickyLeft !== undefined ? "true" : undefined}
            tabIndex={-1}
            title={
              // Nothing to inspect in an empty cell, and nothing useful to say
              // in a cell whose widget draws its own affordance — the star and
              // the row actions are controls, not values, and a tooltip reading
              // an id or a boolean would be worse than none.
              //
              // A cell the type renderer draws *does* keep its title. Truncation
              // is invisible otherwise, and dropping it here would make the
              // registry the only class of value cell with no inspectable full
              // text.
              cell.render !== undefined || cell.text.length === 0
                ? undefined
                : (cell.error ?? cell.text)
            }
            onPointerDown={(event) => {
              // Shift+click would otherwise extend the browser's native text
              // selection across every row between the two clicks, painting
              // full rows over the cell-range rectangle. The range is the only
              // selection signal, so the native one is suppressed here and
              // cleared in `focusCell` for any path that still produced one.
              if (event.shiftKey) {
                event.preventDefault()
              }

              onCellPointerDown(row.id, cell.columnId, event.shiftKey)
            }}
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
              // The metrics contract is the **32px row**, and the padding and line
              // box that reach it are not the ones `Visual-Design/
              // contacts-grid-states-v1.html:62-67` prints.
              //
              // That comp rule reads `padding: 4px 8px` + `line-height: 24px` +
              // `height: 32px`, and 4 + 24 + 4 = 32 — but it is a different table
              // structure. Applied here on top of `[&>td]:border-b`, it measures
              // **35px**: in a CSS table `height` is a minimum and never clamps a
              // cell whose padding and border already exceed it, which is the
              // trap UX-DR19 records. So this cell carries the 8px horizontal
              // padding and the middle alignment, and deliberately **no** vertical
              // padding and **no** explicit line height — inheriting the page's is
              // what keeps the row at exactly 32px.
              //
              // `pnpm test:e2e grid-cell-metrics` is what pins that, by measuring
              // the row rather than reading a class.
              "truncate px-2 align-middle text-[13px]",
              ALIGN_CLASS[cell.align],
              cell.tabular && "tabular-nums",
              cell.isFocused && "ring-ring relative z-[5] ring-1 ring-inset",
              // Read-only is muted and the identity column is weighted, so one
              // row has one emphasis and the eye can tell at a glance which
              // cells will accept an edit.
              //
              // The muted class is withheld when the cell is in error, because
              // `text-destructive` and `text-muted-foreground` are the same
              // Tailwind specificity and which one wins would depend on
              // stylesheet order. An explicit guard is readable; a silent
              // precedence fight is not.
              !cell.editable && !cell.error && cell.render === undefined && "text-muted-foreground",
              cell.emphasis && "font-medium",
              cell.error && "text-destructive",
              // 1px divider instead of a scroll shadow, which design-constraints.md bans —
              // and on the last pinned column only, so the frozen region is separated from the
              // scrolling region by one line rather than one line per pinned cell.
              stickyLeft !== undefined && "sticky z-10 bg-card",
              cell.columnId === lastFrozenColumnId && "border-r border-border",
            )}
            style={stickyLeft === undefined ? undefined : { left: stickyLeft }}
          >
            {/*
              Five cases, and the order is load-bearing twice over.

              An editor wins outright: it renders its own closed display, and it
              does so after the override has been applied. `editing` is checked
              before the widget for the same reason — a cell being edited must not
              have a widget replace the field being typed into.

              Then the consumer's own widget. It is absent for a plain value
              column by construction, and present for the columns that draw their
              own control — the favorite star, the row actions. Those have chosen
              their appearance; nothing after this point may restyle them.

              Then the type-keyed renderer, which only exists for a column that
              declared `meta.grid.fieldType` and no widget. `undefined` from it
              means "render the plain text", which is the correct outcome for an
              empty value and for a type whose text already reads correctly.
            */}
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
            ) : typeRender ? (
              typeRender
            ) : (
              cell.text
            )}
          </td>
        )
      })}
    </tr>
  )
}
