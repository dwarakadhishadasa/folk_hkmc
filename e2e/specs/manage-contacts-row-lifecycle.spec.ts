/**
 * CAP-6 — the row lifecycle on the contacts grid.
 *
 * | Test | Scenario | Claim under test |
 * | ---- | -------- | ---------------- |
 * | add | `+ Add record` then immediately type | the new row's **first editable cell** holds DOM focus, a double-click opens that cell's editor, and the committed value survives a create that is not yet sendable |
 * | add (hidden) | `+ Add record` under a text filter | a draft no filter can match is **reported** through the status line rather than dropped silently, and the add control stays disabled rather than pretending the click worked |
 * | add (disabled) | `+ Add record` while a draft is unresolved | the control renders disabled, not hidden |
 * | opt-in | a `Grid` with no `rowLifecycle` | no add control and no delete affordance anywhere — the slot is genuinely opt-in |
 * | buffer | a draft committed with a required field blank | the value is **kept in the row, not sent**: no request, no error, no revert; the create is sent by the commit that completes `name` + `phone` |
 * | default | the draft's `Collected By` | the cell names the signed-in staff member before the row exists, and the promoted row keeps that value without a reload |
 * | race | a location committed while the create is in flight | the value is **patched onto the created row**, not sent as a second create the server refuses as a duplicate |
 * | promote | a create that answers `201` | the draft is replaced by the server row **in place**, the row carries the caller's assignment and collector, and focus re-keys onto the new row id instead of dying on `<body>` |
 * | confirm | delete confirmation | the dialog names the row and **no** `DELETE` is issued until it is confirmed; cancelling issues none either |
 * | report | per-row delete outcomes | one visible line per deleted row naming the row and the server's message, successes included; a refused delete keeps its row and claims no success |
 * | revert | a failed create | an intercepted `500` reverts the cell and names the failure, and writes nothing |
 *
 * ## Why the delete cases create their own row
 *
 * `contacts` is shared by every spec in this suite. A delete case that removed a
 * generated row would shrink the set the selection, filter and bulk rows read
 * from, and the failure would surface in a later spec as a mystery. So each
 * delete case inserts a contact tagged `preview-fixture-rowlife-`, deletes
 * *that*, and `cleanupRowLifecycleContacts` removes whatever is left in a
 * `finally` — refusing, by name, to delete anything that is not tagged.
 *
 * The tag is deliberately **not** the bulk tag: `bulk-fixtures.spec.ts` asserts
 * invariants over the generated set (exactly one blank-phone row, every row
 * assigned to the program's Preacher or Admin, every name distinct) and the
 * generator re-asserts them on the next run, so a leftover spec row must not
 * land inside it.
 *
 * ## Why the add cases run unfiltered
 *
 * A draft row's cells are all blank, so any active global filter hides it — and
 * the grid reports that rather than losing focus silently. Filtering first would
 * test the filter, not the lifecycle. The one case that *does* filter is the one
 * asserting the report: the filter is the input that provokes the failure.
 *
 * ## Why the opt-in case uses the preview harness
 *
 * "A grid with no `rowLifecycle` offers nothing" has no negative on the contacts
 * grid — it always supplies one. `/dev/grid-preview` renders the same primitive
 * without it, which is the only place the negative is reachable at all.
 *
 * ## Why the optimistic assertions are held open
 *
 * "The value appears before the write resolves" is only observable if the write
 * is still unresolved when the assertion runs. Both add assertions park the POST
 * in a `page.route` handler and assert against the in-flight state, and both
 * assert the interception actually caught the request — otherwise a slow server
 * would satisfy them just as well as a fast optimistic render.
 *
 * ## Why "add then immediately type" is its own test
 *
 * The focus lands on a *cell*, not on the editor: `+ Add record` moves the
 * keyboard model, and the double-click that follows opens the editor. Two
 * different mechanisms; a single combined assertion would pass if only one of
 * them worked.
 *
 * **Both halves changed with CAP-10.** This used to be "the first printable
 * character opens the editor through the story-2 type-to-edit branch", with the
 * character doubling as the seed. Type-to-edit is retired — it was one of five
 * openers, and a seeded draft is indistinguishable on screen from a deliberate
 * overwrite — so the opener is a double-click and the draft is seeded from the
 * cell's own (blank) value instead. The test still covers both mechanisms; it
 * just no longer proves a retired one.
 *
 * ## Why the service worker is blocked
 *
 * `providers.tsx` registers `/sw.js` on every page, and once that worker
 * *controls* the page, requests it serves bypass `page.route` entirely —
 * Playwright cannot intercept what never reaches the network stack it watches.
 * Whether the worker has claimed the page by the time a spec clicks depends on a
 * registration race, so an interception set up after `goto` intermittently did
 * not fire at all: observed as a refused-delete test that deleted the row for
 * real and then asserted the server had refused it.
 *
 * `serviceWorkers: "block"` removes the race rather than papering over it. It
 * changes nothing else about what is under test — `/manage` is a network-only
 * path in the worker, and nothing in CAP-6 is about offline behaviour.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  ROW_LIFECYCLE_TAG,
  adminId,
  bulkFixtureClient,
  cleanupRowLifecycleContacts,
  createRowLifecycleContact,
  listProgramLocations,
} from "../fixtures/bulk-contacts"
import {
  SINGLE_CONTACT_ROUTE,
  addRecordButton,
  cellIn,
  deleteCancelButton,
  deleteConfirmButton,
  deleteConfirmDialog,
  deleteReportLines,
  deleteReportPanel,
  deleteSelectedMenuItem,
  filterGlobally,
  gridRoot,
  inScopeCounts,
  manageContactsUrl,
  openCellEditor,
  openContactsGrid,
  openPreviewGrid,
  openRowContextMenu,
  readContactColumn,
  renderedRows,
  rowById,
} from "../fixtures/manage-grid"

// See the header: a controlling service worker swallows `page.route`, which made
// the interception in these tests a race rather than a given.
test.use({ serviceWorkers: "block" })

/** The in-cell editor the grid mounts for a text column. */
function cellEditor(page: Page) {
  return page.getByRole("textbox", { name: "Edit cell value" })
}

