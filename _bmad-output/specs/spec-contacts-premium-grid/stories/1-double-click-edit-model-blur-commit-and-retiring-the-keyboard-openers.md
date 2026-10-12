---
title: 'Double-click edit model, blur-commit, and retiring the keyboard openers'
type: 'feature'
created: '2026-10-12'
status: 'in-progress'
baseline_revision: '6773fe7b7e3b60423556b33ca76426a5af3da9e3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/architecture/testing.md'
  - '{project-root}/docs/manage-grid-pattern.md'
warnings:
  - oversized
  - split-gate
---

<intent-contract>

## Intent

**Problem:** The grid opens a cell editor from **five** different gestures (`e`, `Enter` on a focused cell, a printable character, `Space`-seeding, and a single click on a display widget) and there is **no blur handler anywhere** (`grep -n onBlur components/grid/grid-editors.tsx` → zero). An operator therefore has no single, learnable way to edit, and the popover editors discard on close — the opposite of what a correction needs. `existing-state.md` calls `openEditor` "the one opener" and lists three; it missed the single-click `ctx.open` and `Enter`-when-not-editing, and both are openers under CAP-10's "no other gesture opens it".

**Approach:** Make double-click the sole opener, add one blur-commit mechanism that runs through the existing `commitEditing` → `commitCellInput` → `runCommit` path, and gate it on a *touched* flag so an untouched draft issues no request. Then retire the four other openers and rewrite every comment that becomes a lie.

## Boundaries & Constraints

**Always:**
- **One commit path.** `use-grid-keyboard.ts` owns draft, optimistic display and revert. `grid-editors.tsx` supplies parsing and validation only. A second mutation channel is a defect.
- **Validation runs before the save**; a rejected draft shows the message through `revertCommit` and reverts the cell. A server-rejected write shows the server's own message (`readFailureMessage`) and reverts. No new error UI.
- **Untouched ≠ equal.** `openEditor` seeds the draft from the cell's current value, so blur with zero keystrokes must issue **zero** PATCHes. Track *touched*, never compare strings.
- **Keep, untouched:** arrows, `Tab`/`Shift+Tab`, `Home`/`End`, `Cmd+Home`/`End`, `Escape`, `Space`-on-checkbox, `Delete`/`Backspace`, copy/paste, range selection. Upstream story 2's *navigation* work is intact; only its *opening* work is retired.
- **`components/grid/` stays primitive** — zero contacts vocabulary, zero raw colour. Token-clean.
- **`preventDefault` on the cell's double-click** (OQ-7), so the browser does not select a word inside an editable cell.

**Never:**
- Do **not** delete `PopoverEditor`'s `onPointerDown` `stopPropagation` (`:195-199`). Without it the cell loses the pointer and a double-click cannot reach the trigger. Only its stated reason changes.
- Do **not** add a second mutation channel, a dirty-flag prompt, or a confirmation dialog. Because blur commits, an edit cannot be abandoned by clicking away.
- Do **not** "helpfully" restore `e`, type-to-edit or `Space`-seeding later. SPEC.md Non-goals calls that out by name.
- Do **not** open an editor from `Space` on a non-checkbox cell, and do **not** strip the checkbox toggle while removing the seeding half.
- Do **not** let blur-commit steal focus back to the edited cell.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Open | `dblclick` on an editable cell, no editor open | editor opens; draft seeded from the cell value via `draftSeed` | read-only column → `openEditor` returns `false`, nothing opens |
| Open again | `dblclick` on the open cell's inline editor | draft commits through `commitEditing`; `preventDefault` stops word selection | — |
| Blur, touched | draft changed by ≥1 keystroke, focus moves away | exactly **one** write through the single commit path | parse throws → `revertCommit`, destructive cell, message in `statusMessage` |
| Blur, untouched | draft seeded, zero keystrokes, focus moves away | **zero** requests; editor closes; cell unchanged | — |
| Popover close | `select`/`multiselect`/`date`/`longtext`/`user` popover dismissed by an outside click | **commit**, not discard | — |
| Popover close by `Escape` | `Escape` inside the popover | **discard** — must not commit | — |
| `Space` on checkbox | focused checkbox cell | toggles through `runCommit`; no editor opens | — |
| `Space` elsewhere | focused non-checkbox cell | nothing opens; page does not scroll | — |
| `Tab` out of editor | draft open | commits once, then focus advances (one commit, not two) | — |
| Checkbox `dblclick` | checkbox cell | two clicks toggle twice → net unchanged; no editor opens | — |
| Server 400 / abort | PATCH rejected or dropped | server's own message, cell reverts, focus **not** restored | — |

