# Existing state, verified

Every claim below was read out of the tree. File:line references are the evidence; nothing is recalled.

**Baseline:** `feat/grid-keyboard-editors-and-theme` at `9a43c3b`, stories 1–4 committed, story 5 in flight.

## Stack

| Thing | Version / state | Where |
| --- | --- | --- |
| `@tanstack/react-table` | `^8` | `package.json:83` |
| `@tanstack/react-virtual` | `^3` | `package.json:84` |
| `next-themes` | `^0.4.6` — **installed, never mounted** | `package.json:96` |
| Design tokens | 31-token `.dark` block, `--program-primary` = royal blue, `--program-accent` = saffron | `apps/folk/app/globals.css:8,34-41,78` |
| Provider mount | five providers, **not** `ThemeProvider` | `components/providers.tsx:12` |

## What the grid already ships — do not rebuild

| Capability | Where |
| --- | --- |
| Virtualized rows, sticky header, frozen leading run | `components/grid/grid.tsx`, `grid-row.tsx`, `grid-header-cell.tsx` |
| URL-backed view state (6 keys) | `grid-view-state.ts:9-15` |
| Text inline editing, optimistic display, visible revert | `use-grid-keyboard.ts` |
| Full keyboard model (j/k/e, arrows, Tab, Home/End, type-to-edit, Space, Delete) | `use-grid-keyboard.ts` |
| Cell range selection (anchor + focus + extent) | `use-grid-keyboard.ts` |
| Clipboard TSV copy/paste | `use-grid-keyboard.ts` |
| Eleven typed editors behind a typed registry | `grid-editors.tsx` (1110 lines), `grid-editor-types.ts` |
| DW-27 resolved in the primitive | `grid.tsx` `resolveConsumerRenderers` |
| Popover-anchored editors so rows never grow | `grid-editors.tsx:175` `PopoverEditor` |
| Pills (two-tone only) | `grid-editors.tsx:257` `Pill` |
| Row lifecycle: add record, delete with per-row outcomes | `grid-row-lifecycle.tsx` (story 5, in flight) |
| Row selection, indeterminate header, bulk favourite | `manage-contacts-table.tsx` |
| Panel states (loading / error / empty / filtered-empty) | `grid-panel.tsx` |
| 21 e2e specs, 19-row matrix all Covered | `e2e/specs/`, `matrix-coverage-map.md` |

## The four findings behind CAP-2, CAP-3, CAP-4 and CAP-6

### 1. No hierarchy — `grid-row.tsx:17`, `:205`

`GRID_BASE_FONT_CLASS = "text-[13px]"` is applied uniformly, and every cell is `truncate px-2 align-middle text-[13px]`. Not one column declares a weight. `align` and `tabular` *are* used where they matter (`manage-contacts-table.tsx:905`, `:912`, `:978`) — so the metadata mechanism works and weight simply was never specified.

Ten columns at identical volume means the identity column is not readable as identity.

### 2. Empty renders as a character — `use-grid-keyboard.ts:20`

```ts
export const GRID_EMPTY_TEXT = "\u2014"
```

Applied at `use-grid-keyboard.ts:951` and `:1753`, consumed in `grid-row.tsx:78` and `:199`. Across 226 rows and five sparse columns that is over a thousand em-dashes.

**Three e2e specs assert the placeholder** and must change with CAP-3:

- `e2e/specs/grid-keyboard.spec.ts:230` (constant declared `:55`)
- `e2e/specs/grid-clipboard.spec.ts:134` and `:151` (constant declared `:40`)
- `e2e/specs/manage-contacts-edit.spec.ts:436` (constant declared `:92`)

This is the one place where editing an assertion to match a change is correct, because the spec itself is changing the contract. Say so in the story file.

### 3. Dense exists and nothing selects it — `grid-row.tsx:19-21`, `grid-toolbar.tsx:156`

`GRID_ROW_HEIGHT = { dense: 28, default: <higher> }`, exposed as a `Select`, defaulted to `"default"` at `manage-contacts-table.tsx:400`. No consumer sets a default and nothing else references density. At 226 rows the default costs roughly 1,300px of scroll.

The virtualizer estimates from `GRID_ROW_HEIGHT[density]` (`grid.tsx:633`), so changing the default is a one-line change with no re-measurement.

**The trap:** the toolbar's density `Select` shows a *label*. If the default changes and the control does not initialize from it, the control reads "Default rows" while the grid renders dense. That is a visible lie.

