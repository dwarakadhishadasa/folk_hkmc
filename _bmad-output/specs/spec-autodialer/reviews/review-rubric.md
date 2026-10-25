# Rubric review — FOLK Autodialer architecture spine

- **Reviewer role:** rubric walker in the architecture-spine review gate. I did not edit the spine.
- **Target:** `ARCHITECTURE-SPINE.md` (AD-1 … AD-16), read against `SPEC.md`, `data-model.md`, `architecture.md`, and the repository working tree at `0b47ac1` (2026-10-25).
- **Method:** the eight-item checklist. Every brownfield claim was re-checked against code, not taken from the companion documents. The two-unit test was used only to confirm a checklist failure, not as the primary lens.
- **Verdict:** **fail — changes required.** The spine's bones are right: the paradigm, the single-door API, the generated status group, the one-transaction disposition and the refusal to add runtime are all correct. The failures are a handful of sentences and one scope decision (CAP-3), not a rewrite. Six findings block parallel build; the rest can be fixed during the first story if the spine carries the sentences.

---

## 1. Scorecard

| # | Checklist item | Verdict | Why |
|---|---|---|---|
| 1 | Fixes the real divergence points and misses none | **Fail** | Proxy matcher copies (B-5), API guard split (B-1), client/server type boundary (B-13), pager home (B-14), queue predicate (B-4), CAP-3 (B-6), operations (B-11). |
| 2 | Every AD's Rule is enforceable and prevents its stated divergence | **Fail** | AD-2 contradicts AD-7 (B-1); AD-3 cannot express its own scope (B-2); AD-5 leaves the RPC world-executable (B-3); AD-3 has no gate (B-12); AD-8's "before merge" gate is not enforced (m-4). |
| 3 | Nothing under Deferred could let two units diverge | **Fail (narrow)** | The CSV column contract is a live CAP-3 deliverable sitting under "Open —" (B-6); the phone-grid decision leaves the narrow-viewport state undefined (§6d). |
| 4 | Named technology is verified current | **Pass with notes** | Next 16.4.3 is current (23 Oct 2026), but the pin's security gap is unrecorded; Playwright/Tailwind entries are stale (B-18). |
| 5 | Ratifies rather than contradicts the brownfield codebase | **Pass with notes** | sw.js, authz names, RLS helpers, 202 envelope, pager, 1,030-row cap and `/manage` gap all check out. The proxy copies (B-5), `modules.dialer` (B-9), the delete FK mapping (B-7) and the Assistant/`/manage` gate (B-16) do not. |
| 6 | Covers every capability in the driving spec | **Fail** | CAP-3 import/export is bound but unbuilt and unarchitected (B-6); CAP-2's audience field is dropped (B-10); CAP-4's promoted role is undecided (B-15); CAP-8's export columns are unstated; CAP-9 is thin. |
| 7 | No AD weakens a spec constraint | **Pass with notes** | AD-11 drops CAP-2's target audience (B-10). Everything else tightens the spec rather than weakening it. |
| 8 | Every structural dimension is decided, deferred, or an open question — especially deployment, provider/infra, operations | **Fail** | Provider/infra is decided (AD-15). Deployment sequencing, rollback/disable, observability, audit, retention and timezone are absent (B-11). |

**Verdict: fail.** Not because the spine is wrong-headed, but because at least one lower-level unit following it literally would ship a Volunteer who cannot use their queue (B-1), an Assistant who can read the programme's reporting (B-2), a queue predicate that does not exist (B-4), or a matcher change that ships nothing (B-5).

---

## 2. Brownfield facts verified

| Claim | Verdict | Evidence |
|---|---|---|
| `proxy.ts` does not match `/manage` or `/api/manage` | True | `proxy.ts:9-20` |
| The matcher exists in **three** files | **Missed by the spine** | `proxy.ts:9`, `apps/folk/proxy.ts:9`, `apps/gita-life/proxy.ts:9`; the app copies are the ones Next loads |
| `sw.js` has two app copies and the queue paths | True | `apps/folk/public/sw.js:6-16`, `apps/gita-life/public/sw.js:6-16`; root `public/sw.js` is a third, byte-identical copy that ships nothing |
| `sw.js` drains only on `ok \|\| 409` | True | `apps/folk/public/sw.js:108` |
| `202 { success:false, queued:true, message }` | True | `apps/folk/public/sw.js:250-259` |
| `collectPagedRows` throws `manage_paging_truncated` | True (private, not exported) | `lib/supabase/manage.ts:203-225` |
| `AuthzError`, `authzErrorResponse`, `requireRole`, `getStaffContext` | True | `lib/authz.ts:36-64`, `:179`, `:206` |
| `assignedPreacherUserId` is optional and not required for Assistant | True | `lib/authz.ts:28-32` |
| RLS helpers `caller_role()` / `caller_program_id()` / `caller_assigned_preacher_id()` | True | `supabase/migrations/20261006010000_scoped_rls_policies.sql:41-141` |
| `contacts` has 24 columns and no dialer column | True | `lib/supabase/types.ts:144-169` |
| `set_updated_at()` exists | True | `supabase/migrations/20260504100000_create_staff_identity_bridge.sql:38` |
| `modules.dialer` exists | **False** — `modules` has five keys, none is `dialer` | `packages/program-config/src/types.ts:19-25`; `programs/folk.ts:16-22`; `programs/gita-life.ts:18-24` |
| `/manage` is Admin/Preacher only | True | `apps/folk/app/manage/page.tsx:26` |
| `/api/volunteers/invite` lets a Preacher create a Volunteer or Assistant | True — "staff creation stays Admin-only" is not the current rule | `apps/folk/app/api/volunteers/invite/route.ts:32,39-41` |
| `/manage` has contact create/update/delete, no CSV import/export | True | `apps/folk/app/api/manage/contacts/route.ts`; no `csv` match anywhere under `apps/`, `components/`, `lib/` or `scripts/` |
| Contact delete maps any FK violation to "attendance" | True — a single-cause message | `lib/supabase/manage.ts:1149-1156` |
| Manual-form pattern (`useState` + `fetch`) | True; only generated `components/ui/form.tsx` mentions RHF/zod | `components/manage/manage-contacts-table.tsx:697` |
| `writeAuditEvent` is the manage mutation convention | True | `lib/supabase/manage.ts:1046,1106,1165,1236` |
| `next.config.mjs` ignores build type errors; `pnpm test:static` / `guardrails` are the gates | True | `next.config.mjs:5`; `package.json:7,53` |
| Next 16.4.3 is current; 16.0.7 is the pin | True (23 Oct 2026) | endoflife.date / Next releases; `node_modules/next/package.json` |
| Playwright 1.62.0 / Tailwind 4.1.9 in the table | **Stale** — Playwright current is 1.64.1; Tailwind installed is 4.2.0, current 4.3.3 | `node_modules/@playwright/test/package.json`, `node_modules/tailwindcss/package.json` |

