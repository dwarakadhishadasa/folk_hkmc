# Page specification — Contacts Overview

**Route:** `/contact` · **Root:** `apps/{folk,gite-life}/app/contact/page.tsx`
**Design:** `contacts.figcraft` → `Contacts — Overview (light)` and `(dark)`, `Contacts (phone) — Overview`
**Platform:** desktop-first, phone-reduced · **Type:** full page, server component
**Visibility:** `Admin`, `Preacher` — every other role redirects to `/contact/new` (`SPEC.md` D7)

---

## 1. Purpose

**Page purpose.** Answer "how is collection going, and where is it broken" in one screen, and
hand the reader the exact rows behind every number.

**User situation.** A Preacher or Admin has finished a distribution drive, or is preparing a
session, and wants to know whether the contacts entering the programme are usable — located,
attributed, and turning up.

**Success criteria.**

1. The reader can state how many contacts were collected this month, and how many have never
   attended, without scrolling at 900px.
2. Every number on the page resolves to a grid view in one click, and that grid's status bar
   reports the same count.
3. The two actionable holes — no location, never attended — are visible without opening a
   filter.

**Entry points.** The first header pill / bottom-nav tab; the login landing for Admin and
Preacher; `/manage` after its Contacts tab retires; any tile link back from Reports.

**Exit points.** `/contact/contacts` (pre-filtered), `/contact/new` (the toolbar's add action
lives on the grid, not here), `/contact/reports`.

---

## 2. Layout

The layout is bounded (`SPEC.md` D2). The page's own content region scrolls; nothing else on
the page does.

### Desktop

