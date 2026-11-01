/**
 * One definition per number.
 *
 * Every figure on the Contacts section's Overview and Reports is computed here
 * and nowhere else. Pages render this module's output; a component that did its
 * own counting would be a second definition, and the two would drift the first
 * time a window or a denominator changed.
 *
 * Pure and React-free: no `"use client"`, no server imports, no `Date.now()`.
 * The caller passes `today` (the programme day, `YYYY-MM-DD`), which is what
 * makes every window boundary testable and keeps a shared test fixture from
 * depending on the wall clock.
 *
 * The definitions themselves are in
 * `_bmad-output/specs/spec-contacts-section/metrics.md`.
 */

export interface MetricContact {
  id: string
  phone: string
  source: string | null
  initialContact: string | null
  locationIds: readonly string[]
  collectedById: string | null
  totalAttendanceCount: number
  past60DayAttendanceCount: number
}

export interface MetricLocation {
  id: string
  name: string
}

export type MetricPeriod = "last30" | "last90" | "last12" | "all"

export const METRIC_PERIODS: readonly MetricPeriod[] = ["last30", "last90", "last12", "all"] as const

export const DEFAULT_METRIC_PERIOD: MetricPeriod = "last90"

export const METRIC_PERIOD_LABEL: Record<MetricPeriod, string> = {
  last30: "Last 30 days",
  last90: "Last 90 days",
  last12: "Last 12 months",
  all: "All time",
}

export function parseMetricPeriod(value: unknown): MetricPeriod {
  return (METRIC_PERIODS as readonly string[]).includes(value as string)
    ? (value as MetricPeriod)
    : DEFAULT_METRIC_PERIOD
}

/** One grid filter condition, in the token grammar the grid's URL codec reads. */
export interface MetricFilter {
  columnId: string
  operator: string
  value: string
}

/** The grid route every figure links into. */
export const CONTACTS_GRID_PATH = "/contacts/grid"

/**
 * A link into the grid filtered to exactly one figure's row set.
 *
 * The operator travels inside the value (`within:2026-09-01..2026-09-30`), so
 * the boundary a figure resolved is what the link carries, never a period
 * symbol whose meaning moves with the clock.
 */
export function gridFilterHref(filters: readonly MetricFilter[]): string {
  const params = new URLSearchParams()

  for (const filter of filters) {
    params.set(`f.${filter.columnId}`, `${filter.operator}:${filter.value}`)
  }

  const query = params.toString()

  return query.length > 0 ? `${CONTACTS_GRID_PATH}?${query}` : CONTACTS_GRID_PATH
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

/** Full month names for the Overview's Month filter. The value is the `YYYY-MM` suffix. */
export const MONTH_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/** The `YYYY-MM-DD` part of a stored date, or `null` when there is not one. */
export function normalizeDay(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }

  const match = DAY_PATTERN.exec(value.trim())

  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

/** `YYYY-MM` of a stored day. The collection date is the only input. */
export function monthKeyOf(value: string | null | undefined): string | null {
  const day = normalizeDay(value)

  return day ? day.slice(0, 7) : null
}

/** Distinct collection years, newest first. The Month/Year filter's year list. */
export function contactYears(contacts: readonly MetricContact[]): string[] {
  const years = new Set<string>()

  for (const contact of contacts) {
    const day = normalizeDay(contact.initialContact)

    if (day) {
      years.add(day.slice(0, 4))
    }
  }

  return [...years].sort((left, right) => right.localeCompare(left))
}

export function monthKeyOfToday(today: string): string {
  return normalizeDay(today)?.slice(0, 7) ?? ""
}

/** `2026-11` shifted by `delta` months, without crossing through a local Date. */
export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number)
  const index = year * 12 + (month - 1) + delta

  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number)

  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The inclusive date range a month covers. */
