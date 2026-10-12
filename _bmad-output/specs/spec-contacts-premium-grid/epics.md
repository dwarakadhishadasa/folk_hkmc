---
status: draft
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
validation:
  fr_coverage: pass
  ux_dr_coverage: pass
  nfr_coverage: pass
  placeholders_replaced: pass
  story_quality: pass
  story_dependencies: pass
  epic_independence: pass
  file_churn: pass
  open_checks: 0
inputDocuments:
  - _bmad-output/specs/spec-contacts-premium-grid/SPEC.md
  - _bmad-output/specs/spec-contacts-premium-grid/existing-state.md
  - _bmad-output/specs/spec-contacts-premium-grid/surface-and-toolbar.md
  - _bmad-output/specs/spec-contacts-premium-grid/stories.yaml
  - _bmad-output/specs/spec-contacts-date-types/SPEC.md
  - docs/manage-grid-pattern.md
  - docs/architecture/testing.md
---

# folk_hkmc — Premium Contacts Grid — Epic Breakdown

## Overview

Epic and story breakdown for the premium `/manage` → Contacts grid
(`SPEC-contacts-premium-grid`), decomposing the 16 capabilities in `SPEC.md`
into implementable stories with acceptance criteria.

**Source shape.** This project has no PRD/Architecture pair for this work. The
contract is spec-shaped, so the mapping is:

| This document's section | Source |
|---|---|
| Functional Requirements | `SPEC.md` § Capabilities (CAP-1…CAP-16) |
| NonFunctional Requirements | `SPEC.md` § Constraints, § Non-goals, CAP-8 |
| Additional Requirements | `existing-state.md`, `surface-and-toolbar.md` |
| UX Design Requirements | `surface-and-toolbar.md` (visual + interaction contract) |

**This run supersedes `stories.yaml` (8 stories, derived 2026-10-09).** Coverage
was checked mechanically — one `grep -o "CAP-n"` per capability — and two
gaps were found: **CAP-1 had zero mentions**, and **CAP-2 was half-owned**
(story 3 claimed only its empty-state half). Both are now owned. The breakdown
becomes 10 stories.

**Ordering.** Load-bearing. Story 1 changes the edit model that 3, 5, 6 and 7
are written against. Story 2 owns `grid-header-cell.tsx`, which story 3's
sibling files overlap. Story 6 runs after `../spec-contacts-date-types/` has
landed. Story 8 needs story 1's commit rules and story 4's renderers.

**Environment.** Grid primitives need no stack — `/dev/grid-preview` (500
synthetic rows) grades them. Every `/manage` story needs the local stack
(`pnpm dev:local`) and `pnpm test:e2e`. **One runner at a time**; a full run is
5–7 minutes against a shared seeded database.

---

## Requirements Inventory

### Functional Requirements

`FRn` maps 1:1 onto `CAP-n`. The CAP tag is retained because every downstream
artifact — `stories.yaml`, the per-story files, `matrix-coverage-map.md` —
addresses these by CAP.

```
FR1 (CAP-1) Page header and navigation. The five manage tabs (Dashboard,
Contacts, Sessions, Attendance, Favorites) are preserved in order as
MANAGE_VIEWS; the active tab is distinguishable at a glance; the page title
and its metadata line (staff name, contact count, location count) form one
visual unit; the scope indicator aligns to that unit's baseline; the header
block loses vertical height without cramping the tab row.

FR2 (CAP-2) Grid surface maturity. Consistent row height, cell padding,
alignment and header styling; hairline dividers rather than heavy borders;
sticky header on vertical scroll; horizontal scroll preserved; the final
column is never clipped; exactly one scroll container exists (no nested
scrollbar); row-selection checkboxes stay aligned to their rows. The
max-h-[70vh] cap is replaced by filling the space the grid is given.

FR3 (CAP-3) Type-keyed cell renderers. Reusable renderers keyed by field type
cover text, select, multiselect, date, number, boolean, linked record and
longtext; the field-type marker is its own key on GridColumnMeta, independent
of meta.grid.editor; editable and read-only cells are visually distinguishable;
truncated text exposes its full value on inspection; no value is ever
fabricated to make a column look fuller.

FR4 (CAP-4) Linked-record labels. Every location and staff cell renders a
human label; an id with no matching lookup renders a visibly unresolved
marker, distinct from empty; location and collectedBy degrade consistently;
no label is ever derived from the id.

WITHDRAWN 2026-10-12 by Dwaraka. FR5 (CAP-5) Record review is NOT built. There is no record
panel, no per-row open affordance and no prev/next. What the panel would have
served — reading a whole record at once — is served by the grid itself: the
joined accessor columns (location, collectedBy) are visible by default under
CAP-18, so CAP-4's labels and unresolved markers stay on screen. The trade is
real and recorded: a hidden field is now reachable only by unhiding it, so
CAP-18's default set has to be right. Kept as history so the FR numbering and
the traceability matrix below stay coherent — do not reinstate.

FR6 (CAP-6) Toolbar and views. One compact band carries scoped search, a count
of active filter conditions, a current-view label, column visibility and
ordering, record creation, and visible result and selection counts; the
bulk-action bar appears only while rows are selected; the selection count
remains visible in the resting state; no control is present that does not work.

FR7 (CAP-7) Edit safety. Validation runs before save; save progress and error
are visible; a rejected write shows the server's own message and reverts the
cell; the existing PATCH/bulk API and its authorization are used unchanged.

FR8 (CAP-11) Active-cell state. A single click makes a cell the active cell
with a clear but restrained outline of consistent colour and thickness; it is
held in React state, not CSS :hover; it is visually distinct from both row
hover and row selection; a selected row and an active cell coexist; arrows move
it; no indicator changes a cell's dimensions or shifts its content.

FR9 (CAP-12) Filter conditions bar. An inline bar above the grid shows the
conditions for the view, each row carrying Field, operator and value, plus
+ Add condition — and no condition groups, no saved views, no "Copy from
another view", no AI prompt; the operator list AND the value control both
depend on the field's type; ONE connective (match all / match any) governs the
whole list, so a list is never a mixed `A and B or C` expression; changing the
field type resets operator and value to something valid; each condition can be
deleted on its own; the per-column filter popover is gone; the column menu's
Filter item reveals the bar with that column's condition pre-filled; an active
filter is visibly indicated in both the toolbar and the header; the result
count updates live as conditions are composed; every condition round-trips
through the URL.

FR10 (CAP-13) Column reordering by drag. A column header can be dragged to a
new position using @dnd-kit/core, which supplies pointer, touch AND keyboard
sensors; the new order persists through the cols URL parameter and is written
once on drop; a column in the pinned run is not draggable; any resulting order
that would interleave a scrolling column into the pinned run is rejected
BEFORE it is committed, leaving the order unchanged.

FR11 (CAP-14) Header affordance hygiene. The column menu contains exactly Sort
ascending, Sort descending, Hide column, Filter; the menu control is revealed
on header hover and on keyboard focus; it is never hidden from a touch user; it
is suppressed on the selection column and on any header that supplies its own
control.

FR12 (CAP-8) Accessibility and performance. Every interactive element has an
accessible name; keyboard navigation and visible focus states work throughout;
adequate contrast and hit targets; no layout shift while loading; no
gratuitous rerenders; no new virtualization beyond what exists; the grid
remains usable at 1024px.

FR13 (CAP-9) Scope preservation. TanStack Table v8 and @tanstack/react-virtual
v3 remain the engine and their installed APIs are used as-is;
components/grid/ remains table-agnostic; no filtering, sorting or persistence
logic is duplicated; no new dataset fetch is added; both apps stay mirrored;
pnpm guardrails passes.

FR14 (CAP-15) Cell and grid metrics. Cell text is 13px and column headers
12-13px; row height is the existing 32px default with dense 28px remaining a
user option (the default does not flip); cells are vertically centred with ~8px
horizontal and 4-6px vertical padding; overflowing text truncates with an
ellipsis and the full value stays reachable; numbers are right-aligned and
tabular; linked records render as readable labels; no cell ever changes its
row's height.

FR15 (CAP-16) Interaction boundaries. A checkbox click never activates an
edit; dropdown and popover interactions never trigger a double-click edit; a
read-only field never enters edit mode; a single cell click preserves existing
row navigation conventions; keyboard propagation is stopped only where a
specific key would otherwise be swallowed.

FR16 (CAP-10) Edit activation and commit. A double-click opens the editor on
every editable field type and NO other gesture opens it; a second double-click
commits; moving focus away commits; Escape is the only way to discard; the
keyboard openers e, printable-character type-to-edit and Space-seeding are
gone; blur-commit goes through the single commit path and fires NO request when
the draft is untouched; arrow/Tab/Home/End navigation and Space-on-checkbox
continue to work, because they are not edit openers.
```

