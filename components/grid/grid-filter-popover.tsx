"use client"

import { useEffect, useRef, useState } from "react"
import type { ReactNode, RefObject } from "react"
import { Plus, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  emptyCondition,
  encodeCondition,
  filterOperatorsFor,
  isConditionUnfilled,
  isConditionValueInvalid,
  type GridFilterCondition,
  type GridFilterConnective,
} from "@/components/grid/grid-filter-operators"
import { GridFilterDateControl, GridFilterMultiSelectControl } from "@/components/grid/grid-filter-value"
import type { GridFieldType } from "@/components/grid/grid-types"

/** One column the popover can name, with whatever its value control needs. */
export interface GridFilterField {
  id: string
  label: string
  fieldType: GridFieldType
  /** Option labels for a select or multiselect value control. */
  options?: readonly string[]
  /**
   * The row's identity column, offered first by `+ Add condition`.
   *
   * Carried in from `meta.grid.emphasis`, which is already documented as "the
   * one column per row that carries the row's identity". The filter surface has
   * no business inventing a second notion of "primary".
   */
  primary?: boolean
}

export interface GridFilterPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The node the popover anchors to. Rendered where the caller puts it. */
  anchor: ReactNode
  fields: readonly GridFilterField[]
  conditions: readonly GridFilterCondition[]
  connective: GridFilterConnective
  onConditionsChange: (conditions: GridFilterCondition[]) => void
  onConnectiveChange: (connective: GridFilterConnective) => void
}

/**
 * Matches the reference composition's control box: `h-9`, `rounded-[6px]`,
 * `px-2.5`, 13px.
 *
 * `md:text-[13px]` is not redundant. `Input` carries `text-base md:text-sm` and
 * `SelectTrigger` carries `text-sm`, so a bare `text-[13px]` is overridden at
 * `md` and up — which is every viewport this grid is used at. Both variants are
 * named so the later one wins.
 *
 * The slot widths below are the reference PNG's, not the comp HTML's. The comp
 * declares `w-16 / w-44 / w-36 / w-44 / w-8`, which sums to 592 plus 32 of gaps
 * inside a 568px content box — it overflows by 56px and pushes the delete
 * control clean out of the surface. The rendered composition does not have that
 * problem, so these are measured from it.
 */
const CONTROL = "h-9 rounded-md border border-input bg-card px-2.5 text-[13px] md:text-[13px]"
const TRIGGER = `${CONTROL} [&_svg]:size-3.5`
const SLOT_FIELD = "w-[156px]"
const SLOT_OPERATOR = "w-[128px]"
const SLOT_VALUE = "w-[154px]"

/**
 * The footer's two actions, which share ONE treatment: quiet siblings at the
 * foot of the list, not a brand link beside a plain button.
 *
 * **The no-fill hover needs both variant scopes named.** `ghost` fills with
 * `hover:bg-accent` in light and `dark:hover:bg-accent/50` in dark; those are
 * separate scopes, so a bare `hover:bg-transparent` leaves the dark fill in
 * place. `cn()` is `twMerge`, so within each scope the later class wins and no
 * `!` is needed.
 *
 * **The label goes white in dark and `--foreground` in light.** White is asked
 * for on the dark popover; against the light `--popover` (`#ffffff`) it would be
 * invisible, and `--foreground` is the value `ghost`'s own hover already gives
 * there, so light is unchanged rather than newly styled.
 *
 * One string for both buttons is what makes them matched by construction —
 * `gap-1` is inert on `Clear all`, which has no icon.
 */
const FOOTER_ACTION =
  "text-muted-foreground h-7 gap-1 px-0 text-[12px] font-semibold hover:bg-transparent dark:hover:bg-transparent hover:text-foreground dark:hover:text-white"

