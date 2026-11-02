/**
 * The dashboard's period contract, as a pure function of the URL and the
 * programme day.
 *
 * `today` always arrives as a `YYYY-MM-DD` programme day from `programDay()`;
 * this module never reads the clock. Every date is handled at UTC midnight so
 * a server timezone cannot move a boundary by a day. Windows are inclusive on
 * both ends, as the dashboard RPC expects.
 */

export type DashboardPeriodKey =
  | "this-month"
  | "last30"
  | "last90"
  | "this-quarter"
  | "this-year"
  | "last12"
  | "all"
  | "custom"

export type DashboardSearchParams = Record<string, string | string[] | undefined>

export interface DashboardPeriod {
  key: DashboardPeriodKey
  label: string
  /** Inclusive `YYYY-MM-DD` bounds. Present only for `custom`. */
  from: string | null
  to: string | null
}

export interface DashboardWindow {
  /** `null` means all time. */
  start: string | null
  /** Inclusive last day. */
  end: string
  today: string
  prevStart: string | null
  prevEnd: string | null
}

export const DASHBOARD_PERIOD_OPTIONS: ReadonlyArray<{ key: DashboardPeriodKey; label: string }> = [
  { key: "this-month", label: "This month" },
  { key: "last30", label: "Last 30 days" },
  { key: "last90", label: "Last 90 days" },
  { key: "this-quarter", label: "This quarter" },
  { key: "this-year", label: "This year" },
  { key: "last12", label: "Last 12 months" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom…" },
]

export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriodKey = "last90"

const PRESET_KEYS = new Set<DashboardPeriodKey>(
  DASHBOARD_PERIOD_OPTIONS.map((option) => option.key).filter((key) => key !== "custom"),
)

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

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function parseDay(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  return isRealDate(year, month, day) ? { year, month, day } : null
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

function toDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function addDays(day: string, amount: number): string {
  const parsed = parseDay(day)
  if (!parsed) {
    throw new Error(`Invalid day: ${day}`)
  }

  return toDay(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + amount)))
}

function firstOfMonth(year: number, month: number): string {
  return toDay(utcDate(year, month, 1))
}

function firstOfQuarter(year: number, month: number): string {
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1
  return firstOfMonth(year, quarterStartMonth)
}

function firstOfYear(year: number): string {
  return firstOfMonth(year, 1)
}

/** Inclusive day count between two `YYYY-MM-DD` values. */
function inclusiveDays(start: string, end: string): number {
  const from = parseDay(start)
  const to = parseDay(end)
  if (!from || !to) {
    throw new Error(`Invalid window: ${start}..${end}`)
  }

  const fromMs = Date.UTC(from.year, from.month - 1, from.day)
  const toMs = Date.UTC(to.year, to.month - 1, to.day)
  return Math.floor((toMs - fromMs) / 86_400_000) + 1
}

function presetPeriod(key: DashboardPeriodKey): DashboardPeriod {
  const option = DASHBOARD_PERIOD_OPTIONS.find((entry) => entry.key === key)
  return { key, label: option?.label ?? "Last 90 days", from: null, to: null }
}

function fallbackPeriod(): DashboardPeriod {
  return presetPeriod(DEFAULT_DASHBOARD_PERIOD)
}

function formatDayLabel(day: string): string {
  const parsed = parseDay(day)
  if (!parsed) {
    return day
  }

  return `${parsed.day} ${MONTH_SHORT[parsed.month - 1]}`
}

function customLabel(period: DashboardPeriod): string {
  if (period.from === null || period.to === null) {
    return "Custom…"
  }

  const fromParts = parseDay(period.from)
  const toParts = parseDay(period.to)

  if (!fromParts || !toParts) {
    return "Custom…"
  }

  const fromLabel =
    fromParts.year === toParts.year
      ? formatDayLabel(period.from)
      : `${formatDayLabel(period.from)} ${fromParts.year}`

  return `${fromLabel} – ${formatDayLabel(period.to)} ${toParts.year}`
}

