# Data model

Follows `folk_hkmc` conventions exactly: additive timestamped migrations, `program_id` on every table, RLS through the existing helpers, service-role-only writes.

## Preconditions before any migration

1. ~~Resolve the contact-field question.~~ **Resolved** (SPEC.md Decided): existing `contacts` columns for the call surface, a `dialer_contact_profiles` extension for four calling-relevant fields, everything else dropped.
2. ~~Confirm whether `gita-life` is in v1 scope.~~ **Resolved (SPEC.md Decided): folk only.** The `modules.dialer` flag hides the shared Campaign nav in gita-life; no gita-life route or seed is created.

## Conventions that differ from the source app

| | Source app | Here | Why |
|---|---|---|---|
| `program_id` | absent | `TEXT NOT NULL` on every table | inherited `folk_hkmc` architecture |
| identity | `contact.role` + `contact.is_enabler` + a legacy `users` table | `public.users.role` + one `dialer_callers` profile row | one identity, not three sources of truth |
| assignment uniqueness | `(contact_id, enabler_id, campaign_id)` | **`(contact_id, campaign_id)`** | the triple makes reassignment accumulate a second row instead of moving the assignment |
| survey options | comma-separated `text` column | `dialer_survey_options` child table | a comma inside an option is unrepresentable; MULTI_SELECT reuses the same delimiter |
| `call_duration` | column, never written | omitted until `calling-mechanism.md` option B | never ship a column the product cannot fill |
| `audience_filter` | stored, editable, never applied | omitted | implement it or drop it |
| `IN_PROGRESS` / `SKIPPED` | in the CHECK, written by no code | only `SKIPPED`, and it is written | a dead enum is a lie in a schema |

## Tables

All ids are `uuid PRIMARY KEY DEFAULT gen_random_uuid()`. All carry `program_id TEXT NOT NULL` — matching `contacts`, which uses a bare `TEXT` with an `isProgramId()` TypeScript check rather than an FK, so these follow suit. Timestamps are `timestamptz`, with an `updated_at` trigger using the existing `set_updated_at()` convention; `dialer_call_logs` is the exception (it has `called_at` and no `updated_at`).

### `dialer_contact_profiles`

Calling-relevant contact fields that do not belong on the shared `contacts` table. One row per contact, nullable throughout — a contact with no profile row is fully callable, and these four fields are optional enrichment.

| Column | Type | Notes |
|---|---|---|
| `contact_id` | uuid | PK, FK `contacts(id)` on delete cascade |
| `program_id` | text | |
| `centre` | text | drives the assignment facet |
| `level` | text | drives the assignment facet |
| `gender` | text | drives the assignment facet |
| `language` | text | the caller's preferred language for the conversation |
| `created_at`, `updated_at` | timestamptz | |

**Not carried from the source's ~46 contact columns**: `caste`, `religion`, `t_shirt_size`, `folk_guide`, `residency_interest`, `folk_residency_interest`, `marital_status`, `talents`, `yfh_id`, `stream`, and the rest. Nothing in this spec needs them, and `folk_hkmc` does not absorb speculative programme data. `folk_hkmc`'s existing `contacts` columns — name, phone, age, address, year, college, company, designation, notes, rounds, books_read, photo_path — already cover everything a caller sees during a call.

This resolves the migration blocker. The four facet fields here are the ones behind the dynamic search facets in `ux-flows.md` §14.

### `dialer_campaigns`

The `event` table from the source app, renamed to avoid collision with any future session/event concept and to make its purpose obvious.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | scoped, `NOT NULL`; no FK, matching `contacts` |
| `name` | text | not null |
| `description` | text | |
| `campaign_date` | date | not null |
| `campaign_time` | text | |
| `audience_filter` | text | **omitted.** The source column was stored, editable and never applied by any query. `ux-flows.md` §14 gets its facets from `dialer_contact_profiles` instead. |
| `status` | text | not null default `'DRAFT'`, check in `DRAFT, ACTIVE, COMPLETED, CANCELLED` — **`CANCELLED`, never `DELETE`.** `dialer_assignments.campaign_id` is `on delete restrict` and no role holds `DELETE`, so a campaign can neither be deleted by an endpoint nor cascade-destroyed. Cancelling preserves the queue, dispositions and answers and removes the campaign from new queues. |
| `max_attempts` | integer | not null default 3, check between 1 and 10 — how many times a contact may be re-queued before the campaign closes them out |
| `gap_duration` | integer | not null default 20, check between 5 and 300 — the pace between calls |
| `created_by` | uuid | FK to `public.users(id)` |
| `created_at`, `updated_at` | timestamptz | |

