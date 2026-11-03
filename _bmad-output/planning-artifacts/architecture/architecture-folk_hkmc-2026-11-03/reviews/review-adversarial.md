# Adversarial review — Staff scope: Admin supervisors and Assistant surfaces

- **Artifact:** [`../ARCHITECTURE-SPINE.md`](../ARCHITECTURE-SPINE.md), companion [`../DECISION-admin-assistants.md`](../DECISION-admin-assistants.md)
- **Verdict:** **pass-with-fixes** — the direction is right, but six P0 holes let two AD-compliant units build incompatible behaviour. No unit should start until the P0 clauses are added.
- **Baseline:** `66e72a2` (working tree has unrelated `components/campaign/*` edits; not used for this review)
- **Method:** for each AD, construct two units one level down that each follow the AD's literal text and still disagree at a seam. Every seam is checked against the code, not against the prose.

## What the spine gets right

Worth stating so the fixes below are read as targeted, not as a rejection:

- The **owner/actor split** is the correct guard. An Assistant-stamped contact really does fall outside both the supervisor's patch and the Assistant's RLS scope (`DECISION` §Consequences), and the code's single `staff.userId` stamping (`lib/supabase/manage.ts:1211-1212`) is exactly that bug.
- **Null owner = empty patch, never a widening** is the right default and matches what `resolveDashboardScope` already does (`lib/dashboard/scope.ts:83-96`).
- **"The service role is never a second scope definition"** is the correct principle. It is also the principle the code most often breaks (`sessions_visible` in F3, the campaign path in F4, the dashboard RPCs in F3).
- **AD-4's parity goal** (database predicate = app predicate) is the only way `/manage` and `/sessions` can stop disagreeing, and it is the right thing to adopt.

---

## Findings

Severity is the cost of getting it wrong after build starts, not the size of the prose change.

| ID | Severity | AD touched | Hole in one line |
| --- | --- | --- | --- |
| F1 | High | AD-2 | `ManageScope` has one id where the AD requires two; `staffUserId` is read as actor and as owner by different code. |
| F2 | High | AD-1, AD-3 | AD-3 puts `/contact` in `OPERATIONAL_ROLES`, which deletes the Volunteer write path or forces a null owner. |
| F3 | High | AD-2, AD-4 | The Admin's sessions predicate has three different answers and no AD picks one. |
| F3b | Medium | AD-2, AD-4 | Attendance: AD-4 enumerates `preacher_id` + owner `created_by`; AD-2's patch also includes `created_by = actor`, and `/sessions` counts with the service role. |
| F4 | High | AD-1, AD-2 | Campaigns are explicitly frozen, so the assignee role check and null-patch rule never reach the only service-role scope that matters. |
| F5 | High | AD-2 | `/api/contact` and `/api/manage/contacts` stamp the same row differently, and the Admin form requires an owner that AD-2 forbids. |
| F6 | High | AD-1, AD-4, AD-5 | Two invite routes write one binding with two predicates; a role change leaves a stale raw FK that RLS still honours. |
| F7 | Medium | AD-3 | The header has one overloaded `isPreacher` boolean; satisfying Contacts+Manage also exposes Invite, and Campaign survives a null patch. |
| F8 | Medium | AD-1, AD-4 | `patchOwner` is defined with `name` and `locationIds` and `StaffContext` is serialized whole to the browser. |
| F9 | Medium | AD-2 | "Locations = owner.locationIds" names no field; four call sites still read `staff.locationIds`, which is empty for an Assistant. |
| F10 | Medium | AD-2 | `mode` has two authors (page and loader); both can claim to enforce the Assistant's forced personal view. |
| F11 | Medium | AD-3 | Three proxy matchers; editing the root one ships nothing, and the Assistant's session refresh depends on the app copies. |
| F12 | Low/Med | AD-4 | The helper eligibility omits AD-1's same-program clause, applies to Volunteers, and is not gated on the caller being an Assistant. |
| F13 | Low | AD-5 | The supervisor copy list is incomplete; route error strings and type doc comments still say "Preacher". |

---

### F1 — Two identities, one field (AD-2) — High

**Unit A — "keep the actor, add the owner."** `ManageScope.staffUserId` stays the signed-in user (it already is, `lib/supabase/manage.ts:734`, `:837`), and a new `patchOwnerId` is added for the supervisor. `createDraftContact(payload.scope.staffUserId)` keeps working, `staffNames[staffUserId]` keeps naming the collector.

