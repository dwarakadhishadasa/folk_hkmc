/**
 * Matrix rows 13, 14 and 15 — the API layer.
 *
 * These three are the rows `matrix-coverage-map.md` marked Coverable "with no
 * fixture dependency", so they are the suite's end-to-end proof that the harness
 * can reach the real route at all: no browser, no interception, no mock. Every
 * assertion below is about a **real** status code and a **real** body from
 * `handleManageContactBulkUpdate`, which is the point the map makes when it says
 * the API layer "also proves the route's real status codes rather than a mock's
 * idea of them".
 *
 * "No fixture dependency" means no *new* fixture generation: the three ids these
 * tests need are three ordinary rows out of the set `pnpm seed:local` and
 * `pnpm seed:bulk-local` already produce, and both are restored afterwards. Rows
 * 13 and 15 write nothing at all.
 *
 * The rows, verbatim from the story 2 matrix:
 *
 * | Row | Scenario                 | Expected                                            |
 * | --- | ------------------------ | --------------------------------------------------- |
 * | 13  | Batch body over the cap  | `400` naming the cap; no partial write               |
 * | 14  | Bad `contactId`          | that item fails alone; the rest commit               |
 * | 15  | Item omits `contactId`   | that item fails with `contactId must be a UUID.`; the rest commit |
 *
 * Row 15 is not a duplicate of row 14: they fail in different places. A
 * non-UUID string is rejected by `normalizeContactId`, while a missing key is
 * rejected by the same call on `undefined` — and the second is the case a
 * client bug actually produces.
 */

import { expect, test, type APIRequestContext } from "@playwright/test"

import { inScopeContacts } from "../fixtures/bulk-contacts"
import { readFavoriteFlags, restoreFavoriteFlags } from "../fixtures/manage-grid"

/** The batch route, addressed the way the client addresses it. */
const BULK_ENDPOINT = "/api/manage/contacts/bulk"

/** `MANAGE_BULK_MAX_ITEMS` in `lib/manage/api-handlers.ts`. */
const CAP = 200

/** How many distinct rows row 13's over-cap envelope names. */
const OVER_CAP_ITEMS = 250

/** Per-row outcome, as `handleManageContactBulkUpdate` returns it. */
interface BulkResult {
  contactId: string | null
  ok: boolean
  contact?: { id: string; isFavorite: boolean }
  error?: string
}

async function patchBulk(
  request: APIRequestContext,
  items: unknown[],
): Promise<{ status: number; body: unknown; results: BulkResult[] }> {
  const response = await request.patch(BULK_ENDPOINT, { data: { items } })
  const text = await response.text()

  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // A non-JSON body is itself the finding; the status assertion reports it.
  }

  const results = (body as { results?: unknown } | null)?.results

  return {
    status: response.status(),
    body,
    results: Array.isArray(results) ? (results as BulkResult[]) : [],
  }
}

/** `ids` distinct in-scope rows, or a thrown explanation of why there are none. */
async function requireInScopeIds(count: number): Promise<string[]> {
  const rows = await inScopeContacts()
  const ids = rows.map((row) => row.id)

  expect(
    ids.length,
    "the suite needs in-scope rows for the batch rows; run `pnpm seed:local` and let globalSetup generate them",
  ).toBeGreaterThanOrEqual(count)

  return ids.slice(0, count)
}

