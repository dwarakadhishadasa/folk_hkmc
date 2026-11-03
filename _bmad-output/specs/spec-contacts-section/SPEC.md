---
id: SPEC-contacts-section
companions:
  - screens.md
  - metrics.md
  - ../../../docs/manage-grid-pattern.md
  - ../../../docs/architecture/testing.md
sources:
  - ../../E-Assets/page-designs/contacts.figcraft
  - ../../E-Assets/page-designs/contacts-design-set-summary.md
  - ../spec-contacts-overview-reports/
  - ~/figcraft-scratch/contacts-mobile-prototype.figcraft
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete,
> preservation-validated contract for what to build, test, and validate. Source documents listed
> in frontmatter are for traceability — consult them only if you need narrative rationale or
> prose colour this contract intentionally omits. Where a source disagrees with this file, this
> file wins; `.memlog.md` records the decisions behind it.

# Contacts section — Overview, Contacts, Reports

## Why

**A pain to solve.** Contact work is split across two places that know nothing about each other.
The grid lives inside `/manage`, three taps behind an admin portal that is really about sessions
and attendance; the form that creates a contact is a separate page on the app's first pill; and
nothing anywhere answers *how many contacts I collected this month, and how many of them are
usable*. A coordinator preparing a session has to open the grid, count, and guess.

This spec makes the first pill a real destination: a **Contacts section** that opens on the
numbers, carries the grid unchanged as its second tab, and closes with the reports that explain
them. The form stays exactly where staff already know it.

## Routes

| Route | Page | Who |
|---|---|---|
| `/contacts` | Overview — the section root and the first pill's target | `Admin`, `Preacher`, `Assistant` |
| `/contacts/grid` | Contacts — the grid | `Admin`, `Preacher`, `Assistant` |
| `/contacts/reports` | Reports | `Admin`, `Preacher`, `Assistant` |
| `/contact` | Add contact — the form, unchanged | all four roles |
| `/manage?view=contacts` | redirects to `/contacts/grid` | — |

`Volunteer` opening any `/contacts*` route lands on `/contact`. An Assistant opens the section on the assigned Preacher's personal patch (the assigned Preacher may be an Admin or a Preacher); an Assistant with no eligible assignment sees the section's empty explanation. Amended by `SPEC-admin-assistants`.

## Capabilities

- **CAP-1** — The section and its navigation
  - **intent:** A staff member can open Contacts from the app's first pill and move between
    Overview, Contacts and Reports on either a desktop or a phone.
  - **success:** On desktop the three labels render as an underline strip beneath the page title
    with the current one underlined; on a phone the title's chevron opens a full-screen panel
    listing the same three, and choosing one navigates there. Every move stays inside `/contacts*`,
    and no control in the section changes the reader's scope.

- **CAP-2** — Overview, and every number as a door
  - **intent:** A reader can see how many of their contacts were collected and how usable they are,
    and reach the exact rows behind any figure.
  - **success:** The five tiles and four cards in `screens.md` §2 render from the section's data;
    following any linked tile, month bar, source row, location row or engagement row lands on
    `/contacts/grid` with a filter applied, and the grid's status readout — the phone list's
    footer on the narrow shape — reports the same count that was clicked.

- **CAP-3** — Reports
  - **intent:** A reader can explain the collection effort — how far contacts get, which months
    carried it, who entered them, and what is broken.
  - **success:** The four cards in `screens.md` §3 render; the period select moves the funnel and
    the collector list together; the month chart and the quality list each state in their subtitle
    the population they cover (`metrics.md` §4).

