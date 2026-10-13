"use client"

/**
 * The editor registry — CAP-5.
 *
 * Eleven entries, keyed by `GridEditorKey`, none a stub. A column opts in with
 * `meta.grid.editor: "select"` and the cell looks the key up here; **adding an
 * editor type is a registry entry, not a branch in the cell renderer**, which is
 * the same rule recorded at `grid.tsx:232-268` for the default-column mistake.
 *
 * Four invariants every entry below obeys:
 *
 * 1. **No persistence.** `parse` and `commitsOnInteraction` are the whole
 *    contract. Nothing here calls `fetch`, touches a route, or knows what a row
 *    is — the write belongs to the consumer's `onCellCommit`.
 * 2. **`renderDisplay` renders `ctx.text`.** It never re-reads `ctx.getValue()`.
 *    `ctx.text` already carries the optimistic override, so a widget that reads
 *    the stored value instead shows the *prior* value until the write resolves —
 *    the DW-27 trap. `checkbox`, `currency`, `select`, `multiselect`, `date`,
 *    `url` and `user` all return a widget and are the seven places that could
 *    have walked into it.
 * 3. **`parse` throws to reject.** The keyboard hook catches and reuses the
 *    revert path a rejected write already uses, so there is no editor-specific
 *    error element anywhere in this file — one validation story, one
 *    presentation.
 * 4. **Anchored, not in-cell, wherever the control cannot fit the row.** The
 *    single-line controls render in-cell at the row's own height, which is what
 *    the text editor has always done and what the keyboard suite addresses.
 *    Everything with a search, a list, a calendar or a multi-line body renders
 *    in a `Popover` portal anchored to its cell, so the virtualizer's fixed row
 *    heights cannot move.
 *
 * Table-agnostic: the only imports are React, `date-fns`, `components/ui/*`
 * primitives and the grid's own type modules. Nothing here names a contacts
 * field, a `/manage` route or a `Manage*` type.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent, ReactNode } from "react"
import { format, isValid, parseISO } from "date-fns"

import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type {
  GridEditorContext,
  GridEditorDefinition,
  GridEditorKey,
  GridEditorOptions,
} from "@/components/grid/grid-editor-types"

/**
 * Whether a cell's display text is empty.
 *
 * The grid renders an empty value as nothing at all, so "empty" is now just the
 * empty string \u2014 there is no placeholder glyph for a display to compare
 * against. These call sites used to test a mirrored `EMPTY_TEXT` constant, which
 * existed only because `use-grid-keyboard.ts` owned one while this module is
 * imported *by* that hook. With no glyph to look for, the test needs no shared
 * constant, and the import cycle it worked around is gone with it.
 */
function isBlank(text: string): boolean {
  return text.length === 0
}

/** The join `rowCellText` applies to an array value; `multiselect` reads it back. */
const LIST_SEPARATOR = ", "

/** Mirrors `MAX_TEXT_LENGTH` in `lib/manage/api-handlers.ts`. */
const LONG_TEXT_MAX_LENGTH = 2000

/** Currency is stored in minor units, so no float ever reaches the column. */
const CURRENCY_SCALE = 100

/* -------------------------------------------------------------------------- */
/* Shared control shells                                                      */
/* -------------------------------------------------------------------------- */

/** Shared geometry for the in-cell single-line controls. Tokens, not colours. */
const FIELD_CLASS =
  "border-ring bg-card focus-visible:ring-ring/50 h-full w-full rounded-[3px] border bg-transparent px-1 text-[13px] outline-none focus-visible:ring-[2px]"

/** Shared geometry for the controls that live inside a popover. */
const PANEL_FIELD_CLASS =
  "border-ring focus-visible:ring-ring/50 text-[13px] h-7 w-full rounded-[3px] border bg-transparent px-2 outline-none focus-visible:ring-[2px]"

/** `Enter` commits, `Escape` discards. Shared so no control can get one wrong. */
function handleCommitKeys(
  event: KeyboardEvent<HTMLElement>,
  commit: () => void,
  close: () => void,
): boolean {
  if (event.key === "Enter") {
    event.preventDefault()
    event.stopPropagation()
    commit()
    return true
  }

  if (event.key === "Escape") {
    event.preventDefault()
    event.stopPropagation()
    close()
    return true
  }

  return false
}

