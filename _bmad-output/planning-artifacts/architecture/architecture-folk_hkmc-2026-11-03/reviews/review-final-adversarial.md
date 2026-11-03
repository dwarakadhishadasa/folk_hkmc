# Final adversarial check — Staff scope: Admin supervisors and Assistant surfaces

- **Artifact:** [`../ARCHITECTURE-SPINE.md`](../ARCHITECTURE-SPINE.md) (219 lines, `status: draft`), companion [`../DECISION-admin-assistants.md`](../DECISION-admin-assistants.md)
- **Baseline:** `66e72a2`. The working tree has unrelated edits under `components/campaign/` and `e2e/specs/campaign-assign-write.spec.ts`; they are not used here.
- **Method:** read-only. For each of the eight named seams, construct two units one level down that each follow the ADs literally, then check the seam against the code as read. No code, migration, test or spine edit was made; no test suite was run. Every claim is static at `66e72a2`.
- **Verdict:** **fail — two P0 residuals, both narrowed, plus four P2 residuals.** The v2 P0 findings F1, F2 and F5 are closed, as are rubric findings B-1, B-2, B-3, B-5 and B-6. F3 and F4 survive as (a) a missing null-owner guard in the AD-5 sessions policy and attendance helper, and (b) the `/manage` session-filter cell that still permits a narrower predicate than `/sessions`. Both are local text fixes; neither reopens the design.

---

## 1. Delta from v2

| v2 finding | Final status | Where it survives |
| --- | --- | --- |
| **F1** — `/contact` writes a different owner than the grid | **Closed** | AD-3 `:102` scopes the grid write rule out of `/contact`; AD-4 `:112` gives the form rule; the matrix `:127` gives `/contact` per role. The Admin/Preacher collector split is explicitly preserved (Deferred `:215`). |
| **F2** — the SQL argument contract cannot carry the actor | **Closed** | AD-3 `:94` names `p_actor_id`, `p_actor_role`, `p_owner_id`, `p_owner_location_ids`; `sessions_visible` and the attendance helper take it; `dashboard_overview`/`campaign_progress` are declared owner-only. Residual R4 is a consequence of the owner-only dashboard, not a vector gap. |
| **F3** — a null patch is not an empty patch | **Still open (narrowed)** | AD-3 `:100` and the AD-4 matrix `:120-127` decide zero rows/empty states. AD-5 `:147` guards `sessions_visible`, but AD-5 `:146` (sessions policy) and `:148` (attendance helper) omit the guard. See R2. |
| **F4** — `/manage` and `/sessions` use different session predicates | **Still open (narrowed)** | AD-3 `:89` states one predicate, but the AD-4 matrix `:121-122` still says `/manage` = "self"/"owner" while `/sessions` = "self + assistant-created"/"owner + actor", and AD-5 `:149` permits a page to narrow. See R1. |
| **F5** — the binding lifecycle breaks Volunteer routing and the `/volunteers` Admin path | **Closed** | AD-2 `:75-80` is now by destination role: Admin/Preacher clear; Volunteer requires an eligible Preacher (clears an Admin); Assistant requires an eligible Admin/Preacher; explicit null; `/volunteers` is Preacher-only and the Admin uses `/admin/invite`; one `resolveEligibleSupervisor()`. Residual R5 is the Preacher-surface demotion case. |
| **F6 / B-1** — AD-5 never names the Admin branch; AD-3 erases Admin per-surface scope | **Closed** | AD-3 `:96` gives the Admin per-surface exception; AD-4 `:118-127` gives the Admin column; AD-5 `:143` keeps every policy's Admin branch programme-wide. Residual R3 is the `/manage?mode=admin` location picker only. |
| **F7 / B-2** — campaign role set and `/contact` write | **Closed** | AD-4 `:110-112` splits `CAMPAIGN_ADMIN_ROLES` from `CAMPAIGN_CALLER_ROLES`; AD-3 `:102` scopes the grid write rule out of `/contact`. |
| **F8 / B-3** — `ManageScope.staffUserId`; service-role over-broad | **Closed** | AD-3 `:100` names `actorUserId`/`actorName` and `patchOwnerId`/`patchOwnerName`; AD-5 `:150` restores the "replaces a caller-scoped read" qualifier and names the reference reads. Residual R10 is a naming cleanup. |
| **F9 / B-4** — client DTO leak; null patch | **Closed for the DTO; R2 for the SQL null guard** | AD-1 `:66` names `toClientStaff()` and binds every `StaffAuthShell`; no `patchOwner.locationIds` on the client. The null-patch matrix `:120-127` is complete; the SQL guard is not. |
| **F10** — `/attendance?date=` and the Admin `?session=` | **Closed** | AD-4 `:131` decides patch-scoped date reads for non-Admins, programme for an Admin, and forbids the Admin `?session=` read from using `sessions_visible`. |
| **F11** — the attendance helper enumerates two of four terms | **Closed** | AD-5 `:148` states all three role branches including the Preacher-assistant and Assistant-actor terms. R2 is the missing null guard, not the term list. |
| **F12** — locations had no named field | **Closed** | Conventions `:163`: `patchOwnerLocationIds` drives the picker and write check; the `locations` naming set may be wider. Residual R3 is the Admin `mode=admin` case. |
| **F13** — the header's `isPreacher` is the only switch | **Closed** | AD-1 `:66` and AD-4 `:133` give the capability flags, hide Contacts/Manage for a null patch, never show Invite to an Assistant, and keep Campaign's 403. |
| **F14** — helpers omit the same-programme clause; Volunteer location branch | **Closed** | AD-5 `:144` requires Active + same programme + Admin/Preacher; the Volunteer branch is explicitly the form's reference list. |
| **F15** — `supervisorName`/`supervisorRole` null semantics | **Closed** | AD-1 `:66`: both null for an Admin/Preacher or an Assistant without a supervisor. The ineligible-FK phrasing is a minor ambiguity (R11). |
| **F16** — Admin `campaignScope` `kind` | **Closed** | AD-3 `:96` says campaigns `{kind:"program"}` for an Admin; `:98` says `{kind:"preacher"}` for a Preacher/Assistant. |
| **F17** — `mode` has two authors | **Closed** | AD-4 `:129` makes the loader the mode authority with the exact formula; a Preacher's `?mode=admin` is ignored; an Assistant is always `mode:"preacher"`. |
| **F18** — dashboard owner-only; `created_by = actor` | **Still open as a consequence** | AD-3 `:94` decides owner-only and justifies it by the new-write stamp. The justification does not cover a moved Assistant's historical rows. See R4. |
| **F19** — `/api/sessions` re-resolves the supervisor and requires Preacher | **Closed** | AD-4 `:135` removes the re-check, uses `patchOwner` for owner/locations, and refuses a null patch. |
| **B-5** — no pre-deploy data audit | **Closed** | Deferred `:218` adds the Open audit with (a), (b), (c) and the fixture requirement. R4 notes one shape it does not count. |
| **B-6** — AD-13 supersession not enforced | **Closed in substance; assertion gap remains** | Front matter `supersedes: …#AD-13` (`:12-13`); AD-4 `:137` requires the autodialer file and `docs/architecture.md` role matrix to be edited in the same change. The spine still does not carry the test/assertion the decision note asks for. See R6. |

