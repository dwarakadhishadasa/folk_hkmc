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
| 1 | Happy-path cell edit | UI | **Covered** | `manage-contacts-edit.spec.ts` |
| 2 | Edit persists after reload | UI | **Covered** | `manage-contacts-edit.spec.ts` |
| 3 | Rejected cell edit (400 revert) | Intercept | **Covered** | `manage-contacts-edit.spec.ts` |
| 4 | Empty required field | UI | **Covered** | `manage-contacts-edit.spec.ts` |
| 5 | Network failure on edit | Intercept | **Covered** | `manage-contacts-edit.spec.ts` |
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

**19 Covered, 0 Manual, out of 19.** The two rows that sat on Manual did so
because their specs ran and **failed** — not because they were skipped, and not
because they were claimed unreachable. Both were browser-observable, both specs
were committed and wired into `pnpm test:e2e`, and both failed for one named
reason. That reason is fixed; the history is kept below rather than deleted,
because the tripwire is the part worth copying.

### The recorded run

The verdicts above were last recomputed by story 2, on a working tree on top of
`464b4ed`, against the local stack, Playwright 1.62, `baseURL http://127.0.0.1:3000`,
single worker. `464b4ed` is the revision the fix is diffed against, not one that
contains it — the fix was uncommitted when the run was taken.

The listing below is an **excerpt**: the tests it omits are the foundation's own
harness rows, which this map does not claim. The row specs' titles are verbatim.

```
$ pnpm test:e2e

Running 86 tests using 1 worker
  ...
  ✓  50 row 9 — five selected rows each report their own success and the rows update
  ✓  51 row 10 — a partial batch reports each failure with its own reason
  ✓  52 row 11 — one row's missing outcome is reported alone; the rest really commit
  ✓  53 row 11 (dropped request) — no row is claimed saved when the batch never lands
  ✓  54 row 16 — a 200 without results is reported as a bulk failure and claims no success
  ✓  55 row 1 — a committed edit shows the new value before the response lands
  ✓  56 row 1 (remaining clauses) — one Enter is one PATCH carrying the new value, and it commits
  ✓  57 row 2 — a committed edit is the server's value after a reload
  ✓  58 row 3 — a 400 reverts the cell visibly, marks it destructive and shows the server message
  ✓  59 row 4 — clearing a required field shows the empty value before the response lands
  ✓  60 row 4 (remaining clauses) — the real handler answers 400 and the cell reverts with its message
  ✓  61 row 5 — a dropped PATCH reverts the cell with the reachability message
  ✓  62 row 17 — the location column filter narrows on the joined name and combines with the global filter
  ✓  63 row 17 (error handling) — a stale column filter id renders instead of throwing
  ✓  64 row 18 — sorting by name uses the committed value, not the pre-edit value
  ✓  65 row 19 — an empty scope renders the No records panel and no usable header checkbox
  ✓  66 row 19 (neighbouring panel) — a filter that matches nothing is a different panel
  ✓  67 row 6 — the header checkbox selects every row of a filtered set
  ✓  68 row 7 — a partial selection renders the header mixed and names the count
  ✓  69 row 8 — selection survives filtering, and the count is of selected rows
  ✓  70 row 12 — the bulk action is inert with nothing selected and issues no request
  ...
  86 passed (5.3m)
```

Exit 0, **and `pnpm test:e2e:determinism` reports 86 passed on both of two
consecutive runs** with no manual reset in between. There is no `✘` in a green run
any more.

### Rows 1 and 4: the defect this map found, and what fixed it

Both rows require an **optimistic display** — the new value on screen *before* the
write resolves. Both specs hold the PATCH response open (`page.route` +
`route.continue()` after the assertion) and read the cell while the request is
still in flight. Both failed: the cell kept showing the prior value until the
server answered.

One line caused it, in `renderCellNode` (`components/grid/use-grid-keyboard.ts`):

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
`cell.render !== undefined ? cell.render : cell.text` therefore always took the
first branch, and `cell.text` — which carries the override, the `GRID_EMPTY_TEXT`
placeholder and the `title` tooltip — was dead for every accessor column.

