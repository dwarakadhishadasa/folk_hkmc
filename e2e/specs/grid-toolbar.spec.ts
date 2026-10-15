/**
 * Story 7 — the toolbar: compaction, *Hide fields*, the global Sort control, and
 * the contextual selection band.
 *
 * Two decisions in this file are Dwaraka's and are load-bearing enough to say so
 * at the top, because a later reader would otherwise "fix" them:
 *
 * 1. **Nine columns is nine *fields*.** `COLUMN_IDS` is fifteen entries and one
 *    of them is `select`, which is a control rather than a field, so the frame
 *    renders **ten** headers: `select` plus CAP-18's nine visible fields. The
 *    acceptance criterion says "exactly nine columns render"; the assertion below
 *    names all ten ids, because an exact list is the only form of that claim
 *    which cannot be satisfied by the wrong ten.
 * 2. **An empty selection reads the record count.** The selection readout lives
 *    in the status row below the grid, which is always in the frame — so at
 *    rest it carries the record count, and a selection swaps that same spot to
 *    the selection. `manage-contacts-selection.spec.ts` carries the same note
 *    on matrix row 12.
 *
 * **Everything else in here is one test per row of the story's I/O & Edge-Case
 * Matrix**, in matrix order, because the matrix is the specification and a spec
 * that only covers the easy rows leaves the hard ones to be discovered by an
 * operator.
 */

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import {
  columnMenuTrigger,
  filterGlobally,
  headerCell,
  headerColumnIds,
  hideFieldToggle,
  hideFieldsControl,
  hideFieldsPopover,
  inScopeCounts,
  manageContactsUrl,
  openColumnMenu,
  openContactsGrid,
  renderedRows,
  sortDirectionTrigger,
  sortFieldTrigger,
  sortPopover,
  sortToolbarControl,
  statusCount,
  statusFooter,
  clearSortButton,
} from "../fixtures/manage-grid"

/** CAP-18's five, by column id. Hidden until asked for; reachable through *Hide fields*. */
const DEFAULT_HIDDEN = ["source", "booksRead", "dateOfBirth", "lastContactedOn", "favorite"]

/**
 * The same fourteen data fields by **display label**, in the same order.
 *
 * `*Hide fields*` rows are asserted on labels, not ids, because the label is
 * what the operator reads and what CAP-18 is written in ("Visible: Name, Phone,
 * Location, …"). Ids are asserted where the grid renders them — `headerColumnIds`
 * — so both halves of the claim are covered somewhere rather than one half being
 * checked twice under two names.
 */
const ALL_FIELD_LABELS = [
  "Name",
  "Phone",
  "Location",
  "Source",
  "Books Read",
  "Initial Contact",
  "Date of Birth",
  "Total Attendance",
  "Past 60 Days",
  "Last Contacted On",
  "Notes",
  "Collected By",
  "Favorite",
  "Actions",
]

/** CAP-18's nine visible fields, by label — the rows shown ticked by default. */
const DEFAULT_VISIBLE_LABELS = [
  "Name",
  "Phone",
  "Location",
  "Initial Contact",
  "Total Attendance",
  "Past 60 Days",
  "Notes",
  "Collected By",
  "Actions",
]

/** The nine fields a default load shows, in column-definition order. */
const DEFAULT_VISIBLE_FIELDS = [
  "name",
  "phone",
  "location",
  "initialContact",
  "totalAttendanceCount",
  "past60DayAttendanceCount",
  "notes",
  "collectedBy",
  "actions",
]

/**
 * The fourteen data fields, in column-definition order, excluding `select`.
 *
 * This is also the order *Hide fields* must list them in: a visibility list
 * ordered by anything else (alphabetically, by whether the column is currently
 * shown) is a list the operator has to re-read every time they open it.
 */
