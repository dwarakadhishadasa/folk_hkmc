import { describe, expect, it } from "vitest"

import type { CampaignProgress } from "./progress"
import { buildCampaignReportCsv, leaderboardRows, reportFileName } from "./reports"

function progressFixture(overrides: Partial<CampaignProgress> = {}): CampaignProgress {
  return {
    campaignId: "campaign-1",
    programId: "folk",
    programScope: true,
    summary: {
      assigned: 10,
      attempted: 6,
      reached: 4,
      confirmed: 2,
      neverAttempted: 4,
      completed: 5,
      skipped: 1,
      pending: 4,
    },
    outcomes: [
      { statusGroup: "CONFIRMED", count: 2, lastCalledAt: "2026-08-12T12:04:00.000Z" },
      { statusGroup: "NOT_REACHABLE", count: 3, lastCalledAt: "2026-08-12T11:52:00.000Z" },
    ],
    callers: [
      {
        callerId: "caller-a",
        callerName: "Anand",
        assigned: 4,
        attempted: 2,
        reached: 1,
        confirmed: 1,
        neverAttempted: 2,
        callsMade: 2,
      },
      {
        callerId: "caller-b",
        callerName: "Divya",
        assigned: 6,
        attempted: 4,
        reached: 3,
        confirmed: 1,
        neverAttempted: 2,
        callsMade: 7,
      },
    ],
    recent: [
      {
        id: "log-1",
        calledAt: "2026-08-12T12:04:00.000Z",
        statusGroup: "CONFIRMED",
        contactName: "Ravi, \"the elder\"",
        callerName: "Divya",
      },
    ],
    ...overrides,
  }
}

describe("campaign report CSV", () => {
  it("carries the four sections the screen renders", () => {
    const csv = buildCampaignReportCsv(
      { name: "Weekend Camp", campaign_date: "2026-08-12", status: "ACTIVE" },
      progressFixture(),
    )

    expect(csv).toContain("Campaign,Weekend Camp")
    expect(csv).toContain("Funnel")
    expect(csv).toContain("Assigned,10")
    expect(csv).toContain("Attempted,6")
    expect(csv).toContain("Reached,4")
    expect(csv).toContain("Confirmed,2")
    expect(csv).toContain("Never attempted,4")
    expect(csv).toContain("Outcome mix")
    expect(csv).toContain("Caller rollup")
    expect(csv).toContain("Recent activity")
  })

  it("lists all six status groups, with a zero for a group that has no calls", () => {
    const csv = buildCampaignReportCsv(
      { name: "Weekend Camp", campaign_date: "2026-08-12", status: "ACTIVE" },
      progressFixture(),
    )
    const lines = csv.split("\n")

    expect(lines).toContain("Confirmed,2")
    expect(lines).toContain("May come,0")
    expect(lines).toContain("Deferred,0")
    expect(lines).toContain("No answer,3")
    expect(lines).toContain("Wrong number,0")
    expect(lines).toContain("Not interested,0")
  })

  it("ranks the rollup on completed attempts, the same order the leaderboard shows", () => {
    const progress = progressFixture()

    expect(leaderboardRows(progress.callers).map((caller) => caller.callerName)).toEqual(["Divya", "Anand"])

    const csv = buildCampaignReportCsv(
      { name: "Weekend Camp", campaign_date: "2026-08-12", status: "ACTIVE" },
      progress,
    )
    const rollup = csv.slice(csv.indexOf("Caller rollup"), csv.indexOf("Recent activity"))
    const divya = rollup.indexOf("Divya,6,4,3,1,2,7")
    const anand = rollup.indexOf("Anand,4,2,1,1,2,2")

    expect(divya).toBeGreaterThan(-1)
    expect(anand).toBeGreaterThan(divya)
  })

  it("quotes a value carrying a comma or a quote, so the row keeps its columns", () => {
    const csv = buildCampaignReportCsv(
      { name: "Weekend Camp", campaign_date: "2026-08-12", status: "ACTIVE" },
      progressFixture(),
    )

    expect(csv).toContain('"Ravi, ""the elder"""')
    expect(csv).not.toContain("call_duration")
  })

  it("builds a safe file name and falls back when the name has no letters", () => {
    expect(reportFileName("Weekend Camp 2026")).toBe("weekend-camp-2026-report.csv")
    expect(reportFileName("  !!!  ")).toBe("campaign-report.csv")
  })
})
