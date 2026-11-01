# Screens

The per-screen contract. Layout and control set come from
`_bmad-output/E-Assets/page-designs/contacts.figcraft`; the phone's Contacts stack comes from
`~/figcraft-scratch/contacts-mobile-prototype.figcraft`. Where a value is not stated here, the
frame decides.

**Every number in this file is illustrative sample data.** Values, percentages and month counts
show the shape of a row; they are not expected results. Labels, order, definitions and geometry
are contract, and where two examples of one definition disagree, `metrics.md` wins. Two frames
still draw a scope switch and `Export CSV`; this file and `SPEC.md` supersede both.

Tokens are the app's own (`apps/*/app/globals.css`): `--program-primary` `#0f1e54`,
`--grid-warning-ink` `#f97f29`, `--border`, `--muted`, `--card`, Poppins for headings, Inter for
everything else. No new token is introduced.

---

## 1. Section chrome

### 1.1 Desktop

| Element | Contract | Frame |
|---|---|---|
| App bar | the shipped `Header`, five pills, active `Contact` pointing at `/contacts` | all desktop frames |
| Title | Poppins 22/600, `--program-text` | Overview `Overview`, Reports `Reports`, Grid `Contacts` |
| Scope line | 12px `--muted-foreground`, `{contacts} contacts · {locations} locations` | `272 contacts · 14 locations` |
| Tab strip | 13px, `gap-x-8`, 2px underline + 600 weight on the active item, `--tab-*` tokens; order **Overview · Contacts · Reports**; hrefs `/contacts`, `/contacts/grid`, `/contacts/reports` | all three |

Reports adds, to the right of the title, a period select (`Last 90 days`, calendar glyph). Overview
and Contacts carry neither.

### 1.2 Phone

| Element | Contract | Frame |
|---|---|---|
| App bar | the shipped phone app bar: logo shell, theme toggle, logout | all phone frames |
| Title row | Poppins 22/600 with the menu chevron beside it, `gap-1`; the heading stays a heading and the chevron is its own control | Overview, Reports, Grid |
| Subtitle | 13px `--muted-foreground`, `{contacts} contacts · {locations} locations` | all phone frames |
| Section menu | full-screen takeover: head (`Contacts` 22/600 + 40px circular close), the scope line, a hairline, then **Overview · Contacts · Reports** as 56px rows with a trailing chevron and a 2px underline on the current one, a spacer, a closing hairline | `Contacts (phone) — Menu` |
| Bottom nav | the shipped five-item nav, `Contact` active | all phone frames |

The phone has **no tab strip**: the chevron is the only way between the three pages.

---

## 2. Overview

### 2.1 Desktop — 1440×900

Title block, then five tiles in one row, then four cards across two columns; `gap-16` between bands
and `gap-20` between the two body columns.

**Title block.** `Overview` · `272 contacts · 14 locations`.

**Five tiles** — `gap-16`, each `p-20`, `radius-12`, `border --border`:

| # | Label | Value | Caption | Value colour |
|---|---|---|---|---|
| 1 | Total contacts | 272 | Across 4 locations | `--program-primary` |
| 2 | New this month | 23 | −8 vs last month | `--chart-2` |
| 3 | Active in 60 days | 34 | 12% of all contacts | `--program-primary` |
| 4 | Never attended | 211 | 78% — worth a first session | `--grid-warning-ink` |
| 5 | No location | 9 | 3% — unresolved | `--grid-warning-ink`, plus a `--grid-warning-ink` border |

Tiles 2–5 are links into the Contacts grid; tile 1 is not (no narrower view exists).

**Body**, two columns 860 / 480.

*Left — `New contacts collected`.* Navy panel header with the subtitle `First-contact date, by
month.` Six month rows `May 12 · Jun 18 · Jul 9 · Aug 24 · Sep 31 · Oct 23`, each a 46px label, an
18px track (`--muted`) filled `--chart-1` (current month `--chart-2`), and a right-aligned count.
Note beneath: `The last column is the current month and is still filling. Twelve months on
Reports.`

