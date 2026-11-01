/**
 * The sessions surfaces' date, status and report formatting.
 *
 * `session_date` is a `DATE` column, so it arrives as `YYYY-MM-DD` with no time
 * zone. Parsing it at midnight UTC and formatting in UTC keeps the day the
 * programme recorded on every machine — a local-zone parse would show the
 * previous day west of Greenwich. `attendance_opens_at` is a `timestamptz`, so
 * its clock is read at `Asia/Kolkata`, the programme's own time zone.
 */

const SESSION_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

const SESSION_DATE_SHORT_PARTS = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

const SESSION_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

const SESSION_DAY_MONTH_PARTS = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
})

const SESSION_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
})

const PROGRAM_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Kolkata",
})

const MAX_TIMEOUT_DELAY_MS = 2_147_483_647

export const REPORT_RANGES = [
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "180", label: "Last 180 days", days: 180 },
] as const

export type ReportRangeKey = (typeof REPORT_RANGES)[number]["value"]

function datePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? ""
}

/**
 * `en-GB` spells September `Sept`, which the design never does. The parts are
 * assembled explicitly so every month is the three-letter form the frames use,
 * while the day still precedes the month.
 */
function formatDateParts(value: string, formatter: Intl.DateTimeFormat, withWeekday: boolean): string {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const parts = formatter.formatToParts(parsed)
  const day = datePart(parts, "day")
  const month = datePart(parts, "month")
  const year = datePart(parts, "year")

  return withWeekday
    ? `${datePart(parts, "weekday")}, ${day} ${month} ${year}`
    : `${day} ${month} ${year}`
}

export function formatSessionDate(value: string | null): string {
  return value ? formatDateParts(value, SESSION_DATE_PARTS, true) : "—"
}

export function formatSessionDateShort(value: string | null): string {
  return value ? formatDateParts(value, SESSION_DATE_SHORT_PARTS, false) : "—"
}

export function formatSessionMonth(value: string | null): string {
  if (!value) {
    return "—"
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? value : SESSION_MONTH_FORMATTER.format(parsed)
}

/** The compact axis label: `29 Oct`, no year. */
export function formatSessionDayMonth(value: string | null): string {
  if (!value) {
    return "—"
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const parts = SESSION_DAY_MONTH_PARTS.formatToParts(parsed)
  return `${datePart(parts, "day")} ${datePart(parts, "month")}`
}

/** A `timestamptz` at the programme's clock, or the stored value if unreadable. */
export function formatSessionTime(value: string | null): string {
  if (!value) {
    return "—"
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : SESSION_TIME_FORMATTER.format(parsed)
}

/** A `timestamptz`'s calendar date on the programme's clock, as `YYYY-MM-DD`. */
export function programDateOf(value: string | null): string | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : PROGRAM_DATE_PARTS.format(parsed)
}

/** The signed month-over-month delta: `+4`, `−3`, `0`. */
export function formatSignedDelta(current: number, previous: number): string {
  const delta = Math.round(current - previous)

  if (delta > 0) {
    return `+${delta}`
  }

  if (delta < 0) {
    return `\u2212${Math.abs(delta)}`
  }

  return "0"
}

/** `sessions_report.repeat_rate` is a ratio between 0 and 1. */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function initialsFor(name: string): string {
  const words = name
    .split(/[\s@._-]+/)
    .map((word) => word.trim())
    .filter(Boolean)

  if (words.length === 0) {
    return "?"
  }

  const first = words[0]![0] ?? "?"
  const second = words.length > 1 ? (words[1]![0] ?? "") : ""

  return `${first}${second}`.toUpperCase()
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function reportRangeLabel(key: ReportRangeKey): string {
  return REPORT_RANGES.find((range) => range.value === key)?.label ?? "Last 90 days"
}

/** Today's calendar date in the programme's time zone, as `YYYY-MM-DD`. */
function programDate(now: Date): string {
  return PROGRAM_DATE_PARTS.format(now)
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day! + days))
  return date.toISOString().slice(0, 10)
}

/**
 * The inclusive date range a report card covers, at `Asia/Kolkata`. `to` is
 * today and `from` is `days - 1` back, so "Last 90 days" includes today.
 */
export function reportRangeDates(key: ReportRangeKey, now: Date = new Date()): { from: string; to: string } {
  const days = REPORT_RANGES.find((range) => range.value === key)?.days ?? 90
  const to = programDate(now)

  return { from: addDays(to, -(days - 1)), to }
}

/** The label above a bar: the design numbers its weeks from the range's start. */
export function reportWeekLabel(index: number): string {
  return `Week ${index + 1}`
}

/**
 * The earliest moment a rendered status can change. The overview arms one
 * timer for the whole table, so only the nearest boundary matters; a session
 * with neither timestamp has no boundary.
 */
export function nextSessionBoundary(
  rows: ReadonlyArray<{ opensAt: string | null; closesAt: string | null }>,
  now: number,
): number | null {
  const future = rows.flatMap((row) =>
    [row.opensAt, row.closesAt]
      .map((value) => (value ? Date.parse(value) : Number.NaN))
      .filter((time) => Number.isFinite(time) && time > now),
  )

  if (future.length === 0) {
    return null
  }

  return Math.min(...future)
}

export { MAX_TIMEOUT_DELAY_MS }