/**
 * The in-cell single-line control.
 *
 * Takes focus and selects on mount, for the reason recorded at `grid-row.tsx`:
 * without the selection the caret lands at the end of the pre-filled text and
 * the opening keystroke silently commits a concatenation. The `aria-label` is
 * the one the keyboard suite already addresses, so a `text` column and a plain
 * editable column render the same control.
 */
function InlineField({
  ctx,
  inputMode,
  type,
  prefix,
  sanitize,
}: {
  ctx: GridEditorContext<unknown>
  inputMode?: "decimal" | "email" | "url"
  type?: "email" | "url" | "text"
  prefix?: string
  /** Applied on every keystroke. `currency` uses it to keep typing to digits. */
  sanitize?: (next: string) => string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const input = inputRef.current

    input?.focus()
    input?.select()
  }, [])

  return (
    <span className="flex h-full w-full items-center">
      {prefix ? (
        <span aria-hidden="true" className="text-muted-foreground pr-0.5 text-[13px]">
          {prefix}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type={type ?? "text"}
        inputMode={inputMode}
        value={ctx.draft}
        onChange={(event) =>
          ctx.setDraft(sanitize ? sanitize(event.target.value) : event.target.value)
        }
        // The hook's handler, not a local one: `Enter`, `Escape` and `Tab`
        // must behave the same here as they do in a plain editable cell.
        onKeyDown={ctx.onDraftKeyDown}
        // Blur commits through the same single path. `Enter` has already exited
        // the editor by then, so the mount-order race between the two cannot
        // produce a second write.
        onBlur={() => ctx.blurCommit()}
        onPointerDown={(event) => event.stopPropagation()}
        data-grid-editor={ctx.columnId}
        aria-label="Edit cell value"
        className={FIELD_CLASS}
      />
    </span>
  )
}

/**
 * The anchored shell every popover editor renders through.
 *
 * Radix needs a trigger to anchor to and the grid already has one: the cell. The
 * trigger carries the value, so an open editor still shows what it is editing,
 * and the body lives in a portal so the row's fixed height cannot move.
 *
 * Mounted only while the cell is open, which is what makes closing total: a
 * commit, a cancel and an outside click all return the cell to `renderDisplay`
 * and unmount this, so a stale control cannot survive a write.
 */
function PopoverEditor({ ctx, children }: { ctx: GridEditorContext<unknown>; children: ReactNode }) {
  const [open, setOpen] = useState(true)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)

        if (!next) {
          // Closing is a **commit**, not a discard: CAP-10 makes an operator's
          // corrections survive moving away, and `select`, `multiselect`, `date`,
          // `longtext` and `user` all render through here. Getting this backwards
          // is the worst available failure — it silently discards the option an
          // operator just picked in a dropdown.
          //
          // `ctx.blurCommit` is the one path, and it carries the two rules blur
          // needs: a draft with zero keystrokes since the editor opened is a
          // no-op, and an `Escape` that never reached a local handler still
          // discards rather than committing.
          ctx.blurCommit()
        }
      }}
    >
      <PopoverTrigger asChild>
        <span
          data-grid-editor={ctx.columnId}
          data-state={open ? "open" : "closed"}
          onPointerDown={(event) => {
            // The cell keeps the pointer. Without this the cell would take the
            // pointer event and the trigger — the thing Radix anchors to — would
            // never see the click, so a double-click could not reach it at all.
            event.stopPropagation()
          }}
          onClick={(event) => {
            // The trigger must not toggle. Radix composes its own toggle onto
            // this `onClick` and skips it when the default is prevented, so
            // calling `preventDefault` leaves the cell's `onDoubleClick` in sole
            // charge of opening and closing: without it the *first* click of a
            // second double-click would close the editor and the `dblclick` that
            // follows would reopen it, which is the opposite of what a second
            // double-click means. `preventDefault` does not stop propagation, so
            // the gesture still reaches the cell.
            event.preventDefault()
          }}
          className="flex h-full min-w-0 items-center"
        >
          <span className="truncate">{ctx.text}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        // `Escape` is a discard, and it has to be claimed *here* rather than left
        // to each control. Now that closing commits, a dismissed popover is a
        // write — and Radix registers its own escape listener on the document in
        // the **capture** phase, above the React root's, so a `keydown` handler
        // anywhere in the tree loses the race and is reached only after the popover
        // has already closed. `onEscapeKeyDown` is the one lever that runs *inside*
        // Radix's own handler: returning `false` refuses the dismissal, and
        // `ctx.close()` arms the hook's discard flag while it is still in time.
        //
        // This matters most for `multiselect` and the calendar, which have no local
        // `Escape` handler at all: without this, a bare `Escape` there reached
        // Radix, dismissed the popover, and committed a draft the operator asked to
        // throw away. It belongs on `PopoverContent`, not on `Popover`: Radix
        // 1.1.4 reads it off the content's `DismissableLayer`, and the root
        // silently ignores a prop it does not own — which is exactly what a
        // first attempt here did, and left the bug in place while the code
        // *looked* handled.
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          ctx.close()
          return false
        }}
        // `design-constraints.md` bans drop shadows on data surfaces; the
        // primitive's default carries one.
        className="w-64 p-2 shadow-none"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The closed-state affordance a display widget that opens an editor uses.
 *
 * A `<span>`, never a `<button>`, and that is load-bearing rather than
 * incidental: the contacts table's favorite star is addressed in the suite as
 * "the row's only button", so a button in every cell of four editor columns
 * would make `getByRole("button")` ambiguous there. The cell is already the
 * focusable, keyboard-reachable thing — a double-click opens its editor — so a
 * control inside it needs no role of its own.
 *
 * **There is deliberately no `onClick` here.** The click-to-open display it
 * used to carry is retired by CAP-10 ("no other gesture opens it"): a single
 * click now only moves the focus model onto the cell, which is what CAP-11
 * asks for. The gesture is still *advertised* — `cursor-pointer` below is the
 * discoverability OQ-8 requires now that double-click is the only opener — but
 * advertising a gesture is not performing it.
 */