export function monthRange(monthKey: string): { start: string; end: string } {
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${pad(daysInMonth(monthKey))}`,
  }
}

export function monthLabel(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7))

  return MONTH_SHORT[month - 1] ?? monthKey
}

/** `All time`, `2026`, or `November 2026`. The card's own period statement. */
export function monthYearLabel(year: string | null, month: string | null): string {
  if (!year) {
    return "All time"
  }

  if (!month) {
    return year
  }

  const option = MONTH_OPTIONS.find((entry) => entry.value === month)

  return option ? `${option.label} ${year}` : year
}

/** The month keys a window ends on, oldest first, ending at `today`'s month. */
export function monthsEndingAt(today: string, count: number): string[] {
  const current = monthKeyOfToday(today)
  const keys: string[] = []

  for (let index = count - 1; index >= 0; index -= 1) {
    keys.push(shiftMonth(current, -index))
  }

  return keys
}

/** A day-shifted `YYYY-MM-DD`. UTC arithmetic so no timezone can move it. */
export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, date + delta))

  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export interface PeriodWindow {
  start: string
  end: string
}

/**
 * The selected period's resolved boundaries.
 *
 * `all` is the *absence* of a window, not a very large one: it includes rows
 * with no stored collection date, which the three dated periods exclude.
 */
export function periodWindow(period: MetricPeriod, today: string): PeriodWindow | null {
  const day = normalizeDay(today)

  if (!day) {
    return null
  }

  switch (period) {
    case "last30":
      return { start: shiftDay(day, -29), end: day }
    case "last90":
      return { start: shiftDay(day, -89), end: day }
    case "last12": {
      const startMonth = shiftMonth(monthKeyOfToday(day), -11)

      return { start: `${startMonth}-01`, end: day }
    }
    case "all":
      return null
  }
}

function inWindow(contact: MetricContact, window: PeriodWindow | null): boolean {
  if (!window) {
    return true
  }

  const day = normalizeDay(contact.initialContact)

  return day !== null && day >= window.start && day <= window.end
}

/**
 * The boundary a Month/Year filter means.
 *
 * A month is a real range, not a symbol whose meaning moves with the clock. A
 * year without a month is the whole calendar year; neither selection is the
 * absence of a window.
 */
export function monthYearWindow(year: string | null, month: string | null): PeriodWindow | null {
  if (!year) {
    return null
  }

  if (month) {
    return monthRange(`${year}-${month}`)
  }

  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

/** The contacts collected in a selected year, and optionally a selected month. */
export function contactsInMonthYear(
  contacts: readonly MetricContact[],
  year: string | null,
  month: string | null,
): MetricContact[] {
  const window = monthYearWindow(year, month)

  return window ? contacts.filter((contact) => inWindow(contact, window)) : [...contacts]
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

function share(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0
}

function firstLocationId(contact: MetricContact): string | null {
  for (const id of contact.locationIds) {
    if (typeof id === "string" && id.trim().length > 0) {
      return id
    }
  }

  return null
}

function hasLocation(contact: MetricContact): boolean {
  return firstLocationId(contact) !== null
}

function hasPhone(contact: MetricContact): boolean {
  return contact.phone.trim().length > 0
}

function hasCollector(contact: MetricContact): boolean {
  return typeof contact.collectedById === "string" && contact.collectedById.trim().length > 0
}

export function countNeverAttended(contacts: readonly MetricContact[]): number {
  return contacts.filter((contact) => contact.totalAttendanceCount === 0).length
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface OverviewMonthRow {
  key: string
  label: string
  count: number
  current: boolean
  href: string
}

export interface OverviewSourceRow {
  key: string
  label: string
  count: number
  href: string
}

export interface OverviewLocationRow {
  kind: "resolved" | "none" | "unknown"
  label: string
  count: number
  percentage: number
  href: string
}

export interface OverviewEngagementRow {
  key: "attended" | "attended60" | "attended3"
  label: string
  count: number
  caption: string
  href: string
}

export interface OverviewMetrics {
  total: number
  locationsHeld: number
  newThisMonth: number
  lastMonth: number
  newThisMonthDelta: number
  activeIn60Days: number
  activeIn60DaysPercentage: number
  activeIn60DaysHref: string
  neverAttended: number
  neverAttendedPercentage: number
  neverAttendedHref: string
  noLocation: number
  noLocationPercentage: number
  noLocationHref: string
  months: { rows: OverviewMonthRow[]; empty: boolean }
  sources: { rows: OverviewSourceRow[]; more: number }
  locations: { rows: OverviewLocationRow[]; more: number }
  engagement: OverviewEngagementRow[]
}

/**
 * The display name of a stored `contacts.source` value.
 *
 * The write paths store the human label already (`Public Registration`,
 * `Attendance Registration`); two of those want sentence case in the report,
 * and a value nobody mapped is shown as it was stored rather than hidden.
 * `""` is not a source at all — it is the **Not recorded** row.
 */
export const SOURCE_DISPLAY_LABEL: Readonly<Record<string, string>> = {
  "Public Registration": "Public registration",
  "Attendance Registration": "Attendance registration",
  "Follow-up of a friend": "Follow-up of a friend",
  "Pass Distribution": "Pass distribution",
  "Pass distribution": "Pass distribution",
  Old: "Old",
}

export const NOT_RECORDED_LABEL = "Not recorded"

function sourceLabel(raw: string): string {
  return SOURCE_DISPLAY_LABEL[raw] ?? raw
}

export function buildOverviewMetrics(input: {
  contacts: readonly MetricContact[]
  locationNameById: ReadonlyMap<string, string>
  today: string
  /** The Month/Year boundary a filtered card is showing, when there is one. */
  window?: PeriodWindow | null
}): OverviewMetrics {
  const { contacts, locationNameById, today } = input
  const total = contacts.length
  const currentMonth = monthKeyOfToday(today)
  const lastMonthKey = shiftMonth(currentMonth, -1)

  let newThisMonth = 0
  let lastMonth = 0
  let activeIn60Days = 0
  let neverAttended = 0
  let noLocation = 0
  const heldLocations = new Set<string>()

  for (const contact of contacts) {
    const month = monthKeyOf(contact.initialContact)

    if (month === currentMonth) {
      newThisMonth += 1
    } else if (month === lastMonthKey) {
      lastMonth += 1
    }

    if (contact.past60DayAttendanceCount > 0) {
      activeIn60Days += 1
    }

    if (contact.totalAttendanceCount === 0) {
      neverAttended += 1
    }

    if (!hasLocation(contact)) {
      noLocation += 1
    } else {
      const id = firstLocationId(contact) as string

      // An id that resolves to no location row is a dangling reference, not a
      // location that holds contacts. The tile's caption counts places, and the
      // dangling row is reported separately by the locations card.
      if (locationNameById.has(id)) {
        heldLocations.add(id)
      }
    }
  }

  const monthKeys = monthsEndingAt(today, 6)
  const monthCounts = new Map<string, number>()

  for (const contact of contacts) {
    const month = monthKeyOf(contact.initialContact)

    if (month && monthKeys.includes(month)) {
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1)
    }
  }

  const months: OverviewMonthRow[] = monthKeys.map((key) => {
    const range = monthRange(key)

    return {
      key,
      label: monthLabel(key),
      count: monthCounts.get(key) ?? 0,
      current: key === currentMonth,
      href: gridFilterHref([
        { columnId: "initialContact", operator: "within", value: `${range.start}..${range.end}` },
      ]),
    }
  })

  const sources = buildSourceRows(contacts)
  const periodFilter: MetricFilter[] = input.window
    ? [
        {
          columnId: "initialContact",
          operator: "within",
          value: `${input.window.start}..${input.window.end}`,
        },
      ]
    : []
  const locations = buildLocationRows(contacts, locationNameById, periodFilter)

  const engagement: OverviewEngagementRow[] = [
    {
      key: "attended",
      label: "Attended a session",
      count: contacts.filter((contact) => contact.totalAttendanceCount > 0).length,
      caption: `${share(
        contacts.filter((contact) => contact.totalAttendanceCount > 0).length,
        total,
      )}% of contacts`,
      href: gridFilterHref([{ columnId: "totalAttendanceCount", operator: "gt", value: "0" }]),
    },
    {
      key: "attended60",
      label: "Attended in the last 60 days",
      count: activeIn60Days,
      caption: `${share(activeIn60Days, total)}% of contacts`,
      href: gridFilterHref([{ columnId: "past60DayAttendanceCount", operator: "gt", value: "0" }]),
    },
    {
      key: "attended3",
      label: "Attended 3+ times",
      count: contacts.filter((contact) => contact.totalAttendanceCount >= 3).length,
      caption: "the committed core",
      href: gridFilterHref([{ columnId: "totalAttendanceCount", operator: "gte", value: "3" }]),
    },
  ]

  return {
    total,
    locationsHeld: heldLocations.size,
    newThisMonth,
    lastMonth,
    newThisMonthDelta: newThisMonth - lastMonth,
    activeIn60Days,
    activeIn60DaysPercentage: share(activeIn60Days, total),
    activeIn60DaysHref: gridFilterHref([
      { columnId: "past60DayAttendanceCount", operator: "gt", value: "0" },
    ]),
    neverAttended,
    neverAttendedPercentage: share(neverAttended, total),
    neverAttendedHref: gridFilterHref([
      { columnId: "totalAttendanceCount", operator: "is", value: "0" },
    ]),
    noLocation,
    noLocationPercentage: share(noLocation, total),
    noLocationHref: gridFilterHref([
      ...periodFilter,
      { columnId: "location", operator: "isEmpty", value: "" },
    ]),
    months: {
      rows: months,
      empty: months.every((row) => row.count === 0),
    },
    sources,
    locations,
    engagement,
  }
}

function buildSourceRows(contacts: readonly MetricContact[]): {
  rows: OverviewSourceRow[]
  more: number
} {
  const counts = new Map<string, number>()

  for (const contact of contacts) {
    const raw = contact.source?.trim() ?? ""

    counts.set(raw, (counts.get(raw) ?? 0) + 1)
  }

  const rows = [...counts.entries()]
    .map(([raw, count]) => ({
      key: raw,
      label: raw.length > 0 ? sourceLabel(raw) : NOT_RECORDED_LABEL,
      count,
      href:
        raw.length > 0
          ? gridFilterHref([{ columnId: "source", operator: "is", value: raw }])
          : gridFilterHref([{ columnId: "source", operator: "isEmpty", value: "" }]),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))

  return { rows: rows.slice(0, 6), more: Math.max(0, rows.length - 6) }
}

function buildLocationRows(
  contacts: readonly MetricContact[],
  locationNameById: ReadonlyMap<string, string>,
  periodFilter: readonly MetricFilter[] = [],
): { rows: OverviewLocationRow[]; more: number } {
  const total = contacts.length
  const resolved = new Map<string, number>()
  let none = 0
  let unknown = 0

  for (const contact of contacts) {
    const id = firstLocationId(contact)

    if (!id) {
      none += 1
      continue
    }

    const name = locationNameById.get(id)

    if (name === undefined) {
      unknown += 1
      continue
    }

    resolved.set(name, (resolved.get(name) ?? 0) + 1)
  }

  const resolvedRows = [...resolved.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map<OverviewLocationRow>(([label, count]) => ({
      kind: "resolved",
      label,
      count,
      percentage: share(count, total),
      href: gridFilterHref([
        ...periodFilter,
        { columnId: "location", operator: "is", value: label },
      ]),
    }))

  const rows: OverviewLocationRow[] = resolvedRows.slice(0, 4)

  rows.push({
    kind: "none",
    label: "No location",
    count: none,
    percentage: share(none, total),
    href: gridFilterHref([
      ...periodFilter,
      { columnId: "location", operator: "isEmpty", value: "" },
    ]),
  })

  rows.push({
    kind: "unknown",
    label: "Unknown location",
    count: unknown,
    percentage: share(unknown, total),
    href: gridFilterHref([
      ...periodFilter,
      { columnId: "location", operator: "is", value: "Unknown location" },
    ]),
  })

  return { rows, more: Math.max(0, resolvedRows.length - 4) }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportFunnelStage {
  key: "collected" | "locationResolved" | "attended" | "active60"
  label: string
  count: number
  /** Absent on `collected` — it is the whole period, so there is no narrower view. */
  href?: string
}

export interface ReportMonthRow {
  key: string
  label: string
  count: number
  current: boolean
  href: string
}

export interface ReportCollectorRow {
  id: string
  name: string
  initials: string
  count: number
  percentage: number
  href: string
}

export interface ReportQualityRow {
  key: "noLocation" | "noPhone" | "noDate" | "neverAttended"
  label: string
  count: number
  action: string
  href: string
}

export interface ReportsMetrics {
  period: MetricPeriod
  periodLabel: string
  window: PeriodWindow | null
  funnel: {
    stages: ReportFunnelStage[]
    empty: boolean
    warning: string | null
  }
  months: {
    rows: ReportMonthRow[]
    empty: boolean
  }
  collectors: {
    rows: ReportCollectorRow[]
    empty: boolean
  }
  quality: {
    rows: ReportQualityRow[]
  }
}

export function initialsFor(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)

  if (words.length === 0) {
    return "?"
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

export function buildReportsMetrics(input: {
  contacts: readonly MetricContact[]
  locationNameById: ReadonlyMap<string, string>
  staffNameById: ReadonlyMap<string, string>
  today: string
  period: MetricPeriod
  /** A Month/Year boundary that overrides the period's own window. */
  window?: PeriodWindow | null
}): ReportsMetrics {
  const { contacts, locationNameById, staffNameById, today, period } = input
  const window = input.window === undefined ? periodWindow(period, today) : input.window
  const periodContacts = contacts.filter((contact) => inWindow(contact, window))
  const collected = periodContacts.length

  const locationResolved = periodContacts.filter((contact) => {
    const id = firstLocationId(contact)

    return id !== null && locationNameById.has(id)
  }).length

  const attended = periodContacts.filter((contact) => contact.totalAttendanceCount > 0).length
  const active60 = periodContacts.filter(
    (contact) => contact.past60DayAttendanceCount > 0,
  ).length

  const months = monthsEndingAt(today, 12)
  const monthCounts = new Map<string, number>()

  /**
   * The date condition every period-scoped link must carry.
   *
   * A funnel stage is `period ∩ stage`, not `stage`: a link that carried only
   * `location is not empty` would land on the whole scope and report a larger
   * number than the card. The boundary is the resolved window, so a shared link
   * does not quietly move with the clock.
   */
  const periodFilter: MetricFilter[] = window
    ? [
        {
          columnId: "initialContact",
          operator: "within",
          value: `${window.start}..${window.end}`,
        },
      ]
    : []

  for (const contact of contacts) {
    const month = monthKeyOf(contact.initialContact)

    if (month && months.includes(month)) {
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1)
    }
  }

  const monthRows: ReportMonthRow[] = months.map((key) => {
    const range = monthRange(key)

    return {
      key,
      label: monthLabel(key),
      count: monthCounts.get(key) ?? 0,
      current: key === monthKeyOfToday(today),
      href: gridFilterHref([
        { columnId: "initialContact", operator: "within", value: `${range.start}..${range.end}` },
      ]),
    }
  })

  const collectorCounts = new Map<string, number>()

  for (const contact of periodContacts) {
    if (!hasCollector(contact)) {
      continue
    }

    const id = contact.collectedById as string
    collectorCounts.set(id, (collectorCounts.get(id) ?? 0) + 1)
  }

  const collectorRows: ReportCollectorRow[] = [...collectorCounts.entries()]
    .map(([id, count]) => {
      const name = staffNameById.get(id) ?? "Unknown staff member"

      return {
        id,
        name,
        initials: initialsFor(name),
        count,
        percentage: share(count, collected),
        href: gridFilterHref([
          ...periodFilter,
          { columnId: "collectedBy", operator: "is", value: name },
        ]),
      }
    })
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))

  const neverAttended = countNeverAttended(contacts)

  return {
    period,
    periodLabel: METRIC_PERIOD_LABEL[period],
    window,
    funnel: {
      stages: [
        { key: "collected", label: "Collected", count: collected },
        {
          key: "locationResolved",
          label: "Location resolved",
          count: locationResolved,
          // `isNotEmpty` is the grid's available expression of "has a location".
          // A dangling id renders as `Unknown location` and is also non-empty;
          // the definition counts only resolved ids. The two differ only when a
          // contact references a location row that no longer exists.
          href: gridFilterHref([
            ...periodFilter,
            { columnId: "location", operator: "isNotEmpty", value: "" },
          ]),
        },
        {
          key: "attended",
          label: "Attended a session",
          count: attended,
          href: gridFilterHref([
            ...periodFilter,
            { columnId: "totalAttendanceCount", operator: "gt", value: "0" },
          ]),
        },
        {
          key: "active60",
          label: "Active in 60 days",
          count: active60,
          href: gridFilterHref([
            ...periodFilter,
            { columnId: "past60DayAttendanceCount", operator: "gt", value: "0" },
          ]),
        },
      ],
      empty: collected === 0,
      warning:
        neverAttended > 0
          ? `${neverAttended.toLocaleString("en-IN")} contacts in the whole scope have never attended a session. Collecting is not the same as belonging — this bucket is the difference.`
          : null,
    },
    months: {
      rows: monthRows,
      empty: monthRows.every((row) => row.count === 0),
    },
    collectors: {
      rows: collectorRows,
      empty: collectorRows.length === 0,
    },
    quality: {
      rows: [
        {
          key: "noLocation",
          label: "No location",
          count: contacts.filter((contact) => !hasLocation(contact)).length,
          action: "Assign a location",
          href: gridFilterHref([{ columnId: "location", operator: "isEmpty", value: "" }]),
        },
        {
          key: "noPhone",
          label: "No phone number",
          count: contacts.filter((contact) => !hasPhone(contact)).length,
          action: "Add a number",
          href: gridFilterHref([{ columnId: "phone", operator: "isEmpty", value: "" }]),
        },
        {
          key: "noDate",
          label: "No first-contact date",
          count: contacts.filter((contact) => normalizeDay(contact.initialContact) === null).length,
          action: "Set the date",
          href: gridFilterHref([{ columnId: "initialContact", operator: "isEmpty", value: "" }]),
        },
        {
          key: "neverAttended",
          label: "Never attended a session",
          count: neverAttended,
          action: "Invite to a session",
          href: gridFilterHref([{ columnId: "totalAttendanceCount", operator: "is", value: "0" }]),
        },
      ],
    },
  }
}

/** The contacts inside a selected period. Exported so tests can assert the window. */
export function contactsInPeriod(
  contacts: readonly MetricContact[],
  period: MetricPeriod,
  today: string,
): MetricContact[] {
  const window = periodWindow(period, today)

  return contacts.filter((contact) => inWindow(contact, window))
}