---

## 3. Blocking findings

### B-1 — AD-2 forbids the caller endpoints it promises (High)

**Where:** AD-2, `ARCHITECTURE-SPINE.md:79`; AD-1 `:73`; seed `:215`; AD-7 `:120`; AD-8 `:126`.

**The rule as written:** "`requireCampaignAdmin(staff)` … guards every Campaign page and `/api/dialer/**` handler except `/campaigns/assignments`."

`/campaigns/assignments` is a page path, not an API path. The API namespace contains the queue, disposition and history handlers (`/api/dialer/queue`, `/api/dialer/disposition`, `/api/dialer/history` — the seed names them). Under AD-2, all three require `["Admin","Preacher","Assistant"]`, so a Volunteer cannot save a disposition. AD-7 supplies `assertCallerAssignmentInScope` for exactly those reads and AD-8's sweep says "the owning caller succeeds", but neither amends AD-2's "every".

**Two lawful units.** Unit A implements AD-2 literally: a Volunteer's `POST /api/dialer/disposition` returns 403; the caller surface is read-only. Unit B reads AD-7 and exempts the caller endpoints — or, worse, reads "except `/campaigns/assignments`" as exempting the whole caller namespace. Both obey a sentence of the spine.

**Fix.** Replace the sentence with a route→guard table (or three bullets):

- Caller endpoints (`queue`, `disposition`, `history`; plus `recall` if it is a route rather than a client filter): `requireDialerCaller` + `assertCallerAssignmentInScope`.
- Admin endpoints (campaigns, callers, assign, reports, export): `requireCampaignAdmin` + `campaignScope`.
- No dialer endpoint is unauthenticated.

Name the exact caller endpoint list; AD-8's row then carries `{ route, method, actor: "owning-caller" | "admin" }`, which also closes the adversarial M-9.

---

### B-2 — AD-3 cannot express the scope it promises, and AD-5's null means "whole programme" (High)

**Where:** AD-3 `ARCHITECTURE-SPINE.md:85`; AD-5 `:108`; `lib/authz.ts:28-32`; `data-model.md:232`.

AD-3 returns `{ kind: "preacher", userId: staff.assignedPreacherUserId }` for an Assistant. `assignedPreacherUserId` is optional and is not required for the Assistant role. If it is `undefined`, the tagged union's `userId: string` is violated: the object does not typecheck as written, and the only implementations are a cast or a fallback. The fallback then meets AD-5's `scope_preacher_id uuid`: a uuid parameter has exactly one spelling for "program scope" — `NULL`. So an Assistant with no preacher link asks for their (empty) scope, the handler passes `null`, and `campaign_progress` returns the whole programme's funnel, outcome mix, per-caller leaderboard, recent activity and CSV. The RLS replica returns zero rows for the same staff member (`caller_assigned_preacher_id()` is NULL), so the app assertion and the RLS replica disagree — the exact divergence AD-3 says cannot happen.

**Two lawful units.** Unit A adds `if (!userId) return { kind: "program" }` to make the type total; Unit B implements the RPC's `NULL = program` as AD-5 says. Neither is disobedient; both leak.

**Fix.**

- Add `{ kind: "none" }` (and, for the session summary, `{ kind: "caller", callerId }`) to `campaignScope`.
- Change AD-5's signature to carry the tag, not a bare uuid: `campaign_progress(p_campaign_id uuid, p_scope_kind text, p_scope_user_id uuid, p_caller_id uuid)`; a `NULL` user id with `p_scope_kind = 'preacher'` must return zero rows, never all rows.
- Add the sentence: "An Assistant without an active assigned preacher resolves to zero rows, never to program scope."
- Add an e2e case: an Assistant with `assigned_preacher_id = NULL` sees no campaign counts.

