# Metrics contract

Every number the Contacts section shows is defined here once. A page renders these
definitions; it never recomputes one its own way.

---

## 1. The collection date

```
collectedOn(contact) = calendarParts(contact.initialContact)
                    ?? calendarParts(contact.createdAt)
```

`calendarParts` is the existing helper at `lib/supabase/manage.ts:228-252`. It takes any ISO
date **or** timestamp and returns the `Asia/Kolkata` calendar day.

- `initial_contact` is `date` (`20261010000000_contacts_date_columns_to_date.sql`), so it
  round-trips unchanged.
- `created_at` is `timestamptz`. **It is not `slice(0, 10)`.** A row created at 02:00 IST is
  `20:30Z` the previous day, and slicing the ISO string would date it a day early for every
  row created between midnight and 05:30 IST.
- For historical rows the fallback is a real date, not the migration's run date:
  `scripts/migrate-airtable-data.mjs:677` sets `created_at` from `record.createdTime`.

`collectedOn` is computed **on the server**, in `loadManagePortalData`, and shipped as a field.
The grid's filter runs in the browser, and `Intl` time-zone formatting there would be a second
implementation of the same rule.

| Field | Type | Where | Notes |
|---|---|---|---|
| `initialContact` | `string \| null` | exists | the stored collection date; editable, often null |
| `createdAt` | `string \| null` | **new** | raw ISO; added to `CONTACT_COLUMNS` |
| `collectedOn` | `string \| null` | **new** | `YYYY-MM-DD`; never written |

`ManageContactWriteResult` gains both, for the reason it already carries `assignedPreacherId`
and `collectedById` (`manage-types.ts:193-207`): a promoted draft row must render correctly
without a reload. Without `collectedOn`, a contact created in the grid is invisible to every
number in this file until the page is refreshed.

`collectedOn` is `null` only when both inputs are unresolvable. That population is `undated`, it
is reported rather than folded into a bucket, and the Reports "No first-contact date" row
(M8) is where a reader meets it.

---

## 2. The grid column this makes possible

One column is added to `ManageContactsTable`:

| id | Header | fieldType | editable | default | position |
|---|---|---|---|---|---|
| `collectedOn` | `Collected` | `date` | **no** | **hidden** | directly after `Initial Contact` in `COLUMN_IDS` |

Why it exists at all: the design's premise is that a number is a door into the rows behind it
(`SPEC.md` D1). A tile counted on `collectedOn` cannot be reproduced by a grid filtering on
`initialContact`, because a null `initial_contact` matches no date operator. This column is
what makes the door open onto the same room.

Why it is hidden: the design's grid frame draws eight columns, and that is what a reader must
see. Hiding the derived column keeps the frame exact and still lets a filter use it.

Why it is read-only: `openEditor` refuses a column whose `meta.grid.editable` is not `true`
(`use-grid-keyboard.ts:849`), so an inferred date can never be committed over a stored one.
`Initial Contact` keeps its own column, its own editor, and stays the only writable date.

**Cost, stated:** `COLUMN_IDS` moves from fourteen to fifteen, the *Hide fields* list from
thirteen to fourteen rows, and the toolbar's hidden-field pill from **5** to **6**. Those
assertions move with the source — `grid-toolbar.spec.ts:8`, `:285`, `:544` and
`grid-column-drag-menu.spec.ts:39` — and that is a legitimate update because the contract
really changed. It is recorded in the story, never edited to stay green. The design file's grid
frame needs the pill's label changed from `5 hidden fields` to `6`; nothing else in the frame
moves.

---

## 3. Scope and windows

### Scope

Every number runs over the reader's visible population `P` — the same population the grid
shows:

```
P = contacts where program_id = reader's program
    and (mode = "admin"    → every row the reader may read
         mode = "preacher" → assigned_preacher_id = reader's id)
```

`mode` is the existing `?mode=admin|preacher` switch, carried into every tab by the sub-nav.
A Preacher is narrowed unconditionally, so their `mode` is always `preacher`
(`resolveManageMode`, `manage-types.ts:242-244`). **Every number on every tab reads the same
`P`.**

### Windows

The Overview has **no period control** (`SPEC.md`, kept from the design). Its windows are fixed
and each card names its own. Reports has one, and it narrows only the three Reports cards that
describe *this period's output*.

| Window | Definition | Used by |
|---|---|---|
| **Now** | the `Asia/Kolkata` program day at render | every window's upper bound |
| **This month** | `collectedOn` in the current calendar month | T2, and M1's highlight |
| **Last month** | `collectedOn` in the previous calendar month | T2's delta |
| **The last 6 months** | `collectedOn` in `[now − 5 months' first day … now]` | M1 |
| **The last 12 months** | `collectedOn` in `[now − 11 months' first day … now]` | M6 |
| **60 days** | `past60DayAttendanceCount`, the rollup's own window (`now − 60d`, `Asia/Kolkata`) | T3, M4 row 2, M5 stage 4 |
| **Lifetime** | no lower bound | T1, T4, T5, M2, M3, M4 rows 1 and 3, M8 |
| **The selected period** | `collectedOn` in the Reports range below | M5, M6, M7 |

