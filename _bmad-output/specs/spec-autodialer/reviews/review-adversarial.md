# Adversarial review — FOLK Autodialer architecture spine

- **Reviewer role:** adversary in the architecture-spine review gate. I did not edit the spine.
- **Target:** `ARCHITECTURE-SPINE.md` (AD-1 … AD-16), read against `data-model.md` and `architecture.md`.
- **Date:** 2026-10-25
- **Method:** for each seam, invent two build units one level down. Give each the spine and nothing else. Assume both are competent, obedient and literal. Find the artefact they can each produce while violating no AD, then name the sentence that licensed it.
- **Verdict:** **Changes required.** The spine is unusually disciplined — it resolves the source app's real defects rather than inheriting them — but four seams still have two lawful readings each, and all four are on the path that decides whether a call outcome survives.
- **Repo facts I verified before asserting anything below:** `lib/authz.ts:32` makes `assignedPreacherUserId` optional and does not require it for `Assistant`; `apps/folk/public/sw.js:108` removes a queued request on `response.ok || response.status === 409` and on nothing else; `lib/supabase/manage.ts:203–224` is `collectPagedRows` throwing `manage_paging_truncated`; `sw.js:125` is `queuedMessageForPath`, whose default string is "Request queued for sync when online".

---

## R-1 — The reporting function cannot express the scope it is contractually bound to, and cannot answer the caller's own summary

**Severity: High** — wrong-role aggregate read, and the feature's headline number is unbuildable to spec.

**The two units.**

- **Unit A — the reporting engineer** (`lib/dialer/reporting.ts` + the SQL function). Reads AD-5 and AD-3.
- **Unit B — the caller-session engineer** (`components/campaign` session summary). Reads AD-5's binds line and the state diagram's `Summary` state.

**Both obey every AD.**

Unit A implements the signature exactly as written:

> "one `campaign_progress(campaign_id, scope_preacher_id uuid)` function — `SECURITY INVOKER`, granted to `service_role` — returns the funnel, the outcome mix by `status_group`, the per-caller rollup, the skipped / wrong-number / closed-after-cap counts the session summary needs, and the recent-activity rows. It takes the AD-3 scope as an argument…" — AD-5

AD-3's scope is a tagged union with no neutral third value:

> "`campaignScope(staff)` returns `{ kind: "program" }` for Admin, `{ kind: "preacher", userId: staff.userId }` for Preacher, and `{ kind: "preacher", userId: staff.assignedPreacherUserId }` for Assistant." — AD-3

A `uuid` parameter has exactly one way to spell `{ kind: "program" }`: `NULL`. So Unit A writes `WHERE (p_scope_preacher_id IS NULL OR c.assigned_preacher_id = p_scope_preacher_id)`, documents `NULL = program scope`, and is correct against AD-5.

Unit B needs the session summary, which AD-5 explicitly binds ("the funnel, campaign table, **session summary**, leaderboard and CSV") and explicitly says this function serves ("the skipped / wrong-number / closed-after-cap counts **the session summary** needs"). A Volunteer is not an Admin, Preacher or Assistant, so `campaignScope` has no branch that returns anything for them. Unit B's faithful options are: call `campaign_progress` with `null` (program scope) or compute the counts itself (forbidden by AD-3's "No page, handler or export invents its own filter" and by AD-5's "computed once"). It picks `null`, because AD-5 says the summary must not diverge and `null` is the only argument that yields a summary at all.

**The incompatibility.**