Index on `(program_id, status, campaign_date)`.

**Lifecycle is explicit.** `DRAFT → ACTIVE`, `ACTIVE → COMPLETED`, `ACTIVE → CANCELLED` and `DRAFT → CANCELLED` are the only transitions; `COMPLETED` and `CANCELLED` are terminal in v1 and nothing auto-activates or auto-completes. The three Campaign admin roles may perform them. Assignments and the survey may be prepared while `DRAFT`; the queue and the disposition path require `ACTIVE`. A disposition, Skip or recall against any other status returns a terminal `409`.

**Gap range is one number, not three.** The source had a DB check of `5–3600`, a client clamp to `300`, and a UI offering `[5, 10, 20, 30, 60]` — three disagreeing ranges, plus a `gap_duration` that no admin screen could set, so the DB default always applied. Here the admin can set it, and a value outside the preset list renders as the current value rather than as *no selection*.

**Design coverage.** Frame 212 shows the name, description, end date and survey builder, but not the gap-duration control. Gap timing remains required by CAP-2; its absence is a design omission, not a schema change. Target audience is not a campaign field: it is the assignment-time facet over `dialer_contact_profiles` described in AD-11.

### `dialer_callers`

Callers are staff users with a calling profile, not a separate identity. The source app made them rows in `contact`; here they are `public.users` rows of any staff role, so one identity serves calling, attendance and the manage portal.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | scoped, `NOT NULL`; no FK, matching `contacts` |
| `user_id` | uuid | not null, FK `public.users(id)` **on delete restrict**, unique per program — a staff identity with dialer history cannot be deleted |
| `display_name` | text | not null |
| `is_active` | boolean | not null default true |
| `promoted_by` | uuid | FK `public.users(id)`, on delete set null |
| `promoted_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

Unique on `(program_id, user_id)`.

**Onboarding rule**: a caller is an existing `public.users` row; this table adds only the calling profile. An eligible staff user in the assigner's set is promoted on first assignment, writing this row with `promoted_by = staff.userId`. The dialer never inserts `public.users` or `auth.users`; adding a person is the core app's single staff invite path, outside the Campaign surface. An existing `is_active = false` profile is never reactivated by assignment. No third identity table.

**Any staff role can hold this row.** Admin, Preacher, Volunteer and Assistant are all eligible; the caller scope is the `dialer_callers` row plus `program_id`, not the role. A Preacher may promote or assign only staff users whose `public.users.assigned_preacher_id` is them, **plus themselves**; an Assistant the same for their preacher, **plus themselves**; an Admin across the program. A deactivated caller is excluded from every assignable set. There is no `Import roster` path in v1.

### `dialer_assignments`

A contact assigned to a caller for a campaign.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | scoped, `NOT NULL`; no FK, matching `contacts` |
| `contact_id` | uuid | not null, FK `contacts(id)` **on delete restrict** — a contact with dialer history cannot be deleted, because the cascade would destroy the calls |
| `caller_id` | uuid | not null, FK `dialer_callers(id)` **on delete restrict** — a caller with assignments cannot be deleted |
| `campaign_id` | uuid | not null, FK `dialer_campaigns(id)` **on delete restrict** — a campaign cannot be deleted, only cancelled |
| `assigned_by` | uuid | FK `public.users(id)` |
| `status` | text | not null default `'PENDING'`, check in `PENDING, COMPLETED, SKIPPED`. A saved disposition sets `COMPLETED`; Skip sets `SKIPPED`; recall returns `NOT_REACHABLE` rows to `PENDING`. Every transition is a conditional update. |
| `sort_order` | integer | not null default 0 — **and the queue reads it.** The source wrote it and iterated in filter order, so call order was arbitrary. The rail in `ux-flows.md` §2 renders a defined order. |
| `assigned_at` | timestamptz | |

**Unique on `(contact_id, campaign_id)`** — this is what makes a duplicate assignment impossible; the pre-check is what names an existing assignment before the admin decides to skip or move it. The constraint is the backstop, not the error message.

The source used `(contact_id, enabler_id, campaign_id)`, which means reassigning a contact to a *different* caller for the same campaign creates a **second row** rather than moving the first — so a contact could be assigned to two callers at once and the app only noticed on the next screen, via the "already assigned to" snackbar. Dropping `caller_id` from the key makes assignment a **move**, which is what an admin means by it, and makes the conflict a real constraint rather than a warning about an accident the schema permitted.

**Weighted multi-caller assignment is a write-time distribution, not a column.** The request carries `[{callerId, weight}]`; every caller must be in the assigner's assignable set — Admin: the program; Preacher: the staff assigned to them plus themselves; Assistant: their preacher's assigned staff plus themselves — and an eligible staff user is auto-promoted to a `dialer_callers` profile on first assignment. The server computes `N = selected − already assigned` and writes only the final `(contact_id, campaign_id, caller_id)` rows. No weights table and no weight column exist. See `architecture.md` §1a.

Indexes on `(campaign_id, caller_id, status)` and `(contact_id)`. The first is the queue read.

### `dialer_call_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | scoped, `NOT NULL`; no FK, matching `contacts` |
| `assignment_id` | uuid | not null, FK `dialer_assignments(id)` on delete cascade. The link to the contact and campaign; `dial_phone` is the one deliberate historical snapshot. |
| `caller_id` | uuid | not null, FK `dialer_callers(id)` **on delete restrict** — the historical attribution, snapshotted at write time |
| `dial_phone` | text | not null — the number dialled, copied from `contacts.phone` inside the disposition transaction. History and export read this, not the contact's current phone. |
| `attempt` | integer | not null — the Nth call made about this contact in this campaign. Supplied by the queue payload; the RPC accepts only the next attempt or an existing attempt owned by the same caller. |
| `disposition_status` | text | not null, check in the 13 design chips — `CONFIRMED, MAY_COME, WILL_COME_NEXT_CLASS, WILL_COME_NEXT_WEEK, VISITING_HOME_TOWN, CALL_ME_BACK, CALL_DID_NOT_CONNECT, HEALTH_IS_NOT_GOOD, SWITCHED_OFF, OUT_OF_STATION, BUSY_CANNOT_COME, WRONG_NUMBER, NOT_INTERESTED` |
| `status_group` | text | `NOT NULL`, `GENERATED ALWAYS AS (CASE ...) STORED` — `CONFIRMED, MAY_COME, DEFERRED, NOT_REACHABLE, WRONG_NUMBER, NOT_INTERESTED`. The `CASE` is total over the 13 chips; never written by the client or the RPC. |
| `follow_up_notes` | text | **never pre-filled.** The source seeded every call log with `"Interested in attending weekend programs and activities."` |
| `call_duration` | integer | **omitted unless `calling-mechanism.md` option B is chosen.** The source shipped this column, shipped a CSV export header for it, and wrote it from nowhere. |
| `called_at` | timestamptz | not null default now() |

