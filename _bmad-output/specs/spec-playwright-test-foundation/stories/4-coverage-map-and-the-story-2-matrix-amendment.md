---
title: 'Coverage map and the story 2 matrix amendment'
type: 'chore'
created: '2026-10-08'
status: 'done'
baseline_revision: '0e82a774ca206c09e7046faface491fca3497526'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - _bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md
  - _bmad-output/specs/spec-playwright-test-foundation/SPEC.md
  - _bmad-output/specs/spec-manage-dashboard-grid/stories/2-refactor-manage-contacts-table-onto-the-grid-with-inline-editing-and-bulk-actions.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `matrix-coverage-map.md` is a prediction — 3 of 19 rows marked Coverable,
16 marked Manual for want of a test. Nothing in the repository turns that prediction
into a record. Story 2 of `spec-manage-dashboard-grid` is `blocked` on
`matrix test audit failed` with 0 of 19 rows covered, and its own Auto Run Result
says the missing thing is test infrastructure rather than a defect in the table. This
story supplies the last piece: the row specs, the recorded run, and the verdicts.

**Approach:** Write one spec per matrix row across the three layers the map names —
UI (`page.*` against a signed-in `storageState`), API (Playwright's `request`
fixture against `/api/manage/...` with the same cookies), and route interception
(`page.route` fulfilling, forwarding or aborting) — run the whole suite, and rewrite
the map's verdict column from what actually passed. Rows 13/14/15 first, because the
map marks them coverable with no fixture dependency and they prove the harness works
end to end before anything else depends on it.

## Boundaries & Constraints

**Always:**
- **A row flips Manual → Covered only when its spec ran and passed in the recorded
  run.** A skipped, flaky, unregistered or absent spec leaves the row Manual.
- **"Unreachable" is not a verdict.** Every one of the 19 rows is browser- or
  HTTP-observable. A row that cannot be covered gets a named reason, not an excuse.
- **The 19-row matrix table in story 2 is not edited.** Not one row, not one expected
  output, not one error-handling cell. The implementation satisfies the matrix; the
  matrix is not edited to match what happened to be easy to test.
- **Route interception replaces the response, not the system.** Where a row needs a
  failure mode a live server will not produce on demand, the spec fulfils or aborts
  the response and the real handler still runs — except where the row's subject *is*
  a response the server must not produce.
- **Every spec that writes to a shared fixture restores it.** The generator is
  idempotent by exact deterministic name, so a spec that leaves a renamed fixture
  behind breaks the next run's `globalSetup` before any test executes.
- **Every claim about the implementation is evidenced from the run output**, not from
  reading the source and concluding.

**Never:**
- Never re-implement story 2's table, its grid columns, its bulk handler or its
  routes. Story 2's implementation is committed (`a2fd12f` + `85e3923`); this story
  only unblocks its verification.
- Never delete or weaken a matrix row, and never reword an expected output to match
  what the code happens to do.
- Never count a `/tmp` script, a throwaway harness or a one-off manual check as
  coverage. Every row's evidence is a file under `e2e/specs/`.
- Never claim a row Covered on a spec that did not run.
- Never wire `pnpm test:e2e` into CI, and never add a unit test runner.

## Code Map

- **`e2e/fixtures/manage-grid.ts`** (new) — locators for the grid's own DOM contract
  (`[data-grid-root]`, `[role=group][aria-label=Contacts]`, `tr[data-grid-row]`,
  `[data-grid-cell$="~<columnId>"]`, `[data-grid-column]`, `[data-bulk-selection-count]`),
  plus the fixture readers and the restore helpers. Nothing here asserts behaviour;
  it makes behaviour addressable so a row's assertions live in that row's file.
- **`e2e/specs/manage-contacts-api.spec.ts`** (new) — rows 13, 14, 15 over real HTTP.
- **`e2e/specs/manage-contacts-edit.spec.ts`** (new) — rows 1–5.
- **`e2e/specs/manage-contacts-selection.spec.ts`** (new) — rows 6, 7, 8, 12.
- **`e2e/specs/manage-contacts-bulk.spec.ts`** (new) — rows 9, 10, 11, 16.
- **`e2e/specs/manage-contacts-filter.spec.ts`** (new) — rows 17, 18, 19.
- **`components/grid/use-grid-keyboard.ts:82-84`** — `renderCellNode`. Read, not
  changed: it is the single line the two failing rows turn on.
- **`components/grid/grid-row.tsx:160-170`** — the `cell.editing ? … : cell.render ??
  cell.text` chain that decides what a cell paints.
- **`node_modules/@tanstack/table-core@8.21.3/build/lib/core/table.js:155-159`** —
  `_getDefaultColumnDef()`'s `cell: props => props.renderValue()?.toString() ?? null`,
  which is why `columnDef.cell` is never absent.
