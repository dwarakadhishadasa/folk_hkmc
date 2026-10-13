---
status: draft
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
validation:
  fr_coverage: pending
  ux_dr_coverage: pending
  nfr_coverage: pending
  placeholders_replaced: pending
  story_quality: pending
  story_dependencies: pending
  epic_independence: pending
  file_churn: pending
  open_checks: pending
rebuild:
  date: '2026-10-13'
  reason: >-
    Rebuilt from SPEC.md and its three companions after the visual-design session. The previous
    run's FR/NFR/UX-DR sets predate CAP-17, CAP-18 and CAP-19, predate the filter surface's third
    reversal to a popover, and describe a withdrawn CAP-5 record panel. Requirements below are
    extracted against the schema as it is TODAY: spec-contacts-date-types has LANDED.
  sections_rebuilt:
    - Functional Requirements
    - NonFunctional Requirements
    - Additional Requirements
    - UX Design Requirements
  sections_pending_rebuild: [FR Coverage Map, Requirements Coverage Audit, Epic List, Story Breakdown]
  spec_debt: >-
    SPEC.md still carries a "Date fields are TEXT columns" constraint and a last_contacted_on
    reason that the landed migration falsified, and CAP-18's stated reason for hiding that column
    changed to a density argument. SPEC.md is bmad-spec's only writer; the corrections are queued
    in that spec's .memlog.md and are NOT hand-edited here. See AR16.
inputDocuments:
  - _bmad-output/specs/spec-contacts-premium-grid/SPEC.md
  - _bmad-output/specs/spec-contacts-premium-grid/visual-design.md
  - _bmad-output/specs/spec-contacts-premium-grid/existing-state.md
  - _bmad-output/specs/spec-contacts-premium-grid/surface-and-toolbar.md
  - _bmad-output/specs/spec-contacts-premium-grid/stories.yaml
  - _bmad-output/specs/spec-contacts-date-types/SPEC.md
  - docs/manage-grid-pattern.md
  - docs/architecture/testing.md
  - AGENTS.md
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

Eighteen, one per live capability. CAP-5 is excluded — withdrawn by Dwaraka on 2026-10-12; its purpose is served by the joined accessor columns being visible by default under FR15. Capability IDs are stable and are never renumbered.

```
FR1  (CAP-1)  Page header and navigation: five tabs preserved and the active one unmistakable at a
             glance; the scope indicator aligns to the page header's optical block; the header loses
             vertical height without cramping the tab row.
FR2  (CAP-2)  Grid surface maturity: consistent row height, padding, alignment and header styling;
             hairline dividers rather than heavy borders; sticky header; horizontal scroll
             preserved; the final column is never clipped; exactly ONE scroll container (no nested
             scrollbar); row-selection checkboxes stay aligned to their rows.
FR3  (CAP-3)  Type-keyed cell renderers covering text, select, multiselect, date, number, boolean
             and linked record; editable and read-only cells visually distinguishable; truncated
             text exposes its full value on inspection; an empty cell renders NOTHING — never the
             em-dash GRID_EMPTY_TEXT.
FR4  (CAP-4)  Linked-record labels: every location and staff cell renders a human label; an id with
             no matching lookup renders a visibly UNRESOLVED marker rather than a raw UUID.
FR5  (CAP-7)  Edit safety: validation before save; visible save progress and error; a rejected
             write shows the server's message and reverts the cell; the existing PATCH/bulk API and
             its authorization are used unchanged.
FR6  (CAP-11) Active-cell state: a single click makes a cell the active cell with a clear but
             restrained outline of consistent colour and thickness, held in React state rather than
             CSS :hover; distinct from row hover and row selection; a selected row and an active
             cell coexist; arrows move it; no indicator changes a cell's dimensions.
FR7  (CAP-15) Cell and grid metrics: cell text 13px, headers 12–13px; row height the existing 32px
             default (dense 28px stays a user option and the default does NOT flip); cells
             vertically centred with ~8px horizontal and 4–6px vertical padding; overflow truncates
             with an ellipsis and the full value stays reachable; numbers right-aligned and tabular;
             no cell ever changes its row's height.
FR8  (CAP-16) Interaction boundaries: a checkbox click never activates an edit; dropdown and popover
             interactions never trigger a double-click edit; a read-only field never enters edit
             mode; a single cell click preserves row navigation; keyboard propagation is stopped
             only where a specific key would otherwise be swallowed. There is NO record panel, so no
             boundary is asserted against one.
FR9  (CAP-10) Edit activation and commit: a double-click opens the editor on every editable field
             type and NO other gesture opens it; a second double-click commits; moving focus away
             commits; Escape is the only way to discard; the keyboard openers `e`, printable-
             character type-to-edit and Space-seeding are gone; an unchanged draft fires NO
             request; arrow/Tab/Home/End and Space-on-checkbox still work.
FR10 (CAP-12) Filter conditions: a popover anchored under the toolbar's filter control holds the
             conditions, each row carrying Field · operator · value, plus `+ Add condition`; the
             operator list AND the value control both depend on the field's type; ONE connective
             governs the whole list (match all / match any); changing field type resets operator
             and value; each condition deletes on its own; the per-column filter popover is gone;
             the column menu's Filter item reveals the popover with that column's condition
             pre-filled; an active filter is indicated in the toolbar, NAMING the columns it is
             filtering; the result count updates live and stays visible because the popover is
             anchored below the toolbar; every condition round-trips through the URL.
FR11 (CAP-13) Column reordering by drag via @dnd-kit/core, supplying pointer, touch AND keyboard
             sensors; the new order persists through the `cols` URL parameter and is written once on
             drop; a pinned column is not draggable; any resulting order that would INTERLEAVE a
             scrolling column into the pinned run is rejected BEFORE it is committed.
FR12 (CAP-14) Header affordance hygiene: the column menu contains exactly Sort ascending, Sort
             descending, Hide column, Filter; the menu control is revealed on header hover AND on
             keyboard focus; never hidden from a touch user; suppressed on the selection column and
             on any header supplying its own control. The header label is NOT a sort button.
FR13 (CAP-6)  Toolbar: ONE compact band carrying scoped search, a filter control with a visible
             active indicator, a Hide fields control, a global Sort control, record creation, and
             visible result and selection counts; the bulk-action bar appears only while rows are
             selected; no control is present that does not work. There is NO view label and NO view
             dropdown.
FR14 (CAP-17) One global sort surface: the toolbar carries a Sort control opening a popover with
             exactly a field dropdown and a direction select; the SAME popover opens from the column
             menu's Sort ascending and Sort descending items with BOTH controls prefilled; the
             header label is not a sort button; sort state stays in the `sort` URL parameter and a
             cleared sort is a valid state. One surface, three entry points, one state.
FR15 (CAP-18) Default field set: NINE of FOURTEEN data columns visible by default, five hidden, as a
             product decision rather than an accident of definition order. VISIBLE: Name, Phone,
             Location, Initial Contact, Total Attendance, Past 60 Days, Notes, Collected By,
             Actions. HIDDEN: Source, Books Read, Date of Birth, Last Contacted On, Favorite.
             Hiding is reversible per-operator through Hide fields and persists in the `hide` URL
             parameter — a default, NOT a lock. Name and Actions are `hideable: false`.
FR16 (CAP-19) Delete stays and is only an icon: per-row delete remains exactly as shipped, rendered
             as a small red bin with no text, disabled while deleting, behind a confirmation. The
             two seams `data-grid-delete-row` and `data-grid-delete-report` survive. Creation
             (`GridRowAddControl`, `data-grid-add-record`) is separate and unaffected.
FR17 (CAP-8)  Accessibility and performance: every interactive element has an accessible name;
             keyboard navigation and visible focus states work throughout; adequate contrast and hit
             targets; no layout shift while loading; no gratuitous rerenders; no new virtualization
             beyond what exists; the grid remains usable at 1024px.
FR18 (CAP-9)  Scope preservation: TanStack Table v8 and @tanstack/react-virtual v3 remain the engine
             and their installed APIs are used as-is; components/grid/ stays table-agnostic (zero
             contacts vocabulary); no filtering, sorting or persistence logic is duplicated; no new
             dataset fetch; both apps stay mirrored; pnpm guardrails passes.
```

**FR10 and FR15 both changed on the 2026-10-13 rebuild.** FR10 is a popover: OQ-18 reversed a modal → inline bar → popover, and the previous run's FR described the inline bar. FR15's stated reason for hiding Last Contacted On changed — see AR16.

