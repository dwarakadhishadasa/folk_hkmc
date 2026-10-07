---
title: 'Grid primitives, toolbar, and URL-backed view-state hook'
type: 'feature'
created: '2026-10-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '5678c08' # the commit this story was built on; the story's own code landed in e2bdcf8 by an earlier stalled run of this same story, so the change under review spans 5678c08 -> working tree
context:
  - '{project-root}/_bmad-output/specs/spec-manage-dashboard-grid/design-constraints.md'
  - '{project-root}/_bmad-output/specs/spec-manage-dashboard-grid/data-loading-decision.md'
  - '{project-root}/_bmad-output/specs/spec-manage-dashboard-grid/capability-tiers.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `/manage` has no grid. `components/manage/manage-contacts-table.tsx` hand-rolls sorting and filtering with `useMemo` over the whole scoped row set (lines 101-170), has no row virtualization, and holds its sort/filter state in component state so nothing survives a reload. Four tables need the same thing, so the primitives must be built once, generically, and be table-agnostic.

**Approach:** Add `@tanstack/react-table` + `@tanstack/react-virtual` and build a generic `<Grid>` in root `components/grid/`: a virtualized table with a sticky header and frozen first column, a toolbar, an explicit loading/empty/error panel model, grid-level keyboard handling, and a controlled view-state hook whose source of truth is the URL. Ships no table wiring and no data fetching — rows arrive as props. Implements CAP-1, CAP-2, CAP-3, CAP-8 (grid keys only) and CAP-9.

## Boundaries & Constraints

**Always:**

- `design-constraints.md` is a binding contract: 13px grid base font; 32px default / 28px dense row height; `tabular-nums` on numeric columns; sticky column headers; first column frozen; 1px borders and **no drop shadows** on data surfaces; **no card-in-card nesting** (table sits directly on the page background, one framing level max); **one accent** reserved for selection and focus; hairline row separators and **no alternating stripes**.
- Grid state lives in the **URL**, via TanStack's controlled `state` + `onStateChange(updater)` pattern. Sort, global filter, per-column filters, column order, column visibility and column size all round-trip through it. `manualPagination`/`manualSorting`/`manualFiltering` stay `false` with `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel` (`data-loading-decision.md` §3).
- Rewriting the URL must **preserve every non-grid query param**. `?mode=admin|preacher` is the CAP-10 carrier (`navigation-decision.md:41`) and the grid is the one thing rewriting URLs on a `/manage` page. Dropping it is the exact failure CAP-10 exists to prevent.
- The client grid is a `"use client"` component that imports **only** `react`, `next/navigation`, `@tanstack/*`, `lucide-react`, `@/components/ui/*`, `@/lib/utils`. It must never import `@hkmc/authz`, `@hkmc/program-config/server`, `@/lib/authz`, `@/lib/invite-log`, `@/lib/supabase/admin`, or `@/lib/supabase/server` (`scripts/verify-monorepo-guardrails.mjs:10-17`). **Do not edit that prefix list** — `scripts/verify-airtable-removal.mjs:628-636` asserts its contents.
- No direct Supabase calls from any component. This story ships no data fetching at all.
- Root `components/grid/` (not a `packages/*` package) — `components/` is already single-instance and reachable from both apps via `@/*` → `../../*` (`apps/folk/tsconfig.json:11`), so no workspace/transpilePackages/tsconfig-path wiring is needed and `apps/folk`/`apps/gita-life` stay byte-identical.
- New deps are declared in **root** `package.json` alongside react/next/radix (where every other shared dep lives), and `pnpm install` must run so `pnpm-lock.yaml` updates — CI installs with `--frozen-lockfile` (`.github/workflows/quality-gates.yml:26,31,35`).

**Never:**