This overlaps the adversarial R-1. It is still a rubric failure: AD-3 is not enforceable as written.

---

### B-3 — AD-5 leaves the reporting RPC executable by every authenticated user (High)

**Where:** AD-5 `ARCHITECTURE-SPINE.md:108`; AD-6 `:114`; `data-model.md:232`.

AD-6 is explicit: "`EXECUTE` is revoked from `PUBLIC`, `anon` and `authenticated` and granted to `service_role` only." AD-5 says only "granted to `service_role`". PostgreSQL grants `EXECUTE` on a new function to `PUBLIC` by default, and Supabase exposes public-schema functions through PostgREST. Without the revoke, any signed-in user (and `anon`, subject to grant) can call `campaign_progress(campaign_id, NULL)` and read the programme-wide numbers — or pass another preacher's id and read theirs. The argument is caller-controlled; the function is `SECURITY INVOKER` but runs with the caller's role, and the data-model grants `SELECT` on the dialer tables to `authenticated`. The recent-activity rows make this worse than aggregates if they carry contact identity.

**Two lawful units.** Unit A copies AD-6's revoke/grant; Unit B reads AD-5's "granted to service_role" as sufficient and leaves the default PUBLIC grant. Both match a sentence; B is a cross-scope read.

**Fix.** Copy AD-6's exact sentence into AD-5: `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role;` and pin `SET search_path = public, pg_temp` on both new functions (the existing helpers do; the spine is silent). Add a gate: `authenticated` and `anon` receive 404/permission denied from both RPCs.

---

### B-4 — AD-12's queue predicate names a column that does not exist, and its status rule kills deferrals (High)

**Where:** AD-12 `ARCHITECTURE-SPINE.md:150`; `data-model.md:90-112` (assignments), `:126` (`next_call_date`), `:224` (queue predicate).

Two defects in one sentence:

1. **Wrong table.** "The queue offers `PENDING` assignments on `ACTIVE` campaigns whose `next_call_date` is null or due." `dialer_assignments` has no `next_call_date`; `next_call_date` is a `dialer_call_logs` column. The data-model repeats the error at `:224`. A literal implementer adds the column to assignments (schema drift, and no write path sets it); a correcting implementer joins the latest call log (right, but the spine does not say which log, or how a never-called assignment behaves).
2. **Deferrals never return.** AD-12 says "a saved disposition sets the assignment `COMPLETED`" and the queue offers only `PENDING`. The disposition form captures `next_call_date` for `CALL_ME_BACK`, `OUT_OF_STATION` and the `WILL_COME_*` statuses; the data-model says "deferrals are served by `next_call_date`". But a `COMPLETED` assignment is never offered, and recall handles only `NOT_REACHABLE`. So "call me back on Friday" is recorded and lost. That weakens CAP-2's survey and the data-model's own deferral model.

**Two lawful units.** Unit A adds an assignment-level due date; Unit B joins the last log but keeps `COMPLETED`, so deferrals stay dead. Both can cite a sentence.

**Fix.** State the exact predicate and the status model, for example: "The queue offers assignments with `status = 'PENDING'` whose campaign is `ACTIVE` and whose latest call log has `next_call_date IS NULL OR next_call_date <= current_date`; a saved disposition with a `next_call_date` leaves/sets the assignment `PENDING` (not `COMPLETED`), and `COMPLETED` is reserved for dispositions without a due date. Recall sets `PENDING` only when the latest log's `status_group = 'NOT_REACHABLE'` and the attempt count is below `max_attempts`." Also decide the cross-campaign order (`campaign_date`, `sort_order`, assignment id) — the campaign-switch notice depends on it.

The adversarial R-2 covers the `attempt` half of the same seam; this is the queue/status half.

---

### B-5 — AD-1's proxy sentence is the same three-file trap it fixed for `sw.js` (High)

**Where:** AD-1 `ARCHITECTURE-SPINE.md:73`; seed `:212-223`; `proxy.ts:9-20`; `apps/folk/proxy.ts:9-20`; `apps/gita-life/proxy.ts:9-20`.

AD-1 says "`proxy.ts` matches `/campaigns/:path*` and `/api/dialer/:path*`". There are three matcher arrays. The root `proxy.ts` and the two app-level files are separate copies; Next loads the app-level one. AD-1 and AD-10 correctly name both `apps/*/public/sw.js` copies because a root-only sw edit ships nothing — the proxy has the identical trap and the spine does not name the copies. The structural seed lists `public/sw.js` but not a proxy file; the conventions say "`proxy.ts`" singular.

**Two lawful units.** Unit A edits the root `proxy.ts` (all tests on the app still pass; the new routes simply never refresh the session, so a stale cookie produces intermittent 401s and a "Save failed — session paused" mid-campaign). Unit B edits `apps/folk/proxy.ts` (works). Both claim AD-1 compliance.

**Fix.** "Add `/campaigns/:path*` and `/api/dialer/:path*` to the matcher in `apps/folk/proxy.ts` and `apps/gita-life/proxy.ts`; keep the root `proxy.ts` matcher in sync (it is not the file Next loads)." Add `proxy.ts` + both app copies to the seed and the attachment table. The SPEC's constraint ("add … to the matcher in `proxy.ts`") should be corrected at the same time.

