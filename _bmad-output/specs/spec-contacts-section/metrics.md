# Metrics

Every figure on Overview and Reports is defined here once and computed once, in
`lib/contacts/metrics.ts`, over the contacts the section reads. Pages render its output; no
component recomputes.

## 1. The collection date

**`initial_contact` is the only date.** No fallback, no derived field.

```
collectionDay(contact) = contact.initialContact      // 'YYYY-MM-DD', Asia/Kolkata programme day
```

It is written at create time by the write path, not inferred later:

| Path | Today | Required |
|---|---|---|
| `/contact` form → `POST /api/contact` → `createContact` | already stamps `currentProgramDate()` (`lib/supabase/data.ts:614-621`) | unchanged |
| Public registration → `createContact` | already stamps it | unchanged |
| `POST /api/manage/contacts` → `createManageContact` | stamps nothing (`lib/supabase/manage.ts:1094-1101`) | unchanged — the inline create is not rendered on this tab, so this path is unreachable from the section. A direct call still creates an undated row. |

`currentProgramDate()` returns the `Asia/Kolkata` programme day, so a contact entered at 00:30 or
at 23:30 IST both land on the day the person was actually met.

A row with no stored date is **undated**: excluded from every dated window, counted by the quality
list's *No first-contact date* row, and included by `All time`, which applies no date filter at
all. That population is legacy data plus anything the ad-hoc endpoint creates; the two reachable
create paths both stamp the field, so the section's own surfaces stop growing it.

## 2. Scope and windows

`P` = the reader's own contacts: the program's rows whose `assigned_preacher_id` is the reader.
`Admin` and `Preacher` read the same rule. There is no `mode` and no wider view.

Every figure on every tab reads the same `P`.

| Window | Definition | Used by |
|---|---|---|
| This month | `initialContact` in the current calendar month | Tile 2; the current-month bar in *New contacts collected* |
| Last month | `initialContact` in the previous month | Tile 2's delta |
| Last 6 months | `initialContact` in `[now − 5 months' first day … now]` | Overview month card |
| 60 days | `past60DayAttendanceCount > 0`, the rollup's own window | Tile 3, funnel stage 4 |
| Lifetime | no lower bound | Tiles 1, 4, 5; sources; locations |
| Selected period | `Last 30 days` / `Last 90 days` (default) / `Last 12 months` / `All time` | Funnel, collectors |

`All time` is the absence of a window, not a large one. It therefore includes undated rows, while
the three dated windows do not.

Links carry the **resolved boundary**, not the period symbol:
`f.initialContact=within:2026-09-01..2026-09-30`.

## 3. Overview

| # | Label | Definition | Link |
|---|---|---|---|
| T1 | Total contacts | `\|P\|` | none |
| T2 | New this month | `\|P: initialContact in this month\|`; caption is the integer difference from last month | `f.initialContact=within:…` |
| T3 | Active in 60 days | `\|P: past60DayAttendanceCount > 0\|` | `f.past60DayAttendanceCount=gt:0` |
| T4 | Never attended | `\|P: totalAttendanceCount = 0\|` | `f.totalAttendanceCount=is:0` |
| T5 | No location | `\|P: locationIds empty\|` | `f.location=isEmpty:` |

Tile 1's caption counts the locations that hold `P`. The header's `{locations} locations` counts
active program locations, so the two numbers differ whenever a location has no contacts in `P`.

**Tile 4 is *Never attended*, not *Never contacted*.** No field can answer "never contacted":
`contacts.last_contacted_on` is parked empty by
`20261010000000_contacts_date_columns_to_date.sql:125-131`, which nulls every surviving value.
Counting it would return the whole population. Attendance is the nearest question a real column
answers, and it is the figure the Reports quality list carries as *Never attended a session*.

| Card | Definition |
|---|---|
| New contacts collected | `P` bucketed by the first seven characters of `initialContact`, last six months, months with no contacts drawn at zero; bar width = value ÷ largest |
| Where contacts came from | `P` grouped by `source`; the empty source is the row **Not recorded**; labels are display names mapped from the stored value in `lib/contacts/metrics.ts`; ordered by count, ties by label; six rows plus `+ {n} more` |
| Contacts by location | `P` grouped by the first resolved location; the four largest resolved rows, then `+ {n} more` when more exist, then **No location** and **Unknown location** as separate rows; rows sum to `\|P\|` |
| Engagement | `totalAttendanceCount > 0` · `past60DayAttendanceCount > 0` · `totalAttendanceCount >= 3` |

## 4. Reports

| Row | Definition |
|---|---|
| Funnel — Collected | `\|P(period)\|`; `All time` is `\|P\|` and includes undated rows |
| Funnel — Location resolved | of those, `locationIds` names a real location |
| Funnel — Attended a session | of those, `totalAttendanceCount > 0` |
| Funnel — Active in 60 days | of those, `past60DayAttendanceCount > 0` |
| Month columns | the last twelve months ending at the current month, one baseline, independent of the selected period; undated rows are not shown and the card says so |
| Collectors | `P(period)` grouped by `collectedById`, resolved to a name; contacts with no collector are excluded; percentage is the row's share of `\|P(period)\|`, so the rows sum to 100% only when every contact in the period has a collector |
| Needs attention — No location | `\|P: locationIds empty\|` |
| Needs attention — No phone number | `\|P: phone blank\|` |
| Needs attention — No first-contact date | `\|P: initialContact null\|` |
| Needs attention — Never attended | `\|P: totalAttendanceCount = 0\|` |

Funnel bar widths are `stage ÷ Collected`. The four quality rows and the funnel's warning line are
**whole-scope**, not period-scoped, and do not move when the period changes.

## 5. Rules

1. A percentage appears only as a caption beside its exact count, never as the value.
2. Every figure is a link to its row set, except T1 (already all rows) and the funnel's `Collected`
   (the whole period).
3. A link, followed, produces a grid whose status readout — the `{visible} of {total} in scope`
   node in the toolbar, or the phone list's footer — reports the figure clicked. This is the
   section's one invariant and is asserted in `e2e/specs/contact-overview.spec.ts` and
   `e2e/specs/contact-reports.spec.ts`, both created by this work. The definitions themselves are
   asserted in `lib/contacts/metrics.test.ts`.
4. `initialContact` is written at create time and is never derived on read.
5. Whole-scope and period-scoped figures never share a card without the card saying which it is.
6. Every numeric value in `screens.md` is illustrative sample data. A value that disagrees with a
   definition is a frame defect, not a metric variant.
