import { describe, expect, it } from "vitest"

import {
  formatPercent,
  formatSessionDate,
  formatSessionDateShort,
  formatSessionDayMonth,
  formatSessionMonth,
  formatSessionTime,
  formatSignedDelta,
  initialsFor,
  nextSessionBoundary,
  pluralise,
  programDateOf,
  reportRangeDates,
  reportWeekLabel,
} from "./format"

describe("session date formatting", () => {
  it("keeps a DATE on the day the programme recorded it", () => {
    expect(formatSessionDate("2026-08-12")).toBe("Wed, 12 Aug 2026")
    expect(formatSessionDateShort("2026-08-12")).toBe("12 Aug 2026")
    expect(formatSessionMonth("2025-09-14")).toBe("Sep 2025")
    expect(formatSessionDate("2026-09-09")).toBe("Wed, 9 Sep 2026")
    expect(formatSessionDateShort("2025-09-14")).toBe("14 Sep 2025")
    expect(formatSessionDayMonth("2025-09-14")).toBe("14 Sep")
  })

  it("renders a missing date as an em dash", () => {
    expect(formatSessionDate(null)).toBe("—")
    expect(formatSessionDateShort(null)).toBe("—")
    expect(formatSessionMonth(null)).toBe("—")
  })

  it("shows a timestamptz on the programme's clock", () => {
    expect(formatSessionTime("2026-08-12T04:30:00.000Z")).toBe("10:00 am")
    expect(formatSessionTime("2026-08-12T18:45:00.000Z")).toBe("12:15 am")
  })

  it("leaves an unreadable time as stored", () => {
    expect(formatSessionTime("not-a-time")).toBe("not-a-time")
  })

  it("reads a timestamptz's date on the programme's clock", () => {
    expect(programDateOf("2026-08-11T19:30:00.000Z")).toBe("2026-08-12")
    expect(programDateOf(null)).toBeNull()
    expect(programDateOf("not-a-time")).toBeNull()
  })
})

describe("signed month delta", () => {
  it("rounds and signs the difference", () => {
    expect(formatSignedDelta(27.4, 23.2)).toBe("+4")
    expect(formatSignedDelta(23.2, 26.6)).toBe("−3")
    expect(formatSignedDelta(24.2, 24.4)).toBe("0")
  })
})

describe("report range", () => {
  it("includes today and counts back from it", () => {
    const now = new Date("2026-11-01T05:30:00.000Z")

    expect(reportRangeDates("30", now)).toEqual({ from: "2026-10-03", to: "2026-11-01" })
    expect(reportRangeDates("90", now)).toEqual({ from: "2026-08-04", to: "2026-11-01" })
    expect(reportRangeDates("180", now)).toEqual({ from: "2026-05-06", to: "2026-11-01" })
  })

  it("uses the programme's date even while UTC is a day behind", () => {
    const now = new Date("2026-10-31T19:30:00.000Z")

    expect(reportRangeDates("30", now).to).toBe("2026-11-01")
  })

  it("numbers the weeks from the range's start", () => {
    expect(reportWeekLabel(0)).toBe("Week 1")
    expect(reportWeekLabel(3)).toBe("Week 4")
  })
})

describe("next session boundary", () => {
  it("returns the nearest future opens or closes", () => {
    const now = Date.parse("2026-08-12T10:00:00.000Z")

    expect(
      nextSessionBoundary(
        [
          { opensAt: "2026-08-12T09:00:00.000Z", closesAt: "2026-08-12T12:00:00.000Z" },
          { opensAt: "2026-08-12T11:00:00.000Z", closesAt: null },
        ],
        now,
      ),
    ).toBe(Date.parse("2026-08-12T11:00:00.000Z"))
  })

  it("returns null when every boundary is in the past or missing", () => {
    const now = Date.parse("2026-08-12T10:00:00.000Z")

    expect(
      nextSessionBoundary(
        [
          { opensAt: "2026-08-12T09:00:00.000Z", closesAt: "2026-08-12T09:30:00.000Z" },
          { opensAt: null, closesAt: null },
        ],
        now,
      ),
    ).toBeNull()
  })
})

describe("presentation helpers", () => {
  it("builds avatar initials", () => {
    expect(initialsFor("Priya Raman")).toBe("PR")
    expect(initialsFor("Karthik")).toBe("K")
    expect(initialsFor("")).toBe("?")
  })

  it("pluralises a count", () => {
    expect(pluralise(1, "session")).toBe("1 session")
    expect(pluralise(2, "session")).toBe("2 sessions")
  })

  it("rounds a ratio into a percentage", () => {
    expect(formatPercent(0.244)).toBe("24%")
    expect(formatPercent(0)).toBe("0%")
  })
})
