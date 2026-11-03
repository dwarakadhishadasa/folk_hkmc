# Reality review v2 — Staff scope spine and the Admin-Assistants decision

Reviewer role: second-pass reality/version checker (independent of the author of
the spine).
Date: 2026-11-03.
Baseline: working tree at `66e72a2` plus uncommitted changes (only the
`components/campaign/assign-contacts*` files and `e2e/specs/campaign-assign-write.spec.ts`
are modified; none of the files cited below are dirty).
Scope reviewed: `ARCHITECTURE-SPINE.md` and `DECISION-admin-assistants.md` in
`_bmad-output/planning-artifacts/architecture/architecture-folk_hkmc-2026-11-03/`,
against the previous `reviews/review-reality.md`.

Method: every named file, symbol, route, policy, helper and version claim was
opened and read. Nothing below is inferred from the documents themselves. No
test was run and no RLS policy was executed; this is a static review.

## Verdict

**pass-with-fixes.**

The revision fixes the bulk of the first reality review. The Stack table still
matches the repo exactly; every newly named file exists; the new RLS helper
claims are right; the four requested current-behaviour claims (`/contact`
assignment, `/attendance` date fallback, Admin `/sessions` creator-only, the
autodialer AD-13 gate) are accurate. The earlier high findings on campaigns,
`/attendance` binding, Gita Life `/sessions`, the actor/owner split and the
`/contact` role set are addressed.

What remains is one high-severity **contract contradiction** in the write rule,
two medium **unclosed boundaries** (client DTO serialization; the null-patch
explanation), one medium **RLS parity gap** (same programme), one medium **stale
`p_role` rationale** (the current `sessions_visible` is creator-only for Admin),
and a set of low-severity stale or over-broad statements. None of these is a reason to
reject the design, but the write rule in particular will produce a behaviour
change that contradicts the decision note if a build unit follows AD-3
literally.

## What checks out

