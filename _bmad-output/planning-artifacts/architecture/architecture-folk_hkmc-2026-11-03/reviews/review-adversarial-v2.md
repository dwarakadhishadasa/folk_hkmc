# Adversarial review v2 — Staff scope: Admin supervisors and Assistant surfaces

- **Artifact:** [`../ARCHITECTURE-SPINE.md`](../ARCHITECTURE-SPINE.md), companion [`../DECISION-admin-assistants.md`](../DECISION-admin-assistants.md)
- **Verdict:** **fail (P0 open).** The revision closes the v1 role-list and campaign-helper holes, but five P0 seams remain. Two units that each follow the ADs literally still build incompatible behaviour at the contact write, the SQL scope-call, the null patch, the `/manage` vs `/sessions` predicate, and the binding lifecycle. Do not start a unit against this text.
- **Baseline:** `66e72a2` (working tree has unrelated `components/campaign/*` edits; not used for this review)
- **Method:** for each AD, construct two units one level down that each follow the AD's literal text and still disagree at a seam. Every seam is checked against the code as read, not against the prose. No code, migration, test or spine edit was made.

## Delta from v1

| v1 finding | Status in v2 | Where it is still open |
| --- | --- | --- |
| F2 — `/contact` deletes the Volunteer path | **Partially closed.** `CONTACT_FORM_ROLES` now includes Volunteer. | The *write owner* is still contradicted by AD-4 (`/contact` form rule) vs AD-3 (`owner.userId`). See F1. |
| F4 — campaigns frozen | **Closed for the helper's id source.** AD-3 now says `campaignScope` reads `patchOwner`. | The caller path and the Admin `kind` are still contradictory. See F7, F16. |
| F6 — two invite predicates + stale FK | **Partially closed.** AD-2 now states one eligibility predicate and clears the FK on role change. | The clear rule breaks the Volunteer routing; the `/volunteers` Admin path has no picker; the "cannot be moved" rule still contradicts AD-2. See F5. |
| F8 — `patchOwner` leaks to the client | **Partially closed.** AD-1 names `hasPatchScope`/`supervisorName`/`supervisorRole` and keeps `locationIds` server-side. | The RSC `initialStaff` prop still ships the whole `StaffContext` on six pages. See F9. |
| F10 — `mode` has two authors | **Partially closed.** AD-3 now fixes the Assistant's mode. | The loader is still not the authority; a Preacher can still pass `?mode=admin`; the payload field and the filter can disagree. See F17. |
| F11 — three proxy matchers | **Partially closed.** AD-4 says "app-level `proxy.ts` matchers". | No parity test; the root copy is still inert. This is a trap, not a behavioural divergence today. |
| F1, F3, F3b, F5, F7, F9, F12, F13 | **Open.** | F1→F8, F3→F6, F3b→F4/F11, F5→F1, F7→F13, F9→F12, F12→F14, F13→AD-6 (mostly closed by the broader "user-facing text" wording). |

---

## Findings

Severity is the cost of getting it wrong after build starts.

| ID | Severity | AD touched | Hole in one line |
| --- | --- | --- | --- |
| F1 | **P0** | AD-3 vs AD-4 | `/contact` still stamps the picked Preacher as owner; AD-3 requires the patch owner. |
| F2 | **P0** | AD-3, AD-5 | The SQL-argument contract lists the actor's role and the owner's id, but the predicate needs the actor's id. |
| F3 | **P0** | AD-3, AD-4 | A null owner is not an empty patch: `created_by = actor` survives, and `/sessions`/`/attendance` have no null-patch rule. |
| F4 | **P0** | AD-3, AD-5 | `/manage` and `/sessions` still use different session predicates (assistant-created and `preacher_id = actor` terms). |
| F5 | **P0** | AD-2 | "Away from Assistant clears the FK" breaks the Volunteer routing; `/volunteers` cannot create the binding AD-2 allows. |
| F6 | P1 | AD-3, AD-5 | AD-5 never names the Admin branch; a literal "policies grant the AD-3 patch" collapses `/manage?mode=admin`. |
| F7 | P1 | AD-4 vs autodialer AD-2 | `OPERATIONAL_ROLES` includes `/campaigns/**`, but the caller path admits Volunteers. |
| F8 | P1 | AD-1, AD-3 | `ManageScope.staffUserId` still means actor in one unit and owner in another; the draft row proves it. |
| F9 | P1 | AD-1 | The client DTO leak is not only `/api/auth/me`; `initialStaff` ships the whole context on six pages. |
| F10 | P1 | AD-4, AD-5 | `/attendance?date=` is either a 403 or a patch date query; the Admin's `?session=` path is creator-only while `/manage` is programme. |
| F11 | P1 | AD-5 | `caller_can_read_attendance_session()` enumerates two terms where the predicate has four. |
| F12 | P1 | AD-3 | Locations still have no named field (`scope.locationIds` vs `locationOptions` vs `locations`). |
| F13 | P1 | AD-4 | The header's `isPreacher` is still the only switch; widening it gives an Assistant a dead Invite link. |
| F14 | P2 | AD-1, AD-5 | AD-5's helper omits AD-1's same-programme clause; the Volunteer location branch is undecided. |
| F15 | P2 | AD-1 | `supervisorName`/`supervisorRole` have no null semantics for Admin/Preacher or an ineligible FK. |
| F16 | P2 | AD-3 vs autodialer AD-3 | `campaignScope` for an Admin is `kind: "program"` in the code and `kind: "preacher"` in AD-3. |
| F17 | P2 | AD-3 | `?mode=admin` still disables the app filter for a Preacher; the loader is not the mode authority. |
| F18 | P2 | AD-3, AD-5 | The dashboard RPC is owner-only; AD-3's `created_by = actor` and the `programme_attendance` CTE have no decision. |
| F19 | P2 | AD-1, AD-4 | `/api/sessions` still re-resolves the supervisor and requires `Preacher`, refusing an Admin supervisor the page admits. |

