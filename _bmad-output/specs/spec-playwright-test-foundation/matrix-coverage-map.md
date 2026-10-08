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

All 19 rows, with the row text abbreviated to its subject.

| # | Row | Layer | Verdict | Fixture prerequisite |
|---|---|---|---|---|
| 1 | Happy-path cell edit | UI | Manual | needs a seeded contact with an editable `name` |
| 2 | Edit persists after reload | UI | Manual | row 1's edit, then reload |
| 3 | Rejected cell edit (400 revert) | Intercept | Manual | `page.route` fulfilling `400 {"error":"Name is required."}` |
| 4 | Empty required field | UI | Manual | a contact with `phone` set |
| 5 | Network failure on edit | Intercept | Manual | `page.route(...).abort()` on the PATCH |
| 6 | Multi-row selection | UI | Manual | ≥2 in-scope rows |
| 7 | Indeterminate header | UI | Manual | **≥40 rows**, select 3 |
| 8 | Select-all then filter | UI | Manual | **≥40 rows** |
| 9 | Bulk all succeed | API + UI | Manual | ≥5 in-scope rows |
| 10 | Bulk partial success | API | Manual | 3 valid + 2 forced failures |
| 11 | Bulk, one unreachable row | Intercept | Manual | abort one item's request |
| 12 | Bulk over empty selection | UI | Manual | action must be inert, no request |
| 13 | Batch over the 200 cap | API | **Covered** | none — pure envelope validation |
| 14 | Bad `contactId` isolation | API | **Covered** | none — one malformed item |
| 15 | Item missing `contactId` | API | **Covered** | none — pure envelope validation |
| 16 | Malformed `results` body | Intercept | Manual | fulfill `200` with `results` absent |
| 17 | Location filter | UI | Manual | contacts with **distinct joined location names** |
| 18 | Sort after edit | UI | Manual | row 1, then sort by `name` |
| 19 | Zero rows in scope | UI | Manual | a filter that matches nothing |

**The honest reading of this table: 3 of 19 rows are coverable with no new fixture work. The other 16 need seeded data the local environment does not currently produce.**

That is the real prerequisite, and it is the part most likely to be underestimated.

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

**The verdict column above is unchanged, on purpose.** Every row that said Manual still says Manual. This story delivered the prerequisite the map asked for; story 4 owns the row specs, and a row flips to Covered only when its spec passed in a recorded run. A verdict must never change because a fixture landed.

## Recommended sequencing

1. **Build the harness** (this spec's stories): stack assertions, Mailpit OTP reader, `storageState` setup, config, one passing smoke spec.
2. **Build the bulk-data generator.** Without it, 16 of 19 rows stay Manual and story 2 blocks again on the next attempt — for a different-sounding reason, at similar cost. ✅ **Done** — `pnpm seed:bulk-local`, described above.
3. **Write the 19 row specs**, then update this map's verdicts to what actually passed.
4. **Only then** amend story 2's matrix and re-run it.

Step 2 is not optional and not a story-2 concern. Sequencing it after the smoke spec would produce a green harness that cannot cover the matrix it exists to cover.

## Amending story 2's matrix

When the suite is green, story 2's `## Verification` section changes from *"Manual checks (no test runner exists — `CONTRIBUTING.md:36`)"* to point at committed specs. Concretely:

- Every row flips Manual → Covered **only if** its spec passed in the recorded run. A row whose spec is skipped, flaky, or absent stays Manual.
- The `pnpm test:e2e` command joins the Verification command list with its expected output.
- The `## I/O & Edge-Case Matrix` table itself keeps all 19 rows and their expectations **unchanged**. The implementation must satisfy the matrix; the matrix is not edited to match what happened to be easy to test. That asymmetry is the audit's whole point.

The stale sentence in `CONTRIBUTING.md:36` — *"This project currently has no full automated test suite"* — also needs updating as part of this, or it will contradict the harness on every future read.
