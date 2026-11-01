import { describe, expect, it } from "vitest"

import { programDay } from "@/lib/program-day"

describe("programDay", () => {
  it("uses the programme's timezone, not UTC", () => {
    // 19:00 UTC on 31 October is 00:30 IST on 1 November — the boundary a
    // distribution drive actually crosses while it is wrapping up.
    expect(programDay(new Date("2026-10-31T19:00:00Z"))).toBe("2026-11-01")
    expect(programDay(new Date("2026-10-31T18:29:59Z"))).toBe("2026-10-31")
  })

  it("formats a day as YYYY-MM-DD", () => {
    expect(programDay(new Date("2026-01-02T06:00:00Z"))).toBe("2026-01-02")
  })
})
