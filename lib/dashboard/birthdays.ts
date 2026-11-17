/**
 * Upcoming birthdays for a preacher's patch.
 *
 * Pure and dependency-free so the dashboard loader, the unit tests and any
 * future surface share one definition of "next birthday". The programme day
 * is passed in (see `programDay`) rather than read here, because a UTC clock
 * would flip the date for entries made just after midnight IST.
 */

export interface BirthdayContact {
  id: string
  name: string
  /** `YYYY-MM-DD`, as Postgres returns a `date` column. */
  dateOfBirth: string | null
}

export interface UpcomingBirthday {
  contactId: string
  name: string
  /** The next occurrence, `YYYY-MM-DD`. */
  date: string
  /** The contact's actual date of birth, `YYYY-MM-DD`. */
  dateOfBirth: string
  daysUntil: number
  /** Age they turn on that occurrence, when the birth year is usable. */
  turningAge: number | null
  /** `12 Dec`, for display. */
  label: string
  isToday: boolean
}

export const BIRTHDAY_HORIZON_DAYS = 60
export const BIRTHDAY_LIMIT = 6

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

interface DateParts {
  year: number
  month: number
  day: number
}

function parseIsoDate(value: string | null | undefined): DateParts | null {
  if (!value) {
    return null
  }

  const match = ISO_DATE.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function occurrenceUtc(parts: DateParts, year: number): number {
  const day = parts.month === 2 && parts.day === 29 && !isLeapYear(year) ? 28 : parts.day
  return Date.UTC(year, parts.month - 1, day)
}

export function formatBirthdayLabel(date: string): string {
  const parts = parseIsoDate(date)
  if (!parts) {
    return date
  }

  return `${parts.day} ${MONTHS[parts.month - 1]}`
}

/**
 * The next occurrence of every contact's birthday inside the horizon, soonest
 * first. A 29 February birthday is observed on 28 February in a non-leap year.
 */
export function computeUpcomingBirthdays(
  contacts: readonly BirthdayContact[],
  today: string,
  options: { horizonDays?: number; limit?: number } = {},
): UpcomingBirthday[] {
  const todayParts = parseIsoDate(today)
  if (!todayParts) {
    throw new Error(`Invalid programme day: ${today}`)
  }

  const horizonDays = options.horizonDays ?? BIRTHDAY_HORIZON_DAYS
  const limit = options.limit ?? BIRTHDAY_LIMIT
  const todayUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day)
  const upcoming: UpcomingBirthday[] = []

  for (const contact of contacts) {
    const birth = parseIsoDate(contact.dateOfBirth)
    if (!birth) {
      continue
    }

    let occurrenceYear = todayParts.year
    let occurrence = occurrenceUtc(birth, occurrenceYear)
    if (occurrence < todayUtc) {
      occurrenceYear += 1
      occurrence = occurrenceUtc(birth, occurrenceYear)
    }

    const daysUntil = Math.round((occurrence - todayUtc) / DAY_MS)
    if (daysUntil > horizonDays) {
      continue
    }

    const turningAge = occurrenceYear - birth.year
    const date = new Date(occurrence).toISOString().slice(0, 10)

    upcoming.push({
      contactId: contact.id,
      name: contact.name,
      date,
      dateOfBirth: contact.dateOfBirth!,
      daysUntil,
      turningAge: turningAge >= 0 && turningAge <= 130 ? turningAge : null,
      label: formatBirthdayLabel(date),
      isToday: daysUntil === 0,
    })
  }

  return upcoming
    .sort((left, right) => left.daysUntil - right.daysUntil || left.name.localeCompare(right.name))
    .slice(0, limit)
}