- **CAP-4** — The Contacts tab is the grid, minus the inline create, plus one action
  - **intent:** Staff can browse, edit and delete contacts exactly as they do today, without
    relearning a control.
  - **success:** Every behaviour of the Manage contacts grid is present and its existing specs pass
    unchanged: the desktop grid's columns, editors, selection, keyboard model and URL state, and
    the phone's list → field sheet → expanded record stack. The toolbar does not render `Add
    record`, and the one control added to this surface is **Add contact**.

- **CAP-5** — Add contact goes to the form that already exists
  - **intent:** A staff member adding someone at a distribution drive can get to the contact form
    from the list in one tap, and come back to the list.
  - **success:** `Add contact` — on the phone's title row and on the desktop Contacts header —
    navigates to `/contact`; saving there creates the contact through the existing write path, and
    the new row carries the submit date as `initial_contact`. A fresh navigation back to
    `/contacts/grid` re-reads and shows the row when it is assigned to the reader, without a manual
    reload. The form's fields, validation and save behaviour are unchanged.

- **CAP-6** — One home for contacts
  - **intent:** `/manage` stops offering a second, divergent contacts surface.
  - **success:** `/manage` renders Dashboard, Sessions, Attendance and Favorites only;
    `/manage?view=contacts` redirects to `/contacts/grid` carrying the rest of the query string
    (`f.*`, `q`, `sort`, `cols`, `hide`, `size.*`), and the phone's Admin Panel lists the same four.

- **CAP-7** — One definition per number
  - **intent:** A reader can trust that a figure means the same thing on every surface that shows
    it.
  - **success:** Every figure on Overview and Reports is produced by one module
    (`lib/contacts/metrics.ts`), the pages render its output rather than recomputing, and a unit
    test (`lib/contacts/metrics.test.ts`) asserts each definition in `metrics.md` against a fixture
    array.

## Constraints

- **The design is the visual authority.** Layout, spacing, type, colour, copy and per-screen
  composition come from `contacts.figcraft` as enumerated in `screens.md`. Where this spec is
  silent, the frame decides — except where a frame still draws the retired scope switch or
  `Export CSV`; both are superseded.
- **The grid does not change.** `components/grid/` receives no edits, and `ManageContactsTable`
  keeps its columns, editors, commit and rollback path, keyboard model, selection semantics and
  URL contract. Its visible column set and hidden set are unchanged from Manage. This tab does not
  render the toolbar's `Add record`; that is the only difference from the surface `/manage` had.
- **The section is personal-scope.** `P` is the patch owner's contacts: rows whose
  `assigned_preacher_id` is the resolved patch owner. `Admin`, `Preacher` and `Assistant` read the
  same rule; an Assistant's owner is the assigned Admin or Preacher. There is no scope switch and
  no `?mode=` anywhere in the section. A contact with no assigned preacher is not in `P` and is not
  reachable from these three tabs. This is a read rule, not a permission boundary:
  `/api/manage/contacts*` and the contacts RLS policy grant the same patch. Amended by
  `SPEC-admin-assistants`.
- **The collection date is a stored field, not an inference.** `initial_contact` is written at
  create time by the form (`createContact`) and by public registration, and every period-scoped
  figure and link reads it. Nothing is derived from `created_at`, so the grid needs no new column
  and its hidden set stays at five. The grid's inline create is not rendered here, so no write path
  changes.
- **One scroll container per page.** The section layout is a bounded column
  (`h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))]`, `overflow-hidden`), not the page-scrolling
  shape Campaigns uses, because the grid must own the only scroller
  (`grid-scroll-surface.spec.ts`).
- **Roles.** Overview, Contacts and Reports are `Admin`, `Preacher` and `Assistant`, matching the
  operational surface set. `Volunteer` keeps the form-only path: `/contacts*` redirects them to
  `/contact`, which is the form. An Assistant reads the assigned Preacher's personal patch only.
  Amended by `SPEC-admin-assistants`.
- **The phone list is the prototype, not the imported frames.** Layout comes from
  `~/figcraft-scratch/contacts-mobile-prototype.figcraft` — outside the repo today; publish it to
  `_bmad-output/E-Assets/page-designs/` before the story starts. The app bar and the five-item
  bottom nav come from the running app. The pasted 393×852 frames with an iOS status bar and a
  four-item nav are not a target.
- **No schema change.** No column is added, removed or retyped.

## Non-goals

- No new contact fields, no schema migration, no change to the add-contact form's fields,
  validation or `POST /api/contact` body.
- No CSV export in this section. If it is wanted later it is its own story, with its own endpoint,
  role rule, column list and file name.
- No scope switch, `mode` query parameter or "all preachers" view.
- No inline `Add record` on this tab.
- No sixth app-bar or bottom-nav item: the section lives behind the existing **Contact** pill.
- No record drawer, side panel or per-contact route on Overview — the grid is the detail surface.
- No rebuild of the phone list to the imported frame's chrome, status bar or four-item nav.
- No saved views, Ask-AI filter authoring, or condition groups; the grid's existing filter surface
  is what ships.
- No change to the `/api/manage/contacts*` endpoint names or their authorization.
- Assistant access to the grid is the `SPEC-admin-assistants` change; it is patch-scoped, not programme-scoped.

## Success signal

A Preacher opens the app's first pill, reads how many of their contacts were collected this month,
clicks *Never attended*, lands on a grid whose status readout reports exactly that number of rows,
and adds one contact through the form and sees it in the list — without opening `/manage` once.

## Assumptions

- Every numeric value in `screens.md` is illustrative sample data. Labels, order, definitions and
  geometry are contract. Where two examples of the same definition disagree, `metrics.md` wins and
  the frame is corrected.
- The prototype's four-item bottom nav predates the Campaign pill; the shipped app has five and
  keeps all five. The prototype is a layout authority only.
- The two `1 Contacts List` frames pasted into `contacts.figcraft` on 2026-11-01 are that prototype
  brought in for reference, not new screens to build.
- `Admin`, `Preacher` and `Assistant` reach these three tabs; an Assistant reads only the assigned Preacher's patch.
- Unassigned contacts are outside `P` by design. Making them visible is a change to the scope rule,
  not an implementation detail.

## Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Section root | `/contacts`; the form keeps `/contact` and the pill points at `/contacts`. |
| D2 | Undated rows | The period filter is the only rule: a dated window excludes `initial_contact` null, `All time` applies no filter and includes them. No backfill. |
| D3 | The count invariant | Asserted against the grid's status readout (`{visible} of {total} in scope`), not the footer's record total. |
| D4 | CSV export | Not in this section. No endpoint, no button, no spec file. |
| D5 | Scope | No control in either shape. `P` is `assigned_preacher_id = patchOwner` for `Admin`, `Preacher` and `Assistant` alike; `/manage` keeps its own switch for its remaining tabs. |
| D6 | Reports month chart | Always the last twelve months; the period select does not move it, and the card's subtitle says so. |
| D7 | Inline create | The toolbar's `Add record` is not rendered on this tab; `Add contact` is the one create. |
