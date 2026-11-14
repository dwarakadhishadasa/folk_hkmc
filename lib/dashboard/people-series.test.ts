import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DashboardScope } from "@/lib/dashboard/types"

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}))

import { loadDashboardPeopleSeries } from "@/lib/dashboard/people-series"

const PREACHER_ID = "11111111-1111-4111-8111-111111111111"
const UNASSIGNED_ID = "00000000-0000-0000-0000-000000000000"

const scope: DashboardScope = {
  programId: "folk",
  role: "Admin",
  userId: "22222222-2222-4222-8222-222222222222",
  mode: "admin",
  programScope: true,
  scopePreacherId: null,
  displayName: "Admin",
  assistantPreacherName: null,
  assistantUnassigned: false,
  hasDialer: true,
}

const window = {
  start: null,
  end: "2026-11-14",
  today: "2026-11-14",
  prevStart: null,
  prevEnd: null,
}

function payload() {
  const segments = [{ key: "loc-1", label: "T. Nagar", value: 2 }]

  return {
    sessionsByPreacher: {
      rows: [
        { preacherId: PREACHER_ID, preacherName: "Anand", total: 2, segments },
        { preacherId: UNASSIGNED_ID, preacherName: "Unassigned", total: 1, segments },
      ],
    },
    contactsByPreacher: {
      rows: [
        { preacherId: PREACHER_ID, preacherName: "Anand", total: 3, segments },
        { preacherId: UNASSIGNED_ID, preacherName: "Unassigned", total: 1, segments },
      ],
    },
    totals: {
      rows: [
        {
          preacherId: PREACHER_ID,
          preacherName: "Anand",
          contacts: 3,
          sessions: 2,
          attendees: 4,
          repeatAttendees: 1,
          attendeeSegments: segments,
        },
        {
          preacherId: UNASSIGNED_ID,
          preacherName: "Unassigned",
          contacts: 1,
          sessions: 1,
          attendees: 1,
          repeatAttendees: 0,
          attendeeSegments: segments,
        },
      ],
    },
    attendeesByPreacher: {
      months: ["2026-10", "2026-11"],
      series: [
        { preacherId: PREACHER_ID, preacherName: "Anand", values: [1, 2] },
        { preacherId: UNASSIGNED_ID, preacherName: "Unassigned", values: [0, 1] },
      ],
    },
  }
}

describe("loadDashboardPeopleSeries", () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: payload(), error: null })
  })

  it("drops the synthetic Unassigned row from bars, totals and attendee lines", async () => {
    const series = await loadDashboardPeopleSeries(scope, window)

    expect(series.sessionsByPreacher.rows.map((row) => row.preacherId)).toEqual([PREACHER_ID])
    expect(series.contactsByPreacher.rows.map((row) => row.preacherId)).toEqual([PREACHER_ID])
    expect(series.totals.rows.map((row) => row.preacherId)).toEqual([PREACHER_ID])
    expect(series.attendeesByPreacher.series.map((row) => row.preacherId)).toEqual([PREACHER_ID])
    expect(series.attendeesByPreacher.months).toEqual(["2026-10", "2026-11"])
  })
})