---

### F1 — `/contact` writes a different owner than every other contact write (AD-3 vs AD-4) — P0

**Unit A — AD-3 literal.** One contact write contract for every entry point: `assigned_preacher_id = patchOwner.userId`, `collected_by_id = staff.userId` (`SPINE:80`). For an Admin, `patchOwner = self`, so the Admin's contact is owned by the Admin. The `/contact` form's "explicitly chosen Preacher" picker (`components/contact-form.tsx:350-365`, copy at `:219`) is either removed or becomes a delegate field; the Admin's location list becomes the Admin's own. For a Volunteer, `patchOwner = null`, so the write is refused or the row is written unassigned.

**Unit B — AD-4 literal.** The form keeps its own assignment rule: Volunteer → Preacher; Assistant → Admin or Preacher; Preacher → self; Admin → explicitly chosen Preacher (`SPINE:96`). The existing `/api/contact` stamps `assigned_preacher_id = assignment.preacher.id` and `collected_by_id = assignment.preacher.id` for an Admin, and the assigned Preacher as owner for a Volunteer (`apps/folk/app/api/contact/route.ts:136-149`; the gita-life copy is `apps/gita-life/app/api/contact/route.ts:129-135`). This is also the `collected_by_id` behaviour the DECISION's Consequences says to preserve (`DECISION:151`).

**Both comply.** AD-3's writes row is unconditional. AD-4 says "The form keeps its own assignment rule" and names the Admin and Volunteer destinations. Neither sentence is marked as an exception to the other.

**The break.** The same Admin creates one contact on `/contact` owned by the picked Preacher and one on `/manage` owned by the Admin. The first does not appear in the Admin's own `/manage?mode=preacher` or `/contacts` (both filter `assigned_preacher_id = staff.userId`: `lib/supabase/manage.ts:557`, `:810`; the new owner filter will keep the shape). The second does. A Volunteer's contact is either orphaned (AD-3) or owned by the Preacher (AD-4); the form's copy says the Preacher owns it. An Assistant's path agrees only if the route uses the Assistant's own supervisor; AD-4's "Admin or Preacher" can be read as *any* eligible supervisor, which would place the row outside the Assistant's RLS patch (`assigned_preacher_id = caller_assigned_preacher_id()`). `collected_by_id` is the picked Preacher on `/contact` and the actor on `/manage`, so "Collected By" names two different people for the same actor.

**Proposed tighten (new AD).**

