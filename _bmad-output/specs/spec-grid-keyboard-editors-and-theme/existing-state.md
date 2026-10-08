# Existing state, verified

Every claim below was read out of the tree, not recalled. Baseline: `3c7bfc1`.

## What story 2 already shipped — do not rebuild

| Capability | Where |
|---|---|
| Virtualized rows, sticky header, frozen run | `components/grid/grid.tsx`, `grid-row.tsx`, `grid-header-cell.tsx` |
| URL-backed sort / filter / order / visibility / size | `use-grid-view-state.ts`, `grid-view-state.ts` |
| Text inline editing + optimistic display + visible revert | `use-grid-keyboard.ts:277-367` |
| Row selection, indeterminate header, one bulk action, per-row outcomes | `manage-contacts-table.tsx`, `lib/manage/api-handlers.ts` |
| Panel states (loading / error / empty / filtered-empty) | `grid-panel.tsx` |
| 19-row Playwright matrix, all Covered | `e2e/specs/manage-contacts-*.spec.ts` |

## Verified gaps

Greps run against `components/grid/` at `3c7bfc1`:

- `ArrowDown`, `ArrowUp`, `Tab`, `Home`, `End` — **0 hits**
- `clipboard` — **0 hits**
- `shift` / `range` — **0 hits** outside an unrelated `grid-view-state.ts` comment
- `addRow`, `deleteRow`, `insertRow`, `Add record` — **0 hits** across `components/`
- `dark:` — **0 hits** in `components/grid/` and `components/manage/`
- raw hex / `rgb(` / `white` / `black` — **0 hits** in `components/grid/`

The keyboard handler, in full, is `use-grid-keyboard.ts:396-441`: `j`, `k`, `e`, `Enter`, `Escape`. That is the entire model.

## The `consumerRenderedCells` seam to extend, not work around

`Grid` resolves which columns carry a consumer renderer from the definitions it was handed (`grid.tsx:232-268`) and passes the set down (`grid.tsx:631`). The reason is recorded in the `3c7bfc1` commit: TanStack merges a default `cell` into every column, so asking `columnDef.cell` answers "always".

**This directly constrains the editor work.** `GridRow` prefers `cell.render` over `cell.text` (`grid-row.tsx`), and `cell.text` is what carries the optimistic override. So a typed editor column that supplies its own `cell` renderer loses the optimistic display unless it renders the override itself. `deferred-work.md` DW-27 records this exact trap: *"a column marked `meta.grid.editable` that also supplies a `cell` widget renderer silently loses its optimistic display"*.

There is no way to add a select editor, a checkbox cell or a person chip to the contacts table without walking into DW-27. **DW-27 is therefore promoted from deferred to in-scope** — the editor story must resolve it, not inherit it. The resolution belongs in the primitive, because `resolveConsumerRenderers` is table-agnostic by contract and has no business knowing which columns are editable.

## Theme, defined and dead

- `next-themes@0.4.6` — installed, `package.json:96`
- `components/theme-provider.tsx` — exists, correct, never mounted
- `apps/*/app/globals.css:78` — full 31-token `.dark` block
- `apps/*/app/globals.css:8` — `@custom-variant dark (&:is(.dark *))`
- `components/providers.tsx:12` — mounts five providers, **not** `ThemeProvider`
- `apps/*/app/layout.tsx:52` — `<html lang="en">`, **no** `suppressHydrationWarning`
- `grep -rn "setTheme" components/` — **0 hits**, no toggle anywhere
- `components/ui/sonner.tsx:7` — already calls `useTheme()`, so a mounted provider is expected by existing code that currently gets a no-op

The last line matters: `sonner.tsx` depends on the provider this story mounts. It is a live consumer, not dead code.

## What the screenshot shows that does not exist here

From the supplied screencast: an inline select popover anchored to a cell with a "Find an option" filter, a `Drag to resize / Double-click to wrap` resize affordance, colored status pills, and a `+ Add…` row control.

- select popover — absent
- colored pills — absent; `status` today is a plain text accessor
- `+ Add…` — absent
- resize affordance — **present** (`grid-header-cell.tsx`), tooltip text differs

## Contact columns available to exercise editors

`manage-contacts-table.tsx:473-615` defines ten columns. For the editor set:

| Editor | Contact column | Notes |
|---|---|---|
| text | `name`, `phone` | already editable |
| long text | `notes` | already editable; gains the expandable popover |
| number | `totalAttendanceCount` | read-only today; `tabular-nums`, right-aligned |
| currency | — | **no contact column carries a monetary value** |
| checkbox | `favorite` | exists as a `display` column with a star button; becomes a toggle |
| single select | `status` | text accessor today |
| multi select | — | no multi-valued contact field |
| date | `lastContactedOn` | read-only today |
| URL | — | no contact column holds a URL |
| email | — | `phone` is a phone, not an email |
| user | `collectedBy` | `accessorFn` over `payload.staffNames` |

**Four of the ten editors have no column to exercise them on.** Currency, multi-select, URL and email cannot be demonstrated against real contact data.

Two ways out, and the choice belongs to the human: add the columns to the contact model (a schema change, and `SPEC-manage-dashboard-grid.md:88` forbids schema changes), or exercise them on the `/dev/grid-preview` harness that already exists at `apps/folk/app/dev/grid-preview/page.tsx` with 500 synthetic rows. `editor-catalog.md` takes the second and says why.