function OpenableDisplay({
  kind,
  className,
  children,
}: {
  kind: string
  className?: string
  children: ReactNode
}) {
  return (
    <span
      role="presentation"
      data-grid-editor={kind}
      className={`flex h-full min-w-0 cursor-pointer items-center ${className ?? ""}`}
    >
      {children}
    </span>
  )
}

/** A pill. Semantic tokens only; the grid carries no literal colour anywhere. */
function Pill({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      data-grid-editor="pill"
      className={
        muted
          ? "border-border text-muted-foreground inline-flex max-w-full items-center truncate rounded-[3px] border px-1 text-[12px]"
          : "border-primary/40 bg-primary/10 text-primary inline-flex max-w-full items-center truncate rounded-[3px] border px-1 text-[12px]"
      }
    >
      {children}
    </span>
  )
}

/** Case-insensitive substring, the same test the grid's own text filter uses. */
function matches(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.trim().toLowerCase())
}

/** Reads the option list, so an editor without one is empty rather than absent. */
function readOptions(ctx: GridEditorContext<unknown>): readonly string[] {
  return ctx.options.options ?? []
}

/** The popover's search box, shared by the three list editors. */
function OptionSearch({
  ctx,
  value,
  onChange,
  placeholder,
  ariaLabel,
  onEnter,
}: {
  ctx: GridEditorContext<unknown>
  value: string
  onChange: (next: string) => void
  placeholder: string
  ariaLabel: string
  /** `Enter` in a search box commits; a caller with nothing to commit ignores it. */
  onEnter: (query: string) => void
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        handleCommitKeys(
          event,
          () => onEnter(value),
          () => ctx.close(),
        )
      }}
      data-grid-editor="search"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`${PANEL_FIELD_CLASS} mb-1`}
    />
  )
}

/**
 * The option list, with an explicit empty state.
 *
 * `children.length` rather than `children ?? fallback`: a mapped list is always
 * an array, and an empty array is not nullish, so a nullish check would render
 * nothing at all for a filter that matched nothing.
 */
function OptionList({ empty, options }: { empty: string; options: ReactNode[] }) {
  return (
    <ul data-grid-editor="options" className="max-h-48 overflow-auto" role="listbox">
      {options.length > 0 ? (
        options
      ) : (
        <li className="text-muted-foreground px-2 py-1 text-[13px]">{empty}</li>
      )}
    </ul>
  )
}

function OptionRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <li role="none">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        data-grid-editor="option"
        onClick={onClick}
        className="hover:bg-accent hover:text-accent-foreground flex h-7 w-full items-center rounded-[3px] px-2 text-left text-[13px]"
      >
        {children}
      </button>
    </li>
  )
}

function CommitButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-grid-editor="commit"
      onClick={onClick}
      className="border-border bg-secondary text-secondary-foreground h-6 rounded-[3px] border px-2 text-[12px]"
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* text                                                                       */
/* -------------------------------------------------------------------------- */