- No contacts-shaped behavior, no `ManageContact`/`ManagePortalPayload` import, no column definitions, no fetch, no `/api/manage/*` call. A generic primitive that four tables consume; a contacts-shaped primitive is a contacts table with extra steps.
- No hand-rolled sort/filter anywhere (`SPEC.md:69`). No component-state fallback for grid state, not even temporarily (`data-loading-decision.md:57`).
- No Cmd/Ctrl+K palette — that is portal-level and ships in story 3.
- No row-selection column or header checkbox here. `data-loading-decision.md` §4 puts selection in this slice, but `stories.yaml` story 2 states "Selection is a grid primitive and belongs here" — and story 2 is the story that owns it. Resolution: this story leaves `enableRowSelection` reachable and unopinionated and does not render a select column; story 2 renders the select column, the header checkbox and the bulk action on top of it.
- No change to the existing `components/manage/*` files, `manage-types.ts`, the tab shell, or `/manage/page.tsx`. That is stories 2-5.
- No server-side pagination (see `data-loading-decision.md` §3 trigger table).

## I/O & Edge-Case Matrix

All URL codec rows are observable at the browser URL bar while the grid is mounted.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No grid state | plain `/dev/grid-preview?mode=preacher`, no grid params | URL keeps only `mode`; grid renders default column order and no sort | No error expected |
| Foreign params survive | toggle sort on `?mode=preacher` | URL becomes `?mode=preacher&sort=name:desc` — `mode` byte-identical | No error expected |
| Unknown params survive | `?utm=x&foo=1`, then any grid change | both still present verbatim | No error expected |
| Garbage params | `?sort=%3A%3A&cols=nope&size.phone=abc` | ignored, defaults render, keys deleted on the next grid write | never throws |
| Stale column ids | `?cols=name,ghost,phone` on a grid with no `ghost` | `ghost` dropped, known ids ordered, missing ids appended in default order | never throws |
| Empty vs filtered-empty | 0 source rows vs all rows filtered out | "no records" panel vs "no rows match the current filters" + a working **Clear filters** that clears `q`/`f.*`/`sort` in the URL | distinct copy + distinct icon per state |
| Commit rejects | `onCellCommit` returns a rejected promise | previous value restored visibly + error message surfaced via `onEditError` | rejection contained |
| Escape while editing | `e` then type then `Escape` | draft discarded, previous value shown, focus back on the cell | No error expected |
| `e` on non-editable cell | `e` on a cell with `meta.grid.editable !== true` | no-op: no editor, no focus change, no crash | no error expected |
| `j`/`k` at bounds | `k` on first row, `j` on last | stays put, does not wrap | No error expected |
| Key inside a text field | focus in global filter, press `j` | types `j`; row focus unchanged | No error expected |
| Key inside a Radix popover | per-column filter open, press `k` | no row movement, no sort toggle | No error expected |

</intent-contract>

## Code Map