Reports' period select offers `Last 30 days` / `Last 90 days` / `Last 12 months` / `All time`,
default **`Last 90 days`** as the frame draws it.

- It narrows **M5 (funnel), M6 (monthly columns) and M7 (collectors)** — the cards that ask
  what this effort produced.
- It does **not** narrow **M8 (needs attention)**, which is a property of the directory as it
  stands today. That card says so on its face.
- It lives in the URL as a symbolic key (`period=30d|90d|12m`, absent = all time); an unknown
  value falls back to the default.
- Links into the grid carry the **resolved boundary**, not the symbol:
  `f.collectedOn=within:2026-09-01..2026-09-30`. The symbol stays correct as time passes; the
  link reproduces the exact set the card counted. They differ only across a day boundary, and
  the card's caption prints the resolved range so nothing is hidden.

`period` is not a grid parameter: the grid never reads it, and receives the boundary inside
`f.collectedOn`, which it already understands (`grid-filter-operators.ts:623-635`).

---

## 4. The Overview's five tiles

| # | Label | Definition | Caption | Data ID | Link |
|---|---|---|---|---|---|
| T1 | **Total contacts** | `\|P\|` | `Across {n} locations` — `P`'s distinct *resolved* locations | `data-contact-stat="total"` | none (no filter reproduces "all") |
| T2 | **New this month** | `\|P \| collectedOn in this month\|` | `▲ {n} vs last month` / `▼ {n}` / `No change vs last month` | `…="new-this-month"` | `f.collectedOn=within:{month first}..{now}` |
| T3 | **Active in 60 days** | `\|P \| past60DayAttendanceCount > 0\|` | `{pct}% of all contacts` | `…="active-60"` | `f.past60DayAttendanceCount=gt:0` |
| T4 | **Never attended** | `\|P \| totalAttendanceCount = 0\|` | `{pct}% — worth a first session` | `…="never-attended"` | `f.totalAttendanceCount=is:0` |
| T5 | **No location** | `\|P \| locationIds is empty\|` | `{pct}% — unresolved` | `…="no-location"` | `f.location=isEmpty:` |

T1 has no link because there is no grid view narrower than "everything"; a tile that navigates
to the unfiltered grid would be a control that does nothing. It is the one tile that is not a
link, and it looks exactly like the others — the difference is discoverable only on hover,
which is the correct amount of signal for "this is already what you are looking at".

T2's delta is a **difference of two integer counts**. A percentage delta of two counts is a
third number with its own rounding; the count difference is exact.

T3's and T4's percentages are the count over `|P|`, rounded to a whole number. `|P|` is T1, so
the denominator is on screen — that is the condition under which a percentage is allowed at all
(§5).

### One correction to the design

The design's fourth tile reads **"Never contacted"**, `18`, `7% — worth a first call`. There is
no field behind it. `contacts.last_contacted_on` is the natural candidate and it is
**permanently empty**: nothing writes it, and the date migration explicitly nulls every value
that survived (`20261010000000_contacts_date_columns_to_date.sql:125-131`,
"the column ends EMPTY"). Counting `IS NULL` would return the whole population, not 18.

So the tile answers the nearest question a field can answer — **never attended** — and it
agrees with the Reports "Needs attention" row of the same name. The design's own note already
argues for attendance over contact attempts: *"Collecting is not the same as belonging."*

If "never called" is genuinely wanted, it needs `dialer_call_logs`
(`20261025000000_create_dialer_tables.sql`), which is FOLK-only — Gita Life has
`dialer: false`. That is open question 6 in `SPEC.md`.

---

## 5. The percentage rule

A percentage is allowed **only** as a caption under an exact count, and only when its
denominator is another number on the same screen. It is:

- rounded to a whole number, never to a decimal;
- computed from two counts, not from a previously rounded percentage;
- never the tile's value, never a bar's only label, never the only expression of a fact.

This is stricter than allowing percentages and looser than banning them, and it is calibrated
to how the design uses them: every percentage in the frames sits beside a count that the reader
can check it against. Where the denominator is not on screen — a card's lone percentage — the
count is printed instead.

---

## 6. The Overview's four cards

### M1 — New contacts collected (month strip)

