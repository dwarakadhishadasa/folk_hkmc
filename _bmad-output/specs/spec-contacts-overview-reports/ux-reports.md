# Page specification — Contacts Reports

**Route:** `/contact/reports` · **Root:** `apps/{folk,gite-life}/app/contact/reports/page.tsx`
**Design:** `contacts.figcraft` → `Contacts — Reports (light)` and `(dark)`, `Contacts (phone) — Reports`
**Platform:** desktop-first, phone-reduced · **Type:** full page, server component
**Visibility:** `Admin`, `Preacher`

---

## 1. Purpose

**Page purpose.** Explain *why* the Overview's numbers are what they are: how far the people
collected actually get, which months the effort landed in, who is entering them, and what is
broken enough to chase.

**User situation.** A monthly review, or a coordinator deciding whether the next push should be
another distribution or a follow-up on the backlog.

**Success criteria.**

1. The reader can say whether collection is growing, flat or falling, and how many contacts
   never reached a session, without arithmetic.
2. Every row resolves to the grid rows behind it.
3. No number here contradicts the same-named number on the Overview — they are the same
   functions (`metrics-contract.md` §8).

**Entry points.** The `Reports` tab; a tile link back; the phone's section menu.

**Exit points.** `/contact`, `/contact/contacts`, and the CSV export.

---

## 2. Layout

Same bounded layout as the Overview (`ux-overview.md` §2). Only the header row and the body's
contents differ.