---

### B-6 — CAP-3 is bound, but its import/export is unbuilt and unarchitected (High)

**Where:** SPEC `:37-39` (CAP-3) and `:116` (success signal); AD-13 `:156`; Deferred `:313`.

CAP-3 requires adding contacts individually, importing a batch, and exporting the list. The repo has create/update/delete (`apps/folk/app/api/manage/contacts/route.ts`, `lib/supabase/manage.ts:1073,1133`) but **no CSV import or export anywhere** — no `csv` match in `apps/`, `components/`, `lib/` or `scripts/`; `/manage` has no import/export route or control. AD-13 says "Contact create, import and export stay in `/manage`" (present tense, as if they exist), and the CSV column contract is "Open —" under Deferred. The success signal explicitly depends on "imports 30 contacts". So a bound capability is neither covered nor explicitly scoped out with a dependency; the one decision it needs (the column contract) is deferred, and the two units that build import and export can choose different column sets, duplicate rules and error envelopes.

**Two lawful units.** Unit A builds a client-side parser that POSTs rows one at a time (per-row success/failure in the browser). Unit B builds a server route with multipart CSV, an all-or-nothing transaction and a different duplicate rule (phone vs email). Both satisfy "import is duplicate-safe and reports per-row success and failure"; neither can be reconciled with the other's export.

**Fix.** Choose one:

- **(a) Scope it out explicitly:** CAP-3's import/export is a Manage-contacts dependency, not this feature. Name the owner, state that it does not exist today, and amend the success signal to use seeded contacts. Then remove CAP-3 from `binds` or narrow it to "the contact universe is the existing `contacts` table".
- **(b) Architect it:** one `/api/manage/contacts/import` + `/export` route, the CSV header contract, the duplicate key (phone? email? both), the 500-row batch behaviour, the per-row result envelope, the file-size/encoding rules, and the `/manage` UI attachment (Admin/Preacher gate). AD-13's "export uses the same column set" then becomes a testable rule.

This is the largest coverage failure: it is the only capability where the spec's demonstration script has a step the spine does not own.

---

## 4. Findings to fix before build (B-7 … B-18)

### B-7 — AD-12's `ON DELETE RESTRICT` collides with the existing delete error mapping (Medium-High)

AD-12 says a contact with dialer history "cannot be deleted through `/manage`". It will be refused, but with the wrong reason: `deleteManageContact` maps **any** `PG_FOREIGN_KEY_VIOLATION` to `manage_contact_has_attendance` and "This contact has attendance recorded against it and cannot be deleted" (`lib/supabase/manage.ts:1149-1156`). A dialer assignment produces the same SQLSTATE, so the operator is told attendance is the blocker. The spine also bans dialer logic in `components/manage/**`, so no one owns the new message. Decide the disambiguation (constraint name from the PostgREST error details, or a pre-check) and the message, and note the changed behaviour in `/manage`'s contract. Otherwise every dialer contact's delete is a support ticket with a false explanation.

### B-8 — AD-10 has no terminal-failure path for a queued disposition (Medium-High)

`sw.js` removes a queued request only on `ok || 409` (`apps/folk/public/sw.js:108`). A replay that returns 400/403/422 is retried forever, never removed and never surfaced. AD-10 promises "`Queued — will send`" and AD-5 says a queued disposition is not counted until it lands — but nothing decides what happens when it can never land: a caller deactivated mid-session, a campaign cancelled, an assignment reassigned, a revoked session or a malformed payload. The caller sees a success receipt and moves on; the data sits in IndexedDB; the funnel never counts it. This is a CAP-7 "never loses data" weakening, even though the bytes are technically in the queue.

**Fix.** Define the terminal contract: the endpoint returns a terminal code for payloads that can never land (e.g. `409 { terminal: true }` or `422`), `sw.js` removes terminal failures and records them, and the app surfaces a "not saved" list (or a server reconciliation read on the next session). Also state the SW-controlled precondition for the 202: a first visit with no active worker produces a network error, not a queue.

### B-9 — `modules.dialer` does not exist; the spine treats it as inherited (Medium)

`packages/program-config/src/types.ts:19-25` has `publicRegistration`, `publicAttendance`, `staffContacts`, `sessions`, `staffInvites` — no `dialer`. Both program profiles have the same five. AD-2 and AD-14 use `modules.dialer` as if it exists; `architecture.md` §3 row 7 correctly says to add `dialer: boolean` to the type and both profiles, but the spine (the binding contract) never names the file and the seed omits `packages/program-config`. A unit that only reads the spine will add the header condition against an absent key (type error) or cast around it; the gita-life header then renders a Campaign item linking to a route that does not exist. Add the type + both profiles to the seed and attachments; state `dialer: false` hides the item only; add a gita-life header test.

### B-10 — AD-11 drops CAP-2's target audience without saying so (Medium)

CAP-2 says an admin creates a campaign "with a name, date, target audience and per-campaign gap timing". AD-11 says "a campaign's target audience is a selection-time facet over `dialer_contact_profiles`; no `audience_filter` is stored". `data-model.md:56` omits the column but `:67` says the target-audience control "remains required by CAP-2" — so the create form has a control that persists nothing. This is a direct spec weakening disguised as a source-app cleanup. Decide: either store the campaign's audience facet (and where), or explicitly supersede CAP-2's create-time field in the SPEC's "Decided" list and remove the control from create. The source app's never-applied column is a good reason to omit a column; it is not a reason to leave a control that lies.

