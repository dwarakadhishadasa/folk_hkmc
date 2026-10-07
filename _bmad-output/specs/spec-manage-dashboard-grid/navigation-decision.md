# Navigation: from tab switcher to routes

Records the decision behind CAP-6, CAP-7, and CAP-10, including the arguments that were weighed and rejected, so a downstream agent does not relitigate them.

## Decision

`/manage` becomes **route-per-table**. Not one page with a table switcher.

## What exists now

`components/manage/manage-portal.tsx` already runs two different navigation mechanisms side by side:

- Tab switches: `useState` plus `window.history.replaceState`. Client-only, because which table is open does not change what the server reads.
- Scope switch: a real `<Link>` navigation, because `mode` changes the server query.

The comment at lines 26-33 documents exactly this split. Route-per-table collapses it: every view becomes a URL the server reads, and there is one mechanism instead of two.

## Target route shape

```
/manage                  -> the dashboard overview (a redirect target / default view)
/manage/contacts
/manage/sessions
/manage/attendance
/manage/favorites
?mode=admin|preacher     -> carried on every table route
```

The dashboard stays a distinct non-table view at `/manage`. It is an overview, not a grid, and giving it a route keeps the other four uniform.

## Why per-table data loading matters

`loadManagePortalData` currently returns `contacts`, `sessions`, `attendance`, `charts`, `locations`, `staffNames`, and `booksReadOptions` in a single payload. Opening the sessions view downloads the entire contact table. On a large dataset that is the difference between an instant tab switch and a visible wait, and it grows with the data.

Airtable users switch between tables constantly. Loading per table is not an optimization; it is the reason the tool feels responsive.

**How far the split goes is settled in `data-loading-decision.md` §2–§3.** The four table routes load only their own rows. `/manage` stays an aggregate view and is exempt from CAP-7, but ships counts and pre-derived chart series instead of row arrays. Rows stay virtualized client-side, with grid state in the URL and a numeric trigger for revisiting server-side pagination.

## The costs, stated plainly

1. **Scope must be threaded through every link.** `?mode=` is orthogonal to the table, so every `<Link>` in the portal carries it. Miss one and a Preacher clicking it silently lands in admin scope. This is the main regression risk of the change and the reason CAP-10 is a first-class capability.
2. **`?view=` disappears.** Anything depending on it must move. A repo-wide grep found only one producer (`manage-portal.tsx:23`), so the code cost is trivial, and staff bookmarks cannot be enumerated from the repo — which is what the redirect is for, since an origin-agnostic redirect absorbs every bookmark without needing to know what they are. A permanent `/manage?view=<x>` → `/manage/<x>` redirect keeps them working. **It must carry `?mode=` through**; see `data-loading-decision.md` §1.
3. **`history.replaceState` tab sync is gone.** Back/forward behave as real navigation, which is more correct but means more state to think about: whether a filter or sort should live in the URL, in component state, or in both.

## Rejected alternative

**Keep the switcher, add the grid.** Fewer moving parts and no migration of navigation. Rejected because it preserves the eager-payload problem (CAP-7), keeps deep links second-class, and leaves two navigation mechanisms in the codebase indefinitely. The route change is where the payload split and deep linking both fall out for free.

## Migration notes

- `ManageView` and `MANAGE_VIEWS` (`manage-types.ts:13-21`) become the route segment validator rather than a query-param validator. `isManageView` is the natural fit.
- `ManagePortal` becomes a layout that resolves staff context, renders the nav and scope toggle, and yields to the active table's data load — rather than owning a `TabsContent` tree.
- Both `apps/folk/app/manage/page.tsx` and `apps/gita-life/app/manage/page.tsx` are byte-identical today. They should stay identical after the change; a divergence is a bug.
- `resolveManageMode`'s coercion of anything that is not literally `"preacher"` into `"admin"` (`manage-types.ts:190-192`) is fail-open toward the wider scope. **Confirmed intentional** (user, 2026-10-07) and left unchanged. It is safe because RLS is the enforcement point and app-layer narrowing can only shrink the set (`manage.ts:520`), so a malformed link cannot expose rows outside the caller's RLS scope. The one place it could bite is the `?view=` redirect above, which is why the redirect preserves `?mode=`. Full reasoning in `data-loading-decision.md` §5.