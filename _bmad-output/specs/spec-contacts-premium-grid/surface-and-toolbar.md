# Surface and toolbar

Binding contract for CAP-1, CAP-2, CAP-3, CAP-4 and CAP-6. Read `existing-state.md` first — every finding below is sourced there.

## CAP-1 — Page header and navigation

`manage-portal.tsx:58-141` is the whole header. The problems are spatial, not aesthetic: `space-y-6` between header, scope notice, tab list and content; `text-2xl sm:text-3xl` bold Poppins for the title; a metadata line in plain `text-sm`; and the scope indicator in a separate `flex-col sm:items-end` block that lands in a different optical row from the title.

The redesign:

- **Title and metadata form one unit.** Title, then the scope line — staff name, contact count, location count — tight beneath it. The count is metadata about the *page*, so it belongs with the page's name, not floating in the body.
- **The scope indicator aligns to that unit's baseline**, not to the bottom of a separate column. This is what "align the scope indicator with the page header" means: one block, one alignment.
- **The active tab is unmistakable.** Today `TabsTrigger` inherits shadcn's default active state, which is a subtle background. A tab strip where the active item must be inferred is a navigation failure. Weight plus the brand token, not a new color.
- **Tighten `space-y-6`.** The brief asks for less vertical space without cramping. The tab list has `h-auto … flex-wrap` and the content follows at `gap-4`; the slack is in the header block above it.
- **Five tabs preserved**, in order, as `MANAGE_VIEWS`.

The `hover:bg-black/5` on the scope toggle links (`manage-portal.tsx:84`, `:92`) is invisible on a dark surface. `hover:bg-foreground/5` resolves in both. It is a one-token fix inside a file this work already touches.

Leave `--program-primary` headers alone: `text-white` on a fixed dark brand color is correct in both themes.

## CAP-2 — Grid surface maturity

### The scroll container is the whole problem

`grid.tsx:849` renders the scroll region:

```tsx
<div ref={scrollRef} role="group" aria-label={ariaLabel} tabIndex={0}
     className="… max-h-[70vh] overflow-auto …">
```

One container, both axes, `max-h-[70vh]`. That is correct and must stay — a second scroll container is the classic way a sticky header and a frozen leading run both break.

**`max-h-[70vh]` is the cause of the "clipped final column" and nested-scrollbar reports.** A `vh`-capped inner scroller inside a page that also scrolls produces a viewport-height-dependent frame, and the last column's right edge is exactly where a horizontal scrollbar's thumb sits. CAP-2's success names both symptoms, so this is the thing to fix — by letting the grid fill the space it is given rather than asserting a viewport fraction. `design-constraints.md` bans scroll shadows as the workaround, and that ban stands.

### What is already right, and must survive

`grid-row.tsx:165-232` is careful and should not be rewritten:

- `[&>td]:border-b [&>td]:border-border` — the hairline. `design-constraints.md` explicitly prefers this to stripes, because stripes fight selection highlighting.
- Sticky frozen cells get `bg-card` of their own, because they must be opaque over what scrolls beneath. Row hover and selection states are therefore driven **per cell**, not on the `<tr>`.
- The cell-range highlight is applied via `[&>td[data-grid-cell-selected][data-grid-cell-selected]]:bg-accent/30` — the doubled attribute raises specificity above the row-level `>td` rules so no `!important` is needed. **Do not simplify this.**
- `border-r border-border` on the last frozen column only — one divider for the whole pinned run, not one per pinned cell.

`grid.tsx` emits `<table>` directly rather than using `components/ui/table`, because that wrapper's div is a second scroll container. Keep it that way.

### Header

`grid-header-cell.tsx` already has sort, filter, column menu and resize. CAP-2 requires the header to be *visually distinct* from the body — a subtle surface change, not a new color. The grid is token-clean and must stay so.

## CAP-3 — Type-keyed cell renderers

### Two families, and conflating them is the trap

1. **Stored-field columns** carry `meta.grid.editor` and render through the editor registry.
2. **Joined accessor columns** — `location`, `collectedBy` — have **no editor and no stored value**. `manage-contacts-table.tsx:848` returns a *joined string* from `locationIds`.

A renderer keyed on `meta.grid.editor` alone renders nothing for both joined columns. So the field-type marker needs its own metadata key, independent of `editor`, covering: text, select, multiselect, date, number, boolean, linked, longtext.

That is a small addition to `GridColumnMeta` (`grid-types.ts:51`) and it is the honest shape — `editor` answers "how is this cell edited," and "what is this cell" is a different question.

### The DW-27 rule still binds

`docs/manage-grid-pattern.md` records it and story 4 resolved it:

