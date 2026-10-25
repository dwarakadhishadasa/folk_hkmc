# Security & data-integrity review — FOLK Autodialer architecture spine

**Reviewer role:** security / data-integrity reviewer, architecture-spine gate
**Date:** 2026-10-25
**Subject:** `ARCHITECTURE-SPINE.md` (status: draft) and `data-model.md`
**Data in scope:** ~1,030 members' phone numbers, call outcomes, free-text notes, survey answers
**Spine edits made by me:** none. This document is advisory.

---

## Verdict

**Request changes — do not accept the spine as a build substrate yet.**

The boundary is directionally right and unusually well reasoned (AD-7, AD-8 and the `architecture.md` §2a self-critique are better than most spines). But five rules the spine relies on have no enforcement point in the design, and two of them are reachable by a normal operator, not an attacker:

1. a caller deactivated in the dialer roster can keep writing dispositions;
2. a disposition can be silently lost while the caller sees a success receipt;
3. deleting a caller row destroys their call history;
4. assigning a contact is an unchecked grant of read access to that contact's phone number, across preacher boundaries;
5. every scope predicate is a nullable value with no fail-closed rule, in code and in SQL.

Each is fixable with a sentence in the spine plus a check in the migration or a gate. None requires a redesign. The two "replay" and "assignment" findings (H2, H4) change behaviour a developer would otherwise implement literally from `data-model.md`, so they should be settled before build, not during.

What is sound and should **not** be changed: service-role-only writes; the denial sweep plus static route-coverage guardrail (AD-8); `program_id` from `getStaffContext()`; campaign `CANCEL` instead of delete; `(contact_id, campaign_id)` assignment uniqueness; the generated `status_group`; the attempt cap; skip/recall semantics; single-transaction disposition.

---

## Evidence base

| Read | What it establishes |
|---|---|
| `ARCHITECTURE-SPINE.md` AD-1…AD-16 | The rules under review |
| `data-model.md` | Column-level claims, FK actions, RPC contract, RLS table |
| `lib/authz.ts` | `getStaffContext()` re-reads `public.users` per request; non-`Active` throws 403 (`:108-114`, `:140-155`). `staff.userId === staff.supabaseUserId === public.users.id` (`:121-132`) |
| `lib/supabase/manage.ts` | `collectPagedRows` (`:203-225`); `assertManageContactInScope` 403/404 probe (`:752-789`); contact delete + error mapping (`:1133-1176`) |
| `supabase/migrations/20261006010000_scoped_rls_policies.sql` | `contacts` RLS grants a **Volunteer zero rows** (`:173-182`); helpers are `SECURITY DEFINER` over `public.users` |
| `apps/folk/public/sw.js` | Exact-path `QUEUED_POST_PATHS` (`:6`); drain treats `ok \|\| 409` as synced (`:96-119`); queue keeps everything else forever; queue payload stores the raw body in IndexedDB (`:53-63`, `:242-266`); no clear-on-signout anywhere in the repo |
| `proxy.ts` (`:9-19`), `scripts/verify-*.mjs` | Existing matcher pattern; the offline-queue, RLS and guardrail gates the feature must extend |

No dialer code exists yet (`grep -rn dialer apps lib components supabase` → nothing), so this is a design review, not a code review. Line references below are to the documents as read.

---

## Findings

### H1 — `dialer_callers.is_active` is asserted as enforced but has no enforcement point (High)

**Rule claimed.** AD-2 `requireDialerCaller` "refuses an inactive caller"; AD-7 "`dialer_callers.is_active` is checked on the write path, not only in the assign picker" (`:120`); `architecture.md:56` repeats it as rule 4.

**Why it does not hold.** The only mechanism named is `requireDialerCaller`, which AD-2 attaches to the `/campaigns/assignments` **page** (`:79`). The write path is `/api/dialer/disposition` → `assertCallerAssignmentInScope`, and AD-7 specifies that helper as "resolves `dialer_assignments → dialer_callers` by `user_id` and `program_id`, returns the scope row or throws". `is_active` is not in that definition. AD-6 then says the RPC asserts only that the assignment "belongs to the caller's own program" (`data-model.md:216`) and the caller id comes from `getStaffContext()`. That is `public.users.status`, a different switch — `lib/authz.ts:112` blocks a suspended staff user, and it genuinely does so on every request, but it is blind to the dialer roster flag. So: deactivate a caller in `/campaigns/callers` while their staff row is still `Active`, and every disposition endpoint whose handler omits the flag check keeps accepting writes. Nothing in AD-8's sweep would catch it — the owning-caller case would still be the *active* fixture.

