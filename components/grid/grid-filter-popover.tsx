"use client"

import { useState } from "react"
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
  const [draft, setDraft] = useState<Record<string, string>>({})
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
        <div className="text-muted-foreground flex items-center justify-between pb-3 text-[12px] font-medium">
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

        <div className="border-border mb-3 space-y-2.5 border-b">
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
                  condition={condition}
                  field={field}
                  fieldType={fieldType}
                  takesValue={takesValue}
                  invalid={invalid}
                  draft={draft[condition.columnId] ?? ""}
                  onDraftChange={(value) => {
                    setDraft((current) => ({ ...current, [condition.columnId]: value }))
                  }}
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

        <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
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
  draft: string
  onDraftChange: (value: string) => void
  onCommit: (value: string | string[]) => void
}

/**
 * The value control, rendered from the operator's declared `valueShape` rather
 * than from a switch on operator ids — so an operator that changes its shape
 * changes its control without anyone remembering to update a second place.
 */
function FilterValueControl({
  condition,
  field,
  fieldType,
  takesValue,
  invalid,
  draft,
  onDraftChange,
  onCommit,
}: FilterValueControlProps) {
  const operator = filterOperatorsFor(fieldType).find((entry) => entry.id === condition.operator)
  const shape = operator?.valueShape ?? "text"

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

// Free text, not `type="date"`: the serialized form IS the ISO string, and a
  // native date input would hide it behind a locale-formatted value the operator
  // cannot see is what actually filters. `numeric` is only a keypad hint.
  const inputMode = shape === "number" ? "numeric" : undefined

  return (
    <Input
      value={draft}
      onChange={(event) => {
        onDraftChange(event.target.value)
      }}
      // The draft is authoritative while the field has focus and reconciled on
      // blur, so a keystroke inside the URL write's debounce window is not lost.
      onFocus={() => {
        onDraftChange(String(Array.isArray(condition.value) ? condition.value[0] ?? "" : condition.value))
      }}
      onBlur={() => {
        onDraftChange("")
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onCommit(draft)
        }
      }}
      inputMode={inputMode}
      aria-label={`${field?.label ?? "Value"} value`}
      aria-invalid={invalid || undefined}
      aria-disabled={!takesValue || undefined}
      placeholder={shape === "date-range" ? "2026-01-01..2026-01-31" : "Enter a value"}
      data-grid-filter-value=""
      className={`${CONTROL} ${SLOT_VALUE} shrink-0 ${invalid ? "border-destructive" : ""}`}
    />
  )
}