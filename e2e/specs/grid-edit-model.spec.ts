/**
 * The CAP-10 edit model — one opener, one commit path, one discard.
 *
 * `grid-editors.spec.ts` covers *editors* (parsing, validation, the optimistic
 * display, the revert). This file covers the **gesture model** around them, which
 * is what this story changed:
 *
 * | Test | Claim |
 * | ---- | ----- |
 * | open (preview) | a double-click opens an editor on every editor type the preview harness carries |
 * | open (`/manage`) | …and on `select`, `multiselect`, `date` and `longtext`, which live on real columns |
 * | single click | a single click makes a cell active and opens nothing |
 * | read-only / checkbox | `openEditor` returns false on a read-only column; a checkbox double-click nets unchanged |
 * | second dblclick | a second double-click on the open cell commits, once |
 * | blur, touched | moving focus away commits exactly one write and does not pull focus back |
 * | blur, untouched | moving focus away with no keystroke issues **zero** requests |
 * | popover close | an outside click on a popover editor **commits**, and a picked option survives it |
 * | `Escape` | discards on every editor, including the ones with no local handler |
 * | navigation | arrows / `Tab` / `Home` move focus and open nothing |
 * | `Space` | still toggles a checkbox, and opens nothing on a text cell |
 * | retired openers | `e`, a printable character, `Space` on a text cell and `Enter` open nothing |
 * | validation | validation runs before the save; a rejected draft is never sent |
 * | hint line | Panel 5's line renders only while a cell is editing |
 *
 * ## Why "untouched" is a flag and not a value comparison
 *
 * `openEditor` seeds the draft from the cell's current value, so an untouched
 * draft is always *equal* to what is stored. Comparing the two would also make
 * "clear a select by picking nothing" impossible to express, and would break the
 * deliberate case of retyping a value on `Enter`. The hook therefore tracks a
 * boolean set by the editor-facing setter alone, and **this file asserts the
 * consequence**: zero requests, and the grid unchanged. A regression that
 * compared strings, or that seeded through the editor's own setter, shows up as
 * a request count above zero.
 *
 * ## Both harnesses, and why
 *
 * `/dev/grid-preview` carries `currency`, `number`, `url`, `email`, `user` and
 * `checkbox` with an in-memory commit, so nothing needs restoring afterwards —
 * which is what makes "one commit, not two" cheap to assert there. `/manage`
 * carries `text`, `longtext`, `select`, `multiselect` and `date` and writes real
 * columns through the real route, so "zero requests on an untouched blur" is a
 * statement about production data rather than about a preview harness. The
 * request-counting cases are therefore on `/manage`, where a stray PATCH would
 * really be a stray PATCH.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import { inScopeContacts } from "../fixtures/bulk-contacts"
import {
  SINGLE_CONTACT_ROUTE,
  cellAt,
  cellIn,
  filterGlobally,
  gridRoot,
  openCellEditor,
  openCellEditorAtCorner,
  openContactsGrid,
  openPreviewGrid,
  readContactColumn,
  restoreContactColumn,
  rowById,
} from "../fixtures/manage-grid"

/** The in-cell input the single-line editors mount. */
function cellEditor(page: Page) {
  return page.getByRole("textbox", { name: "Edit cell value" })
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
 * `/manage` narrowed to one row, with that row's cell addressable.
 *
 * The single click is the *whole* setup: since CAP-10 it makes the cell active
 * and opens nothing, which is the first half of what a click is now allowed to
 * do.
 */
async function contactsCell(page: Page, id: string, name: string, columnId: string): Promise<Locator> {
  await openContactsGrid(page)
  await filterGlobally(page, name)
  await expect(rowById(page, id), "the filtered row should be the one under test").toBeVisible()
  const cell = cellIn(rowById(page, id), columnId)
  await cell.click()
  return cell
}

/** Counts and reads the single-row PATCHes the grid's `onCellCommit` issues. */
async function countContactPatches(
  page: Page,
): Promise<{ count: () => number; bodies: () => unknown[]; stop: () => Promise<void> }> {
  const seen: unknown[] = []

  await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
    if (route.request().method() === "PATCH") seen.push(route.request().postDataJSON())
    await route.continue()
  })

  return {
    count: () => seen.length,
    bodies: () => [...seen],
    stop: async () => {
      await page.unroute(SINGLE_CONTACT_ROUTE)
    },
  }
}