/**
 * The filter conditions popover (CAP-12).
 *
 * **A POPOVER ANCHORED UNDER THE TOOLBAR, not an inline bar and not a modal.**
 * `surface-and-toolbar.md` struck through the modal argument and then the inline
 * bar. The popover won because the matching-row count lives in the toolbar row
 * and this surface hangs below it, so the count stays live and visible while
 * conditions are composed. The cost is recorded in the same file and is real:
 * the operator cannot watch *which* rows match, because the popover covers the
 * grid. Do not "fix" that by building a second count in here.
 *
 * **THE `and ▾` PREFIX IS NOT PER ROW.** One connective governs the whole list,
 * so the list is never `A and B or C`: there are no precedence rules and nothing
 * is serialized in order. The prefix on rows 2+ is driven by the single connective
 * that governs them all, which is why it reads identically on every row.
 *
 * **NO DRAG HANDLE, and no condition groups, no "Copy from another view", no Ask
 * AI.** All three appear in the reference screenshot and all three are out of
 * scope. A handle would be worse than absent: conditions are a SET of columns, so
 * reordering them cannot change the result set, and a handle would imply a
 * capability with no effect.
 *
 * **AN OPERATOR WITH NO VALUE RENDERS ITS CONTROL DISABLED, NOT ABSENT.** Under
 * `is empty` the control is greyed rather than removed, so the operator can see it
 * is not applicable rather than wondering where it went. It carries a real
 * `disabled`/`aria-disabled`, and a value written while disabled is discarded —
 * greyed that still accepted input would be a lie.
 *
 * Composition: `Visual-Design/contacts-toolbar-stitch-v1-corrected.html`. Colours
 * go through tokens rather than the composition's hex, so the file stays inside
 * the token-clean gate `harness-guards.spec.ts:89` enforces under
 * `components/grid/`.
 */