| Claim | Evidence |
| --- | --- |
| Next.js 16.0.7 | `package.json:115` (exact); `pnpm-lock.yaml:3035` (`next@16.0.7`) |
| React 19.2.0 | `package.json:118`; `pnpm-lock.yaml:3270` |
| TypeScript 5.x | `package.json:143` (`^5`); `pnpm-lock.yaml:3541` (`typescript@5.7.3`) |
| @supabase/supabase-js 2.105.1 | `package.json:102` (`^2.105.1`); resolved 2.105.1 at `pnpm-lock.yaml:1524` |
| Supabase Postgres 17 | `supabase/config.toml:36` (`major_version = 17`) |
| pnpm 10.33.0 | `package.json:5` (`packageManager: "pnpm@10.33.0"`) |
| `getStaffContext()` is the staff/role boundary; `StaffContext.userId` is `public.users.id` and equals `supabaseUserId` | `lib/authz.ts:15-40, 105-140, 201-226`; both fields set from `row.id` at `:129-131` |
| `assignedPreacherUserId` is the raw FK; `StaffContext` still has no `patchOwner` | `lib/authz.ts:28-32, 136`; `patchOwner` appears nowhere in `lib/`, `apps/` or `components/` |
| `apps/*/app/attendance/route.ts` exists in both apps; GET admits Admin/Preacher/Assistant | `apps/folk/app/attendance/route.ts:118-121`; `apps/gita-life/app/attendance/route.ts:116-119` |
| The folk `/attendance` GET uses `sessionsScope` + `isSessionVisible` for the session branch and falls through to `getAttendanceByDate(date)` without a session | `apps/folk/app/attendance/route.ts:136-146`; `lib/sessions/data.ts:291-306` |
| The Gita Life `/attendance` GET has its **own inline** `canReadSession` with a location-based Preacher widening and a raw-FK Assistant match, and the same date fall-through | `apps/gita-life/app/attendance/route.ts:134-153` |
| `getAttendanceByDate` is a service-role, programme-scoped (not staff-scoped) date query | `lib/supabase/data.ts:1010-1035` (`createSupabaseAdminClient()` at `:1017`) |
| `getAttendanceBySessionRecord` is service-role | `lib/supabase/data.ts:1093-1115` |
| `apps/*/app/api/auth/me/route.ts` exists in both apps and returns `{ staff }` verbatim | `apps/folk/app/api/auth/me/route.ts:15-16`; `apps/gita-life/app/api/auth/me/route.ts` same |
| `apps/gita-life/app/sessions/page.tsx` exists and resolves the Assistant's supervisor inline with `findStaffUserById`, requiring `role === "Preacher"`; it never calls `sessionsScope`/`sessionsLocations` | `apps/gita-life/app/sessions/page.tsx:16-33` |
| `apps/*/app/api/contact/route.ts` exists in both apps and has **no** `requireRole`; Volunteer/Assistant use the assigned FK, Preacher is self, Admin is an explicit preacher | `apps/folk/app/api/contact/route.ts:59-80, 86-155`; `apps/gita-life/app/api/contact/route.ts:56-78, 87-135` |
| `/api/contact`'s collector is `Volunteer/Assistant ? staff.userId : assignment.preacher.id` | `apps/folk/app/api/contact/route.ts:136-137`; `apps/gita-life/app/api/contact/route.ts:124-125` |
| `/contacts` overview/grid/reports refuse Assistant today | `lib/contacts/section-server.ts:42-44`; all three pages call it (`apps/folk/app/contacts/{page,grid/page,reports/page}.tsx` and the Gita twins) |
| `/manage` and `/api/manage/contacts/**` refuse Assistant today | `apps/folk/app/manage/page.tsx:64`; `apps/gita-life/app/manage/page.tsx:64`; `lib/manage/api-handlers.ts:253, 292, 328, 418, 460, 513` |
| `/contact`, `/sessions`, `/dashboard`, `/campaigns/**` already admit Assistant | `/contact` has no role gate (`apps/folk/app/contact/page.tsx:11-30`); `lib/dashboard/scope.ts:23`; `apps/folk/app/sessions/page.tsx:90`; `lib/dialer/scope.ts:216-218` used by every campaign page |
| `/volunteers` and `/api/volunteers/invite` are Admin/Preacher | `apps/folk/app/volunteers/page.tsx:12`; `apps/folk/app/api/volunteers/invite/route.ts:32` |
| Admin invite is Admin-only and requires an **Active Preacher** for Volunteer/Assistant | `apps/folk/app/api/admin/invite-user/route.ts:29, 41-53` |
| A Preacher's volunteer invite is forced to self; the same route can promote a Volunteer to Assistant | `apps/folk/app/api/volunteers/invite/route.ts:47-60, 95-115` |
| `upsertStaffUser` exists and does **not** clear `assigned_preacher_id` when the role leaves Assistant | `lib/supabase/data.ts:398-450` (the update path only sets the FK when `data.assignedPreacherUserId` is truthy, `:420-425`) |
| `listActivePreachers` is Preacher-only and its cache tag says so | `lib/supabase/data.ts:371-396` (`listActivePreachers`, `SUPABASE_ACTIVE_PREACHERS_CACHE_TAG`) |
| The `/manage` portal reads contacts/sessions/attendance through the authenticated client; the **contacts section's** location naming is deliberately service-role and programme-wide | `lib/supabase/manage.ts:510-548, 555-566`; `:759-767, 788-806` (the contacts section) |
| The `/manage` preacher notice says "your own staff account" and offers the programme switch | `components/manage/manage-portal.tsx:167-171` |
| `/contacts` has no empty-scope explanation; its empty state is a generic "No contacts yet" | `components/contacts/contacts-empty-state.tsx:17-28`; `apps/folk/app/contacts/page.tsx:31-34` |
| The dashboard does have an unassigned-Assistant state and copy | `components/dashboard/dashboard-header.tsx:99-106`; `components/dashboard/candidates-route.tsx:114-118` |
| `ManageScope` has one `staffUserId`; the draft row prefills both `assignedPreacherId` and `collectedById` from it | `components/manage/manage-types.ts:24-33`; `components/manage/manage-contacts-table.tsx:254-281, 1407` |
| `createManageContact` stamps `assigned_preacher_id = staff.userId`, `collected_by_id = staff.supabaseUserId` | `lib/supabase/manage.ts:1198-1213` |
| `caller_assigned_preacher_id()` and `caller_effective_location_ids()` check `Active` but **not** the assignee's role or programme | `supabase/migrations/20261006010000_scoped_rls_policies.sql:70-83, 88-108` |
| The contacts policy's Assistant branch is `assigned_preacher_id = caller_assigned_preacher_id()` | same migration `:173-182` |
| The sessions policy includes `preacher_id`, `created_by`, the assigned-supervisor terms **not gated to Assistant**, and the assistant-created term | `supabase/migrations/20261101000000_sessions_flow.sql:37-54` |
| `caller_can_read_attendance_session()` matches `preacher_id` only, not `created_by` | `20261006010000:114-131`; the attendance policy is `:195-206` |
| `sessions_visible`'s **current** Admin branch is creator-only; the programme-wide version is superseded | `20261102030000_admin_creator_only_sessions.sql:17-58`; the earlier `20261101000000:81-105` version is overwritten |
| The sessions RLS policy (authenticated client, used by `/manage`) still treats `caller_role() = 'Admin'` as the whole programme | `20261101000000:37-54` |
| The `/manage` and `/api/manage/*` matcher gap is real in both app-level copies and the root copy | `apps/folk/proxy.ts:9-23`; `apps/gita-life/proxy.ts:9-23`; `proxy.ts:9-23` |
| The autodialer AD-13 gate is `requireRole(staff, ["Admin", "Preacher"])` on `/api/manage/contacts/**` | `_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md:152-155` |
| `/admin` root is an ungated redirect to `/manage`; only `/admin/invite` is Admin-gated | `apps/folk/app/admin/page.tsx:5-7`; `apps/gita-life/app/admin/page.tsx:5-7`; `apps/folk/app/admin/invite/page.tsx:15` |
| `lib/supabase/proxy.ts:25` and both `complete-implicit` routes call `supabase.auth.getUser()` | `lib/supabase/proxy.ts:25`; `apps/folk/app/api/auth/complete-implicit/route.ts:12`; Gita twin same |

