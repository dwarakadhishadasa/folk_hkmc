import { describe, expect, it } from "vitest"

import { EMPTY_GRID_VIEW_CONFIG } from "@/components/grid/grid-view-config"
import {
  canEditContactView,
  isContactViewVisibility,
  suggestContactViewName,
  type ManageContactView,
} from "@/components/manage/manage-view-types"

const me = "11111111-1111-4111-8111-111111111111"
const someoneElse = "22222222-2222-4222-8222-222222222222"

function view(overrides: Partial<ManageContactView> = {}): ManageContactView {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Grid 1",
    viewType: "grid",
    config: EMPTY_GRID_VIEW_CONFIG,
    position: 1,
    ownerUserId: me,
    visibility: "personal",
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
    ...overrides,
  }
}

describe("view ownership", () => {
  it("lets the owner change a personal view", () => {
    expect(canEditContactView(view(), me)).toBe(true)
  })

  it("refuses someone else's personal view", () => {
    expect(canEditContactView(view({ ownerUserId: someoneElse }), me)).toBe(false)
  })

  it("lets anyone in the programme change a collaborative view", () => {
    expect(
      canEditContactView(view({ ownerUserId: someoneElse, visibility: "collaborative" }), me),
    ).toBe(true)
  })

  it("treats a view from before ownership as shared", () => {
    expect(canEditContactView(view({ ownerUserId: null }), me)).toBe(true)
  })
})

describe("view visibility values", () => {
  it("accepts only the two scopes", () => {
    expect(isContactViewVisibility("personal")).toBe(true)
    expect(isContactViewVisibility("collaborative")).toBe(true)
    expect(isContactViewVisibility("locked")).toBe(false)
    expect(isContactViewVisibility(null)).toBe(false)
  })
})

describe("suggestContactViewName", () => {
  it("numbers the next view", () => {
    expect(suggestContactViewName([{ name: "Grid 1" }, { name: "Grid 2" }])).toBe("Grid 3")
    expect(suggestContactViewName([])).toBe("Grid 1")
  })
})