### NonFunctional Requirements

```
NFR1  VERIFICATION IS THE GATE: pnpm typecheck:workspace, pnpm lint, pnpm guardrails, pnpm test:e2e.
      `pnpm test` runs ZERO tests and exits 0 — it is never a passing test run. `pnpm build` is not
      a type gate because next.config.mjs sets typescript.ignoreBuildErrors.
NFR2  ONE e2e runner at a time. Every spec shares one seeded database; concurrent runs produce false
      failures. A full run is 5–7 minutes at one worker. Always run through `pnpm test:e2e` or a
      `test:e2e:*` script — never bare `pnpm exec playwright test`, because the readiness gate lives
      in the script. Filter with a REGEX, never a glob.
NFR3  TOKEN-CLEAN IS LOAD-BEARING: zero raw hex, rgb(, `white` or `black` under components/grid/,
      and `grep -rn "dark:" components/grid/` stays 0. Hierarchy is expressed with weight, space
      and existing semantic tokens — never a new literal colour or a per-option hue.
NFR4  FIXED ROW HEIGHTS ARE LOAD-BEARING: the virtualizer estimates from GRID_ROW_HEIGHT
      (grid.tsx:633). Long text truncates and edits in a popover. Nothing may make a row grow.
NFR5  AUTHORIZATION IS UNCHANGED: writes go through lib/manage/api-handlers.ts with getStaffContext
      + requireRole, validated against MANAGE_CONTACT_PATCH_KEYS. No direct Supabase from a
      component; no new authorization logic.
NFR6  BOTH APPS STAY MIRRORED: md5sum the layout.tsx files and both api/manage/contacts/route.ts
      files after editing.
NFR7  ONE NEW DEPENDENCY, MAXIMUM: @dnd-kit/core only, for FR11 and nothing else, version-pinned
      at the workspace root, resolving for both apps. No new component library — compose what
      components/ui/ already provides plus lucide-react.
NFR8  THE GRID STAYS A PRIMITIVE: components/grid/ keeps zero Manage*, /api/manage or contacts
      vocabulary. Four tables consume it and docs/manage-grid-pattern.md forbids a second table
      implementation.
NFR9  ONE COMMIT PATH: use-grid-keyboard.ts owns draft, optimistic display and visible revert. A
      typed editor supplies parsing and validation only. A second mutation channel is a defect.
NFR10 AN UNCHANGED DRAFT MUST NEVER PRODUCE A REQUEST: openEditor seeds the draft from the cell's
      current value, so a blur with no keystrokes is a no-op by definition. Without this guarantee
      every cell click becomes a PATCH.
NFR11 ASSERTION EDITS ARE A LAST RESORT: if a matrix row goes red, fix the source. Two deliberate
      exceptions exist, each requiring the updated assertions in the SAME commit and a recorded
      reason — FR3's blank-not-dash change and FR9's retirement of the keyboard openers.
NFR12 NO FABRICATED DATA: no seeded or invented value to make a column look fuller. An unresolvable
      lookup renders an unresolved marker, never a guess derived from an id.
NFR13 THE 19-ROW MATRIX STAYS GREEN: every row in matrix-coverage-map.md remains Covered, or a
      retired row's reason is recorded in the same commit.
NFR14 THE DOM CONTRACT IS FROZEN: every `data-grid-*` attribute documented at
      e2e/fixtures/manage-grid.ts still exists and still means what that file says. Add attributes;
      never rename or repurpose an existing one.
NFR15 PERFORMANCE: no layout shift while loading; no gratuitous rerenders; no new column
      virtualization; no new dataset fetch.
NFR16 ACCESSIBILITY: accessible name on every interactive element; visible focus states throughout;
      adequate contrast and hit targets; fully operable without a mouse; usable at 1024px.
```

**SUPERSEDED — retained for the record, NOT a current requirement.** Kept so that a later reader cannot conclude this was never a concern. Its ID is not reused.

```
NFR11 [SUPERSEDED 2026-10-13 — DO NOT IMPLEMENT AS WRITTEN]
      Original text, verbatim from the 2026-10-12 run:

        Unparseable TEXT dates are handled explicitly. date_of_birth,
        initial_contact and last_contacted_on are TEXT columns. Relative
        operators must parse to a real Date; a non-YYYY-MM-DD value is excluded
        with a visible reason or reported as unparseable — never silently
        dropped, because a NaN comparison removes the row from every
        date-filtered view with no error and no failing test.

      WHY IT STOPPED APPLYING: the premise was false. All three columns are DATE as of migration
      20261010000000_contacts_date_columns_to_date.sql (spec-contacts-date-types, landed), and
      optionalIsoDate now rejects anything that is not a real YYYY-MM-DD at the write boundary
      (lib/manage/api-handlers.ts:104). The hazard it guarded — a partial or unparseable string
      yielding NaN from getTime(), comparing false against everything, and removing the row from
      every date-filtered view — lived at the STORAGE layer and is gone with it.

      WHAT SURVIVES, AND WHERE IT NOW LIVES: the failure mode is still worth guarding, because it
      is no longer the only way to reach it. The API can return null for a date column, and a
      relative-date comparison written without an explicit null branch drops the row exactly as
      silently as the NaN did. That obligation is now carried by FR10 — "changing field type resets
      operator and value", and the popover's operators are per field type — rather than by a
      storage-layer parsing rule. Implement FR10; do not re-derive this paragraph as if it still
      described the schema.
```

### Additional Requirements

From `docs/manage-grid-pattern.md`, `docs/architecture/testing.md` and `AGENTS.md`. Each is a contract a story can violate.

```
AR1  HOST THE GRID, NEVER A SECOND TABLE (manage-grid-pattern.md §1). No story may introduce a
     second table implementation; any consumer needing different behaviour extends via meta.grid.
AR2  meta.grid IS DOCUMENTED AS A CONTRACT (§2). Its documented jobs — choosing the per-column
     control and supplying filterFn — change in FR10, so the §2 table and the porting checklist (§8)
     must be rewritten in the SAME commit.
AR3  THE DW-27 RULES BIND CELL RENDERING (§2, `meta.grid.editor` is the third way): a closed-state
     editor display renders ctx.text, NEVER ctx.getValue(), and a column is never marked editable
     AND supplies a cell widget. A widget replaces the value the grid would print, and cell.text is
     where the optimistic override lives — so it silently shows the OLD value for the whole round
     trip with no error anywhere. Read this section before touching grid-row.tsx.
AR4  DERIVED VALUES ARE ACCESSORS, NOT STATE (§2). `location` and `collectedBy` are joined accessor
     columns with no editor and no stored value. A renderer keyed on `meta.grid.editor` alone
     renders nothing for both, so the field-type marker needs its own key on GridColumnMeta.
AR5  THE COMMIT / ROLLBACK CONTRACT (§3) is unchanged. On a draft row a commit IS the create, because
     name and phone are both NOT NULL and one commit cannot satisfy both.
AR6  BULK ACTIONS (§5): capped at MANAGE_BULK_MAX_ITEMS = 200, processed sequentially, reporting one
     outcome per row.
AR7  ROW LIFECYCLE (§6): adding a record and deleting behind a confirmation; the per-row delete
     outcome reports through the grid's `statusMessage` channel, which any toolbar redesign must
     keep reachable — dropping it silently breaks delete feedback.
AR8  THE URL STATE CONTRACT (§7) has six keys (`q`, `sort`, `cols`, `hide`, `f.<colId>`, density).
     FR10 adds a match-ANY key family mirroring GRID_PARAM_PREFIXES (grid-view-state.ts:39) and a
     value encoding that carries its operator, because a bare value cannot round-trip `is empty`.
AR9  REPORT DIVERGENCE (§9): a story that finds the pattern doc wrong fixes the doc in the same
     commit rather than working around it.
AR10 ESCALATE THE TEST LEVEL when a shared component changes — lib/authz.ts, lib/supabase/*,
     proxy.ts, components/header.tsx, components/providers.tsx, or a shared components/ui/*
     escalates to the FULL suite, which is also required before a PR.
AR11 CI DOES NOT RUN E2E. It runs guardrails, typecheck:workspace, build:apps and lint. A green CI
     run is NOT verification of a behavioural change, and is never reported as one.
AR12 proxy.ts MATCHES NEITHER /manage NOR /api/manage/* — a known gap. Session refresh does not run
     for the manage surface. Any new /api/manage/* route inherits it. FR13 and FR14 add NO new route.
AR13 DO NOT MOUNT ThemeProvider. It is installed (`next-themes` ^0.4.6) but unmounted, and owned by
     story 6 of spec-grid-keyboard-editors-and-theme. This work is graded in whatever theme exists.
AR14 NEVER COMMIT A DELIBERATELY BROKEN SPEC to e2e/specs/ — it is a permanently red suite. Generate
     failures into a temp dir and remove them in a finally.
AR15 KNOWN PRE-EXISTING FAILURE: `pnpm test:airtable-removal` fails 3 of 30 checks on dev/main as of
     44d9812. Confirm with `git stash` and report it as pre-existing; never edit the gate to hide it.
AR16 [CHANGED 2026-10-13] THE DATE SCHEMA IS `DATE`, NOT TEXT. spec-contacts-date-types LANDED:
     migration 20261010000000_contacts_date_columns_to_date.sql converts `date_of_birth`,
     `initial_contact`, `last_contacted_on` and `sessions.session_date` to DATE; `optionalIsoDate`
     now accepts only blank or exactly YYYY-MM-DD naming a real calendar day
     (lib/manage/api-handlers.ts:104); the sessions POST slices to ten characters
     (apps/folk/app/api/sessions/route.ts:129). Consequences for this epic: (a) FR10's gate on that
     spec is CLEARED — it no longer blocks; (b) the previous FR set's "date fields are TEXT, parse
     before comparing" requirement is SUPERSEDED — the NaN hazard it guarded lived at the storage
     layer and is gone; FR10 still handles an absent or invalid value explicitly, because the API
     can still return null and a silent row-drop is the failure mode; (c) `last_contacted_on` was
     PARKED EMPTY per Dwaraka's 2026-10-10 decision — every value was reported, then nulled — so
     FR15's stated reason for hiding it must change from "misleading" to a density argument.

     AR16(b) is the SUPERSESSION RECORD. The superseded requirement's full original text lives in
     the NFR block under NFR11, marked SUPERSEDED, with the reason it stopped applying and the
     smaller obligation that survives inside FR10. It is retained rather than deleted so that no
     later reader concludes the NaN hazard was never a concern; its ID is not reused.
```

