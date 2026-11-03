# Rubric review — Staff scope: Admin supervisors and Assistant surfaces

- **Reviewer role:** rubric walker in the architecture-spine review gate. I did not edit the spine.
- **Target:** `ARCHITECTURE-SPINE.md` (AD-1 … AD-5) and `DECISION-admin-assistants.md`, read against the working tree at `66e72a2` (2026-11-03). The sibling `_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md` is the inherited spine.
- **Method:** the eight-item checklist. Every brownfield claim was re-checked against code, not taken from the companion documents. The two-unit test was used only to confirm a checklist failure, not as the primary lens.
- **Verdict:** **fail — changes required.** The bones are right: one resolver, one owner/actor split, three role sets, no rename. The failures are one under-specified predicate (AD-2), one missing write rule (invite/binding), two contradictions with inherited rules (autodialer AD-3/AD-5/AD-13) and one unbound live surface (`/attendance`). Four findings block parallel build; the rest are precision fixes that should land before the first story.

---

## 1. Scorecard

| # | Checklist item | Verdict | Why |
|---|---|---|---|
| 1 | Fixes the real divergence points and misses none | **Fail** | The supervisor-resolution divergence is correctly identified. Missed: the invite/binding write rule (B-3), the Admin programme scope (B-1), the Volunteer contact path (B-2), `/attendance`'s date branch (B-6), legacy-data audit (N-4). |
| 2 | Every AD's Rule is enforceable and prevents its stated divergence | **Fail** | AD-2 has no Admin term and its "null owner is empty" is false for sessions (B-1, B-8); AD-4's policy bullets omit the program term and role branches and its service-role sentence is over-broad (B-7); AD-1 bans the helper the invite path must use (B-3); AD-3 says "defined once" while `/campaigns` keeps a second literal list (N-1). |
| 3 | Nothing under Deferred could let two units diverge | **Pass with notes** | The four deferrals are safe. But the change's one deploy-time action (audit/backfill for the two tightenings) is neither decided nor deferred — it is absent (N-4). |
| 4 | Named technology is verified-current | **Fail (narrow)** | Next 16.0.7 is the repo pin, not current (16.4.4); the sibling spine records the proxy-bypass CVE fixed in 16.2.5, and this spine makes the proxy matcher load-bearing. `@supabase/supabase-js` is a caret range (current 2.118.0), not a pin (N-3). |
| 5 | Ratifies rather than contradicts the brownfield | **Fail** | Admin contact creation (explicit assignee), Volunteer `/contact`, Volunteer location scope, and the `/manage` docs all contradict the code or the docs (B-1, B-2, N-7). |
| 6 | Covers the driving spec's area | **Pass with notes** | No spec drives this; it is a decision slice. It covers identity, scope, surfaces, writes, RLS and naming. It omits the invite write rule and the data audit. |
| 7 | No new AD weakens or contradicts a parent/sibling spine | **Fail** | Autodialer AD-13's `["Admin","Preacher"]` contact-write gate is widened without an amendment (B-4); AD-3/AD-5's Admin `program_scope = true` is contradicted (B-1); AD-3's 403 for a null scope is contradicted by the "empty-scope explanation" and the note's "no dead nav items" (B-5). |
| 8 | Every owned dimension is decided, deferred, or open | **Fail** | Identity, scope, surfaces, RLS and naming are decided; environments are deferred. Invite/binding, data migration and the `/attendance` read are silent. The operational envelope is deferred but the deploy-time audit is missing. |

**Verdict: fail.** The spine is not wrong-headed. It is under-specified at exactly the points two units will read differently: what an Admin's predicate is, what a null owner means per surface, who may set `assigned_preacher_id`, and whether `/campaigns` is still governed by the autodialer spine. Each has a cheap, local fix.

---

## 2. Brownfield facts verified

