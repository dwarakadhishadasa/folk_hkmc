# Page specification — Contacts

**Route:** `/contact/contacts` · **Root:** `apps/{folk,gite-life}/app/contact/contacts/page.tsx`
**Design:** `contacts.figcraft` → `Contacts — Grid (light)`, `Contacts (phone) — Grid`
**Component:** `components/manage/manage-contacts-table.tsx`, unchanged except `metrics-contract.md` §2
**Platform:** desktop grid, phone list — device-decided, not user-decided
**Visibility:** `Admin`, `Preacher`

---

## 1. Purpose

**Page purpose.** Edit the rows the other two tabs count. It is the section's write surface and
its detail surface: every number on Overview and Reports lands here.

**User situation.** A coordinator followed a tile ("9 with no location"), came to fix a phone
number, adds a contact at a distribution drive, or works through a list after a session.

**Success criteria.**

1. Arriving from a link, the status bar reads the number that was clicked.
2. Nothing about the grid behaves differently from `/manage?view=contacts` — same columns,
   editors, keyboard, selection, writes.
3. On a phone the same route serves the contact list, and the operator never chooses.

**Entry points.** The `Contacts` tab, and the phone's section menu; every tile and row on Overview and Reports; a
saved grid link with its path swapped; `/manage?view=contacts` (redirect).

**Exit points.** `/contact`, `/contact/reports`, `/contact/new`, and the grid's own row actions.

---

## 2. Chrome

The header and sub-nav are the shared components of `ux-overview.md` §5.1–5.3. Only the values
differ:

| Object | Value |
|---|---|
| Title | `Contacts` |
| Scope line | `{n} contacts · {n} locations`, where `n` is the **live row count** the table reports through `onRowCountChange` (`manage-contacts-table.tsx:534-544`) — not the payload's count. A create or a delete moves it without a reload. |
| Sub-nav | active item `Contacts` — second of three, between Overview and Reports |
| Scope switch | Admin only, `?mode=`, preserved by every tab link |
| Filters | none above the grid on desktop. The grid's own toolbar is the filter surface, and a second control above it would be two places to narrow one table. |
| Phone action | **Add contact**, a primary pill on the title row, right-aligned. It opens `/contact/new` — the form, not a second inline draft. |
| Phone footer | the record count only. It carried `Add record` until the header action existed; one destination, one control. |

**The design's page title is `Contacts`, and it is kept** — unlike the Overview frame's, which
this spec renames to `Overview`. Here the tab and the title agree.

### The two create paths, and why both stay

The design's toolbar carries **`Add record`**, which opens the grid's inline draft row
(`manage-contacts-table.tsx:1346-1376`), and the Overview's empty state points at
**`New contact`** → `/contact/new`, the full form. They are different actions:

| | `Add record` | `New contact` |
|---|---|---|
| Where | the toolbar, on the grid | `/contact/new` |
| Fields | the eight the grid can write inline | the form's own set, including occupation, college/company, address and comments |
| Writes | `POST /api/manage/contacts`, assigning the reader as collector | `POST /api/contact`, which routes through the assigned-preacher and location rules |
| Best for | ten contacts without leaving the table | one contact, with the fields the grid does not collect |

Neither replaces the other, and the section keeps both. A `New contact` button in the grid
toolbar would be a third control for the second action; it is not added.

On a phone the header's **Add contact** is the form path, and the phone has no `Add record`:
the inline draft row is a spreadsheet gesture, and the list is not a spreadsheet. The footer
therefore carries the count alone.

---

## 3. Height chain — the one structural requirement

`/contact/contacts` is the only page in the section that must not own its scroll. Its page
component continues the chain the layout establishes:

```
layout.tsx
  div.flex h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col overflow-hidden
    Header
    main.flex min-h-0 w-full flex-1 flex-col px-4 py-6 sm:px-6
      ContactPageHeader
      ContactSubNav
      {children}                     ← page.tsx
        div.flex min-h-0 flex-1 flex-col
          ManageContactsTable        ← the only scroll container on the page
```