### UX Design Requirements

Extracted from `visual-design.md` (a companion of SPEC.md) and the approved compositions. The visual design is a **binding contract**, not illustration — see UX-DR1.

```
UX-DR1  THE VISUAL DESIGN IS BINDING AND DISCOVERABLE. visual-design.md is a companion of SPEC.md.
        Every capability with a visual surface has a named composition there, and EVERY STORY THAT
        BUILDS ONE MUST NAME THE FILE IT IMPLEMENTS FROM. A story that changes a value a
        composition fixes updates that composition in the same commit, so the comps cannot silently
        become history.
UX-DR2  THREE AUTHORITATIVE COMPOSITIONS: contacts-toolbar-stitch-v1-corrected.html (the Contacts
        screen — CAP-1, CAP-2, CAP-6, CAP-12); contacts-overlays-stitch-v1-corrected.html (sort
        popover, Hide fields, column menu — CAP-14, CAP-17, CAP-18, CAP-19);
        contacts-grid-states-v1.html (six cell and row states plus the status strip — CAP-7, CAP-10,
        CAP-11, CAP-15, CAP-16). `stitch-DESIGN-UNVERIFIED.md` is DO NOT IMPLEMENT FROM — it
        contradicts its own render; only its Colors section is accurate.
UX-DR3  ROW HEIGHT 32px, PINNED ON THE CELL: `height: 32px` + `padding: 4px 8px` +
        `line-height: 24px` + `vertical-align: middle` (contacts-grid-states-v1.html:59-66).
UX-DR4  CELL PADDING 8px horizontal, 4px vertical (`px-2 py-1`). Corrected in all three comps
        after one export shipped it doubled at `px-4 py-1`, the single biggest thing making the grid
        read loose rather than dense.
UX-DR5  TYPOGRAPHY: cell text 13px, headers 12px, counts 12px, page title 22px Poppins, tabs 13px.
UX-DR6  ACTIVE CELL: `inset 0 0 0 1px` royal blue #0F1E54 — 1px, inset, not a glow
        (contacts-grid-states-v1.html:73).
UX-DR7  FOCUS RING: 2px royal blue, not a glow.
UX-DR8  ROW HOVER: neutral rgba(74,85,104,0.05) — NEVER amber and NEVER saffron. Saffron and amber
        are the same hue family, so an amber hover makes a passive row look activated
        (contacts-grid-states-v1.html:67).
UX-DR9  ROW SELECTED: rgba(15,30,84,0.08) (contacts-grid-states-v1.html:78).
UX-DR10 CELL RANGE: rgba(249,139,28,0.30) — saffron at 30% (contacts-grid-states-v1.html:82).
UX-DR11 ERROR CELL: 1px #DC2626 with `outline-offset: -1px` (contacts-grid-states-v1.html:98).
UX-DR12 EDITING CELL: 2px #0F1E54 outline, 24px tall, 13px text (contacts-grid-states-v1.html:87).
UX-DR13 ACCENT: --saffron #F98B1C, active state only. Two exports drifted off-token here (#D97706
        amber-600 and #EA580C orange-600); the fixed form is text-#F98B1C / bg-#F98B1C/10 /
        border-#F98B1C/30.
UX-DR14 RADII: buttons 6px, cards 8px, no gradient.
UX-DR15 DIVIDERS: hairlines only, no row stripes.
UX-DR16 STATUS STRIP: one line #DC2626 BETWEEN the toolbar and the grid (grid.tsx:871), collapsing to
        zero height when empty, and naming the record so it still identifies the row when scrolled
        out of sight. NEVER below the table — the toolbar comp carries a placeholder strip at the
        foot of the card and that is the wrong end.
UX-DR17 EMPHASIS: `Name` is the ONE visually weighted column; everything else is uniform.
UX-DR18 DO-NOT-COPY LIST (each was a real defect in a generated export): no em-dash in empty cells;
        no amber and no #EA580C/#D97706; no amber row hover; no #F8FAFC or slate-50 as a surface —
        reach for --muted, which is warm (hue 90) where #F8FAFC is cool; the header menu reveals on
        :focus-within as well as :hover and stays in the tree at opacity-0, never display:none, as a
        real <button> with an accessible name, never a bare <span>; Name and Actions are `disabled`
        with cursor-not-allowed and a muted treatment in the Hide fields list; the value control
        under `is empty` / `is not empty` is DISABLED, not hidden, and carries
        disabled/aria-disabled; no drag handle on condition rows, no "Copy from another view", no Ask
        AI, no condition groups; at-rest headers show label + sort indicator only; the
        statusMessage live region renders ABOVE the grid.
UX-DR19 BORDER-COLLAPSE TRAP — THE STRUCTURAL ONE. contacts-toolbar-stitch-v1-corrected.html:215
        still uses border-collapse and pins row height on the <tr>, so it renders 33.5px, not
        32px. Measured in Chromium: in a CSS table `height` is a MINIMUM, max-height does not apply
        to <tr> or <td>, and border-collapse: collapse costs a further pixel. TAKE THE TABLE
        STRUCTURE FROM contacts-grid-states-v1.html OR contacts-overlays-stitch-v1-corrected.html,
        NEVER FROM THE TOOLBAR COMP. Assert the row measures 32px; a comp at 33.5px is not a spec.
UX-DR20 PHANTOM COLUMN — OQ-22, RESOLVED 2026-10-13. Both corrected comps draw a `Current status`
        header in the GRID BODY that is NOT a field: absent from lib/supabase/types.ts and from the
        fourteen data columns at manage-contacts-table.tsx:820-1010, asked for at
        stitch-prompt-contacts-toolbar.md:101 and drawn faithfully by Stitch. NEVER BUILD A COLUMN
        FROM A COMP. FR15's nine is the only column set that ships. (The comps' Hide fields popover
        is correct and needs no correction — counted, it carries 7 checked + 2 locked = 9 visible
        and 5 unchecked, exactly FR15's set. Only the BODY headers are wrong.)
UX-DR21 THREE CAPABILITIES HAVE NO COMPOSITION, RECORDED AS A GAP: CAP-3 shows no comp with all
        seven field types side by side; CAP-4's unresolved marker has no reference anywhere; CAP-13
        has zero drag/grip occurrences across all three comps. DO NOT extend a comp to fake them —
        they are unimplemented decisions and belong in a composition first.
UX-DR22 THE DRAG AFFORDANCE IS UNREVIEWED. FR11 invented it rather than implementing a reviewed
        one. What shipped: the LABEL ITSELF is the activator (grid-header-cell.tsx:170-179 —
        setNodeRef, dnd attributes/listeners, role="button", tabIndex={0}, aria-label="Drag to
        reorder <label>", cursor-grab → active:cursor-grabbing, data-grid-drag-handle), gated on
        canDrag so pinned columns are inert. NO GRIP ICON — a visible grip would put a third mark in
        the at-rest header, which UX-DR18 forbids. ONE UNREVIEWED DEVIATION: the handle's focus ring
        is `ring-1 ring-inset ring-ring/50` — 1px at 50% opacity — where UX-DR7 records 2px. Not a
        recorded defect, because no comp covers this state; the visual pass must accept or correct it.
UX-DR23 THE RECORDED MANUAL PASS AT 1440x900 AND 1024x768 IS THE VERIFICATION GATE for everything a
        spec cannot assert. The suite CANNOT check appearance: banning shadows and stripes is
        exactly the CSS a spec would have to hardcode, and hardcoded values fail the first time
        someone tunes a token for dark-mode legibility. Record it in the story file, in light and in
        whatever theme exists. Do NOT mount ThemeProvider.
```


