/**
 * Handles onto the `/manage` contacts grid.
 *
 * `matrix-coverage-map.md` splits story 2's 19 rows across three layers, and the
 * two browser-facing layers share one set of selectors: the rows are virtualized,
 * so a spec that does not narrow the grid first is looking at whichever ~25 rows
 * happen to be in the viewport. Every helper here is written on that assumption
 * — `filterGlobally` before a row is addressed, `waitForVisibleCount` after a
 * filter changes — rather than on the assumption that a row is on screen.
 *
 * Nothing here asserts *behaviour*; it only makes the behaviour addressable. The
 * assertions live in the row specs so a row's verdict and its evidence stay in
 * the same file.
 *
 * Grid DOM facts this module relies on, and where each comes from:
 *
 * | Selector                                | Source                        |
 * | --------------------------------------- | ----------------------------- |
 * | `[data-grid-root]`                      | `components/grid/grid.tsx`    |
 * | `[role=group][aria-label=Contacts]`     | `grid.tsx`'s scroll container |
 * | `tr[data-grid-row="<id>"]`              | `components/grid/grid-row.tsx`|
 * | `[data-grid-cell="<id>~<columnId>"]`    | `gridCellKey`, same file      |
 * | `[data-grid-column="<columnId>"]`       | `grid-header-cell.tsx`        |
 * | `[data-bulk-selection-count]`           | `manage-contacts-table.tsx`   |
 *
 * `~` is `GRID_CELL_KEY_SEPARATOR` from `use-grid-keyboard.ts`; it is spelled
 * here once so a selector built from a row id and a column id cannot drift.
 */

import { expect, type Locator, type Page } from "@playwright/test"

import { bulkFixtureClient } from "./bulk-contacts"

export const GRID_CELL_KEY_SEPARATOR = "~"

/** The single-row PATCH the grid's `onCellCommit` uses. */
export const SINGLE_CONTACT_ROUTE = "**/api/manage/contacts"

/** The batch route the bulk action uses. Distinct from the single-row route. */
export const BULK_CONTACT_ROUTE = "**/api/manage/contacts/bulk"

/** `mode` the specs read rows under. `admin` is the program-wide scope. */
export type ManageScopeMode = "admin" | "preacher"

export interface ManageContactsUrlOptions {
  mode?: ManageScopeMode
  /** Extra grid params, e.g. `{ q: "..." }` to land on a filtered view. */
  params?: Record<string, string>
}

/**
 * `/manage` with the contacts tab open.
 *
 * `mode` is written explicitly on every navigation rather than inherited from a
 * previous one: `/manage` defaults to the dashboard tab and admin scope, so a
 * spec that omitted it would depend on whichever URL it happened to start from.
 */
export function manageContactsUrl({ mode = "admin", params = {} }: ManageContactsUrlOptions = {}): string {
  const search = new URLSearchParams({ view: "contacts", mode, ...params })

  return `/manage?${search.toString()}`
}

/** The grid's own frame — toolbar, status line and scroll container. */
export function gridRoot(page: Page): Locator {
  return page.locator("[data-grid-root]")
}

/** The keyboard-owning scroll container, which is what `j`/`k`/`e` listen on. */
export function gridScroll(page: Page): Locator {
  return page.getByRole("group", { name: "Contacts" })
}

/** The grid's `aria-live` status line — where a rejected commit's message lands. */
export function gridStatusLine(page: Page): Locator {
  return gridRoot(page).locator('p[role="status"]').first()
}

/** Every row currently rendered. Virtualized, so this is a window, not the set. */
export function renderedRows(page: Page): Locator {
  return page.locator("tr[data-grid-row]")
}

/** One row by its stable contact id, which is what `getRowId` supplies. */
export function rowById(page: Page, contactId: string): Locator {
  return page.locator(`tr[data-grid-row="${contactId}"]`)
}

/** One cell, addressed the way the grid itself addresses it. */
export function cellIn(row: Locator, columnId: string): Locator {
  return row.locator(`[data-grid-cell$="${GRID_CELL_KEY_SEPARATOR}${columnId}"]`)
}

/** The header cell for a column. */
export function headerCell(page: Page, columnId: string): Locator {
  return page.locator(`[data-grid-column="${columnId}"]`)
}

export function searchBox(page: Page): Locator {
  return page.getByRole("searchbox", { name: "Search every column" })
}

/** The header select-all. Disabled when the grid has no rows in view. */
export function headerSelectAll(page: Page): Locator {
  return headerCell(page, "select").getByRole("checkbox")
}

