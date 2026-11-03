# Decision note — Admins can have Assistants

Date: 2026-11-03
Status: decided
Spine: [`ARCHITECTURE-SPINE.md`](ARCHITECTURE-SPINE.md)

## The question

Can an Admin have an Assistant, and if so, what does that Assistant see?

## Decision

**Yes. An Admin may supervise an Assistant, and the Assistant inherits the Admin's personal patch — not the programme.**

An Assistant remains one construct whether the Preacher they assist is an Admin or a Preacher:

> An Assistant mirrors the assigned Preacher's personal patch and operational surfaces. Staff administration stays with that person's staff role.

Three supporting decisions:

1. **Scope:** the patch, not the programme. The patch is the rows the assigned Preacher personally owns, defined by the same predicate the Admin's existing "Own scope" dashboard view uses.
2. **Capability:** an Assistant gains the assigned Preacher's operational surfaces — contacts overview/grid/reports, the manage portal, sessions, dashboard, the staff attendance read and the contact form — on that patch.
3. **Naming:** `assigned_preacher_id` keeps its name. Its contract becomes "assigned Preacher (Active Preacher or Admin)"; the UI keeps the label **Preacher** for both.

**Terminology.** "Supervisor" is an internal shorthand in this note and the spine for the assigned Preacher. It is not a staff role and must not appear in user-facing copy.

## What an Assistant can open

| Surface | Before | After | Scope |
| --- | --- | --- | --- |
| `/contact`, `/api/contact` | all four roles | unchanged | existing form assignment rule |
| `/sessions` | Assistant | Assistant | patch |
| `/dashboard` | Assistant | Assistant | patch |
| `/campaigns` admin surface | Assistant | Assistant | patch through `campaignScope` |
| `/campaigns/assignments` | any active caller | unchanged | assignment, not patch |
| `/attendance` (staff GET) | Assistant | Assistant | **patch**; a date-wide read is Admin-only |
| `/contacts` overview, grid, reports | Admin, Preacher | **Assistant** | patch |
| `/manage` | Admin, Preacher | **Assistant** | patch |
| `/api/manage/contacts/**` (create, update, delete, bulk, photo) | Admin, Preacher | **Assistant** | patch |
| `/volunteers`, `/api/volunteers/invite` | Admin, Preacher | **Preacher only** | staff invite; Admin uses `/admin/invite` |
| `/admin/**`, staff role/status/supervisor changes, location creation, caller deactivation | Admin | unchanged | staff administration |

The operational surface set is `["Admin", "Preacher", "Assistant"]`, defined once and used by both a page and its handlers. A page must not admit Assistant while its write API still refuses them. `/contact` is separate: it stays open to all four roles, and a Volunteer keeps the form-only path.

## Binding an Assistant to an assigned Preacher

- An eligible assigned Preacher is an `Active` user in the same programme with role `Admin` or `Preacher`.
- An Admin may bind an Assistant to any eligible assigned Preacher, including moving an existing Assistant. A Preacher may bind only to themselves. An Assistant or Volunteer cannot invite.
- Both invite paths use one eligibility helper. `/volunteers` is the Preacher's surface and stays self-only; an Admin invites from `/admin/invite`, where the **Assigned Preacher** picker lists both Admins and Preachers, with each person's role shown beside the name.
- Binding lifecycle by destination role:
  - **Admin or Preacher:** clear `assigned_preacher_id`.
  - **Assistant:** require an eligible Admin or Preacher.
  - **Volunteer:** require an eligible Preacher; if the current supervisor is an Admin, clear it and require a Preacher. The binding is the Volunteer's form routing, not a scope grant.
- `upsertStaffUser()` needs an explicit null path; omitting the field is not a clear.
- A missing or ineligible assigned Preacher at read time yields an empty patch, never a widening.

## The patch predicate

Summary only; the spine's AD-3 and AD-4 are authoritative. For `owner = patchOwner` and `actor = the signed-in staff member`:

| Data | Predicate |
| --- | --- |
| Contacts | `assigned_preacher_id = owner.userId` |
| Sessions | `preacher_id = owner.userId OR created_by = owner.userId OR created_by = actor`; a Preacher also sees sessions created by their active assistants |
| Attendance | through a session in the patch |
| Locations | `owner.locationIds` for every picker and write check |
| Dashboard (Admin) | programme by default; `?mode=preacher` narrows to `scope_preacher_id = admin.userId` |
| Dashboard (Preacher) | `program_scope = false`, `scope_preacher_id = self` |
| Dashboard (Assistant) | `program_scope = false`, `scope_preacher_id = owner.userId` |
| Campaigns (Admin) | `{kind:"program"}`, creator-only campaign list |
| Campaigns (Preacher/Assistant) | `{kind:"preacher"}`, `userId = owner.userId`; assignable callers = staff assigned to the owner + actor + owner |
| Contact create (grid) | `assigned_preacher_id = owner.userId`; `collected_by_id = actor` |
| Session create | `preacher_id = owner.userId`; `created_by = actor` |
| Grid update | ownership and collector are preserved; an edit is not a reassignment |
| `/contact` form | Volunteer → Preacher; Assistant → their assigned Preacher (Admin or Preacher); Preacher → self; Admin → explicitly chosen Preacher, and that picker stays Preacher-only; collector keeps its existing rule |

A scope function receives `p_actor_id`, `p_actor_role`, `p_owner_id` and `p_owner_location_ids`; it never receives the owner's role. `dashboard_overview` and `campaign_progress` are owner-only by decision; an Assistant's own created sessions are stamped `preacher_id = owner`, so they are included without an actor parameter.

`patchOwner` is resolved once by `getStaffContext()`:

- Admin or Preacher → themselves;
- Assistant → the `public.users` row at `assigned_preacher_id`, only when it is `Active`, in the same programme, and role `Admin` or `Preacher`;
- otherwise → `null`, which yields zero rows on every operational surface and a surface-specific explanation.

`assignedPreacherUserId` stays on `StaffContext` as the raw FK. `patchOwner` is server-only; one `toClientStaff()` projection serves `/api/auth/me`, `/api/auth/complete-implicit`, `/api/auth/signin` and every `StaffAuthShell`, keeping the existing client fields (`name`, `email`, `role`, `hasActiveCallerProfile`) and adding `hasPatchScope`, `supervisorName`, `supervisorRole` and the nav capability flags, never `locationIds`.

For the same role and patch, `/manage` uses the same session predicate as `/sessions`; the Admin's `/sessions` creator-only filter is the only documented narrowing.

## Why not programme scope

If an Admin's Assistant inherited the Admin's programme-wide reach, an Assistant would read every contact, session and attendance row in the programme without being an Admin. That collapses the role distinction: the app would have two programme-read roles and no rule for what the Assistant cannot do. The patch model keeps a single invariant — an Assistant never exceeds the assigned Preacher's personal scope — and it reuses the Admin's existing "Own scope" definition rather than inventing a second one.

If the real need is "help me run the whole programme", that is a new role or an explicit capability decision. It is not this change, and it should not arrive through the invite form.

## Naming

The column and the TypeScript field keep their names:

- `public.users.assigned_preacher_id`
- `StaffContext.assignedPreacherUserId`

Their contract is the assigned **Preacher** — an Active Preacher or Admin whose personal patch an Assistant shares. All user-facing copy keeps the word **Preacher**: "Assigned Preacher", "your Preacher", "assign you to a preacher". This is the same label whether the assigned person's role is Admin or Preacher; the picker shows the role beside the name ("Anand — Admin") to disambiguate. "Supervisor" is internal only and must not appear in user-facing copy. That includes route error messages, form labels, dashboard notices and empty-state copy. No `supervisor_user_id` column, view or alias is introduced. A rename is not planned; the stored name already matches the label.

## What has to change

### Resolver, DTO and navigation