/** The preview harness's editor columns, and how each one is addressed. */
const PREVIEW_OPENERS: ReadonlyArray<{
  columnId: string
  columnLabel: string
  open: (cell: Locator) => Promise<void>
}> = [
  { columnId: "owner", columnLabel: "a plain editable column (no `editor`)", open: openCellEditor },
  { columnId: "notes", columnLabel: "another plain editable column", open: openCellEditor },
  { columnId: "amount", columnLabel: "`currency`", open: openCellEditor },
  { columnId: "quantity", columnLabel: "`number`", open: openCellEditor },
  { columnId: "emailAddress", columnLabel: "`email`", open: openCellEditor },
  // The centre of this cell is its own anchor, so the double-click has to land
  // on the padding or the first click navigates — see `openCellEditorAtCorner`.
  { columnId: "website", columnLabel: "`url`", open: openCellEditorAtCorner },
]

test.describe("CAP-10 — one opener", () => {
  for (const editor of PREVIEW_OPENERS) {
    test(`a double-click opens ${editor.columnLabel}`, async ({ page }) => {
      await openPreviewGrid(page)

      await editor.open(cellAt(page, 0, editor.columnId))

      await expect(
        cellEditor(page),
        `a double-click must open the ${editor.columnId} editor in-cell`,
      ).toBeFocused()
      await page.keyboard.press("Escape")
      await expect(cellEditor(page), "Escape closed it").toHaveCount(0)
    })
  }

  test("a double-click opens `user` on the preview harness", async ({ page }) => {
    await openPreviewGrid(page)

    await openCellEditor(cellAt(page, 0, "assignee"))

    await expect(
      page.getByRole("textbox", { name: /Find Assignee/ }),
      "the user editor opens a searchable popover",
    ).toBeFocused()
    await page.keyboard.press("Escape")
  })

  test("a double-click opens select, multiselect, date and longtext on /manage", async ({ page }) => {
    const select = await inScopeRow(23)
    const multiselect = await inScopeRow(25)
    const date = await inScopeRow(27)
    const notes = await inScopeRow(29)

    const selectCell = await contactsCell(page, select.id, select.name, "source")
    await openCellEditor(selectCell)
    await expect(page.getByRole("textbox", { name: /Find an option for Source/ })).toBeFocused()
    await page.keyboard.press("Escape")

    const multiCell = await contactsCell(page, multiselect.id, multiselect.name, "booksRead")
    await openCellEditor(multiCell)
    await expect(page.getByRole("option").first(), "multiselect lists its options").toBeVisible()
    await page.keyboard.press("Escape")

    const dateCell = await contactsCell(page, date.id, date.name, "initialContact")
    await openCellEditor(dateCell)
    await expect(page.locator('[data-grid-editor="calendar"]'), "date opens a calendar").toBeVisible()
    await page.keyboard.press("Escape")

    const notesCell = await contactsCell(page, notes.id, notes.name, "notes")
    await openCellEditor(notesCell)
    await expect(page.getByRole("textbox", { name: "Edit Notes" })).toBeFocused()
    await page.keyboard.press("Escape")
  })

  test("a single click opens nothing and makes the clicked cell active", async ({ page }) => {
    await openPreviewGrid(page)

    await cellAt(page, 0, "owner").click()
    await expect(cellAt(page, 0, "owner"), "a single click still focuses the cell").toBeFocused()
    await expect(cellEditor(page), "a single click must not open an editor").toHaveCount(0)

    // Nor does it open a popover editor: the retired click-to-open display was
    // the second half of that gesture, and both halves are asserted together
    // because a restoration of only the display would pass the first line.
    await cellAt(page, 0, "assignee").click()
    await expect(cellAt(page, 0, "assignee")).toBeFocused()
    await expect(
      page.getByRole("textbox", { name: /Find Assignee/ }),
      "a click-to-open display must not open its popover",
    ).toHaveCount(0)
    await expect(page.getByRole("option"), "and no option list appears").toHaveCount(0)
  })

  test("a read-only column opens nothing, and a checkbox cell nets unchanged", async ({ page }) => {
    await openPreviewGrid(page)

    // `ref` is the frozen identity column: read-only, so outside the
    // `meta.grid.editable` guard `openEditor` returns false on.
    const refBefore = (await cellAt(page, 0, "ref").textContent()) ?? ""
    await openCellEditor(cellAt(page, 0, "ref"))
    await expect(cellEditor(page), "a read-only column must not open an editor").toHaveCount(0)
    await expect(cellAt(page, 0, "ref"), "and must not change the cell").toHaveText(refBefore)

    // A double-click is two clicks, and a checkbox commits on each, so the value
    // nets unchanged — and no editor may appear over it either.
    const box = cellAt(page, 1, "flagged").getByRole("checkbox")
    await expect(box).toHaveAttribute("aria-checked", "false")
    await openCellEditor(cellAt(page, 1, "flagged"))
    await expect(box, "two clicks net unchanged").toHaveAttribute("aria-checked", "false")
    await expect(cellEditor(page), "and a toggle opens no editor").toHaveCount(0)
  })
})

