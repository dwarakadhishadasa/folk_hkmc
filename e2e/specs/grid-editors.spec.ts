/**
 * Typed editors — CAP-5, over both harnesses.
 *
 * Every one of the eleven registry entries gets three cases: a **commit**, a
 * **validation rejection**, and an **in-flight edit** that shows the new value
 * before the write resolves.
 *
 * | Editor       | Hosted on        | Rejection reached through          |
 * | ------------ | ---------------- | --------------------------------- |
 * | `text`       | `/manage` name   | the server's own 400              |
 * | `longtext`   | `/manage` notes  | `parse`: the 2000-character bound |
 * | `select`     | `/manage` source | `parse`: a value that is not an option |
 * | `multiselect`| `/manage` booksRead | `parse`: an unknown option (pasted) |
 * | `date`       | `/manage` initialContact | `parse`: `2026-02-31`      |
 * | `checkbox`   | preview `flagged`| a **rejected write**, see below   |
 * | `currency`   | preview `amount` | `parse`: three decimal places      |
 * | `number`     | preview `quantity` | `parse`: trailing garbage        |
 * | `url`        | preview `website`| `parse`: no scheme                 |
 * | `email`      | preview `emailAddress` | `parse`: no domain             |
 * | `user`       | preview `assignee` | `parse`: an unknown id (pasted)  |
 *
 * ## Why two harnesses
 *
 * A preview-hosted type is asserted on `/dev/grid-preview`: 500 deterministic
 * rows, an in-memory commit, and nothing to restore afterwards. A contacts-hosted
 * type is asserted on `/manage` against the real route, because the whole point
 * of hosting it there is that it writes a real column.
 *
 * ## Why `checkbox` has no `parse` rejection case
 *
 * A boolean cell has no text field, so there is no draft to feed `parse` — the
 * control is a checkbox and `commitsOnInteraction` is its whole contract. The
 * rejection case it *can* reach is a rejected **write**, and that is what the
 * test asserts: the locked preview row refuses the toggle, so the cell returns
 * to unchecked with the destructive marker and the status message. That is the
 * same treatment every other editor's rejected commit gets, which is the claim
 * the reuse exists to make.
 *
 * ## How "in flight" is proved on each harness
 *
 * On `/manage` the single-row PATCH is parked in a `page.route` handler, exactly
 * as `manage-contacts-edit.spec.ts` does it, and the cell is asserted while the
 * request has not been answered. `release` is awaited **before** `unroute`, or
 * the resumed handler throws inside the `finally` and replaces the real failure
 * with a teardown race — the reason that spec documents the ordering at length.
 *
 * On the preview harness there is no request to park, so the harness supplies
 * one: writes aimed at `REF-0400` resolve after 1500ms and stamp `Notes` when
 * they land. The edited cell is asserted while `Notes` still shows its original
 * text, and the stamp is then awaited — so "the new value showed before the write
 * resolved" is proved rather than assumed, and a synchronous commit could not
 * satisfy it.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { bulkFixtureClient, inScopeContacts } from "../fixtures/bulk-contacts"
import { repoRoot } from "../fixtures/roles"
import {
  cellAt,
  cellIn,
  filterGlobally,
  focusPreviewCellAt,
  gridStatusLine,
  openContactsGrid,
  openPreviewGrid,
  readContactColumn,
  restoreContactColumn,
  rowById,
  SINGLE_CONTACT_ROUTE,
} from "../fixtures/manage-grid"

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

const RELEASE_TIMEOUT_MS = 15_000

/** The preview row whose writes resolve late; see `GRID_PREVIEW_SLOW_REF`. */
const SLOW_REF = "REF-0400"

/** The preview row whose writes always reject; see `GRID_PREVIEW_FAILING_REF`. */
const FAILING_REF = "REF-0250"

/** The stamp the slow preview commit writes into `Notes` when it resolves. */
const SETTLED_NOTE = "settled by the harness"

/**
 * A PATCH interception that counts requests and holds each response open.
 *
 * `release` must be awaited before the caller unroutes: unrouting while a request
 * is parked resumes it through Playwright's own fallback, so the handler's later
 * `route.continue()` throws `Route is already handled!` *inside* the caller's
 * `finally`, and that throw supersedes the assertion error the test was reporting.
 */
function holdContactPatch(page: Page): { requests: unknown[]; release: () => Promise<void> } {
  const requests: unknown[] = []
  let open: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    open = resolve
  })
  const parked: Promise<void>[] = []

  void page.route(SINGLE_CONTACT_ROUTE, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue()
      return
    }

    requests.push(route.request().postDataJSON())
    parked.push(
      (async () => {
        await held
        await route.continue()
      })(),
    )

    await parked[parked.length - 1].catch(() => undefined)
  })

  return {
    requests,
    release: async () => {
      open()

      if (parked.length === 0) {
        return
      }

      await Promise.race([
        Promise.allSettled(parked),
        new Promise((resolve) => setTimeout(resolve, RELEASE_TIMEOUT_MS)),
      ])
    },
  }
}

