/**
 * The programme day, in the programme's own timezone.
 *
 * `initial_contact` is written as a `date`, and the people entering contacts
 * are in the programme's timezone. A UTC day would flip the date for every
 * entry made between midnight and 05:30 IST, which is exactly the window a
 * distribution drive is being wrapped up in.
 *
 * Pure and dependency-free so both the server write path and the contact
 * section's period maths can call it.
 */

export const PROGRAM_TIME_ZONE = "Asia/Kolkata"

export function programDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: PROGRAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`
}
