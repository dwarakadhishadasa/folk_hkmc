/**
 * The filter operator registry (CAP-12): what operators a field type offers,
 * what value each one takes, and how a condition is encoded, decoded and
 * evaluated.
 *
 * Pure and React-free — no `"use client"`, no runtime imports — so the URL codec
 * and the table can both read it without pulling React into a server component.
 *
 * Three decisions live here and are not obvious from the shape alone:
 *
 * 1. **Keyed by `meta.grid.fieldType`, not by a second meta key.** `fieldType`
 *    already answers "what does this cell hold" for every column, so the registry
 *    reads it rather than asking columns to declare the same fact twice in two
 *    keys that can disagree.
 *
 * 2. **The operator travels inside the serialized value**, so `f.name=contains:eu`
 *    distinguishes `contains` from `is`, and `f.notes=isEmpty:` is a non-empty
 *    token carrying an empty value — which is what makes an empty value survive
 *    a URL round trip at all. The operator is the segment before the FIRST `:`,
 *    so a value containing `:` needs no escaping.
 *
 * 3. **A value that cannot be parsed matches NO rows.** A NaN number or an
 *    unparseable date compared with `>=` is `false` for every row, which looks
 *    identical to "nothing matched" and produces no error and no failing test.
 *    `isConditionValueInvalid` is the explicit branch that keeps that failure
 *    visible in the UI instead.
 */

import type { GridFieldType } from "@/components/grid/grid-types"

/**
 * What a condition row's value control renders, declared per operator so the row
 * is built from the declaration rather than from a switch on operator ids.
 *
 * `none` is the one that matters most: `is empty` and `is not empty` take no
 * value, and their control is rendered DISABLED rather than absent, so the
 * operator can see it is not applicable rather than wondering where it went.
 */
export type GridFilterValueShape =
  | "none"
  | "text"
  | "number"
  | "boolean"
  | "option-list"
  | "multi-option-list"
  | "date"
  | "date-range"

export interface GridFilterOperator {
  /** Stable, URL-safe. Appears in the serialized token and must never be reworded. */
  id: string
  label: string
  valueShape: GridFilterValueShape
}

/**
 * One condition. `columnId` is the identity — there is at most one condition per
 * column, which is why `f.<colId>` is a single param and not a list.
 */
export interface GridFilterCondition {
  columnId: string
  operator: string
  /** A list only for `anyOf` / `noneOf`; a string everywhere else, including booleans. */
  value: string | string[]
}

/** Whether conditions AND across columns or OR across them. Never per row. */
export type GridFilterConnective = "all" | "any"

const NO_VALUE_OPERATORS = { isEmpty: "is empty", isNotEmpty: "is not empty" } as const

const TEXT_OPERATORS: readonly GridFilterOperator[] = [
  { id: "contains", label: "contains", valueShape: "text" },
  { id: "notContains", label: "does not contain", valueShape: "text" },
  { id: "is", label: "is", valueShape: "text" },
  { id: "isNot", label: "is not", valueShape: "text" },
  { id: "isEmpty", label: NO_VALUE_OPERATORS.isEmpty, valueShape: "none" },
  { id: "isNotEmpty", label: NO_VALUE_OPERATORS.isNotEmpty, valueShape: "none" },
]

/**
 * The inclusive comparisons are here so a legacy `f.totalAttendanceCount=5` has an
 * operator to mean what it always meant — see `legacyOperatorFor`.
 */
const NUMBER_OPERATORS: readonly GridFilterOperator[] = [
  { id: "is", label: "=", valueShape: "number" },
  { id: "isNot", label: "≠", valueShape: "number" },
  { id: "gt", label: ">", valueShape: "number" },
  { id: "lt", label: "<", valueShape: "number" },
  { id: "gte", label: "≥", valueShape: "number" },
  { id: "lte", label: "≤", valueShape: "number" },
  { id: "isEmpty", label: NO_VALUE_OPERATORS.isEmpty, valueShape: "none" },
  { id: "isNotEmpty", label: NO_VALUE_OPERATORS.isNotEmpty, valueShape: "none" },
]