*Left — `Where contacts came from`.* Subtitle `The source field — hidden in the grid by default.`
Rows `Public registration 148 · Follow-up of a friend 61 · Not recorded 63`, each a 190px label, a
track, and a count; bars relative to the largest row.

*Right — `Contacts by location`.* Four resolved rows with an 8px dot, label, count, percentage,
then the two sentinels: `Adyar Temple 84 31% · Mylapore Temple 74 27% · T. Nagar Temple 63 23% ·
Perungalathur Temple 38 14% · No location 9 3% · Unknown location 4 2%`. The last two use the
warning dot and warning count. When `P` holds more than four resolved locations, a `+ {n} more`
row follows the fourth.

*Right — `Engagement`.* Three rows, each a 4px colour bar, label, 20px Poppins value, caption:
`Attended a session 61 22% of contacts · Attended in the last 60 days 34 12% of contacts · Attended
3+ times 18 the committed core`.

### 2.2 Phone — 390×844

In order: title row with chevron, subtitle, four tiles in a 2×2 grid (`Total contacts 272`,
`New this month 23`, `Never attended 211`, `No location 9` — the amber border on the last), the
`New contacts collected` card with **two** months (`Sep 31`, `Oct 23`) and the note `The current
month is still filling.`, then `Contacts by location` with all six rows. The Engagement and source
cards are desktop only.

---

## 3. Reports

### 3.1 Desktop — 1440×900

**Title block.** `Reports` · scope line · period select.

Body, two columns 860 / 480.

*Left — `Collection funnel`.* Subtitle `From first contact to an active member of the community.`
Four rows measured against `Collected`: `Collected 272 · Location resolved 263 · Attended a
session 61 · Active in 60 days 34`. Beneath, a warning line with a triangle glyph:

> 211 contacts in the whole scope have never attended a session. Collecting is not the same as
> belonging — this bucket is the difference.

*Left — `New contacts collected`.* Subtitle `First-contact date, by month. The last column is the
current month.` Twelve columns `Nov 14 … Oct 23` sharing one baseline, the current month green.
Always the last twelve months, whatever the period select says.

*Right — `Who collects contacts`.* Four rows: initials circle, name, percentage, count —
`AN Anand Narayanan 43% 118 · KR Kavitha Raman 35% 94 · DP Divya Parthasarathy 15% 41 ·
SK Suresh Kannan 7% 19`. Note beneath:

> Counts are contacts whose first contact was recorded by that staff member. A contact with no
> collector is not counted here. Percentages are of the period's contacts, so the rows sum to 100%
> only when every contact in the period has a collector.

*Right — `Needs attention`.* Four rows, each a triangle glyph, label, warning count, and an action
label: `No location 9 Assign a location · No phone number 4 Add a number · No first-contact date
31 Set the date · Never attended a session 211 Invite to a session`. The four rows are
whole-scope: they do not move when the period changes. Every count links to `/contacts/grid`
filtered to that defect, and the action label opens the same filtered grid.

### 3.2 Phone — 390×844

Title row with chevron, subtitle, the period select as a **full-width control** under the title
(not a subtitle), then the funnel and the quality list. The month chart and the collector
leaderboard are absent.

---

## 4. Contacts tab

### 4.1 Desktop — the Manage grid

`ManageContactsTable` rendered with its columns, editors and keyboard model as they ship today,
inside the section's bounded column so the grid is the page's only scroll container.

| Element | Contract |
|---|---|
| Header action | **`Add contact`** — primary button, 40px, radius 8, at the far right of the title row. Opens `/contact`. |
| Toolbar | `Search every column` · `Filter` · `Sort` · `5 hidden fields` · `Default rows` |
| Visible columns | Name (frozen) · Phone · Location · Initial Contact · Total Atte… · Past 6… · Notes · Collected By |
| Hidden by default | Source · Books Read · Date of Birth · Last Contacted On · Favorite |
| Rows | hairline-separated, `Name` emphasised, chips for `Location` and `Collected By`, tabular numerals on the two attendance columns |
| Footer | `272 records` at the left — the total in scope, not the filtered count; `Sum {n}` under each attendance column |
| Row menu | right-click: delete the selected records |
| Writes | double-click opens the editor, blur commits, Escape discards; the toolbar's `Add record` is not rendered |

