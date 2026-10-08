/**
 * Matrix rows 9, 10, 11 and 16 — the bulk action and the batch route's failure
 * modes.
 *
 * | Row | Scenario                    | Layer        | Expected                                                                   |
 * | --- | --------------------------- | ------------ | -------------------------------------------------------------------------- |
 * | 9   | Bulk all succeed            | API + UI     | one result line per selected row, every row a success, rows update         |
 * | 10  | Bulk partial success        | API          | a result row per selected row; the failures name their row and their reason; successes are not collapsed |
 * | 11  | Bulk with one unreachable row | Intercept  | that row reports a failure of its own; the others still commit              |
 * | 16  | Bulk response malformed     | Intercept    | the client reports a bulk failure naming the response and claims no success |
 *
 * Every test restores the `is_favorite` values it changed, **including the
 * verification writes** — the API half of row 9 and the server-side commits rows 11
 * and 16 rely on are writes too. The fixtures are shared, and a leaked write makes
 * the next spec's preconditions a lie.
 *
 * Two interception shapes appear here, and the difference matters:
 *
 *   - `route.fetch()` **performs the real request** against the real handler, so
 *     the writes below are genuine and are read back from the database. Only the
 *     *report* is then rewritten. Row 11 needs this: its claim is that the other
 *     rows really committed.
 *   - `route.abort()` **stops the request**, so nothing reaches the handler at all.
 *     That is the subject of row 11's second test, where the point is that nothing
 *     was written — the one place in this suite where the handler deliberately does
 *     not run.
 *
 * ## Row 11's mapping, stated rather than glossed
 *
 * The matrix asks for "`fetch` rejects for one item only". The shipped batch is
 * **one** HTTP request carrying every item, so there is no per-item request for
 * a network failure to be scoped to — the reachable expression of that clause is
 * an item whose outcome the server never reports. The spec therefore asserts both
 * halves honestly:
 *
 *   1. The response omits one item's outcome. `route.fetch()` lets the **real**
 *      handler run and commit, and only then is the body rewritten without that
 *      row — so the other rows' commits are real writes read back from the
 *      database, not a mock's say-so.
 *   2. The whole request is dropped. Every row must then report a failure of its
 *      own and none may be claimed as saved.
 */

import { expect, test, type Page } from "@playwright/test"

import { inScopeContacts, outOfScopeContacts } from "../fixtures/bulk-contacts"
import {
  BULK_CONTACT_ROUTE,
  bulkActionButton,
  bulkReportPanel,
  bulkReportRows,
  expectVisibleCount,
  filterGlobally,
  favoriteStar,
  openContactsGrid,
  readFavoriteFlags,
  renderedRows,
  restoreFavoriteFlags,
  selectionCount,
} from "../fixtures/manage-grid"
import { storageStatePath } from "../fixtures/roles"

/** Ten generated rows, indices 0000–0009; enough to pick five from. */
const TEN_ROWS = "preview-fixture-bulk-folk-000"

const BULK_ENDPOINT = "/api/manage/contacts/bulk"

interface BulkResult {
  contactId: string | null
  ok: boolean
  contact?: { id: string; isFavorite: boolean }
  error?: string
}

/** The text of every line in the per-row report, in order. */
async function reportLines(page: Page): Promise<string[]> {
  return bulkReportRows(page).allInnerTexts()
}

/**
 * Each selected row's rendered favorite state, keyed by id.
 *
 * Read *before* the action rather than assumed: `bulk-contact-fixtures.mjs`
 * generates `is_favorite: index % 5 === 0`, so index 0000 is a favourite and
 * 0001–0004 are not. An absolute `aria-pressed="false"` is therefore wrong for
 * one row in five, and asserting it would either fail for the wrong reason or —
 * worse — pass only because an earlier spec had leaked a write.
 */
async function renderedFavorites(page: Page, ids: readonly string[]): Promise<Map<string, string | null>> {
  const states = new Map<string, string | null>()

  for (const id of ids) {
    states.set(id, await favoriteStar(page, id).getAttribute("aria-pressed"))
  }

  return states
}

/** Select the first `count` rows of the current filtered view. */
async function selectFirstRows(page: Page, count: number): Promise<string[]> {
  const ids: string[] = []

  for (let index = 0; index < count; index += 1) {
    const row = renderedRows(page).nth(index)
    const id = await row.getAttribute("data-grid-row")
    if (!id) throw new Error(`Rendered row ${index} carries no data-grid-row id.`)

    await row.getByRole("checkbox").click()
    ids.push(id)
  }

  return ids
}

