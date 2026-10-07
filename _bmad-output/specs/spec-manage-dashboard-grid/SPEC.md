---
id: SPEC-manage-dashboard-grid
companions:
  - brownfield.md
  - capability-tiers.md
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
- All data access flows through `lib/supabase/manage.ts` and `lib/manage/api-handlers.ts`. Components never call Supabase directly.
- RLS is the sole authorization enforcement point. A client may render a disabled affordance for a field the operator cannot write, but must not re-implement authorization logic.
- `manage-contacts-table.tsx` is refactored onto the new grid and its hand-rolled sort and filter removed. A parallel second table implementation is forbidden: two grids means two sets of bugs and a permanent migration tax.
- `/manage` remains the dashboard overview; `contacts`, `sessions`, `attendance`, and `favorites` each get their own route.
- Route navigation removes the `?view=` parameter and the `history.replaceState` tab sync, so a `/manage?view=<x>` request must redirect to `/manage/<x>` rather than 404. Existing staff bookmarks must keep working.
- The admin/preacher scope toggle stays a real server-affecting navigation, carried as `?mode=` on every table route.
- Delivered incrementally: the grid plus the contacts refactor lands first and pauses for human review before a second table is built on the pattern.
- `scripts/verify-monorepo-guardrails.mjs` and `scripts/verify-airtable-removal.mjs` must both still pass.

## Non-goals

- Airtable parity beyond the capabilities above: linked-record cells, formula fields, grouped or collapsed rows, saved views, CSV export, and undo/redo history are out of scope. Staff use this to manage contacts, not to model a relational database.
- No real-time collaborative editing, presence, or multi-user conflict resolution. This is a single-operator tool.
- No offline editing, background sync queue, or local persistence of grid edits. `lib/offline-sync.ts` exists but wiring it to the grid is a separate concern.
- No change to the Supabase schema, RLS policies, or the existing API route surface. This work is presentation and navigation only.

## Success signal

An operator opens `/manage/contacts` with the full scoped contact set, scrolls the whole table without jank, sorts by last-contacted, filters to one location, edits a phone number inline, and reloads to find the change and the arrangement intact. They paste that URL into a colleague's browser and it opens the same table in the same scope. Opening `/manage/sessions` at the same moment is immediate, because it never fetched the contacts. Meanwhile a Preacher moving between tables never lands in admin scope.

## Assumptions

- `@tanstack/react-table` v8 and `@tanstack/react-virtual` are assumed React 19 compatible. **Not verified** at authoring time; if the peer range excludes React 19, this becomes a blocking decision.
- Real contact volume is assumed to exceed a few hundred rows, which is what makes virtualization and TanStack Table necessary over the current approach. Exact production counts were not provided.
- Both `apps/folk` and `apps/gita-life` expose `/manage` and must keep working. Their `manage/page.tsx` files are byte-identical today.
- The dashboard overview is assumed to render from a narrower payload once tables load their own data. If it genuinely needs rows from every table, CAP-7 does not apply to `/manage` itself.

## Open Questions

- Does anything outside `/manage` link to a `?view=` URL? A repo-wide grep found only `manage-portal.tsx:23` producing one, so a redirect is probably sufficient — but bookmarks living in staff browsers cannot be enumerated from the repo.
- Must `ManageDashboard` keep receiving the full `ManagePortalPayload`? If its charts need rows from every table, the dashboard keeps its own aggregate load and CAP-7 applies only to the four table routes.
- Is server-side pagination in scope, or is client-side virtualization over the full scoped row set acceptable? This decides whether CAP-7 means one query per table or a paginated query, and materially changes the data-access work.
- Should bulk actions (CAP-4) ship in the first slice or wait for the contacts pattern to be reviewed? Bulk edit implies new batch semantics in `lib/manage/api-handlers.ts`.
- Is `resolveManageMode`'s coercion of anything that is not literally `"preacher"` into `"admin"` (`manage-types.ts:190-192`) intended? It is fail-open toward the wider scope, which is more dangerous once a malformed link lands on a new route.