---

## 2. The eight requested seams

### 2.1 `/contact` write owner vs `/api/manage/contacts` write owner (AD-3/AD-4) — **closed**

**Unit A — form and grid are two contracts.** `/contact` uses AD-4 `:112`: Volunteer → Preacher; Assistant → Admin or Preacher; Preacher → self; Admin → explicitly chosen Preacher; the collector keeps its existing per-role rule. `/api/manage/contacts` uses AD-3 `:92`: `assigned_preacher_id = owner.userId`, `collected_by_id = actor`. For an Admin, `/contact` creates a contact owned and collected by the chosen Preacher (`apps/folk/app/api/contact/route.ts:136-149`), while `/manage` creates one owned and collected by the Admin (`lib/supabase/manage.ts:1198-1213`). For an Assistant, `/contact` uses the Assistant's supervisor as owner and the Assistant as collector; the grid does the same. For a Volunteer, `/contact` uses the routing Preacher as owner and the Volunteer as collector; the grid does not admit a Volunteer.

**Unit B — one contract for both.** A unit that applies AD-3 `:92` to `/api/contact` as well is **not** AD-compliant: AD-3 `:102` says the grid write rule does not apply to `/contact` or `/api/contact`, and AD-4 `:112` gives the form rule. There is no second lawful reading.

**The break.** None. The Admin's two writes land in different patches, and that is the decided behaviour: `/contacts` and `/manage?mode=preacher` filter `assigned_preacher_id = staff.userId` (`lib/supabase/manage.ts:809-811`, `:558-563`), so the `/contact`-created contact is not in the Admin's own section; it is in `/manage?mode=admin` (programme) and in the chosen Preacher's section. The Deferred `:215` explicitly preserves the two `collected_by_id` meanings.