| | |
|---|---|
| Definition | bucket `P` by the first seven characters of `collectedOn`, over the last **6** months; a month with zero is present as zero |
| Bar width | `value ÷ largest month in the window` |
| Highlight | the current month's bar uses `--chart-2`; other months `--chart-1` |
| Link | each bar → `f.collectedOn=within:{first}..{last}` of that month |
| Note | `{current month} is the current month and is still filling.` — always present |
| Basis sentence | the card's subtitle says `Contacts with a first-contact date, or the record's creation date where it is missing.` |

Six months, and the Reports column chart carries twelve: the Overview's body has 484px left on
a 900px frame, and twelve rows at 26px each do not fit above the sources card. The card states
its window and points at Reports, so the two are the same series at two lengths rather than two
definitions.

### M2 — Where contacts came from

| | |
|---|---|
| Definition | group `P` by `source`; a null or empty source is a row reading **Not recorded** |
| Bar width | `value ÷ largest row` |
| Order | count descending; ties by label; **Not recorded sorts with the rest** |
| Link | `f.source=is:{value}`; **Not recorded** → `f.source=isEmpty:` |
| Cap | 6 rows plus `+ {n} more`, linking to the unfiltered grid |
| Note | the card's subtitle names the field: `The source field — hidden in the grid by default.` |

The design's third row reads **"Everything else"**. That label is replaced by **"Not
recorded"** for the null group, because "everything else" implies a set of values that were
looked at and pooled, while the fact is that the field is empty. It is also the label the grid
would show. A long tail beyond the cap is what `+ {n} more` is for.

### M3 — Contacts by location

| | |
|---|---|
| Definition | group `P` by the **first** resolved location in `locationIds`; a contact with none is **No location**; a contact whose id resolves to nothing is **Unknown location** |
| Order | count descending, then **No location**, then **Unknown location** last |
| Row | 8px dot (`--chart-1`, or `--grid-warning-ink` for the two non-resolved rows), label, count, `{pct}%` |
| Link | `f.location=is:{name}`, `f.location=isEmpty:`, `f.location=is:Unknown location` |

**Two corrections to the design.** It draws a single **"Unresolved"** row at 9, which is the
same 9 as the "No location" tile — collapsing a contact with no location and a contact whose
location row is gone. `spec-contacts-premium-grid` CAP-4 already ruled that these are different
facts and gave them different markers (`manage-contact-fields.ts:18-35`,
`UNRESOLVED_LOCATION = "Unknown location"`). The card shows both, and only the first is the
tile's 9.

The second correction: a contact with more than one `locationIds` entry is counted once, under
the first. The schema allows a set; the UI has offered a single-location picker since
`20261019000000_contacts_single_location.sql`. Counting it once keeps the rows summing to `|P|`
— the alternative is a card whose rows add to more than its own total, which is the one thing a
distribution card must never do.

### M4 — Engagement

| Row | Definition | Caption |
|---|---|---|
| Attended a session | `\|P \| totalAttendanceCount > 0\|` | `{pct}% of contacts` |
| Attended in the last 60 days | `\|P \| past60DayAttendanceCount > 0\|` | `{pct}% of contacts` |
| Attended 3+ times | `\|P \| totalAttendanceCount >= 3\|` | `the committed core` |

Each row: a 4px colour bar, the label, the value at 20px Poppins bold in the row's colour, and
the caption. Rows link to `f.totalAttendanceCount=gt:0`, `f.past60DayAttendanceCount=gt:0`,
`f.totalAttendanceCount=gte:3`.

The third caption is the design's own words and it is the point of the card: the first two rows
count attendance, the third counts *belonging*, and no percentage is offered for it because
"3+ times" has no natural denominator the reader would recognise.

---

## 7. Reports

### M5 — Collection funnel

Four stages, each measured against `|P|`:

| Stage | Definition | Fill |
|---|---|---|
| Collected | `\|P(period)\|` | `--chart-1` |
| Location resolved | of those, `locationIds` resolves to a real location | `--chart-2` |
| Attended a session | of those, `totalAttendanceCount > 0` | `--chart-4` |
| Active in 60 days | of those, `past60DayAttendanceCount > 0` | `--chart-2` |

Bar width is `stage ÷ collected`, so all four bars answer one question: *of the people
collected in this period, how many got this far?*

The stages are ordered by the contact lifecycle and each is a subset of the one above it
**except** in principle two cases, both worth naming rather than hiding:

- a contact can attend a session with no location recorded, so *Attended* may exceed
  *Location resolved* in a badly-kept directory;
- a contact collected in the period can attend a session that happened before it, so the last
  two stages are not strictly bounded by the period.

The bars are ratios, so neither case produces a nonsense picture; what they produce is a third
bar longer than the second, which is true and is exactly the signal an operator needs.

Below the bars, when `collected − attended > 0`, the design's warning line:

> {n} collected contacts have never attended a session. Collecting is not the same as
> belonging — this bucket is the difference.

### M6 — New contacts collected (column chart)

The same series as M1 but drawn as vertical columns with a month axis, and **narrowed by the
period select** rather than fixed at twelve months. The last column is the current month and
uses `--chart-2`.

Columns share one baseline: the bar is anchored to the track's bottom edge
(`build_contacts_designs.py`'s `mainAlign="max"`), not grown down from its own value label.

### M7 — Who collects contacts

| | |
|---|---|
| Definition | group `P(period)` by `collectedById`, resolved through `staffNames`; a row per staff member with at least one |
| Order | count descending, ties by name |
| Row | 32px initials circle, name, `{pct}%` share, count at 14px bold in `--primary` |
| Link | `f.collectedBy=is:{resolved name}` |
| Note | **the design's own**: `Counts are contacts whose first contact was recorded by that staff member. A contact with no collector is not counted here.` |

The design's note is kept verbatim and it is the honest one: this is a **count of records
entered**, not a quality signal. A collector who enters forty contacts that never attend scores
forty. Unlike the Campaigns leaderboard, no disclaimer icon is needed — the sentence is the
disclaimer and it sits under the rows.

A contact with no collector is **excluded**, per the note, not pooled into a "Not recorded"
row. That is the opposite of M2's treatment of `source`, and deliberately so: an unattributed
source is a data-quality fact about the contact, while an unattributed collector is a fact
about the staff workflow that this card is not measuring.

### M8 — Needs attention

| Row | Definition | Action label | Link |
|---|---|---|---|
| No location | `locationIds` empty | `Assign a location` | `f.location=isEmpty:` |
| No phone number | `phone` blank | `Add a number` | `f.phone=isEmpty:` |
| No first-contact date | `initialContact` null | `Set the date` | `f.initialContact=isEmpty:` |
| Never attended a session | `totalAttendanceCount = 0` | `Invite to a session` | `f.totalAttendanceCount=is:0` |

All four are **whole-scope**, not period-scoped: a contact collected in March with no location
is still broken today, and a period filter that hid it would report a shrinking problem that is
not shrinking. The card says so.

"**No first-contact date**" is deliberately *not* `collectedOn` null. It counts the rows whose
**stored** date is missing, which is the set an operator can fix. A row counted by the fallback
still has no stored date and is still on this list — that is the whole point of showing it. When
`createManageContact` starts writing the date (`SPEC.md` open question 1) this row stops
accumulating.

`phone` is `NOT NULL` in the schema, so "No phone number" is a blank string, not a null. It is
still a real state — the grid's create requires a non-empty phone, but a migrated row can hold
`""` — and the design draws it, so it is kept with the definition stated.

---

## 8. Where the numbers are computed

`P` is already read in full by `loadManagePortalData` (`lib/supabase/manage.ts:472-521`) for the
grid. Overview and Reports read through the same loader and reduce with **pure functions** in
`lib/contacts/metrics.ts`, so:

- `loadManagePortalData` owns the read, `metrics.ts` owns the arithmetic, the components own
  nothing;
- a metric can be asserted against a fixture array with no database;
- a tile and the grid cannot disagree, because they are two renderings of one array.

The cost is stated rather than absent: **the Overview loads the whole contact table to show
five numbers.** At the current program size (~1,000 rows, three pages at
`MANAGE_PAGE_SIZE = 1000`) that is the read the grid already does, and the reader is one click
from it.

> **Above roughly 10,000 contacts**, or when the contact read exceeds ~1 s at p95, Overview and
> Reports move to an aggregate reader shaped like `campaign_progress`
> (`supabase/migrations/20261027010000_campaign_progress.sql`) — one function returning §4–§7
> for a program, a scope and a window. The definitions do not change; only who evaluates them.
> That migration is deliberately not written yet, because at 1,000 rows it would be a second
> implementation of rules that currently cannot drift.

The Reports **Export CSV** reads the same rows through the same functions, so an exported file
and the card above it cannot disagree. It streams `text/csv`, writes a header row of the grid's
visible column labels, and carries the same scope and period. It does not carry `collectedOn`
unless the column is visible — an export is a copy of the view the reader is looking at, not a
second view.

---

## 9. Rules a reviewer can check

1. Every number has exactly one definition in this file.
2. A percentage never appears without its exact count beside it and its denominator on screen.
3. Every tile, bar and row is a link to the row set behind it, except T1, which is already that
   row set.
4. A link, followed, produces a grid whose status-bar count equals the number clicked. This is
   the section's one testable invariant and belongs in `contact-overview.spec.ts` and
   `contact-reports.spec.ts`.
5. `initialContact` is never derived. `collectedOn` is never written.
6. Whole-scope and period-scoped metrics never appear in the same card without the card saying
   which it is.
