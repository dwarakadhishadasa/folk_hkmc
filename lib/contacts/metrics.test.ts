import { describe, expect, it } from "vitest"

import {
  buildOverviewMetrics,
  buildReportsMetrics,
  contactsInPeriod,
  gridFilterHref,
  initialsFor,
  monthRange,
  monthsEndingAt,
  periodWindow,
  shiftMonth,
  type MetricContact,
  type MetricLocation,
} from "@/lib/contacts/metrics"

/**
 * Every definition in `_bmad-output/specs/spec-contacts-section/metrics.md`,
 * asserted against one fixture array.
 *
 * The `today` is fixed. A window test that read the wall clock would pass in
 * November and fail in December without the definition changing, which is the
 * opposite of what a definition test is for.
 */

const TODAY = "2026-11-01"

const LOCATIONS: MetricLocation[] = [
  { id: "loc-adyar", name: "Adyar Temple" },
  { id: "loc-mylapore", name: "Mylapore Temple" },
  { id: "loc-nanganallur", name: "Nanganallur Temple" },
]

const STAFF_NAMES = new Map([
  ["staff-anand", "Anand Narayanan"],
  ["staff-kavitha", "Kavitha Raman"],
])

const LOCATION_NAMES = new Map(LOCATIONS.map((location) => [location.id, location.name]))

function contact(overrides: Partial<MetricContact> = {}): MetricContact {
  return {
    id: "contact",
    phone: "9000000000",
    source: null,
    initialContact: null,
    locationIds: [],
    collectedById: null,
    totalAttendanceCount: 0,
    past60DayAttendanceCount: 0,
    ...overrides,
  }
}

const CONTACTS: MetricContact[] = [
  contact({
    id: "a",
    initialContact: "2026-11-01",
    locationIds: ["loc-adyar"],
    source: "Public Registration",
    collectedById: "staff-anand",
    totalAttendanceCount: 3,
    past60DayAttendanceCount: 1,
  }),
  contact({
    id: "b",
    initialContact: "2026-10-15",
    locationIds: ["loc-adyar"],
    source: "Follow-up of a friend",
    collectedById: "staff-anand",
  }),
  contact({
    id: "c",
    initialContact: "2026-10-02",
    locationIds: ["loc-mylapore"],
    source: null,
    collectedById: "staff-kavitha",
    totalAttendanceCount: 1,
  }),
  contact({
    id: "d",
    initialContact: "2026-09-10",
    locationIds: [],
    source: "Public Registration",
    phone: "",
  }),
  contact({
    id: "e",
    initialContact: "2026-08-05",
    locationIds: ["loc-gone"],
    source: "",
    collectedById: "staff-kavitha",
    totalAttendanceCount: 2,
    past60DayAttendanceCount: 1,
  }),
  contact({
    id: "f",
    initialContact: "2026-06-30",
    locationIds: ["loc-mylapore"],
    source: "Old",
  }),
  contact({
    id: "g",
    initialContact: null,
    locationIds: ["loc-adyar"],
    source: "Public Registration",
    totalAttendanceCount: 5,
    past60DayAttendanceCount: 1,
  }),
  contact({
    id: "h",
    initialContact: "2025-12-01",
    locationIds: ["loc-nanganallur"],
    source: "",
  }),
  contact({
    id: "i",
    initialContact: "2025-11-30",
    locationIds: ["loc-mylapore"],
    totalAttendanceCount: 4,
    past60DayAttendanceCount: 1,
  }),
  contact({
    id: "j",
    initialContact: "2026-11-20",
    locationIds: ["loc-adyar"],
    source: "Public Registration",
    totalAttendanceCount: 1,
  }),
  contact({
    id: "k",
    initialContact: "2026-11-03",
    locationIds: ["loc-mylapore"],
    source: "Public Registration",
  }),
]