This is the chain `apps/folk/app/manage/page.tsx:53-70` plus `manage-portal.tsx:93, 216-218`
establishes today, with the `Tabs` removed because there is one tab.

Three consequences, each of which fails loudly if missed:

- **Every ancestor is `min-h-0`.** A flex item defaults to `min-height: auto` and refuses to
  shrink below its content, so a missing one restores page scroll and the grid's sticky header
  detaches (`manage-portal.tsx:82-91` records this).
- **`overflow-hidden` on the shell, not `overflow-auto` on `main`.** If `main` scrolls there are
  two scrollers, and `grid-scroll-surface.spec.ts` fails on the count.
- **No `max-h-[70vh]` anywhere.** The grid fills the height it is given; a viewport fraction
  inside a viewport fraction is what produced the clipped-final-column report
  (`surface-and-toolbar.md` CAP-2).

Overview, Reports and New contact wrap their content in `min-h-0 flex-1 overflow-auto` instead.
That asymmetry is the layout's whole design and is commented in the layout file, so the next
person does not "fix" it to match Campaigns.

---

## 4. The grid itself

Unchanged, and that is the requirement. The design's frame is the existing `/manage` table with
the section's header above it, and the spec adopts it exactly:

| Element | Contract |
|---|---|
| Toolbar | search, Filter, Sort, `{n} hidden fields`, row density, `Add record` (`components/grid/grid-toolbar.tsx`) |
| Columns, desktop | Name (frozen), Phone, Location, Initial Contact, Total Attendance, Past 60 Days, Notes, Collected By — the eight visible by default |
| Hidden by default | Source, Books Read, Date of Birth, Last Contacted On, Favorite, **and Collected** |
| Row height | 32px, pinned on the cell; 13px cell text; hairline dividers; no stripes |
| Status line | the grid's own live region, above the grid |
| Footer | `{n} records` under the identity column, `Sum {n}` under each numeric column |
| Row actions | right-click context menu (`Delete all selected records`); no trailing actions column |
| Selection | header select-all over the visible rows; bulk delete from the context menu |
| Writes | double-click opens an editor, blur commits, Escape discards; `+ Add record` appends a draft row promoted in place |

The one addition is the **`Collected`** column (`metrics-contract.md` §2): id `collectedOn`,
`fieldType: "date"`, **read-only**, **hidden by default**, positioned after `Initial Contact`.
Read-only because `openEditor` refuses a column without `meta.grid.editable`
(`use-grid-keyboard.ts:849`); hidden because the design's frame draws eight columns and that is
what a reader must see. The toolbar's hidden-field pill therefore reads **6**, not the frame's
5 — the only pixel-level change the spec asks of the design file.

Three things this column must not do:

- **replace `Initial Contact`** — that stays, hidden, editable, and the only place a real
  collection date is written;
- **be given an editor** — an inferred date must never be committed over a stored one;
- **be given a `cell` widget** — `docs/manage-grid-pattern.md` forbids an `editable` column with
  a widget, and the same shape here would put the derived value outside `cell.text`.

---

## 5. What the move must not change

Every item below is a current behaviour with a current test, and each is a way the move could
quietly go wrong.

| Behaviour | Why the move threatens it | Guard |
|---|---|---|
| One scroll container | a new wrapper in the layout | `grid-scroll-surface.spec.ts` |
| Frozen `Name` run, sticky header | an ancestor without a bounded height | `grid-scroll-surface.spec.ts`, `grid-cell-metrics.spec.ts` |
| Double-click to edit, blur commits | a well-meaning "tidy" | `grid-edit-model.spec.ts`, `grid-editors.spec.ts` |
| `e`, type-to-edit and `Space`-seeding stay gone | the most tempting thing to restore | `grid-keyboard.spec.ts` |
| Blank cells, no em-dash | a renderer "improvement" | `grid-cell-renderers.spec.ts` |
| URL state round-trips | a new route that forgets `mode` | `grid-toolbar.spec.ts`, `manage-contacts-filter.spec.ts` |
| The phone list, not the grid, below `md` | a page that renders the grid unconditionally | `manage-contacts-list.spec.ts` |
| Draft row, promotion, queued patches | the component's own state | `manage-contacts-row-lifecycle.spec.ts` |
| Selection and bulk delete | ditto | `manage-contacts-selection.spec.ts`, `manage-contacts-bulk.spec.ts` |