> A closed-state editor display must render `ctx.text`, never `ctx.getValue()`.

And, from the same file: **never mark a column `editable` *and* give it a `cell` widget.** A widget renderer replaces the value the grid would print, and `cell.text` is where the optimistic override lives — so an editable column with a widget shows the *old* value for the whole round trip, with no error anywhere.

A refactor that moves cell rendering around is exactly the operation that walks into this. Read that section before touching `grid-row.tsx`.

### Blank-not-dash

`GRID_EMPTY_TEXT` (`use-grid-keyboard.ts:20`) is applied at `:951` and `:1753`. **Remove it and update three specs in the same commit** — `grid-keyboard.spec.ts:230`, `grid-clipboard.spec.ts:134` and `:151`, `manage-contacts-edit.spec.ts:436`. This is the one legitimate assertion edit in this spec, because the contract is deliberately changing. Record it in the story file.

Note the asymmetry: `collectedBy` already returns `""` on a miss while `location` returns the raw id. Blank-not-dash plus CAP-4 makes both consistent — and both *visible*.

## CAP-4 — Linked records

The joins exist. The fix is the fallback.

```ts
// current — manage-contacts-table.tsx:849
contact.locationIds.map((id) => locationNameById.get(id) ?? id).join(", ")
```

The `?? id` is what prints UUIDs. Replace with a visibly unresolved marker, distinct from empty: **a contact with no location and a contact with a dangling location are different facts**, and collapsing them loses a data-quality signal.

CAP-3's constraint applies — **no fabricated labels.** If the lookup misses, the honest render is "unknown location", never a guess derived from the id.

## CAP-6 — Toolbar

### What is there