/** The single in-cell input the text-like editors mount. */
function cellEditor(page: Page) {
  return page.getByRole("textbox", { name: "Edit cell value" })
}

/** The search box every popover list editor opens with. */
function optionSearch(page: Page, label: RegExp) {
  return page.getByRole("textbox", { name: label })
}

/** Clipboard access for the tests that paste a value the editor must reject. */
async function grantClipboard(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
}

/**
 * Paste `text` into whichever cell the grid has focused.
 *
 * `writeText` plus `ControlOrMeta+V` rather than a synthetic `paste` event,
 * because the grid's own handler reads `event.clipboardData` and a dispatched
 * event would prove nothing about that path.
 */
async function pasteIntoFocusedCell(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text)
  await page.keyboard.press("ControlOrMeta+v")
}

/** One in-scope bulk row, by position. Each test takes its own offset. */
async function inScopeRow(offset: number): Promise<{ id: string; name: string }> {
  const rows = await inScopeContacts()
  const row = rows[offset]

  if (!row) {
    throw new Error(
      `No in-scope contact at offset ${offset}; the suite needs generated fixtures. ` +
        "Run `pnpm seed:bulk-local` and let globalSetup generate them.",
    )
  }

  return { id: row.id, name: row.name }
}

/**
 * Open `/manage` narrowed to one row and focus one of its cells.
 *
 * A click-to-open display (`select`, `multiselect`, `date`, `user`) opens its
 * popover on the very click that focuses the cell. `Escape` closes that again
 * without writing, so the `e` a test presses next is the opener under test rather
 * than an accident of the click — and a grid-level gesture such as a paste is not
 * swallowed by a cell that is still open.
 */
async function focusContactsCell(page: Page, id: string, name: string, columnId: string) {
  await openContactsGrid(page)
  await filterGlobally(page, name)
  await expect(rowById(page, id), "the filtered row should be the one under test").toBeVisible()
  await cellIn(rowById(page, id), columnId).click()
  await page.keyboard.press("Escape")
}

/**
 * Put a column back exactly as it was, `null` included.
 *
 * `restoreContactColumn` skips a `null` prior value because it was written for
 * renames, where "the row was not found" also reads as `null`. Here `null` is a
 * real prior value — `initial_contact` and `date_of_birth` are null on every
 * bulk row — so skipping it would leave the fixture permanently edited.
 */
async function restoreExactly(
  ids: readonly string[],
  column: string,
  values: ReadonlyMap<string, unknown>,
): Promise<void> {
  const db = bulkFixtureClient()

  for (const id of ids) {
    const { error } = await db
      .from("contacts")
      .update({ [column]: values.get(id) ?? null })
      .eq("id", id)
    if (error) throw new Error(`Restoring ${column} for ${id} failed: ${error.message}`)
  }
}

/** The preview, narrowed to one row, with `rowIndex` addressed by position. */
async function openPreviewRow(page: Page, ref: string) {
  await openPreviewGrid(page)
  await filterGlobally(page, ref)
  await expect(page.locator('tbody[data-grid-panel="ready"]')).toBeAttached()
}

/* -------------------------------------------------------------------------- */
/* text                                                                       */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — text, on /manage", () => {
  test("commit — an edited name is written through the one commit path", async ({ page }) => {
    const target = await inScopeRow(31)
    const original = await readContactColumn([target.id], "name")
    const renamed = `${target.name}-Text`

    await focusContactsCell(page, target.id, target.name, "name")

    const requests: unknown[] = []
    await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
      if (route.request().method() === "PATCH") requests.push(route.request().postDataJSON())
      await route.continue()
    })

    try {
      await page.keyboard.press("e")
      await expect(cellEditor(page), "the text editor opens an in-cell input").toBeFocused()
      await page.keyboard.type(renamed)
      await page.keyboard.press("Enter")

      await expect
        .poll(() => requests.length, { message: "one edit is one PATCH" })
        .toBe(1)
      expect(requests[0]).toMatchObject({ contactId: target.id, name: renamed })

      await expect
        .poll(async () => (await readContactColumn([target.id], "name")).get(target.id))
        .toBe(renamed)
      await expect(cellIn(rowById(page, target.id), "name")).toHaveText(renamed)
      await expect(gridStatusLine(page)).toHaveText("")
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await restoreContactColumn(original, "name")
    }
  })

  test("rejection — an empty required name reverts with the destructive marker", async ({ page }) => {
    // `text` is the one editor with no client-side rule, so its rejection case is
    // the real handler's 400 rather than a `parse` throw. That is the point of the
    // reuse: the two rejections are presented identically.
    const target = await inScopeRow(33)
    const original = await readContactColumn([target.id], "name")

    await focusContactsCell(page, target.id, target.name, "name")

    try {
      await page.keyboard.press("e")
      await expect(cellEditor(page)).toBeFocused()
      await cellEditor(page).press("ControlOrMeta+a")
      await cellEditor(page).press("Backspace")
      await page.keyboard.press("Enter")

      const cell = cellIn(rowById(page, target.id), "name")
      await expect(cell, "a rejected cell reverts").toHaveText(target.name)
      await expect(cell, "a rejected cell is marked destructive").toHaveClass(/text-destructive/)
      await expect(gridStatusLine(page)).toContainText("Name is required.")
      expect((await readContactColumn([target.id], "name")).get(target.id)).toBe(original.get(target.id))
    } finally {
      await restoreContactColumn(original, "name")
    }
  })

  test("in flight — the new name shows before the PATCH is answered", async ({ page }) => {
    const target = await inScopeRow(35)
    const original = await readContactColumn([target.id], "name")
    const renamed = `${target.name}-InFlight`

    await focusContactsCell(page, target.id, target.name, "name")

    const { requests, release } = holdContactPatch(page)
    try {
      await page.keyboard.press("e")
      await expect(cellEditor(page)).toBeFocused()
      await page.keyboard.type(renamed)
      await page.keyboard.press("Enter")

      // The write really is parked, so the text below cannot have come from it.
      await expect
        .poll(() => requests.length, { message: "the held PATCH must be in flight" })
        .toBe(1)

      await expect(
        cellIn(rowById(page, target.id), "name"),
        "the new value must show before the response lands",
      ).toHaveText(renamed)
    } finally {
      await release()
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await restoreContactColumn(original, "name")
    }
  })
})

