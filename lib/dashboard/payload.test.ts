import { describe, expect, it } from "vitest"

import { DashboardPayloadError, parseCandidatePage, parseDashboardOverview } from "@/lib/dashboard/payload"

function completeOverview(): Record<string, unknown> {
  return {
    programId: "folk",
    programScope: false,
    scopePreacherId: "11111111-1111-4111-8111-111111111111",
    period: {
      start: "2026-08-18",
      end: "2026-11-15",
      today: "2026-11-15",
      previousStart: "2026-05-20",
      previousEnd: "2026-08-17",
    },
    scope: { contacts: 12, locations: 3, sessions: 4 },
    kpis: {
      contactsCollected: 12,
      contactsCollectedPrev: 10,
      contactsCollectedDelta: 2,
      contactsCollectedDeltaPct: 20,
      callsMade: 30,
      contactsCalled: 9,
      contactsReached: 6,
      contactsConfirmed: 3,
      reachRate: 67,
      confirmationRate: 50,
      sessionsHeld: 4,
      uniqueAttendees: 8,
      attendanceRecords: 11,
      newAttendees: 5,
      returningAttendees: 3,
      repeatAttendees: 2,
      repeatRate: 25,
      averageAttendance: 2.8,
      invitedAttendees: 4,
      organicAttendees: 4,
    },
    pipeline: {
      cohort: 12,
      stages: [
        { key: "collected", count: 12 },
        { key: "assigned", count: 10 },
        { key: "called", count: 8 },
        { key: "reached", count: 6 },
        { key: "confirmed", count: 3 },
      ],
      attended: { invited: 5, attended: 3, confirmed: 2, unconfirmed: 1 },
      unlinkedCampaigns: 1,
    },
    outcomes: [{ statusGroup: "CONFIRMED", count: 30 }],
    attendanceTrend: [{ month: "2026-11", sessions: 1, attendees: 2, checkIns: 3 }],
    coverage: {
      contacts: 12,
      withLocation: 10,
      withAssignedPreacher: 11,
      withInitialContact: 12,
      withCollector: 9,
    },
    team: {
      groupBy: "location",
      rows: [
        {
          key: "22222222-2222-4222-8222-222222222222",
          name: "T. Nagar",
          contactsCollected: 5,
          callsMade: 10,
          reached: 4,
          confirmed: 2,
          sessions: 2,
          attendees: 3,
          lastActivity: "2026-11-10",
        },
      ],
    },
    campaigns: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Campaign",
        status: "ACTIVE",
        campaignDate: "2026-11-01",
        sessionCount: 0,
        sessionId: null,
        sessionName: null,
        sessionDate: null,
        assigned: 0,
        attempted: 0,
        reached: 0,
        confirmed: 0,
        neverAttempted: 0,
        attended: null,
      },
    ],
    recentSessions: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Sunday",
        sessionDate: "2026-11-10",
        preacherName: "Anand",
        locationName: "T. Nagar",
        attendees: 3,
      },
    ],
    focus: [
      {
        key: "confirmed_not_attended",
        count: 1,
        rows: [
          {
            contactId: "55555555-5555-4555-8555-555555555555",
            name: "Person",
            phone: "9000000000",
            preacherName: "Anand",
            locationName: "T. Nagar",
            lastActivity: "2026-11-10",
            reason: "Confirmed for Sunday on 10 Nov 2026; no check-in.",
            sessionId: "44444444-4444-4444-8444-444444444444",
            sessionName: "Sunday",
            sessionDate: "2026-11-10",
            lastCalledAt: "2026-11-09T10:00:00+05:30",
            disposition: "Confirmed",
            campaignName: "Campaign",
            lifetimeAttendance: 1,
            lastAttendedAt: null,
            initialContact: "2026-10-01",
            daysWaiting: null,
            collectorName: "Kavitha",
            daysSince: null,
          },
        ],
      },
      { key: "ready_to_invite", count: 0, rows: [] },
      { key: "committed_not_invited", count: 0, rows: [] },
      { key: "new_untouched", count: 0, rows: [] },
      { key: "fading", count: 0, rows: [] },
    ],
    generatedAt: "2026-11-15T10:30:00+05:30",
  }
}

describe("parseDashboardOverview", () => {
  it("accepts a complete payload and orders the focus segments", () => {
    const payload = completeOverview()
    payload.focus = [
      { key: "fading", count: 0, rows: [] },
      ...(payload.focus as unknown[]).slice(0, 4),
    ]

    const overview = parseDashboardOverview(payload)

    expect(overview.kpis.callsMade).toBe(30)
    expect(overview.pipeline.stages.map((stage) => stage.key)).toEqual([
      "collected",
      "assigned",
      "called",
      "reached",
      "confirmed",
    ])
    expect(overview.focus.map((segment) => segment.key)).toEqual([
      "confirmed_not_attended",
      "ready_to_invite",
      "committed_not_invited",
      "new_untouched",
      "fading",
    ])
    expect(overview.campaigns[0]?.attended).toBeNull()
  })

  it("rejects a missing count instead of reading it as zero", () => {
    const payload = completeOverview()
    delete (payload.kpis as Record<string, unknown>).callsMade

    expect(() => parseDashboardOverview(payload)).toThrow(DashboardPayloadError)
  })

  it("rejects a count with the wrong type", () => {
    const payload = completeOverview()
    ;(payload.kpis as Record<string, unknown>).contactsCollected = "12"

    expect(() => parseDashboardOverview(payload)).toThrow(DashboardPayloadError)
  })

  it("rejects a missing focus segment", () => {
    const payload = completeOverview()
    payload.focus = (payload.focus as unknown[]).slice(0, 4)

    expect(() => parseDashboardOverview(payload)).toThrow(/five focus segments/)
  })

  it("rejects a duplicate focus segment", () => {
    const payload = completeOverview()
    const focus = payload.focus as Array<Record<string, unknown>>
    focus[4] = { ...focus[0] }

    expect(() => parseDashboardOverview(payload)).toThrow(/duplicate segment/)
  })

  it("rejects a missing pipeline stage", () => {
    const payload = completeOverview()
    const pipeline = payload.pipeline as { stages: unknown[] }
    pipeline.stages = pipeline.stages.slice(0, 4)

    expect(() => parseDashboardOverview(payload)).toThrow(/five stages/)
  })

  it("rejects a missing coverage field", () => {
    const payload = completeOverview()
    delete (payload.coverage as Record<string, unknown>).withCollector

    expect(() => parseDashboardOverview(payload)).toThrow(DashboardPayloadError)
  })
})

describe("parseCandidatePage", () => {
  function candidatePage(): Record<string, unknown> {
    const overview = completeOverview()
    const focus = overview.focus as Array<Record<string, unknown>>
    return {
      segment: "confirmed_not_attended",
      total: 1,
      limit: 50,
      offset: 0,
      rows: focus[0]!.rows,
    }
  }

  it("accepts the requested segment and rows", () => {
    const page = parseCandidatePage(candidatePage(), "confirmed_not_attended")
    expect(page.total).toBe(1)
    expect(page.rows[0]?.name).toBe("Person")
  })

  it("rejects a payload for another segment", () => {
    expect(() => parseCandidatePage(candidatePage(), "fading")).toThrow(/expected fading/)
  })

  it("rejects a missing total", () => {
    const payload = candidatePage()
    delete payload.total
    expect(() => parseCandidatePage(payload, "confirmed_not_attended")).toThrow(DashboardPayloadError)
  })
})