`grid-toolbar.tsx:88-175`: search bound to `globalFilter` with a clear `X`, a `Columns` visibility menu, a density `Select`, a `rowAction` slot (story 5's add control), a `toolbarExtra` slot, and a `visibleCount` / `totalCount` pair. `manage-contacts-table.tsx:1030` puts the selection count and bulk-favourite button in `toolbarExtra`.

**That is already most of the brief's list.** The work is compaction and hierarchy, not construction.

### What must not be lost

**The `statusMessage` channel.** `grid.tsx:865` renders the grid's own live region; story 5's per-row delete outcomes report through it. Any toolbar redesign must keep it reachable and announced. A record panel and a bulk report that write to a channel the new toolbar does not render is a silent regression — and silent is the failure mode the e2e suite is best at missing.

### Bulk actions are contextual

`selectedCount` is already computed (`:1021`) and the bulk button is already disabled at zero (`:1040`). CAP-6 asks for a *separate contextual bar* that appears only on selection. That is a layout change, not a new capability — and it must not remove the selection count from the resting state, because an operator needs to know a selection exists before acting on it.

### The view control is a label, not an object

OQ-1 is unresolved. **This spec assumes a static label over the URL-backed view state** (`sort`, `q`, `f.<colId>`, `cols`, `hide`, `size.<colId>` — `grid-view-state.ts:9-15`).

A control that *looks* like a view selector and cannot save a view is the "nonfunctional button" the brief forbids. So: either the label is honest, or the feature is deferred. Do not ship a dropdown of views that does not exist.

### Filter control, honest about its operators

Today there are two operators: substring, and number *at-or-above* — the control's own help text says "Keeps rows at or above this value" (`grid-header-cell.tsx:112`). The brief asks for "a filter control with a visible indication when filters are active," which this already nearly is.

The **active indicator** is the real gap: nothing in the header or toolbar currently shows that a filter is narrowing the set. The row count (`226 of 226 in scope`) is the only signal, and it is a number an operator has to notice.

If the condition builder from `spec-grid-condition-builder` is adopted later, it replaces this whole model. **Do not build the toolbar's filter surface twice.**

## Per-option pills: not here

Airtable's colored pills are the loudest thing in the reference screencast and the most deliberately rejected item in this spec. The grid is token-clean and must stay so; the brand is a deliberate royal blue; and a stable-hash palette collides at small palette sizes. See `SPEC.md` Non-goals for the full reasoning and the conditions under which it returns.

## CAP-10 — Edit activation and commit

Dwaraka's decision: **double-click opens the editor, a second double-click commits, and blur commits.** The keyboard openers are retired.

### What is removed, and where it lives

| Opener | Location | Fate |
| --- | --- | --- |
| `e` | `use-grid-keyboard.ts` keydown branch | **removed** |
| printable-char type-to-edit | `use-grid-keyboard.ts:1517-1527` | **removed** |
| `Space` seeding `" "` | `use-grid-keyboard.ts:1495` | **removed**, except the checkbox toggle, which is not an edit opener |
| `openEditor`'s `seed?` parameter | `use-grid-keyboard.ts:841-881` | **loses its only caller** — the editor always opens empty-draft, or from the current value |

### What survives, because it is not an edit opener

Arrow navigation, `Tab`/`Shift+Tab`, `Home`/`End`, `Cmd+Home`/`End`, `Escape` (now discard, and still cancel-a-popover), `Space` on a checkbox cell, and `Delete`/`Backspace` clear. **None of these open an editor, so CAP-10 does not touch them.** Upstream story 2's *navigation* work is intact; only its *opening* work is retired.

The tempting mistake is to "simplify" the `Space` branch while removing its editor-seeding half. It still toggles a checkbox.

### The three contracts this reverses

**1. AC4 — "clicking away mid-edit writes nothing."** `grid-editors.tsx:181-189`:

```tsx
onOpenChange={(next) => {
  setOpen(next)
  if (!next) {
    // Closing is a discard. AC4 is explicit that clicking away mid-edit
    // writes nothing for every editor except `checkbox`.
    ctx.close()   // → cancelEditing
  }
}}
```

Under blur-commit this inverts: popover close is a **commit**, not a discard. The comment must be rewritten, not left to rot — it is currently the only statement of why closing discards, and a later agent reading it will conclude the behaviour is deliberate and correct.

This is the single most important edit in CAP-10. `select`, `multiselect`, `date` and `longtext` all render through `PopoverEditor`, so a wrong answer here silently makes clicking an option in a dropdown discard the edit instead of applying it.

**2. `PopoverEditor:195-199` — the stale reason.**

```tsx
onPointerDown={(event) => {
  // The cell keeps the pointer: focus has to stay on the cell so `e`
  // and `Space` still address this column afterwards.
  event.stopPropagation()
}}
```

`e` no longer exists. **Keep the `stopPropagation`** — without it the cell loses the pointer and a double-click cannot reach the popover trigger at all. Rewrite the comment to say *that*. Deleting the handler because its stated reason died is the trap here.

**3. `OpenableDisplay:225-227` — "the cell is already the focusable, keyboard-reachable thing — `e` opens its editor."** Also stale. Update.

### The unchanged-draft guarantee

`openEditor` seeds the draft from the cell's current value:

```ts
setDraft(seed ?? definition?.draftSeed?.(text, cell.getValue()) ?? text)
```

So an operator who double-clicks a cell and clicks away has a draft equal to the current value. Under blur-commit that becomes a write. **An unchanged draft must issue no request**, or every stray cell click becomes a PATCH against production data.

`GridCellCommit` already documents *"Value parsed from the draft. Unchanged text still commits"* (`grid-types.ts:163`) — the existing inline path relies on that to commit a genuinely unchanged-but-meaningful edit. **Blur-commit needs a stricter rule than inline commit:** blur with zero keystrokes since open is a no-op; Enter with a changed draft commits as today. Distinguish *touched* from *unchanged*, not *equal* from *different*.

Assert it: open a cell, click away, assert **zero** PATCH requests.

### Text selection — OQ-7

A double-click on a cell with text selects the word, and the browser does that before any handler runs. This spec assumes **editing wins**: `preventDefault` on the cell's `onDoubleClick`, and no word selection inside editable cells. Unselected text inside a grid cell is not a real loss — the operator can still read it in the panel — and the alternative is a double-click that half-works.

`PopoverEditor`'s trigger and `OpenableDisplay` are both `<span>`s, not inputs, so the popover editors avoid this entirely. It is the text/date inputs that need it.

### Specs to update, not delete silently

- `e2e/specs/grid-editors.spec.ts` — **14** `press("e")` / `keyboard.type` sequences become `dblclick` on the cell, then `keyboard.type`.
- `e2e/specs/grid-keyboard.spec.ts` — the `e` and type-to-edit cases.
- `e2e/specs/manage-contacts-edit.spec.ts` — **16** `press()` calls; the edit path is the heart of this file.
- `e2e/specs/grid-clipboard.spec.ts`, `grid-cell-range.spec.ts` — audit; most use arrows and selection, which survive.

**Each retired assertion records why it was removed.** A green suite that no longer tests the keyboard model is a lie about coverage, and the next agent will trust it.

New specs: double-click opens on each of the seven editor types; single click does **not** open; a second double-click commits; blur commits a touched draft; blur commits **nothing** when untouched; `Escape` discards; arrows and `Tab` still navigate without opening an editor; `Space` on a checkbox still toggles.

## CAP-12 — The filter conditions bar

### What it replaces

The per-column filter popover. Today every header carries its own funnel button (`grid-header-cell.tsx:183-205`) wrapping `GridColumnFilterInput` in a `PopoverContent` `w-64`. That is the thing being removed, and with it `meta.grid.filter`'s second job — the one `docs/manage-grid-pattern.md` documents as *"chooses the per-column filter control"*. That table needs rewriting in the same commit.

What survives: `meta.grid.filter`'s **first** job, supplying a value type so the modal knows whether a field is text or numeric, and `f.<colId>` as the serialization while conditions remain simple.

### It is a popover anchored under the toolbar, per OQ-18

**This section previously argued for a modal, then for an inline bar. Both arguments are withdrawn.** Dwaraka chose the inline bar because the live row count was free when the bar sat above the grid, and then reversed it on seeing a composed design: a popover anchored under the toolbar's filter control keeps the count visible, because the count lives in the toolbar row and the popover hangs below it.

The comparison that used to sit here:

| | Popover | Inline bar | Modal |
| --- | --- | --- | --- |
| Live row count visible while composing | yes — it stays in the toolbar | yes | no, the modal covers it |
| Grid rows visible while composing | no, covered | yes | no |
| Vertical space | on demand | permanent | on demand |
| Aesthetically | yes | no | no |

**The cost is real and is the one recorded here so nobody rediscovers it later:** the operator cannot watch *which* rows match while composing, because the popover covers the grid. That was accepted in exchange for not spending permanent vertical space on every visit, and in exchange for not hand-reconstructing a count inside a covering dialog.

The popover is **not dismissible into a different shape**: it has a close affordance and a "Clear all", but it is a single surface anchored to one control. Do not reintroduce a per-column popover — see "What it replaces" below.

`components/ui/dialog.tsx` exists and is **not** used here.

### Contents — condition rows, and one connective for the whole list

Per OQ-18 this is a popover; per OQ-13 it holds **several** conditions:

```
In this view, show contacts

  Where  [ Current status ▾ ] [ is empty ▾ ]              [🗑]
  and ▾  [ Phone           ▾ ] [ contains ▾ ] [ Enter a value ] [🗑]

  + Add condition          Clear all
```

**Absent, deliberately:** *"Copy from another view"* (needs saved views, a non-goal), *"Describe how to filter this view"* (Ask AI, a non-goal), **`+ Add condition group`** — which the reference screenshot also shows, and which stays out because grouping is what forces an ordered mixed expression — and **the `⠿` drag handle** on condition rows, which the reference screenshot also shows. Say why in the code, or a later agent reading only the screenshot will re-add them.

**Why there is no drag handle.** One connective governs the whole list, so conditions are a **set of columns**, never an ordered expression (see "Where the conditions live in the URL"). Reordering two conditions joined by a global *match all* or *match any* cannot change the result set — there are no precedence rules for an order to affect. The handle would imply a capability that has no effect. If grouping is ever added, this reasoning is what must be revisited first.

**One connective governs the whole list.** The `and ▾` prefix shown on the second row is driven by a single value for the whole bar, not per row: *match all* or *match any*. So the list is never `A and B or C`, which means **no precedence rules, no ordered expression, and no ordered serialization**. Airtable's own bar looks per-row and behaves per-group; this one looks the same and behaves globally. That difference is the whole point and it should be stated in the code, because the visual suggests the more complicated semantics.

**`is empty` must survive the URL.** See OQ-20 and OQ-21 — `grid-view-state.ts:130` and `:211` drop any value whose length is zero, so a bare empty value is deleted on write and ignored on read. The operator therefore travels *inside* the value (`f.status=is:`), which is non-empty as a whole. `+ Add condition` makes this bug reachable constantly; it was already true with one condition.

### Where the conditions live in the URL

Per OQ-19, `f.<colId>` **stays** and keeps its AND-across-columns semantics — matrix row 17 asserts `f.location` round-trips, and every shared URL already in circulation keeps its meaning. Match-**any** needs a new key family mirroring the existing prefixes (`GRID_PARAM_PREFIXES`, `grid-view-state.ts:39`).

That is why "one connective" matters technically as well as visually: because the connective is global, both cases are **sets of columns**, never ordered expressions. `f.*` is already a set ANDed by TanStack's `getFilteredRowModel`. Match-any is the same shape evaluated with OR. No list parser is needed, and nothing has to preserve row order.

### The operator set is per field type

This is the substantive part, and it is why CAP-12 is not "the old filter in a modal." **`contains` is meaningless on a number and `is empty` is meaningless on a checkbox**, so one global list would have dropped numeric filtering entirely.

| Field type | Operators | Value control |
| --- | --- | --- |
| **text** | contains · does not contain · is · is not · is empty · is not empty | text input; **disabled** for the two empty operators |
| **number** | is · is not · greater than · less than · is empty · is not empty | numeric input; disabled for empty |
| **date** | is · is not · is within · is after · is before · is on or before · is on or after · is empty · is not empty | **a select**: today · yesterday · one week ago · one month ago · N days ago · exact date — then a date input when *exact date* is chosen |
| **checkbox** | one entry: *is* — **shown, not hidden** (OQ-15) | a **checkbox**, not a text input |
| **single select** | is · is not · is any of · is none of · is empty · is not empty | the option list; hidden for empty |
| **multi select** | is · is not · is any of · is none of · is empty · is not empty | the option list, multi-selectable; hidden for empty |

Three consequences that are easy to get wrong:

**The value control is conditional, per operator.** `is empty` has no value. `is any of` on a select has a *list* of values. *Exact date* swaps a text input for a date input. Every operator declares its value shape, and the popover renders from that declaration rather than special-casing operator ids.

**An operator with no value renders its control DISABLED, not absent.** This was previously "hidden". The disabled treatment is deliberate: a greyed control that visibly reads "not applicable" tells an operator more than a control that silently disappears and leaves the row looking ragged. Two obligations come with it — the control must carry a real `disabled`/`aria-disabled` so it is unfocusable and announced as unavailable, and it must not accept a value even programmatically, or `is empty` acquires a value it cannot serialize.

**The checkbox operator control shows one entry** (OQ-15). My earlier suggestion was to hide it; Dwaraka chose uniformity, which is defensible — an operator scanning the modal sees the same three-control shape whatever the field type, and one inert option costs less than the inconsistency.

**Switching field type resets operator and value.** Choosing *date* while holding `contains` leaves an operator the date field does not have. The reset must land on something valid — first operator, empty value — and never leave an orphaned value that silently filters nothing. Matrix row 17 asserts `f.location` round-trips, so a stale value would fail there rather than being caught quietly.

**The operator list is a typed registry keyed by field type**, resolved from `meta.grid.filter`'s remaining value-type role — not a switch statement. Same shape as the editor registry, same reason: a new field type is a registry entry, not a branch.

### Dates are TEXT columns — this is a real trap

```sql
-- 20261004000000_create_core_tables.sql
date_of_birth      TEXT,   -- :11
initial_contact    TEXT,   -- :17
last_contacted_on  TEXT,   -- :18
```

No `date` or `timestamp` type. The date editor writes `YYYY-MM-DD` (`grid-editors.tsx:860`, `:880`) and validates it is a real date (`:832-836`), so **ISO-ordered string comparison happens to be correct for well-formed rows** — and that is the only reason it works.

- `is after` / `is before` / `is on or after` **may** use string comparison, and only because the format is fixed-width ISO. That is a coincidence, not a guarantee.
- **`is within`, *today*, *yesterday*, *N days ago* must parse to a real `Date` before comparing.** A row holding `""`, `"unknown"`, or a partial date will not parse, and under a naive `new Date(x).getTime()` it yields `NaN` — which compares false against everything, silently removing the row from every date-filtered view with no error.
- **A non-`YYYY-MM-DD` string must be handled explicitly:** either excluded with a visible reason, or reported as an unparseable value. Silently dropping rows is the failure mode that gets discovered months later.

### Relative dates must not rot (OQ-14)

*"Yesterday"* and *"7 days ago"* depend on when they are evaluated. A URL carrying the literal string means something different tomorrow, and a spec asserting on it is time-dependent.

**Serialize the computed absolute boundary.** `is within · 7 days ago` becomes a fixed `from`/`to` pair at the moment the operator set it. The trade is real and worth stating: the filter stops moving. A view that said "last 7 days" and silently kept meaning them would be worse, and a *test* that depends on the wall clock cannot be a permanent test.

Whether a view should re-evaluate on open is exactly the saved-view question this spec declined to answer, so freezing the boundary is consistent.

### One indicator, and it names the columns

An active filter is indicated in the **toolbar only**, and it states *which columns* are filtering — e.g. **"Filtered by Name, Phone"** — in saffron, which is otherwise reserved for nothing.

**This section previously required two indicators.** It asked for a toolbar state *and* a per-column header state, because under the inline-bar design the toolbar could only carry a **count** ("2 filters active"), and a count alone does not say which columns are involved — so the header indicator had to supply the rest. With thirteen funnels collapsing into one popover, the toolbar indicator is strong enough to stand alone. **Do not add a per-column header indicator on the strength of the old text**; the reasoning it rested on is withdrawn with the inline bar.

The residual cost is recorded rather than solved: if a filtered column is scrolled out of the horizontal viewport, the toolbar says *which* column but not *where in the row it sits*. That is accepted for now. If it proves painful, a header marker is a small addition — but it must not become a permanently visible control, or CAP-14 fails and the thirteen funnels return.

### The header's Filter item pre-fills the popover

The column menu's fourth item opens the popover with a condition on that column already added, and the operator preselected to `contains` (or `is` for a non-text field). That keeps Airtable's quick path — filter the column I'm looking at — while every condition is composed in one place, and it is why the header's funnel icon is redundant.

**It opens the one popover, anchored under the toolbar** — not a per-column popover of its own. The thirteen funnels are gone; opening this item must not resurrect one, or the grid fills with filters again.

## CAP-13 — Column drag-and-drop, via `@dnd-kit/core`

Dwaraka chose the library. That reverses this spec's blanket "no new dependency" rule **for CAP-13 only**, and it removes both costs the native-drag analysis recorded:

| Native HTML5 drag | `@dnd-kit/core` |
| --- | --- |
| pointer and mouse only | pointer, **touch** and **keyboard** sensors |
| keyboard reordering impossible | keyboard-operable drag — **this resolves OQ-10** |
| hand-rolled `dragover`/`preventDefault` | `DndContext`, `useDraggable`, `useDroppable` |

**OQ-10 is withdrawn.** This spec had recorded losing keyboard reordering as an accepted accessibility regression. It is not one. `@dnd-kit/core` ships a `KeyboardSensor` with coordinate-based movement, so a keyboard user can pick up a column, move it, and drop it.

The library is not in `package.json` or `pnpm-lock.yaml`. **It is the only dependency this spec may add**: pin the version, add it at the workspace root with the other shared deps, and commit the lockfile. It must resolve for both `apps/folk` and `apps/gita-life`.

### What still applies unchanged

**The pinned run.** `@dnd-kit` does not know that `select` and `name` are frozen, so every rule the removed menu items enforced is still this story's job:

1. A pinned column is **not draggable** — no activator, no `useDraggable`.
2. A drop **onto** a pinned column is rejected and the order is unchanged.
3. An order that would **interleave** a scrolled column into the pinned run is rejected.

Rule 3 is the one that will be missed. The frozen `left` offsets are cumulative and derived from `columnOrder` (`grid.tsx:614`, `grid-row.tsx:160`); a bad order yields a sticky column whose `left` does not match its actual position — invisible in a screenshot, obvious when scrolling. **Validate the resulting order before committing it**, not just the drop target.

### Reuse `moveColumn`'s logic, not its mechanism

`grid.tsx:773-806` already knows how to move a column correctly: it reads the **full** order, steps toward a target while **skipping hidden columns**, no-ops when the target is unchanged, and calls `setColumnOrder` (`:805`). Keep that as a pure `(from, to)` function over visible indices and call it from the drop handler.

A naive index splice will not skip hidden columns, and dropping onto a hidden column's slot is a real bug — a column can be invisible and still hold a position in `columnOrder`.

### Commit through the transient handle

`grid.tsx:908` notes TanStack has no reorder flag — `columnOrder` is always writable, so the grid gates it. The transient-handle pattern (`beginTransientChange` / `commitTransientChange` / `cancelTransientChange`, `grid-view-state.ts:184-196`) is the model, and the column **width** drag at `grid.tsx:456` is the worked example: nothing per frame, one write on pointer-up, and a cancelled drag restores the URL-derived value.

### Rewrite the stale comment

`grid-header-cell.tsx:116-120` still says:

> *Column order moves through Move left / Move right rather than drag-and-drop: it is deterministic, keyboard-operable, and serializes straight to `cols` with no new dependency.*

All three reasons are overruled — including "no new dependency." **Rewrite the comment and `docs/manage-grid-pattern.md`'s Move left / Move right section in the same commit.** A comment explaining a decision someone has reversed is worse than no comment, because it reads as current.

### This supersedes a deliberate decision

`grid-header-cell.tsx:116-120`:

> *Column order moves through Move left / Move right rather than drag-and-drop: it is deterministic, keyboard-operable, and serializes straight to `cols` with no new dependency.*

Dwaraka rejected all three reasons in favour of drag. **Rewrite the comment** — as with CAP-10's stale comments, a comment that explains a decision someone has overruled is worse than no comment, because it reads as current.

### What is removed and what is added

| | Menu | Drag |
| --- | --- | --- |
| `Move left` / `Move right` | removed | — |
| reorder affordance | menu items | header drag |
| `grid.tsx:773-806` `moveColumn` | unused, remove or repurpose | the drop handler's logic |
| `canMoveLeft` / `canMoveRight` props | unused | — |

Keep `moveColumn`'s **logic** — it already skips hidden columns so "move left" means the previous *visible* one, and it no-ops when the target is unchanged. A naive index-based drop will not do that, and dropping onto a hidden column's position is a real bug.

### The pinned run is the hard part

`grid.tsx:940-941` computes `canMoveLeft`/`canMoveRight` from `canReorder` and the visible index, and `docs/manage-grid-pattern.md` records why: **a column in the pinned run cannot be hidden or reordered.** Reordering `select` drops it out of the run and takes the identity column with it; reordering the identity column lets it scroll away. Either one undoes the reason the run exists.

Drag must enforce the same rule. Three requirements:

1. A pinned column is **not draggable** (no drag handle, no `draggable` attribute).
2. A drop **onto** a pinned column's position is rejected, and the order is unchanged.
3. A dragged column cannot be dropped to an index that would place it after a pinned column, or the run's offsets break.

The third is the one that will be missed. The frozen run's `left` offsets are cumulative and computed from `columnOrder` (`grid.tsx:614`, `grid-row.tsx:160`); an order that interleaves a scrolled column into the run produces wrong sticky offsets — a sticky column with a `left` that does not match its actual position, which is invisible in a screenshot and obvious when scrolling.

### ~~No library~~ — superseded, kept only to prevent a re-derivation

~~Nothing is installed and nothing may be added. Native HTML5 drag (`draggable`, `dragstart`, `dragover`, `drop`) is the honest choice for a header-to-header reorder, and it needs no dependency.~~ **Wrong.** Dwaraka chose `@dnd-kit/core`, reversing the blanket no-dependency rule for CAP-13 only. Native HTML5 drag would have been pointer-and-mouse only, with no touch and no keyboard — which is OQ-10, since withdrawn because `@dnd-kit` ships a `KeyboardSensor`.

This paragraph is left struck through on purpose. It reads top-to-bottom *after* the decision that overturned it, which is exactly the position most likely to convince a later agent. If you are reading this and about to reach for `draggable`, the answer is `DndContext`.

### Persistence is unchanged

`cols` already carries the order (`grid-view-state.ts:15`, written by `setColumnOrder` at `grid.tsx:805`). A drop writes the new order through the same path. **The transient-handle pattern** (`beginTransientChange` / `commitTransientChange` / `cancelTransientChange`) is the model: a drag writes nothing per frame, and commits once on drop. Reuse it — the width-resize drag at `grid.tsx:456` already does exactly this, and the column drag is the same problem.

## CAP-14 — Header affordance

The current header always renders the filter funnel and the `MoreHorizontal` menu button (`grid-header-cell.tsx:183-232`). Two small icon buttons in every one of fifteen headers, permanently, is the "redundant menus and icons on every column" the brief calls out.

**Reveal on hover and on focus, never on touch.** Concretely:

- at rest: the label, and the sort indicator
- on hover or keyboard focus: the menu control appears
- **the control must not be `display: none` for a touch user** — a header with no visible menu and no hover is an unreachable feature. Use an opacity/visibility treatment that leaves it focusable and tappable rather than removing it from the tree.

Four items, exactly: **Sort ascending · Sort descending · Hide column · Filter**. Both sort entries are new — sorting is currently only on the header label. A header that is both a sort button *and* contains a control is fine as long as the control is not inside the sort button's hit area; `docs/manage-grid-pattern.md` is explicit that a header which is a control must not also be a sort button, and the reverse case needs the same care.

## CAP-16 — Interaction boundaries

Seven rules, each with a mechanism already in the file:

| Boundary | Mechanism |
| --- | --- |
| Checkbox click does not edit or open the panel | `stopPropagation` on pointerdown (`:796`) |
| Dropdown/popover interaction does not double-click-edit | the control is inside the cell; the cell's double-click handler checks the target is not inside `[data-grid-editor]` |
| Read-only fields never edit | `openEditor` returns false when `meta.grid.editable !== true` (`use-grid-keyboard.ts:849`) |
| Editing does not open the panel | no row-level open handler exists at all (OQ-6) |
| Single click preserves row/record navigation | a single click sets the active cell, nothing else |
| Popover trigger does not steal the double-click | `stopPropagation` on `PopoverEditor`'s trigger (`:195-199`) |
| Keyboard propagation stopped only where necessary | `isGuardedTarget` (`use-grid-keyboard.ts:68`) and the explicit `stopPropagation` calls in `handleDraftKeyDown` |

The new risk in this list is the **second row**: with double-click as the only edit opener, a double-click landing on a select editor's popover could open the editor *and* trigger the cell's own double-click. The cell's handler must check the event target.

## CAP-11 and CAP-15 — What is already true

Most of the second requirements block describes behaviour the grid **already has**. Recording it so no one rewrites working code:

| Requirement | Status | Evidence |
| --- | --- | --- |
| Active cell held in React state, not CSS `:hover` | **shipped** | `use-grid-keyboard.ts:1757` — `isFocused: isRowFocused(row) && focusedColumnId === cell.column.id` |
| Clear but restrained active outline, separate from row hover | **shipped** | `grid-row.tsx:208` — `ring-ring ring-1 ring-inset` per cell, distinct from `:179`'s row-level `bg-muted/40` |
| Cell text 13px | **shipped** | `GRID_BASE_FONT_CLASS = "text-[13px]"` (`grid-row.tsx:17`) |
| Row height 32px | **shipped** | `GRID_ROW_HEIGHT.default = 32` (`:20`) |
| Cell padding ~8px horizontal | **shipped** | `truncate px-2` = 8px (`:205`) |
| Content vertically centred | **shipped** | `align-middle` (`:205`) |
| Subtle row hover, no layout shift | **shipped** | `[&:hover>td]:bg-muted/50` (`:180`) — a background, so no reflow |
| Numbers right-aligned and tabular | **shipped** | `align: "right", tabular: true` on both attendance columns (`manage-contacts-table.tsx:905`, `:912`) |
| Truncate with ellipsis, full value reachable | **shipped** | `truncate` plus the cell's `title` (`grid-row.tsx:199-204`) |
| No double-thick borders | **shipped** | `[&>td]:border-b` with `border-separate border-spacing-0` (`grid.tsx:~880`); the frozen run gets one `border-r` on its last member only (`:214`) |
| Cell content cannot change row height | **shipped** | fixed `height` on the `<tr>` plus popover-ported editors (`grid-editors.tsx:175`) |
| Read-only fields never edit | **shipped** | `openEditor` returns false unless `editable === true` (`use-grid-keyboard.ts:849`) |
| Enter saves, Escape cancels, arrows work in inputs | **shipped** | `handleDraftKeyDown` (`:1310-1352`); the `isGuardedTarget` guard keeps container keys inert inside a draft (`:68`) |
| Checkbox click does not edit | **shipped** | `stopPropagation` (`:796`) |
| Stable record and column ids, not array indexes | **shipped** | `getRowId={(contact) => contact.id}`; selection is addressed by `GridSelectionCoordinate` deliberately, and `grid-types.ts:205-215` explains why a *selection* is index-based while a *commit* is id-based |

**One genuine gap in that table:** the 13-item test list's item 9 — *"Hover, active, editing, and selected states are visually distinct"* — has **no assertion anywhere**. Every current spec asserts behaviour, not appearance. See the visual-verification note below.

### Visual verification is a manual step, and it is not optional

The brief says *"Inspect the finished implementation in the browser at normal desktop resolution. Adjust the CSS based on the actual rendered result rather than assuming the implementation is visually correct."*

That is right, and it exposes a limit worth stating plainly: **the suite cannot check this.** `design-constraints.md` bans scroll shadows, stipes and heavy borders, and all of those are CSS properties a Playwright assertion would have to hardcode — which is how a test becomes a change-detector that fails when someone tunes a token for dark-mode legibility.

So CAP-11, CAP-14, CAP-15 and CAP-16's *distinctness* criteria are verified by a **recorded manual pass at 1440×900 and 1024×768, in light and in whatever theme exists** — with the outcome written into the story file. The state transitions themselves (click sets active, double-click opens, Escape discards) *are* asserted, because those are behaviour.

## What must survive this work

- `grep -rn "dark:" components/grid/` → **0**
- `grep -rEn "#[0-9a-fA-F]{3,8}|rgb\(|white|black" components/grid/` → **0**
- no `Manage*`, `/api/manage` or contacts vocabulary under `components/grid/`
- every `data-grid-*` attribute in `e2e/fixtures/manage-grid.ts` still present and still meaning what that file documents
- all 19 matrix rows still Covered, or a retired row's reason recorded in `matrix-coverage-map.md` in the same commit
- `apps/folk` and `apps/gita-life` mirrored; `md5sum` the files that were meant to match
- `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`, `pnpm test:e2e` all green
- **`e`, type-to-edit and `Space`-seeding stay gone.** If a later story restores one, it has undone an explicit product decision.
