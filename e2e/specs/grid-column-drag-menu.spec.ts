/**
 * Story 2 of spec-contacts-premium-grid — column drag-and-drop, the three-item
 * column menu, the contextual header affordance, and the menu-opened sort
 * popover.
 *
 * | Test | Scenario | Claim under test |
 * | ---- | -------- | ---------------- |
 * | menu 1 | column menu opened | exactly Sort ascending, Sort descending, Hide column — no Move items, no Filter |
 * | menu 2 | menu trigger at rest / hover / focus | opacity reveal that stays focusable and tappable, never display:none; suppressed on the selection column |
 * | menu 3 | pinned columns | `select` and `name` carry no drag activator |
 * | drag 1 | mouse drag across one column | order commits once through `cols` and survives a reload |
 * | drag 2 | drop onto the pinned run | rejected: order unchanged, no `cols` written |
 * | drag 3 | drag past a hidden column | the move steps over it; the hidden id keeps its slot |
 * | drag 4 | keyboard drag | the keyboard sensor path commits through `cols` too |
 * | sort 1 | Sort descending from the menu | sort applies and the popover opens prefilled with field and direction |
 * | sort 2 | Clear sort in the popover | valid empty state, `sort` param removed |
 *
 * Drags address the header's drag activator (`[data-grid-drag-handle]`), which
 * is the label itself — pinned columns render a plain label instead, which is
 * what "no handle, no activator" is asserted against.
 */

import { expect, test } from "@playwright/test"

import {
  clearSortButton,
  columnMenuTrigger,
  dragHandle,
  dragHeaderTo,
  headerCell,
  headerColumnIds,
  openColumnMenu,
  openContactsGrid,
  sortDirectionTrigger,
  sortFieldTrigger,
  sortPopover,
} from "../fixtures/manage-grid"

/** `COLUMN_IDS` in `manage-contacts-table.tsx`, the default display order. */
const DEFAULT_ORDER = [
  "select",
  "name",
  "phone",
  "location",
  "source",
  "booksRead",
  "initialContact",
  "dateOfBirth",
  "totalAttendanceCount",
  "past60DayAttendanceCount",
  "lastContactedOn",
  "notes",
  "collectedBy",
  "favorite",
  "actions",
]