const DATE_OPERATORS: readonly GridFilterOperator[] = [
  { id: "is", label: "is", valueShape: "date" },
  { id: "isNot", label: "is not", valueShape: "date" },
  { id: "within", label: "is within", valueShape: "date-range" },
  { id: "after", label: "is after", valueShape: "date" },
  { id: "before", label: "is before", valueShape: "date" },
  { id: "onOrBefore", label: "is on or before", valueShape: "date" },
  { id: "onOrAfter", label: "is on or after", valueShape: "date" },
  { id: "isEmpty", label: NO_VALUE_OPERATORS.isEmpty, valueShape: "none" },
  { id: "isNotEmpty", label: NO_VALUE_OPERATORS.isNotEmpty, valueShape: "none" },
]

/** One entry, shown rather than hidden — a uniform control beats a special case. */
const BOOLEAN_OPERATORS: readonly GridFilterOperator[] = [
  { id: "is", label: "is", valueShape: "boolean" },
]

const CHOICE_OPERATORS: readonly GridFilterOperator[] = [
  { id: "is", label: "is", valueShape: "option-list" },
  { id: "isNot", label: "is not", valueShape: "option-list" },
  { id: "anyOf", label: "is any of", valueShape: "multi-option-list" },
  { id: "noneOf", label: "is none of", valueShape: "multi-option-list" },
  { id: "isEmpty", label: NO_VALUE_OPERATORS.isEmpty, valueShape: "none" },
  { id: "isNotEmpty", label: NO_VALUE_OPERATORS.isNotEmpty, valueShape: "none" },
]

/**
 * The registry. `linked` and `longtext` share the text set deliberately: a linked
 * cell holds a resolved label, not an id, so it filters as the text it displays.
 */
export const GRID_FILTER_OPERATORS_BY_FIELD_TYPE: Record<
  GridFieldType,
  readonly GridFilterOperator[]
> = {
  text: TEXT_OPERATORS,
  longtext: TEXT_OPERATORS,
  linked: TEXT_OPERATORS,
  number: NUMBER_OPERATORS,
  date: DATE_OPERATORS,
  boolean: BOOLEAN_OPERATORS,
  select: CHOICE_OPERATORS,
  multiselect: CHOICE_OPERATORS,
}

/** Every operator id across every field type — the codec's vocabulary. */
const OPERATOR_IDS: ReadonlySet<string> = new Set(
  Object.values(GRID_FILTER_OPERATORS_BY_FIELD_TYPE).flatMap((operators) =>
    operators.map((operator) => operator.id),
  ),
)

/**
 * The operators whose value is a list. Declared once here rather than read off a
 * field type, so `decodeCondition` can round-trip a value without being handed
 * the column's type — the URL codec parses before it knows any column metadata.
 */
const LIST_OPERATORS: ReadonlySet<string> = new Set(["anyOf", "noneOf"])

export function filterOperatorsFor(fieldType: GridFieldType | undefined): readonly GridFilterOperator[] {
  return fieldType ? GRID_FILTER_OPERATORS_BY_FIELD_TYPE[fieldType] : TEXT_OPERATORS
}

export function findFilterOperator(
  fieldType: GridFieldType | undefined,
  operatorId: string,
): GridFilterOperator | undefined {
  return filterOperatorsFor(fieldType).find((operator) => operator.id === operatorId)
}

/**
 * The operator a bare, operator-less URL token is read as.
 *
 * Such tokens predate this story and are still in shared links. `contains` is
 * what `gridGlobalFilterFn` did to them. `gte` is what `gridNumberFilterFn` did
 * to them — it compared `numeric >= threshold`, so mapping a legacy number to the
 * first operator of its set (`is`) would silently turn "5 or more" into "exactly
 * 5" with nothing to show for it.
 */