### NonFunctional Requirements

```
NFR1  Token-clean grid. Zero raw hex, rgb(, white or black under
      components/grid/. Hierarchy is expressed with weight, space and existing
      semantic tokens — never a new literal colour or a per-option hue.

NFR2  Table-agnostic primitive. Zero Manage*, /api/manage or contacts
      vocabulary under components/grid/.

NFR3  One commit path. use-grid-keyboard.ts owns draft, optimistic display and
      visible revert. A typed editor supplies parsing and validation only; a
      second mutation channel is a defect.

NFR4  Fixed row heights are load-bearing. The virtualizer estimates from
      GRID_ROW_HEIGHT (grid.tsx:633). Long text truncates and edits in a
      popover. Nothing may make a row grow.

NFR5  Authorization unchanged. Writes go through lib/manage/api-handlers.ts
      with getStaffContext + requireRole, validated against
      MANAGE_CONTACT_PATCH_KEYS. No direct Supabase from a component; no new
      authorization logic.

NFR6  @dnd-kit/core is the ONLY new dependency this spec may add. Added at the
      workspace root with the other shared dependencies, version-pinned,
      lockfile committed, and resolving for BOTH apps. Every other change
      composes components/ui and lucide-react as before.

NFR7  Both apps stay byte-identical where they already are. md5sum the
      layout.tsx files and both api/manage/contacts/route.ts files after
      editing.

NFR8  Verification gates: pnpm typecheck:workspace, pnpm lint, pnpm guardrails,
      pnpm test:e2e all green. pnpm test is NOT a gate (it runs zero tests and
      exits 0); CI does not run e2e; pnpm build is not a type gate because
      next.config.mjs sets ignoreBuildErrors. One e2e runner at a time.

NFR9  Assertion edits are a last resort. Two deliberate exceptions exist — the
      blank-not-dash change and the retirement of the keyboard openers — each
      requiring the updated assertions in the same commit AND a recorded
      reason. Fix the source in every other case.

NFR10 Determinism over liveness for dates. Relative-date presets serialize to a
      computed absolute boundary, so a shared URL does not mean something
      different tomorrow and no assertion depends on the wall clock.

NFR11 Unparseable TEXT dates are handled explicitly. date_of_birth,
      initial_contact and last_contacted_on are TEXT columns. Relative
      operators must parse to a real Date; a non-YYYY-MM-DD value is excluded
      with a visible reason or reported as unparseable — never silently
      dropped, because a NaN comparison removes the row from every
      date-filtered view with no error and no failing test.

NFR12 DOM contract preserved. Every data-grid-* attribute in
      e2e/fixtures/manage-grid.ts stays present and keeps its documented
      meaning. Add attributes; do not repurpose existing ones.

NFR13 Matrix integrity. All 19 rows in matrix-coverage-map.md stay Covered, or
      a retired row's reason is recorded in that file in the same commit.

NFR14 Visual verification is a recorded manual pass, not an assertion. Hover,
      active, editing and selected distinctness is checked at 1440x900 and
      1024x768, in light and in whatever theme exists, with the outcome written
      into the story file.

NFR15 No product decision silently reversed. e, type-to-edit and Space-seeding
      STAY GONE. A later story that restores one has undone an explicit
      decision, not fixed a bug.

NFR16 No deliberately broken spec is ever committed to e2e/specs/ — that is a
      permanently red suite. Generate failures into a temp dir and remove them
      in a finally.
```

### Additional Requirements

- **Upstream story 5 landed UNFINISHED.** `bmad-loop` committed
  `b2a0f67 feature/story-5-unfinished`; the story file reads
  `status: in-progress`. The worktree is clean because the partial work was
  committed, not because the story finished. **Verify its actual shape before
  story 1 starts** — whether `GridRowLifecycle`, `GridRowAddControl` and the
  per-row delete outcome reporting are complete, and whether
  `docs/manage-grid-pattern.md`'s new section is finished. CAP-6, CAP-7 and
  CAP-13 all build on it. Story 1 does not.
- **This spec runs AFTER `../spec-contacts-date-types/`**, which converts the
  three date columns to `DATE`. CAP-12's date operators are written against
  that type.
- **`grid.tsx` emits `<table>` directly** rather than using
  `components/ui/table`, because that wrapper's div is a second scroll
  container. Keep it that way.
- **The DW-27 rules bind.** A closed-state editor display must render
  `ctx.text`, never `ctx.getValue()`. And a column is never marked `editable`
  *and* given a `cell` widget — a widget replaces the value the grid would
  print, and `cell.text` is where the optimistic override lives, so an
  editable column with a widget silently shows the old value for the whole
  round trip with no error anywhere.
- **`grid-row.tsx:165-232` is correct and must not be rewritten.** Keep the
  `[&>td]:border-b` hairline, the doubled `[data-grid-cell-selected]`
  attribute that raises specificity above the row-level `>td` rules, the
  per-cell hover and selection on frozen cells, and the single `border-r` on
  the last frozen column only.
- **`grid.tsx:773-806` `moveColumn` logic is reused** by the drag drop handler
  — it reads the full order, steps while skipping hidden columns, no-ops when
  the target is unchanged, and calls `setColumnOrder`. `canMoveLeft` /
  `canMoveRight` go. A naive index splice will not skip hidden columns, and a
  hidden column still holds a position in `columnOrder`.
- **Column order commits through the transient handle**
  (`beginTransientChange` / `commitTransientChange` / `cancelTransientChange`,
  `grid-view-state.ts:184-196`). Nothing per frame, one write on drop. The
  width drag at `grid.tsx:456` is the worked example.
- **Three source comments state decisions this spec reverses and must be
  rewritten in the same commit:** `grid-editors.tsx:181-189` ("Closing is a
  discard"), `grid-editors.tsx:195-199` (the stale reason for
  `stopPropagation` — keep the handler, rewrite the reason), and
  `grid-header-cell.tsx:116-120` (menu-based reordering).
- **`docs/manage-grid-pattern.md` needs updating in the same commit** for: the
  `meta.grid.filter` table, the Move left / Move right section, and the
  per-column filter control.
- **`grid-view-state.ts:9-15` carries the six URL keys** — `q`, `f.<colId>`,
  `sort`, `cols`, `hide`, `size.<colId>`. Nothing this spec adds fetches again.
- **Pre-existing proxy gap:** `proxy.ts:9-20` matches neither `/manage` nor
  `/api/manage/*`, so session refresh does not run for the manage surface.
  Any new `/api/manage/*` route inherits it. **This spec adds no route.**