test.describe("bulk contact updates", () => {
  test("row 9 — five selected rows each report their own success and the rows update", async ({ page, request }) => {
    await openContactsGrid(page)
    await filterGlobally(page, TEN_ROWS)
    await expectVisibleCount(page, 10)

    const selected = await selectFirstRows(page, 5)
    await expect(selectionCount(page)).toHaveText("5 selected")

    const before = await readFavoriteFlags(selected)
    try {
      await bulkActionButton(page).click()
      await expect(bulkReportPanel(page)).toBeVisible()

      // One line per selected row, successes included. A collapsed summary is
      // the failure this row names, so the count is asserted, not inferred.
      await expect(bulkReportRows(page)).toHaveCount(5)
      await expect(bulkReportPanel(page).getByRole("status")).toHaveText("5 of 5 rows saved.")

      const lines = await reportLines(page)
      for (const line of lines) {
        expect(line, `every row must report its own outcome, got: ${JSON.stringify(lines)}`).toContain("Saved.")
      }

      // The rows themselves updated, in the grid and in the database.
      for (const id of selected) {
        await expect(favoriteStar(page, id), `row ${id} should now be a favorite`).toHaveAttribute(
          "aria-pressed",
          "true",
        )
      }

      await expect
        .poll(
          async () => {
            const flags = await readFavoriteFlags(selected)
            return [...flags.entries()].sort()
          },
          { message: "every selected row must have been written" },
        )
        .toEqual(selected.map((id) => [id, true]).sort())

      // Selection clears after the run, never during it — the operator has to be
      // able to read the outcomes and then select again.
      await expect(selectionCount(page)).toHaveText("0 selected")
    } finally {
      await restoreFavoriteFlags(before)
    }

    // The same five items, straight at the route: the API half of "API + UI",
    // proving the route's own status code and body rather than the client's view.
    // It writes too, so it carries its own capture and restore — a verification
    // write is still a write.
    const pristine = await readFavoriteFlags(selected)
    try {
      const response = await request.patch(BULK_ENDPOINT, {
        data: { items: selected.map((contactId) => ({ contactId, patch: { isFavorite: false } })) },
      })
      expect(response.status()).toBe(200)

      const body = (await response.json()) as { results: BulkResult[] }
      expect(body.results).toHaveLength(5)
      for (const result of body.results) {
        expect(result.ok, `item ${result.contactId} should commit`).toBe(true)
        expect(result.contact?.id).toBe(result.contactId)
      }
    } finally {
      await restoreFavoriteFlags(pristine)
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

  test("row 11 — one row's missing outcome is reported alone; the rest really commit", async ({ page }) => {
    await openContactsGrid(page)
    await filterGlobally(page, TEN_ROWS)
    await expectVisibleCount(page, 10)

    const selected = await selectFirstRows(page, 5)
    const unreachable = selected[4]
    const before = await readFavoriteFlags(selected)

    // `route.fetch()` performs the real request against the real handler, so the
    // commits below are genuine writes. Only the *report* is rewritten, which is
    // the failure mode the row is about: an item whose outcome never arrives.
    const renderedBefore = await renderedFavorites(page, selected)

    let rewritten = false
    await page.route(BULK_CONTACT_ROUTE, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }

      // A handler that throws here would leave the route unresolved and the
      // request hanging until the test timeout, which reads like a product bug.
      // Aborting turns it into an immediate, attributable failure.
      let kept: BulkResult[] = []
      let status = 200

      try {
        const response = await route.fetch()
        status = response.status()
        const body = (await response.json()) as { results?: BulkResult[] }
        kept = (body.results ?? []).filter((entry) => entry.contactId !== unreachable)
      } catch {
        await route.abort("failed")
        return
      }

      rewritten = true
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ results: kept }),
      })
    })

    try {
      await bulkActionButton(page).click()
      await expect(bulkReportPanel(page)).toBeVisible()
      expect(rewritten, "the interception must have applied, or this row proved nothing").toBe(true)

      await expect(bulkReportRows(page)).toHaveCount(5)
      await expect(bulkReportPanel(page).getByRole("status")).toHaveText("4 of 5 rows saved.")

      const lines = await reportLines(page)
      expect(lines.filter((line) => line.includes("Saved.")), "the four confirmed rows").toHaveLength(4)

      // The unreported row gets its own line and is not folded into a success.
      const unreachableLine = lines[4]
      expect(unreachableLine, "the unreported row must still have a line").toBeTruthy()
      expect(unreachableLine).not.toContain("Saved.")
      expect(unreachableLine).toContain("did not report a result")
      expect(unreachableLine).toContain("✕")

      // The four confirmed rows really are written — read from the database, not
      // from the response the client was shown.
      await expect
        .poll(
          async () => {
            const flags = await readFavoriteFlags(selected)
            return selected.filter((id) => id !== unreachable && flags.get(id) === true).length
          },
          { message: "the rows the server confirmed must have committed" },
        )
        .toBe(4)

      // And the client did not apply the unreported row locally: its cell is
      // exactly what it was, rather than a fabricated success. Compared against
      // what was rendered before the action, not against an assumed value.
      expect(
        await favoriteStar(page, unreachable).getAttribute("aria-pressed"),
        "the unreported row must keep the value the operator can already see",
      ).toBe(renderedBefore.get(unreachable))

      // The four the server confirmed did move — so the comparison above is not
      // passing because nothing changed anywhere.
      for (const id of selected.filter((candidate) => candidate !== unreachable)) {
        expect(await favoriteStar(page, id).getAttribute("aria-pressed")).toBe("true")
      }
    } finally {
      await page.unroute(BULK_CONTACT_ROUTE)
      await restoreFavoriteFlags(before)
    }
  })

  test("row 11 (dropped request) — no row is claimed saved when the batch never lands", async ({ page }) => {
    await openContactsGrid(page)
    await filterGlobally(page, TEN_ROWS)
    await expectVisibleCount(page, 10)

    const selected = await selectFirstRows(page, 3)
    const before = await readFavoriteFlags(selected)

    await page.route(BULK_CONTACT_ROUTE, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }

      await route.abort("connectionrefused")
    })

    try {
      await bulkActionButton(page).click()
      await expect(bulkReportPanel(page)).toBeVisible()

      await expect(bulkReportPanel(page).getByRole("status")).toContainText("Nothing was saved.")
      const lines = await reportLines(page)
      expect(lines).toHaveLength(3)
      for (const line of lines) {
        expect(line).toContain("Unable to reach the server.")
        expect(line).not.toContain("Saved.")
      }

      // Nothing reached the server, so nothing was written.
      const after = await readFavoriteFlags(selected)
      for (const id of selected) {
        expect(after.get(id), "a dropped batch must leave every row untouched").toBe(before.get(id))
      }
    } finally {
      await page.unroute(BULK_CONTACT_ROUTE)
    }
  })

  test("row 16 — a 200 without results is reported as a bulk failure and claims no success", async ({ page }) => {
    await openContactsGrid(page)
    await filterGlobally(page, TEN_ROWS)
    await expectVisibleCount(page, 10)

    const selected = await selectFirstRows(page, 5)
    const before = await readFavoriteFlags(selected)

    const renderedBefore = await renderedFavorites(page, selected)

    // A 200 whose body has no `results` at all: the envelope cannot be verified,
    // so nothing may be presented as saved.
    await page.route(BULK_CONTACT_ROUTE, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    })

    try {
      await bulkActionButton(page).click()
      await expect(bulkReportPanel(page)).toBeVisible()

      await expect(bulkReportPanel(page).getByRole("status")).toContainText("Nothing was saved.")

      const lines = await reportLines(page)
      expect(lines, "a result line per selected row even when the envelope is unusable").toHaveLength(5)
      for (const line of lines) {
        expect(line).toContain("did not include per-row results")
        expect(line).not.toContain("Saved.")
      }

      // No success state on an unverified payload: every row still shows exactly
      // what it showed before the action, and nothing was written.
      expect(await renderedFavorites(page, selected), "no row may move on an unverifiable envelope").toEqual(
        renderedBefore,
      )
      const after = await readFavoriteFlags(selected)
      expect([...after.entries()].sort()).toEqual([...before.entries()].sort())
    } finally {
      await page.unroute(BULK_CONTACT_ROUTE)
      await restoreFavoriteFlags(before)
    }
  })
})
