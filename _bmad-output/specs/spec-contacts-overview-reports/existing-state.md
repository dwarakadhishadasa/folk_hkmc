# Existing state

Everything below is read off the repository at the date of this spec. Line references are
to the committed files, not to a proposal.

---

## 1. Where contacts live today

### The two surfaces that already exist

| Surface | Route | Component | Gate |
|---|---|---|---|
| The grid | `/manage?view=contacts` | `components/manage/manage-contacts-table.tsx` | `requireRole(["Admin","Preacher"])` (`apps/folk/app/manage/page.tsx:26`, `apps/gita-life/app/manage/page.tsx:26`) |
| The add form | `/contact` | `components/contact-form.tsx` | every staff role (`apps/folk/app/contact/page.tsx:12`, `apps/gita-life/app/contact/page.tsx:13`) |

Both apps mount the same `ManagePortal`, so the grid is already a shared component with two
route hosts. Both apps also carry their own `/contact` page wrapping the same `ContactForm`.
The Gita Life page passes no `locations` prop, so the form takes its address branch there
(`components/contact-form.tsx:76-78`).

### `/contact` is the first nav item in both shapes

`components/header.tsx:255` puts `{ href: "/contact", label: "Contact", icon: UserRoundPlus }`
first in `navItems`, which drives both the desktop pill row and `data-mobile-app-nav`. It is
therefore already the first pill and the first tab — the section does not need a new nav
entry, only a new shape behind the existing one.

`isActivePath` (`components/header.tsx:34-40`) matches `/contact` and any `/contact/*`
descendant, so the pill stays lit on all four new routes without a change.

### Contacts is the last tab in `/manage`

`components/manage/manage-types.ts:13-21` declares the five views; `manage-portal.tsx:16-22`
labels them. The Contacts tab is `TabsContent value="contacts"` at
`manage-portal.tsx:216-218`, and it is the one tab that continues the height chain instead of
owning its own scroll — the comment at `:206-212` records that this is deliberate, because a
second scroller above the grid is what once clipped the final column.

---

## 2. The height chain the grid depends on

`apps/folk/app/manage/page.tsx:53` establishes it:

```
<div className="flex h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col overflow-hidden">
  <Header />
  <main className="flex min-h-0 w-full flex-1 flex-col px-4 py-6 sm:px-6">
    <ManagePortal … />
```

`manage-portal.tsx:93` continues it (`flex min-h-0 flex-1 flex-col gap-4`), and `:216` passes
`flex min-h-0 flex-col` to the Contacts tab so the grid fills. Every `min-h-0` in that chain
is load-bearing: a flex item defaults to `min-height: auto` and refuses to shrink below its
content, so a missing one silently restores page scroll — which reads as "the page scrolls
again" rather than as a missing class (`manage-portal.tsx:82-91`).

`apps/folk/app/campaigns/layout.tsx:49-53` takes the other shape:
`min-h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col` with `main` a
`flex-1 … p-6` column. It is **not** `overflow-hidden`, so the document scrolls. Campaigns can
afford that because it has no grid. The Contacts section cannot, for the reason in §3.

---

## 3. The grid's scroll contract is asserted, not assumed

`e2e/specs/grid-scroll-surface.spec.ts:68` states that the whole file runs against
`?view=contacts`, and `e2e/fixtures/manage-grid.ts:113-144` defines `scrollingElements` — it
collects every element that both overflows and has a scrolling `overflow`, described rather
than counted. A second scroller anywhere above the grid fails it.

`components/grid/grid.tsx` renders `<table>` directly rather than through
`components/ui/table`, because that wrapper's div is a second scroll container
(`spec-contacts-premium-grid/surface-and-toolbar.md`).

The scroller's accessible name comes from the grid's own `ariaLabel`, and
`e2e/fixtures/manage-grid.ts:84` locates it as
`page.getByRole("group", { name: "Contacts" })`. That name is part of the test contract.

---

## 4. The grid's URL contract

`components/grid/grid-view-state.ts:8-16` is the wire table:

| Param | Meaning |
|---|---|
| `sort` | `colId:asc[,colId:desc]` in priority order |
| `q` | global filter text |
| `f.<colId>` | one condition, ANDed across columns |
| `fa.<colId>` | one condition, ORed across columns |
| `cols` | ordered, comma-joined column ids |
| `hide` | COMPLETE hidden set; an absent key applies defaults, a present one (even `hide=`) does not |
| `size.<colId>` | committed column width in integer px |

`e2e/fixtures/manage-grid.ts:71-75` is the single navigation seam every grid spec uses:

```ts
export function manageContactsUrl({ mode = "admin", params = {} } = {}): string {
  const search = new URLSearchParams({ view: "contacts", mode, ...params })
  return `/manage?${search.toString()}`
}
```

Two specs hardcode the URL instead of calling it — `grid-scroll-surface.spec.ts:68` and
`theme-switch.spec.ts:541` — and `grid-linked-record-picker.spec.ts:503` navigates to a
sibling tab (`?view=favorites`), which is unaffected.

---

## 5. What a contact row carries

`ManageContact` (`components/manage/manage-types.ts:42-72`): `id`, `name`, `phone`, `college`,
`company`, `rounds`, `source`, `booksRead`, `notes`, `initialContact`, `lastContactedOn`,
`dateOfBirth`, `photoPath`, `isFavorite`, `locationIds`, `assignedPreacherId`,
`collectedById`, `totalAttendanceCount`, `past60DayAttendanceCount`.

`CONTACT_COLUMNS` (`lib/supabase/manage.ts:60-78`) selects exactly those columns. **It does
not select `created_at`**, although the column exists and is `DEFAULT now()`
(`20261004000000_create_core_tables.sql:23`). `ManageContact` therefore has no creation date
today; adding it is one string and one field.

`contact_attendance_counts` (`20261006000000_add_users_and_contact_columns.sql:74-83`) supplies
the two rollups: total attendance, and attendance inside a rolling 60 days measured against
`now() AT TIME ZONE 'Asia/Kolkata'`.

### The dates are `date`, not `timestamp`

`20261010000000_contacts_date_columns_to_date.sql` converted `date_of_birth`,
`initial_contact`, `last_contacted_on` and `sessions.session_date` to `date`. So
`initial_contact` is a program-local calendar day with no clock attached, and
`lib/supabase/manage.ts:228-252` `calendarParts()` already normalises any ISO string — date
or timestamp — to the `Asia/Kolkata` day (`MANAGE_TIME_ZONE`, `:45`). That helper is exactly
what the `created_at` fallback needs; no new date parsing is required.

---

## 6. Which creates write which fields

| Path | `initial_contact` | `source` | `collected_by_id` |
|---|---|---|---|
| Add-contact form → `POST /api/contact` → `createContact` | **written**, `currentProgramDate()` (`lib/supabase/data.ts:614-621`) | `payload.source \|\| "Pass distribution"` (`apps/folk/app/api/contact/route.ts:144`) | `collectorId` (`route.ts:136-137,147`) |
| Public registration → `createContact` | **written**, same helper | `"Attendance Registration"` / `"Public Registration"` (`apps/folk/app/api/registration/route.ts:143`) | per route |
| Grid `+ Add record` → `POST /api/manage/contacts` → `createManageContact` | **not written** (`lib/supabase/manage.ts:1094-1101`) | **not written** | `staff.supabaseUserId` (`:1100`) |
| Migration / backfill | whatever the source held | whatever the source held | whatever the source held |

The third row is the finding that decides the KPI basis: a contact created in the grid has no
collection date at all, so an `initial_contact`-only count would omit it silently while the
row sits in the grid the reader just came from.

`KNOWN_SOURCE_VALUES` (`manage-contacts-table.tsx:199`) is `["preview-fixture",
"preview-fixture-bulk"]`, and the select editor unions the option list with whatever the rows
carry (`:665-675`). There is therefore no fixed source vocabulary: `"Pass distribution"` is
written by one path, never offered by the grid's own list, and would appear as a stray option
the moment a row carries it.

---

## 7. Role reality, which is narrower than the RLS

`contacts` SELECT is granted by role (`20261006010000_scoped_rls_policies.sql:173-182`):

- `Admin` — the whole program
- `Preacher` — `assigned_preacher_id = auth.uid()`
- `Assistant` — `assigned_preacher_id = caller's assigned preacher`
- `Volunteer` — no term, therefore zero rows