### FR Coverage Map

Eighteen FRs, each mapped to exactly one epic. Verified against the FR list above — no FR appears twice and none is unmapped.

```
FR1  (CAP-1)  Epic 3 - page header, tabs and scope indicator
FR2  (CAP-2)  Epic 2 - surface maturity: one scroll container, no clipping, hairlines
FR3  (CAP-3)  Epic 2 - type-keyed renderers and blank-not-dash
FR4  (CAP-4)  Epic 2 - linked-record labels and the unresolved marker
FR5  (CAP-7)  Epic 1 - edit safety: validate, report, revert
FR6  (CAP-11) Epic 2 - active-cell state
FR7  (CAP-15) Epic 2 - the cell-metrics contract
FR8  (CAP-16) Epic 1 - interaction boundaries (no panel clauses; CAP-5 withdrawn)
FR9  (CAP-10) Epic 1 - double-click activation, blur-commit, retired openers
FR10 (CAP-12) Epic 3 - filter conditions popover with per-type operators
FR11 (CAP-13) Epic 3 - column drag-and-drop
FR12 (CAP-14) Epic 3 - four-item column menu and the contextual reveal
FR13 (CAP-6)  Epic 3 - the toolbar band
FR14 (CAP-17) Epic 3 - one global sort surface, three entry points
FR15 (CAP-18) Epic 2 - the default field set (nine of fourteen)
FR16 (CAP-19) Epic 4 - delete stays and is only an icon (PRESERVATION, nothing to build)
FR17 (CAP-8)  Epic 4 - accessibility and performance
FR18 (CAP-9)  Epic 4 - scope preservation
```

**Inverse check — every epic is fed:**

| Epic | FRs | Count |
| --- | --- | --- |
| 1 | FR5, FR8, FR9 | 3 |
| 2 | FR2, FR3, FR4, FR6, FR7, FR15 | 6 |
| 3 | FR1, FR10, FR11, FR12, FR13, FR14 | 6 |
| 4 | FR16, FR17, FR18 | 3 |
| | **total** | **18** ✓ |

### Requirements Coverage Audit

How each non-FR requirement class is discharged. None becomes an epic of its own — each is an obligation carried by a named story, checked in step 4.

```
NFR1-NFR16   Verification and engineering constraints. Not epic content: they are the acceptance
             gate on every story. NFR2 (one runner at a time) and NFR11 (assertion edits are a last
             resort) are the two most often violated and are called out per story.
NFR11(SUP)   Superseded, retained for the record. NOT IMPLEMENTED — see AR16(b) and the NFR block.
AR1-AR9      docs/manage-grid-pattern.md contracts. Binding on the story that touches the pattern;
             AR2 (meta.grid table rewritten in the same commit) falls to Epic 3's filter story.
AR10-AR15    Testing architecture and project policy. Bind Epic 4 and every story's Verify line.
AR16         The landed date-types migration. Clears Epic 3's old gate; supersedes the TEXT-date
             requirement; changes FR15's reason for hiding last_contacted_on.
UX-DR1       THE BINDING ONE: every story with a visual surface names its composition. Applies to
             every epic.
UX-DR2       Three authoritative comps, mapped to capabilities in the coverage map below.
UX-DR3-DR17  Measured values. Carried per story from the comps; see visual-design.md.
UX-DR18      Do-not-copy list. Binds every story touching a surface.
UX-DR19      border-collapse trap. Binds Epic 2's table-structure work specifically.
UX-DR20      Phantom-column prohibition. Binds Epic 2's grid-body work; FR15's nine is the only
             column set that ships.
UX-DR21      Three capabilities have no composition (CAP-3 types, CAP-4 unresolved, CAP-13 drag).
             Recorded as a gap — do not extend a comp to fake them.
UX-DR22      The drag affordance is unreviewed; its 1px focus-ring deviation is for the visual
             pass. Binds Epic 3's drag story.
UX-DR23      The recorded manual pass at 1440x900 and 1024x768 is the verification gate.
```

### Composition → Epic → Capability binding

Per UX-DR1, every capability with a visual surface is implemented from a named file. This is the
binding the epic layer must carry, because the previous run's epics did not.

| Capability | Composition | Epic |
| --- | --- | --- |
| CAP-1 page header, tabs, scope | `contacts-toolbar-stitch-v1-corrected.html` | 3 |
| CAP-2 surface maturity, one scroll container | toolbar comp + `contacts-grid-states-v1.html` | 2 |
| CAP-3 type-keyed renderers | **NONE — gap, UX-DR21** | 2 |
| CAP-4 unresolved marker | **NONE — gap, UX-DR21** | 2 |
| CAP-6 toolbar band | toolbar comp | 3 |
| CAP-7 save rejected | `contacts-grid-states-v1.html` Panel 6 | 1 |
| CAP-10 editing a cell | `contacts-grid-states-v1.html` Panel 5 | 1 |
| CAP-11 active cell | `contacts-grid-states-v1.html` Panel 3 | 2 |
| CAP-12 filter popover | toolbar comp | 3 |
| CAP-13 column drag | **NONE — gap, UX-DR21** | 3 |
| CAP-14 column menu | `contacts-overlays-stitch-v1-corrected.html` | 3 |
| CAP-15 cell metrics | `contacts-grid-states-v1.html` Panel 1 | 2 |
| CAP-16 state distinctions | `contacts-grid-states-v1.html` Panels 1–6 | 1, 4 |
| CAP-17 sort popover | `contacts-overlays-stitch-v1-corrected.html` | 3 |
| CAP-18 default field set | `contacts-overlays-stitch-v1-corrected.html` (Hide fields) | 2, 3 |
| CAP-19 delete bin | `contacts-overlays-stitch-v1-corrected.html` (Actions) | 2 |


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

Four epics, each standing alone. Every epic delivers complete functionality for its domain, and no epic requires a later one in order to function.

### Epic 1: Editing that cannot lose work

**User outcome:** A program coordinator can correct a record knowing the value either saved or told them why it did not — and cannot lose an edit by moving away from it.

**FRs covered:** FR5, FR8, FR9

**Why it stands alone:** It changes the edit *model* — double-click is the only opener, blur commits, and the keyboard openers are retired. Every later story's interaction boundaries are written against the model this epic defines, so it must land first and it must not be blocked by anything else. Its blast radius is behavioural, not cosmetic: roughly 95 `press()` calls across five spec files depend on the retired openers.

**Deliberately excludes:** any visual treatment of the cell beyond what the states comp already fixes. The grid looks the same before and after this epic; what changes is what a gesture means.

---

### Epic 2: A grid that reads as one premium surface

**User outcome:** Scanning several hundred contacts becomes reading a compact, even, professional table — where an empty value is genuinely empty, a relationship reads as a name, and `Name` is the one column the eye lands on.

**FRs covered:** FR2, FR3, FR4, FR6, FR7, FR15

**Why it stands alone:** It is a surface-layer upgrade over working code, not a rewrite. Virtualization, sticky header, frozen run, keyboard model, editors and the 19-row matrix all survive it. It carries no new dependency and introduces no new data path, so it can ship while everything else is still in motion.

**Carries the two design traps.** UX-DR19 — the `contacts-toolbar-stitch-v1-corrected.html` comp still uses `border-collapse` and pins height on the `<tr>`, rendering 33.5px; the table structure comes from the grid-states or overlays comp, never the toolbar one. UX-DR20 — both comps draw a `Current status` header that is not a field; FR15's nine is the only column set that ships.