| Claim | Verdict | Evidence |
|---|---|---|
| `getStaffContext()` returns the raw FK only; it does not resolve a supervisor | True | `lib/authz.ts:28-32,105-140,201-226` |
| `/dashboard` resolves the supervisor only when the assignee is an **Active Preacher**; an Admin-supervised Assistant gets `assistantUnassigned` | True | `lib/dashboard/scope.ts:59-67` |
| `/sessions` resolves the supervisor only when the assignee is an **Active Preacher**; `POST /api/sessions` refuses an Admin assignee | True | `lib/sessions/scope.ts:43-71`; `apps/folk/app/api/sessions/route.ts:178-193` |
| `/campaigns` uses the raw `assignedPreacherUserId` with no eligibility check | True | `lib/dialer/scope.ts:279-291` |
| So the three surfaces already disagree for an Admin-supervised Assistant. AD-1 correctly identifies a real divergence | True | the three files above |
| `createManageContact` stamps `assigned_preacher_id = staff.userId`; an Assistant's write would vanish from their patch | True | `lib/supabase/manage.ts:1198-1213` |
| `/api/contact` routes a Volunteer and an Assistant through `assigned_preacher_id`; an Admin must choose an explicit preacher | True | `apps/folk/app/api/contact/route.ts:59-80,136-149`; `docs/architecture.md:144-152` |
| `/contact` has no role gate; a Volunteer can open it and its copy addresses Volunteers | True | `apps/folk/app/contact/page.tsx:11-30`; `components/header.tsx:269`; `components/contact-form.tsx:216` |
| `/manage` and `/api/manage/contacts/**` are Admin/Preacher only | True | `apps/folk/app/manage/page.tsx:64`; `lib/manage/api-handlers.ts:253,292,328,418,460,513` |
| `/manage?mode=admin` is programme-wide; `/contacts` is personal for every role | True | `lib/supabase/manage.ts:554-566,809-811`; `docs/architecture.md:164` |
| The proxy matcher omits `/manage` and `/api/manage/*` in **both** app copies | True | `apps/folk/proxy.ts:9-23`; `apps/gita-life/proxy.ts:9-23` |
| The RLS helpers already resolve an Admin assignee; only the assignee role check is missing | True | `supabase/migrations/20261006010000_scoped_rls_policies.sql:70-83,88-108`; `.memlog.md:15` |
| `caller_can_read_attendance_session()` checks `preacher_id` only | True | same migration, `:114-131` |
| The sessions RLS policy already carries Preacher/Assistant terms and an assistant-created term | True | `supabase/migrations/20261101000000_sessions_flow.sql:37-54` |
| `sessions_visible()` gives a Preacher their assistants' created sessions | True | same migration, `:66-107` |
| `/attendance` GET with no `session` is a service-role, programme-wide attendance read admitted to Assistant | True | `apps/folk/app/attendance/route.ts:118-146`; `lib/supabase/data.ts:1010-1032` |
| `campaign_progress` and `dashboard_overview` raise on `program_scope = false` with a null scope id | True | `supabase/migrations/20261027010000_campaign_progress.sql:37-39`; `20261102010000_dashboard_rpcs.sql:541-543` |
| `/campaigns` gates with `requireCampaignAdmin`; the header shows Campaign for every Assistant | True | `lib/dialer/scope.ts:216-218`; `components/header.tsx:247-252,285` |
| `verify-rls.mjs` exists but is not a pnpm script; its fixture has no Admin-supervised Assistant and no wrong-role assignee | True | `package.json:53-68`; `scripts/verify-rls.mjs:48,144-160,275-297` |
| Next 16.0.7 is the repo pin; current is 16.4.4; the sibling spine records the proxy-bypass CVE | True | `package.json:115`; npm registry; autodialer spine `:316` |
| `@supabase/supabase-js` is `^2.105.1`; current is 2.118.0 | True | `package.json:102`; npm registry |
| `[ADOPTED]` is defined nowhere else in the repo | True | only occurrences are this spine `:60,74,96` |

---

## 3. Blocking findings

### B-1 — AD-2 deletes the Admin's programme scope (High)

**Where:** AD-2 `ARCHITECTURE-SPINE.md:64-70`; AD-4 `:89-93`; AD-3 `:79`; autodialer AD-3 `:85`, AD-5 `:108`.

**The rule as written:** "for `owner = patchOwner` … dashboard and campaigns: `program_scope = false` with `scope_preacher_id = owner.userId`". AD-1 says an Admin's `patchOwner` is **self** (`:54`). So the literal rule makes an Admin's dashboard and campaigns personal, and the contacts/locations/attendance bullets make `/manage` personal too.

That contradicts, all at once:

- `resolveDashboardScope`: an Admin's default is `programScope: true` (`lib/dashboard/scope.ts:27-41`).
- `campaignScope`: an Admin is `{ kind: "program" }` (`lib/dialer/scope.ts:258-263`).
- `loadManagePortalData`: `mode=admin` applies **no** filter; it is the programme view (`lib/supabase/manage.ts:554-566`).
- Autodialer AD-3: "`campaignScope(staff)` returns `{ kind: "program" }` for Admin" (`:85`).
- Autodialer AD-5: "only an Admin passes `program_scope = true`" (`:108`).
- `campaign_progress` / `dashboard_overview`, whose `p_program_scope = true` branch is the only programme read (`campaign_progress.sql:59`; `dashboard_rpcs.sql:132,147-148`).

**Two lawful units.** Unit A implements AD-2 literally: an Admin opens `/dashboard` and sees only their own rows; `/manage?mode=admin` collapses to the Admin's own contacts; campaigns show only assignments whose contact is assigned to the Admin. Unit B reads autodialer AD-3/AD-5 and keeps `program_scope = true` for an Admin, treating AD-2 as the Assistant delta. Both can quote the spine; the regression is in the Admin's core views.

**Fix.** Say what AD-2 actually is: *the personal-patch predicate*. Then state the Admin exception explicitly:

- For an Assistant, `owner = patchOwner` on every listed surface.
- For an Admin or Preacher, the same predicate is their `mode=preacher` / own-scope view.
- An Admin's `mode=admin` dashboard, `/manage`, and campaigns keep `program_scope = true` / no app filter; `patchOwner` is not the Admin's programme identity.
- In AD-4, name the Admin branch of each policy (it already exists); do not replace the policy with the Assistant predicate alone.

---

### B-2 — AD-1 + AD-2 + AD-3 close the Volunteer contact form and null the Volunteer's writes (High)

**Where:** AD-1 `:56` (`null … for a Volunteer`); AD-2 `:70` (`writes … carry owner.userId`); AD-3 `:79` (`/contact` in `OPERATIONAL_ROLES`); `:72` (`A null owner is an empty patch`).

`/contact` is not an Assistant-only surface. It is the staff contact-capture form, open to every Active staff member (`apps/folk/app/contact/page.tsx:11-30`), and it explicitly serves Volunteers: the copy says "Volunteer contacts are assigned to your Preacher" (`components/contact-form.tsx:216`) and the route resolves the Volunteer's `assigned_preacher_id` and stamps it (`apps/folk/app/api/contact/route.ts:63-68,136-149`). The header sends a Volunteer to `/contact` (`components/header.tsx:269`).

Under the spine:

- AD-3's `OPERATIONAL_ROLES = ["Admin","Preacher","Assistant"]` makes `/contact` and `/api/contact` refuse a Volunteer. The Volunteer's only contact-capture surface is gone.
- Even if the gate stayed open, AD-2's write rule says `assigned_preacher_id` carries `owner.userId`; a Volunteer's owner is `null`, so the row is unassigned and invisible to the Volunteer's preacher. The same rule overrides the **Admin's** explicit `assignedPreacherUserId` picker (`apps/folk/app/api/contact/route.ts:74-79`; `components/contact-form.tsx:147,348-356`; `docs/architecture.md:150`), so an Admin can no longer create a contact owned by a chosen preacher.
- AD-2's "A null owner is an empty patch" is also false for sessions: the sessions predicate includes `created_by = actor` (`:66`), so a null-patch Assistant still sees the sessions they created. `sessionsScope`'s current comment says exactly that ("keeps only the sessions they created", `lib/sessions/scope.ts:9-15`).

**Two lawful units.** Unit A applies the role set and the write rule literally: Volunteers cannot add contacts; Admin-created contacts are owned by the Admin. Unit B notices the existing Volunteer/Admin branches and exempts `/contact` and `/api/contact`; the two units now disagree on the same route and on the same column.

**Fix.**

- Remove `/contact` and `/api/contact` from `OPERATIONAL_ROLES`; give the form its own set (`["Admin","Preacher","Volunteer","Assistant"]`, i.e. every Active staff member) or leave it ungated as today.
- State the write rule per actor: an Assistant stamps `owner.userId`; a Volunteer and a Preacher keep the existing assigned-preacher resolution; an Admin keeps the explicit `assignedPreacherUserId` picker.
- Say "a null owner yields no supervisor rows" and, for sessions, "the actor's own creations remain" — do not call it empty.