The UI gate does not match it: both `/manage` pages call `requireRole(staff, ["Admin","Preacher"])`,
so **an Assistant has a read grant and no surface**. This spec preserves the existing gate
rather than widening it (see `SPEC.md` D6 and open question 2), because widening a permission
is not a design decision.

The scope switch in `manage-portal.tsx:140-167` is Admin-only and drives `?mode=admin|preacher`;
`loadManagePortalData` narrows on the server at `lib/supabase/manage.ts:524-541`. Preachers are
narrowed unconditionally, so the switch is absent for them by construction
(`resolveManageMode`, `components/manage/manage-types.ts:242-244`).

---

## 8. The chrome that already exists and will be reused

| Element | Where | What the Contacts section needs from it |
|---|---|---|
| Section shell (Header + `StaffAuthShell` + `main`) | `apps/folk/app/campaigns/layout.tsx` | the shell, minus the page-scrolling `main` |
| Page header (22px Poppins title, 12px muted scope line, action on the right) | `components/campaign/campaign-page-header.tsx:36-57` | exactly as drawn |
| Desktop tab strip (13px, 2px underline, `--tab-*` tokens) | `components/campaign/campaign-sub-nav.tsx:35-56` | exactly as drawn |
| Phone menu (full-screen dialog, chevron trigger, bottom rule) | `components/campaign/campaign-menu.tsx` | the shell; the badge slot is empty here |
| Navy card band (`--primary` header + body) | `components/campaign/reports/report-card.tsx` | the Reports and Overview cards |
| Five stat tiles, amber bucket, phone order swap | `components/campaign/campaign-overview-stats.tsx:67-93` | the Overview tiles |
| Leaderboard rows (rank, initials, name, count) | `components/campaign/reports/report-leaderboard-card.tsx` | Collected-by ranking |
| Ranked bar rows (label, bar, count) | `components/campaign/reports/report-outcome-mix-card.tsx` | Source mix |
| Empty state with an action | `components/campaign/campaign-empty-state.tsx` | every zero state |
| URL-carried filter select | `components/campaign/campaign-status-filter.tsx` | the period filter |

`components/manage/manage-dashboard.tsx` contains a near-identical `ChartFrame`
(`:89-114`) with the same navy band. Two implementations of one card is the drift this spec
extracts away: `ReportCard` is the one that survives and `ChartFrame` should adopt it
in the same change, since the dashboard is the same visual language.

---

## 9. Numbers that already exist, and must not be re-derived

`lib/supabase/manage.ts` already computes, from the same rows:

- `contactsPerQuarter` — new contacts per quarter, on `initial_contact` (`:309-325`)
- `statusQuo` — a derived bucketing, explicitly this repo's own decision, not a recovered
  field (`:327-386`)
- `sessionsByPreacherLocation` / `attendanceByPreacherLocation` — monthly stacked series
  (`:265-307`)

The Contacts Overview must **not** ship a second definition of "new contacts per quarter".
`contactsPerQuarter` is the existing one; the Overview's own series is month-grain and
period-scoped, and `metrics-contract.md` §6 states the relationship rather than implying two
sources of truth.

---

## 10. What the current tests would notice

| Change | Spec that fails first |
|---|---|
| Moving the grid off `/manage?view=contacts` | every spec that calls `manageContactsUrl()`, plus `grid-scroll-surface.spec.ts:68` and `theme-switch.spec.ts:541` |
| Removing the Contacts tab from `MANAGE_VIEWS` | `theme-switch.spec.ts:541` |
| Extracting `CampaignMenu` / `CampaignPageHeader` | `campaign-menu.spec.ts` (the guard for the extraction) |
| Adding `created_at` to the payload | nothing — it is additive |
| Adding `/contact/reports` etc. | nothing existing; the section needs its own specs |

`pnpm test:e2e` runs none of this in CI: CI covers guardrails, typecheck, unit, build and
lint. A green CI run after this change says nothing about the grid having moved correctly.

---

## 11. The design set this spec specifies

`_bmad-output/E-Assets/page-designs/contacts.figcraft`, generated by `build_contacts_designs.py`
(which imports its token table, chrome helpers and icon fitting from
`build_campaigner_designs.py`). Nine frames, three pages:

| Frame | What it settles |
|---|---|
| `Contacts — Overview (light)` / `(dark)` | five tiles, the 860/480 body split, the month strip, sources, locations, engagement |
| `Contacts — Reports (light)` / `(dark)` | the period select, Export CSV, the funnel with its warning line, the monthly column chart, the collector leaderboard, the data-quality list |
| `Contacts — Grid (light)` | the existing `/manage` table with the section header above it — eight visible columns, `Add record` in the toolbar, `272 records` in the footer |
| `Contacts (phone) — Overview` / `Reports` / `Grid` / `Menu` | the title chevron, the 2×2 tiles, the two-month strip, all six location rows; the period control, the funnel and the quality list; the Name/Phone list with `Add record`; and the full-screen section menu |

The generator's own header states the intent, and the spec is written to it: *"The nav shape is
the campaign set's: a sub-tab strip of Overview | Contacts | Reports under the page title, with
the existing /manage grid as the third tab rather than the whole page."*

Rendered previews are in `_bmad-output/E-Assets/page-designs/preview/contacts/`.

`SPEC.md`'s opening table lists the six points where this spec changes the design, each with a
reason. They are all corrections of fact or of the app's own conventions, not of taste:

| Point | Evidence |
|---|---|
| no sixth nav pill | decided in review; the existing first pill hosts the section |
| Overview title `Overview` | the tab and the `h1` must name the same page, as on every Campaigns page |
| hidden-field pill `6` | the derived `Collected` column is added, hidden by default |
| the fourth tile is "Never attended", not "Never contacted" | §12 |
| locations split "No location" from "Unknown location" | `manage-contact-fields.ts:18-35`; `surface-and-toolbar.md` CAP-4 |
| phone keeps the period select | a report whose window cannot be changed on the surface most readers use is a screenshot |

---

## 12. `last_contacted_on` is empty by decision all the way down

The design's fourth tile reads **"Never contacted"**. There is no field behind it.

`contacts.last_contacted_on` is selected by `CONTACT_COLUMNS` (`lib/supabase/manage.ts:71`) and
surfaced as `ManageContact.lastContactedOn`, but:

- **nothing writes it** except the Airtable migration (`scripts/migrate-airtable-data.mjs:668`);
- **the migration then empties it deliberately.** `20261010000000_contacts_date_columns_to_date.sql:125-131`
  reads, verbatim: *"Park decision (Dwaraka 2026-10-10): the column ends EMPTY. Report, then
  null."* — every surviving value is nulled before the type change;
- `spec-contacts-premium-grid` already hides the column by default for this reason (OQ-16,
  `manage-contacts-table.tsx:146-149`).

So `WHERE last_contacted_on IS NULL` returns the whole population, not the design's 18. The
nearest question a real field can answer is **never attended** (`totalAttendanceCount = 0`), and
the tile uses it — matching the Reports needs-attention row of the same name, and matching the
design's own sentence that collecting is not belonging.

A genuine "never called" metric needs `dialer_call_logs`
(`20261025000000_create_dialer_tables.sql`), which only FOLK has (`modules.dialer` is `false`
for Gita Life). That is `SPEC.md` open question 6.

---

## 13. Three creates, three different sets of fields

Restated here because every KPI depends on it:

| Path | `initial_contact` | `source` | `collected_by_id` |
|---|---|---|---|
| `/contact/new` → `POST /api/contact` → `createContact` | **written**, `currentProgramDate()` (`lib/supabase/data.ts:614-621`) | `payload.source \|\| "Pass distribution"` (`apps/folk/app/api/contact/route.ts:144`) | `collectorId` (`route.ts:136-137,147`) |
| Public registration → `createContact` | **written**, same helper | `"Attendance Registration"` / `"Public Registration"` (`apps/folk/app/api/registration/route.ts:143`) | per route |
| Grid `Add record` → `POST /api/manage/contacts` → `createManageContact` | **not written** (`lib/supabase/manage.ts:1094-1101`) | **not written** | `staff.supabaseUserId` (`:1100`) |

That third row is why `collectedOn` needs the `created_at` fallback: without it, every contact
added at a distribution drive through the grid would be invisible to the Overview. And it is why
`SPEC.md` open question 1 recommends one added line so the stored date exists too.

