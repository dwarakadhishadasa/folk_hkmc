/**
 * Matrix rows 1–5 — inline editing, over the UI and route-interception layers.
 *
 * | Row | Scenario                     | Layer   | Mechanism                          |
 * | --- | ---------------------------- | ------- | ---------------------------------- |
 * | 1   | Happy-path cell edit         | UI      | real PATCH, held open to see the optimistic display |
 * | 2   | Edit persists after reload   | UI      | real PATCH, then a full reload     |
 * | 3   | Rejected cell edit (400)     | Intercept | fulfil `400 {"error":"Name is required."}` |
 * | 4   | Empty required field         | UI      | real PATCH with `phone: ""`        |
 * | 5   | Network failure on edit      | Intercept | `route.abort()` on the PATCH      |
 *
 * Rows 3 and 5 are the two the map calls "failure modes a live server will not
 * produce on demand". The interception replaces the **response**, never the
 * handler: row 4's second test proves the real handler really does answer 400 with
 * `Phone is required.`, which is what makes row 3's forced body worth asserting
 * against.
 *
 * Every test narrows the grid to a single row before editing, because the rows
 * are virtualized and an unfiltered grid does not render the row under test.
 *
 * ## Rows 1 and 4 are `test.fail`, and that is a finding
 *
 * Both rows require an **optimistic display** — the new value on screen *before*
 * the write resolves. Both specs hold the PATCH response open and assert the cell
 * while the request is still in flight, and both fail: the cell keeps showing the
 * prior value until the server answers.
 *
 * The cause is one line, in `renderCellNode` (`components/grid/use-grid-keyboard.ts`):
 *
 * ```ts
 * return flexRender(cell.column.columnDef.cell, cell.getContext()) ?? undefined
 * ```
 *
 * `table._getDefaultColumnDef()` (`@tanstack/table-core@8.21.3`,
 * `core/table.js:150-159`) supplies a `cell` renderer for **every** column —
 * `props => props.renderValue()?.toString() ?? null` — so `columnDef.cell` is
 * never absent and the `?? undefined` never fires. `GridCellView.render` is
 * therefore always defined, and `GridRow`'s `cell.render !== undefined ? … :
 * cell.text` always takes the first branch. `cell.text` — which carries the
 * override, the `GRID_EMPTY_TEXT` placeholder and the `title` tooltip — is dead
 * for every accessor column.
 *
 * `test.fail` rather than `test.fixme` on purpose: the body still runs, so the
 * assertion stays live, and the moment the defect is fixed this test reports
 * "unexpectedly passed" and the suite goes red. That is the tripwire that forces
 * the two verdicts in `matrix-coverage-map.md` to be revisited rather than
 * silently left on Manual.
 *
 * Each of those two rows is therefore **split in two**. A `test.fail` body aborts
 * at its first failed assertion and inverts its verdict for everything after it, so
 * a single combined test would (a) never execute the row's remaining clauses and
 * (b) be unable to fail the suite even if it did. Rows 1 and 4 each get a
 * `test.fail` test holding only the optimistic-display assertion, plus an ordinary
 * test — `row 1 (remaining clauses)` and `row 4 (remaining clauses)` — that asserts
 * the one-PATCH / commit clauses and the server-400 / revert clauses, and that can
 * turn the run red.
 *
 * The remediation is a one-liner in story 2's own code — render `cell.render`
 * only when the consumer supplied a `cell` renderer, rather than whenever
 * TanStack's default is present. It is **not** applied here: this story
 * explicitly does not re-implement story 2's table, and a fix belongs in the
 * story that owns the behaviour, recorded against its own run.
 */

import { expect, test, type Page } from "@playwright/test"

import { inScopeContacts, phoneSetContacts } from "../fixtures/bulk-contacts"
import { e2eProgramId } from "../fixtures/roles"
import {
  cellIn,
  filterGlobally,
  gridStatusLine,
  openContactsGrid,
  readContactColumn,
  readContactNames,
  restoreContactNames,
  rowById,
  SINGLE_CONTACT_ROUTE,
} from "../fixtures/manage-grid"

const GRID_EMPTY_TEXT = "—" // `GRID_EMPTY_TEXT` in components/grid/use-grid-keyboard.ts

/**
 * Rows are addressed by their generated index fragment, and each test takes its
 * own so one test's committed edit cannot change what the next test is looking
 * for. The fragment is 4-digit zero-padded, so `-0007-` matches exactly one row.
 */
const TARGET_OFFSETS = {
  happyPath: 7,
  persists: 11,
  rejected: 13,
  emptyPhone: 17,
  network: 19,
} as const

async function inScopeRow(offset: number): Promise<{ id: string; name: string }> {
  const rows = await inScopeContacts()
  const row = rows[offset]

  if (!row) {
    throw new Error(`No in-scope contact at offset ${offset}; the suite needs generated fixtures.`)
  }

  return { id: row.id, name: row.name }
}