</intent-contract>

## Code Map

**Edit path — `components/grid/use-grid-keyboard.ts` (1846 lines)**
- `openEditor` `:841-882` — the only opener. Guard `:853` (`editable !== true` → `return false`) is the read-only contract. Checkbox short-circuit `:866-873` (`commitsOnInteraction`). Seeds draft `:878`. **`seed?` loses every caller in Phase B.** Doc comment `:832-840` names `e` — rewrite.
- `openEditor` callers: `beginEditing` `:903`/`:912` (from `e` `:1451` **and** `Enter` `:1460`), `ctx.open` `:980` (from `OpenableDisplay.onClick`), `Space` seeding `:1495`, printable char `:1525`.
- `exitEditing` `:707-710` — clears `editing` + `draft`. The single place a `touched` flag must reset.
- `commitEditing` `:1036-1051` — draft → `commitCellInput`. **No unchanged-value short-circuit exists today.**
- `commitCellInput` `:1014-1034` → `buildEditorContext(...).commitDraft` `:956-974` → `definition.parse` (validation) → `runCommit`. A `parse` throw ends at `revertCommit` `:723-753`.
- `runCommit` `:761-811` — the one write path. **Sets `restoreFocusRef.current = key` at `:773`**; on a blur-commit this would yank focus back to the cell the operator just left. The `Tab` branch already suppresses it at `:1343` — the blur path must do the same.
- `restoreFocusRef` `:255`, consumed by the effect `:1550-1561`.
- `handleDraftKeyDown` `:1310-1351` — `Enter` `:1312`, `Escape` `:1319`, `Tab` `:1332-1348` (commit → clear restore ref → `moveTab`). Reached via `draftKeyDownRef` `:721`/`:1358`.
- `handleContainerKeyDown` `:1362-1548` — arrows `:1400`, `Tab` `:1410`, `Home` `:1422`, `End` `:1428`, `j` `:1434`, `k` `:1440`, **`e` `:1446-1454`**, **`Enter` `:1456-1466`**, `Escape` `:1468`/`:1478`, **`Space` `:1487-1499`** (checkbox toggle `:1490` survives; seeding `:1494-1496` dies), `Delete`/`Backspace` `:1501`, **printable `:1514-1527`**. `isGuardedTarget` `:68-78`.
- `buildEditorContext` `:929-1004` — `ctx.close = cancelEditing` `:983`, `ctx.open` `:976-982` (loses its caller in Phase B).
- `getCellView` `:1769-1827` — builds `GridCellView`; `onDraftChange`/`onDraftKeyDown` `:1810-1811`. Where an `onDraftBlur` field is added.
- `focusCell` `:1736-1757` — plain pointer click sets focus + re-anchors the range. Wired at `grid.tsx:993`. **A single click must keep doing this and nothing more.**
- `focusRowCell` `:1691-1734` — used after Add; keeps `firstEditableColumnId` `:820-830` alive even after `beginEditing` dies.
- `statusMessage` `:244`, rendered `grid.tsx:871-880` as a never-unmounted `role="status"`.

**Cell rendering — `components/grid/grid-row.tsx` (236 lines)**
- `<td>` `:193-231` — `onPointerDown` `:203` → `onCellPointerDown`. **Where `onDoubleClick` + `preventDefault` go.**
- `GridCellEditor` `:42-71` — the plain-column in-cell input. Doc `:37` says "`e` then typing" — rewrite. **Where `onBlur` goes.**
- `GridCellContents` `:94-116` — editor columns render through `renderEditor`/`renderDisplay`.

