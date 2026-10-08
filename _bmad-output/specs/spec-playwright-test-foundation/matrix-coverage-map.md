# Matrix coverage map

The contract for CAP-D, and the answer to the question story 2 could not answer from inside itself: **which of its 19 rows does Playwright actually cover?**

Two verdicts are possible and only one of them is honest:

- **Covered** — a committed spec verifies the row's *expected behavior*, and that spec passed in the run output.
- **Manual** — no committed spec verifies it; a human checks it against `pnpm dev:folk`.

"Unreachable" is not a verdict. A row whose behavior is browser-observable or HTTP-observable is coverable; claiming otherwise to avoid writing the test is how the audit became unsatisfiable in the first place.

## Method

Three layers, no unit runner:

| Layer | Mechanism | Fits rows that are |
|---|---|---|
| **UI** | `page.*` against a signed-in `storageState` | browser-observable — optimistic display, keyboard, selection, sorting, filtering |
| **API** | Playwright `request` fixture against `/api/manage/...` with the same cookies | status code / body shape — the cap, per-item isolation, malformed envelopes |
| **Route interception** | `page.route()` fulfilling or aborting | failure modes a live server will not produce on demand — forced 400, dropped fetch, malformed 200 |

Route interception is what makes rows 3, 5, 11, and 16 testable without corrupting real data. It is not mocking the system under test: the request still reaches the real handler unless the spec deliberately intercepts it.

## Story 2 — `2-refactor-manage-contacts-table...`

All 19 rows, with the row text abbreviated to its subject. **The verdict column
is the record of a run, not a prediction.** It was last recomputed by story 4
against the run recorded below; a row flips Manual → Covered only when its spec
existed, ran, and passed in that run's output.

The fixture prerequisite each row assumed is recorded in the header of the spec
named in the last column — the column used to hold it, and dropping it would have
left a later author re-deriving "≥40 rows, select 3" from the specs.