/** Open the grid narrowed to one row, and focus that row's `name` cell. */
async function focusNameCell(page: Page, id: string, name: string): Promise<void> {
  await openContactsGrid(page)
  await filterGlobally(page, name)
  await expect(rowById(page, id), "the filtered row should be the one under test").toBeVisible()

  // Pointer focus is what tells the grid which column `e` applies to; without it
  // `e` opens the row's first editable cell, which happens to be `name` too.
  await cellIn(rowById(page, id), "name").click()
}

/** A PATCH interception that counts requests and holds each response open. */
function holdContactPatch(page: Page): { requests: unknown[]; release: () => void } {
  const requests: unknown[] = []
  let open: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    open = resolve
  })

  void page.route(SINGLE_CONTACT_ROUTE, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue()
      return
    }

    requests.push(route.request().postDataJSON())
    await held
    await route.continue()
  })

  return { requests, release: open }
}

/** The in-cell editor the keyboard hook mounts. */
function cellEditor(page: Page) {
  return page.getByRole("textbox", { name: "Edit cell value" })
}

/**
 * Empty the editor with real keystrokes.
 *
 * `fill("")` is not used: the editor is a controlled input, and clearing it
 * through the value setter is not guaranteed to raise the `change` React listens
 * for — which would leave the draft at the old value and turn the commit into a
 * no-op that still satisfied the revert assertions.
 */
async function clearCellEditor(page: Page): Promise<void> {
  await cellEditor(page).press("ControlOrMeta+a")
  await cellEditor(page).press("Backspace")
  await expect(cellEditor(page)).toHaveValue("")
}

/**
 * A generated row with a phone set, chosen by its offset in the generated set.
 *
 * `phoneSetContacts` is asked for far more rows than the offset needs, so the
 * choice is by position rather than by a modulo over a short list — a modulo
 * would silently address a different row as the fixture set grows.
 */
async function phoneRow(): Promise<{ id: string; name: string; phone: string }> {
  const offset = TARGET_OFFSETS.emptyPhone
  const rows = await phoneSetContacts(e2eProgramId(), offset + 1)

  const row = rows[offset]
  if (!row) {
    throw new Error(
      `No row with a phone set at offset ${offset}; the suite needs generated fixtures. ` +
        `Run \`pnpm seed:local\` and let globalSetup generate them.`,
    )
  }

  return row
}