/** The row the grid appended last, which is the draft under test. */
function draftRow(page: Page) {
  return renderedRows(page).last()
}

/**
 * Type `text` into the open editor, replacing the seeded draft.
 *
 * The draft is seeded from the cell's own value and is **selected** on mount, so
 * a plain `keyboard.type` replaces it wholesale — which is what every caller
 * wants. `End` collapses that selection first so that a caller *appending*
 * instead has to say so, rather than the two being indistinguishable.
 *
 * (The old helper did the opposite: it existed because the type-to-edit branch
 * seeded the draft with the opening character. That branch is retired by CAP-10,
 * so the seed is now the cell's value and the helper's `End` is only there to
 * make "replace" and "append" separate calls.)
 */
async function typeReplacingSeed(page: Page, text: string): Promise<void> {
  await cellEditor(page).press("End")
  await page.keyboard.type(text)
}

/**
 * Open the focused cell's editor with a double-click and type `text` into it.
 *
 * **Why the gesture changed.** This used to be "type the first character, which
 * opens the editor through the story-2 type-to-edit branch, then type the rest
 * after collapsing that seed's selection". Type-to-edit is retired by CAP-10 —
 * double-click is the only opener — so the first character no longer opens
 * anything, and a double-click does.
 *
 * Why it still matters that the *cell* holds focus first: `+ Add record` puts
 * the keyboard model on the draft row's first editable cell, and the cell under
 * test is then named explicitly, so the double-click addresses a known cell
 * rather than whatever happens to be focused.
 */
async function typeIntoCell(page: Page, cell: Locator, text: string): Promise<void> {
  await openCellEditor(cell)
  await expect(cellEditor(page), "the double-click opened the cell's editor").toBeFocused()
  await typeReplacingSeed(page, text)
}

/**
 * A phone this run owns.
 *
 * `contacts.phone` is `NOT NULL` and `UNIQUE (phone, program_id)`, so a spec that
 * creates a record needs one it owns. The `7` prefix cannot collide with the
 * generator's `80…` range or the seeder's `9000000001-4`.
 */
function ownedPhone(offset: number): string {
  return `7${String(Date.now() + offset).slice(-9)}`
}

/** A name this run owns, tagged so cleanup may remove it and nothing else. */
function ownedName(offset: number): string {
  return `${ROW_LIFECYCLE_TAG}${Date.now()}${offset}`
}

/**
 * A location the draft's picker will offer, and the name that identifies it.
 *
 * The picker is a search over the payload's scoped locations, so any seeded
 * location is selectable; the first by name is simply a stable choice. The
 * returned name is used only as the search text — the option actually clicked is
 * read back from the cell, because the local database also carries stale
 * locations whose names contain a seeded one.
 */
