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

All ids are `uuid PRIMARY KEY DEFAULT gen_random_uuid()`. All carry `program_id TEXT NOT NULL` — matching `contacts`, which uses a bare `TEXT` with an `isProgramId()` TypeScript check rather than an FK, so these follow suit. Timestamps are `timestamptz`, with an `updated_at` trigger using the existing `set_updated_at()` convention.

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
| `program_id` | text | FK |
| `name` | text | not null |
| `description` | text | |
| `campaign_date` | date | not null |
| `campaign_time` | text | |
| `audience_filter` | text | **omitted.** The source column was stored, editable and never applied by any query. `ux-flows.md` §14 gets its facets from `dialer_contact_profiles` instead. |
| `status` | text | not null default `'DRAFT'`, check in `DRAFT, ACTIVE, COMPLETED, CANCELLED` — **`CANCELLED`, never `DELETE`.** `dialer_assignments.campaign_id` is `on delete cascade`, so deleting a campaign silently destroys every queue, disposition and answer under it. Cancelling preserves all of it and simply removes the campaign from pickers. |
| `max_attempts` | integer | not null default 3, check between 1 and 10 — how many times a contact may be re-queued before the campaign closes them out |
| `gap_duration` | integer | not null default 20, check between 5 and 300 — the pace between calls |
| `created_by` | uuid | FK to `public.users(id)` |
| `created_at`, `updated_at` | timestamptz | |

Index on `(program_id, status, campaign_date)`.

**Gap range is one number, not three.** The source had a DB check of `5–3600`, a client clamp to `300`, and a UI offering `[5, 10, 20, 30, 60]` — three disagreeing ranges, plus a `gap_duration` that no admin screen could set, so the DB default always applied. Here the admin can set it, and a value outside the preset list renders as the current value rather than as *no selection*.

**Design coverage.** Frame 212 shows the name, description, end date and survey builder, but not the target-audience control or the gap-duration control. Both remain required by CAP-2; their absence is a design omission, not a schema change.

### `dialer_callers`

Callers are staff users with a calling profile, not a separate identity. The source app made them rows in `contact`; here they are `public.users` rows of role `Volunteer`, so one identity serves calling, attendance and the manage portal.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | FK |
| `user_id` | uuid | not null, FK `public.users(id)`, unique per program |
| `display_name` | text | not null |
| `is_active` | boolean | not null default true |
| `invited_by` | uuid | FK `public.users(id)`, on delete set null |
| `invited_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

Unique on `(program_id, user_id)`.

**Onboarding rule**: promoting an existing contact to a caller creates the `public.users` row *and* this row, and links the contact via `public.users.id = auth.users.id` the same way the invite flow does today. No third identity table.

**Any staff role can hold this row.** Admin, Preacher, Volunteer and Assistant are all eligible; the caller scope is the `dialer_callers` row plus `program_id`, not the role. There is no `Import roster` path in v1.

### `dialer_assignments`

A contact assigned to a caller for a campaign.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | FK |
| `contact_id` | uuid | not null, FK `contacts(id)` on delete cascade |
| `caller_id` | uuid | not null, FK `dialer_callers(id)` on delete cascade |
| `campaign_id` | uuid | not null, FK `dialer_campaigns(id)` on delete cascade |
| `assigned_by` | uuid | FK `public.users(id)` |
| `status` | text | not null default `'PENDING'`, check in `PENDING, COMPLETED, SKIPPED` — **and `SKIPPED` is actually written.** The source declared it in the CHECK and in its Dart enum and wrote it from nowhere, so a skipped call vanished from the campaign metrics. |
| `sort_order` | integer | not null default 0 — **and the queue reads it.** The source wrote it and iterated in filter order, so call order was arbitrary. The rail in `ux-flows.md` §2 renders a defined order. |
| `assigned_at` | timestamptz | |

**Unique on `(contact_id, campaign_id)`** — this is what makes CAP-5 conflict detection possible at the database level, not just in the UI.

The source used `(contact_id, enabler_id, campaign_id)`, which means reassigning a contact to a *different* caller for the same campaign creates a **second row** rather than moving the first — so a contact could be assigned to two callers at once and the app only noticed on the next screen, via the "already assigned to" snackbar. Dropping `caller_id` from the key makes assignment a **move**, which is what an admin means by it, and makes the conflict a real constraint rather than a warning about an accident the schema permitted.

**Weighted multi-caller assignment is a write-time distribution, not a column.** The request carries `[{callerId, weight}]`; the server computes `N = selected − already assigned` and writes only the final `(contact_id, campaign_id, caller_id)` rows. No weights table and no weight column exist. See `architecture.md` §1a.

Indexes on `(campaign_id, caller_id, status)` and `(contact_id)`.

### `dialer_call_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | FK |
| `assignment_id` | uuid | not null, FK `dialer_assignments(id)` on delete cascade |
| `contact_id` | uuid | not null, FK `contacts(id)` |
| `caller_id` | uuid | not null, FK `dialer_callers(id)` |
| `campaign_id` | uuid | not null, FK `dialer_campaigns(id)` on delete cascade |
| `attempt` | integer | not null default 1 — the Nth call made about this contact in this campaign. **Re-queueing an un-reached contact bumps it**, and it is what the per-campaign attempt cap counts |
| `call_outcome` | text | not null, check in `ANSWERED, BUSY, NO_RESPONSE, SWITCHED_OFF, WRONG_NUMBER, NOT_REACHABLE` |
| `follow_up_status` | text | check in `NEW, CONTACTED, INTERESTED, NOT_INTERESTED, JOINED, PENDING, DORMANT` — **nullable, and only collected when `call_outcome = 'ANSWERED'`** (`ux-flows.md` §10) |
| `follow_up_notes` | text | **never pre-filled.** The source seeded every call log with `"Interested in attending weekend programs and activities."` |
| `next_call_date` | date | |
| `call_duration` | integer | **omitted unless `calling-mechanism.md` option B is chosen.** The source shipped this column, shipped a CSV export header for it, and wrote it from nowhere. |
| `called_at` | timestamptz | not null default now() |