/** A row's checkbox, addressed by the row's name so no id plumbing is needed. */
export function rowCheckbox(page: Page, contactName: string): Locator {
  return gridRoot(page).getByRole("checkbox", { name: `Select ${contactName}` })
}

/** The toolbar's selected-count readout. */
export function selectionCount(page: Page): Locator {
  return page.locator("[data-bulk-selection-count]")
}

/** The bulk action's trigger. Disabled at 0 selected — matrix row 12. */
export function bulkActionButton(page: Page): Locator {
  return page.getByRole("button", { name: /Add selected to favorites|Saving…/ })
}

/** The per-row bulk report panel. */
export function bulkReportPanel(page: Page): Locator {
  return page.getByRole("region", { name: "Bulk action results" })
}

/** One line per selected row inside the report panel. */
export function bulkReportRows(page: Page): Locator {
  return bulkReportPanel(page).locator("li")
}

/** A row's favorite toggle, addressed by its accessible name. */
export function favoriteStar(page: Page, contactId: string): Locator {
  return rowById(page, contactId).getByRole("button")
}

/**
 * The toolbar's `visible of total in scope` readout.
 *
 * Waiting on this rather than on a row count is what makes a filter assertion
 * stable: the row set is virtualized, so the DOM can settle before TanStack has
 * re-run the filter, while the readout is derived from the row model itself.
 */
export function inScopeCount(page: Page): Locator {
  // `.first()` for the same reason `gridStatusLine` takes one: a locator that
  // matches twice fails in strict mode rather than reporting which one it meant.
  return gridRoot(page).getByText(/\d[\d,]* of \d[\d,]* in scope/).first()
}

/** The visible/total numbers out of `inScopeCount`'s text. */
export async function inScopeCounts(page: Page): Promise<{ visible: number; total: number }> {
  const text = (await inScopeCount(page).innerText()).replace(/,/g, "").trim()
  // Anchored: an unanchored pattern would happily read `1-25 of 250 in scope` as
  // 25 visible, and every count assertion built on it would be quietly wrong.
  const match = text.match(/^(\d+) of (\d+) in scope$/)

  if (!match) {
    throw new Error(`Could not read the in-scope counts from "${text}".`)
  }

  return { visible: Number(match[1]), total: Number(match[2]) }
}

/**
 * Wait until the filter has produced exactly `visible` rows.
 *
 * An equality poll rather than a `toHaveText` on the readout: `toHaveText` would
 * also pass on a stale value that happens to match, whereas this fails loudly
 * when the count never settles.
 */
export async function expectVisibleCount(page: Page, visible: number): Promise<void> {
  await expect
    .poll(async () => (await inScopeCounts(page)).visible, {
      message: `the filtered row count never reached ${visible}`,
    })
    .toBe(visible)
}

/**
 * Open `/manage` on the contacts tab and wait for the grid to settle.
 *
 * The wait is on the panel marker rather than on a row: `data-grid-panel="ready"`
 * is the grid's own statement that the row model is non-empty, and it is set in
 * the same render pass as the rows.
 */
export async function openContactsGrid(
  page: Page,
  options: ManageContactsUrlOptions & { expectRows?: boolean } = {},
): Promise<void> {
  const { expectRows = true, ...url } = options

  await page.goto(manageContactsUrl(url))
  await expect(gridRoot(page)).toBeVisible()

  if (expectRows) {
    // The panel marker and the counts come from the same render pass, but the
    // counts are a child expression and can lag it by a paint, so both are
    // waited on. Polling `inScopeCounts` for truthiness would assert nothing: it
    // either throws or returns a non-empty object.
    await expect(page.locator('tbody[data-grid-panel="ready"]')).toBeAttached()
    await expect
      .poll(async () => (await inScopeCounts(page)).total, {
        message: "the grid never reported a non-zero row count",
      })
      .toBeGreaterThan(0)
  }
}

/**
 * Narrow the grid to `text` through the global filter, and return once the grid
 * has settled on the new row count.
 *
 * Used instead of scrolling because the rows are virtualized: a filter is the
 * only reliable way to make a named row render.
 *
 * **Typed, not `fill`ed.** Playwright's `fill` assigns `input.value`, which
 * updates React's own value tracker, so React's `onChange` can be suppressed —
 * the DOM keeps the typed text (so `toHaveValue` passes) while no state change
 * happens at all. Observed here as a filter that appeared to work and silently
 * did not: the URL carried no `q`, the row count never moved, and the spec passed
 * because it was asserting against a count that only the *other* filter produced.
 * Real key events cannot be swallowed that way, so the text is typed.
 *
 * The URL is then asserted, because `q` is written by the grid's own state change
 * and its presence is the proof that React saw the edit — before the count is
 * read, because a count read too early is the pre-filter number.
 */
