# Reality review — Staff scope spine and the Admin-Assistants decision

Reviewer role: reality/version checker (independent of the author of the spine).
Date: 2026-11-03.
Baseline: working tree at `66e72a2` plus uncommitted changes (only campaign
assign-contacts files are modified; none of the files cited below are dirty).
Scope reviewed: `ARCHITECTURE-SPINE.md` and `DECISION-admin-assistants.md` in
this directory.

Method: every named file, symbol, route, policy, helper and version claim was
opened and read. Nothing below is inferred from the documents themselves.
No e2e suite was run; RLS was checked by reading the SQL, not by executing it
against a database.

## Verdict

**pass-with-fixes.**

The spine is substantially grounded: every version in the Stack table is
correct, the "Before" surface matrix is accurate, the invite role checks and
redirects are described correctly, and the RLS helper/policy claims match the
migrations. Three current-behaviour claims are overstated or incomplete
(`/campaigns` unchanged, the "existing empty-scope explanation", the location
predicate), and several code paths that implement the spine's own rules are
missing from the change list — most importantly the second `/sessions`
implementation in Gita Life, the two `/attendance` routes, the contact page's
inline supervisor resolution, and the `/api/contact` collector semantics.
Those are fixable by editing the documents, not by rejecting the design.

## What checks out

