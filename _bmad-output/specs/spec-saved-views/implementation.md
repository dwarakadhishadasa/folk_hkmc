# Saved views — implementation

The contacts grid gained named, saved views modelled on the Airtable feature
observed in `evidence.md`. This document is the as-built record: what exists,
where it lives, and what was deliberately left out.

## What a view is

A view is a named `GridViewConfig` that belongs to a person:

| Field | Meaning |
|---|---|
| `sorting` | ordered `{id, desc}` list; first entry is the primary sort |
| `globalFilter` | the toolbar search text |
| `filter` | the filter tree in Airtable's `{conjunction, filterSet}` shape, or `null` |
| `columnOrder` | complete display order |
| `hiddenColumnIds` | complete hidden set (empty means "nothing hidden") |
| `columnSizing` | column id → committed pixel width |
| `density` | `default` \| `dense` — the per-view row height |

Two people can each keep a view called "Grid 2". A view is `personal` by
default — visible and editable by its owner alone — or `collaborative`, which is
visible to every operational role in the programme and editable by them. The
choice is made at creation, mirroring the source product's "Who can edit" step.
A null owner exists only on rows created before ownership; those read as shared.

**The last view opened is stored per account, on the server**, so signing in from
another machine resumes the same view. This is the same fact the source product
records with `view/{id}/setAsLastUsed`.

Views are a **desktop** surface. The phone layout does not render the bar, and
the phone list keeps its pre-views behaviour (URL filter and search; no ordering
by a view's sort).

## Surfaces

| Surface | Route |
|---|---|
| Contacts grid | `/contacts/grid?view=<uuid>` (FOLK and Gita Life) |
| Views API | `/api/manage/views`, `/api/manage/views/{viewId}`, `/api/manage/views/{viewId}/use` |
| Tables | `public.contact_views`, `public.staff_view_preferences` |

The view id is a query parameter rather than a path segment. The grid's entire
arrangement already travels in the query string (`sort`, `f.*`, `fg`, `hide`,
`cols`, `size.*`), and `applyGridParams` is the one function that rewrites it; a
path segment would have added a second router to the same state. Route mapping
to the source product:

```
airtable.com/app{base}/{table}/{viewId}   →   /contacts/grid?view={viewId}
```

## Reading and writing state

The URL stays the single source of truth for what the grid is showing.

1. **Selecting a view replaces every grid-owned key** with that view's, via
   `gridViewConfigToParams` + `applyGridParams`. It is not a merge, or the sort
   of the view you left would survive into the one you opened.
2. **Landing on a link that carries grid keys**
   (`?view=…&f.status=contains:Invited`) honours the link once; the view is not
   re-applied over it.
3. **Edits save themselves.** Each edit handler — sort, filter, hide, column
   order, width, search, row height, clear-filters — records the configuration it
   produced and queues it for the active view, 800 ms later. The configuration is
   captured **at edit time**, not derived later from the URL: both
   `useSearchParams` and `window.location` lag `router.push` by a server round
   trip, so a switch made immediately after an edit would otherwise save the
   pre-edit arrangement.
4. **Leaving a view flushes its queued write first**, and so does unmounting the
   surface. An edit followed by a quick switch is still an edit.
5. **Arriving never writes.** Hydration and shared links only read.
6. **Row height is not a URL key** (that contract predates this feature), so
   density travels in the saved config and is applied on selection.
7. **The view id is sticky through grid writes.** `useGridViewState` takes a
   `stickyParams` map (the selected view id) and re-applies it to every URL it
   writes, so an edit made during the navigation to a view cannot drop the
   selection.

## Create, rename, duplicate, delete

`New view` opens a one-entry type menu (`Grid`) and then a dialog with the name
and **Who can edit** (`Personal`, the default, or `Collaborative`). The type list
is `CONTACT_VIEW_TYPES` in `components/manage/manage-view-types.ts`; adding a
type is an entry there, a renderer, and a migration of the `view_type` check
constraint — not a second menu built at the call site.

A new view starts as a copy of the arrangement on screen, which is what the
source product does (`copyFromViewId`). `Duplicate` copies the configuration and
names the copy `<name> copy`; the server resolves name collisions per owner.

`Delete` is confirmed in an `AlertDialog` and then calls `DELETE`. This is the
one deliberate behaviour difference: the observed product deletes immediately.

Rename and delete are disabled for a personal view you do not own. The server
enforces the same rule; the disabled item is there so the menu says so before a
request is made.

## Files

| File | Role |
|---|---|
| `supabase/migrations/20261105140000_contact_views.sql` | table, position index, RLS read policy, service-role writes |
| `supabase/migrations/20261105150000_contact_views_per_user.sql` | owner, visibility, per-owner unique names, read policy |
| `supabase/migrations/20261105160000_staff_view_preferences.sql` | the per-account "last view" record |
| `components/grid/grid-view-config.ts` | storage codec: config ↔ query string, defensive normalisation, config identity |
| `components/grid/grid-view-config.test.ts` | 10 unit tests over the codec |
| `components/manage/manage-view-types.ts` | client-safe view shapes, visibility, ownership rule, name suggestion |
| `components/manage/manage-view-types.test.ts` | 6 unit tests over ownership and visibility |
| `components/manage/manage-views-client.ts` | API calls, "remember this view" |
| `components/manage/manage-views-bar.tsx` | the band above the toolbar: switcher, create, view menu, save state |
| `components/manage/manage-contacts-table.tsx` | hydration, edit-time autosave, create/rename/duplicate/delete |
| `lib/supabase/contact-views.ts` | reads via the caller's session, writes via the service role, ownership |
| `lib/manage/view-handlers.ts` | role gates, validation, HTTP shape |
| `apps/*/app/api/manage/views/**` | route files (both apps) |
| `e2e/specs/views-contact-grid.spec.ts` | eight browser tests against the real stack |

## Behaviour inherited from the existing grid

- View state is still the URL, so Back/Forward and a shared link behave as
  before.
- `hide` remains a complete set: a view that hides nothing stores `[]` and
  serializes `hide=`, and a view whose hidden set equals the contacts defaults
  writes no key at all.
- Manual row order (`contacts.sort_order`) is global and unchanged. A view can
  add its own sort; it cannot reorder rows differently from another view. The
  source product stores row order per view — a known deviation, forced by the
  order living on the contact row.
- The grid no longer forwards TanStack's page-index resets as state changes.
  They carried a stale snapshot of the controlled fields, which a URL-writing
  consumer would write back, and the two would ping-pong.

## Verification

Run on 2026-11-05, local Supabase (`supabase_db_folk_hkmc`), one e2e runner.

| Command | Result |
|---|---|
| `pnpm typecheck:workspace` | pass (4 packages, 2 apps) |
| `pnpm guardrails` | pass — "Monorepo guardrails passed." |
| `pnpm test:unit` | pass — turbo 2/2 tasks, vitest 20 files / 174 tests |
| `pnpm test:e2e views-` | pass — 12 tests (4 auth setups + 8 views specs), 1 worker, 1.4 min |

The e2e specs cover: the create menu offers exactly one option (`Grid`); a view
keeps its own hidden fields across a switch and a reload; each view keeps its own
filter and it survives a reload; an edit made just before a switch is kept; a
personal view is invisible to another user while a collaborative one is shared;
the last view follows the account into a fresh browser context; rename,
duplicate and delete; and the views bar is absent on a phone while the contact
list renders.

The migrations were applied to the local database with `psql` before the runs;
`schema_migrations` was stamped so the CLI agrees.

Not verified: the migrations against a hosted project; concurrent autosave from
two browsers; a collaborative view edited by two people at once.