**Editors — `components/grid/grid-editors.tsx` (1110 lines)**
- `PopoverEditor` `:175-217`. **`onOpenChange` `:181-189` calls `ctx.close()` and is annotated "Closing is a discard. AC4 is explicit that clicking away mid-edit writes nothing" — this is the single most important edit in the story.** `select`, `multiselect`, `date`, `longtext` and `user` all render through it (`:410, :676, :757, :851, :1032`), so a wrong answer silently discards a picked dropdown option.
- `PopoverEditor` trigger `:195-199` — `stopPropagation`. **KEEP. Rewrite the reason.**
- `OpenableDisplay` `:229-255` — `onClick → ctx.open()` `:247-249`. Its comment `:225-226` ("`e` opens its editor") **and** `:244-246` ("what leaves `e` and `Space` addressing this column") both become lies. The `onClick` itself dies in Phase B — a single click must not open.
- `InlineField` `:114-162` — the in-cell single-line control (`text`, `number`, `currency`, `url`, `email`). Focus+select on mount `:130-135`. **Where `onBlur` goes.**
- `OptionSearch` `:284-318` and the date input `:869-877` route `Escape` through `handleCommitKeys` `:83-103` with `preventDefault` + `stopPropagation`, so Radix never sees it. The multiselect option list and the calendar have **no** `Escape` handler — a bare `Escape` there reaches Radix and closes the popover, which is why the commit path needs an explicit discard flag rather than trusting propagation.
- `checkboxEditor` `:599-619` — `commitsOnInteraction: true` `:605`.
- Registry `:1074-1086` — 11 keys (`text`, `longtext`, `number`, `currency`, `checkbox`, `select`, `multiselect`, `date`, `url`, `email`, `user`).

**Types — `components/grid/grid-types.ts`**
- `GridCellCommit.value` `:159-160` documents *"Unchanged text still commits."* Correct for inline `Enter`, **wrong for blur**. Amend to scope the guarantee to `Enter` and point at the blur rule.
- `GridCellView` `:263-301` — `onDraftChange` `:299`, `onDraftKeyDown` `:300`. Add `onDraftBlur` beside them.

**Grid shell — `components/grid/grid.tsx`**
- `onCellPointerDown={keyboard.focusCell}` `:993` — the wiring point for `onCellDoubleClick`.
- Status line `:871-880` — the pattern the edit hint line mirrors (`sr-only` when idle).

**Consumers**
- `components/manage/manage-contacts-table.tsx:786-1019` — 15 columns. `select` `:796-800`, `favorite` `:951-955` and `actions` `:990-994` keep their own `stopPropagation`, so a double-click never reaches those controls. **Two of those comments name `e` as the reason** (`:329-330` header checkbox, `:797-798` row checkbox: *"the next `e` becomes a no-op"*) and must be rewritten to the surviving reason — the pointer still must not move cell focus onto a non-editable column.
- `components/grid/grid-preview.tsx:110-170` — `currency`, `number`, `url`, `email`, `user`, `checkbox` on `/dev/grid-preview`.

