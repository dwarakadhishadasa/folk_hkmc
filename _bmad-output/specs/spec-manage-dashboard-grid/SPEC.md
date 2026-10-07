---
id: SPEC-manage-dashboard-grid
companions:
  - brownfield.md
  - capability-tiers.md
  - data-loading-decision.md
  - design-constraints.md
  - navigation-decision.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# `/manage` data grid and route-per-table portal

## Why

This is a **pain to solve**, and the pain is now concrete. The `/manage` portal replaced the Airtable interface in story 7-6, and the replacement is functionally adequate but architecturally outgrown its own use case: `manage-contacts-table.tsx` sorts eight columns and filters locations with `useMemo` over the entire scoped row set, so its cost grows linearly with every keystroke and every sort click, with no row virtualization. Staff who worked in Airtable now have a slower, smaller version of the thing they left.

Compounding it, the portal is a single page whose five views live behind tabs. `loadManagePortalData` returns contacts, sessions, attendance, and charts together, so opening the sessions view downloads the whole contact table. And because tab switches are client state synced via `history.replaceState`, "send me the contacts link" is a second-class URL rather than a first-class one.

Story 7-9 is completing the Airtable-to-Supabase migration. Doing this navigation and grid work now, while the data layer is fresh and proven, is materially cheaper than doing it after the next feature lands on the tabs. Affected users are program staff (Admin and Preacher roles) on `/manage` in both deployed apps.

## Capabilities

- **CAP-1** — Virtualized data grid
  - **intent:** An operator can work a table of 200 or more rows with smooth scrolling, because row virtualization bounds how much of the table is in the DOM.
  - **success:** A 500-row table scrolls without dropped frames and its rendered node count stays bounded as rows are added.

- **CAP-2** — Column control
  - **intent:** An operator can sort, resize, reorder, and show or hide columns on any table.
  - **success:** Each of the four controls visibly changes the column set, and the arrangement survives a page reload.

- **CAP-3** — Filtering
  - **intent:** An operator can narrow a table by free text across all columns and by targeted per-column filters.
  - **success:** Global text input narrows across every column; a per-column filter narrows exactly one and combines with the global filter.

- **CAP-4** — Row selection and bulk actions
  - **intent:** An operator can select multiple rows and act on them together.
  - **success:** A multi-row selection is visibly indicated and a bulk action applies to every selected row, reporting per-row outcomes.

- **CAP-5** — Inline editing
  - **intent:** An operator can edit a cell in place and have the change persist.
  - **success:** An edit shows its new value immediately, persists across reload, and reverts visibly with an error message when the write fails.

- **CAP-6** — Per-table routes
  - **intent:** An operator can reach any `/manage` table at its own URL and share or bookmark it.
  - **success:** Each table has a distinct URL; reloading or opening a shared link lands on that table.

- **CAP-7** — Per-table data loading
  - **intent:** An operator opening a table waits only for that table's rows.
  - **success:** Loading `/manage/sessions` issues no contacts query, and a large contacts table does not delay the sessions or attendance views.

- **CAP-8** — Keyboard operation
  - **intent:** An operator can drive the grid and navigate between tables without a mouse.
  - **success:** `j`/`k` move row focus, `e` edits the focused cell, `Enter` commits, `Escape` cancels, and a command palette jumps between tables.

- **CAP-9** — Explicit panel states
  - **intent:** An operator always sees whether a table is loading, empty, or failed.
  - **success:** Each of the three states is reachable on demand and is visually distinct from the other two.

- **CAP-10** — Scope preservation
  - **intent:** An operator's admin or preacher scope survives navigation between table routes.
  - **success:** Switching tables, and following any in-portal link, never silently changes scope.

## Constraints

- Stack is fixed: Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui `new-york`, Supabase. `components.json` and both deployed apps already pin these; substitution is not available.
- The grid model comes from `@tanstack/react-table` v8 and row virtualization from `@tanstack/react-virtual`. Hand-rolled sorting and filtering state is prohibited — the `useMemo` approach in `manage-contacts-table.tsx` is the defect being fixed, not a pattern to extend.
- Sorting, filtering, and column arrangement are **URL state**, not component state. This is what makes CAP-2 and CAP-3 persistence work and what keeps a later move to server-side row models a data-source swap rather than a rewrite.
- Rows are virtualized client-side over the full scoped row set; server-side pagination is out of scope for this spec. `data-loading-decision.md` records the numeric trigger that reopens it.
- All data access flows through `lib/supabase/manage.ts` and `lib/manage/api-handlers.ts`. Components never call Supabase directly.
- RLS is the sole authorization enforcement point. A client may render a disabled affordance for a field the operator cannot write, but must not re-implement authorization logic.
- `manage-contacts-table.tsx` is refactored onto the new grid and its hand-rolled sort and filter removed. A parallel second table implementation is forbidden: two grids means two sets of bugs and a permanent migration tax.
- `/manage` remains the dashboard overview; `contacts`, `sessions`, `attendance`, and `favorites` each get their own route.
- CAP-7 binds the four table routes. `/manage` is an aggregate view, exempt by design, and loads its own summary: three row counts plus the already-derived `charts` series, never row arrays. `ManageDashboard` stops receiving `ManagePortalPayload`.
- Route navigation removes the `?view=` parameter and the `history.replaceState` tab sync, so a `/manage?view=<x>` request must redirect to `/manage/<x>` rather than 404. Existing staff bookmarks must keep working. The redirect is permanent, fires before any data load, and **must carry `?mode=` through** — dropping it would silently promote a Preacher following a shared bookmark into admin scope.
- The admin/preacher scope toggle stays a real server-affecting navigation, carried as `?mode=` on every table route.
- Delivered incrementally and autonomously: the grid plus the contacts refactor lands first, and no story pauses for human review. The mitigation for unreviewed replication across four tables is a **written pattern contract**, not a human gate — the contacts story lands `docs/manage-grid-pattern.md` recording the agreed column, editing, selection, and state conventions, and every later port follows that document. An agent cannot inherit tacit agreement across sessions; it can only inherit a written one.
- Every story self-verifies before reporting done: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `scripts/verify-monorepo-guardrails.mjs`, and `scripts/verify-airtable-removal.mjs` all pass, and the story's own capabilities are demonstrable. A story that cannot make its capabilities demonstrable is not done and must say so rather than claim completion.
- `scripts/verify-monorepo-guardrails.mjs` and `scripts/verify-airtable-removal.mjs` must both still pass.