- **`GRID_EMPTY_TEXT`** is the em-dash at `use-grid-keyboard.ts:20`, applied at
  `:951` and `:1753` and consumed at `grid-row.tsx:78` and `:199`. Three specs
  assert it.
- **Roughly 95 `press()` calls across five spec files** depend on the retired
  keyboard openers.

### UX Design Requirements

```
UX-DR1   The page title and its metadata line form ONE visual unit; the scope
         indicator aligns to that unit's baseline, not to the bottom of a
         separate flex-col column. One block, one alignment.

UX-DR2   The active tab is unmistakable — weight plus the existing
         --program-primary brand token, not a new colour. space-y-6 between
         header, scope notice, tab list and content is tightened; the tab row
         is not cramped.

UX-DR3   The two scope-toggle hover backgrounds move from hover:bg-black/5
         (manage-portal.tsx:84, :92) to hover:bg-foreground/5, which resolves
         on both light and dark surfaces.

UX-DR4   ONE scroll container. The grid fills the space it is given rather
         than asserting max-h-[70vh], because a vh-capped inner scroller
         inside a page that also scrolls produces a viewport-height-dependent
         frame whose last column's right edge is exactly where the horizontal
         scrollbar's thumb sits. Scroll shadows are banned as the workaround.

UX-DR5   Exactly one visual emphasis per row — the identity column carries
         weight. Today no column declares a weight, so ten columns at
         identical volume leave identity unreadable as identity.

UX-DR6   Hairlines, not heavy borders: [&>td]:border-b with
         border-separate border-spacing-0, and one border-r for the whole
         pinned run on its last member only.

UX-DR7   Sticky frozen cells keep their own opaque bg-card; row hover and
         selection are driven per cell, not on the <tr>. The doubled
         [data-grid-cell-selected] attribute stays — do not simplify it.

UX-DR8   The header is visually distinct from the body via a subtle surface
         change. No new colour, no raw token.

UX-DR9   The empty state is genuinely empty. The em-dash placeholder is
         removed; across 226 rows and five sparse columns it is over a
         thousand em-dashes.

UX-DR10  An unresolved linked record renders a marker visibly DISTINCT from
         empty. A contact with no location and a contact with a dangling
         location reference are different facts, and collapsing them loses a
         data-quality signal.

UX-DR11  Toolbar work is compaction and hierarchy, not construction. The
         statusMessage live region stays reachable and announced. Bulk actions
         move into a separate contextual bar that appears only on selection,
         and the selection count remains visible in the resting state. The
         toolbar's filter role becomes a **count of active conditions** — with
         the bar permanent there is nothing left to open, so an "open filter"
         button would be a control that does nothing.

UX-DR12  The view control is a static label over URL-backed view state. It
         must NOT present a dropdown of views that do not exist — a control
         that looks like a view selector and cannot save a view is exactly the
         nonfunctional button the brief forbids.

WITHDRAWN 2026-10-12 by Dwaraka — moot, there is no panel.

UX-DR13  (withdrawn with FR5) The record panel was to be a RIGHT-SIDE SHEET,
         not a modal.

UX-DR14  (withdrawn with FR5) The panel was to show ALL fifteen fields,
         including ones hidden or scrolled
         off in the grid — a record review that shows a subset is a second
         grid. Read-only fields are visibly read-only. Linked records render
         as labels and link to the EXISTING /manage?view=... routes, not new
         ones. The attendance history is included; it is already loaded. NO
         delete control inside the panel.

UX-DR15  The filter surface is an INLINE BAR, not a modal (OQ-18). The bar
         carries one row per condition — Field · operator · value, each with a
         delete and a drag handle — plus `+ Add condition`, and shows the
         matching row count LIVE as conditions are composed. That live count is
         the reason the bar is preferred: it is the one piece of Airtable's
         inline bar that the abandoned modal design had to reconstruct by hand
         inside a covering dialog, and it is free here.

UX-DR16  The header menu control is revealed by an opacity/visibility treatment
         that leaves it focusable and tappable. NEVER display:none — a header
         with no visible menu and no hover is an unreachable feature for touch
         users.

UX-DR17  Metrics are a stated contract, not incidental values: cell text 13px
         (GRID_BASE_FONT_CLASS), column headers 12-13px, row height 32px
         default with 28px dense as a user option, px-2 horizontal and 4-6px
         vertical padding, truncate plus title, numbers right-aligned with
         tabular figures.

UX-DR18  The density control must initialise from GRID_ROW_HEIGHT.default. If
         the default ever changes without the control initialising from the
         same constant, it reads "Default rows" while the grid renders dense —
         a visible lie.

UX-DR19  The active-cell affordance must make editing discoverable without a
         keyboard opener, because double-click is the only opener (OQ-8).

UX-DR20  Per-option coloured pills are NOT shipped. Eleven pastel hues would
         bury the deliberate royal-blue brand token and a stable-hash palette
         collides at small palette sizes. Revisiting requires an explicit
         data-* assertion surface and a decision on whether tone belongs to the
         option (a payload change across four files) or the field.
```

### FR Coverage Map

All 16 functional requirements are mapped. Two are split across stories within
an epic; both are called out below rather than being quietly claimed complete
at the first story.

```
FR1  (CAP-1)  Epic 3  - S8 page header, navigation and scope
FR2  (CAP-2)  Epic 2  - S5 one scroll container, surface does not clip
FR3  (CAP-3)  Epic 2  - S3 type-keyed cell renderers
FR4  (CAP-4)  Epic 2  - S3 linked-record labels and unresolved marker
FR5  (CAP-5)  WITHDRAWN 2026-10-12 — not built; see FR5's definition above
FR6  (CAP-6)  Epic 3  - S7 toolbar compaction and contextual bulk bar
FR7  (CAP-7)  Epic 1  - S1 edit safety on the blur-commit path
FR8  (CAP-11) Epic 2  - S4 active-cell state
FR9  (CAP-12) Epic 3  - S6 the filter conditions bar
FR10 (CAP-13) Epic 2  - S2 column drag-and-drop via @dnd-kit/core
FR11 (CAP-14) Epic 2  - S2 menu structure + contextual header affordance
                  Epic 3  - S6 adds the Filter item, completing the four
FR12 (CAP-8)  Epic 4  - S10 accessibility and performance gate
FR13 (CAP-9)  Epic 4  - S10 scope-preservation gate
FR14 (CAP-15) Epic 2  - S4 cell and grid metrics contract
FR15 (CAP-16) Epic 4  - S10 the seven interaction boundaries
FR16 (CAP-10) Epic 1  - S1 double-click edit model, blur-commit, retirement
```

**Unmapped FRs: none.**

**Two deliberate splits:**

- **CAP-14 (FR11)** is split. `surface-and-toolbar.md` binds `grid-header-cell.tsx`
  to CAP-13 and CAP-14 together, but CAP-14's fourth menu item — Filter —
  opens the filter modal, which is a **later** story gated behind
  `../spec-contacts-date-types/`. S2 therefore ships Sort ascending, Sort
  descending and Hide column plus the contextual affordance, and S6 adds Filter.
  *Rationale:* a menu item pointing at a modal that does not exist is exactly
  the nonfunctional control `surface-and-toolbar.md` §CAP-6 and FR6 forbid.
  Shipping it would make FR11 fail rather than defer. CAP-14's "exactly four
  items" is therefore **not satisfied until S6**.
- **CAP-7 (FR7)** rides S1's blur-commit path: validation before save, visible
  progress, the server's own message, and revert. There is exactly one
  validation story and one message surface — `use-grid-keyboard` owns them, and
  nothing else renders a competing error. *(The former panel half rode the
  withdrawn S9.)*
  second error surface.

