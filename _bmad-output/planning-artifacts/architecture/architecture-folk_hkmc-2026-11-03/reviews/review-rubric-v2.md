# Rubric review v2 — Staff scope: Admin supervisors and Assistant surfaces

- **Reviewer role:** second-pass rubric walker in the architecture-spine review gate. I did not edit the spine or the note.
- **Target:** `ARCHITECTURE-SPINE.md` (AD-1 … AD-6) and `DECISION-admin-assistants.md`, read against the working tree at `66e72a2` (2026-11-03). The sibling `_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md` is the inherited spine. The previous review is `reviews/review-rubric.md`.
- **Method:** the eight-item checklist. Every brownfield claim was re-checked against code, not taken from the companion documents. The two-unit test was used only to confirm a checklist failure, not as the primary lens. Static review: no code changed, no test run.
- **Verdict:** **fail — changes required (narrower than v1).** The revision fixes four of the eight v1 blockers outright: the invite/binding rule (B-3), the Volunteer contact gate (B-2, partly), the `/attendance` surface (B-6) and the Preacher assistant-created term (B-8). It adds a good naming AD (AD-6) and an adequate AD-13 supersession sentence. It does **not** fix the three that let two units ship different Admin or `/contact` behaviour (B-1, B-2's write half, B-7), and it leaves one new ambiguity (the null-patch matrix). Three High findings block parallel build.

---

## 1. Scorecard

| # | Checklist item | Verdict | Why |
|---|---|---|---|
| 1 | Fixes the real divergence points and misses none | **Fail** | Fixed: invite/binding, the Volunteer form gate, `/attendance`, the Preacher assistant-created term. Missed: the Admin branch per surface (B-1), the `/contact` write rule (B-2), the service-role/reference-read rule (B-3), the null-patch matrix (B-4), the same-program RLS check (N-5), the campaign assignable caller owner (N-6), the data audit (B-5). |
| 2 | Every AD's Rule is enforceable and prevents its stated divergence | **Fail** | AD-3's universal `owner = patchOwner` predicate contradicts its own Admin exception (`:82`) and the Deferred (`:176-177`); AD-3's `writes` bullet contradicts AD-4's `/contact` form rule (`:96`); AD-5's service-role sentence is over-broad (`:114`); AD-5 omits the same-program condition; AD-4's "existing empty-scope explanation" exists only on `/dashboard` (`:100`); `[ADOPTED]` is undefined. |
| 3 | Nothing under Deferred could let two units diverge | **Fail** | The `collected_by_id` deferral (`:175`) is contradicted by AD-3's `collected_by_id = actor` (`:80`); the Admin `/sessions` deferral (`:176`) is contradicted by AD-3's sessions predicate (`:77`). The pre-deploy data audit is absent altogether (B-5). |
| 4 | Named technology is verified-current | **Fail (narrow)** | Next 16.0.7 is the repo pin; current is 16.4.4, and the sibling records CVE-2026-44575 fixed in 16.2.5. AD-4 makes the proxy matcher load-bearing, so the missing CVE note is now material. `@supabase/supabase-js` is `^2.105.1`; current is 2.118.0. |
| 5 | Ratifies rather than contradicts the brownfield | **Fail** | AD-6 is a good ratification. But AD-3's Admin predicate contradicts `/contacts`, `/manage?mode=admin` and the Admin `/sessions` filter; AD-3's write rule contradicts `/api/contact`; AD-5's service-role rule contradicts the sanctioned location/staff-name reads; AD-2's role-change clear breaks the Volunteer `/contact` routing; `STAFF_ADMIN_ROLES` overstates the current role-change model. |
| 6 | Covers the decision's capabilities | **Pass with notes** | All surfaces in the note's "What an Assistant can open" table are covered. Gaps: the `/volunteers` Admin picker (N-7), the campaign assignable caller owner (N-6), the `ManageScope` field contract (N-8), and the `sessions_visible` service-role predicate (N-4). |
| 7 | No new AD weakens or contradicts a parent/sibling spine | **Fail** | AD-3's campaigns paragraph (`:84`) makes an Admin preacher-scoped, contradicting autodialer AD-3/AD-5 (Admin = program); the null-patch header leaves the autodialer AD-2 Campaign item but 403s, contradicting the note's "no dead nav items"; AD-13's supersession is stated but not enforced (B-6); `apps/*/app/{…campaigns…}` implies a Gita Life Campaign route that autodialer AD-14 forbids. |
| 8 | Every owned dimension is decided, deferred, or open | **Fail** | Decided: identity, scope, surfaces, RLS, naming, invite/binding, attendance. Silent or only partly decided: pre-deploy data audit, null-patch `/sessions`/`/dashboard`, campaign assignable caller owner, `sessions_visible`, `ManageScope` fields, the Volunteer location branch, the doc updates. |

**Verdict: fail.** The revision is materially better than v1; the remaining failures are concentrated in four sentences (AD-3's universal predicate, AD-3's write bullet, AD-5's service-role bullet, AD-4's null-patch sentence) and one missing Open item. Each has a cheap, local fix.

---

## 2. What the revision fixed

Give credit first: this is not a cosmetic pass.

- **AD-2 (invite/binding)** now exists and is the right shape: an eligible supervisor is Active, same programme, role Admin or Preacher; an Admin may bind to any eligible supervisor; a Preacher is self-only; both invite routes use the same predicate; the picker lists both roles; a role change away from Assistant clears the FK; and AD-1's `findStaffUserById` ban is explicitly exempted for the invite/contact write validation (`:58`, `:60-69`). This closes v1's B-3 (mostly; see N-7 for the `/volunteers` page).
- **AD-4's `CONTACT_FORM_ROLES`** (`:96`) removes `/contact` from the operational set and keeps all four roles on the staff contact form. That closes v1's B-2 role-gate half and correctly ratifies the Volunteer form.
- **AD-4's `/attendance` binding and decision** (`:34`, `:100`): the route is now in the AD-4 bind list, the date-wide programme read is decided Admin-only, and `/manage`, `/api/manage/*`, `/attendance` are added to the app-level proxy matcher. That closes v1's B-6.
- **AD-3's Preacher assistant-created term** (`:77`): the sessions predicate now keeps `created_by IN (active staff assigned to owner)` for a Preacher, matching `sessions_visible` and the RLS policy. That closes v1's B-8.
- **AD-1's client DTO** (`:58`) now carries only `hasPatchScope`, `supervisorName`, `supervisorRole`; `patchOwner.locationIds` stays server-side. That closes the client-leak half of the adversarial F8.
- **AD-6 (naming)** (`:116-120`) is a clean ratification: keep `assigned_preacher_id` and `StaffContext.assignedPreacherUserId`, make the contract "supervisor", label it "Supervisor" with the role, defer the rename. No new column, view or alias.
- **AD-13's supersession** (`:102`) is now named exactly: the manage-contacts gate is superseded; the Campaign routes and AD-2 role set are unchanged; only the AD-3 helper reads the patch owner. That is the right sentence (see B-6 for enforceability).

---

## 3. Brownfield facts re-verified

| Claim | Verdict | Evidence |
|---|---|---|
| `getStaffContext()` returns the raw FK only; it does not resolve a supervisor | True | `lib/authz.ts:15-40,105-140,201-226` |
| `/dashboard` accepts a supervisor only when the assignee is an Active **Preacher**; an Admin-supervised Assistant gets `assistantUnassigned` | True | `lib/dashboard/scope.ts:59-67` |
| `/sessions` accepts a supervisor only when the assignee is an Active **Preacher** | True | `lib/sessions/scope.ts:43-71` |
| `/campaigns` uses the raw `assignedPreacherUserId` with no Active/role/program check | True | `lib/dialer/scope.ts:279-291` |
| The Admin `/sessions` read is creator-only | True | `supabase/migrations/20261102030000_admin_creator_only_sessions.sql:33-38` |
| `sessions_visible` gives an Assistant `created_by = p_user_id OR preacher_id = p_user_id`; it has the Preacher assistant-created term | True | `supabase/migrations/20261101000000_sessions_flow.sql:66-107` |
| `sessions_visible`'s Admin branch is `created_by = p_user_id` only | True | `20261102030000_admin_creator_only_sessions.sql:33-38` |
| `/manage?mode=admin` is programme-wide; the app narrows only when `mode=preacher` | True | `lib/supabase/manage.ts:554-566` |
| `/contacts` is personal for **every** role, including Admin | True | `lib/supabase/manage.ts:809-811`; `components/contacts/contacts-types.ts:8-11` |
| `loadContactsSectionData` reads **all** programme locations with the service role, deliberately | True | `lib/supabase/manage.ts:760-806` |
| `/api/contact` has no `requireRole`; Volunteer/Assistant route through `assigned_preacher_id`, Admin must pick an explicit Preacher; collector = assigned preacher for Admin/Preacher, actor for Volunteer/Assistant | True | `apps/folk/app/api/contact/route.ts:51-80,136-149`; same shape in `apps/gita-life/app/api/contact/route.ts` |
| `/contact` is the Volunteer's only contact-capture surface | True | `apps/folk/app/contact/page.tsx:11-30`; `components/contact-form.tsx:216-219`; `components/header.tsx:269` |
| `/manage` and `/api/manage/contacts/**` are Admin/Preacher only | True | `apps/folk/app/manage/page.tsx:64`; `lib/manage/api-handlers.ts:253,292,328,418,460,513`; `lib/contacts/section-server.ts:42-44` |
| `createManageContact` stamps `assigned_preacher_id = staff.userId`, `collected_by_id = staff.supabaseUserId` | True | `lib/supabase/manage.ts:1198-1213` |
| `upsertStaffUser` writes `assigned_preacher_id` only when supplied; it never clears it on a role change | True | `lib/supabase/data.ts:418-425` |
| `caller_assigned_preacher_id()` / `caller_effective_location_ids()` check only the assignee's `Active`; no role and no same-program condition | True | `supabase/migrations/20261006010000_scoped_rls_policies.sql:70-108` |
| `caller_can_read_attendance_session()` checks `preacher_id` only — no `created_by`, no actor term | True | same migration `:114-131` |
| The sessions RLS policy has `preacher_id = auth.uid()` for Assistants, plus `created_by = caller_assigned_preacher_id()` and the assistant-created term | True | `20261101000000_sessions_flow.sql:37-54` |
| `loadAssignableCallers` adds `staff.userId` (the actor) to the roster, not the scope owner | True | `lib/dialer/scope.ts:166-186` |
| `/attendance` GET with no `session` calls `getAttendanceByDate`, a service-role programme-wide read, admitted to Assistant | True | `apps/folk/app/attendance/route.ts:118-146`; `lib/supabase/data.ts:1010-1032` |
| The proxy matchers omit `/manage`, `/api/manage/*`, `/attendance` in both app copies | True | `apps/folk/proxy.ts:9-23`; `apps/gita-life/proxy.ts:9-23` |
| `apps/gita-life/app` has no `campaigns` directory | True | directory listing; autodialer AD-14 |
| `apps/gita-life/app/sessions/page.tsx` has its own inline supervisor resolver | True | `apps/gita-life/app/sessions/page.tsx:16-33` |
| The `/volunteers` page renders `InviteUserForm mode="volunteer"` with no `preachers` prop; the supervisor select renders only for `mode="admin"` | True | `apps/folk/app/volunteers/page.tsx:19`; `components/invite-user-form.tsx:263-277` |
| Next 16.0.7 is the repo pin; current is 16.4.4; the sibling records CVE-2026-44575 fixed in 16.2.5 | True | `package.json:115`; npm registry; autodialer spine Deferred |
| `@supabase/supabase-js` is `^2.105.1`; current is 2.118.0 | True | `package.json:102`; npm registry |
| `[ADOPTED]` is defined nowhere but this spine | True | only occurrences `ARCHITECTURE-SPINE.md:60,71,90,116` |

---

## 4. Blocking findings

### B-1 — High — AD-3 still erases the Admin's per-surface scope, and AD-4 makes it worse

**Where:** AD-3 `ARCHITECTURE-SPINE.md:75-88` (bullets 76-80, "Admin exception" 82, Campaigns 84, null owner 88); AD-4 `:100` ("Every one scopes through `patchOwner`"); AD-3's Deferred `:176-177`; autodialer AD-3/AD-5.

**The rule as written.** "for `owner = patchOwner` … contacts: `assigned_preacher_id = owner.userId` on the grid and manage surfaces; sessions: `preacher_id = owner.userId OR created_by = owner.userId OR created_by = actor`; … locations: `owner.locationIds`". AD-1 says an Admin's `patchOwner` is **self** (`:54`). Then the "Admin exception" says "An Admin's programme scope remains the default (`program_scope = true`); `?mode=preacher` narrows to `scope_preacher_id = admin.userId`." The exception names only `program_scope`/`scope_preacher_id` — dashboard and campaign RPC parameters — and never says which surfaces are exempt. The Campaigns paragraph is unconditional: `campaignScope` with `kind: "preacher"`, `userId = owner.userId`, which for an Admin is `userId = admin`, not `{kind:"program"}`.

**What the code does today.**

- `/contacts` is **personal for every role**, including Admin (`loadContactsSectionData` filters `assigned_preacher_id === staff.userId`, `lib/supabase/manage.ts:809-811`; `components/contacts/contacts-types.ts:8-11`).
- `/manage?mode=admin` is **programme-wide** (no app filter, `lib/supabase/manage.ts:554-566`); `?mode=preacher` narrows to the Admin's own rows.
- `/sessions` for an Admin is **creator-only** (`20261102030000_admin_creator_only_sessions.sql:33-38`), not `preacher_id = admin OR created_by = admin`.
- `campaignScope` for an Admin is `{ kind: "program" }` (`lib/dialer/scope.ts:258-263`); `campaign_progress`/`dashboard_overview` only programme-read with `program_scope = true`.
- The spine's own Deferred says the Admin `/sessions` alignment is a **separate change** (`:176`) and the Admin `/sessions` is creator-only. AD-3's predicate would align it now.

**Two lawful units.**

- **Unit A** applies AD-3 literally on every bullet. Admin `/manage` and `/contacts` collapse to the Admin's own rows; Admin `/sessions` adds `preacher_id = admin`; Admin campaigns use `kind: "preacher", userId = admin`; the "Admin exception" is read as dashboard-only because `program_scope` is a dashboard parameter. The Admin's core views regress.
- **Unit B** applies the "Admin exception" broadly. Admin `/manage`, `/dashboard`, campaigns stay programme; `/sessions` stays creator-only via the Deferred; but `/contacts` also becomes programme-wide (the exception says "programme scope remains the default"), which regresses the personal `/contacts` section.
- **Unit C**, the only correct reading, applies per-surface brownfield behaviour (contacts personal, manage mode admin programme, sessions creator-only, dashboard programme default, campaigns program). The spine does not state that reading; it has to be inferred from the code and the Deferred.

The break is not a wording nit: the Admin's `/manage`, `/contacts`, `/sessions` and campaign counts are the feature's most-used surfaces, and each unit has a textual warrant.

**Fix.**

1. Restate AD-3 as **the Assistant's predicate**, or add a per-surface table with an explicit Admin column. At minimum:
   - `/contacts`: personal for every role (`assigned_preacher_id = actor`); the Assistant uses the owner.
   - `/manage`: `mode=admin` is programme for an Admin (no app filter); `mode=preacher` is `staff.userId`; an Assistant is forced to `mode=preacher` with `owner.userId`.
   - `/sessions`: Admin creator-only (the Deferred); Preacher own-patch + assistant-created; Assistant `preacher_id = owner OR created_by = owner OR created_by = actor`.
   - `/dashboard`: Admin programme default, `?mode=preacher` narrows; Preacher/Assistant `program_scope = false` with `scope_preacher_id = owner`.
   - `/campaigns`: Admin `campaignScope` `{kind:"program"}`; Preacher/Assistant `{kind:"preacher", userId: owner.userId}`. Add "for a Preacher or Assistant" to the Campaigns paragraph.
2. Change AD-4's "Every one scopes through `patchOwner`" to "Every one resolves its scope from `patchOwner`; an Admin's programme surfaces keep the programme scope."
3. Either remove the "Unify the Admin's `/sessions` filter" Deferred and make AD-3 the target, or keep the Deferred and state that AD-3's sessions row is **Assistant-only**. The two cannot both be true.

---

### B-2 — High — AD-3's write bullet still overrides the `/contact` form's per-actor assignment and the `collected_by_id` deferral

**Where:** AD-3 `:80` ("writes: `assigned_preacher_id` (contact) and `preacher_id` (session) carry `owner.userId`; `collected_by_id` and `created_by` carry `actor`"); AD-4 `:96` ("The form keeps its own assignment rule: Volunteer → Preacher; Assistant → Admin or Preacher; Preacher → self; Admin → explicitly chosen Preacher"); Deferred `:175`; note `:56` ("Contact write (grid)").

**The rule as written.** AD-3's write bullet is universal and binds `apps/*/app/api/{sessions,contact,manage}/**` (`:73`), which includes `POST /api/contact`. For `owner = patchOwner`:

- an **Admin**'s contact write stamps `assigned_preacher_id = admin` and `collected_by_id = admin`;
- a **Volunteer**'s owner is `null` (AD-1 `:56`), so the row is unassigned and the Volunteer's Preacher never sees it;
- an **Assistant**'s contact stamps the supervisor and collects by the Assistant.

AD-4 says the form keeps the existing rule: an Admin **chooses** a Preacher; a Volunteer is assigned to their Preacher; the Assistant's supervisor is the owner. The two cannot both hold for `/api/contact`.

**What the code does today.** `resolveAssignedPreacher` (`apps/folk/app/api/contact/route.ts:59-80`):

- Volunteer/Assistant → `staff.assignedPreacherUserId`, validated as an Active Preacher;
- Preacher → self;
- Admin → `payload.assignedPreacherUserId`, validated as an Active Preacher.

`collectorId = staff.role === "Volunteer" || staff.role === "Assistant" ? staff.userId : assignment.preacher.id` (`:136-137`). So the Admin's contact is owned and collected by the **chosen Preacher**, not the Admin; the Volunteer's is owned by the assigned Preacher and collected by the Volunteer. The Deferred `:175` says the feature **preserves both** collector meanings.

**Two lawful units.**

- **Unit A** implements AD-3 on every contact write: Admin contacts become Admin-owned, the explicit picker is removed; Volunteer contacts become unassigned (owner null); `collected_by_id` becomes the actor on every path. The Volunteer's only contact-capture surface silently stops working; the Admin's chosen-Preacher workflow disappears; the Deferred is violated.
- **Unit B** implements AD-4's form rule and the brownfield collector. It keeps the Admin picker and the Volunteer assigned-Preacher path; AD-3's write bullet is violated (or read as grid-only, which the spine never says).
- The same Admin creating a contact via `/manage` (owner = self) and via `/contact` (owner = chosen Preacher) lands the two rows in different patches, with different collectors. The note's own table labels the rule "Contact write (grid)" (`:56`); the spine dropped "grid".

**Fix.** Scope AD-3's write bullet to the **manage grid**: `assigned_preacher_id = owner.userId`, `collected_by_id = actor`, `created_by = actor`, `preacher_id = owner.userId`. Add a separate `/contact` row: "Admin → explicitly chosen Preacher; Volunteer → assigned Preacher; Assistant → `owner.userId`; Preacher → self; collector keeps the existing per-role rule." Then either keep the `collected_by_id` Deferred (and say the `/contact` form is unchanged) or remove it and state the unification — do not do both.

---

### B-3 — High — AD-5's service-role sentence is still over-broad, and the note lost the qualifier v1 said was right

**Where:** AD-5 `:114` ("A staff read through the service-role client passes the same `patchOwner` id and the actor's role. The service role bypasses RLS and is never a second scope definition."); note `:125`; AD-5's binds `:106` ("every user-scoped and service-role staff read"); AD-3's "locations: `owner.locationIds`" (`:79`); Consistency Convention "Locations are the owner's `users.location_ids`" (`:127`).

**The rule as written.** Every service-role staff read must pass `patchOwner`. That is not what the code does, and it must not be:

- `loadContactsSectionData` reads **all programme locations** with `createSupabaseAdminClient()` on purpose (`lib/supabase/manage.ts:760-806`). Its comment says narrowing would render a contact at a location outside the reader's scope as `Unknown location`, indistinguishable from a deleted location. The page's header counts active programme locations. This is a **reference/naming set**, not a scope read.
- `loadStaffDisplayNames` reads names with the service role; a staff name is reference data, not a scope grant.
- `getStaffContext()` itself reads `public.users` with the service role (`lib/authz.ts:146-161`). It cannot pass `patchOwner` — it is resolving it. A literal implementation is circular.
- `loadAssignableCallers` reads the staff roster and `dialer_callers` with the service role (`lib/dialer/scope.ts:107-159,188-191`); the scope is the roster slice, not a `patchOwner` argument.

v1's B-7 said the note's "Any service-role read **that replaces a caller-scoped read**" was right and the spine should copy it, naming the sanctioned exceptions. The revision did the opposite: the spine kept the broad sentence and the note now says "Any service-role **staff read** passes the same `patchOwner` id and the actor's role" (`:125`), losing the qualifier. B-7 is **not fixed**; it is slightly worse.

**Two lawful units.**

- **Unit A** reads AD-5 literally: narrow `loadContactsSectionData`'s location read to `owner.locationIds`, narrow `loadStaffDisplayNames`, and try to pass `patchOwner` into the `getStaffContext` read. The `/contacts` overview starts labelling contacts outside the owner's locations as `Unknown location`; the location picker may offer nothing for an Assistant whose supervisor has no locations; the resolver cannot bootstrap.
- **Unit B** keeps the sanctioned reference reads, citing the code comments, and passes `patchOwner` only on the reads that **replace** a caller-scoped read (contacts, sessions, attendance, manage). It violates AD-5's literal sentence.

The locations ambiguity is concrete even without the service-role sentence: AD-3 says "locations: `owner.locationIds`" and the Conventions table says "a picker or write check never offers a location outside that list", but `loadContactsSectionData` has **two** location lists (`locations` for naming, `locationOptions` for the picker) with genuinely different jobs (`components/manage/manage-types.ts:156-168`). AD-3 names neither. A unit can narrow either one; the adversarial F9 and reality F8 both give the break.

**Fix.**

1. Replace AD-5's sentence with: "A service-role read that **replaces** a caller-scoped read passes the same `patchOwner` id and the actor's role. Reference-data reads — the programme location naming set, staff display names, the caller's own `public.users` row, the dialer roster — are not scope definitions and keep their existing justification."
2. Add the two-list locations rule: `patchOwner.locationIds` drives the **write picker** and the session-create filter; the naming set may be wider (programme locations); `locationOptions` is the picker. State which payload field is which.
3. Restore the same qualifier in the note (`:125`).

---

### B-4 — Medium-High — The null-patch state is still "empty" (false for sessions), and the Campaign nav is still a dead item

**Where:** AD-3 `:88` ("A null owner is an empty patch, never a widening"); AD-3's sessions predicate `:77` (`created_by = actor`); AD-4 `:100` ("`/manage` and `/contacts` render the existing empty-scope explanation rather than a redirect loop, the header hides their Contacts and Manage items, and `/campaigns/**` keeps the autodialer spine's refusal behavior"); note `:63` and `:124` ("no dead nav items"); autodialer AD-2 `:79`; autodialer AD-3 `:85`.

**The rule as written.** A null owner is an "empty patch". But the sessions predicate includes `created_by = actor`, so a null-patch Assistant still sees the sessions they created. The note's own risk (`:150`) says removing `preacher_id = auth.uid()` is a tightening — i.e. `created_by = actor` stays. "Empty patch" is false for `/sessions` and for the attendance of those sessions.

The null-patch behaviour is also incomplete per surface:

- `/manage` and `/contacts`: AD-4 says "the existing empty-scope explanation". There is **no** existing explanation on either surface. `/contacts` currently redirects an Assistant to `/contact` (`lib/contacts/section-server.ts:42-44`); `/manage` currently refuses with 403 (`apps/folk/app/manage/page.tsx:64`). The only existing explanation is the dashboard's `assistantUnassigned` copy (`components/dashboard/dashboard-header.tsx:94-104`). A unit cannot reuse it verbatim on `/manage`/`/contacts`.
- `/sessions` and `/dashboard`: AD-4 says nothing. `/dashboard` has `assistantUnassigned`; `/sessions` would show own creations.
- `/campaigns`: AD-4 keeps the autodialer 403. The header shows the Campaign item for **every** Assistant (autodialer AD-2 `:79`; `components/header.tsx:247-252`). AD-4 hides only Contacts and Manage. So a null-patch Assistant sees a Campaign nav item that 403s — exactly the "dead nav item" the note's e2e criterion forbids.
- The `/contact` form for a null-patch Assistant: `CONTACT_FORM_ROLES` admits it, but `resolveAssignedPreacher` has no supervisor and returns "Assistant contact routing is not configured." AD-4 does not say what the form renders.

**Two lawful units.**

- **Unit A** implements "empty patch" as zero rows on every surface: `/sessions` is empty (the Assistant loses their own created sessions), `/manage` attendance is empty, and the header hides Campaign to satisfy "no dead nav items" — which violates autodialer AD-2.
- **Unit B** implements the predicate: `/sessions` shows own creations; the header keeps Campaign (autodialer AD-2) and the item 403s; `/manage`/`/contacts` get invented copy, not "the existing" explanation. The note's e2e "no dead nav items" is unsatisfiable.

**Fix.**

1. Add a null-patch matrix: contacts/manage = empty with a surface-specific explanation; sessions = the actor's own creations; dashboard = `assistantUnassigned`; attendance = the attendance of the actor's own sessions; campaigns = the AD-3 403. Say "a null owner yields no **supervisor** rows; the actor's own creations remain" — not "empty patch".
2. Decide the Campaign nav: either hide it for a null-patch Assistant and amend autodialer AD-2, or keep it and change the note's e2e criterion from "no dead nav items" to "no dead Contacts/Manage items" plus a named 403 state. Do not leave both.
3. Replace "the existing empty-scope explanation" with the per-surface copy (or say "the dashboard's `assistantUnassigned` copy, reused with the surface name"). `/manage`/`/contacts` do not have one today.
4. Add the actor's `created_by` term to `caller_can_read_attendance_session()` (see N-4), or the null-patch Assistant's `/sessions` list and `/manage` attendance still disagree.

---

### B-5 — Medium — The two tightenings still have no pre-deploy data decision

**Where:** note `:149-150` ("Check for such rows before deploying" for (a) an Assistant assigned to a non-Preacher/non-Admin and (b) an Assistant who is `preacher_id` but not `created_by`); spine Deferred `:177` ("Deployment … inherited unchanged; this slice adds no runtime service, table or environment variable"); no audit/backfill item anywhere in the spine.

**The gap.** The feature is a tightening in two places:

- `caller_assigned_preacher_id()` gains a role check, so a legacy Assistant assigned to a Volunteer/Revoked/wrong-role row goes from a non-null scope to null.
- Removing `preacher_id = auth.uid()` from an Assistant's session visibility (to match AD-3) hides legacy rows where the Assistant is the `preacher_id` but not the `created_by`.

The note says "check for such rows before deploying" but does not decide audit, backfill, accept-as-is, or who runs it. The spine's Deferred says deployment is inherited unchanged, which reads as "no pre-deploy action". Two units will disagree on whether a migration ships: one adds a backfill/repair migration, one treats the rows as accepted and ships the tightening. The spine's `binds` includes `rls`, and AD-5 binds `supabase/migrations/**`, so the migration is in scope; the data step is not.

**Fix.** Add an **Open** (or Deferred with a named owner) item to the spine:

> **Open — pre-deploy data audit.** Before the migration: count Assistants with an ineligible `assigned_preacher_id` and Assistants who are `preacher_id` but not `created_by`. Decide repair, reassign, or accept. Record the counts in the migration PR. `scripts/verify-rls.mjs` gains fixtures for both shapes.

Then align the note's risks and the verification section.

---

### B-6 — Medium — AD-13's supersession is surfaced but not enforced

**Where:** AD-4 `:102` ("This supersedes the autodialer spine's AD-13 sentence that fixes `/api/manage/contacts/**` at `["Admin", "Preacher"]`."); note `:138` and `:153`; autodialer spine AD-13 (`_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md:152-156`, `status: final`); new spine `status: draft` (`:8`).

**What the revision got right.** The sentence is explicit, names the exact autodialer sentence, and preserves the Campaign routes, AD-2 role set and AD-3 helper. That is the right content.

**Why it is not yet enforceable.** The autodialer spine is `status: final` and still says `requireRole(staff, ["Admin", "Preacher"])` for `/api/manage/contacts/**`. The new spine is `status: draft` and says "supersedes" in a single sentence at the end of AD-4 — no front-matter `supersedes`/`amends` declaration, no requirement to update the sibling in the same change, and the autodialer file is not edited. A unit reading the final autodialer spine (and the repo's `docs/architecture.md` role matrix, which also says Admin/Preacher) can implement two roles and quote a `final` artifact. The note says the autodialer spine "should be updated in the same change" (`:153`) — "should" is not a rule.

**Two lawful units.**

- **Unit A** treats AD-4 as the superseding change: implements `OPERATIONAL_ROLES` on `/api/manage/contacts/**`, and leaves the autodialer file alone because the new spine is the newer artifact.
- **Unit B** treats the autodialer AD-13 as the binding `final` contract (it is the feature's inherited spine) and keeps `["Admin","Preacher"]`; the Assistant gets the `/manage` page but its write API refuses — exactly the "page admits Assistant while its handler refuses" failure AD-4's own "Prevents" column names (`:93`).

**Fix.** Add a front-matter declaration (`supersedes: [spec-autodialer/ARCHITECTURE-SPINE.md#AD-13]` or an "Amendments" section), require the sibling AD-13 text and `docs/architecture.md` role matrix to be edited in the same change, and add a test/assertion that the manage write gate equals `OPERATIONAL_ROLES`. The existing e2e matrix is the natural home.

---

## 5. Non-blocking findings

**N-1 — `[ADOPTED]` is still undefined (Medium-Low).** It appears on AD-2, AD-3, AD-4 and AD-6 (`:60,71,90,116`) and nowhere else in the repo. It reads as "unchanged", but AD-2/AD-3/AD-4 change behaviour. Define it ("the predicate is the existing own-scope predicate, adopted; the Assistant/Admin-supervisor terms are new") or drop it.

**N-2 — AD-5's RLS bullets should be phrased as branches, not whole policies (Medium).** "The contacts policy is `assigned_preacher_id = caller_assigned_preacher_id()` for an Assistant" (`:110`) omits `program_id = caller_program_id()` and the Admin/Preacher branches. A literal replacement leaks across programmes. Say "the Assistant branch of the existing policy, which keeps the program term and the other role branches" for contacts, sessions and attendance. Same for `:111-112`.

**N-3 — `sessions_visible` is not bound by AD-5 (Medium).** AD-5 binds the RLS helpers and policies (`:106`), not the service-role `sessions_visible` function. AD-3's Assistant predicate drops `preacher_id = actor`, but the function still has `s.preacher_id = p_user_id` for Assistants (`20261101000000:66-107`; `20261102030000:33-52`). A unit can update RLS and leave `/sessions` showing legacy rows. Add `sessions_visible` to AD-5's binds and say "the same predicate, including the drop of `preacher_id = actor` for an Assistant and the keep of `created_by = actor`".

**N-4 — `caller_can_read_attendance_session()`'s enumeration is narrower than the predicate (Medium-Low).** AD-5 says it "matches the session predicate, including sessions the owner `created_by` as well as `preacher_id`" (`:112`). A literal reader implements `preacher_id = owner OR created_by = owner`, missing `created_by = actor` for the null-patch Assistant. State the boolean exactly: `preacher_id = auth.uid() OR preacher_id = owner OR created_by = auth.uid() OR created_by = owner`, for the caller's role; keep the Admin branch.

**N-5 — The RLS helpers omit the same-program condition (Medium).** AD-1's eligible supervisor is "in the same programme" (`:55`); AD-5's helpers require Active + role (`:109`) but not `p.program_id = u.program_id`. A cross-program Active Admin/Preacher assignment yields a non-null `caller_assigned_preacher_id()` against a null `patchOwner`. Add the condition to both helpers and to `caller_can_read_attendance_session()`; add a fixture.

**N-6 — The campaign assignable caller set omits the owner (Medium).** AD-3 says the assignable caller set scopes through `campaignScope` with `kind:"preacher", userId = owner.userId` (`:84`). Autodialer AD-3's "plus themselves" adds the **actor**, not the owner (`lib/dialer/scope.ts:179-186`). For an Admin-supervised Assistant, the roster is users assigned to the Admin plus the Assistant; the **Admin** is not in the set, so the Assistant cannot assign contacts to their supervisor. State that `campaignScope` includes `owner.userId` in the assignable set, and add a test.

**N-7 — The `/volunteers` Admin picker is a silent surface (Medium-Low).** `apps/folk/app/volunteers/page.tsx:19` renders `InviteUserForm mode="volunteer"` with no `preachers` prop; the supervisor select renders only when `mode === "admin"` (`components/invite-user-form.tsx:263-277`). An Admin on `/volunteers` cannot choose a supervisor, so the Admin path 400s. The Admin's `/admin/invite` path works. If `/volunteers` is meant to create for an Admin, name the page and the `mode` change; if not, say `/volunteers` is Preacher-self-only for creates.

**N-8 — The `ManageScope`/draft-row field contract is ambiguous (Medium).** AD-3 says "Client payloads carry the actor id and the patch-owner id separately; no component derives one from the other" (`:88`), but does not say whether `ManageScope.staffUserId` keeps the actor meaning or becomes the owner. The grid uses `scope.staffUserId` for both the assigned prefill and the collector (`components/manage/manage-contacts-table.tsx:273-278,651`). Name the fields (`actorUserId`, `patchOwnerId`, `patchOwnerName`) and say which existing field keeps which meaning. Also `ManageScope.role` is `"Admin" | "Preacher"` only (`components/manage/manage-types.ts:24-33`); AD-3's `role: "Preacher"` for an Admin-supervised Assistant is a display-only lie. Either widen the type or say it is display-only.

**N-9 — AD-2's role-change clear is over-broad for Assistant → Volunteer (Medium-Low).** "A role change away from `Assistant` clears `assigned_preacher_id`" (`:67`) is right for Assistant → Preacher/Admin (the stale-FK guard), but the Volunteer `/contact` route uses `assigned_preacher_id` for routing (`apps/folk/app/api/contact/route.ts:63-68`; `docs/data-models.md:130`). Clearing it on Assistant → Volunteer gives the Volunteer "contact routing is not configured." Clear only for Preacher/Admin, or say the Volunteer form must tolerate a null and route to a chosen Preacher. Also "The binding is meaningful only while the role is `Assistant`" is false for the Volunteer form; say "meaningful for **scope** only while the role is Assistant".

**N-10 — `STAFF_ADMIN_ROLES` overstates the current role-change model (Medium-Low).** AD-4 lists "staff role/status/supervisor changes" under `["Admin"]` (`:98`). A Preacher can already change a Volunteer to an Assistant and bind them to themselves through `/api/volunteers/invite` (`normalizeInviteRole`, `:17-27`; `upsertStaffUser`). The `VOLUNTEER_INVITE_ROLES` set correctly includes Preacher; the `STAFF_ADMIN_ROLES` description does not match. Either drop "staff role/status/supervisor changes" from the Admin bullet or say "staff administration outside the volunteer-invite surface".

**N-11 — Proxy matcher precision (Low).** The prose says `/api/manage/*`; Next's matcher syntax is `/api/manage/:path*`. Name both app copies (`apps/folk/proxy.ts`, `apps/gita-life/proxy.ts`); the root `proxy.ts` is inert. `/admin/:path*` is also outside the matcher today; the feature changes the invite path, so either add it or say it remains a known gap. This is the `public/sw.js` trap in another file.

**N-12 — AD-6's UI-copy rule has no string list (Low).** AD-6 says "User-facing text says 'Supervisor' and shows the role; scope comments and docs say supervisor, not preacher" (`:120`). The strings that need it are not named: `components/dashboard/dashboard-header.tsx:100-104` ("the preacher you assist"), `components/dashboard/dashboard-page.tsx:58` ("assign you to a preacher"), `components/manage/manage-portal.tsx:167-170` ("your own staff account"), `components/dashboard/candidates-route.tsx:198` ("No preacher or location"), route errors in `api/contact/route.ts:53`, `api/sessions/route.ts:181`, `admin/invite-user/route.ts:45`, `volunteers/invite/route.ts:90`, and the form copy in `components/contact-form.tsx:216-219` and `components/invite-user-form.tsx:267`. Add "any string a user reads, including route error messages and field labels, counts as UI copy."

**N-13 — `binds` omits `locations` (Low).** Front matter `:11` has `attendance` but not `locations`; AD-3 and AD-5 both change location scope. Add it.

**N-14 — `apps/*/app/{…campaigns…}` over-generalises (Low).** `apps/gita-life/app` has no `campaigns` directory; autodialer AD-14 says no Campaign route exists under Gita Life. Say `apps/folk/app/campaigns/**` or "the app that has the Campaign module".

**N-15 — `requireCampaignAdmin` vs `OPERATIONAL_ROLES` (Low).** AD-4 says "No surface invents a role list" (`:100`), then leaves `/campaigns/**` on `requireCampaignAdmin`, which hard-codes `["Admin","Preacher","Assistant"]` (`lib/dialer/scope.ts:216-218`). Say whether it delegates to `OPERATIONAL_ROLES` or stays a literal with the same values. Also `VOLUNTEER_INVITE_ROLES` is a misnomer: `/api/volunteers/invite` also creates Assistants (`normalizeInviteRole`).

**N-16 — The note still duplicates the spine (Low; v1 N-10 unaddressed).** The surface table (`:27-37`), the predicate table (`:46-57`) and "What has to change" (`:90-126`) restate the spine. The note's unique value is "Why not programme scope" (`:75-79`), the conflicts table (`:128-140`), the risks (`:142-153`) and the file-level change list. Trim the tables to a reference, or the two artifacts will drift (AD-3's write rule already has).

**N-17 — "Patch" is still undefined (Low; v1 N-11).** The same files use "PATCH" for partial updates (`ManageContactPatch`, `PATCH /api/manage/contacts`). Define "patch" once ("a staff member's personal scope") or rename it "personal scope"/"own-scope owner".

**N-18 — The RLS verification fixture is not named (Low; v1 N-9).** The note's "RLS tests" (`:160`) should name `node scripts/verify-rls.mjs` (and its `.env.migration.local` prerequisite), add an Admin-supervised Assistant and a wrong-role assignee, and reuse the existing `s2` row (Admin-created, Preacher-led) for the attendance divergence. `verify-rls.mjs` is not a `pnpm` script (`package.json:53-68`), so it is not in CI.

**N-19 — The supervisor read needs the service-role client (Low; v1 N-5).** `public.users` RLS lets a non-Admin read only their own row (`20261006010000:152-160`), so resolving the supervisor through the request client returns null for every Assistant. `loadStaffContextForUser` already uses the admin client; AD-1 should say the resolver keeps it.

**N-20 — The docs updates are only in the note (Low; v1 N-7).** The note's conflicts table (`:128-140`) is accurate and valuable, but the spine's `sources` lists `docs/architecture.md`, `docs/data-models.md` and `docs/api-contracts.md` as authoritative. The spine does not bind their updates. Require them in the same change (role matrix, `/manage`, `assigned_preacher_id` contract, invite rule), or stop calling them sources.

---

## 6. Spine vs decision note

| # | Spine | Decision note | Verdict |
|---|---|---|---|
| 1 | AD-3 `:80` — `writes` carries `owner.userId` / `actor` for **all** contact writes | `:56` — "Contact write (**grid**)" | **Spine is broader than the note and the code.** The note's scope is right; copy "grid" into AD-3, or add the `/contact` per-actor row. |
| 2 | AD-3 `:82` — "An Admin's programme scope remains the default" | `:52` — dashboard (Admin) only: programme default, `?mode=preacher` narrows | **Spine generalises a dashboard row to every surface.** `/contacts` is personal for Admin; `/manage` is mode-dependent; `/sessions` is creator-only. |
| 3 | AD-3 `:84` — campaigns `kind:"preacher", userId = owner.userId` for every owner | `:55` — same table row; `:52` — Admin dashboard programme | **Both contradict autodialer AD-3 for Admin.** Add "for a Preacher or Assistant"; Admin = `{kind:"program"}`. |
| 4 | AD-3 `:88` — "A null owner is an empty patch" | `:63` — "an empty patch with an explanation" | **Agree, both false for sessions.** `created_by = actor` remains (note `:150`). Say "no supervisor rows". |
| 5 | AD-5 `:114` — any service-role staff read passes `patchOwner` | `:125` — same | **Agree, both over-broad.** v1 B-7's "replaces a caller-scoped read" qualifier is gone from both. Restore it and name the exceptions. |
| 6 | AD-4 `:100` — null-patch header hides Contacts/Manage; `/campaigns/**` keeps refusal | `:124` — "no dead nav items"; `:116` — "The Campaign item follows the autodialer spine" | **Contradiction.** Autodialer AD-2 shows Campaign for every Assistant; the 403 is a dead item. Decide hide Campaign + amend AD-2, or change the e2e criterion. |
| 7 | AD-2 `:67` — "The binding is meaningful only while the role is `Assistant`" | `:72` — same | **Both contradict the Volunteer contact routing.** The FK is the Volunteer's form routing (`docs/data-models.md:130`, `api/contact/route.ts:63-68`). Say "meaningful for scope". |
| 8 | AD-6 `:120` — UI copy says "Supervisor" and shows the role | `:88` — same | **Agree.** The specific strings are unnamed (N-12). |
| 9 | AD-1 `:58` — client DTO `hasPatchScope`, `supervisorName`, `supervisorRole`; no `locationIds` | `:95` — same | **Agree.** Good. |
| 10 | AD-4 `:97` — `/volunteers` = Admin/Preacher | `:37` — `/volunteers` unchanged | **Agree at the API.** The `/volunteers` page cannot supply the Admin's picker (N-7). |
| 11 | AD-2 `:68` — both invite routes use the same eligibility predicate | `:71` — same | **Agree, but no single helper is named.** Two literal checks can drift; name `resolveEligibleSupervisor` (v1 B-3). |
| 12 | Deferred `:177` — deployment inherited unchanged | `:149-150` — "Check for such rows before deploying" | **The spine is silent on the audit.** B-5; add an Open item. |
| 13 | AD-3 `:88` — Assistant payload `mode:"preacher"`, `role:"Preacher"` | `:115` — same | **Agree, but AD-6 says the UI shows the role.** `role:"Preacher"` for an Admin-supervised Assistant is a display lie; say it is display-only or widen the type (N-8). |
| 14 | AD-4 `:102` — "This supersedes … AD-13" | `:138`, `:153` — same; "should be updated in the same change" | **Agree in content; the spine does not require the sibling edit.** B-6. |

---

## 7. Terse and decisions-only

Mostly yes. The spine is 177 lines; the ADs are rules, and the few explanatory clauses are load-bearing (AD-3's "Passing an Admin supervisor's role as `p_role` would widen an Assistant to the programme" is the reason for a rule that a unit would otherwise get wrong). The note still carries the rationale well, especially "Why not programme scope" (`:75-79`).

Two blemishes:

- **AD-3 is doing two jobs.** The Assistant predicate and the Admin exception are interleaved, and the Campaigns paragraph is a third rule. A per-surface table (surface | Admin | Preacher | Assistant | null patch) would be shorter and harder to misread. This is the cleanest fix for B-1.
- **The note still restates the spine** (N-16). It is 172 lines; the surface and predicate tables repeat the ADs, and "What has to change" repeats them a third time. Keep the *why*, the conflicts table, the risks and the file-level list; link the contract.

The `[ADOPTED]` tag is the wrong kind of terseness: it compresses a decision ("this is unchanged") that is not defined and is false for AD-2/AD-3/AD-4 (N-1). Drop it or define it.

---

## 8. What is right

- **AD-1's shape** — `patchOwner: { userId, role, name, locationIds } | null`, resolved once at `getStaffContext()`, with the raw FK kept — is precise, total and testable. The divergence it identifies is real: `/dashboard` and `/sessions` require an Active **Preacher** assignee while `/campaigns` uses the raw FK, so an Admin-supervised Assistant gets three different answers today.
- **AD-2's lifecycle** — eligible supervisor = Active, same programme, Admin or Preacher; Admin binds any, Preacher self-only; both routes one predicate; role change clears; null on read — is the right level of rule and closes the v1 gap where the feature's headline capability was not buildable from the spine.
- **AD-4's role sets** are the right enforcement: `OPERATIONAL_ROLES`, `CONTACT_FORM_ROLES`, `VOLUNTEER_INVITE_ROLES`, `STAFF_ADMIN_ROLES`, each used by a page and its handlers. `CONTACT_FORM_ROLES` in particular correctly keeps the Volunteer's form.
- **AD-4's `/attendance` decision** — session-scoped or patch-scoped; date-wide Admin-only; the route is bound; the proxy matcher additions are named — is complete and verified against the current unscoped service-role date branch.
- **AD-3's owner/actor split** is exactly the bug `createManageContact` would produce: an Assistant's contact stamped with their own id disappears from the view that created it. The split is right; it just needs scoping to the grid.
- **AD-6's naming** is the correct brownfield ratification: no column rename, keep `assignedPreacherUserId`, make the contract supervisor, label it, defer the rename. The note's rationale (`:83-88`) is sound.
- **The attendance-RLS divergence** is real and correctly named: `sessions` RLS matches `created_by` as well as `preacher_id`; `caller_can_read_attendance_session()` matches `preacher_id` only. The fix direction is right; the enumeration needs the actor term.
- **The Deferred list** is mostly sound: programme-scope assistants, per-assistant flags, `/volunteers` for assistants, and the rename are correctly out of scope and cannot let two units diverge. The two exceptions are the Admin `/sessions` and `collected_by_id` items, which AD-3 contradicts.

---

## 9. Fix list before the next build unit

**P0 — each is a two-unit incompatibility:**

1. **AD-3 — make the predicate per-surface.** Add the Admin column (`/contacts` personal; `/manage` mode admin programme; `/sessions` creator-only; `/dashboard` programme default; `/campaigns` `{kind:"program"}`) and scope the Assistant bullets to the Assistant. Remove AD-4's "Every one scopes through `patchOwner`" overstatement. (B-1)
2. **AD-3 — scope the write/collector bullet to the manage grid**, and add the `/contact` per-actor rule (Admin explicit picker; Volunteer assigned Preacher; Assistant owner; Preacher self; collector keeps the existing rule). Align the `collected_by_id` Deferred. (B-2)
3. **AD-5 — restore the "replaces a caller-scoped read" qualifier** and name the reference-read exceptions (locations naming, staff names, the caller's own row, the dialer roster). Add the two-list locations rule. (B-3)
4. **AD-5 — add `p.program_id = u.program_id`** to `caller_assigned_preacher_id()` and `caller_effective_location_ids()`; bind `sessions_visible`; state the `caller_can_read_attendance_session()` boolean with the actor term. (N-2, N-3, N-4, N-5)
5. **Null-patch matrix** per surface; decide the Campaign nav (hide + amend autodialer AD-2, or keep + change the e2e); replace "the existing empty-scope explanation" with the actual copy. (B-4)
6. **Add the pre-deploy data audit** as an Open/Deferred item with the two checks and the decision. (B-5)
7. **Enforce the AD-13 supersession**: front-matter `supersedes`/amends, edit the autodialer AD-13 and `docs/architecture.md` role matrix in the same change, assert the manage gate equals `OPERATIONAL_ROLES`. (B-6)

**P1 — same change, before the surfaces ship:**

8. **Name the `ManageScope` fields** (`actorUserId`, `patchOwnerId`, `patchOwnerName`) and say which existing field keeps which meaning; widen or document `role: "Preacher"` as display-only. (N-8)
9. **Add `owner.userId` to the campaign assignable caller set** and a test. (N-6)
10. **Restore the stack notes**: label the table "repo pins", carry the Next CVE/upgrade note, mark `@supabase/supabase-js` as `^2.105.1`. (v1 N-3, item 4)
11. **Fix the role-change clear** (Assistant → Preacher/Admin only, or tolerate a null Volunteer), the `/volunteers` Admin picker, and `STAFF_ADMIN_ROLES`. (N-7, N-9, N-10)
12. **Define/drop `[ADOPTED]`; add `locations` to `binds`; use `/api/manage/:path*` and name both app proxy copies; stop implying a Gita Life Campaign route; name `requireCampaignAdmin`'s relationship to `OPERATIONAL_ROLES`.** (N-1, N-11, N-13, N-14, N-15)
13. **Name the UI-copy strings** AD-6 covers, and the RLS verification script/fixtures. (N-12, N-18)
14. **Trim the note's duplicated tables**; define "patch". (N-16, N-17)

---

**Verdict: fail — changes required (narrower than v1).** The spine's core is right and the v2 revision fixes the invite/binding, Volunteer-form, attendance and Preacher-term blockers. The remaining failures are the same class as v1: a universal rule that erases per-surface brownfield behaviour (AD-3's Admin scope and `/contact` writes), an over-broad service-role rule (AD-5), and a null-patch state that is neither decided nor tested (AD-4). Fix those four sentences and the missing audit item, and the spine is buildable.
