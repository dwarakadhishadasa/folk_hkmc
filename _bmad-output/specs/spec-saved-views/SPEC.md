---
id: SPEC-saved-views
companions:
  - evidence.md
  - implementation.md
  - evidence/requests.json
sources:
  - https://airtable.com (observed live; see evidence.md for target, date and method)
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete contract for what was built and how it is verified. `evidence.md` is the runtime observation of the source product; `implementation.md` is the as-built record of this repository's equivalent.

# Saved views on the contacts grid

## Why

The contacts grid has always had one arrangement: a sort, a filter tree, a set of hidden fields, a column order, widths and a row height, all encoded in the URL. An operator who wants a second cut of the same table has to rebuild it and keep a long link, and two people cannot hold two different arrangements of the table at once. The source product solves this with named views. This adds them: a saved view is a named grid configuration owned by a person, switchable in one click, stored by the server so it follows the account to any machine.

## Capabilities

- **CAP-1 — Create a Grid view**
  - **intent:** An operator can create a new view from the grid, and the only view type offered today is Grid.
  - **success:** `New view` opens a type menu with exactly one option; choosing it opens a dialog with a name (pre-filled `Grid <n>`) and a `Who can edit` choice; confirming creates the view and switches to it; the new view starts as a copy of the arrangement on screen.

- **CAP-2 — Each view owns its configuration**
  - **intent:** Sort, filter tree, search text, hidden fields, column order, column widths and row height are stored per view and restored when that view is opened.
  - **success:** Changing any of those in view A and switching to B and back leaves A as it was; the same holds across a reload; hidden fields, filters and sort each survive independently.

- **CAP-3 — Edits save themselves, to the right view**
  - **intent:** There is no Save control; every edit is written to the view that was selected when the edit was made.
  - **success:** An edit followed immediately by a switch is still saved to the view it was made in; arriving at a view or opening a shared link never writes to it; leaving the surface flushes a queued write.

- **CAP-4 — Personal and collaborative views**
  - **intent:** A view belongs to a person by default; a shared view is a deliberate choice at creation.
  - **success:** A personal view is invisible to other users in the programme and cannot be renamed or deleted by them; a collaborative view is visible and editable by every operational role; two people may each hold a view with the same name.

- **CAP-5 — The last view follows the account**
  - **intent:** Returning to the bare grid reopens the view this person last used, on any machine.
  - **success:** After opening a view, a different browser context signed in as the same person and pointed at `/contacts/grid` lands on that view; the preference is stored server-side, never in browser storage.

- **CAP-6 — Sharing a view**
  - **intent:** A view can be shared as a link that opens with its arrangement.
  - **success:** Copying the link and opening it elsewhere opens the same view with the same arrangement; a link that also carries grid parameters (`f.*`, `sort`, `hide`, …) honours those parameters once, rather than overwriting them with the stored view.

- **CAP-7 — Lifecycle**
  - **intent:** A view can be renamed, duplicated and deleted by someone entitled to change it.
  - **success:** Rename updates the switcher and the shared link; duplicate produces `<name> copy` with the current arrangement; delete asks for confirmation, removes the view for everyone who could see it, and leaves the contacts untouched.

- **CAP-8 — Desktop only**
  - **intent:** Views are a desktop affordance; the phone surface is unchanged by them.
  - **success:** The phone layout renders no views bar and no grid; the contact list keeps its pre-views behaviour.

- **CAP-9 — Degrade, do not fail**
  - **intent:** Stale or foreign configuration can never take the grid down.
  - **success:** A stored condition naming a column that no longer exists is dropped; a stored `view` id that no longer exists leaves the grid on the URL's arrangement; an unreadable preference costs only the remembered view.

## Constraints

- The URL remains the single source of truth for what the grid shows. A saved view is written into it; selecting one replaces every grid-owned key rather than merging.
- `applyGridParams` keeps non-grid keys; the selected view id is re-applied to every grid write, so an edit made during the navigation to a view cannot drop it.
- Only Grid exists. `contact_views.view_type` is check-constrained; a second type is a migration plus a renderer, not a client-supplied string.
- Names are unique per `(program_id, owner_user_id)`, case-insensitively; a null owner (rows that predate ownership) reads as shared.
- Reads go through the caller's session (RLS scopes programme and visibility); writes go through `/api/manage/views*` after `getStaffContext()` and `requireRole()`, using the service role.
- View configuration lives in one JSONB column serialized by `components/grid/grid-view-config.ts`, which delegates to the existing URL codec so a saved view and a shared link cannot disagree about `hide` or filter keys.
- `hide` is a complete set: a view hiding nothing stores `[]` and serializes `hide=`; a view hiding exactly the contacts defaults writes no key.
- Row height is not a URL key; it travels in the view configuration and is applied on selection.
- Manual row order (`contacts.sort_order`) stays on the contact and remains shared across views.
- No browser storage carries view state or preferences.
- The views bar is rendered only when the surface supplies views and the device is desktop.

## Non-goals

- Any view type other than Grid (Form, Calendar, Gallery, Kanban, Timeline, List, Gantt, Section).
- Per-view row order, grouping, colour or conditional formatting.
- A views sidebar, view sections, or drag-reordering the view list.
- Locked views and per-field permissions.
- Real-time collaboration on one view, or conflict resolution between two editors.
- Mobile views.
- Importing or migrating views from the source product.

## Success signal

- An operator creates a Grid view, changes its filter, sort and hidden fields, switches away and back, reloads, and finds it unchanged. A colleague signing in sees their own views plus any collaborative one, and nothing of the first operator's personal view. A second machine signed in as the first operator reopens the view that was last used. `pnpm typecheck:workspace`, `pnpm guardrails`, `pnpm test:unit` and `pnpm test:e2e views-` pass.

## Assumptions

- `public.users.id` equals the auth user id (the `DW-3` invariant the readiness gate checks), so `owner_user_id = auth.uid()` is a valid RLS predicate.
- The contacts grid is the only surface that offers views today, and `ManageContactsTable` is its only consumer.
- Autosave is fast enough at 800 ms that an operator sees "All changes saved" before moving on; a slower network defers the write, not the edit.
- A programme's operational roles are the right audience for a collaborative view.

## Open Questions

- Should a collaborative view record who changed its configuration, and should that be undoable?
- Should row order become per view once views are the primary way the table is read?
- When a second view type arrives, does it share this configuration shape or carry its own?