async function firstProgramLocation(): Promise<{ id: string; name: string }> {
  const [location] = await listProgramLocations()

  if (!location) {
    throw new Error("No location is seeded, so the draft's picker has nothing to offer.")
  }

  return { id: location.id, name: location.name }
}
/** The row ids holding `name`, read straight from the database. */
async function idsForName(name: string): Promise<string[]> {
  const { data, error } = await bulkFixtureClient().from("contacts").select("id").eq("name", name)

  if (error) {
    throw new Error(`Reading ids for "${name}" failed: ${error.message}`)
  }

  return (data ?? []).map((row) => row.id as string)
}

/** The names holding each of `phones`, read straight from the database. */
async function namesForPhones(phones: readonly string[]): Promise<Map<string, string | null>> {
  const found = new Map<string, string | null>(phones.map((phone) => [phone, null]))

  const { data, error } = await bulkFixtureClient()
    .from("contacts")
    .select("phone,name")
    .in("phone", [...phones])

  if (error) {
    throw new Error(`Reading ${phones.length} phone(s) failed: ${error.message}`)
  }

  for (const row of (data ?? []) as Array<{ phone: string; name: string }>) {
    found.set(row.phone, row.name)
  }

  return found
}

/**
 * Park every POST aimed at the single-contact route until `release()` is called.
 *
 * Returns the release handle plus a counter, so a spec can both hold the write
 * open for an optimistic assertion and then prove the interception actually ran
 * rather than passing against a value that appeared because the server had
 * already answered.
 */
function holdCreateRequests(page: Page) {
  let release: () => void = () => undefined
  let intercepted = 0

  /** Resolves once every handler that parked on `held` has finished fulfilling. */
  let settled: Promise<void> = Promise.resolve()

  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  const handler = async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "POST") {
      await route.continue()
      return
    }

    intercepted += 1
    // Chained rather than awaited directly, so `unroute` has something to wait
    // on *after* the release: `held` resolving only means the handlers woke up,
    // not that they are done with their routes.
    settled = settled.then(async () => {
      await held
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unable to create the contact." }),
      })
    })

    await settled
  }

  page.route(SINGLE_CONTACT_ROUTE, handler)

  return {
    release,
    get intercepted() {
      return intercepted
    },
    async unroute() {
      // Release, then let the handlers finish, then unroute. Unrouting while a
      // handler is still parked on `held` takes its route back and leaves the
      // handler to fulfil it anyway, which surfaces as `route.fulfill: Route is
      // already handled!` — an error that masks whatever the test was asserting.
      release()
      await settled
      await page.unroute(SINGLE_CONTACT_ROUTE, handler)
    },
  }
}

/**
 * Make every `DELETE` on the single-contact route answer `409` with the
 * attendance-conflict wording.
 *
 * Registered **before** the page navigates. `providers.tsx` registers
 * `/sw.js` on every page, and once that worker controls the page the requests
 * it serves never reach the network stack `page.route` watches — so an
 * interception installed after `goto` intermittently did not fire at all,
 * observed as a test that deleted the row for real and then asserted the server
 * had refused it. Blocking the worker (`test.use` above) removes the race;
 * registering early removes what is left.
 */
async function refuseDeletes(page: Page): Promise<void> {
  await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "This contact has attendance recorded against it and cannot be deleted.",
        code: "manage_contact_has_attendance",
      }),
    })
  })
}

/**
 * Park every POST on the single-contact route until `release()` is called, then
 * let it through.
 *
 * `holdCreateRequests` above answers `500`, which is what the revert case needs;
 * this one lets the create finish, which is what the follow-up case needs: the
 * row has to exist before a value committed during the flight can be patched
 * onto it.
 */
function parkCreateRequests(page: Page) {
  let release: () => void = () => undefined
  let intercepted = 0
  let settled: Promise<void> = Promise.resolve()

  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  const handler = async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "POST") {
      await route.continue()
      return
    }

    intercepted += 1
    settled = settled.then(async () => {
      await held
      await route.continue()
    })

    await settled
  }

  page.route(SINGLE_CONTACT_ROUTE, handler)

  return {
    release,
    get intercepted() {
      return intercepted
    },
    async unroute() {
      release()
      await settled
      await page.unroute(SINGLE_CONTACT_ROUTE, handler)
    },
  }
}