| Claim | Evidence |
| --- | --- |
| Next.js 16.0.7 | `package.json:115`; `pnpm-lock.yaml:3035` (`next@16.0.7`) |
| React 19.2.0 | `package.json:118`; `pnpm-lock.yaml:3270` |
| TypeScript 5.x | `package.json:143` (`^5`); `pnpm-lock.yaml:3541` (`typescript@5.7.3`) |
| @supabase/supabase-js 2.105.1 | `package.json:102` (`^2.105.1`); resolved 2.105.1 at `pnpm-lock.yaml:104-106, 1524` |
| Supabase Postgres 17 | `supabase/config.toml:36` (`major_version = 17`) |
| pnpm 10.33.0 | `package.json:5` (`packageManager: "pnpm@10.33.0"`) |
| `getStaffContext()` is the staff/role boundary; `userId` is `public.users.id` and equals `supabaseUserId` | `lib/authz.ts:105-140, 201-226`; both fields set from `row.id` at `:129-131` |
| `assignedPreacherUserId` is the raw FK and `StaffContext` has no `patchOwner` | `lib/authz.ts:28-32, 136`; `patchOwner` appears nowhere in `lib/`, `apps/` or `components/` |
| `/contacts` overview, grid and reports refuse Assistant today | `lib/contacts/section-server.ts:42-44` (redirect to `/contact`); all three pages call it (`apps/folk/app/contacts/{page,grid/page,reports/page}.tsx`; Gita Life twins under `apps/gita-life/app/contacts/`) |
| `/manage` and `/api/manage/contacts/**` refuse Assistant today | `apps/folk/app/manage/page.tsx:64`; `apps/gita-life/app/manage/page.tsx:64`; all six handler entry points call `requireRole(staff, ["Admin", "Preacher"])` at `lib/manage/api-handlers.ts:253, 292, 328, 418, 459, 513` |
| `/contact`, `/sessions`, `/dashboard`, `/campaigns/**` already admit Assistant | `/contact` has no role gate (`apps/folk/app/contact/page.tsx:11-30`); `lib/dashboard/scope.ts:23`; `apps/folk/app/sessions/page.tsx:90`; `lib/dialer/scope.ts:216-218` (`requireCampaignAdmin` = Admin/Preacher/Assistant), used by every campaign page (`apps/folk/app/campaigns/page.tsx:54`, `reports/page.tsx:48`, `callers/page.tsx:35`, `[campaignId]/assign-contacts/page.tsx:41`) |
| `/volunteers` and `/api/volunteers/invite` are Admin/Preacher | `apps/folk/app/volunteers/page.tsx:12`; `apps/folk/app/api/volunteers/invite/route.ts:32` |
| Admin invite is Admin-only and requires an **Active Preacher** for Volunteer/Assistant | `apps/folk/app/api/admin/invite-user/route.ts:29, 41-53` |
| A Preacher's volunteer invite is forced to self | `apps/folk/app/api/volunteers/invite/route.ts:47-60` |
| Assistant downgrade and supervisor-move refusals exist on the volunteer invite | `apps/folk/app/api/volunteers/invite/route.ts:70-93` |
| Location creation and caller deactivation are Admin-only | `apps/folk/app/api/admin/locations/route.ts:16`; `lib/dialer/callers.ts:379-394` (`setCallerActive` calls `requireRole(staff, ["Admin"])`) |
| `caller_assigned_preacher_id()` and `caller_effective_location_ids()` check `Active` but **not** the assignee's role | `supabase/migrations/20261006010000_scoped_rls_policies.sql:70-83, 88-108` |
| Contacts policy for an Assistant is `assigned_preacher_id = caller_assigned_preacher_id()` | same migration `:173-182` |
| Sessions policy includes `preacher_id`, `created_by`, the assigned preacher, and the Preacher's assistant-created term | `supabase/migrations/20261101000000_sessions_flow.sql:37-54` |
| `caller_can_read_attendance_session()` matches `preacher_id` only (the decision note's stated risk is real) | same migration (earlier policy file) `:114-131` |
| Attendance RLS does not accept `created_by`; a supervisor-created session led by another preacher loses `/manage` attendance — the risk is real | `20261006010000:114-131, 195-206` |
| Removing `preacher_id = auth.uid()` for an Assistant is a tightening — the current policy has that term | `20261101000000:44-51` |
| The `/manage` and `/api/manage/*` session-refresh gap is real | no entry in `proxy.ts:9-23`, `apps/folk/proxy.ts:9-23`, or `apps/gita-life/proxy.ts:9-23` |
| The Admin "Own scope" predicate is the same shape as AD-2's dashboard/campaign predicate | `lib/dashboard/scope.ts:27-41`; `supabase/migrations/20261102010000_dashboard_rpcs.sql:132, 146-148`; `20261027010000_campaign_progress.sql:59` |
| `createManageContact` already stamps owner and collector from the caller (because both ids are the same column) | `lib/supabase/manage.ts:1205-1213`; `staff.userId === staff.supabaseUserId` (`lib/authz.ts:129-131`) |
| The draft-row problem is real: the draft is built from one id only | `components/manage/manage-contacts-table.tsx:254-281, 1407` |
| The active-supervisor cache is Preacher-only and its tag says so | `lib/supabase/data.ts:371-396` (`listActivePreachers`, `SUPABASE_ACTIVE_PREACHERS_CACHE_TAG`) |
| `.memlog.md` exists as a companion | present in this directory |

## Findings

### F1 — High — `/campaigns/**` cannot stay "unchanged" and still satisfy AD-1/AD-2

**Claim.** AD-3: "`/campaigns/**` keeps the autodialer AD-2 role set and AD-3
helper unchanged." AD-1: the resolver "prevents … an Assistant's scope changing
between `/dashboard`, `/sessions` and `/campaigns`." AD-2: "dashboard and
campaigns: `program_scope = false` with `scope_preacher_id = owner.userId`."

**Reality.** `campaignScope()` scopes an Assistant to
`staff.assignedPreacherUserId` **raw**, with no Active/role check
(`lib/dialer/scope.ts:279-291`). `/dashboard` and `/sessions` resolve and
validate, returning an empty scope for an inactive or wrong-role assignee
(`lib/dashboard/scope.ts:59-67`, `lib/sessions/scope.ts:43-63`). So the
divergence AD-1 says it prevents still exists for exactly the bad-data case the
decision note asks operators to check for. AD-2's campaign predicate is only
accidentally true when the assignment happens to be eligible.

**Impact.** A future implementer can follow both AD-1 and "campaigns unchanged"
and still ship a surface whose scope differs from the other two. If the intent
is that campaigns also refuses an ineligible supervisor, AD-3's "unchanged" is
wrong; if the intent is that campaigns keeps the raw FK, AD-1's prevention claim
is wrong. Both cannot be true.

**Fix.** Pick one and say it: either `campaignScope` consumes `patchOwner`
(and AD-3's "unchanged" is narrowed to the role set and the helper's return
shape), or AD-1 explicitly exempts campaigns and states that an ineligible
assignment keeps the raw id there.

### F2 — High — `/attendance` is an unbound scope surface that already reads programme rows

**Claim.** AD-2: "attendance: through a session in the patch"; its bind list is
`apps/*/app/api/{sessions,contact,manage}/**`. AD-4: "the database predicate
equals the app predicate." AD-2 "Prevents: an Assistant reading programme rows."

**Reality.** `GET /attendance` with no `session` parameter calls
`getAttendanceByDate(date)`, which filters only on `program_id` and `created_at`
and uses the **service-role** client (`apps/folk/app/attendance/route.ts:145`;
`apps/gita-life/app/attendance/route.ts:152`; `lib/supabase/data.ts:1010-1035`).
The route admits Admin/Preacher/Assistant. So an Assistant can read every
attendance row in the programme for a date today. Separately, the Gita Life
route has its own `canReadSession` predicate with a location-based Preacher
widening and a raw-FK Assistant match (`apps/gita-life/app/attendance/route.ts:134-148`),
and `getAttendanceBySessionRecord` is service-role as well
(`lib/supabase/data.ts:1093-1115`), so that route gate is the only boundary.
Neither route is in the spine's bind list or change list.

**Impact.** "One patch predicate" is false for the attendance endpoint as it
stands; the exact leak AD-2 says it prevents is reachable without touching any
of the files the spine names.

**Fix.** Bind `apps/*/app/attendance/route.ts`, define what the date view means
for an Assistant (empty, owner-only, or removed), and replace the Gita Life
route's inline predicate with the same helper the folk route uses
(`sessionsScope` + `isSessionVisible`). Note that `lib/supabase/data.ts`'s
`getAttendanceByDate` is a service-role read, so AD-4's "service role is never a
second scope definition" applies directly.

### F3 — High — Gita Life `/sessions` is a second supervisor resolver and breaks for an Admin supervisor

**Claim.** AD-1: "No page, handler or scope resolver may call
`findStaffUserById` to resolve a supervisor." AD-3: `/sessions` is in
`OPERATIONAL_ROLES` and "Every one scopes through `patchOwner`."

**Reality.** `apps/gita-life/app/sessions/page.tsx:16-33` resolves the
Assistant's supervisor inline with `findStaffUserById` and requires
`role === "Preacher"`, setting `scopedLocationIds = []` otherwise. It never
calls `sessionsScope` / `sessionsLocations`; it hands the filtered locations to
the legacy `SessionsManager`. With an Admin supervisor, an Assistant would get
zero locations and see "No locations are available for this staff account"
(`components/sessions-manager.tsx:268-270`), while the folk `/sessions` page
works (`apps/folk/app/sessions/page.tsx:95-106`). The file is not in either
document's change list.

**Impact.** The change ships two different `/sessions` behaviours across the two
apps, and the Gita Life one is a direct violation of AD-1.

**Fix.** Add `apps/gita-life/app/sessions/page.tsx` to the resolver change list
and have it use the shared helpers, or explicitly scope the decision to folk and
say Gita Life `/sessions` is out of scope. Do not leave "`apps/*`" implying both.

### F4 — High — owner and actor are conflated in the scope shapes; `sessions_visible`'s `p_role` is the trap

**Claim.** AD-2: sessions are
`preacher_id = owner.userId OR created_by = owner.userId OR created_by = actor`;
writes carry owner for ownership and actor for attribution. AD-1:
`patchOwner.role` is `Admin | Preacher`.

**Reality.** `SessionsScope` carries one `userId` (the actor), one `role`, and
one `assignedPreacherId`, and `rpcArgs` forwards all three
(`lib/sessions/data.ts:115-121`). `sessions_visible` returns **every session in
the programme** when `p_role = 'Admin'`
(`supabase/migrations/20261101000000_sessions_flow.sql:81-105`). If an
implementer maps `patchOwner.role` into `SessionsScope.role` — which AD-1's
field list invites — an Assistant of an Admin reads the programme. The safe
mapping is: `p_role` stays `"Assistant"` (the actor's role), `p_user_id` stays
the actor (to preserve `created_by = actor` and the legacy `preacher_id = actor`
term the decision note is removing), and only `p_assigned_preacher_id` becomes
the owner. The documents never say this.

The same split is under-specified in three other places:

- `lib/supabase/manage.ts:559-563` narrows sessions to
  `preacher_id === staff.userId || created_by === staff.userId`. If that is
  replaced by "filter by `patchOwner.userId`" as the decision note says, the
  `created_by = actor` term disappears and legacy Assistant-created sessions
  vanish from `/manage` while remaining in `/sessions`.
- `components/manage/manage-types.ts:24-33` (`ManageScope`) has one
  `staffUserId`, and `ManageContactsPayload` passes only that to the grid
  (`manage-contacts-table.tsx:1407`). Carrying actor and owner separately
  requires a second field; the documents say "carry actor and patch owner
  separately" but do not name the contract change.
- `lib/dashboard/live.ts:56-61` filters the live band on
  `scopePreacherId` only; it is consistent today but is another place the actor
  term must be considered once the resolver changes.

**Impact.** The most likely implementation of AD-1/AD-2 widens the Assistant to
the programme in `/sessions` (a security regression) or silently drops their own
created rows from `/manage` (the "write vanishing" failure AD-2 says it
prevents).

**Fix.** Add one sentence to AD-2: "Only `patchOwner.userId` and
`patchOwner.locationIds` flow into a scope; the scope's `userId`/`role` remain
the actor's, so `p_role` is never the supervisor's role." Then name the
`ManageScope` second id and the `manage.ts` three-term session predicate.

### F5 — Medium-High — `/api/contact` is bound by AD-2 but omitted from AD-3's role set, and its collector is the preacher, not the actor

**Claim.** AD-2 binds `apps/*/app/api/{sessions,contact,manage}/**` and says
`collected_by_id` carries `actor`. AD-3 puts `/contact` in
`OPERATIONAL_ROLES = ["Admin", "Preacher", "Assistant"]`.

**Reality.** `apps/folk/app/api/contact/route.ts` has **no** `requireRole`
call (`:86-155`); any authenticated staff member, including a Volunteer, can
create a contact there, and the page is similarly ungated
(`apps/folk/app/contact/page.tsx:11-30`). Its collector is
`Volunteer/Assistant ? staff.userId : assignment.preacher.id` (`:136-137`), so
an Admin-created contact records the chosen preacher as collector — the
opposite of AD-2's "actor" rule. `createManageContact` records the actor
(`lib/supabase/manage.ts:1211-1212`), so the two create paths already disagree.
The change list names the route only for `preacher_id` / `assigned_preacher_id`
stamping.

**Impact.** If AD-3's operational role set is applied to `/api/contact`,
Volunteers lose the only contact-creation path they have — a regression the
documents never mention. If it is not applied, AD-3's "a page and its handlers
use the same set" is false for `/contact`.

**Fix.** Either add a `CONTACT_CREATE_ROLES` (Admin/Preacher/Assistant/Volunteer)
or state that `/contact` keeps its current admission and is deliberately outside
the operational set. Add the collector change (`collected_by_id = actor`) to the
`/api/contact` bullet. Also add `apps/folk/app/contact/page.tsx:18-27` to the
resolver change list: it calls `findStaffUserById` inline and does **not** check
`Active`/role, unlike `lib/sessions/scope.ts` — the Gita Life page does not have
this block.

### F6 — Medium — the RLS change list omits the same-program condition

**Claim.** AD-1 requires the supervisor to be "in the same program"; AD-4 says
`caller_assigned_preacher_id()` and `caller_effective_location_ids()` must
require `Active` **and** role in (`Preacher`, `Admin`), and that helper and app
predicates are identical.

**Reality.** Both helpers join only on `p.id = u.assigned_preacher_id` plus
status checks (`20261006010000:70-83, 88-108`). The app's
`findStaffUserById` is program-scoped (`lib/supabase/data.ts:352-359`), so on a
cross-program assignment the app returns `null` and the database still returns
the foreign id. Per-table `program_id` filters neutralise most of that today,
but the stated equality is not implemented by the named change.

**Impact.** The "database predicate equals the app predicate" invariant is
false for a bad row in a way that will be hard to see: the app says empty, the
helper says non-null, and only the surrounding program filter prevents a read.

**Fix.** Add `AND p.program_id = u.program_id` to both helpers (and to the
`caller_can_read_attendance_session()` join), or state explicitly that the
per-table `program_id` filter makes the check redundant and why that is
acceptable.

### F7 — Medium — "the existing empty-scope explanation" exists only on `/dashboard`

**Claim.** AD-3: "For an Assistant with a null patch, the operational surfaces
render the existing empty-scope explanation rather than a redirect loop."

**Reality.** Only the dashboard has that state and copy
(`components/dashboard/dashboard-header.tsx:99-106`;
`components/dashboard/candidates-route.tsx:114-118`). `/contacts` redirects
non-operational roles today (`lib/contacts/section-server.ts:42-44`) and its
empty state is a generic "no contacts" panel
(`apps/folk/app/contacts/page.tsx:31-34`). `/manage` renders only the
preacher-mode notice, whose copy says "scoped to your own staff account"
(`components/manage/manage-portal.tsx:167-171`) — wrong for an Assistant reading
the supervisor's patch. `/sessions` has no unassigned explanation; it renders
its ordinary "No sessions yet" empty state.

**Impact.** The implementation will either invent copy per surface without a
decision or land an Assistant on a blank page with no explanation — the exact
outcome the sentence says it avoids.

**Fix.** Replace "the existing empty-scope explanation" with the per-surface
list: dashboard copy exists; contacts/manage/sessions need a named state and
copy; and the manage notice must say "the supervisor's patch", not "your own
staff account".

### F8 — Medium — the locations read deliberately exceeds `owner.locationIds`

**Claim.** AD-2: "locations: `owner.locationIds`." AD-4: "A read through the
service-role client passes the same `patchOwner` id."

**Reality.** `loadContactsSectionData` reads **every** programme location with
the service role so an in-scope contact at an out-of-scope location still gets a
name; only `locationOptions` is narrowed to the reader's ids
(`lib/supabase/manage.ts:760-767, 788-806, 846`). Applying AD-2/AD-4 literally
would render those rows as "Unknown location", which the code comment says is
indistinguishable from a deleted location.

**Impact.** An implementer following the rule will regress a documented,
deliberate behaviour while believing they are enforcing scope.

**Fix.** Add the exception to AD-2/AD-4: "locations naming is programme
reference data read with the service role; the picker, the write validation and
every other location read are owner-scoped." (`assertProgramLocations` already
uses the RLS client, so the write side is consistent.)

### F9 — Medium — the matcher-gap inventory is short one surface family

**Claim.** AD-3: "The session-refresh matcher covers every newly admitted
surface: `/manage` and `/api/manage/*` are the known gap."

**Reality.** `/admin/**` pages are also outside every matcher
(`proxy.ts:9-23`, `apps/folk/proxy.ts:9-23`, `apps/gita-life/proxy.ts:9-23`),
including `apps/folk/app/admin/invite/page.tsx`. That is an existing
staff-administration surface, not a newly admitted one, so the sentence is not
literally false — but the gap list reads exhaustive, and the fix list names only
the manage pair. There are also three matcher copies; Next reads the app-level
`config`, so editing only the root copy ships nothing (the same trap as the
three `public/sw.js` copies).

**Impact.** The change can close `/manage` and leave a second refresh gap
unmentioned; a later editor can patch the wrong matcher copy.

**Fix.** Add `/admin/:path*` to the gap list and say which copies must change
(`apps/folk/proxy.ts` and `apps/gita-life/proxy.ts`; keep the root copy in
step).

### F10 — Medium-Low — "staff role/status/supervisor changes" names a surface that does not exist, and role changes already happen outside Admin

**Claim.** AD-3 and the decision-note table: `STAFF_ADMIN_ROLES = ["Admin"]`
covers "staff role/status/supervisor changes".

**Reality.** There is no staff-management page or route. `upsertStaffUser` has
exactly two callers: the Admin invite route
(`apps/folk/app/api/admin/invite-user/route.ts:63`) and the volunteer invite
route (`apps/folk/app/api/volunteers/invite/route.ts:109`), which is
Admin+Preacher and can promote an existing Volunteer to Assistant
(`:95-115`, with `normalizeInviteRole` at `:17-27`). So a Preacher can change a
role today, and the claimed Admin-only surface does not exist.

**Impact.** The role-set description misstates the current permission model and
would make the Preacher's promotion path look like a new hole after the change.

**Fix.** Drop "staff role/status/supervisor changes" from the list or name the
volunteer-invite promotion as the existing exception, and state whether it
survives an Admin-supervisor world (its error copy still says "Preacher").

### F11 — Low — `/admin` root is an ungated redirect to `/manage`

`apps/folk/app/admin/page.tsx:5-7` redirects to `/manage` with no role check.
`/admin/invite` is Admin-gated, so the `/admin/**` Admin-only claim is true for
the real pages but not for the root. Once `/manage` admits Assistant, `/admin`
becomes an Assistant-reachable redirect. Harmless, but worth correcting in the
document or gating the redirect.

### F12 — Low — "the only identity read" is an overstatement

`lib/supabase/proxy.ts:25` and both
`apps/*/app/api/auth/complete-implicit/route.ts:12` call
`supabase.auth.getUser()`. `getStaffContext()` is the only **staff/role** read.
Worth rewording, because the proxy's read is exactly what makes the matcher
change load-bearing.

### F13 — Low — the bind list over-generalises `apps/*` for campaigns

`apps/gita-life/app` has no `campaigns` directory (dialer is module-gated, and
the header renders no Campaign item when `modules.dialer` is false —
`components/header.tsx:69-77`). The `apps/*/app/{...,campaigns,...}` bind is
inaccurate for Gita Life. Not harmful, but it implies work that does not exist.

### F14 — Low — the documents the spine inherits are stale

The spine lists `docs/architecture.md` and `docs/data-models.md` as sources and
says the staff boundary is inherited from them. Both are behind the code:

- `docs/architecture.md:156` says `POST /api/sessions` requires Admin or
  Preacher; the route now also admits Assistant
  (`apps/folk/app/api/sessions/route.ts:150`).
- `docs/architecture.md:160` says Preachers invite Volunteers only; the route
  also invites Assistants (`apps/folk/app/api/volunteers/invite/route.ts:17-27`).
- `docs/architecture.md:164` says `/manage` is restricted to Admin and Preacher
  — true today, about to change.
- `docs/data-models.md:235` omits the assistant-created sessions term
  (`created_by = ANY(caller_assistant_user_ids())`), and `:236` has a malformed
  "(Preacher/Assistant ∨ Assistant)".
- `docs/data-models.md:225` documents the helpers as Active-only; correct today,
  stale after F6's change.

**Fix.** Refresh these in the same change, or stop calling them authoritative
sources in the spine.

### F15 — Low — the Stack table records declared floors, not pins

`@supabase/supabase-js` is `^2.105.1` in `package.json:102`; the lockfile
resolves 2.105.1 (`pnpm-lock.yaml:104-106, 1524`). TypeScript is `^5`
(`package.json:143`) and resolves 5.7.3. Both are correct today but can move
without an edit to the spine. Next, React, pnpm and Postgres are exact. If the
table is meant to be a pin list, write "2.105.1 (declared ^2.105.1)" or add
"resolved from lockfile". The Supabase CLI is pinned at 2.98.2
(`package.json:27-30`) and is absent from the table; not a mismatch, but the
table is incomplete as an environment inventory.

### F16 — Low — the sessions policy's assistant-created term is wider than AD-4's wording

AD-4 says the target sessions policy is "the AD-2 predicate for an Assistant,
plus the Preacher's own-patch and assistant-created term." The current policy
applies the assistant-created term to any Preacher **or Assistant**
(`20261101000000:44-51`), while `sessions_visible` gates it to Preacher
(`:95-103`). With an impossible-but-possible row (a user assigned to an
Assistant), the database grants rows the app does not. State that the target
policy keeps that term Preacher-only.

## Claims that are target state, not current behaviour — not defects

These read as current-behaviour assertions but are design intent; they are
listed so a later reviewer does not "fix" them as false claims:

- `patchOwner` does not exist yet; AD-1 is the new contract.
- `OPERATIONAL_ROLES`, `VOLUNTEER_INVITE_ROLES` and `STAFF_ADMIN_ROLES` are not
  constants today; each site repeats inline arrays
  (`lib/contacts/section-server.ts:42`, `lib/manage/api-handlers.ts:253 et al.`).
- "An Assistant's manage/contacts payload always reports `role: "Preacher"`" is
  already true for `role` (`lib/supabase/manage.ts:733, 836`) but not for
  `mode`, which follows the query string (`resolveManageMode`,
  `components/manage/manage-types.ts:263-265`). The note correctly asks for the
  mode change.
- "A draft row shows the owner as assigned and the actor as collector" is
  future behaviour; today both fields are the same id
  (`manage-contacts-table.tsx:273-278`).
- "User-facing copy says Supervisor" is future behaviour; the current copy says
  Preacher in the contact form, invite form and invite errors
  (`components/contact-form.tsx:216-219, 350-356`;
  `components/invite-user-form.tsx:267`; `api/volunteers/invite` error strings).

## Not verified

- No e2e run, no unit run, no `pnpm test:static`; the review is static.
- RLS was read, not executed. The claims about row visibility follow from the
  SQL text; a live `scripts/verify-rls.mjs` run (mentioned in
  `docs/data-models.md`) would be the behavioural confirmation.
- `supabase/seed.sql` is a 3-line stub, so there is no local fixture data to
  check the "bad assignee" pre-deploy query against. The decision note's
  request to "check for such rows before deploying" cannot be exercised from
  this repo.
- The remote database's Postgres major version is not in the repo; the Stack
  table's "17" is the local config pin (`supabase/config.toml:36`), which the
  file itself says must match the remote.

## Suggested minimal edits (ordered)

1. Add a sentence to AD-2 that only the owner id and locations flow into scope;
   keep `p_role`/`userId` as the actor's, and name the `ManageScope` second id.
2. Bind and define `/attendance` (both apps), including the date view.
3. Add `apps/gita-life/app/sessions/page.tsx` and
   `apps/folk/app/contact/page.tsx` to the resolver change list.
4. Resolve the campaigns contradiction: either `campaignScope` consumes
   `patchOwner`, or AD-1 exempts it explicitly.
5. Add `/api/contact`'s admission and collector rule, and decide the Volunteer
   path.
6. Add the same-program check to the RLS change list (or justify its absence).
7. Replace "the existing empty-scope explanation" with per-surface states and
   fix the manage notice copy.
8. Add the location-naming exception to AD-2/AD-4.
9. Extend the matcher gap list to `/admin/**` and name all three matcher copies.
10. Refresh the stale lines in `docs/architecture.md` and
    `docs/data-models.md`, or demote them from "sources".