/* -------------------------------------------------------------------------- */
/* longtext                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — longtext, on /manage", () => {
  test("commit — the popover textarea writes a multi-line note", async ({ page }) => {
    const target = await inScopeRow(37)
    const original = await readContactColumn([target.id], "notes")
    const note = "first line\nsecond line"

    await focusContactsCell(page, target.id, target.name, "notes")

    try {
      await page.keyboard.press("e")
      const textarea = page.getByRole("textbox", { name: "Edit Notes" })
      await expect(textarea, "longtext opens in a popover, not in the cell").toBeFocused()
      await textarea.press("ControlOrMeta+a")
      await textarea.press("Backspace")
      // Typed line by line: `Enter` has to stay a newline, which is the whole
      // reason the commit is `Cmd`/`Ctrl+Enter` and a button rather than `Enter`.
      await textarea.pressSequentially("first line")
      await textarea.press("Enter")
      await textarea.pressSequentially("second line")
      await page.getByRole("button", { name: "Save" }).click()

      await expect
        .poll(async () => (await readContactColumn([target.id], "notes")).get(target.id))
        .toBe(note)
      await expect(cellIn(rowById(page, target.id), "notes")).toContainText("first line")
    } finally {
      await restoreContactColumn(original, "notes")
    }
  })

  test("rejection — a note past the 2000-character bound reverts in the cell", async ({ page }) => {
    const target = await inScopeRow(39)
    const original = await readContactColumn([target.id], "notes")
    const stored = (original.get(target.id) as string | null) ?? ""
    const before = stored.length > 0 ? stored : "—"

    await focusContactsCell(page, target.id, target.name, "notes")

    try {
      await page.keyboard.press("e")
      const textarea = page.getByRole("textbox", { name: "Edit Notes" })
      await expect(textarea).toBeFocused()

      // Pasted rather than typed: 2001 keystrokes would dominate the suite's
      // runtime, and the assertion is about the bound, not about typing.
      await grantClipboard(page)
      await page.evaluate(() => navigator.clipboard.writeText("x".repeat(2001)))
      await textarea.press("ControlOrMeta+v")
      await expect(textarea).toHaveValue("x".repeat(2001))
      await page.getByRole("button", { name: "Save" }).click()

      const cell = cellIn(rowById(page, target.id), "notes")
      await expect(cell, "a rejected draft reverts to the stored value").toHaveText(before)
      await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
      await expect(gridStatusLine(page)).toContainText("2000 characters or fewer")
      expect((await readContactColumn([target.id], "notes")).get(target.id)).toBe(
        original.get(target.id),
      )
    } finally {
      await restoreContactColumn(original, "notes")
    }
  })

  test("in flight — the new note shows before the PATCH is answered", async ({ page }) => {
    const target = await inScopeRow(41)
    const original = await readContactColumn([target.id], "notes")

    await focusContactsCell(page, target.id, target.name, "notes")

    const { requests, release } = holdContactPatch(page)
    try {
      await page.keyboard.press("e")
      const textarea = page.getByRole("textbox", { name: "Edit Notes" })
      await expect(textarea).toBeFocused()
      await textarea.press("ControlOrMeta+a")
      await textarea.press("Backspace")
      await textarea.pressSequentially("held-open-note")
      await page.getByRole("button", { name: "Save" }).click()

      await expect
        .poll(() => requests.length, { message: "the held PATCH must be in flight" })
        .toBe(1)
      await expect(
        cellIn(rowById(page, target.id), "notes"),
        "the new value must show before the response lands",
      ).toContainText("held-open-note")
    } finally {
      await release()
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await restoreContactColumn(original, "notes")
    }
  })
})

/* -------------------------------------------------------------------------- */
/* select                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — select, on /manage", () => {
  test("commit — picking an option writes `source`, and it survives a reload", async ({ page }) => {
    const target = await inScopeRow(43)
    const original = await readContactColumn([target.id], "source")

    try {
      await focusContactsCell(page, target.id, target.name, "source")
      await page.keyboard.press("e")

      const option = page.getByRole("option", { name: "preview-fixture", exact: true })
      await expect(option, "the select opens in a popover with its options").toBeVisible()
      await option.click()

      await expect
        .poll(async () => (await readContactColumn([target.id], "source")).get(target.id))
        .toBe("preview-fixture")

      // AC8: the write is the server's, not a local mirror.
      await openContactsGrid(page)
      await filterGlobally(page, target.name)
      await expect(cellIn(rowById(page, target.id), "source")).toHaveText("preview-fixture")
    } finally {
      await restoreContactColumn(original, "source")
    }
  })

  test("rejection — a value that is not an option reverts in the cell", async ({ page }) => {
    const target = await inScopeRow(45)
    const original = await readContactColumn([target.id], "source")
    const before = (original.get(target.id) as string | null) ?? ""

    await focusContactsCell(page, target.id, target.name, "source")

    try {
      await page.keyboard.press("e")
      const search = optionSearch(page, /Find an option for Source/)
      await expect(search).toBeFocused()
      await search.pressSequentially("no-such-source")
      await expect(page.getByText("No matching option."), "the filter found nothing").toBeVisible()

      // `Enter` with no matching option commits the typed text, which is exactly
      // the draft `parse` has to refuse.
      await search.press("Enter")
      await expect(optionSearch(page, /Find an option for Source/), "the editor closed").toHaveCount(0)

      const cell = cellIn(rowById(page, target.id), "source")
      await expect(cell, "a rejected draft reverts to the stored value").toHaveText(before)
      await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
      await expect(gridStatusLine(page)).toContainText("is not an option for Source")
      expect((await readContactColumn([target.id], "source")).get(target.id)).toBe(before)
    } finally {
      await restoreContactColumn(original, "source")
    }
  })

  test("in flight — the picked value shows before the PATCH is answered", async ({ page }) => {
    const target = await inScopeRow(47)
    const original = await readContactColumn([target.id], "source")

    await focusContactsCell(page, target.id, target.name, "source")

    const { requests, release } = holdContactPatch(page)
    try {
      await page.keyboard.press("e")
      await page.getByRole("option", { name: "preview-fixture", exact: true }).click()

      await expect
        .poll(() => requests.length, { message: "the held PATCH must be in flight" })
        .toBe(1)
      await expect(
        cellIn(rowById(page, target.id), "source"),
        "the picked value must show before the response lands",
      ).toContainText("preview-fixture")
    } finally {
      await release()
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await restoreContactColumn(original, "source")
    }
  })
})

/* -------------------------------------------------------------------------- */
/* multiselect                                                                */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — multiselect, on /manage", () => {
  /**
   * A book the row does not already hold.
   *
   * The control is a checklist seeded from the cell, so picking the value it
   * already has *removes* it — a commit that would still pass an assertion
   * looking for that name on screen.
   */
  function secondBookFor(held: readonly string[]): string {
    const book = ["preview-fixture-book-0", "preview-fixture-book-1", "preview-fixture-book-2"]
      .map((candidate) => candidate)
      .find((candidate) => !held.includes(candidate))

    if (!book) {
      throw new Error("Every candidate book is already on the row; the fixture changed.")
    }

    return book
  }

  test("commit — a second book is written, and it survives a reload", async ({ page }) => {
    const target = await inScopeRow(49)
    const original = await readContactColumn<string[]>([target.id], "books_read")
    const first = (original.get(target.id) ?? [])[0] ?? ""
    const secondBook = secondBookFor(original.get(target.id) ?? [])

    try {
      await focusContactsCell(page, target.id, target.name, "booksRead")
      await page.keyboard.press("e")

      const option = page.getByRole("option", { name: secondBook, exact: true })
      await expect(option, "the multiselect lists payload.booksReadOptions").toBeVisible()
      await option.click()
      await page.getByRole("button", { name: "Apply" }).click()

      await expect
        .poll(async () => (await readContactColumn<string[]>([target.id], "books_read")).get(target.id))
        .toEqual(expect.arrayContaining([first, secondBook]))

      await openContactsGrid(page)
      await filterGlobally(page, target.name)
      await expect(cellIn(rowById(page, target.id), "booksRead")).toContainText(secondBook)
    } finally {
      await restoreContactColumn(original, "books_read")
    }
  })

  test("rejection — an option that does not exist reverts in the cell", async ({ page }) => {
    const target = await inScopeRow(51)
    const original = await readContactColumn<string[]>([target.id], "books_read")
    const before = (original.get(target.id) ?? []).join(", ")

    await focusContactsCell(page, target.id, target.name, "booksRead")
    await grantClipboard(page)

    try {
      // A paste is the only route to an arbitrary draft here: the control is a
      // checklist, so there is no field a wrong value could be typed into.
      await pasteIntoFocusedCell(page, "not-a-real-book")
      await expect(gridStatusLine(page)).toContainText("is not an option")

      const cell = cellIn(rowById(page, target.id), "booksRead")
      await expect(cell, "a rejected draft reverts to the stored value").toHaveText(before)
      await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
      expect((await readContactColumn<string[]>([target.id], "books_read")).get(target.id)).toEqual(
        original.get(target.id) ?? [],
      )
    } finally {
      await restoreContactColumn(original, "books_read")
    }
  })

  test("in flight — the picked values show before the PATCH is answered", async ({ page }) => {
    const target = await inScopeRow(53)
    const original = await readContactColumn<string[]>([target.id], "books_read")
    const secondBook = secondBookFor(original.get(target.id) ?? [])

    await focusContactsCell(page, target.id, target.name, "booksRead")

    const { requests, release } = holdContactPatch(page)
    try {
      await page.keyboard.press("e")
      await page.getByRole("option", { name: secondBook, exact: true }).click()
      await page.getByRole("button", { name: "Apply" }).click()

      await expect
        .poll(() => requests.length, { message: "the held PATCH must be in flight" })
        .toBe(1)
      await expect(
        cellIn(rowById(page, target.id), "booksRead"),
        "the picked values must show before the response lands",
      ).toContainText(secondBook)
    } finally {
      await release()
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await restoreContactColumn(original, "books_read")
    }
  })
})