**The fix.** `Grid` now resolves, from the column definitions it was *handed*
rather than from the merged defs, which ids actually carry a `cell` renderer, and
hands that set to `useGridKeyboard`; `renderCellNode` renders only those. Asking
the merged def was never going to work: the library's default is indistinguishable
from a consumer's one after the merge, which is the whole defect. The same
question is now asked of `header`, so a column that supplies none keeps its own
sort/filter/menu/resize chrome.

**The tripwire worked as advertised.** Both specs were `test.fail`, so their
bodies ran and the day the fix landed they reported "unexpectedly passed" — the
suite went red and pointed at exactly the two rows this table had listed as
Manual. The markers were removed in the same change that fixed the behaviour, and
the two rows flipped to Covered in that commit.

**And the fix exposed a second defect, in the spec rather than the app.** Rows 1
and 4 park the PATCH inside a `page.route` handler and release it from the
`finally`. Unrouting a still-parked request resumes it through Playwright's own
fallback, so the handler's later `route.continue()` threw
`Route is already handled!` — *inside* the `finally`. Both rows then failed for a
reason unrelated to the assertion under test, and the failure **buried** the real
signal: the captured page showed the edited value rendering correctly while the
reported error named a teardown race. `release` is now a promise, awaited before
`unroute`.

This is the second-order lesson the tripwire taught, and it is the one worth
keeping: a `test.fail` row tells you *that* something is broken, but the run that
trips it is the first run exercising that code path end to end, so it is also the
first run that can surface a defect in the test's own teardown. Read the error,
not just the verdict.

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

### Rows 1–5 and 18 re-verified under CAP-10 — the edit model moved, the verdicts did not

`spec-contacts-premium-grid` story 1 replaced the edit **opener**: double-click
is now the only gesture that opens a cell editor, `e` / printable-character
type-to-edit / `Space`-seeding and the single click on a display widget are
retired, blur commits, and `Escape` is the only discard. Rows 1–5
(`manage-contacts-edit.spec.ts`) and row 18 (`manage-contacts-filter.spec.ts`)
are the rows whose specs opened an editor with `press("e")`, so their evidence
was rewritten: every opener gesture became a double-click plus `keyboard.type`,
and each converted site records why the behaviour was removed.

**The verdicts above are unchanged and were re-verified, not assumed.** The
claim each row makes is untouched by the opener change — one PATCH, a value that
survives a reload, a 400 that reverts, an empty required field, a dropped
request, a sort that reads the committed value — and the run below is the record
of them passing under the new model. Nothing was deleted: a retired assertion
records its reason on the test, so a green suite is not read as evidence that the
keyboard model still works.

A new spec, `e2e/specs/grid-edit-model.spec.ts` (27 tests), carries the CAP-10
claims themselves — the one opener, the single commit path, zero requests on an
untouched blur, `Escape` as the only discard, and the four retired openers
opening nothing. It sits **outside** this 19-row map: none of the 19 rows is
about edit activation, and adding a twentieth row for it would claim coverage
this foundation never specified.

The recorded run, against `HEAD` on top of `065dec1`, local stack,
`baseURL http://127.0.0.1:3000`, single worker:

```
$ pnpm test:e2e:determinism

Pass counts
  run 1 of 2: 190 passed
  run 2 of 2: 190 passed

Suite determinism PASSED — 2 consecutive green runs.
```

190 tests, twice, with no manual reset between the runs — which is the bar this
map set for itself and not a new one.

### Row 17 re-verified under CAP-12 — the filter moved, the verdict did not

`spec-contacts-premium-grid` story 6 replaced the filter **surface**: the
per-column popovers are gone, and filtering is one popover anchored under the
toolbar's Filter control holding a visible list of `Field · operator · value`
conditions joined by one all-or-nothing connective. It also changed the
**encoding** — `f.<colId>` now carries `<operator>:<value>` rather than a bare
value — which is what makes an empty value (`Notes · is empty`) round-trip at
all, where it was previously dropped in both directions.

Row 17's claim is untouched: it narrows on the joined location name, composes
with the global filter, and round-trips through the URL. What changed is that the
URL it round-trips through is read as a **legacy operator-less token** — `contains`
for a text column — so an existing shared link still narrows to the same rows.
Row 17's evidence is that same assertion, re-run under the new codec.