**Gap, recorded not papered over:** CAP-3's seven field types and CAP-4's unresolved marker have **no composition** (UX-DR21). Do not extend a comp to fake them.

---

### Epic 3: Finding records, and arranging the grid to fit the job

**User outcome:** A coordinator narrows several hundred contacts to the ones they need with typed conditions and a live count, and arranges the columns so the grid fits the question in front of them.

**FRs covered:** FR1, FR10, FR11, FR12, FR13, FR14

**Why it stands alone and why it is the risk boundary:** It reaches for every control an operator uses to *change* what they see. Its value is complete without Epic 2 — filtering and arranging work on today's grid.

**The risk is concentrated in FR10, and that is why this epic is not merged with Epic 2.** The filter carries two confirmed defects found in the source — OQ-20, where `grid-view-state.ts:130` and `:211` drop a zero-length value in both directions so `is empty` vanishes on reload, and OQ-21, where the operator must travel inside the serialized value because a bare encoding cannot express `is empty` — plus match-*any*, which is **new evaluation logic**: TanStack ANDs column filters today, so OR needs a new path and a new URL key family. A failure here should roll back one story, not the density and toolbar work. The three core files this epic shares with Epic 2 (`grid.tsx`, `grid-header-cell.tsx`, `manage-contacts-table.tsx`) are accepted as meaningful overlap, not incidental.

**Gate cleared.** The previous run held FR10 behind `spec-contacts-date-types`. That spec **landed** — see AR16. This epic no longer waits on anything.

**Coupling worth stating:** FR14 and FR12 are one surface. The column menu's `Sort ascending` and `Sort descending` items open the *same* popover the toolbar's Sort control opens, with both controls prefilled. One surface, three entry points, one state — splitting them across stories would ship a control pointing at something that does not exist yet, which is precisely the nonfunctional control FR13 forbids.

---

### Epic 4: Proving nothing regressed

**User outcome:** The work is trusted: every interactive element is labelled and reachable without a mouse, the grid still reads as one surface after nine stories, and all nineteen matrix rows are still green.

**FRs covered:** FR16, FR17, FR18

**Why it stands alone:** It is the closing gate, not feature work. It proves the cross-cutting properties that no single story can establish on its own — accessibility and performance as a whole, scope preservation after every file has been touched, and the preservation greps that must still read zero.

**It owns the recorded visual pass** (UX-DR23). The suite cannot check appearance: `design-constraints.md` bans shadows and stripes, which is exactly the CSS a spec would have to hardcode, and hardcoded values fail the first time someone tunes a token for dark-mode legibility. So hover / active / editing / selected are graded by eye at 1440×900 and 1024×768, in light and in whatever theme exists. **Do NOT mount `ThemeProvider`** — it is installed and unmounted, and owned by story 6 of `spec-grid-keyboard-editors-and-theme`.

**It also audits what no story owns on its own:** that every write still goes through `lib/manage/api-handlers.ts` with `getStaffContext` + `requireRole` validated against `MANAGE_CONTACT_PATCH_KEYS`; that there are **no per-option coloured pills**; and that the retired keyboard openers **stay** gone — a spec that "helpfully" restores one has undone an explicit product decision.

### Dependency shape

```
Epic 1 ──▶ Epic 2 ──▶ Epic 3 ──▶ Epic 4
   │           │           │          │
   └── defines the edit    └── carries  └── verifies
       model every            the only     everything,
       later boundary          high-risk     nothing regressed
       is written              requirement
```

This is an **execution order, not a dependency**. Each epic is complete without the ones after it: Epic 1 ships a working edit model on today's grid, Epic 2 ships a denser grid with today's filters, Epic 3 ships filtering and arrangement on whatever surface exists. No epic requires a later one in order to function.

Stories within an epic must not depend on future stories in the same epic — step 3 enforces that.


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

## Epic 1: Editing that cannot lose work

**Epic goal:** A program coordinator can correct a record knowing the value either saved or told
them why it did not — and cannot lose an edit by moving away from it.

**FRs covered:** FR5, FR8, FR9
**NFRs binding:** NFR1 (verify gates), NFR9 (one commit path), NFR10 (no request on an unchanged
draft), NFR11 (assertion edits are a last resort — this story is one of the two authorised)
**ARs binding:** AR3 (DW-27 cell rules), AR5 (commit/rollback contract)
**UX-DRs binding:** UX-DR1 (name your composition), UX-DR2 → `contacts-grid-states-v1.html`,
UX-DR18 (do-not-copy list)
**stories.yaml counterpart:** story `1`, already committed at `c7241e0`

### Story 1.1: Double-click edit model, blur-commit, and retiring the keyboard openers

**FRs:** FR5, FR8, FR9 — Double-click edit model, blur-commit, and retiring the keyboard openers

As a program coordinator,
I want to open a cell editor by double-clicking and have my change saved when I move away,
So that I can correct a record without losing the edit and without discovering a keyboard shortcut I have to memorise.

**Acceptance Criteria:**

**Given** a cell on an editable field type,
**When** the operator double-clicks it,
**Then** an editor opens,
**And** a single click does NOT open one.

**Given** an editor is open and the operator has typed nothing,
**When** focus moves away,
**Then** NO request is issued at all,
**And** an e2e spec asserts zero requests — opening and abandoning a cell must be free.

**Given** an editor is open and the operator has typed a correction,
**When** focus moves away, or they double-click again, or they press Enter,
**Then** the value commits through the single commit path and the cell displays the new value.

**Given** an editor is open,
**When** the operator presses Escape,
**Then** the draft is discarded — Escape is the only discard,
**And** because blur commits, there is no dirty-flag prompt and no confirmation dialog anywhere.

**Given** the operator presses `e`, a printable character, or `Space` over a cell,
**When** the key handler runs,
**Then** no editor opens — those three openers are retired,
**And** Space-on-checkbox still toggles, and arrows, Tab, Home/End still navigate.

**Given** a rejected write (forced failure at the API or route layer),
**When** the response returns,
**Then** the cell shows the server's own message and visibly reverts.

**Given** the four source comments that describe the retired model,
**When** this story lands,
**Then** each is rewritten in the same commit — `grid-editors.tsx:181-189` (which states
clicking away writes nothing, now inverted), `:195-199`, `:225-227`, and `use-grid-keyboard.ts:862-866`,
**And** roughly 95 `press()` calls across five spec files are converted to double-click plus typing,
**And** each converted assertion records WHY the behaviour was removed, so a green suite is not
mistaken for evidence the keyboard model is intact.

**Given** this story is graded visually,
**When** the recorded pass runs at 1440×900 and 1024×768,
**Then** the editing cell matches `contacts-grid-states-v1.html` Panel 5 — 2px royal-blue outline,
24px tall, 13px text (UX-DR12),
**And** that panel is named in the story file as this story's surface (UX-DR1).