export function legacyOperatorFor(fieldType: GridFieldType | undefined): string {
  if (fieldType === "number") {
    return "gte"
  }

  // Otherwise the type's first operator that actually takes a value. It must be
  // one THIS type offers: a bare `contains` on a select column decodes to an
  // operator that column does not have, which `findFilterOperator` then fails to
  // resolve, and the condition silently matches nothing at all — a filter that
  // looks applied and filters everything out.
  const first = filterOperatorsFor(fieldType).find((operator) => operator.valueShape !== "none")

  return first?.id ?? "contains"
}

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

const OPERATOR_SEPARATOR = ":"
const LIST_SEPARATOR = "|"
const LIST_ESCAPE = "\\"

function escapeListEntry(entry: string): string {
  return entry.split(LIST_ESCAPE).join(LIST_ESCAPE + LIST_ESCAPE).split(LIST_SEPARATOR).join(LIST_ESCAPE + LIST_SEPARATOR)
}

function unescapeListEntry(entry: string): string {
  let out = ""
  for (let index = 0; index < entry.length; index += 1) {
    const char = entry[index]

    if (char === LIST_ESCAPE && index + 1 < entry.length) {
      out += entry[index + 1]
      index += 1
      continue
    }

    out += char
  }

  return out
}

function splitList(raw: string): string[] {
  const entries: string[] = []
  let current = ""

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]

    if (char === LIST_ESCAPE && index + 1 < raw.length) {
      current += char + raw[index + 1]
      index += 1
      continue
    }

    if (char === LIST_SEPARATOR) {
      entries.push(unescapeListEntry(current))
      current = ""
      continue
    }

    current += char
  }

  entries.push(unescapeListEntry(current))

  return entries.filter((entry) => entry.length > 0)
}

/** Renders a condition as its URL token. The token is never empty when a condition exists. */
export function encodeCondition(condition: GridFilterCondition): string {
  const raw = Array.isArray(condition.value)
    ? condition.value.map(escapeListEntry).join(LIST_SEPARATOR)
    : escapeListEntry(condition.value)

  return `${condition.operator}${OPERATOR_SEPARATOR}${raw}`
}

/**
 * Reads a URL token back into a condition.
 *
 * A token whose leading segment is not a known operator id is a LEGACY
 * operator-less value, so the whole token is the value — which is also why
 * `call: 9900` does not become an operator called `call`.
 *
 * Returns `null` only when the token cannot name a condition at all: an empty
 * token, or an empty list for `anyOf`.
 *
 * A `none`-shape operator (`isEmpty:`) is never an empty token and always
 * decodes — that is the whole point of the operator travelling inside the value,
 * and it is what makes an empty value round-trip.
 *
 * A value-taking operator with an empty value DOES decode. `+ Add condition`
 * produces exactly that, and dropping it would make a row vanish the moment it
 * was added and before a character was typed. It is inert rather than valid: it
 * matches every row until it has a value, which is what "the count updates live
 * as conditions are composed" requires.
 */