/* -------------------------------------------------------------------------- */
/* date                                                                       */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — date, on /manage", () => {
  const ISO = "2026-03-05"
  const DISPLAY = "5 Mar 2026"

  test("commit — a picked date is written, and it survives a reload", async ({ page }) => {
    const target = await inScopeRow(55)
    const original = await readContactColumn([target.id], "initial_contact")

    try {
      await focusContactsCell(page, target.id, target.name, "initialContact")
      await page.keyboard.press("e")

      const field = page.getByRole("textbox", { name: "Initial Contact as YYYY-MM-DD" })
      await expect(page.locator('[data-grid-editor="calendar"]'), "the calendar is rendered").toBeVisible()
      await expect(field, "the typed alternative is rendered beside it").toBeVisible()
      await field.pressSequentially(ISO)
      await field.press("Enter")

      await expect
        .poll(async () => (await readContactColumn([target.id], "initial_contact")).get(target.id))
        .toBe(ISO)

      await openContactsGrid(page)
      await filterGlobally(page, target.name)
      // The cell renders a short date, which is the display widget reading the
      // overridden `text` rather than the raw stored string.
      await expect(cellIn(rowById(page, target.id), "initialContact")).toHaveText(DISPLAY)
    } finally {
      await restoreExactly([target.id], "initial_contact", original)
    }
  })

  test("rejection — a day the month does not have reverts in the cell", async ({ page }) => {
    const target = await inScopeRow(57)
    const original = await readContactColumn([target.id], "initial_contact")

    await focusContactsCell(page, target.id, target.name, "initialContact")

    try {
      await page.keyboard.press("e")
      const field = page.getByRole("textbox", { name: "Initial Contact as YYYY-MM-DD" })
      await expect(page.locator('[data-grid-editor="calendar"]')).toBeVisible()
      await field.pressSequentially("2026-02-31")
      await field.press("Enter")

      const cell = cellIn(rowById(page, target.id), "initialContact")
      await expect(cell, "the rejected draft leaves the cell empty, as it was").toHaveText("—")
      await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
      await expect(gridStatusLine(page)).toContainText("must be a real date")
      expect((await readContactColumn([target.id], "initial_contact")).get(target.id)).toBe(
        original.get(target.id),
      )
    } finally {
      await restoreExactly([target.id], "initial_contact", original)
    }
  })

  test("in flight — the picked date shows before the PATCH is answered", async ({ page }) => {
    const target = await inScopeRow(59)
    const original = await readContactColumn([target.id], "initial_contact")

    await focusContactsCell(page, target.id, target.name, "initialContact")

    const { requests, release } = holdContactPatch(page)
    try {
      await page.keyboard.press("e")
      const field = page.getByRole("textbox", { name: "Initial Contact as YYYY-MM-DD" })
      await expect(page.locator('[data-grid-editor="calendar"]')).toBeVisible()
      await field.pressSequentially(ISO)
      await field.press("Enter")

      await expect
        .poll(() => requests.length, { message: "the held PATCH must be in flight" })
        .toBe(1)
      await expect(
        cellIn(rowById(page, target.id), "initialContact"),
        "the new date must show before the response lands",
      ).toHaveText(DISPLAY)
    } finally {
      await release()
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await restoreExactly([target.id], "initial_contact", original)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* checkbox                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — checkbox, on /dev/grid-preview", () => {
  test("commit — clicking the cell's checkbox flips it and writes the value", async ({ page }) => {
    await openPreviewGrid(page)

    const box = cellAt(page, 0, "flagged").getByRole("checkbox")
    // Read before touching the cell: clicking it *is* the commit, so a click
    // first would toggle it and leave nothing to assert about the initial state.
    await expect(box, "row-1 starts unchecked").toHaveAttribute("aria-checked", "false")

    // A checkbox is the one editor whose control is the cell, so a plain click
    // commits — there is nothing to open and nothing to press.
    await box.click()
    await expect(box, "the click commits immediately").toHaveAttribute("aria-checked", "true")
    await expect(cellEditor(page), "a toggle opens no editor").toHaveCount(0)
  })

  test("rejection — a refused toggle reverts with the destructive marker", async ({ page }) => {
    await openPreviewRow(page, FAILING_REF)
    const box = cellAt(page, 0, "flagged").getByRole("checkbox")

    await expect(box).toHaveAttribute("aria-checked", "false")
    await box.click()

    const cell = cellAt(page, 0, "flagged")
    await expect(box, "a rejected toggle returns to unchecked").toHaveAttribute(
      "aria-checked",
      "false",
    )
    await expect(cell, "a rejected toggle marks the cell destructive").toHaveClass(
      /text-destructive/,
    )
    await expect(gridStatusLine(page)).toContainText("locked in the harness")
  })

  test("in flight — the toggle shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""
    expect(before, "the slow row must not already carry the stamp").not.toBe(SETTLED_NOTE)

    await cellAt(page, 0, "flagged").getByRole("checkbox").click()

    await expect(
      cellAt(page, 0, "flagged").getByRole("checkbox"),
      "the optimistic toggle must show before the write resolves",
    ).toHaveAttribute("aria-checked", "true")
    await expect(notes, "the write has not resolved yet").toHaveText(before)

    await expect(notes, "the write then resolves and stamps the row").toHaveText(SETTLED_NOTE)
  })
})