export async function filterGlobally(page: Page, text: string): Promise<number> {
  const search = searchBox(page)

  await search.click()
  await search.press("ControlOrMeta+a")
  if (text.length > 0) {
    await search.press("Backspace")
    await search.pressSequentially(text)
  } else {
    await search.press("Backspace")
  }

  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"), {
      message: `the global filter never reached the URL as ${JSON.stringify(text)}`,
    })
    .toBe(text.length > 0 ? text : null)

  return waitForStableVisibleCount(page)
}

/**
 * The visible row count once it stops moving.
 *
 * "Stops moving" rather than "equals something the caller predicted": the caller
 * usually does not know the number, and two consecutive equal reads is the only
 * signal available that the row model has caught up with the state change.
 */
export async function waitForStableVisibleCount(page: Page): Promise<number> {
  let previous = -1

  await expect
    .poll(
      async () => {
        const current = (await inScopeCounts(page)).visible
        const settled = current === previous
        previous = current
        return settled ? current : -1
      },
      { message: "the grid never settled on a row count" },
    )
    .toBeGreaterThanOrEqual(0)

  return previous
}

/** Read `is_favorite` for a set of rows straight from the local database. */
export async function readFavoriteFlags(ids: readonly string[]): Promise<Map<string, boolean | null>> {
  return readContactColumn(ids, "is_favorite")
}

/** Read `name` for a set of rows — used to prove a committed edit persisted. */
export async function readContactNames(ids: readonly string[]): Promise<Map<string, string | null>> {
  return readContactColumn(ids, "name")
}

/**
 * Put a column back the way it was.
 *
 * **This is not optional housekeeping for a name.** `global-setup.ts` runs
 * `pnpm seed:bulk-local` at the start of every suite invocation, and the
 * generator is idempotent by *exact deterministic name*: it collects the tagged
 * rows, compares the set against the names it would generate, and inserts the
 * difference. A spec that renames a fixture and leaves it renamed therefore makes
 * the next run try to insert a row whose `phone` already exists, and the whole
 * suite fails in `globalSetup` with `idx_contacts_phone_program` — a failure that
 * names the generator rather than the spec that caused it.
 *
 * A `null` prior value means the read did not find the row, so there is nothing
 * to restore; it is skipped rather than written, because writing `null` would
 * invent a value the row never had.
 */
export async function restoreContactColumn(
  previous: ReadonlyMap<string, unknown>,
  column: string,
): Promise<void> {
  const entries = [...previous.entries()].filter(([, value]) => value !== null && value !== undefined)
  if (entries.length === 0) return

  for (const [id, value] of entries) {
    const { error } = await bulkFixtureClient().from("contacts").update({ [column]: value }).eq("id", id)
    if (error) throw new Error(`Restoring ${column} for ${id} failed: ${error.message}`)
  }
}

/** Restore `name` values captured by `readContactNames`. */
export async function restoreContactNames(previous: ReadonlyMap<string, string | null>): Promise<void> {
  await restoreContactColumn(previous, "name")
}

/** Restore `is_favorite` values captured by `readFavoriteFlags`. */
export async function restoreFavoriteFlags(previous: ReadonlyMap<string, boolean | null>): Promise<void> {
  await restoreContactColumn(previous, "is_favorite")
}

/**
 * Read one column for a set of rows, straight from the local database.
 *
 * The rows' on-screen values are the component's own mirror of the payload plus
 * the keyboard hook's override, so a spec that wants to know what the *server*
 * holds must ask the database. Ids the read did not find map to `null` rather
 * than being dropped, so a missing row cannot quietly shrink a comparison.
 */
export async function readContactColumn<T>(
  ids: readonly string[],
  column: string,
): Promise<Map<string, T | null>> {
  const values = new Map<string, T | null>()

  if (ids.length === 0) return values

  const { data, error } = await bulkFixtureClient().from("contacts").select(`id,${column}`).in("id", [...ids])
  if (error) throw new Error(`Reading ${column} for ${ids.length} contact(s) failed: ${error.message}`)

  // `select()` is a template string, so the result is not row-typed; the cast is
  // the honest description of what PostgREST returns for `id,<column>`.
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>

  for (const row of rows) {
    values.set(String(row.id), (row[column] as T | null) ?? null)
  }

  for (const id of ids) {
    if (!values.has(id)) values.set(id, null)
  }

  return values
}