## Findings

### F1 — High — AD-3's write rule contradicts the `/contact` form it says it keeps

**Claim.** AD-3: "writes: `assigned_preacher_id` (contact) and `preacher_id`
(session) carry `owner.userId`; `collected_by_id` and `created_by` carry
`actor`." The decision note's change list repeats the contact half:
"`apps/*/app/api/sessions/route.ts`, `apps/*/app/api/contact/route.ts` — stamp
`preacher_id` / `assigned_preacher_id` with `patchOwner.userId`, not the actor"
(`DECISION-admin-assistants.md:99`). AD-4 simultaneously says the form keeps its
own assignment rule: "Volunteer → Preacher; Assistant → Admin or Preacher;
Preacher → self; Admin → explicitly chosen Preacher" (`ARCHITECTURE-SPINE.md:96`).
The Deferred section says the form's collector difference is preserved
(`:175`).

**Reality.** The contact form has four distinct write rules today
(`apps/folk/app/api/contact/route.ts:59-80, 136-149`):

- Volunteer/Assistant: `assigned_preacher_id` = the assigned FK's Active
  Preacher; `collected_by_id` = the actor (the Volunteer/Assistant).
- Preacher: both = self.
- Admin: both = the explicitly chosen preacher (`payload.assignedPreacherUserId`).

For an **Assistant**, "stamp with `patchOwner.userId`" is correct: the owner is
the supervisor, and the collector is the Assistant. For an **Admin**, the owner
is the Admin, but the form's rule is the chosen Preacher; for a **Volunteer**,
the owner is `null` (AD-1), but the form's rule is the assigned Preacher. A
literal AD-3/change-list implementation therefore:

- silences the Admin's assignee picker (the UI still renders it:
  `components/contact-form.tsx:348-356`; the Admin must send it:
  `apps/folk/app/api/contact/route.ts:74-79`) and writes the contact to the
  Admin instead of the chosen Preacher; and