**Specs — verified opener inventory (the brief's "95" undercounts; these are the measured numbers)**
- `e2e/specs/grid-editors.spec.ts` — **30** opener gestures, 37 tests. 15 `press("e")` on `/manage` (`:250, :281, :306, :341, :371, :403, :437, :464, :493, :543, :596, :629, :658, :684, :1112, :1142`) and 14 on `/dev/grid-preview` (`:774, :793, :813, :839, :855, :875, :905, :926, :948, :975, :991, :1011, :1040, :1082`); three of the preview sites inline a `{x:2,y:2}` padding click because the cell centre is a link (`:902, :922, :945`). `:1129` is **"AC4 — clicking away mid-edit writes nothing"** and is reversed by this story. `:1164` "AC4 — `checkbox` is the only editor that commits on interaction" survives.
- `e2e/specs/manage-contacts-edit.spec.ts` — **7** `press("e")` (`:253, :302, :342, :386, :420, :460, :491`), 7 tests, all of them. These are matrix rows 1–5.
- `e2e/specs/grid-keyboard.spec.ts` — 5 affected of 8: `:154` key 4 (type-to-edit), `:180` key 5 (`Space`-seed), `:268` key 8 (uses `e`), plus the `Space`-toggle test at `:194` which must be **kept** and re-asserted. Keys 1, 2, 3, 7 untouched.
- `e2e/specs/manage-contacts-row-lifecycle.spec.ts` — **7** type-to-edit sites via `typeIntoCell` `:137` (`:308, :392, :416, :460, :465, :615, :624`) across 4 tests.
- `e2e/specs/manage-contacts-filter.spec.ts` — **1** `press("e")` `:166` (matrix row 18).
- `e2e/specs/grid-clipboard.spec.ts` and `grid-cell-range.spec.ts` — **0 openers**, audited: both navigate and select, which survives. Untouched. (Clipboard paste goes through `commitCellInput` at `use-grid-keyboard.ts:1257` and never opens an editor, because `handleContainerPaste` `:1292-1304` returns early while `editing` — so CAP-10 does not reach them.)
- `e2e/specs/grid-editors.spec.ts:192-197` — a spec-local `focusContactsCell` helper whose doc block `:186-191` exists for one reason: a click-to-open display (`select`, `multiselect`, `date`, `user`) opens its popover on the very click that focuses the cell, so the helper presses `Escape` to close it again and make the `e` a test presses next "the opener under test rather than an accident of the click". Once the click no longer opens, that `Escape` and that whole doc block go.
- `docs/manage-grid-pattern.md:126` — *"the cell is already the focusable, keyboard-reachable thing, and `e` opens its editor."* A fourth stale comment; rewrite in the same commit. `:141` carries a fifth (*"the next `e` becomes a no-op because the column is not editable"*).
- `components/grid/grid-editor-types.ts:97` — `GridEditorContext.open`'s own doc says *"Open this cell's editor, the way `e` does. Used by a click-to-open display."* The field dies with its only caller.
- `e2e/fixtures/manage-grid.ts:73` — *"which is what `j`/`k`/`e` listen on"*. Rewrite.
- `e2e/specs/manage-contacts-edit.spec.ts:124-125` — *"Pointer focus is what tells the grid which column `e` applies to; without it `e` opens the row's first editable cell."* Rewrite with the helper.
- `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md` — rows 1–5 resolve to `manage-contacts-edit.spec.ts` and row 18 to `manage-contacts-filter.spec.ts`; re-verify their evidence transcripts. No `test.fail` markers exist in any affected file, and `grid-editors.spec.ts`/`grid-keyboard.spec.ts` sit outside the 19-row map entirely.

## Tasks & Acceptance

### Phase A — the blur-commit mechanism (build and verify this first)

- `components/grid/use-grid-keyboard.ts` — add a `touchedRef` reset in `openEditor` `:875-878` and set only from the editor-facing `setDraft` (so seeding never marks touched); add a `discardRequestedRef` set by `cancelEditing` `:884-891`; add `commitEditing` guards so an already-committed or discard-requested editor no-ops; add `onCellDoubleClick(rowId, columnId)` that commits when that cell is open and calls `openEditor` otherwise; expose `onDraftBlur` on the cell view; suppress `restoreFocusRef` on the blur path exactly as `:1343` does for `Tab`.
- `components/grid/grid-row.tsx` — add `onDoubleClick` with `preventDefault` on the `<td>` `:193`, wire `onDraftBlur` into `GridCellEditor` `:60-69`, add `onCellDoubleClick` to `GridRowProps`.
- `components/grid/grid-editors.tsx` — invert `PopoverEditor.onOpenChange` `:181-189` to **commit** unless a discard is requested; add `onBlur` to `InlineField` `:144-159`; rewrite `:185-186`, `:196-198` and `:225-226`/`:244-246`.
- `components/grid/grid.tsx` — wire `onCellDoubleClick` beside `:993`; render the Panel 5 hint line, exactly `Enter saves · Escape discards · clicking away also saves`, only while a cell is editing, mirroring the status line's `sr-only`-when-idle pattern so it shifts nothing at rest.
- `components/grid/grid-types.ts` — add `onDraftBlur` to `GridCellView`; amend the `GridCellCommit.value` comment to scope "unchanged still commits" to `Enter` and to name the blur rule.

**Gate:** run `pnpm test:e2e` and confirm the matrix rows that do not depend on an opener are still green, **with the old openers still in place as the baseline**. If context is running short, HALT here and resume as a `1b` story — **never** deliver Phase B first, because the mechanism's new tests need the old openers to exist as the control.

### Phase B — the retirement

- `components/grid/use-grid-keyboard.ts` — delete the `e` branch `:1446-1454`, the printable-character branch `:1511-1527`, and the `Space`-seeding half `:1494-1496` while keeping `preventDefault` `:1488` and the checkbox toggle `:1490-1492`; delete the `Enter`-opens path `:1459-1463` and `beginEditing` `:893-914` with it (CAP-10: "no other gesture opens it"); drop `openEditor`'s `seed?` parameter `:842`/`:878`; delete `ctx.open` `:976-982` and its field in `grid-editor-types.ts`.
- `components/grid/grid-editors.tsx` — delete `OpenableDisplay.onClick` `:247-249`.
- `components/grid/grid-row.tsx`, `use-grid-keyboard.ts`, `components/manage/manage-contacts-table.tsx:329-330` and `:797-798`, `docs/manage-grid-pattern.md:126` and `:141`, `e2e/fixtures/manage-grid.ts:73`, `e2e/specs/manage-contacts-edit.spec.ts:124-125` — rewrite every remaining comment naming `e`, type-to-edit or `Space`-seeding as an opener. The `stopPropagation` handlers themselves stay.
- `e2e/specs/*.spec.ts` — convert the **50** opener gestures inventoried above to `dblclick` on the cell then `keyboard.type`. Convert, never delete. For `grid-editors.spec.ts:1129` ("AC4 — clicking away mid-edit writes nothing") replace it with its inverse and name AC4's retirement in the test's own doc block. Delete the now-pointless post-click `Escape` in `grid-editors.spec.ts:192-197` and rewrite that doc block. Keep `grid-keyboard.spec.ts:194` (Space toggles a checkbox) and the `grid-editors.spec.ts:1164` `commitsOnInteraction` assertion.
- **Every retired assertion records why the behaviour was removed**, in a comment on the test. A green suite that silently no longer tests the keyboard model is a false claim about coverage and the next agent will trust it. This is one of the two deliberate assertion exceptions SPEC.md names; the reason travels with the change.
- `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md` — re-verify rows 1–5 and 18 against the converted specs.

**Acceptance Criteria:**
- Given an editable cell and no editor open, when the operator double-clicks it, then the editor opens on **every** editor type reachable in `/manage` and `/dev/grid-preview` (a superset of the epics' "seven"), and the double-click calls `preventDefault` so no word is selected inside an editable cell.
- Given an editor open on a cell, when the operator single-clicks another cell, then no editor opened on the single click and the clicked cell becomes the active cell.
- Given an open editor whose draft has been typed into, when the operator double-clicks the cell again, presses `Enter`, or moves focus away, then the draft commits **once** through the existing single commit path, focus is not yanked back to the edited cell, and save progress and errors reuse the existing `statusMessage` channel.
- Given a popover editor (`select`, `multiselect`, `date`, `longtext`, `user`) open with a typed draft, when the operator clicks outside it, then the draft **commits** — and clicking an option in a dropdown applies that option rather than discarding it.
- Given a popover editor open, when the operator presses `Escape`, then the draft is discarded, for every editor including `multiselect` and the calendar where no local `Escape` handler exists.
- Given an open editor whose draft has **not** been typed into, when the operator clicks away, then **zero** PATCH requests are issued and the grid is unchanged.
- Given a draft that fails validation, when the operator commits it by any of the three routes, then validation runs before the save, the draft is not sent, the typed editor supplies parsing and validation only, and the commit path still owns the draft, the optimistic display and the revert.
- Given a write the server rejects, when the response arrives, then the server's own message is shown and the cell reverts to its committed value, with no second mutation channel introduced.
- Given the grid with no editor open, when the operator presses `e`, a printable character, `Space` on a non-checkbox cell, or `Enter`, then no editor opens and none of those branches exist in `use-grid-keyboard.ts`.
- Given the grid with no editor open, when the operator uses arrows, `Tab`/`Shift+Tab`, `Home`/`End`, `Cmd+Home`/`End`, `Space` on a checkbox, or `Delete`/`Backspace`, then each behaves exactly as it does today, and `Space` still toggles a checkbox.
- Given a read-only column, when the operator double-clicks a cell in it, then no editor opens (`openEditor` returns `false`), and given a checkbox cell, when the operator double-clicks it, then no editor opens and the value nets unchanged.
- Given the three source comments this story reverses, when the change lands, then `grid-editors.tsx:181-189`, `:195-199` and `:225-227` are rewritten in the same commit and the `stopPropagation` on `PopoverEditor`'s trigger is **kept** with only its stated reason changed.
- Given the e2e specs that open editors with `press("e")` or a printable character, when the suite is updated, then all 50 inventoried opener gestures across five spec files use `dblclick` then `keyboard.type`, and each retired assertion records why the behaviour was removed.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the touched flag rather than a value comparison.** `GridCellCommit.value` documents "Unchanged text still commits", and the inline `Enter` path relies on it — an operator who retypes the same value has still expressed an intent, and `manage-contacts-row-lifecycle.spec.ts` depends on an unchanged-but-complete draft row committing on create. Blur is different: `openEditor` seeds the draft from the cell's current value, so a blur with no keystrokes would PATCH production data on every stray cell click. Comparing `draft === cellText` would also break the deliberate "clear a cell to empty by typing nothing" case on a select. A boolean set by the editor-facing `setDraft` only — never by `openEditor`'s own seeding — expresses exactly "the operator touched this".

**Why blur needs an explicit discard flag rather than relying on `stopPropagation`.** The in-cell `InlineField` blurs cleanly. The popover editors do not: `OptionSearch` and the date input intercept `Escape` with `preventDefault` + `stopPropagation`, so Radix never sees it, but the multiselect option list and the calendar have no `Escape` handler and a bare `Escape` there reaches Radix and closes the popover. Once `onOpenChange` means *commit*, that bare `Escape` would silently commit instead of discarding. `cancelEditing` therefore sets a flag that the close handler reads and clears, so `Escape` discards on every editor whether or not it was intercepted locally. This is a flag on the existing single path, not a second path.

**Why the blur path must clear `restoreFocusRef`.** `runCommit` `:773` sets it so that `Enter` and `Escape` hand focus back to the cell. On a blur-commit the operator has *deliberately* moved focus somewhere else, and the effect at `:1550-1561` would pull it straight back. The `Tab` branch already solved this at `:1343`; the blur branch does the same.

**The checkbox double-click is deliberately a no-op.** A double-click is two clicks, and `CheckboxControl.onCheckedChange` fires on each, so a checkbox cell toggles twice and nets unchanged. The cell's `onDoubleClick` must therefore skip any column whose editor sets `commitsOnInteraction`, or it would toggle a third time. Assert the net-unchanged behaviour rather than leaving it to a reader to infer.

**The hint line.** `Visual-Design/contacts-grid-states-v1.html` Panel 5 renders `Enter saves · Escape discards · clicking away also saves` beneath the grid. This is the only additive visual element in the story and it is token-clean; it follows `grid.tsx:871-880`'s `sr-only`-when-idle pattern so it shifts nothing at rest.

## Verification

**Commands:**
- `pnpm typecheck:workspace` -- expected: SUCCESS. `next.config.mjs` sets `ignoreBuildErrors`, so a green `pnpm build` is not a type gate.
- `pnpm lint` -- expected: SUCCESS.
- `pnpm guardrails` -- expected: SUCCESS. Required: `components/grid/*`, `grid-types.ts`, `grid-editor-types.ts`.
- `pnpm test:e2e` -- expected: SUCCESS, one full run, **one runner at a time** against the shared seeded database. ~5-7 minutes. Never `pnpm exec playwright test` -- the readiness gate lives in the script.
- `pnpm test:e2e --list grid-` -- expected: scope only, no browser. Cheapest way to see what is about to run.
- `pnpm test:e2e:determinism` -- expected: SUCCESS. Required after touching specs, fixtures or `playwright.config.ts`: two runs back to back with no reset.

**Report exactly what was run.** A green run prints no `✘` marks; a `✘` is either a `test.fail` tripwire whose defect got fixed (remove the marker and update `matrix-coverage-map.md` in the same commit) or a real failure. Name any failure you did not cause as pre-existing -- `pnpm test:airtable-removal` failing 3 of 30 checks on `dev`/`main` is known. Never report `pnpm test` as a passing run: it runs zero tests.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

Planning only — halted before implementation at the invocation's instruction. Verified working tree clean and branch `feat/grid-keyboard-editors-and-theme` at `6773fe7` before planning.