Indexes on `(caller_id, called_at desc)` and `(assignment_id)`. There is no `next_call_date` column in v1; a deferral is recorded but does not schedule a future call. `dial_phone` is a historical snapshot and is never updated. `dialer_call_logs` is the one table exempt from the `updated_at` convention: it has `called_at` and is immutable per attempt.

**`call_logs.caller_id` is the only historical attribution, and `assignments.caller_id` is the current owner.** Because the assignment unique key dropped `caller_id`, reassignment is a **move** — the row is updated, not appended — so the question "who was assigned this contact in week 1" cannot be answered from `dialer_assignments` at all. It is answered from `call_logs.caller_id`, which is snapshotted at write time and never updated.

This is stated explicitly because the source app died on precisely this ambiguity: one disposition screen wrote `assignment['enabler_id']` and the other wrote `AuthService.currentUser.id`, producing `call_log` rows whose caller did not match the assignment they belonged to, which its own RLS policy then rejected. Any code that needs historical attribution reads `call_logs`, never `assignments`.

**Multiple attempts are allowed** — the unique key includes `attempt`, so a second call writes attempt 2 rather than overwriting attempt 1. The survey-response uniqueness is separate, on `(call_log_id, question_id)`. A landed attempt is immutable: a correction is a new attempt, never an edit of the previous call log.

**Unique on `(assignment_id, attempt)`.** This makes a duplicate write from a second tab an idempotent replay rather than a second record — the reporting counts attempts, and a volunteer with two tabs open would otherwise double every number they produce. A landed attempt is immutable: a replay of the same payload returns the stored row unchanged, and a different payload for the same attempt is a `409` conflict, not an overwrite. `attempt` is not invented by the database: the queue payload carries the assignment's next attempt, and the RPC accepts it only when it is `max(attempt) + 1` or an existing attempt for the same caller. `called_at` is set on insert and never updated on a replay, so the first save time survives a retry.