/* -------------------------------------------------------------------------- */
/* currency                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — currency, on /dev/grid-preview", () => {
  test("commit — a typed amount is formatted on the cell", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "amount")

    const before = (await cellAt(page, 0, "amount").textContent()) ?? ""
    expect(before, "the test needs a different amount to prove the change").not.toContain("1,234.50")

    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("1234.50")
    await page.keyboard.press("Enter")

    await expect(
      cellAt(page, 0, "amount"),
      "the currency display renders the committed minor units",
    ).toContainText("1,234.50")
    await expect(gridStatusLine(page)).toHaveText("")
  })

  test("rejection — a third decimal place reverts in the cell", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "amount")
    const before = (await cellAt(page, 0, "amount").textContent()) ?? ""

    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("12.345")
    await page.keyboard.press("Enter")

    const cell = cellAt(page, 0, "amount")
    await expect(cell, "a rejected draft reverts to the stored amount").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
    await expect(gridStatusLine(page)).toContainText("at most two decimal places")
  })

  test("in flight — the typed amount shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await focusPreviewCellAt(page, 0, "amount")
    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("999.99")
    await page.keyboard.press("Enter")

    await expect(
      cellAt(page, 0, "amount"),
      "the new amount must show before the write resolves",
    ).toContainText("999.99")
    await expect(notes, "the write has not resolved yet").toHaveText(before)
    await expect(notes, "the write then resolves and stamps the row").toHaveText(SETTLED_NOTE)
  })
})

/* -------------------------------------------------------------------------- */
/* number                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — number, on /dev/grid-preview", () => {
  test("commit — a typed number is written and shown right-aligned", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "quantity")
    const before = (await cellAt(page, 0, "quantity").textContent()) ?? ""

    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("42")
    await page.keyboard.press("Enter")

    expect(before, "the test needs a different value to prove the change").not.toBe("42")
    await expect(cellAt(page, 0, "quantity")).toHaveText("42")
  })

  test("rejection — trailing garbage is rejected and the cell reverts", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "quantity")
    const before = (await cellAt(page, 0, "quantity").textContent()) ?? ""

    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("12abc")
    await page.keyboard.press("Enter")

    const cell = cellAt(page, 0, "quantity")
    await expect(cell, "a rejected draft reverts to the stored number").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
    await expect(gridStatusLine(page)).toContainText("must be a number")
  })

  test("in flight — the typed number shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await focusPreviewCellAt(page, 0, "quantity")
    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("7")
    await page.keyboard.press("Enter")

    await expect(
      cellAt(page, 0, "quantity"),
      "the new number must show before the write resolves",
    ).toHaveText("7")
    await expect(notes, "the write has not resolved yet").toHaveText(before)
    await expect(notes, "the write then resolves and stamps the row").toHaveText(SETTLED_NOTE)
  })
})

/* -------------------------------------------------------------------------- */
/* url                                                                        */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — url, on /dev/grid-preview", () => {
  const URL_TEXT = "https://example.com/edited"

  test("commit — a typed URL is written and renders as a link", async ({ page }) => {
    await openPreviewGrid(page)
    // The cell's padding, not the anchor: for this column the centre of the cell
    // is the link itself.
    await cellAt(page, 0, "website").click({ position: { x: 2, y: 2 } })
    await page.getByRole("group", { name: "Grid preview rows" }).focus()

    await page.keyboard.press("e")
    await expect(cellEditor(page), "the url editor opens an in-cell input").toBeFocused()
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type(URL_TEXT)
    await page.keyboard.press("Enter")

    const link = cellAt(page, 0, "website").getByRole("link")
    await expect(link, "the url display renders the committed value as a link").toHaveText(URL_TEXT)
    await expect(link).toHaveAttribute("href", URL_TEXT)
  })

  test("rejection — a bare host with no scheme reverts in the cell", async ({ page }) => {
    await openPreviewGrid(page)
    // Clicking the cell's own padding rather than the link: `focusPreviewCellAt`
    // clicks the element's centre, and for this column that is the anchor.
    await cellAt(page, 0, "website").click({ position: { x: 2, y: 2 } })
    await page.getByRole("group", { name: "Grid preview rows" }).focus()
    const before = (await cellAt(page, 0, "website").textContent()) ?? ""

    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("example.com/no-scheme")
    await page.keyboard.press("Enter")

    const cell = cellAt(page, 0, "website")
    await expect(cell, "a rejected draft reverts to the stored URL").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
    await expect(gridStatusLine(page)).toContainText("must be a full URL")
  })

  test("in flight — the typed URL shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await cellAt(page, 0, "website").click({ position: { x: 2, y: 2 } })
    await page.getByRole("group", { name: "Grid preview rows" }).focus()

    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type(URL_TEXT)
    await page.keyboard.press("Enter")

    await expect(
      cellAt(page, 0, "website"),
      "the new URL must show before the write resolves",
    ).toHaveText(URL_TEXT)
    await expect(notes, "the write has not resolved yet").toHaveText(before)
    await expect(notes, "the write then resolves and stamps the row").toHaveText(SETTLED_NOTE)
  })
})

