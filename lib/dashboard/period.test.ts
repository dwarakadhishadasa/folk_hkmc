import { describe, expect, it } from "vitest"

import {
  parseDashboardPeriod,
  resolveDashboardWindow,
  type DashboardPeriod,
} from "@/lib/dashboard/period"

const TODAY = "2026-11-15"

function windowFor(period: string, today = TODAY, extra: Record<string, string> = {}) {
  const parsed = parseDashboardPeriod({ period, ...extra }, today)
  return { period: parsed, window: resolveDashboardWindow(parsed, today) }
}

describe("parseDashboardPeriod", () => {
  it("defaults to last90 when the parameter is absent", () => {
    const period = parseDashboardPeriod({}, TODAY)
    expect(period.key).toBe("last90")
    expect(period.label).toBe("Last 90 days")
  })

  it("accepts every preset", () => {
    const keys = ["this-month", "last30", "last90", "this-quarter", "this-year", "last12", "all"]
    for (const key of keys) {
      expect(parseDashboardPeriod({ period: key }, TODAY).key).toBe(key)
    }
  })

  it("falls back to last90 for an unknown preset", () => {
    expect(parseDashboardPeriod({ period: "yesterday" }, TODAY).key).toBe("last90")
  })

  it("parses a custom range and labels it", () => {
    const period = parseDashboardPeriod(
      { period: "custom", from: "2026-10-01", to: "2026-10-31" },
      TODAY,
    )
    expect(period.key).toBe("custom")
    expect(period.from).toBe("2026-10-01")
    expect(period.to).toBe("2026-10-31")
    expect(period.label).toBe("1 Oct – 31 Oct 2026")
  })

  it("names the year on both ends when the range crosses one", () => {
    const period = parseDashboardPeriod(
      { period: "custom", from: "2025-12-15", to: "2026-01-15" },
      TODAY,
    )
    expect(period.label).toBe("15 Dec 2025 – 15 Jan 2026")
  })

  it("falls back to last90 for a missing or invalid bound", () => {
    for (const extra of [
      {},
      { from: "2026-10-01" },
      { to: "2026-10-31" },
      { from: "", to: "" },
      { from: "abcd", to: "2026-10-31" },
      { from: "2026-10-01", to: "2026-02-31" },
    ]) {
      expect(parseDashboardPeriod({ period: "custom", ...extra }, TODAY).key).toBe("last90")
    }
  })

  it("falls back to last90 when the range is reversed", () => {
    expect(
      parseDashboardPeriod({ period: "custom", from: "2026-10-31", to: "2026-10-01" }, TODAY).key,
    ).toBe("last90")
  })

  it("falls back to last90 when the range starts in the future", () => {
    expect(
      parseDashboardPeriod({ period: "custom", from: "2027-01-01", to: "2027-01-31" }, TODAY).key,
    ).toBe("last90")
  })

  it("clips a range that ends after today", () => {
    const period = parseDashboardPeriod(
      { period: "custom", from: "2026-11-01", to: "2026-12-31" },
      TODAY,
    )
    expect(period.key).toBe("custom")
    expect(period.to).toBe(TODAY)
    expect(period.label).toBe("1 Nov – 15 Nov 2026")
  })

  it("reads the first value of a repeated parameter", () => {
    const period = parseDashboardPeriod({ period: ["last30", "all"] }, TODAY)
    expect(period.key).toBe("last30")
  })
})

describe("resolveDashboardWindow", () => {
  it("resolves each preset with an inclusive end", () => {
    expect(windowFor("this-month").window).toMatchObject({ start: "2026-11-01", end: TODAY })
    expect(windowFor("last30").window).toMatchObject({ start: "2026-10-17", end: TODAY })
    expect(windowFor("last90").window).toMatchObject({ start: "2026-08-18", end: TODAY })
    expect(windowFor("this-quarter").window).toMatchObject({ start: "2026-10-01", end: TODAY })
    expect(windowFor("this-year").window).toMatchObject({ start: "2026-01-01", end: TODAY })
    expect(windowFor("last12").window).toMatchObject({ start: "2025-12-01", end: TODAY })
  })

  it("gives all-time no start and no previous window", () => {
    expect(windowFor("all").window).toEqual({
      start: null,
      end: TODAY,
      today: TODAY,
      prevStart: null,
      prevEnd: null,
    })
  })

  it("puts the equal-length window immediately before a preset", () => {
    const { window } = windowFor("last30")
    expect(window.prevEnd).toBe("2026-10-16")
    const length = (start: string, end: string) =>
      Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
    expect(length(window.start!, window.end)).toBe(length(window.prevStart!, window.prevEnd!))
    expect(length(window.prevStart!, window.prevEnd!)).toBe(30)
  })

  it("resolves a custom range to its own inclusive bounds", () => {
    const { window } = windowFor("custom", TODAY, { from: "2026-10-01", to: "2026-10-31" })
    expect(window.start).toBe("2026-10-01")
    expect(window.end).toBe("2026-10-31")
    expect(window.prevEnd).toBe("2026-09-30")
    expect(window.prevStart).toBe("2026-08-31")
  })

  it("clips a custom range to today", () => {
    expect(
      windowFor("custom", TODAY, { from: "2026-11-01", to: "2026-12-31" }).window.end,
    ).toBe(TODAY)
  })

  it("handles a leap day and a month end", () => {
    const leap = windowFor("last30", "2028-03-01")
    expect(leap.window.start).toBe("2028-02-01")

    const monthEnd = windowFor("custom", "2026-12-31", { from: "2026-12-01", to: "2026-12-31" })
    expect(monthEnd.window.start).toBe("2026-12-01")
    expect(monthEnd.window.end).toBe("2026-12-31")
  })

  it("falls back to last90 when a custom window has no bounds", () => {
    const period: DashboardPeriod = { key: "custom", label: "Custom…", from: null, to: null }
    const window = resolveDashboardWindow(period, TODAY)
    expect(window.start).toBe("2026-08-18")
    expect(window.end).toBe(TODAY)
  })
})