- nulls a Volunteer's `assigned_preacher_id`, so the contact becomes unassigned
  and invisible to the Preacher the Volunteer was told owns it
  (`components/contact-form.tsx:216`: "Volunteer contacts are assigned to your
  Preacher").

The decision note's own "Contact write (grid)" row (`:56`) scopes the rule to
the grid, and its Deferred row (`:151`) says the form is preserved. The spine's
AD-3 and the change list do not carry that scope. This is the same seam the
adversarial review flagged as F5 (High); the revision fixed the role set but not
the write rule.

**Impact.** The two contact entry points write the same row differently by
design, but the contract no longer says which one wins. An Admin's form-created
contact can move from the chosen Preacher's patch to the Admin's; a Volunteer's
contact can become unassigned. Both are silent data changes, and the Assistant's
patch (the Admin's own rows) changes as a result.

**Fix.** Scope AD-3's write bullet to the grid/manage path and state the form's
per-role rule explicitly: Assistant → owner for assignment, actor for collector;
Preacher → self/self; Admin → the explicitly chosen Preacher/the chosen
Preacher; Volunteer → the assigned supervisor/the assigned supervisor. Or adopt
the adversarial review's alternative: remove the Admin picker and make an
Admin's form-created contact owner = Admin, collector = actor. Pick one; do not
leave both. If a Volunteer can be bound to an Admin, extend
`activePreacherResult`'s Admin acceptance to the Volunteer path as well; today
the note only says "for an Assistant" (`DECISION:99`), and a Volunteer with an
Admin supervisor would be refused with "Assigned Preacher must be an active
Preacher user." (`apps/folk/app/api/contact/route.ts:51-53`).

### F2 — Medium-High — The client DTO boundary is still open: `StaffAuthShell` and `complete-implicit` ship the whole `StaffContext`

**Claim.** AD-1: "The client staff DTO carries only `hasPatchScope`,
`supervisorName` and `supervisorRole`; `patchOwner.locationIds` stays
server-side." The decision note names `apps/*/app/api/auth/me/route.ts` and
`lib/auth-context.tsx` for the DTO (`:95`).

**Reality.** `patchOwner` is defined as a `StaffContext` field (`:53-58`;
Consistency Conventions `:126`). `StaffAuthShell` takes a `StaffContext` and
passes it straight to the client provider:

- `components/staff-auth-shell.tsx:8` — `<AuthProvider initialStaff={staff}>`.
- `lib/auth-context.tsx:86-90, 103-104` — the client stores that object as
  `staff`.
- Ten pages/layouts use `StaffAuthShell` directly (`/manage`, `/contact`,
  `/campaigns`, `/volunteers`, `/sessions`, `/admin/invite` in both apps), and
  the `ContactsSectionFrame` used by `/contacts/**` wraps it
  (`components/contacts/contacts-section-frame.tsx:28-33`).

The same full object is returned by both `apps/*/app/api/auth/complete-implicit/route.ts:24`
(`return Response.json({ staff })`, consumed by `lib/auth-context.tsx:49-59` on
login) as well as `auth/me`. Only `auth/me` is named in the change list. There
is no `toClientStaff` helper and no server-only marker on `patchOwner`. So on
the current data flow the supervisor's `locationIds` (and name/role) reach the
browser on every shell-rendered page and on the login path, regardless of what
`/api/auth/me` returns. This is the leak adversarial F8 identified; the revised
DTO is tighter but the serialization path is unchanged.

**Impact.** The "stays server-side" guarantee is false in the architecture as
drawn. A build unit can satisfy AD-1 and the decision note's file list and still
ship the supervisor's name, role and location ids to the client. The `users` RLS policy deliberately
denies a non-Admin every row but their own
(`20261006010000:152-160`), so this is an app-versus-RLS parity inversion, not
just an information-design choice.

**Fix.** Either make `patchOwner` a server-only field that `StaffAuthShell` and
both auth routes strip through one `toClientStaff(staff)` helper, or state that
`StaffContext` is server-only and the client type is a separate DTO. Name
`components/staff-auth-shell.tsx`, `components/contacts/contacts-section-frame.tsx`
and both `complete-implicit` routes in the change list. Clarify that the three
fields are the patch-related additions, not the entire DTO (the header still
needs `role`, `name`, `hasActiveCallerProfile`).

### F3 — Medium — "A null owner is an empty patch" and "the existing empty-scope explanation" are false for `/manage`, `/contacts` and sessions

**Claim.** AD-1: "A null owner is a real state, not an error" (`:58`). AD-3:
"A null owner is an empty patch, never a widening" (`:88`). AD-4: "For an
Assistant with a null patch, `/manage` and `/contacts` render the existing
empty-scope explanation rather than a redirect loop" (`:100`). The decision note
repeats "an empty patch with an explanation" (`:63`).

**Reality.**

- **Sessions are not empty.** The AD-3 sessions predicate itself is
  `preacher_id = owner.userId OR created_by = owner.userId OR created_by = actor`.
  With `owner = null` the first two terms drop out and `created_by = actor`
  remains. `sessionsScope` already returns `assignedPreacherId: null` while
  keeping `userId` = actor (`lib/sessions/scope.ts:43-71`), and `sessions_visible`
  includes `created_by = p_user_id` (`20261101000000:95-99`; current
  `20261102030000:37`). So a null-patch Assistant still sees the sessions they
  created; "empty" is false.
- **`/manage` has no empty-scope explanation.** It renders the preacher-mode
  notice "Showing only rows scoped to your own staff account. Switch to the
  program-wide scope to see every preacher." (`components/manage/manage-portal.tsx:167-171`).
  That copy is wrong for an Assistant reading the supervisor's patch, and the
  switch is not available to an Assistant. There is no unassigned-Assistant
  state on the portal.
- **`/contacts` has no empty-scope explanation.** Its empty state is the generic
  "No contacts yet / Contacts assigned to you appear here once they are
  collected." (`components/contacts/contacts-empty-state.tsx:17-28`), and the
  section currently redirects Assistant before it can render
  (`lib/contacts/section-server.ts:42-44`).
- **Only the dashboard has the state.** `assistantUnassigned` and its copy are
  real (`lib/dashboard/scope.ts:83-96`; `components/dashboard/dashboard-header.tsx:99-106`;
  `components/dashboard/candidates-route.tsx:114-118`), and even that copy says
  "preacher", not "supervisor".

**Impact.** A build unit following AD-4 will land a null-patch Assistant on a
blank or misleading `/manage` and `/contacts` with no decision on what to say,
which is the exact outcome the sentence says it avoids. It may also "fix" the
sessions behaviour by forcing an empty read, deleting the actor-created rows that
AD-3's own predicate keeps.

**Fix.** State the null-owner state per surface: contacts and manage = no
supervisor-owned rows; sessions = the actor's own creations remain; dashboard =
the existing `assistantUnassigned` copy. Name the `/manage` notice rewrite
("the supervisor's patch", no programme switch) and a `/contacts` empty state
that distinguishes "no supervisor assigned" from "no contacts yet". Say
"no supervisor rows", not "empty patch".

### F4 — Medium — The RLS helpers still omit the same-programme check, so "matching `patchOwner = null`" is not achieved for a cross-programme assignment

**Claim.** AD-1 requires the supervisor to be "in the same programme" (`:55`).
AD-5: "`caller_assigned_preacher_id()` and `caller_effective_location_ids()`
require the assigned row to be `Active` **and** role in (`Preacher`, `Admin`).
An ineligible assignment returns null/empty, matching `patchOwner = null`."
(`:109`).

**Reality.** Both helpers join only on `p.id = u.assigned_preacher_id` and
`p.status = 'Active'` (`20261006010000:70-83, 88-108`); neither checks
`p.program_id = u.program_id`. The app's `findStaffUserById` is program-scoped
(`lib/supabase/data.ts:352-359`), so a cross-programme assignment yields
`patchOwner = null` in the app while the helper returns the foreign id. The
surrounding table policies filter on `program_id = caller_program_id()`, which
neutralises most reads, but the app and database still disagree on the
assignment itself — the exact parity AD-5 claims. The prior review's F6 is
unfixed; the revision added the role check but not the programme check.

The same section also states "The contacts policy is
`assigned_preacher_id = caller_assigned_preacher_id()` for an Assistant"
(`:110`). The full policy also has `program_id = caller_program_id()` and the
Admin/Preacher branches (`20261006010000:173-182`). A literal replacement would
leak across programmes. Say "the Assistant branch of the existing policy, keeping
the programme term and the other role branches" (the rubric's N-2).

**Impact.** A bad cross-programme assignment produces a row the app hides and
the database grants; a literal policy bullet can remove the programme guard. Both
are hard to see in normal data and exactly the cases the decision note asks
operators to audit (`DECISION:149-150`).

**Fix.** Add `AND p.program_id = u.program_id` to both helpers (and to the
`caller_can_read_attendance_session()` join), or state explicitly why the
per-table `program_id` filter makes the check redundant and that the helper may
return a foreign id. Qualify the policy bullet as the Assistant branch.

### F4b — Medium — The `p_role` warning is stale: the current `sessions_visible` Admin branch is creator-only, not programme-wide

**Claim.** AD-3: "A scope function receives the actor's role and the owner's id
and locations; it never receives the owner's role. Passing an Admin supervisor's
role as `p_role` would widen an Assistant to the programme." (`:86`). The
decision note repeats it (`:65`). The prior review's F4 justified this with
`sessions_visible` returning every session in the programme when
`p_role = 'Admin'`.

**Reality.** `20261101000000_sessions_flow.sql:81-105` did return the whole
programme for `p_role = 'Admin'`, but
`20261102030000_admin_creator_only_sessions.sql:17-58` **replaced** that
function. The current `sessions_visible` Admin branch is
`p_role = 'Admin' AND s.created_by = p_user_id` — creator-only. Passing the
Admin supervisor's role as `p_role` today yields only the rows created by
`p_user_id` (the actor, or the owner if the implementation also moves
`p_user_id`), not the programme. The programme-wide Admin rule that is still
live is the **sessions RLS policy** (`20261101000000:37-54`), which `/manage`
uses through the authenticated client. The `dashboard_overview` /
`dashboard_candidates` functions use `p_program_scope`, not `p_role`
(`20261102010000_dashboard_rpcs.sql:518-526, 629-637, 132, 146-148`);
`campaign_progress` uses its own `p_program_scope`
(`20261027010000_campaign_progress.sql:18-21, 37-59`).

The safe mapping is unchanged and the rule is still worth keeping: `p_role`
stays the actor's, `p_user_id` stays the actor, only `p_assigned_preacher_id`
becomes the owner. But the stated consequence is wrong for the function the
argument belongs to, and an implementer who checks `sessions_visible` will see
the premise fail. The actual widening risk is passing the Admin's role to an
RLS-backed read (or setting `program_scope = true` on the dashboard/campaign
RPCs), not `p_role` in `sessions_visible`.

**Impact.** A build unit can discount the rule ("the function does not widen, so
the actor/owner split does not matter here"), pass the Admin supervisor's role
to an RLS-backed read, or set `program_scope = true` on the dashboard/campaign
RPCs — the places where the programme-wide widening actually lives. The docs
currently point at the wrong mechanism.

**Fix.** Rewrite the sentence: "`p_role` and `p_user_id` stay the actor's; only
`p_assigned_preacher_id` becomes the owner. The current `sessions_visible` Admin
branch is creator-only, so passing the owner's role there silently changes the
result rather than reproducing the patch; the programme-wide Admin rule is in
the sessions RLS policy and in `p_program_scope` on the dashboard/campaign RPCs."
Name `20261102030000` in the RLS/sessions section so the current function is the
one cited.

### F5 — Medium-Low — Gita Life `/attendance` keeps an inline predicate wider than the patch; the change list names the file but not the predicate

**Claim.** AD-3: "attendance: through a session in the patch." AD-4: "The
`/attendance` GET is session-scoped or patch-scoped; a date-wide programme read
is Admin-only." The decision note: "`apps/*/app/attendance/route.ts` — scope the
staff GET by session or patch; a date-wide programme read stays Admin-only"
(`:103`).

**Reality.** The folk route uses the shared helpers
(`apps/folk/app/attendance/route.ts:136-141`), but the Gita route still has its
own predicate (`apps/gita-life/app/attendance/route.ts:134-148`):

```ts
const canReadSession =
  staff.role === "Admin" ||
  session.preacherIds.includes(staff.userId) ||
  (staff.role !== "Assistant" &&
    session.locationIds.some((locationId) => staff.locationIds.includes(locationId))) ||
  isAssistantMatch
```

That location term lets a Preacher read attendance for **any** session at one of
their locations, which is wider than AD-3's owner-based patch (no location term).
The route is named in the change list, but the docs do not say to replace the
inline predicate with `sessionsScope` + `isSessionVisible`; an implementer may
only add the Admin date guard and leave the wider session branch in place. The
prior review's F2 fix asked for exactly this replacement.

The decision note also calls the date branch an "unscoped service-role date
query" (`:147`); it is **programme-scoped**, not row-scoped
(`lib/supabase/data.ts:1017-1021`). The substantive claim (any Assistant can read
the programme's attendance for a date) is true; the word "unscoped" is not.

**Impact.** "One patch predicate" remains false for the Gita attendance endpoint,
and a Preacher can read attendance for sessions outside their patch.

**Fix.** Say both routes use `sessionsScope` + `isSessionVisible` for the session
branch; remove the location widening. Define what a date-wide read returns for a
Preacher/Assistant (patch-filtered or 403) and add the `/attendance?date=` denial
case to the e2e list. Replace "unscoped" with "programme-scoped, not
staff-scoped".

### F6 — Medium-Low — The Admin-on-`/volunteers` invite path is still unreachable, so "both invite routes use the same predicate" is only true on the server

**Claim.** AD-2: "Both invite routes use the same eligibility predicate. The
supervisor picker lists both roles and shows which one each person is."
(`:68`). The decision note: "`apps/*/app/api/volunteers/invite/route.ts` — a
Preacher's invite remains self-only; the Admin path accepts an eligible
supervisor." (`:108`).

**Reality.** `/volunteers` renders `<InviteUserForm mode="volunteer" />` with no
`preachers` prop (`apps/folk/app/volunteers/page.tsx:19`; Gita twin same). The
supervisor select renders only when `isPreacherScoped && mode === "admin"`
(`components/invite-user-form.tsx:263-277`), so an Admin on `/volunteers` has no
picker and the request carries no `assignedPreacherUserId`. The route's Admin
path requires one (`apps/folk/app/api/volunteers/invite/route.ts:47-55`), so the
Admin gets "Assigned Preacher is required for Volunteer invites." The Admin can
use `/admin/invite`, but the note's "Admin path" wording implies the volunteer
route works for an Admin too. This is adversarial F6's break; the revision did
not change the page/form.

**Impact.** The "one binding, two routes" rule is not testable through the UI;
an operator can still see two invite surfaces with different behaviour.

**Fix.** Either add the supervisor picker to `mode="volunteer"` and pass the
eligible supervisors from both volunteer pages, or state that Admins use
`/admin/invite` and `/volunteers` is the Preacher surface (and adjust
`VOLUNTEER_INVITE_ROLES`/copy accordingly). Name `apps/*/app/volunteers/page.tsx`
and `components/invite-user-form.tsx` in the change list.

### F7 — Low-Medium — `STAFF_ADMIN_ROLES` claims role/status/supervisor changes are Admin-only; a Preacher can promote a Volunteer to Assistant today, and `/admin` root is ungated

**Claim.** AD-4: `STAFF_ADMIN_ROLES = ["Admin"]` — "`/admin/**`, staff
role/status/supervisor changes, location creation, and caller deactivation."
(`:98`). The decision note's table has the same row (`:38`).

**Reality.** There is no staff-management page or route. `upsertStaffUser` has
two callers: the Admin invite route
(`apps/folk/app/api/admin/invite-user/route.ts:63`) and the volunteer invite
route (`apps/folk/app/api/volunteers/invite/route.ts:109`), which is
Admin/Preacher and can promote an existing Volunteer to Assistant (`:95-115`,
`normalizeInviteRole` at `:17-27`). AD-2 itself lets a Preacher bind an Assistant to themselves — a
supervisor change through the volunteer route. So "staff role/status/supervisor
changes" is not Admin-only. Separately, `apps/*/app/admin/page.tsx:5-7` is an
ungated redirect to `/manage`; the `/admin/**` claim is true only for the real
pages (`/admin/invite` is Admin-gated at `:15`). The prior review's F10/F11 are
unfixed.

**Impact.** The role-set description misstates the current permission model and
makes the existing Preacher promotion look like a hole after the change. The
`/admin` redirect becomes Assistant-reachable once `/manage` admits Assistant.

**Fix.** Drop "staff role/status/supervisor changes" or name the volunteer-invite
promotion as the existing exception and say whether it survives. Gate
`/admin/page.tsx` or state that it is a redirect, not a surface. Add
`/admin/:path*` to the existing matcher-gap list (or say it is out of scope).

### F8 — Low — Stale or over-broad statements that remain

These are not blockers, but they are the "stale/invented" residue the review was
asked to find.

| Statement | Reality |
| --- | --- |
| "`getStaffContext()` is the only identity read" (`ARCHITECTURE-SPINE.md:31`) | `lib/supabase/proxy.ts:25` and both `apps/*/app/api/auth/complete-implicit/route.ts:12` call `supabase.auth.getUser()`. It is the only **staff/role** read; the proxy read is what makes the matcher load-bearing. The prior F12 is unfixed. |
| "No surface re-derives 'preacher' or filters on `staff.userId` for scope" (`:31`) | AD-3's own sessions predicate includes `created_by = actor` (`:77`), a legitimate `staff.userId` scope filter. Say "no surface derives the patch owner from `staff.userId`; the actor term is the one legitimate exception", or an implementer may remove the term that keeps an Assistant's own write visible. |
| "Dashboard and sessions scope predicates stay as their specs define them; only the owner changes" (`:33`) | The dashboard spec's "missing, inactive or **non-Preacher** assignment is an empty scope" (`spec-program-dashboard/SPEC.md:64`) is superseded by the Admin-supervisor eligibility (the decision note correctly lists it at `:135`). The eligibility change is more than "only the owner". |
| "`apps/*/app/{...,campaigns,...}`" (`AD-4:92`) and "`/campaigns/**`" for both apps | `apps/gita-life/app` has no `campaigns` directory; the header gates the item on `modules.dialer` (`components/header.tsx:69-77`). The bind implies work that does not exist. The prior F13 is unfixed. |
| "`apps/*/app/contact/page.tsx` — an Assistant of an Admin gets the Admin's locations" (`DECISION:98`) | The Gita Life contact page has no locations at all (`apps/gita-life/app/contact/page.tsx:14-30`); it is a folk-only change. |
| The conflicts table's `docs/architecture.md` Role Matrix row: "`/manage` and contacts are Admin/Preacher" (`DECISION:136`) | The Role Matrix has a `/manage` row but no `/contacts` row (`docs/architecture.md:78-91`); the contacts roles live in `spec-contacts-section/SPEC.md:39-45`. Minor citation error; say "`/manage` is Admin/Preacher". |
| The conflicts table's source list is incomplete (`DECISION:130-140`) | Still stale after this change: `docs/architecture.md:156` (POST /api/sessions Admin/Preacher), `:160` (Preachers invite Volunteers only), `docs/data-models.md:225-227` (helpers Active-only, no role/program), `:236` (malformed "(Preacher/Assistant ∨ Assistant)"), `spec-sessions-flow/SPEC.md:60` ("assigned preacher", "their own"), `spec-contacts-section/SPEC.md:114-115, 168-169` ("Admin and Preacher read the same rule", "only roles that will ever reach these three tabs"). The decision note says update them; name them or demote the docs from `sources`. The prior F14 is partly unfixed. |
| "A staff read through the service-role client passes the same `patchOwner` id" (`AD-5:114`) / "Any service-role staff read passes the same `patchOwner` id" (`DECISION:125`) | Over-broad. `loadContactsSectionData` deliberately reads the whole programme's locations with the service role to name a contact that sits outside the reader's scope (`lib/supabase/manage.ts:759-767, 788-806, 846`); applying the rule literally renders those rows "Unknown location". Qualify it: "a service-role read that replaces a caller-scoped read", and name the location-naming exception. The prior F8/rubric B-7 is only partly fixed. |
| "`collected_by_id` ... actor" (`AD-3:80`) and "the feature preserves both" (`:175`) | The `/contact` form's Admin/Preacher collector is the assigned preacher, not the actor (`apps/folk/app/api/contact/route.ts:136-137`). The Deferred says this is preserved; AD-3 says it is the actor. Same contradiction as F1; the `collected_by_id` half is explicitly carved out, the `assigned_preacher_id` half is not. |
| "`@supabase/supabase-js 2.105.1`" / "TypeScript 5.x" | Correct today, but the manifest declares `^2.105.1` and `^5`; the table records floors, not pins. The autodialer spine records Next 16.0.7 as behind 16.4.3 with CVE-2026-44575 (proxy bypass, fixed 16.2.5); this spine makes the app-level matcher load-bearing, so carry that note or schedule the upgrade. The narrow version check passes. |

## Claims that are target state, not current behaviour — not defects

These read as current-behaviour assertions but are design intent; they are
listed so a later reviewer does not "fix" them as false claims:

- `patchOwner` does not exist yet; AD-1 is the new contract.
- `OPERATIONAL_ROLES`, `CONTACT_FORM_ROLES`, `VOLUNTEER_INVITE_ROLES` and
  `STAFF_ADMIN_ROLES` are not constants today; each site repeats inline arrays
  (`lib/contacts/section-server.ts:42`, `lib/manage/api-handlers.ts:253 et al.`).
- `hasPatchScope`, `supervisorName`, `supervisorRole` are new client fields; the
  current DTO is the full `StaffContext`.
- "User-facing text says Supervisor" is future; the current contact form, invite
  form and invite errors say "Preacher" (`components/contact-form.tsx:350-356`;
  `components/invite-user-form.tsx:265, 274`; the invite routes' error strings).
- "A draft row shows the owner as assigned and the actor as collector" is
  future; today both fields are the same id
  (`components/manage/manage-contacts-table.tsx:273-278`).
- `upsertStaffUser()` clearing `assigned_preacher_id` on a role change is future;
  the current update path only sets it when a value is supplied
  (`lib/supabase/data.ts:420-425`).
- The helpers' role check and `caller_can_read_attendance_session()`'s
  `created_by` terms are future; the current SQL is `preacher_id`-only
  (`20261006010000:114-131`).
- An Admin as an eligible supervisor is future; the current dashboard, sessions,
  sessions API and contact API all require `role === "Preacher"`
  (`lib/dashboard/scope.ts:64`, `lib/sessions/scope.ts:54`,
  `apps/folk/app/api/sessions/route.ts:186-188`,
  `apps/folk/app/api/contact/route.ts:51-53`).
- The `/attendance` date branch being Admin-only is future; today every
  Admin/Preacher/Assistant can call it (`apps/folk/app/attendance/route.ts:121, 145`).

## Not verified

- No `pnpm test:static`, `pnpm test:unit`, `pnpm test:e2e` or
  `pnpm test:e2e:determinism` was run; this review is static.
- RLS was read, not executed. `scripts/verify-rls.mjs` exists but is not a pnpm
  script; its fixture has no Admin-supervised Assistant and no wrong-role
  assignee, so the new cases cannot be exercised from the repo as it stands.
- `supabase/seed.sql` is a 3-line stub; the "bad assignee" pre-deploy query
  cannot be exercised locally.
- The remote Postgres major version is not in the repo; the Stack table's "17"
  is the local `supabase/config.toml:36` pin, which the file says must match the
  remote.
- The Stack table's Next 16.0.7 is the repo pin. The sibling autodialer spine
  records 16.4.3 as current and CVE-2026-44575 fixed in 16.2.5; I did not query
  the registry in this review.

## Suggested minimal edits (ordered)

1. **AD-3 write rule:** scope the owner/actor rule to the grid and the
   Assistant/Preacher form paths; state the Admin's explicit-picker rule and
   the Volunteer's assigned-supervisor rule (or remove the Admin picker and
   update AD-4/the form). Fix the decision note's `:99` stamping sentence and
   the `collected_by_id` carve-out in the same edit.
2. **Client DTO:** name `components/staff-auth-shell.tsx`,
   `components/contacts/contacts-section-frame.tsx` and both
   `apps/*/app/api/auth/complete-implicit/route.ts`; add a `toClientStaff()`
   boundary or mark `patchOwner` server-only; say the three fields are the
   patch additions, not the whole DTO.
3. **Null owner:** replace "empty patch" with the per-surface state (contacts /
   manage = no supervisor rows; sessions = actor's own creations remain;
   dashboard = `assistantUnassigned`). Name the `/manage` notice rewrite and a
   `/contacts` "no supervisor" empty state.
4. **RLS parity:** add the same-programme condition to both helpers (and the
   attendance join), or justify its absence; phrase the contacts policy as the
   Assistant branch of the existing policy, keeping the programme/Admin/Preacher
   terms.
4b. **`p_role` rationale:** replace "would widen to the programme" with the
   current mechanism. `sessions_visible` is creator-only for Admin since
   `20261102030000`; the programme-wide Admin rule is the sessions RLS policy and
   `p_program_scope` on the dashboard/campaign RPCs. Keep the actor-role/owner-id
   rule, but cite the current function.
5. **Gita attendance:** say both `/attendance` routes use `sessionsScope` +
   `isSessionVisible`; remove the location widening; decide the Preacher/
   Assistant date branch and add the denial e2e case.
6. **Invite path:** fix the Admin-on-`/volunteers` UI (picker) or state that
   Admins use `/admin/invite`; name the page/form in the change list.
7. **`STAFF_ADMIN_ROLES`/`/admin`:** drop "staff role/status/supervisor
   changes" or name the Preacher promotion as the exception; gate
   `/admin/page.tsx` or call it a redirect; add `/admin/:path*` to the matcher
   gap list.
8. **Sources:** refresh `docs/architecture.md:156,160`, `docs/data-models.md:225-227,234-236`,
   `spec-sessions-flow/SPEC.md:60`, `spec-contacts-section/SPEC.md:114-115,168-169`
   in the same change, or demote them from `sources`.
9. **Wording:** "only staff/role read"; "no surface derives the patch owner from
   `staff.userId`"; drop `campaigns` from the Gita `apps/*` bind; scope the
   contact-page change to folk; carry the Next pin/CVE note.