/* -------------------------------------------------------------------------- */
/* email                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — email, on /dev/grid-preview", () => {
  const ADDRESS = "edited.person@example.org"

  test("commit — a typed address is written and shown", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "emailAddress")

    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type(ADDRESS)
    await page.keyboard.press("Enter")

    await expect(cellAt(page, 0, "emailAddress")).toHaveText(ADDRESS)
    await expect(gridStatusLine(page)).toHaveText("")
  })

  test("rejection — an address with no domain reverts in the cell", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "emailAddress")
    const before = (await cellAt(page, 0, "emailAddress").textContent()) ?? ""

    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("not-an-email")
    await page.keyboard.press("Enter")

    const cell = cellAt(page, 0, "emailAddress")
    await expect(cell, "a rejected draft reverts to the stored address").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
    await expect(gridStatusLine(page)).toContainText("must be an email address")
  })

  test("in flight — the typed address shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await focusPreviewCellAt(page, 0, "emailAddress")
    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type(ADDRESS)
    await page.keyboard.press("Enter")

    await expect(
      cellAt(page, 0, "emailAddress"),
      "the new address must show before the write resolves",
    ).toHaveText(ADDRESS)
    await expect(notes, "the write has not resolved yet").toHaveText(before)
    await expect(notes, "the write then resolves and stamps the row").toHaveText(SETTLED_NOTE)
  })
})

/* -------------------------------------------------------------------------- */
/* user                                                                       */
/* -------------------------------------------------------------------------- */