**Residual (P3 wording).** AD-4 `:112` says "Assistant → Admin or Preacher", while the matrix `:127` says "Assistant — owner". The existing form has no Assistant picker: `resolveAssignedPreacher` uses `staff.assignedPreacherUserId` for an Assistant (`apps/folk/app/api/contact/route.ts:59-68`). A unit could read "Admin or Preacher" as a picker and let an Assistant assign to a non-supervisor, placing the row outside the Assistant's RLS patch (`assigned_preacher_id = caller_assigned_preacher_id()`). The matrix and the existing form make that non-compliant, but the bullet should say "their eligible supervisor (Admin or Preacher)" to remove the reading.

### 2.2 The SQL actor/owner vector for `sessions_visible`, `/manage`, attendance, dashboard — **closed, with R2/R4 residuals**

**Unit A — explicit vector.** `sessions_visible` takes `p_actor_id`, `p_actor_role`, `p_owner_id`, `p_owner_location_ids`; the Assistant branch is `owner IS NOT NULL AND (preacher_id = owner OR created_by = owner OR created_by = actor)`; the Preacher branch adds `created_by IN (active staff assigned to owner)`; the Admin branch is `created_by = actor` (AD-5 `:147`). `lib/sessions/data.ts` passes the vector; `sessions_overview`, `sessions_overview_stats`, `sessions_report`, `sessions_top_attendees`, `session_visible`, `session_attendees` and `contact_attendance_summary` all delegate to `sessions_visible` (`supabase/migrations/20261101000000_sessions_flow.sql:162-230`, `:468-530`, etc.), so the vector propagates. `/manage` uses the RLS session policy, whose actor is `auth.uid()` and owner is `caller_assigned_preacher_id()`; `/attendance?session=` uses `sessions_visible`; `?date=` passes the patch; the dashboard passes only `p_scope_preacher_id`/`p_program_scope`.

**Unit B — current names, same semantics.** Keeping `p_user_id` (actor), `p_role` (actor role) and `p_assigned_preacher_id` (owner) produces the same rows as Unit A; the rename is a refactor. The only semantic difference is the dashboard: Unit B might add an actor parameter to `dashboard_overview` to include the Assistant's `created_by = actor` rows; AD-3 `:94` says owner-only, so that is non-compliant. No seam.

**Residuals.** R2 is the null guard missing from the policy/helper. R4 is the dashboard's owner-only premise: an Assistant's own created session is stamped `preacher_id = owner` only at write time; a session created before a supervisor move keeps the old `preacher_id`, is visible in `/sessions` via `created_by = actor`, and is invisible to the owner-only `dashboard_overview` (`supabase/migrations/20261102010000_dashboard_rpcs.sql:146-148`).

### 2.3 Null patch per surface (zero rows vs own creations; header Campaign; `/sessions` and `/attendance`) — **still open (R2)**

**Unit A — AD-3/AD-4 literal.** A null owner yields zero rows on every operational surface, including the actor's own creations (AD-3 `:100`). `/sessions` is empty + explanation; `/attendance` empty; `/manage` empty + explanation; `/contacts` empty + explanation; `/dashboard` the existing unassigned notice; `/campaigns` the autodialer 403; `/contact` the routing-not-configured error. The header hides Contacts and Manage, keeps Sessions and Dashboard with explanations, keeps Campaign with its 403, and never shows Invite (AD-4 `:133`). The SQL: `sessions_visible` has `owner IS NOT NULL`; the sessions policy and attendance helper add the same guard.

**Unit B — AD-5 literal.** The sessions policy is exactly `preacher_id = owner OR created_by = owner OR created_by = actor` (AD-5 `:146`), with no guard; the attendance helper is exactly `preacher_id = supervisor OR created_by = supervisor OR created_by = self` (AD-5 `:148`), with no guard. With `owner = null`, the `created_by = self` term is true for the Assistant's own-created sessions; the policy grants them, and the attendance policy grants their attendance. Only `sessions_visible` (AD-5 `:147`) returns zero.

**Both comply.** Unit A follows AD-3 `:100` and the AD-4 matrix `:120-127`; Unit B follows AD-5's exact branch text. AD-5's opening ("the helpers and policies grant the AD-3 patch", `:143`) says Unit B is wrong, but its own branch text is Unit B.

**The break.** A null-patch Assistant's own-created sessions are RLS-readable and their attendance is readable by the attendance policy, while `/sessions` (which uses `sessions_visible`) and `/attendance?session=` (which uses `sessions_visible`) refuse. The matrix says both surfaces are empty. A direct user-scoped attendance read, or a `/manage` filter that follows the AD-3 three-term predicate, shows rows the matrix says must be zero. The pre-deploy audit (Deferred `:218(c)`) counts the rows but does not guard the policy.

