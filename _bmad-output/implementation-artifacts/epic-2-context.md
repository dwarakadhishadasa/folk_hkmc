# Epic 2 Context: A grid that reads as one premium surface

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

An operator scans ten columns and reads identity, field type, and missing values correctly — and rearranges columns by dragging a header that stays out of the way until wanted. This epic turns the raw table dump into one coherent premium surface: drag reorder plus header hygiene, type-keyed renderers with honest linked labels, active-cell plus metrics discipline, and a single unclipped scroll container.

## Stories

- Story S2/2.1: Column drag-and-drop, clean menu, contextual header affordance
- Story S3/2.2: Type-keyed renderers, linked labels, blank-not-dash
- Story S4/2.3: Active-cell state and cell-metrics contract
- Story S5/2.4: One scroll container, surface that does not clip

## Requirements & Constraints

- Grid surface: consistent row height, padding, alignment, header styling; hairline dividers not heavy borders; sticky header; horizontal scroll preserved; final column never clipped; exactly one scroll container; checkboxes stay aligned to rows.
- Cell renderers cover text, select, multiselect, date, number, boolean, linked record, longtext via a field-type marker independent of the edit path; editable vs read-only visually distinguishable; truncated text inspectable; never fabricate a value to look fuller.
- Linked cells render human labels; an id with no lookup renders a visibly unresolved marker distinct from empty; location and collectedBy degrade consistently; never derive a label from the id.
- Active cell: single click sets it in React state (not :hover), restrained consistent outline, distinct from hover and selection, coexists with selected row, arrows move it, never shifts layout.
- Drag reorder persists through the `cols` URL param, written once on drop; pinned-run columns not draggable; any resulting order interleaving a scrolling column into the pinned run is rejected before commit.
- Header menu ships exactly Sort ascending, Sort descending, Hide column (Filter arrives with the Epic 3 filter story — a menu item pointing at a nonexistent surface is a forbidden dead control).
- Metrics contract: cell text 13px, headers 12–13px, 32px default rows with 28px dense as a user option (default never flips), ~8px horizontal and 4–6px vertical padding, centred, ellipsis plus full value reachable, numbers right-aligned tabular, no cell ever grows its row.
- Token-clean: zero raw hex/rgb/black-white under `components/grid/`; hierarchy via weight, space, existing semantic tokens. No per-option hues.
- Fixed row heights are load-bearing (virtualizer estimates from `GRID_ROW_HEIGHT`); long text truncates and edits in a popover.
- Blank-not-dash is the one legitimate assertion edit: remove `GRID_EMPTY_TEXT` and update its three asserting specs in the same commit with recorded reasons. Otherwise fix source, never the assertion.
- All 19 matrix rows stay Covered (including row-17 location filter); a retired row records its reason in the matrix file in the same commit. DOM `data-grid-*` attributes keep their meaning — add, don't repurpose.
- Visual distinctness (hover/active/editing/selected) is proved by a recorded manual pass at 1440x900 and 1024x768, not by hardcoding banned CSS into assertions. Grid stays usable at 1024px.
- Verify with `pnpm test:static` then `pnpm test:e2e` using regex filters (`grid-`, `manage-contacts`), never globs, never bare `playwright test`; one runner at a time against the shared seeded DB; `pnpm test` and green CI prove nothing about behaviour.

## Technical Decisions

- Engine stays TanStack Table v8 + `@tanstack/react-virtual` v3, APIs used as-is; no duplicated filter/sort/persistence logic; no new fetch; both apps stay mirrored (`md5sum` layout and contacts route after edits); `pnpm guardrails` passes.
- `components/grid/` stays table-agnostic: zero Manage/contacts/`/api/manage` vocabulary. Nothing under it imports manage code.
- `@dnd-kit/core` (pointer, touch, keyboard sensors) is the only new dependency: pinned at workspace root with shared deps, lockfile committed, resolving for both apps.
- Column moves commit through the transient handle (`begin/commit/cancelTransientChange` — width drag is the worked example) and reuse `grid.tsx` `moveColumn` semantics: step over hidden columns, no-op when unchanged, validate the resulting order before commit. `canMoveLeft`/`canMoveRight` go.
- Cell rendering: new `GridColumnMeta` field-type key answers "what is this cell", `editor` answers "how is it edited". Closed-state displays render `ctx.text` (optimistic override applied), never `ctx.getValue()`; never mark a column `editable` and give it a `cell` widget. Joined accessors (`location`, `collectedBy`) render through the marker despite having no editor or stored value. Editor closed displays must not be `<button>` (breaks the unscoped star locator) and must not grow the cell.
- Preserve `grid-row.tsx:165-232` as-is (hairline `[&>td]:border-b`, doubled `[data-grid-cell-selected]` specificity trick, per-cell hover/selection on frozen cells, single `border-r` on last frozen column) and keep `grid.tsx` emitting `<table>` directly (the `ui/table` wrapper is a second scroll container). Replace `max-h-[70vh]` by filling the given space.
- URL keys stay the six (`q`, `f.<colId>`, `sort`, `cols`, `hide`, `size.<colId>`); density and selection stay local. No new `/api/manage/*` route (inherits the known proxy session-refresh gap).
- Rewrite the three reversed-decision source comments in the same commit (editor close-is-discard, `stopPropagation` reason — handler kept, header menu reorder note) and update `docs/manage-grid-pattern.md` (filter table, move section, per-column control).

## UX & Interaction Patterns

- One visual emphasis per row: the identity column carries weight; ten equal-volume columns is the failure being fixed.
- Empty is genuinely empty; unresolved is a distinct marker — no-location and dangling-location are different facts.
- Header distinct from body via subtle surface change only; frozen cells keep opaque `bg-card` with per-cell hover/selection; no stripes, shadows, or heavy borders as workarounds.
- Menu control revealed by opacity/visibility (focusable, tappable, never `display:none`); suppressed on selection column and headers with their own control.
- Active cell is the discoverability surface for double-click-only editing: it must communicate "next keystroke lands here".
- Density control initialises from `GRID_ROW_HEIGHT.default` so its label can never lie about the rendered density.
- Reference compositions in `Visual-Design/` (grid-states for cell/row states, toolbar composition for surface) are direction artifacts; the recorded manual pass is the gate.

## Cross-Story Dependencies

- Ordered within the epic: S2 (drag/menu owns `grid-header-cell.tsx`) precedes S3/S4 to avoid same-file merge conflicts; S3's renderer/DW-27 rules are the surface S4's metrics and active-cell work sits on.
- S2 ships a 3-item menu; Epic 3's filter story adds the Filter item completing the four, and reveals the bar pre-filled from the column menu.
- S5 (scroll container) shares a vertical budget with the permanent filter bar — grade together at 1024x768, not in isolation.
- Filter date operators are gated on the date-types spec landing; Epic 2's drag/render/metrics/scroll work is ungated and ships without waiting for that migration.
- `components/grid/**` is shared (contacts table + `/dev/grid-preview` at 500 rows for primitive grading): every story widens regression to `test:e2e:grid` plus `test:e2e:manage`.