const textEditor: GridEditorDefinition<unknown> = {
  // No display widget: the cell already truncates to one line and carries the
  // full text in its `title`, so a node here would only replace a value
  // `grid-row.tsx` already prints correctly.
  renderDisplay: () => undefined,
  renderEditor: (ctx) => <InlineField ctx={ctx} />,
  parse: (draft) => draft,
}

/* -------------------------------------------------------------------------- */
/* longtext                                                                   */
/* -------------------------------------------------------------------------- */

const longtextEditor: GridEditorDefinition<unknown> = {
  renderDisplay: () => undefined,
  renderEditor: (ctx) => <LongTextControl ctx={ctx} />,
  // Bounded like the server's `notes`, so an oversized value is rejected through
  // the same revert path a server 400 uses rather than after a round trip.
  parse: (draft, ctx) => {
    if (draft.length > LONG_TEXT_MAX_LENGTH) {
      throw new Error(`${ctx.label} must be ${LONG_TEXT_MAX_LENGTH} characters or fewer.`)
    }

    return draft
  },
}

function LongTextControl({ ctx }: { ctx: GridEditorContext<unknown> }) {
  return (
    <PopoverEditor ctx={ctx}>
      <textarea
        autoFocus
        value={ctx.draft}
        onChange={(event) => ctx.setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            // `Enter` is a newline in a textarea, so the explicit commit is
            // `Cmd`/`Ctrl+Enter` plus the button. Claiming a bare `Enter` here
            // would prevent the very newline it exists to allow, and committing
            // on it would make a multi-line value impossible to type at all.
            event.preventDefault()
            event.stopPropagation()
            ctx.commitDraft()
            return
          }

          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            ctx.close()
          }
        }}
        data-grid-editor="longtext"
        aria-label={`Edit ${ctx.label}`}
        rows={6}
        className="border-ring focus-visible:ring-ring/50 text-[13px] w-full resize-y rounded-[3px] border bg-transparent p-2 outline-none focus-visible:ring-[2px]"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-[12px]">{ctx.draft.length} characters</span>
        <CommitButton onClick={() => ctx.commitDraft()}>Save</CommitButton>
      </div>
    </PopoverEditor>
  )
}

/* -------------------------------------------------------------------------- */
/* number                                                                     */
/* -------------------------------------------------------------------------- */

const numberEditor: GridEditorDefinition<unknown> = {
  renderDisplay: () => undefined,
  renderEditor: (ctx) => <InlineField ctx={ctx} inputMode="decimal" />,
  parse: (draft, ctx) => {
    const trimmed = draft.trim()

    if (trimmed.length === 0) {
      return null
    }

    // `Number` accepts `Infinity`, `0x10` and `1,000`, none of which is a number
    // an operator meant to type, so the shape is checked before the value is.
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(`${ctx.label} must be a number.`)
    }

    const parsed = Number(trimmed)

    if (!Number.isFinite(parsed)) {
      throw new Error(`${ctx.label} must be a number.`)
    }

    return parsed
  },
}

/* -------------------------------------------------------------------------- */
/* currency                                                                   */
/* -------------------------------------------------------------------------- */

function currencyParts(options: GridEditorOptions): { currency: string; locale: string } {
  return { currency: options.currency ?? "INR", locale: options.locale ?? "en-IN" }
}

/**
 * One formatter per `locale|currency`, cached.
 *
 * `renderDisplay` runs for every rendered cell on every render, and
 * `Intl.NumberFormat` is expensive enough to construct that building one per
 * currency cell per frame is measurable on a virtualized grid. The key is the
 * only input, so the cache cannot go stale.
 */
const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat | null>()

function currencyFormatter(options: GridEditorOptions): Intl.NumberFormat | null {
  const { currency, locale } = currencyParts(options)
  const cacheKey = `${locale}|${currency}`

  const cached = CURRENCY_FORMATTERS.get(cacheKey)

  if (cached !== undefined) {
    return cached
  }

  let formatter: Intl.NumberFormat | null = null

  try {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency })
  } catch {
    // An unknown currency code is the consumer's mistake, not a reason to throw
    // out of a cell renderer; the caller's own fallback below covers it.
    formatter = null
  }

  CURRENCY_FORMATTERS.set(cacheKey, formatter)

  return formatter
}

function formatCurrency(minorUnits: number, options: GridEditorOptions): string {
  const { currency } = currencyParts(options)
  const formatter = currencyFormatter(options)

  if (!formatter) {
    return `${(minorUnits / CURRENCY_SCALE).toFixed(2)} ${currency}`
  }

  return formatter.format(minorUnits / CURRENCY_SCALE)
}

