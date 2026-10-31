import { describe, expect, it } from "vitest"

import { collectPagedRows, POSTGREST_MAX_PAGES, POSTGREST_PAGE_SIZE } from "./paging"

const failures = {
  read: () => new Error("read failed"),
  truncated: () => new Error("truncated"),
}

describe("the shared PostgREST pager", () => {
  it("concatenates a full page and a short page", async () => {
    const rows = await collectPagedRows<number>(async (from) => {
      if (from === 0) {
        return {
          data: Array.from({ length: POSTGREST_PAGE_SIZE }, (_, index) => index + 1),
          error: null,
        }
      }

      return { data: [1001, 1002], error: null }
    }, failures)

    expect(rows).toHaveLength(1002)
    expect(rows.at(-1)).toBe(1002)
  })

  it("throws loudly when the page budget is exhausted instead of returning a short list", async () => {
    let calls = 0

    await expect(
      collectPagedRows<number>(async () => {
        calls += 1
        return { data: Array.from({ length: POSTGREST_PAGE_SIZE }, (_, index) => index), error: null }
      }, failures),
    ).rejects.toThrow("truncated")

    expect(calls).toBe(POSTGREST_MAX_PAGES)
  })

  it("maps a read error to the caller's own failure", async () => {
    await expect(
      collectPagedRows<number>(async () => ({ data: null, error: { message: "boom" } }), failures),
    ).rejects.toThrow("read failed")
  })
})
