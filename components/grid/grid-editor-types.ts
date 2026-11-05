/**
 * The typed-editor contract, as `editor-catalog.md` writes it.
 *
 * Type-only: no runtime imports and no `"use client"`, for the same reason
 * `grid-types.ts` has none — `scripts/verify-monorepo-guardrails.mjs` walks the
 * transitive runtime import graph of every client root, and a module that
 * contributed edges would have to be audited twice.
 *
 * Table-agnostic like everything else under `components/grid/`: nothing here
 * names a contacts field, a `/manage` route, or a `Manage*` type. `options` is
 * deliberately untyped-per-editor data (`options`, `users`, `currency`) that the
 * *consumer* supplies from its own payload, because the primitive cannot know
 * what a program's sources or staff are.
 */

import type { KeyboardEvent, ReactNode } from "react"

/**
 * The twelve editor types.
 *
 * A closed union rather than `string` is what makes an unknown
 * `meta.grid.editor` a compile error at the column definition instead of a blank
 * cell at runtime.
 */
export type GridEditorKey =
  | "text"
  | "longtext"
  | "number"
  | "currency"
  | "checkbox"
  | "select"
  | "multiselect"
  | "date"
  | "url"
  | "email"
  | "user"
  | "linked"

/**
 * Presentation-only configuration for one editor.
 *
 * `GridColumnMeta.editorOptions` is this type, and like every other `meta.grid`
 * key it describes how the cell looks and is edited — never a value. The keys
 * are read by the editor that names them and ignored by the rest, so a column
 * carrying `currency` and `options` at once is a type error in spirit only; the
 * registry entries are what actually read them.
 */
export interface GridEditorOptions {
  /** `select` / `multiselect`: the allowed values, in display order. */
  options?: readonly string[]
  /** `user`: the allowed people, as `{ id, name }`. */
  users?: readonly { id: string; name: string }[]
  /**
   * `linked`: the pickable records, as `{ id, label, detail? }`.
   *
   * The stored value is the record's **id** (plural in the data model, one in
   * the picker), while the cell displays its `label` — the resolver's human name.
   * `detail` is the record's secondary text (a status), shown beside the label in
   * the list and never committed.
   */
  records?: readonly { id: string; label: string; detail?: string }[]
  /** `currency`: ISO 4217 code for the display formatter. */
  currency?: string
  /** `currency` / `date`: BCP 47 tag for the display formatter. */
  locale?: string
}

/**
 * Everything one editor instance is handed.
 *
 * `text` is the DW-27 contract in one field: it is the cell's display value with
 * the optimistic override already applied, and an editor's `renderDisplay` must
 * render *that* rather than re-reading `getValue()`. `getValue` exists for
 * seeding a draft and for nothing else — a display widget that reads it loses
 * the override and shows the prior value for the whole round trip.
 */
export interface GridEditorContext<TData> {
  rowId: string
  columnId: string
  row: TData
  /** Already-overridden display text, including the empty-value placeholder. */
  text: string
  /** The stored value. Seeding a draft and nothing else — never for display. */
  getValue: () => unknown
  /** The current draft, owned by the keyboard hook so `Enter`/`Escape` agree. */
  draft: string
  setDraft: (next: string) => void
  /**
   * The hook's own draft key handler.
   *
   * Handed to the editor rather than reimplemented: `Enter` commits and steps
   * down, `Escape` cancels and `Tab` commits-then-moves, and those three have to
   * behave identically whether the draft is typed into a plain cell or an
   * editor's in-cell field. An editor that grew its own copy of this would be
   * free to get `Tab` wrong, which is exactly the regression `grid-keyboard.spec.ts`
   * key 8 exists to catch.
   */
  onDraftKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  /**
   * The editor lost the pointer: commit a **touched** draft, or close an
   * untouched one without writing.
   *
   * Handed to the editor rather than implemented locally for the same reason
   * `onDraftKeyDown` is: "untouched issues no request" and "focus is not yanked
   * back" are hook-owned rules, and an editor that rolled its own blur handler
   * would get exactly one of the two wrong — a second mutation channel, or a
   * PATCH on every stray cell click. An `Escape` that sets the hook's discard
   * flag first makes this a no-op, which is what keeps `Escape` a discard on
   * every editor including the ones with no local `Escape` handler.
   */
  blurCommit: () => void
  /**
   * Parse `draft` (or the argument) and route the result through the grid's one
   * write path. A `parse` that throws reverts the cell with the thrown message,
   * which is why an editor has no error slot of its own.
   */
  commitDraft: (draft?: string) => void
  /** Commit an already-typed value — a boolean flip, a picked option. */
  commitValue: (value: unknown) => void
  /** Leave the editor without writing. */
  close: () => void
  /**
   * Open this cell's editor: the same door `onCellDoubleClick` opens.
   *
   * For a display widget that is an **explicit opener** — a control whose whole
   * meaning is "add one here" — and for nothing else. CAP-10 retires the
   * cell-wide click, not a control that says what it does, and it is not
   * re-opened for the general case: a cell has to have no other way in before a
   * display is allowed to offer one.
   */
  open: () => void
  /** True while the cell is open, so a popover editor can start open. */
  editing: boolean
  options: GridEditorOptions
  /** Field label used in validation messages; falls back to the column id. */
  label: string
}

/**
 * One registry entry.
 *
 * `parse` throwing *is* the validation mechanism: the keyboard hook catches it
 * and reuses the revert path a rejected write already uses, so a rejected value
 * shows the same destructive cell and the same status message either way. That
 * is why there is no `validate` and no error UI here.
 */
export interface GridEditorDefinition<TData> {
  /** Renders the closed-state display, or undefined to fall back to `text`. */
  renderDisplay?: (ctx: GridEditorContext<TData>) => ReactNode | undefined
  /** Renders the open control. Anchored, never a full-page modal. */
  renderEditor: (ctx: GridEditorContext<TData>) => ReactNode
  /** Draft string -> typed value. Throwing rejects the commit with a message. */
  parse: (draft: string, ctx: GridEditorContext<TData>) => unknown
  /** Present only when the editor commits on interaction rather than `Enter`. */
  commitsOnInteraction?: boolean
  /**
   * What a double-click prefills, for the editors whose edit text is not their
   * display text — a `date` cell displays `5 Mar 2026` and edits `2026-03-05`.
   * Omitted means "seed with the cell's display text", which is right for every
   * editor the two share.
   */
  draftSeed?: (text: string, value: unknown) => string
}