1. **Assistant with no assigned preacher.** `assignedPreacherUserId` is `undefined` when `public.users.assigned_preacher_id` is null (`lib/authz.ts:130`), and `requireRole` does not require it. `campaignScope` returns `{ kind: "preacher", userId: undefined }`. The handler — correctly — passes `null`. AD-5's encoding then reads that as `{ kind: "program" }`, and an Assistant sees the whole programme's funnel, outcome mix, per-caller leaderboard and CSV. Nothing in AD-3, AD-5 or AD-14 forbids this; AD-3 says Assistant is preacher-scoped, and the *encoding* silently overrides it. This is not a hypothetical: an Assistant is exactly the role most likely to be created before a preacher link is set.
2. **Session summary grain.** `campaign_progress` has no caller parameter. A Volunteer's summary — "what was achieved" in `ux-flows.md` §3a — is per-caller by definition. Unit B therefore either shows programme-wide numbers to a caller (a scope leak through a count, which AD-3's "every count … applies the scope predicate" forbids but cannot prevent, because the function it must call has no caller dimension) or reimplements the definitions in TypeScript, which AD-5 exists to prevent. Both units pass review; the product cannot ship both.

**Smallest tightening.** Two edits, both one line:

- Change the signature in AD-5 to carry the tag, not a bare uuid: `campaign_progress(p_campaign_id uuid, p_scope_kind text, p_scope_user_id uuid, p_caller_id uuid)` with `CHECK (p_scope_kind IN ('program','preacher','caller'))` and `p_scope_kind = 'preacher' ⇒ p_scope_user_id IS NOT NULL`. A `NULL` uuid then means "no scope given", which must return zero rows, not all rows.
- Add a fourth branch to AD-3: `campaignScope(staff)` returns `{ kind: "caller", callerId }` for a staff member with an active `dialer_callers` row and no admin role, and AD-5's `p_caller_id` is the only argument the session summary passes. Add one sentence: "An Assistant with no `assigned_preacher_id` resolves to a zero-row scope, never to program scope."

**ADs touched:** AD-3, AD-5 (and AD-14, whose "every handler asserts the program" says nothing about the *sub*-program scope).

---

## R-2 — `attempt` has two owners, and the unit that must supply it is forbidden from computing it

**Severity: High** — the failure mode is a permanently undeliverable disposition, which is the demo's stated success criterion ("no call outcome was lost").

**The two units.**

- **Unit A — the route-handler/RPC author.** Reads AD-6.
- **Unit B — the caller-session client author.** Reads AD-6 plus the history contract it was given for the card's history panel.

**Both obey every AD.**

> "the write is idempotent on `(assignment_id, attempt)`. `attempt` is supplied by the queue payload and accepted only when it is the assignment's next attempt or an existing attempt owned by the same caller — the function never invents it." — AD-6

Unit A implements precisely that: reject unless `p_attempt = coalesce(max(attempt),0)+1` or `p_attempt` names an existing row whose `caller_id` is the caller. It never invents a number, so a retry of the same logical save is safe and a second tab cannot double-count. Correct.

Unit B must put a number in the payload. The only client-visible source of prior attempts is the card's history, and the spine caps it:

> "That is a read of `dialer_call_logs` scoped to the same assignment's contact, capped to the last N entries — not a general history read." — `data-model.md`, "Attempt cap and recall"