**Required change.** (a) Make `is_active` part of `assertCallerAssignmentInScope`'s contract, not a separate page gate. (b) Re-check it inside `record_call_disposition` against `p_caller_id`, so the revocation is transactional and cannot be bypassed by any future handler. (c) Add a denial-sweep row: caller is inactive, request is otherwise valid → `403`, no row written. Note this is exactly the source app's failure (`architecture.md:56`) reproduced one layer down.

---

### H2 — Replay semantics are contradictory, and a lost disposition looks saved (High)

Three separate defects converge:

**H2a — "idempotent overwrite" is the wrong invariant.** AD-6 says the write is "idempotent on `(assignment_id, attempt)`" and "a replay that finds the row returns `200`; `called_at` … never updated" (`:114`). `data-model.md:138` says the unique key "makes a duplicate write from a second tab an **idempotent overwrite** rather than a second record". Those are two different behaviours — `ON CONFLICT DO NOTHING` and `DO UPDATE` — and neither is stated. Both are dangerous in different ways:

- `DO UPDATE`: a stale tab, a second device, or a replay of an old queued body silently rewrites a landed `disposition_status` and its survey answers. An append-only call record is no longer append-only. A caller can also rewrite their own history by replaying `attempt=1`.
- `DO NOTHING` + `200`: the second tab's answers are discarded while the UI shows `Saved`. The caller believes a `CONFIRMED` was recorded; the row says `NOT_INTERESTED` from the first tab. This is silent data loss with a success receipt.

**Required change.** State the rule explicitly: **a landed disposition is immutable.** A replay of an existing `(assignment_id, attempt)` returns `200` with the stored row and changes nothing — no status, no notes, no responses, no `called_at`. If the replayed payload differs from what is stored, that is a **conflict**, not a success: return `409` with a machine-readable `code` and have the client show the named blocking state. Today `called_at` is the only column protected; that is not enough.

**H2b — `409` is overloaded, and `sw.js` treats it as success.** AD-10 says "`sw.js` drains on `ok || 409`" (`:138`), and the existing worker does exactly that (`sw.js:108`). But AD-6 says a duplicate returns `200`. So what is the `409`? It can only be a *different* condition — stale attempt, reassigned assignment, inactive caller — i.e. exactly the four blocking states AD-7 says must "render an explicit blocking message" (`:120`). None of those states is reachable from a service-worker drain, because the drain has no UI. Result: the queued item is deleted from IndexedDB as "synced" and the disposition is gone, while the caller's last receipt said `Queued — will send`.

**Required change.** Split the outcomes. `200` = recorded (new or pre-existing identical). `409` = permanent conflict, drained but **reported** (a per-device "N queued dispositions were rejected" surface, or a `dialer_disposition_conflicts` queue surfaced on the next session). Anything else remains pending. The spine must not reuse one status for "already applied" and "will never apply".

**H2c — the worker retains every other failure forever, silently.** `sw.js:96-119` removes only on `ok || 409`; a `401` (expired session), `403` (deactivated or reassigned), `400` (malformed body) leaves the record in IndexedDB and retries on the next `sync` event — with no backoff, no attempt counter, no TTL, no notification, and no size cap. At ~1,030 members this is both a silent-loss channel and an unbounded PII store.

**Required change.** A terminal state is mandatory: bounded retries, then move to a visible dead-letter list. The receipt must be able to go from `Queued` to `Save failed — session paused` on replay failure, which the spine currently only promises for the live path.

**H2d — "`unique (assignment_id, attempt)` is the real single-session guarantee" (AD-9:132) is overstated.** It guarantees at most one *row* per attempt. It does not stop two concurrent sessions: phone and laptop, or two browsers, both compute the same next attempt, both submit; one wins the insert and the other's answers are lost (H2a) or overwrite (H2a). `BroadcastChannel` + `localStorage` are per-browser-profile, so they cannot see the other device. Reword to "at most one call log per attempt", and treat "second device" as H2a's conflict path rather than claiming it is prevented.

---

### H3 — Deleting a caller row destroys their call history (High)