**Unit B — "the scope's id is the scope's owner."** Read `scope` as the patch's scope, not the actor's: `staffUserId` becomes the patch owner (the name invites it, and `components/contacts/contacts-types.ts:8-11` already says "`P` is the reader's own contacts — `assigned_preacher_id = me`"). Add `actorUserId` for attribution.

**Both comply.** AD-2 says "client payloads carry the actor id and the patch-owner id separately; no component derives one from the other." Both do. Nothing in the AD says which existing field keeps which meaning. Both compile because the field is a plain `string`.

**The break.** `components/manage/manage-contacts-table.tsx:651` maps `scope.staffUserId → scope.staffName` last, so "the signed-in user's own name always wins"; `:1244` uses that map for `collectedById`; `:277-278` prefills **both** `assignedPreacherId` and `collectedById` from the same `staffUserId`:

```ts
assignedPreacherId: staffUserId,
collectedById: staffUserId,
```

Under Unit A, an Assistant's draft row shows the **Assistant as the owner** — the exact failure AD-2's "Prevents" column names ("a draft row showing the actor as owner"). Under Unit B, it shows the **supervisor as the collector**, and `Collector` silently becomes wrong instead of `Owner`. Neither unit's tests fail, because each asserts its own field semantics.

The three payloads already disagree on names for the same pair: `SessionsScope{ userId, assignedPreacherId }` (`lib/sessions/scope.ts:16-26`), `DashboardScope{ userId, scopePreacherId }` (`lib/dashboard/types.ts:200-213`), `ManageScope{ staffUserId }` (`components/manage/manage-types.ts:24-33`). A fourth naming is guaranteed.

**Proposed AD-6 (new) — One name, one meaning.**

> - `StaffContext.userId` is always the actor. `StaffContext.patchOwner` is the resolved owner or null.
> - Every client payload uses the names `actorUserId` and `patchOwnerId`. `staffUserId`, `userId` and `scopePreacherId` are retired or explicitly aliased at the server boundary; no payload may expose a single id whose meaning is not in its name.
> - `ManageContact.assignedPreacherId` is the row owner, `ManageContact.collectedById` is the actor. A draft row sets them from `patchOwnerId` and `actorUserId`, never from one value.
> - `ManageScope.staffName` becomes `actorName`; a supervisor display name is `patchOwnerName`, or is not sent at all (see F8).

---

### F2 — AD-3 deletes the Volunteer write path (AD-1, AD-3) — High

**Unit A — literal AD-3.** `OPERATIONAL_ROLES = ["Admin", "Preacher", "Assistant"]` includes `/contact` (`SPINE:79`), and "every one scopes through `patchOwner`". Apply `requireRole(staff, OPERATIONAL_ROLES)` to `apps/folk/app/contact/page.tsx` and `apps/folk/app/api/contact/route.ts`. A Volunteer now gets a 403 on the form they use at every programme.

**Unit B — preserve the existing contract.** `/contact` has **no role gate today** (`apps/folk/app/contact/page.tsx:11-30`) and `POST /api/contact` admits every staff role, routing Volunteer and Assistant through the assigned preacher (`apps/folk/app/api/contact/route.ts:63-68`). Keep it, because the form is the Volunteer's job and the DECISION's surface table (`DECISION:29`) only discusses Assistant, not Volunteer.

**Both comply.** Unit A follows the role list exactly. Unit B follows AD-1's "null for … a Volunteer" only for *patch* surfaces, and `/contact` is not obviously a patch surface when the actor is a Volunteer. But Unit B then violates AD-2's write rule (`assigned_preacher_id` must carry `owner.userId`, which is null) — and Unit A's behaviour is a product regression the spine never admits to.

**The break.** A Volunteer's contact is either refused, unassigned (invisible to everyone but an Admin in admin mode), or assigned to the supervisor (violating AD-2). Three outcomes, all defensible from the document.

**Proposed AD-7 (new) — The Volunteer write path is not the patch path.**

> - `CONTACT_WRITE_ROLES = ["Admin", "Preacher", "Assistant", "Volunteer"]` governs `/contact` and `POST /api/contact`. `/contact` is therefore **not** part of `OPERATIONAL_ROLES` for the null-patch empty-state rule.
> - The write owner is `patchOwner?.userId ?? assignedPreacherUserId`. A Volunteer with no eligible supervisor is refused with the existing 422 copy; a Volunteer never writes `assigned_preacher_id = null`.
> - If Volunteer collection is being retired, say so in the decision note and change the role's definition. It must not arrive as a side effect of a role-set constant.

---

### F3 — The Admin sessions predicate has three answers (AD-2, AD-4) — High

