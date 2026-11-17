import { describe, expect, it } from "vitest"

import { computeUpcomingBirthdays } from "./birthdays"

function contact(id: string, name: string, dateOfBirth: string | null) {
  return { id, name, dateOfBirth }
}

describe("computeUpcomingBirthdays", () => {
  it("includes today and orders the rest by how soon they are", () => {
    const rows = computeUpcomingBirthdays(
      [
        contact("a", "Later", "1990-05-20"),
        contact("b", "Today", "1995-05-10"),
        contact("c", "Tomorrow", "1988-05-11"),
      ],
      "2026-05-10",
    )

    expect(rows.map((row) => row.name)).toEqual(["Today", "Tomorrow", "Later"])
    expect(rows.map((row) => row.daysUntil)).toEqual([0, 1, 10])
    expect(rows[0]).toMatchObject({ isToday: true, label: "10 May", turningAge: 31 })
  })

  it("rolls over the year for a birthday in January", () => {
    const rows = computeUpcomingBirthdays([contact("a", "New Year", "1990-01-02")], "2026-12-30")

    expect(rows[0]).toMatchObject({ daysUntil: 3, date: "2027-01-02", turningAge: 37 })
  })

  it("observes 29 February on 28 February in a non-leap year", () => {
    const rows = computeUpcomingBirthdays([contact("a", "Leap", "2000-02-29")], "2026-02-27")

    expect(rows[0]).toMatchObject({ daysUntil: 1, date: "2026-02-28", label: "28 Feb", turningAge: 26 })
  })

  it("drops birthdays outside the horizon and unusable dates", () => {
    const rows = computeUpcomingBirthdays(
      [
        contact("a", "In range", "1990-06-01"),
        contact("b", "Too far", "1990-09-01"),
        contact("c", "No date", null),
        contact("d", "Not a date", "1990-02-31"),
      ],
      "2026-05-10",
    )

    expect(rows.map((row) => row.name)).toEqual(["In range"])
  })

  it("caps the list at the requested limit", () => {
    const contacts = Array.from({ length: 9 }, (_, index) =>
      contact(`c${index}`, `Contact ${index}`, `1990-05-${String(index + 11).padStart(2, "0")}`),
    )

    expect(computeUpcomingBirthdays(contacts, "2026-05-10", { limit: 4 })).toHaveLength(4)
  })

  it("rejects an invalid programme day", () => {
    expect(() => computeUpcomingBirthdays([], "10/05/2026")).toThrow("Invalid programme day")
  })
})