`data-model.md:99`: `dialer_assignments.caller_id uuid … FK dialer_callers(id) **on delete cascade**`.
`data-model.md:120`: `dialer_call_logs.assignment_id … FK dialer_assignments(id) on delete cascade`.
`data-model.md:202`: `dialer_survey_responses.call_log_id … FK dialer_call_logs(id) on delete cascade`.

Delete one `dialer_callers` row and PostgreSQL cascades: caller → all their assignments → all call logs on those assignments → all survey responses. `call_logs.caller_id` has no `ON DELETE` clause, but it cannot save the row: the logs are deleted by the assignment cascade in the same statement, so the `NO ACTION` check passes at statement end. An operator "removing a volunteer who left" erases that volunteer's entire contribution to every campaign — the exact class of loss AD-12 exists to prevent, and AD-12 enumerates campaigns, questions and contacts but **not callers**.

There is also a reporting consequence: `dialer_callers` rows are the identity for `call_logs.caller_id`; losing the row would orphan historical attribution even if the logs survived.

**Required change.** (a) `dialer_assignments.caller_id` → `ON DELETE RESTRICT`. (b) State the rule in AD-12: **callers are deactivated, never deleted**; no endpoint deletes a caller. (c) If an Admin-offboarding path is ever wanted, it must be a soft delete (`is_active = false` + a `removed_at`), never a row delete. (d) Add a `verify-rls`-style fixture: delete attempt on a caller with history → FK violation, history intact.

While here: `dialer_contact_profiles.contact_id … ON DELETE CASCADE` (`:32`) is correct — a profile is enrichment, not history, and the assignment restrict already blocks deleting a contact that has any.

---

### H4 — Assignment is an unchecked grant of read access, and it crosses preacher scope (High)

`campaignScope(staff)` decides **which contacts** an admin may place into a campaign (AD-3). It says nothing about **which caller** those contacts may be given to. AD-11's validation is conflict detection ("names every selected contact already assigned in the campaign") plus a transactional write; there is no check that `callerId` is inside the assigning admin's scope, and the roster is deliberately program-wide ("the roster is readable to the three admin roles", AD-2).

Consequence: a Preacher (or an Assistant scoped through their preacher) can assign a contact whose `assigned_preacher_id` is themselves to a Volunteer who belongs to a *different* preacher. The Volunteer's queue then renders that member's name and phone number. Assignment is the read grant; the caller has no scope of their own (AD-9, AD-13). This moves phone numbers across the exact boundary AD-3 exists to draw, and it is a normal UI action, not a crafted request.

It also breaks reporting in a way the spine explicitly promises it cannot:

- AD-3: every count, funnel and leaderboard applies the predicate to **the assignment's contact**.
- AD-5: the leaderboard is "call logs by that caller in the campaign".

Those two are inconsistent when a caller's team and the contact's preacher differ. The call logs exist, but the contact is outside the viewer's scope, so the assignment drops out of Preacher B's funnel — B's volunteer looks like they never called anyone, while Preacher A's funnel silently owns the attempt. That is the "stalled volunteer is indistinguishable from bad luck" failure AD-5 claims to eliminate.

**Required change.** (a) In the batch handler, validate every `contactId` **and** every `callerId` against the caller's scope, not just `program_id`; a non-Admin may only assign to a caller whose `users.assigned_preacher_id` equals the contact's `assigned_preacher_id` (equivalently, equals their own resolved preacher). Admin is the explicit exception, and it should be audited. (b) Define two scope predicates, not one: **contact-linked rows** (lists, outcomes, export) scope by `contact.assigned_preacher_id`; **per-caller rollups** scope by `assignment.caller_id → users.assigned_preacher_id` for the *caller whose* team is being viewed, and count all of that caller's attempts. Write both into AD-3/AD-5 so a screen cannot pick the wrong one.

---

### H5 — Every scope is nullable, and `null` reads as "program-wide" (High)

Three places where a missing value silently widens instead of closing:

1. **`campaignScope` (AD-3:85).** For Assistant it returns `staff.assignedPreacherUserId`, which is `undefined` when the Assistant has no assigned preacher (`lib/authz.ts:130`). The type is `{ kind: "preacher"; userId: string }`, so TypeScript pushes the implementation to either throw or coerce. Nothing in the spine says which. A `userId: undefined` passed to `.eq("assigned_preacher_id", undefined)` either throws (fine) or, in a hand-built `.or()`/conditional filter, drops the clause (full-program read). This is the single most common way a scope check becomes a leak.
2. **`campaign_progress(campaign_id, scope_preacher_id uuid)` (AD-5:108, `data-model.md:232`).** The function is `SECURITY INVOKER` granted to `service_role`, so it has no idea who is calling it; the scope argument is trusted. It cannot enforce anything, and `null` is indistinguishable from "Admin". An Assistant with no preacher, or any handler that passes `null` on the Admin branch by mistake, gets every member's outcomes for the campaign.
3. **The RLS policies `data-model.md:256-267`** rely on `caller_assigned_preacher_id()` returning `NULL` for an Assistant without an active preacher — which is correct behaviour, since `assigned_preacher_id = NULL` matches nothing. That one fails closed. Good. The app-side helpers are the weak link.

**Required change.** (a) `campaignScope` returns a **discriminated** result and never a nullable user id: `{ kind: "program" } | { kind: "preacher"; userId: string }`, with a `throw new AuthzError(403, "scope_unresolved")` when an Assistant has no assigned preacher. (b) `campaign_progress` takes an explicit scope: `p_scope_kind text` (`'program' | 'preacher'`) plus `p_scope_user_id uuid`, raises if `kind = 'preacher'` and the id is null, and is revoked from everything except `service_role`. (c) Add a test per admin role with `assigned_preacher_id = NULL`: **zero rows, `403`, or empty payload — never program-wide.**

**H5b — existence oracle at the caller boundary.** `architecture.md:40-44` proposes mirroring `assertManageContactInScope`: try the RLS-scoped read, then fall back to a service-role probe to distinguish `403` (in program, out of scope) from `404`. For the manage portal that is defensible, because the caller is an admin and program membership is not secret. At the caller boundary it leaks more than it buys: any authenticated caller can probe assignment UUIDs and learn whether an assignment exists in the program (and, from `403` vs `404`, whether a given campaign has any). AD-7 says "`403` / `404`" as if the distinction were a requirement; it is not. Return **`404` for both** on the caller path, and never run a program-wide service-role probe from a caller-facing handler. Keep the 403/404 split for the admin surface if the UX needs it.

---

## Medium findings

**M1 — "the caller id comes from `getStaffContext()`" is ambiguous and would be implemented wrong (Medium).**
`StaffContext.userId` is `public.users.id` (`lib/authz.ts:121-132`), and in this codebase `supabaseUserId` is the *same* value. But `dialer_call_logs.caller_id` and `dialer_assignments.caller_id` reference `dialer_callers.id`. AD-6 (`:114`) and `architecture.md:49` both say the caller id comes from `getStaffContext()`. Taken literally, the RPC receives a `users.id` into a `dialer_callers.id` column: an FK violation at best, and a silent identity confusion at worst if the RPC resolves it by `user_id = p_caller_id`. Name the three ids in AD-6 — `auth.uid()`, `users.id` (== `staff.userId` today), `dialer_callers.id` — and state that the RPC resolves `dialer_callers` from `users.id` **inside the transaction**, never from the body.

**M2 — AD-7 never states the ownership predicate (Medium).**
"The browser never receives a general contacts read and never learns an id it was not given" is the *outcome*; the *mechanism* is the join. AD-7 describes resolving `dialer_assignments → dialer_callers` by `user_id` and `program_id` but never says `assignment.caller_id = caller.id`. Read as written, "find my caller row in this program, then load the assignment by id and program" is a valid implementation — and every caller in the program can then read every other caller's queue. Add the predicate explicitly, and say the helper takes `assignmentId` (never `contactId` or `callerId`) as its only identifier.

**M3 — the queue's ordering and the shared pager can skip a member (Medium, data integrity).**
`sort_order` is `integer not null default 0` (`data-model.md:103`) and AD-11 never mentions writing it. Every assignment therefore ties at `0`, so "the queue reads it" and "the rail renders a defined order" are not true by construction. Worse, AD-16 makes every list read use `collectPagedRows`, which pages with `LIMIT/OFFSET` at 1,000 rows (`manage.ts:203-225`) — over a non-unique sort key, ties across the page boundary may be returned in a different order per query, duplicating some rows and omitting others. At 1,030 contacts that boundary is exactly where the second page starts, and a skipped row is a member nobody calls. Also, `collectPagedRows` terminates on "fewer rows than requested"; that is only correct if the server's row cap equals the requested page size. If `db-max-rows` were ever configured below 1,000, every page comes back short and the pager silently truncates — the opposite of "fails loudly".
*Required:* write a unique `sort_order` in the assignment transaction (or order by `sort_order, id`); state that every paged read orders by a unique key (prefer keyset paging on `id`); and make the pager's truncation check independent of the assumed cap (`count: "exact"`, or a first-page probe that records the observed cap and raises if it is below the page size).