describe("date windows", () => {
  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftMonth("2025-12", 2)).toBe("2026-02")
    expect(shiftMonth("2026-11", -11)).toBe("2025-12")
  })

  it("ends a month on its real last day", () => {
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" })
    expect(monthRange("2026-04")).toEqual({ start: "2026-04-01", end: "2026-04-30" })
  })

  it("builds six and twelve month series ending at the current month", () => {
    expect(monthsEndingAt(TODAY, 6)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ])
    expect(monthsEndingAt(TODAY, 12)[0]).toBe("2025-12")
    expect(monthsEndingAt(TODAY, 12)[11]).toBe("2026-11")
  })

  it("resolves each selected period to an inclusive boundary", () => {
    expect(periodWindow("last30", TODAY)).toEqual({ start: "2026-10-03", end: "2026-11-01" })
    expect(periodWindow("last90", TODAY)).toEqual({ start: "2026-08-04", end: "2026-11-01" })
    expect(periodWindow("last12", TODAY)).toEqual({ start: "2025-12-01", end: "2026-11-01" })
    expect(periodWindow("all", TODAY)).toBeNull()
  })

  it("excludes undated rows from every dated window and includes them in All time", () => {
    expect(contactsInPeriod(CONTACTS, "last30", TODAY).map((row) => row.id)).toEqual(["a", "b"])
    expect(contactsInPeriod(CONTACTS, "last90", TODAY).map((row) => row.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ])
    expect(contactsInPeriod(CONTACTS, "last12", TODAY).map((row) => row.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "h",
    ])
    expect(contactsInPeriod(CONTACTS, "all", TODAY)).toHaveLength(CONTACTS.length)
    expect(contactsInPeriod(CONTACTS, "all", TODAY).map((row) => row.id)).toContain("g")
  })
})