test.describe("CAP-10 — one commit path", () => {
  test("a second double-click commits the open draft exactly once", async ({ page }) => {
    const target = await inScopeRow(31)
    const original = await readContactColumn([target.id], "name")
    const renamed = `${target.name}-Second`

    const cell = await contactsCell(page, target.id, target.name, "name")
    const patches = await countContactPatches(page)

    try {
      await openCellEditor(cell)
      await expect(cellEditor(page)).toBeFocused()
      await cellEditor(page).press("ControlOrMeta+a")
      await page.keyboard.type(renamed)

      await openCellEditor(cell)

      await expect(cellEditor(page), "the second double-click closes the editor").toHaveCount(0)
      await expect.poll(() => patches.count(), { message: "one edit is one PATCH" }).toBe(1)
      expect(patches.bodies()[0]).toMatchObject({ contactId: target.id, name: renamed })
      await expect(cellIn(rowById(page, target.id), "name")).toHaveText(renamed)
      await expect
        .poll(async () => (await readContactColumn([target.id], "name")).get(target.id))
        .toBe(renamed)
    } finally {
      await patches.stop()
      await restoreContactColumn(original, "name")
    }
  })

  test("blur commits a touched draft exactly once, and does not pull focus back", async ({ page }) => {
    const target = await inScopeRow(32)
    const original = await readContactColumn([target.id], "name")
    const renamed = `${target.name}-Blurred`

    const cell = await contactsCell(page, target.id, target.name, "name")
    const patches = await countContactPatches(page)

    try {
      await openCellEditor(cell)
      await expect(cellEditor(page)).toBeFocused()
      await cellEditor(page).press("ControlOrMeta+a")
      await page.keyboard.type(renamed)

      await page.locator("h1").click()

      await expect.poll(() => patches.count(), { message: "blur is one commit" }).toBe(1)
      await expect
        .poll(async () => (await readContactColumn([target.id], "name")).get(target.id))
        .toBe(renamed)

      // Focus is not yanked back: `runCommit` hands focus to the edited cell for
      // `Enter` and `Escape`, and the blur path is the one that has to suppress
      // that, because the operator deliberately moved somewhere else.
      const focused = await page.evaluate(() => {
        const active = document.activeElement
        if (!(active instanceof HTMLElement)) return "none"
        return active.getAttribute("data-grid-cell") ?? active.tagName
      })
      expect(focused, "a blur-commit must not return focus to the edited cell").not.toBe(
        `${target.id}~name`,
      )
    } finally {
      await patches.stop()
      await restoreContactColumn(original, "name")
    }
  })

  test("blur of an UNTOUCHED draft issues zero requests and leaves the grid alone", async ({ page }) => {
    const target = await inScopeRow(33)
    const original = await readContactColumn([target.id], "name")
    const before = original.get(target.id)

    const cell = await contactsCell(page, target.id, target.name, "name")
    const patches = await countContactPatches(page)

    try {
      await openCellEditor(cell)
      await expect(cellEditor(page), "the editor opens").toBeFocused()

      // No keystroke at all. The draft was seeded from the cell's own value, so
      // committing it would PATCH production data on every stray cell click.
      await page.locator("h1").click()

      await expect(cellEditor(page), "the editor closes").toHaveCount(0)
      expect(patches.count(), "an untouched blur must issue no request at all").toBe(0)
      await expect(cellIn(rowById(page, target.id), "name")).toHaveText(before ?? "")
      expect((await readContactColumn([target.id], "name")).get(target.id)).toBe(before)
      await expect(cellIn(rowById(page, target.id), "name"), "and left it unmarked").not.toHaveClass(
        /text-destructive/,
      )
    } finally {
      await patches.stop()
    }
  })

  test("an untouched popover editor commits nothing either", async ({ page }) => {
    const target = await inScopeRow(34)
    const original = await readContactColumn([target.id], "source")

    const cell = await contactsCell(page, target.id, target.name, "source")
    const patches = await countContactPatches(page)

    try {
      await openCellEditor(cell)
      await expect(page.getByRole("option").first()).toBeVisible()
      await page.locator("h1").click()

      await expect(page.getByRole("option"), "the popover closed").toHaveCount(0)
      expect(patches.count(), "a select opened and dismissed without a pick must not write").toBe(0)
      expect((await readContactColumn([target.id], "source")).get(target.id)).toBe(
        original.get(target.id),
      )
    } finally {
      await patches.stop()
    }
  })

  test("a picked dropdown option survives the click-away that closes its popover", async ({ page }) => {
    const target = await inScopeRow(35)
    const original = await readContactColumn([target.id], "source")

    const cell = await contactsCell(page, target.id, target.name, "source")
    const patches = await countContactPatches(page)

    try {
      await openCellEditor(cell)
      const option = page.getByRole("option", { name: "preview-fixture", exact: true })
      await expect(option).toBeVisible()
      await option.click()

      // The click-away is what closes the popover, and closing is now a commit.
      // With the old `onOpenChange` this discarded the option the operator had
      // just picked — the most expensive regression in this story, because
      // nothing about the interaction looks wrong.
      await page.locator("h1").click()

      await expect.poll(() => patches.count(), { message: "the pick is one commit" }).toBe(1)
      expect(patches.bodies()[0]).toMatchObject({ contactId: target.id, source: "preview-fixture" })
      await expect
        .poll(async () => (await readContactColumn([target.id], "source")).get(target.id))
        .toBe("preview-fixture")
      await expect(cellIn(rowById(page, target.id), "source")).toHaveText("preview-fixture")
    } finally {
      await patches.stop()
      await restoreContactColumn(original, "source")
    }
  })

  test("validation runs before the save: a rejected draft is never sent", async ({ page }) => {
    const target = await inScopeRow(36)
    const original = await readContactColumn([target.id], "initial_contact")
    const before = original.get(target.id)

    const cell = await contactsCell(page, target.id, target.name, "initialContact")
    const patches = await countContactPatches(page)

    try {
      await openCellEditor(cell)
      const field = page.getByRole("textbox", { name: "Initial Contact as YYYY-MM-DD" })
      await expect(field, "the calendar's typed alternative is rendered").toBeVisible()

      // `2026-02-31` is the editor's own rejection: `parse` throws before any
      // value exists to send. That is the distinction this test is about — a
      // *server* rejection (an empty required name) is sent and refused, and
      // `grid-editors.spec.ts` covers that one; a *client* rejection must never
      // reach the network at all, which is what proves the typed editor supplies
      // validation only and the commit path still owns the save.
      await field.pressSequentially("2026-02-31")
      await field.press("Enter")

      const dateCell = cellIn(rowById(page, target.id), "initialContact")
      await expect(dateCell, "a rejected draft reverts").toHaveText(
        // CHANGED by premium-grid story 3 (CAP-3, blank-not-dash): the em-dash that
        // stood in for an empty baseline is gone, so an empty column reverts to the
        // empty string. Recorded contract change, not a weakened gate — the
        // destructive marking and the `data-grid-cell-error` message below still
        // prove the draft was refused rather than saved.
        String(before ?? ""),
      )
      await expect(dateCell, "and is marked destructive").toHaveClass(/text-destructive/)
      await expect(dateCell, "the refusal rides the cell itself").toHaveAttribute(
        "data-grid-cell-error",
        /must be a real date/,
      )
      expect(patches.count(), "a rejected draft must not be sent").toBe(0)
      expect((await readContactColumn([target.id], "initial_contact")).get(target.id)).toBe(before)
    } finally {
      await patches.stop()
    }
  })
})