`components/grid/` receives **zero** changes. If a change there looks necessary, the wrapper is
wrong, not the primitive.

---

## 6. URL contract

`/contact/contacts` accepts everything `/manage?view=contacts` accepts, minus `view`:

| Param | Meaning | Change |
|---|---|---|
| `mode` | `admin` \| `preacher` | unchanged |
| `sort`, `q`, `f.<colId>`, `fa.<colId>`, `cols`, `hide`, `size.<colId>` | unchanged (`grid-view-state.ts:8-16`) | unchanged |
| `f.collectedOn` | the new column, so a tile or card link can carry a date range | new key, existing operator grammar |
| `period` | the section's period filter | **not read here.** Reports receives the resolved boundary inside `f.collectedOn` and the grid ignores the symbol |

`/manage?view=contacts` redirects to `/contact/contacts` with the rest of its query intact.
A `redirect()`, not a rewrite, so the address bar tells the truth and a bookmark heals.

The phone list reads the same URL and ignores `sort`, `cols` and `size.*`, which it already
does.

---

## 7. States

| State | When | Appearance |
|---|---|---|
| **Default** | rows exist | grid (desktop) or list (phone) |
| **Scope empty** | the reader's scope has no contacts | the grid's own empty region plus `EmptyState`: `No contacts in this scope`, `Switch to the program-wide scope, or add the first contact.`, actions **New contact** and (Admin) **All preachers** |
| **Filtered to nothing** | rows exist, the filters match none | the grid's existing behaviour: an empty body with the filter indicator naming the columns (`surface-and-toolbar.md` CAP-12). **Not** the empty state — the rows exist, and saying otherwise would be a lie. |
| **Draft open** | `Add record` | the blank row, `canCreate` false until it is promoted (`manage-contacts-table.tsx:1368-1375`) |
| **Write refused** | a PATCH/CREATE/DELETE fails | the grid's status line, naming the row and the server's message |
| **Read failed** | the server read throws | the route's `AuthzError` handling |

The phone's list states — the field sheet, the expanded record, `Escape` closing the sheet —
are unchanged and are specified in `manage-contact-sheet.tsx` and `manage-contact-list.tsx`
themselves. This page does not restate them.

---

## 8. Accessibility

Inherited from the grid and not restated: the `role="group"` scroller with its `aria-label`, the
live region, the keyboard model, the header sort affordances. The page adds only:

- `h1` `Contacts`, and the grid's accessible name stays **`Contacts`** — the fixture locates it
  by `getByRole("group", { name: "Contacts" })` (`e2e/fixtures/manage-grid.ts:84`).
- The scope switch's links keep `aria-current="page"`.
- The `Collected` header is a plain header: no menu affordance, because it has no menu.

---

## 9. Test work this page owes

| Test | What it asserts |
|---|---|
| `e2e/fixtures/manage-grid.ts:71-75` | the path swap; every existing grid spec inherits it |
| `grid-scroll-surface.spec.ts:68` | the surface moved and still has one scroller |
| `theme-switch.spec.ts:541` | the theme pass reaches the grid at its new home |
| `grid-toolbar.spec.ts:8, 285, 544` | the column count, the Hide-fields row count, the hidden-field pill at 6 |
| `grid-column-drag-menu.spec.ts:39` | the default order with `collectedOn` in it |
| `contact-contacts.spec.ts` *(new)* | `/manage?view=contacts` redirects; a tile link lands on a grid whose status bar equals the tile's number; `Collected` renders a date for a row with a null `initial_contact` and opens no editor on double-click; the column is not in the default visible set |

The last two assertions of the new spec are what make `metrics-contract.md` §1–§2 true rather
than merely stated.