Unit B computes `attempt = history.length + 1` and caches it in the draft key `dialer:disposition:<assignmentId>:<attempt>` (AD-10's mandated key), so a retry reuses the same number — exactly what AD-6 wants. No AD says the queue payload carries a server-computed attempt; the Convention table says only "thin delegate over `lib/dialer/api-handlers.ts`" and the payload shape is nowhere defined.

**The incompatibility.**

The two definitions of "next attempt" diverge the moment the history is not the whole history:

- **Cap reachable.** `max_attempts` defaults to 3, so at attempt 3 the history is 2 entries and `length + 1 = 3` — correct by luck. At attempt 4 it is wrong, but 4 is capped away, so the bug hides until an admin raises `max_attempts` (the CHECK permits 10) or `N` is set below the attempt count. Then the client sends attempt 3 when AD-6 expects 6, and the RPC rejects a legitimate queue item.
- **Offline replay after recall.** A disposition queued at attempt 2 replays after a recall. Per AD-12 the recall bumps nothing, so the queued number is still the right one — but `ux-flows.md:106` tells the implementer "Re-queue **bumps `attempt`**". Unit B, reading the companion, bumps the cached draft number before the replay is allowed to drain. The replay then arrives as attempt 3. If the server's max is 2, 3 *is* `max+1` and AD-6 accepts it, writing a **second call log for a call that was never made** — an attempt that inflates the leaderboard and every funnel denominator. If the server's max is anything else, the replay is rejected and the SW retries forever (see R-4). Neither branch is forbidden by any AD.
- **Two tabs.** Both compute the same number from the same snapshot, which is what AD-9's unique key expects — but the second tab's save *overwrites* the first's answers (see R-6) with no `applied: false`, and the caller is told "Saved".

So one sponsored reading invents call logs, the other loses them, and neither unit broke a rule.

**Smallest tightening.** Add one sentence to AD-6 and one to the Convention table:

> "The queue payload carries `attempt` as a server-computed opaque integer (`coalesce(max(attempt),0)+1` at payload time); the client echoes it verbatim, never derives it from history, and never increments it on recall or on retry. A payload without `attempt` is rejected."

And correct `ux-flows.md:106` to match AD-12's "without bumping anything" — the contradiction is the seeding condition for the duplicate.

**ADs touched:** AD-6, AD-10, AD-12, AD-9.

---

## R-3 — "Assignment is a move" and "assign the rest" are mutually exclusive, and both are in AD-11

**Severity: High** — silently uncalled contacts, or a caller's queue silently changing owner.

**The two units.**

- **Unit A — the assign-grid engineer** (`/campaigns/[campaignId]/assign-contacts`, the pre-check). Reads AD-11's Pre-check paragraph.
- **Unit B — the batch-write engineer** (`lib/dialer/admin.ts`). Reads AD-11's title, its Write paragraph, and `architecture.md` §1a.

**Both obey every AD.**

> "**Pre-check:** the server names every selected contact already assigned in the campaign, and the admin chooses *assign the rest* or *cancel*; nothing is written until that choice." — AD-11

Unit A builds a dialog: "12 selected · 3 already assigned · **Assign the rest (9)** · Cancel". "The rest" is the 9. It also shows, per the sentence, nothing else about the 3 — AD-11 never says the pre-check carries their current caller or status.

> "**Write:** one transaction inserts exactly the confirmed set, computes `N` from it, distributes by floor division plus largest remainder, and writes only the resulting rows." — AD-11

Unit B inserts 9 rows and leaves the 3 untouched. Correct.

Meanwhile the AD's own title, and the companion, say the opposite about what an existing assignment is for:

> "### AD-11 — Assignment is a move, and weights are write-time only" — AD-11
> "The server re-reads the selected contacts and existing assignments, **rejects or skips conflicts**…" — `architecture.md` §1a

A third reading is available and equally faithful: because assignment is *a move*, "already assigned in the campaign" to a **different caller** is not a conflict to skip — it is the row to move, and only an assignment to a caller *in this request* is a conflict. Unit B can implement `ON CONFLICT (contact_id, campaign_id) DO UPDATE SET caller_id = excluded.caller_id` under that reading and cite the title as its authority. AD-11 never says which of the three semantics "already assigned" has.

**The incompatibility.**

- Under Unit A/B-as-skip: an admin selects 200 contacts, 40 were assigned to a caller who has since left, presses "assign the rest". The 40 keep the departed caller, are `is_active=false`'d, and become permanently unofferable. Reporting counts them **Never attempted** — AD-5's own bucket for "a stalled volunteer" — so the spine's headline diagnostic blames a volunteer for an assignment the batch refused to move.
- Under Unit B-as-move: the pre-check's "3 already assigned" is a lie (they will be reassigned, not skipped), and worse, a contact assigned to caller X and already `COMPLETED` with a `CONFIRMED` log moves to caller Y. AD-11 does not say whether a move resets `status`, so party three (R-5) decides. If it does not reset, Y never sees the contact (the queue offers `PENDING` only); if it does reset without touching the log, the funnel's Confirmed is retained while the assignment re-enters the queue.

**Smallest tightening.** Replace "the admin chooses *assign the rest* or *cancel*" with an explicit two-outcome contract:

> "The pre-check returns, per selected contact, `{ contactId, name, currentCallerId, currentStatus, attemptCount, disposition: 'NEW' | 'HELD_BY_OTHER' | 'HELD_BY_CALLER_IN_REQUEST' }` and the admin chooses, per group: **skip** (leave the existing row byte-identical) or **move** (update `caller_id`, reset `status` to `PENDING` unless the campaign is not `ACTIVE`, keep `attempt`). Nothing is written until that choice, and the write is rejected with `409` if any row's `currentCallerId` changed since the pre-check."

Also delete "rejects or skips" from `architecture.md` §1a — it is the phrase that licensed the third reading.

**ADs touched:** AD-11, AD-12, AD-5.

---

## R-4 — Three documents define four refusal codes, and the service worker was verified to drain only one of them

**Severity: High** — a permanently paused session and an immortal queue row; verified against the actual `sw.js`.

**The two units.**

- **Unit A — the disposition route-handler author.** Reads AD-6, AD-7, AD-10.
- **Unit B — the service-worker editor.** Reads AD-1 and AD-10, and is told (correctly) to touch only the path lists.

**Both obey every AD.**

> "A replay that finds the row returns `200`; it never returns `500`, which would stall the queue." — AD-6
> "`/api/dialer/disposition` joins `QUEUED_POST_PATHS` … The endpoint is idempotent on `(assignment_id, attempt)`; `sw.js` drains on `ok || 409`." — AD-10
> "A refusal is a named state, not a generic save failure: cross-tab refused, caller deactivated, assignment reassigned and campaign cancelled each render an explicit blocking message, and the session pauses without discarding answers." — AD-7

Unit A must choose a status code for each named refusal. AD-7 calls them refusals and names four; the repo's idiom is `AuthzError` → `authzErrorResponse`, i.e. `403` (Convention table: "`AuthzError` plus `authzErrorResponse`; `403` and `404` never carry a row"). So deactivated / reassigned / cancelled are `403`, validation is `422`, cross-tab is a client-side state. Unit A is faithful.

Unit B adds the two path entries and changes nothing else: `if (response.ok || response.status === 409) removeFromQueue(...)` (`apps/folk/public/sw.js:108`). A `403` is neither, so the row is **never removed**. Faithful.

**The incompatibility.**

The most likely real event in this feature — a caller's queued disposition for an assignment an admin reassigned during the call (AD-9 explicitly anticipates it: "A contact reassigned mid-session still appears") — produces:

1. `403`, so `sw.js` keeps the row and retries on every sync, forever, growing `notifyPendingCount`'s badge with no way to clear it.
2. AD-10: "a rejected or failed write produces `Save failed — session paused`, keeps the answers and pauses the session." So the tab is now permanently paused over a write the server will never accept, and the only exits are retry (same 403) or discarding the answers.
3. AD-7 says the caller sees "assignment reassigned" and the session pauses "without discarding answers" — but the answers *cannot* land, and nothing in the spine says the `Queued — will send` receipt is allowed to become terminal.

The same trap fires for `is_active` revocation (AD-7's "dialer_callers.is_active is checked on the write path") and for campaign cancellation (AD-12: "a write against a `CANCELLED` campaign is refused loudly") — both are `403`-shaped, both immortal.

**Smallest tightening.** Add a response table to AD-10 and one sentence to the `sw.js` rule:

| Case | Code | Client | SW |
|---|---|---|---|
| applied | 200 | `Saved HH:MM` | drain |
| duplicate of an existed attempt, same payload | 200 `{ applied: true, replayed: true }` | `Saved HH:MM` | drain |
| terminal refusal (reassigned, deactivated, cancelled, cross-tab stale) | **409** `{ success: false, terminal: true, reason }` | named blocking message, session paused, draft retained **and offered for discard** | **drain** |
| invalid payload (required question, bad option) | 422 | `Save failed — session paused` | retain |
| network gap | 202 from the SW only | `Queued — will send` | — |

And state explicitly: "A `403`/`404` must never be returned to a replayed disposition; scope refusals on the disposition path are terminal `409`." That sentence alone closes it, because the SW already drains 409.

**ADs touched:** AD-6, AD-7, AD-10.

---

## R-5 — `dialer_assignments.status` has three writers, none of them compare-and-set

**Severity: Medium** (business-visible: the same assignment counted as both Skipped and Confirmed).

**The two units.**

- **Unit A — the RPC author.** AD-6: "It writes the call log, its survey responses and the assignment status in one transaction".
- **Unit B — the session-controls author** (Skip, Pause/Resume, recall). AD-12: "a saved disposition sets the assignment `COMPLETED`, Skip sets `SKIPPED`, and recall returns only `NOT_REACHABLE` assignments to `PENDING`"; AD-9: "Pause, Skip … are reachable from every live state".

**Both obey every AD.** Unit A writes `COMPLETED` inside the transaction. Unit B writes `SKIPPED` (and, from the summary, `PENDING`) with a plain update, because no AD gives Skip or recall a function, a precondition, or an expected status. AD-12's only precondition is on the *recall* side ("only `NOT_REACHABLE`") and it is a group test on logs, not a status test on the assignment.

**The incompatibility.** Skip is reachable "from every live state", including a state whose draft for the *same* assignment is already queued offline. Sequence: save queues (attempt 2) → caller hits Skip → `SKIPPED` → replay lands → `COMPLETED` + log. Now:

- AD-5's **Confirmed** is log-derived ("the latest reached log has `disposition_status = 'CONFIRMED'`") and ignores `status`, so the assignment counts as Confirmed.
- AD-5's summary returns a **skipped** count, which the obvious implementation takes from `status = 'SKIPPED'` — so the same assignment counts as Skipped too.

Two numbers that AD-5 promised "cannot diverge" for a structurally unavoidable reason. The reverse order (Skip lands first, replay second) is the same double count.

**Smallest tightening.** One sentence in AD-12:

> "`dialer_assignments.status` has exactly two writers: `record_call_disposition` and one `record_assignment_transition(assignment_id, from, to)` function. Both update with `WHERE status = <expected>` and treat zero affected rows as a `409` (R-4). Skip is legal only from `PENDING`. Recall is legal only from a `NOT_REACHABLE` group and is a `PENDING`-target transition. The summary's `skipped` counts assignments whose status is `SKIPPED` **and** which have no call log."

**ADs touched:** AD-6, AD-12, AD-5, AD-9.

---

## R-6 — The per-caller rollup is log-grain, the funnel is assignment-grain, and a move makes them non-reconcilable; the call log is "append-only" in one document and "an idempotent overwrite" in two others

**Severity: Medium.**

**The two units.**

- **Unit A — the reporting-SQL author.** AD-5: "**Attempted** = assignments with at least one call log … **Completed attempts** (leaderboard) = call logs by that caller in the campaign, any status."
- **Unit B — the audit/export author** reading the Deferred list and the data-model.

**Both obey every AD.** Unit A implements both definitions literally in one function, and AD-5 presents them as one consistent view because they sit in the same return value. Unit B reads:

> "**Audit trail for campaign and survey edits** — not required for v1; the call log is append-only." — Deferred
> "`call_logs.caller_id` is the only historical attribution… snapshotted at write time and never updated." — `data-model.md`

and builds the CSV as a log-grain export, one row per call, with the caller from `call_logs.caller_id` — which is exactly the "historical attribution" the data model insists on.

**The incompatibility.** After one AD-11 move:

- The funnel's **Attempted** is 1 (one assignment with a log).
- The **per-caller rollup** credits the *old* caller with 1 completed attempt and the new caller with 0.
- The campaigns table's "who has called what" — assignment-owned — credits the *new* caller with 0.
So the leaderboard's total across callers can exceed the funnel's Attempted, and the CSV's per-caller column disagrees with the campaigns table's, while every figure is derived from the one function AD-5 mandated. Separately, the "append-only" claim is false against AD-6's replay path and `data-model.md`'s "idempotent overwrite": a replay *replaces* the answers of an existing `(assignment_id, attempt)` row. The audit author will therefore build an immutability assumption the RPC violates (`called_at` is preserved, answers are not), and the "recent activity" ordering by `called_at` will surface a corrected record in the past.

**Smallest tightening.** Two sentences:

- AD-5: "Every reporting output names its grain. Funnel, campaign table and CSV totals are assignment-grain; the per-caller rollup is log-grain and is **not** a partition of the funnel — a reassigned contact's attempts credit the caller who made them, and the contact counts once, under its current owner. Print the grain in the CSV header."
- AD-6: "A replay is an upsert of the responses of the existing `(assignment_id, attempt)` row: it replaces answers, preserves `called_at`, and creates no second row. The call log is append-only **per attempt**, not immutable per row."

**ADs touched:** AD-5, AD-6, AD-11, AD-12.

---

## R-7 — `dialer_campaigns.status` has no writer for `COMPLETED` and no transition table

**Severity: Medium.**

**The two units.**

- **Unit A — the campaign edit author** (`/campaigns/[campaignId]`, "campaign detail, edit" per AD-1). The data model's CHECK is `DRAFT, ACTIVE, COMPLETED, CANCELLED`, so the edit form stores all four.
- **Unit B — the queue/recall author.** AD-12: "The queue offers `PENDING` assignments on `ACTIVE` campaigns whose `next_call_date` is null or due… recall returns only `NOT_REACHABLE` assignments to `PENDING` without bumping anything."

**Both obey every AD.** Neither is told who may write `ACTIVE` or `COMPLETED`, or from which state. AD-12 defines only `CANCELLED` ("campaigns are cancelled (`status = 'CANCELLED'`), never deleted"). Unit A therefore lets an admin flip `DRAFT → ACTIVE → COMPLETED → ACTIVE` with no guard, and Unit B offers rows only on `ACTIVE` and never reconciles a campaign whose assignments are all terminal.

**The incompatibility.** Two runs of the same product produce different numbers: with an auto-complete (a natural reading of `COMPLETED` in a CHECK that otherwise has no writer), a campaign whose remaining contacts are all `NOT_REACHABLE` stops offering recall the moment the last reachable call lands, so the summary's "Re-queue those 7" silently assigns 7 rows to `PENDING` on a `COMPLETED` campaign — a queue nobody will ever see, counted as "assigned" and "never attempted" forever. Without an auto-complete, a campaign is `ACTIVE` forever, and `COMPLETED` is a dead enum value — precisely the defect `data-model.md` criticises in the source ("a dead enum is a lie in a schema") and claims to have fixed.

**Smallest tightening.** Add to AD-12:

> "`dialer_campaigns.status` has one writer (the campaign edit handler) and four legal transitions: `DRAFT→ACTIVE`, `ACTIVE→COMPLETED`, `ACTIVE→CANCELLED`, `DRAFT→CANCELLED`. `COMPLETED` is never automatic. Recall on a non-`ACTIVE` campaign is a `409` (R-4), not a silent no-op."

**ADs touched:** AD-12, AD-5, AD-10.

---

## R-8 — The batch preview and the batch write are unlinked, and `sort_order` is unowned

**Severity: Medium.**

**The two units.**

- **Unit A — the pre-check endpoint author.** AD-11: "the server names every selected contact already assigned in the campaign, and the admin chooses *assign the rest* or *cancel*; nothing is written until that choice."
- **Unit B — the write endpoint author.** AD-11: "one transaction inserts exactly the confirmed set, computes `N` from it, distributes by floor division plus largest remainder".

**Both obey every AD.** Unit A returns a plan and a count ("9 to distribute across A:5, B:4"). Unit B recomputes `N` at write time from the request's `contactIds[]`, exactly as `architecture.md` §1a says ("computes `N = selected − already assigned`"). Neither stores a plan, because AD-11 says "No weight is stored". Between the two calls, a second admin assigns two of the nine, or the first admin's own retry double-submits: Unit B inserts 7 while A's preview said 9, and the receipt contradicts the preview with no reconciliation and no idempotency key. The request body has no nonce, so "Nothing is written until that choice" guarantees ordering, not exactly-once.

Two further unowned details in the same paragraph:

- **Weight normalisation.** `[{callerId, weight}]` has no stated domain or sum. `[2,1]` and `[67,33]` are both "weights". Unit A validates `Σ = 100`; Unit B divides by `Σ` (relative). The admin previews 67/33 and receives 2/1 split of 9 = 6/3, which happens to agree — until `[1,1,1]` over 10, where percent-validation rejects a request relative division would serve. The largest-remainder **tie-break** is also unspecified: two callers with equal remainder are ordered by map iteration in TS and by physical order in SQL.
- **`sort_order`.** `data-model.md` says "`sort_order` … **and the queue reads it**… The rail in `ux-flows.md` §2 renders a defined order", but AD-11's write never sets it, so a batch insert leaves every row at the `DEFAULT 0`, and AD-9's "one scoped snapshot" has no defined order. Two units then impose different orders (Unit A `sort_order, id`; Unit B `next_call_date, sort_order`) and "the next card" differs between a reload and the live session — which also changes which card the campaign-switch notice fires on.

**Smallest tightening.** One paragraph in AD-11:

> "The pre-check returns an opaque `planToken` and the exact per-caller counts. The write requires the token, applies exactly that plan, and returns `409` when the token is stale. `weight` is a positive integer, `Σweight > 0`, and the allocation is `floor(N·w/Σw)` with the remainder given to the largest fractional parts, ties broken by ascending `callerId` text; the write sets `sort_order` to a dense `row_number()` over the batch ordered by `next_call_date NULLS LAST, contact_id`."

**ADs touched:** AD-11, AD-9, AD-16.

---

## Minor findings and document contradictions

These are one-line fixes, but each is a place two units can diverge while quoting a document.

| # | Finding | Fix |
|---|---|---|
| M-1 | `status_group`'s `CASE` has no stated `ELSE` and no `NOT NULL`. AD-5's "Reached = … group is neither `NOT_REACHABLE` nor `WRONG_NUMBER`" counts a `NULL` group as reached, so a new chip added without the mapping change inflates Reached. | "The `CASE` is total and the column is `NOT NULL`; a `disposition_status` with no group is a migration error, asserted by a check that the two lists have equal cardinality (`13 → 6`)." |
| M-2 | The Convention table says "`updated_at` via `set_updated_at()`" for all dialer tables; `dialer_call_logs` has no `updated_at` and R-6 makes it partly mutable. | Exempt the log explicitly. |
| M-3 | `data-model.md:194` says the unresolved `Status?` question "also determines whether the Confirmed stat can read this question" — contradicting AD-5's resolved "**Confirmed** = the latest reached log has `disposition_status = 'CONFIRMED'`". The reporting unit will read the companion as an open decision. | Delete that clause; AD-5 is the answer, and the open question is UI-only. |
| M-4 | `ux-flows.md:106` "**Re-queue bumps `attempt`**" vs AD-12 "without bumping anything". The spine wins, but the client author reads the flows. | Correct the flows line (see R-2). |
| M-5 | AD-2 builds the Campaign sub-nav "from the same predicate", which includes Assignments, while `/campaigns/assignments` calls `requireDialerCaller` and refuses an admin with no `dialer_callers` row. A rendered href that dead-ends for every admin who is not a caller. | "The Assignments item renders only for a staff member with an active `dialer_callers` row." |
| M-6 | AD-10 adds the path to `QUEUED_POST_PATHS` but the SW's `queuedMessageForPath` returns "Request queued for sync when online" for any unknown path (`sw.js:125`). The receipt AD-10 mandates ("Queued — will send") never appears. | Name the message in AD-10 and the `sw.js` edit in the Attachment table. |
| M-7 | AD-16: "Every dialer list read and export uses [the pager]." `campaign_progress` returns lists (recent activity, per-caller rollup) from inside SQL, where the pager cannot apply; an implementer will add `.range()` to the CSV and then disagree with the RPC totals (R-6). | "The pager applies to PostgREST reads only; RPC-returned lists are bounded by an explicit `LIMIT` and never counted as totals." |
| M-8 | AD-13: "a `users` row without a matching `auth.users` row cannot sign in, so no bare-row path exists" — but the promote path creates exactly that (`public.users` + `dialer_callers`, with no `auth.users` row). The assign picker will offer a caller who can never sign in, and AD-5's **Never attempted** will report them as a stalled volunteer. | "Promote creates the caller `is_active = false` / `pending_invite`; the picker lists only callers whose `user_id` has an `auth.users` row and `is_active` is true; activation goes through the existing invite." |
| M-9 | AD-8's sweep requires "the owning caller succeeds" for every route — unsatisfiable for admin-only routes (`/api/dialer/admin/**`), which will either be weakened out of the sweep or forced to accept a Volunteer. The static check also enumerates route *files*, so one file exporting both `GET` and `POST` passes with a single row for one method. | Row schema `{ route, method, actor: "owning-caller" \| "admin" }`, enumerate method exports, and make the third case "the named actor succeeds". |

---

## Where each finding binds

| AD | Findings |
|---|---|
| AD-2 | M-5 |
| AD-3 | R-1, R-8 (scope for the preview), M-5 |
| AD-4 | M-1 |
| AD-5 | R-1, R-5, R-6, R-7, M-1, M-3 |
| AD-6 | R-2, R-4, R-5, R-6 |
| AD-7 | R-1, R-4 |
| AD-8 | M-9 |
| AD-9 | R-2, R-5, R-8 |
| AD-10 | R-2, R-4, M-6 |
| AD-11 | R-3, R-6, R-8 |
| AD-12 | R-2, R-3, R-5, R-7 |
| AD-13 | M-8 |
| AD-16 | R-8, M-7 |

AD-1, AD-14 and AD-15 survived every pair I could construct — route absence, the program assertion and "no new runtime service" are stated narrowly enough to be checkable, and the adversarial pairs there collapsed into "someone disobeys the AD", not "two readings are both lawful".

---

## What the spine gets right (so the tightening does not over-correct)

- **The generated `status_group`** is the correct fix for the source's two disagreeing mappings. Do not let a tightening turn it into a computed view or a client-side mapping.
- **Cancel, never delete; retire, never delete; `ON DELETE RESTRICT` on the assignment's contact** — this is a real, verified decision, and it is the reason R-3/R-7 are about *statuses* rather than rows.
- **The route-coverage guardrail inside `pnpm guardrails`** is the right shape for this repo (CI runs guardrails and not e2e). M-9 tightens the row schema; it does not dispute the mechanism.
- **The service worker as the only offline surface**, with `202` reuse rather than a second contract, is correct — R-4 is about the codes the endpoint returns *to* the SW, not about the envelope.
- **`modules.dialer` as presentation-only** and **gita-life by route absence** are the two decisions most likely to be eroded later; they are stated at the right altitude.
- **Explicitly refusing a server-side session** is what makes AD-9's `unique (assignment_id, attempt)` the load-bearing guarantee. R-2 exists because the client is asked to supply the key's second half without being given a correct source for it.

## Gate

I would not open parallel build on R-1 … R-4 as written. Each is one paragraph of tightening, and each closes a seam that otherwise produces a wrong number or a lost call outcome in the first week of real use. R-5 … R-8 and M-1 … M-9 are safe to fix during the first story if the spine carries the sentences above.
