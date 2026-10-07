# RLS Policy Matrix

Role-by-entity visibility contract for CAP-3. Scoping semantics are lifted from the current application-layer checks in `lib/authz.ts`, `apps/folk/app/attendance/route.ts`, and `apps/folk/app/api/sessions/route.ts` — RLS must reproduce them at the database, not invent new ones.

## Roles

`Admin`, `Preacher`, `Volunteer`, `Assistant` — resolved server-side from the `public.users` table (all roles), keyed by the Supabase Auth user.

## Read scope (authenticated role)

| Table | Admin | Preacher | Volunteer | Assistant |
| --- | --- | --- | --- | --- |
| `sessions` | All rows in program | Sessions they created (`created_by`) or lead (`preacher_id`) | No session access (no route grants it today) | Sessions they created; sessions of their assigned preacher, whether created or led by them (dashboard read) |
| `attendance` | All rows in program | Attendance of sessions where they are the preacher | No attendance dashboard access today | Attendance of their assigned preacher's sessions |
| `contacts` | All rows in program | Contacts assigned to them (`assigned_preacher_id` = their `users` row) | No contact-list read (collection is write-only via server routes, as today) | Contacts whose `assigned_preacher_id` is their assigned preacher |
| `locations` | All rows in program | Only locations in their own `location_ids` | Only their assigned preacher's `location_ids` | Only their assigned preacher's `location_ids` |
| `users` | All rows in program | Own row only | Own row only | Own row only |

`users` note (assumed 2026-10-06): picker lists (preachers, locations) stay server-mediated via the service role, as today, so non-admin roles need no cross-row `users` reads.

## Write scope

| Table | Policy |
| --- | --- |
| All four | No direct authenticated writes. All mutations go through server routes with the service-role key, which bypasses RLS. Authenticated INSERT/UPDATE/DELETE policies are not granted. |

## Program scoping

Every policy is additionally constrained by `program_id`: a folk staff JWT must never resolve rows for gita-life and vice versa. The `public.users` row binds auth user → program → role, and policies resolve scope through it.

## Decided scoping notes

- Contacts scope key is **`assigned_preacher_id`** (decided 2026-10-05): Preacher → contacts assigned to them; Assistant → contacts of their assigned preacher; Admin → all in program; Volunteer → no list read. `collected_by_id` is retained as data (audit/routing) but is not an RLS scope key.
- Locations are **per-user scoped** (verified in `sessions/page.tsx` and `contact/page.tsx`, 2026-10-05): each `users` row carries `location_ids`; a Preacher sees only their own, a Volunteer/Assistant sees their assigned preacher's (empty set when no active assigned preacher), an Admin sees all in the program. The contact flow additionally hides `Inactive` locations. The SELECT policy shape is therefore: `program_id` matches **and** (caller is Admin **or** `locations.id = ANY(effective_location_ids)`), where effective ids resolve through the assigned preacher for Volunteer/Assistant.

## Known deltas from today

- The coarse policies in `20261004000000_create_core_tables.sql` (`authenticated USING (true)` reads) are a placeholder and must be replaced by the scoped policies above.
- Session scoping moved from role+location to **creator** in commit `88a608a`; RLS follows creator scoping for sessions.
- **Sessions are also preacher-scoped (2026-10-07, `20261007120000_scope_sessions_by_preacher.sql`).** Creator-only scoping hid a preacher's own sessions whenever another account created them — in production all 107 of Dharmistha Yudhisthira Dasa's sessions were created by Sudama Vipra Dasa, so his `/manage` portal showed zero sessions while his contacts and attendance rendered. `attendance` was already scoped by the parent session's `preacher_id`, so the same session was readable from the attendance side and unreadable from the sessions side; the two now agree.
- `locations` writes are Admin-only via the server route; reads are per-user scoped as above.
- **Admin dual mode (manage portal, CAP-9):** an Admin's RLS scope is program-wide; the interface's "admin mode" (all preachers) vs "preacher mode" (own data) distinction is an app-layer filter on top of that scope — no separate RLS policy.
- Public, unauthenticated attendance marking (CAP-5) does not go through RLS — it is a server-route insert with the service role.