### B-11 — The operational/environmental envelope is incomplete (Medium)

AD-15 and the environment table decide the provider and infrastructure story: existing Next.js, Supabase, no cron/worker/telephony. That is the right call. They do not decide:

- **Migration deployment:** who applies the dialer migration to the hosted Supabase project, in what order relative to the app deploy, and how `lib/supabase/types.ts` is regenerated against the hosted schema. Local uses `supabase:push`; production is owner-controlled, but the feature still needs a named path and a pre-deploy order (migration → types → app).
- **Rollback/disable:** there is no kill switch; `modules.dialer` is presentation-only by design. If the feature misbehaves, the only remedy is a deploy revert (and the tables remain). State that, or add a disable path.
- **Observability:** no decision on logging a failed disposition, a 5xx, a permanent SW replay failure, or the `campaign_progress` error. The repo has no metrics/alerting; "use the Vercel/Next console" is a decision the spine can state.
- **Audit:** `writeAuditEvent` is the manage convention (`lib/supabase/manage.ts:1046,1106,1165,1236`). The spine defers only "campaign and survey edits"; it is silent on caller promote/deactivate and batch assignment, which are staff-data mutations. Say which admin mutations audit, or that none do.
- **Retention/privacy:** call logs, notes and contact history are retained indefinitely; there is no deletion path for a call log, and the reporting CSV is the only export. For a calling product holding ~1,030 members' phone numbers, this deserves a line, even if the line is "inherited: no retention policy in v1".
- **Timezone:** the repo already has an `Asia/Kolkata` convention in `lib/supabase/manage.ts` (`MANAGE_TIME_ZONE`). `campaign_date`, `next_call_date`, "due", "today" and recent-activity boundaries are undefined. A server running UTC and a client in IST will disagree about what is due. Name the timezone.
- **Rate limiting:** `/api/dialer/disposition` is idempotent but unthrottled. If that is acceptable, say so.

Also, the table says "e2e is loopback-only", but `pnpm test:offline-queue` drives the frozen `sw.js` against a hosted URL (`scripts/verify-pwa-offline-queue.mjs:61` defaults to `https://folk-hkmc-rho.vercel.app`), and AD-10 changes that file. The spine should name this gate and its target, since it is the only behavioural check of the SW change and it is not loopback.

Item 8 of the rubric is explicitly about this envelope; "no new infrastructure" answers provider/infra but not deployment or operations.

### B-12 — AD-3 has no mechanical gate, unlike AD-7/AD-8 (Medium)

AD-3 says "No page, handler or export invents its own filter." AD-8's guardrail enumerates only API route files; a new page or export can add `.eq("assigned_preacher_id", …)` (or forget the predicate entirely) and pass every gate. The service-role client bypasses RLS, so AD-3's app assertion is the only boundary. The spine's own thesis — "route coverage is a guardrail, not a memory" — applies here. Add a static check (`scripts/verify-dialer-scope.mjs`: no `assigned_preacher_id` / contact-scope predicate outside `lib/dialer/scope.ts`) or a typed `scopeContacts(query, scope)` accessor that is the only way to build a contact query. Add one cross-preacher e2e case for the campaign table and CSV.

### B-13 — The client/server type boundary is undecided (Medium)

The paradigm says "`lib/dialer/**` — scope assertions, request handlers, reporting. Server-only." The conventions put "one hand-written union in `lib/dialer/types.ts`" and list four server modules with `import "server-only"`. A client component that needs `DispositionStatus` or the queue DTO cannot import a server-only module; if `types.ts` is exempt, the "lib/dialer is server-only" rule has an unstated exception. The repo's browser-safe DTO home is `@hkmc/data-contracts` (AGENTS.md), and the spine never mentions it. Two units: one puts the union in `@hkmc/data-contracts`, one in `lib/dialer/types.ts` and casts; the queue payload type diverges. Name the client-safe module (`@hkmc/data-contracts` or `lib/dialer/contracts.ts` with no `server-only`), the DTO shapes, and the rule that `@hkmc/data-contracts` imports nothing server-only.

### B-14 — AD-16's "one shared pager" has no home (Medium)

`collectPagedRows` is private in `lib/supabase/manage.ts:203-225`. AD-16 says "extracted … one shared pager" but not where. Exporting it from `manage.ts` makes the dialer depend on the manage domain; copying it restores the divergence AD-16 exists to prevent. Name the module (`lib/supabase/paging.ts` or `lib/supabase/collect-paged-rows.ts`), move manage to it in the same commit, and add a test for the truncation throw. Also say that the pager applies to PostgREST reads only — `campaign_progress` returns lists from SQL, where `.range()` cannot apply (adversarial M-7).

### B-15 — The promoted caller's role is undecided (Medium)

CAP-4 says an admin turns a staff member into a caller by promoting a contact with an email or inviting directly. A caller is `public.users` + `dialer_callers`; the `users.role` decides whether the new caller gets the admin Campaign surface (`requireCampaignAdmin`) or only the caller session. The existing paths accept different roles: `/api/admin/invite-user` accepts all four; `/api/volunteers/invite` accepts Volunteer/Assistant and is Admin/Preacher. AD-13 does not say what role a promoted contact gets. Two units: one defaults to Volunteer (least privilege), one reuses the contact's/administrator's choice and mints a Preacher. State the default and the rule: promotion mints `Volunteer`; an admin role is only through `/admin/invite`; the picker cannot mint an Admin.