> One contact write contract for every entry point and every role: `assigned_preacher_id = patchOwner?.userId ?? assignedPreacherUserId` (the fallback exists only for a Volunteer; it is the Volunteer's routing preacher, not a second owner) and `collected_by_id = staff.userId`. The form's assignment rule is a **validation** rule, never an owner override. An Admin's `/contact` has no assignee picker; delegation, if required, is a separate explicit delegate whose patch the Assistant shares. Name `/api/contact`, `/api/manage/contacts`, `contact/page.tsx`, `contact-form.tsx`, and a test that creates the same contact through both paths and reads it back from the Admin's own scope.

---

### F2 — The SQL argument contract cannot represent `created_by = actor` (AD-3/AD-5) — P0

**Unit A — the argument sentence literal.** A scope function receives "the actor's role and the owner's id and locations; it never receives the owner's role" (`SPINE:86`; `DECISION:65`). The signature becomes `(p_actor_role, p_owner_id, p_owner_location_ids, ...)`. `sessions_visible`'s `p_user_id` is repurposed as the owner, and the `created_by = actor` term is dropped. The sessions predicate is now `preacher_id = owner OR created_by = owner` plus the Preacher assistant term.

**Unit B — the predicate literal.** The predicate explicitly includes `created_by = actor` (`SPINE:77`), so the function must receive the actor's id. `sessions_visible` keeps `p_user_id = actor` and `p_assigned_preacher_id = owner` (`lib/sessions/data.ts:115-121`), and the actor term is implemented. The service-role read passes the `patchOwner` id, the actor's role, **and the actor's id**.

**Both comply.** One follows the argument sentence; the other follows the predicate. The sentence never lists the actor's id. AD-5's service-role sentence repeats the omission: "passes the same `patchOwner` id and the actor's role" (`SPINE:114`) — not the actor's id.

**The break.** `sessions_visible` and `sessions_overview` currently take both `p_user_id` and `p_assigned_preacher_id`, so Unit B works and Unit A's "clean" signature is a rewrite. `dashboard_overview` has no actor id at all (`p_scope_preacher_id`, `p_program_scope`; `lib/dashboard/overview.ts:27-38`), so Unit B cannot add the term there without a new parameter. `/sessions` (service role) and `/manage` (RLS) then disagree for every Assistant-created session whose `preacher_id` is not the owner. The `sessionsScope` doc is explicit that a null-patch Assistant "keeps only the sessions they created" (`lib/sessions/scope.ts:11-14`), which is exactly the actor term Unit A deletes.

**Proposed tighten.** Name the vector: `p_actor_id`, `p_actor_role`, `p_owner_id`, `p_owner_location_ids`; every scope function takes it, or is explicitly owner-only. Say which functions are owner-only (the dashboard RPC) and why. Do not describe the argument as "the actor's role and the owner's id" when the predicate needs the actor's id.

---

### F3 — A null patch is not an empty patch (AD-3/AD-4) — P0

**Unit A — "empty patch" literal.** `patchOwner = null` short-circuits every surface to zero rows. `/sessions` shows its empty state; `/attendance` denies; `/campaigns` refuses.

**Unit B — predicate literal.** The sessions predicate is `preacher_id = owner OR created_by = owner OR created_by = actor` (`SPINE:77`). With `owner = null`, the last term survives. The existing `sessions_visible` includes `created_by = p_user_id` and `preacher_id = p_user_id` for an Assistant (`20261102030000:33-38`); the RLS sessions policy includes both terms (`20261101000000:42-50`); the `sessionsScope` doc says the null-patch Assistant "keeps only the sessions they created." So `/sessions` shows the Assistant's own sessions and their attendance. `/manage` and `/contacts` show the empty-scope explanation; `/campaigns` refuses; `/dashboard` builds the unassigned scope (`lib/dashboard/scope.ts:83-96`), skips the RPC (`components/dashboard/dashboard-route.tsx:44`) and suppresses the live band (`lib/dashboard/live.ts:36`), then renders the notice (`components/dashboard/dashboard-page.tsx:38`); `/attendance` has no null-patch rule.

**Both comply.** AD-3 says "A null owner is an empty patch, never a widening" (`SPINE:88`) and gives the three-term predicate. AD-4 specifies the null-patch behaviour for `/manage`, `/contacts` and `/campaigns` only (`SPINE:100`). AD-2 says a missing/ineligible binding is "never a refusal" at read time (`SPINE:69`); AD-4 says `/campaigns` refuses.

**The break.** The same null-patch Assistant sees: zero rows in `/manage`, the explanation in `/contacts`, the unassigned notice in `/dashboard`, their own sessions in `/sessions` (Unit B) or none (Unit A), a 403 in `/campaigns`, and a still-visible Campaign nav item that leads to `/auth/error` (`components/header.tsx:247-252`, `:284`). The DECISION's E2E says "no dead nav items" (`DECISION:161`); AD-4 says `/campaigns` keeps the refusal. The header hides Contacts/Manage but not Sessions/Campaign. `/sessions` has no null-patch empty-state; `/attendance` has none either.

**Proposed tighten.** Add a null-patch table: per surface, `empty`, `explanation`, `refusal`, or `actor-only`. Say whether a null-patch Assistant may create a session (the POST refuses today: `apps/folk/app/api/sessions/route.ts:180-195`). Hide Campaign when `hasPatchScope = false` (the DECISION's E2E) or remove "no dead nav items" from the DECISION. Define `/sessions`' null-patch state.

---

### F4 — `/manage` and `/sessions` still use different session predicates (AD-3/AD-5) — P0

**Unit A — AD-3's Preacher predicate.** `/sessions`' `sessions_visible` includes the Preacher's assistant-created term (`created_by IN (active staff assigned to owner)`) and the Assistant's `created_by = p_user_id` / `preacher_id = p_user_id` (`20261102030000:29-56`). `/manage`'s app filter is only `preacher_id = self OR created_by = self` (`lib/supabase/manage.ts:558-563`). AD-3 says the Preacher's predicate includes the assistant term and binds `lib/supabase/manage.ts` (`SPINE:73,77`); add it to `/manage` so both surfaces agree.

**Unit B — AD-5's "a page may narrow".** `/manage` applies a narrower app filter on top of the RLS rows; AD-5 says a page may apply a narrower filter and RLS is not narrowed to the page filter (`SPINE:113`). Leave the filter as is. The RLS sessions policy grants the assistant term and (currently) `preacher_id = auth.uid()` for Preacher/Assistant (`20261101000000:35-50`); `/manage` hides some of those rows, but it is a page narrowing, not a widening.

**Both comply.** AD-3's predicate and AD-5's "page may narrow" are both explicit. AD-5's "Prevents" column also says "the database granting a row the app does not show" (`SPINE:107`), which is the opposite instruction.

**The break.** A legacy session created by the Preacher's Assistant with `preacher_id` = another preacher is in `/sessions` and in `/manage`'s RLS rows, then removed by the `/manage` filter. `/manage`'s attendance rows are filtered to the visible session ids (`lib/supabase/manage.ts:570-572`), so the session's attendance disappears from `/manage` while `/sessions` counts it. The same for an Assistant's `preacher_id = actor` legacy session if the RLS policy keeps the term and the app predicate drops it. The `/manage` `mode=preacher` filter uses `staff.userId` (actor) today; a unit that changes only the owner id and not this filter leaves the Assistant's `/manage` empty while `/sessions` is not.

**Proposed tighten.** State the exact boolean for `/manage`, `/sessions` and attendance, and say whether RLS may be wider than a page. If yes, the "Prevents" clause is wrong; if no, `/manage`'s filter is wrong. Name the Preacher's assistant-created term and the Assistant's `preacher_id = actor` term explicitly in both the app and the policy.

---

### F5 — The binding lifecycle breaks the Volunteer routing and the `/volunteers` Admin path (AD-2) — P0

**Unit A — "away from Assistant clears".** `upsertStaffUser` clears `assigned_preacher_id` when the new role is not Assistant. An Assistant demoted to Volunteer loses the FK; `/api/contact` returns "Volunteer contact routing is not configured" (`apps/folk/app/api/contact/route.ts:57-64`); `caller_effective_location_ids()` returns empty (`20261006010000:88-108`); the Volunteer's contact form has no locations.

**Unit B — "the column is also the Volunteer routing".** Clear only when the new role is Admin or Preacher; for a Volunteer, keep or set the routing preacher. This preserves the Volunteer's form but contradicts the literal "away from Assistant clears."

**Both comply.** AD-2 says "A role change away from `Assistant` clears `assigned_preacher_id`" (`SPINE:67`; `DECISION:111`). AD-4 says "Volunteer → Preacher" for the form (`SPINE:96`). Neither says the Volunteer exception.

**The break.** An Assistant→Volunteer change either breaks the Volunteer's contact form (Unit A) or leaves the FK that AD-2 says to clear (Unit B). `upsertStaffUser` writes the FK only when it is truthy (`lib/supabase/data.ts:420-425`), and `/api/admin/invite-user` passes `assignedPreacherUserId: undefined` for non-Volunteer/Assistant roles (`apps/folk/app/api/admin/invite-user/route.ts:63-69`), so a unit must add an explicit null/clear path; a unit that only changes the route's payload does nothing. Separately, `/volunteers` renders `<InviteUserForm mode="volunteer" />` with no `preachers` prop (`apps/folk/app/volunteers/page.tsx:19`; `apps/gita-life/app/volunteers/page.tsx:19`) and the form's supervisor select is gated on `mode === "admin"` (`components/invite-user-form.tsx:267`); the Admin route requires `assignedPreacherUserId` for both Volunteer and Assistant (`apps/folk/app/api/admin/invite-user/route.ts:39-56`), so an Admin cannot invite from `/volunteers` (400). The same route refuses to move an existing Assistant to a different supervisor (`apps/folk/app/api/volunteers/invite/route.ts:60-70`; gita-life `:65-93`), while AD-2 says "An Admin may bind an Assistant to any eligible supervisor" (`SPINE:66`); an Assistant with an ineligible FK cannot be repaired from the surface an Admin uses.

**Proposed tighten.** Define the clear rule by destination role: clear for Admin/Preacher; set/replace the routing preacher for Volunteer; require an eligible supervisor for Assistant. Add the picker/options to `/volunteers` in both modes, or remove the Admin's Volunteer/Assistant invite from that route. Remove or scope the "cannot be moved" rule; one `isEligibleSupervisor` helper. Add an explicit null path in `upsertStaffUser`.

---

### F6 — AD-5 still never names the Admin branch (AD-3/AD-5) — P1

**Unit A — "the policies grant the AD-3 patch".** AD-5's opening says the helpers and policies grant the AD-3 patch (`SPINE:108`); AD-3's sessions predicate is unconditional. Apply it to the Admin branch: `preacher_id = admin OR created_by = admin`. `/manage?mode=admin` applies no app filter (`lib/supabase/manage.ts:555-563`) and depends on the RLS Admin term, so the "All preachers" view collapses to the Admin's own rows. The attendance and locations Admin terms narrow with the same choice.

**Unit B — the omission.** AD-5's sessions bullet names the Assistant and Preacher branches only (`SPINE:111`); the Admin branch is unchanged (programme-wide). `/manage?mode=admin` stays programme-wide.

**Both comply.** The "Admin exception" (`SPINE:82`) says "An Admin's programme scope remains the default (`program_scope = true`)" — the dashboard variable, not the RLS term. The "Prevents" column says "an Admin's programme view collapsing to a personal patch" (`SPINE:74`) — the intended outcome — but no rule says how. A unit can read the opening sentence as the policy rule and the bullet as a partial list; another reads the bullet as exhaustive.

**The break.** `/manage?mode=admin` either shows the programme (Unit B) or the Admin's own patch (Unit A). The Admin's `/attendance?date=` and `/contacts` programme reads change with the same choice. The current Admin terms are programme-wide (`20261101000000:42`, `20261006010000:173-186`, `:198-206`, `:211-217`), and `loadManagePortalData` has no app filter in admin mode, so RLS is the only definition.

**Proposed tighten.** State: "The Admin branch of every policy stays `caller_role() = 'Admin'` and programme-wide; do not narrow it. The Admin exception is a dashboard `program_scope`, not a patch." Name the contacts, sessions, attendance and locations Admin terms.

---

### F7 — Campaigns: `OPERATIONAL_ROLES` contradicts the dialer caller path (AD-4 vs autodialer AD-2) — P1

**Unit A — AD-4's role set.** `OPERATIONAL_ROLES = ["Admin", "Preacher", "Assistant"]` includes `/campaigns/**` (`SPINE:95`); apply it to every campaign page and `/api/dialer/**` handler. A Volunteer with an active `dialer_callers` profile loses `/campaigns/assignments` (`apps/folk/app/campaigns/assignments/page.tsx:26-27`) and the caller queue (`lib/dialer/caller.ts:690`).

**Unit B — the autodialer AD-2 split.** `/campaigns/assignments` and `/api/dialer/caller/**` call `requireDialerCaller`, which admits any role with an active profile, including a Volunteer (`lib/dialer/scope.ts:221-245`). AD-4 says "The Campaign routes and the autodialer AD-2 role set are unchanged" (`SPINE:102`). Preserve the split. A Volunteer uses a `/campaigns/**` surface outside `OPERATIONAL_ROLES`.

**Both comply.** AD-4's role set and its "unchanged" sentence are both explicit. "Every one scopes through `patchOwner`" (`SPINE:95`) is false for the caller path: the caller path scopes through the caller's assignments, not the patch, and a Volunteer has no patch.

**The break.** A Volunteer caller either loses the queue (Unit A) or the AD's "no surface invents a role list" claim is false for the caller path (Unit B). Separately, `campaignScope` for an Admin is `kind: "program"` (`lib/dialer/scope.ts:255-263`), while AD-3 says `kind: "preacher", userId = owner.userId` for campaigns (`SPINE:84`); a unit can narrow the Admin's assignment/progress/caller scope to the Admin's own patch. The "Campaign objects stay programme-level" sentence is also imprecise: the autodialer AD-3 makes an Admin's campaign list creator-only (`lib/dialer/campaigns.ts:199-227`).

**Proposed tighten.** Split the sets: `CAMPAIGN_ADMIN_ROLES = ["Admin", "Preacher", "Assistant"]` for `/campaigns` (overview/new/reports/callers/assign-contacts) and `/api/dialer/admin/**`; `CAMPAIGN_CALLER_ROLES` = any role with an active profile for `/campaigns/assignments` and `/api/dialer/caller/**`. State that the caller path does not scope through `patchOwner`. For campaigns, state "Admin = `kind: program`; Preacher/Assistant = `kind: preacher`, owner id; the list stays creator-only for Admin."

---

### F8 — `ManageScope.staffUserId` still has two meanings (AD-1/AD-3) — P1

**Unit A — keep the actor, add the owner.** `ManageScope.staffUserId` stays the signed-in user (it already is: `lib/supabase/manage.ts:734`, `:837`); add `patchOwnerId`. `createDraftContact(scope.staffUserId)` keeps prefilling both `assignedPreacherId` and `collectedById` with the actor (`components/manage/manage-contacts-table.tsx:254,277-278`). The draft row shows the Assistant as owner — the exact failure AD-3's "Prevents" column names (`SPINE:74`).

**Unit B — the scope's id is the owner.** Read the scope's id as the patch owner; add `actorUserId` for attribution. `createDraftContact(scope.staffUserId)` now prefills the supervisor as the collector; `staffNameById` maps the supervisor's name last (`components/manage/manage-contacts-table.tsx:647-653`), so the "Collected By" cell names the supervisor.

**Both comply.** AD-3 says "Client payloads carry the actor id and the patch-owner id separately; no component derives one from the other" (`SPINE:88`). Both carry two ids. The AD never says which existing field keeps which meaning; `ManageScope.staffUserId` is documented as "the signed-in staff member" (`components/manage/manage-types.ts:27-28`) and used for both the prefill and the name map.

**The break.** The draft row either shows the actor as owner (Unit A) or the supervisor as collector (Unit B). `scope.staffName` is the actor's name in both, so the "own staff account" notice and the name map are wrong for one of them. `loadManagePortalData`/`loadContactsSectionData` set `staffUserId: staff.userId` (`:734`, `:837`) and `staffName: staff.name`; a unit must change both the filter (to the owner) and the payload, and the field names do not say which.

**Proposed tighten.** Rename to `actorUserId`/`actorName` and `patchOwnerId`/`patchOwnerName`; set `ManageContact.assignedPreacherId = patchOwnerId`, `collectedById = actorUserId`; retire `staffUserId`. A payload must not expose a single id whose meaning is not in its name.

---

### F9 — The client DTO leak is not only `/api/auth/me` (AD-1) — P1

`components/staff-auth-shell.tsx` passes the full `StaffContext` to `AuthProvider initialStaff` on `/manage`, `/contact`, `/campaigns`, `/sessions`, `/admin/invite` and `/volunteers` (`apps/folk/app/manage/page.tsx:72`, `contact/page.tsx:33`, `campaigns/layout.tsx:40`, `sessions/layout.tsx:32`, `admin/invite/page.tsx:17`, `volunteers/page.tsx:15`; the gita-life copies repeat it). `AuthProvider` stores it as `staff` (`lib/auth-context.tsx:90`). If `patchOwner` (with `name` and `locationIds`) is added to `StaffContext`, the RSC payload carries the supervisor's location list even after `/api/auth/me` is stripped. AD-1 binds `lib/auth-state`/`/api/auth/me` and `lib/auth-context.tsx` but not the shell.

**Unit A** edits the two named binds and returns the DTO from `/api/auth/me`; the six `StaffAuthShell` props still leak. **Unit B** defines a client DTO and projects at every shell. Both can claim "the client staff DTO carries only `hasPatchScope`, `supervisorName`, `supervisorRole`"; Unit A's `initialStaff` is a second DTO.

**The break.** The supervisor's `location_ids` and name reach the browser on any page that passes `staff` to a client shell, which the `users` RLS policy deliberately denies a non-Admin (`20261006010000:152-160`). This is the same privacy inversion v1 F8 identified, through a different channel.

**Proposed tighten.** `patchOwner` is never on the serializable `StaffContext`; keep it on a server-only `ResolvedStaffScope` and send a single `toClientStaff()` projection from both `/api/auth/me` and every shell. Add `components/staff-auth-shell.tsx` and the six page props to AD-1's binds.

---

### F10 — `/attendance`'s no-session path and the Admin's session path (AD-4/AD-5) — P1

The staff GET defaults `date` and calls `getAttendanceByDate(date)` (service-role, programme-wide) for every role (`apps/folk/app/attendance/route.ts:118-145`, `lib/supabase/data.ts:1010-1032`). AD-4 says "The `/attendance` GET is session-scoped or patch-scoped; a date-wide programme read is Admin-only" (`SPINE:100`). **Unit A:** no `session` + non-Admin → 403. **Unit B:** no `session` + non-Admin → a new patch-scoped date query. Both comply with "session-scoped or patch-scoped"; the AD never says which.

Separately, the Admin's `?session=` path uses `sessionsScope` + `isSessionVisible` (`sessions_visible` Admin = creator-only, `20261102030000:29-35`), so an Admin gets 403 for a session they did not create, while `/manage?mode=admin` shows its attendance. The AD does not say whether the Admin's attendance GET is creator-only or programme.

**Proposed tighten.** Add a per-role table for `?date=` without `?session=`. State whether the Admin's attendance GET is creator-only or programme, and name the patch-scoped date query if Unit B is intended.

---

### F11 — The attendance helper's enumeration is narrower than the predicate it claims to match (AD-5) — P1

AD-5 says `caller_can_read_attendance_session()` "matches the session predicate, including sessions the owner `created_by` as well as `preacher_id`" (`SPINE:112`). The enumeration is `preacher_id = owner OR created_by = owner`; it omits `created_by = actor` and the Preacher's assistant-created term. The current function is `s.preacher_id = auth.uid() OR s.preacher_id = caller_assigned_preacher_id()` (`20261006010000:114-132`); the revision adds the owner's `created_by` but not the actor's. A legacy session the Preacher sees in `/sessions` via the assistant term (`20261102030000:43-51`) but whose `preacher_id` is not the Preacher yields zero attendance rows in `/manage`. The DECISION flags only the owner case (`DECISION:148`).

**Proposed tighten.** State the exact boolean, not a paraphrase: `EXISTS (... s.preacher_id = owner OR s.created_by = owner OR s.created_by = actor OR (caller_role() = 'Preacher' AND s.created_by IN (active staff assigned to owner)))` — or declare the extra terms out of scope. A test must cover a session that `/sessions` shows and `/manage` must count.

---

### F12 — Locations still have no named field (AD-3) — P1

`ManageScope.locationIds`, `locationOptions`, `locations`, `SessionsScope.locationIds` and `StaffContext.locationIds` all exist. `loadManagePortalData` filters `locationRows` by `staff.locationIds` (`lib/supabase/manage.ts:565`) and sets `scope.locationIds` to it (`:737`); `loadContactsSectionData` sets `locationOptions` from it (`:846`); `sessionsScope` sets `locationIds` from the supervisor (`lib/sessions/scope.ts:70`). AD-3 says "locations: `owner.locationIds`" (`SPINE:79`) and the convention says "a picker or write check never offers a location outside that list" (`SPINE:127`), but a unit can set `scope.locationIds` and leave `locationOptions` (or vice versa). For an Assistant, `staff.locationIds` is `[]` by construction (`apps/folk/app/api/admin/invite-user/route.ts:35`), so the missed field is empty.

**Proposed tighten.** `patchOwnerLocationIds` in the server scope; `locationOptions` and the write checks use it; `locations` is the name-resolution set and may be wider; never `staff.locationIds` for an Assistant.

---

### F13 — The header's `isPreacher` is still the only switch (AD-4) — P1

`isPreacher = Admin || Preacher` (`lib/auth-context.tsx:198`) controls the Contact item (`/contacts` vs `/contact`), the Sessions + Invite branch, and Manage (`components/header.tsx:269,277-284,287`). To give an Assistant Contacts and Manage, **Unit A** widens `isPreacher`; the Assistant then enters the `isPreacher` branch and gets **Invite → `/volunteers`**, which redirects to `/auth/error` (`apps/folk/app/volunteers/page.tsx:12`) — the exact "nav admits a surface the page refuses" failure. **Unit B** adds explicit Assistant branches; the Contact item still points to `/contact`, so the grid is only reachable by a back link. A null-patch Assistant still gets Campaign (`canUseCampaignAdmin = isPreacher || isAssistant`, `components/header.tsx:249`), which `campaignScope` refuses.

**Proposed tighten.** A client capability set (`hasPatch`, `canReadContacts`, `canManage`, `canInviteVolunteers`, `canReadCampaigns`) from the DTO; Campaign hidden when `hasPatch` is false; never reuse `isPreacher` for Assistant.

---

### F14 — AD-5's helper eligibility still omits AD-1's same-programme clause; the Volunteer location branch is undecided (AD-1/AD-5) — P2

`caller_assigned_preacher_id()` checks caller Active + assignee Active (`20261006010000:70-83`); AD-5 adds the assignee role (`SPINE:109`) but not the same-programme clause AD-1 requires (`SPINE:55`). `caller_effective_location_ids()` also applies the assignment branch to Volunteers (`20261006010000:88-108`); AD-3's patch for a Volunteer is empty. The policies' `program_id = caller_program_id()` contain the cross-program id in practice, but the AD's "an ineligible assignment returns null/empty, matching `patchOwner = null`" is false, and a future policy without a program term inherits the gap. The Volunteer branch is the form's reference list, not a patch — but the AD does not say.

**Proposed tighten.** One `isEligibleSupervisor` predicate in SQL and TS (Active + same programme + Admin/Preacher); gate the location branch on Assistant or state the Volunteer reference exception.

---

### F15 — `supervisorName`/`supervisorRole` have no null semantics (AD-1) — P2

For an Admin/Preacher (`patchOwner = self`) and for an Assistant with an ineligible FK (`patchOwner = null`), the DTO's `supervisorName`/`supervisorRole` are undefined by the AD (`SPINE:58`). **Unit A** returns the self row's name/role for an Admin/Preacher and the raw FK's name for an ineligible Assistant (with `hasPatchScope = false`); **Unit B** returns null. The header's supervisor label and the "unassigned" notice differ.

**Proposed tighten.** Define the fields as "the eligible supervisor's display name and role, else null"; Admin/Preacher have no supervisor label.

---

### F16 — Campaigns: the `campaignScope` `kind` for an Admin is contradictory (AD-3 vs autodialer AD-3) — P2

AD-3 says the patch scopes through `campaignScope` with `kind: "preacher"`, `userId = owner.userId` (`SPINE:84`); the autodialer AD-3 returns `kind: "program"` for an Admin (`lib/dialer/scope.ts:255-263`), and the new spine says "Campaign objects stay programme-level per the autodialer spine's AD-3" (`SPINE:84`). **Unit A** applies `kind: "preacher", userId = admin` to the Admin, narrowing the assignable callers, progress and contact scope; **Unit B** keeps `kind: "program"`. The autodialer AD-3's "an Admin reads only the campaigns they created" (`lib/dialer/campaigns.ts:199-227`) also contradicts "campaign objects stay programme-level" if read as all roles.

**Proposed tighten.** "Admin = `kind: program`, creator-only campaign list; Preacher/Assistant = `kind: preacher`, owner id, programme-level campaign objects."

---

### F17 — `mode` still has two authors, and a Preacher can still pass `?mode=admin` (AD-3) — P2

AD-3 says "an Assistant's manage/contacts payload always reports the personal-patch view" and "a Preacher's and an Assistant's modes are fixed" (`SPINE:88`). `resolveManageMode` returns "admin" for any role (`components/manage/manage-types.ts:263-265`); `loadManagePortalData` sets `narrowToPreacher = mode === "preacher"` (`lib/supabase/manage.ts:555`); the page passes the query value (`apps/folk/app/manage/page.tsx:67`). A unit can force the payload's `mode` field (report "preacher") while leaving the filter off; another forces the loader's mode and filter. A Preacher's `?mode=admin` currently disables the app filter and shows the full RLS patch (including the assistant-created term); the AD says the Preacher's mode is fixed.

**Proposed tighten.** The loader is the authority: `mode = staff.role === "Admin" ? resolveManageMode(query) : "preacher"`; `narrowToPreacher` derives from the caller, not the query; the payload's `mode` and the filter can never disagree.

---

### F18 — The dashboard RPC is owner-only; AD-3's `created_by = actor` and AD-5's "service role is never a second scope definition" are unaddressed (AD-3/AD-5) — P2

`loadDashboardOverview` passes only `p_scope_preacher_id` and `p_program_scope` (`lib/dashboard/overview.ts:27-38`); the RPC's sessions predicate is `preacher_id = owner OR created_by = owner` (`20261102010000:146-148`). The actor term is not representable. The dashboard's `programme_attendance` CTE reads every attendance row in the programme (service role) for `first_ever_attendance` (`20261102010000:718-730`). A unit applies AD-3's actor term to the dashboard (needs a new parameter) and folds the CTE into the patch; another keeps the spec. The `new_attendees` KPI and the live band's session counts can differ.

**Proposed tighten.** State that the dashboard is owner-only by decision (and why), or add the actor id. Decide whether `first_ever_attendance` is programme-wide by design or a patch read.

---

### F19 — `/api/sessions` still re-resolves the supervisor and requires `Preacher` (AD-1/AD-4) — P2

The sessions POST checks `staff.role === "Assistant"` → `findStaffUserById(assignedPreacherUserId)` → `role !== "Preacher"` → 403 (`apps/folk/app/api/sessions/route.ts:180-195`; `apps/gita-life/app/api/sessions/route.ts:104-111`). AD-3 says stamp `preacher_id` with `patchOwner.userId`; the DECISION names the stamping but not this check (`DECISION:99`). A unit removes the check and uses `patchOwner`; another keeps it and changes only the stamp → an Assistant of an Admin gets a 403 on create while the page offers the form. AD-4's "a page admitting Assistant while its handler refuses" (`SPINE:93`) is exactly this.

**Proposed tighten.** Use `patchOwner` for the owner and locations; delete the re-read or replace it with a `patchOwner === null` check.

---

## AD-by-AD verdict

| AD | Verdict | The one thing that must change |
| --- | --- | --- |
| AD-1 | **Under-specified** | `patchOwner` is server-only but the RSC `initialStaff` path still ships `StaffContext`; the DTO's `supervisorName`/`supervisorRole` null semantics are undefined; the "no `findStaffUserById` for scope" exception does not name the sessions write path. |
| AD-2 | **Contradictory** | "Away from Assistant clears the FK" breaks the Volunteer routing; `/volunteers` cannot supply an Admin's supervisor; the "cannot be moved" rule contradicts "an Admin may bind any eligible supervisor." |
| AD-3 | **Partially closed; two contradictions** | The SQL-argument sentence omits the actor's id; the `/contact` form rule contradicts the write rule; the null-owner predicate is not empty; the campaigns sentence contradicts the Admin's `kind: "program"`. |
| AD-4 | **Partially closed; one contradiction** | `/campaigns/**` in `OPERATIONAL_ROLES` contradicts the dialer caller path; the header has no capability model; `/api/sessions` still refuses an Admin supervisor. |
| AD-5 | **Right direction; under-specified** | The Admin branch is never named; the attendance helper enumerates two of four terms; the "page may narrow" and "the database must not grant what the app does not show" sentences contradict; the helpers omit the same-programme clause. |
| AD-6 | **Holds in intent** | The broad "user-facing text" wording covers the route errors and dashboard copy; no new hole. The `supervisorName` null semantics belong to AD-1. |

---

## Fix list, in build order

**P0 — before any unit starts (each is a two-unit incompatibility):**

1. **One contact write contract.** Reconcile AD-3's writes row with AD-4's form rule; decide the Admin picker, the Volunteer fallback, and `collected_by_id`. (F1)
2. **Name the SQL argument vector.** Add the actor's id; say which functions are owner-only; reconcile `sessions_visible`, `sessions_overview`, `dashboard_overview`. (F2)
3. **Define the null patch per surface.** Empty vs actor-only vs explanation vs refusal; hide Campaign or drop "no dead nav items"; define `/sessions` and `/attendance`. (F3)
4. **Pin the `/manage` vs `/sessions` predicate.** Add the Preacher's assistant term and the Assistant's legacy terms to both, or state that RLS may be wider than every page and remove the "Prevents" clause. (F4)
5. **Fix the binding lifecycle.** Clear only for Admin/Preacher; set/replace for Volunteer; require a supervisor for Assistant; add the `/volunteers` picker and remove the "cannot be moved" block. (F5)

**P1 — same change, before the surfaces ship:**

6. Name the Admin RLS branch; do not narrow it. (F6)
7. Split the campaign admin and caller role sets; state the caller path is not a patch. (F7)
8. Rename `ManageScope.staffUserId`/`staffName`; fix the draft prefill. (F8)
9. Add `StaffAuthShell` to the client-DTO projection. (F9)
10. Define `/attendance?date=` and the Admin's `?session=` scope. (F10)
11. State the attendance helper's exact boolean. (F11)
12. Name `patchOwnerLocationIds` and the picker/name-resolution fields. (F12)
13. Add the client capability set; hide Campaign for a null patch; never reuse `isPreacher` for Assistant. (F13)

**P2 — can land with the implementation:**

14. Add the same-programme clause to the helpers; decide the Volunteer location branch. (F14)
15. Define `supervisorName`/`supervisorRole` null semantics. (F15)
16. Pin the Admin's `campaignScope` `kind`. (F16)
17. Make the loader the `mode` authority; fix a Preacher's `?mode=admin`. (F17)
18. Decide the dashboard actor term and the `programme_attendance` CTE. (F18)
19. Remove the sessions POST's `Preacher` re-read. (F19)
20. Add a proxy-matcher parity test (v1 F11). (P2)

---

## Residual risks (pre-existing, not caused by this spine — do not use these to block it)

- `assertManageContactInScope` falls back to a service-role existence probe (`lib/supabase/manage.ts:884-900`), a UUID oracle across the programme. It returns no row content.
- The RLS scope check and the service-role write are two statements (`lib/supabase/manage.ts:1152`, `:1157`); a contact reassigned between them could be written out of scope. Not new.
- `dashboard_overview`'s `programme_attendance` CTE reads every attendance row in the programme to compute `new_attendees` (`20261102010000:718-730`). It is a KPI input, not a row read, but it is a service-role read inside a patch-scoped dashboard. F18 asks for the decision; if the answer is "programme-wide by design," record it.
- Adding `patchOwner` makes `getStaffContext` a third round trip. Resolve it conditionally (Assistants only) and cache it per request; the existing `refresh` option is unused.

## Verification

- Read-only review. No code, migrations or tests were changed; no test suite was run. Every claim is a static reading at `66e72a2`.
- The unit pairs are constructs, not proposed implementations. Each half passes a literal reading of the ADs as written; the seam is the evidence, not a preference.
- The working tree has unrelated edits under `components/campaign/`; this review does not depend on them.