**M4 — the offline queue and draft are not keyed by user, and survive sign-out (Medium).**
`QUEUED_POST_PATHS` is an exact-path set (`sw.js:6`), and `isQueueablePost` is checked before the `/api/` network-only prefix (`sw.js:242`, `:271`), so adding `/api/dialer/disposition` cannot capture contact, registration or attendance traffic — **that part of AD-10 is sound.** The risk is a different one: the queue and the `dialer:disposition:<assignmentId>:<attempt>` draft are keyed by assignment and attempt only, not by staff user, and the repo has no clear-on-signout path (`grep` for `signOut|removeFromQueue|clearQueued` finds only `apps/folk/app/auth/signout/route.ts` calling `supabase.auth.signOut()`). On a shared calling desk or a shared phone, the next person to sign in inherits the previous caller's queued dispositions and in-flight draft. A queued replay authenticates with whoever is signed in at drain time (`sw.js:101-105`), so the `call_log.caller_id` is derived from the **drain-time** session. That is a wrong-person attribution in the one table the whole reporting layer trusts. The draft also surfaces the previous caller's free-text notes.
*Required:* key the draft and queue records by `staff.userId` (or `dialer_callers.id`), clear both on sign-out and on a per-user change, and have the disposition endpoint reject a replay whose queued `callerId` does not match the session. Add a TTL and a maximum queue size; the raw body (phone number plus notes) is stored unencrypted in IndexedDB with no retention limit.

**M5 — no audit trail on the dialer's bulk-PII paths (Medium).**
AD-3 exports ~1,030 phone numbers and outcomes; AD-11 writes assignments; AD-6 records outcomes. None of them emits an `audit_events` row, while every `/manage` contact write does (`manage.ts:1046`, `:1106`, `:1165`). The spine defers "audit trail for campaign and survey edits" (`:303`) — that is fine for edits, but **export is a read and is the exfiltration path**, and caller promotion/deactivation and batch assignment are privilege changes. Audit those three; they need no schema change beyond the existing table.
Related: `dialer_call_logs` holds no snapshot of the phone number that was dialled (`data-model.md:120` deliberately denormalises nothing). A Preacher can edit a contact's `phone` and `name` through `/manage` (allowed, `lib/manage/api-handlers.ts:253`) and every prior disposition now reads as if that member had been called on the new number. Either add a `dial_phone` snapshot (allowed by AD-13 — it is not a new `contacts` column) or emit an audit event on a contact's phone change once dialer history exists, so the re-attribution is at least discoverable.

**M6 — the RLS layer is real but unexercised, and AD-8's guardrail cannot see a missing assertion (Medium).**
AD-3 calls the dialer policies "defence-in-depth for authenticated reads". Every dialer read is service-role, so no dialer policy ever runs. Worse, one of the policies cannot work as described: `contacts` RLS grants a **Volunteer zero rows** (`20261006010000_scoped_rls_policies.sql:173-182`), so a caller policy on `dialer_assignments` that resolves the contact through `contacts` would deny a Volunteer caller the queue the design requires — which is another reason every read will be service-role. Do not present the second layer as protection for the data that matters; present it as protection for a future authenticated reader, and test it with `verify-rls.mjs` fixtures.
AD-8's static guardrail checks that a route file has a sweep row — not that the handler calls the scope helper. A new handler can import nothing from `lib/dialer/scope.ts`, and CI stays green as long as someone adds the table row. Cheap fix: extend `scripts/verify-dialer-route-coverage.mjs` to require every route module (except a short allowlist) to import an assertion from `lib/dialer/scope.ts`, and to fail if a handler reads `createSupabaseAdminClient()` without one. `scripts/verify-monorepo-guardrails.mjs` already does import-graph analysis (`:573-585`) to copy from.

