# Editor catalog

Binding contract for CAP-5. Every type ships; none is a stub.

## Registry, not a switch

```ts
type GridEditorKey =
  | "text" | "longtext" | "number" | "currency"
  | "checkbox" | "select" | "multiselect"
  | "date" | "url" | "email" | "user"

interface GridEditorDefinition<TData> {
  /** Renders the closed-state display, or undefined to fall back to cell.text. */
  renderDisplay?(ctx: GridEditorContext<TData>): ReactNode | undefined
  /** Renders the open control. Anchored, not modal. */
  renderEditor(ctx: GridEditorContext<TData>): ReactNode
  /** Draft string -> typed value. Throwing rejects the commit with a message. */
  parse(draft: string, ctx: GridEditorContext<TData>): unknown
  /** Present only when the editor commits on interaction rather than Enter. */
  commitsOnInteraction?: boolean
}
```

A column opts in through `meta.grid.editor: "select"`. The cell looks the key up. **Adding an editor type is a registry entry, not a branch in the cell renderer** — the reason is the same one recorded at `grid.tsx:232-268`: a switch in the renderer is how the default-column mistake happened in the first place.

The registry is keyed and typed so an unknown key is a compile error at the column definition, not a blank cell at runtime.

## The types

| Key | Control | Display | Validation |
|---|---|---|---|
| `text` | `Input` | plain | none |
| `longtext` | `Popover` + `Textarea` | truncated, `title` for full | none |
| `number` | `Input`, `inputMode="decimal"` | `tabular-nums`, right | parses to finite number; empty → `null`; rejects `NaN`/trailing garbage |
| `currency` | `Input` with a currency prefix | formatted via `Intl.NumberFormat` | digits only while typing; parses to minor units; rejects a non-numeric draft |
| `checkbox` | none — the cell is the control | a checked box | toggles on click/Space, commits immediately |
| `select` | `Popover` + search filter | colored pill | must be an option value; unknown value rejected |
| `multiselect` | `Popover` + filter | up to 2 pills then `+N` | every entry must be a known option |
| `date` | `Popover` + `Calendar` | locale short date | must parse to a real calendar date; `2026-02-31` rejected |
| `url` | `Input` | a clickable link | `new URL()` must succeed; requires a scheme |
| `email` | `Input`, `inputMode="email"` | plain | one `@`, non-empty local and domain; no whitespace |
| `user` | `Popover` + `Command` search | name + initials avatar | must be a known user id |

`parse` throwing is the validation mechanism — it reuses the existing revert path, so a rejected value shows the same destructive cell and message a rejected write already shows. **No editor validates in the UI with its own error slot.** One validation story, one presentation.

## Positioning

Editors render **anchored to their cell**, via `Popover` in a portal. A cell must not grow when it is edited: `GridRow` enforces fixed row heights, and an in-cell `Textarea` taller than the row would either clip or push the whole virtualized list out of alignment.

`longtext` is the case that proves the rule — it is a popover precisely because it cannot fit in a 32px row.

## Where each is demonstrated

Four of the eleven editors have **no contact column**: `currency`, `multiselect`, `url`, `email` (`existing-state.md`). `SPEC-manage-dashboard-grid.md:88` forbids a schema change to add them.

So:

- **`/manage` contacts** demonstrates what real data supports — `text` (`name`, `phone`), `longtext` (`notes`), `checkbox` (`favorite`), `date` (`lastContactedOn`), `select` (`status`), `user` (`collectedBy`), `number` (attendance counts).
- **`/dev/grid-preview`** — already exists, already 500 deterministic synthetic rows (`apps/folk/app/dev/grid-preview/page.tsx:22`) — gains columns for `currency`, `multiselect`, `url`, `email`.

This is the honest choice: the alternative is four stub editors or a schema change, and a stub that renders is exactly what `capability-tiers.md:7` prohibits (*"Do not stub a lower tier to claim completion of a higher one"*). The preview route is the existing harness for exactly this — `grid-preview.tsx:94-99` already holds the five CAP-9 panel variants for the same reason.

**Every editor is therefore demonstrated somewhere real, and none is demonstrated by a mock.** The preview rows are deterministic and reload-stable, so a Playwright spec against them is reproducible.

## Optimistic display — the DW-27 constraint

`existing-state.md` records the trap: `GridRow` prefers `cell.render` over `cell.text`, and `cell.text` carries the optimistic override. A typed-editor column that supplies `renderDisplay` loses the override, so an in-flight edit shows the prior value — the exact defect `3c7bfc1` just fixed for accessor columns.

The rule for every editor in this catalog:

> **`renderDisplay` receives the already-overridden display value and must render it.** It never re-reads `getValue()`.

The cleanest resolution is in the primitive: the cell passes `text` into the editor context, and an editor's `renderDisplay` returning `undefined` — or omitting it — falls back to `cell.text`. `checkbox`, `select`, `multiselect` and `user` return a widget, so they **must** render the override themselves and receive `text` to do it.

DW-27 is in scope because there is no way to add a single typed editor without resolving it. Recording it as resolved in the primitive, once, is cheaper than four silent CAP-5 failures across four tables.

## Non-negotiables

- Editors hold no persistence logic. `parse` and `commitsOnInteraction` are the whole contract; the write belongs to `onCellCommit`.
- `checkbox` is the only editor that commits on interaction. Every other type commits on Enter, blur, or an explicit close — clicking away from a half-typed number should not fire a write.
- No editor renders a full-page modal.
- No editor introduces a dependency. All ten build on `components/ui/`: `input`, `textarea`, `popover`, `select`, `command`, `calendar`, `checkbox`, `button`, `badge`.
- Column metadata stays presentation-only. `GridColumnMeta` gains `editor?: GridEditorKey` and `editorOptions?: Record<string, unknown>`; neither carries a value.