**CAP-16 (FR15)** is primarily Epic 4's closing gate, but its edit-side
boundaries are *established* by S1 and *proved* by S10. The six-of-seven
mechanisms already exist in the source; the new risk the spec names is a
double-click landing on a popover editor, which only becomes reachable once
S1 makes double-click the sole opener.

### Requirements Coverage Audit

Step 3 §6 requires every extracted UX Design Requirement to be covered by at
least one story. Audited mechanically against all 20.

| UX-DR | Covered by | | UX-DR | Covered by |
| --- | --- | --- | --- | --- |
| UX-DR1 | 3.3 | | UX-DR11 | 3.2 |
| UX-DR2 | 3.3 | | UX-DR12 | 3.2 |
| UX-DR3 | 3.3 | | UX-DR13 | 4.1 |
| UX-DR4 | 2.4 | | UX-DR14 | 4.1 |
| UX-DR5 | 2.2 | | UX-DR15 | 3.1 |
| UX-DR6 | 2.4 | | UX-DR16 | 2.1 |
| UX-DR7 | 2.4 | | UX-DR17 | 2.3 |
| UX-DR8 | 2.4 | | UX-DR18 | 2.3 |
| UX-DR9 | 2.2 | | UX-DR19 | 2.3 |
| UX-DR10 | 2.2 | | UX-DR20 | 4.2 |

**Uncovered UX-DRs: none.** Three were uncovered at first pass — UX-DR8, UX-DR19
and UX-DR20 — and were assigned to 2.4, 2.3 and 4.2 respectively.

UX-DR19 deserves a note: it is the requirement that survives OQ-8's resolution
that double-click is the *only* edit opener. Nothing about editing is
discoverable from the keyboard any more, so the active-cell affordance has to
carry that job on its own. It is easy to lose in a refactor because nothing
breaks when it does.

**NFR coverage: all 16.** NFR5 (authorization unchanged) was the one without an
AC and now sits in Story 4.2's preservation gates.

### Relationship to stories.yaml

This document **supersedes** the 8-story `stories.yaml` of 2026-10-09. The
relative order of the stories both documents share is preserved; the delta is:

| Change | Why |
| --- | --- |
| Story 2.4 added (scroll container) | CAP-2's scroll half had **no owner** in `stories.yaml`. `surface-and-toolbar.md` names `max-h-[70vh]` as the actual cause of both symptoms CAP-2 lists — clipped final column and nested scrollbar — while the old story 3 claimed only the empty-state half. |
| Story 3.3 added (page header) | CAP-1 had **zero** mentions across all eight stories. |
| The `Filter` menu item moved from the header story to Story 3.1 | The old story 2 told the developer to add a Filter item opening the filter modal — but that modal is a later story gated behind `spec-contacts-date-types`. That ships a dead control, which FR6 and `surface-and-toolbar.md` §CAP-6 both forbid. |
| Stories regrouped 2.1–2.4 under one epic | `grid-header-cell.tsx`, `grid-row.tsx` and `grid.tsx` overlap; one epic with ordered stories keeps them sequential rather than concurrent. |

`stories.yaml` is **not** deleted by this document. It is the machine-readable
dispatch format `bmad-loop` consumes, so it needs reconciling before any run —
see Known Gaps item 6.

### Known Gaps and Inconsistencies — status 2026-10-10

Defects found in the input documents during extraction. Each was recorded
rather than silently patched, and each has since been dispositioned.

| # | Where | Defect | Status |
| --- | --- | --- | --- |
| 1 | `SPEC.md` Success signal | Said *"they add a condition group"* — a non-goal that OQ-11 and OQ-13 both removed. Also pointed at a header filter control that CAP-12 deletes. | **FIXED.** Rewritten; the other fourteen clauses were audited and are consistent. |
| 2 | `stories.yaml` | CAP-1 had **zero** mentions across all eight stories. | **FIXED.** Now story 3.3. |
| 3 | `stories.yaml` | CAP-2 was half-owned — story 3 claimed only the empty-state half; the `max-h-[70vh]` scroll half had no owner. | **FIXED.** Now story 2.4. |
| 4 | `surface-and-toolbar.md:290-310` | "Two filters, two indicators" duplicated, with a mangled `### The header's Filter item pre-fills` heading wedged between. | **FIXED.** Merged into one section. |
| 5 | `surface-and-toolbar.md:385-390` | Dead "### No library — nothing may be added", contradicting the `@dnd-kit/core` decision 70 lines above it. | **FIXED.** Struck through and kept deliberately, with a note that it sits *after* the decision that overturned it — the position most likely to mislead. |
| 6 | `stories.yaml:130` | "the story-5 filter modal" was ambiguous against upstream's story 5. | **FIXED.** Every reference is now explicit about which spec's story 5. |

### Reopened by the filter-bar decision

Deciding the filter surface raised more than it settled. These are **new**, not
carried over, and two of them are defects in shipped code.

1. **OQ-20 — an empty filter value cannot round-trip.**
   `grid-view-state.ts:130` reads `if (raw !== null && raw.trim().length > 0)`
   and `:211` writes `if (value.length > 0)`. An empty value is therefore
   indistinguishable from an absent one and is **dropped in both directions**.
   `Current status · is empty` — the first condition in the reference
   screenshot — silently vanishes on reload. This is a live bug today, before
   any of this work. `+ Add condition` only makes it reachable more often.

2. **OQ-21 — the operator must travel inside the serialized value.**
   `f.<colId>` holds a bare value, so `contains` and `is` are indistinguishable
   in a URL, and no bare encoding can express `is empty` either. Per-type
   operators (OQ-12) cannot round-trip without the operator travelling with the
   value. **The previous derivation of this spec asserted round-tripping without
   specifying a shape capable of round-tripping** — the requirement was stated
   but never made satisfiable. Found only because the connective decision
   forced the encoding to be spelled out.

3. **Match-**any** is new capability, not new UI.** The grid has no OR anywhere:
   TanStack's `getFilteredRowModel` ANDs column filters, so `f.a=x&f.b=y` means
   "both". Match-any is a new evaluation path plus a new URL key family. It
   should be sized as a capability, not as a dropdown.

4. **The bar is permanent vertical space** — the one cost the modal was chosen
   to avoid, now accepted in exchange for the live row count. It interacts with
   CAP-2's scroll work (story 2.4): the bar sits inside the same vertical
   budget, so the two stories should be graded together at 1024×768 rather than
   in isolation.

## Epic List

Four epics, ten stories. The structure is deliberately **coarse**: this design
is already validated — sixteen capabilities each carry an intent and a success
criterion, and all eight open questions carry a stated assumption — so
direction changes between slices are unlikely, and fewer/larger epics is the
correct read. Splits happen only at the five risk boundaries the spec itself
names.

**Consolidation rationale.** `components/grid/` is five files
(`grid.tsx`, `grid-row.tsx`, `grid-header-cell.tsx`, `grid-toolbar.tsx`,
`use-grid-keyboard.ts`) and *every* story in this spec touches at least one of
them. Organising by technical layer would put stories that edit the same file
into concurrent branches. Epic 2 therefore owns `grid-header-cell.tsx`,
`grid-row.tsx` and `grid.tsx` as **one epic with ordered stories** — the
"single component, fully pre-designed, no feedback loop" pattern — rather than
three epics that churn the same files.

### Epic 1: Editing that cannot lose work

An operator edits a cell the same way every time, and knows the value either
saved or told them why it did not.

**FRs covered:** FR16 (CAP-10), FR7 (CAP-7)

- **S1** — Double-click edit model, blur-commit, and retiring the keyboard
  openers `spec_checkpoint`

Owns `use-grid-keyboard.ts` and `grid-editors.tsx`. No other epic touches
these files, so this ships fully independently of the rest.

### Epic 2: A grid that reads as one premium surface