export function GridFilterPopover({
  open,
  onOpenChange,
  anchor,
  fields,
  conditions,
  connective,
  onConditionsChange,
  onConnectiveChange,
}: GridFilterPopoverProps) {
  const fieldById = new Map(fields.map((field) => [field.id, field]))

  /**
   * The conditions the rows render from, and the list every writer in this file
   * builds on — one value, so the rows and the writers cannot disagree about
   * what the list is. See `useConditionMirror`.
   *
   * `conditionsRef` survives inside it: the write base for `replace`,
   * `addCondition` and the close-time prune, not a display buffer, and written
   * synchronously by every commit. What it no longer is is a ref BESIDE the
   * prop, which is why the rows render from the same thing the writers read.
   */
  const [renderedConditions, conditionsRef, commitConditions] = useConditionMirror(
    conditions,
    onConditionsChange,
  )

  /**
   * The connective is the same lag for a different reason: `setFilterConnective`
   * PUSHES rather than debouncing, so the prop comes back a whole router
   * transition later and the trigger reads `and` while the grid is already on
   * `or`. Its identity is its own value, so its key needs no help.
   */
  const [renderedConnective, , commitConnective] = usePendingMirror<GridFilterConnective>(
    connective,
    (value) => value,
    onConnectiveChange,
  )

  /**
   * Every column the list currently filters on, built ONCE per render.
   *
   * Each row's field list derives its disabled set from this, and `FilterValueControl`
   * commits on every keystroke — so building the set per row made an n-row list cost
   * O(n²) on every paint.
   */
  const filteredColumnIds = new Set(renderedConditions.map((condition) => condition.columnId))

  const replace = (next: GridFilterCondition) => {
    commitConditions(
      conditionsRef.current.map((condition) =>
        condition.columnId === next.columnId ? next : condition,
      ),
    )
  }

  const addCondition = () => {
    const current = conditionsRef.current
    const taken = new Set(current.map((condition) => condition.columnId))
    const available = fields.filter((field) => !taken.has(field.id))

    // The identity column first, then the rest in column order. A newly added
    // condition is almost always about finding a person, and the first row
    // otherwise opens on whatever column happens to sort first.
    const next = available.find((field) => field.primary) ?? available[0]

    if (!next) {
      return
    }

    commitConditions([...current, emptyCondition(next.id, next.fieldType)])
  }

  /**
   * Drops conditions the operator started and never finished.
   *
   * A `none`-shape operator is COMPLETE without a value — `is empty` is the
   * whole condition — so only value-taking operators with a blank value are
   * removed. Without this, closing the popover over a half-built row leaves it
   * sitting there inert, reading as a filter that is on.
   */
  const pruneUnfilled = () => {
    const current = conditionsRef.current
    const kept = current.filter(
      (condition) =>
        !isConditionUnfilled(condition, fieldById.get(condition.columnId)?.fieldType),
    )

    if (kept.length !== current.length) {
      commitConditions(kept)
    }
  }

  /**
   * Every close path goes through here — the `×`, a pointer-down outside, and
   * Escape — so pruning cannot be routed around by the one control a user is
   * most likely to reach for.
   */
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      pruneUnfilled()
    }

    onOpenChange(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{anchor}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        data-grid-filter-popover=""
        className="w-[600px] rounded-lg p-4 text-[13px]"
        onFocusOutside={(event) => {
          // Same reason as `grid-sort-popover.tsx`: a column menu's close returns
          // focus to its trigger, which is outside this popover, and Radix reads
          // that focus return as a dismiss. Pointer-down outside and Escape still
          // close; only the focus yank is ignored.
          event.preventDefault()
        }}
      >
        {/* The rule BELOW the header is the popover's only one. The conditions
         * container used to carry a `border-b` as well, which doubled it, and the
         * footer used to carry a `border-t`, which cut the two footer actions off
         * as a second form region. Story 6's AC-D3 asserted one rule above the
         * conditions and one below — its text is marked superseded. Do not
         * re-add a rule to the footer to match it. */}
        <div
          className="text-muted-foreground border-border mb-3 flex items-center justify-between border-b pb-3 text-[12px] font-medium"
          data-grid-filter-header=""
        >
          <span>In this view, show contacts</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close filters"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={() => {
              handleOpenChange(false)
            }}
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-2.5" data-grid-filter-conditions="">
          {renderedConditions.map((condition, index) => {
            const field = fieldById.get(condition.columnId)
            const fieldType = field?.fieldType
            const operators = filterOperatorsFor(fieldType)
            const operator = operators.find((entry) => entry.id === condition.operator)
            const takesValue = operator?.valueShape !== "none"
            const invalid = isConditionValueInvalid(condition, fieldType)

            // A column some OTHER row already filters on is disabled below. The row's
            // own column is excluded deliberately: disabling it would grey the value
            // this row is already showing and block every same-row re-pick.
            const columnTakenElsewhere = (columnId: string) =>
              columnId !== condition.columnId && filteredColumnIds.has(columnId)

            return (
              <div key={condition.columnId} className="flex items-center gap-2" data-grid-filter-condition={condition.columnId}>
                {index === 0 ? (
                  <div
                    aria-hidden="true"
                    className="text-muted-foreground flex h-9 w-16 shrink-0 select-none items-center justify-center text-xs font-medium uppercase tracking-wider"
                  >
                    Where
                  </div>
                ) : (
                  <Select
                    value={renderedConnective}
                    onValueChange={(value) => commitConnective(value as GridFilterConnective)}
                  >
                    <SelectTrigger
                      data-grid-filter-connective=""
                      aria-label="Match all or any of these conditions"
                      className={`${TRIGGER} w-16 shrink-0 px-1 text-center text-[12px] font-medium`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-[13px]">
                        and
                      </SelectItem>
                      <SelectItem value="any" className="text-[13px]">
                        or
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}

                <Select
                  value={condition.columnId}
                  onValueChange={(value) => {
                    const nextField = fieldById.get(value)

                    if (!nextField) {
                      return
                    }

                    // Switching field RESETS the operator and the value.
                    // Carrying `contains` onto a date field, or an orphaned value
                    // from the previous field, is the bug that filters nothing and
                    // looks exactly like "no matches".
                    const fresh = emptyCondition(value, nextField.fieldType)
                    const keepList = Array.isArray(fresh.value) && Array.isArray(condition.value)

                    // Replaces the entry carrying the OLD id, not one matching the
                    // new id — `replace` looks its target up by `columnId`, and on
                    // a field change those two differ, so replacing by the new id
                    // matches nothing and silently leaves the old condition alone.
                    //
                    // Off the mirror, not the prop: three field picks in a row each
                    // build on the last, and the prop is still the list from before
                    // the first of them until the debounced write lands.
                    commitConditions(
                      conditionsRef.current.map((entry) =>
                        entry.columnId === condition.columnId
                          ? { ...fresh, value: keepList ? condition.value : fresh.value }
                          : entry,
                      ),
                    )
                  }}
                >
                  <SelectTrigger
                    data-grid-filter-field=""
                    aria-label={`Condition ${index + 1} field`} className={`${TRIGGER} ${SLOT_FIELD} shrink-0`}>
                    <SelectValue placeholder="Choose a field" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* THIS OPTION LIST IS THE ONLY GATE. `onValueChange` below does
                     * not re-check that the picked column is free, because Radix's
                     * `handleSelect` is `if (!disabled)` — a disabled item never
                     * reaches it. Drop the `disabled` without adding the check there
                     * and this control can build two conditions with one id again.
                     *
                     * Disabled rather than absent: the column is not withdrawn from
                     * view, only marked unavailable, which is what
                     * `grid-header-cell.tsx:216` and `grid-toolbar.tsx:210` do for the
                     * menu items they cannot offer. */}
                    {fields.map((entry) => (
                      <SelectItem
                        key={entry.id}
                        value={entry.id}
                        disabled={columnTakenElsewhere(entry.id)}
                        className="text-[13px]"
                      >
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={condition.operator}
                  onValueChange={(value) => {
                    const next = operators.find((entry) => entry.id === value)

                    replace({
                      columnId: condition.columnId,
                      operator: value,
                      // An operator that takes no value must not keep one, or the
                      // stale value would filter the moment it is reselected.
                      value: next?.valueShape === "none" || !Array.isArray(condition.value) ? "" : condition.value,
                    })
                  }}
                >
                  <SelectTrigger
                    data-grid-filter-operator=""
                    aria-label={`Condition ${index + 1} operator`} className={`${TRIGGER} ${SLOT_OPERATOR} shrink-0`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id} className="text-[13px]">
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <FilterValueControl
                  key={`${condition.columnId}:${condition.operator}`}
                  condition={condition}
                  field={field}
                  fieldType={fieldType}
                  takesValue={takesValue}
                  invalid={invalid}
                  onCommit={(value) => {
                    replace({ ...condition, value })
                  }}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${field?.label ?? condition.columnId} condition`}
                  className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                  onClick={() => {
                    commitConditions(
                      conditionsRef.current.filter(
                        (entry) => entry.columnId !== condition.columnId,
                      ),
                    )
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </Button>
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex items-center justify-between" data-grid-filter-footer="">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={FOOTER_ACTION}
            onClick={addCondition}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Add condition
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={FOOTER_ACTION}
            onClick={() => {
              // Through the one writer, like every other change in this file, and
              // that is the point of moving it: `Clear all` is a local change to
              // the list, so the rows go on the click rather than a transition
              // later, and a close straight afterwards prunes against the cleared
              // list instead of resurrecting what was just cleared. The URL write
              // is unchanged — it is the same `onConditionsChange([])`.
              commitConditions([])
            }}
          >
            Clear all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface FilterValueControlProps {
  condition: GridFilterCondition
  field: GridFilterField | undefined
  fieldType: GridFieldType | undefined
  takesValue: boolean
  invalid: boolean
  onCommit: (value: string | string[]) => void
}

/**
 * What one mirror hands back, in the order the caller destructures it.
 *
 * **A tuple, not an object, and the lint rule is why.** `react-hooks/refs` taints
 * every property read off a value that holds a ref somewhere inside it, so an
 * object carrying `value`, `ref` and `commit` together makes
 * `mirror.value.map(...)` in the render body a ref access and the build fails.
 * Three positions keep the render-side read off the tainted value.
 */
type PendingMirror<T> = readonly [
  /**
   * The value to render: authoritative while a local write of ours is in flight,
   * reconciled from the prop the moment nothing is.
   */
  value: T,
  /**
   * The same value, for the writers that need it NOW.
   *
   * `setState` is asynchronous, so a handler that read `value` would build on the
   * PREVIOUS one — which is how three field picks inside one debounce window
   * leave the URL carrying only the first. This is the same guarantee
   * `conditionsRef` existed for, and it is now the mirror's own field rather than
   * a second copy of it.
   */
  ref: RefObject<T>,
  /**
   * The sole writer, and it writes in this order: the mirror, then the ref, then
   * the parent. The ref is synchronous and the parent is not, so anything that
   * reads the list later in the same tick — `replace`, the close-time prune — sees
   * what was just written rather than what was last rendered.
   */
  commit: (next: T) => void,
]

/**
 * Holds a URL-backed value on screen while the URL catches up with it.
 *
 * Every control in this popover writes through the URL: a condition change behind
 * the 250 ms debounce in `use-grid-view-state.ts`, a connective change behind a
 * whole `router.push` transition. For that window the prop is the value BEFORE
 * the change, so a control bound straight to it cannot show what was just picked —
 * the field Select snapped back to the previous column, the operator Select to the
 * previous operator, and the connective to `and`, each for as long as the write
 * took. That is a quarter second at best and a second or two in dev.
 *
 * So the mirror is authoritative, and it is surrendered only once the committed
 * value has caught up with it. Reconciling on focus is not enough — closing the
 * popover or a dropdown can beat the write — and neither is "reconcile whenever
 * they differ", because during that window they legitimately differ and adopting
 * the prop would undo the write mid-flight. Identical reasoning to
 * `useConditionValueDraft` and `useMultiSelectDraft`; read the first for the full
 * argument.
 *
 * `identity` is how the committed value is COMPARED, and it is a parameter
 * because the right comparison is the one the codec preserves, not the one that
 * is easiest to write — see `conditionsListKey`. `onCommit` fires on EVERY
 * commit; the debounce downstream is what stops that being a router call per
 * character, and this hook has no business adding a second debounce of its own.
 */
function usePendingMirror<T>(
  committed: T,
  identity: (value: T) => string,
  onCommit: (value: T) => void,
): PendingMirror<T> {
  const committedKey = identity(committed)

  const [value, setValue] = useState<T>(() => committed)
  const [valueKey, setValueKey] = useState(committedKey)
  const [pending, setPending] = useState(false)
  const ref = useRef(value)

  // Catch up on anything that arrived from OUTSIDE this mirror — Back, Forward, a
  // shared link, `Clear filters`, a URL edit — while nothing of ours is in flight.
  //
  // The KEY decides whether there is anything to catch up to; `committed` is only
  // what gets read. A fresh array on every render must not be the trigger, or the
  // mirror re-adopts one every render — the "reconcile whenever they differ"
  // mistake with its guard taken out, and the rows churn under the operator's
  // hands.
  useEffect(() => {
    if (pending || committedKey === valueKey) {
      return
    }

    setValue(committed)
    setValueKey(committedKey)
    ref.current = committed
  }, [committed, committedKey, pending, valueKey])

  // Our own write landed. Dropping the flag is what hands the display back to the
  // committed value instead of leaving two sources of truth in step.
  useEffect(() => {
    if (pending && committedKey === valueKey) {
      setPending(false)
    }
  }, [committedKey, valueKey, pending])

  return [
    value,
    ref,
    (next: T) => {
      setValue(next)
      setValueKey(identity(next))
      setPending(true)
      ref.current = next
      onCommit(next)
    },
  ]
}

/**
 * How two condition lists are compared: each condition's column id and its
 * SERIALIZED token, as one JSON string.
 *
 * **NOT `JSON.stringify` of the list itself, and that is load-bearing.** A list
 * reaches this component by two routes that do not agree about its shape: the
 * commit the mirror has just made, and the URL that commit travelled through.
 * `emptyCondition` gives a single-valued select column `value: []` — the shape
 * its first operator declares — and the codec writes that as `f.source=is:` and
 * reads it back as `value: ""`, because `is` is not a set operator and an array
 * cannot survive as an array. A key taken from the raw list therefore differs
 * across that round trip for good: the mirror decides its own write never landed,
 * stops reconciling, and leaves `Clear all` and Back showing rows the URL has
 * already thrown away.
 *
 * The serialized token is the one identity the codec preserves in both
 * directions, so a key built from it is equal exactly when the display and the
 * URL agree — which is the whole question the mirror is asking. Order is part of
 * it: the query string's own key order is the order the rows stack in, so a
 * reorder is a real change to what the URL will carry.
 *
 * `JSON.stringify` of the pairs rather than a separator-joined string, so a value
 * carrying the separator cannot make two different lists compare equal.
 */
function conditionsListKey(conditions: readonly GridFilterCondition[]): string {
  return JSON.stringify(conditions.map((condition) => [condition.columnId, encodeCondition(condition)]))
}

/**
 * The conditions the rows render from, and the base `replace`, `addCondition`,
 * `pruneUnfilled` and the field Select all build on.
 *
 * Before this, the freshest list lived in a ref alone — a write base with no
 * display behind it. Choosing an operator and closing straight after left the
 * prune reading the PREVIOUS conditions, so it deleted the row the operator had
 * just made complete: pick `is empty`, hit the `×`, and the `is empty` filter
 * vanished because the prune still saw `contains` with a blank value. The mirror
 * keeps that guarantee and gives it a display, and it is one value rather than a
 * ref beside the prop — the rows and the writers cannot drift apart.
 *
 * The parent is handed its OWN copy of the list: it writes it straight into
 * TanStack's `columnFilters`, and a mirror that handed over the array it renders
 * from would be one mutation away from having its own rows change underneath it.
 */
function useConditionMirror(
  committed: readonly GridFilterCondition[],
  onCommit: (next: GridFilterCondition[]) => void,
): PendingMirror<readonly GridFilterCondition[]> {
  return usePendingMirror(committed, conditionsListKey, (next) => onCommit([...next]))
}

/**
 * The committed value a text or number control edits.
 *
 * An `isEmpty`-shaped operator holds `""` by construction, so treating it as a
 * text draft is harmless — the control that would show it is the disabled one,
 * which renders before this is ever read.
 */
function editableText(condition: GridFilterCondition): string {
  return Array.isArray(condition.value) ? condition.value[0] ?? "" : condition.value
}

/**
 * Keeps a text or number value on screen while the URL catches up with it.
 *
 * A filter commit reaches the URL behind the 250 ms debounce in
 * `use-grid-view-state.ts`, so for a quarter second after a keystroke the
 * committed value is still the PREVIOUS one. A control bound straight to it
 * would drop characters, and one that reconciles on blur would blank the field
 * the moment focus left — which is exactly the bug that emptied this control:
 * the first build kept a draft, cleared it to `""` on blur, and so showed the
 * placeholder over a value that was still filtering.
 *
 * So: the draft is authoritative, and it is surrendered only once the committed
 * value has caught up with it. A focus flag is not enough — blur can beat the
 * write — and neither is "reconcile whenever they differ", because during that
 * 250 ms they legitimately differ.
 */
function useConditionValueDraft(committed: string, onCommit: (value: string) => void): [string, (value: string) => void] {
  const [draft, setDraft] = useState(committed)
  const [pending, setPending] = useState(false)

  // Catch up on anything that arrived from OUTSIDE this control — Back, Forward,
  // a shared link, `Clear all`, a URL edit — while nothing of ours is in flight.
  useEffect(() => {
    if (!pending) {
      setDraft(committed)
    }
  }, [committed, pending])

  // Our own write landed. Dropping the flag is what hands the display back to
  // the committed value instead of leaving two sources of truth in step.
  useEffect(() => {
    if (pending && committed === draft) {
      setPending(false)
    }
  }, [committed, draft, pending])

  return [
    draft,
    (next: string) => {
      setDraft(next)
      setPending(true)
      // Committed on EVERY keystroke, not on Enter. The debounce downstream is
      // what stops that being a router call per character; there was no reason
      // to make Enter the trigger as well.
      onCommit(next)
    },
  ]
}

/**
 * The value control, rendered from the operator's declared `valueShape` rather
 * than from a switch on operator ids — so an operator that changes its shape
 * changes its control without anyone remembering to update a second place.
 *
 * Keyed by `columnId:operator` by its caller. That remount is deliberate: it is
 * how a field or operator change discards a draft that belonged to the previous
 * shape, rather than leaving a half-typed number sitting in a field that now
 * holds a date.
 */
function FilterValueControl({
  condition,
  field,
  fieldType,
  takesValue,
  invalid,
  onCommit,
}: FilterValueControlProps) {
  const operator = filterOperatorsFor(fieldType).find((entry) => entry.id === condition.operator)
  const shape = operator?.valueShape ?? "text"
  const [draft, commitDraft] = useConditionValueDraft(editableText(condition), (value) => {
    onCommit(value)
  })

  if (!takesValue || shape === "none") {
    return (
      <Input
        value=""
        disabled
        aria-disabled="true"
        aria-label="No value applies to this operator"
        data-grid-filter-value-disabled=""
        readOnly
        className={`${CONTROL} ${SLOT_VALUE} shrink-0 cursor-not-allowed bg-muted`}
      />
    )
  }

  if (shape === "boolean") {
    const checked = condition.value === "true"

    return (
      <div className={`${CONTROL} flex ${SLOT_VALUE} shrink-0 items-center gap-2`}>
        <Checkbox
          checked={checked}
          aria-label={`${field?.label ?? "Value"} is true`}
          onCheckedChange={(value) => {
            onCommit(value === true ? "true" : "false")
          }}
        />
        <span className="text-muted-foreground text-[12px]">{checked ? "Yes" : "No"}</span>
      </div>
    )
  }

  if (shape === "option-list") {
    return (
      <Select
        value={Array.isArray(condition.value) ? (condition.value[0] ?? "") : condition.value}
        onValueChange={(value) => {
          onCommit(value)
        }}
      >
        <SelectTrigger
          aria-label={`${field?.label ?? "Value"} value`}
          data-grid-filter-value=""
          className={`${TRIGGER} ${SLOT_FIELD} shrink-0`}
        >
          <SelectValue placeholder="Choose a value" />
        </SelectTrigger>
        <SelectContent>
          {(field?.options ?? []).map((option) => (
            <SelectItem key={option} value={option} className="text-[13px]">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (shape === "multi-option-list") {
    return (
      <GridFilterMultiSelectControl
        value={Array.isArray(condition.value) ? condition.value : []}
        options={field?.options ?? []}
        invalid={invalid}
        label={field?.label ?? "Value"}
        className={`${CONTROL} ${SLOT_VALUE} shrink-0 ${invalid ? "border-destructive" : ""}`}
        onCommit={(value) => {
          onCommit(value)
        }}
      />
    )
  }

if (shape === "date" || shape === "date-range") {
    // A calendar, not a text field: the operator picks a day and the ISO string
    // is derived from it. An unparseable value is still possible — it can arrive
    // in a shared URL — so `invalid` is passed through to `aria-invalid` rather
    // than being treated as unreachable.
    return (
      <GridFilterDateControl
        value={editableText(condition)}
        range={shape === "date-range"}
        invalid={invalid}
        label={field?.label ?? "Value"}
        className={`${CONTROL} ${SLOT_VALUE} shrink-0 ${invalid ? "border-destructive" : ""}`}
        onCommit={(value) => {
          onCommit(value)
        }}
      />
    )
  }

  // `numeric` is only a keypad hint. Free text rather than `type="number"`,
  // because `type="number"` silently discards a value it cannot parse, and a
  // filter that discards what was typed gives no indication why it stopped
  // filtering.
  const inputMode = shape === "number" ? "numeric" : undefined

  return (
    <Input
      value={draft}
      onChange={(event) => {
        commitDraft(event.target.value)
      }}
      inputMode={inputMode}
      aria-label={`${field?.label ?? "Value"} value`}
      aria-invalid={invalid || undefined}
      aria-disabled={!takesValue || undefined}
      placeholder="Enter a value"
      data-grid-filter-value=""
      className={`${CONTROL} ${SLOT_VALUE} shrink-0 ${invalid ? "border-destructive" : ""}`}
    />
  )
}