const ALL_FIELDS = [
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

/** Header ids, which name `select` and the visible fields. */
const toHeaderIds = (fields: readonly string[]) => ["select", ...fields]

/** The `hide` param as the live URL reports it: present-but-empty is not absent. */
async function hideParam(page: Page): Promise<{ present: boolean; value: string | null }> {
  const params = new URL(page.url()).searchParams

  return { present: params.has("hide"), value: params.get("hide") }
}

/** Open *Hide fields* and wait for it. */
async function openHideFields(page: Page): Promise<void> {
  await hideFieldsControl(page).click()
  await expect(hideFieldsPopover(page)).toBeVisible()
}

/**
 * The labels *Hide fields* lists, top to bottom.
 *
 * Read from the checkbox names rather than from the row text, so the assertion is
 * about the fourteen *fields* and cannot be satisfied by fourteen rows of chrome.
 *
 * `[role="checkbox"]`, not `input[type="checkbox"]`: `components/ui/checkbox.tsx`
 * is Radix, and Radix renders a `<button role="checkbox">` — there is no input
 * element in the row at all. An `input[type=checkbox]` selector matches nothing
 * and yields an empty list, which reads as "no fields are listed" rather than as
 * the selector being wrong.
 */
async function hideFieldLabels(page: Page): Promise<string[]> {
  return hideFieldsPopover(page)
    .locator('[role="checkbox"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => {
        const label = input.closest("label")
        return (label?.textContent ?? "").replace(/[\s]+/g, " ").trim()
      }),
    )
}

/** The fields whose checkbox is ticked, in list order. */
async function tickedHideFields(page: Page): Promise<string[]> {
  return hideFieldsPopover(page)
    .locator('[role="checkbox"][data-state="checked"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => (input.closest("label")?.textContent ?? "").replace(/[\s]+/g, " ").trim()),
    )
}