**Header Campaign.** Both units follow AD-4 `:133`: the Campaign item remains and 403s. The DECISION's e2e criterion was narrowed to "no dead Contacts/Manage/Invite items" (`DECISION:172`), so the Campaign 403 is a named state, not the old "no dead nav items" contradiction. Closed.

**Fix.** Add `owner IS NOT NULL AND (...)` to the sessions policy and `supervisor IS NOT NULL AND (...)` to the attendance helper; add a null-patch fixture to `scripts/verify-rls.mjs` that asserts zero rows from both. One clause in each.

### 2.4 `/manage` vs `/sessions` session predicate (Preacher assistant term; Assistant legacy terms) — **still open (R1)**

**Unit A — AD-3 literal.** `lib/supabase/manage.ts` filters sessions with `preacher_id === patchOwnerId || created_by === patchOwnerId || created_by === actorUserId`; for a Preacher it adds `created_by IN (active staff assigned to owner)`; attendance is filtered to those session ids (`lib/supabase/manage.ts:558-572`). `/sessions` uses `sessions_visible` with the same boolean. A Preacher's assistant-created session (created by an active Assistant, `preacher_id` = another preacher) and an Assistant's legacy `created_by = actor` session both appear in `/sessions` and `/manage`.

**Unit B — AD-4 matrix + AD-5 literal.** The matrix's `/manage` cell is "self" for a Preacher and "owner" for an Assistant (`:121`), while `/sessions` spells out "self + assistant-created" and "owner + actor" (`:122`). The current `/manage` filter is exactly `preacher_id === staff.userId || created_by === staff.userId` (`lib/supabase/manage.ts:558-563`); replace `staff.userId` with `patchOwnerId` and keep the two terms. AD-5 `:149` says a page may apply a narrower filter than RLS and names the Admin's `/sessions` as the example; `/manage` reads through the same policy, so a narrower filter is allowed. The attendance filter follows the narrowed session ids (`:570-572`).

**Both comply.** Unit A follows AD-3's predicate and its bind on `lib/supabase/manage.ts`. Unit B follows the matrix's `/manage` cell and AD-5's narrowing sentence. The AD-5 "Prevents" clause ("a `/manage` attendance view that disagrees with `/sessions`", `:142`) says Unit B is wrong, but no rule makes it wrong; the matrix is the more specific surface statement.

**The break.** A Preacher sees a session created by their active Assistant with `preacher_id` not the Preacher in `/sessions` but not in `/manage`; the `/manage` attendance count and chart omit it. An Assistant's legacy session with `created_by = actor` and `preacher_id != owner` appears in `/sessions` and not in `/manage`. The DECISION's verification names exactly this test — "a session that `/sessions` shows and `/manage` must count" (`DECISION:171`) — and Unit B fails it while satisfying the matrix. The pre-deploy audit's (b) is the opposite shape (Assistant is `preacher_id`, not `created_by`), so it does not catch the legacy `created_by = actor` rows.

**Fix.** Change the matrix's `/manage` cells to "self + assistant-created" (Preacher) and "owner + actor" (Assistant), or add: "`/manage` applies the AD-3 session predicate; the only page-narrowing examples are the Admin's `/sessions` and `/contacts`." Either change one sentence; keeping both texts is the residual.

### 2.5 Binding lifecycle (Assistant → Volunteer; explicit null; `/volunteers` role set) — **closed (R5 is an actor gap)**

**Unit A — AD-2 literal.** By destination role (`:75-78`): Admin/Preacher clear `assigned_preacher_id`; Assistant requires an eligible Admin/Preacher; Volunteer requires an eligible Preacher, and if the current supervisor is an Admin, clears it and requires a Preacher. `upsertStaffUser()` has an explicit null path; omitting the field is not a clear (`:79`). Both invite paths use `resolveEligibleSupervisor()`. `/volunteers` and `/api/volunteers/invite` are Preacher-only and self-only; the Admin uses `/admin/invite`; the Admin path may move an existing Assistant, the Preacher path may not (`:80`).

**Unit B — destination-role lifecycle with the old blanket clear.** A unit that clears for every non-Assistant destination is non-compliant: the Volunteer branch explicitly requires an eligible Preacher and only clears an Admin. A unit that clears nothing for a Volunteer is non-compliant with the required Preacher. The old v2 "away from Assistant clears" sentence is gone; both remaining readings agree. No seam.