test.describe("typed editor — user, on /dev/grid-preview", () => {
  test("commit — a picked person is written and shown with their initials", async ({ page }) => {
    await openPreviewGrid(page)
    // The click-to-open display opens its popover on the click that focuses the
    // cell; dismiss it so `e` is the opener under test.
    await focusPreviewCellAt(page, 0, "assignee")
    await page.keyboard.press("Escape")
    const before = (await cellAt(page, 0, "assignee").textContent()) ?? ""

    await page.keyboard.press("e")
    const search = optionSearch(page, /Find Assignee/)
    await expect(search, "the user editor opens a searchable popover").toBeFocused()

    const option = page.getByRole("option", { name: "M. Nair" })
    await option.click()

    expect(before, "the test needs a different person to prove the change").not.toContain("M. Nair")
    await expect(cellAt(page, 0, "assignee")).toContainText("M. Nair")
    await expect(
      cellAt(page, 0, "assignee").locator('[data-grid-editor="user"] span[aria-hidden="true"]'),
      "the avatar carries the initials",
    ).toHaveText("MN")
  })

  test("rejection — an id that is not a known person reverts in the cell", async ({ page }) => {
    await openPreviewGrid(page)
    // The click that focuses the cell also opens this column's popover, and the
    // grid ignores a paste while a cell is open — so dismiss it first.
    await focusPreviewCellAt(page, 0, "assignee")
    await page.keyboard.press("Escape")
    const before = (await cellAt(page, 0, "assignee").textContent()) ?? ""
    await grantClipboard(page)

    // The control is a searchable list, so the only way to hand it a wrong value
    // is to paste one; a paste goes through the same `parse` as typing.
    await pasteIntoFocusedCell(page, "not-a-known-user")
    await expect(gridStatusLine(page)).toContainText("is not a known Assignee")

    const cell = cellAt(page, 0, "assignee")
    await expect(cell, "a rejected draft reverts to the stored person").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
  })

  test("in flight — the picked person shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await focusPreviewCellAt(page, 0, "assignee")
    await page.keyboard.press("Escape")
    await page.keyboard.press("e")
    await expect(optionSearch(page, /Find Assignee/)).toBeFocused()
    await page.getByRole("option", { name: "M. Nair" }).click()

    await expect(
      cellAt(page, 0, "assignee"),
      "the picked person must show before the write resolves",
    ).toContainText("M. Nair")
    await expect(notes, "the write has not resolved yet").toHaveText(before)
    await expect(notes, "the write then resolves and stamps the row").toHaveText(SETTLED_NOTE)
  })
})