test.describe("column menu, drag-and-drop and the sort popover", () => {
  test("menu 1 — the column menu holds exactly Sort ascending, Sort descending, Hide column", async ({
    page,
  }) => {
    await openContactsGrid(page)
    await openColumnMenu(page, "phone", "Phone")

    const items = page.getByRole("menuitem")
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toHaveAccessibleName("Sort ascending")
    await expect(items.nth(1)).toHaveAccessibleName("Sort descending")
    await expect(items.nth(2)).toHaveAccessibleName("Hide column")

    // The removed Move items and the story-6 Filter item must not be here: a
    // Filter item would point at a surface that does not exist yet.
    await expect(page.getByRole("menuitem", { name: /Move left|Move right|Filter/ })).toHaveCount(0)
    await page.keyboard.press("Escape")
  })

  test("menu 2 — the menu control reveals on hover and focus without ever hiding from touch", async ({
    page,
  }) => {
    await openContactsGrid(page)
    const trigger = columnMenuTrigger(page, "phone", "Phone")

    // Reachable at rest: opacity-zero still occupies layout and takes focus,
    // which is the whole point of the opacity treatment over display:none.
    await expect(trigger).toBeVisible()
    await expect(trigger).toBeEnabled()
    const atRest = await trigger.evaluate((node) => {
      const style = getComputedStyle(node)
      return { display: style.display, opacity: style.opacity }
    })
    expect(atRest.display, "the menu control must never be display:none").not.toBe("none")
    expect(atRest.opacity).toBe("0")

    await headerCell(page, "phone").hover()
    await expect
      .poll(() => trigger.evaluate((node) => getComputedStyle(node).opacity), {
        message: "hovering the header must reveal the menu control",
      })
      .toBe("1")

    // Keyboard focus within the header reveals it too, so the control is
    // operable without a mouse.
    await dragHandle(page, "phone").focus()
    await expect
      .poll(() => trigger.evaluate((node) => getComputedStyle(node).opacity), {
        message: "keyboard focus must reveal the menu control",
      })
      .toBe("1")
  })

  test("menu 2 (suppression) — the selection column carries no menu control", async ({
    page,
  }) => {
    await openContactsGrid(page)

    // The select header renders the consumer's own select-all control, so no
    // menu trigger may exist inside it.
    await expect(headerCell(page, "select").getByRole("button", { name: /Column options/ })).toHaveCount(
      0,
    )
  })

  test("menu 3 — pinned columns are not draggable", async ({ page }) => {
    await openContactsGrid(page)

    await expect(dragHandle(page, "select")).toHaveCount(0)
    await expect(dragHandle(page, "name")).toHaveCount(0)
    await expect(dragHandle(page, "phone")).toBeVisible()
  })

  test("drag 1 — a mouse drag commits once through cols and survives a reload", async ({
    page,
  }) => {
    await openContactsGrid(page)

    // Phone (index 2) dropped onto source (index 4) lands immediately before
    // it: select,name,location,phone,source,… — a visible, exact reorder.
    const expected = [...DEFAULT_ORDER]
    expected.splice(2, 1)
    expected.splice(expected.indexOf("source"), 0, "phone")

    await dragHeaderTo(page, "phone", "source")

    await expect
      .poll(() => new URL(page.url()).searchParams.get("cols"), {
        message: "the drop must commit the order through cols",
      })
      .toBe(expected.join(","))
    expect(await headerColumnIds(page)).toEqual(expected)

    await page.reload()
    await expect(page.locator('tbody[data-grid-panel="ready"]')).toBeAttached()
    expect(await headerColumnIds(page)).toEqual(expected)
    expect(new URL(page.url()).searchParams.get("cols")).toBe(expected.join(","))
  })

  test("drag 2 — a drop onto the pinned run is rejected and leaves the order unchanged", async ({
    page,
  }) => {
    await openContactsGrid(page)

    // Location dropped onto the pinned name header would interleave a
    // scrolling column into the run; the resulting order is invalid, so
    // nothing is committed.
    await dragHeaderTo(page, "location", "name")

    // Settle: a rejected drop writes nothing, so polling the header order for
    // a paint proves the grid had its chance to move.
    await expect
      .poll(async () => (await headerColumnIds(page)).join(","), {
        message: "a rejected drop must leave the order unchanged",
      })
      .toBe(DEFAULT_ORDER.join(","))
    expect(
      new URL(page.url()).searchParams.get("cols"),
      "a rejected drop must not write cols",
    ).toBeNull()
  })

  test("drag 3 — a drag steps over a hidden column, which keeps its slot", async ({
    page,
  }) => {
    await openContactsGrid(page)

    // Hide source first; it still holds position 4 in columnOrder.
    await openColumnMenu(page, "source", "Source")
    await page.getByRole("menuitem", { name: "Hide column" }).click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("hide"), {
        message: "hiding source must round-trip through hide",
      })
      .toBe("source")

    // Location dropped onto phone: remove location, insert at phone's slot.
    // The hidden source stays at index 4 rather than collapsing.
    const full = [...DEFAULT_ORDER]
    full.splice(full.indexOf("location"), 1)
    full.splice(full.indexOf("phone"), 0, "location")

    await dragHeaderTo(page, "location", "phone")

    await expect
      .poll(() => new URL(page.url()).searchParams.get("cols"), {
        message: "the drop must commit the order through cols",
      })
      .toBe(full.join(","))
    expect(full.indexOf("source"), "the hidden column must keep its slot").toBe(4)

    // The visible headers are the committed order minus the hidden column.
    expect(await headerColumnIds(page)).toEqual(full.filter((id) => id !== "source"))
  })

  test("drag 4 — a keyboard drag commits through cols", async ({ page }) => {
    await openContactsGrid(page)

    // dnd-kit's keyboard sensor: focus the activator, Space to lift, arrows
    // to move (~25px each; phone is 140px wide, so ten presses cross it),
    // Space to drop.
    await dragHandle(page, "phone").focus()
    await page.keyboard.press("Space")
    for (let step = 0; step < 10; step += 1) {
      await page.keyboard.press("ArrowRight")
    }
    await page.keyboard.press("Space")

    await expect
      .poll(() => new URL(page.url()).searchParams.get("cols"), {
        message: "a keyboard drop must commit the order through cols",
      })
      .not.toBeNull()
    // Whatever slot it landed in, the rendered headers must decode to the
    // committed order rather than the default one.
    const cols = new URL(page.url()).searchParams.get("cols") ?? ""
    const rendered = await headerColumnIds(page)
    expect(rendered).not.toEqual(DEFAULT_ORDER)
    expect(cols.split(",")).toEqual(rendered)
  })

  test("sort 1 — a menu sort applies and opens the popover prefilled", async ({ page }) => {
    await openContactsGrid(page)

    await openColumnMenu(page, "phone", "Phone")
    await page.getByRole("menuitem", { name: "Sort descending" }).click()

    await expect(sortPopover(page)).toBeVisible()
    await expect(sortFieldTrigger(page)).toContainText("Phone")
    await expect(sortDirectionTrigger(page)).toContainText("Descending")
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sort"), {
        message: "the menu sort must apply through the sort param",
      })
      .toBe("phone:desc")
    await expect(headerCell(page, "phone")).toHaveAttribute("aria-sort", "descending")

    await page.keyboard.press("Escape")
    await expect(sortPopover(page)).toBeHidden()
  })

  test("sort 2 — clearing the sort in the popover empties the sort param", async ({ page }) => {
    await openContactsGrid(page, { params: { sort: "phone:desc" } })
    await expect(headerCell(page, "phone")).toHaveAttribute("aria-sort", "descending")

    await openColumnMenu(page, "phone", "Phone")
    await page.getByRole("menuitem", { name: "Sort descending" }).click()
    await expect(sortPopover(page)).toBeVisible()

    await clearSortButton(page).click()

    await expect
      .poll(() => new URL(page.url()).searchParams.get("sort"), {
        message: "a cleared sort must drop the sort param",
      })
      .toBeNull()
    await expect(headerCell(page, "phone")).toHaveAttribute("aria-sort", "none")
  })

  test("hide — Hide column removes the header and round-trips", async ({ page }) => {
    await openContactsGrid(page)

    await openColumnMenu(page, "notes", "Notes")
    await page.getByRole("menuitem", { name: "Hide column" }).click()

    await expect(headerCell(page, "notes")).toHaveCount(0)
    await expect
      .poll(() => new URL(page.url()).searchParams.get("hide"), {
        message: "hiding notes must round-trip through hide",
      })
      .toBe("notes")

    // The menu is one of three items even on the last action: reopening
    // elsewhere still shows the full surface.
    await openColumnMenu(page, "phone", "Phone")
    await expect(page.getByRole("menuitem")).toHaveCount(3)
    await page.keyboard.press("Escape")
  })
})