Indexes on `(campaign_id, called_at desc)`, `(assignment_id)`, **and `(program_id, next_call_date)`** — the source queried `next_call_date = today` on every dashboard load with no index.

**`call_logs.caller_id` is the only historical attribution, and `assignments.caller_id` is the current owner.** Because the assignment unique key dropped `caller_id`, reassignment is a **move** — the row is updated, not appended — so the question "who was assigned this contact in week 1" cannot be answered from `dialer_assignments` at all. It is answered from `call_logs.caller_id`, which is snapshotted at write time and never updated.

This is stated explicitly because the source app died on precisely this ambiguity: one disposition screen wrote `assignment['enabler_id']` and the other wrote `AuthService.currentUser.id`, producing `call_log` rows whose caller did not match the assignment they belonged to, which its own RLS policy then rejected. Any code that needs historical attribution reads `call_logs`, never `assignments`.

**Multiple attempts are allowed** — the unique constraint lives on `survey_response`, not here, so re-calling a contact writes a new `call_log` rather than overwriting. That is how follow-ups stay auditable.

**Unique on `(assignment_id, attempt)`.** This is what makes a duplicate write from a second tab an idempotent overwrite rather than a second record — the reporting counts attempts, and a volunteer with two tabs open would otherwise double every number they produce.

### Disposition fields — outcome vs follow-up

`call_outcome` answers **what happened when we tried to reach them**:

`ANSWERED | BUSY | NO_RESPONSE | SWITCHED_OFF | WRONG_NUMBER | NOT_REACHABLE`

It is the field that controls the rest of the form. If the outcome is not `ANSWERED`, follow-up and survey questions do not appear.

`follow_up_status` answers **for an answered call, where does this person stand**:

`NEW | CONTACTED | INTERESTED | NOT_INTERESTED | JOINED | PENDING | DORMANT`

It is collected only when `call_outcome = 'ANSWERED'`. It is not the campaign survey and it is not a free-form answer; the survey is per campaign and may contain any questions the admin builds.

The design's single `Status` list mixes the two concepts. A proposed UI split:

| Design chip | Proposed field |
|---|---|
| Confirmed | `follow_up_status` — `JOINED` today, or a new `CONFIRMED` value |
| May come | `follow_up_status = INTERESTED` |
| Will come next class / next week | `follow_up_status = INTERESTED` |
| Call me back | `follow_up_status = PENDING` |
| Call did not connect | `call_outcome = NO_RESPONSE` (or `NOT_REACHABLE`) |
| Switched off | `call_outcome = SWITCHED_OFF` |
| Wrong number | `call_outcome = WRONG_NUMBER` |
| Not interested — do not call again | `follow_up_status = NOT_INTERESTED` |
| Health is not good / out of station / busy cannot come / visiting home town | needs a decision: a follow-up status, a survey answer, or notes |

The last row is why the mapping is still an open question: those chips are reasons, not clean statuses. Do not collapse the two columns to match the frame.

### `dialer_survey_questions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | FK |
| `campaign_id` | uuid | not null, FK `dialer_campaigns(id)` on delete cascade |
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

**The final design's `Status?` question is unresolved.** Frame 212 shows a required `Status?` question with a fixed outcome list, while the spec ships a free-form builder. It may be a seeded default that can be edited, or a fixed standard question. That decision also determines whether the Confirmed stat can read this question; it is an open question in `SPEC.md`.

### `dialer_survey_responses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `program_id` | text | FK |
| `call_log_id` | uuid | not null, FK `dialer_call_logs(id)` on delete cascade |
| `question_id` | uuid | not null, FK `dialer_survey_questions(id)` on delete cascade |
| `answer` | text | not null |
| `created_at` | timestamptz | |

**Unique on `(call_log_id, question_id)`** — this is what makes the disposition save idempotent, so CAP-7's "never lose data" guarantee survives a retry.

## `record_call_disposition` — one transaction, always

The disposition write is a single `SECURITY DEFINER` RPC taking the assignment id, outcome, follow-up status, notes, next-call date and the survey answers, and writing the call log, its responses and the assignment status **together**.

It exists because the source's save was a loop of individual inserts against `unique (call_log_id, question_id)`: if answer 3 of 5 failed, the retry failed on answers 1 and 2 and the caller was permanently stuck with a half-saved disposition and no way out. One transaction cannot reach that state.

Its arguments are validated server-side against an allowlist — the caller id comes from `getStaffContext()`, never from the payload — and it asserts the assignment belongs to the caller's own program before writing. See `architecture.md` §2.

**The final design's single `Status` list is not the data model.** Frame 2456 shows one required `Status` field whose options mix call outcomes (`Switched off`, `Wrong number`, `Call did not connect`) with follow-up statuses (`Confirmed`, `May come`, `Call me back`). The RPC still needs a separate `call_outcome`, a conditional `follow_up_status`, notes and the campaign survey. The mapping is an open question in `SPEC.md`; do not collapse the columns to match the frame.

### Attempt cap and recall

`dialer_campaigns.max_attempts integer not null default 3`. A session's **Re-queue** action (`ux-flows.md` §3a) returns eligible un-reached assignments to `PENDING` and bumps `attempt`. When `attempt` reaches `max_attempts`, the assignment stops being offered and the summary reports the contact as *closed after N attempts* rather than dropping it.

Only `BUSY`, `NO_RESPONSE`, `SWITCHED_OFF` and `NOT_REACHABLE` are eligible. An `ANSWERED` contact is never re-queued by that button, and neither is `WRONG_NUMBER` — bad data is corrected through contacts, not by calling again.

**The disposition screen needs the caller's history to render the card's history panel** (`ux-flows.md` §3). That is a read of `dialer_call_logs` scoped to the same assignment's contact, capped to the last N entries — not a general history read.

## Reporting

`campaign_progress(campaign_id)` returns the funnel and per-caller rollup in one call. The source computed all of this with nine separate `count(exact)` queries from the client, and its export paths read whole tables — survivable at ~1,800 contacts, not a design to copy.

**The funnel has four named buckets, and the fourth is the one that matters operationally:**

