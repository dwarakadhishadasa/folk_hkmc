# Data loading: dashboard aggregates, client-side rows, and the pagination trigger

Companion to CAP-7. Records how `/manage` splits its payload now, why the split stops where it does, and the measurable condition under which it must be redone. A downstream agent should not relitigate these; they should implement them and watch the trigger.

## 1. `?view=` producers — closed

**Question.** Does anything outside `/manage` link to or bookmark a `?view=` URL?

**Finding.** A repo-wide search for `view=` returns one producer in application code: `components/manage/manage-portal.tsx:23`. Every other hit is a spec or story document describing the parameter, not a link to it. `?view=` is read in exactly two places, `apps/folk/app/manage/page.tsx` and `apps/gita-life/app/manage/page.tsx` (lines 28–33), both of which are being rewritten anyway.

**Decision.** Implement the `/manage?view=<x>` → `/manage/<x>` redirect from the Constraints section and treat the question as closed.

**Why the unenumerable-bookmark worry does not change the answer.** The worry was that links might exist somewhere the repo cannot see, so a redirect might be insufficient. That reasoning inverts: unenumerable bookmarks are precisely the population a redirect is designed to absorb, and it absorbs all of them without needing to know what they are. Enumeration would only matter if the answer required distinguishing bookmark *origins*. It does not. Origin-agnostic redirect is the standard migration mechanism for a retired URL shape.

**Two details that are easy to get wrong:**

- **Preserve `?mode=`.** `/manage?view=contacts&mode=preacher` must land on `/manage/contacts?mode=preacher`. Dropping the query on redirect would silently promote a Preacher following a shared bookmark into admin scope — the exact CAP-10 failure the mode parameter exists to prevent, arriving through the one path nobody tests.
- **Redirect before rendering, and use a permanent status.** `permanentRedirect()` (308) from the server component is correct: it is cacheable, it fires before any data load, and it holds for a GET-only legacy shape. Validate `view` through `isManageView` as today; an unrecognized or absent `view` goes to `/manage`.

## 2. The dashboard does not need the row payload — closed

**Question.** Must `ManageDashboard` keep receiving the full `ManagePortalPayload`?

**Finding.** No. `components/manage/manage-dashboard.tsx` reads rows in exactly three places, all of them reductions to a count:

| Line | Expression | Yields |
|---|---|---|
| 270 | `contacts.length` | "Total Contacts" tile |
| 271 | `sessions.length` | "Sessions" tile |
| 265 | `sessions.reduce((sum, s) => sum + s.attendees.length, 0)` | "Attendance records" tile |

Everything else the component renders comes from `charts` (`manage-dashboard.tsx:252`), which is already a small derived structure: `contactsPerQuarter`, `statusQuo`, `sessionsByPreacherLocation`, `attendanceByPreacherLocation`. The charts, the three tiles, and the period selectors read no other row field. No component below the dashboard is rendered by it, so nothing else pulls rows in behind it.

**Decision.** Split the loader. The four table routes load their own rows; `/manage` loads aggregates.

- New shape for the overview: `{ scope, generatedAt, charts, totals: { contacts, sessions, attendanceRecords } }`.
- `ManageDashboard` takes that summary instead of `ManagePortalPayload`. Its three tiles read `totals.*`; its charts read `charts`.
- CAP-7 therefore binds the four table routes. `/manage` is an aggregate view and is explicitly exempt.

**The honest part of this decision.** The server still reads every contact, session, and attendance row to *build* the chart series — `lib/supabase/manage.ts:694-706` derives all four from the full scoped sets. Nothing about this makes the dashboard query cheap, and no schema change is permitted to fix that (aggregating in Postgres is out of scope per the Non-goals). What changes is what crosses the network boundary: the overview stops shipping O(rows) and ships O(series). The dashboard's own page load gets materially faster; its server-side cost does not. If the dashboard query ever becomes the bottleneck, the fix is a Postgres view or RPC, which is a separate story with its own schema decision.

## 3. Client-side virtualization now; server-side pagination behind a trigger — closed

**Question.** Is server-side pagination in scope, or is client-side virtualization over the full scoped row set acceptable?

**Decision.** Client-side virtualization over the full scoped row set. TanStack Table's client row models (`getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`) stay enabled and the `manual*` flags stay `false`.

**Why this is the right default at this scale.**

