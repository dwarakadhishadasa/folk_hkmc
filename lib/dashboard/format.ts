/**
 * Display formatting for the dashboard. No figure is derived here beyond a
 * percentage of two counts the payload already carries, which the spec allows
 * as display-only.
 */

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

function parseDay(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) {
    return null
  }

  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-IN")
}

/** Integer percentage, rounded half-up, or 0 when the denominator is 0. */
export function percentageOf(part: number, whole: number): number {
  if (whole <= 0) {
    return 0
  }

  return Math.floor((part * 100 + whole / 2) / whole)
}

export function formatPercentage(part: number, whole: number): string {
  return `${percentageOf(part, whole)}%`
}

/** `2026-10-12` or an ISO timestamp → `12 Oct 2026`. */
export function formatDay(value: string | null | undefined): string {
  if (!value) {
    return "—"
  }

  const parsed = parseDay(value)
  if (!parsed || parsed.month < 1 || parsed.month > 12) {
    return "—"
  }

  return `${parsed.day} ${MONTH_SHORT[parsed.month - 1]} ${parsed.year}`
}

/** `2026-10` → `Oct 2026`. */
export function formatMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) {
    return value
  }

  const month = Number(match[2])
  return `${MONTH_SHORT[month - 1] ?? match[2]} ${match[1]}`
}

/** The `+12` / `−8` caption; an em dash-backed phrase when there is no window. */
export function formatDelta(delta: number | null): string {
  if (delta === null) {
    return "No previous period"
  }

  if (delta === 0) {
    return "No change vs previous"
  }

  return `${delta > 0 ? "+" : "−"}${formatCount(Math.abs(delta))} vs previous`
}

export function formatUpdated(generatedAt: string): string {
  const parsed = new Date(generatedAt)
  if (Number.isNaN(parsed.getTime())) {
    return ""
  }

  return parsed.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatClosingTime(value: string | null): string {
  if (!value) {
    return ""
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ""
  }

  return parsed.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** `2026-11-02` → `Mon, 2 Nov 2026`; used by the dashboard's date chip. */
export function formatLongDay(value: string): string {
  const parsed = parseDay(value)
  if (!parsed) {
    return ""
  }

  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** The day and short month for a calendar-style date block. */
export function dateParts(value: string | null | undefined): {
  day: string
  month: string
  year: string
} | null {
  if (!value) {
    return null
  }

  const parsed = parseDay(value)
  if (!parsed) {
    return null
  }

  return {
    day: String(parsed.day),
    month: MONTH_SHORT[parsed.month - 1] ?? "",
    year: String(parsed.year),
  }
}