**The count invariant reads the toolbar, not the footer.** The grid's toolbar carries a
`{visible} of {total} in scope` status node. That node is what `contact-overview.spec.ts` asserts
against the figure clicked. The footer's record total stays whole-scope on purpose; changing it
would reopen `components/grid/`.

**One create.** `Add contact` in the header opens the form, the only path where the operator
chooses the preacher and the location. The toolbar's inline `Add record` is not rendered on this
tab, so the grid cannot create a row in place. The endpoint behind it is unchanged; only the
surface is.

### 4.2 Phone — the prototype stack

Layout from `contacts-mobile-prototype.figcraft`; the app bar and the five-item bottom nav from
the app.

**List** (`1 Contacts List`):

| Element | Contract |
|---|---|
| Title row | `Contacts` with the menu chevron, and **`Add contact`** as a primary pill at the right of the same row |
| Subtitle | `{contacts} contacts · {locations} locations` |
| Search | full-width field, magnifier glyph, placeholder `Search name or phone` |
| Column header | `Name` / `Phone`, 60/40 split, muted |
| Rows | 44px, name left, phone right, hairline between |
| Filtered arrival | a metric link's `f.*` narrows the list; a chip above the rows names the filter with a clear control |
| Footer | the record count — the filtered count when a filter is applied |

**Field sheet** (`2 Field Sheet`) — tapping a cell raises a sheet over a scrim: `Expand contact`
centred at the top, then the field's label and its input, `361×48`. Escape and the scrim close it.

**Expanded record** (`3 Expanded Record`) — `Expand contact` opens the whole record over the sheet:
the contact's name, then `Phone`, `Location`, `Notes` (96px), `Initial Contact`, `Total attendance`,
`Past 60 day attendance`, `Collected By`, `Favorite`. No app bar; the bottom nav stays.

**Edit field** (`5 Edit Name`) — the sheet again, holding the field being edited.

These three are the shipped `ManageContactList` / `ManageContactSheet` / `ManageContactRecord`.
The frame confirms their field order and vocabulary; it does not ask for a new surface.

---

## 5. States

Every screen implements **empty**, **loading** and **error**, and all three are visually distinct.

| State | When | Appearance |
|---|---|---|
| Empty — section | the reader's scope holds no contacts | a section-local `EmptyState`: `No contacts yet`, an action to the form |
| Empty — period | rows exist, none in the window | each card's own sentence; the funnel shows a sentence, not four zero bars; the month chart shows a sentence, not empty columns |
| Empty — filtered | the grid's filters match none | the grid's existing empty body plus its filter indicator; never the section empty state |
| Loading | a server navigation | no skeleton; the previous page stays and the header's progress affordance runs. A cold load shows the same affordance |
| Error — read | the server read throws | `AuthzError` 401 → `/login?redirect=…` carrying the path and query; 403 → `/auth/error?code=staff-authorization-failed`; anything else to the error boundary |
| Error — write | a PATCH/DELETE refuses | the grid's error notice above the rows, naming the row and the server's message, with the edited cell reverted |

---

## 6. Frame index

| Frame | Screen | Theme |
|---|---|---|
| `Contacts — Overview (light)` / `(dark)` | §2.1 | both |
| `Contacts — Reports (light)` / `(dark)` | §3.1 | both |
| `Contacts — Grid (light)` | §4.1 | light |
| `Contacts (phone) — Overview` | §2.2 | light |
| `Contacts (phone) — Reports` | §3.2 | light |
| `Contacts (phone) — Grid` | §4.2 | light |
| `Contacts (phone) — Menu` | §1.2 | light |
| `1 Contacts List` / `2 Field Sheet` / `3 Expanded Record` / `5 Edit Name` (prototype file) | §4.2 | light |

The two `1 Contacts List` frames inside `contacts.figcraft` (393×852) are that prototype pasted in
for reference. They carry an iOS status bar, a four-item bottom nav and placeholder data, and are
**not** a build target; the prototype file is the authority for the stack, the app for the chrome.

Dark is specified for the two pages the set draws it for; the remaining screens inherit the same
tokens and are checked in both themes at review.