**What the code needs.** `upsertStaffUser` currently writes the FK only when truthy (`lib/supabase/data.ts:418-425`), so the explicit `null` path is a real change; the `/api/admin/invite-user` route currently passes `undefined` for non-Volunteer/Assistant (`apps/folk/app/api/admin/invite-user/route.ts:63-69`) and validates only an active **Preacher** for both Volunteer and Assistant (`:39-56`); the `/api/volunteers/invite` route currently admits Admin (`:33`) and refuses an Assistant → Volunteer downgrade (`apps/folk/app/api/volunteers/invite/route.ts:60-70`). The spine's lifecycle resolves the first two; R5 is the third.

**Residual R5 (P2).** The spine does not say whether a **Preacher** may demote their own Assistant to Volunteer from `/volunteers`. The destination-role rule allows it (the supervisor stays self, an eligible Preacher, so the FK is kept); the current route refuses with "Existing Assistants cannot be downgraded to Volunteer" (`:60-70`). The AD-2 sentence "The administrator's invite path may move an existing Assistant; the Preacher's surface may not" (`:80`) is about moving the binding, not changing the role, so it does not decide the case. A unit could keep the refusal or remove it. Decide: "Only the Admin path may change an existing Assistant's role; the Preacher's surface may bind new Volunteers/Assistants to itself, and may not change an existing Assistant." Or allow the demotion and delete the route's refusal.

**`/volunteers` role set.** `VOLUNTEER_INVITE_ROLES = ["Preacher"]` (`:113`) is consistent with the header: an Admin's Invite points to `/admin/invite` (`components/header.tsx:282`), and the `/volunteers` page's form has no supervisor picker because the Preacher's path is self-only (`components/invite-user-form.tsx:263-277`). The name is a misnomer because the route also creates Assistants, but that is not a seam.

### 2.6 Admin per-surface scope (`/contacts`, `/manage?mode=admin`, `/sessions` creator-only, campaigns `{kind:"program"}`) — **closed (R3 is the location picker)**

**Unit A — AD-3 exception + AD-4 matrix.** `/contacts` self (`:120`); `/manage` programme in `mode=admin`, self in `mode=preacher` (`:121`); `/sessions` self, creator-only (`:122`); `/dashboard` programme by default, self with `?mode=preacher` (`:123`); `/attendance` programme (`:126`); campaigns `{kind:"program"}` with a creator-only list (`:124`, AD-3 `:96`). The code matches: `/contacts` filters `assigned_preacher_id = staff.userId` (`lib/supabase/manage.ts:809-811`); `/manage?mode=admin` applies no filter (`:554-566`); `/sessions` uses the creator-only `sessions_visible` Admin branch (`supabase/migrations/20261102030000_admin_creator_only_sessions.sql:29-38`); `campaignScope` returns `{kind:"program"}` for an Admin (`lib/dialer/scope.ts:258-263`); `listCampaigns` filters `created_by = staff.userId` for an Admin (`lib/dialer/campaigns.ts:199-227`).

**Unit B — the "personal" reading.** "Personal" for `/sessions` could mean `preacher_id = admin OR created_by = admin`, which would widen the Admin's `/sessions`; the matrix, AD-5 `:149` and the Deferred `:216` pin creator-only. The exception says `/contacts` and `/sessions` are personal, but the matrix is specific. No seam.

**Residual R3 (P2).** AD-3 `:91` says "locations: `owner.locationIds` for the picker and every write check". For an Admin in `/manage?mode=admin`, the picker is currently the programme set: `loadManagePortalData` sets `scopedLocationRows = locationRows` in admin mode (`lib/supabase/manage.ts:554-566`) and the grid uses `payload.locationOptions ?? payload.locations` (`components/manage/manage-contacts-table.tsx:1603`); the write check `assertProgramLocations` uses the RLS-scoped read, whose Admin branch is programme-wide (`lib/supabase/manage.ts:964-993`; `supabase/migrations/20261006010000_scoped_rls_policies.sql:208-217`). A unit applying AD-3's locations bullet to the Admin narrows both to the Admin's own `location_ids`; a unit applying the exception (`:96`, `/manage` in `mode=admin` is programme) keeps the programme. Both are literal. Fix: add "except an Admin's `/manage?mode=admin`, whose picker and write check are the programme" to AD-3's locations bullet, or say the locations bullet is a patch-surface rule.

### 2.7 RLS grants vs page narrowing; service-role reference-read exceptions — **closed (R2 is the null guard)**

**Unit A — AD-5 literal.** The helpers and policies grant the AD-3 patch; the Admin branch of every policy is `caller_role() = 'Admin'` and programme-wide; a page may narrow (Admin `/sessions` creator-only, Admin `/contacts` self, Admin `/manage?mode=preacher` self) but never widen; RLS is not narrowed to the page filter because `/manage` reads through it. A service-role read that **replaces** a caller-scoped read passes the vector; reference reads — programme location naming set, staff display names, the caller's own `public.users` row, the dialer roster — are exceptions (AD-5 `:150`). The code's `loadContactsSectionData` reads all programme locations with the service role and says why (`lib/supabase/manage.ts:758-806`); `loadStaffDisplayNames` is reference; `getStaffContext` reads the caller's row with the admin client; AD-1 `:64` separately authorizes the supervisor-row read.