### B-16 — `/manage` is Admin/Preacher, so the Assistant's CAP-3 path is closed (Medium)

`apps/folk/app/manage/page.tsx:26` gates `/manage` to `["Admin","Preacher"]`. AD-2 gives an Assistant every Campaign route; AD-13 routes contact create/import/export and the "wrong number is corrected through contacts" path to `/manage`. An Assistant can assign contacts but cannot correct a wrong number or import. The spine's capability map does not note the dead end. State the consequence and the Assistant's path ("ask a Preacher/Admin"), narrow the Assistant's Campaign grant, or widen `/manage` (out of scope). This is a product decision the spine currently makes by accident.

### B-17 — The header item dead-ends for a Volunteer without a caller row (Medium)

AD-2 renders the Campaign item for **every** signed-in staff member; a Volunteer without an active `dialer_callers` row reaches `/campaigns/assignments`, which calls `requireDialerCaller` and refuses. CAP-9's "lands on a working call list" fails with a 403 page. The header predicate and the route predicate are not the same predicate, despite AD-2's "built from the same predicate" claim. Render the Volunteer item only for an active caller, or render the empty state "ask an admin to make you a caller" instead of a 403. This is the Volunteer mirror of adversarial M-5 (the admin-without-caller Assignments item).

### B-18 — The Stack table mixes pins with "current" (Low)

Rubric item 4 asks for verified currency; the table is accurate as a set of pins but not as a currency statement.

- **Next.js 16.0.7** is the pin; 16.4.3 is current (23 Oct 2026). The spine records the gap and "upgrade out of scope" but not the security consequence: 16.4.1 (14 Oct 2026) carries two critical security fixes (one in `use cache`, one in Image Optimization), and 16.0.x predates that release. Record the exposure and the owner decision, or make the upgrade an explicit follow-up.
- **Playwright 1.62.0** is the pin; 1.64.1 is current (14 Oct 2026).
- **Tailwind CSS 4.1.9** is the manifest floor; the installed version is 4.2.0 and 4.3.3 is current.

Verified correct: React 19.2.0, TypeScript 5.7.3, Turborepo 2.9.18, pnpm 10.33.0, PostgreSQL 17 (`supabase/config.toml:36`), Supabase CLI 2.98.2. The fix is a "pin" column and a "current (date)" column; the Next line also needs the security note.

---

## 5. Minor findings

| # | Finding | Fix |
|---|---|---|
| m-1 | AD-6's "a replay that finds the row returns 200" accepts a **different** payload (second tab, edited answers) and tells the caller "Saved" while dropping the answers. The `BroadcastChannel` lock is courtesy only; AD-9 says the unique key is the guarantee. | Decide: 200 only when the stored payload matches, else `409` with `applied:false`; or make the write an overwrite in the same transaction. The unique key must tell the truth. |
| m-2 | AD-11's batch write does not reject an inactive caller or a non-`ACTIVE`/cancelled campaign. CAP-4 says an inactive caller disappears from pickers; the server has no matching rule. | Add: "the assign write rejects an inactive caller and a campaign that is not `ACTIVE`; the picker's filter is a convenience, not the gate." |
| m-3 | AD-5's "recent-activity rows" has no limit; the RPC bypasses AD-16's pager. | Add `LIMIT n` ("recent" = last 20 by `called_at desc`) and say the rollup is bounded. |
| m-4 | AD-8's "the behavioural sweep is a `pnpm test:e2e` gate before merge" is not enforced anywhere; the PR workflow runs guardrails, typecheck, build and lint, not e2e. | Require the PR description to record the sweep run (a checklist line), or add a targeted e2e step to the PR workflow. The AD's own rationale already admits CI cannot see it. |
| m-5 | AD-2's Assignments sub-nav item renders for an admin with no caller row and dead-ends at `requireDialerCaller`. (Adversarial M-5.) | Render it only for an active `dialer_callers` row. |
| m-6 | The tests convention omits `pnpm test:e2e:determinism` after specs/fixtures and the full `pnpm test:e2e` for `components/header.tsx` (testing policy §5). The denial sweep file is `dialer-route-sweep.spec.ts` in the seed but the convention says `campaign-*.spec.ts`. | Add the two commands and pick one sweep filename. |
| m-7 | `campaign_progress` and `record_call_disposition` do not pin `search_path`; the existing helpers do. | Add `SET search_path = public, pg_temp`. |
| m-8 | AD-10's Prevents bullet says "the dialer queue capturing attendance, registration or contact traffic"; the SW has one shared store, so it already holds those paths. The rule is path membership, not capture. | Reword to "the dialer path must not be added to the existing queue's *handlers*; it is a new `QUEUED_POST_PATHS` member, not a new store." |
| m-9 | AD-12's queue ordering (`sort_order`, campaign priority) is unowned, yet the campaign-switch notice depends on it. | Fold into B-4's predicate. |
| m-10 | The `status_group` `CASE` has no stated totality/`NOT NULL`; a new chip without a mapping would count as reached. (Adversarial M-1.) | Total `CASE`, `NOT NULL`, and a check that 13 statuses map to 6 groups. |
| m-11 | The convention "`updated_at` via `set_updated_at()`" is stated for dialer tables, but `dialer_call_logs` has no `updated_at`. (Adversarial M-2.) | Exempt the log. |
| m-12 | AD-12's "recall returns only `NOT_REACHABLE` assignments to `PENDING`" — `NOT_REACHABLE` is a `status_group`, not an assignment status. | Say "assignments whose latest call log has `status_group = 'NOT_REACHABLE'`." |
| m-13 | The environment table duplicates README/AGENTS; it is maintenance prose in the contract. | Keep the commands that differ (local ports, `seed:local`), link the rest. |