An operator scans ten columns and reads identity, field type and missing values
correctly — and arranges them by dragging a header that stays out of the way
until they want it.

**FRs covered:** FR2 (CAP-2), FR3 (CAP-3), FR4 (CAP-4), FR8 (CAP-11),
FR10 (CAP-13), FR11 (CAP-14), FR14 (CAP-15)

- **S2** — Column drag-and-drop, a clean column menu, and a contextual header
  affordance `spec_checkpoint`
- **S3** — Type-keyed cell renderers, linked-record labels, and blank-not-dash
- **S4** — Active-cell state and the cell-metrics contract
- **S5** — One scroll container, and a surface that does not clip `new`

Five stories in one epic, ordered. S2 must precede S3 and S4:
`grid-header-cell.tsx` and `grid-row.tsx` overlap, and reversing that order
turns a clean sequence into merge conflicts.

### Epic 3: Finding the records I need, and knowing where I am

An operator narrows to the records they need, and always knows which section and
scope they are looking at.

**FRs covered:** FR9 (CAP-12), FR6 (CAP-6), FR1 (CAP-1)

- **S6** — The filter conditions bar with per-field-type operators
  `gated on ../spec-contacts-date-types/`
- **S7** — Toolbar compaction, contextual bulk actions, and the current-view label
- **S8** — Page header, navigation, and scope `new`

S6 is gated because its date operators are written against the `DATE` type the
predecessor spec produces. S6 must precede S7: the redesigned toolbar's filter
control opens the modal S6 builds.

### Epic 4: Proving nothing regressed

