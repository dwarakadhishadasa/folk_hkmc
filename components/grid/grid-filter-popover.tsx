"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
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
  filterOperatorsFor,
  isConditionValueInvalid,
  type GridFilterCondition,
  type GridFilterConnective,
} from "@/components/grid/grid-filter-operators"
import { GridFilterDateControl } from "@/components/grid/grid-filter-value"
import type { GridFieldType } from "@/components/grid/grid-types"

/** One column the popover can name, with whatever its value control needs. */
export interface GridFilterField {
  id: string
  label: string
  fieldType: GridFieldType
  /** Option labels for a select or multiselect value control. */
  options?: readonly string[]
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

  const replace = (next: GridFilterCondition) => {
    onConditionsChange(
      conditions.map((condition) =>
        condition.columnId === next.columnId ? next : condition,
      ),
    )
  }

  const addCondition = () => {
    const taken = new Set(conditions.map((condition) => condition.columnId))
    const next = fields.find((field) => !taken.has(field.id))

    if (!next) {
      return
    }

    onConditionsChange([...conditions, emptyCondition(next.id, next.fieldType)])
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
        {/* The rule BELOW the header belongs to the header. It used to sit on the
         * conditions list instead, which drew a second rule immediately below it
         * once the footer added its own — two hairlines under the conditions
         * where the composition has one above and one below. */}
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
              onOpenChange(false)
            }}
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-2.5" data-grid-filter-conditions="">
          {conditions.map((condition, index) => {
            const field = fieldById.get(condition.columnId)
            const fieldType = field?.fieldType
            const operators = filterOperatorsFor(fieldType)
            const operator = operators.find((entry) => entry.id === condition.operator)
            const takesValue = operator?.valueShape !== "none"
            const invalid = isConditionValueInvalid(condition, fieldType)

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
                  <Select value={connective} onValueChange={(value) => onConnectiveChange(value as GridFilterConnective)}>
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
                    onConditionsChange(
                      conditions.map((entry) =>
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
                    {fields.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id} className="text-[13px]">
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
                    onConditionsChange(conditions.filter((entry) => entry.columnId !== condition.columnId))
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </Button>
              </div>
            )
          })}
        </div>

        <div className="border-border mt-3 flex items-center justify-between border-t pt-3" data-grid-filter-footer="">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-royal h-7 gap-1 px-0 text-[12px] font-medium hover:underline"
            onClick={addCondition}
          >
            <Plus aria-hidden="true" className="size-3.5 font-semibold" />
            Add condition
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-7 px-0 text-[12px] font-normal"
            onClick={() => {
              onConditionsChange([])
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
    const selected = new Set(Array.isArray(condition.value) ? condition.value : [])

    // A multi-selectable option list, rendered inline. Membership is EXACT:
    // substring-per-element matching is what made "EC" match "ECE".
    return (
      <div
        className={`${CONTROL} ${SLOT_VALUE} shrink-0 overflow-y-auto py-1`}
        role="group"
        aria-label={`${field?.label ?? "Value"} values`}
      >
        {(field?.options ?? []).map((option) => {
          const checked = selected.has(option)

          return (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[12px]"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => {
                  const next = new Set(selected)

                  if (value === true) {
                    next.add(option)
                  } else {
                    next.delete(option)
                  }

                  onCommit([...next])
                }}
              />
              <span className="truncate">{option}</span>
            </label>
          )
        })}
      </div>
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