**Unit A — "one predicate means one predicate."** AD-2's sessions row is unconditional: `preacher_id = owner.userId OR created_by = owner.userId OR created_by = actor`. For an Admin, owner = self. Apply it to the `sessions` RLS policy (AD-4: "the database predicate equals the app predicate") and to `/sessions`.

**Unit B — "predicates stay as their specs define them."** `SPINE:33` says "Dashboard and sessions scope predicates stay as their specs define them; only the owner changes." The sessions predicate is the one in `20261102030000_admin_creator_only_sessions.sql:33`: an Admin reads `created_by = p_user_id` only. Leave it.

**Both comply.** AD-2 gives one predicate for every owner. `SPINE:33` says the spec's predicate wins. They are not the same predicate for an Admin.

**The break.** For an Admin:

| Surface | Predicate today | Evidence |
| --- | --- | --- |
| `/sessions` | `created_by = self` only | `20261102030000:33` |
| `/manage?mode=preacher` | `preacher_id = self OR created_by = self` | `lib/supabase/manage.ts:559-563` |
| `/manage?mode=admin` | **whole programme** | `sessions` RLS Admin term, `20261101000000:42`; no app filter |
| `/dashboard?mode=preacher` | `preacher_id = self OR created_by = self` | `20261102010000:693-697` |

Unit A applying AD-4 to the Admin RLS term **narrows `/manage?mode=admin` from programme to self** — the "All preachers" tab collapses — because `loadManagePortalData` performs no app filter in admin mode and depends on that RLS term. Unit B leaving RLS alone means AD-2's predicate is false for Admins on every surface, and `/sessions` still hides sessions the Admin preached but did not create.

AD-4's own wording only states the Assistant and Preacher terms ("The sessions policy is the AD-2 predicate for an Assistant, plus the Preacher's own-patch and assistant-created term"), so the Admin term is genuinely unstated.

**Proposed tighten of AD-2 and AD-4.**