```
┌ head ───────────────────────────────── [Last 90 days ▾] [⬇ Export CSV] ┐
│  Reports                                                               │
│  272 contacts · 14 locations · folk programme                          │
└────────────────────────────────────────────────────────────────────────┘
┌ sub-nav: Overview   Contacts   Reports ────────────────────────────────┐
│  ┌ body: grid-cols-[minmax(0,860fr)_minmax(0,480fr)] gap-5 ──────────┐ │
│  │ ┌ Collection funnel ───────────┐ ┌ Who collects contacts ───────┐ │ │
│  │ └──────────────────────────────┘ └──────────────────────────────┘ │ │
│  │ ┌ New contacts collected ──────┐ ┌ Needs attention ─────────────┐ │ │
│  │ └──────────────────────────────┘ └──────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

Two separate trees, `xl:grid` and `xl:hidden`, as Campaigns' Reports does
(`apps/folk/app/campaigns/reports/page.tsx:118-135`) — not a viewport check in JS, so the page
stays a server component. Spacing and typography are `ux-overview.md` §3–4 with no new values.

---

## 3. Header

| Object | ID | Contract |
|---|---|---|
| Title | `contacts-reports-title` | `Reports` |
| Scope line | `contacts-reports-scope` | `{n} contacts · {n} locations · folk programme` — the same scope line as the Overview, because this page reports on the same directory. The **period** is shown by the control, not by the subtitle. |
| Period select | `contacts-reports-period` | `PeriodFilter`, `h-10 w-[170px] rounded-lg border bg-card` with a `calendar-days` icon and a chevron. Options `Last 30 days` / `Last 90 days` / `Last 12 months` / `All time`; default `Last 90 days`, as the frame draws it; URL key `period`, absent = all time. |
| Export | `contacts-reports-export` | `Button variant="outline" h-10`, `download` icon, label `Export CSV`. Admin and Preacher both get it. See §7. |
| Scope switch | `contacts-reports-scope-switch` | the same Admin-only pill pair, before the period select. |

The order in the header row, left to right: scope switch, period select, export. The design
draws only the last two because it draws the Admin scope switch on every desktop frame at the
same position; both appear.

The period select is a **server navigation**: it re-renders the page with a new window, because
it narrows M5, M6 and M7 together and each must agree with the others.

---

## 4. Sections

### 4.1 `contacts-reports-funnel` — Collection funnel

**Component:** `ReportCard`. **Title:** `Collection funnel`.
**Subtitle:** `From first contact to an active member of the community.`

Four rows, the shape of `report-funnel-card.tsx:39-65`:
`grid-cols-[180px_minmax(0,1fr)_48px] items-center gap-3`, label 13px, track
`h-[22px] rounded-md bg-[var(--muted)]`, fill by stage, count 13px/600 right-aligned.

| Row | Label | Definition | Fill |
|---|---|---|---|
| 1 | `Collected` | `\|P(period)\|` | `--chart-1` |
| 2 | `Location resolved` | `locationIds` names a real location | `--chart-2` |
| 3 | `Attended a session` | `totalAttendanceCount > 0` | `--chart-4` |
| 4 | `Active in 60 days` | `past60DayAttendanceCount > 0` | `--chart-2` |

Widths are `stage ÷ collected`, so all four bars answer one question: *of the people collected
in this period, how many got this far?* Row 1 is always full width — it is the denominator,
drawn.

Two properties of this data are stated rather than smoothed over
(`metrics-contract.md` §7):

- **Attendance can exceed location resolution.** A contact can attend a session with no
  location recorded, so in a badly-kept directory bar 3 can be longer than bar 2. That is a
  true reading and exactly the signal an operator needs; the bars are ratios, so nothing breaks.
- **The last two stages are not bounded by the period.** A contact collected this month can
  attend a session that happened earlier. The bars are still ratios of the same population.

Below the rows, when `collected − attended > 0`, the design's warning line — `triangle-alert`
in `--grid-warning-ink`, text 12px `--muted-foreground`:

> {n} collected contacts have never attended a session. Collecting is not the same as
> belonging — this bucket is the difference.

Each row links: `f.collectedOn=within:…` for row 1, `f.location=isNotEmpty:` for row 2,
`f.totalAttendanceCount=gt:0` for row 3, `f.past60DayAttendanceCount=gt:0` for row 4.

### 4.2 `contacts-reports-months` — New contacts collected

**Component:** `ReportCard`. **Title:** `New contacts collected`.
**Subtitle:** `First-contact date, by month. The last column is the current month.`

A **column chart in DOM**, not a chart library:

- `<ul>` of months across the period window, `flex items-end justify-between gap-4`;
- each column is `flex flex-col items-center gap-2` — value 12px/600 above, a
  `w-14 h-[132px] rounded-md bg-[var(--muted)]` track with the bar anchored to its **bottom**
  edge (`flex items-end`), then the month label 12px `--muted-foreground`;
- bar height `max(132 × value/peak, 6)`; the current month uses `--chart-2`, the rest
  `--chart-1`;
- each column links to `f.collectedOn=within:{month first}..{month last}`;
- `data-contact-month` / `data-contact-month-count` on each `<li>`.

The bar must be anchored to the track's bottom, not grown down from its own value label. The
design generator records this in a comment (`build_contacts_designs.py`: *"the months share one
baseline instead of each growing down from its own value label"*), and a chart whose columns
start at different heights is the classic way this gets built wrong.

**Why DOM, not Recharts.** The dashboard's `ChartFrame` uses Recharts because it draws stacked
multi-series charts. This is one series of at most twelve columns, the rest of the page is
server-rendered, and the funnel beside it already draws its bars in DOM. One visual language,
one less client boundary.

Empty: `No contact was collected in this period.`

### 4.3 `contacts-reports-collectors` — Who collects contacts

**Component:** `ReportCard`. **Title:** `Who collects contacts`.

Rows, `grid-cols-[32px_minmax(0,1fr)_auto_auto] items-center gap-3`:
32px initials circle on `--program-primary` at 12% over `--card`, initials 11px/700 in
`--program-primary`; name 13px truncated; `{pct}%` share 12px `--muted-foreground` in 44px;
count 14px/700 in `--program-primary` in 44px.

- Ranked on count descending; ties by name.
- Each row links to `f.collectedBy=is:{resolved name}`.
- **A contact with no collector is excluded**, per the design's own note, which is kept
  verbatim under the rows with an `info` glyph:

  > Counts are contacts whose first contact was recorded by that staff member. A contact with
  > no collector is not counted here.

  This is the opposite of how `source` is treated (a null source *is* a row) and deliberately:
  an unattributed source is a fact about the contact, an unattributed collector is a fact about
  the staff workflow this card is not measuring.

- Empty: `No contact has a named collector in this period.`
- **Known limit, stated:** the grid's filter runs on the rendered name, so two staff members
  sharing a display name produce one combined row and one combined link. The card does not
  disambiguate; the grid's `Collected By` column shows the same collision.

### 4.4 `contacts-reports-attention` — Needs attention

**Component:** `ReportCard`. **Title:** `Needs attention`.

Rows, `grid-cols-[14px_minmax(0,1fr)_auto_auto] items-center gap-2.5`:
`triangle-alert` 14px in `--grid-warning-ink`; label 13px; count 14px/700 in
`--grid-warning-ink` in 40px; action label 12px `--muted-foreground` in 120px, right-aligned.

| Row | Definition | Action label | Link |
|---|---|---|---|
| `No location` | `locationIds` empty | `Assign a location` | `f.location=isEmpty:` |
| `No phone number` | `phone` blank | `Add a number` | `f.phone=isEmpty:` |
| `No first-contact date` | `initialContact` null | `Set the date` | `f.initialContact=isEmpty:` |
| `Never attended a session` | `totalAttendanceCount = 0` | `Invite to a session` | `f.totalAttendanceCount=is:0` |

- **Whole scope, not period-scoped.** A contact collected in March with no location is still
  broken today, and a period filter that hid it would report a shrinking problem that is not
  shrinking. The card has no period control and its numbers do not move when the select does.
  This is the only card on the page whose numbers ignore the period, and that is deliberate.
- The action label is a **label, not a button**: the whole row is one link into the filtered
  grid, and a second control inside a link is a second hit target for the same job.
- `No first-contact date` counts the **stored** date, not `collectedOn`. A row dated by the
  fallback still has no stored date and is still on this list — that is the point of the row.
- `phone` is `NOT NULL`, so "No phone number" is a blank string. The grid's create requires a
  non-empty phone; a migrated row can still hold `""`.
- Only rows with a non-zero count appear? **No.** All four always render, at 0 when clean, in
  `--muted-foreground` with the warning glyph dropped. Reaching zero is an achievement and this
  is the only place it is recorded. Zero rows keep their link.

### 4.5 Phone

Order: title with the menu chevron, period control, funnel, needs attention, sticky export.

- The design's phone header shows `Last 90 days` as a **static subtitle**. This spec makes it
  the same select as desktop, full width, 40px tall, directly under the title — a report whose
  window cannot be changed on the surface most readers use is a screenshot.
- The funnel keeps all four rows; the label column narrows to `118px` and the track to the
  remaining width.
- `Needs attention` renders all four rows, without the action labels — at 390px the action text
  is what would wrap, and the row is already one link.
- `Who collects contacts` and `New contacts collected` are **absent**. The reduced-view
  statement is not shown either: the phone is a reading surface for the two cards that drive an
  action, and a line saying "more on desktop" above an export button would be noise. The
  desktop is one tap away through the section menu.
- The export sits in a sticky footer above the bottom nav, full width, `h-12`, outline, exactly
  as `campaigns/reports/page.tsx:137-147` places it.

---

## 5. States

| State | When | Appearance |
|---|---|---|
| **Default** | `\|P(period)\| > 0` | four cards |
| **Nothing collected at all** | `P` is empty, or every row is undated | a single `EmptyState`: title `Nothing to report yet`, description `A report starts with a contact and the date it was collected. Add the first contact to begin.`, action **New contact** |
| **Period empty** | `P` non-empty, `P(period)` empty | the funnel renders `No contact was collected in this period.` instead of four zero bars — five empty tracks read as a chart that failed to load. The month card keeps its axis with all-zero columns so the reader sees the window. `Needs attention` is unaffected: it is whole-scope. |
| **One card empty** | that card's population is empty | that card's own sentence, never a blank body |
| **Export failed** | the request errors | the button returns to its resting state and announces `Export failed — try again.` through the grid-style status line above the cards. No silent failure: silence is the thing `ux-flows.md` §11 designs against. |
| **Read failed** | the server read throws | the route's `AuthzError` handling, identical to `/contact` |

The distinction between "nothing collected at all" (replace the page) and "nothing in this
period" (replace each card's body) is what keeps the page from looking broken when the reader
has simply narrowed too far.

---

## 6. Export

`GET /api/manage/contacts/export?mode=…&period=…`

| Property | Contract |
|---|---|
| Auth | same gate as the page: `Admin`, `Preacher`; `mode` applies the same narrowing |
| Window | the page's period, resolved server-side to the same boundary the cards used |
| Rows | `P(period)`, in the grid's current default order |
| Columns | the grid's **visible** column labels for this reader, in `COLUMN_IDS` order — Name, Phone, Location, Source, Books Read, Initial Contact, Date of Birth, Total Attendance, Past 60 Days, Last Contacted On, Notes, Collected By, Favorite, minus the hidden set. `Collected` is included only when it is visible. |
| Encoding | `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="contacts-{program}-{from}-{to}.csv"`, UTF-8 BOM so Excel reads the names correctly |
| Safety | a field beginning `=`, `+`, `-` or `@` is prefixed with an apostrophe — the CSV-injection rule |
| Degradation | `null` renders as an empty cell, never `—` (`GRID_EMPTY_TEXT`'s blank-not-dash rule, applied to the file) |

The export is a **copy of the view**, not a second view: it uses the same rows, the same scope,
the same window, and the same visible columns, and it is generated from the same
`lib/contacts/metrics.ts` window resolution so a file and the card above it cannot disagree
about which rows they describe.

---

## 7. Accessibility

- One `h1`; each card an `h2`.
- The funnel's bars are `aria-hidden`; the count beside each is the readable fact.
- The column chart is a `<ul>` of links whose `aria-label` reads
  `{Month} {year}: {count} contacts — open the matching rows`; the drawn column is
  `aria-hidden`.
- Needs-attention rows are links whose name includes the count and the action:
  `No location: 9 — assign a location`.
- The export announces its result through a live region; it does not rely on the download
  itself being visible feedback.
- Colour is never the only carrier: every warning row has the `triangle-alert` glyph and a
  count; the funnel rows have labels.

---

## 8. Open questions carried from `SPEC.md`

- **The month window** (open question 4): the design draws five months on the Overview and seven
  on Reports, both period-independent. This spec settles on twelve everywhere so the two
  surfaces agree; confirm.
- **The dynamic range operator** — none is needed here. Every Reports link is a single predicate
  on one column, which the wire format supports. The only approximation in the section is on the
  Overview's §5.4 note about `collectedOn`, not here.