- **The set is already fully materialized server-side.** `loadManagePortalData` does not cap anything. `collectPagedRows` (`lib/supabase/manage.ts:200-218`) pages at `MANAGE_PAGE_SIZE = 1000` and keeps appending until a short page comes back, so it returns the complete scoped row set every time. Server-side pagination would be a *new* capability to build, not a removal of an existing one — and it would not make the server read less, because the series-building work still needs every row.
- **The grid's required behaviors are free client-side and expensive over the wire.** CAP-3 requires free-text search across *every* column simultaneously; no indexed server query does that without a text-search extension, which is a schema change and therefore a non-goal. CAP-2 requires multi-column sort with an arrangement that survives reload. Each of those becomes a round trip, a loading state, and a scroll-position-preservation problem under server-side row models.
- **CAP-5 and CAP-4 both fight server pagination.** Inline editing a cell that may not be in the current page, and selecting "all filtered rows" across page boundaries, are considerably harder to get right when the row set is paged.
- **It is the conventional choice for this class of tool.** An internal operator grid scoped to one program by RLS is the canonical case for client-side row models. Server-side pagination earns its cost at tens of thousands of rows, not hundreds.

**What virtualization does and does not buy.** Row virtualization bounds the **DOM**, not the **transfer**. A 5,000-row table can scroll smoothly while still shipping several megabytes of RSC payload. The two costs are independent and both are addressed: virtualization handles render cost (CAP-1), and per-table loading plus the aggregate-only dashboard handle transfer cost (CAP-7). A plan that only did the first would still be slow to first paint.

**Design so the migration stays cheap.** Sort, filters, column order, visibility, and size all live in the **URL**. This is what makes CAP-2 and CAP-3 persistence free, and it is also the thing that defers the cost of a future server-side pivot: when the trigger fires, the URL contract is already the request contract, and the change is a data-source swap behind TanStack's `manualPagination` / `manualSorting` / `manualFiltering` flags rather than a component rewrite. Do not hold grid state in component state "for now" — that is the decision that would make the migration expensive.

**Migration trigger — any one of these, measured on the seeded program:**

| Signal | Threshold |
|---|---|
| Scoped rows in any single table | > 10,000 |
| Serialized per-table payload | > 1 MB gzipped |
| Sort/filter keystroke latency on target hardware | > 100 ms |
| Server time for one table route | > 2 s |

When any fires, that table moves to server-side row models with Supabase `.range()` paging (200/page, infinite scroll), server-side `order()`, and indexed column filters. Judge per table, not portal-wide: `contacts` and `sessions` have very different growth curves, and `favorites` is a filtered subset of contacts and may never trip.

**Measure it in the final story.** The row-count assumption at authoring time was "a few hundred," unverified. Recording actual scoped row counts for all four tables is a deliverable of the verification story, and that measurement is what turns this trigger from a guess into a fact. If a threshold trips, the correct response is to report it, not to build server-side pagination inside a verification story — server-side paging is out of scope for this spec.

## 4. Bulk actions ship in slice one

**Decision.** CAP-4 is in the first slice, alongside the grid primitives and the contacts refactor.

Row selection is a grid primitive — the selection column, header checkbox, and range highlight all belong to the grid's own column model. Deferring selection would mean building the grid twice or retrofitting selection into three of its four surfaces. The bulk *action* is the part that reaches `lib/manage/api-handlers.ts`, and that is what the contacts story is for: batch semantics get settled once, on real code, and written into `docs/manage-grid-pattern.md` before three more tables copy them.

## 5. `resolveManageMode` fail-open is intentional

**Decision.** Keep the coercion of anything that is not literally `"preacher"` into `"admin"` (`manage-types.ts:190-192`). Do not tighten it as part of this work.

The authoring-time worry was that fail-open is more dangerous once a malformed link lands on a new route. It is worth being precise about how much danger that is, because the answer is bounded by the architecture rather than by the coercion:

- **RLS is the enforcement point**, not this function. `mode` selects between two *narrowings* of an already-RLS-scoped set.
- **App-layer narrowing can only shrink.** `manage.ts:520` states it directly: "App-layer narrowing on top of the RLS scope. It can only shrink the set."
- Therefore a malformed `mode` cannot surface a row the caller could not already read. The worst case is an Admin seeing the wider admin scope they are entitled to anyway, or a Preacher seeing the RLS-bounded set that their preacher-mode filter would have narrowed further.

The genuine residual risk is a Preacher seeing *more of their own legitimately-scoped rows* than the preacher filter would have shown — a UX surprise, not a data leak. That is a product decision, and it has been made.

**Do not let the redirect route reintroduce the question.** The one place this could actually matter is the `?view=` redirect from section 1: dropping `?mode=` there would turn a Preacher's bookmarked link into an admin-scope request. Preserving the parameter is what makes the fail-open behavior harmless in the new navigation model.