- **`package.json:43-99`** — every shared runtime dep lives at root; neither app declares one. `@tanstack/react-table` `^8` and `@tanstack/react-virtual` `^3` are absent everywhere (`pnpm-lock.yaml` has zero `@tanstack` entries). Add both here.
- **`apps/folk/app/globals.css:4-6`** and **`apps/gita-life/app/globals.css:4-6`** — `@source "../../../components/**/*.{ts,tsx}"` in *both* files, so classes used in `components/grid/**` compile into both apps with no CSS edit. Semantic tokens exist in both (light+dark): `--color-border`, `--color-muted-foreground`, `--color-card`, `--color-primary`, `--color-destructive`, `--color-accent`, `--color-ring`, `--color-popover`.
- **`components/ui/table.tsx:11`** — **do not reuse the shadcn `Table` wrappers.** `Table` hard-wraps its `<table>` in `<div data-slot="table-container" className="relative w-full overflow-x-auto">`, which would become a second scroll container and break both the virtualizer and the sticky frozen column. Emit the `<table>` markup directly. Still reuse `checkbox`, `input`, `popover`, `dropdown-menu`, `tooltip`, `skeleton`, `empty`, `button`.
- **`components/ui/table.tsx:60`** — `TableRow` already styles `hover:bg-muted/50 data-[state=selected]:bg-muted`; `:73`/`:86` already special-case `[role=checkbox]` padding. Mirror these idioms (`data-state="selected"`, `data-[state]`) in the new markup so story 2's select column lands without re-styling.
- **`components/ui/checkbox.tsx`** — renders `role="checkbox"`, `size-4`, `rounded-[4px]`, `data-[state=checked]:bg-primary`. The select-column hook already exists.
- **`components/ui/select.tsx:29`** — `SelectTrigger` takes a non-Radix `size?: 'sm' | 'default'` prop driving `data-size`/`data-[size=sm]:h-8`. The existing density lever.
- **`components/manage/manage-contacts-table.tsx:260-262`** — the pattern to replace: `<div className="max-h-[70vh] overflow-y-auto">` + `<TableHeader className="sticky top-0 z-10 bg-card">`. Non-virtualized. `:325-326` establishes `font-mono tabular-nums` for numeric cells; `:319`/`:327` the `"—"` empty convention; `:219` `.toLocaleString("en-IN")`; `:213` the `shadow-[...]` panel the design constraints ban.
- **`components/manage/manage-attendance-view.tsx:219-221`** — the only current row-selection precedent: `data-state={selected ? "selected" : undefined}` + `onClick` + `cursor-pointer`.
- **`components/manage/manage-portal.tsx:49-52`** — the only client-side URL write in the repo (`new URL(window.location.href)` → `history.replaceState`, inside an empty `catch`). `SPEC.md:43` retires it. Do not copy it; use `next/navigation` so the URL stays the single source of truth.
- **`components/manage/manage-types.ts:1-11`** — deliberately imports nothing; the seam that keeps client components plain typed props. The grid must not import from it.
- **`lib/utils.ts:1-6`** — `cn` = clsx + tailwind-merge only. Safe to import from a client component.
- **`scripts/verify-monorepo-guardrails.mjs:10-17`** — `serverOnlySpecifierPrefixes`, read-only. `:232-243` decides "client" only from a **top-level** `"use client"` statement, so the directive must be the first statement. `:542-596` walks the transitive runtime import graph from every client root — importing one of those six specifiers transitively fails the guard. `:543` scan roots include `components`.
- **`apps/folk/app/manage/page.tsx:9`** — `export const dynamic = "force-dynamic"`, needed because `useSearchParams` in a client component triggers a prerender bailout without a Suspense boundary. The preview route must set the same; so must every route added in stories 3-5.
- **`apps/gita-life/app/manage/page.tsx`** — byte-identical to folk's. Any new route must be too.
- **`eslint.config.mjs`** — no quote rule; `components/manage/*` uses double quotes, `components/ui/*` uses single. New grid files follow `components/manage/*` (double). `_bmad-output/**` is lint-ignored.
- **`next.config.mjs:4-6`** — `typescript.ignoreBuildErrors: true`, so **`pnpm typecheck` is the only real type gate**, not `pnpm build`.
- No test runner exists (`CONTRIBUTING.md:36`); `playwright-core` is a devDependency with no script wired.

## Tasks & Acceptance

**Execution:**