---

## 6. AD hygiene

### 6a. ADs that restate each other

| Repetition | Locations | Recommendation |
|---|---|---|
| "Reached = group not `NOT_REACHABLE`/`WRONG_NUMBER`" | AD-4 `:102`, AD-5 `:108` | Own it in AD-4; AD-5 references it. |
| Idempotency on `(assignment_id, attempt)` | AD-6 `:114`, AD-9 `:132`, AD-10 `:138` | Own the key and the replay semantics in AD-6; AD-9/AD-10 state only their consequence. |
| Choice question with no options / `is_required` | AD-6 `:114`, AD-12 `:150` | AD-12 should say "validation is AD-6's", not restate it. |
| Contact scope / no Volunteer term / program assertion | AD-3 `:85`, AD-13 `:156`, AD-14 `:162` | AD-3 owns the scope; AD-13 owns the contacts policy; AD-14 owns the program/route absence. |
| Nav and role routing | AD-1 `:73`, AD-2 `:79` | AD-1 owns the route tree; AD-2 owns the roles and the header predicate. |

### 6b. ADs that are really conventions

| AD | Why | Where it belongs |
|---|---|---|
| AD-16 paging | A shared-helper rule, not an architectural choice. It prevents a real defect, so it can stay as an AD, but its home is one row in the conventions table (`All dialer lists use lib/supabase/paging.ts; a bare .range() loop is a defect`) plus the guardrail. | Conventions |
| AD-2's header/sub-nav copy | The role gate is the AD; the exact hrefs, the "single header item feeds desktop and bottom nav", and the sub-nav contents are UX/design detail. | ux-flows / design-coverage |
| AD-9's pause/skip/campaign-switch/gap UI | The architectural decision is "no server session; unique key is the guarantee". Pause, Skip, the awaited notice, the receipt and "no desktop layout" are behaviour specs. | ux-flows |
| AD-14's "every handler asserts the program" | A restatement of the AD-3/AD-7 pattern; it cannot be independently enforced or tested. | AD-3/AD-7 |
| AD-12's "the survey builder ships" | A capability decision (SPEC "Decided"), not an architecture rule. | SPEC |

### 6c. Prose that belongs in the memlog

| Location | Prose | Why |
|---|---|---|
| AD-11 `:144` | "because the source stored one and never applied it" | Source-app rationale; the rule is "no `audience_filter`". Memlog/architecture. |
| AD-12 `:150` | "because the cascade would destroy the calls" | Rationale for `RESTRICT`; the rule is the FK action. Memlog. |
| AD-13 `:156` | "Import is duplicate-safe and reports per-row success and failure; export uses the same column set" | CAP-3 acceptance criteria, not an architecture rule; it also promises a capability that does not exist (B-6). SPEC. |
| AD-15 `:168` | "Credentials are read only through a server-only module modelled on `lib/supabase/env.ts`" | There are no credentials in v1 (no provider, no CAP-10). This is v2 prose. Memlog. |
| AD-5 `:108` | "a stalled volunteer looking like bad luck" | Narrative rationale copied from the data-model. Memlog. |
| Environment table `:272-278` | Local/preview/production commands | Duplicates README/AGENTS; keep only the deltas. |
| AD-10 `:138` | "No app-shell offline behaviour is promised: the tab must already be open." | A real product-scope rule, but it is duplicated by Deferred "App-shell offline" (`:300`); keep one statement and cross-reference. |

AD-13's other rationale clause — "a `users` row without a matching `auth.users` row cannot sign in, so no bare-row path exists" — is not merely prose: the promote path creates exactly that row (adversarial M-8). Fix the rule, not just the wording. It is listed here because the sentence is doing rationale work; the substantive defect is M-8.

### 6d. Deferred section problems

- **Duplicated:** CAP-10 typed tools appears at `:297` and again at `:312` ("No dynamic SQL, ever"). "App-shell offline" (`:300`) and "No native client" (`:308`) restate SPEC non-goals. "The Flutter autodialer is untouched" (`:311`) and "No call recording…" (`:310`) are SPEC constraints/non-goals, not deferrals. Collapse each to one line and move constraints to the SPEC section they belong to.
- **Open questions in the wrong section:** `:313` (CSV column contract) and `:314` (create/edit URL) are open questions, not deferrals. Split the section, as the SPEC does.
- **A decision, not a deferral:** `:302` ("Phone admin contact grid — assignment stays desktop-only"). It also leaves the narrow-viewport state of `/campaigns/[campaignId]/assign-contacts` undefined: a 404, a hidden nav entry, or an "open on desktop" notice. Two units will choose differently. Decide the state in AD-1 or the conventions.
- **The CSV contract is a live CAP-3 deliverable**, not a Manage "detail" — see B-6.