### 4. Linked-record labels are already joined

`manage-contacts-table.tsx:849`:
```ts
(contact) => contact.locationIds.map((id) => locationNameById.get(id) ?? id).join(", ")
```
`:937`:
```ts
contact.collectedById ? (payload.staffNames[contact.collectedById] ?? "") : ""
```

`locationNameById` is built at `:435` from `payload.locations`; `staffNames` is resolved server-side into the payload.

So the brief's "display linked-record labels instead of raw internal IDs" is **already satisfied**. The raw UUIDs visible in the screenshot are the `?? id` fallback firing — a contact referencing a location id the payload does not carry. CAP-4 replaces that fallback with a visible *unresolved* marker. **This is a correctness signal, not a cosmetic one:** a dangling location reference is data worth noticing.

`collectedBy` returns `""` on a miss, so it degrades silently. CAP-4 should make the two consistent.

## The columns, and their field types

`manage-contacts-table.tsx:786-1019`, fifteen columns:

| Column | Type | Editable | Notes |
| --- | --- | --- | --- |
| `select` | boolean (widget) | — | `selectable`, `align: center`, size 40, `stopPropagation` at `:796` |
| `name` | text | ✅ | `frozen: true`, `hideable: false` — the identity column |
| `phone` | text | ✅ | |
| `location` | **linked** (joined) | — | `filter: "text"` |
| `source` | select | ✅ | options from `KNOWN_SOURCE_VALUES` ∪ row values (`:447`) |
| `booksRead` | multiselect | ✅ | options from `payload.booksReadOptions` |
| `initialContact` | date | ✅ | free-text `YYYY-MM-DD` |
| `dateOfBirth` | date | ✅ | free-text |
| `totalAttendanceCount` | number | — | `align: right`, `tabular`, `filter: "number"` |
| `past60DayAttendanceCount` | number | — | same |
| `lastContactedOn` | date | — | read-only, ISO |
| `notes` | longtext | ✅ | truncates; `longtext` editor is a popover by design |
| `collectedBy` | **linked** (joined) | — | derived read-only |
| `favorite` | boolean (widget) | — | star toggle, `stopPropagation` at `:953` |
| `actions` | — | — | `GridRowDeleteControl`, `stopPropagation` at `:990` |

CAP-3's type-keyed renderers map onto this list directly. Note that `location` and `collectedBy` are **joined accessors, not field columns** — they have no `editor` and no stored value of their own, which is why a renderer keyed on `meta.grid.editor` alone would miss them. A field-type marker is needed.

## Filters today

| | `q` | `f.<colId>` |
| --- | --- | --- |
| state | `globalFilter` | `columnFilters` |
| set at | `grid.tsx:471` | `grid.tsx:472` via `column.setFilterValue` (`:894`) |
| resolved by | `gridGlobalFilterFn` (`:583`) | `getFilteredRowModel` (`:600`) + per-column `filterFn` (`:421-427`) |
| operators | one: normalized substring | two: substring, and number *at-or-above* |
| URL | `q` | `f.<colId>` |

`meta.grid.filter` does **two** jobs: it picks the per-column control (`grid-header-cell.tsx:103`, `:112`) *and* supplies `filterFn`. `docs/manage-grid-pattern.md` documents it that way; if the filter UI is redesigned, that table needs updating in the same commit.

The current number control's own copy admits the limitation: *"Keeps rows at or above this value."* `equals` and `lessThan` do not exist.

## Edit openers today, and what CAP-10 retires

**Verified in the tree.** `openEditor` (`use-grid-keyboard.ts:841-881`) is called from three places, and it is the only way an editor opens:

| Caller | Line | Fate under CAP-10 |
| --- | --- | --- |
| `e` key | `:903` via `stepFocus`/`beginEditing` | **removed** |
| `Space` seeding `" "` | `:1495` | **removed**; the checkbox-toggle half survives |
| printable character | `:1525` | **removed** |

`openEditor`'s `seed?` parameter loses every caller. `grid-editor-types.ts`'s `draftSeed` hook becomes the only draft source.

Four contracts reference `e` or `Space` **in comments that will become lies**:

- `grid-editors.tsx:196-198` — *"so `e` and `Space` still address this column afterwards."* The `stopPropagation` it justifies is still required for double-click; the reason is not.
- `grid-editors.tsx:225-227` — *"`e` opens its editor."*
- `grid-editors.tsx:185-186` — *"AC4 is explicit that clicking away mid-edit writes nothing for every editor except `checkbox`."* **This one CAP-10 reverses outright.** It is the only statement of why a popover close discards, and it governs `select`, `multiselect`, `date` and `longtext`.
- `use-grid-keyboard.ts:862-866` — `e`/`Enter` on a checkbox are the same as clicking it.