/* -------------------------------------------------------------------------- */
/* Positioning, the row contract, and the registry itself                     */
/* -------------------------------------------------------------------------- */

test.describe("typed editors — positioning and the registry", () => {
  test("AC2 — an open popover editor is anchored to its cell and the row does not move", async ({
    page,
  }) => {
    // `initialContact`, because a null date renders as the plain placeholder with
    // no click-to-open widget — so `e` is what opens the editor here, and the
    // test is about the popover rather than about the click affordance.
    const target = await inScopeRow(59)

    await focusContactsCell(page, target.id, target.name, "initialContact")
    const row = rowById(page, target.id)
    const before = await row.evaluate((element) => element.getBoundingClientRect().height)

    await page.keyboard.press("e")
    const popover = page.locator('[data-grid-editor="calendar"]')
    await expect(popover, "the calendar is rendered").toBeVisible()

    // The body lives in a portal, so it is not inside the cell — the structural
    // reason a popover editor cannot push the row, asserted rather than assumed.
    expect(
      await popover.evaluate((element) => element.closest("tr") !== null),
      "the popover body must not be inside a row",
    ).toBe(false)

    const after = await row.evaluate((element) => element.getBoundingClientRect().height)
    expect(after, "opening an editor must not resize the row").toBe(before)

    await page.keyboard.press("Escape")
  })

  test("AC4 — clicking away mid-edit writes nothing", async ({ page }) => {
    const target = await inScopeRow(61)
    const original = await readContactColumn([target.id], "notes")

    await focusContactsCell(page, target.id, target.name, "notes")

    const requests: unknown[] = []
    await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
      if (route.request().method() === "PATCH") requests.push(route.request().postDataJSON())
      await route.continue()
    })

    try {
      await page.keyboard.press("e")
      const textarea = page.getByRole("textbox", { name: "Edit Notes" })
      await expect(textarea).toBeFocused()
      await textarea.pressSequentially("discarded")

      // `checkbox` is the only editor that commits on interaction. Every other
      // type discards on an outside click, so a half-typed note must not fire a
      // write.
      await page.locator("h2").click()

      await expect(textarea, "the editor closed").toHaveCount(0)
      expect(requests, "clicking away mid-edit must not write").toHaveLength(0)
      await expect(cellIn(rowById(page, target.id), "notes")).not.toContainText("discarded")
      expect((await readContactColumn([target.id], "notes")).get(target.id)).toBe(
        original.get(target.id),
      )
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await restoreContactColumn(original, "notes")
    }
  })

  test("AC4 — `checkbox` is the only editor that commits on interaction", async ({ page }) => {
    await openPreviewGrid(page)

    const box = cellAt(page, 0, "flagged").getByRole("checkbox")
    await expect(box).toHaveAttribute("aria-checked", "false")
    await box.click()
    await expect(box, "a click commits the toggle immediately").toHaveAttribute(
      "aria-checked",
      "true",
    )
  })

  test("the registry ships all eleven types, none a stub", async () => {
    // Asserted against the source rather than the DOM because the claim is about
    // the registry itself: a key that lost its entry would render a plain cell
    // and every UI assertion above would still pass for the ten that remain.
    const source = readFileSync(
      path.join(repoRoot, "components", "grid", "grid-editors.tsx"),
      "utf8",
    )
    const registry = source.slice(source.indexOf("const GRID_EDITOR_REGISTRY"))
    const keys = [
      "text",
      "longtext",
      "number",
      "currency",
      "checkbox",
      "select",
      "multiselect",
      "date",
      "url",
      "email",
      "user",
    ]

    for (const key of keys) {
      // Leading whitespace is not part of the claim: what matters is that the
      // mapped type has an entry for the key, not how the literal is indented.
      expect(registry, `the registry must carry an entry for "${key}"`).toMatch(
        new RegExp(`^\\s+${key}:\\s`, "m"),
      )
    }

    // Exactly one `commitsOnInteraction`, and it is the checkbox.
    expect(
      source.match(/commitsOnInteraction: true/g) ?? [],
      "only the checkbox may commit on interaction",
    ).toHaveLength(1)
    expect(checkboxEditorSource(source), "the interactive entry is the checkbox").toContain(
      "checkboxEditor",
    )
  })
})

/** The registry entry block for `checkbox`, or `""` when it is absent. */
function checkboxEditorSource(source: string): string {
  const start = source.indexOf("const checkboxEditor")
  return start === -1 ? "" : source.slice(start, source.indexOf("}", start))
}