**Unit B — the exact branch text without the guard.** Unit B is R2. The narrowing sentence is Unit B for R1.

**The reference reads.** No residual. The only new service-role read is the supervisor row in `getStaffContext`, and AD-1 `:64` names it. The `loadRollupCounts` read is derived from the already-scoped contact ids, not a scope definition. The `dashboard_overview` `programme_attendance` CTE is recorded as a KPI input (AD-5 `:150`).

### 2.8 Autodialer AD-13 supersession — **closed in substance (R6 is the missing assertion)**

**Unit A — new spine.** Front matter `supersedes: '_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md#AD-13'` (`:12-13`); AD-4 `:137` says the autodialer file and `docs/architecture.md` role matrix must be updated in the same change; `/api/manage/contacts/**` uses `OPERATIONAL_ROLES` `:109`. The autodialer AD-13's two-role sentence (`_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md:156`) is superseded.

**Unit B — read the final sibling.** The autodialer file is `status: final` and still says `requireRole(staff, ["Admin", "Preacher"])` for `/api/manage/contacts/**`. A unit that reads only that file implements two roles and the Assistant gets a `/manage` page whose write API refuses — the exact "page admits Assistant while its handler refuses" failure AD-4 `:107` names. The new spine's front matter and "must" sentence are the answer, but the sibling is unedited at review time.

**Residual R6 (P2).** The decision note asks for "a test or matrix assertion that the manage write gate equals `OPERATIONAL_ROLES`" (`DECISION:150`); the spine's AD-4 does not carry it. Add the assertion to AD-4's rule (or to the e2e matrix) so a unit cannot satisfy the final sibling and fail the new one. The prose "must be updated in the same change" is necessary but not a gate.

---

## 3. Residual findings

| ID | Severity | AD touched | Residual |
| --- | --- | --- | --- |
| **R1** | **P0 (narrowed)** | AD-3 `:89` vs AD-4 `:121-122` vs AD-5 `:142,149` | `/manage`'s matrix cell still permits a two-term session filter; `/sessions` uses the three-term predicate. Preacher assistant-created and Assistant legacy `created_by = actor` rows diverge. |
| **R2** | **P0 (narrowed)** | AD-3 `:100`; AD-4 `:120-127`; AD-5 `:146-148` | The sessions policy and attendance helper omit the `owner IS NOT NULL` guard that `sessions_visible` has. A null-patch Assistant's own-created sessions/attendance are RLS-readable while `/sessions` and `/attendance` say empty. |
| **R3** | P2 | AD-3 `:91` vs `:96`; AD-4 `:121` | An Admin's `/manage?mode=admin` picker/write check is programme; AD-3's locations bullet says `owner.locationIds`. |
| **R4** | P2 | AD-3 `:94`; AD-5 `:150` | The owner-only dashboard's justification ("own created sessions are stamped `preacher_id = owner`") fails for a moved Assistant's historical rows; `/sessions` shows them, the dashboard does not. |
| **R5** | P2 | AD-2 `:75-80` | The Preacher's `/volunteers` surface may not be used to demote an existing Assistant to Volunteer; the destination-role lifecycle implies it may. The current route refuses. |
| **R6** | P2 | AD-4 `:137`; autodialer AD-13 | The supersession is declared and required, but the spine carries no assertion that the manage write gate equals `OPERATIONAL_ROLES`; the final sibling still says two roles. |

### R3 — the Admin's `mode=admin` location picker (P2)