### 6e. Dead or unowned rules

- **AD-3's RLS replica.** "The dialer RLS policies replicate the same predicate as defence-in-depth for authenticated reads." Every dialer read is service-role (AD-7, AD-13); the authenticated policies have no consumer and no test, so "mirrors" is unverifiable and can drift. Either add a policy-level test (sign in as each role and query the table directly) or say "authenticated has no `SELECT` grant on dialer tables" — the data-model currently grants `SELECT`, so this is an open choice, not a ratified one.
- **AD-8's sweep rows.** The static check enumerates route files, not method exports; one file with `GET` and `POST` passes with one row (adversarial M-9). Say "enumerate exported methods".
- **AD-16's "a bare `.range()` loop is a defect"** has no detector. If the pager is mandatory, a guardrail should find `.range(` outside the pager, or the rule is review-only.

---

## 7. What the spine gets right

These should survive the fixes; they are the reason the verdict is "fix", not "rewrite":

- **The paradigm and the dependency rule.** "Pages and route handlers import `lib/dialer`; `lib/dialer` imports `lib/authz`/`lib/supabase`; never the reverse; a client component calls a route handler" is exactly the repo's existing server-only boundary, stated in one place.
- **AD-4's generated `status_group`.** One stored chip, one generated bucket, six groups, `WRONG_NUMBER` separate. This is the correct fix for the source's two disagreeing mappings; do not let a tightening turn it into a view or a client-side map.
- **AD-6's `SECURITY INVOKER` + revoke/grant.** The right shape for a service-role-only RPC. AD-5 should copy it (B-3).
- **AD-7's scope assertion.** It mirrors `assertManageContactInScope`, returns `403`/`404` and never a row, never takes the caller id from the payload, and checks `is_active` on the write path. This is the security boundary, correctly located in one helper.
- **AD-11's no-weights table and the `(contact_id, campaign_id)` unique key.** "Assignment is a move" is the right reconciliation of the source's three-column key, and the pre-check/one-transaction write is the right shape for CAP-5.
- **AD-12's cancel/retire and `ON DELETE RESTRICT`.** The principle is correct; only the delete *message* (B-7) and the queue predicate (B-4) need work.
- **AD-13's no new `contacts` columns.** The four `dialer_contact_profiles` fields are the right enrichment boundary; dropping the source's speculative columns is right.
- **AD-15's no new runtime.** The strongest operational decision in the spine: no cron, queue worker, telephony provider or external API. It is also true to the repo (no cron, no worker, no queue).
- **AD-8's two-gate shape.** A static check inside `pnpm guardrails` (CI-visible) plus an e2e denial sweep (pre-merge) is the right split for a repo whose CI does not run e2e. The row schema needs M-9, not the mechanism.
- **The `202` envelope.** It matches `sw.js` exactly (`success:false, queued:true, message`), and "queued is a success state" is correctly load-bearing.
- **The paging decision.** ~1,030 contacts against PostgREST's 1,000-row cap, with a throw on truncation, is the right inherited pattern.
- **The route tree and API namespace.** `/campaigns/**` for the browser, `/api/dialer/**` for the API, `/campaigns/assignments` for the caller. The split is coherent and matches the SPEC.
- **The environment table's local commands** (`pnpm dev:local`, `supabase:push`, `seed:local`, Mailpit) match `package.json`.

---

## 8. AD → findings map

| AD | Findings |
|---|---|
| AD-1 | B-5, B-17 |
| AD-2 | B-1, B-9, B-16, B-17, m-5 |
| AD-3 | B-2, B-12, §6e (RLS replica) |
| AD-4 | m-10 |
| AD-5 | B-2, B-3, m-3, m-7 |
| AD-6 | m-1, m-7 |
| AD-7 | B-1 |
| AD-8 | m-4, adversarial M-9 (row shape) |
| AD-9 | m-9 |
| AD-10 | B-8, m-8 |
| AD-11 | B-10, m-2 |
| AD-12 | B-4, B-7 |
| AD-13 | B-6, B-15, B-16 |
| AD-14 | B-9 |
| AD-15 | B-11 |
| AD-16 | B-14, m-3 |
| Deferred | B-6, §6d |

---

## 9. Gate

**Do not open parallel build on B-1 … B-6.** Each is one paragraph or one scope decision, and each closes a seam that otherwise produces a broken caller surface (B-1), a cross-scope read (B-2, B-3), a queue that cannot be implemented as written (B-4), a matcher edit that ships nothing (B-5), or a demonstration step the spine does not own (B-6).

B-7 … B-18 and the minor findings can be fixed during the first story **if** the spine carries the sentences; they are not reasons to hold the whole feature, but they are reasons not to hand the spine to a unit that reads only the ADs.

This review is independent of, and does not supersede, `review-adversarial.md`. Its R-1 (scope encoding), R-2 (`attempt` ownership), R-4 (refusal codes / SW), R-5 (assignment status writers), M-5 (Assignments dead-end) and M-9 (sweep row schema) still bind; B-1, B-2, B-3 and B-8 above are the rubric-walker's overlapping-but-distinct versions of the same seams. Fix both sets in one pass, then re-run the rubric and the adversarial pairs.

**Verdict: fail — changes required.**