**Given** verification is run,
**When** the gates execute,
**Then** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails` and `pnpm test:e2e` are green,
**And** `pnpm test` is never reported as a passing run — it executes zero tests and exits 0 (NFR1).


## Epic 2: A grid that reads as one premium surface

**Epic goal:** Scanning several hundred contacts becomes reading a compact, even, professional
table — where an empty value is genuinely empty, a relationship reads as a name, and `Name` is
the one column the eye lands on.

**FRs covered:** FR2, FR3, FR4, FR6, FR7, FR15
**NFRs binding:** NFR3 (token-clean greps stay 0), NFR4 (fixed row heights are load-bearing),
NFR12 (no fabricated data), NFR13 (19-row matrix stays green), NFR16 (accessibility)
**ARs binding:** AR3 (DW-27 — `ctx.text` never `ctx.getValue()`; never editable AND a widget),
AR4 (derived values are accessors, not state — `location` and `collectedBy` have no editor), AR9
(report divergence in the pattern doc in the same commit)
**UX-DRs binding:** UX-DR1 (name your composition), UX-DR3–UX-DR17 (measured values),
UX-DR18 (do-not-copy), **UX-DR19 (`border-collapse` trap)**, **UX-DR20 (phantom column)**,
**UX-DR21 (three capabilities have no composition)**
**stories.yaml counterparts:** stories `3`, `4`, `5`

### Story 2.1: Type-keyed cell renderers, linked-record labels, blank-not-dash, and the default field set

**FRs:** FR3, FR4, FR15 — Type-keyed cell renderers, linked-record labels, blank-not-dash, and the default field set

As a program coordinator,
I want each cell to look like what it holds and each column to be there because I need it,
So that I can read a row at a glance instead of decoding every cell.

**Acceptance Criteria:**

**Given** the Contacts grid,
**When** it renders,
**Then** reusable renderers keyed by field type cover text, select, multiselect, date, number,
boolean and linked record, and an operator can tell a column's type from the cell alone,
**And** the field-type marker is its OWN key on `GridColumnMeta`, independent of `editor` — because
`location` and `collectedBy` are joined accessors with no editor, and a renderer keyed on editor
alone renders nothing for both (AR4).

**Given** a cell whose value is empty,
**When** it renders,
**Then** it renders NOTHING — not the em-dash `GRID_EMPTY_TEXT` (`use-grid-keyboard.ts:20`),
**And** `grid-keyboard.spec.ts:230`, `grid-clipboard.spec.ts:134` and `:151`, and
`manage-contacts-edit.spec.ts:436` are updated in the same commit, each recording why (NFR11).

**Given** a location id with no matching lookup,
**When** the cell renders,
**Then** it shows a visibly UNRESOLVED marker — never the raw UUID, and never a label guessed
from the id (NFR12),
**And** `collectedBy` degrades the same way rather than silently to `""`, because a contact with no
location and a contact with a dangling location reference are different facts.

**Given** the grid opens with 226 contacts,
**When** the default view renders,
**Then** exactly NINE of the FOURTEEN data columns are visible — Name, Phone, Location, Initial
Contact, Total Attendance, Past 60 Days, Notes, Collected By, Actions — and five are hidden: Source,
Books Read, Date of Birth, Last Contacted On, Favorite,
**And** the hidden set is a DEFAULT, not a lock: every one of the five stays reachable, and the set
persists in the `hide` URL parameter,
**And** Name and Actions are `hideable: false` and are not part of that negotiation.

**Given** `Name` and every other column,
**When** the eye scans a row,
**Then** `Name` is the ONE visually weighted column, expressed with weight and space — never a raw
colour and never a per-option hue (NFR3, UX-DR17),
**And** the grid reads exactly one visual emphasis per row.

**Given** no cell is hovered, focused, or in error,
**When** the grid renders,
**Then** the values match the recorded compositions for their state,
**And** the hover tint is NEUTRAL `rgba(74,85,104,0.05)` — never amber and never saffron, because
saffron and amber are the same hue family and an amber hover makes a passive row look activated
(UX-DR8, UX-DR18).

**Given** this story is graded visually,
**When** the recorded pass runs at 1440×900 and 1024×768,
**Then** `contacts-grid-states-v1.html` Panels 1 and 4 are named as this story's surfaces (UX-DR1),
**And** the recorded manual pass (UX-DR23) is written into the story file.

**Design gap, recorded not papered over (UX-DR21):** there is NO composition showing all seven
field types side by side, and NO reference for the unresolved marker. Do not extend a comp to fake
them — these are unimplemented decisions and belong in a composition first. If the story needs to
invent the renderers' appearance, say so in the story file so the choice is recorded rather than
accidental.

### Story 2.2: Active-cell state and the cell-metrics contract

**FRs:** FR6, FR7 — Active-cell state and the cell-metrics contract

As a program coordinator,
I want to know which cell my next keystroke will act on, and every cell to be the same size,
So that I can move through the grid without losing my place or misreading alignment.

**Acceptance Criteria:**

**Given** a cell,
**When** the operator clicks it once,
**Then** it becomes the active cell, held in React state rather than CSS `:hover`, outlined with a
clear but restrained ring of consistent colour and thickness — `inset 0 0 0 1px` royal blue (UX-DR6),
**And** arrows move it, and a selected row and an active cell coexist,
**And** no indicator changes a cell's dimensions or shifts its content.

**Given** the four grid states — hover, active, editing, selected,
**When** they render,
**Then** each is visually distinct: hover neutral, selected `rgba(15,30,84,0.08)`, range
`rgba(249,139,28,0.30)`, error cell 1px `#DC2626` at `outline-offset: -1px` (UX-DR8–UX-DR11).

**Given** the grid renders any row,
**When** its metrics are measured,
**Then** the row is exactly **32px**, pinned on the CELL — `height: 32px` + `padding: 4px 8px` +
`line-height: 24px` (UX-DR3),
**And** the default does NOT flip to dense; dense 28px stays a user-selectable option,
**And** the toolbar's density control initialises from the same constant, so it can never read
"Default rows" while the grid renders something else.

**Given** a long value,
**When** its cell renders,
**Then** the text truncates with an ellipsis and the full value stays reachable on inspection,
**And** the row does not grow — fixed row heights are load-bearing because the virtualizer estimates
from them (NFR4).

**Given** this story is graded visually,
**When** the recorded pass runs,
**Then** `contacts-grid-states-v1.html` Panel 3 is named as the active-cell surface and Panel 1 as
the metrics surface (UX-DR1),
**And** the appearance of the four states is graded BY EYE, not asserted: `design-constraints.md`
bans shadows and stripes, which is exactly the CSS a spec would have to hardcode, and hardcoded
values fail the first time someone tunes a token for dark-mode legibility (UX-DR23).

### Story 2.3: One scroll container, and a surface that does not clip

**FRs:** FR2 — One scroll container, and a surface that does not clip

As a program coordinator,
I want the grid to fill the space it is given with a single scrollbar,
So that the last column is always reachable and I never fight a nested scroller.

**Acceptance Criteria:**

**Given** the grid inside the manage page,
**When** it renders,
**Then** it fills the space it is given rather than asserting `max-h-[70vh]`, which `grid.tsx:849`
applies and which is the cause of BOTH symptoms FR2 names — the clipped final column and the nested
scrollbar,
**And** exactly ONE scroll container exists on both axes.

**Given** the grid renders,
**When** a reviewer inspects the markup,
**Then** the table keeps the shipped `border-separate border-spacing-0` and the fixed height is
carried by the CELL, as `grid-row.tsx` does (NFR4),
**And** the table structure is NOT copied from `contacts-toolbar-stitch-v1-corrected.html`, which
still uses `border-collapse` at line 215 and pins height on the `<tr>`, rendering **33.5px**
(UX-DR19),
**And** an assertion measures the row at 32px — a composition at 33.5px is not a specification.

**Given** the grid body renders columns,
**When** the header row is drawn,
**Then** it shows the columns FR15 says are visible, and NEVER a `Current status` header — that
column is not a field, absent from `lib/supabase/types.ts` and from the fourteen data columns at
`manage-contacts-table.tsx:820-1010` (UX-DR20).

**Given** the header row,
**When** it is compared to the body,
**Then** it is visually distinct by a subtle surface change — `--muted`, never a new colour and
never a raw token (NFR3, UX-DR18).

**Given** verification is run,
**When** the gates execute,
**Then** `pnpm test:e2e:grid` and `pnpm test:static` are green,
**And** the raw-hex and `dark:` greps under `components/grid/` both still return 0.


## Epic 3: Finding records, and arranging the grid to fit the job

**Epic goal:** A coordinator narrows several hundred contacts to the ones they need with typed
conditions and a live count, and arranges the columns so the grid fits the question in front of them.