**Unit A — AD-3 locations literal.** `patchOwnerLocationIds` (the Admin's own `location_ids`) drives the `/manage` picker and every write check. In `mode=admin`, the Admin's picker offers only their own locations; a programme contact at another location is readable but cannot be created or moved there. This follows `:91` ("every write check") and the Conventions `:163`.

**Unit B — AD-3 admin exception literal.** `/manage` in `mode=admin` stays the programme (`:96`; matrix `:121`), so the picker and the write check are the programme set. This follows the current `loadManagePortalData` (`:554-566`) and `assertProgramLocations`' RLS Admin branch (`:964-993`; policy `:208-217`).

**Break.** The same Admin sees a programme contact at location L in `/manage?mode=admin` but a unit-A create/update at L is refused with "outside your scope"; a unit-B create/update succeeds. The `/contacts` section is unaffected (it is personal for an Admin and its picker is `locationOptions`, filtered by `staff.locationIds`, `:846`). Fix: say "the locations bullet applies to a patch surface; an Admin's `/manage?mode=admin` uses the programme picker and write check."

### R4 — the owner-only dashboard after a supervisor move (P2)

**Unit A — owner-only literal.** `dashboard_overview` gets `p_scope_preacher_id = owner`, `p_program_scope = false`; its sessions predicate is `preacher_id = owner OR created_by = owner` (`supabase/migrations/20261102010000_dashboard_rpcs.sql:146-148`). An Assistant's new sessions are stamped `preacher_id = owner`, so they are included.

**Unit B — `/sessions` parity literal.** The Assistant's patch includes `created_by = actor` (AD-3 `:89`; AD-5 `:147`). A session the Assistant created before a supervisor move keeps the old `preacher_id`; `/sessions` shows it, the owner-only dashboard does not. Adding `created_by = actor` to the RPC requires a new parameter, which AD-3 `:94` forbids ("owner-only by decision").

**Break.** The dashboard's session and attendance KPIs exclude the Assistant's historical rows that `/sessions` counts. The pre-deploy audit (Deferred `:218`) counts (b) "Assistant is `preacher_id` but not `created_by`" and (c) null-supervisor creators, but not "`created_by = actor`, `preacher_id != current owner`" — the moved-Assistant shape. Fix: either accept and record "the dashboard is the current supervisor's patch, not the Assistant's full session list", or add the actor id to `dashboard_overview` and drop the owner-only decision. The current sentence says the rows "are included", which is only true until a move.

### R5 — Assistant → Volunteer from the Preacher's surface (P2)

**Unit A — destination-role literal.** A Preacher invites the existing Assistant as a Volunteer; the destination requires an eligible Preacher, the current supervisor is the Preacher (not an Admin), so the binding is kept and the role changes. The `/volunteers` form offers Assistant and Volunteer (`components/invite-user-form.tsx:249-260`); the route's self-only assignment (`apps/folk/app/api/volunteers/invite/route.ts:45-48`) satisfies the rule.

**Unit B — current-route literal.** The route refuses an active Assistant → Volunteer change (`:60-70`), and AD-2 `:80` says the Preacher's surface may not move an existing Assistant. "Move" is about the binding, but the route's refusal is broader; a unit preserving the route is consistent with the sentence read broadly.

**Break.** The same Preacher either can or cannot demote their own Assistant, depending on which sentence is read. The Admin path can do it through `/admin/invite`, so the capability exists; the Preacher's surface is the question. Fix: add "the Preacher's surface may bind new Volunteers/Assistants to itself and may not change an existing Assistant's role or supervisor" (Admin-only demotion), or delete the route's downgrade refusal and say a Preacher may change their own Assistant's destination role.

### R6 — AD-13 enforcement (P2)

The front matter and AD-4 `:137` close the *declaration*. The *enforcement* is prose: the autodialer file is `status: final` and still says `["Admin", "Preacher"]` at `:156`; the new spine is `status: draft`. The decision note's requested assertion (`DECISION:150`) is not in the spine. A unit can read the final sibling and implement two roles; the Assistant's `/manage` page then has a write API that refuses. Fix: add "`OPERATIONAL_ROLES` is asserted against the `/api/manage/contacts/**` gate in the e2e matrix" to AD-4 `:137`, and edit the sibling in the same change.

---

## 4. Minor textual residuals (not build-blocking)

These are not two-unit incompatibilities; they are places where a reader can still take a wrong-but-plausible path. They should be fixed with the P2s, not before a unit.

- **R7 — `/contact` Assistant rule.** AD-4 `:112` says "Assistant → Admin or Preacher"; the matrix `:127` says "owner". The existing route uses the Assistant's own `assignedPreacherUserId` (`apps/folk/app/api/contact/route.ts:59-68`). Say "their eligible supervisor (Admin or Preacher)".
- **R8 — Campaign list for a Preacher/Assistant.** AD-3 `:98` states only "the campaign list stays creator-only for an Admin". The matrix `:124` says the Assistant's `/campaigns` scope is "owner". The autodialer AD-3 (`_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md:85`) says campaign rows are programme-level for a Preacher/Assistant and only an Admin's list is creator-only. A unit reading the new matrix alone could narrow the Assistant's list to the owner. Restate the list rule.
- **R9 — Docs updates.** AD-4 `:137` binds `docs/architecture.md`; the decision note's conflicts table also names `docs/api-contracts.md:295` ("Volunteer and Assistant invites require an active Preacher") and `docs/data-models.md` (`assigned_preacher_id` as routing through a Preacher). The spine's AD-2/AD-6 do not bind those two files. Add them to AD-4's "must be updated in the same change" sentence.
- **R10 — `ManageScope.staffUserId`.** AD-3 `:100` names the new fields but does not say the old field is retired. The grid currently uses `scope.staffUserId` for both the draft's `assignedPreacherId` and `collectedById` (`components/manage/manage-contacts-table.tsx:254,277-278,1407`) and for the name map (`:647-653`). The new fields are enough to build correctly, but delete or rename `staffUserId` so the old meaning cannot survive.
- **R11 — `supervisorName`/`supervisorRole` for an ineligible FK.** AD-1 `:66` says both null for "an Assistant without a supervisor". An Assistant with an ineligible FK has a row but no eligible supervisor; the DTO should be null. Say "no eligible supervisor" so a unit does not show the ineligible assignee's name with `hasPatchScope = false`.

---

## 5. What is right

Give credit where it is due; the revision is materially better than v2.

- **AD-3 is now a real predicate.** The actor/owner split, the location rule, the Admin exception, the null-owner rule and the `/contact` exception are all present. The `p_actor_id`/`p_actor_role`/`p_owner_id`/`p_owner_location_ids` vector is the right shape and closes F2.
- **AD-4's matrix is the right instrument.** The per-surface columns (Admin / Preacher / Assistant / null) make B-1 mostly mechanical. The remaining R1 is a single cell pair, not a design hole.
- **AD-2's lifecycle is complete.** Destination-role binding, one eligibility helper, explicit null, `/volunteers` self-only, Admin `/admin/invite` and the "may not move" rule close F5. R5 is one actor case.
- **AD-5 restores the qualifier.** "A service-role read that **replaces** a caller-scoped read" plus the named reference reads is the correct rule and closes B-3. The Admin branch is now named and protected.
- **AD-6 is a clean ratification.** No column rename, the supervisor contract, the UI label and the deferral. The `docs` and `api-contracts` updates are the only remaining documentation binds (R9).
- **The null-patch matrix is decided.** `/sessions` empty, `/attendance` empty, `/manage`/`/contacts` empty + explanation, `/dashboard` notice, `/campaigns` 403, `/contact` routing error; Campaign is kept with a 403 and the e2e criterion is narrowed to Contacts/Manage/Invite. That is coherent. R2 is the SQL branch that did not copy the guard.

---

## 6. Verdict

**Fail — two P0 residuals, both local, plus four P2 residuals.** The v2 P0 list is **3 of 5 closed**: F1, F2 and F5. F3 and F4 survive in narrowed form:

1. **R1 (P0):** `/manage` still has a two-term matrix cell while `/sessions` has the three-term predicate; a Preacher's assistant-created session and an Assistant's `created_by = actor` legacy session can appear in one surface and not the other. One matrix cell pair or one AD-5 sentence fixes it.
2. **R2 (P0):** the sessions policy and attendance helper omit `owner IS NOT NULL`; a null-patch Assistant's own-created sessions and attendance are RLS-readable while AD-3/AD-4 say zero. One clause in each function fixes it.

The P2s (R3 Admin `mode=admin` locations, R4 moved-Assistant dashboard, R5 Preacher-surface demotion, R6 AD-13 assertion) are same-change fixes, not design blockers. The minor list (R7–R11) is wording/docs.

No new P0 was introduced by the revision. The design is buildable once R1 and R2 are fixed; the rest can land with the implementation.

---

## 7. Verification

- Read-only review at `66e72a2`. No code, migration, test or spine edit; no test suite run. The working tree's `components/campaign/` edits are unrelated.
- The unit pairs are constructs, not proposed implementations. Each half follows a literal reading of the ADs; the seam is the evidence, not a preference.
- Code references were read in place: `lib/supabase/manage.ts`, `lib/contacts/section-server.ts`, `lib/manage/api-handlers.ts`, `lib/sessions/{scope,data}.ts`, `lib/dashboard/{scope,overview}.ts`, `lib/dialer/{scope,campaigns,callers}.ts`, `lib/authz.ts`, `lib/supabase/data.ts`, `apps/folk/app/api/{contact,sessions,admin/invite-user,volunteers/invite,attendance}/**`, `components/{header.tsx,invite-user-form.tsx,staff-auth-shell.tsx,manage/*}`, `supabase/migrations/20261006010000_scoped_rls_policies.sql`, `20261101000000_sessions_flow.sql`, `20261102030000_admin_creator_only_sessions.sql`, `20261102010000_dashboard_rpcs.sql`, and the autodialer spine at `_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md:152-156`.
