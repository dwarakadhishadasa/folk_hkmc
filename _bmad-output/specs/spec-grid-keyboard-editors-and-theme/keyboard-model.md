# Keyboard model

Binding contract for CAP-1 through CAP-4. Extends `use-grid-keyboard.ts`; replaces nothing in it.

## The guard comes first

`use-grid-keyboard.ts:405` returns early when `isGuardedTarget(event.target)`. Container keys are inert while a draft, input, textarea or `[contenteditable]` has focus. **Every key added here sits behind that same guard**, for the same reason: a grid that eats `Delete` while a user is clearing a text field is a broken grid, and this is the single most common way a spreadsheet grid becomes unusable.

A second early return stands at `:400` — `metaKey || ctrlKey || altKey` bail out, so the browser's own shortcuts win. Clipboard is the deliberate exception and is handled *before* that return, because `Cmd+C` while the grid owns focus must copy the selection rather than the page.

## Key table

| Key | When | Action |
|---|---|---|
| `↑` `↓` `←` `→` | not editing | Move focus one cell. Commit any open draft first. |
| `Tab` / `Shift+Tab` | not editing | Move to next / previous cell in the same row; from the last cell, `Tab` wraps to the next row's first cell. |
| `Home` / `End` | not editing | First / last cell in the focused row. |
| `Cmd/Ctrl+Home` / `End` | not editing | First cell of the first row / last cell of the last row. |
| `Shift` + any arrow | not editing | Extend the range selection from the anchor instead of moving focus. |
| `Shift+click` | not editing | Extend the range from the anchor to the clicked cell. |
| `Enter` | not editing | Open the editor, seeded with the current display text. |
| `Enter` | editing | Commit. Unchanged behavior. |
| `Escape` | editing | Cancel. Unchanged. |
| `Escape` | not editing, range active | Collapse the range back to the anchor. |
| printable char | not editing, cell editable | Open the editor **seeded with that character**, replacing the value. |
| printable char | not editing, cell not editable | No-op. Never opens an editor on a read-only column. |
| `Delete` / `Backspace` | not editing | Clear the cell through `onCellCommit`. Skipped on the select column and any other column whose control owns its own activation. |
| `Space` | not editing, cell is a checkbox | Toggle it. On every other column, Space is a printable character and opens the editor seeded with `" "`. |
| `Cmd/Ctrl+C` | any | Copy the selection as TSV. Handled before the modifier bail-out. |
| `Cmd/Ctrl+V` | any | Paste the clipboard TSV into the selection. |
| `Cmd/Ctrl+A` | not editing | Select all cells. Optional; ship only if it does not fight the browser's page-select. |
| `j` / `k` / `e` | not editing | Unchanged. Keep them. |

## Why every opener needs `preventDefault`

`use-grid-keyboard.ts:423` records it: the editor mounts and takes focus during the same keydown, so without `preventDefault()` the browser's default insertion lands in the freshly focused input and the key that opened the editor also types itself. **`Enter`, `e`, and the printable-char branch all have this bug if the call is omitted.** `Tab` needs it too, for the opposite reason — without it focus leaves the grid into browser chrome instead of advancing a cell.

## Edit seeding

One helper, used by all three openers, so the rules cannot drift:

```
openEditor(coordinate, seed?: string)
```

- `Enter` → seed is the cell's current display text (edit in place)
- printable char → seed is that character (replace)
- `Space` on a non-checkbox → seed is `" "` (a space is a legitimate text edit)

`Space` is the one genuinely surprising case in the table, and it is listed because the alternative — making Space inert everywhere — is worse: an operator typing a space into a text cell would get nothing.

## Selection shape

Today: `focusedColumnId` is a single string plus a row index. Range selection adds:

```
anchor:   GridCellCoordinate
focus:    GridCellCoordinate      // moves with plain arrows
extent:   GridCellCoordinate      // moves with Shift+arrow / Shift+click
```

A range is active when `anchor !== extent`. Its cells are the rectangle between them, inclusive. `Escape` collapses it to `anchor`.

Rectangular, not linear — a spreadsheet range is a rectangle, and a linear walk would make `Shift+↓` from the third column include columns an operator did not select.

Both anchors must be expressed in **visible-row index plus column id**, not row id, so that sorting or filtering under a live selection cannot leave it pointing at rows that are no longer rendered.

## Clipboard format

Tab-separated, newline-separated, plain text. The grid's own export format, and the format a spreadsheet expects in both directions.

- Copy: `focus` to `extent`, tab-joined per row. A missing cell contributes an empty field, not the `GRID_EMPTY_TEXT` placeholder — the placeholder is a display affordance and must not leak into the clipboard.
- Paste: `paste` event, not a keydown read of `navigator.clipboard`. The `paste` event carries the text without a permission prompt and without a lost-user-activation failure.
- A paste into an editable cell goes through `onCellCommit` like any other write, so it gets optimistic display and visible revert for free.
- A paste into a read-only or checkbox cell is skipped, not silently swallowed: skip it and report the skip in the grid's existing `statusMessage` channel, which already exists at `use-grid-keyboard.ts` for keyboard-operation feedback.

## Scroll-into-view

Every focus move scrolls the target cell into view. The virtualizer handle is already threaded (`scrollToIndex`, `grid.tsx:631`); horizontal reveal additionally needs the scroll container's `scrollLeft` adjusted for the frozen run's width, or a cell in the last column reveals only its frozen neighbour.

## What this must not do

- No new dependency. Clipboard uses the `paste` event and `document.execCommand`-free selection APIs.
- No second write path. Every commit in this document goes through the `onCellCommit` handler the grid already owns.
- No capture-phase global listener. The handler stays on the grid container, behind `isGuardedTarget`.
- No change to `j`/`k`/`e`. They are in `design-constraints.md` as the operator's minimum set and they keep working.