**M7 — the contact-delete refusal will name the wrong reason (Low).**
`deleteManageContact` maps any `23503` to "This contact has attendance recorded against it and cannot be deleted" (`manage.ts:1150-1156`) and permits Admin *and Preacher* (`lib/manage/api-handlers.ts:328`). With `dialer_assignments.contact_id ON DELETE RESTRICT`, a contact with only dialer history now produces that sentence. AD-12's history guarantee is real, but the operator is told a false cause. Extend the message (or the delete handler) to name dialer history, and say in AD-12 that `/manage`'s delete semantics change without a code change to `/manage`'s gate.

**M8 — the caller-card "PREVIOUS" panel is a cross-campaign read (Low–Medium).**
`data-model.md:228` scopes history to "the same assignment's contact, capped to the last N entries". That is scoped by person, not by campaign or by ownership, so a Volunteer under Preacher A calling a member in campaign 1 sees that member's outcome and free-text notes from campaign 2, run by Preacher B. The history panel in `ux-flows.md:60-80` renders notes verbatim. Fine for the member, but it is a lateral exposure of another preacher's call notes to a volunteer, and it is the one caller read that is not justified by the current assignment. Either restrict to entries on assignments owned by this caller, or state explicitly that contact-level history is intentionally cross-campaign and that notes are written knowing any future caller sees them.

---

## Direct answers to the gate questions

| Question | Answer |
|---|---|
| Can a caller read another caller's queue? | **No, if the predicate is stated.** AD-7's wording omits `assignment.caller_id = caller.id`; as written it can be implemented program-wide (M2). With it, the queue is own-only, and an Admin who is also a caller sees only their own queue on `/campaigns/assignments`. |
| Can a caller get a general contacts read? | **No on the caller surface** (AD-7, AD-13; reads are service-role projections through `assertCallerAssignmentInScope`). The admin assign grid is a bulk read by design and must apply `campaignScope` to the rows *and* to the facet counts returned for the audience picker. The caller-card history panel is a contact-level read across campaigns (M8). |
| Can a Preacher/Assistant read outside their scope? | **Not through the lists**, provided H5 is fixed. **Yes through assignment** (H4): an in-scope contact can be placed in another preacher's caller's queue, which is a read grant. Report denominators are also inconsistent by construction when caller and contact scopes differ (H4). |
| Can a deactivated caller write? | **Yes**, if deactivation happens in `dialer_callers` only (H1). Staff-level suspension (`users.status`) is enforced per request and does block. |
| Can a replayed / cross-tab disposition duplicate or overwrite? | **Duplicates are prevented** by `(assignment_id, attempt)`. **Overwrite and silent loss are not** (H2a). `409` is counted as success by the worker while AD-6 says duplicates return `200` (H2b). Any other replay failure is retained forever with no user-visible failure (H2c). |
| Can a contact delete destroy history? | **No** — `dialer_assignments.contact_id ON DELETE RESTRICT` protects it, but the operator gets a false "attendance" reason (M7). |
| Can a campaign delete destroy history? | **No** — `on delete restrict`, no endpoint, `DELETE` granted to nobody, cancel-only. Sound. |
| Is the service-role boundary real? | **Real as a deployment boundary, not as a compensating control.** `lib/supabase/admin.ts` is `server-only`, the key is server-only (`lib/supabase/env.ts`), and guardrails fail a client-graph import (`verify-monorepo-guardrails.mjs:573-585`). But the key is all-or-nothing and per-program unscopable, every dialer read/write uses it, and nothing at the database can catch a handler that forgets its assertion. AD-8's static check is the only structural control, and it does not verify the assertion is called (M6). |
| Can the offline queue capture the wrong traffic? | **No** — `QUEUED_POST_PATHS` is an exact-path `Set` and queueable is checked before the `/api/` network-only prefix. It *can* capture the wrong **user's** traffic on a shared device, and replay under the wrong session (M4). |

---

## Rules asserted but not enforceable as written

