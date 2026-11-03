# Final rubric/consistency review — Staff scope: Admin supervisors and Assistant surfaces

- **Reviewer role:** final targeted rubric/consistency pass in the architecture-spine review gate. I did not edit the spine or the decision note.
- **Target:** `ARCHITECTURE-SPINE.md` (AD-1 … AD-6), `DECISION-admin-assistants.md`, read against the working tree at `66e72a2` (2026-11-03). The prior review is `reviews/review-rubric-v2.md` (B-1…B-6, N-1…N-20). The working tree has unrelated uncommitted campaign changes; I did not touch them.
- **Scope of this pass:** only the six checks requested — spine/note contradictions, Deferred safety, B-1…B-6 closure and material N findings, terseness, dimension coverage, and stale codebase claims. This is not a re-litigation of v1/v2; it asks whether the revision is now buildable in parallel.
- **Method:** static review. Every brownfield claim below was re-checked against code; the two-unit test was applied to each finding. No code was changed and no test was run.
- **Verdict:** **fail — changes required, narrow.** The v2 blockers are substantially closed: AD-4's per-surface matrix, the grid/`/contact` split, the service-role qualifier, the null-patch matrix, the Open audit and the AD-13 supersession are all present. Three High residuals remain: (1) the **null-owner gate is missing from the sessions RLS policy and the attendance helper**, so a null-patch Assistant can still read their own-created rows through RLS while `/sessions` and the matrix say zero; (2) AD-3 says the **`/contact` form keeps its "existing" per-role assignment**, which contradicts AD-4 and the note for an Admin-supervised Assistant; (3) AD-3 says **the RLS attendance helper takes the app scope vector**, which AD-5's helper cannot do. Each is a one-sentence/one-boolean fix, but each currently lets two lawful units diverge or contradicts an inherited `final` artifact.

---

## 1. Scorecard

| # | Checklist item | Verdict | Why |
|---|---|---|---|
| 1 | Fixes the real divergence points and misses none | **Pass with residuals** | B-1, B-2, B-3, B-5 and B-6 are closed at the decision level. Residuals: the null-owner RLS gate (F-1), the `/contact` "existing" wording (F-2), the attendance-helper vector (F-3), create-vs-update stamping (F-4), the autodialer AD-3 assignable set (F-5). |
| 2 | Every AD's Rule is enforceable and prevents its stated divergence | **Fail (narrow)** | AD-3's "keeps its existing per-role assignment" contradicts AD-4's "Assistant → Admin or Preacher"; AD-5's sessions policy grants `created_by = actor` with no `owner IS NOT NULL` gate, contradicting AD-3's null-owner rule; AD-3's "attendance helper take the full vector" contradicts AD-5's RLS helper. |
| 3 | Nothing under Deferred could let two units diverge | **Pass, one Open item** | Rename, programme-scope assistants, per-assistant flags, `collected_by_id`, Admin `/sessions`, `/volunteers` Admin picker and deployment are genuinely out of this slice and cannot diverge. The pre-deploy audit is correctly Open, but its count list misses the `/manage` owner-filter change (F-8). |
| 4 | Named technology is verified-current | **Pass** | Repo pins are labelled as pins; Next 16.0.7, React 19.2.0, TS 5.x, `@supabase/supabase-js ^2.105.1`, Postgres 17 and pnpm 10.33.0 all match `package.json`/`supabase/config.toml`. The CVE-2026-44575 note is carried. |
| 5 | Ratifies rather than contradicts the brownfield | **Pass with residuals** | AD-6 is a clean ratification. AD-4's matrix now matches the Admin's programme/personal split. Remaining mismatches: AD-2's "`/volunteers` … stay self-only" (the page and API admit Admin today); AD-3's `/contact` "existing" wording; the note's `docs/api-contracts.md` replacement would allow Admin-assigned Volunteers. |
| 6 | Covers the decision's capabilities | **Pass** | Every surface in the note's "What an Assistant can open" table has an AD-4 row, including `/attendance`, `/contact`, `/manage` and `/api/manage/contacts/**`. The campaign caller path is explicitly assignment-scoped. |
| 7 | No new AD weakens or contradicts a parent/sibling spine | **Fail (narrow)** | AD-3's assignable-caller set adds `owner.userId`, which autodialer AD-3 does not have; only AD-13 is declared superseded. The note says campaign "behavior [is] unchanged" while its own predicate table adds the owner. Everything else (Campaign admin/caller split, role set, AD-2) is preserved. |
| 8 | Every owned dimension is decided, deferred, or open | **Pass with gaps** | The core dimensions are decided. Gaps: the client DTO's retained fields (`role`, `name`, `email`, `hasActiveCallerProfile`), the `/admin/:path*` matcher, the `locationOptions` payload field, and the `/manage`/`/contact` UI copy. The pre-deploy audit is present and correctly Open. |

**Verdict: fail — changes required (narrow).** The architecture is materially better than v2: five of the six named v2 findings are closed outright, and B-4 is closed at the decision/matrix level but not in the RLS layer. The remaining High items are concentrated in three sentences/booleans; the Medium items are the create-vs-update write rule, the inherited autodialer AD-3 amendment, the client DTO field list and the audit's missing shape.

---

## 2. Check 1 — spine vs decision note

The two artifacts now agree on the headline model, the surface matrix, the null-patch matrix, the binding lifecycle, the RLS helper conditions and the naming. The following rows still diverge or are ambiguous.