- **`lib/manage/api-handlers.ts:250-360`** — `handleManageContactBulkUpdate` and
  `applyContactBulkItem`: the 200-item cap, the per-item isolation and the per-row
  `ok: false` shape the API rows assert.
- **`scripts/bulk-contact-fixtures.mjs:739-790`** — the exact-name diff that makes a
  spec's leftover rename fatal on the next run.

## Tasks & Acceptance

**Execution:**

- Rows 13/14/15 first — the three the map calls coverable with no fixture work — and
  confirm the harness end to end before the rest.
- One spec file per layer group, each row's expected output quoted in the file header
  so a reader can check the assertion against the matrix without opening the story.
- Update `matrix-coverage-map.md`: verdict column, the recorded run, the reason for
  every row that stayed Manual, and the rule a later story author follows to claim a row.
- Amend story 2's `## Verification`: the command list gains `pnpm test:e2e` with its
  expected output, and the "Manual checks (no test runner exists)" section points at
  the committed specs. The `## I/O & Edge-Case Matrix` table is untouched.
- `CONTRIBUTING.md`: the sentence "This project currently has no full automated test
  suite" is false the moment this lands.

**Acceptance Criteria:**

- Given `pnpm test:e2e`, when it completes, then it exits 0 and every one of the 19
  rows has either a passed spec or a recorded reason it did not pass.
- Given the coverage map, when a row reads Covered, then a committed spec under
  `e2e/specs/` verifies that row's expected behavior and that spec passed in the
  recorded run.
- Given the coverage map, when a row reads Manual, then the reason is a named,
  reproducible failure rather than "unreachable" or "skipped".
- Given story 2's spec, when its `## I/O & Edge-Case Matrix` is diffed against the
  baseline, then not one cell has changed.
- Given `CONTRIBUTING.md`, when a reader looks for the test-suite claim, then what it
  says matches what `pnpm test:e2e` actually does.

## Spec Change Log

### 2026-10-08 — Review pass: rows 1 and 4 split in two after the review

**Triggering finding:** a `test.fail` body aborts at its first failed assertion, so
rows 1 and 4 were never executing the one-PATCH / commit clauses or the
server-400 / revert clauses — and even where they did execute, `test.fail` inverts
the verdict, so they could not turn the suite red. The one assertion anywhere in the
suite that counted PATCH requests for a single-row edit sat behind that wall.

**What changed:** each of those rows is now two tests. A `test.fail` test holds only
the optimistic-display assertion; an ordinary test — `row 1 (remaining clauses)` and
`row 4 (remaining clauses)` — holds the rest and can fail the run.

**Known-bad state avoided:** the real handler's empty-`phone` rejection
(`parseContactPatch`) had no executing assertion anywhere. Rows 3 and 5 fulfil and
abort their own responses, so neither reaches that code; only the aborted row 4
did, and it never got past its first assertion. A server that stopped rejecting an
empty `phone` would have shipped green.

**KEEP:** the `test.fail` tripwire itself. When these two rows pass, they must go
red and the map's two Manual verdicts must change in the same commit — not be
deleted, not be re-labelled.

### 2026-10-08 — Review pass: `fill()` did not reach React, so the filters were untested

**Triggering finding:** row 17 asserted a row count derived from the location filter
alone, which passed because the *global* filter had silently never applied.
Playwright's `fill` assigns `input.value`, which updates React's value tracker, so
React's `onChange` can be suppressed: the DOM keeps the text (so `toHaveValue`
passes) while no state change occurs at all.

**What changed:** `filterGlobally` types with real key events and asserts the URL
carries `q` before any count is read; row 17's expected count is now the
**intersection** of the two filters, and it types into the column-filter popover for
the same reason.

**Known-bad state avoided:** a spec that appeared to prove the global and per-column
filters combine, and proved only that one of them does.

**KEEP:** the URL-assertion-then-count order in every filter spec. A count read
before the state change is a lie, and it will read as a product bug.

### 2026-10-08 — Review pass: verification writes were leaking

**Triggering finding:** row 9's API half patched `isFavorite: false` on five shared
fixtures *after* its own restore and with no restore of its own.

**What changed:** the API half captures and restores like any other write; rows 11
and 16 compare each row's rendered favorite state against what it was before the
action instead of asserting an absolute `aria-pressed="false"`.

**Known-bad state avoided:** the leak had been *masking* the bug it created.
`bulk-contact-fixtures.mjs` generates `is_favorite: index % 5 === 0`, so index 0000
is a favourite by default — the leaked write made it non-favourite, and row 16's
absolute assertion passed only because of the leak. With the leak fixed, the
absolute assertion failed immediately.

**KEEP:** restoring fixtures in a `finally`, and comparing rendered state to
pre-action state rather than to an assumed constant.

## Review Triage Log

### 2026-10-08 — Review pass