export function decodeCondition(raw: string, columnId: string, fieldType?: GridFieldType): GridFilterCondition | null {
  if (raw.length === 0) {
    return null
  }

  const separator = raw.indexOf(OPERATOR_SEPARATOR)
  const head = separator === -1 ? "" : raw.slice(0, separator)

  if (separator === -1 || !OPERATOR_IDS.has(head)) {
    const operator = legacyOperatorFor(fieldType)

    return raw.length > 0 ? { columnId, operator, value: raw } : null
  }

  const rest = raw.slice(separator + 1)

  if (LIST_OPERATORS.has(head)) {
    const value = splitList(rest)

    return value.length > 0 ? { columnId, operator: head, value } : null
  }

  return { columnId, operator: head, value: unescapeListEntry(rest) }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` to a comparable epoch day, or `null` when it is not a real date. */
function toEpochDay(value: string): number | null {
  const trimmed = value.trim()

  if (!ISO_DATE.test(trimmed)) {
    return null
  }

  const [year, month, day] = trimmed.split("-").map((part) => Number(part))
  const stamp = Date.UTC(year, month - 1, day)

  // Round-trips only for a real calendar day, which rejects 2026-02-31 the same
  // way the date editor's own parser does.
  const parsed = new Date(stamp)

  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null
  }

  return stamp
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }

  if (Array.isArray(value)) {
    return value.length === 0
  }

  return String(value).trim().length === 0
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  const trimmed = String(value ?? "").trim()

  if (trimmed.length === 0) {
    return null
  }

  const parsed = Number(trimmed)

  return Number.isFinite(parsed) ? parsed : null
}

/** `true` / `false` as the string a URL param and a checkbox both speak. */
function toBooleanString(value: unknown): string {
  return value === true || value === "true" ? "true" : "false"
}

/** ISO date strings compare correctly lexicographically; kept explicit anyway. */
function compareIsoDate(cell: unknown, boundary: string): number {
  const left = toEpochDay(String(cell ?? "").trim())
  const right = toEpochDay(boundary)

  if (left === null || right === null) {
    return Number.NaN
  }

  return left === right ? 0 : left < right ? -1 : 1
}

function stringEntries(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim().toLowerCase())
  }

  const single = String(value ?? "").trim().toLowerCase()

  return single.length > 0 ? [single] : []
}

function matchesText(cell: unknown, raw: string, exact: boolean): boolean {
  const needle = raw.trim().toLowerCase()

  if (needle.length === 0) {
    return false
  }

  if (Array.isArray(cell)) {
    const hit = cell.some((entry) => {
      const candidate = String(entry ?? "").trim().toLowerCase()

      return exact ? candidate === needle : candidate.includes(needle)
    })

    return hit
  }

  const candidate = String(cell ?? "").trim().toLowerCase()

  return exact ? candidate === needle : candidate.includes(needle)
}

/**
 * Whether a condition's own value is unusable. The UI shows this on the condition
 * row; `evaluateCondition` treats such a condition as matching nothing.
 */
export function isConditionValueInvalid(
  condition: GridFilterCondition,
  fieldType: GridFieldType | undefined,
): boolean {
  const operator = findFilterOperator(fieldType, condition.operator)

  if (!operator) {
    return true
  }

  const raw = Array.isArray(condition.value) ? "" : condition.value

  // An empty value is a condition that has not been filled in yet, not a broken
  // one. It is inert — it matches everything — so calling it invalid would paint
  // `aria-invalid` on a row the operator is halfway through typing.
  if (operator.valueShape !== "none" && raw.trim().length === 0) {
    const empty = operator.valueShape === "multi-option-list" ? condition.value : []

    if (!Array.isArray(empty) || empty.length === 0) {
      return false
    }
  }

  switch (operator.valueShape) {
    case "none":
      return false
    case "number":
      return toNumber(condition.value) === null
    case "date":
      return toEpochDay(raw) === null
    case "date-range": {
      const parts = Array.isArray(condition.value) ? [] : condition.value.split("..")

      return parts.length !== 2 || toEpochDay(parts[0]) === null || toEpochDay(parts[1]) === null
    }
    case "boolean":
      return raw !== "true" && raw !== "false"
    default:
      return Array.isArray(condition.value) && condition.value.length === 0
  }
}

/**
 * Whether one row satisfies one condition.
 *
 * A condition with an unusable value matches nothing, and a null cell is
 * EXCLUDED by every value-taking operator rather than compared — an absent date
 * compared against a boundary is the silent drop that surfaces months later.
 */
export function evaluateCondition(
  cellValue: unknown,
  condition: GridFilterCondition,
  fieldType: GridFieldType | undefined,
): boolean {
  if (isConditionValueInvalid(condition, fieldType)) {
    return false
  }

  const operator = findFilterOperator(fieldType, condition.operator)

  if (!operator) {
    return false
  }

  if (operator.id === "isEmpty") {
    return isBlank(cellValue)
  }

  if (operator.id === "isNotEmpty") {
    return !isBlank(cellValue)
  }

  const raw = Array.isArray(condition.value) ? condition.value[0] ?? "" : condition.value

  // A condition that has not been given a value yet filters nothing: it passes
  // every row, so a half-typed condition narrows the view only once it can.
  if (raw.trim().length === 0) {
    return true
  }

  switch (fieldType) {
    case "number": {
      const threshold = toNumber(raw)
      const cell = toNumber(cellValue)

      if (threshold === null || cell === null) {
        return false
      }

      switch (operator.id) {
        case "is":
          return cell === threshold
        case "isNot":
          return cell !== threshold
        case "gt":
          return cell > threshold
        case "lt":
          return cell < threshold
        case "gte":
          return cell >= threshold
        case "lte":
          return cell <= threshold
        default:
          return false
      }
    }

    case "date": {
      if (operator.valueShape === "date-range") {
        const parts = Array.isArray(condition.value) ? [] : condition.value.split("..")

        if (parts.length !== 2) {
          return false
        }

        const start = compareIsoDate(cellValue, parts[0])
        const end = compareIsoDate(cellValue, parts[1])

        return !Number.isNaN(start) && !Number.isNaN(end) && start >= 0 && end <= 0
      }

      const order = compareIsoDate(cellValue, raw)

      if (Number.isNaN(order)) {
        return false
      }

      switch (operator.id) {
        case "is":
          return order === 0
        case "isNot":
          return order !== 0
        case "after":
          return order > 0
        case "before":
          return order < 0
        case "onOrAfter":
          return order >= 0
        case "onOrBefore":
          return order <= 0
        default:
          return false
      }
    }

    case "boolean":
      return toBooleanString(cellValue) === raw

    case "select": {
      const cell = String(cellValue ?? "").trim().toLowerCase()
      const needle = raw.trim().toLowerCase()
      const wanted = Array.isArray(condition.value) ? condition.value : [raw]

      if (operator.valueShape === "multi-option-list") {
        // Intersection by exact element membership. The substring-per-element
        // behaviour this replaces made "EC" match "ECE".
        const hit = cell.length > 0 && wanted.some((entry) => entry.trim().toLowerCase() === cell)

        return operator.id === "noneOf" ? !hit : hit
      }

      return operator.id === "isNot" ? cell !== needle : cell === needle
    }

    case "multiselect": {
      const cell = stringEntries(cellValue)
      const wanted = stringEntries(condition.value)

      if (operator.valueShape === "multi-option-list") {
        const hit = cell.some((entry) => wanted.includes(entry))

        return operator.id === "noneOf" ? !hit : hit
      }

      if (wanted.length === 0) {
        return false
      }

      const every = cell.length === wanted.length && wanted.every((entry) => cell.includes(entry))

      return operator.id === "isNot" ? !every : every
    }

    default: {
      const hit = matchesText(cellValue, raw, operator.id === "is" || operator.id === "isNot")

      return operator.id === "notContains" || operator.id === "isNot" ? !hit : hit
    }
  }
}

/**
 * A condition with no value yet, for a freshly added row: the type's first
 * operator and an empty value — never a leftover operator from another type.
 */
export function emptyCondition(columnId: string, fieldType: GridFieldType | undefined): GridFilterCondition {
  const [first] = filterOperatorsFor(fieldType)
  const shape = first?.valueShape ?? "text"

  return {
    columnId,
    operator: first?.id ?? "contains",
    value: shape === "multi-option-list" || shape === "option-list" ? [] : "",
  }
}