## Non-goals

- Airtable parity beyond the capabilities above: linked-record cells, formula fields, grouped or collapsed rows, saved views, CSV export, and undo/redo history are out of scope. Staff use this to manage contacts, not to model a relational database.
- No real-time collaborative editing, presence, or multi-user conflict resolution. This is a single-operator tool.
- No offline editing, background sync queue, or local persistence of grid edits. `lib/offline-sync.ts` exists but wiring it to the grid is a separate concern.
- No change to the Supabase schema, RLS policies, or the existing API route surface. This work is presentation and navigation only.

## Success signal

An operator opens `/manage/contacts` with the full scoped contact set, scrolls the whole table without jank, sorts by last-contacted, filters to one location, edits a phone number inline, and reloads to find the change and the arrangement intact. They paste that URL into a colleague's browser and it opens the same table in the same scope. Opening `/manage/sessions` at the same moment is immediate, because it never fetched the contacts. Meanwhile a Preacher moving between tables never lands in admin scope.

## Assumptions

- `@tanstack/react-table` and `@tanstack/react-virtual` are React 19 compatible. **Verified** 2026-10-07 against the published peer ranges: `@tanstack/react-table` declares `react: ">=18"`, `@tanstack/react-virtual@3.14.13` declares `react: "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"`. The blocking risk named at authoring time does not exist.
- Real contact volume is assumed to exceed a few hundred rows, which is what makes virtualization and TanStack Table necessary over the current approach. Exact production counts were not provided. **Actual scoped row counts for all four tables are measured in the final story** and reported — that measurement is what validates the client-side pagination decision and its trigger thresholds.
- Both `apps/folk` and `apps/gita-life` expose `/manage` and must keep working. Their `manage/page.tsx` files are byte-identical today.
- ~~The dashboard overview is assumed to render from a narrower payload~~ — **no longer an assumption.** Confirmed by reading `manage-dashboard.tsx`: the overview renders from counts and pre-derived chart series. See Resolved questions.

## Resolved questions

All five questions raised at authoring time are now closed. Rationale and evidence live in `data-loading-decision.md` and `navigation-decision.md`; the binding outcomes are restated here.

- **`?view=` producers:** closed. Nothing outside `/manage` links to a `?view=` URL — the only producer in the repo is `manage-portal.tsx:23`. Unenumerable browser bookmarks are not a reason to keep the parameter; they are exactly what the redirect in the Constraints section exists to absorb.
- **Dashboard payload:** closed. `ManageDashboard` does **not** need `ManagePortalPayload`. Verified against `manage-dashboard.tsx`: it touches rows only through three integers — `contacts.length` (line 270), `sessions.length` (line 271), and a sum of `session.attendees.length` (line 265) — plus the pre-derived `charts` object. It reads no other row field.
- **Pagination:** closed. Client-side virtualization over the full scoped row set, with sort/filter/column state in the URL. Server-side pagination is deferred behind a stated numeric trigger; see the companion.
- **Bulk actions:** closed. CAP-4 ships in the first slice. Its batch semantics are settled once on the contacts table and recorded in `docs/manage-grid-pattern.md`, which later ports follow.
- **`resolveManageMode` fail-open:** closed as **intentional**. Its safety does not depend on the coercion being strict: RLS is the enforcement point and app-layer narrowing can only shrink the set (`manage.ts:520`), so a malformed link cannot expose rows outside the caller's RLS scope.

## Decisions this spec now rests on

- **`/manage` stays an aggregate view and is exempt from CAP-7.** It keeps a cross-table load, but ships aggregates rather than rows: three counts plus the already-derived `charts` series. The server still reads rows to build the series; the client stops receiving them.
- **The redirect must preserve `?mode=`.** `/manage?view=<x>&mode=preacher` redirects to `/manage/<x>?mode=preacher`. A redirect that drops the query would fail CAP-10 in the one case where it is hardest to notice — a shared bookmark.
- **Grid state lives in the URL.** Sort, filters, column order, visibility, and size are URL state, which is what makes CAP-2/CAP-3 persistence free and makes a later move to server-side row models a data-source swap rather than a rewrite.