test.describe("row lifecycle", () => {
  test("add — the new row's first editable cell takes focus, and a double-click opens that cell's editor", async ({
    page,
  }) => {
    const held = holdCreateRequests(page)

    try {
      await openContactsGrid(page)
      await expect(addRecordButton(page), "the lifecycle is opt-in and the control is offered").toBeEnabled()

      await addRecordButton(page).click()

      // Focus lands through the keyboard model on the row's first *editable*
      // column — `name`, which is also the frozen identity column — and on the
      // cell, not on the grid frame and not on the editor.
      //
      // The row was appended to a 260-row set, so its cell is *outside* the
      // rendered window until `scrollToIndex` has been acted on by a render.
      // `focusRow` resolving the row and `focusRowCell` landing DOM focus are
      // therefore two different steps, and this assertion is what proves the
      // second one happened rather than the grid parking focus on its frame.
      const nameCell = cellIn(draftRow(page), "name")
      await expect(nameCell, "the appended row's first editable cell holds focus").toBeFocused()
      await expect(cellEditor(page), "the editor is not opened for them").toHaveCount(0)

      // A double-click on that focused cell opens the editor. **Why the gesture
      // changed:** this used to be `page.keyboard.type("R")`, because the first
      // printable character opened the editor through the story-2 type-to-edit
      // branch *and* became its selected seed. Type-to-edit is retired by CAP-10
      // (double-click is the sole opener), so the character no longer opens
      // anything and the seed is now the draft row's own blank value. The claim
      // under test is unchanged — add, then edit the focused cell — but it is
      // worth naming that the double-click alone, with no keystroke, is what
      // opens it.
      await openCellEditor(nameCell)
      await expect(cellEditor(page), "the double-click opened the editor").toBeFocused()
      await expect(cellEditor(page), "a blank draft row seeds an empty draft").toHaveValue("")

      await typeReplacingSeed(page, "Ravi")
      await expect(cellEditor(page), "the draft reads Ravi").toHaveValue("Ravi")
      await expect(nameCell, "the editor is inside the new row's name cell").toBeVisible()

      await page.keyboard.press("Enter")

      // A name alone cannot be written — `phone` is also `NOT NULL` — so the
      // commit is buffered: the value paints, and **no** create is sent. This is
      // the assertion that the row is editable before it is complete, which is
      // what the old one-field create model got wrong.
      await expect(nameCell, "the committed value paints before the write resolves").toHaveText("Ravi")
      expect(held.intercepted, "a one-field draft sends no create").toBe(0)

      // Completing the second required field is what sends it, and that write is
      // the one parked above.
      await typeIntoCell(page, cellIn(draftRow(page), "phone"), "7400000001")
      await page.keyboard.press("Enter")

      await expect(
        cellIn(draftRow(page), "phone"),
        "the second required field paints before the create resolves",
      ).toHaveText("7400000001")
      await expect
        .poll(() => held.intercepted, { message: "the interception caught the create write" })
        .toBe(1)
    } finally {
      await held.unroute()
    }
  })

  test("add — a record the active filter hides is reported, not silently lost", async ({ page }) => {
    await openContactsGrid(page)
    await filterGlobally(page, "preview-fixture")

    // The readout is "<in scope> of <total> in scope". A blank draft matches no
    // text filter, so `focusRow` resolves no row and the retry has nothing to
    // retry against.
    const before = await inScopeCounts(page)

    await addRecordButton(page).click()

    // The row was appended — the total counts it — but the filter hides it, so
    // it cannot be filled in. The table has to say so: silently parking an
    // invisible draft leaves the operator with an add control that does nothing
    // and no way to discover why.
    await expect(
      page.getByRole("status").filter({ hasText: "hidden by the current filters" }),
      "the filtered-out draft is named rather than dropped",
    ).toBeVisible()

    await expect
      .poll(async () => (await inScopeCounts(page)).total, {
        message: "the draft is in the table's row set even though no filter matches it",
      })
      .toBe(before.total + 1)

    expect(
      (await inScopeCounts(page)).visible,
      "the hidden draft does not enter the visible set",
    ).toBe(before.visible)

    // And the one-draft rule still holds: a second add is refused while this one
    // is unresolved, which is what makes the report the operator's only clue.
    await expect(addRecordButton(page), "the unresolved draft still blocks a second one").toBeDisabled()

    // Clearing the search is the way out, and the notice goes with the state it
    // described.
    await page.getByRole("button", { name: "Clear search" }).click()
    await expect(
      page.getByRole("status").filter({ hasText: "hidden by the current filters" }),
      "the notice does not outlive the filters it named",
    ).toHaveCount(0)
  })

  test("add — the control is disabled, never hidden, while a draft is unresolved", async ({ page }) => {
    await openContactsGrid(page)
    await expect(addRecordButton(page), "the control starts enabled").toBeEnabled()

    await addRecordButton(page).click()

    // Two drafts would race for the same two `NOT NULL` fields, and the operator
    // would have no way to tell which one a refusal belonged to. Disabling is the
    // honest signal; hiding the control would make the grid look like it had no
    // create affordance at all.
    await expect(
      addRecordButton(page),
      "a disabled control stays on screen rather than disappearing",
    ).toBeDisabled()
    await expect(addRecordButton(page), "and it is still the same control").toBeVisible()
  })

  test("opt-in — a grid without rowLifecycle has neither affordance", async ({ page }) => {
    // The preview harness renders the same `Grid` primitive with no
    // `rowLifecycle`, which is the only honest way to prove the slot is opt-in:
    // the contacts grid can never show the negative.
    await openPreviewGrid(page)

    await expect(
      page.getByRole("button", { name: /Add record/ }),
      "no add control is injected into a grid that did not ask for one",
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: /^Delete / }),
      "no per-row delete button exists either",
    ).toHaveCount(0)
    await expect(
      page.locator("[data-grid-add-record]"),
      "and the add control's own marker is absent, not merely unnamed",
    ).toHaveCount(0)

    // Delete is a row context menu now, so the opt-in claim has to cover it
    // too: a right-click on a preview row opens nothing at all.
    await renderedRows(page).first().click({ button: "right" })
    await expect(
      page.getByRole("menu"),
      "no context menu is wired into a grid that did not ask for one",
    ).toHaveCount(0)
    await expect(renderedRows(page).first(), "the grid itself did render").toBeVisible()
  })

  test("buffer — a draft keeps an incomplete value locally and creates once both required fields are present", async ({
    page,
  }) => {
    const name = ownedName(0)
    const phone = ownedPhone(0)
    const created: string[] = []
    const posts: string[] = []

    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/manage/contacts")) {
        posts.push(request.url())
      }
    })

    try {
      await openContactsGrid(page)
      await addRecordButton(page).click()

      // The reported defect: a name typed into a new row vanished because the
      // first commit was sent as a create with the phone still blank, and the
      // `400` reverted the cell. A name alone is now buffered instead.
      await typeIntoCell(page, cellIn(draftRow(page), "name"), name)
      await page.keyboard.press("Enter")

      await expect(
        cellIn(draftRow(page), "name"),
        "an incomplete draft keeps the value the operator typed",
      ).toHaveText(name)
      await expect(
        cellIn(draftRow(page), "name"),
        "an incomplete draft is not an error",
      ).not.toHaveAttribute("data-grid-cell-error", /.+/)
      expect(posts, "a one-field draft sends no create").toHaveLength(0)

      // A location picked before the row exists is buffered too, and has to stay
      // visible rather than being reverted by a create that could not succeed.
      const location = await firstProgramLocation()
      await openCellEditor(cellIn(draftRow(page), "location"))
      await page.getByRole("textbox", { name: "Find Location" }).fill(location.name)
      await page.locator('[data-grid-editor="option"]').filter({ hasText: location.name }).first().click()

      const locationCell = cellIn(draftRow(page), "location")
      await expect(
        locationCell,
        "a location picked on an incomplete draft stays on screen",
      ).toContainText(location.name)

      // The label the cell shows is the one that was picked. Read from the cell
      // rather than from the option's name: the local database carries stale
      // locations whose names *contain* a seeded one, so the picker's first match
      // is not necessarily the row the name alone identifies.
      const pickedLocationLabel = (await locationCell.innerText()).trim()
      expect(posts, "picking a location on a draft sends no create").toHaveLength(0)

      expect(await idsForName(name), "nothing was written while the draft was incomplete").toEqual([])

      // The second required field completes the draft, and only now is the
      // create sent — with the buffered name and location carried along.
      await typeIntoCell(page, cellIn(draftRow(page), "phone"), phone)
      await page.keyboard.press("Enter")

      await expect
        .poll(() => posts.length, { message: "the completed draft never sent a create" })
        .toBe(1)

      await expect
        .poll(async () => (await namesForPhones([phone])).get(phone), {
          message: "the completed draft was never created",
        })
        .toBe(name)

      created.push(...(await idsForName(name)))

      // The buffered values are in the created row, not only on screen: a create
      // built from the last cell alone would have dropped both.
      const storedLocations = await readContactColumn<string[]>([created[0]], "location_ids")
      const storedLocationIds = storedLocations.get(created[0]) ?? []
      expect(storedLocationIds, "the buffered location is stored as one id").toHaveLength(1)
      expect(
        (await listProgramLocations()).find((candidate) => candidate.id === storedLocationIds[0])?.name,
        "the stored location is the one picked on the draft",
      ).toBe(pickedLocationLabel)

      await expect(
        cellIn(draftRow(page), "collectedBy"),
        "the created row names the signed-in staff member",
      ).toHaveText("Kavitha Raman")

      // Survives a reload, read through a filter so the row is addressable: the
      // rows are virtualized and the created row is last in an unfiltered set.
      await page.goto(manageContactsUrl({ params: { q: name } }))
      await expect(
        gridRoot(page),
        "the grid loaded the contacts tab after the reload",
      ).toBeVisible()
      await expect(
        page.getByText(name, { exact: true }).first(),
        "the created record survives a reload",
      ).toBeVisible()
    } finally {
      created.push(...(await idsForName(name)))
      await cleanupRowLifecycleContacts(created)
    }
  })

  test("race — a location picked while the create is in flight is patched, not re-created", async ({
    page,
  }) => {
    const name = ownedName(5)
    const phone = ownedPhone(5)
    const created: string[] = []
    const parked = parkCreateRequests(page)

    try {
      await openContactsGrid(page)
      await addRecordButton(page).click()

      await typeIntoCell(page, cellIn(draftRow(page), "name"), name)
      await page.keyboard.press("Enter")
      await typeIntoCell(page, cellIn(draftRow(page), "phone"), phone)
      await page.keyboard.press("Enter")

      // The create is on the wire, so the row still carries its draft id. A
      // real network keeps this window open for hundreds of milliseconds, and
      // the location pick below is exactly what an operator does inside it:
      // clicking the cell blurs the phone field, which is what starts the
      // create, and the picker is the very next gesture.
      await expect.poll(() => parked.intercepted).toBe(1)
      await expect(draftRow(page)).toHaveAttribute("data-grid-row", /^draft-/)

      const location = await firstProgramLocation()
      await openCellEditor(cellIn(draftRow(page), "location"))
      await page.getByRole("textbox", { name: "Find Location" }).fill(location.name)
      await page.locator('[data-grid-editor="option"]').filter({ hasText: location.name }).first().click()

      // The row is still a draft, but a create is already carrying it. A second
      // create from this commit would come back `409 duplicate`, and its revert
      // would land on the draft id after promotion — the pick would vanish with
      // no message, which is the reported "can't select a location".
      expect(parked.intercepted, "a commit during the create must not start another").toBe(1)

      const pickedLabel = (await cellIn(draftRow(page), "location").innerText()).trim()
      const picked = (await listProgramLocations()).find(
        (candidate) => candidate.name === pickedLabel,
      )
      expect(picked, "the label the cell shows names a seeded location").toBeDefined()

      parked.release()

      // The one create lands, and the queued value is written onto the id it
      // returns: one POST and one PATCH, not two creates.
      await expect
        .poll(async () => (await namesForPhones([phone])).get(phone), {
          message: "the parked create never landed",
        })
        .toBe(name)

      created.push(...(await idsForName(name)))

      await expect
        .poll(
          async () => {
            const stored = await readContactColumn<string[]>([created[0]], "location_ids")
            return stored.get(created[0])?.[0] ?? null
          },
          { message: "the location picked during the create was never stored" },
        )
        .toBe(picked!.id)

      await expect(
        cellIn(draftRow(page), "location"),
        "the promoted row keeps the picked location on screen",
      ).toContainText(pickedLabel)
    } finally {
      await parked.unroute()
      created.push(...(await idsForName(name)))
      await cleanupRowLifecycleContacts(created)
    }
  })

  test("default — a new draft names the signed-in staff member in Collected By", async ({ page }) => {
    await openContactsGrid(page)
    await addRecordButton(page).click()

    // The server already writes `collected_by_id = staff.supabaseUserId`; the
    // blank row used to render nothing there, so the value only appeared after a
    // reload. The draft shows the person the server is about to store.
    await expect(
      cellIn(draftRow(page), "collectedBy"),
      "a new draft defaults Collected By to the signed-in user",
    ).toHaveText("Kavitha Raman")
    await expect(
      cellIn(draftRow(page), "collectedBy"),
      "the default is a value, not an unresolved reference",
    ).not.toContainText("Unknown staff member")
  })

  test("promote — a created record takes the server's id and keeps the keyboard position", async ({
    page,
  }) => {
    const name = ownedName(4)
    const phone = ownedPhone(4)
    const created: string[] = []

    try {
      await openContactsGrid(page)
      await addRecordButton(page).click()

      await typeIntoCell(page, cellIn(draftRow(page), "name"), name)
      await page.keyboard.press("Enter")

      // The name alone is buffered, so the row is still a draft and still
      // focused; the phone commit is the one that promotes it.
      await expect(cellIn(draftRow(page), "name"), "the incomplete draft keeps the name").toHaveText(name)
      await expect(
        cellIn(draftRow(page), "name"),
        "an incomplete draft is not an error",
      ).not.toHaveAttribute("data-grid-cell-error", /.+/)

      await typeIntoCell(page, cellIn(draftRow(page), "phone"), phone)
      await page.keyboard.press("Enter")

      // Promotion is observable from the DOM: the row keeps its position but takes
      // the server's id, and the draft prefix is the consumer's own marker for "not
      // a record yet". Reading it is what distinguishes "the create landed" from
      // "the row merely looks the same".
      await expect
        .poll(
          async () => (await draftRow(page).getAttribute("data-grid-row")) ?? "",
          { message: "the draft row was never promoted to a server row" },
        )
        .not.toMatch(/^draft-/)

      // The focused `<tr>` is keyed by row id, so the promotion unmounts the cell
      // the operator was on and DOM focus would die on `<body>` — leaving the grid
      // unable to receive the very next keystroke. This is the assertion that the
      // create-promotion re-key puts it back, on the new id.
      await expect(
        cellIn(draftRow(page), "phone"),
        "focus re-keys onto the promoted row rather than dying on <body>",
      ).toBeFocused()

      created.push(...(await idsForName(name)))

      // The create is what makes a row *the caller's*: `assigned_preacher_id`
      // is the RLS scope key for a Preacher, and `collected_by_id` is what the
      // grid shows in `Collected By`. Both are server-written from the session,
      // not from the request body, so the operator cannot reassign a row by
      // omitting or forging a field.
      const manager = await adminId()
      const assigned = await readContactColumn<string>(created, "assigned_preacher_id")
      expect(
        assigned.get(created[0]),
        "the created row is assigned to the signed-in staff member",
      ).toBe(manager)
      const collected = await readContactColumn<string>(created, "collected_by_id")
      expect(
        collected.get(created[0]),
        "the created row records the signed-in staff member as its collector",
      ).toBe(manager)

      // The promoted row carries the same assignment the database holds, without
      // a reload. `ManageContactWriteResult` is what makes that possible.
      await expect(
        cellIn(draftRow(page), "collectedBy"),
        "the promoted row keeps Collected By on screen",
      ).toHaveText("Kavitha Raman")
    } finally {
      created.push(...(await idsForName(name)))
      await cleanupRowLifecycleContacts(created)
    }
  })

  test("confirm — the dialog names the row and nothing is deleted until it is confirmed", async ({ page }) => {
    const name = ownedName(1)
    const phone = ownedPhone(1)
    let ids: string[] = []

    try {
      const created = await createRowLifecycleContact({ name, phone })
      ids = [created.id]

      const requests: string[] = []
      page.on("request", (request) => {
        if (request.method() === "DELETE") requests.push(request.url())
      })

      // Filtered to the one row, not merely waited for: the grid is virtualized
      // over 250+ contacts, and a row inserted at the end of the set sits
      // outside the rendered window entirely — so `getByText(...).waitFor()`
      // would burn the whole test timeout on a row that was never going to
      // render. The filter is what makes the row addressable at all.
      await openContactsGrid(page, { params: { q: name } })
      await expect(rowById(page, created.id), "the inserted row is addressable").toBeVisible()

      await openRowContextMenu(page, created.id)
      await deleteSelectedMenuItem(page).click()

      await expect(deleteConfirmDialog(page), "the confirmation is shown").toBeVisible()
      await expect(
        deleteConfirmDialog(page),
        "the confirmation names the row it will remove",
      ).toContainText(name)
      expect(requests, "opening the dialog issues no DELETE").toHaveLength(0)

      await deleteCancelButton(page).click()
      await expect(deleteConfirmDialog(page), "cancelling closes it").toHaveCount(0)
      expect(requests, "cancelling issues no DELETE").toHaveLength(0)
      await expect(rowById(page, created.id), "the row is untouched").toBeVisible()

      await openRowContextMenu(page, created.id)
      await deleteSelectedMenuItem(page).click()
      await deleteConfirmButton(page).click()

      await expect(rowById(page, created.id), "the confirmed delete removes the row").toHaveCount(0)
      await expect
        .poll(() => requests.length, { message: "confirming never issued the DELETE" })
        .toBe(1)

      await expect(deleteReportPanel(page), "the outcome is reported per row, not toasted").toBeVisible()
      const lines = await deleteReportLines(page)
      expect(lines, "one line for the one row acted on").toHaveLength(1)
      expect(lines[0], "the line names the row").toContain(name)
      expect(lines[0], "a success says so").toContain("Deleted.")

      // The row is gone for good, so the spec owns nothing to clean up.
      ids = []
    } finally {
      await cleanupRowLifecycleContacts(ids)
    }
  })

  test("report — a refused delete keeps its row and claims no success", async ({ page }) => {
    const name = ownedName(2)
    const phone = ownedPhone(2)
    let ids: string[] = []

    try {
      const created = await createRowLifecycleContact({ name, phone })
      ids = [created.id]

      // Filtered to the one row, not merely waited for: the grid is virtualized
      // over 250+ contacts, and a row inserted at the end of the set sits
      // outside the rendered window entirely — so `getByText(...).waitFor()`
      // would burn the whole test timeout on a row that was never going to
      // render. The filter is what makes the row addressable at all.
      // Forced `409`, which is a reachable real answer: `deleteManageContact`
      // maps the attendance foreign-key violation to exactly this status, and
      // this wording.
      await refuseDeletes(page)

      await openContactsGrid(page, { params: { q: name } })
      await expect(rowById(page, created.id), "the inserted row is addressable").toBeVisible()

      await openRowContextMenu(page, created.id)
      await deleteSelectedMenuItem(page).click()
      await deleteConfirmButton(page).click()

      await expect(deleteReportPanel(page), "the outcome is reported, not toasted").toBeVisible()

      const lines = await deleteReportLines(page)
      expect(lines, "one line for the one row acted on").toHaveLength(1)
      expect(lines[0], "the line names the row").toContain(name)
      expect(lines[0], "the line carries the server's own reason").toContain(
        "This contact has attendance recorded against it and cannot be deleted.",
      )
      expect(lines[0], "a refused row claims no success").not.toContain("Deleted.")

      await expect(
        rowById(page, created.id),
        "a row the server refused stays on screen",
      ).toBeVisible()
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE).catch(() => undefined)
      await cleanupRowLifecycleContacts(ids)
    }
  })

  test("revert — a failed create reverts the cell, names the failure, and writes nothing", async ({
    page,
  }) => {
    const name = ownedName(3)
    const phone = ownedPhone(3)
    const created: string[] = []
    let held: ReturnType<typeof holdCreateRequests> | null = null

    try {
      await openContactsGrid(page)
      await addRecordButton(page).click()

      // The name is buffered, so no create is sent yet. That is what makes the
      // phone commit the **first** request this case can park — the old model
      // spent its first POST on a create that could only be refused.
      await typeIntoCell(page, cellIn(draftRow(page), "name"), name)
      await page.keyboard.press("Enter")
      await expect(cellIn(draftRow(page), "name"), "the buffered name is on screen").toHaveText(name)

      held = holdCreateRequests(page)

      await typeIntoCell(page, cellIn(draftRow(page), "phone"), phone)
      await page.keyboard.press("Enter")

      // In flight: the value is on screen while the write is unresolved, so this
      // is the optimistic display rather than a fast server.
      await expect(
        cellIn(draftRow(page), "phone"),
        "the committed value paints before the write resolves",
      ).toHaveText(phone)
      expect(held.intercepted, "the interception caught the create write").toBe(1)

      await held.release()

      await expect(cellIn(draftRow(page), "phone"), "the refusal rides the cell itself").toHaveAttribute(
        "data-grid-cell-error",
        /Unable to create the contact\./,
      )
      await expect(
        cellIn(draftRow(page), "phone"),
        "the refused cell is marked destructive",
      ).toHaveClass(/text-destructive/)

      expect(await namesForPhones([phone]), "a failed create wrote nothing").toEqual(
        new Map([[phone, null]]),
      )
      // By name as well as by phone: the name is what a partially-applied create
      // would have written, and the phone check alone would miss it.
      expect(await idsForName(name), "the draft was never persisted under its name").toEqual([])

      created.push(...(await idsForName(name)))
    } finally {
      await held?.unroute()
      await cleanupRowLifecycleContacts(created)
    }
  })
})
