/**
 * The glyph a field's **type** wears in its column header.
 *
 * A header's label says which field this is; the icon says what kind of value it
 * holds, which is a different question and one the label cannot answer — "Total
 * Attendance" and "Notes" are as self-explanatory as their names get. Reading it
 * off `meta.grid.fieldType` rather than off a per-column flag keeps it true
 * automatically: a column that declares a type gets its glyph, and one that does
 * not — a control column, an identity column whose renderer draws its own — gets
 * nothing, which is the correct answer rather than a missing one.
 *
 * **This module is the whole of the icon surface.** `GridHeaderCell` renders
 * whatever `resolveGridFieldIcon` returns and knows nothing about which glyph
 * that is, so swapping the set is this one map. That is why the map is not
 * inlined into the header cell.
 *
 * The entries are **elements, not components.** A component reference picked out
 * of a map during render is "creating a component during render" as far as
 * `react-hooks` is concerned, and the render is genuinely creating one — these
 * are built once at module load instead, which is also the cheaper render on a
 * row of headers.
 *
 * A `Record` over the closed `GridFieldType` union rather than a switch, for the
 * reason `GRID_CELL_RENDERER_REGISTRY` and `GRID_EDITOR_REGISTRY` are records:
 * a type added to the union does not compile until it has a glyph, rather than
 * silently rendering no icon at all.
 */

import type { ReactNode } from "react"
import {
  AlignLeft,
  CalendarDays,
  ChevronDown,
  Link2,
  ListChecks,
  Sigma,
  SquareCheck,
  Type,
} from "lucide-react"

import type { GridFieldType } from "@/components/grid/grid-types"

/**
 * One class for all eight, so the glyphs are one size and one weight whatever
 * the type. `shrink-0` is load-bearing rather than tidy: the label beside it is
 * `truncate`, so without it the icon is the thing that gives way first — a narrow
 * column would lose its glyph before its name stopped being readable, which is
 * backwards.
 *
 * **No opacity here.** The glyph used to be dimmed against the label, which was
 * right while the label itself was muted: a second weight of grey beside a grey
 * label read as decoration. The header now carries the theme's highest-contrast
 * foreground, and a dimmed icon next to it read as *disabled* rather than as a
 * caption — so the glyph takes the same colour as the name it introduces, which
 * is also how the reference header reads.
 */
const ICON_CLASS = "size-4 shrink-0"

const GRID_FIELD_ICONS: Readonly<Record<GridFieldType, ReactNode>> = {
  // `Type` is a letterform, which is the point: it is the one glyph in this set
  // that reads as "some text" rather than as an action.
  text: <Type aria-hidden="true" className={ICON_CLASS} />,
  // The same idea as `text`, distinguished by proportion — a note is a paragraph
  // and a label is a word, and at 14px the aligned-lines glyph is what carries
  // that.
  longtext: <AlignLeft aria-hidden="true" className={ICON_CLASS} />,
  date: <CalendarDays aria-hidden="true" className={ICON_CLASS} />,
  // **A rollup, and the glyph says so.** A `number` column in these grids is not
  // a stored number — it is another field's values aggregated across the rows on
  // screen (`totalAttendanceCount`, `past60DayAttendanceCount`), which is why it
  // never has an editor. `Sigma` is the summation sign: a bare numeral would claim
  // the column holds a number an operator typed, and a filter funnel would claim
  // it is filtered.
  number: <Sigma aria-hidden="true" className={ICON_CLASS} />,
  // The one-column-of-a-fixed-set reading. `ChevronDown` and not a filter funnel:
  // a funnel here would promise that the column is filtered, which is a state the
  // header does not carry and the filter bar already does.
  select: <ChevronDown aria-hidden="true" className={ICON_CLASS} />,
  // `select` plus the part that distinguishes it — several of them, ticked.
  multiselect: <ListChecks aria-hidden="true" className={ICON_CLASS} />,
  boolean: <SquareCheck aria-hidden="true" className={ICON_CLASS} />,
  // A **link**: the column resolves ids through the consumer's own lookup, so the
  // field behind it lives in another table and the cell renders the joined label.
  // That is a reference, not a list — and `location` and `collectedBy` are the two
  // that have to read as pointing somewhere.
  linked: <Link2 aria-hidden="true" className={ICON_CLASS} />,
}

/**
 * The glyph for a declared field type, or `undefined` when the column declared
 * none.
 *
 * The `hasOwnProperty` guard mirrors `resolveGridCellRenderer` and
 * `resolveGridEditor`: a type written before it was registered, or arriving from
 * a stored view state, must not resolve to a prototype member.
 *
 * There is deliberately no `data-` attribute on the glyph: it is built once at
 * module load and so cannot carry this render's type. The header cell carries it
 * instead, on `data-grid-field-type` — the same attribute the body cells in
 * `grid-row.tsx` already put on every cell, so a column's type is readable off
 * its header and its cells by one selector.
 */
export function resolveGridFieldIcon(fieldType: GridFieldType | undefined): ReactNode | undefined {
  if (!fieldType) {
    return undefined
  }

  return Object.prototype.hasOwnProperty.call(GRID_FIELD_ICONS, fieldType)
    ? GRID_FIELD_ICONS[fieldType]
    : undefined
}