| # | Spine | Decision note | Verdict |
|---|---|---|---|
| 1 | AD-3 `:102` — "The form keeps its **existing** per-role assignment and collector rule (AD-4)" | `:72` — "Assistant → Admin or Preacher"; `:109` — "an Assistant may resolve an Admin supervisor" | **Contradiction.** The existing code's `activePreacherResult()` rejects an Admin (`apps/folk/app/api/contact/route.ts:51-57`, same in gita-life). AD-4 `:112` is the new rule; AD-3's "existing" reads as "do not change the Assistant path", which breaks the headline case. Two units: one keeps the Preacher-only check and gets "Assigned Preacher must be an active Preacher user"; one follows AD-4 and allows the Admin. **High (F-2).** |
| 2 | AD-2 `:80` — "`/volunteers` and `/api/volunteers/invite` are the Preacher's surface and **stay** self-only" | `:38` — "Before: Admin, Preacher; After: **Preacher only**"; `:120` — "**restrict** to the Preacher's self-only surface" | **Contradiction / stale claim.** Today the page requires `["Admin","Preacher"]` (`apps/folk/app/volunteers/page.tsx:12`) and the API requires `["Admin","Preacher"]` (`apps/folk/app/api/volunteers/invite/route.ts:32`). It does not "stay" self-only; it becomes so. Two units: one leaves the Admin path (the note's "Before" row), one removes it. **Medium (F-9).** |
| 3 | AD-3 `:98` — assignable caller set = "active staff assigned to the owner, **plus the actor and the owner**" | `:69` — same; but `:163` — "The Campaign admin/caller split, role set and **behavior are unchanged**; only the manage contacts gate and the campaign scope helper's owner id change" | **Contradiction.** Autodialer AD-3 `:85` says Assistant = staff assigned to `assignedPreacherUserId`, **plus themselves** (the actor). Adding the owner is a behaviour change. The note's own table says it; the note's consequence paragraph denies it. Two units: one omits the supervisor from the assignable roster, one includes them. **Medium-High (F-5).** |
| 4 | AD-3 `:94` — "`sessions_visible` and the **attendance helper take the full vector**" | `:74` — only "A scope function receives …"; no mention of the attendance helper. `:131` — "`caller_can_read_attendance_session()`, `sessions_visible` — the exact booleans in AD-5" | **Contradiction.** `caller_can_read_attendance_session()` is an RLS helper called by the attendance policy with one argument (`supabase/migrations/20261006010000_scoped_rls_policies.sql:114-131, 205-214`); it resolves the caller from `auth.uid()`. It cannot take `p_actor_id`/`p_owner_id` from the app. AD-5 `:148` describes it as a role-specific boolean from `self`/`supervisor`. Two units: one changes the RLS function signature and policy call, one keeps it internal. **High/Medium (F-3).** |
| 5 | AD-3 `:100` — "A null owner yields zero rows on every operational surface, including the actor's own creations"; AD-4 matrix `:118-127` repeats empty/403/error states | `:80` — "otherwise → `null`, which yields zero rows on every operational surface"; `:157` — "a null patch yields zero rows everywhere" | **Spine-vs-spine / note-vs-AD-5 contradiction.** AD-5's sessions policy `:146` is `preacher_id = owner OR created_by = owner OR created_by = actor` with no `owner IS NOT NULL` gate; the attendance helper `:148` is `preacher_id = supervisor OR created_by = supervisor OR created_by = self` with no gate. For a null supervisor, `created_by = actor` is true, so the RLS policy/helper still returns the actor's own-created rows. `sessions_visible` `:147` *does* gate, so `/sessions` is empty while the RLS path is not. **High (F-1).** |
| 6 | AD-3 `:92` — "**grid writes:** `assigned_preacher_id` (contact) and `preacher_id` (session) carry `owner.userId`; `collected_by_id` and `created_by` carry `actor`" | `:70` — "Contact write (**grid**) | `assigned_preacher_id = owner.userId`; `collected_by_id = actor`" | **Ambiguous, not yet contradictory.** The code stamps on **create** only: `createManageContact` sets both (`lib/supabase/manage.ts:1205-1213`); `updateManageContact` sends only the edited fields (`:1146-1163`) and `buildContactWritePayload` has no assignee/collector keys (`:1014-1082`). "Grid writes" can be read as update too; an Admin editing a programme contact in `mode=admin` would then re-stamp it to themselves and remove it from the Preacher's patch. **Medium-High (F-4).** |
| 7 | AD-4 `:118-127` — Admin `/manage` is programme (`mode=admin`) or self (`mode=preacher`); `/contacts` and `/sessions` personal; `/attendance` programme; campaigns program | `:65-69` — dashboard rows only; the surface table's Scope column says "patch" for `/manage` (Assistant context) | **Agree if read as Assistant-scope.** The note's table is titled "What an Assistant can open", so "patch" is the Assistant's scope, not the Admin's. The note's predicate summary defers to AD-3/AD-4. Low risk of misreading, but the note's `/manage` row would be clearer as "owner (Assistant); Admin mode-dependent". |
| 8 | AD-3 `:96` — "An Admin's programme scope stays the programme … `/contacts` and `/sessions` personal" | `:162` — "The Admin's `/sessions` filter is creator-only" | **Agree.** The matrix's "self, creator-only" is explicit; the Deferred is consistent. |
| 9 | AD-5 `:145-148` — Assistant branches, same-programme/role checks, `sessions_visible` boolean with `owner IS NOT NULL` | `:130-132` — same helpers/policies; "a null owner yields zero rows" | **Agree for `sessions_visible`; disagree for the sessions policy/attendance helper** (row 5). The note's "gate every `caller_assigned_preacher_id()` term on `caller_role() = 'Assistant'`" does not gate the `created_by = actor` term. |
| 10 | AD-2 `:73-81` — eligible supervisor Active/same programme/Admin-or-Preacher; Admin binds any, Preacher self; role-change clear; explicit null path | `:45-53` — same | **Agree.** The lifecycle is one rule, the null path is explicit, and the Volunteer form routing is preserved. |
| 11 | AD-6 `:156` — stored name, contract supervisor, UI "Supervisor" with the role, no alias | `:90-97` — same | **Agree.** AD-6 is the cleanest part of the package. The remaining issue is that several existing strings are not named (F-9). |
| 12 | AD-4 `:137` — "This supersedes the autodialer spine's AD-13 sentence … the autodialer file and `docs/architecture.md` role matrix must be updated in the same change" | `:146`, `:150`, `:163` — same; "should be updated" in the earlier text | **Agree in content.** The autodialer is still `status: final` and unedited; the front-matter `supersedes` is present, so B-6 is closed by declaration. The sibling AD-3 assignable set is not declared (F-5). |
| 13 | AD-2 `:79` — "Both invite paths use one `resolveEligibleSupervisor()` helper" | `:47`, `:116` — same | **Agree.** The helper is named; the two routes can no longer drift. |
| 14 | AD-4 `:113` — `VOLUNTEER_INVITE_ROLES = ["Preacher"]` | `:38` — `/volunteers` is Preacher-only | **Agree on the role, but the name is a misnomer:** `/api/volunteers/invite` also creates Assistants (`normalizeInviteRole`, `:17-27`), and the form's role select offers Assistant (`components/invite-user-form.tsx:249-261`). Low (F-13). |
| 15 | `supersedes` front matter — only `spec-autodialer/ARCHITECTURE-SPINE.md#AD-13` | `:146` — "Superseded for the manage gate; the Campaign admin/caller split and AD-2 role set are unchanged" | **Incomplete.** AD-3's Assistant assignable set changes too. The note's "behavior are unchanged" (`:163`) is false for that set. **Medium-High (F-5).** |

**Not contradictions, but worth a sentence:** the note says "the patch … defined by the same predicate the Admin's existing 'Own scope' dashboard view uses" (`:21`). The dashboard's personal predicate is `preacher_id = owner OR created_by = owner`; AD-3's sessions predicate adds `created_by = actor`. The patch (the supervisor's rows) is the same; the Assistant's *view* adds their own creations. The note's table shows the term, so this is a rationale shorthand, not a rule break.

---

## 3. Check 2 — Deferred safety

| Deferred item | Safe? | Two-unit test |
|---|---|---|
| Column rename `assigned_preacher_id` → `supervisor_user_id` | **Yes** | AD-6 forbids a parallel column/alias; the rename is behaviour-neutral and named as a separate change. |
| Programme-scope assistants | **Yes** | AD-3/AD-4 say an Assistant never receives `program_scope = true` or `kind:"program"`; the alternative is a new role/capability, explicitly not a flag. |
| Per-assistant capability overrides | **Yes** | The role stays one construct; no per-supervisor or per-person surface flags. |
| Unify `collected_by_id` | **Yes, with the create/update caveat** | AD-3 `:102` says the grid rule does not apply to `/contact`; AD-4 `:112` keeps the form's per-role collector. The two rules are stated, so a unit cannot silently unify them. The remaining ambiguity is whether "grid writes" means create only (F-4). |
| Unify the Admin's `/sessions` filter | **Yes** | AD-3 `:96` and the matrix `:122` say self, creator-only; AD-5 `:147` says Admin `created_by = actor`; the Deferred says aligning the page is separate. The one wording issue is "the Assistant patch follows the dashboard definition" (`:216`): the dashboard is `preacher_id = owner OR created_by = owner`, the Assistant patch adds `created_by = actor`. This is a shorthand, not a two-unit rule break, but it should be corrected (F-18). |
| `/volunteers` Admin picker | **Yes** | AD-2 `:80` and the matrix make `/volunteers` Preacher-only; the Admin uses `/admin/invite`. The word "stay" is stale (F-9), but the decision is safe. |
| **Open — pre-deploy data audit** | **Correctly open; shape incomplete** | The item is present at `:218`, names (a) ineligible assignees, (b) Assistants who are `preacher_id` but not `created_by`, (c) null/ineligible supervisor with created sessions, and requires the decision/counts in the migration PR plus `verify-rls.mjs` fixtures. Two units cannot diverge on the *implementation* if the migration PR records the decision. However, it misses a fourth shape: Assistants with a valid supervisor who are `created_by` but not `preacher_id` — rows that `/sessions` keeps via `created_by = actor` but the owner-only `/manage` view drops (F-8). Add it to the audit and fixtures. |
| Deployment/environments/provider topology | **Yes** | Inherited unchanged; no new service, table or env var. The CVE note is carried separately. |

**Conclusion:** the Deferred list is genuinely out of scope except the Open audit, which is the one place the migration can still change. It is correctly labelled Open; its counts need one more shape.

---

## 4. Check 3 — B-1…B-6 closure and material N findings

### 4.1 B-1…B-6

| Finding | Status | Evidence |
|---|---|---|
| **B-1 — AD-3 erases the Admin's per-surface scope** | **Closed** | AD-3 `:96` names the Admin exception per surface; AD-4 `:118-127` is the per-surface matrix with an Admin column. `/contacts` self, `/manage` programme/self, `/sessions` creator-only, `/dashboard` programme/self, `/attendance` programme, campaigns program. The matrix is the authority; a unit no longer has to infer it from code. Residual: the universal-looking bullets at `:88-92` still precede the exception, but the matrix overrides them; not a two-unit break. |
| **B-2 — AD-3 write bullet overrides `/contact` and `collected_by_id`** | **Closed, with F-2/F-4 residuals** | AD-3 `:92` is now "grid writes"; `:102` explicitly excludes `/contact`/`/api/contact`; AD-4 `:112` keeps the form's per-role assignment and collector. The Volunteer's form is preserved; the Admin's explicit Preacher picker is preserved. Residuals: "existing" in `:102` contradicts the new Assistant→Admin rule (F-2); "grid writes" does not say create-only (F-4). |
| **B-3 — AD-5 service-role sentence over-broad; locations two-list** | **Closed, with F-3 residual** | AD-5 `:150` now says "A service-role read that **replaces** a caller-scoped read passes the patch vector" and names the reference reads (programme location naming set, staff display names, the caller's own row, the dialer roster). AD-3/conventions say `patchOwnerLocationIds` drives every picker/write check and the `locations` naming set may be wider. Residual: AD-3 `:94` says the attendance helper takes the app vector (F-3); the payload field `locationOptions` is not named (F-12). |
| **B-4 — null-patch state false for sessions; Campaign nav dead item** | **Closed at the decision/matrix level; partly closed in RLS** | AD-3 `:100` says zero rows including the actor's own creations; AD-4 `:118-127` gives the per-surface null state; the note's e2e `:172` no longer says "no dead nav items" but "no dead Contacts/Manage/Invite items", so the Campaign 403 is allowed. Residual: AD-5's sessions policy and attendance helper omit the `owner IS NOT NULL` gate (F-1), so the RLS path still returns the actor's own rows. |
| **B-5 — no pre-deploy data decision** | **Closed** | The Open item at `:218` names (a)/(b)/(c), requires a repair/reassign/accept decision, records the counts in the migration PR, and adds `verify-rls.mjs` fixtures. Residual: the audit's shape misses the `/manage` owner-filter change (F-8). |
| **B-6 — AD-13 supersession surfaced, not enforced** | **Closed for AD-13** | Front matter `supersedes: [spec-autodialer/ARCHITECTURE-SPINE.md#AD-13]`; AD-4 `:137` requires the autodialer file and `docs/architecture.md` role matrix in the same change; the note `:150` requires a test/matrix assertion that the manage gate equals `OPERATIONAL_ROLES`. Residual: the new spine changes autodialer AD-3's Assistant assignable set without declaring it (F-5). |

### 4.2 N findings — material / closed

**Closed (or closed enough):**

- **N-1** `[ADOPTED]` undefined → defined at `:33` ("a decision the user or existing reality already settled"). The tags are now readable; no need to drop them.
- **N-2** RLS bullets as branches → AD-5 `:145-146` says "the Assistant branch … keeping the programme term and the other role branches".
- **N-3** `sessions_visible` not bound → AD-5 Binds `:141` and the boolean `:147`.
- **N-5** same-programme condition missing → AD-5 `:144` requires "in the same programme".
- **N-7** `/volunteers` Admin picker → the surface is Preacher-only, Admin uses `/admin/invite`; the `mode="volunteer"` form's missing picker is no longer a path.
- **N-9** role-change clear over-broad → AD-2 `:78` now says Volunteer requires a Preacher; if the current supervisor is an Admin, clear it and require a Preacher; the binding is form routing, not a scope grant.
- **N-10** `STAFF_ADMIN_ROLES` overstates role changes → AD-4 `:114` says "outside the two invite surfaces".
- **N-13** `binds` omits locations → `:11` includes `locations`.
- **N-17** "patch" undefined → `:31` defines it (personal scope, not HTTP PATCH).
- **N-19** supervisor read needs the admin client → AD-1 `:64` says the supervisor row is read with the admin client because `public.users` RLS lets a non-Admin read only their own row.

**Material (or partly material):**

- **N-4** attendance enumeration → AD-5 `:148` now gives the exact boolean, **but** omits the null-owner gate (F-1).
- **N-6** campaign assignable caller owner → the new spine adds `owner.userId`; the inherited autodialer AD-3 still says "plus themselves" and is not declared amended (F-5).
- **N-8** `ManageScope`/draft-row contract → AD-3 `:100` names `actorUserId`/`actorName`/`patchOwnerId`/`patchOwnerName`; AD-4 `:129` says `role:"Preacher"` is a view descriptor. Still missing: the mapping of the existing `scope.staffUserId`/`scope.staffName` fields, and the exact draft/collector prefill rule in the spine (F-6/F-9).
- **N-11** proxy precision → the spine names both app copies and `/api/manage/:path*`; `/admin/:path*` is still outside the matcher and now matters more because `/admin/invite` is the Admin's only invite path (F-10).
- **N-12** UI-copy strings → AD-6 `:156` broadens the rule ("route error messages, form labels, dashboard notices and empty-state copy"), but the specific strings that become false are not named: `components/contact-form.tsx:216-217` ("assigned to your Preacher"), `components/manage/manage-portal.tsx:167-170` ("your own staff account"), `components/dashboard/dashboard-header.tsx:100-102` ("the preacher you assist"), and the route errors (F-9).
- **N-14** `apps/*/app/{…campaigns…}` over-generalises → still present; Gita Life has no `campaigns` directory and autodialer AD-14 forbids one (F-12).
- **N-15** `requireCampaignAdmin` vs `OPERATIONAL_ROLES` → closed for the gate: AD-4 `:110` defines `CAMPAIGN_ADMIN_ROLES` and `requireCampaignAdmin` uses it. The `VOLUNTEER_INVITE_ROLES` misnomer remains (F-13).
- **N-16** note duplicates the spine → still true; the note's surface and predicate tables restate AD-3/AD-4, and the two are already drifting in emphasis (`/manage` "patch" vs Admin programme; "stay self-only") (F-14).
- **N-18** RLS fixture not named → the note `:171` names `node scripts/verify-rls.mjs` and `.env.migration.local`; the spine `:218` names the fixtures. Still not a `pnpm` script or CI job (F-15).
- **N-20** docs updates only in the note → partly closed: AD-6 binds `docs/*`; AD-4 requires the autodialer and `docs/architecture.md` role matrix. The note's conflicts table is still incomplete and contains one wrong replacement (F-11).

---

## 5. Check 4 — terse and decisions-only

**The spine passes.** At 219 lines it is longer than v2 (177), but the growth is in decisions, not prose: the `[ADOPTED]` definition, the per-surface matrix, the null-patch column, the scope vector, the Admin exception, the RLS branch rules and the Capability Map. The "Prevents" bullets are the right kind of rationale for a spine — they name the divergence the rule exists to stop, not the history of the decision. The note keeps the "why not programme scope" argument, the conflicts table, the risks and the file-level change list, which is where the rationale belongs.

Three blemishes:

1. **AD-3 is still doing three jobs** (Assistant predicate, Admin exception, campaigns). The matrix in AD-4 is now the clean authority; consider making AD-3's bullets explicitly "Assistant/Preacher patch" and letting the matrix carry the Admin column. This is a readability fix, not a new rule.
2. **The note still restates the spine** in the surface table (`:27-41`) and the predicate table (`:59-72`). The note says "Summary only; the spine's AD-3 and AD-4 are authoritative" (`:57`), but the tables already differ in emphasis (`/manage` "patch"; "Campaign … behavior unchanged"). Trim them to a link plus the rows that are genuinely summarised, or make them generated from the spine.
3. **The note's "What has to change" is a file-level implementation list**, not duplicated rationale; keep it. The note's "Why not programme scope" is its unique value; keep it. The only duplicated rationale that should move to the note is the AD-5 sentence "RLS is not narrowed to that page filter, because `/manage` reads through the same policy" — it is a one-line justification, acceptable in the spine but the kind of thing the note could carry if the spine is trimmed.

No new AD weakens a parent spine except the autodialer AD-3 assignable-set change (F-5).

---

## 6. Check 5 — every dimension decided, deferred, or open

| Dimension | State | Where |
|---|---|---|
| Identity boundary and `patchOwner` resolution | Decided | AD-1; note `:76-82` |
| Supervisor eligibility and binding lifecycle | Decided | AD-2; note `:43-53` |
| Patch predicate (contacts/sessions/attendance/locations) | Decided | AD-3; note `:59-72` |
| Admin per-surface scope | Decided | AD-3 `:96`; AD-4 matrix |
| Assistant surfaces and role sets | Decided | AD-4 |
| Null-patch state per surface | Decided in the matrix; **incomplete in RLS** | AD-4 matrix; AD-5 (F-1) |
| Nav capability outcome | Decided in outcome; flag names not named | AD-1 `:66`; AD-4 `:133` |
| Client DTO | **Partly decided** — new fields named, retained fields not | AD-1 `:66`; note `:82`; F-6 |
| `/manage` mode authority | Decided | AD-4 `:129`; note `:110` |
| `/attendance` GET scope | Decided | AD-4 `:131`; note `:111` |
| `/api/sessions` POST owner/locations | Decided | AD-4 `:135`; note `:108` |
| `/contact` and `/api/contact` | Decided in AD-4; **AD-3 wording contradicts** | AD-4 `:112`; AD-3 `:102`; F-2 |
| Grid write attribution | Decided for create; **update not stated** | AD-3 `:92`; F-4 |
| Campaign scope and assignable callers | Decided in the new spine; **not amended in the sibling** | AD-3 `:98`; F-5 |
| RLS helpers and policies | Decided; **null gate missing** | AD-5; F-1 |
| Naming and UI copy | Decided; **specific strings not named** | AD-6; F-9 |
| Proxy matcher | Decided for `/manage`, `/api/manage`, `/attendance`; **`/admin` not listed** | AD-4 `:135`; F-10 |
| Docs updates | Decided in principle; **conflicts table incomplete/inaccurate** | Note `:136-150`; F-11 |
| Pre-deploy data audit | **Open — correctly** | Spine `:218`; note `:160`; F-8 (shape) |
| Rename, programme assistants, per-assistant flags, `collected_by_id`, Admin `/sessions`, `/volunteers` Admin picker, deployment | Deferred | Spine `:210-219`; note `:175-183` |

**The pre-deploy data audit.** It is present, correctly labelled Open, and has the right gate ("Before the migration … decide … record the counts in the migration PR"). It is the one dimension that can still change the migration, which is appropriate. Two fixes: add shape (d) "Assistants with a valid supervisor who are `created_by` but not `preacher_id`" (the `/manage` owner-filter change), and say the audit is a gate on the migration PR, not a note in the risks section. The note's `:160` says "Two tightenings need a data audit"; the `/manage` owner filter makes a third.

---

## 7. Check 6 — stale claims about the codebase

| Claim | Where | Reality |
|---|---|---|
| "`/volunteers` and `/api/volunteers/invite` … **stay** self-only" | Spine AD-2 `:80`; note `:47` | The page requires `["Admin","Preacher"]` (`apps/folk/app/volunteers/page.tsx:12`); the API requires `["Admin","Preacher"]` (`apps/folk/app/api/volunteers/invite/route.ts:32`) and an Admin can pass any Preacher. The note's own surface table says "Before: Admin, Preacher; After: Preacher only". **Stale. Fix "stay" → "become"/"are restricted to".** |
| "The form keeps its **existing** per-role assignment" | Spine AD-3 `:102` | The existing code's `activePreacherResult()` requires an Active **Preacher** (`apps/folk/app/api/contact/route.ts:51-57`; same in gita-life). An Admin-supervised Assistant currently gets "Assigned Preacher must be an active Preacher user." AD-4 `:112` and the note `:109` change this. **Stale. Fix the sentence (F-2).** |
| `docs/architecture.md` Role Matrix: "`/manage` and contacts are Admin/Preacher" | Note `:144` | The matrix (`docs/architecture.md:78-90`) has columns Public/Volunteer/Preacher/Admin — **no Assistant column** — and rows for `/manage` but **no `/contacts` row**. The correct update is "add an Assistant column and `/contacts`/`/attendance` rows", not "update the Assistant row". |
| `docs/architecture.md` `/manage` Portal is "restricted to Admin and Preacher"; "a non-Admin/Preacher staff member is redirected to the authorization-failure page" | `docs/architecture.md:162-166` | The feature admits Assistant. The note's conflicts table names the Role Matrix, not this prose. **Docs gap (F-11).** |
| `docs/architecture.md` `/volunteers` row is Yes for Admin | `docs/architecture.md:88` | The feature makes it Preacher-only. The note's conflicts table does not name this row. **Docs gap (F-11).** |
| `docs/architecture.md` Staff Invites: "Preachers can invite Volunteers assigned to themselves" | `docs/architecture.md:160` | The `/volunteers` form also offers Assistant; a Preacher can create an Assistant assigned to themselves (`apps/folk/app/api/volunteers/invite/route.ts:17-27`, `:91-96`). The feature keeps this. **Already stale; the note doesn't name it.** |
| `docs/api-contracts.md` `GET/POST /api/sessions` "Auth: Admin or Preacher" | `docs/api-contracts.md:216-218, 242-246` | Both routes require `["Admin","Preacher","Assistant"]` (`apps/folk/app/api/sessions/route.ts:124, 150`; same in gita-life). Already stale; the feature changes the scope. The note doesn't name these lines. **Docs gap.** |
| `docs/api-contracts.md:295` update: "active supervisor (Preacher or Admin)" | Note `:145` | Wrong for Volunteers: AD-2 `:78` requires an eligible **Preacher** for a Volunteer. Correct update: "Volunteer invites require an active Preacher; Assistant invites require an active Admin or Preacher." **Contradiction (F-11).** |
| `listCachedActivePreachers` is used by both `/contact` and `/admin/invite` | `lib/supabase/data.ts:389`; `apps/folk/app/contact/page.tsx:15`; `apps/folk/app/admin/invite/page.tsx:14` | The note's `:118` says "rename the helper **or** add a sibling". Renaming and widening it would put Admins in the Admin's `/contact` picker, contradicting AD-4's "Admin → explicitly chosen Preacher". **Unsafe option (F-7).** |
| `apps/*/app/{contacts,manage,sessions,dashboard,**campaigns**,contact,attendance}/**` | Spine AD-4 `:106` | `apps/gita-life/app` has no `campaigns` directory; autodialer AD-14 forbids a Campaign route there. Say `apps/folk/app/campaigns/**`. **Over-general (F-12).** |
| `VOLUNTEER_INVITE_ROLES` | Spine AD-4 `:113` | The surface invites Volunteers **and Assistants** (`normalizeInviteRole`), and the form's role select offers both. The name says Volunteer only. **Misnomer (F-13).** |
| "preacher you assist", "assigned to your Preacher", "your own staff account" | `components/dashboard/dashboard-header.tsx:100-102`; `components/contact-form.tsx:216-217`; `components/manage/manage-portal.tsx:167-170` | These are the strings AD-6 says must say "Supervisor" and show the role. The note's "What has to change" only names the invite form. **UI-copy gap (F-9).** |
| The `sessions_visible` predicate is the only scope function to change | Spine AD-5 `:141-148` | `public.session_visible` wraps `sessions_visible` (`supabase/migrations/20261101000000_sessions_flow.sql:112-132`), and `sessions_overview`, `sessions_report`, `sessions_top_attendees` and others call it with the old four arguments. Changing the signature touches them all. The `supabase/migrations/**` bind covers it, but the note's file-level list does not name the wrapper. **Low (F-16).** |
| `verify-rls.mjs` is a test gate | Note `:171` | It is not a `pnpm` script (`package.json` scripts list) and not in CI. It is a manual `node` run with `.env.migration.local`. The note names the command correctly; the CI gap remains. **Low (F-15).** |
| "The Assistant patch follows the dashboard definition" | Spine Deferred `:216`; note `:162` | The dashboard's personal predicate is `preacher_id = owner OR created_by = owner`; AD-3's Assistant sessions predicate adds `created_by = actor`. The patch is the same; the Assistant's view is wider by the actor term. **Imprecise (F-18).** |
| "A null patch yields zero rows everywhere" | Note `:157`; spine `:100` | The RLS sessions policy and attendance helper keep `created_by = actor` with no owner gate. **False at the RLS layer (F-1).** |

---

## 8. Findings

### F-1 — High — the null-owner gate is missing from the sessions RLS policy and the attendance helper

**Where:** Spine AD-3 `:100`; AD-4 matrix `:118-127`; AD-5 `:146` (sessions policy) and `:148` (attendance helper); note `:80`, `:157`, `:171`.

**The rule as written.** AD-3 says "A null owner yields zero rows on every operational surface, including the actor's own creations." AD-5's `sessions_visible` boolean correctly writes:

> Assistant `owner IS NOT NULL AND (preacher_id = owner OR created_by = owner OR created_by = actor)`.

But AD-5's sessions **policy** is written without the gate:

> The Assistant branch of the sessions policy is `preacher_id = owner OR created_by = owner OR created_by = actor`; it drops `preacher_id = actor` and keeps `created_by = actor`.

and the attendance helper is written without it:

> Assistant `preacher_id = supervisor OR created_by = supervisor OR created_by = self`.

**What the code does today.** The sessions policy is `created_by = auth.uid() OR preacher_id = auth.uid() OR created_by = caller_assigned_preacher_id() OR preacher_id = caller_assigned_preacher_id() …` (`supabase/migrations/20261101000000_sessions_flow.sql:33-54`). The attendance helper is `s.preacher_id = auth.uid() OR s.preacher_id = caller_assigned_preacher_id()` (`20261006010000_scoped_rls_policies.sql:114-131`). Both currently grant a null-supervisor Assistant their own rows; the feature's stated tightening is to remove that. `sessions_visible` (the service-role `/sessions` read) gets the gate; the RLS path does not.

**Two lawful units.**

- **Unit A** implements AD-5's literal policy/helper: a null-patch Assistant still reads the sessions they created and the attendance of those sessions through the RLS client (`/manage` reads with `createSupabaseServerClient()`), while `/sessions` (via `sessions_visible`) shows nothing. The matrix's `/manage` null cell says "empty + explanation"; the RLS read is not empty.
- **Unit B** implements AD-3's invariant and adds `caller_assigned_preacher_id() IS NOT NULL` around the Assistant terms; the RLS path is empty, matching `/sessions` and the matrix.

**Impact.** The actor's own legacy rows, not the supervisor's. Still a violation of the feature's one absolute null rule and a two-unit divergence; a direct authenticated read (or any future RLS-scoped surface) can return rows the decision says are gone. The note's RLS test ("the null-patch zero-row behavior") would catch it, but only if the test reads the tables, not just `/sessions`.

**Fix.** Add the gate to both:

```sql
-- sessions policy, Assistant branch
public.caller_role() = 'Assistant'
AND public.caller_assigned_preacher_id() IS NOT NULL
AND (
  preacher_id = public.caller_assigned_preacher_id()
  OR created_by = public.caller_assigned_preacher_id()
  OR created_by = auth.uid()
)
```

and the attendance helper's Assistant branch similarly. State it in AD-5 next to the `sessions_visible` boolean. Add an RLS fixture: a null-supervisor Assistant with a created session must read zero sessions and zero attendance rows.

### F-2 — High — AD-3 says the `/contact` form keeps its "existing" assignment, contradicting AD-4 and the note

**Where:** Spine AD-3 `:102`; AD-4 `:112`; note `:72`, `:109`.

**The rule as written.** AD-3: "The form keeps its **existing** per-role assignment and collector rule (AD-4)." AD-4: "The form's assignment rule: Volunteer → Preacher; **Assistant → Admin or Preacher**; Preacher → self; Admin → explicitly chosen Preacher." The note: "an Assistant may resolve an Admin supervisor."

**What the code does today.** Both `/api/contact` routes call `activePreacherResult()`, which rejects anything that is not an Active **Preacher** (`apps/folk/app/api/contact/route.ts:51-57`; same in `apps/gita-life/app/api/contact/route.ts:48-56`). An Assistant assigned to an Admin currently gets "Assigned Preacher must be an active Preacher user." The `/contact` page's Assistant path also uses `findStaffUserById(staff.assignedPreacherUserId)` and `assignedPreacher?.locationIds` (`apps/folk/app/contact/page.tsx:19-27`).

**Two lawful units.** Unit A reads "existing" as "do not change the Assistant's resolver" and keeps the Preacher-only check; the Admin-supervised Assistant cannot use `/contact`, contradicting AD-4 and the note. Unit B follows AD-4 and changes the check to Admin-or-Preacher for an Assistant, while keeping the Admin's explicit picker Preacher-only.

**Fix.** Replace AD-3 `:102` with: "The form's assignment rule is AD-4's. The only change is that an Assistant's supervisor may be an Admin; the Admin's explicit picker stays a Preacher, and the collector keeps its existing per-role rule." Also split `activePreacherResult` into a supervisor check (Admin or Preacher) for the Assistant path and a Preacher-only check for the Admin's explicit picker.

### F-3 — High/Medium — AD-3 says the attendance helper takes the app scope vector; AD-5's helper is an RLS function

**Where:** Spine AD-3 `:94`; AD-5 `:141` (binds), `:148` (boolean); note `:74`, `:131`.

**The rule as written.** AD-3: "A scope function receives `p_actor_id`, `p_actor_role`, `p_owner_id` and `p_owner_location_ids`; it never receives the owner's role. `sessions_visible` and the **attendance helper** take the full vector." AD-5 binds `caller_can_read_attendance_session()` and describes its boolean from `self`/`supervisor`.

**What the code does today.** `caller_can_read_attendance_session(p_session_id UUID)` is a `SECURITY DEFINER` RLS helper called by the attendance policy (`20261006010000_scoped_rls_policies.sql:114-131, 205-214`). It resolves the caller from `auth.uid()` and `caller_assigned_preacher_id()`; it cannot receive app-supplied `p_actor_id`/`p_owner_id`, because the policy calls it with one argument. The note never says it takes the vector; only the spine does.

**Two lawful units.** Unit A changes the RLS function signature and the policy call to pass the app vector — the policy has no app context, so the migration is either wrong or the function is called with nulls. Unit B keeps the helper internal (AD-5's boolean) and changes only `sessions_visible`/the app RPCs — violating AD-3's literal sentence.

**Fix.** Restrict the sentence to app-level scope functions: "`sessions_visible` and the dashboard/campaign RPCs take the vector. The RLS helpers — `caller_assigned_preacher_id()`, `caller_effective_location_ids()` and `caller_can_read_attendance_session()` — resolve from `auth.uid()` and keep their signatures." Then AD-5's boolean is the only statement of the attendance helper's predicate.

### F-4 — Medium-High — "grid writes" does not say create-only; stamping on update reassigns contacts

**Where:** Spine AD-3 `:92`; note `:70`; code `lib/supabase/manage.ts:1146-1213`.

**The rule as written.** "Grid writes: `assigned_preacher_id` (contact) and `preacher_id` (session) carry `owner.userId`; `collected_by_id` and `created_by` carry `actor`." The grid has create and update; the rule does not distinguish.

**What the code does today.** `createManageContact` sets `assigned_preacher_id = staff.userId` and `collected_by_id = staff.supabaseUserId` (`:1205-1213`). `updateManageContact` sends only the edited `payload` (`:1146-1163`); `buildContactWritePayload` has no assignee/collector keys (`:1014-1082`). The current update preserves ownership and attribution.

**Two lawful units.** Unit A applies the rule on every grid write: an Admin editing a contact in `/manage?mode=admin` re-stamps it to themselves (the Admin's `patchOwner` is self), and the Preacher who owned it loses it from `/contacts` and `/manage`; `collected_by_id` becomes the editor on every edit. Unit B applies it on create only, preserving the current update semantics.

**Fix.** Say "on create". Add: "Update writes only the fields the grid edits; `assigned_preacher_id` and `collected_by_id` are not re-stamped." Add a test: an Admin edits a contact owned by a Preacher in `mode=admin`; the owner and collector are unchanged.

### F-5 — Medium-High — the autodialer AD-3 assignable set is changed but not declared; the note says behaviour is unchanged

**Where:** Spine AD-3 `:98`; Design Paradigm `:39`; front matter `:12-13`; note `:69`, `:163`; autodialer AD-3 `:85`.

**The rule as written.** New spine: "Its assignable caller set is the active staff assigned to the owner, plus the actor and the owner." Autodialer AD-3: "Assistant = active staff users whose `assigned_preacher_id = staff.assignedPreacherUserId`, **plus themselves**." The new spine adds `owner.userId` (the supervisor); the inherited `final` spine does not. The note's predicate table repeats the new set, but the note's consequence paragraph says "the Campaign admin/caller split, role set and **behavior are unchanged**; only the manage contacts gate and the campaign scope helper's owner id change." The Design Paradigm says "this spine updates the admin scope helper to read the patch owner and **changes nothing else there**."

**What the code does today.** `loadAssignableCallers` adds `staff.userId` (the actor), not the owner (`lib/dialer/scope.ts:166-210`). For an Admin-supervised Assistant, the supervisor is not in the set, so the Assistant cannot assign contacts to the Admin.

**Two lawful units.** Unit A reads the inherited final AD-3 and omits the supervisor. Unit B follows the new spine and includes them. The difference is a visible capability, and the inherited artifact is the one a unit may quote as `final`.

**Fix.** Add `spec-autodialer/ARCHITECTURE-SPINE.md#AD-3` (assignable set) to `supersedes`, or state in AD-3 that the Assistant set gains the owner and the autodialer AD-3 sentence must be amended in the same change. Correct the note `:163` to "the split, role set and gate are unchanged; the assignable set gains the owner." Add a unit test: an Assistant's `assignableCallers` includes the supervisor and the Assistant.

### F-6 — Medium — the client DTO field list is incomplete for existing consumers

**Where:** Spine AD-1 `:66`; note `:82`.

**The rule as written.** "One `toClientStaff()` projection serves … every `StaffAuthShell`. It carries `hasPatchScope`, `supervisorName`, `supervisorRole` … and the nav capability flags; it never carries `patchOwner.locationIds`." The note says "never `locationIds`."

**What the client uses today.** `AuthProvider` derives `role`, `isAdmin`, `isPreacher`, `isVolunteer`, `isAssistant`, `username` from `staff.role`, `staff.name`, `staff.email` (`lib/auth-context.tsx:187-200`). `Header` reads `staff.hasActiveCallerProfile` (`components/header.tsx:251`). `CampaignMenu` reads `staff.hasActiveCallerProfile` and `staff.role` (`components/campaign/campaign-menu.tsx:40-45, 81`). `auth-hash-callback.tsx` reads `result.staff.role` (`:118, :188`). `StaffContext` also carries `programId`, `supabaseUserId`, `userId`, `status`, `lastSyncedAt`.

**Two lawful units.** Unit A builds the DTO from the listed fields only; the role flags, username, Volunteer caller-queue link and hash callback break — the exact "a Volunteer losing the caller queue" AD-4's Prevents column names. Unit B keeps the existing client-safe identity fields alongside the new ones.

**Fix.** Name the projection's retained set: `role`, `name`, `email`, `hasActiveCallerProfile`, plus the new `hasPatchScope`/`supervisorName`/`supervisorRole` and the nav flags. Say the DTO drops `patchOwner` and every `locationIds` (or at least `patchOwner.locationIds`). Add a test that the DTO has no `patchOwner` key and still drives the Volunteer Campaign item.

### F-7 — Medium — "rename or add a sibling" for `listCachedActivePreachers` can widen the Admin's `/contact` picker

**Where:** Note `:118`; note `:47`; AD-4 `:112`.

**The rule as written.** "The active-supervisor list is no longer 'active preachers' only; rename the helper or add a sibling so the cache tag does not lie."

**What the code does today.** `listCachedActivePreachers` is used by the Admin's `/contact` page (`apps/folk/app/contact/page.tsx:15`) and by `/admin/invite` (`apps/folk/app/admin/invite/page.tsx:14`). The `/contact` picker must stay Preacher-only per AD-4; the invite picker must list Admins and Preachers. Renaming and widening the one helper silently puts Admins in the contact form.

**Two lawful units.** Unit A renames `listCachedActivePreachers` → `listCachedActiveSupervisors` and widens it; the Admin's `/contact` picker now offers Admins, and `resolveAssignedPreacher`'s explicit check still rejects them (or, worse, accepts if the unit also widens it). Unit B adds a sibling and keeps the preacher-only helper for `/contact`.

**Fix.** Say "add `listCachedActiveSupervisors` as a sibling; keep `listCachedActivePreachers` for `/contact`; invalidate both cache tags on a staff write." Add a test that the Admin's `/contact` picker contains no Admin.

### F-8 — Medium — the audit misses the `/manage` owner-filter change

**Where:** Spine `:218` (a/b/c); note `:160`; AD-4 matrix `:121` (`/manage` Assistant = owner; `/sessions` = owner + actor); `lib/supabase/manage.ts:554-566`.

**The gap.** The current `/manage?mode=preacher` filter is `preacher_id === staff.userId || created_by === staff.userId` (the actor). The new Assistant filter is the owner (the supervisor). A legacy Assistant-created session with `preacher_id != supervisor` was in `/manage` and is out after; `/sessions` keeps it via `created_by = actor`. The audit (b) counts the opposite shape — "Assistants who are `preacher_id` but not `created_by`" (the `preacher_id = actor` removal); it does not count "Assistants who are `created_by` but not `preacher_id`" for the `/manage` owner view. The `verify-rls.mjs` `s4` fixture (Assistant-created, Admin-led) is exactly this shape for the Assistant assigned to the Preacher (`lib/supabase` fixtures at `scripts/verify-rls.mjs:289-295, 452-464`), while the note's risk paragraph names the opposite shape ("a session the supervisor created but another preacher led") and the note's RLS test ("a session that `/sessions` shows and `/manage` must count") does not say which fixture it means.

**Two lawful units.** Unit A applies the matrix's owner-only `/manage` filter and the row disappears from `/manage`; Unit B applies AD-3's full session predicate (`created_by = actor`) and keeps it. The matrix says owner, but the audit does not record how many rows that drops, and the note's "a session that `/sessions` shows and `/manage` must count" reads as an agreement requirement.

**Fix.** Add shape (d) "Assistants with a valid supervisor who are `created_by` but not `preacher_id`" to the audit. State explicitly that `/manage`'s `mode=preacher` filter is owner-only by the matrix and that `/sessions` is wider by the actor term. Add a fixture for the s4/Preacher-supervised shape and decide whether the expected `/manage` count is 0 or 1; record it.

### F-9 — Medium-Low — the UI copy strings that become false are not named

**Where:** AD-6 `:156`; note `:23`, `:97`; code:
- `components/contact-form.tsx:216-217` — "Assistant contacts are assigned to your **Preacher**…"
- `components/manage/manage-portal.tsx:167-170` — "Showing only rows scoped to **your own staff account**. Switch to the program-wide scope…" (an Assistant has no switch and the account is the supervisor's).
- `components/dashboard/dashboard-header.tsx:100-102` — "No active **preacher** is assigned…" and "…the **preacher** you assist."
- Route errors: the `activePreacherResult` and `resolveAssignedPreacher` messages in `apps/folk/app/api/contact/route.ts` and `apps/gita-life/app/api/contact/route.ts`; `apps/folk/app/api/sessions/route.ts:181,190` (and the gita-life twin); `apps/folk/app/api/admin/invite-user/route.ts:45,53`; `apps/folk/app/api/volunteers/invite/route.ts:58-60`.
- `components/invite-user-form.tsx:263-277` — the select label "Assigned Preacher".

AD-6's rule covers "route error messages, form labels, dashboard notices and empty-state copy", but the `role:"Preacher"` view descriptor in AD-4 is what triggers the manage-portal copy. A unit can implement AD-4 literally and leave all of these saying "Preacher".

**Fix.** Add a short list to AD-6 (or the note's "What has to change"): the contact form notice, the manage portal own-scope notice, the dashboard unassigned/scope notices, the invite select label, and the route errors. Say the manage portal uses `patchOwnerName`/`supervisorRole`, not `scope.role`, for the notice.

### F-10 — Medium-Low — `/admin/:path*` is outside the matcher, and `/admin/invite` is now the Admin's only invite path

**Where:** Spine AD-4 `:135`; note `:125`, `:148`; `apps/folk/proxy.ts:9-23`; `apps/gita-life/proxy.ts:9-23`.

The app matchers include `/api/admin/:path*` but not `/admin/:path*`. The feature makes `/admin/invite` the Admin's only invite page (the `/volunteers` Admin path is removed). The note's matcher paragraph says the known gap becomes load-bearing for `/manage`, `/api/manage/*` and `/attendance`; it does not mention `/admin`. The page itself calls `getStaffContext()`, so it is not an authorization hole, but session refresh does not run there; an Admin with an expired cookie is sent to login instead of being refreshed.

**Fix.** Add `/admin/:path*` to both app matchers, or record it as a known gap with the invite-path consequence and a follow-up. If added, include it in the e2e matcher assertion.

### F-11 — Medium-Low — the docs update table is incomplete and contains one wrong replacement

**Where:** Note `:136-150`, `:145`; `docs/architecture.md:78-90, 160, 162-166`; `docs/api-contracts.md:214-246, 295`; `docs/data-models.md:130`.

Missing/wrong:
- `docs/architecture.md` Role Matrix has **no Assistant column** and **no `/contacts` row**; the note's "Update the Assistant row" is not actionable as written.
- `docs/architecture.md` `/manage` Portal prose says Admin/Preacher only and "a non-Admin/Preacher staff member is redirected"; the feature admits Assistant.
- `docs/architecture.md` `/volunteers` row is Yes for Admin; the feature makes it Preacher-only.
- `docs/architecture.md` Staff Invites says "Preachers can invite Volunteers assigned to themselves"; the form also offers Assistant.
- `docs/api-contracts.md` `GET/POST /api/sessions` says "Auth: Admin or Preacher"; the routes already admit Assistant, and the feature changes the scope.
- `docs/api-contracts.md:295` replacement "active supervisor (Preacher or Admin)" is wrong for Volunteers; AD-2 requires a Preacher for a Volunteer.

**Fix.** Rewrite the conflicts table by artifact and by line: add the `/manage` prose, `/volunteers` row, Staff Invites prose, `/api/sessions` role lines; change the `:295` effect to "Volunteer: active Preacher; Assistant: active Admin or Preacher." The `docs/data-models.md` update is correct.

### F-12 — Low — `apps/*/app/{…campaigns…}` implies a Gita Life Campaign route

AD-4 `:106` still lists `campaigns` inside the `apps/*` glob. `apps/gita-life/app` has no `campaigns` directory; autodialer AD-14 forbids one. Say `apps/folk/app/campaigns/**`.

### F-13 — Low — `VOLUNTEER_INVITE_ROLES` is a misnomer

The set is `["Preacher"]`, but `/api/volunteers/invite` also creates Assistants (`normalizeInviteRole`), and the form's role select offers Assistant. Rename to `VOLUNTEER_SURFACE_ROLES` or `STAFF_INVITE_ROLES` and say the surface is the Preacher's self-only invite surface for Volunteers and Assistants.

### F-14 — Low — the note still duplicates the spine, and the tables are drifting

The note's surface table (`:27-41`) and predicate table (`:59-72`) restate AD-4/AD-3; the note says the spine is authoritative (`:57`), but the tables already differ in emphasis (`/manage` "patch" vs the Admin's programme mode; "stay self-only"). Trim the tables to a link or generate them from the spine. Keep the "Why not programme scope", the conflicts table, the risks and the file-level change list.

### F-15 — Low — RLS verification is manual and not in CI

`scripts/verify-rls.mjs` exists and the note names the command and `.env.migration.local`; it is not a `pnpm` script and not in CI. The note's verification list does not mention `pnpm test:e2e:determinism` after touching specs/fixtures, which the repo's testing policy requires. Add both to the verification section (or say the RLS run is a migration-PR gate, not a CI gate).

### F-16 — Low — the `sessions_visible` signature change touches `session_visible` and every SQL caller

AD-5 binds `sessions_visible` and gives the new boolean, but `public.session_visible` wraps it (`20261101000000_sessions_flow.sql:112-132`) and `sessions_overview`, `sessions_report`, `sessions_top_attendees` and others call it with the old four arguments. The `supabase/migrations/**` bind covers the files, but the note's file-level "What has to change" should name the wrapper and the callers so a unit does not change only the leaf. This is a mechanical risk, not a decision gap.

### F-17 — Low — the `/contact` collector statement is imprecise

The note `:161` says the form records the assigned preacher as collector for "Admin/Preacher", while the grid records the actor. For a Preacher, the assigned preacher is self and the actor is self, so they agree; only the Admin differs. The "same-contact-through-both-paths test is not expected to agree" is true for Admin-created contacts, not for an Assistant-created contact (both paths use the Assistant as collector). Say "Admin" where the divergence is meant.

### F-18 — Low — "the Assistant patch follows the dashboard definition" is imprecise

The dashboard's personal scope is `preacher_id = owner OR created_by = owner` (`20261102010000_dashboard_rpcs.sql:694-695`); AD-3's Assistant sessions predicate adds `created_by = actor`. The patch is the same; the Assistant's view has one extra term. Say "the Assistant patch uses the dashboard's owner terms plus `created_by = actor` for the Assistant's own legacy creations."

### F-19 — Low — the memlog's "existing empty scope" is stale

`.memlog.md:12` records "Missing, inactive, or non-eligible supervisor yields the existing empty scope"; the spine changes the sessions fallback to zero rows. The memlog is a companion, not a spec, but it is listed in `companions`; update it or note that the spine supersedes it.

### F-20 — Low — the note's `status: proposed` and the spine's `status: draft` against the autodialer `final`

B-6 is closed by the front-matter `supersedes` and the "same change" requirement, but the autodialer file is still unedited. The review cannot verify a future edit; the fix is to make the sibling edits part of the change's definition of done, not a note in a companion. The note's "Required sibling update" already says this; add it to the spine's AD-4 or a one-line "Definition of done" so it is not optional.

### F-21 — Medium — the Gita Life `/attendance?session=` check is location-based and not reconciled with AD-3's patch

**Where:** Spine AD-4 `:131`, `:106`; AD-3 `:90` ("attendance: through a session in the patch"); `apps/gita-life/app/attendance/route.ts:125-146`; `apps/folk/app/attendance/route.ts:118-146`.

**What the code does today.** The folk route's `?session=` branch resolves `sessionsScope(staff)` and calls `isSessionVisible(scope, sessionId)` (`apps/folk/app/attendance/route.ts:124-146`), i.e. the session predicate. The Gita Life route has its own check:

```ts
const canReadSession =
  staff.role === "Admin" ||
  session.preacherIds.includes(staff.userId) ||
  (staff.role !== "Assistant" &&
    session.locationIds.some((locationId) => staff.locationIds.includes(locationId))) ||
  isAssistantMatch
```

For a Preacher this grants attendance for **any session at one of their locations**, even when another preacher created and led it. AD-3's attendance rule is "through a session in the patch" (`preacher_id = owner OR created_by = owner OR created_by = actor`; the Preacher's assistant-created term). Location is not in that predicate. The spine binds `apps/*/app/attendance/**` and says the staff GET is session-scoped or patch-scoped; it does not name the location match to remove.

**Two lawful units.** Unit A keeps the Gita Life route's location check (it is the current behaviour and the spine does not mention it) and gets a broader attendance read than the patch. Unit B aligns it with the folk route / AD-3 and removes the location term. The two apps then disagree on which sessions a Preacher can read attendance for.

**Fix.** State that the `?session=` check in both apps is the session patch (`sessions_visible`/`isSessionVisible`), not a location match, and that the Gita Life route is brought onto it. Add a case: a Preacher's location holds a session created and led by another Preacher; `/attendance?session=` must 403. Also state the Admin bypass: an Admin's `?session=` read is programme-scoped and must not call the creator-only `sessions_visible` (the folk route's current `isSessionVisible` would otherwise narrow the Admin to their own creations).

---

## 9. Brownfield facts re-verified

| Claim | Verdict | Evidence |
|---|---|---|
| `getStaffContext()` returns the raw FK only; no `patchOwner` | True | `lib/authz.ts:15-40, 105-140, 201-226` |
| The dashboard accepts a supervisor only when the assignee is an Active **Preacher** | True | `lib/dashboard/scope.ts:59-67` |
| The sessions scope accepts a supervisor only when the assignee is an Active **Preacher** | True | `lib/sessions/scope.ts:43-71` |
| Campaigns use the raw `assignedPreacherUserId` with no Active/role/program check | True | `lib/dialer/scope.ts:279-291` |
| The Admin `/sessions` read is creator-only | True | `20261102030000_admin_creator_only_sessions.sql:33-38` |
| `sessions_visible` gives an Assistant `created_by = p_user_id OR preacher_id = p_user_id`; the Preacher assistant-created term exists | True | `20261101000000_sessions_flow.sql:66-107` |
| The sessions RLS policy's Assistant branch includes `preacher_id = auth.uid()` and `created_by = auth.uid()` | True | `20261101000000_sessions_flow.sql:33-54` |
| `caller_can_read_attendance_session()` checks `preacher_id` only | True | `20261006010000_scoped_rls_policies.sql:114-131` |
| `caller_assigned_preacher_id()` / `caller_effective_location_ids()` check Active only; no role and no same-programme condition | True | same migration `:70-108` |
| `/manage?mode=admin` is programme-wide; `mode=preacher` filters by `staff.userId` | True | `lib/supabase/manage.ts:554-566` |
| `/contacts` is personal for **every** role, including Admin | True | `lib/supabase/manage.ts:809-811`; `components/contacts/contacts-types.ts:8-11` |
| `loadContactsSectionData` reads all programme locations with the service role, deliberately | True | `lib/supabase/manage.ts:760-806` |
| `/api/contact` has no `requireRole`; Assistant/Volunteer route through the assigned preacher; Admin picks an explicit Preacher; collector = assigned preacher for Admin/Preacher, actor for Volunteer/Assistant | True | `apps/folk/app/api/contact/route.ts:51-80, 136-149`; same in gita-life |
| `/contact` is the Volunteer's only contact-capture surface | True | `apps/folk/app/contact/page.tsx:11-30`; `components/contact-form.tsx:216-219`; `components/header.tsx:269` |
| `/manage` and `/api/manage/contacts/**` are Admin/Preacher only | True | `apps/folk/app/manage/page.tsx:64`; `lib/manage/api-handlers.ts:253, 292, 328, 418, 460, 513`; `lib/contacts/section-server.ts:42-44` |
| `createManageContact` stamps `assigned_preacher_id = staff.userId`, `collected_by_id = staff.supabaseUserId` | True | `lib/supabase/manage.ts:1205-1213` |
| `upsertStaffUser` writes `assigned_preacher_id` only when supplied; never clears on a role change | True | `lib/supabase/data.ts:398-440` |
| `/volunteers` page and `/api/volunteers/invite` admit Admin and Preacher today | True | `apps/folk/app/volunteers/page.tsx:12`; `apps/folk/app/api/volunteers/invite/route.ts:32` |
| The `/volunteers` page renders `InviteUserForm mode="volunteer"` with no `preachers` prop; the select renders only for `mode="admin"` | True | `apps/folk/app/volunteers/page.tsx:19`; `components/invite-user-form.tsx:263-277` |
| Both app proxy matchers omit `/manage`, `/api/manage/*`, `/attendance` and `/admin/:path*`; they include `/api/admin/:path*` | True | `apps/folk/proxy.ts:9-23`; `apps/gita-life/proxy.ts:9-23` |
| `apps/gita-life/app` has no `campaigns` directory | True | directory listing |
| `apps/gita-life/app/sessions/page.tsx` has its own inline supervisor resolver | True | `apps/gita-life/app/sessions/page.tsx:16-33` |
| `apps/folk/app/contact/page.tsx` has its own inline supervisor resolver | True | `apps/folk/app/contact/page.tsx:19-27` |
| Both `/api/sessions` POST routes re-resolve the supervisor and require a Preacher | True | `apps/folk/app/api/sessions/route.ts:178-192`; `apps/gita-life/app/api/sessions/route.ts:99-115` |
| `/attendance` GET with no `session` calls `getAttendanceByDate`, a service-role programme-wide read, admitted to Assistant | True | `apps/folk/app/attendance/route.ts:118-146`; `lib/supabase/data.ts:1010-1032` |
| The Gita Life `/attendance?session=` check is location-based for a Preacher; the folk route uses `sessions_visible` | True | `apps/gita-life/app/attendance/route.ts:125-146`; `apps/folk/app/attendance/route.ts:124-146` |
| `components/header.tsx`'s `isPreacher` is `role === "Admin" || role === "Preacher"` | True | `lib/auth-context.tsx:197-200` |
| `components/header.tsx`'s Campaign item uses `canUseCampaignAdmin: isPreacher || isAssistant` | True | `components/header.tsx:247-252` |
| The client uses `staff.role`, `staff.name`, `staff.email`, `staff.hasActiveCallerProfile` | True | `lib/auth-context.tsx:187-200`; `components/header.tsx:251`; `components/campaign/campaign-menu.tsx:40-45, 81`; `components/auth-hash-callback.tsx:118, 188` |
| `listCachedActivePreachers` is used by `/contact` and `/admin/invite` | True | `lib/supabase/data.ts:389`; `apps/folk/app/contact/page.tsx:15`; `apps/folk/app/admin/invite/page.tsx:14` |
| The note's `docs/architecture.md` Role Matrix claim is inaccurate | True | matrix `:78-90` has no Assistant column and no `/contacts` row |
| `docs/api-contracts.md` `/api/sessions` says "Auth: Admin or Preacher" while the code admits Assistant | True | `docs/api-contracts.md:214-218, 242-246`; `apps/folk/app/api/sessions/route.ts:124, 150` |
| `docs/api-contracts.md:295` says "Volunteer and Assistant invites require an active assigned Preacher" | True | `docs/api-contracts.md:295` |
| `docs/data-models.md:130` says Volunteer/Assistant routing | True | `docs/data-models.md:130` |
| `scripts/verify-rls.mjs` is not a `pnpm` script and not in CI | True | `package.json` scripts; `.github` has no reference |
| Next 16.0.7, React 19.2.0, TS 5.x, supabase-js `^2.105.1`, Postgres 17, pnpm 10.33.0 | True | `package.json`; `supabase/config.toml:36` |
| `[ADOPTED]` is defined only in this spine | True (now defined at `:33`) | only occurrences `:33, 68, 83, 104, 152` |

---

## 10. What is right

- **The single-resolver model.** `patchOwner` at `getStaffContext()`, with the raw FK retained and one `toClientStaff()` projection, is the right shape. It removes the four divergent re-resolvers (`lib/dashboard/scope.ts`, `lib/sessions/scope.ts`, `lib/dialer/scope.ts`, `apps/folk/app/contact/page.tsx`, `apps/gita-life/app/sessions/page.tsx`, both sessions POST routes) without changing the identity boundary.
- **AD-4's per-surface matrix.** This is the cleanest fix in the revision: it states the Admin/Preacher/Assistant/null-patch outcome per surface, so B-1 no longer depends on inferring the Admin's behaviour from code. The "loader owns `mode`" rule is the right companion.
- **AD-2's binding lifecycle.** Eligible supervisor = Active, same programme, Admin or Preacher; Admin any, Preacher self; explicit null path; Volunteer routing preserved. This closes the headline capability and the stale-FK risk.
- **AD-5's reference-read qualifier.** "A service-role read that **replaces** a caller-scoped read" plus the named exceptions (location naming, staff names, the caller's row, the dialer roster) is exactly right. The two-list locations rule (`patchOwnerLocationIds` for the picker, wider naming set) is a real brownfield fix.
- **The null-patch matrix.** The per-surface cells (empty + explanation, unassigned notice, autodialer 403, routing-not-configured) are the right level; the note's e2e criterion change from "no dead nav items" to "no dead Contacts/Manage/Invite" correctly permits the Campaign 403.
- **AD-6's naming.** Keep the stored name, make the contract supervisor, label the UI with the role, defer the rename, no alias. This is the correct brownfield ratification; the remaining work is the string list.
- **The pre-deploy audit as Open.** It is the right thing to leave open, and the migration-PR gate is the right place to resolve it. The shape needs one more count.
- **The AD-13 supersession.** The front-matter `supersedes`, the exact sentence, the sibling-edit requirement and the manage-gate assertion are the right enforcement; the same treatment is needed for AD-3's assignable set.

---

## 11. Fix list

### P0 — before parallel build

1. **F-1.** Add `caller_assigned_preacher_id() IS NOT NULL` to the Assistant branch of the sessions policy and the attendance helper. State it in AD-5 beside `sessions_visible`. Add the null-patch RLS fixture for sessions and attendance.
2. **F-2.** Replace AD-3 `:102`'s "keeps its existing per-role assignment" with "the form's assignment rule is AD-4's; the Assistant's supervisor may be an Admin". Split `activePreacherResult` into a supervisor check (Admin or Preacher) for the Assistant path and a Preacher-only check for the Admin's picker.
3. **F-3.** Restrict AD-3 `:94` to app-level scope functions; say the RLS helpers resolve from `auth.uid()` and keep their signatures.

### P1 — same change, before the surfaces ship

4. **F-4.** "Grid writes" → "on create"; add the update-preserves test.
5. **F-5.** Declare the autodialer AD-3 assignable-set change in `supersedes` (or in AD-3 as a required sibling edit); correct the note's "behavior unchanged"; add the owner-in-set test.
6. **F-6.** Name the client DTO's retained fields (`role`, `name`, `email`, `hasActiveCallerProfile`) and add the "no `patchOwner` key" test.
7. **F-7.** Add `listCachedActiveSupervisors` as a sibling; keep `listCachedActivePreachers` for `/contact`; invalidate both cache tags; test the Admin's picker has no Admin.
8. **F-8.** Add audit shape (d) (`created_by` but not `preacher_id`, valid supervisor); add the s4/Preacher-supervised `/manage` fixture and record the expected count.
9. **F-9.** Name the UI strings (contact form notice, manage portal own-scope notice, dashboard notices, invite label, route errors); use `patchOwnerName`/`supervisorRole`, not `scope.role`, for the manage notice.
10. **F-10.** Add `/admin/:path*` to both app matchers (or record the gap and the invite consequence).
11. **F-11.** Rewrite the docs conflict table by artifact/line; correct the `docs/api-contracts.md:295` effect for Volunteers; add the `/manage` prose, `/volunteers` row, `/api/sessions` role lines and Staff Invites prose.
12. **F-12/F-13.** `apps/folk/app/campaigns/**`; rename `VOLUNTEER_INVITE_ROLES` or document its actual surface.
13. **F-14.** Trim the note's duplicated surface/predicate tables to a link; keep the why/conflicts/risks/file list.
14. **F-15/F-16.** Add the RLS run and `pnpm test:e2e:determinism` to the verification; name `session_visible` and the SQL callers of `sessions_visible`.
15. **F-17/F-18/F-19/F-20.** Correct the collector sentence; correct "follows the dashboard definition"; update the memlog; add the sibling edit to the definition of done.
16. **F-21.** Bring the Gita Life `?session=` check onto the session patch (not a location match) and state the Admin bypass in both attendance routes.

---

## 12. Bottom line

The revision is a real improvement and the six v2 findings are closed as stated. It is not yet sign-off clean: the null-patch invariant is not enforced in the RLS layer, the `/contact` sentence still tells a unit to keep the old Preacher-only behaviour, and the attendance-helper vector sentence tells a unit to do something the RLS helper cannot do. Those three are small, local fixes; the Medium items are the update-vs-create stamping, the autodialer AD-3 amendment, the client DTO field list and the audit's missing shape. Fix them and the spine is buildable in parallel without two units shipping different Admin or Assistant behaviour.

**Verdict: fail — changes required (narrow).**