`GridCellCommit.value` is documented as *"Unchanged text still commits"* (`grid-types.ts:163`). CAP-10's blur-commit needs **stricter** semantics than that: untouched must mean no request, not an equal-value commit.

## Blur does not commit today

`grep -n "onBlur" components/grid/grid-editors.tsx` → **zero hits.** `commitEditing` (`:1036`) is reached only from `handleDraftKeyDown` (`Enter` at `:1312`, `Tab` at `:1342`) and the editor context's `close`. There is no blur handler anywhere in the grid.

So CAP-10's blur-commit is a **new mechanism**, not a rule change — and it has to be built without a second commit path, or the constraint "one commit path" is violated on day one.

## The second requirements block, audited against the source

Most of it is already implemented. This is the audit; the right column is the evidence for not rewriting working code.

| Requirement | Status | Evidence |
| --- | --- | --- |
| Active cell in React state, not CSS `:hover` | shipped | `use-grid-keyboard.ts:1757` |
| Active outline distinct from row hover | shipped | `grid-row.tsx:208` per-cell ring vs `:179` row background |
| 13px cell text | shipped | `GRID_BASE_FONT_CLASS` (`grid-row.tsx:17`) |
| 32px row height | shipped | `GRID_ROW_HEIGHT.default` (`:20`) |
| ~8px horizontal padding | shipped | `px-2` (`:205`) |
| Vertically centred | shipped | `align-middle` (`:205`) |
| Subtle hover, no layout shift | shipped | `bg-muted/50` — a background, not a reflow (`:180`) |
| Numbers right-aligned + tabular | shipped | `manage-contacts-table.tsx:905`, `:912` |
| Truncate + full value reachable | shipped | `truncate` + `title` (`grid-row.tsx:199-204`) |
| No double-thick borders | shipped | `border-separate border-spacing-0`; frozen run gets one `border-r` on its last member (`:214`) |
| Cell cannot change row height | shipped | fixed `<tr>` height + ported popovers (`grid-editors.tsx:175`) |
| Read-only never edits | shipped | `openEditor` guard (`use-grid-keyboard.ts:849`) |
| Enter saves / Escape cancels | shipped | `handleDraftKeyDown` (`:1310-1352`) |
| Arrows normal inside inputs | shipped | `isGuardedTarget` (`:68`) |
| Stable ids, not indexes | shipped | `getRowId`; `grid-types.ts:205-215` documents *why* selection is index-based while commits are id-based |
| **Visual distinctness of the four states** | **unasserted** | no spec asserts appearance; see the manual-pass requirement |
| **Filter modal** | **absent** | per-column `Popover` only (`grid-header-cell.tsx:183-205`) |
| **Column drag-and-drop** | **absent** | `grep -i drag` finds only column *width* dragging (`grid.tsx:456`); no dnd library in `package.json` |
| **Four-item column menu** | **absent** | menu is Move left / Move right / Hide column (`:224-232`) |
| **Contextual header affordance** | **absent** | `grep` for `opacity-0`/`group-hover` in `grid-header-cell.tsx` → **zero**; both controls always render |

## Column reordering today, and what a drag must preserve

`grid.tsx:773-806` holds `moveColumn` — the logic a drag should reuse:

- reads the **full** order (`table.getState().columnOrder ?? columnIds`) and the **visible** set
- stepping toward a target **skips hidden columns**, so "move left" means the previous *visible* one
- splices and calls `table.setColumnOrder(next)` (`:805`)
- `grid.tsx:908` notes TanStack has no reorder flag — `columnOrder` is always writable, so the grid gates it itself

**The gate** is `grid.tsx:940-941`: `canMoveLeft={canReorder && visibleIndex > 0}`, where `canReorder` derives from `frozenColumnIds` (`:614`).

A drag must enforce the same rule **and** prevent an order that interleaves a scrolled column into the pinned run. The frozen `left` offsets are cumulative and derived from `columnOrder`, so a bad order yields a sticky column whose `left` does not match its real position — invisible in a screenshot, obvious when scrolling.