---

### B-3 — The invite/binding write rule is missing, and AD-1 forbids the validation the invite path needs (High)

**Where:** AD-1 `:53-58`; AD-5 `:96-100`; the capability map says "Invite and binding … governed by AD-1, AD-5" (`:144`) — neither AD states the rule. The only statement is in the decision note `:91-94` and `.memlog.md:17` (an *assumption*).

This is the only path that produces `assigned_preacher_id`, and AD-1 makes the read side silently drop an ineligible assignment. Today both invite routes require the assignee to be an **Active Preacher** (`apps/folk/app/api/admin/invite-user/route.ts:41-53`; `apps/folk/app/api/volunteers/invite/route.ts:48-59`). Nothing in the spine says they must accept an Admin, so the decision's headline capability — an Admin can have an Assistant — is not buildable from the spine alone.

Worse, AD-1 says "No page, handler or scope resolver may call `findStaffUserById` to resolve a supervisor." The invite routes are handlers and must read the chosen supervisor to validate it. Read literally, AD-1 bans the only helper available, and the form's `preachers` list (fed by `listCachedActivePreachers`) is not even mentioned.

**Two lawful units.** Unit A adds an eligibility check to both invite routes, adds a `listCachedActiveSupervisors` sibling, and renames the form copy. Unit B implements only the read-side AD-1 and leaves the current Preacher-only validation; an Admin cannot invite an Admin-supervised Assistant at all, and the rest of the slice has no data to act on.

**Fix.** Add an AD (or a fourth bullet to AD-1) with the exact write rule:

- An Admin may bind an Assistant to any `Active` staff member in the same program whose role is `Admin` or `Preacher`.
- A Preacher's invite remains self-only.
- The volunteer invite surface may create a Volunteer or an Assistant; the Admin invite surface may create any role.
- The chosen supervisor is validated through **one exported predicate** (`resolveEligibleSupervisor(id)` in `lib/authz.ts`), used by the read resolver and both invite routes. Exempt that predicate from AD-1's `findStaffUserById` ban; the ban is about scope resolution, not write validation.
- Name `lib/supabase/data.ts` and `components/invite-user-form.tsx`; the cache tag must stop saying "active preachers" if the list now contains Admins. A rename is not deferred by AD-5 (that AD only protects the column/field).

---

### B-4 — AD-3 widens a contact-write gate that autodialer AD-13 explicitly fixes at two roles (High)

**Where:** AD-3 `:79`; autodialer AD-13 `:156`.

Autodialer AD-13 is binding and states: "Contact create and update stay in `/manage`, with their handlers under `/api/manage/contacts/**` and the same `requireRole(staff, ["Admin", "Preacher"])` gate". The new AD-3 lists `/api/manage/contacts/**` (create, update, delete, bulk, photo) under `OPERATIONAL_ROLES = ["Admin","Preacher","Assistant"]`.

The spine says "`/campaigns/**` keeps the autodialer spine's AD-2 role set and AD-3 scope helper; this spine neither widens nor narrows them" (`:33`). That is true of Campaign, but it is silent about AD-13, which is the rule it actually changes. A dialer unit reading AD-13 and a manage unit reading AD-3 will implement different gates for the same route.

**Fix.** Record a superseding amendment explicitly: "This spine amends autodialer AD-13's contact-write gate from `["Admin","Preacher"]` to `OPERATIONAL_ROLES`; AD-13's other constraints (no new contacts table, no Volunteer term, no CSV import/export) stand." Update the autodialer spine's AD-13 line in the same change, or the two artifacts will keep disagreeing.

---

### B-5 — A null-patch Assistant has three incompatible campaign outcomes, and the header still shows the item (Medium-High)

**Where:** AD-2 `:72` ("null owner is an empty patch"); AD-3 `:83` ("render the existing empty-scope explanation … `/campaigns/**` keeps … AD-3 helper unchanged"); autodialer AD-2 `:79`, AD-3 `:85`; decision note `:124` ("no dead nav items") and `:117`.

There are three possible behaviours for an Assistant with no eligible supervisor on `/campaigns`:

1. `campaignScope` throws `403` (`lib/dialer/scope.ts:279-291`), which is what autodialer AD-3 requires and what the page does today.
2. "Empty scope" as AD-3 says — but `campaign_progress` and `dashboard_overview` **raise** `scope_preacher_required` when `program_scope = false` and the id is null (`campaign_progress.sql:37-39`; `dashboard_rpcs.sql:541-543`), so "empty" is a 500 unless a new `{kind:"none"}` path is added.
3. The header hides Campaign — but autodialer AD-2 requires the Campaign item for **every** Assistant (`:79`), and `components/header.tsx:249` does exactly that today.

So the note's own e2e criterion ("no dead nav items", `:124`) is unsatisfiable without changing autodialer AD-2. The spine never says which of the three wins.

**Fix.** Pick one and write it: either (a) `campaignScope` gains `{kind:"none"}`, the campaign pages render their empty state, and the header keeps the item; or (b) the 403 stays, the header hides Campaign for a null-patch Assistant, and the autodialer spine's AD-2 sentence is amended. Add the corresponding e2e case from the note.

---

### B-6 — `/attendance`'s date branch is an unbound service-role programme read (Medium-High)

**Where:** AD-2's binds `:62` (`apps/*/app/api/{sessions,contact,manage}/**`), AD-3's surface list `:79`, AD-4 `:94`.

`apps/folk/app/attendance/route.ts:118-146` admits `["Admin","Preacher","Assistant"]`. With `?session=<id>` it checks `sessionsScope` and is fine. **Without** a session id it calls `getAttendanceByDate(date)`, which uses `createSupabaseAdminClient()` and reads every attendance row in the program for that date (`lib/supabase/data.ts:1010-1032`). Any Assistant can request `/attendance?date=YYYY-MM-DD` and read the whole programme's attendance. The route is not named in any AD's binds — not `/api/**`, not the AD-3 surface list.

This is a counterexample to the paradigm's "every operational page, route handler … reads and writes through that owner". It is pre-existing, but the slice's premise is to close Assistant scope; leaving it unbound lets a unit miss it.

