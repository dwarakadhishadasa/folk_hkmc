import { describe, expect, it } from "vitest"

import { assignedBarHeading, assignedCallerRows } from "./assign-contacts-assigned"

describe("assignedBarHeading", () => {
  it("calls a draft campaign's split a plan", () => {
    expect(assignedBarHeading("DRAFT")).toBe("Planned assignments")
  })

  it("keeps the assigned wording once the campaign is live or closed", () => {
    expect(assignedBarHeading("ACTIVE")).toBe("Already assigned")
    expect(assignedBarHeading("COMPLETED")).toBe("Already assigned")
    expect(assignedBarHeading("CANCELLED")).toBe("Already assigned")
  })
})

describe("assignedCallerRows", () => {
  it("groups the assigned contacts by caller, ranked and shared against the whole scope", () => {
    const result = assignedCallerRows([
      { assignedCallerName: "Divya" },
      { assignedCallerName: "Anand" },
      { assignedCallerName: "Divya" },
      { assignedCallerName: "Anand" },
      { assignedCallerName: null },
      { assignedCallerName: "  " },
    ])

    expect(result.rows).toEqual([
      { callerName: "Anand", count: 2, percentage: 33 },
      { callerName: "Divya", count: 2, percentage: 33 },
    ])
    expect(result.assignedCount).toBe(4)
    expect(result.total).toBe(6)
  })

  it("counts every contact in the denominator so the unassigned remainder is visible", () => {
    const result = assignedCallerRows([
      { assignedCallerName: "Divya" },
      { assignedCallerName: null },
      { assignedCallerName: null },
      { assignedCallerName: null },
    ])

    expect(result.rows).toEqual([{ callerName: "Divya", count: 1, percentage: 25 }])
    expect(result.assignedCount).toBe(1)
    expect(result.total).toBe(4)
  })

  it("returns no rows when the campaign has no assignments", () => {
    const result = assignedCallerRows([
      { assignedCallerName: null },
      { assignedCallerName: null },
    ])

    expect(result).toEqual({ rows: [], assignedCount: 0, total: 2 })
  })
})