`grid-header-cell.tsx:116-120` documents the current choice as deliberate: *"deterministic, keyboard-operable, and serializes straight to `cols` with no new dependency."* All three reasons are overruled. **Rewrite the comment**, and `docs/manage-grid-pattern.md`'s Move left/Move right section with it.

The transient-handle pattern is the model for committing a drag: `beginTransientChange` / `commitTransientChange` / `cancelTransientChange` (`grid-view-state.ts:184-196`, used by the width drag at `grid.tsx:456`). Nothing per frame, one write on pointer-up.

## The filter screenshot

`/home/dwarakadhisha-dasa/Pictures/Screenshots/Screenshot From 2026-10-09 13-32-29.png` shows four regions: the AI *"Describe how to filter this view"* box, `In this view, show contacts`, a `Where [Field] [operator] [value] [delete] [handle]` condition row, and `+ Add condition` / `+ Add condition group` / `Copy from another view`.

It is Airtable's **inline** bar; the request is a **modal** opened from a control above the grid. Two of the four regions — the AI box and `Copy from another view` — are already non-goals. The modal therefore ships the condition builder plus, per `surface-and-toolbar.md`, a **live matching-row count**, which the inline bar gets for free by sitting above the grid.

## Converting the date columns to `DATE` — viable, blocked on an audit

**Worth doing eventually. Not in this spec, and the blocker is data, not code.**

The payoff is real: `date` columns would make CAP-12's relative-date operators trivial, delete the "parse before comparing" hazard, and let Postgres do the work.

Four findings, in order of how much they matter:

**1. The Airtable migration can put non-dates in a date column.** `scripts/migrate-airtable-data.mjs:532-539`:

```js
function text(value) {
  if (typeof value === "string") { const trimmed = value.trim(); return trimmed ? trimmed : null }
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}
```

`date_of_birth` (`:661`) and `initial_contact` (`:667`) both go through it. If Airtable held those as a **number** field — an Excel serial day, or a timestamp — the column now contains `"35000"`, and `ALTER TABLE … TYPE date USING col::date` either **throws** or silently yields year 35000. **The audit must run first:** count rows per column that do not parse as `YYYY-MM-DD`.

**2. It contradicts a live upstream constraint.** `spec-manage-dashboard-grid/SPEC.md:88`: *"No change to the Supabase schema, RLS policies, or the existing API route surface."* That binds that spec rather than this one forever — but the change needs its own justification, not a footnote here.

**3. The type ripples further than the three columns.** `lib/supabase/types.ts:159,185,211` (generated), `lib/supabase/manage.ts:113`, `lib/supabase/data.ts:184` and `:109`, `components/manage/manage-types.ts:59`, `manage-contacts-table.tsx:916`. The generated Supabase types need regenerating, not hand-editing.

**4. `last_contacted_on` is already wrong, independently.** `lib/supabase/data.ts:614-621` writes `last_contacted_on: currentProgramDate()` at **insert** and nothing ever updates it — so "last contacted on" is really "created on" for every row, and `manage-favorites-view.tsx:559` shows it to users as `Last contacted on: … or never`. **Fix that before converting the column**, or you will carefully migrate a value that does not mean what its name says.

**What this spec does instead:** carries the parse-and-handle-explicitly rule for TEXT dates. That rule is correct whether or not the columns are converted, and gets simpler if they are.

## Date columns are TEXT, and the filter will feel it

```sql
-- 20261004000000_create_core_tables.sql
date_of_birth      TEXT,   -- :11
initial_contact    TEXT,   -- :17
last_contacted_on  TEXT,   -- :18
```

No `date`, no `timestamp`. The date editor writes fixed-width `YYYY-MM-DD` (`grid-editors.tsx:860`, `:880`) and validates it is a real date (`:832-836`, which rejects `2026-02-31` rather than letting `new Date` roll it into March).

So string comparison is *accidentally* correct for ordering, because ISO-8601 fixed-width sorts lexicographically. Three of CAP-12's date operators cannot rely on that:

- **`is within`, *today*, *yesterday*, *N days ago*** must parse to a real `Date`. A row holding `""` or a partial string yields `NaN` from `getTime()`, which compares false against everything — the row vanishes from every date-filtered view with no error anywhere.
- **A non-`YYYY-MM-DD` value must be handled explicitly**, either excluded with a visible reason or reported. Silent row removal is the failure mode that surfaces months later.
- The `lastContactedOn` column is documented as *"Read as an ISO date by the server, so it sorts correctly as text"* (`manage-contacts-table.tsx:915`) — that comment becomes a **constraint** once a date filter can compare it.