### Disposition status and the generated group

`disposition_status` is the only status a caller writes. It carries the design's 13 chips, so the screen the caller sees is the data model, not a translation of it:

`CONFIRMED | MAY_COME | WILL_COME_NEXT_CLASS | WILL_COME_NEXT_WEEK | VISITING_HOME_TOWN | CALL_ME_BACK | CALL_DID_NOT_CONNECT | HEALTH_IS_NOT_GOOD | SWITCHED_OFF | OUT_OF_STATION | BUSY_CANNOT_COME | WRONG_NUMBER | NOT_INTERESTED`

`status_group` is a `NOT NULL`, `GENERATED ALWAYS AS (CASE ...) STORED` column. The generation expression is immutable, total over the 13 chips and references only the same row, which is what PostgreSQL 17 requires of a stored generated column.

| Stored `disposition_status` | Generated `status_group` |
|---|---|
| `CONFIRMED` | `CONFIRMED` |
| `MAY_COME` | `MAY_COME` |
| `WILL_COME_NEXT_CLASS`, `WILL_COME_NEXT_WEEK`, `VISITING_HOME_TOWN`, `CALL_ME_BACK`, `HEALTH_IS_NOT_GOOD`, `OUT_OF_STATION`, `BUSY_CANNOT_COME` | `DEFERRED` |
| `CALL_DID_NOT_CONNECT`, `SWITCHED_OFF` | `NOT_REACHABLE` |
| `WRONG_NUMBER` | `WRONG_NUMBER` |
| `NOT_INTERESTED` | `NOT_INTERESTED` |

The group exists for one reason: the funnel and the outcome mix need a coarse bucket, and deriving it in one column means two screens cannot disagree about the mapping. `BUSY` is deliberately not the name of the big group — seven of its nine statuses are deferred conversations, not an engaged line, and a report that calls them busy is a lie.

A call **reached a conversation** when its group is anything except `NOT_REACHABLE` or `WRONG_NUMBER`. Campaign survey questions render only for a reached call; notes render always. `WRONG_NUMBER` is its own group because it is a data-quality outcome: it is attempted, it is not reached, and it is never recalled.

### `dialer_survey_questions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | scoped, `NOT NULL`; no FK, matching `contacts` |
| `campaign_id` | uuid | not null, FK `dialer_campaigns(id)` **on delete restrict** — a question lives with its campaign |
| `question_title` | text | not null |
| `question_type` | text | not null, check in `TEXT, DROPDOWN, RADIO, MULTI_SELECT, DATE` |
| `sort_order` | integer | not null |
| `is_required` | boolean | not null default true — **and actually enforced.** The source rendered a `*` on every question and validated nothing, so the marker was a lie. |
| `retired_at` | timestamptz | **nullable.** Set instead of deleting, once the question has responses. A retired question keeps its rows and its historical answers, and stops appearing in the builder and in new dispositions |
| `created_at` | timestamptz | |

Index on `(campaign_id, sort_order)`.

### `dialer_survey_options`

Options live in a child table, not a comma-separated column. The source stored them as `options text` split on `,` — which makes a comma *inside an option* unrepresentable, and then reused that same delimiter to encode `MULTI_SELECT` answers, so the two were not separable.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | |
| `question_id` | uuid | not null, FK `dialer_survey_questions(id)` on delete cascade |
| `label` | text | not null — may contain commas, quotes, anything |
| `value` | text | not null — stable key, so renaming a label does not orphan answers |
| `sort_order` | integer | not null |

Index on `(question_id, sort_order)`. `TEXT` and `DATE` questions have no rows here.

**A choice question with no options is rejected at save time.** The source allowed `DROPDOWN` / `RADIO` / `MULTI_SELECT` questions with an empty options string, which rendered as a control the caller could not possibly answer and stored a `null` answer. Since the free-form builder ships (`SPEC.md` Decided), the validation is: if `question_type` is a choice type, at least one option row must exist, and `is_required` questions must actually be enforced on save.

**The `Status?` card is not a survey question.** The 13-chip list in frame 2456 is the stored `disposition_status`; the builder does not seed a second status question. Frame 212's redundant `Status?` card has been removed from the design; it was a prototype of the disposition control, not part of the campaign survey. The survey remains free-form, and Confirmed reads `disposition_status`, never a survey answer.