A new spec, `e2e/specs/grid-filter-conditions.spec.ts` (18 tests), carries the
CAP-12 claims themselves — the operator registry per field type, the disabled
value control, the reset on a field change, `is any of` intersection, the two
source defects, match-all and match-any, and the unparseable-date branch that
must match nothing AND say so. Like the CAP-10 spec above it sits **outside**
this 19-row map: none of the 19 rows is about the filter surface, and adding a
twentieth row for it would claim coverage this foundation never specified.


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
3. **Write the 19 row specs**, then update this map's verdicts to what actually passed. ✅ **Done** — 19 Covered, 0 Manual; specs in `e2e/specs/manage-contacts-*.spec.ts`.
4. **Only then** amend story 2's Verification section and re-run it. ✅ **Done** — the Verification section now points at the committed specs; the matrix table itself is untouched.

Step 2 is not optional and not a story-2 concern. Sequencing it after the smoke spec would produce a green harness that cannot cover the matrix it exists to cover.

## Amending story 2's matrix

Story 2's `## Verification` section changed from *"Manual checks (no test runner exists — `CONTRIBUTING.md:36`)"* to point at committed specs. Concretely:

- Every row flips Manual → Covered **only if** its spec passed in the recorded run. A row whose spec is skipped, flaky, or absent stays Manual. ✅ Done twice, and the second pass is the rule working rather than the rule being bent: rows 1 and 4 stayed Manual for as long as their specs kept failing, and flipped only once the implementation was fixed and they passed. Not one verdict changed because a fixture landed or a table got easier to fill in.
- The `pnpm test:e2e` command joins the Verification command list with its expected output. ✅ Done.
- The `## I/O & Edge-Case Matrix` table itself keeps all 19 rows and their expectations **unchanged**. The implementation must satisfy the matrix; the matrix is not edited to match what happened to be easy to test. That asymmetry is the audit's whole point. ✅ Done — not one cell of that table changed.

### `CONTRIBUTING.md` — already done, plus one addition

The stale sentence *"This project currently has no full automated test suite"* was
removed by foundation story 2 (`408b005`), which replaced that paragraph with the
`pnpm test:e2e` documentation. So the contradiction this section used to warn about
no longer exists.

What story 4 added is the part that had no home until the row specs landed: which
specs cover which matrix rows, and why a run printed two `✘` marks without failing.
That explanation is now historical — a green run prints no `✘` — and
`CONTRIBUTING.md` no longer carries the paragraph.

### Claiming a matrix row: the rule this map now enforces

The six rules below are the contract.
[`docs/claiming-a-matrix-row.md`](../../../docs/claiming-a-matrix-row.md) is the
long-form version of them: which layer to use for a given row and the observable
that selects it, what a row needs seeded, and what to record when you flip it.

1. **A row flips only on a passed spec in the recorded run.** Not on a spec that
   exists, and not on a spec that is "obviously" correct.
2. **"Unreachable" is not a verdict.** If the behavior is browser- or
   HTTP-observable, the row is coverable and the test gets written. Every row that
   used to sit on that excuse is now Covered. A row whose spec fails is not a third
   resting state either: it is Manual until the defect behind it is fixed, then
   Covered — that was rows 1 and 4's whole journey.
3. **Pick the layer by what the row observes** — UI for browser behavior, the
   `request` fixture for status codes and body shape, `page.route` for failure
   modes a live server will not produce on demand. Route interception replaces the
   *response*; the handler still runs unless the spec deliberately stops it.
4. **Fixtures are shared: restore what you change.** The generator is keyed on
   exact deterministic names, so a spec that leaves a renamed fixture behind breaks
   the next run before any test executes.
5. **A failing row is recorded as failing, with its cause.** Rows 1 and 4 are the
   worked example, and they ran the whole way: committed, wired in, failing for one
   named reason, and carrying a `test.fail` tripwire so that the day they passed the
   map would be forced to change — which is what happened.
6. **When a tripwire trips, read the error it surfaces.** The run that turns a
   `test.fail` row red is the first run exercising that path end to end, so it is
   also the first run that can surface a defect in the *test's own* teardown. Rows
   1 and 4 did exactly that: the app fix worked, and a `route.continue` race in the
   `finally` then failed them for an unrelated reason.