| Bucket | Definition |
|---|---|
| **Assigned** | `dialer_assignments` rows for the campaign |
| **Attempted** | assignments with at least one `dialer_call_logs` row |
| **Reached** | assignments with a `call_outcome = 'ANSWERED'` call log |
| **Confirmed** | **open** — must be a standard outcome field, not a free-form survey answer. Candidate: `follow_up_status = 'JOINED'`, or a new `CONFIRMED` value. |
| **Never attempted** | assigned minus attempted |

**Confirmed — the schema options:**

1. **Reuse `follow_up_status = 'JOINED'`.** No migration. The metric is "answered and joined"; the UI label would be misleading if Confirmed means "will attend".
2. **Add `CONFIRMED` to `follow_up_status`.** One CHECK-constraint migration plus regenerated types; metric = latest answered call with `CONFIRMED`. Clean if Confirmed is a relationship state.
3. **Add a separate `attendance_intent` field** (`CONFIRMED | MAYBE | DECLINED`) on `dialer_call_logs`, collected only when answered. No change to `follow_up_status`; the metric reads this field. More schema, but the semantics are exact.
4. **Make `Status?` a fixed standard survey question.** No new column, but reporting depends on a question identity that the free-form builder can rename or retire. Fragile; not recommended.

The choice is deferred until the final database shape is reviewed.

**Never attempted is what makes a stalled volunteer visible.** Under the source's model a volunteer who never opened the app was indistinguishable from one who called everyone and got busy — both produce assignments with no logs. Without this bucket, a campaign at 38% completion is equally consistent with "callers were unlucky" and "callers never showed up", and the admin cannot tell which until the campaign is over.

**Per-caller leaderboard ranks on completed attempts in v1**, which is honest about what the system can actually verify. It is deliberately *not* ranked on reached-contact rate or on any quality signal, because under click-to-call every outcome is self-reported and nothing measures whether a conversation happened.

## RLS

Every table has RLS enabled. Use the existing `SECURITY DEFINER` helpers — `caller_role()`, `caller_program_id()`, `caller_assigned_preacher_id()`, `caller_effective_location_ids()` — rather than writing new ones.

| Table | Admin / Preacher | Caller (any staff role) | Member / anon |
|---|---|---|---|
| `dialer_campaigns` | full | select own campaign's | none |
| `dialer_callers` | full | select own | none |
| `dialer_assignments` | full | select + update own only | none |
| `dialer_call_logs` | full | select own; insert own (via service route) | none |
| `dialer_survey_questions` | full | select campaign's | none |
| `dialer_survey_responses` | full | select + insert own via own call log | none |
| `dialer_survey_options` | full | select campaign's | none |
| `dialer_contact_profiles` | full | select own contacts' | none |

Every policy filters on `program_id = caller_program_id()`. A caller additionally filters to `caller_id` = their own `dialer_callers.id`. The role does not widen the scope: an Admin who is not the assigned caller sees only what the Admin policy allows, not another caller's queue.

Add a section to `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md` **in the same commit as the migration**, and regenerate `lib/supabase/types.ts` with `supabase gen types`.

**The source app's RLS is the thing being fixed.** It granted `select ... using (true)` on `contact`, `assignment` and `call_log` to *any* authenticated user — every volunteer could read the full 46-column table of ~1,800 members including phone, email, date of birth and address, and every call log. Every policy here is program-scoped and caller-scoped, following the pattern in `20261006010000_scoped_rls_policies.sql`.

## Explicitly not ported

`public.access_token`, legacy `users` dual-writes, `folk_guide_id`, `app_config` (folk_hkmc reads env through `lib/supabase/env.ts`), `ai_chat_session` / `ai_chat_message` (CAP-10 storage must follow `folk_hkmc` conventions if it ships), and `event_rsvp` (see CAP-11 open question).

## No-do-not-call table yet

The source app has no suppression list and none is defined here. Contacts are obtained with consent and have agreed to be called, which is how this feature operates — it is a policy of the programme rather than a mechanism of the tool. If a suppression list is ever required, it is a small additive table filtering campaign assignment and every caller queue, and it needs no other change.