> AD-2's sessions row gains a role carve-out: the three-term predicate is the **patch** predicate for `patchOwner.role != 'Admin'` and for an Admin only on surfaces that expose an "Own scope". An Admin's `mode=admin` view is programme-wide and is not a patch.
> AD-4 states explicitly: **the Admin branch of the `sessions` policy stays programme-wide; do not narrow it.** `/sessions` keeps `created_by = self` for an Admin (its spec's decision); `/manage` and `/dashboard` keep `preacher_id OR created_by` in preacher mode. Name all four sites.

Without this, either the Admin portal silently becomes personal, or AD-2's "one predicate" is false on the first role.

---

### F3b — Attendance: the enumeration is narrower than the predicate (AD-2, AD-4) — Medium

**Unit A — implement AD-4's sentence.** `caller_can_read_attendance_session()` "matches the session predicate, including sessions the owner `created_by` as well as `preacher_id`" (`SPINE:93`). The enumeration is `preacher_id = owner OR created_by = owner`.

**Unit B — implement AD-2's table.** Attendance is "through a session in the patch", and the patch's session predicate is `preacher_id = owner OR created_by = owner OR **created_by = actor**` (`SPINE:66`). Add the actor term.

**Both comply.** One quotes AD-4's enumeration, the other AD-2's full predicate. AD-4 says "matches the session predicate" *and then* enumerates two terms; a literal reader follows the enumeration.

**The break.** The current function has no `created_by` term at all (`20261006010000:127-128`), so AD-4 is already a widening for the owner case. But `/sessions` shows legacy assistant-preached sessions through `sessions_visible`'s `preacher_id = p_user_id` (`20261102030000:37-38`) and counts their attendance with the **service role** (`20261101000000:221-225`), while `/manage` reads attendance through RLS (`lib/supabase/manage.ts:532-541`) and filters it to the visible session ids (`:570-572`). Unit A therefore gives an Assistant a session in `/sessions` with an attendance count and **zero attendance rows in `/manage`**. The DECISION itself flags the owner case (`DECISION:114`) but not the actor case.

Practical reach today is legacy-only, because every new session is written with `preacher_id = owner` (`lib/supabase/data.ts:879`, both `/api/sessions` routes). That is exactly why it is a trap: the tests on fresh data pass under either unit, and the first legacy row in production splits the two surfaces.

**Proposed AD-4 tighten.** State the boolean, not a paraphrase:

> `caller_can_read_attendance_session(p_session_id)` is `EXISTS (SELECT 1 FROM sessions s WHERE s.id = p_session_id AND s.program_id = caller_program_id() AND (s.preacher_id = <owner> OR s.created_by = <owner> OR s.created_by = auth.uid()))` for an Assistant; for a Preacher it is the own-patch + assistant-created terms.
> `/sessions` must not count attendance the caller's RLS would deny. Either count through the caller-scoped client, or define the visible count as the same boolean — a service-role `count(*)` is a second scope definition.

---

### F4 — Campaigns are frozen in the one place the check matters (AD-1, AD-2) — High

**Unit A — literal AD-1/AD-2.** `campaignScope` reads `patchOwner`; a null patch throws `campaign_scope_missing`; progress/assignments/contacts use the owner id.

**Unit B — literal `SPINE:33` and AD-3.** "`/campaigns/**` keeps the autodialer spine's AD-2 role set and AD-3 scope helper; this spine neither widens nor narrows them." Leave `lib/dialer/scope.ts:279-291` alone. It reads `staff.assignedPreacherUserId?.trim()` with **no Active check, no role check, no program check**.

**Both comply.** Unit B has an explicit sentence telling it not to change the helper.

**The break.** The dialer reads are **service-role** (`lib/dialer/campaigns.ts:81`, `:205`, `:247`, `:297`, `:335`; `assignments.ts`, `progress.ts`, `callers.ts` all use `createSupabaseAdminClient`). RLS is not a backstop. So an Assistant whose assignee is Inactive, or is a Volunteer, keeps a non-empty campaign scope and can read/assign that person's contacts while `/dashboard`, `/sessions`, `/manage` and `/contacts` are all empty. That is precisely the bad-data case AD-4's assignee check is introduced for — and it is the one surface AD-4 cannot reach, because RLS is bypassed.

AD-2's campaigns row is also applied inconsistently by surface. `listCampaigns` is creator-only for Admin and **programme-wide** for Preacher/Assistant (`lib/dialer/campaigns.ts:199-227`), while progress uses `p_scope_preacher_id` (`lib/dialer/progress.ts:244-245`) and `/dashboard`'s campaign card uses a third rule (campaigns with a scoped assignment or session, `20261102010000:806-820`). A unit that scopes the campaign list to `owner.userId` hides every campaign from an Assistant (campaigns are created by Admins, so `created_by` is never the Assistant), while a unit that leaves it shows all of them.

**Proposed AD-8 (new) — Campaigns have a work scope, not a visibility scope.**

> - `campaignScope` keeps its *shape* (`program` vs `preacher`) and takes its id from `patchOwner`; a null patch refuses. This overrides "the helper is unchanged": same shape, new id source.
> - The campaign **list** stays programme-wide for Preacher/Assistant and creator-only for Admin (autodialer AD-3). The **work** scope (assignments, callers, progress, assignable contacts) uses `patchOwnerId`.
> - Name `lib/dialer/scope.ts`, `campaigns.ts`, `assignments.ts`, `progress.ts`, `callers.ts`, and `get_campaign_progress`.
> - An Assistant with a null patch sees no Campaign nav item (see F7).

---

### F5 — Two contact write paths, two owners (AD-2) — High

**Unit A — fix the path AD-2 names.** `lib/supabase/manage.ts` stamps `assigned_preacher_id = patchOwner.userId`, `collected_by_id = staff.userId` on create (`:1211-1212`), and filters reads by owner (`:557`, `:810`). Leave `/api/contact` alone except for admitting Assistant.

**Unit B — fix the other write path.** `apps/folk/app/api/contact/route.ts` currently routes an Admin's contact to an **explicitly picked Preacher** (`:74-79`, `:136-149`): `assigned_preacher_id = assignment.preacher.id`, `collected_by_id = assignment.preacher.id`. Under AD-2, an Admin's write must stamp `assigned_preacher_id = owner.userId` (the Admin) and `collected_by_id = actor` (the Admin). So Unit B removes the picker.

**Both comply.** AD-2's write rule is satisfied by each unit's own path. Neither AD names the Admin picker, and neither says what happens to the form when the picker's value is no longer the owner.

**The break.** The same Admin creates two contacts that land in different patches depending on which form they used. `collected_by_id` is the owner from one route and the actor from the other. The form's location filtering is also driven by the picked Preacher (`components/contact-form.tsx:85-89`), and its copy says "Choose the active Preacher who should own this contact" (`:147-148`, `:219`). Removing the picker changes which locations are offered, which AD-2 never mentions.

For a Preacher the two routes agree (`assignment.preacher.id = staff.userId`); for an Assistant, `/api/contact` refuses a non-Preacher assignee before it gets this far (`:51-53`). The disagreement is Admin-only — which is exactly the new case this spine exists for.

**Proposed AD-9 (new, or tighten AD-2's "writes" row).**

> - One contact write contract for every role and every entry point: `assigned_preacher_id = patchOwner.userId`, `collected_by_id = staff.userId`.
> - An Admin's `/contact` form has no assignee picker; a contact an Admin collects is owned by the Admin. If delegation is required, it is a separate `assignedPreacherUserId` input whose value is the **delegate**, and the AD must then say the Assistant's patch is the delegate's, not the Admin's.
> - The location picker derives from `patchOwner.locationIds`, not from a selected assignee (see F9).
> - Name `/api/contact`, `/api/manage/contacts`, `/contact/page.tsx`, `components/contact-form.tsx`.

---

### F6 — The invite path and the stale raw FK (AD-1, AD-4, AD-5) — High

**Unit A — first bullet only.** Change `/api/admin/invite-user` to accept an Active `Admin | Preacher` (`DECISION:91`). Leave `/api/volunteers/invite` alone.

**Unit B — second bullet only.** Change `/api/volunteers/invite` so a Preacher stays self-only and the Admin path accepts an eligible supervisor (`DECISION:92`). Leave `/api/admin/invite-user` alone.

**Both comply.** The DECISION lists them as two separate changes, and AD-5 only fixes the column's name.

**The break, part 1 — two predicates for one binding.** Both routes write `public.users.assigned_preacher_id`. Both hard-code `preacher.role !== "Preacher"` (`admin/invite-user/route.ts:51`, `volunteers/invite/route.ts:58`). `/api/volunteers/invite` also creates **Assistants** (`normalizeInviteRole`, `:17-27`), and `/volunteers` renders `InviteUserForm` with **no `preachers` prop** (`apps/folk/app/volunteers/page.tsx:19`) even though the form renders a required supervisor select for an Assistant (`components/invite-user-form.tsx:267-277`). So an Admin on `/volunteers` cannot create anything, while the same Admin on `/admin/invite` can. The two paths then enforce different eligibility rules for the same row.

**The break, part 2 — the stale FK is a live grant.** `/api/admin/invite-user` lets an existing Assistant be re-invited as a Preacher (`roles` at `:8`, update path in `upsertStaffUser`). `upsertStaffUser` writes `assigned_preacher_id` only when a value is supplied (`lib/supabase/data.ts:420-425`), so the FK survives the role change. The RLS assignment terms are **not gated on the caller's role**:

- `caller_can_read_attendance_session()` has `s.preacher_id = public.caller_assigned_preacher_id()` (`20261006010000:128`), and the attendance policy admits `caller_role() IN ('Preacher','Assistant')` (`:202`).
- The sessions policy has `created_by = caller_assigned_preacher_id() OR preacher_id = caller_assigned_preacher_id()` (`20261101000000:48-49`).

So a newly promoted Preacher still reads their former supervisor's sessions and attendance. AD-4's check (assignee Active + role in Preacher/Admin) **passes** for that row, so a literal AD-4 does not close it.

**Proposed AD-10 (new) — One eligibility predicate, one binding rule.**

> - A single `isEligibleSupervisor(programId, userId)` — same program, `Active`, role `Admin | Preacher` — is the only definition. `patchOwner`, both invite routes, and `caller_assigned_preacher_id()` use it; none restates it.
> - Both invite routes accept the same supervisor set, or one route is deleted. `/volunteers` and `/admin/invite` must not disagree about who can be bound to whom.
> - A role change away from Assistant clears `assigned_preacher_id`; independently, AD-4's helper terms apply only when `caller_role() = 'Assistant'`.
> - Add a pre-deploy check for stale assignments (an Assistant row whose `assigned_preacher_id` points at an Inactive or wrong-role row, and a non-Assistant row that still has one).

---

### F7 — The header has one boolean and three role sets (AD-3) — Medium

**Unit A — the minimal diff.** `isPreacher` is `role === "Admin" || role === "Preacher"` (`lib/auth-context.tsx:198`). Add `|| role === "Assistant"`; Contacts (`header.tsx:269`), Manage (`:286`) and Sessions (`:277-284`) appear for an Assistant.

**Unit B — explicit Assistant items.** Leave `isPreacher` alone and add Contacts/Manage branches for `isAssistant`. `Contact` still routes to `/contact` (`:269`), the BackButton on `/contacts` still sends an Assistant to `/` (`contact/page.tsx:39`), and the Sessions entry needs its own branch.

**Both comply.** AD-3 says an Assistant gets Contacts and Manage; it does not say how the client decides.

**The break.** Unit A also enters the Sessions branch, whose second item is `{ href: isAdmin ? "/admin/invite" : "/volunteers", label: "Invite" }` (`:282`). An Assistant gets **Invite → `/volunteers`**; `apps/folk/app/volunteers/page.tsx:12` requires `["Admin", "Preacher"]` and redirects to `/auth/error`. That is the exact "nav admits a surface the page refuses" failure AD-3's "Prevents" column names.

Separately, `canUseCampaignAdmin: isPreacher || isAssistant` (`:249`) shows Campaign to a null-patch Assistant. `campaignScope` throws `campaign_scope_missing` (`lib/dialer/scope.ts:281-283`) and the page redirects to `/auth/error`. AD-3 only says the header hides Contacts and Manage for a null patch, so a unit cannot know whether Campaign should go too.

There is also no client-safe home for `OPERATIONAL_ROLES`: `lib/authz.ts` is `server-only` (`:1`), and the header is a `"use client"` component that receives role booleans. "Defined once" cannot be satisfied by exporting the array from `authz.ts`.

**Proposed AD-11 (new) — Navigation renders capabilities, never roles.**

> - `getStaffContext` computes a server-side capability set — at minimum `hasPatch`, `canReadContacts`, `canManage`, `canInviteVolunteers`, `canReadCampaigns` — from `patchOwner` and the role sets.
> - The capability shape lives in a **client-safe** module (not `lib/authz.ts`), and `/api/auth/me` returns it. The header and every page gate read the same names; no component compares a role string.
> - A null patch removes Contacts, Manage **and** Campaign. `/volunteers` remains Admin/Preacher only; an Assistant never receives the Invite item.
> - The empty-scope explanation is the dashboard's existing notice (`lib/dashboard/live.ts:36`), reused by `/contacts`, `/manage` and `/sessions`; no redirect.

---

### F8 — `patchOwner` on the client leaks the supervisor row (AD-1, AD-4) — Medium

`/api/auth/me` returns the whole `StaffContext` verbatim (`apps/folk/app/api/auth/me/route.ts:15-16`), and the client keeps it as `staff` (`lib/auth-context.tsx:49-59`, `:90`).

**Unit A** reads AD-1 literally: `patchOwner` is a `StaffContext` field with `{ userId, role, name, locationIds }` (`SPINE:54-55`), and "the client staff DTO carries the resolved patch presence" (`:58`). Ship it.

**Unit B** reads "presence" as a boolean: `hasPatch` + `patchOwnerId`.

**Both comply.** "Presence" is ambiguous, and AD-1's own definition of the object includes the supervisor's name and locations.

**The break.** Unit A sends the supervisor's name and `location_ids` to every Assistant's browser. The `users` RLS policy deliberately denies a non-Admin every row but their own (`20261006010000:152-160`), so the app would be handing out exactly what the database refuses — a direct AD-4 parity inversion, and a privacy leak in a shared-programme product.

**Proposed AD-1 tighten.**

> `patchOwner` is server-only. The client DTO carries `patchOwnerId: string | null` and `hasPatch: boolean`; it never carries the supervisor's name, email or location ids. If the UI must display a supervisor label, return a single display string explicitly, not the row.

---

### F9 — Locations: four sources, no owner field (AD-2) — Medium

**Unit A** sets `ManageScope.locationIds` to `owner.locationIds` (AD-2: "locations: `owner.locationIds`") and leaves `locationOptions` alone.

**Unit B** sets `locationOptions` (the picker) to `owner.locationIds` and leaves `locations` as the RLS/reference set, because `locations` is also used to name a contact that sits outside the reader's scope (`lib/supabase/manage.ts:788-796`).

**Both comply.** AD-2 names neither field, and the two arrays have genuinely different jobs (`components/manage/manage-types.ts:156-168`).

**The break.** For an Assistant, `users.location_ids` is `[]` by construction (`admin/invite-user/route.ts:35`). So `lib/supabase/manage.ts:565` narrows the location list to nothing, `:846` filters the picker to nothing, and every session's `locationName` is null. A correct `patchOwner` alone does not fix it. `sessions/scope.ts:70` and both `POST /api/sessions` (`folk:192`, `gita-life:117` re-read the assignee) are two more copies.

**Proposed AD-12 (new) — Locations have two lists and one owner.**

> - `patchOwnerLocationIds` is the owner's `users.location_ids`, resolved once. It drives the write picker, `assertProgramLocations`, and the session create filter.
> - `locations` on a payload is the name-resolution set and may be wider; `locationOptions` is the write picker and is exactly `patchOwnerLocationIds`. Neither is ever `staff.locationIds` for an Assistant.
> - Name `loadManagePortalData`, `loadContactsSectionData`, `sessionsScope`, and both `POST /api/sessions` route files.

---

### F10 — `mode` has two authors (AD-2) — Medium

**Unit A** forces `mode: "preacher"` and `role: "Preacher"` inside `loadManagePortalData` for an Assistant.

**Unit B** forces the mode in `apps/*/app/manage/page.tsx` before calling the loader (`apps/folk/app/manage/page.tsx:67-69`, `apps/gita-life/app/manage/page.tsx:67-69`).

**Both comply.** The page is the only caller today, so either fix satisfies "an Assistant's payload always reports the personal-patch view".

**The break.** `?mode=admin` for an Assistant currently reaches the loader as `"admin"`; `narrowToPreacher` is false (`manage.ts:555`), and the payload reports `mode: "admin"` with `role: "Preacher"` — a combination no component expects (`manage-portal.tsx:137` renders the switch only for `role === "Admin"`, but `:167` renders the "own staff account" notice from `scope.mode`). If Unit B is the only fix, the loader is unsafe for the next caller. The page is also the component a future story will copy.

**Proposed AD-2 tighten.**

> The loader is the authority: `loadManagePortalData` and `loadContactsSectionData` derive `mode` and `role` from the caller, and an Assistant is always `mode: "preacher"`, `role: "Preacher"` regardless of the query. `resolveManageMode` is a request hint only. No query parameter widens a scope on any surface.

---

### F11 — Three proxy matchers (AD-3) — Medium

`/manage` and `/api/manage/*` are absent from all three copies: `proxy.ts:8-24`, `apps/folk/proxy.ts:8-24`, `apps/gita-life/proxy.ts` (same list). Next uses the app-level `config.matcher`; the root copy is inert. AD-3 names `apps/*/proxy.ts` (`SPINE:83`), which is correct — but the spine's Structural Seed omits the root copy, and a unit that edits only `proxy.ts` ships nothing. This is the `public/sw.js` trap in a different file.

**Proposed AD-3 tighten.**

> Add `/manage` and `/api/manage/:path*` to **both** `apps/*/proxy.ts` matchers, and either delete the root `proxy.ts` matcher or state that it is not the app's matcher. A parity test asserts the three lists are identical, so a future surface cannot be added to one copy only.

---

### F12 — AD-4's helper is not AD-1's eligibility (AD-4) — Low/Medium

`caller_assigned_preacher_id()` (`20261006010000:70-83`) requires `u.status = 'Active'` and `p.status = 'Active'`. AD-1 adds **same program** and role. AD-4 adds the role check but not the program check. `caller_effective_location_ids()` (`:88-108`) checks neither the assignee's role nor the caller's role, and applies the assignment branch to **Volunteer** — so a Volunteer inherits the supervisor's locations while AD-2 says a Volunteer's patch is empty.

**Unit A** implements AD-4 verbatim: role + Active. A cross-program assignment still yields a non-null helper against a null `patchOwner`.
**Unit B** implements AD-1's full eligibility: program + role + Active. A Volunteer's location list becomes empty, which contradicts the pre-existing matrix line that a Volunteer's locations resolve through the assigned preacher (`20261006010000:28-30`).

**Proposed AD-4 tighten.**

> `caller_assigned_preacher_id()` and `caller_effective_location_ids()` implement AD-1's eligibility exactly: the assigned row is `Active`, role `Admin | Preacher`, and in the same program. The assignment branch applies only when `caller_role() = 'Assistant'`. The Volunteer location case is decided explicitly (either the Volunteer keeps the supervisor's locations as a *reference* list or loses them with the form — see F2), not left to the helper's CASE.

---

### F13 — AD-5's copy list is incomplete (AD-5) — Low

AD-5 binds "UI copy" and "scope comments and docs". A unit can reasonably treat these as out of scope:

- `assistantPreacherName` and `assistantUnassigned` (`lib/dashboard/types.ts:208-211`), and the dashboard notice that renders them.
- Route errors: "Assigned Preacher must be an active Preacher user." (`api/contact/route.ts:53`), "Assistant sessions require an assigned Preacher." (`api/sessions/route.ts:181`), "Assigned Preacher is required for Volunteer or Assistant invites." (`admin/invite-user/route.ts:45`), "Existing Assistants cannot be moved to a different Preacher…" (`volunteers/invite/route.ts:90`).
- Form copy: "your Preacher" (`components/contact-form.tsx:216-219`), "Assigned Preacher" labels (`invite-user-form.tsx:267-277`).
- Doc comments that define the contract: "`P` is … `assigned_preacher_id = me`" (`components/contacts/contacts-types.ts:8-11`), "An Assistant resolves through an Active Preacher" (`lib/dashboard/scope.ts:15-17`), "An Assistant's assigned preacher is resolved only while that preacher is still an Active Preacher" (`lib/sessions/scope.ts:11-14`).

**Proposed AD-5 tighten:** add "any string a user reads, including route error messages and field labels, counts as UI copy; any comment that states the scope contract counts as documentation."

---

## AD-by-AD verdict

| AD | Verdict | The one thing that must change |
| --- | --- | --- |
| AD-1 | Holds in intent; **tighten** | Eligibility has no single owner (F6, F12), the client shape leaks the row (F8), and the rule "no resolver may call `findStaffUserById`" does not say what the existing call sites in `dashboard/scope.ts`, `sessions/scope.ts`, the two `/api/sessions` routes and the two `/api/contact` routes become. |
| AD-2 | Directional; **under-specified** | One predicate has four implementations (F3), one id has two meanings (F1), writes have two contracts (F5), locations have no field (F9), `mode` has two authors (F10). |
| AD-3 | **Under-specified** | `/contact` versus Volunteer is a product regression (F2); the role set has no client-safe home and the nav booleans are overloaded (F7); the null-patch nav omits Campaign (F7); the proxy copies are three (F11). |
| AD-4 | Right principle; **tighten** | It names the policy, not `sessions_visible` (F3); the attendance enumeration omits the actor term and the Admin branch is unstated (F3, F3b, F4); the helper omits AD-1's program clause and the caller-role gate (F6, F12). |
| AD-5 | **Holds**; minor | The naming decision is right. The copy list and the stale-FK role change are the only gaps (F6, F13). |

---

## Fix list, in build order

**P0 — before any unit starts (each is a two-unit incompatibility):**

1. Add **AD-6 (identity names)** and the `ManageScope`/draft-row field contract. (F1)
2. Add **AD-7 (Volunteer write path)** or record the retirement explicitly. (F2)
3. Pin the Admin sessions predicate and the Admin RLS term in AD-2/AD-4. (F3)
4. Add **AD-8 (campaign work scope)** and overrule "the helper is unchanged" with "same shape, new id source". (F4)
5. Add **AD-9 (one contact write contract)** and settle the Admin picker. (F5)
6. Add **AD-10 (one supervisor predicate + clear the FK on role change)**. (F6)

**P1 — same change, before the surfaces ship:**

7. **AD-11 (capabilities, not roles)** + the null-patch nav rule. (F7)
8. Trim `patchOwner` to `patchOwnerId`/`hasPatch` on the client. (F8)
9. **AD-12 (locations)** and the four call sites. (F9)
10. Align the attendance boolean with AD-2 and stop counting attendance with the service role at `/sessions`. (F3b)
11. Make the loader the `mode` authority. (F10)
12. Name all three proxy matchers and add the parity test. (F11)

**P2 — can land with the implementation:**

13. AD-4 helper: same-program + caller-role gate; decide the Volunteer location case. (F12)
14. AD-5 copy sweep. (F13)

---

## Residual risks (pre-existing, not caused by the spine — do not use these to block it)

- `assertManageContactInScope` falls back to a service-role existence probe (`lib/supabase/manage.ts:884-900`), which is a UUID oracle across the programme. It returns no row content, so it is not a scope leak, but it is an oracle.
- The RLS scope check and the service-role write are two statements (`:1152` then `:1157`); a contact reassigned between them could be written out of scope. Not new.
- `dashboard_overview`'s `programme_attendance` CTE reads every attendance row in the programme to compute `new_attendees` (`20261102010000:718-730`). It is a KPI input, not a row read, but it is a service-role read inside a patch-scoped dashboard. If AD-4's "the service role is never a second scope definition" is read literally, this needs a decision.
- Adding `patchOwner` makes `getStaffContext` a third round trip. Resolve it conditionally (Assistants only) and cache it per request; the existing `refresh` option is unused.

## Verification

- Read-only review. No code, migrations or tests were changed; no test suite was run, so every claim is a static reading at `66e72a2`.
- Line numbers are from the files as read in this session. The working tree has unrelated edits under `components/campaign/`; this review does not depend on them.
- The unit pairs are constructs, not proposed implementations. Each is chosen because both halves pass a literal reading of the ADs as written; the seam is the evidence, not a preference.
