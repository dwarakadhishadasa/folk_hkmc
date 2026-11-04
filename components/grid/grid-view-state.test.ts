import { describe, expect, it } from "vitest"

import {
  applyGridParams,
  parseGridViewState,
  serializeGridViewState,
} from "@/components/grid/grid-view-state"
import {
  conditionNode,
  createFilterGroup,
  filterGroupToSerialized,
  flattenConditions,
  groupNode,
} from "@/components/grid/grid-filter-tree"
import type { GridFieldType } from "@/components/grid/grid-types"

const columns = ["name", "phone", "source"]
const fieldTypes: Record<string, GridFieldType> = {
  name: "text",
  phone: "text",
  source: "select",
}

function flatTree() {
  return createFilterGroup("all", [
    conditionNode({ columnId: "name", operator: "contains", value: "a" }),
    conditionNode({ columnId: "phone", operator: "contains", value: "9" }),
  ])
}

describe("grid view state filter codec", () => {
  it("keeps a flat all-of filter on the legacy f. keys", () => {
    const params = serializeGridViewState({ filterTree: flatTree() }, columns)

    expect(params).toEqual({
      "f.name": "contains:a",
      "f.phone": "contains:9",
    })
  })

  it("keeps a flat any-of filter on the legacy fa. keys", () => {
    const tree = createFilterGroup("any", flatTree().children)
    const params = serializeGridViewState({ filterTree: tree }, columns)

    expect(params).toEqual({
      "fa.name": "contains:a",
      "fa.phone": "contains:9",
    })
  })

  it("writes a grouped filter as fg and not as flat keys", () => {
    const tree = createFilterGroup("all", [
      conditionNode({ columnId: "name", operator: "contains", value: "a" }),
      groupNode(
        createFilterGroup("any", [
          conditionNode({ columnId: "phone", operator: "contains", value: "9" }),
          conditionNode({ columnId: "source", operator: "is", value: "preview" }),
        ]),
      ),
    ])

    const params = serializeGridViewState({ filterTree: tree }, columns)

    expect(params["f.name"]).toBeUndefined()
    expect(params["fg"]).toBeDefined()
    expect(JSON.parse(params.fg)).toEqual(filterGroupToSerialized(tree))
  })

  it("reads fg back into the same tree and projects the flat list", () => {
    const raw = JSON.stringify({
      conjunction: "and",
      filterSet: [
        { columnId: "name", operator: "contains", value: "a" },
        {
          type: "nested",
          conjunction: "or",
          filterSet: [
            { columnId: "phone", operator: "contains", value: "9" },
            { columnId: "source", operator: "is", value: "preview" },
          ],
        },
      ],
    })

    const parsed = parseGridViewState(new URLSearchParams({ fg: raw }), columns, fieldTypes)

    expect(parsed.filterTree.connective).toBe("all")
    expect(parsed.filterTree.children[1].type).toBe("group")
    expect(parsed.filterConnective).toBe("all")
    expect(parsed.columnFilters.map((entry) => entry.id)).toEqual(["name", "phone", "source"])
    expect(flattenConditions(parsed.filterTree)).toEqual([
      { columnId: "name", operator: "contains", value: "a" },
      { columnId: "phone", operator: "contains", value: "9" },
      { columnId: "source", operator: "is", value: "preview" },
    ])
  })

  it("ignores fg when it is malformed and falls back to the flat keys", () => {
    const parsed = parseGridViewState(
      new URLSearchParams({ fg: "{not json", "f.name": "contains:a" }),
      columns,
      fieldTypes,
    )

    expect(flattenConditions(parsed.filterTree)).toEqual([
      { columnId: "name", operator: "contains", value: "a" },
    ])
  })

  it("replaces grid-owned keys without dropping mode=", () => {
    const existing = new URLSearchParams("mode=preacher&f.name=contains:old&fg=%7B%7D&keep=1")
    const next = applyGridParams(existing, { "f.name": "contains:new" })

    expect(next.get("mode")).toBe("preacher")
    expect(next.get("keep")).toBe("1")
    expect(next.get("f.name")).toBe("contains:new")
    expect(next.has("fg")).toBe(false)
  })
})