/**
 * Parse `?period=` with `from`/`to` for a custom window.
 *
 * Anything invalid falls back to `last90` silently: the URL is user-editable
 * and a bad value must never become an error page. A range that starts in the
 * future is invalid; a range that ends after today is clipped to today.
 */
export function parseDashboardPeriod(
  searchParams: DashboardSearchParams,
  today: string,
): DashboardPeriod {
  const todayParts = parseDay(today)
  if (!todayParts) {
    throw new Error(`Invalid programme day: ${today}`)
  }

  const rawPeriod = firstValue(searchParams.period)?.trim()
  const key = rawPeriod === undefined || rawPeriod === "" ? DEFAULT_DASHBOARD_PERIOD : rawPeriod

  if (key !== "custom") {
    return PRESET_KEYS.has(key as DashboardPeriodKey)
      ? presetPeriod(key as DashboardPeriodKey)
      : fallbackPeriod()
  }

  const rawFrom = firstValue(searchParams.from)?.trim() ?? ""
  const rawTo = firstValue(searchParams.to)?.trim() ?? ""
  const fromParts = parseDay(rawFrom)
  const toParts = parseDay(rawTo)

  if (!fromParts || !toParts) {
    return fallbackPeriod()
  }

  const from = toDay(utcDate(fromParts.year, fromParts.month, fromParts.day))
  const to = toDay(utcDate(toParts.year, toParts.month, toParts.day))

  if (from > to || from > today) {
    return fallbackPeriod()
  }

  const period: DashboardPeriod = {
    key: "custom",
    label: "",
    from,
    to: to > today ? today : to,
  }

  return { ...period, label: customLabel(period) }
}

/**
 * Resolve a period to inclusive `start`/`end` days and the equal-length window
 * immediately before it. `all` has no start and no previous window.
 */
export function resolveDashboardWindow(period: DashboardPeriod, today: string): DashboardWindow {
  const todayParts = parseDay(today)
  if (!todayParts) {
    throw new Error(`Invalid programme day: ${today}`)
  }

  let start: string | null
  let end: string

  switch (period.key) {
    case "all":
      return { start: null, end: today, today, prevStart: null, prevEnd: null }

    case "this-month":
      start = firstOfMonth(todayParts.year, todayParts.month)
      end = today
      break

    case "last30":
      start = addDays(today, -29)
      end = today
      break

    case "last90":
      start = addDays(today, -89)
      end = today
      break

    case "this-quarter":
      start = firstOfQuarter(todayParts.year, todayParts.month)
      end = today
      break

    case "this-year":
      start = firstOfYear(todayParts.year)
      end = today
      break

    case "last12": {
      const startMonth = todayParts.month - 11
      const year = startMonth <= 0 ? todayParts.year - 1 : todayParts.year
      const month = startMonth <= 0 ? startMonth + 12 : startMonth
      start = firstOfMonth(year, month)
      end = today
      break
    }

    case "custom": {
      if (period.from === null || period.to === null) {
        return resolveDashboardWindow(fallbackPeriod(), today)
      }

      start = period.from
      end = period.to > today ? today : period.to

      if (start > end) {
        return resolveDashboardWindow(fallbackPeriod(), today)
      }
      break
    }
  }

  if (start > end) {
    return resolveDashboardWindow(fallbackPeriod(), today)
  }

  const length = inclusiveDays(start, end)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(length - 1))

  return { start, end, today, prevStart, prevEnd }
}

/** Query parameters that reproduce a period in the URL. */
export function dashboardPeriodQuery(period: DashboardPeriod): Record<string, string> {
  if (period.key === "custom" && period.from !== null && period.to !== null) {
    return {
      period: "custom",
      from: period.from,
      to: period.to,
    }
  }

  return { period: period.key === "custom" ? DEFAULT_DASHBOARD_PERIOD : period.key }
}

/** Resolve a window for a period in one step, for callers that do not need the period object. */
export function resolveDashboardPeriod(
  searchParams: DashboardSearchParams,
  today: string,
): { period: DashboardPeriod; window: DashboardWindow } {
  const period = parseDashboardPeriod(searchParams, today)
  return { period, window: resolveDashboardWindow(period, today) }
}
