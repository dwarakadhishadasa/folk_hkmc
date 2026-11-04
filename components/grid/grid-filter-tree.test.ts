import { describe, expect, it } from "vitest"

import {
  GRID_FILTER_MAX_GROUP_DEPTH,
  conditionNode,
  createFilterGroup,
  evaluateFilterGroup,
  filterGroupFromConditions,
  filterGroupKey,
  filterGroupToSerialized,
  flattenConditions,
  groupNode,
  needsManualEvaluation,
  parseFilterTreeJson,
  pruneFilterTree,
} from "@/components/grid/grid-filter-tree"
import type { GridFilterCondition } from "@/components/grid/grid-filter-operators"
import type { GridFieldType } from "@/components/grid/grid-types"

const fieldTypes: Record<string, GridFieldType> = {
  name: "text",
  phone: "text",
  source: "select",
  books: "multiselect",
  dob: "date",
}

const known = new Set(Object.keys(fieldTypes))
const typeById = new Map(Object.entries(fieldTypes))

function condition(columnId: string, operator: string, value: string | string[]): GridFilterCondition {
  return { columnId, operator, value }
}

function read(columns: Record<string, unknown>) {
  return (columnId: string) => columns[columnId]
}

describe("grid filter tree", () => {
  it("wraps a flat condition list in a root group and flattens it back", () => {
    const conditions = [
      condition("name", "contains", "a"),
      condition("phone", "contains", "9"),
    ]

    const tree = filterGroupFromConditions(conditions, "any")

    expect(tree.connective).toBe("any")
    expect(flattenConditions(tree)).toEqual(conditions)
    expect(needsManualEvaluation(tree)).toBe(true)
  })

  it("reads Airtable's conjunction/filterSet shape, nested groups included", () => {
    const raw = JSON.stringify({
      conjunction: "and",
      filterSet: [
        { columnId: "name", operator: "contains", value: "a" },
        {
          type: "nested",
          conjunction: "or",
          filterSet: [
            { columnId: "phone", operator: "contains", value: "9" },
            {
              type: "nested",
              conjunction: "and",
              filterSet: [{ columnId: "source", operator: "is", value: "preview" }],
            },
          ],
        },
      ],
    })

    const tree = parseFilterTreeJson(raw, known, fieldTypes)

    expect(tree).not.toBeNull()
    expect(tree!.connective).toBe("all")
    expect(tree!.children).toHaveLength(2)
    expect(tree!.children[1].type).toBe("group")
    if (tree!.children[1].type === "group") {
      expect(tree!.children[1].group.connective).toBe("any")
      expect(tree!.children[1].group.children[1].type).toBe("group")
    }
    expect(flattenConditions(tree!).map((entry) => entry.columnId)).toEqual([
      "name",
      "phone",
      "source",
    ])
  })

  it("writes the same shape back, so a grouped URL is Airtable-shaped", () => {
    const tree = createFilterGroup("all", [
      conditionNode(condition("name", "contains", "a")),
      groupNode(
        createFilterGroup("any", [
          conditionNode(condition("phone", "contains", "9")),
          groupNode(
            createFilterGroup("all", [
              conditionNode(condition("source", "is", "preview")),
            ]),
          ),
        ]),
      ),
    ])

    expect(filterGroupToSerialized(tree)).toEqual({
      conjunction: "and",
      filterSet: [
        { columnId: "name", operator: "contains", value: "a" },
        {
          type: "nested",
          conjunction: "or",
          filterSet: [
            { columnId: "phone", operator: "contains", value: "9" },
            {
              type: "nested",
              conjunction: "and",
              filterSet: [{ columnId: "source", operator: "is", value: "preview" }],
            },
          ],
        },
      ],
    })
  })

  it("evaluates a nested and/or expression as one predicate", () => {
    // (name contains "a") AND (phone contains "9" OR source is "preview")
    const tree = createFilterGroup("all", [
      conditionNode(condition("name", "contains", "a")),
      groupNode(
        createFilterGroup("any", [
          conditionNode(condition("phone", "contains", "9")),
          conditionNode(condition("source", "is", "preview")),
        ]),
      ),
    ])

    expect(
      evaluateFilterGroup(
        tree,
        read({ name: "anand", phone: "123", source: "other" }),
        typeById,
      ),
    ).toBe(false)

    expect(
      evaluateFilterGroup(
        tree,
        read({ name: "anand", phone: "009", source: "other" }),
        typeById,
      ),
    ).toBe(true)

    expect(
      evaluateFilterGroup(
        tree,
        read({ name: "anand", phone: "123", source: "preview" }),
        typeById,
      ),
    ).toBe(true)

    expect(
      evaluateFilterGroup(
        tree,
        read({ name: "rohit", phone: "009", source: "preview" }),
        typeById,
      ),
    ).toBe(false)
  })

  it("treats an empty group as inert under both connectives", () => {
    for (const connective of ["all", "any"] as const) {
      const tree = createFilterGroup("all", [groupNode(createFilterGroup(connective))])

      expect(
        evaluateFilterGroup(tree, read({}), typeById),
        `an empty ${connective} group must not exclude every row`,
      ).toBe(true)
    }

    // An empty group must not satisfy a match-any parent on its own; otherwise
    // adding one to an OR list would match every row.
    const anyWithEmpty = createFilterGroup("any", [
      groupNode(createFilterGroup("any")),
      conditionNode(condition("name", "contains", "zzz")),
    ])

    expect(evaluateFilterGroup(anyWithEmpty, read({ name: "anand" }), typeById)).toBe(false)
  })

  it("drops duplicate, unknown, and invalid conditions from a shared tree", () => {
    const raw = JSON.stringify({
      conjunction: "and",
      filterSet: [
        { columnId: "name", operator: "contains", value: "a" },
        { columnId: "name", operator: "contains", value: "b" },
        { columnId: "missing", operator: "contains", value: "x" },
        { columnId: "source", operator: "contains", value: "x" },
      ],
    })

    const tree = parseFilterTreeJson(raw, known, fieldTypes)

    expect(tree).not.toBeNull()
    expect(flattenConditions(tree!)).toEqual([condition("name", "contains", "a")])
  })

  it("stops parsing deeper than the group limit", () => {
    let nested: Record<string, unknown> = {
      type: "nested",
      conjunction: "and",
      filterSet: [{ columnId: "name", operator: "contains", value: "leaf" }],
    }

    for (let depth = 0; depth < GRID_FILTER_MAX_GROUP_DEPTH + 2; depth += 1) {
      nested = { type: "nested", conjunction: "and", filterSet: [nested] }
    }

    const tree = parseFilterTreeJson(
      JSON.stringify({ conjunction: "and", filterSet: [nested] }),
      known,
      fieldTypes,
    )

    expect(tree).not.toBeNull()
    expect(flattenConditions(tree!)).toEqual([])
  })

  it("keeps `is empty` when pruning but drops an unfinished value and its empty group", () => {
    const tree = createFilterGroup("all", [
      conditionNode(condition("name", "isEmpty", "")),
      conditionNode(condition("phone", "contains", "")),
      groupNode(
        createFilterGroup("any", [
          conditionNode(condition("source", "is", "")),
        ]),
      ),
    ])

    const pruned = pruneFilterTree(tree, typeById)

    expect(flattenConditions(pruned)).toEqual([condition("name", "isEmpty", "")])
    expect(pruned.children).toHaveLength(1)
  })

  it("treats an array and a string as the same value for a single-select operator", () => {
    const list = createFilterGroup("all", [
      conditionNode(condition("source", "is", [])),
    ])
    const text = createFilterGroup("all", [
      conditionNode(condition("source", "is", "")),
    ])

    expect(filterGroupKey(list)).toBe(filterGroupKey(text))
  })
})