test.describe("bulk envelope: cap, bad contactId, missing contactId", () => {
  test("row 13 — a body over the 200-item cap is 400, names the cap, and writes nothing", async ({ request }) => {
    const ids = await requireInScopeIds(3)
    const before = await readFavoriteFlags(ids)

    try {
      // The matrix says 250 items against a cap of 200. Distinct real ids are
      // cycled so a batch that *did* write would be visible on several rows rather
      // than masked by one id appearing 250 times.
      const items = Array.from({ length: OVER_CAP_ITEMS }, (_, index) => ({
        contactId: ids[index % ids.length],
        patch: { isFavorite: true },
      }))

      const { status, body, results } = await patchBulk(request, items)

      expect(status, `an over-cap envelope must be rejected before any write. Body: ${JSON.stringify(body)}`).toBe(400)

      // The cap is named, and it is the *server's* number rather than the spec's.
      expect((body as { error?: string }).error).toContain(String(CAP))
      expect((body as { error?: string }).error).toMatch(/rows or fewer/i)

      // "No partial write" has to mean no write at all, so the absence of a
      // per-item report is asserted too — on the **raw body**, not on `results`.
      // `patchBulk` normalises anything that is not an array to `[]`, so asserting
      // on it would compare `[]` with `[]` and would pass for a body that carried
      // `results: "unavailable"`.
      expect(body, "a rejected envelope must not report per-row outcomes").not.toHaveProperty("results")
      expect(results).toEqual([])

      await expect
        .poll(async () => [...(await readFavoriteFlags(ids)).entries()].sort(), {
          message: "an over-cap envelope must leave every row untouched",
        })
        .toEqual([...before.entries()].sort())
    } finally {
      // Nothing should have been written, so this is normally a no-op. It is here
      // because a cap that regressed *would* write, and three poisoned fixtures
      // would outlive the run that revealed it.
      await restoreFavoriteFlags(before)
    }
  })

  test("row 14 — one non-UUID contactId fails alone and every other item commits", async ({ request }) => {
    const ids = await requireInScopeIds(3)
    const before = await readFavoriteFlags(ids)

    try {
      const { status, results } = await patchBulk(request, [
        { contactId: ids[0], patch: { isFavorite: true } },
        // Not a UUID, so `normalizeContactId` rejects it before any Supabase call.
        { contactId: "not-a-uuid", patch: { isFavorite: true } },
        { contactId: ids[1], patch: { isFavorite: true } },
        { contactId: ids[2], patch: { isFavorite: true } },
      ])

      // Per-item isolation means a 200. A 400 here would be the batch rejection
      // the matrix forbids.
      expect(status).toBe(200)
      expect(results).toHaveLength(4)

      const bad = results.find((entry) => entry.contactId === "not-a-uuid")
      expect(bad, "the malformed item must still be reported, not dropped").toBeDefined()
      expect(bad?.ok).toBe(false)
      expect(bad?.error).toBe("contactId must be a UUID.")

      for (const id of ids) {
        const result = results.find((entry) => entry.contactId === id)
        expect(result?.ok, `item ${id} must commit alongside the failure`).toBe(true)
        expect(result?.contact?.id).toBe(id)
      }

      await expect
        .poll(async () => [...(await readFavoriteFlags(ids)).entries()].sort(), {
          message: "every valid item must have committed while the malformed one failed",
        })
        .toEqual(ids.map((id) => [id, true]).sort())
    } finally {
      await restoreFavoriteFlags(before)
    }
  })

  test("row 15 — an item omitting contactId fails with the UUID message and the rest commit", async ({ request }) => {
    const ids = await requireInScopeIds(3)
    const before = await readFavoriteFlags(ids)

    try {
      const { status, results } = await patchBulk(request, [
        { contactId: ids[0], patch: { isFavorite: true } },
        // `contactId` absent entirely — the shape a client bug produces.
        { patch: { isFavorite: true } },
        { contactId: ids[1], patch: { isFavorite: true } },
      ])

      expect(status, "a missing key is a per-row fault, never an envelope fault").toBe(200)
      expect(results).toHaveLength(3)

      const missing = results.find((entry) => entry.contactId === null)
      expect(missing, "an item with no contactId must be reported, not silently skipped").toBeDefined()
      expect(missing?.ok).toBe(false)
      expect(missing?.error).toBe("contactId must be a UUID.")

      for (const id of ids.slice(0, 2)) {
        expect(results.find((entry) => entry.contactId === id)?.ok).toBe(true)
      }

      // One read per poll iteration: two reads in the same predicate can observe
      // two different database snapshots and pass on a state that never existed.
      const committed = ids.slice(0, 2)
      await expect
        .poll(
          async () => {
            const flags = await readFavoriteFlags(committed)
            return committed.every((id) => flags.get(id) === true)
          },
          { message: "the two well-formed items must have committed" },
        )
        .toBe(true)

      // The third row was never sent, so its value must be exactly what it was —
      // read fresh, after the poll settled, rather than from the snapshot taken
      // before the request.
      const after = await readFavoriteFlags([ids[2]])
      expect(after.get(ids[2]), "only the two sent items may change").toBe(before.get(ids[2]))
    } finally {
      await restoreFavoriteFlags(before)
    }
  })
})