/** The symbol alone, so the prefix does not repeat the amount. */
function currencySymbol(options: GridEditorOptions): string {
  const { currency } = currencyParts(options)
  const formatter = currencyFormatter(options)

  if (!formatter) {
    return currency
  }

  return formatter.formatToParts(0).find((part) => part.type === "currency")?.value ?? currency
}

const currencyEditor: GridEditorDefinition<unknown> = {
  // A widget, so it has to render the override itself. `ctx.text` holds the
  // committed minor units; formatting `ctx.getValue()` instead would show the
  // prior amount for the whole round trip.
  renderDisplay: (ctx) => {
    const minorUnits = Number(ctx.text)

    if (!Number.isFinite(minorUnits)) {
      return undefined
    }

    return (
      <span data-grid-editor="currency" className="tabular-nums block truncate text-right">
        {formatCurrency(minorUnits, ctx.options)}
      </span>
    )
  },
  renderEditor: (ctx) => (
    <InlineField
      ctx={ctx}
      inputMode="decimal"
      prefix={currencySymbol(ctx.options)}
      // Digits, one separator and one dot while typing. The parse still decides
      // what is committable; this only keeps the keystroke honest.
      sanitize={(next) => next.replace(/[^\d.-]/g, "").replace(/(?!^)-/g, "")}
    />
  ),
  // A currency cell displays an amount and edits the same amount unformatted.
  draftSeed: (text) => {
    const minorUnits = Number(text)
    return Number.isFinite(minorUnits) ? (minorUnits / CURRENCY_SCALE).toFixed(2) : ""
  },
  parse: (draft, ctx) => {
    const trimmed = draft.trim()

    if (trimmed.length === 0) {
      return null
    }

    if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
      throw new Error(`${ctx.label} must be an amount with at most two decimal places.`)
    }

    const amount = Number(trimmed)

    if (!Number.isFinite(amount)) {
      throw new Error(`${ctx.label} must be an amount.`)
    }

    return Math.round(amount * CURRENCY_SCALE)
  },
}

/* -------------------------------------------------------------------------- */
/* checkbox                                                                   */
/* -------------------------------------------------------------------------- */

const checkboxEditor: GridEditorDefinition<unknown> = {
  // The cell *is* the control, so display and open state are the same node. It
  // reads `ctx.text` for the same reason every other widget here does: an
  // optimistic toggle has to be on screen before the write resolves.
  renderDisplay: (ctx) => <CheckboxControl ctx={ctx} />,
  renderEditor: (ctx) => <CheckboxControl ctx={ctx} />,
  commitsOnInteraction: true,
  parse: (draft) => {
    const normalized = draft.trim().toLowerCase()

    if (normalized === "true") {
      return true
    }

    if (normalized === "false") {
      return false
    }

    throw new Error("A checkbox cell is either checked or unchecked.")
  },
}