- `lib/authz.ts` — resolve `patchOwner` in `getStaffContext()` with the admin client; keep `assignedPreacherUserId` as the raw FK.
- `components/staff-auth-shell.tsx`, `apps/*/app/api/auth/{me,complete-implicit,signin}/route.ts`, `lib/auth-context.tsx` — one `toClientStaff()` projection; no `patchOwner.locationIds` in any RSC or route payload.
- `lib/dashboard/scope.ts`, `lib/sessions/scope.ts`, `lib/sessions/data.ts`, `lib/dialer/scope.ts` — read `patchOwner`; pass the full actor/owner vector.
- `apps/gita-life/app/sessions/page.tsx` — remove the inline supervisor resolver; use `patchOwner.locationIds`.
- `apps/*/app/contact/page.tsx` — resolve the supervisor from `patchOwner`; an Assistant of an Admin gets the Admin's locations.
- `apps/*/app/api/sessions/route.ts` — use `patchOwner` for the owner and locations; remove the `findStaffUserById` + `Preacher` re-check; refuse a null patch.
- `apps/*/app/api/contact/route.ts` — an Assistant may resolve an Admin supervisor; keep the form's per-role assignment and collector rule.
- `lib/supabase/manage.ts`, `lib/contacts/section-server.ts`, `lib/manage/api-handlers.ts`, `components/manage/*` — filter by `patchOwnerId`/`patchOwnerLocationIds`; carry `actorUserId`/`patchOwnerId` separately; a draft row shows the owner as assigned and the actor as collector; the loader owns `mode`.
- `apps/*/app/attendance/route.ts` — patch-scoped date reads for non-Admins; programme-scoped for an Admin's `?session=` and `?date=` reads.
- `components/header.tsx` — capability flags from the DTO, never `isPreacher`; no Invite item for an Assistant.

### Invite path

- `apps/*/app/api/admin/invite-user/route.ts`, `apps/*/app/api/volunteers/invite/route.ts` — one `resolveEligibleSupervisor()` helper; Admin may choose any eligible supervisor; Preacher self-only.
- `components/invite-user-form.tsx` — the **Assigned Preacher** picker lists Admins and Preachers, with each person's role shown beside the name; the field label stays "Assigned Preacher"; do not introduce "Supervisor".
- `lib/supabase/data.ts` — keep `listCachedActivePreachers()` Preacher-only for the Admin's `/contact` picker, and add `listCachedAssignablePreachers()` for the invite picker so the cache tag does not lie and the contact picker does not widen.
- `upsertStaffUser()` — explicit null path; clear for Admin/Preacher, require a Preacher for Volunteer, require an eligible Admin/Preacher for Assistant.
- `apps/*/app/volunteers/**`, `apps/*/app/api/volunteers/invite/route.ts` — restrict to the Preacher's self-only surface; an Admin uses `/admin/invite`.

### Surfaces and matcher

- `/contacts/**`, `/manage`, `/api/manage/contacts/**` — admit Assistant; force the personal-patch view for an Assistant (`mode:"preacher"`, `role:"Preacher"` as a view descriptor), even when the supervisor is an Admin.
- `apps/folk/proxy.ts`, `apps/gita-life/proxy.ts` — add `/manage/:path*`, `/api/manage/:path*`, `/admin/:path*` and `/attendance`.
- `/manage` and `/contacts` need their own null-patch copy; the dashboard's `assistantUnassigned` notice is not reusable verbatim.
- UI copy keeps "Preacher" for both an Admin and a Preacher assigned Preacher; do not replace it with "Supervisor". Update only the eligibility/error strings that currently reject an Admin, e.g. "Assigned Preacher must be an active Preacher" → "The assigned Preacher must be active." "Ask an Admin to assign your Preacher" stays. Files: `components/dashboard/dashboard-header.tsx`, `components/dashboard/dashboard-page.tsx`, `components/manage/manage-portal.tsx`, `components/dashboard/candidates-route.tsx`, `components/contact-form.tsx`, `components/invite-user-form.tsx`, and the route errors in `api/contact`, `api/sessions`, the invite routes and `admin/invite-user`. The manage portal's "your own staff account" notice still needs scope-specific copy; that is not a Preacher label.

### Database