```
┌─ Header (shared, sticky) ────────────────────────────────────────────────┐
├─ main: min-h-0 flex-1, px-6 py-6, ───────────────────────────────────────┤
│  ┌ head ─────────────────────────────────────────── [All preachers|Own] ┐│
│  │  Overview ⌄                                                          ││
│  │  272 contacts · 14 locations · folk programme                        ││
│  └──────────────────────────────────────────────────────────────────────┘│
│  ┌ sub-nav: Overview   Contacts   Reports ─────────────────────────────┐ │
│  └──────────────────────────────────────────────────────────────────────┘│
│  ┌ tiles — 5 across, gap-4 ────────────────────────────────────────────┐ │
│  └──────────────────────────────────────────────────────────────────────┘│
│  ┌ body: grid-cols-[minmax(0,860fr)_minmax(0,480fr)] gap-5 ────────────┐ │
│  │ ┌ New contacts collected ─────┐ ┌ Contacts by location ──────────┐  │ │
│  │ └─────────────────────────────┘ └────────────────────────────────┘  │ │
│  │ ┌ Where contacts came from ───┐ ┌ Engagement ────────────────────┐  │ │
│  │ └─────────────────────────────┘ └────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

The 860/480 split is the design's, expressed as `minmax(0,860fr)` / `minmax(0,480fr)` so it
holds at any width instead of asserting a pixel total. Below `xl` the body is one column and
the cards keep their source order.

### Phone

```
┌ mobile app bar ──────────────────────────────┐
│  Overview ⌄                                  │
│  272 contacts · 14 locations                 │
│  Overview ⌄   (menu — no strip under it)     │
│  ┌ Total contacts ┐ ┌ New this month ┐       │
│  ┌ Never attended ┐ ┌ No location    ┐       │
│  ┌ New contacts collected ─────────────┐     │
│  ┌ Contacts by location ───────────────┐     │
└ bottom nav (Contact active) ─────────────────┘
```

Content padding `16`, gap `16`. The phone drops the scope switch (it lives in the phone menu
for `/manage`, and here it is a desktop control), the subtitle's `· folk programme` tail, and
the sources and engagement cards.

**One correction to the design.** The phone frame shows four tiles as *Total contacts · New
this month · Active in 60 days · Never contacted*, dropping only the fifth. This spec keeps
**Total contacts · New this month · Never attended · No location** and drops **Active in 60
days**. The phone is the surface a coordinator holds while standing in a hall: the two amber
tiles are the ones with an action behind them, and a success metric is the one tile that can
wait for the desk. The two kept warning tiles sit together on the second row.

---

## 3. Spacing

Tailwind steps in use across `components/campaign/` and `components/manage/`.

| Property | Value |
|---|---|
| Page gutter / top padding | `px-4 py-6` phone, `sm:px-6` desktop |
| main column gap | `gap-5` (20px) desktop, `gap-4` (16px) phone |
| Header → sub-nav | `gap-4` |
| Sub-nav → tiles | `gap-5` |
| Tile grid gap | `gap-4` desktop, `gap-2.5` phone |
| Body grid gap | `gap-5` |
| Card internals | header `px-5 py-4`, body `px-5 py-4` (desktop); `p-4` (phone) |
| Card row rhythm | `gap-2` in the month strip and sources, `gap-2.5` in locations, `gap-3` in engagement |
| Tile internals | `p-5` desktop, `p-3.5` phone; `gap-1.5` label → value → caption |
| Title → scope line | `mt-0.5` |

---

## 4. Typography

| Element | Semantic | Size / weight | Typeface |
|---|---|---|---|
| Page title | `h1` | 22px / 600 | `--font-poppins` |
| Scope line | `p` | 12px / 400 | Inter |
| Tab label | link | 13px / 500, active 600 | Inter |
| Tile label | `dt` | 11px / 600 | Inter |
| Tile value | `dd` | 32px / 700, `leading-none` (24px on phone) | `--font-poppins` |
| Tile caption | `dd` | 12px / 400 | Inter |
| Card title | `h2` | 18px / 600 | `--font-poppins` |
| Card subtitle | `p` | 13px / 400, 80% opacity | Inter |
| Card row label | `span` | 13px / 400 | Inter |
| Card row count | `span` | 13px / 600, `tabular-nums` | Inter |
| Column chart value | `span` | 12px / 600, `tabular-nums` | Inter |
| Engagement value | `span` | 20px / 700 | `--font-poppins` |

Every numeral in a column or a trailing slot carries `tabular-nums`.

**Colour of the tile value** is the only per-tile colour on the page, and it is the design's:
`--program-primary` for T1, `--chart-2` for T2 (the growing number), `--program-primary` for
T3, `--grid-warning-ink` for T4 and T5. T5 additionally carries a `--grid-warning-ink` border,
which is the one tile with a border of its own.

---

## 5. Sections

### 5.1 `contacts-overview-header`

**Component:** `SectionPageHeader` (`components/section-page-header.tsx`), the extraction of
`campaign-page-header.tsx`.

| Object | ID | Contract |
|---|---|---|
| Title | `contacts-overview-title` | `Overview`. One `h1`, Poppins 22/600, with the menu trigger as a **sibling** in a `flex items-center gap-1` row — the construction of `campaign-page-header.tsx:38-45`. The trigger opens §5.3 and is `md:hidden`. |
| Scope line | `contacts-overview-scope` | `{n} contacts · {n} locations · {programme} programme`. `n` is the payload's scoped contact count and location count, `toLocaleString("en-IN")`. Phone drops the `· {programme} programme` tail. |
| Scope switch | `contacts-overview-scope-switch` | Admin only, `md:` and up. The pill pair **All preachers** / **Own scope** moved from `manage-portal.tsx:140-167`, writing `?mode=` on the current path. Preacher sees nothing. |
| Action / filter | — | none. The design's Overview header carries no control but the scope switch, and this spec keeps that. |

### 5.2 `contacts-overview-subnav`

**Component:** `ContactSubNav`. Desktop: the markup of `campaign-sub-nav.tsx:35-56`, driven by
`contact-nav.ts`. Phone: no strip at all — the chevron opens the panel in §5.3.

- Items, in this order: `Overview` → `/contact`, `Contacts` → `/contact/contacts`,
  `Reports` → `/contact/reports`.
- Desktop: 13px, 2px underline plus 600 weight on the active item, `--tab-*` tokens,
  `hidden md:block`.
- **Every href preserves `?mode=`.** The strip is the one control that could silently drop a
  reader's scope.
- `aria-current="page"` on the active link; `<nav aria-label="Contacts">`.

### 5.3 `contacts-overview-menu` — the phone menu

**Component:** `ContactMenu`, the extraction of `components/campaign/campaign-menu.tsx`
(`SectionMenu` in `components/section-menu.tsx`, parameterised by items, title, subtitle and an
optional badge).

A **full-screen takeover**, not a strip:

- head: `px-4 pt-5 pb-4`, a `h-10` row with the section title at 22px Poppins semibold and a
  40px circular close button (`bg-[#F2F4F7]`, `X` at 13px); beneath it the scope line at 13px
  muted;
- a full-width hairline;
- the destinations as full-width rows, `h-14`, `px-4`: label 15px semibold, a 2px underline
  under the current one (weight plus rule, never a second colour), a spacer, and a small
  trailing chevron;
- a spacer, then a hairline at the foot.

It is a `Dialog` with `fixed inset-0 … rounded-none border-0 p-0`, so it sits above the app bar
and the bottom nav alike — the same construction as `campaign-menu.tsx:104-176`, which is the
whole reason the two sections navigate identically.

Order is **Overview · Contacts · Reports**, in the panel and in the desktop strip, driven by the
one `contact-nav.ts` list.

### 5.4 `contacts-overview-tiles` — the five collection KPIs

**Component:** `ContactOverviewStats`, markup from `campaign-overview-stats.tsx:67-93`.

`<section aria-label="Contact totals">` wrapping a `<dl>`:
`grid grid-cols-2 gap-2.5 md:grid-cols-5 md:gap-4`.

| # | ID | Label | Caption | Value colour | Link |
|---|---|---|---|---|---|
| T1 | `tile-total` | Total contacts | `Across {n} locations` | `--program-primary` | **none** |
| T2 | `tile-new` | New this month | `▲ {n} vs last month` | `--chart-2` | `f.collectedOn=within:{month}..{today}` |
| T3 | `tile-active-60` | Active in 60 days | `{pct}% of all contacts` | `--program-primary` | `f.past60DayAttendanceCount=gt:0` |
| T4 | `tile-never-attended` | Never attended | `{pct}% — worth a first session` | `--grid-warning-ink` | `f.totalAttendanceCount=is:0` |
| T5 | `tile-no-location` | No location | `{pct}% — unresolved` | `--grid-warning-ink` | `f.location=isEmpty:` |

T1, T2, T3 render as `<div>`; T2, T3, T4, T5 render as `<a>` wrapping the same content, with an
`aria-label` of `{label}: {value} — open the matching rows`. The visual difference is hover and
focus only: a linked tile lifts its border to
`color-mix(in oklab, var(--program-primary) 40%, var(--border))` and shows the standard
`focus-visible:ring-2 ring-[var(--program-accent)]`. **T1 is not a link** because there is no
grid view narrower than everything, and a control that navigates where you already are is the
"nonfunctional button" the grid spec forbids.

T5 alone carries `border-[var(--grid-warning-ink)]`; every other tile is
`border border-[var(--border)]`.

Phone shows T1, T2, T4, T5 in that order (`order` utilities, not conditional rendering, so the
markup is one list). The design's `w=173` per tile is the phone's half-column; at 390px with
`px-4` gutters and a `gap-2.5` the tiles are fluid and need no fixed width.

### 5.5 `contacts-overview-months` — New contacts collected

**Component:** `ReportCard`. **Title:** `New contacts collected`.
**Subtitle:** `Contacts with a first-contact date, or the record's creation date where it is missing.`

An `<ul>` of **six** month rows, `grid-cols-[46px_minmax(0,1fr)_40px] items-center gap-3`:

- label `Sep` at 13px `--program-text`, fixed 46px so the tracks start on one line;
- track `h-[18px] rounded-md bg-[var(--muted)]`;
- fill `bg-[var(--chart-1)]`, the current month `bg-[var(--chart-2)]`,
  `width: {value/largest}%`, minimum 4px so a non-zero month is visible;
- count 13px/600 `tabular-nums`, right-aligned in 40px.

- Each row is a link to `f.collectedOn=within:{month first}..{month last}`.
- `data-contact-month` and `data-contact-month-count` on each `<li>`.
- Note under the rows, 12px `--muted-foreground`:
  `{current month} is the current month and is still filling.`
- Phone shows the last **two** months (the design's choice) — the card is a headline there,
  not a series; the full twelve are one tap away on Reports.
- Empty: `No contact has a recorded collection date yet.`

**Six months here, twelve on Reports** — and this is the one number the build
corrected. Twelve rows at 26px each do not fit the 484px the body has left on a 900px frame;
six do, with the sources card beneath them. The card says its own window and points at the long
series, and the Reports column chart carries twelve. The two are the same series at two
lengths, not two definitions.

Widths are relative to the largest month **in the window**, not to the total: a month with
thirty-one and a month with four must look different, and a bar measured against the total
flattens to nothing.

### 5.6 `contacts-overview-sources` — Where contacts came from

**Component:** `ReportCard`. **Title:** `Where contacts came from`.
**Subtitle:** `The source field — hidden in the grid by default.`

Ranked rows, `grid-cols-[190px_minmax(0,1fr)_44px] items-center gap-3`:
label 13px truncated with `title`, track `h-[18px] bg-[var(--muted)]`, fill `bg-[var(--chart-2)]`
(or `--chart-5` for the last two rows if more than six), count 13px/600.

- Ordered by count descending; ties by label.
- A null or empty `source` is the row **Not recorded**, sorted with the rest — it is a row like
  any other, not a footnote, and usually the largest.
- Rows link to `f.source=is:{value}`; **Not recorded** to `f.source=isEmpty:`.
- Cap 6 rows plus `+ {n} more`, linking to the unfiltered grid. With six or fewer, no cap.
- Empty: `No contact was collected in this period.`

The design's third row reads **"Everything else"**. That label is replaced by **"Not
recorded"** (`metrics-contract.md` §6): "everything else" implies values that were looked at
and pooled, while the fact is that the field is empty — and it is the label the grid shows.

### 5.7 `contacts-overview-locations` — Contacts by location

**Component:** `ReportCard`. **Title:** `Contacts by location`.

Rows, `grid-cols-[8px_minmax(0,1fr)_auto_auto] items-center gap-2.5`:
8px `rounded-full` dot, label 13px truncated, count 13px/600, `{pct}%` at 12px
`--muted-foreground` right-aligned in 40px.

- Ordered by count descending, then **No location**, then **Unknown location** last.
- Dot colour: `--program-primary` for a resolved location, `--grid-warning-ink` for the two
  unresolved rows.
- Tapping a location is a link to `f.location=is:{name}`, `f.location=isEmpty:`, or
  `f.location=is:Unknown location`.
- Phone shows the first four rows (the design's count); desktop shows all, capped at eight with
  `+ {n} more`.

**Two corrections to the design.** The frame draws one **"Unresolved"** row at 9 — the same 9
as the "No location" tile — which collapses *no location* and *location row deleted* into one
fact. `spec-contacts-premium-grid` CAP-4 already ruled these are different and gave them
different markers (`manage-contact-fields.ts:18-35`). The card shows both rows; only
**No location** is the tile's 9. And a contact carrying more than one `locationIds` entry is
counted once, under its first, so the rows always sum to the total.

### 5.8 `contacts-overview-engagement` — Engagement

**Component:** `ReportCard`. **Title:** `Engagement`.

Three rows, `grid-cols-[4px_minmax(0,1fr)_auto_auto] items-center gap-3`:
a 4px `rounded-sm` colour bar `h-[30px]`, label 13px/600, value 20px Poppins bold in the row's
colour right-aligned in 48px, caption 12px `--muted-foreground` right-aligned in 120px.

| Row | Definition | Value colour | Caption |
|---|---|---|---|
| Attend a session | `totalAttendanceCount > 0` | `--chart-1` | `{pct}% of contacts` |
| Attended in the last 60 days | `past60DayAttendanceCount > 0` | `--chart-2` | `{pct}% of contacts` |
| Attended 3+ times | `totalAttendanceCount >= 3` | `--chart-4` | `the committed core` |

Rows link to `f.totalAttendanceCount=gt:0`, `f.past60DayAttendanceCount=gt:0`,
`f.totalAttendanceCount=gte:3`. Desktop only: on a phone the card is dropped, because every
number in it is repeated by a tile or by the Reports funnel, and the phone cannot afford a
fourth card.

The third caption is the design's own words and it is the point of the card: the first two rows
count attendance, the third counts belonging.

---

## 6. Interactions

- **No period control.** The design has none, and the windows are fixed and named in each
  caption. A control that changed T1 ("Total contacts") would be a control that changes what
  "total" means.
- The scope switch is a **navigation**, not client state: it re-reads the server payload, so
  every number on the page narrows together with the grid it links to.
- A tile link carries `mode`, the tile's predicate, and nothing else — no `q`, no `sort`.
- Following any tile or row link must land on a grid whose status bar reads the number clicked.
  That is the section's one invariant and is asserted in `contact-overview.spec.ts`.

---

## 7. States

| State | When | Appearance | Actions |
|---|---|---|---|
| **Default** | `\|P\| > 0` | five tiles, four cards | every link live |
| **No contacts at all** | `P` is empty | `EmptyState` replaces the tiles and cards: title `No contacts yet`, description `Add the first contact and the collection figures start here.`, action **New contact** → `/contact/new` | one action |
| **Zero-activity month** | T2 is 0 | T2 renders `0` and its caption reads `No change vs last month` when both months are 0, `▼ {n} vs last month` otherwise. It is never hidden. | the tile still links |
| **Preacher, no rows** | `mode=preacher` and the reader owns none | the scope notice (`manage-portal.tsx:170-175`) above `EmptyState` | the notice explains the scope |
| **Undated rows exist** | `collectedOn` is null for some rows | no separate element: those rows are excluded from the month strip and counted by nothing else. The Reports "No first-contact date" row is where they surface, and the Overview does not repeat it. | — |
| **Read failed** | the server read throws | `AuthzError` 401 → `/login?redirect=/contact`; 403 → `/auth/error?code=staff-authorization-failed`; anything else rethrown to the error boundary | sign in again |
| **Loading** | server navigation after a scope change | no skeleton. `dynamic = "force-dynamic"` with a server read; the previous page stays until the new one is ready and `useNavigationFeedback` drives the header's existing progress affordance. | — |

A skeleton was considered and rejected: the page is one server render, the previous content
stays visible during the navigation, and a shimmer that appears for 120ms on a local database
is worse than none.

---

## 8. Accessibility

- One `h1`; each card is an `h2`; nothing else is a heading.
- Tiles are a `<dl>`: `dt` is the label, `dd` holds value and caption. A linked tile wraps the
  pair in an `<a>` with an `aria-label` that reads label and value together, so a screen reader
  never announces "272" with no noun.
- Colour is never the only carrier: the amber tiles carry captions that state the consequence
  (`unresolved`, `worth a first session`).
- Bars are `aria-hidden`; the count beside them is the readable fact.
- The delta arrow is `aria-hidden`; the words carry it.
- Contrast: every value is a token the app already ships in both themes. The one literal in the
  design, `#f97f29`, is `--grid-warning-ink` in code and is used for a border, a dot and a
  value — never for small body text.
- The phone menu is a `<nav>` of links inside a modal dialog, with `aria-label="Contacts"`; the trigger carries `aria-haspopup="dialog"` and `aria-expanded`.

---

## 9. What this page must not become

- **A record list.** No names, no phone numbers, no "recently added" rail. `SPEC.md` D1.
- **A second dashboard.** The Manage dashboard answers preacher and location performance across
  sessions and attendance. This page answers collection and engagement.
- **A filter builder.** One scope switch, nothing else. Everything finer is the grid's job, and
  the grid already has the condition popover.