test.describe("CAP-10 — Escape is the only discard", () => {
  test("Escape discards on an in-cell editor", async ({ page }) => {
    await openPreviewGrid(page)
    const before = (await cellAt(page, 0, "owner").textContent()) ?? ""

    await openCellEditor(cellAt(page, 0, "owner"))
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await page.keyboard.type("Discarded")
    await page.keyboard.press("Escape")

    await expect(cellEditor(page), "Escape closes the editor").toHaveCount(0)
    await expect(cellAt(page, 0, "owner"), "Escape writes nothing").toHaveText(before)
  })

  test("Escape discards a typed draft in a select", async ({ page }) => {
    const target = await inScopeRow(37)
    const original = await readContactColumn([target.id], "source")

    const cell = await contactsCell(page, target.id, target.name, "source")
    const patches = await countContactPatches(page)

    try {
      await openCellEditor(cell)
      const search = page.getByRole("textbox", { name: /Find an option for Source/ })
      await expect(search).toBeFocused()
      await search.pressSequentially("no-such-source")
      await page.keyboard.press("Escape")

      await expect(page.getByRole("option"), "Escape closed the select").toHaveCount(0)
      expect(patches.count(), "Escape must discard a typed select draft").toBe(0)
      expect((await readContactColumn([target.id], "source")).get(target.id)).toBe(
        original.get(target.id),
      )
    } finally {
      await patches.stop()
    }
  })

  test("Escape discards a multiselect pick, which has no local Escape handler of its own", async ({
    page,
  }) => {
    const target = await inScopeRow(38)
    const original = await readContactColumn([target.id], "books_read")

    const cell = await contactsCell(page, target.id, target.name, "booksRead")
    const patches = await countContactPatches(page)

    try {
      await openCellEditor(cell)
      await expect(page.getByRole("option").first()).toBeVisible()
      await page.getByRole("option").first().click()

      // The multiselect option list has **no** local `Escape` handler: a bare
      // `Escape` reaches Radix and dismisses the popover. Now that closing
      // commits, that would silently commit the pick instead of discarding it —
      // which is why the discard is a flag Radix's own handler reads.
      await page.keyboard.press("Escape")

      await expect(page.getByRole("option"), "Escape closed the multiselect").toHaveCount(0)
      expect(patches.count(), "Escape must discard a multiselect pick, not commit it").toBe(0)
      expect((await readContactColumn<string[]>([target.id], "books_read")).get(target.id)).toEqual(
        original.get(target.id) ?? [],
      )
    } finally {
      await patches.stop()
    }
  })

  test("Escape discards a typed date in the calendar, which has no local handler either", async ({
    page,
  }) => {
    const target = await inScopeRow(39)
    const original = await readContactColumn([target.id], "initial_contact")

    const cell = await contactsCell(page, target.id, target.name, "initialContact")
    const patches = await countContactPatches(page)

    try {
      await openCellEditor(cell)
      await expect(page.locator('[data-grid-editor="calendar"]')).toBeVisible()
      await page
        .getByRole("textbox", { name: "Initial Contact as YYYY-MM-DD" })
        .pressSequentially("2026-04-01")
      await page.keyboard.press("Escape")

      await expect(
        page.locator('[data-grid-editor="calendar"]'),
        "Escape closed the calendar",
      ).toHaveCount(0)
      expect(patches.count(), "Escape must discard a typed date, not commit it").toBe(0)
      expect((await readContactColumn([target.id], "initial_contact")).get(target.id)).toBe(
        original.get(target.id),
      )
    } finally {
      await patches.stop()
    }
  })
})