- `caller_assigned_preacher_id()`, `caller_effective_location_ids()` — Active + same programme + role `Admin`/`Preacher`; the Volunteer location branch is the form's reference list, not a patch.
- `caller_can_read_attendance_session()`, `sessions_visible` — the exact booleans in AD-5; drop `preacher_id = actor` for an Assistant, keep `created_by = actor`; a null owner yields zero rows.
- Contacts/sessions/attendance/locations policies — the Assistant branch only, keeping the programme term and the other role branches; the Admin branch stays programme-wide. Gate every `caller_assigned_preacher_id()` term on `caller_role() = 'Assistant'`.
- Service-role reads that **replace** a caller-scoped read pass the patch vector; reference reads (location naming, staff names, the caller's own row, the dialer roster) are exceptions.
- `dashboard_overview` is owner-only; its `programme_attendance` CTE is a programme-wide KPI input, recorded as such.

## Conflicts with existing docs and specs

This decision changes statements that other artifacts treat as settled. Update them in the same change; do not let them silently diverge.

| Artifact | Current statement | Effect |
| --- | --- | --- |
| `_bmad-output/specs/spec-contacts-section/SPEC.md:45,128` | Assistants are redirected from `/contacts*` to `/contact` | Superseded: Assistants open the contacts section on their patch |
| `_bmad-output/specs/spec-program-dashboard/SPEC.md:64` | A non-Preacher assignment is an empty scope | Superseded: an Admin can be the assigned Preacher |
| `docs/architecture.md` Role Matrix | `/manage` and contacts are Admin/Preacher | Update the Assistant row |
| `docs/api-contracts.md:295` | Volunteer and Assistant invites require an active Preacher | Update to "Assistant: active Admin or Preacher; Volunteer: active Preacher" |
| `_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md` AD-13 | `/api/manage/contacts/**` is fixed at `["Admin", "Preacher"]` | Superseded for the manage gate; the Campaign admin/caller split and AD-2 role set are unchanged |
| `docs/data-models.md` | `assigned_preacher_id` is Volunteer/Assistant routing through a Preacher | Update the contract to assigned Preacher (Admin or Preacher) |
| `apps/*/proxy.ts` | `/manage`, `/api/manage/*` and `/attendance` are outside the matcher | Known gap becomes load-bearing; fix in this change |

**Required sibling update.** Edit the autodialer spine's AD-13 sentence to cite this spine and use `OPERATIONAL_ROLES` for `/api/manage/contacts/**`, or mark AD-13 amended. The autodialer file is `status: final`; leaving it unchanged lets a unit quote a final two-role gate. Add a test or matrix assertion that the manage write gate equals `OPERATIONAL_ROLES`.

## Consequences and risks

- **It expands Preacher Assistants too.** A Preacher's Assistant also gains the contacts grid, reports and manage portal on the Preacher's patch. That is deliberate: one Assistant construct, not an Admin-only variant. If that is unwanted, the alternative is two role variants, which is more divergence for no clearer rule.
- **An Admin's Assistant sees only the Admin's patch.** If the Admin owns few contacts or sessions, the Assistant's view is correspondingly small. This is the model, not a bug. Programme-wide help is a different decision.
- **Writes must be stamped to the owner.** If an Assistant's contact is stamped with their own id, it falls outside both the assigned Preacher's patch and the Assistant's RLS scope — it disappears from the view that just created it. The owner/actor split is the guard.
- **The "Preacher" label now covers an Admin.** The role shown beside the name is the only disambiguator; keep it in the picker and in any summary that names the assigned Preacher. Dropping the role makes the UI read as a role error.
- **A null patch changes the sessions fallback.** Today an Assistant with no active supervisor keeps the sessions they created; after this change a null patch yields zero rows everywhere. This is a deliberate tightening. The pre-deploy audit counts the affected rows; decide repair, reassign or accept before the migration.
- **`/attendance?date=` is currently programme-wide.** The staff GET falls through to an unscoped service-role date query. This is a pre-existing bug; the feature makes it reachable by more Assistants, so the change must scope it.
- **Attendance RLS is currently narrower than the session predicate.** `caller_can_read_attendance_session()` matches `preacher_id` only, so a session the supervisor created but another preacher led would show in `/sessions` and disappear from `/manage` attendance. The migration must align them, including the actor and Preacher-assistant terms.
- **Two tightenings need a data audit.** An Assistant assigned to a non-Preacher/non-Admin row loses scope when the helper gains the role check. An Assistant who is `preacher_id` but not `created_by` loses that legacy row when `preacher_id = actor` is removed. Count both, plus Assistants with no eligible assigned Preacher who created sessions, plus Assistants with a valid assigned Preacher who are `created_by` but not `preacher_id` (the `/manage` actor-term shape), and record the decision in the migration PR.
- **A change of assigned Preacher does not rewrite history.** Sessions and contacts created under the old assigned Preacher keep their old `preacher_id`/`assigned_preacher_id`; they stay in the old patch and leave the new assigned Preacher's dashboard. That is intentional, not a sync failure.
- **`collected_by_id` is not unified.** The `/contact` form records the assigned preacher for Admin/Preacher, while the grid records the actor. The feature preserves both because changing the form would alter existing reporting. Unifying them is deferred.
- **The Admin's `/sessions` filter is creator-only**, while the dashboard's own scope includes `preacher_id` or `created_by`. The Assistant patch follows the dashboard definition, so an Assistant of an Admin may see sessions the Admin preached but did not create, while the Admin's own `/sessions` list does not. Aligning the Admin page is deferred.
- **The autodialer AD-13 gate is superseded.** The Campaign admin/caller split, role set and behavior are unchanged; only the manage contacts gate and the campaign scope helper's owner id change. The autodialer spine and `docs/architecture.md` role matrix must be edited in the same change.
- **The proxy matcher becomes load-bearing.** Next 16.0.7 is affected by CVE-2026-44575 (middleware/proxy bypass, fixed in 16.2.5). This feature does not rely on the proxy for authorization — every page and handler calls `getStaffContext()` — but the framework upgrade should be scheduled before production exposure.

## Verification

- Unit tests for `patchOwner` resolution: Admin self, Preacher self, Assistant with an Active Admin, Assistant with an Active Preacher, Assistant with an inactive or wrong-role assignee, cross-programme assignment, Volunteer null.
- Unit tests for the binding lifecycle: Admin may choose an Admin or Preacher; a Preacher's invite is self-only; Assistant → Preacher/Admin clears; Assistant → Volunteer requires a Preacher; a role change uses an explicit null path.
- Unit tests for the patch predicate on contacts, sessions, manage and campaign scope; a write attribution test that an Assistant-created contact is owned by the assigned Preacher and collected by the Assistant; a same-contact-through-both-paths test is **not** expected to agree until `collected_by_id` is unified.
- A copy check that no user-facing string renders "Supervisor": the assigned person is labelled "Preacher" in both cases, with the role shown where the person is named.
- RLS tests with `node scripts/verify-rls.mjs` (and its `.env.migration.local` prerequisite): the assignee role/programme check, the attendance predicate, the stale-FK gate, a session that `/sessions` shows and `/manage` must count, and the null-patch zero-row behavior. Add fixtures for an Admin-supervised Assistant and a wrong-role assignee.
- E2E: an Admin invites an Assistant assigned to themselves; the Assistant opens `/contacts`, `/manage`, `/sessions`, `/dashboard` and `/attendance` and sees the Admin's patch, not the programme; a Preacher's Assistant sees the Preacher's patch; a Volunteer still sees only the contact form and the caller queue; an Assistant with no eligible supervisor gets the per-surface empty state and no dead Contacts/Manage/Invite items.
- Run `pnpm test:static`, `pnpm test:unit`, and the relevant `pnpm test:e2e:*` scripts. `/manage`, `/contacts` and `/attendance` are shared surfaces, so run the full `pnpm test:e2e` before a PR.

## Deferred

- Renaming `assigned_preacher_id`: not planned. The stored name already matches the UI label.
- Programme-scope Assistants. If an Admin needs programme-wide help, that is a new role or capability decision.
- Per-assistant surface flags. The role stays one construct.
- Admitting Assistants to `/volunteers`. Staff invite remains outside the operational set.
- Unifying `collected_by_id` between the contact form and the grid.
- Unifying the Admin's `/sessions` creator-only filter with the dashboard's personal-scope predicate.
- Deployment, environments and provider topology: inherited unchanged; no new service, table or environment variable.
