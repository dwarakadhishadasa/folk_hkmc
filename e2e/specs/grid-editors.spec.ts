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
 * ## How an editor is opened — CAP-10
 *
 * **Every test here opens its editor with a double-click** (`openCellEditor`),
 * because a double-click is the only gesture that opens one. `e`,
 * printable-character type-to-edit, `Space`-seeding and the single click on a
 * display widget are retired; `Escape` is the only discard and clicking away is
 * a commit. The eleven editors are unchanged by that — what is asserted below is
 * parsing, validation and the one write path, none of which moved.
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
  openCellEditor,
  openCellEditorAtCorner,
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
 * A single click and nothing more: since CAP-10 a click-to-open display no
 * longer opens its popover, so there is nothing to dismiss afterwards and no
 * `Escape` to press here. The click is still needed for the tests whose subject
 * is a grid-level gesture — a paste is swallowed while a cell is open, and the
 * paste cannot happen without the cell being closed first — and for the ones
 * that assert on a *closed* cell's own text.
 *
 * A test that wants an editor open double-clicks through `openCellEditor`, which
 * focuses the cell on its way down and so makes this helper's click redundant.
 */
async function focusContactsCell(page: Page, id: string, name: string, columnId: string) {
  await openContactsGrid(page)
  await filterGlobally(page, name)
  await expect(rowById(page, id), "the filtered row should be the one under test").toBeVisible()
  await cellIn(rowById(page, id), columnId).click()
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
      await openCellEditor(cellIn(rowById(page, target.id), "name"))
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
      await expect(cellIn(rowById(page, target.id), "name"), "a committed cell is left unmarked").not.toHaveClass(
        /text-destructive/,
      )
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
      await openCellEditor(cellIn(rowById(page, target.id), "name"))
      await expect(cellEditor(page)).toBeFocused()
      await cellEditor(page).press("ControlOrMeta+a")
      await cellEditor(page).press("Backspace")
      await page.keyboard.press("Enter")

      const cell = cellIn(rowById(page, target.id), "name")
      await expect(cell, "a rejected cell reverts").toHaveText(target.name)
      await expect(cell, "a rejected cell is marked destructive").toHaveClass(/text-destructive/)
      await expect(cell, "the refusal rides the cell itself").toHaveAttribute(
        "data-grid-cell-error",
        /Name is required\./,
      )
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
      await openCellEditor(cellIn(rowById(page, target.id), "name"))
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
      await openCellEditor(cellIn(rowById(page, target.id), "notes"))
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
    // CHANGED by premium-grid story 3 (CAP-3, blank-not-dash): an empty stored
    // value used to be stood in for by an em-dash. The grid renders nothing now, so
    // the pre-edit baseline for a blank cell is the empty string.
    const before = stored//
    // CHANGED by premium-grid story 3 (CAP-3, blank-not-dash). This stood in an
    // em-dash for an empty stored value; the grid now renders nothing, so the
    // reverted cell is genuinely empty. Recorded contract change, not a weakened
    // gate: what the test proves is that the rejection reverted the cell and
    // marked it destructive, and both still hold.

    await focusContactsCell(page, target.id, target.name, "notes")

    try {
      await openCellEditor(cellIn(rowById(page, target.id), "notes"))
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
      await expect(cell, "the refusal rides the cell itself").toHaveAttribute(
        "data-grid-cell-error",
        /2000 characters or fewer/,
      )
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
      await openCellEditor(cellIn(rowById(page, target.id), "notes"))
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
      await openCellEditor(cellIn(rowById(page, target.id), "source"))

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
      await openCellEditor(cellIn(rowById(page, target.id), "source"))
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
      await expect(cell, "the refusal rides the cell itself").toHaveAttribute(
        "data-grid-cell-error",
        /is not an option for Source/,
      )
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
      await openCellEditor(cellIn(rowById(page, target.id), "source"))
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
   * **A multiselect cell shows at most two values; the rest is a `+N` badge.**
   *
   * `multiselectEditor.renderDisplay` splits the text and renders a `Pill` for
   * the first two entries, then a muted `+N` counting the rest. So a picked book
   * that lands third or later is *deliberately* absent from the cell's text, and
   * every test in this block was asserting against a string the component is
   * built not to produce.
   *
   * Two consequences, both of which cost a red run here:
   *
   * - **The full value lives in `title`**, comma-joined. That is where an
   *   operator reaches a collapsed value too, so asserting there is asserting the
   *   real contract rather than working around it.
   * - **The pills carry no separator.** Their `textContent` is the values run
   *   together; a comma between them would be a stray visual artifact. Joining
   *   the stored array with `", "` and asserting that as *text* was wrong about
   *   the component, not the other way round.
   *
   * During a rejection the `title` is overwritten by the **error message**, so a
   * revert is proved by the value returning once the error clears — never by
   * reading `title` while the error stands.
   */

  test.describe.configure({ mode: "serial" })

  /** Book titles carry `.`, `:` and `-`, all of which are regex-significant. */
  function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  /**
   * A book the row does not already hold.
   *
   * The control is a checklist seeded from the cell, so picking the value it
   * already has *removes* it — a commit that would still pass an assertion
   * looking for that name on screen.
   */
  function secondBookFor(held: readonly string[]): string {
    // Prabhupad's titles, as the seeder now writes them. Kept as a literal rather
    // than imported so this spec stays independent of the seeder's pool: the
    // assertion is about *picking a book the row does not hold*, and a candidate
    // list that moved with the seeder would let the two agree with each other
    // while disagreeing with the grid.
    const candidates = [
      "Bhagavad-gita As It Is",
      "Krsna: The Supreme Personality of Godhead",
      "Srimad Bhagavatam",
      "Caitanya-caritamrita",
      "Nectar of Instruction",
    ]
    const book = candidates.find((candidate) => !held.includes(candidate))

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
      await openCellEditor(cellIn(rowById(page, target.id), "booksRead"))

      const option = page.getByRole("option", { name: secondBook, exact: true })
      await expect(option, "the multiselect lists payload.booksReadOptions").toBeVisible()
      await option.click()
      await page.getByRole("button", { name: "Apply" }).click()

      await expect
        .poll(async () => (await readContactColumn<string[]>([target.id], "books_read")).get(target.id))
        .toEqual(expect.arrayContaining([first, secondBook]))

      await openContactsGrid(page)
      await filterGlobally(page, target.name)
      await expect(
        cellIn(rowById(page, target.id), "booksRead"),
        "the picked book survives the reload in the cell's full value",
      ).toHaveAttribute("title", new RegExp(escapeForRegExp(secondBook)))
    } finally {
      await restoreContactColumn(original, "books_read")
    }
  })

  test("rejection — an option that does not exist reverts in the cell", async ({ page }) => {
    const target = await inScopeRow(51)
    const original = await readContactColumn<string[]>([target.id], "books_read")
    const before = original.get(target.id) ?? []

    await focusContactsCell(page, target.id, target.name, "booksRead")
    await grantClipboard(page)

    try {
      // A paste is the only route to an arbitrary draft here: the control is a
      // checklist, so there is no field a wrong value could be typed into.
      await pasteIntoFocusedCell(page, "not-a-real-book")
      await expect(cellIn(rowById(page, target.id), "booksRead"), "the refusal rides the cell itself").toHaveAttribute(
        "data-grid-cell-error",
        /is not an option/,
      )

      const cell = cellIn(rowById(page, target.id), "booksRead")
      await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
      // **The error is sticky and `title` carries it while it stands.** The
      // override writes `{ value: previousText, error: message }` and nothing
      // clears it until the next edit, so the operator can still read *why* the
      // write was refused. Asserting that it clears on its own would be
      // asserting the opposite of the design.
      await expect(cell, "and the reason stays readable while it stands").toHaveAttribute(
        "title",
        /is not an option/,
      )
      // The revert is therefore proved where it is unambiguous: the pills are the
      // stored values again, and the database never took the rejected draft.
      await expect(cell, "the cell is back to its stored pills, unseparated").toHaveText(
        before.slice(0, 2).join(""),
      )
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
      await openCellEditor(cellIn(rowById(page, target.id), "booksRead"))
      await page.getByRole("option", { name: secondBook, exact: true }).click()
      await page.getByRole("button", { name: "Apply" }).click()

      await expect
        .poll(() => requests.length, { message: "the held PATCH must be in flight" })
        .toBe(1)
      await expect(
        cellIn(rowById(page, target.id), "booksRead"),
        "the picked values must show before the response lands",
      ).toHaveAttribute("title", new RegExp(escapeForRegExp(secondBook)))
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
      await openCellEditor(cellIn(rowById(page, target.id), "initialContact"))

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
      await openCellEditor(cellIn(rowById(page, target.id), "initialContact"))
      const field = page.getByRole("textbox", { name: "Initial Contact as YYYY-MM-DD" })
      await expect(page.locator('[data-grid-editor="calendar"]')).toBeVisible()
      await field.pressSequentially("2026-02-31")
      await field.press("Enter")

      const cell = cellIn(rowById(page, target.id), "initialContact")
      await expect(cell, "the rejected draft leaves the cell empty, as it was").toHaveText("")
      await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
      await expect(cell, "the refusal rides the cell itself").toHaveAttribute(
        "data-grid-cell-error",
        /must be a real date/,
      )
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
      await openCellEditor(cellIn(rowById(page, target.id), "initialContact"))
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
    await expect(cell, "the refusal rides the cell itself").toHaveAttribute(
      "data-grid-cell-error",
      /locked in the harness/,
    )
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
    const before = (await cellAt(page, 0, "amount").textContent()) ?? ""
    expect(before, "the test needs a different amount to prove the change").not.toContain("1,234.50")

    await openCellEditor(cellAt(page, 0, "amount"))
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("1234.50")
    await page.keyboard.press("Enter")

    await expect(
      cellAt(page, 0, "amount"),
      "the currency display renders the committed minor units",
    ).toContainText("1,234.50")
    await expect(cellAt(page, 0, "amount"), "a committed cell is left unmarked").not.toHaveClass(
      /text-destructive/,
    )
  })

  test("rejection — a third decimal place reverts in the cell", async ({ page }) => {
    await openPreviewGrid(page)
    const before = (await cellAt(page, 0, "amount").textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "amount"))
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("12.345")
    await page.keyboard.press("Enter")

    const cell = cellAt(page, 0, "amount")
    await expect(cell, "a rejected draft reverts to the stored amount").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
    await expect(cell, "the refusal rides the cell itself").toHaveAttribute(
      "data-grid-cell-error",
      /at most two decimal places/,
    )
  })

  test("in flight — the typed amount shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "amount"))
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
    const before = (await cellAt(page, 0, "quantity").textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "quantity"))
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
    const before = (await cellAt(page, 0, "quantity").textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "quantity"))
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("12abc")
    await page.keyboard.press("Enter")

    const cell = cellAt(page, 0, "quantity")
    await expect(cell, "a rejected draft reverts to the stored number").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
    await expect(cell, "the refusal rides the cell itself").toHaveAttribute(
      "data-grid-cell-error",
      /must be a number/,
    )
  })

  test("in flight — the typed number shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "quantity"))
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
    // is the link itself, and the first click of the double-click would navigate.
    await openCellEditorAtCorner(cellAt(page, 0, "website"))
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
    const before = (await cellAt(page, 0, "website").textContent()) ?? ""

    // Clicking the cell's own padding rather than the link: the centre of this
    // cell is the anchor.
    await openCellEditorAtCorner(cellAt(page, 0, "website"))
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("example.com/no-scheme")
    await page.keyboard.press("Enter")

    const cell = cellAt(page, 0, "website")
    await expect(cell, "a rejected draft reverts to the stored URL").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
    await expect(cell, "the refusal rides the cell itself").toHaveAttribute(
      "data-grid-cell-error",
      /must be a full URL/,
    )
  })

  test("in flight — the typed URL shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await openCellEditorAtCorner(cellAt(page, 0, "website"))
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
    await openCellEditor(cellAt(page, 0, "emailAddress"))
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type(ADDRESS)
    await page.keyboard.press("Enter")

    await expect(cellAt(page, 0, "emailAddress")).toHaveText(ADDRESS)
    await expect(cellAt(page, 0, "emailAddress"), "a committed cell is left unmarked").not.toHaveClass(
      /text-destructive/,
    )
  })

  test("rejection — an address with no domain reverts in the cell", async ({ page }) => {
    await openPreviewGrid(page)
    const before = (await cellAt(page, 0, "emailAddress").textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "emailAddress"))
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await cellEditor(page).press("Backspace")
    await page.keyboard.type("not-an-email")
    await page.keyboard.press("Enter")

    const cell = cellAt(page, 0, "emailAddress")
    await expect(cell, "a rejected draft reverts to the stored address").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
    await expect(cell, "the refusal rides the cell itself").toHaveAttribute(
      "data-grid-cell-error",
      /must be an email address/,
    )
  })

  test("in flight — the typed address shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "emailAddress"))
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
    const before = (await cellAt(page, 0, "assignee").textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "assignee"))
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
    // The grid ignores a paste while a cell is open, and since CAP-10 a single
    // click no longer opens this column's popover — so one click leaves the cell
    // closed and focused, which is exactly what a paste needs.
    await focusPreviewCellAt(page, 0, "assignee")
    const before = (await cellAt(page, 0, "assignee").textContent()) ?? ""
    await grantClipboard(page)

    // The control is a searchable list, so the only way to hand it a wrong value
    // is to paste one; a paste goes through the same `parse` as typing.
    await pasteIntoFocusedCell(page, "not-a-known-user")
    await expect(cellAt(page, 0, "assignee"), "the refusal rides the cell itself").toHaveAttribute(
      "data-grid-cell-error",
      /is not a known Assignee/,
    )

    const cell = cellAt(page, 0, "assignee")
    await expect(cell, "a rejected draft reverts to the stored person").toHaveText(before)
    await expect(cell, "a rejected draft is marked destructive").toHaveClass(/text-destructive/)
  })

  test("in flight — the picked person shows before the write resolves", async ({ page }) => {
    await openPreviewRow(page, SLOW_REF)

    const notes = cellAt(page, 0, "notes")
    const before = (await notes.textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "assignee"))
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
    // no click-to-open widget — so the double-click is the only thing that opens
    // the editor here, and the
    // test is about the popover rather than about the click affordance.
    const target = await inScopeRow(59)

    await focusContactsCell(page, target.id, target.name, "initialContact")
    const row = rowById(page, target.id)
    const before = await row.evaluate((element) => element.getBoundingClientRect().height)

    await openCellEditor(cellIn(rowById(page, target.id), "initialContact"))
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

  /**
   * AC4 **reversed** — clicking away mid-edit now *writes*.
   *
   * This used to read "AC4 — clicking away mid-edit writes nothing" and assert
   * zero PATCHes. **Why the behaviour was removed:** upstream story 2's AC4 was
   * written when the popover editors discarded on close, so a correction an
   * operator typed and then clicked away from was silently lost — the opposite of
   * what an edit needs. CAP-10 makes moving focus away *commit*, through the one
   * commit path, and `Escape` is the only discard. The replacement is not merely
   * the negation of the old assertion: it asserts that exactly one write carries
   * the typed text and reaches the database, because "clicking away commits"
   * would be satisfied as well by a commit that lost the draft.
   */
  test("AC4 (retired, inverted) — clicking away mid-edit commits through the one path", async ({ page }) => {
    const target = await inScopeRow(61)
    const original = await readContactColumn([target.id], "notes")
    const note = "committed by clicking away"

    await focusContactsCell(page, target.id, target.name, "notes")

    const requests: unknown[] = []
    await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
      if (route.request().method() === "PATCH") requests.push(route.request().postDataJSON())
      await route.continue()
    })

    try {
      await openCellEditor(cellIn(rowById(page, target.id), "notes"))
      const textarea = page.getByRole("textbox", { name: "Edit Notes" })
      await expect(textarea).toBeFocused()
      // Emptied first, because the textarea seeds from whatever the cell already
      // holds and `pressSequentially` *appends*: on a row carrying a leftover
      // note the assertion would then read a concatenation.
      await textarea.press("ControlOrMeta+a")
      await textarea.press("Backspace")
      await textarea.pressSequentially(note)

      // An outside click: Radix dismisses the popover, and closing is now a
      // commit. `checkbox` still commits on interaction — that assertion survives
      // below, unchanged.
      await page.locator("h2").click()

      await expect(textarea, "the editor closed").toHaveCount(0)
      await expect
        .poll(() => requests.length, { message: "clicking away is one commit" })
        .toBe(1)
      expect(requests[0]).toMatchObject({ contactId: target.id, notes: note })
      await expect(cellIn(rowById(page, target.id), "notes")).toContainText(note)
      await expect
        .poll(async () => (await readContactColumn([target.id], "notes")).get(target.id))
        .toBe(note)
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
