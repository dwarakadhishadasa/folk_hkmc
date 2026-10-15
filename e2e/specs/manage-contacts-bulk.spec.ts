/**
 * Matrix rows 9 and 10 — the bulk action and the batch route's failure modes,
 * at the API layer.
 *
 * | Row | Scenario                    | Layer        | Expected                                                                   |
 * | --- | --------------------------- | ------------ | -------------------------------------------------------------------------- |
 * | 9   | Bulk all succeed            | API          | one result per item, every item a success                                  |
 * | 10  | Bulk partial success        | API          | a result row per selected row; the failures name their row and their reason; successes are not collapsed |
 *
 * Every test restores the `is_favorite` values it changed — a verification
 * write is still a write. The fixtures are shared, and a leaked write makes
 * the next spec's preconditions a lie.
 *
 * **What changed, and why rows 11 and 16 are gone.** Rows 11 (one unreachable
 * row) and 16 (malformed `results` body) were covered through the client's
 * bulk affordance: the "Add selected to favorites" button and its per-row
 * report panel. That affordance no longer exists — the client offers no bulk
 * action at all — so there is no UI left to intercept against, and the tests
 * that drove it were removed with it rather than rewritten against a surface
 * that is gone. The route itself still exists and still reports per-row
 * outcomes; rows 13, 14 and 15 in `manage-contacts-api.spec.ts` continue to
 * cover its envelope. `matrix-coverage-map.md` rows 9, 11 and 16 carry the
 * same note.
 */

import { expect, test } from "@playwright/test"

import { inScopeContacts, outOfScopeContacts } from "../fixtures/bulk-contacts"
import { readFavoriteFlags, restoreFavoriteFlags } from "../fixtures/manage-grid"
import { storageStatePath } from "../fixtures/roles"

const BULK_ENDPOINT = "/api/manage/contacts/bulk"

interface BulkResult {
  contactId: string | null
  ok: boolean
  contact?: { id: string; isFavorite: boolean }
  error?: string
}

test.describe("bulk contact updates", () => {
  test("row 9 — five items each report their own success", async ({ request }) => {
    const selected = (await inScopeContacts()).slice(0, 5).map((row) => row.id)
    expect(selected, "row 9 needs five rows the Admin's session can write").toHaveLength(5)

    const before = await readFavoriteFlags(selected)
    try {
      const response = await request.patch(BULK_ENDPOINT, {
        data: { items: selected.map((contactId) => ({ contactId, patch: { isFavorite: true } })) },
      })
      expect(response.status()).toBe(200)

      const body = (await response.json()) as { results: BulkResult[] }
      expect(body.results).toHaveLength(5)
      for (const result of body.results) {
        expect(result.ok, `item ${result.contactId} should commit`).toBe(true)
        expect(result.contact?.id).toBe(result.contactId)
      }

      await expect
        .poll(
          async () => {
            const flags = await readFavoriteFlags(selected)
            return [...flags.entries()].sort()
          },
          { message: "every item must have been written" },
        )
        .toEqual(selected.map((id) => [id, true]).sort())
    } finally {
      await restoreFavoriteFlags(before)
    }
  })

  test("row 10 — a partial batch reports each failure with its own reason", async ({ browser }) => {
    const inScope = (await inScopeContacts()).slice(0, 3)
    const outOfScope = (await outOfScopeContacts()).slice(0, 2)

    expect(inScope.length, "row 10 needs three rows the Preacher's session can write").toBe(3)
    expect(outOfScope.length, "row 10 needs two rows the Preacher's session cannot write").toBe(2)

    const writable = inScope.map((row) => row.id)
    const forbidden = outOfScope.map((row) => row.id)
    const before = await readFavoriteFlags([...writable, ...forbidden])

    // The Preacher's own session, so "outside your assigned scope" is a real
    // per-row authorization outcome rather than a forced one.
    const context = await browser.newContext({ storageState: storageStatePath("preacher") })

    try {
      const response = await context.request.patch(BULK_ENDPOINT, {
        data: {
          items: [
            ...writable.map((contactId) => ({ contactId, patch: { isFavorite: true } })),
            ...forbidden.map((contactId) => ({ contactId, patch: { isFavorite: true } })),
          ],
        },
      })

      // Per-item isolation: a batch with failures in it is still a 200.
      expect(response.status()).toBe(200)

      const body = (await response.json()) as { results: BulkResult[] }
      expect(body.results, "a result row per selected row, successes included").toHaveLength(5)

      for (const id of writable) {
        const result = body.results.find((entry) => entry.contactId === id)
        expect(result?.ok, `in-scope item ${id} must commit`).toBe(true)
        expect(result?.contact?.id).toBe(id)
      }

      for (const id of forbidden) {
        const result = body.results.find((entry) => entry.contactId === id)
        expect(result?.ok, `out-of-scope item ${id} must fail on its own`).toBe(false)
        // The failure names its own reason, so an operator is not left guessing.
        expect(result?.error).toMatch(/outside your assigned scope/i)
        expect(result?.contact, "a failed row must not carry a written row").toBeUndefined()
      }

      await expect
        .poll(
          async () => {
            const flags = await readFavoriteFlags([...writable, ...forbidden])
            return {
              written: writable.filter((id) => flags.get(id) === true).length,
              unchanged: forbidden.filter((id) => flags.get(id) === before.get(id)).length,
            }
          },
          { message: "three commit and two are refused, independently" },
        )
        .toEqual({ written: 3, unchanged: 2 })
    } finally {
      await context.close()
      await restoreFavoriteFlags(before)
    }
  })
})