describe("overview definitions", () => {
  const overview = buildOverviewMetrics({
    contacts: CONTACTS,
    locationNameById: LOCATION_NAMES,
    today: TODAY,
  })

  it("counts the five tiles from their stated populations", () => {
    expect(overview.total).toBe(11)
    expect(overview.newThisMonth).toBe(3)
    expect(overview.lastMonth).toBe(2)
    expect(overview.newThisMonthDelta).toBe(1)
    expect(overview.activeIn60Days).toBe(4)
    expect(overview.neverAttended).toBe(5)
    expect(overview.noLocation).toBe(1)
    expect(overview.locationsHeld).toBe(3)
  })

  it("buckets the last six months by the stored first-contact date", () => {
    expect(overview.months.rows.map((row) => [row.label, row.count])).toEqual([
      ["Jun", 1],
      ["Jul", 0],
      ["Aug", 1],
      ["Sep", 1],
      ["Oct", 2],
      ["Nov", 3],
    ])
    expect(overview.months.empty).toBe(false)
    expect(overview.months.rows.at(-1)?.current).toBe(true)
  })

  it("groups sources by the stored value, names the empty one, and orders by count then label", () => {
    expect(overview.sources.rows.map((row) => [row.label, row.count])).toEqual([
      ["Public registration", 5],
      ["Not recorded", 4],
      ["Follow-up of a friend", 1],
      ["Old", 1],
    ])
    expect(overview.sources.more).toBe(0)
  })

  it("groups locations into four resolved rows then the two sentinels, summing to the total", () => {
    expect(overview.locations.rows.map((row) => [row.kind, row.label, row.count])).toEqual([
      ["resolved", "Adyar Temple", 4],
      ["resolved", "Mylapore Temple", 4],
      ["resolved", "Nanganallur Temple", 1],
      ["none", "No location", 1],
      ["unknown", "Unknown location", 1],
    ])
    expect(overview.locations.rows.reduce((sum, row) => sum + row.count, 0)).toBe(overview.total)
    expect(overview.locations.more).toBe(0)
    expect(overview.locations.rows.map((row) => row.percentage)).toEqual([36, 36, 9, 9, 9])
  })

  it("computes the three engagement rows", () => {
    expect(overview.engagement.map((row) => [row.label, row.count, row.caption])).toEqual([
      ["Attended a session", 6, "55% of contacts"],
      ["Attended in the last 60 days", 4, "36% of contacts"],
      ["Attended 3+ times", 3, "the committed core"],
    ])
  })

  it("links every figure except the total to the resolved grid filter", () => {
    const month = overview.months.rows.find((row) => row.label === "Oct")
    expect(month).toBeDefined()
    const monthToken = new URL(month!.href, "http://localhost").searchParams.get(
      "f.initialContact",
    )
    expect(monthToken).toBe("within:2026-10-01..2026-10-31")

    expect(
      new URL(overview.sources.rows[0].href, "http://localhost").searchParams.get("f.source"),
    ).toBe("is:Public Registration")
    expect(
      new URL(overview.sources.rows[1].href, "http://localhost").searchParams.get("f.source"),
    ).toBe("isEmpty:")
    expect(
      new URL(
        overview.locations.rows.find((row) => row.kind === "none")!.href,
        "http://localhost",
      ).searchParams.get("f.location"),
    ).toBe("isEmpty:")
    expect(
      new URL(overview.engagement[0].href, "http://localhost").searchParams.get(
        "f.totalAttendanceCount",
      ),
    ).toBe("gt:0")
    expect(
      new URL(overview.engagement[2].href, "http://localhost").searchParams.get(
        "f.totalAttendanceCount",
      ),
    ).toBe("gte:3")
  })

  it("truncates the source list to six rows plus a count", () => {
    const manySources = Array.from({ length: 8 }, (_, index) =>
      contact({ id: `s-${index}`, source: `Source ${index}`, initialContact: "2026-11-01" }),
    )
    const result = buildOverviewMetrics({
      contacts: manySources,
      locationNameById: LOCATION_NAMES,
      today: TODAY,
    })

    expect(result.sources.rows).toHaveLength(6)
    expect(result.sources.more).toBe(2)
  })

  it("truncates resolved locations to four rows plus a count", () => {
    const fiveLocations = Array.from({ length: 5 }, (_, index) => {
      const id = `loc-${index}`
      return contact({ id: `l-${index}`, locationIds: [id], initialContact: "2026-11-01" })
    })
    const names = new Map(fiveLocations.map((row, index) => [row.locationIds[0], `Place ${index}`]))
    const result = buildOverviewMetrics({
      contacts: fiveLocations,
      locationNameById: names,
      today: TODAY,
    })

    expect(result.locations.rows.filter((row) => row.kind === "resolved")).toHaveLength(4)
    expect(result.locations.more).toBe(1)
  })
})