## Converting the date columns to `DATE` — moved to its own spec

**This is now `../spec-contacts-date-types/`, written to run before this one.** Two findings from that investigation change what this spec owes:

- **The client type ripple is zero.** This section previously said the change "ripples through the generated Supabase types." It does not. `lib/supabase/types.ts:154,156,158` already declare these columns as `string | null`, and Supabase `gen-types` emits `string` for **both** `text` and `date`. Regenerating the file after the migration produces a byte-identical result. **That claim is withdrawn.**
- **RLS is not involved.** `20261006010000_scoped_rls_policies.sql` references these three columns **zero** times, so the migration touches no policy and cannot weaken scoped access.
- **The dangerous "fix" is the timezone one.** `SUPABASE_DATE_TIME_ZONE` is `Asia/Kolkata` and `currentProgramDate()` already emits a program-local calendar date, which is exactly what a timezone-naive `date` holds. Adding `AT TIME ZONE` to the cast would shift every date across the day boundary for IST users.

**What this spec keeps:** the parse-and-handle-explicitly rule below. It is correct whether or not the columns are converted, and gets simpler if they are.

## Row height

`GRID_ROW_HEIGHT = { default: 32, dense: 28 }` (`grid-row.tsx:19-22`), and `design-constraints.md` mandates both: *"Default row height 32px; a dense option at 28px."* The second block asks for 32–36px. **The default stays at 32** (OQ-4); the earlier "flip the default to dense" assumption is dropped.

## Record review is genuinely new

`grep -n "onRowClick\|rowClick" components/grid/*.tsx components/grid/*.ts` → **zero hits.** Nothing opens on row click today, and CAP-5 no longer wants it to.

Three controls call `stopPropagation` on `onPointerDown` and must keep doing so: the select checkbox (`:796`), the favorite star (`:953`), the delete control (`:990`). A row-level handler would fire when any of them is used; CAP-5's action-column trigger makes that class of bug disappear.

## Write paths, all three

`handleCellCommit` (`:579`) is the single commit path. On a draft row a commit *is* the create (`:588-623`) — the patch accumulates before the request because `name` and `phone` are both `NOT NULL` and one commit cannot satisfy both.

Bulk favourite (`:669`) posts to `/api/manage/contacts/bulk`, capped at `MANAGE_BULK_MAX_ITEMS = 200` (`lib/manage/api-handlers.ts`), processed sequentially, and reports one outcome per row. **Story 5's per-row delete outcomes report through the grid's `statusMessage` channel**, which renders in toolbar-adjacent chrome. The toolbar redesign must keep that channel reachable.

Every write validates against `MANAGE_CONTACT_PATCH_KEYS` (`manage-types.ts:155-168`) — twelve keys. `PATCH_KEY_BY_COLUMN` (`:137`) maps seven column ids onto them; an unmapped column throws *"X cannot be edited here."*

## The 19-row matrix

All **Covered**, across `manage-contacts-{edit,selection,bulk,api,filter,row-lifecycle}.spec.ts` plus the four grid specs. Layers: UI, API, and route interception for forced failures.

`e2e/fixtures/manage-grid.ts` documents the DOM contract every spec depends on — `[data-grid-root]`, `[role=group][aria-label=Contacts]`, `tr[data-grid-row]`, `[data-grid-cell]`, `[data-grid-column]`, `[data-bulk-selection-count]`, `[data-grid-add-record]`, `[data-grid-delete-row]`. **Renaming or removing any of these breaks specs that are not part of this work.** Add attributes; do not repurpose existing ones.

## Known environment facts

- `proxy.ts:9-20` matches `/dashboard`, `/contact`, `/sessions`, `/volunteers`, `/auth`, `/api/contact`, `/api/sessions`, `/api/volunteers`, `/api/admin` — **not** `/manage` and **not** `/api/manage/*`. Session refresh does not run for the manage surface. Pre-existing gap, documented in `AGENTS.md`; not this spec's problem, but any new `/api/manage/*` route inherits it.
- `/manage` is a single server component (`apps/folk/app/manage/page.tsx`) calling `loadManagePortalData` and rendering `ManagePortal` client-side. Tabs are local state, synced with `history.replaceState`.
- `AGENTS.md`: `pnpm test` runs **zero** tests. `pnpm test:e2e` needs the local stack once and boots the app itself. Never run bare `pnpm exec playwright test` — the readiness gate lives in the script. One runner at a time; every spec shares one seeded database.