### `dialer_survey_responses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | scoped, `NOT NULL`; no FK, matching `contacts` |
| `call_log_id` | uuid | not null, FK `dialer_call_logs(id)` on delete cascade |
| `question_id` | uuid | not null, FK `dialer_survey_questions(id)` **on delete restrict** — a question with answers cannot be deleted |
| `answer` | text | scalar answer; null when the question is `MULTI_SELECT` |
| `answer_values` | text[] | multi-select answers; null for every other type. No delimiter, so an option containing a comma is representable. |
| `created_at` | timestamptz | |

**Unique on `(call_log_id, question_id)`** — this is what makes the disposition save idempotent, so CAP-7's "never lose data" guarantee survives a retry.

## `record_call_disposition` — one transaction, always

The disposition write is a single service-role-only function taking the assignment id, the disposition status, notes and the survey answers. It reads the contact's phone inside the transaction, snapshots it as `dial_phone`, and writes the call log, its responses and the assignment status **together**.

It exists because the source's save was a loop of individual inserts against `unique (call_log_id, question_id)`: if answer 3 of 5 failed, the retry failed on answers 1 and 2 and the caller was permanently stuck with a half-saved disposition and no way out. One transaction cannot reach that state.

Its arguments are validated server-side against an allowlist — the caller id comes from `getStaffContext()`, never from the payload — and it asserts the assignment belongs to the caller's own program before writing. It is `SECURITY INVOKER`: `EXECUTE` is revoked from `PUBLIC`, `anon` and `authenticated` and granted to `service_role` only. Nothing calls it as an authenticated user, so a `SECURITY DEFINER` function would widen the privilege boundary without adding safety. See `architecture.md` §2.

**The final design's single `Status` list is the data model.** Frame 2456's 13 chips map one-to-one to `disposition_status`; `status_group` is generated. Notes always render, and the campaign survey renders only when the call reached a conversation. There is no separate `call_outcome` or `follow_up_status` column to collapse.

### Attempt cap and recall

`dialer_campaigns.max_attempts integer not null default 3`. A session's **Re-queue** action (`ux-flows.md` §3a) returns only `NOT_REACHABLE` assignments to `PENDING`; it does not bump anything, because `attempt` belongs to the next call log. The cap counts a `dialer_call_logs` row per attempt; when the count reaches `max_attempts`, the assignment stops being offered and the summary reports the contact as *closed after N attempts* rather than dropping it.

An assignment is offered only when it is `PENDING` and its campaign is `ACTIVE`. A saved disposition sets `COMPLETED`; Skip sets `SKIPPED`; recall returns only `NOT_REACHABLE` `COMPLETED` rows to `PENDING`. A disposition, Skip or recall against a campaign that is not `ACTIVE` is refused with a terminal `409`, and every transition is a conditional update on the current status so a lost race returns `409` instead of double-counting.

Only the `NOT_REACHABLE` group — `CALL_DID_NOT_CONNECT` and `SWITCHED_OFF` — is eligible for that button. A reached contact is never re-queued by it, and neither is `WRONG_NUMBER`: bad data is corrected through contacts, not by calling again. The deferral statuses (`CALL_ME_BACK`, `OUT_OF_STATION`, `VISITING_HOME_TOWN`, `WILL_COME_*`) are recorded and complete the assignment; they do not schedule a future call in v1 and do not inflate the recall.

**The disposition screen needs the caller's history to render the card's history panel** (`ux-flows.md` §3). That is a read of `dialer_call_logs` for the same contact across campaigns in the program, capped to the last N entries — not a general contacts read. Notes are deliberately visible program-wide to any caller assigned that contact; they are not scoped to the current campaign or preacher.

## Reporting

`campaign_progress(campaign_id, scope_preacher_id, program_scope)` returns the funnel, the outcome mix by `status_group`, the per-caller rollup, the summary counts (skipped, wrong number, closed after the attempt cap) and the recent-activity rows in one call. It is `SECURITY INVOKER`; `EXECUTE` is revoked from `PUBLIC`, `anon` and `authenticated` and granted to `service_role`; a null `scope_preacher_id` with `program_scope = false` raises, so an Assistant with no preacher cannot fall through to a program-wide read. It takes the scope as an argument because the service-role client bypasses RLS — so the screen, the session summary and the CSV cannot disagree. The source computed all of this with nine separate `count(exact)` queries from the client, and its export paths read whole tables — survivable at ~1,800 contacts, not a design to copy.

A disposition that is still `Queued — will send` is not counted until its replay lands; the receipt says so rather than letting the funnel look short.