test.describe("story 7 — the contacts toolbar", () => {
  test("default field set — no `hide` param renders CAP-18's nine, and the five stay reachable", async ({
    page,
  }) => {
    await openContactsGrid(page)

    expect(await headerColumnIds(page), "a default load renders select plus the nine visible fields").toEqual(
      toHeaderIds(DEFAULT_VISIBLE_FIELDS),
    )

    // Reachable, not deleted: every one of the five is still offered by
    // *Hide fields*, just unticked.
    await openHideFields(page)
    expect(await hideFieldLabels(page), "fourteen data fields, in column-definition order").toEqual(
      ALL_FIELD_LABELS,
    )
    expect(await tickedHideFields(page), "the nine checked fields").toEqual(DEFAULT_VISIBLE_LABELS)
  })

  test("existing shared link — `hide=notes` still means only Notes hidden", async ({ page }) => {
    // The backward-compatibility row. Before this story `hide` was a delta against
    // "nothing hidden by default", so `hide=notes` was already in the wild; a
    // defaults-aware codec that still keyed on emptiness would have changed what
    // every one of those links means, silently, for every operator who ever sent
    // one.
    await openContactsGrid(page, { params: { hide: "notes" } })

    expect(
      await headerColumnIds(page),
      "a link written before this story must still hide exactly the one column it named",
    ).toEqual(toHeaderIds(ALL_FIELDS.filter((id) => id !== "notes")))

    await expect(headerCell(page, "notes")).toHaveCount(0)
  })

  test("un-hide one default column — the key lists the still-hidden columns explicitly", async ({ page }) => {
    await openContactsGrid(page, {
      params: { hide: "booksRead,dateOfBirth,lastContactedOn,favorite" },
    })

    // `source` is visible again and the other four are not: a default that
    // un-hiding could only revert, rather than persist, would fail here.
    expect(await headerColumnIds(page)).toEqual(
      toHeaderIds([
        "name",
        "phone",
        "location",
        "source",
        "initialContact",
        "totalAttendanceCount",
        "past60DayAttendanceCount",
        "notes",
        "collectedBy",
        "actions",
      ]),
    )

    await openHideFields(page)
    // Ticked means VISIBLE, so this is the nine plus the un-hidden `Source` —
    // and `Source` sits fourth, in column order, not appended. The four that
    // remain hidden are the ones *absent* from this list, which the header
    // assertion above already proved by naming them.
    expect(await tickedHideFields(page)).toEqual([
      "Name",
      "Phone",
      "Location",
      "Source",
      "Initial Contact",
      "Total Attendance",
      "Past 60 Days",
      "Notes",
      "Collected By",
      "Actions",
    ])
  })

  test("everything un-hidden — `hide=` is present and empty, so the defaults do not come back", async ({
    page,
  }) => {
    await openContactsGrid(page, { params: { hide: "" } })

    expect(await headerColumnIds(page), "all fourteen fields are visible").toEqual(toHeaderIds(ALL_FIELDS))

    // The whole point of keying on presence: `hide=` is the ONLY encoding that can
    // say "hide nothing". A key that were deleted here would restore the five
    // defaults on the next reload, which is the same defect as a default that
    // could not be undone.
    expect(
      await hideParam(page),
      "`hide=` must survive; deleting it would bring the five defaults back",
    ).toEqual({ present: true, value: "" })
  })

  test("default restored — re-hiding the one un-hidden column removes the key entirely", async ({ page }) => {
    await openContactsGrid(page, {
      params: { hide: "booksRead,dateOfBirth,lastContactedOn,favorite" },
    })

    await openHideFields(page)
    await hideFieldToggle(page, "Source").click()
    await expect(hideFieldsPopover(page)).toBeVisible()

    await expect
      .poll(async () => (await hideParam(page)).present, {
        message: "reaching the default set must drop the key rather than list all five",
      })
      .toBe(false)

    expect(await headerColumnIds(page), "and the defaults apply again").toEqual(
      toHeaderIds(DEFAULT_VISIBLE_FIELDS),
    )
  })

  test("Hide fields list — fourteen rows, `select` absent, Name and Actions locked", async ({ page }) => {
    await openContactsGrid(page)
    await openHideFields(page)

    const labels = await hideFieldLabels(page)
    expect(labels, "`select` is a control, not a field, so it is not in the list").toEqual(ALL_FIELD_LABELS)
    expect(labels).not.toContain("select")

    // Ticked, disabled, and carrying a lock — three separate claims, because a
    // lock drawn without a disabled control is a picture of a guard.
    for (const locked of ["Name", "Actions"]) {
      await expect(hideFieldToggle(page, locked), `${locked} is a locked field, so it stays visible`).toBeChecked()
      await expect(hideFieldToggle(page, locked), `${locked} cannot be toggled`).toBeDisabled()
    }

    expect(
      hideFieldsPopover(page).locator("[data-grid-hide-field-lock]"),
      "the lock marker renders once per locked field, and only per locked field",
    ).toHaveCount(2)

    // The twelve unlocked fields are genuinely unlocked — a list where every row
    // is disabled would satisfy the three assertions above.
    await expect(hideFieldToggle(page, "Phone")).toBeEnabled()
    await expect(hideFieldToggle(page, "Notes")).toBeEnabled()
  })

  test("toggling a locked row — Name and Actions cannot be hidden", async ({ page }) => {
    await openContactsGrid(page)
    await openHideFields(page)

    for (const locked of ["Name", "Actions"]) {
      const row = hideFieldsPopover(page)
        .locator("label")
        .filter({ has: page.getByText(locked, { exact: true }) })

      // The click is dispatched at the row's LABEL, not at the checkbox: that is
      // the path the label's `preventDefault` exists to stop, and clicking the
      // disabled checkbox directly would prove nothing about it.
      //
      // `Name` is the first row and gets a real pointer click. `Actions` is the
      // fourteenth of fourteen inside a `max-h-[380px] overflow-y-auto` list, so
      // it is laid out below the fold and Playwright reports "outside of the
      // viewport" — even with `force`, which skips actionability but still needs
      // a hit point. A DOM-dispatched click still runs React's `onClick` and the
      // `preventDefault`, which is exactly what is under test, and it does not
      // require the row to be on screen.
      if (locked === "Actions") {
        await row.dispatchEvent("click")
      } else {
        await row.click({ force: true })
      }

      await expect(
        hideFieldToggle(page, locked),
        "an attempted toggle leaves visibility unchanged",
      ).toBeChecked()
    }

    expect(
      await headerColumnIds(page),
      "neither the identity column nor the row-action column may disappear",
    ).toEqual(toHeaderIds(DEFAULT_VISIBLE_FIELDS))
  })

  test("header Hide column — one state, two routes", async ({ page }) => {
    await openContactsGrid(page)

    // Route one: the header menu's Hide column item. `notes` is an ordinary data
    // field with no lock on it, so it is the one column both routes can act on.
    await openColumnMenu(page, "notes", "Notes")
    await page.getByRole("menuitem", { name: /Hide column/i }).click()

    await expect(headerCell(page, "notes"), "the column is gone from the frame").toHaveCount(0)

    // Route two: the same write, observed from *Hide fields*. A second copy of the
    // state would show `notes` still ticked here, which is exactly the bug the
    // "one state, two routes" claim exists to prevent.
    await openHideFields(page)
    // Ticked means VISIBLE: the nine defaults with `Notes` now gone, because the
    // header menu hid it. `Notes` being absent from this list is the same fact
    // as the header assertion above, read through the other route.
    expect(await tickedHideFields(page)).toEqual([
      "Name",
      "Phone",
      "Location",
      "Initial Contact",
      "Total Attendance",
      "Past 60 Days",
      "Collected By",
      "Actions",
    ])
    await expect(hideFieldToggle(page, "Notes"), "`notes` is unticked in *Hide fields* too").not.toBeChecked()
  })

  test("Sort trigger — the toolbar is a third entry point onto the one sort popover", async ({ page }) => {
    await openContactsGrid(page)

    await sortToolbarControl(page).click()
    await expect(sortPopover(page), "the same popover the column menu opens").toBeVisible()
    await expect(sortFieldTrigger(page)).toBeVisible()
    await expect(sortDirectionTrigger(page)).toBeVisible()

    await sortFieldTrigger(page).click()
    await page.getByRole("option", { name: "Name", exact: true }).click()

    await expect
      .poll(() => new URL(page.url()).searchParams.get("sort"), {
        message: "choosing a field must write `sort`",
      })
      .toBe("name:asc")

    // And the direction, because the popover is one field plus one direction and a
    // field-only assertion would pass against a surface that ignored half of itself.
    await sortDirectionTrigger(page).click()
    await page.getByRole("option", { name: "Descending" }).click()

    await expect
      .poll(() => new URL(page.url()).searchParams.get("sort"), {
        message: "choosing a direction must write `sort` too",
      })
      .toBe("name:desc")

    // The column menu's own sort items still reach the same popover, prefilled.
    await clearSortButton(page).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBeNull()

    // **Dismiss this instance first.** There are now several `GridSortPopover`
    // mounts — the toolbar's plus one per header — and the locator resolves
    // whichever are open. Clearing the sort does not close the popover, so the
    // toolbar's would still be mounted when the header's opens and the locator
    // would match two elements instead of one. That is the locator reporting a
    // real fact about the DOM, not a defect in it.
    await page.keyboard.press("Escape")
    await expect(sortPopover(page)).toHaveCount(0)

    await openColumnMenu(page, "name", "Name")
    await page.getByRole("menuitem", { name: /Sort ascending/i }).click()
    await expect(sortPopover(page)).toBeVisible()
    await expect(sortFieldTrigger(page), "the menu item wrote `sorting` first, so the popover is prefilled").toHaveText(
      "Name",
    )
  })

  test("sort cleared — the key is absent and the header reads `aria-sort=none`", async ({ page }) => {
    await openContactsGrid(page, { params: { sort: "name:asc" } })
    await expect(headerCell(page, "name")).toHaveAttribute("aria-sort", "ascending")

    await sortToolbarControl(page).click()
    await clearSortButton(page).click()

    await expect
      .poll(() => new URL(page.url()).searchParams.get("sort"), {
        message: "a cleared sort is `[]`, which serializes as no `sort` key at all",
      })
      .toBeNull()
    await expect(headerCell(page, "name")).toHaveAttribute("aria-sort", "none")
  })

  test("selection chrome at rest — the status row reads the record count", async ({ page }) => {
    await openContactsGrid(page)
    const { total } = await inScopeCounts(page)

    // The status row is always in the frame, below the scroll container — so at
    // rest it carries the record count, and there is no bulk action anywhere.
    await expect(statusCount(page)).toHaveText(`${total} records`)
    await expect(page.getByRole("button", { name: /Add selected to favorites/ })).toHaveCount(0)
    await expect(statusFooter(page)).toBeVisible()
  })

  test("selection chrome active — the readout swaps to the selection, below the grid", async ({ page }) => {
    await openContactsGrid(page)
    await renderedRows(page).nth(0).getByRole("checkbox").click()

    await expect(statusCount(page)).toHaveText("1 selected")

    // Placement is the decision: below the scroll container, inside the grid
    // frame — the one place a count stays visible while the rows scroll.
    await expect
      .poll(async () =>
        statusFooter(page).evaluate((bar) => ({
          inFrame: bar.parentElement?.getAttribute("data-grid-root") !== null,
          underScroller: bar.previousElementSibling?.getAttribute("data-grid-scroll") !== null,
        })),
      )
      .toEqual({ inFrame: true, underScroller: true })
  })

  test("selection empties — the readout swaps back to the record count", async ({ page }) => {
    await openContactsGrid(page)
    const { total } = await inScopeCounts(page)
    const checkbox = renderedRows(page).nth(0).getByRole("checkbox")

    await checkbox.click()
    await expect(statusCount(page)).toHaveText("1 selected")

    await checkbox.click()
    await expect(statusCount(page)).toHaveText(`${total} records`)
  })

  test("selection across a filter — the count is of selected rows, not visible ones", async ({ page }) => {
    await openContactsGrid(page)

    // Three rows selected over the FULL scope first. Selecting after the filter
    // would make "the count does not follow the filter" trivially true.
    for (const index of [0, 1, 2]) {
      await renderedRows(page).nth(index).getByRole("checkbox").click()
    }
    await expect(statusCount(page)).toHaveText("3 selected")

    await filterGlobally(page, "no-such-contact-name-anywhere")

    await expect(statusCount(page), "narrowing the view must not shrink the selection").toHaveText("3 selected")
  })

  test("stale column ids — `hide=ghost` and `sort=ghost:asc` are dropped, not thrown on", async ({ page }) => {
    // A shared link outlives the column it names. Throwing here would take the
    // whole contacts tab down over a stale id in a query string.
    await openContactsGrid(page, { params: { hide: "ghost", sort: "ghost:asc" } })

    // `ghost` dropped from both leaves the defaults intact — `hide=ghost` is
    // present, so the defaults do NOT apply and `ghost` names nothing.
    expect(await headerColumnIds(page), "a stale id hides nothing").toEqual(toHeaderIds(ALL_FIELDS))
    await expect(page.locator('tbody[data-grid-panel="ready"]')).toBeAttached()
  })

  test("band order — search, Filter, Sort, Hide fields, density, record creation, count", async ({ page }) => {
    await openContactsGrid(page)

    const order = await page.locator("[data-grid-toolbar]").evaluate((band) => {
      const named = (selector: string) =>
        Array.from(band.querySelectorAll<HTMLElement>(selector)).map((element) =>
          (element.getAttribute("aria-label") ?? element.textContent ?? "").trim(),
        )

      return {
        controls: named("button, [role='combobox'], input"),
        searchFirst: band.querySelector("input[type='search']") !== null,
        countLast: Array.from(band.children).at(-1)?.textContent?.trim() ?? "",
      }
    })

    // **No view dropdown, and no view label.** A control that looks like a view
    // selector and cannot save a view is the nonfunctional button CAP-6 forbids,
    // and the reference composition draws one — so its absence is the claim, not
    // an omission.
    expect(order.controls.join(" "), "no view label or view dropdown may appear anywhere in the band").not.toMatch(
      /all contacts|view/i,
    )
    expect(order.searchFirst, "search is first").toBe(true)
    expect(order.countLast, "the count is last and still reads `N of M in scope`").toMatch(
      /^[\d,]+ of [\d,]+ in scope$/,
    )

    // The named controls, in the comp's order. Read positionally because the
    // contract is about sequence; a set assertion would pass on any arrangement.
    const labelled = order.controls.filter((text) =>
      /^(Search every column|Filter conditions.*|Sort|Hide fields|Row density|Add record)$/.test(text),
    )
    expect(labelled).toEqual([
      "Search every column",
      "Filter conditions",
      "Sort",
      "Hide fields",
      "Row density",
      "Add record",
    ])

    // Exactly one of each. `Columns` and `Hide fields` shipping together is the
    // one combination the story forbids outright.
    await expect(hideFieldsControl(page)).toHaveCount(1)
    await expect(page.getByRole("button", { name: /^Columns$/ })).toHaveCount(0)
  })

  test("band order with an active filter — one saffron indicator, and no header carries one", async ({ page }) => {
    await openContactsGrid(page, { params: { "f.name": "isNotEmpty:" } })

    // The filter control keeps both of its jobs through the redesign: the same
    // seam, the same accessible name naming the columns, the same saffron.
    const control = page.locator("[data-grid-filter-control]")
    await expect(control).toContainText("Filtered by Name")

    const colour = await control
      .locator("span")
      .first()
      .evaluate((element) => getComputedStyle(element).color)
    expect(colour, "the indicator must still be saffron").toBe("rgb(249, 139, 28)")

    // CAP-14: no per-column funnel, now or after the move.
    await expect(headerCell(page, "name").getByRole("button", { name: /Filter/ })).toHaveCount(0)
    await expect(headerCell(page, "name")).not.toContainText(/Filtered by/)

    // And the column menu is still where per-column actions live.
    await expect(columnMenuTrigger(page, "name", "Name")).toBeVisible()
  })

  test("a URL written from an un-hide survives a reload", async ({ page }) => {
    // The round trip, not just the parse: a codec that read `hide` as a complete
    // set but serialized a delta would render correctly on arrival and silently
    // reset on the next write.
    await openContactsGrid(page)
    await openHideFields(page)
    await hideFieldToggle(page, "Source").click()

    await expect
      .poll(async () => (await hideParam(page)).value, {
        message: "un-hiding a default column must list the still-hidden columns",
      })
      .toBe(DEFAULT_HIDDEN.filter((id) => id !== "source").join(","))

    await page.reload()
    await expect(page.locator('tbody[data-grid-panel="ready"]')).toBeAttached()
    expect(await headerColumnIds(page), "the un-hide must survive the reload").toContain("source")

    // Every un-hide at once: `hide=`, which is the state with no other encoding.
    await page.goto(manageContactsUrl({ params: { hide: "" } }))
    await expect(page.locator('tbody[data-grid-panel="ready"]')).toBeAttached()
    await openHideFields(page)
    expect(await tickedHideFields(page)).toEqual(ALL_FIELD_LABELS)
  })
})