1. **"`is_active` is checked on the write path"** — no write-path mechanism named, RPC checks only `program_id` (H1).
2. **"A replay that finds the row returns `200`"** — conflicts with "idempotent overwrite", and nothing forbids mutating a landed row (H2a).
3. **"`sw.js` drains on `ok || 409`"** — treats a permanent refusal as success; no user-visible failure path (H2b/c).
4. **"`unique (assignment_id, attempt)` is the real single-session guarantee"** — prevents a duplicate row, not a second session (H2d).
5. **"callers are deactivated, never deleted"** — implied throughout, never stated, and the FK cascade contradicts it (H3).
6. **"assignment is a move"** — true, but the move is also an unchecked read grant across preacher scope (H4).
7. **"`campaignScope` returns a preacher scope for Assistant"** — nullable in the type and in the data; no fail-closed rule (H5).
8. **"`campaign_progress` takes the AD-3 scope as an argument"** — the function cannot verify it; `null` is not defined (H5).
9. **"the dialer RLS policies replicate the same predicate"** — no dialer read path uses an authenticated client, and the `contacts` policy denies Volunteers, so the policies can neither enforce nor replicate the caller predicate (M6).
10. **"every dialer list read and export uses the pager, and fails loudly"** — the pager's termination test depends on an assumed server row cap, and pages over a non-unique key (M3).
11. **"a Preacher cannot assign outside their scope"** — not asserted anywhere, and not true (H4).
12. **"the browser never receives a general contacts read"** — true for the caller, but the assign grid is a bulk contact read and the audience facet counts are unscoped in the rules (M8, H4).
13. **"caller id comes from `getStaffContext()`"** — returns `users.id`, not `dialer_callers.id` (M1).
14. **"a contact with dialer history cannot be deleted"** — enforceable, but the refusal reason is wrong and the rule changes `/manage` behaviour without changing `/manage`'s code (M7).

## Missing authorization checks (concrete list)

1. `dialer_callers.is_active` in `assertCallerAssignmentInScope` **and** inside `record_call_disposition`.
2. `assignment.caller_id = caller.id` in the scope assertion (stated, not implied).
3. Destination `callerId` against the assigning admin's scope in the batch-assign handler (H4).
4. Every `contactIds[]` entry validated against `campaignScope`, not just `program_id` (H4).
5. `campaign.status = 'ACTIVE'` checked in the disposition transaction, not only in the queue query (AD-12 says the write is refused; the RPC contract does not list it).
6. Scope resolution failure → `403` for `campaignScope`, and a non-null scope in `campaign_progress` (H5).
7. `campaignId` on batch assign and export resolved from the database and compared to `staff.programId`; never trusted from the body (AD-14 says "asserts the program", but no handler-level rule names the source).
8. A replay whose queued caller does not match the drain-time session (M4).
9. Export and assignment audit events (M5).

---

## Gates I would require before architecture sign-off

Static (CI-visible, inside `pnpm guardrails`):

- Extend `scripts/verify-dialer-route-coverage.mjs`: every route module under `apps/folk/app/api/dialer/**` imports an assertion from `lib/dialer/scope.ts`, and no route module calls `createSupabaseAdminClient()` without importing one. This is the structural fix AD-8 is missing.
- Assert the new `sw.js` path is an **exact** entry in `QUEUED_POST_PATHS` (not a prefix) and `/campaigns` is in `NETWORK_ONLY_PATH_PREFIXES`, in **both** app copies. The existing `scripts/verify-pwa-offline-queue.mjs` already drives the `202`/drain contract — extend it, do not weaken it.
- Assert the migration grants `EXECUTE` on `record_call_disposition` / `campaign_progress` to `service_role` only, that `dialer_callers` is not deletable by any grant, and that the three FKs carry the intended `ON DELETE` action (H3). Text assertions on the SQL are acceptable here; do not assert the *document*.

Behavioural (pre-merge `pnpm test:e2e`):

- Denial sweep, per route: unauthenticated; non-owning caller; owning caller. **Plus** two rows the current three-case sweep omits and H1/H5 live in: inactive caller → refused with no write, and an Assistant/Preacher with `assigned_preacher_id = NULL` → zero rows or `403`, never program-wide.
- Replay: same `(assignment_id, attempt)` with a *different* status → original row unchanged, status is a conflict code, not a silent success.
- Assignment: a Preacher assigning an out-of-team caller is refused (H4).
- Caller delete with history → FK violation, `dialer_call_logs` count unchanged (H3).
- Pager: seed > 1,000 campaign rows with tied `sort_order` and assert no duplicate and no missing assignment id across pages (M3).

---

## Residual risk accepted if the spine ships unchanged

If the five high findings are fixed, the residual risk is a service-role bug in a handler: one missing assertion is a full-program phone-number read, and there is no database control behind it. That is unavoidable given the inherited "service-role-only writes, service-role reads" architecture, and AD-8 is the right shape of mitigation. The spine should say this plainly in AD-7 rather than implying RLS is the backstop, so the next developer knows the assertion is the *only* control and treats a handler without it as a security defect rather than a style issue.