**The funnel has five named buckets, and the last is the one that matters operationally:**

| Bucket | Definition |
|---|---|
| **Assigned** | `dialer_assignments` rows for the campaign |
| **Attempted** | assignments with at least one `dialer_call_logs` row |
| **Reached** | assignments with at least one call log whose `status_group` is neither `NOT_REACHABLE` nor `WRONG_NUMBER` |
| **Confirmed** | the assignment's latest reached call log has `disposition_status = 'CONFIRMED'` |
| **Never attempted** | assigned minus attempted |

**Confirmed, resolved.** It is the latest reached status, not a survey answer and not a separate column. A later reached call supersedes an earlier one, so a contact who confirmed and then said they were not interested reads as not interested; a later `CALL_DID_NOT_CONNECT` does not erase an earlier confirmation. `WRONG_NUMBER` never counts as reached.

**Never attempted is what makes a stalled volunteer visible.** Under the source's model a volunteer who never opened the app was indistinguishable from one who called everyone and got busy — both produce assignments with no logs. Without this bucket, a campaign at 38% completion is equally consistent with "callers were unlucky" and "callers never showed up", and the admin cannot tell which until the campaign is over.

**Per-caller leaderboard ranks on completed attempts in v1**, which is honest about what the system can actually verify. It is deliberately *not* ranked on reached-contact rate or on any quality signal, because under click-to-call every outcome is self-reported and nothing measures whether a conversation happened.

## RLS

Every table has RLS enabled. Use the existing `SECURITY DEFINER` helpers — `caller_role()`, `caller_program_id()`, `caller_assigned_preacher_id()`, `caller_effective_location_ids()` — rather than writing new ones.

| Table | Admin / Preacher / Assistant | Caller (any staff role) | Member / anon |
|---|---|---|---|
| `dialer_campaigns` | select program | select own campaign's | none |
| `dialer_callers` | select program as Admin; select own assigned set as Preacher/Assistant | select own | none |
| `dialer_assignments` | select scoped | select own only | none |
| `dialer_call_logs` | select scoped | select own only | none |
| `dialer_survey_questions` | select program | select campaign's | none |
| `dialer_survey_responses` | select scoped | select own via own call log | none |
| `dialer_survey_options` | select program | select campaign's | none |
| `dialer_contact_profiles` | select scoped | select own contacts' | none |

Every policy filters on `program_id = caller_program_id()`. **No table grants `INSERT`, `UPDATE` or `DELETE` to `authenticated`** — every write goes through a service-role route handler after a scope assertion, and the policies exist so an authenticated read cannot widen the scope. The three admin-surface roles are not equal: **Admin** reads the program; **Preacher** reads contact-linked rows whose contact has `assigned_preacher_id = auth.uid()`; **Assistant** reads contact-linked rows whose contact has `assigned_preacher_id = caller_assigned_preacher_id()`. Campaign, question and option rows are program-level because they carry no contact; assignments, call logs, responses, contact profiles and the caller roster are scoped. The roster's scope is the AD-3 assignable set: a Preacher sees staff users with `assigned_preacher_id = auth.uid()` plus themselves; an Assistant sees their preacher's assignees plus themselves; an Admin sees the program. A caller additionally filters to `caller_id` = their own `dialer_callers.id`: on `/campaigns/assignments` even an Admin sees only their own queue, while the admin surface sees the scope its role allows.

Add a section to `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md` **in the same commit as the migration**, and regenerate `lib/supabase/types.ts` with `supabase gen types`.

**The source app's RLS is the thing being fixed.** It granted `select ... using (true)` on `contact`, `assignment` and `call_log` to *any* authenticated user — every volunteer could read the full 46-column table of ~1,800 members including phone, email, date of birth and address, and every call log. Every policy here is program-scoped and caller-scoped, following the pattern in `20261006010000_scoped_rls_policies.sql`.

## Explicitly not ported

`public.access_token`, legacy `users` dual-writes, `folk_guide_id`, `app_config` (folk_hkmc reads env through `lib/supabase/env.ts`), `ai_chat_session` / `ai_chat_message` (CAP-10 storage must follow `folk_hkmc` conventions if it ships), and `event_rsvp` (see CAP-11 open question).

## No-do-not-call table yet

The source app has no suppression list and none is defined here. Contacts are obtained with consent and have agreed to be called, which is how this feature operates — it is a policy of the programme rather than a mechanism of the tool. If a suppression list is ever required, it is a small additive table filtering campaign assignment and every caller queue, and it needs no other change.