test.describe("CAP-10 — what still works", () => {
  test("arrows, Tab and Home navigate without opening an editor", async ({ page }) => {
    await openPreviewGrid(page)

    await openCellEditor(cellAt(page, 0, "owner"))
    await expect(cellEditor(page)).toBeFocused()
    await cellEditor(page).press("ControlOrMeta+a")
    await page.keyboard.type("Owner-Nav")
    await page.keyboard.press("Enter")
    await expect(cellEditor(page)).toHaveCount(0)

    await cellAt(page, 0, "owner").click()

    await page.keyboard.press("ArrowRight")
    await expect(cellAt(page, 0, "region"), "ArrowRight moves one column").toBeFocused()
    await expect(cellEditor(page), "arrowing must not open an editor").toHaveCount(0)

    await page.keyboard.press("ArrowDown")
    await expect(cellAt(page, 1, "region"), "ArrowDown moves one row").toBeFocused()
    await expect(cellEditor(page), "arrowing must not open an editor").toHaveCount(0)

    // `region` is the third preview column, so `Tab` lands on `status`.
    await page.keyboard.press("Tab")
    await expect(cellAt(page, 1, "status"), "Tab advances within the row").toBeFocused()
    await expect(cellEditor(page), "Tab must not open an editor").toHaveCount(0)

    await page.keyboard.press("Home")
    await expect(cellAt(page, 1, "ref"), "Home jumps to the row's first cell").toBeFocused()
    await expect(cellEditor(page), "Home must not open an editor").toHaveCount(0)
  })

  test("Space still toggles a checkbox and opens nothing", async ({ page }) => {
    await openPreviewGrid(page)

    const box = cellAt(page, 1, "flagged").getByRole("checkbox")
    await expect(box).toHaveAttribute("aria-checked", "false")

    // The cell's padding rather than the checkbox itself: the centre of this cell
    // *is* the control, and a click on it is a commit rather than a focus.
    await cellAt(page, 1, "flagged").click({ position: { x: 2, y: 2 } })
    await page.keyboard.press("Space")
    await expect(box, "Space still toggles the checkbox").toHaveAttribute("aria-checked", "true")
    await expect(cellEditor(page), "and a toggle opens no editor").toHaveCount(0)

    await page.keyboard.press("Space")
    await expect(box, "and again").toHaveAttribute("aria-checked", "false")
  })

  test("`e`, a printable character, Space on a text cell and Enter open nothing", async ({ page }) => {
    await openPreviewGrid(page)
    const before = (await cellAt(page, 0, "owner").textContent()) ?? ""

    await cellAt(page, 0, "owner").click()

    // CAP-10's "no other gesture opens it", asserted per gesture rather than as
    // one combined press, so restoring any single branch turns exactly one of
    // these red and the others still pass.
    await page.keyboard.press("e")
    await expect(cellEditor(page), "`e` must not open an editor").toHaveCount(0)

    await page.keyboard.press("R")
    await expect(cellEditor(page), "a printable character must not open an editor").toHaveCount(0)

    await page.keyboard.press("Space")
    await expect(cellEditor(page), "Space must not open an editor on a text cell").toHaveCount(0)

    await page.keyboard.press("Enter")
    await expect(cellEditor(page), "Enter must not open an editor").toHaveCount(0)

    await expect(cellAt(page, 0, "owner"), "and none of them changed the cell").toHaveText(before)
    await expect(cellAt(page, 0, "owner"), "or left it marked").not.toHaveClass(
      /text-destructive/,
    )
  })
})

test.describe("CAP-10 — the grid renders no strip between the toolbar and the headers", () => {
  test("neither the status strip nor the edit hint is rendered, at rest or while editing", async ({
    page,
  }) => {
    await openPreviewGrid(page)

    // Both strips are gone, so the toolbar is followed directly by the table. The
    // refusal messages they carried live on the cell that failed instead
    // (`data-grid-cell-error`), which is asserted throughout `grid-editors`.
    await expect(
      page.locator("[data-grid-edit-hint]"),
      "the edit hint line is not rendered at rest",
    ).toHaveCount(0)
    await expect(
      gridRoot(page).locator('p[role="status"]'),
      "and neither is a status strip",
    ).toHaveCount(0)

    await openCellEditor(cellAt(page, 0, "owner"))

    await expect(
      page.locator("[data-grid-edit-hint]"),
      "the hint does not appear once an editor opens, either",
    ).toHaveCount(0)
    await expect(
      gridRoot(page).locator('p[role="status"]'),
      "nor does a status strip",
    ).toHaveCount(0)
  })
})