describe("reports definitions", () => {
  it("scopes the funnel to the selected period and leaves collected without a link", () => {
    const reports = buildReportsMetrics({
      contacts: CONTACTS,
      locationNameById: LOCATION_NAMES,
      staffNameById: STAFF_NAMES,
      today: TODAY,
      period: "last90",
    })

    expect(reports.funnel.stages.map((stage) => [stage.label, stage.count])).toEqual([
      ["Collected", 5],
      ["Location resolved", 3],
      ["Attended a session", 3],
      ["Active in 60 days", 2],
    ])
    expect(reports.funnel.stages[0].href).toBeUndefined()
    expect(reports.funnel.empty).toBe(false)
    expect(reports.funnel.warning).toContain("5 contacts in the whole scope")

    // A stage is the period intersected with the stage's own condition. Without
    // the date condition the link would land on the whole scope and report a
    // bigger number than the card.
    const stageParams = new URL(reports.funnel.stages[1].href!, "http://localhost").searchParams
    expect(stageParams.get("f.initialContact")).toBe("within:2026-08-04..2026-11-01")
    expect(stageParams.get("f.location")).toBe("isNotEmpty:")
  })

  it("shows all time as the absence of a window, including undated rows", () => {
    const reports = buildReportsMetrics({
      contacts: CONTACTS,
      locationNameById: LOCATION_NAMES,
      staffNameById: STAFF_NAMES,
      today: TODAY,
      period: "all",
    })

    expect(reports.funnel.stages[0].count).toBe(11)
    expect(reports.window).toBeNull()
  })

  it("always charts the last twelve whole-scope months, independent of the period", () => {
    const last30 = buildReportsMetrics({
      contacts: CONTACTS,
      locationNameById: LOCATION_NAMES,
      staffNameById: STAFF_NAMES,
      today: TODAY,
      period: "last30",
    })
    const all = buildReportsMetrics({
      contacts: CONTACTS,
      locationNameById: LOCATION_NAMES,
      staffNameById: STAFF_NAMES,
      today: TODAY,
      period: "all",
    })

    expect(last30.months.rows).toHaveLength(12)
    expect(last30.months.rows.map((row) => [row.label, row.count])).toEqual(
      all.months.rows.map((row) => [row.label, row.count]),
    )
    expect(last30.months.rows[0]).toMatchObject({ label: "Dec", count: 1 })
    expect(last30.months.rows.at(-1)).toMatchObject({ label: "Nov", count: 3, current: true })
  })

  it("groups collectors over the period, excludes contacts with none, and divides by the period total", () => {
    const reports = buildReportsMetrics({
      contacts: CONTACTS,
      locationNameById: LOCATION_NAMES,
      staffNameById: STAFF_NAMES,
      today: TODAY,
      period: "last90",
    })

    expect(reports.collectors.rows.map((row) => [row.name, row.count, row.percentage])).toEqual([
      ["Anand Narayanan", 2, 40],
      ["Kavitha Raman", 2, 40],
    ])
    expect(reports.collectors.rows[0].initials).toBe("AN")

    const collectorParams = new URL(
      reports.collectors.rows[0].href,
      "http://localhost",
    ).searchParams
    expect(collectorParams.get("f.initialContact")).toBe("within:2026-08-04..2026-11-01")
    expect(collectorParams.get("f.collectedBy")).toBe("is:Anand Narayanan")
  })

  it("counts the four quality rows over the whole scope, not the period", () => {
    const reports = buildReportsMetrics({
      contacts: CONTACTS,
      locationNameById: LOCATION_NAMES,
      staffNameById: STAFF_NAMES,
      today: TODAY,
      period: "last30",
    })

    expect(reports.quality.rows.map((row) => [row.label, row.count, row.action])).toEqual([
      ["No location", 1, "Assign a location"],
      ["No phone number", 1, "Add a number"],
      ["No first-contact date", 1, "Set the date"],
      ["Never attended a session", 5, "Invite to a session"],
    ])

    const links = reports.quality.rows.map((row) =>
      new URL(row.href, "http://localhost").searchParams.toString(),
    )
    expect(links).toEqual([
      "f.location=isEmpty%3A",
      "f.phone=isEmpty%3A",
      "f.initialContact=isEmpty%3A",
      "f.totalAttendanceCount=is%3A0",
    ])
  })

  it("says the period is empty rather than drawing four zero bars", () => {
    const reports = buildReportsMetrics({
      contacts: CONTACTS,
      locationNameById: LOCATION_NAMES,
      staffNameById: STAFF_NAMES,
      today: "2027-11-01",
      period: "last30",
    })

    expect(reports.funnel.empty).toBe(true)
    expect(reports.funnel.stages.every((stage) => stage.count === 0)).toBe(true)
    expect(reports.months.empty).toBe(true)
    expect(reports.collectors.empty).toBe(true)
  })
})

describe("link encoding", () => {
  it("keeps the operator inside the token instead of beside it", () => {
    const href = gridFilterHref([
      { columnId: "initialContact", operator: "within", value: "2026-09-01..2026-09-30" },
    ])

    expect(href.startsWith("/contacts/grid?")).toBe(true)
    expect(new URL(href, "http://localhost").searchParams.get("f.initialContact")).toBe(
      "within:2026-09-01..2026-09-30",
    )
  })

  it("derives collector initials from the first and last word", () => {
    expect(initialsFor("Anand Narayanan")).toBe("AN")
    expect(initialsFor("Suresh")).toBe("SU")
    expect(initialsFor("  ")).toBe("?")
  })
})