Everything is still operable without a mouse, and the recorded visual pass is
written into the story file. *(Was: "Reviewing one record, and proving nothing
regressed" — the record-review half was withdrawn with FR5.)*

**FRs covered:** FR12 (CAP-8), FR13 (CAP-9), FR15 (CAP-16). FR5 withdrawn.

- **S10** — Interaction boundaries, accessibility, and the recorded visual pass
  `done_checkpoint`

S10 is the closing gate: it
depends on every prior story, which the dependency rules permit (an epic builds
on earlier epics) — it depends on no *future* story.

### File Churn Check

Step 4 requires validating whether overlapping core files across epics
represents unnecessary churn.

| File | E1 | E2 | E3 | E4 |
| --- | :-: | :-: | :-: | :-: |
| `use-grid-keyboard.ts` | ● | | | |
| `grid-editors.tsx` | ● | | | |
| `grid-header-cell.tsx` | | ● | ● | |
| `grid-row.tsx` | | ● | | |
| `grid.tsx` | | ● | ● | |
| `grid-toolbar.tsx` | | | ● | |
| `manage-portal.tsx` | | | ● | |
| `manage-contacts-table.tsx` | | ● | | ● |

**`grid-header-cell.tsx` and `grid.tsx` are touched by both Epic 2 and Epic 3.**
That is real overlap, so the split needs a justification beyond convenience.

**The justification is the external gate.** Epic 3's first story is blocked on
`../spec-contacts-date-types/` landing, because the filter bar's date
operators are written against the `DATE` type that spec produces. Had the filter
modal sat inside Epic 2, then `@dnd-kit` drag, the cell renderers, the metrics
contract and the scroll container — **none of which touch a date column** —
would all be stuck behind a schema migration they have nothing to do with.
Splitting here buys two ungated epics that can ship now.

**The overlap is sequential, not concurrent.** Stories run in list order, so
`grid-header-cell.tsx` is edited once per epic rather than by two branches at
once. There is no merge-conflict exposure.

**Consolidation was considered and rejected** for a second reason: merging
Epic 3 into Epic 2 would put the *find* job (filter bar, toolbar, page
header) inside the *surface* job, and the epic could no longer be named for
anything an operator would recognise doing.

---

## Story Breakdown

**Sizing.** Four of the ten are heavy, and the spec's own history says so —
Story 1.1 alone reverses three committed source contracts and rewrites roughly
95 assertions across five spec files. If a dev agent finds one of these exceeds
its context, the natural split points are:

| Story | Split at | Becomes |
| --- | --- | --- |
| 1.1 | the mechanism (blur-commit, touched-vs-unchanged) vs the retirement (remove `e`, type-to-edit, `Space`-seeding, rewrite the three comments) | edit mechanism, then retirement — **must not** be reversed, because the mechanism's tests need the old openers to still exist as a baseline |
| 2.1 | `@dnd-kit` wiring + pinned-run validation vs the menu cleanup + contextual reveal | drag reorder, then header hygiene |
| 3.1 | the operator registry + typed value controls vs the modal shell + URL round-trip + removing the per-column popover | typed filtering, then the modal that hosts it |
| 4.1 | the read-only panel vs the editable field + save states | panel shell, then editing inside it |

S2.2, S2.3, S2.4, S3.2, S3.3 and S4.2 are each comfortably one session.

### Story 1.1: Double-click edit model, blur-commit, and retiring the keyboard openers

**Implements:** FR16 (CAP-10), FR7 (CAP-7)

As a **program coordinator**,
I want a cell to open its editor the same way every time, and to save what I
typed when I move away,
So that I never lose a correction to a field I edited a moment ago.

**Acceptance Criteria:**

**Given** a Contacts grid with an editable cell and the local stack running
**When** the operator double-clicks the cell
**Then** the editor opens on every editable field type
**And** a double-click calls `preventDefault` on the cell, so the browser does not select a word inside an editable cell

**Given** an open editor whose draft has been typed into
**When** the operator double-clicks the cell again, or presses `Enter`, or moves focus away
**Then** the draft commits through the existing single commit path
**And** the visible save progress and any error reuse the existing `statusMessage` channel

**Given** a draft that fails validation
**When** the operator commits it
**Then** validation runs **before** the save and the draft is not sent
**And** the typed editor supplies parsing and validation only — the commit path
still owns the draft, the optimistic display and the revert

**Given** a write the server rejects
**When** the response arrives
**Then** the server's own message is shown
**And** the cell reverts to its committed value
**And** no second mutation channel is introduced to accomplish this

**Given** an open editor whose draft has NOT been typed into
**When** the operator clicks away
**Then** **zero** PATCH requests are issued
**And** the grid is unchanged

**Given** an open editor
**When** the operator presses `Escape`
**Then** the draft is discarded and the cell returns to its committed value

**Given** the grid with no editor open
**When** the operator presses `e`, a printable character, or `Space` on a non-checkbox cell
**Then** no editor opens
**And** `e`, type-to-edit and `Space`-seeding do not exist in `use-grid-keyboard.ts`

**Given** the grid with no editor open
**When** the operator uses arrows, `Tab`/`Shift+Tab`, `Home`/`End`, `Space` on a checkbox, or `Delete`/`Backspace`
**Then** each still behaves as it does today
**And** upstream story 2's *navigation* work is intact — only its *opening* work is retired

**Given** a read-only column
**When** the operator double-clicks a cell in it
**Then** no editor opens

**Given** the three source comments this story reverses
**When** the change lands
**Then** `grid-editors.tsx:181-189`, `:195-199` and `:225-227` are rewritten in the same commit
**And** the `stopPropagation` on `PopoverEditor`'s trigger is **kept** — only its stated reason changes

**Given** the e2e specs that open editors with `press("e")`
**When** the suite is updated
**Then** roughly 95 `press()` calls across five spec files convert to `dblclick` then `keyboard.type`
**And** **each retired assertion records why** the behaviour was removed

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`,
> `pnpm test:e2e`. New specs: double-click opens on each of the seven editor
> types; a single click does not open; a second double-click commits; blur
> commits a touched draft; blur commits **nothing** when untouched; `Escape`
> discards; arrows and `Tab` navigate without opening an editor; `Space` still
> toggles a checkbox.
>
> **Checkpoint.** `spec_checkpoint` — supersedes committed upstream behaviour.

---

### Story 2.1: Column drag-and-drop, a clean column menu, and a contextual header affordance

**Implements:** FR10 (CAP-13), FR11 (CAP-14 — completed by Story 3.1)

As a **program coordinator**,
I want to arrange the columns by dragging a header, and have the header stay
clean until I want it,
So that the grid shows the fields I work in, without permanent icons in every
header.

**Acceptance Criteria:**

**Given** the Contacts grid
**When** the operator drags a column header to a new position
**Then** the column moves, using `@dnd-kit/core` pointer, touch **and** keyboard sensors
**And** the new order is written **once on drop**, through the transient handle (`beginTransientChange` / `commitTransientChange` / `cancelTransientChange`)
**And** the order persists through the `cols` URL parameter across a reload

**Given** a column in the pinned run (`select`, `name`)
**When** the operator tries to drag it
**Then** it is not draggable — no handle, no activator

**Given** a drop whose resulting order would interleave a scrolling column into the pinned run
**When** the drop lands
**Then** the order is **rejected** and left unchanged
**And** the **resulting order is validated before commit**, not merely the drop target

**Given** a column hidden from view
**When** the operator drags another column past its position
**Then** the move steps over the hidden column, as `moveColumn` at `grid.tsx:773-806` already does
**And** `canMoveLeft` / `canMoveRight` no longer exist

**Given** the column menu
**When** it is opened
**Then** it contains exactly **Sort ascending, Sort descending, Hide column**
**And** the `Filter` item arrives with Story 3.1, completing CAP-14's four
**And** `grid-header-cell.tsx:116-120` and the `docs/manage-grid-pattern.md` Move left / Move right section are rewritten in the same commit

**Given** a column header at rest
**When** the operator hovers it, or focuses it with the keyboard
**Then** the menu control appears
**And** it is revealed by an opacity/visibility treatment that leaves it **focusable and tappable**
**And** it is **never** `display:none` — a touch user is never locked out
**And** it is suppressed on the selection column and on any header supplying its own control

**Given** the workspace
**When** `@dnd-kit/core` is added
**Then** it is version-pinned at the workspace root with the other shared deps, the lockfile is committed, and it resolves for **both** apps
**And** it is the only dependency this spec adds

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`,
> `pnpm test:e2e`. Assert the menu items, that a pinned column is not
> draggable, that a rejected drop leaves the order unchanged, and that a drag
> persists through `cols`.
>
> **Checkpoint.** `spec_checkpoint` — adds the spec's only new dependency and
> overrides a deliberate documented decision.

---

### Story 2.2: Type-keyed cell renderers, linked-record labels, and blank-not-dash

**Implements:** FR3 (CAP-3), FR4 (CAP-4)

As a **program coordinator**,
I want to tell a column's type from the cell alone, and to see a name rather
than a database id,
So that I can scan the table without reading every value.

**Acceptance Criteria:**

**Given** a Contacts column
**When** it is declared
**Then** it carries a field-type marker on `GridColumnMeta` **independent of** `meta.grid.editor`
**And** reusable renderers exist for text, select, multiselect, date, number,
boolean, linked record and longtext
**And** joined accessor columns (`location`, `collectedBy`) — which have no
editor and no stored value — still render through that marker

**Given** any cell
**When** it renders
**Then** it displays `ctx.text`, never `ctx.getValue()`
**And** no column is both `editable` and given a `cell` widget

**Given** a location id with no matching lookup
**When** the cell renders
**Then** it shows a visibly **unresolved** marker, distinct from empty
**And** no label is ever derived from the id
**And** `collectedBy` and `location` degrade consistently

**Given** a cell with no value
**When** it renders
**Then** it is genuinely empty — the `GRID_EMPTY_TEXT` em-dash is gone
**And** `grid-keyboard.spec.ts:230`, `grid-clipboard.spec.ts:134` and `:151`,
and `manage-contacts-edit.spec.ts:436` are updated in the same commit, with
the reason recorded

**Given** a ten-column table
**When** it renders
**Then** the identity column carries the row's one visual emphasis, expressed
with weight and space — never a raw colour or a per-option hue

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`,
> `pnpm test:e2e`. `grep -rn "dark:" components/grid/` stays 0 and the
> raw-hex grep stays 0.

---

### Story 2.3: Active-cell state and the cell-metrics contract

**Implements:** FR8 (CAP-11), FR14 (CAP-15)

As a **program coordinator**,
I want to know exactly which cell my next keystroke will act on,
So that navigation is predictable without reading the whole grid.

**Acceptance Criteria:**

**Given** the grid
**When** the operator clicks a cell once
**Then** that cell becomes the active cell, held in React state via `focusedColumnId` — **not** CSS `:hover`
**And** no editor opens
**And** arrows move the active cell

**Given** a hovered row, a selected row and an active cell
**When** all three coexist
**Then** each is visually distinct
**And** no indicator changes a cell's dimensions or shifts its content

**Given** the density control
**When** it renders
**Then** it initialises from `GRID_ROW_HEIGHT.default`
**And** it can never read "Default rows" while the grid renders dense

**Given** the retired keyboard openers
**When** an operator lands on the grid for the first time
**Then** editing is still **discoverable** without a keyboard opener
**And** the active-cell affordance communicates that the cell is the target of
the next keystroke — this is OQ-8's requirement, and it is what replaces the
discoverability the `e` key used to carry

**Given** the grid's metrics
**When** they are asserted
**Then** cell text is 13px, headers 12–13px, row height is 32px by default with
28px dense as a user option (**the default does not flip**), padding is ~8px
horizontal and 4–6px vertical, numbers are right-aligned and tabular, and
overflowing text truncates with the full value reachable

**Given** any cell content — a long note, a wrapped label, an open editor
**When** it renders
**Then** **no cell ever changes its row's height**
**And** the virtualizer's fixed-row-height estimate stays valid
**And** long text truncates and edits in a popover rather than expanding

**Given** the fact that no spec can assert appearance without hardcoding banned
CSS
**When** this story completes
**Then** the state transitions are asserted in Playwright
**And** a **manual visual pass** at 1440×900 and 1024×768, in light and in
whatever theme exists, is recorded in the story file

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`,
> `pnpm test:e2e`. Do **not** mount `ThemeProvider` — story 6 of
> `spec-grid-keyboard-editors-and-theme` owns that.

---

### Story 2.4: One scroll container, and a surface that does not clip

**Implements:** FR2 (CAP-2)

As a **program coordinator**,
I want the whole table visible without a second scrollbar cutting off my last
column,
So that I can scan to the end of a row without fighting the frame.

**Acceptance Criteria:**

**Given** the grid's scroll region
**When** it is rendered
**Then** it fills the space it is given rather than asserting `max-h-[70vh]`
**And** **exactly one** scroll container exists — no nested scrollbar
**And** the final column is never clipped, on either axis
**And** the sticky header still sticks on vertical scroll and the frozen
leading run still freezes on horizontal scroll

**Given** the grid's markup
**When** it is rendered
**Then** it emits `<table>` directly and does **not** adopt `components/ui/table`
**And** no scroll shadow, stripe or heavy border is used as a workaround

**Given** the row primitives
**When** the header and body surfaces are compared
**Then** the header is **visually distinct** from the body via a subtle surface
change — no new colour and no raw token
**And** header styling, cell padding and alignment read as one system with the
body's

**Given** the row-selection checkbox column
**When** rows scroll and rows are selected
**Then** the checkboxes stay aligned to their rows

**Given** the existing row primitives
**When** this story lands
**Then** `[&>td]:border-b`, the doubled `[data-grid-cell-selected]`
attribute, per-cell hover/selection on frozen cells, and the single `border-r`
on the last frozen column are all preserved

**Given** the grid at 1024px
**When** the operator works in it
**Then** it remains usable with adequate hit targets

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`,
> `pnpm test:e2e`. This story **fills the gap `stories.yaml` left** — CAP-2's
> empty-state half was owned by the old story 3, but the scroll-container half
> that `surface-and-toolbar.md` names as the actual cause of both symptoms had
> no owner.

---

### Story 3.1: The filter conditions bar with per-field-type operators

**Implements:** FR9 (CAP-12), FR11 (CAP-14 — the fourth menu item)

As a **program coordinator**,
I want to build a filter as a visible list of conditions whose options make
sense for each column's type,
So that I can narrow 226 contacts to the handful I need and watch the count
narrow as I go.

**Acceptance Criteria:**

**Given** `/manage` → Contacts
**When** the grid renders
**Then** an **inline bar** sits above the grid carrying one row per condition —
**Field · operator · value**, each row with its own delete and drag handle
**And** the bar is **not** a modal, and no overlay covers the grid
**And** the **matching row count updates live** as conditions are composed
**And** no condition *groups*, no saved views, no "Copy from another view" and
no AI prompt appear — and the code says why, so a later agent reading only the
reference screenshot does not re-add them

**Given** the bar with one or more conditions
**When** the operator presses `+ Add condition`
**Then** a new condition row is added
**And** each condition can be deleted on its own without affecting the others

**Given** the connective between conditions
**When** the operator sets it
**Then** **one connective governs the whole list** — *match all* or *match any*
**And** the list is **never** a mixed `A and B or C` expression
**And** the `and ▾` prefix shown on later rows is driven by that one value, not
per row — the code says so, because the visual suggests per-row semantics
**And** no precedence rules and no ordered serialization exist

**Given** a field of each type
**When** a condition row renders its operator list
**Then** the list comes from a **typed registry keyed by field type**, not a switch

| Field type | Operators | Value control |
| --- | --- | --- |
| text | contains · does not contain · is · is not · is empty · is not empty | text input; **hidden** for the two empty operators |
| number | is · is not · greater than · less than · is empty · is not empty | numeric input; hidden for empty |
| date | is · is not · is within · is after · is before · is on or before · is on or after · is empty · is not empty | a **select**: today · yesterday · one week ago · one month ago · N days ago · exact date — then a date input for *exact date* |
| checkbox | one entry: *is* — **shown, not hidden** | a **checkbox** |
| single select | is · is not · is any of · is none of · is empty · is not empty | the option list; hidden for empty |
| multi select | is · is not · is any of · is none of · is empty · is not empty | the option list, multi-selectable; hidden for empty |

**Given** an operator with no value shape, such as *is empty*
**When** the condition row renders
**Then** the value control is hidden rather than left orphaned
**And** every operator declares its value shape, and the row renders from
that declaration

**Given** the operator switches the Field
**When** the new type does not support the held operator or value
**Then** operator and value **reset to something valid**
**And** no orphaned value is left that silently filters nothing

**Given** an `is any of` condition on a multi-select column
**When** it evaluates
**Then** it uses **intersection**, not the substring-per-element behaviour, so
"EC" does not match "ECE"

**Given** a relative-date preset
**When** the operator applies it
**Then** it serializes to a computed **absolute** boundary, so a shared URL does
not mean something different tomorrow and no assertion depends on the wall clock

**Given** a date cell holding a value that is not `YYYY-MM-DD`
**When** a date filter evaluates it
**Then** the value is parsed to a real `Date`, and an unparseable value is
**handled explicitly** — excluded with a visible reason or reported — never
silently dropped by a `NaN` comparison

**Given** the column menu's Filter item
**When** the operator uses it
**Then** it **reveals** the bar with that column's condition pre-filled and a
valid operator preselected
**And** it does not open a modal or cover the grid — there is no overlay
**And** the column menu now contains exactly **Sort ascending, Sort descending,
Hide column, Filter** — CAP-14 is complete

**Given** conditions set to *match any*
**When** the grid renders
**Then** it is visibly indicated in **both** the toolbar and the header
**And** the connective is visible in the bar

**Given** a condition on any column
**When** the grid writes its URL and reads it back
**Then** it round-trips exactly
**And** `f.<colId>` **keeps its existing meaning** — conditions in it still AND
across columns, so matrix row 17's `f.location` assertion is untouched and every
shared URL already in circulation keeps its meaning
**And** match-**any** conditions use a new key family mirroring
`GRID_PARAM_PREFIXES` (`grid-view-state.ts:39`)
**And** because the connective is global, both cases are **sets of columns** —
no list parser, and nothing has to preserve condition order

**Given** an `is empty` condition
**When** it is written to the URL and read back
**Then** it **survives** — this does not work today and must be fixed by this
story
**And** the value carries its operator inside the token (e.g. `f.status=is:`),
so the whole string is non-empty as a token and survives the length guards at
`grid-view-state.ts:130` and `:211`, which currently drop any empty value in
**both** directions and make an empty condition indistinguishable from an absent
one

**Given** the per-column filter popover
**When** this story lands
**Then** it is gone
**And** `meta.grid.filter`'s remaining value-type role is documented as the
registry key in `docs/manage-grid-pattern.md`, in the same commit

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`,
> `pnpm test:e2e`. Assert per type: the right operators, the conditional value
> control, the reset on type change, the intersection case, a relative-date
> round-trip, that all four menu items are present, and that `f.location` still
> round-trips (matrix row 17).
>
> **Two newly-found defects this story must fix**, both surfaced while settling
> the condition-list shape and neither previously written down: **OQ-20**, an
> empty filter value cannot round-trip through the URL because `:130` and `:211`
> both drop zero-length values; and **OQ-21**, the operator must travel inside
> the serialized value, or per-type operators are indistinguishable in a URL and
> `is empty` is inexpressible. The previous derivation of this spec asserted
> round-tripping without specifying a shape capable of round-tripping.
>
> **Gate.** `../spec-contacts-date-types/` must have landed.

---

### Story 3.2: Toolbar compaction, contextual bulk actions, and the current-view label

**Implements:** FR6 (CAP-6)

As a **program coordinator**,
I want every grid control in one compact band, with bulk actions appearing only
when I have selected something,
So that the controls I need are findable and the ones I do not need are out of
the way.

**Acceptance Criteria:**

**Given** the resting toolbar
**When** it renders
**Then** one band carries scoped search, **a count of active filter
conditions**, the current-view label, column visibility and ordering, record
creation, and visible result and selection counts
**And** the selection count is present in the **resting** state, not only in the
bulk bar

**Given** the filter bar from Story 3.1 is permanent and inline
**When** conditions are active
**Then** the toolbar **count** reflects how many, without opening or duplicating
the filter surface
**And** there is no "open filter" control — the bar is already on screen, so a
button that reveals it would be the nonfunctional control FR6 forbids

**Given** rows are selected
**When** the operator selects rows
**Then** a **separate contextual bar** appears carrying the bulk actions
**And** it is absent when nothing is selected
**And** the bulk control is disabled at zero

**Given** the grid's live region
**When** the toolbar is redesigned
**Then** the `statusMessage` channel stays reachable and announced
**And** story 5's per-row delete outcomes still report through it

**Given** the view control
**When** it renders
**Then** it is a **static label over URL-backed view state**, not a dropdown of
views that do not exist
**And** `q`, `f.<colId>`, `sort`, `cols`, `hide` and `size.<colId>` all still
work

**Given** any control in the band
**When** it is inspected
**Then** it does something

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`,
> `pnpm test:e2e`. Most of this already exists — `grid-toolbar.tsx` renders the
> search, Columns menu, density `Select`, `rowAction` and `toolbarExtra` slots
> and the visible/total counts. The work is compaction and hierarchy.

---

### Story 3.3: Page header, navigation, and scope

**Implements:** FR1 (CAP-1)

As a **program coordinator**,
I want to see which section I am in and what scope I am looking at without
reading body copy,
So that I know where I am before I start reading rows.

**Acceptance Criteria:**

**Given** `/manage`
**When** the header renders
**Then** all five tabs — Dashboard, Contacts, Sessions, Attendance, Favorites —
are preserved in order as `MANAGE_VIEWS`
**And** the active tab is unmistakable at a glance, expressed with weight plus
the existing `--program-primary` brand token rather than a new colour

**Given** the page title
**When** it renders
**Then** the title and its metadata line (staff name, contact count, location
count) form **one visual unit**
**And** the scope indicator aligns to that unit's baseline, not to the bottom of
a separate column

**Given** the header block
**When** spacing is applied
**Then** the `space-y-6` between header, scope notice, tab list and content is
tightened
**And** the tab row is not cramped

**Given** the scope toggle links
**When** they are hovered
**Then** their background is `hover:bg-foreground/5`, which resolves in both
themes — replacing `hover:bg-black/5`, which is invisible on a dark surface

**Given** the brand-coloured `--program-primary` headers
**When** this story lands
**Then** they are left alone — `text-white` on a fixed dark brand colour is
correct in both themes

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`.
> This story **fills a gap `stories.yaml` left** — CAP-1 had **zero** mentions
> across all eight stories.

---

### Story 4.1: Record review panel

> **WITHDRAWN 2026-10-12 by Dwaraka.** This story is NOT built. It opened
> a record panel, which CAP-5 dropped. Retained as history so the story and
> epic numbering stays resolvable; do not implement from it. The panel's
> purpose is served by visible joined columns under CAP-18.

**Implements:** FR5 (CAP-5), FR7 (CAP-7 — panel surface), FR15 (CAP-16 — panel boundary)

As a **program coordinator**,
I want to open one person and read all of them, then move to the next,
So that I can review people without losing my place in the grid.

**Acceptance Criteria:**

**Given** a Contacts row
**When** the operator uses the **action-column control**
**Then** a record panel opens beside the grid as a right-side **sheet** — never a
row click, never `Enter`, and never a modal that covers the grid
**And** the select checkbox, favourite star and delete control keep their
`stopPropagation`

**Given** the open panel
**When** it renders
**Then** **all fifteen** fields appear, including ones hidden or scrolled off in
the grid
**And** read-only fields are visibly read-only
**And** linked records render as labels, matching the grid, and navigate to the
**existing** `/manage?view=…` routes
**And** the attendance history is included — it is already loaded
**And** there is **no** delete control inside the panel

**Given** the panel and the grid's resolved row model
**When** the operator presses prev or next
**Then** navigation follows the **current filtered, sorted order**
**And** it never re-derives that order by re-sorting
**And** the control is disabled at the ends — it does not wrap
**And** `ArrowUp`/`ArrowDown` navigate and `Escape` closes, without `Escape`
stealing the key from an open editor

**Given** the panel
**When** the operator edits a field
**Then** it commits through the **existing** write path
**And** saving, saved and failed are three visibly distinct states
**And** a failed write shows the server's own message and the cell reverts
**And** there is **no dirty flag and no close prompt** — blur commits, so the
prompt could never appear

**Given** the grid's filters, sort, column order, column widths, selection,
scroll position and focused cell
**When** the operator opens and then closes the panel
**Then** every one of them is identical to before
**And** the grid's scroll container is never unmounted — which is why this is a
sheet and not a route change

**Given** the panel's test seams
**When** they are added
**Then** they are new attributes only — `data-record-panel`, `-record`,
`-field="<columnId>"`, `-saving`, `-nav="next|prev"`
**And** no existing `data-grid-*` attribute is repurposed

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`,
> `pnpm test:e2e`. Specs: open, close, navigate, edit-and-save, failed-save
> revert and message, and grid state preserved across open/close. The
> dirty-close prompt spec is **deleted, not skipped**.
>
> **Checkpoint.** `done_checkpoint` — first genuinely new surface; a human
> should look before the next slice.

---

### Story 4.2: Interaction boundaries, accessibility, and the recorded visual pass

**Implements:** FR15 (CAP-16), FR12 (CAP-8), FR13 (CAP-9)

As a **program coordinator**,
I want every gesture to do exactly one thing and the whole grid to work without
a mouse,
So that I never trigger an edit when I meant to select, and never hit a wall
with the keyboard.

**Acceptance Criteria:**

**Given** the finished grid
**When** each interaction boundary is exercised
**Then** it holds:

| Boundary | Mechanism |
| --- | --- |
| A checkbox click activates neither an edit nor the panel | `stopPropagation` on pointerdown |
| A dropdown or popover interaction never triggers a double-click edit | the cell's handler checks the target is not inside `[data-grid-editor]` |
| A read-only field never enters edit mode | `openEditor`'s editable guard |
| A single cell click preserves row navigation | it sets the active cell and nothing else |
| Keyboard propagation is stopped only where a key would be swallowed | `isGuardedTarget` |

**Given** the grid
**When** it is audited
**Then** every interactive element has an accessible name
**And** keyboard navigation and visible focus states work throughout
**And** contrast and hit targets are adequate
**And** there is no layout shift while loading and no gratuitous rerenders
**And** no new virtualization was introduced
**And** the grid is usable at 1024px

**Given** the preservation gates
**When** this story closes
**Then** `grep -rn "dark:" components/grid/` is 0
**And** the raw-hex / `rgb(` / `white` / `black` grep is 0
**And** no `Manage*`, `/api/manage` or contacts vocabulary sits under `components/grid/`
**And** every `data-grid-*` attribute in `e2e/fixtures/manage-grid.ts` is still
present and still means what that file documents
**And** all 19 matrix rows are still Covered, or each retired row's reason is
recorded in `matrix-coverage-map.md` in the same commit
**And** `apps/folk` and `apps/gita-life` are mirrored — `md5sum` on the files
meant to match
**And** TanStack Table v8 and `@tanstack/react-virtual` v3 are still the engine,
their installed APIs used as-is, with no duplicated filtering, sorting or
persistence logic and no new dataset fetch

**Given** the write paths
**When** the audit runs
**Then** every write still goes through `lib/manage/api-handlers.ts` with
`getStaffContext` + `requireRole`, validated against `MANAGE_CONTACT_PATCH_KEYS`
**And** no component talks to Supabase directly and no new authorization logic
exists

**Given** the visual language
**When** the grid is inspected
**Then** there are **no per-option coloured pills** — no eleven pastel hues, no
stable-hash palette
**And** hierarchy is carried by weight and space against the deliberate
royal-blue brand token
**And** if this is ever revisited, it requires an explicit `data-*` assertion
surface and a decision on whether tone belongs to the **option** (a payload
change across four files) or the **field**

**Given** the four visual states
**When** they are checked
**Then** hover, active, editing and selected are distinct — by a **recorded
manual pass** at 1440×900 and 1024×768, in light and in whatever theme exists,
with the outcome written into this story file

**Given** the retired openers
**When** the grid is inspected
**Then** `e`, type-to-edit and `Space`-seeding are **still gone**
**And** if any has been quietly restored, that is reported rather than shipped
behind a green suite

> **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`,
> `pnpm test:e2e`. Never commit a deliberately broken spec to `e2e/specs/` —
> generate failures into a temp dir and remove them in a `finally`. One e2e
> runner at a time.
>
> **Checkpoint.** `done_checkpoint` — the final verification gate.