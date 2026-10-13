/**
 * Type-keyed cell renderers, resolved off `meta.grid.fieldType`.
 *
 * The editor registry in `grid-editors.tsx` answers "how is this cell edited".
 * This one answers "what does this cell hold", which is a different question
 * with a different set of columns: a joined accessor column like a row's
 * locations has no editor and no stored value, so it never reaches the editor
 * registry at all. Keying on the editor alone left those two rendering as bare
 * text while a stored field rendered a pill.
 *
 * Three rules bind every renderer here, and each has already been got wrong
 * somewhere in this codebase:
 *
 * 1. **A renderer reads `context.text` and nothing else.** `text` is the display
 *    value with the optimistic override already applied. Re-reading the stored
 *    value — what `ctx.getValue()` does in an editor — shows the *prior* value
 *    for the whole round trip, with no error anywhere. `GridCellView`
 *    deliberately exposes no row value for a renderer to reach past.
 * 2. **A renderer returns `undefined` for empty text.** An empty cell renders
 *    nothing at all; there is no placeholder glyph. An empty `<span>` would
 *    still be an element in the cell, and the cell's text and `title` would both
 *    need special-casing for it.
 * 3. **Nothing here grows the cell.** Rows are fixed at 32px/28px and the
 *    virtualizer estimates from `GRID_ROW_HEIGHT`, so a renderer that wrapped,
 *    stacked or grew a cell would desynchronise the estimate from the DOM.
 *
 * Presentation only: semantic tokens, no literal colour.
 */

import type { ReactNode } from "react"

import type { GridFieldType } from "@/components/grid/grid-types"

/**
 * What a renderer is given.
 *
 * `text` and nothing else, by rule 1. A renderer that needs more — the row, the
 * raw ids behind a joined label — is a renderer handed the wrong job: that
 * resolution belongs in the consumer's accessor, where the lookup maps already
 * are in scope.
 *
 * `unresolvedText` is the consumer's own marker for a linked id its lookup could
 * not resolve. Passing the value rather than pattern-matching a shape is what
 * keeps the *wording* in the consumer: this module has no vocabulary for any
 * entity, so "Unknown location" is meaningful there and meaningless here.
 */
export interface GridCellRenderContext {
  /** Display text with the optimistic override applied. Empty means empty. */
  text: string
  /** The consumer's marker for an unresolvable linked id, if it declared one. */
  unresolvedText?: string
}

export interface GridCellRenderer {
  /**
   * The cell's contents, or `undefined` to render the plain `cell.text`.
   *
   * `undefined` is the right answer for an empty value and for a type whose
   * plain text already reads correctly.
   */
  render(context: GridCellRenderContext): ReactNode | undefined
}

/**
 * Mirrors `LIST_SEPARATOR` in `grid-editors.tsx` rather than importing it, for
 * the same reason `Pill` is duplicated below. Keeping the two in step is the
 * cost of that decision: a multiselect value serialized with one delimiter and
 * split on another renders as a single wrong pill.
 */
const LIST_SEPARATOR = ", "

/**
 * A pill. Semantic tokens only; the grid carries no literal colour anywhere.
 *
 * Duplicated from `grid-editors.tsx` rather than imported: that module is
 * imported *by* the keyboard hook, and importing it back would close the cycle.
 * Two identical four-line components are cheaper than a cycle — but neither may
 * grow a behaviour the other lacks, so a change to one is a change to both.
 */
function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="border-primary/40 bg-primary/10 text-primary inline-flex max-w-full items-center truncate rounded-[3px] border px-1 text-[12px]">
      {children}
    </span>
  )
}

/**
 * A linked value: either resolved to a human label, or not.
 *
 * Muted and dashed rather than destructive. A dangling reference is a
 * data-quality fact the operator reads, not an error they just caused and
 * cannot act on — and a destructive cell would read as a failed edit, which
 * would send them looking for a way to fix it that does not exist.
 */
function LinkedValue({ text, unresolved }: { text: string; unresolved: boolean }) {
  if (unresolved) {
    return (
      <span
        data-grid-linked="unresolved"
        className="text-muted-foreground border-border inline-flex max-w-full items-center truncate rounded-[3px] border border-dashed px-1 text-[12px]"
      >
        {text}
      </span>
    )
  }

  // One pill, not one per comma-separated part. A linked accessor joins labels
  // with `", "`, and a label legitimately containing a comma would split into
  // two wrong ones. Splitting invents structure the data does not have.
  return <Pill>{text}</Pill>
}

/**
 * Every registered field type, in catalog order.
 *
 * A `Record` over the closed `GridFieldType` union rather than a switch, so a
 * new type does not compile until it has a renderer — the same property that
 * makes `GRID_EDITOR_REGISTRY` a compile-time-complete map.
 */
const GRID_CELL_RENDERER_REGISTRY: Readonly<Record<GridFieldType, GridCellRenderer>> = {
  // Plain text. The cell already truncates and already carries the full value in
  // its `title`, so a wrapper would only add an element to every cell.
  text: { render: () => undefined },
  // Same, and deliberately: at a 32px row a long note is a truncated line plus
  // an inspectable `title`, never a second line.
  longtext: { render: () => undefined },
  // Numbers already reach the cell through `meta.grid.align: "right"` and
  // `meta.grid.tabular`. Restating that here as a class would be a second place
  // to forget it.
  number: { render: () => undefined },
  // An ISO date already reads as a date and already sorts as one. Formatting it
  // again would mean the cell and the `title` could disagree.
  date: { render: () => undefined },
  select: {
    render: ({ text }) => (text.length > 0 ? <Pill>{text}</Pill> : undefined),
  },
  // The serialized form is a delimited list, so splitting it reads the contract
  // rather than guessing. `LinkedValue` deliberately does not split, because a
  // linked accessor joins with a comma that can occur inside a label.
  multiselect: {
    render: ({ text }) => {
      if (text.length === 0) {
        return undefined
      }

      return (
        <span className="flex min-w-0 items-center gap-1">
          {text
            .split(LIST_SEPARATOR)
            .filter(Boolean)
            .map((value) => (
              <Pill key={value}>{value}</Pill>
            ))}
        </span>
      )
    },
  },
  boolean: { render: () => undefined },
  linked: {
    render: ({ text, unresolvedText }) =>
      text.length > 0 ? <LinkedValue text={text} unresolved={text === unresolvedText} /> : undefined,
  },
}

/**
 * The renderer for a declared field type, or `undefined` when the column
 * declared none.
 *
 * The `hasOwnProperty` guard mirrors `resolveGridEditor`: it keeps a key that
 * is not in the registry — one written before the type was registered, or
 * arriving from a stored view state — from resolving to a prototype member.
 */
export function resolveGridCellRenderer(
  fieldType: GridFieldType | undefined,
): GridCellRenderer | undefined {
  if (!fieldType) {
    return undefined
  }

  return Object.prototype.hasOwnProperty.call(GRID_CELL_RENDERER_REGISTRY, fieldType)
    ? GRID_CELL_RENDERER_REGISTRY[fieldType]
    : undefined
}

/** Every registered field type, in catalog order. */
export const GRID_FIELD_TYPES: readonly GridFieldType[] = Object.keys(
  GRID_CELL_RENDERER_REGISTRY,
) as GridFieldType[]