test.describe("inline cell editing", () => {
  test.fail("row 1 — a committed edit shows the new value before the response lands", async ({ page }) => {
    const target = await inScopeRow(TARGET_OFFSETS.happyPath)
    const renamed = `${target.name}-Edited`
    const originalNames = await readContactNames([target.id])

    await focusNameCell(page, target.id, target.name)

    const { release } = holdContactPatch(page)
    try {
      await page.keyboard.press("e")
      await expect(cellEditor(page)).toBeFocused()

      // The editor selects its contents on mount, so typing replaces rather
      // than appends.
      await page.keyboard.type(renamed)
      await page.keyboard.press("Enter")

      // Observed while the response is still held open, so the only possible
      // source of this text is the client's own state.
      await expect(
        cellIn(rowById(page, target.id), "name"),
        "the new value must show before the response lands",
      ).toHaveText(renamed)
    } finally {
      release()
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await restoreContactNames(originalNames)
    }
  })

  test("row 1 (remaining clauses) — one Enter is one PATCH carrying the new value, and it commits", async ({ page }) => {
    const target = await inScopeRow(TARGET_OFFSETS.happyPath)
    const renamed = `${target.name}-Edited`
    const originalNames = await readContactNames([target.id])

    // Deliberately **not** `test.fail`, and deliberately without the response
    // hold. Those two facts are what make this test able to turn the suite red:
    // a `test.fail` body cannot, and its assertions after the first failure never
    // run at all.
    const requests: unknown[] = []
    await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
      if (route.request().method() === "PATCH") {
        requests.push(route.request().postDataJSON())
      }
      await route.continue()
    })

    try {
      await focusNameCell(page, target.id, target.name)

      await page.keyboard.press("e")
      await expect(cellEditor(page)).toBeFocused()
      await page.keyboard.type(renamed)
      await page.keyboard.press("Enter")

      await expect
        .poll(() => requests.length, { message: "the commit must reach the single-row route" })
        .toBe(1)

      // Exactly one, with the right payload. A retry, a double-fire or a wrong
      // key would all be caught here and nowhere else in the suite.
      expect(requests, "one edit is one PATCH").toHaveLength(1)
      expect(requests[0]).toMatchObject({ contactId: target.id, name: renamed })

      await expect
        .poll(async () => (await readContactNames([target.id])).get(target.id), {
          message: "the committed value must reach the database",
        })
        .toBe(renamed)

      const cell = cellIn(rowById(page, target.id), "name")
      await expect(cell).toHaveText(renamed)
      await expect(cell, "a resolved commit must not leave a destructive cell").not.toHaveClass(
        /text-destructive/,
      )
      await expect(gridStatusLine(page)).toHaveText("")
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await restoreContactNames(originalNames)
    }
  })

  test("row 2 — a committed edit is the server's value after a reload", async ({ page }) => {
    const target = await inScopeRow(TARGET_OFFSETS.persists)
    const renamed = `${target.name}-Persisted`
    const originalNames = await readContactNames([target.id])

    try {
      await focusNameCell(page, target.id, target.name)

      await page.keyboard.press("e")
      await expect(cellEditor(page)).toBeFocused()
      await page.keyboard.type(renamed)
      await page.keyboard.press("Enter")

      await expect
        .poll(async () => (await readContactNames([target.id])).get(target.id), {
          message: "the edit must commit before the reload proves anything",
        })
        .toBe(renamed)

      // A full reload rebuilds the payload from the server, so no local override
      // can be what is on screen here.
      await openContactsGrid(page)
      await filterGlobally(page, renamed)

      await expect(rowById(page, target.id)).toBeVisible()
      await expect(cellIn(rowById(page, target.id), "name")).toHaveText(renamed)
      await expect(gridStatusLine(page), "a reload must not surface a stale edit error").toHaveText("")
    } finally {
      await restoreContactNames(originalNames)
    }
  })

  test("row 3 — a 400 reverts the cell visibly, marks it destructive and shows the server message", async ({ page }) => {
    const target = await inScopeRow(TARGET_OFFSETS.rejected)
    const original = target.name

    await focusNameCell(page, target.id, target.name)

    await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Name is required." }),
      })
    })

    try {
      await page.keyboard.press("e")
      await expect(cellEditor(page)).toBeFocused()
      await page.keyboard.type(`${original}-Rejected`)
      await page.keyboard.press("Enter")

      const cell = cellIn(rowById(page, target.id), "name")

      // Reverted, not left holding the rejected draft.
      await expect(cell).toHaveText(original)
      await expect(cell, "a rejected cell must be marked destructive").toHaveClass(/text-destructive/)
      await expect(gridStatusLine(page)).toContainText("Name is required.")
      await expect(gridStatusLine(page)).toBeVisible()

      // Rejection contained: the row never left the database carrying the draft.
      expect((await readContactNames([target.id])).get(target.id)).toBe(original)
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE)
    }
  })

  test.fail("row 4 — clearing a required field shows the empty value before the response lands", async ({ page }) => {
    const target = await phoneRow()

    await openContactsGrid(page)
    await filterGlobally(page, target.name)
    await expect(rowById(page, target.id)).toBeVisible()

    const phoneCell = cellIn(rowById(page, target.id), "phone")
    await expect(phoneCell).toHaveText(target.phone)

    await phoneCell.click()

    const { release } = holdContactPatch(page)
    try {
      await page.keyboard.press("e")
      await expect(cellEditor(page)).toBeFocused()
      await clearCellEditor(page)
      await page.keyboard.press("Enter")

      // The optimistic display of an empty value, observed while the PATCH is
      // still in flight.
      await expect(
        phoneCell,
        "the empty value shows before the server answers",
      ).toHaveText(GRID_EMPTY_TEXT)
    } finally {
      release()
      await page.unroute(SINGLE_CONTACT_ROUTE)
    }
  })

  test("row 4 (remaining clauses) — the real handler answers 400 and the cell reverts with its message", async ({ page }) => {
    const target = await phoneRow()

    // Not `test.fail`, and no interception: this is the only place in the suite
    // where `parseContactPatch`'s empty-phone branch is reached by a real request,
    // so it has to be a test that can fail. Rows 3 and 5 fulfil and abort their
    // own responses and never get there.
    await openContactsGrid(page)
    await filterGlobally(page, target.name)
    await expect(rowById(page, target.id)).toBeVisible()

    const phoneCell = cellIn(rowById(page, target.id), "phone")
    await expect(phoneCell).toHaveText(target.phone)

    const before = await readContactColumn([target.id], "phone")

    await phoneCell.click()
    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await clearCellEditor(page)
    await page.keyboard.press("Enter")

    // Server 400 first: the destructive marker and the message are the server's.
    await expect(phoneCell, "a reverted cell must be marked destructive").toHaveClass(/text-destructive/)
    await expect(gridStatusLine(page)).toContainText("Phone is required.")
    await expect(phoneCell).toHaveText(target.phone)

    // And the rejection was not written.
    const after = await readContactColumn([target.id], "phone")
    expect(after.get(target.id), "an empty phone must never reach the database").toBe(before.get(target.id))
  })

  test("row 5 — a dropped PATCH reverts the cell with the reachability message", async ({ page }) => {
    const target = await inScopeRow(TARGET_OFFSETS.network)
    const original = target.name

    await focusNameCell(page, target.id, target.name)

    await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }

      await route.abort("connectionrefused")
    })

    try {
      await page.keyboard.press("e")
      await expect(cellEditor(page)).toBeFocused()
      await page.keyboard.type(`${original}-Unreachable`)
      await page.keyboard.press("Enter")

      const cell = cellIn(rowById(page, target.id), "name")

      // Caught, reverted and surfaced — never a bare `TypeError: fetch failed`.
      await expect(cell).toHaveText(original)
      await expect(cell).toHaveClass(/text-destructive/)
      await expect(gridStatusLine(page)).toContainText("Unable to reach the server.")
      expect((await readContactNames([target.id])).get(target.id)).toBe(original)
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE)
    }
  })
})