**Fix.** Add `/attendance` to AD-3 (or AD-2's binds) and decide: either scope the date branch through `patchOwner` (the RPC/read already has the session predicate to reuse), or refuse the no-session branch for a non-Admin with a named 403. Add it to the e2e "Assistant sees the patch, not the programme" case.

---

### B-7 — AD-4's service-role sentence is over-broad and disagrees with the note (Medium)

**Where:** AD-4 `:94`: "A read through the service-role client passes the same `patchOwner` id; the service role bypasses RLS and is never a second scope definition." Decision note `:107`: "**Any service-role read that replaces a caller-scoped read** passes the same `patchOwner` id."

The spine dropped the qualifier. Read literally, AD-4 forbids the existing sanctioned service-role reads:

- `loadContactsSectionData` reads locations with the service role on purpose (`lib/supabase/manage.ts:788-806`).
- The dialer roster reads use the service role (`lib/dialer/scope.ts:107-159`).
- `getStaffContext` reads `public.users` with the service role (`lib/authz.ts:146-161`).

Two units: one reads the literal sentence and reroutes reference data through `patchOwner` (breaking the "name a location outside your scope" behaviour), another copies the note's qualifier and keeps them. The note is right; the spine should say it.

**Fix.** Replace with: "A service-role read that **replaces** a caller-scoped read passes the same `patchOwner` id; reference-data reads (locations, staff names, the caller's own row) are not scope definitions and keep their existing justification." Name the two sanctioned exceptions.

---

### B-8 — AD-2's sessions predicate drops the Preacher's assistant-created term that AD-4 keeps (Medium)

**Where:** AD-2 `:66`; AD-4 `:92`; decision note `:48` and `:106`; migration `20261101000000_sessions_flow.sql:66-103`.

AD-2's sessions predicate is `preacher_id = owner.userId OR created_by = owner.userId OR created_by = actor`. For a Preacher, `owner = self`, so it omits the existing term `created_by IN (assistants whose assigned_preacher_id = self)`. That term is in both `sessions_visible()` (`:95-103`) and the RLS policy (`:50`), and AD-4 explicitly keeps it ("plus the Preacher's own-patch and **assistant-created** term"). The note's predicate table omits it too, then says "implement the predicate above" (`:106`).

Whether a Preacher loses their assistants' legacy sessions (where `preacher_id` is the assistant, not the Preacher) depends on which AD the unit reads. New writes stamp `preacher_id = owner`, so the term is only load-bearing for legacy rows — exactly the rows the note says to check for.

**Fix.** Either state the full Preacher predicate in AD-2 (`preacher_id = owner OR created_by = owner OR created_by IN (owner's Active assistants)`) or say "AD-2 is the Assistant delta; the Preacher predicate is unchanged from `sessions_visible`". Align the note's table in the same edit.

---

## 4. Non-blocking findings

**N-1 — "Defined once" has two definitions.** AD-3 `:78` says "three role sets, defined once", then `:83` says `/campaigns/**` keeps `requireCampaignAdmin` unchanged. `requireCampaignAdmin` hard-codes the same three roles (`lib/dialer/scope.ts:216-218`). A unit can either make it delegate to `OPERATIONAL_ROLES` (changing the sibling helper) or leave the literal (two lists). Say which. Also `VOLUNTEER_INVITE_ROLES` is a misnomer: `/api/volunteers/invite` also creates Assistants (`normalizeInviteRole`, `apps/folk/app/api/volunteers/invite/route.ts:18-26`).

**N-2 — AD-4's policy bullets read as complete USING clauses.** "The contacts policy is `assigned_preacher_id = caller_assigned_preacher_id()` for an Assistant" (`:91`) omits `program_id = caller_program_id()` and the Admin/Preacher branches. A literal replacement would leak across programs. Say "the Assistant branch of the existing policy, which keeps the program term and the other role branches", and do the same for sessions and attendance.

**N-3 — Stack table is a pin list, not a current list.** Next 16.0.7 is the repo pin; npm current is 16.4.4 on 2026-11-03. The sibling spine records CVE-2026-44575 (proxy/middleware bypass, fixed in 16.2.5) in its Deferred (`:316`); this spine repeats 16.0.7 with no note, while AD-3 makes the proxy matcher load-bearing. Either mark the row "repo pin (upgrade scheduled)" and carry the CVE sentence, or upgrade first. `@supabase/supabase-js` is a caret range in `package.json:102`, not a pin; current is 2.118.0.

**N-4 — The two tightenings have no data-migration decision.** The note says "Check for such rows before deploying" for (a) an Assistant assigned to a non-Preacher/non-Admin and (b) an Assistant who is `preacher_id` but not `created_by` (`:115-116`). The spine's Deferred says "Deployment … inherited unchanged" (`:152`). Neither decides whether those rows are audited, backfilled or accepted. Add an explicit open question or a pre-deploy audit step; two units will otherwise disagree on whether a migration ships.

**N-5 — The supervisor read needs the service-role client.** `public.users` RLS lets a caller read only their own row unless Admin (`20261006010000_scoped_rls_policies.sql:152-160`). An Assistant cannot read the supervisor's row through the authenticated client, so `getStaffContext` must use `createSupabaseAdminClient()` (as `loadStaffContextForUser` already does, `lib/authz.ts:146-161`). AD-1 doesn't say this; a unit that resolves through the request client silently gets `null` for every Assistant.

**N-6 — The payload's `role: "Preacher"` is a display lie AD-5 doesn't address.** AD-2 `:72` requires an Assistant's `ManageScope` to report `role: "Preacher"` so the switch doesn't render (`manage-portal.tsx:137`). AD-5 `:100` says the UI "shows the role". The cleaner fix is to widen `ManageScope.role` to `"Admin" | "Preacher" | "Assistant"` and gate the switch on `role === "Admin" && mode === ...`, not to fake the role. If the fake stays, say it is a display-only compatibility value, not the staff role. Also `ManageScope` has only `staffUserId`; the owner id/name must be added (`components/manage/manage-types.ts:24-33`), and `dashboard-header.tsx:99-104` / `dashboard-page.tsx:58` still say "preacher" in the empty-scope copy.

**N-7 — `docs/*` is bound only for naming.** AD-5 binds `docs/*` for the supervisor wording. The role/surface changes also invalidate `docs/architecture.md:150` ("Admin: request must include `assignedPreacherUserId`"), `:164` ("`/manage` … restricted to Admin and Preacher"), and `docs/data-models.md:234-239` (the policy matrix and the Volunteer location scope). Require those updates in the same change, or the repo's own docs will contradict the new gates.

**N-8 — `[ADOPTED]` is undefined.** It appears on AD-2, AD-3 and AD-5 (`:60,74,96`) and nowhere else in the repo. It reads as "unchanged", but AD-2 and AD-3 change Assistant behaviour. Either define it ("the predicate is the existing own-scope predicate, adopted; the Assistant term is new") or drop the tag.

**N-9 — Verification gap for AD-4.** `scripts/verify-rls.mjs` is the only RLS harness and is not a `pnpm` script (`package.json:53-68`); it reads `.env.migration.local` and a project URL, so it is not in `pnpm test:static`/`test:unit`/CI. Its fixture creates an Assistant assigned to a **Preacher** (`:275`), not an Admin, and no Assistant assigned to a Volunteer/Revoked row. Add an Admin-supervised Assistant and a wrong-role assignee. The existing `s2` row (Admin-created, Preacher-led, `:292`) is exactly the row that diverges for an Admin-supervised Assistant (`/sessions` sees it, `caller_can_read_attendance_session` doesn't) — reuse it instead of inventing a new shape. The note's "RLS tests" (`:123`) should name the script and its prerequisites.

**N-10 — The note duplicates the spine's rules and repeats them again.** The predicate table (`:43-53`) and the surface table (`:27-37`) restate the spine, then "What has to change" (`:78-107`) restates them a third time. The note's unique value is "Why not programme scope" (`:63-67`), "Consequences and risks" (`:109-117`), "Verification" (`:119-125`) and the file-level change list. Trim the duplicated tables to a reference; otherwise the two artifacts will drift (AD-4 already has).

**N-11 — Terminology collision.** "Patch" is already the PATCH-payload noun in the same files (`ManageContactPatch`, `PATCH /api/manage/contacts`, `buildContactWritePayload`). "Patch owner" reads as "owner of a partial update". Define it once ("a staff member's personal scope") or call it "personal scope" / "own-scope owner".

**N-12 — `binds` front-matter omits two changed areas.** `binds: [staff-roles, contacts, manage, sessions, dashboard, campaigns, invites, rls]` (`:11`) has no `attendance` or `locations`, both changed by AD-2/AD-4 and both in the capability map's "RLS parity".

---

## 5. Spine vs decision note

| # | Spine | Decision note | Verdict |
|---|---|---|---|
| 1 | AD-4 `:94` — any service-role read passes `patchOwner` | `:107` — only a service-role read that **replaces** a caller-scoped read | **Spine over-broad; the note is right.** Copy the note's sentence. |
| 2 | AD-2 `:72` — a null owner is an empty patch | `:59` — same | Both false for sessions (`created_by = actor` remains). Say "no supervisor rows". |
| 3 | AD-2 `:69` / note `:51` — `program_scope = false` for the owner | Note `:65` — "an Assistant never exceeds their supervisor's personal scope"; `:112` — "An Admin's Assistant sees only the Admin's patch" | The note's claim is stronger than autodialer AD-3, which gives an Assistant **all programme campaign and survey-question rows** (`:85`). Either narrow the campaign-row visibility or qualify the invariant. |
| 4 | AD-3 `:83` — empty-scope explanation; campaigns unchanged | Note `:124` — "no dead nav items" | Autodialer AD-2 keeps the Campaign item for every Assistant; autodialer AD-3 returns 403. The note's criterion needs an explicit campaign decision (B-5). |
| 5 | AD-2 `:66` / note `:48` — sessions predicate omits assistant-created | AD-4 `:92` — keeps it; note `:106` — "implement the predicate above" | The note is self-inconsistent; AD-4 is the only place the term survives (B-8). |
| 6 | AD-2 `:70` / note `:84` — writes stamp `owner.userId` | Note `:112` — "the Admin's patch" | Both ignore the existing Admin explicit assignee and the Volunteer path (B-2). |
| 7 | Deferred `:152` — deployment inherited unchanged | Note `:115-116` — "check for such rows before deploying" | The spine's deferral hides a deploy-time action. Add it or open it (N-4). |
| 8 | AD-2 `:72` — Assistant payload `role: "Preacher"` | AD-5 `:100` — UI "shows the role" | A display value contradicts the naming rule; document it as display-only or widen the type (N-6). |

---

## 6. Terse and decisions-only

Mostly yes. The spine is 152 lines and its ADs are rules rather than narrative; the paradigm, the role sets and the owner/actor split are the right level of compression. Two blemishes:

- The `[ADOPTED]` tag carries a decision ("this is unchanged") that is not explained and is false for AD-2/AD-3's Assistant terms (N-8).
- The note restates the spine's predicate and surface tables and then restates them again in "What has to change" (N-10). The note should carry the *why* (it does, well) and the file-level change list; the contract lives in the spine.

The rationale is in the note, not the spine — good. The note's "Why not programme scope" is the strongest paragraph in either artifact; it should be the anchor for the B-1 fix.

---

## 7. What is right

- **AD-1's shape** (`patchOwner: { userId, role, name, locationIds } | null`) is precise, total, and testable. The divergence it identifies is real: `/dashboard` and `/sessions` require the assignee to be a Preacher while `/campaigns` uses the raw FK, so an Admin-supervised Assistant gets three different answers today.
- **AD-5's naming decision** correctly ratifies the brownfield: no column rename, keep `assignedPreacherUserId` as the raw FK, make the contract "supervisor", and defer the rename. That is the right call and the note's rationale is sound.
- **AD-3's three role sets** are the right enforcement for the page/handler split. Naming the `/manage` + `/api/manage/*` proxy gap and fixing it in the same change is correct and verified (`apps/folk/proxy.ts:9-23`, `apps/gita-life/proxy.ts:9-23`).
- **The owner/actor split** is exactly the bug the current `createManageContact` would produce: an Assistant's write stamped with their own id disappears from the view that created it (`lib/supabase/manage.ts:1211`). The note's risk paragraph (`:113`) states this well.
- **The attendance-RLS divergence** is real and correctly named: `sessions` RLS matches `created_by` as well as `preacher_id`, `caller_can_read_attendance_session()` matches `preacher_id` only (`20261006010000_scoped_rls_policies.sql:114-131`). The fixture's `s2` row is the concrete case for an Admin-supervised Assistant.
- **The Deferred list** is otherwise sound: programme-scope assistants, per-assistant flags, `/volunteers` for assistants, and the rename are all correctly out of scope and none can let two units diverge.

---

## 8. Fix list before the next build unit

1. **AD-2:** restate as the personal-patch predicate; add the Admin `program_scope = true` / no-app-filter exception; state the per-actor write rules (Assistant = owner; Volunteer/Preacher = existing resolution; Admin = explicit assignee).
2. **AD-3:** remove `/contact` and `/api/contact` from `OPERATIONAL_ROLES` (or give the form its own set); add `/attendance` to the bound surfaces; say whether `requireCampaignAdmin` delegates to `OPERATIONAL_ROLES`; decide the null-patch campaign state (`{kind:"none"}` vs 403 + hide).
3. **New AD (or AD-1 bullet):** the invite/binding rule, one exported eligibility predicate used by the read resolver and both invite routes, and the `listCachedActiveSupervisors` / cache-tag change.
4. **AD-4:** copy the note's "replaces a caller-scoped read" qualifier; name the sanctioned service-role exceptions; phrase each policy bullet as "the Assistant branch of the existing policy, keeping the program term and the other role branches"; keep the Preacher assistant-created term.
5. **AD-2/AD-4:** decide the null-owner state per surface (contacts/locations empty; sessions = own creations; campaigns = `{kind:"none"}` or 403).
6. **Record the autodialer amendments:** AD-13's contact-write gate is widened to `OPERATIONAL_ROLES`; AD-3's 403 vs the empty-scope decision; AD-5's Admin `program_scope = true` is untouched.
7. **Spine/note hygiene:** fix the AD-4 wording mismatch; add the pre-deploy data audit (or open question); refresh the Stack rows with the Next CVE note; define or drop `[ADOPTED]`; add `attendance`/`locations` to `binds`; require the `docs/architecture.md` / `docs/data-models.md` updates in the same change.
8. **Verification:** name `node scripts/verify-rls.mjs` (and its `.env.migration.local` prerequisite) in the note; add an Admin-supervised Assistant and a wrong-role assignee to its fixtures; reuse the existing `s2` row for the attendance divergence; add the `/attendance?date=` denial case.

**Verdict: fail — changes required.** The spine is a strong draft with a correct core, but four sentences would ship a regression if two units followed them literally. B-1 through B-4 are the blockers; B-5 through B-8 and the non-blocking list should land in the same pass.
