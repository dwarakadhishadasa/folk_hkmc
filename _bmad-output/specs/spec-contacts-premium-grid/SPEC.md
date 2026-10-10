---
id: SPEC-contacts-premium-grid
companions:
  - existing-state.md
  - record-review.md
  - surface-and-toolbar.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate.
>
> **Location note.** Authored in `/tmp/opencode/specs/` while `bmad-loop` held the worktree clean, then moved into the repository at `_bmad-output/specs/spec-contacts-premium-grid/` alongside its predecessor. The loop resolves spec paths relative to the repository (`_bmad-output/specs/<spec>/SPEC.md` in its story files' `context:` lists), and this is now that path.
>
> **Runs after `../spec-contacts-date-types/`**, which converts the three date columns to `DATE` first — CAP-12's date-filter operators are written against that type.

# Premium Airtable-Style Contacts Grid

## Why

A **pain to solve**, named by the product owner against a screenshot of the live page: *"the grid feels very simple… The look and feel is not premium industry standard."* `/manage` → Contacts is the daily working surface for a church program coordinator managing a few hundred people, and it currently reads as a raw table dump rather than an enterprise tool.

The grid is **not** underbuilt. `components/grid/` already ships virtualization, a sticky header, a frozen leading run, URL-backed view state, a full keyboard model, cell range selection, clipboard TSV, eleven typed editors, row selection, bulk writes, and a row lifecycle. Twenty-one e2e specs and a nineteen-row coverage matrix guard it. What is missing is the *surface layer*: visual hierarchy, an empty state that is not punctuation, a compact toolbar, and a record-review workflow.

The gap between the reference and the build is smaller than it looks and must be stated precisely, because three claims in the brief are already contradicted by the source and a fourth is already satisfied:

| Brief says | Source says |
| --- | --- |
| "display linked-record labels instead of raw internal IDs" | **Already done.** `manage-contacts-table.tsx:849` joins locations through `locationNameById`; `:937` joins staff through `payload.staffNames`. The raw UUIDs in the screenshot are the *unresolvable-id fallback*, not a missing join. |
| "avoid loading the entire dataset solely to implement record navigation" | **Already satisfied.** `loadManagePortalData` materializes the full scoped set and `data-loading-decision.md` §3 closed on client-side row models. Record review must add no fetch. |
| "make missing values visually subtle" | **Contradicted.** Empty cells render the literal em-dash `GRID_EMPTY_TEXT`, asserted by three e2e specs. It is punctuation, not subtlety. |
| "a view selector with a clear current-view label" | **No backend exists.** No view table, and `proxy.ts` matches neither `/manage` nor `/api/manage/*`. |

Airtable is the reference for interaction patterns and density, not for its palette. The screens it informs are: one visual emphasis per row, a genuinely empty empty-state, controls in one compact band, and a record panel that docks beside the grid rather than replacing it.

## Capabilities

- **CAP-1 — Page header and navigation**
  - **intent:** An operator can identify the active section and their current scope without reading body copy.
  - **success:** The five tabs (Dashboard, Contacts, Sessions, Attendance, Favorites) are preserved and the active one is distinguishable at a glance; the scope indicator aligns to the page header's block; the header loses vertical height without cramping the tab row.

- **CAP-2 — Grid surface maturity**
  - **intent:** An operator can scan a ten-column table horizontally without cells being cut off or surfaces competing.
  - **success:** Consistent row height, cell padding, alignment and header styling; hairline dividers rather than heavy borders; sticky header on vertical scroll; horizontal scroll preserved; the final column is never clipped; exactly one scroll container exists (no nested scrollbar); row-selection checkboxes stay aligned to their rows.

- **CAP-3 — Type-keyed cell renderers**
  - **intent:** An operator can tell a column's field type from the cell alone, without reading the value.
  - **success:** Reusable renderers keyed by field type cover text, select, multiselect, date, number, boolean and linked record; editable and read-only cells are visually distinguishable; truncated text exposes its full value on inspection; **no value is fabricated to make a column look fuller.**

- **CAP-4 — Linked-record labels**
  - **intent:** An operator reads a relationship as a name, never as a database identifier.
  - **success:** Every location and staff cell renders a human label; an id with no matching lookup renders a visibly *unresolved* marker rather than a raw UUID.

- **CAP-5 — Record review**
  - **intent:** An operator can open one record for review, read all of it, move to the next, and return to the grid exactly as they left it.
  - **success:** An explicit per-row affordance opens a modular record panel; prev/next moves between records in the current filtered order; opening and closing preserves filters, sort, column order, selection, scroll position and the focused cell; the panel is table-agnostic so Sessions and Attendance can adopt it later.

- **CAP-6 — Toolbar and views**
  - **intent:** An operator can reach every grid control in one compact band, with bulk actions appearing only when relevant.
  - **success:** One band carries scoped search, a filter control with a visible active indicator, a current-view label, column visibility and ordering, record creation, and visible result and selection counts; the bulk-action bar appears only while rows are selected; no control is present that does not work.

- **CAP-7 — Edit safety**
  - **intent:** An operator can edit a field knowing the value either saved or told them why it did not.
  - **success:** Validation before save; visible save progress and error; a rejected write shows the server's message and reverts the cell; the existing PATCH/bulk API and its authorization are used unchanged.

- **CAP-11 — Active-cell state**
  - **intent:** An operator always knows which cell the next keystroke will act on.
  - **success:** A single click makes a cell the active cell with a clear but restrained outline of consistent colour and thickness; the active cell is held in React state, not CSS `:hover`; it is visually distinct from row hover and from row selection; a selected row and an active cell coexist; arrows move it; no indicator changes a cell's dimensions or shifts its content.

- **CAP-12 — Filter conditions bar**
  - **intent:** An operator builds a filter as a visible list of conditions, whose operators and value controls suit each field's type, joined by one all-or-nothing connective.
  - **success:** An inline bar above the grid shows the conditions for the view, each row carrying **Field · operator · value**, plus **`+ Add condition`** — and no condition *groups*, no saved views, no "Copy from another view", no AI prompt; **the operator list and the value control both depend on the field's type** — text offers contains / does not contain / is / is not / is empty / is not empty, number adds relational comparison, date offers its own operator set plus a relative-date value select, checkbox offers one fixed operator with a checkbox value, and single- and multi-select offer is / is not / is any of / is none of / is empty / is not empty; **one connective governs the whole list** — match all, or match any — so a list is never a mixed `A and B or C` expression; changing the field type resets operator and value to something valid; each condition can be deleted on its own; the per-column filter popover is gone; the column menu's Filter item reveals the bar with that column's condition pre-filled; an active filter is visibly indicated in the toolbar and the header; **the result count updates live as conditions are composed**, which the bar gets free by sitting above the grid; and every condition round-trips through the URL.

- **CAP-13 — Column reordering by drag**
  - **intent:** An operator arranges columns by dragging, with the mouse, a finger or the keyboard.
  - **success:** A column header can be dragged to a new position using `@dnd-kit/core`, which supplies pointer, touch **and keyboard** sensors; the new order persists through the `cols` URL parameter and is written once on drop; a column in the pinned run is not draggable; **any resulting order that would interleave a scrolling column into the pinned run is rejected before it is committed**, leaving the order unchanged.

- **CAP-14 — Header affordance hygiene**
  - **intent:** A column header stays clean at rest and offers its actions only where they are wanted.
  - **success:** The column menu contains exactly **Sort ascending, Sort descending, Hide column, Filter**; the menu control is revealed on header hover and on keyboard focus; it is never hidden from a touch user; it is suppressed on the selection column and on any header that supplies its own control.

- **CAP-8 — Accessibility and performance**
  - **intent:** The grid is fully operable without a mouse and does not shift or stutter under an operator's hands.
  - **success:** Every interactive element has an accessible name; keyboard navigation and visible focus states work throughout; adequate contrast and hit targets; no layout shift while loading; no gratuitous rerenders; no new virtualization beyond what exists; the grid remains usable at 1024px.

- **CAP-9 — Scope preservation**
  - **intent:** The work is an upgrade to the existing architecture, not a replacement of it.
  - **success:** TanStack Table v8 and `@tanstack/react-virtual` v3 remain the engine and their installed APIs are used as-is; `components/grid/` remains table-agnostic (zero contacts vocabulary); no filtering, sorting or persistence logic is duplicated; no new dataset fetch is added; both apps stay mirrored; `pnpm guardrails` passes.

- **CAP-15 — Cell and grid metrics**
  - **intent:** The grid reads as one compact, evenly-spaced surface.
  - **success:** Cell text is 13px, column headers 12–13px; row height is the existing **32px** default (dense 28px stays a user option, and the default does not flip); cells are vertically centred with ~8px horizontal and 4–6px vertical padding; overflowing text truncates with an ellipsis and the full value stays reachable; numbers are right-aligned and tabular; linked records render as readable labels; no cell ever changes its row's height.

- **CAP-16 — Interaction boundaries**
  - **intent:** No gesture in the grid does two things at once.
  - **success:** A checkbox click activates neither an edit nor the record panel; dropdown and popover interactions never trigger a double-click edit; a read-only field never enters edit mode; editing a cell never opens the record panel; a single cell click preserves existing row and record navigation conventions; keyboard propagation is stopped only where a specific key would otherwise be swallowed.

- **CAP-10 — Edit activation and commit**
  - **intent:** An operator opens a cell editor the same way every time, and cannot lose a change by moving away from it.
  - **success:** A double-click opens the editor on every editable field type and **no other gesture opens it**; a second double-click commits; moving focus away commits; `Escape` is the only way to discard; the keyboard openers `e`, printable-character type-to-edit and `Space`-seeding are gone; blur-commit goes through the single commit path and fires **no request when the draft is unchanged**; arrow/Tab/Home/End navigation and `Space`-on-checkbox continue to work, because they are not edit openers.

*CAP-10 is numbered out of sequence deliberately. It supersedes shipped upstream behaviour, and every other capability here is written on top of the edit model it defines.*

## Constraints

- **The grid stays a primitive.** `components/grid/` keeps zero `Manage*`, `/api/manage` or contacts vocabulary. Four tables consume it and `docs/manage-grid-pattern.md` forbids a second table implementation.
- **Token-clean is load-bearing.** Zero raw hex, `rgb(`, `white` or `black` under `components/grid/` today. Hierarchy is expressed with weight, space and existing semantic tokens — never a new literal colour or a per-option hue.
- **One commit path.** `use-grid-keyboard.ts` owns draft, optimistic display and visible revert. A typed editor supplies parsing and validation only; a second mutation channel is a defect.
- **Fixed row heights are load-bearing.** The virtualizer estimates from them (`grid.tsx:633`). Long text truncates and edits in a popover. Nothing may make a row grow.
- **Authorization is unchanged.** Writes go through `lib/manage/api-handlers.ts` with `getStaffContext` + `requireRole`, validated against `MANAGE_CONTACT_PATCH_KEYS`. No direct Supabase from a component; no new authorization logic.
- **No new dependency or component library.** Compose what `components/ui/` already provides — `sheet`, `drawer`, `command`, `scroll-area`, `tooltip`, `tabs` are all present — plus `lucide-react`, already imported by the grid.
- **Both apps stay byte-identical where they already are.** `md5sum` the `layout.tsx` files and both `api/manage/contacts/route.ts` files after editing.
- **Story 5 is in flight.** `bmad-loop` is running on `feat/grid-keyboard-editors-and-theme` and owns `manage-contacts-table.tsx`. This work does not start until that branch lands; the two must never be edited concurrently.
- **`@dnd-kit/core` is the only new dependency this spec may add.** It is used for CAP-13 and nothing else, is added at the workspace root with the other shared dependencies, is version-pinned, and must resolve for both apps. Every other change composes `components/ui` and `lucide-react` as before.
- **Drag must not break the pinned run.** The removed menu items refused to move a pinned column; a drop that would reorder `select` or the identity column is **rejected**, not silently ignored, and the *resulting order* is validated before it is committed — not just the drop target. `docs/manage-grid-pattern.md` exists because that rule has been got wrong before.
- **Date fields are TEXT columns.** `date_of_birth`, `initial_contact` and `last_contacted_on` are all `TEXT` (`20261004000000_create_core_tables.sql:11,17,18`). Ordering comparisons work only because the editor writes fixed-width `YYYY-MM-DD`; relative-date operators **must** parse to a real `Date`, and an unparseable value must be handled explicitly rather than silently dropping rows.
- **Relative dates serialize to an absolute boundary.** *Yesterday* and *7 days ago* are computed once and stored as a fixed range, so a shared URL does not mean something different tomorrow and no assertion depends on the wall clock.
- **Existing row height wins over the brief's suggested band.** `GRID_ROW_HEIGHT.default` is 32px and `design-constraints.md` mandates it; the default does **not** flip to dense.
- **Verification is the real gate.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`, `pnpm test:e2e`. `pnpm test` runs zero tests, CI does not run e2e, and `pnpm build` is not a type gate because `next.config.mjs` sets `ignoreBuildErrors`. One e2e runner at a time; a full run is 5–7 minutes against a shared seeded database.
- **Assertion edits are a last resort.** If a matrix row goes red, fix the source. Two deliberate exceptions exist, each requiring the updated assertions in the same commit and a recorded reason: CAP-3's blank-not-dash change, and CAP-10's retirement of the keyboard openers.
- **CAP-10 supersedes shipped behaviour, and that is the point.** It retires upstream story 2's `e` key, printable-character type-to-edit and `Space`-seeding, and it reverses upstream AC4's "clicking away mid-edit writes nothing." Roughly 95 `press()` calls across five spec files depend on the retired openers. They are updated deliberately and each retired assertion records *why*, so a later agent does not read a green suite as evidence the keyboard model is intact.
- **An unchanged draft must never produce a request.** `openEditor` seeds the draft from the cell's current value, so a blur with no keystrokes is a no-op by definition. Without that guarantee every cell click becomes a PATCH.

- **The suggested component file names.** The brief offers `DataGridCell`, `EditableCell`, `CellEditor`, `ActiveCellManager` and `useCellEditing`. The **responsibilities** are adopted and mapped onto what already exists; the filenames are not. `grid-row.tsx` is the cell, `use-grid-keyboard.ts` is the editing hook, `grid-editors.tsx` is the editor registry, and a separate `ActiveCellManager` would duplicate the first two. Duplicating a client root also means auditing it twice under `verify-monorepo-guardrails.mjs`.
- **New file extensions for the existing grid.** Nothing is forked. A new file is justified only when it has a single responsibility no existing module owns.

## Non-goals

- **Per-option colored pills.** Airtable's loudest visual cue, and the most-rejected idea in this spec. It is transcription from a screenshot rather than a stated operator need; eleven pastel hues would bury the deliberate royal-blue brand token; and a stable-hash palette collides at small palette sizes. Revisiting it needs an explicit `data-*` assertion surface and a decision on whether tone belongs to the *option* (a payload change across four files) or the *field*.
- **Ask AI / natural-language filtering.** An LLM call per keystroke on a table this size is a large bill for little value, and it is a flaky test by construction on a single-runner seeded suite — a flake that lands on every spec that runs after it. Parked deliberately.
- **Saved, named or shared views.** A view is a stored object: a table, a migration, a new `/api/manage/*` route (`proxy.ts` does not match it — a known gap), and for *shared* views a staff trust model `public.users` does not have. The toolbar's view control is a label over URL-backed state.
- **Server-side pagination.** `data-loading-decision.md` §3 closed on client-side virtualization over the full scoped set; the set is already fully materialized server-side, so paging would be a new capability that does not reduce server reads.
- **Light/dark theme work.** Owned by story 6 of `spec-grid-keyboard-editors-and-theme` and unstarted; `ThemeProvider` is still unmounted. This work is graded in whatever theme exists and must not mount the provider.
- **New column virtualization.** Already excluded upstream as interacting with the sticky header, frozen run and `columnOrder`.
- **Porting record review to Sessions or Attendance.** The panel is built table-agnostic so a later port copies it; only Contacts is ported here.
- **A second table implementation, a new data-fetch path, or fabricated/seeded production data** to make a column look fuller.

- **Retiring the keyboard openers is not a regression to be quietly fixed.** CAP-10 removes `e`, type-to-edit and `Space`-seeding on purpose. A spec that later "helpfully" restores one has undone an explicit product decision.

## Success signal

An operator opens `/manage` → Contacts with 226 contacts. The grid reads as one compact surface at 32px rows; `Name` is the one visually weighted column; a single click leaves a restrained outline on the active cell without any input appearing; `Date of Birth` reads as genuinely empty rather than as a wall of dashes. They double-click a name, type a correction, and click away — the value saves, and no request was made for the cells they merely clicked. They set a filter condition and the result count narrows live above the grid; they add a second condition and switch the connective from *match all* to *match any*, and 41 of 226 rows remain after a reload — the `is empty` condition included. They drag `Notes` two columns left and the order survives a refresh. They use the row's review control and a panel opens beside the grid with every location and staff field as a name; they force a failed save, read the server's own message, and watch the cell revert. They close it and find their filter, sort, selection and scroll position exactly where they left them. Every one of those flows is a committed Playwright spec, all nineteen existing matrix rows are still green, and `grep -rn "dark:" components/grid/` is still zero.

## Assumptions

- The `/dev/grid-preview` harness (500 synthetic rows) is available for visual grading without the local Supabase stack. **Verified** that it exists; assumed to stay current with the primitive.
- Row counts are a few hundred, per the brief's screenshot. `data-loading-decision.md` §3 flagged this as unverified. Above roughly ten thousand rows, existing virtualization still covers rendering and the client row models remain correct, so no re-architecture is implied.
- The brief's "record creation action" is already shipped by upstream story 5 (`grid-row-lifecycle.tsx`, `GridRowAddControl`, `data-grid-add-record`). CAP-6 requires it stay reachable from the redesigned toolbar, not a new implementation.

## Open Questions

- **OQ-1 — View semantics.** The brief asks for a view selector; no view backend exists. (a) a static label over URL-backed view state, ships now; (b) per-user saved views, needs a table, migration and route; (c) shared views, additionally needs a staff trust model. **This spec assumes (a).**
- **OQ-3 — Panel placement.** Right-side sheet (Airtable's pattern; keeps the grid visible, which is what lets CAP-5 claim state is preserved) or modal. **This spec assumes a right-side sheet.**
- **OQ-5 — Sequencing. Story 5 landed UNFINISHED.** `bmad-loop` committed `b2a0f67 feature/story-5-unfinished` on `feat/grid-keyboard-editors-and-theme`; the story file reads `status: 'in-progress'`. **The worktree is clean because the partial work was committed, not because the story finished** — an earlier reading of this spec got that wrong. Four capabilities here build directly on story 5's output: CAP-5 and CAP-6 on the `statusMessage` channel, CAP-7 on the commit path, CAP-13 on the header. **Verify story 5's actual shape before story 1 starts** — whether `GridRowLifecycle`, `GridRowAddControl` and the per-row delete outcome reporting are complete, and whether `docs/manage-grid-pattern.md`'s new section is finished. Story 1 (the edit model) does not depend on it and can start.
- **OQ-6 — Panel opening gesture.** Row click is discarded, because a double-click now means "edit" and the two gestures would collide. (a) a dedicated control in the row's action column, (b) `Enter` on a focused cell, (c) a row overflow menu. **This spec assumes (a)** — the only option that does not conflict with CAP-10's commit rules.
- **OQ-7 — Double-click vs. text selection.** A double-click on a cell with existing text selects the word, and the browser does that before any handler runs. Does editing win? **This spec assumes yes**, meaning `preventDefault` on the cell's double-click and no word selection inside editable cells.
- **OQ-10 — Keyboard column reordering. WITHDRAWN.** `@dnd-kit/core` supplies a `KeyboardSensor`, so drag-and-drop is keyboard-operable and removing `Move left` / `Move right` is **not** the accessibility regression this spec previously recorded it as.
- **OQ-14 — Relative-date evaluation.** Relative presets are computed against "today" in the browser, which makes a shared URL non-reproducible and a test clock-dependent. (a) serialize the computed absolute boundary so the filter stops moving, (b) serialize the literal preset and re-evaluate so the filter stays live. **This spec assumes (a)** — determinism over liveness, consistent with declining saved views.
- **OQ-11 — Filter contents. SUPERSEDED by OQ-18.** The modal is no longer a modal; it is an inline bar, and `+ Add condition` **is** in scope. Only the condition *group*, "Copy from another view" and Ask AI remain out.

- **OQ-13 — One condition or several. RESOLVED by Dwaraka.** Several. `+ Add condition` adds a row; the connective is **one `and` / `or` select governing the whole list**, so the list is never a mixed `A and B or C` expression and needs no precedence rules. A single condition still composes with the global search `q`, because `f.<colId>` already ANDs across columns. See CAP-12.

- **OQ-18 — Filter surface shape. RESOLVED by Dwaraka.** An **inline bar** above the grid, not a modal. This reverses the modal decision recorded in `surface-and-toolbar.md`, and it is a net simplification: the bar sits above the grid, so **the matching-row count updates live as conditions are composed** — the one piece of Airtable's inline bar this spec had planned to *carry across into* the modal by hand. The modal's compensation for that blind spot is now unnecessary. The cost is the one the modal was chosen to avoid: the bar occupies permanent vertical space.

- **OQ-19 — Where a condition list lives in the URL. RESOLVED by Dwaraka.** `f.<colId>` **stays**, keeping its AND-across-columns semantics, so matrix row 17's `f.location` round-trip assertion is untouched and every existing shared URL keeps its meaning. Match-**any** conditions need a new key family mirroring the existing prefixes. No ordered expression is ever serialized, because there is no mixed expression to serialize.

- **OQ-20 — An empty filter value cannot round-trip. CONFIRMED DEFECT, found while settling OQ-19.** `grid-view-state.ts:130` reads `if (raw !== null && raw.trim().length > 0)` and `:211` writes `if (value.length > 0)`. An empty value is therefore indistinguishable from an absent one and is **dropped in both directions**. `Current status · is empty` — the first condition in the reference screenshot — silently vanishes on reload. This is already true today; `+ Add condition` only makes it visible more often.

- **OQ-21 — The operator must be in the serialized value. CONSEQUENCE of OQ-12, previously unstated.** `f.<colId>` today holds a bare value, so `contains` and `is` are indistinguishable in a URL. Per-type operators (OQ-12) cannot round-trip without the operator travelling with the value, and OQ-20 means a bare encoding cannot express `is empty` either. **The value must carry its operator** — e.g. `f.status=is:`, where the token is non-empty as a whole so it survives the `:130` and `:211` guards. This was a latent hole in the previous derivation of this spec, which asserted round-tripping without specifying a shape that could round-trip.

## Resolved Questions

- **OQ-2 — Edit activation and commit. RESOLVED by Dwaraka.** Inline edits open on **double-click only**; a second double-click commits; **blur also commits**; **Enter persists** and **Escape discards**. The keyboard openers `e`, printable-character type-to-edit and `Space`-seeding are **retired**. Because blur commits, an edit can no longer be abandoned by clicking away, so the dirty-flag prompt and its confirmation dialog are **deleted** from the record panel rather than built. See CAP-10.
- **OQ-4 — Default row height. RESOLVED by Dwaraka.** The default stays at **32px**. The "dense by default" idea is dropped; dense remains a user-selectable option. This supersedes the earlier assumption recorded in this spec.
- **OQ-8 — Keyboard editing. RESOLVED by Dwaraka.** Double-click remains the **only** edit opener. The second requirements block's *"avoid using double-click as the only way to discover editing"* is **not** a reversal of OQ-2; it is read as a requirement that the active-cell affordance make editing discoverable, and that arrows/Tab/Home/End/Escape keep working. CAP-10 is unchanged.
- **OQ-9 — Column reordering. RESOLVED by Dwaraka.** `Move left` and `Move right` are **removed** from the column menu and replaced by **drag-and-drop via `@dnd-kit/core`**. See CAP-13. This supersedes the menu-based approach `grid-header-cell.tsx:116-120` chose deliberately, and `docs/manage-grid-pattern.md` needs updating in the same commit.
- **OQ-11 — Filter modal contents. RESOLVED by Dwaraka, then SUPERSEDED by OQ-18 and OQ-13.** *(Historical, kept because it is the decision that was overturned.)* The answer at the time was: the modal is **Field · operator · value** and nothing else — no Ask AI, no `Copy from another view`, no `+ Add condition`, no `+ Add condition group`. **Two of those four exclusions no longer hold.** `+ Add condition` ships; the condition group, "Copy from another view" and Ask AI remain out. See OQ-13, OQ-18 and CAP-12.
- **OQ-12 — Operator sets. RESOLVED by Dwaraka.** Operators are **per field type**, not one global list. This is why the brief's text-only six did not silently remove numeric filtering: number gets relational comparison, date gets its own set plus a relative-date value picker, checkbox gets one fixed operator with a checkbox value, and select/multiselect get `is any of` / `is none of`.
- **OQ-15 — Checkbox filter control. RESOLVED by Dwaraka.** The operator select **is shown**, with a single entry. Uniform with every other field type, at the cost of a one-option control.
- **OQ-16 — Converting the date columns to `DATE`. MOVED to its own spec.** See `../spec-contacts-date-types/SPEC.md`, which is written to run **before** this one. It is blocked on a **data audit**, not on code: `scripts/migrate-airtable-data.mjs:532-539` stringifies numeric Airtable fields, so a date column may hold `"35000"` and the `ALTER … TYPE date` cast would throw or silently produce year 35000. Two findings since recorded there: the client type ripple is **zero** (`lib/supabase/types.ts` already types these as `string`, which is what `date` also generates), and RLS references these columns **zero** times, so neither blocks the change. `last_contacted_on` still needs its own bug fix first — it is written once at insert (`lib/supabase/data.ts:614-621`) and never updated, so it means "created on".