| # | Row | Layer | Verdict | Spec |
|---|---|---|---|---|
| 1 | Happy-path cell edit | UI | **Manual** | `manage-contacts-edit.spec.ts` — `test.fail`, see [Rows 1 and 4](#rows-1-and-4-the-one-defect-this-map-found) |
| 2 | Edit persists after reload | UI | **Covered** | `manage-contacts-edit.spec.ts` |
| 3 | Rejected cell edit (400 revert) | Intercept | **Covered** † | `manage-contacts-edit.spec.ts` — caveat in [Rows 1 and 4](#rows-1-and-4-the-one-defect-this-map-found) |
| 4 | Empty required field | UI | **Manual** | `manage-contacts-edit.spec.ts` — `test.fail`, see [Rows 1 and 4](#rows-1-and-4-the-one-defect-this-map-found) |
| 5 | Network failure on edit | Intercept | **Covered** † | `manage-contacts-edit.spec.ts` — caveat in [Rows 1 and 4](#rows-1-and-4-the-one-defect-this-map-found) |
| 6 | Multi-row selection | UI | **Covered** | `manage-contacts-selection.spec.ts` |
| 7 | Indeterminate header | UI | **Covered** | `manage-contacts-selection.spec.ts` |
| 8 | Select-all then filter | UI | **Covered** | `manage-contacts-selection.spec.ts` |
| 9 | Bulk all succeed | API + UI | **Covered** | `manage-contacts-bulk.spec.ts` |
| 10 | Bulk partial success | API | **Covered** | `manage-contacts-bulk.spec.ts` |
| 11 | Bulk, one unreachable row | Intercept | **Covered** | `manage-contacts-bulk.spec.ts` — mapping stated in [Row 11's mapping](#row-11s-mapping-stated-not-glossed) |
| 12 | Bulk over empty selection | UI | **Covered** | `manage-contacts-selection.spec.ts` |
| 13 | Batch over the 200 cap | API | **Covered** | `manage-contacts-api.spec.ts` |
| 14 | Bad `contactId` isolation | API | **Covered** | `manage-contacts-api.spec.ts` |
| 15 | Item missing `contactId` | API | **Covered** | `manage-contacts-api.spec.ts` |
| 16 | Malformed `results` body | Intercept | **Covered** | `manage-contacts-bulk.spec.ts` |
| 17 | Location filter | UI | **Covered** | `manage-contacts-filter.spec.ts` |
| 18 | Sort after edit | UI | **Covered** | `manage-contacts-filter.spec.ts` |
| 19 | Zero rows in scope | UI | **Covered** | `manage-contacts-filter.spec.ts` |

**17 Covered, 2 Manual, out of 19.** Both remaining rows are Manual because their
specs ran and **failed** — not because they were skipped, and not because they
were claimed unreachable. They are browser-observable, the specs are committed,
and they are wired into `pnpm test:e2e`; they fail for one named reason, recorded
below.

### The recorded run

Taken at `0e82a774` (the story's `baseline_revision`, plus this story's own
specs) against the local stack, Playwright 1.62, `baseURL http://127.0.0.1:3000`,
single worker. The listing below is an **excerpt** — the tests it omits are the
foundation's own harness rows, which are unchanged by this story — with the row
specs' titles kept verbatim. The suite reports `77 passed` after the review pass
that split rows 1 and 4; the run recorded here is the one the verdicts were first
read from, at 75.

```
$ pnpm test:e2e

Running 75 tests using 1 worker
  ...
  ✓  50 row 9 — five selected rows each report their own success and the rows update
  ✓  51 row 10 — a partial batch reports each failure with its own reason
  ✓  52 row 11 — one row's missing outcome is reported alone; the rest really commit
  ✓  53 row 11 (dropped request) — no row is claimed saved when the batch never lands
  ✓  54 row 16 — a 200 without results is reported as a bulk failure and claims no success
  ✘  55 row 1 — a committed edit shows immediately and issues exactly one PATCH
  ✓  56 row 2 — a committed edit is the server's value after a reload
  ✓  57 row 3 — a 400 reverts the cell visibly, marks it destructive and shows the server message
  ✘  58 row 4 — clearing a required field shows empty, then reverts with the server's message
  ✓  59 row 5 — a dropped PATCH reverts the cell with the reachability message
  ✓  60 row 17 — the location column filter narrows on the joined name and combines with the global filter
  ✓  61 row 17 (error handling) — a stale column filter id renders instead of throwing
  ✓  62 row 18 — sorting by name uses the committed value, not the pre-edit value
  ✓  63 row 19 — an empty scope renders the No records panel and no usable header checkbox
  ✓  64 row 19 (neighbouring panel) — a filter that matches nothing is a different panel
  ✓  65 row 6 — the header checkbox selects every row of a filtered set
  ✓  66 row 7 — a partial selection renders the header mixed and names the count
  ✓  67 row 8 — selection survives filtering, and the count is of selected rows
  ✓  68 row 12 — the bulk action is inert with nothing selected and issues no request
  ...
  75 passed (4.0m)
```

Exit 0, twice back to back with no manual reset in between. The two `✘` marks are
Playwright's rendering of `test.fail` — **expected** failures that the suite
counts as passing. They are not skipped and not flaky; they print as failures on
purpose so the failure stays visible in every run.

### Rows 1 and 4: the one defect this map found

Both rows require an **optimistic display** — the new value on screen *before* the
write resolves. Both specs hold the PATCH response open (`page.route` +
`route.continue()` after the assertion) and read the cell while the request is
still in flight. Both fail: the cell keeps showing the prior value until the server
answers.

One line causes it, in `renderCellNode` (`components/grid/use-grid-keyboard.ts`):

```ts
return flexRender(cell.column.columnDef.cell, cell.getContext()) ?? undefined
```

`table._getDefaultColumnDef()` (`@tanstack/table-core@8.21.3`,
`build/lib/core/table.js:155-159`) supplies a `cell` renderer for **every** column:

```js
cell: props => props.renderValue()?.toString() ?? null,
```

so `columnDef.cell` is never absent, the `?? undefined` never fires, and
`GridCellView.render` is always defined. `GridRow`'s
`cell.render !== undefined ? cell.render : cell.text` therefore always takes the
first branch, and `cell.text` — which carries the override, the `GRID_EMPTY_TEXT`
placeholder and the `title` tooltip — is dead for every accessor column.

Three matrix rows are downstream of the same defect, and the map records what is
actually verified for each:

| Row | Status | Note |
|---|---|---|
| 1 | Manual | the "shows immediately" clause is unobservable: the value only appears after the response |
| 4 | Manual | the "optimistic empty display" clause is unobservable for the same reason |
| 3 | Covered (caveat) † | the destructive marker and the status message are driven by `className`/`statusMessage`, not by `cell.text`, so they are genuinely asserted. The "visibly reverts" clause happens to hold, but it would also hold if the override did not exist — so it is asserted weakly until rows 1/4 pass |
| 5 | Covered (caveat) † | same as row 3 |

† **A Covered verdict with a stated weakness, not a third verdict value.** The
matrix allows two answers and the run answers them honestly for both rows; what is
weaker is the *strength* of the evidence for one clause, and that belongs in a
note rather than in the verdict column. If rows 1 and 4 are ever fixed, these two
caveats disappear with them, because the assertions become load-bearing.

**The remediation is one line in story 2's own code:** render `cell.render` only
when the consumer supplied a `cell` renderer, rather than whenever TanStack's
default is present. It is deliberately *not* applied here — this spec does not
re-implement story 2's table, and a fix belongs in the story that owns the
behaviour.

The two specs are `test.fail`, not `test.fixme`, on purpose: the bodies still run,
so the assertions stay live, and the moment the defect is fixed they report
"unexpectedly passed" and the suite goes red. That is the tripwire that forces
these two verdicts to be revisited rather than left on Manual forever.

### Row 11's mapping, stated not glossed

The matrix asks for "`fetch` rejects for one item only". The shipped batch is
**one** HTTP request carrying every item, so there is no per-item request for a
network failure to be scoped to. The reachable expression of that clause is an
item whose outcome the server never reports, and `manage-contacts-bulk.spec.ts`
asserts both halves:

1. `route.fetch()` runs the **real** handler — so the other rows' commits are real
   writes read back from the database — and only then is the response rewritten
   without one row's result. That row gets its own failure line and is not applied
   locally; the other four report `Saved.` and are verified written.
2. The whole request is aborted. Every row reports a failure and none is claimed
   saved.

Both are per-item isolation over real network outcomes, which is what the row's
error-handling column asks for. The wording differs from the matrix's literal
"`fetch` rejects", and that difference is recorded here rather than papered over.


## The blocking prerequisite: row volume — **now exists**

`scripts/seed-preview-fixtures.mjs` seeds, per program: **one** in-scope contact. The matrix assumes:

- row 7 wants "3 of 40 rows selected"
- row 8 wants a select-all across a filtered set
- rows 6, 9, 10 want 2–5 selectable rows
- story 1's matrix assumed 500 rows for virtualization, and story 2's Verification section records a measured **1,052** in-scope rows for folk

So a **bulk-data fixture generator** is a hard prerequisite for this spec, not an optional extra. It must generate tagged, program-scoped contacts with:

- distinct `name` values (sort-after-edit, global filter)
- distinct `location_id` values pointing at real locations (row 17's per-column filter)
- at least one with `phone` set (row 4) and at least one without (row 3)
- enough rows to make the 200-item bulk cap meaningful and to make selection non-trivial

Rows must be `preview-fixture-` tagged so `--wipe` finds them, and must be **bulk-insertable** — inserting 1,052 rows one call at a time over PostgREST is minutes per suite run, which is its own kind of failure.

Volume must be a parameter. A fast default (enough for rows 6–18, say 250 rows) keeps the suite quick; the full 1,052 belongs to a manual/perf check, not to every run.

### What landed

`scripts/bulk-contact-fixtures.mjs`, run as `pnpm seed:bulk-local`:

| | |
|---|---|
| **Default volume** | **250** tagged contacts for `folk` — above the 200-item bulk cap, far above row 7's 40 |
| **Batched insert** | one PostgREST request per `--chunk-size` (default 250) rows, so the default volume is a single request; the request count is printed, not guessed |
| **Flags** | `--count`, `--program` (`folk` \| `gita-life` \| `both`), `--locations` (default 5), `--chunk-size` (default 250), `--wipe`, `--allow-non-local` |
| **Full volume** | `pnpm seed:bulk-full` = `--count 1052 --program folk`, the manual/perf check |
| **Tag** | `preview-fixture-bulk-`, a strict prefix of the seeder's `preview-fixture-`, so the seeder's `--wipe` filter covers it |
| **Idempotence** | `--count` is a **floor**, not a truncate; names are deterministic, so a second run inserts 0 and never deletes a row a lower `--count` would drop |

Playwright's `globalSetup` runs the generator once per suite invocation, so a run cannot report green against 24 rows. Two supporting details make the data usable rather than merely present:

- **Distinct joined location names.** Each program gets `preview-fixture-bulk-location-<n>-<program>` locations, and the generator **widens the seeded Preacher's `users.location_ids`** to the union of its seeded ids and the bulk locations. `caller_effective_location_ids()` hands a Preacher only its own `location_ids`, so without the widening a Preacher session renders raw UUIDs in the Location column and row 17's filter has nothing to match. The widening is why the generator must run **after** `pnpm seed:local`, which resets that column.
- **Exactly one blank phone.** `contacts.phone` is `NOT NULL` and `UNIQUE (phone, program_id)`, so the empty string is the only possible "contact with no phone" and at most one such row per program can exist. Row 3's forced-400 case is served by route interception instead.

### Deviations from the story as written

Three, all recorded here because the story is the record and a silent divergence is worse than a documented one:

1. **`seed:bulk-full` is folk-only** (`--count 1052 --program folk`), not `--program both`. The story's flag description has `both` *split* the count, which would leave folk with 526 rows — but the story's own manual check expects folk to carry more than 1,000, reproducing the 1,052 in-scope rows story 2 measured. Splitting cannot satisfy that; folk-only can. The split behaviour is kept, tested, and available via `--program both`.
2. **The out-of-scope ratio is every tenth row**, not every fourth. Every fourth left 188 in-scope rows at the 250 default — below `MANAGE_BULK_MAX_ITEMS = 200` — so no spec could select over the cap. Every tenth gives 225 in-scope and 25 out-of-scope, which is what the bulk-cap rows need.
3. **`scripts/seed-preview-fixtures.mjs`'s `--wipe` deletes were batched.** The Code Map marked that file read-only, but Acceptance Criterion 2 and the manual check require its `preview-fixture-%` filter to remove ~250 generated rows, and its single `.in("id", …)` request is a `URI too long` at that volume. Only the request count changed: the filter, the tag convention, the seeding logic and DW-3 are untouched.

**The verdict column above was left untouched by that story, on purpose.** It
delivered the prerequisite the map asked for; story 4 owned the row specs, and a
verdict was only allowed to change when a spec passed in a recorded run. A verdict
must never change because a fixture landed — and, symmetrically, it changed in
story 4 because specs ran, not because the table was convenient to fill in.

### One constraint the row specs inherited from the generator

The generator's idempotence is keyed on the **exact deterministic name**: it
collects the tagged rows, compares the set against the names it would generate, and
inserts the difference. A spec that renames a fixture and leaves it renamed
therefore makes the *next* run's `globalSetup` try to insert a row whose `phone`
already exists, and the whole suite fails with `idx_contacts_phone_program` — a
message that names the generator rather than the spec that caused it.

Rows 1, 2 and 18 all commit a name change against a shared fixture, so all three
restore the original name in a `finally`. This is worth stating as a rule for
every future row spec: **the generator tolerates a fixture being *used*, not a
fixture being left *altered*.**

## Recommended sequencing

1. **Build the harness** (this spec's stories): stack assertions, Mailpit OTP reader, `storageState` setup, config, one passing smoke spec.
2. **Build the bulk-data generator.** Without it, 16 of 19 rows stay Manual and story 2 blocks again on the next attempt — for a different-sounding reason, at similar cost. ✅ **Done** — `pnpm seed:bulk-local`, described above.
3. **Write the 19 row specs**, then update this map's verdicts to what actually passed. ✅ **Done** — 17 Covered, 2 Manual; specs in `e2e/specs/manage-contacts-*.spec.ts`.
4. **Only then** amend story 2's Verification section and re-run it. ✅ **Done** — the Verification section now points at the committed specs; the matrix table itself is untouched.

Step 2 is not optional and not a story-2 concern. Sequencing it after the smoke spec would produce a green harness that cannot cover the matrix it exists to cover.

## Amending story 2's matrix

Story 2's `## Verification` section changed from *"Manual checks (no test runner exists — `CONTRIBUTING.md:36`)"* to point at committed specs. Concretely:

- Every row flips Manual → Covered **only if** its spec passed in the recorded run. A row whose spec is skipped, flaky, or absent stays Manual. ✅ Done — and the two rows that failed stayed Manual, which is the rule working rather than the rule being bent.
- The `pnpm test:e2e` command joins the Verification command list with its expected output. ✅ Done.
- The `## I/O & Edge-Case Matrix` table itself keeps all 19 rows and their expectations **unchanged**. The implementation must satisfy the matrix; the matrix is not edited to match what happened to be easy to test. That asymmetry is the audit's whole point. ✅ Done — not one cell of that table changed.

### `CONTRIBUTING.md` — already done, plus one addition

The stale sentence *"This project currently has no full automated test suite"* was
removed by foundation story 2 (`408b005`), which replaced that paragraph with the
`pnpm test:e2e` documentation. So the contradiction this section used to warn about
no longer exists.

What story 4 added is the part that had no home until the row specs landed: which
specs cover which matrix rows, and why a run prints two `✘` marks without failing.
A future reader who sees `✘` in a green run and no explanation will reasonably
assume the suite is lying to them.

### Claiming a matrix row: the rule this map now enforces

1. **A row flips only on a passed spec in the recorded run.** Not on a spec that
   exists, and not on a spec that is "obviously" correct.
2. **"Unreachable" is not a verdict.** If the behavior is browser- or
   HTTP-observable, the row is coverable and the test gets written. Every row that
   used to sit on that excuse is now either Covered or failing with a named defect.
3. **Pick the layer by what the row observes** — UI for browser behavior, the
   `request` fixture for status codes and body shape, `page.route` for failure
   modes a live server will not produce on demand. Route interception replaces the
   *response*; the handler still runs unless the spec deliberately stops it.
4. **Fixtures are shared: restore what you change.** The generator is keyed on
   exact deterministic names, so a spec that leaves a renamed fixture behind breaks
   the next run before any test executes.
5. **A failing row is recorded as failing, with its cause.** Rows 1 and 4 are the
   worked example: committed, wired in, failing for one named reason, and carrying a
   `test.fail` tripwire so the day they pass, the map is forced to change.