- `package.json` -- add `"@tanstack/react-table": "^8"` and `"@tanstack/react-virtual": "^3"` to root `dependencies`; run `pnpm install` to write `pnpm-lock.yaml`. Rationale: CI installs `--frozen-lockfile`, so an un-locked dep breaks the build.
- `components/grid/grid-types.ts` -- shared generic types: `GridDensity = "default" | "dense"`, the `GridPanelState` discriminated union (`ready` / `loading` / `error` / `empty`), `GridCellCommit` / `GridEditError` callback argument shapes, and the `meta.grid` extension shape (`editable`, `filter`, `align`, `tabular`). Type-only, no runtime imports, no `"use client"`.
- `components/grid/grid-view-state.ts` -- **pure, React-free** URL codec: `GRID_PARAM_PREFIXES`, `parseGridViewState(params, columnIds)`, `serializeGridViewState(state, columnIds)`, `applyGridParams(existing, next)`. Contract: `sort=colId:asc[,colId:desc]` in priority order, `q=<global>`, `f.<colId>=<filter>`, `cols=<ordered,comma>`, `hide=<comma>`, `size.<colId>=<px int>`. Only non-default values are written; a default-valued or malformed key is deleted. `applyGridParams` starts from a copy of the live params and touches **only** grid-owned keys. Parsing drops unknown column ids and re-appends missing ones in default order, and never throws.
- `components/grid/use-grid-view-state.ts` -- `"use client"`. Wraps `useSearchParams`/`usePathname`/`useRouter`; returns `{ state, onStateChange }` in TanStack's controlled shape, handling both the object and the updater-function form of the `onStateChange` argument. History policy: `push` for discrete arrangement changes (sort toggle, column move, visibility toggle, resize commit), debounced `replace` (~250 ms) for continuous text input (global and per-column filters); both with `{ scroll: false }`. Density is deliberately **not** URL state — it is a controlled prop pair on `<Grid>`, since the spec's URL list names sort/filters/order/visibility/size and not density. Exposes an escape hatch for in-flight interaction (see Design Notes: resize drags must not thrash the router).
- `components/grid/use-grid-keyboard.ts` -- `"use client"`. `j`/`k` move row focus (clamped, no wrap, `virtualizer.scrollToIndex` to follow), `e` begins editing the focused cell when `meta.grid.editable`, `Enter` commits, `Escape` cancels. Every handler first checks `event.target` and bails on `input`/`textarea`/`select`, `isContentEditable`, any element inside a Radix popper (`[data-radix-popper-content-wrapper]`), and any held `meta`/`ctrl`/`alt`. Owns draft value, dirty state, commit (optimistic display of the new value), and revert-on-rejection.
- `components/grid/grid-panel.tsx` -- `"use client"`. Renders the `GridPanelState` union as a discriminated variant so distinctness is structural, not three remembered class sets. `loading` = skeleton rows inside the live grid frame (header stays visible — a blank surface reads as broken, `capability-tiers.md:18`); `error` = destructive icon + message + `onRetry`; `empty` = `components/ui/empty` + a Clear-filters action; `ready` = the virtualized rows. Each emits a distinct `data-grid-panel` value.
- `components/grid/grid-toolbar.tsx` -- `"use client"`. Global filter input, a Columns `DropdownMenu` of visibility checkboxes, the density toggle, and an `N of M in scope` count using `.toLocaleString("en-IN")`.
- `components/grid/grid-header-cell.tsx` -- `"use client"`. Sortable label button with `aria-sort`, a resize handle driving `columnResizeMode: "onChange"`, a per-column filter `Popover` (text or numeric per `meta.grid.filter`), and a column menu with Move left / Move right / Hide (no drag-and-drop — deterministic and keyboard-operable, and it serializes straight to `cols`).
- `components/grid/grid-row.tsx` -- `"use client"`. A virtualized row: hairline `border-b`, `hover:bg-muted/50`, `data-state="selected"`, fixed height (32 / 28) so row height matches the design contract exactly, cells truncated to one line, `tabular-nums` on numeric columns, `"—"` for empty values.
- `components/grid/grid.tsx` -- `"use client"`. The composed export: `useReactTable` with `getCoreRowModel`/`getSortedRowModel`/`getFilteredRowModel`, `manualPagination`/`manualSorting`/`manualFiltering` all `false`, `columnResizeMode: "onChange"`, `columnOrder`/`columnVisibility`/`columnSizing` wired to the hook, the keyboard hook, `useVirtualizer` over a single measured scroll container, sticky `<thead>`, frozen first column, and the panel branch. Props are `rows`, `columns`, a required `getRowId` (story 2's edit commits address a cell by `rowId`, so ids must be stable and URL-safe, not array indices), `state`, `ariaLabel`, `density`/`onDensityChange`, and optional `onCellCommit`/`onEditError`/`emptyContent`. Required rendering properties: `table-layout: fixed` with `width: table.getTotalSize()`, a single default `size` applied centrally to any column def that omits one (so `getTotalSize()` is never degenerate and the frozen column always has a width), `border-separate border-spacing-0` (never `border-collapse`, which breaks sticky cells), opaque background on every sticky cell, `border-r` on the frozen column in place of a scroll shadow, and one element that is simultaneously the horizontal and vertical scroller.
- `components/grid/index.ts` -- barrel re-exporting the public surface.
- `components/grid/grid-preview.tsx` -- `"use client"`. The CAP-9 review harness: ~500 synthetic rows (enough to exercise virtualization at the CAP-1 threshold), a segmented control that forces `ready` / `loading` / `error` / `empty` / `filtered-empty`, a density toggle, and an in-memory `onCellCommit` so the edit-commit-revert path is exercised end to end. Generic rows — no `Manage*` types, no contacts shape.
- `apps/folk/app/dev/grid-preview/page.tsx` and `apps/gita-life/app/dev/grid-preview/page.tsx` -- byte-identical server component, `export const dynamic = "force-dynamic"`, generates the synthetic rows server-side and passes them as props (which is also the proof of the props-in / no-Supabase boundary). `notFound()` unless `process.env.NODE_ENV !== "production"` or `MANAGE_GRID_PREVIEW === "1"`, so no unreviewed surface is deployed.

**Acceptance Criteria:**

- Given the preview route in dev, when a 500-row table is scrolled to the end and back, then the rendered `<tr>` count stays bounded (≈ viewport rows + `overscan`) and does not grow with the row count.
- Given the preview route, when the table is scrolled down, then the column header stays pinned; when it is scrolled right, then the first column stays pinned with its row identity, separated by a 1px `border-r` and not a drop shadow.
- Given any grid, when a column is sorted, moved, hidden, or resized, then the corresponding URL param is written and the change survives a full reload and a shared link.
- Given a column is moved or hidden, then the browser Back button restores the prior arrangement.
- Given a global filter keystroke, then rows narrow across **every** column — not just the first leaf column — and the same filter text is present in the URL.
- Given a per-column filter on column A plus a global filter, then only column A is narrowed by the per-column filter, the two combine, and both round-trip through the URL.
- Given a numeric column, when rows are rendered, then the digits align vertically via `tabular-nums` at 13px in a 32px (or 28px dense) row.
- Given the preview route loaded with `?mode=preacher`, when any sort, filter, column, or resize change is made, then `mode=preacher` is still in the URL afterward, byte-identical. (Stated here against the preview route because `/manage/contacts` does not exist until story 3; the same hook serves it.)
- Given the preview route's state control, when `loading`, `empty`, and `error` are each selected in turn, then all three render, each is visually distinct from the other two, and none of them is a blank surface.
- Given a filtered-to-nothing table, then the panel says "no rows match the current filters" and offers Clear filters; given a table whose source has zero rows, then the panel says "no records" — two different messages, not one.
- Given a keyboard-only operator, when `j`/`k` are pressed, then row focus moves and scrolls into view; `e` opens the editor on an editable cell; `Enter` commits the new value; `Escape` restores the previous value.
- Given focus inside the global filter input, a per-column filter popover, or any other input, when `j`/`k`/`e`/`Enter`/`Escape` are pressed, then the grid does not move focus, toggle sort, or begin editing.
- Given `onCellCommit` rejects, then the previous value is restored visibly and an error message is shown; the failure is never silent.
- Given no table is wired to the new grid yet, then `components/manage/*`, `/manage`, and the tab shell are byte-unchanged.
- Given the repo, when `pnpm guardrails` and `pnpm test:airtable-removal` run, then both pass and the `serverOnlySpecifierPrefixes` list is unmodified.

</intent-contract>

## Spec Change Log

## Review Triage Log

## Design Notes

**The global-filter trap.** TanStack v8's default `globalFilterFn: 'auto'` does *not* filter across every column — it resolves to a single column id (`columnFilters[0]?.id ?? getAllLeafColumns()[0].id`), so the shipped default silently narrows on one column and CAP-3 fails while looking correct. The grid must supply its own `globalFilterFn` that ORs a normalized substring test across every leaf column. This is the single most likely way to build a grid that demos fine and fails review.

**Why `components/ui/table.tsx` is deliberately not reused.** Its `Table` wrapper's `overflow-x-auto` div (`:11`) would nest a second scroll container inside the virtualizer's, so the sticky frozen column would pin to the wrong element and `scrollToIndex` would drive the wrong scroller. Reuse the primitives (checkbox/popover/dropdown-menu/skeleton/empty/input), not the table.

**Fixed row height is a contract, not a limitation.** `design-constraints.md` states 32px / 28px, so the grid uses fixed heights and `estimateSize`, never `measureElement`. Consequence: cells are single-line and truncate, so the contacts `notes` column (`manage-contacts-table.tsx:328`, currently `whitespace-normal`) loses its wrap when story 2 ports it and must truncate with a title/tooltip instead. Recorded here because story 2 will hit it and must not "fix" it by reintroducing wrapping.

**Density is a prop, not URL state.** The spec's URL list names sort, global filter, per-column filters, column order, visibility and size. Density is absent from it, so making density URL state would be inventing a contract the spec did not ask for. It is a controlled `density` / `onDensityChange` pair so the consumer decides where it lives.

**No drag-and-drop for column order.** Move left / Move right in the header's column menu: deterministic, keyboard-operable, and serializes to `cols` unchanged. Drag-and-drop would need a new dependency for no capability gain.

**13px base font without a CSS edit.** `apps/folk/app/globals.css` and `apps/gita-life/app/globals.css` already diverge, and the grid is shared by both, so the base font and row heights are component-owned constants + arbitrary utilities (`text-[13px]`, inline `style` height) rather than a token added to one theme file. This keeps `apps/folk` and `apps/gita-life` byte-identical.

**Two URL write paths, not one.** Continuous interaction cannot round-trip through the URL on every frame. Filter typing is debounced to a single `replace`; a column-resize drag keeps a **transient overlay** (the width being dragged) in component state and writes `size.<colId>` once on pointer-up. This is not the forbidden "grid state in component state for now" — the committed state is always the URL, and an abandoned drag restores the URL-derived width rather than persisting it. The alternative (writing `size.*` per pointer-move) would emit hundreds of router transitions and hundreds of history entries per drag.

**Editing ships here; persistence ships in story 2.** CAP-5's persistence is story 2, but the `e`/`Enter`/`Escape` keys are CAP-8 and are this story's scope, so the grid owns the full editing state machine — draft, optimistic commit, visible revert — behind a consumer-supplied `onCellCommit` promise. This is a complete primitive, not a stub: the preview harness supplies a real in-memory commit and exercises commit, cancel and rejection end to end. Only the `/api/manage/contacts` wiring is deferred.

**Virtualization bounds the DOM, not the transfer.** A smooth-scrolling grid is not evidence of a small payload (`data-loading-decision.md` §3). This story's contribution to that cost is zero by construction — it ships no data fetching, so the transfer decision belongs to stories 3-4 and the measurement to story 6.

## Verification

**Commands:**

- `pnpm typecheck` -- expected: SUCCESS, no output. This is the real type gate; `next.config.mjs:4-6` sets `ignoreBuildErrors: true`, so the build will not catch type errors.
- `pnpm lint` -- expected: SUCCESS, no errors in `components/grid/` or the preview routes.
- `pnpm build` -- expected: SUCCESS for both apps.
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.` Proves no grid file imports a server-only specifier.
- `pnpm test:airtable-removal` -- expected: SUCCESS. Proves the prefix list was not edited.

**Manual checks (there is no test runner — `CONTRIBUTING.md:36`):**

- `pnpm dev:folk`, open `/dev/grid-preview`. Toggle each of the five panel states; confirm loading keeps the header and shows skeleton rows, error shows a destructive panel with a working retry, and the two empty flavors read differently.
- Switch between default and dense; confirm row height and 13px base font, `tabular-nums` alignment, hairline separators, no stripes, and no drop shadow on the grid surface.
- Scroll down (header stays) and right (first column stays, 1px divider, no shadow).
- Change sort / move / hide / resize; confirm the URL updates and Back restores the previous arrangement.
- Type in the global filter; confirm rows narrow across all columns, not just the first.
- Focus the global filter input and press `j`/`k`; confirm the characters type and the grid does not move.
- Open a per-column filter popover and press `k`; confirm nothing moves.
- `e` → `Enter` on an editable cell; `e` → type → `Escape`; and force a commit rejection in the harness to watch the visible revert.
- `pnpm dev:folk` and `pnpm dev:gita-life` side by side on `/dev/grid-preview`; confirm identical rendering (no token added to only one theme file).

## Auto Run Result

Status: in-progress

Blocking condition: none

### Implementation outcome

The story body landed in commit `e2bdcf8` ("wip(story 1): grid primitives before stalled verification"), which is also this run's `baseline_revision`. Step-03 therefore verified an existing implementation rather than writing one from scratch, and found two real defects in the CAP-5/CAP-8 edit path, both fixed in the working tree:

- `components/grid/use-grid-keyboard.ts` — the `e` branch now calls `event.preventDefault()`. The editor mounts and takes focus during that same `keydown`, so the browser's default text insertion landed in the freshly focused input: the key that opened the editor also typed a stray `e`.
- `components/grid/grid-row.tsx` — the editor was extracted to `GridCellEditor`, which focuses **and selects** the current value on mount. Without the selection the caret sat at the end of the pre-filled text, so `e`→type→`Enter` appended rather than replaced, silently committing a concatenation on a write that reported success.

### Gate results (step-03, rerun independently)

| Gate | Result |
|---|---|
| `pnpm typecheck` | clean, all 6 projects |
| `pnpm build --force` | both apps compile; `/dev/grid-preview` builds as `ƒ` |
| `pnpm guardrails` | `Monorepo guardrails passed.` |
| `pnpm lint` | 0 problems in `components/grid/`; 12 errors are pre-existing, all in `.agent/`, `.codebuddy/`, `.neovate/` skill-tooling |
| `pnpm test:airtable-removal` | 28/30; the 2 failures are **pre-existing** — reproduced identically in a worktree at `5678c08`, before any grid file existed. They originate in `scripts/migrate-airtable-data.mjs` and `scripts/delta-sync-old-project.mjs` |
| I/O & Edge-Case Matrix | all 12 rows covered; 24/24 codec checks and 82/82 headless-Chromium checks, all rerun against current code |

Boundary confirmed by inspection and by the guardrail: no grid file imports `@hkmc/authz`, `@hkmc/program-config/server`, `@/lib/authz`, `@/lib/invite-log`, `@/lib/supabase/admin` or `@/lib/supabase/server`; no Supabase call anywhere under `components/grid/`; no `components/ui/table` import; no `Manage*` type import; `serverOnlySpecifierPrefixes` byte-unchanged; `components/manage/*`, both `/manage` routes and `scripts/` byte-unchanged versus `5678c08`.

### Open items carried into review

- **The `pnpm test:airtable-removal` acceptance criterion cannot be signed off.** Two checks fail on pre-existing script content outside this story's scope. The AC should either be re-scoped to "does not regress" or the scripts need an owner.
- First click on a column sorts ascending (`sort=ref:asc`); the matrix cell literally reads `sort=name:desc`. No acceptance criterion mandates a direction and TanStack's `sortDescFirst: false` matches Excel/Airtable, so it was left as-is and is flagged rather than silently changed.
- The preview route 404s on gita-life until a clean dev-server restart; a Turbopack dev-cache artifact, not a code issue.
- The matrix test audit is satisfied by throwaway harnesses under `/tmp`, not by committed tests, because the spec records that no test runner exists (`CONTRIBUTING.md:36`). Nothing in the repo will re-run these checks.

### What planning established

- **Target:** 11 new files under `components/grid/` plus one byte-identical review route in each app, and two root dependencies. `components/` is already a single shared directory reachable from both apps via `@/*` → `../../*`, so no workspace package, `transpilePackages` entry, or tsconfig path is needed and `apps/folk`/`apps/gita-life` stay byte-identical.
- **URL contract:** `sort`, `q`, `f.<colId>`, `cols`, `hide`, `size.<colId>`, written only when non-default, and never touching a non-grid param — `?mode=` preservation is a named acceptance criterion, not a footnote.
- **Route models:** client-side only (`getCoreRowModel`/`getSortedRowModel`/`getFilteredRowModel`, all `manual*` false), per `data-loading-decision.md` §3.

### Three findings worth carrying into implementation

1. **TanStack's default global filter silently filters one column, not all.** `globalFilterFn: 'auto'` resolves to a single column id, so the stock behavior looks correct and fails CAP-3. The grid must supply its own all-column `globalFilterFn`.
2. **`components/ui/table.tsx` cannot be reused.** Its wrapper's `overflow-x-auto` div (`:11`) would nest a second scroll container, breaking both virtualization and the sticky frozen column. Reuse the primitives, emit the `<table>` markup directly.
3. **The spec's URL list omits density**, so density is a controlled prop pair rather than invented URL state.

### Judgment calls recorded, not silent

- Fixed row height (32/28) is treated as a design contract, so cells truncate on one line. Consequence: the contacts `notes` column loses its `whitespace-normal` wrap when story 2 ports it. Flagged in Design Notes so story 2 does not "fix" it by reintroducing wrapping.
- A column-resize drag keeps a transient width overlay in component state and writes the URL once on pointer-up. This is not the prohibited "grid state in component state for now" — committed state is always the URL, and an abandoned drag restores the URL-derived width. Recorded because an implementer would otherwise either thrash the router or wrongly conclude local state is acceptable.
- The grid owns the full edit state machine (draft, optimistic commit, visible revert) behind a consumer-supplied `onCellCommit`, because `e`/`Enter`/`Escape` are CAP-8 and in this story's scope. The preview harness supplies a real in-memory commit so the path is exercised, not stubbed; only `/api/manage/contacts` wiring is deferred to story 2.
- A `/dev/grid-preview` route is added so CAP-9's three states are actually reachable and reviewable. It renders synthetic rows, `notFound()`s in production unless `MANAGE_GRID_PREVIEW=1`, and is byte-identical in both apps.
- Row selection is left unrendered and `enableRowSelection` unopinionated: `data-loading-decision.md` §4 puts selection in this slice but `stories.yaml` assigns it to story 2, and story 2 is the story that owns it.

### Gate results

Ready-for-development standard: **met**. All 14 tasks carry a file path and a specific action and are ordered by dependency; all 15 acceptance criteria use Given/When/Then and observe the rendered grid or the browser URL; no placeholders remain. Four gaps were found during self-review and repaired before this status was set: the missing `getRowId`/default-column-size contract, the missing resize-drag URL strategy, an acceptance criterion that referenced `/manage/contacts` (a route this story does not create), and the `data-loading-decision.md` §4 vs `stories.yaml` story 2 selection-scope tension.

Frontmatter carries `warnings: ['oversized']` — the spec is roughly 3,450 words against the template's 900–1,600 target, because the URL codec contract, the CAP-9 panel model, and the design-constraint prohibitions all needed to be stated precisely enough to be testable.