**FRs covered:** FR1, FR10, FR11, FR12, FR13, FR14
**NFRs binding:** NFR1 (verify gates), NFR2 (one runner at a time), NFR7 (`@dnd-kit/core` is the only
new dependency), NFR8 (grid stays a primitive), NFR14 (the `data-grid-*` DOM contract is frozen)
**ARs binding:** AR1 (never a second table), AR2 (`meta.grid`'s table rewritten in the same commit),
AR7 (URL state contract), AR8 (match-ANY key family + operator-carrying value encoding),
AR12 (`proxy.ts` matches neither `/manage` nor `/api/manage/*` — no new route is added), AR13 (do NOT
mount `ThemeProvider`)
**UX-DRs binding:** UX-DR1, UX-DR16 (status strip between toolbar and grid), UX-DR18, UX-DR22 (the
drag affordance is unreviewed)
**Gate: CLEARED.** The previous run held the filter story behind `spec-contacts-date-types`. That
spec landed — see AR16. This epic no longer waits on anything.
**stories.yaml counterparts:** stories `2` (in flight), `6`, `7`, `8`

> **Ordering is deliberate and is not a dependency on future work.** Story 3.1 ships three menu items
> and NOT a fourth, so no control ever points at a filter surface that does not exist yet — which is
> precisely the dead control FR13 forbids. Story 3.3 completes the menu by adding `Filter`, and is
> complete without 3.2: the column menu item reveals the same popover the toolbar opens.

### Story 3.1: Column drag-and-drop, a clean column menu, and a contextual header affordance

**FRs:** FR11, FR12, FR14 — Column drag-and-drop, a clean column menu, and a contextual header affordance

As a program coordinator,
I want to drag columns into the order I think in, and a header that stays quiet until I reach for it,
So that the grid matches the question in front of me without permanent chrome.

**Acceptance Criteria:**

**Given** a column header,
**When** the operator drags it,
**Then** it moves to a new position using `@dnd-kit/core`, which supplies pointer, touch AND keyboard
sensors,
**And** the order persists through the `cols` URL parameter and is written ONCE on drop — nothing per
frame, one write,
**And** `@dnd-kit/core` is the only new dependency the whole spec may add: version-pinned at the
workspace root, lockfile committed, resolving for both apps (NFR7).

**Given** the pinned run — `select` and the identity column,
**When** a drag is attempted on, or dropped onto, or would RESULT IN an order interleaving a scrolling
column into the pinned run,
**Then** the drag is refused and the order is left unchanged,
**And** the check runs against the resulting order array, not the drop target alone — the frozen
`left` offsets are cumulative and derived from `columnOrder`, so a bad commit is invisible in a
screenshot and obvious while scrolling.

**Given** a hidden column sits between two visible ones,
**When** a move steps toward a target,
**Then** it skips the hidden column, reusing `moveColumn`'s full-order read rather than a naive index
splice.

**Given** the column menu opens,
**When** the operator reads it,
**Then** it holds exactly THREE items in this story — Sort ascending, Sort descending, Hide column,
**And** it does NOT hold `Filter`, which arrives with story 3.3.

**Given** a header at rest,
**When** the operator does nothing,
**Then** it shows the label and a sort indicator ONLY — no permanently visible funnel and no `···`
(CAP-14's core fix),
**And** the menu control is revealed on hover AND on `:focus-within`, staying in the tree at
`opacity-0` rather than `display:none`, as a real `<button>` with an accessible name, never a bare
`<span>`,
**And** it is suppressed on the selection column and on any header supplying its own control,
**And** it is never hidden from a touch user.

**Given** the header label,
**When** it is clicked,
**Then** it does NOT sort — `grid-header-cell.tsx:177` stops being a sort button, which also settles
the conflict `docs/manage-grid-pattern.md` records about a header being both a control and a sort
button.

**Given** this story's design provenance is reviewed,
**When** the affordance is examined,
**Then** it is recorded that the drag affordance was **invented, not implemented from a composition** —
all three comps contain zero `drag`/`grip` occurrences (UX-DR21, UX-DR22),
**And** the choice recorded is that the LABEL ITSELF is the activator
(`grid-header-cell.tsx:170-179`: `role="button"`, `tabIndex={0}`, `aria-label="Drag to reorder
<label>"`, `cursor-grab` → `active:cursor-grabbing`, `data-grid-drag-handle`), gated on `canDrag` so
pinned columns are inert, with NO grip icon because a third mark would violate the at-rest rule,
**And** its focus ring — `ring-1 ring-inset ring-ring/50`, 1px at 50% opacity — is recorded as an
**unreviewed deviation** from the 2px in UX-DR7, for the recorded visual pass to accept or correct.

**Given** `docs/manage-grid-pattern.md` and the source comments,
**When** this story lands,
**Then** `grid-header-cell.tsx:116-120` — which calls reordering deterministic, keyboard-operable and
dependency-free — is rewritten in the same commit, along with the pattern doc's Move left / Move
right section (AR9).

### Story 3.2: The filter conditions popover with per-field-type operators

**FRs:** FR10 — The filter conditions popover with per-field-type operators

As a program coordinator,
I want to describe what I want using each field's own vocabulary,
So that I can narrow the grid to the records that answer my question.

**Acceptance Criteria:**

**Given** the toolbar's filter control,
**When** the operator opens it,
**Then** a POPOVER anchored BELOW the toolbar holds the conditions — not an inline bar and not a modal.
OQ-18 was reversed three times and this is the accepted answer,
**And** the live matching-row count stays visible in the toolbar row, because the popover is anchored
below the toolbar rather than over it,
**And** the accepted cost is recorded: the operator cannot watch WHICH rows match while composing.

**Given** the popover is open,
**When** conditions are composed,
**Then** each row is `Field · operator · value` with its own delete control, plus `+ Add condition`,
**And** ONE connective governs the whole list — match all, or match any — so the list is never a mixed
`A and B or C` expression, and there are no precedence rules and nothing to serialize in order,
**And** there is NO drag handle on condition rows, no condition groups, no "Copy from another view",
and no Ask AI; each absence is said in the code, because all four appear in the reference screenshot
and a later agent reading only that will re-add them.

**Given** a condition is on a field of type X,
**When** the operator list and the value control render,
**Then** both depend on X: text offers contains / does not contain / is / is not / is empty / is not
empty; number adds relational comparison; date offers its own set plus a relative-date value select;
checkbox offers ONE fixed operator, SHOWN per OQ-15, with a checkbox value; single and multi select
offer is / is not / is any of / is none of / is empty / is not empty.

**Given** the operator is `is empty` or `is not empty`,
**When** the row renders,
**Then** the value control is **disabled, not hidden** — a greyed control reads as not-applicable
where a hidden one cannot — and it carries a real `disabled`/`aria-disabled` and accepts no value
programmatically.

**Given** the operator changes the field type,
**When** the row re-renders,
**Then** operator and value are RESET to something valid — leaving `contains` on a date field, or an
orphaned value, silently filters nothing,
**And** `is any of` on a multiselect uses INTERSECTION, not the substring-per-element behaviour in
`gridGlobalFilterFn`'s array branch, which would make "EC" match "ECE".

**Given** an empty value is serialised,
**When** the URL is written and read,
**Then** it round-trips. `grid-view-state.ts:130` reads `raw.trim().length > 0` and `:211` writes
`value.length > 0`, so today an empty value is indistinguishable from an absent one and is dropped in
BOTH directions — OQ-20, a confirmed defect in shipped code,
**And** the operator TRAVELS INSIDE the value, e.g. `f.<colId>=is:`, because a bare value cannot
distinguish `contains` from `is` and cannot express `is empty` at all — OQ-21,
**And** `f.<colId>` keeps its AND-across-columns meaning so matrix row 17 still round-trips, while
match-ANY conditions use a new key family mirroring `GRID_PARAM_PREFIXES` (grid-view-state.ts:39).

**Given** a date condition uses a relative preset,
**When** it is serialised,
**Then** it stores a computed ABSOLUTE boundary (OQ-14), so a shared URL does not mean something
different tomorrow and no assertion depends on the wall clock.

**Given** a date field's value is absent or invalid,
**When** a relative operator evaluates it,
**Then** the row is excluded EXPLICITLY, with a visible reason — a silent drop is the failure mode
that surfaces months later. This obligation is FR10's own, carried forward from superseded NFR11: the
storage-layer NaN hazard died with the DATE migration, but the API can still return null (AR16).

**Given** the per-column filter popover at `grid-header-cell.tsx:183-205`,
**When** this story lands,
**Then** it is removed, and with it `meta.grid.filter`'s job of choosing the per-column control — its
other job, supplying a value type, survives as the registry key,
**And** `docs/manage-grid-pattern.md`'s `meta.grid` table is rewritten in the same commit (AR2).

### Story 3.3: Toolbar compaction, Hide fields, contextual bulk actions, and the Sort control

**FRs:** FR13 — Toolbar compaction, Hide fields, contextual bulk actions, and the Sort control

As a program coordinator,
I want every grid control in one compact band, with actions that appear only when they apply,
So that the toolbar costs no space and offers nothing that does not work.

**Acceptance Criteria:**

**Given** the toolbar,
**When** it renders,
**Then** it is ONE band carrying, in order: scoped search, the filter control, Sort, Hide fields, the
visible/total count, and New contact,
**And** the bulk-action bar appears ONLY while rows are selected, and the selection count stays
visible in the resting state so a selection is knowable before acting on it.

**Given** the filter control,
**When** conditions are active,
**Then** it doubles as the indicator, naming the columns it is filtering in saffron — e.g. "Filtered
by Name, Phone",
**And** there is NO view label and NO view dropdown (OQ-1, resolved twice): a static label over
URL-backed state was rejected because a control that looks like a view selector but cannot save a view
is the nonfunctional button FR13 forbids,
**And** there is NO indicator on the affected column headers, and no permanently visible per-column
control — CAP-14 forbids it.

**Given** the Sort control,
**When** the operator opens it,
**Then** a popover offers exactly a FIELD dropdown and a DIRECTION select, plus a quiet Clear,
**And** the SAME popover opens from the column menu's `Sort ascending` and `Sort descending` items with
BOTH controls prefilled — one surface, three entry points, one state,
**And** sort state stays in the `sort` URL parameter and a cleared sort is a valid state.

**Given** the Hide fields control,
**When** it opens,
**Then** it lists all FOURTEEN data fields — replacing the existing Columns menu at
`grid-toolbar.tsx:130`, never shipping both — with Name and Actions ticked, `disabled`,
`cursor-not-allowed` and muted,
**And** the default tick state matches Epic 2 story 2.1's nine, and hiding persists in the `hide` URL
parameter as a DEFAULT, not a lock.

**Given** the grid's own live region,
**When** the toolbar is redesigned,
**Then** the `statusMessage` channel survives and stays reachable (grid.tsx:865) — story 5's per-row
delete outcomes report through it, and dropping it is a silent regression (AR7),
**And** the strip renders BETWEEN the toolbar and the grid, one line, collapsing to zero height when
empty, naming the record — never below the table (UX-DR16).

**Given** verification is run,
**When** the gates execute,
**Then** `pnpm test:e2e:manage` is green, and no new `/api/manage/*` route was added — `proxy.ts`
matches neither `/manage` nor `/api/manage/*`, and any new route would inherit that gap (AR12).

### Story 3.4: Page header, navigation, and scope

**FRs:** FR1 — Page header, navigation, and scope

As a program coordinator,
I want to know at a glance which section I am in and whose records I am looking at,
So that I never act on the wrong scope.

**Acceptance Criteria:**

**Given** `/manage`,
**When** the page header renders,
**Then** the title and its metadata — staff name, contact count, location count — form ONE optical
unit, the scope indicator aligning to that unit's baseline rather than to the bottom of a separate
column.

**Given** the tab strip,
**When** it renders,
**Then** all five tabs are preserved in order as `MANAGE_VIEWS`, and the active one is unmistakable
via weight plus the existing `--program-primary` token — never a new colour,
**And** the header block loses vertical height without cramping the tab row.

**Given** the scope toggle links,
**When** they are hovered,
**Then** `hover:bg-black/5` at `manage-portal.tsx:84` and `:92` is replaced with
`hover:bg-foreground/5`, because black/5 is invisible on the dark surface,
**And** `--program-primary` headers are left alone: `text-white` on a fixed dark brand colour is
correct in both themes.


## Epic 4: Proving nothing regressed

**Epic goal:** The work is trusted: every interactive element is labelled and reachable without a
mouse, the grid still reads as one surface after every story, and all nineteen matrix rows are still
green.

**FRs covered:** FR16, FR17, FR18
**NFRs binding:** every NFR, especially NFR1 (the gates), NFR2 (one runner at a time), NFR3 (greps
stay 0), NFR13 (matrix), NFR14 (DOM contract), NFR15 (performance)
**ARs binding:** AR10 (escalate the test level when a shared component changed), AR11 (CI does NOT run
e2e — a green CI run is not verification of a behavioural change), AR14 (the known pre-existing
`test:airtable-removal` failure is reported, never hidden), AR15 (never bare `pnpm exec playwright test`)
**UX-DRs binding:** UX-DR1, **UX-DR18**, **UX-DR19** (accept or correct the 1px drag-ring deviation),
**UX-DR23** (the recorded manual pass is the verification gate)
**stories.yaml counterpart:** story `10`

### Story 4.1: Interaction boundaries, accessibility, and the recorded visual pass

**FRs:** FR16, FR17, FR18 — Interaction boundaries, accessibility, and the recorded visual pass

As a program coordinator,
I want every control labelled, reachable without a mouse, and every gesture to do exactly one thing,
So that the grid is trustworthy whatever I use to drive it.

**Acceptance Criteria:**

**Given** the seven interaction boundaries,
**When** each is exercised,
**Then** a checkbox click activates no edit; a read-only field never enters edit mode; a single cell
click preserves row navigation; and keyboard propagation is stopped only where a specific key would
otherwise be swallowed (`isGuardedTarget`),
**And** a dropdown or popover interaction never triggers a double-click edit — the NEW risk, because
with double-click as the only opener a double-click landing on a select editor's popover could open
the editor AND fire the cell's handler, so the cell's handler must check the event target is not
inside `[data-grid-editor]`.

**Given** this story's boundary list,
**When** it is read,
**Then** it asserts nothing about a record panel, a per-row open affordance, or prev/next navigation —
CAP-5 was withdrawn on 2026-10-12 and no such surface exists,
**And** no boundary is reinstated to satisfy a clause from an older version of this story.

**Given** the whole grid,
**When** it is operated with a keyboard alone,
**Then** every interactive element has an accessible name, focus is visible throughout, contrast and
hit targets are adequate, and it remains usable at 1024px (NFR16).

**Given** the drag affordance built in Epic 3,
**When** the recorded visual pass runs,
**Then** its `ring-1 ring-inset ring-ring/50` focus ring is explicitly accepted or corrected against
the 2px in UX-DR7, and the decision is written down (UX-DR22).

**Given** appearance cannot be asserted by the suite,
**When** the manual pass runs,
**Then** hover, active, editing and selected are graded **by eye** at 1440×900 and 1024×768, in light
and in whatever theme exists, and the result is recorded in this story file (UX-DR23),
**And** `ThemeProvider` is NOT mounted — it is installed and unmounted, owned by story 6 of
`spec-grid-keyboard-editors-and-theme` (AR13).

**Given** the preservation greps,
**When** they run,
**Then** `grep -rn "dark:" components/grid/` returns 0, the raw-hex / `rgb(` / `white` / `black` grep
returns 0, and there is no `Manage*` or `/api/manage` vocabulary under `components/grid/` (NFR3, NFR8),
**And** every `data-grid-*` attribute documented at `e2e/fixtures/manage-grid.ts` still exists and
still means what that file says — including `data-grid-delete-row` and `data-grid-delete-report`
(NFR14).

**Given** FR16 — delete stays and is only an icon,
**When** this audit runs,
**Then** it confirms `GridRowDeleteControl` is still nothing but a 24px ghost button carrying `Trash2`
at 14px in `--destructive`, with `aria-label="Delete <name>"`, disabled while deleting, behind a
confirmation — and that nobody has "improved" it with a label or a text button,
**And** it confirms `GridRowAddControl` and `data-grid-add-record` remain separate and unaffected.

**Given** the authorization model,
**When** every write path is audited,
**Then** each still goes through `lib/manage/api-handlers.ts` with `getStaffContext` + `requireRole`,
validated against `MANAGE_CONTACT_PATCH_KEYS`, with no component talking to Supabase directly and no
new authorization logic (NFR5).

**Given** the palette,
**When** the grid renders,
**Then** there are NO per-option coloured pills — no eleven pastel hues, no stable-hash palette.
Revisiting them requires an explicit `data-*` assertion surface and a decision on whether tone belongs
to the option (a payload change across four files) or to the field.

**Given** the retired keyboard openers,
**When** the suite is green,
**Then** `e`, type-to-edit and Space-seeding are STILL GONE. If any has been quietly restored, that is
reported rather than shipped as a passing suite testing something nobody intended to keep.

**Given** the 19-row matrix,
**When** the full suite runs,
**Then** every row is still `Covered`, or a retired row's reason is recorded in
`matrix-coverage-map.md` in the same commit (NFR13),
**And** `apps/folk` and `apps/gita-life` are mirrored, verified with `md5sum` on the files meant to
match (NFR6).

**Given** verification is run,
**When** the full suite executes,
**Then** `pnpm test:static` and the FULL `pnpm test:e2e` are green — one runner at a time, 5–7
minutes, because a shared component changed and this is the pre-PR gate (NFR2, AR10),
**And** `pnpm test` is never reported as a passing run,
**And** the known pre-existing `pnpm test:airtable-removal` failure of 3 of 30 checks is confirmed with
`git stash` and reported as pre-existing rather than suppressed by editing the gate (AR14),
**And** no deliberately broken spec is left in `e2e/specs/` — failures are generated into a temp dir
and removed in a `finally` (AR15).