function CheckboxControl({ ctx }: { ctx: GridEditorContext<unknown> }) {
  const checked = ctx.text.trim().toLowerCase() === "true"

  return (
    <span className="flex h-full justify-center">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => {
          ctx.commitValue(next === true)
        }}
        // The pointer reaches the cell so the click also focuses it, which is
        // what leaves `Space` addressing this column afterwards.
        data-grid-editor="checkbox"
        aria-label={`Toggle ${ctx.label}`}
      />
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* select                                                                     */
/* -------------------------------------------------------------------------- */

const selectEditor: GridEditorDefinition<unknown> = {
  renderDisplay: (ctx) =>
    isBlank(ctx.text) ? undefined : (
      <OpenableDisplay kind="select">
        <Pill>{ctx.text}</Pill>
      </OpenableDisplay>
    ),
  renderEditor: (ctx) => <SelectControl ctx={ctx} />,
  parse: (draft, ctx) => {
    const trimmed = draft.trim()

    if (trimmed.length === 0) {
      return null
    }

    if (!readOptions(ctx).includes(trimmed)) {
      throw new Error(`"${trimmed}" is not an option for ${ctx.label}.`)
    }

    return trimmed
  },
}

function SelectControl({ ctx }: { ctx: GridEditorContext<unknown> }) {
  const [query, setQuery] = useState("")
  const options = readOptions(ctx)
  const visible = useMemo(
    () => (query.trim().length === 0 ? options : options.filter((option) => matches(option, query))),
    [options, query],
  )

  return (
    <PopoverEditor ctx={ctx}>
      <OptionSearch
        ctx={ctx}
        value={query}
        onChange={setQuery}
        placeholder="Find an option"
        ariaLabel={`Find an option for ${ctx.label}`}
        onEnter={(typed) => {
          const first = visible[0]
          ctx.commitDraft(first ?? typed)
        }}
      />
      <OptionList
        empty="No matching option."
        options={visible.map((option) => (
          <OptionRow key={option} selected={option === ctx.text} onClick={() => ctx.commitDraft(option)}>
            <span className="truncate">{option}</span>
          </OptionRow>
        ))}
      />
    </PopoverEditor>
  )
}

/* -------------------------------------------------------------------------- */
/* multiselect                                                                */
/* -------------------------------------------------------------------------- */

const multiselectEditor: GridEditorDefinition<unknown> = {
  renderDisplay: (ctx) =>
    isBlank(ctx.text) ? undefined : (
      <OpenableDisplay kind="multiselect" className="gap-1">
        {ctx.text
          .split(LIST_SEPARATOR)
          .slice(0, 2)
          .map((entry) => (
            <Pill key={entry}>{entry}</Pill>
          ))}
        {ctx.text.split(LIST_SEPARATOR).length > 2 ? (
          <Pill muted>{`+${ctx.text.split(LIST_SEPARATOR).length - 2}`}</Pill>
        ) : null}
      </OpenableDisplay>
    ),
  renderEditor: (ctx) => <MultiselectControl ctx={ctx} />,
  parse: (draft, ctx) => {
    const entries = draft
      .split(LIST_SEPARATOR)
      .map((entry) => entry.trim())
      .filter(Boolean)

    if (entries.length === 0) {
      return null
    }

    const options = readOptions(ctx)
    const unknown = entries.filter((entry) => !options.includes(entry))

    if (unknown.length > 0) {
      throw new Error(
        `${unknown.map((entry) => `"${entry}"`).join(", ")} ${
          unknown.length === 1 ? "is not an option" : "are not options"
        } for ${ctx.label}.`,
      )
    }

    return entries
  },
}

function MultiselectControl({ ctx }: { ctx: GridEditorContext<unknown> }) {
  const [selected, setSelected] = useState<string[]>(() =>
    isBlank(ctx.text) ? [] : ctx.text.split(LIST_SEPARATOR).filter(Boolean),
  )
  const [query, setQuery] = useState("")
  const options = readOptions(ctx)
  const visible = useMemo(
    () => (query.trim().length === 0 ? options : options.filter((option) => matches(option, query))),
    [options, query],
  )

  return (
    <PopoverEditor ctx={ctx}>
      <OptionSearch
        ctx={ctx}
        value={query}
        onChange={setQuery}
        placeholder="Find an option"
        ariaLabel={`Find an option for ${ctx.label}`}
        // A multi-value edit commits on Apply, so `Enter` in the filter only
        // closes the popover — picking nothing must not be a silent write.
        onEnter={() => {
          ctx.commitDraft(selected.join(LIST_SEPARATOR))
        }}
      />
      <OptionList
        empty="No matching option."
        options={visible.map((option) => (
          <OptionRow
            key={option}
            selected={selected.includes(option)}
            onClick={() => {
              // Computed outside the updater on purpose: a `useState` updater runs
              // during render, so a `ctx.setDraft` inside one is a `setState` on
              // the grid during this component's render — React logs it and the
              // two states can disagree for a frame.
              const next = selected.includes(option)
                ? selected.filter((entry) => entry !== option)
                : [...selected, option]

              setSelected(next)

              // Mirrored into the hook's draft so a click *away* commits what was
              // picked. Only a list that differs from the seeded draft counts:
              // re-clicking an option already present nets unchanged, and a blur
              // must not turn that into a write.
              if (next.join(LIST_SEPARATOR) !== ctx.draft) {
                ctx.setDraft(next.join(LIST_SEPARATOR))
              }
            }}
          >
            <span aria-hidden="true" className="w-3 shrink-0">
              {selected.includes(option) ? "✓" : ""}
            </span>
            <span className="truncate">{option}</span>
          </OptionRow>
        ))}
      />
      <div className="mt-2 flex justify-end">
        <CommitButton onClick={() => ctx.commitDraft(selected.join(LIST_SEPARATOR))}>
          Apply
        </CommitButton>
      </div>
    </PopoverEditor>
  )
}

/* -------------------------------------------------------------------------- */
/* date                                                                       */
/* -------------------------------------------------------------------------- */

const dateEditor: GridEditorDefinition<unknown> = {
  renderDisplay: (ctx) => {
    const parsed = parseISO(ctx.text)

    if (!isValid(parsed)) {
      return undefined
    }

    return (
      <OpenableDisplay kind="date">
        <span className="truncate">{format(parsed, "d MMM yyyy")}</span>
      </OpenableDisplay>
    )
  },
  renderEditor: (ctx) => <DateControl ctx={ctx} />,
  // A date cell displays `5 Mar 2026` and edits `2026-03-05`.
  draftSeed: (text) => {
    const parsed = parseISO(text)
    return isValid(parsed) ? format(parsed, "yyyy-MM-dd") : ""
  },
  parse: (draft, ctx) => {
    const trimmed = draft.trim()

    if (trimmed.length === 0) {
      return null
    }

    // `parseISO` rejects a day the month does not have, so `2026-02-31` never
    // silently becomes 3 March the way `new Date("2026-02-31")` would.
    const parsed = parseISO(trimmed)

    if (!isValid(parsed)) {
      throw new Error(`${ctx.label} must be a real date, written as YYYY-MM-DD.`)
    }

    return format(parsed, "yyyy-MM-dd")
  },
}

function DateControl({ ctx }: { ctx: GridEditorContext<unknown> }) {
  const [text, setText] = useState<string>(() => {
    const parsed = parseISO(ctx.text)
    return isValid(parsed) ? format(parsed, "yyyy-MM-dd") : ""
  })
  const selected = parseISO(text)

  return (
    <PopoverEditor ctx={ctx}>
      <div data-grid-editor="calendar">
        <Calendar
          mode="single"
          selected={isValid(selected) ? selected : undefined}
          onSelect={(next) => {
            if (!next) {
              return
            }

            const iso = format(next, "yyyy-MM-dd")
            setText(iso)
            ctx.commitDraft(iso)
          }}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={text}
          onChange={(event) => {
            // Mirrored into the hook's draft so the blur-commit can commit a
            // date the operator typed rather than only a day they picked. The
            // local state is what renders; the draft is what a click-away saves.
            ctx.setDraft(event.target.value)
            setText(event.target.value)
          }}
          onKeyDown={(event) => {
            handleCommitKeys(
              event,
              () => ctx.commitDraft(text),
              () => ctx.close(),
            )
          }}
          data-grid-editor="date-input"
          aria-label={`${ctx.label} as YYYY-MM-DD`}
          placeholder="YYYY-MM-DD"
          className={PANEL_FIELD_CLASS}
        />
        <CommitButton onClick={() => ctx.commitDraft(text)}>Set</CommitButton>
      </div>
    </PopoverEditor>
  )
}

/* -------------------------------------------------------------------------- */
/* url                                                                        */
/* -------------------------------------------------------------------------- */

/** `new URL` accepts almost anything, so the scheme is checked explicitly. */
function isAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

const urlEditor: GridEditorDefinition<unknown> = {
  renderDisplay: (ctx) => {
    const href = ctx.text.trim()

    if (href.length === 0 || !isAbsoluteUrl(href)) {
      return undefined
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        // The pointer deliberately reaches the cell: stopping it here would leave
        // `e` addressing whatever column was focused before, which reads as "the
        // key does not work on this column". The click itself is stopped so
        // following the link does not also look like a cell interaction.
        onClick={(event) => event.stopPropagation()}
        data-grid-editor="url"
        className="hover:underline block truncate text-[13px]"
      >
        {href}
      </a>
    )
  },
  renderEditor: (ctx) => <InlineField ctx={ctx} inputMode="url" type="url" />,
  parse: (draft, ctx) => {
    const trimmed = draft.trim()

    if (trimmed.length === 0) {
      return null
    }

    if (!isAbsoluteUrl(trimmed)) {
      throw new Error(`${ctx.label} must be a full URL, including http:// or https://.`)
    }

    return trimmed
  },
}

/* -------------------------------------------------------------------------- */
/* email                                                                      */
/* -------------------------------------------------------------------------- */

const emailEditor: GridEditorDefinition<unknown> = {
  renderDisplay: () => undefined,
  renderEditor: (ctx) => <InlineField ctx={ctx} inputMode="email" type="email" />,
  parse: (draft, ctx) => {
    const trimmed = draft.trim()

    if (trimmed.length === 0) {
      return null
    }

    const at = trimmed.indexOf("@")

    if (
      at <= 0 ||
      at !== trimmed.lastIndexOf("@") ||
      at === trimmed.length - 1 ||
      /\s/.test(trimmed) ||
      !trimmed.slice(at + 1).includes(".")
    ) {
      throw new Error(`${ctx.label} must be an email address.`)
    }

    return trimmed
  },
}

/* -------------------------------------------------------------------------- */
/* user                                                                       */
/* -------------------------------------------------------------------------- */

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

const userEditor: GridEditorDefinition<unknown> = {
  renderDisplay: (ctx) => {
    const match = (ctx.options.users ?? []).find((user) => user.id === ctx.text)

    if (!match) {
      return undefined
    }

    return (
      <OpenableDisplay kind="user" className="gap-1">
        <span
          aria-hidden="true"
          className="bg-muted text-muted-foreground flex size-4 shrink-0 items-center justify-center rounded-[3px] text-[10px]"
        >
          {initialsOf(match.name)}
        </span>
        <span className="truncate">{match.name}</span>
      </OpenableDisplay>
    )
  },
  renderEditor: (ctx) => <UserControl ctx={ctx} />,
  parse: (draft, ctx) => {
    const trimmed = draft.trim()

    if (trimmed.length === 0) {
      return null
    }

    if (!(ctx.options.users ?? []).some((user) => user.id === trimmed)) {
      throw new Error(`"${trimmed}" is not a known ${ctx.label}.`)
    }

    return trimmed
  },
}

function UserControl({ ctx }: { ctx: GridEditorContext<unknown> }) {
  const [query, setQuery] = useState("")
  const users = useMemo(() => ctx.options.users ?? [], [ctx.options.users])
  const visible = useMemo(
    () => (query.trim().length === 0 ? users : users.filter((user) => matches(user.name, query))),
    [query, users],
  )

  return (
    <PopoverEditor ctx={ctx}>
      <OptionSearch
        ctx={ctx}
        value={query}
        onChange={setQuery}
        placeholder="Find a person"
        ariaLabel={`Find ${ctx.label}`}
        onEnter={(typed) => {
          const first = visible[0] ?? users.find((user) => matches(user.name, typed))
          if (first) {
            ctx.commitDraft(first.id)
          }
        }}
      />
      <OptionList
        empty="No matching person."
        options={visible.map((user) => (
          <OptionRow key={user.id} selected={user.id === ctx.text} onClick={() => ctx.commitDraft(user.id)}>
            <span className="truncate">{user.name}</span>
          </OptionRow>
        ))}
      />
    </PopoverEditor>
  )
}

/* -------------------------------------------------------------------------- */
/* The registry                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every registered key, in the order `editor-catalog.md` lists them.
 *
 * A mapped type rather than a `Record`, so adding a `GridEditorKey` without an
 * entry — or an entry without a key — is a compile error at this declaration
 * rather than an `undefined` at a cell.
 *
 * Parameterised on `unknown` rather than on the caller's `TData`: no entry reads
 * `ctx.row`, and `GridEditorContext<TData>` is assignable to
 * `GridEditorContext<unknown>` for every `TData`, so one registry serves every
 * table without a cast at the lookup.
 */
const GRID_EDITOR_REGISTRY: { [K in GridEditorKey]: GridEditorDefinition<unknown> } = {
  text: textEditor,
  longtext: longtextEditor,
  number: numberEditor,
  currency: currencyEditor,
  checkbox: checkboxEditor,
  select: selectEditor,
  multiselect: multiselectEditor,
  date: dateEditor,
  url: urlEditor,
  email: emailEditor,
  user: userEditor,
}

/**
 * The one lookup.
 *
 * `undefined` for a column with no editor, and for a key that survived a cast —
 * a plain cell rather than a crash, because the key is a compile error
 * everywhere it can be typed.
 */
export function resolveGridEditor(
  key: GridEditorKey | undefined,
): GridEditorDefinition<unknown> | undefined {
  if (!key) {
    return undefined
  }

  return Object.prototype.hasOwnProperty.call(GRID_EDITOR_REGISTRY, key)
    ? GRID_EDITOR_REGISTRY[key]
    : undefined
}

/** Every registered key, in catalog order. */
export const GRID_EDITOR_KEYS: readonly GridEditorKey[] = Object.keys(
  GRID_EDITOR_REGISTRY,
) as GridEditorKey[]