- findings reported by the layers: 59 — Blind Hunter 24, Edge Case Hunter 27,
  Verification Gap 8 (4 dispositioned + 4 under `Other findings`), Intent Alignment
  descriptive with no findings list
- verdicts: 59 findings — high 4, medium 10, low 22, false 4, maybe-false 7, plus 12
  rows rejected on their own merits
- rows below: 47. The shortfall against 59 is grouping, not omission: twelve rows
  carry two or three findings that share one root cause (`fill` never reaching
  React; `test.fail` masking a test body; a leaked fixture write; an absolute
  assertion against a non-uniform fixture; a claim that outran what the code did).
  Every finding named by a layer is named in a row below; the grouping is by shared
  root cause, which is what step 2 of the review permits, and each member keeps its
  own row where it has one.
- findings:
  - `[high]` `[patch]` **Blind 2** — `nameIndexFragment()` exported, used by no spec, and its doc (`e.g. -0007-`) does not describe what it returns (`"0007-Harish"`); `indexOf("-folk-")` returning `-1` yields a garbage fragment — Deleted. A locator helper that silently addresses the wrong row is worse than none, and nothing was using it.
  - `[high]` `[patch]` **Blind 8** — `openContactsGrid`'s `expect.poll(() => inScopeCounts(page)).toBeTruthy()` asserted nothing: the call either throws or returns a non-empty object — Replaced with a poll on `total > 0`, which is a real readiness condition.
  - `[high]` `[patch]` **Blind 10 / Edge 14** — `filterGlobally` only asserted the input's value, so callers read a stale count; row 17 then read `(await inScopeCounts(page)).visible` with no poll — Root cause was worse than a flake: `fill` never reached React at all, so row 17's global filter had never applied. `filterGlobally` now types and asserts `q` in the URL before returning.
  - `[high]` `[patch]` **Verification-gap 1** — rows 1 and 4 are `test.fail`, so every assertion after the first failure never runs and none could turn the suite red; the duplicate-PATCH check existed nowhere else — Rows 1 and 4 split in two; `row 1 (remaining clauses)` and `row 4 (remaining clauses)` are ordinary tests.
  - `[medium]` `[patch]` **Verification-gap 2** — the real handler's empty-`phone` 400 was asserted only after an abort point, so `parseContactPatch`'s phone branch had no assertion that could fail — New `row 4 (remaining clauses)` drives a real, unintercepted `PATCH` with `phone: ""`.
  - `[medium]` `[patch]` **Verification-gap 4** — row 13's "no per-row report" assertion compared `[]` to `[]`, because `patchBulk` normalises any non-array to `[]` — Asserted on the raw `body` with `not.toHaveProperty("results")`.
  - `[medium]` `[patch]` **Blind 5 / Edge 9 / Verification-gap other** — row 9's API half wrote `isFavorite: false` after its restore with no restore of its own; the leak was masking row 16's absolute assertion — Restore added around the API half; rows 11 and 16 now compare rendered state to pre-action state.
  - `[medium]` `[patch]` **Blind 11 / Edge 8** — row 15's poll read the database twice per iteration and asserted on a snapshot taken before the request — One read per iteration; the untouched row is read fresh after the poll settles.
  - `[medium]` `[patch]` **Edge 13** — row 12 asserted `bulkRequests` synchronously after a forced click, so a request issued a tick later would escape — Polled for two seconds instead.
  - `[medium]` `[patch]` **Edge 15** — row 17's expected count came from the location filter alone while both filters were active, so the assertion was wrong by however many rows the global filter excluded — Expected set is now the intersection, computed from the fixture names.
  - `[medium]` `[patch]` **Edge 25 / Blind 22** — "every spec that writes restores it" was stated as a constraint and broken by three sites — All three fixed; the bulk file's header now says "including the verification writes".
  - `[medium]` `[patch]` **Intent 5** — story 2's amended `## Verification` and its unamended `## Auto Run Result` contradicted each other inside one file ("Zero of the 19 rows are covered", "no automated test runner") — A dated "Superseded in part" table appended to the Auto Run Result, leaving the historical text intact. The `## I/O & Edge-Case Matrix` table is still byte-unchanged.
  - `[medium]` `[patch]` **Intent 7** — the recorded run was an abridged transcript presented as output, with no revision, version or `baseURL` — Labelled as an excerpt, with the revision, Playwright version, `baseURL` and worker count, and the post-review count noted.
  - `[medium]` `[reject]` **Verification-gap 3** — nothing in CI runs `pnpm test:e2e`, so the 17 Covered verdicts only decay when a developer remembers to run it — Rejected as a routing matter, not a fix: the intent says "No CI workflow changes" explicitly, and the spec's own story 5 carries the determinism gate. Recorded here so the gap is visible rather than forgotten.
  - `[low]` `[patch]` **Blind 1** — orphaned trailing JSDoc in `manage-grid.ts` duplicating the header — Deleted.
  - `[low]` `[patch]` **Blind 3 / 4** — two constants with the same value, and a comment recording an unexplained `ReferenceError` as guidance — One constant; the comment now explains what the number is *for*, with no superstition.
  - `[low]` `[patch]` **Blind 6 / Edge 11 / Edge 12** — `aria-pressed="false"` asserted as an absolute against fixtures that are not uniformly unfavourited — Compared against the captured pre-action state.
  - `[low]` `[patch]` **Blind 7** — `favoriteStar` returns `row.getByRole("button")` with no name scoping, and a second per-row button would make it ambiguous — Left as-is after checking the shipped column model: `select` renders a checkbox, the star is the only `button` in a row. Recorded in the helper's doc rather than in a redundant locator.
  - `[low]` `[patch]` **Blind 9 / Edge 18** — `inScopeCount` had no `.first()` and an unanchored regex, so a pagination-shaped readout would parse as `visible=25` — `.first()` added; the parse is anchored to `^\d+ of \d+ in scope$`.
  - `[low]` `[patch]` **Blind 14 / Intent 7** — see the recorded-run entry above.
  - `[low]` `[patch]` **Blind 15** — the verdict table's "Fixture prerequisite" column was dropped, so "≥40 rows, select 3" and "distinct joined location names" were recorded nowhere — The map now points at each spec's header, which documents its own prerequisite.
  - `[low]` `[patch]` **Blind 16** — rows 3 and 5 are Covered with a caveat the verdict column did not carry, so the table overstated 2 of 17 — Marked † in the table, with the caveat spelled out and defined as a note rather than a third verdict value.
  - `[low]` `[patch]` **Blind 21** — `CONTRIBUTING.md` hard-codes a pass count and the two `✘` lines with no marker — Pinned to `0e82a77`, with an instruction to update it in the same commit that changes the suite.
  - `[low]` `[patch]` **Blind 23** — nothing recorded who must act on the `renderCellNode` defect, or that story 2's block is still live — Story 2's Auto Run Result says so explicitly and says the fix belongs there.
  - `[low]` `[patch]` **Blind 24 / Edge 21** — `route.fetch()` was used to make row 11 honest but documented nowhere as a reusable pattern, and the header's "the real handler still runs" claim was contradicted by the abort case — Both interception shapes are now described in the bulk file's header, with `route.abort()` named as the one place the handler deliberately does not run.
  - `[low]` `[patch]` **Edge 5** — `TARGET_OFFSETS.emptyPhone % rows.length` wrapped around a 5-row list, addressing an arbitrary row — `phoneRow()` asks for as many rows as the offset needs and indexes by position, with a thrown message when the set is short.
  - `[low]` `[patch]` **Edge 6 / 19** — `restoreContactColumn` silently drops `null` priors and writes one `UPDATE` per row — Null-drop kept and now documented as a deliberate rule (writing `null` would invent a value); per-row writes kept, because the volumes here are tens of rows, not the ~250 at which the map records `URI too long`.
  - `[low]` `[patch]` **Edge 16 / 26** — `contactsAssignedTo` has no tag filter while the header claimed "tagged fixtures only" — Header corrected: the blast radius is every folk contact assigned to the Admin, seeded and generated alike, because an Admin's preacher-mode scope is exactly those rows.
  - `[low]` `[patch]` **Edge 22** — the claim that rows 13/14/15 have "no fixture dependency" did not say they still use three seeded ids and write to them — Reworded to "no *new* fixture generation", with the restore stated.
  - `[low]` `[patch]` **Edge 24** — story 2's manual bullet "clear `phone` and commit" was deleted while its automated replacement never executed — Retained in substance: the revert clauses now have a running automated test, and story 2's `## Verification` says which clauses are still visual-only.
  - `[low]` `[patch]` **Verification-gap other** — `expect(window).toEqual([...window].sort())` compares against UTF-16 code-unit order, which could differ from the grid's collation — Kept, and the window it runs over is one homogeneous ASCII family (`preview-fixture-bulk-*` plus two `preview-fixture-contact-*` names), so the two orderings agree by construction; noted rather than changed.
  - `[low]` `[reject]` **Blind 18** — neither lint expectation records the command that establishes the 24-problem baseline — Rejected: the baseline is recorded in story 2's Auto Run Result with its origin commit, which is the only place a baseline count can be honestly established, and re-deriving it here would just duplicate that.
  - `[low]` `[reject]` **Blind 19** — one `UPDATE` per row in the restore path — Rejected with the `medium` entry above; the volumes do not reach the documented failure point.
  - `[low]` `[reject]` **Blind 20** — `holdContactPatch` can leave a handler pending on a failure path — Rejected: both call sites `release()` in a `finally` before `unroute`, and a leaked hold surfaces as a test timeout, not as a false pass.
  - `[low]` `[reject]` **Blind 22** — three copies of the "claim a row" rules (map, story 4, `CONTRIBUTING.md`) — Rejected: they are three audiences (a story author, the spec's own contract, a contributor), and each says something the others do not. No single source is referenced from the others, which is the real weakness, but collapsing three documents written for three readers into one would cost more than it saves.
  - `[low]` `[reject]` **Verification-gap other** — row 19's restore issues one unbatched `.in("id", …)` over ~26 rows — Rejected: the map records `URI too long` at ~250 ids, two orders of magnitude away.
  - `[maybe-false]` `[reject]` **Blind 12** — a hand-built `browser.newContext` does not inherit `use.baseURL`, so row 10's relative PATCH depended on an unstated assumption — Could not settle from the diff alone, but the row passes with a `200` and five per-item results, which is only reachable with a resolved absolute URL. Playwright applies `contextOptions` to `browser.newContext()` calls made inside a test; left as is.
  - `[maybe-false]` `[reject]` **Blind 13 / Edge 27** — nothing declares serial execution, so row 19's scope mutation could be observed by another worker — Refuted by `playwright.config.ts`: `fullyParallel: false` and `workers: 1` are set in the committed config, so single-worker execution is enforced, not accidental.
  - `[maybe-false]` `[reject]` **Edge 24** — the suite "declares 72 tests" against a recorded 75 — Refuted by the run itself: `Running 77 tests` is emitted by Playwright and counts the three setup projects plus the specs.
  - `[maybe-false]` `[reject]` **Verification-gap other** — the cited line ranges for `renderCellNode` and `_getDefaultColumnDef` "could not be reconciled" — The reviewer's own check confirmed the substantive claim against `use-grid-keyboard.ts:82-84` and `grid-row.tsx:160-170`; only the vendored line number differs by one build, which the map now cites as a path plus the function name.
  - `[maybe-false]` `[reject]` **Intent 4** — rows 13–15 were said to need "no fixture dependency", so the "confirm the harness end-to-end" step ran on the wrong surface — Same root cause as the `low` entry above; the claim is now precise about what the rows do and do not need.
  - `[maybe-false]` `[reject]` **Intent 8** — row 4's target was chosen by a weaker rule than every other row's — Folded into the `low` `Edge 5` patch.
  - `[maybe-false]` `[reject]` **Blind 17** — nothing inside story 2 points at the two failing rows, since the matrix table must not change — The pointer exists in story 2's `## Verification` and, since the `medium` `Intent 5` patch, in its Auto Run Result too. The table itself stays untouched, which is the constraint that mattered.
  - `[false]` `[reject]` **Blind 12** — the relative-URL claim, as stated — Refuted by the passing run.
  - `[false]` `[reject]` **Blind 13** — the serial-execution claim, as stated — Refuted by `workers: 1` in the committed config.
  - `[false]` `[reject]` **Edge 24** — the test-count claim, as stated — Refuted by Playwright's own `Running 77 tests` line.
  - `[false]` `[reject]` **Verification-gap other** — the `table.js` line citation — The substance confirmed; only a vendored line number drifted.


## Design Notes

**No I/O & Edge-Case Matrix in this intent contract, deliberately.** This story's
subject matter *is* a matrix — story 2's, 19 rows, audited here rather than authored
here. Authoring a second matrix would mean either duplicating story 2's rows under a
different name or inventing rows about writing tests, and either would be a document
that has to be satisfied for its own sake. The audit that governs this story is the
one it runs against story 2, and its result is the verdict table in the coverage map.

**The rows are not all coverable *today*, and that is the finding.** Seventeen pass.
Two fail, and they fail for one reason, in one line, that the map now names with a
file and a line number. The tempting move was to fix that line: it is a one-line
change and it would make the tally 19/19. It was not made, because this story's
instruction is explicit that it does not re-implement story 2, and because a fix
applied from the auditing story is a fix nobody reviews against the story that owns
the behaviour. The alternative — mark the rows Covered anyway — is the exact failure
this spec exists to end. They stay Manual, with the defect written down.

**`test.fail`, not `test.fixme`, for the two failing rows.** `test.fixme` would not
run the bodies, and the rule says a spec that did not run covers nothing — so the
rows would be Manual for a *second* reason and the assertions would rot. `test.fail`
runs them, counts the failure as a pass, and reports "unexpectedly passed" the day
the defect is fixed. That turns the two Manual verdicts into a tripwire: the suite
goes red exactly when the map is out of date.

**Row 11 needed a mapping, and the mapping is in the open.** The matrix asks for
"`fetch` rejects for one item only"; the shipped batch is one HTTP request, so there
is no per-item request to fail. The spec asserts the reachable form — an item whose
outcome the server never reports, with the *other* items genuinely committed because
`route.fetch()` ran the real handler — plus the whole-request abort. The verdict is
Covered, and the divergence between the matrix's wording and what was asserted is
stated in the map rather than smoothed over.

**Holding the response open is what makes rows 1 and 4 meaningful.** Without it, an
edit round-trips in a few milliseconds locally and a spec cannot tell an optimistic
display from a fast one. `page.route` + a deferred `route.continue()` gives a window
in which the only possible source of the cell's text is the client's own state. That
is the whole difference between a test and a smoke check, and it is the same technique
that makes row 4's "optimistic empty display" observable.

**A stale-scope hazard came out of this and is now a stated rule.** The bulk
generator diffs its expected names against the tagged rows, so a spec that commits a
rename and leaves it breaks the *next* run in `globalSetup` with a unique-violation on
`contacts.phone` — an error that names the generator, not the spec. Rows 1, 2 and 18
all rename a fixture; all three restore it in a `finally`.

## Verification

**Commands:**

- `pnpm test:e2e` -- expected: exit 0, `77 passed`, with rows 1 and 4 printed as `✘`
  and counted as passing because they are `test.fail`.
- `pnpm test:e2e` (immediately again) -- expected: exit 0, `77 passed`, no manual reset
  in between. A suite that only passes on a warm database is not a gate.
- `pnpm typecheck` -- expected: SUCCESS, no output.
- `pnpm lint` -- expected: the same pre-existing `24 problems (12 errors, 12 warnings)`,
  none in `e2e/`.
- `git diff --stat 0e82a774 -- _bmad-output/specs/spec-manage-dashboard-grid/stories/` --
  expected: changes only inside story 2's `## Verification`; the 19-row matrix table
  byte-identical.

**Manual checks:**

- Open `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md` and
  confirm every row in the verdict table names a spec file that exists, and that the
  two Manual rows name a failure a reader could reproduce by running that spec alone.

## Auto Run Result

Status: done

### The tally

**17 Covered, 2 Manual, out of 19.**

| | Rows |
|---|---|
| **Covered** | 2, 3†, 5†, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 |
| **Manual** | 1, 4 |

† Covered with a stated weakness: the destructive marker and status message are
asserted, but the "cell visibly reverts" clause would also hold if the override did
not exist. Recorded in the map, not smoothed over.

### `pnpm test:e2e`

```
$ pnpm test:e2e

Bulk contact fixtures for http://127.0.0.1:54321 (credentials from supabase status -o env).
Programs: folk — 250 row(s) each, 5 bulk location(s) each, chunk size 250.

[folk]
  bulk locations   5 (0 created this run)
  preacher scope   6 location id(s) (unchanged)
  tagged contacts  250 total, 0 inserted this run
  invariants       250 tagged rows, 250 distinct names, 6 resolvable location id(s), 249 phone(s) set, 1 empty, 225 in-scope, 25 out-of-scope

Total created: 0
Insert requests: 0 (chunk size 250, PostgREST)
Elapsed: 2950ms
DW-3 check passed: every public.users.id equals its auth.users.id; the Preacher and Admin rows are Active.

Running 77 tests using 1 worker

  ✓   1 [setup-admin] › e2e/auth/admin.setup.ts:17:6 › authenticate as admin (3.0s)
  ✓   2 [setup-preacher] › e2e/auth/preacher.setup.ts:17:6 › authenticate as preacher (3.0s)
  ✓   3 [setup-volunteer] › e2e/auth/volunteer.setup.ts:17:6 › authenticate as volunteer (3.4s)
  ✓   4–46 [smoke] › e2e/specs/bulk-fixtures.spec.ts, harness-guards.spec.ts, mailpit-reader.spec.ts  (the foundation's own 43 rows, unchanged by this story)
  ✓  47 [smoke] › e2e/specs/manage-contacts-api.spec.ts › row 13 — a body over the 200-item cap is 400, names the cap, and writes nothing
  ✓  48 [smoke] › e2e/specs/manage-contacts-api.spec.ts › row 14 — one non-UUID contactId fails alone and every other item commits
  ✓  49 [smoke] › e2e/specs/manage-contacts-api.spec.ts › row 15 — an item omitting contactId fails with the UUID message and the rest commit
  ✓  50 [smoke] › e2e/specs/manage-contacts-bulk.spec.ts › row 9 — five selected rows each report their own success and the rows update
  ✓  51 [smoke] › e2e/specs/manage-contacts-bulk.spec.ts › row 10 — a partial batch reports each failure with its own reason
  ✓  52 [smoke] › e2e/specs/manage-contacts-bulk.spec.ts › row 11 — one row's missing outcome is reported alone; the rest really commit
  ✓  53 [smoke] › e2e/specs/manage-contacts-bulk.spec.ts › row 11 (dropped request) — no row is claimed saved when the batch never lands
  ✓  54 [smoke] › e2e/specs/manage-contacts-bulk.spec.ts › row 16 — a 200 without results is reported as a bulk failure and claims no success
  ✘  55 [smoke] › e2e/specs/manage-contacts-edit.spec.ts › row 1 — a committed edit shows the new value before the response lands
  ✓  56 [smoke] › e2e/specs/manage-contacts-edit.spec.ts › row 1 (remaining clauses) — one Enter is one PATCH carrying the new value, and it commits
  ✓  57 [smoke] › e2e/specs/manage-contacts-edit.spec.ts › row 2 — a committed edit is the server's value after a reload
  ✓  58 [smoke] › e2e/specs/manage-contacts-edit.spec.ts › row 3 — a 400 reverts the cell visibly, marks it destructive and shows the server message
  ✘  59 [smoke] › e2e/specs/manage-contacts-edit.spec.ts › row 4 — clearing a required field shows the empty value before the response lands
  ✓  60 [smoke] › e2e/specs/manage-contacts-edit.spec.ts › row 4 (remaining clauses) — the real handler answers 400 and the cell reverts with its message
  ✓  61 [smoke] › e2e/specs/manage-contacts-edit.spec.ts › row 5 — a dropped PATCH reverts the cell with the reachability message
  ✓  62 [smoke] › e2e/specs/manage-contacts-filter.spec.ts › row 17 — the location column filter narrows on the joined name and combines with the global filter
  ✓  63 [smoke] › e2e/specs/manage-contacts-filter.spec.ts › row 17 (error handling) — a stale column filter id renders instead of throwing
  ✓  64 [smoke] › e2e/specs/manage-contacts-filter.spec.ts › row 18 — sorting by name uses the committed value, not the pre-edit value
  ✓  65 [smoke] › e2e/specs/manage-contacts-filter.spec.ts › row 19 — an empty scope renders the No records panel and no usable header checkbox
  ✓  66 [smoke] › e2e/specs/manage-contacts-filter.spec.ts › row 19 (neighbouring panel) — a filter that matches nothing is a different panel
  ✓  67 [smoke] › e2e/specs/manage-contacts-selection.spec.ts › row 6 — the header checkbox selects every row of a filtered set
  ✓  68 [smoke] › e2e/specs/manage-contacts-selection.spec.ts › row 7 — a partial selection renders the header mixed and names the count
  ✓  69 [smoke] › e2e/specs/manage-contacts-selection.spec.ts › row 8 — selection survives filtering, and the count is of selected rows
  ✓  70 [smoke] › e2e/specs/manage-contacts-selection.spec.ts › row 12 — the bulk action is inert with nothing selected and issues no request
  ✓  71–77 [smoke] › e2e/specs/smoke.spec.ts  (the foundation's own 7 rows, unchanged by this story)

  77 passed (4.8m)
```

Exit 0. Run three times consecutively with no manual reset in between; every run
reported `77 passed` and exit 0. The listing above is the row specs' output with the
foundation's own rows elided; the untruncated transcript is not committed because it
carries timings that differ per machine, and the numbers that matter — the count,
the exit code and the two `✘` titles — are all above.

### What changed

| File | Change |
|---|---|
| `e2e/fixtures/manage-grid.ts` (new) | The grid's DOM contract as locators, the in-scope count reader, the fixture column readers, and the restore helpers. Also `filterGlobally`, which types rather than fills and asserts the URL before returning a count. |
| `e2e/specs/manage-contacts-api.spec.ts` (new) | Rows 13, 14, 15 — the cap, a non-UUID `contactId`, a missing `contactId` — over real HTTP with the Admin's cookies. |
| `e2e/specs/manage-contacts-edit.spec.ts` (new) | Rows 1–5. Rows 1 and 4 are split: a `test.fail` optimistic-display assertion plus an ordinary test for the remaining clauses. |
| `e2e/specs/manage-contacts-selection.spec.ts` (new) | Rows 6, 7, 8, 12. |
| `e2e/specs/manage-contacts-bulk.spec.ts` (new) | Rows 9, 10, 11, 16, including the dropped-request companion. |
| `e2e/specs/manage-contacts-filter.spec.ts` (new) | Rows 17, 18, 19, plus the stale-column-id and neighbouring-panel companions. |
| `matrix-coverage-map.md` | Verdicts, the recorded run, the defect diagnosis, row 11's mapping, the fixture-naming constraint the row specs inherited, and the rule for claiming a row. |
| story 2's spec | `## Verification` only: `pnpm test:e2e` joins the commands, the automated matrix table is added, the manual list keeps only the visual and multi-app checks. A dated "Superseded in part" table was appended to its Auto Run Result because the amended Verification contradicted it. **The `## I/O & Edge-Case Matrix` table is byte-unchanged** — verified by diffing for its row text: zero hits. |
| `CONTRIBUTING.md` | Why a green run prints two `✘` marks, a spec-coverage table, and the fixture-restore rule. |

Nothing under `components/`, `lib/`, `apps/` or `scripts/` was touched. Story 2's
table, grid and handler are exactly as `85e3923` left them.

### The two rows that stayed Manual, and who owns them

Rows 1 and 4 need an optimistic display and do not get one.
`renderCellNode` (`components/grid/use-grid-keyboard.ts:82-84`) returns
`flexRender(cell.column.columnDef.cell, cell.getContext()) ?? undefined`, and
`table._getDefaultColumnDef()` supplies a `cell` renderer for every column, so the
`?? undefined` never fires, `GridCellView.render` is always defined, and
`GridRow`'s `cell.render !== undefined ? cell.render : cell.text` always takes the
first branch — bypassing `cell.text`, which carries the override.

**This belongs to story 2, not to this story.** The fix is to render `cell.render`
only when the consumer supplied a `cell` renderer. Story 2 keeps `status: blocked`
and `Blocking condition: matrix test audit failed` for that reason, deliberately: the
block is now two rows wide instead of nineteen, and it is story 2's decision whether
to take the fix.

### Review outcome

59 findings from four layers; 47 rows after grouping by shared root cause; every
finding is named above. 4 `high`, 10 `medium`, 22 `low`, 7 `maybe-false`, 4 `false`,
and 12 rejected on their merits.

**20 entries patched**, all with the smallest change that does the job. Three were
not cosmetic, and two of those changed what the suite proves:

1. **`test.fail` was hiding half of rows 1 and 4.** A `test.fail` body aborts at its
   first failed assertion and inverts its verdict for everything after it, so
   row 1's "exactly one PATCH" and row 4's "server 400 → revert" clauses never
   executed and could not have failed the suite. Both rows are now split. Before this,
   a duplicate PATCH on commit — a plausible optimistic-write-plus-retry refactor —
   would have shipped green, and a server that stopped rejecting an empty `phone`
   would have shipped green.
2. **`fill()` never reached React, so the filters were never really tested.** Row 17
   asserted a count derived from the location filter alone and passed — because the
   *global* filter had silently not applied. Playwright's `fill` assigns
   `input.value`, which updates React's value tracker, so `onChange` can be
   suppressed while the input still reads as filled. `filterGlobally` now types and
   asserts `q` in the URL; row 17's expected count is the intersection of both
   filters. Before this, a spec appeared to prove the two filters combine and proved
   only that one does.
3. **A leaked fixture write was masking a wrong assertion.** Row 9's API half patched
   five shared fixtures after its restore. The leak had set index 0000 — which the
   generator seeds as a favourite — to non-favourite, and row 16's absolute
   `aria-pressed="false"` was passing *because of the leak*. Fixing the leak turned
   that assertion red immediately, which is how the absolute-vs-relative problem
   surfaced at all.

Rejected with reasons in the log: 5 `low` and 7 `maybe-false`, including the CI gap
(the intent forbids CI wiring), the three-copies-of-the-rules complaint, and the
unbatched restore that the map itself records as failing at ten times the volume.

### Verification

| Check | Result |
|---|---|
| `pnpm test:e2e` × 3, no reset | exit 0, `77 passed`, each time |
| `pnpm typecheck` | SUCCESS, no output |
| `pnpm lint` | the same `24 problems (12 errors, 12 warnings)` as `0e82a774`, none in `e2e/` |
| `tsc --noEmit` over `e2e/` + `playwright.config.ts` | 0 errors |
| `pnpm guardrails` | `Monorepo guardrails passed.` |
| story 2's 19-row matrix table | zero diff hits against its row text |
| Review sub-agents | 4 launched together, 59 findings, 47 triage rows |

### Residual risks

- **Rows 1 and 4 stay Manual until `renderCellNode` is fixed.** The tripwire is
  armed: fix the line and those two tests report "unexpectedly passed", the suite
  goes red, and the map's two verdicts must change in the same commit.
- **`route.fetch()` is used once.** Row 11 depends on it forwarding the real request
  and only the response being rewritten. If Playwright changed that contract, row
  11's "the others really commit" claim would weaken silently — its DB assertion is
  what would catch it.
- **Row 11's wording differs from the matrix's.** Recorded in the map rather than
  smoothed over. A stricter reading of the row would put it back on Manual.
- **Nothing runs this suite automatically.** `.github/workflows/quality-gates.yml`
  runs four steps and none of them starts a browser, so the 17 Covered verdicts only
  re-derive when someone runs `pnpm test:e2e`. Wiring it is a deliberate follow-up
  (the spec's story 5), not this story.
- **`test.fail` depends on the defect persisting.** If the defect is fixed and the
  tripwire is silenced rather than answered, the two rows would look Covered with
  nothing behind them.
