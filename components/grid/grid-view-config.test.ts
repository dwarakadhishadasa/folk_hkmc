import { describe, expect, it } from "vitest"

import {
  createFilterGroup,
  conditionNode,
  filterGroupToSerialized,
  groupNode,
} from "@/components/grid/grid-filter-tree"
import {
  EMPTY_GRID_VIEW_CONFIG,
  gridViewConfigFromParams,
  gridViewConfigKey,
  gridViewConfigToParams,
  normalizeGridViewConfig,
  type GridViewConfig,
} from "@/components/grid/grid-view-config"
import type { GridFieldType } from "@/components/grid/grid-types"

const columns = ["select", "name", "phone", "source", "notes"]
const defaultHidden = ["source", "notes"]
const fieldTypes: Record<string, GridFieldType> = {
  name: "text",
  phone: "text",
  source: "select",
}

function nestedFilter() {
  return createFilterGroup("all", [
    conditionNode({ columnId: "name", operator: "contains", value: "a" }),
    groupNode(
      createFilterGroup("any", [
        conditionNode({ columnId: "phone", operator: "contains", value: "9" }),
        conditionNode({ columnId: "source", operator: "is", value: "Old" }),
      ]),
    ),
  ])
}

describe("saved view config codec", () => {
  it("treats an empty hidden set as a complete set, not as the defaults", () => {
    const params = gridViewConfigToParams(
      { ...EMPTY_GRID_VIEW_CONFIG, hiddenColumnIds: [] },
      columns,
      { fieldTypes, defaultHiddenColumnIds: defaultHidden },
    )

    expect(params.hide).toBe("")
  })

  it("writes no hide key when the view hides exactly the defaults", () => {
    const params = gridViewConfigToParams(
      { ...EMPTY_GRID_VIEW_CONFIG, hiddenColumnIds: [...defaultHidden] },
      columns,
      { fieldTypes, defaultHiddenColumnIds: defaultHidden },
    )

    expect(params).not.toHaveProperty("hide")
  })

  it("round-trips sorting, a nested filter, widths and visibility", () => {
    const config: GridViewConfig = {
      sorting: [{ id: "name", desc: true }],
      globalFilter: "ram",
      filter: filterGroupToSerialized(nestedFilter()),
      columnOrder: ["name", "phone", "source", "select", "notes"],
      hiddenColumnIds: ["notes"],
      columnSizing: { name: 220 },
      density: "dense",
    }

    const params = gridViewConfigToParams(config, columns, {
      fieldTypes,
      defaultHiddenColumnIds: defaultHidden,
    })
    const parsed = gridViewConfigFromParams(new URLSearchParams(params), columns, {
      fieldTypes,
      defaultHiddenColumnIds: defaultHidden,
      density: "default",
    })

    expect(parsed.sorting).toEqual(config.sorting)
    expect(parsed.globalFilter).toBe("ram")
    expect(parsed.filter).toEqual(config.filter)
    expect(parsed.columnOrder).toEqual(config.columnOrder)
    expect(parsed.hiddenColumnIds).toEqual(["notes"])
    expect(parsed.columnSizing).toEqual({ name: 220 })
  })

  it("keeps row height in the config, not in the URL", () => {
    const params = gridViewConfigToParams(
      { ...EMPTY_GRID_VIEW_CONFIG, density: "dense" },
      columns,
      { fieldTypes, defaultHiddenColumnIds: defaultHidden },
    )

    expect(params).not.toHaveProperty("density")

    const parsed = gridViewConfigFromParams(new URLSearchParams(params), columns, {
      fieldTypes,
      defaultHiddenColumnIds: defaultHidden,
      density: "dense",
    })

    expect(parsed.density).toBe("dense")
  })

  it("drops a stored condition whose column no longer exists", () => {
    const params = gridViewConfigToParams(
      {
        ...EMPTY_GRID_VIEW_CONFIG,
        filter: {
          conjunction: "and",
          filterSet: [{ columnId: "ghost", operator: "contains", value: "x" }],
        },
      },
      columns,
      { fieldTypes, defaultHiddenColumnIds: defaultHidden },
    )

    expect(params).not.toHaveProperty("f.ghost")
  })
})

describe("normalizeGridViewConfig", () => {
  it("falls back to an empty config for anything that is not an object", () => {
    expect(normalizeGridViewConfig(null)).toEqual(EMPTY_GRID_VIEW_CONFIG)
    expect(normalizeGridViewConfig("nope")).toEqual(EMPTY_GRID_VIEW_CONFIG)
  })

  it("keeps the parts it can read and drops the rest", () => {
    const config = normalizeGridViewConfig({
      sorting: [{ id: "name", desc: true }, { id: "name", desc: false }, { nope: 1 }],
      hiddenColumnIds: ["notes", "notes", 4],
      columnSizing: { name: 210.6, phone: -1, source: "wide" },
      density: "sideways",
      filter: { conjunction: "and", filterSet: [] },
    })

    expect(config.sorting).toEqual([{ id: "name", desc: true }])
    expect(config.hiddenColumnIds).toEqual(["notes"])
    expect(config.columnSizing).toEqual({ name: 211 })
    expect(config.density).toBe("default")
    expect(config.filter).toEqual({ conjunction: "and", filterSet: [] })
  })

  it("ignores a filter without the shape a filter tree has", () => {
    expect(normalizeGridViewConfig({ filter: { conjunction: "or" } }).filter).toBeNull()
    expect(normalizeGridViewConfig({ filter: { conjunction: "maybe", filterSet: [] } }).filter).toBeNull()
  })
})

describe("gridViewConfigKey", () => {
  it("ignores the order widths were written in", () => {
    const left: GridViewConfig = { ...EMPTY_GRID_VIEW_CONFIG, columnSizing: { name: 200, phone: 120 } }
    const right: GridViewConfig = { ...EMPTY_GRID_VIEW_CONFIG, columnSizing: { phone: 120, name: 200 } }

    expect(gridViewConfigKey(left)).toBe(gridViewConfigKey(right))
  })

  it("separates two configurations that differ where it matters", () => {
    const left: GridViewConfig = { ...EMPTY_GRID_VIEW_CONFIG, sorting: [{ id: "name", desc: false }] }
    const right: GridViewConfig = { ...EMPTY_GRID_VIEW_CONFIG, sorting: [{ id: "name", desc: true }] }

    expect(gridViewConfigKey(left)).not.toBe(gridViewConfigKey(right))
  })
})
