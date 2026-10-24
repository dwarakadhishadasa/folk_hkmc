# Parity matrix — what carries over, what changes, what is dropped

Source of truth for the port is `/home/dwarakadhisha-dasa/projects/autodialer` (Flutter + Supabase, Android-first). Every row cites the source file it came from.

**Where parity stops.** The target is a phone PWA for callers and a desktop browser for admins, not an Android APK, and `folk_hkmc` has an identity and authorization model the source app does not. Four things are redesigned rather than carried: the queue display (`ux-flows.md` §2), the session controls (§3), the disposition field set (§10), and the security model (§1 below and `architecture.md` §2). Everything else carries with the corrections noted in §4. The final UI authority is the current `campaign.figcraft`; see `design-coverage.md` for the frame inventory and required omissions.

## 1. Roles and access

| Source app | folk_hkmc | Verdict |
|---|---|---|
| `ADMIN` (preacher/manager) | `Admin` / `Preacher` | Map. `FOLK_GUIDE` was already folded into `ADMIN` upstream — do not resurrect it. |
| `ENABLER` (volunteer caller) | Any staff role with a `dialer_callers` profile | Map. Created through the **existing invite flow**, never a bare `users` row. The final design confirms Admin, Preacher, Volunteer and Assistant can all be callers; scope still comes from the caller row and `program_id`. |
| `FOLK` (member) | not a staff role | A `contacts` row, not a `users` row. Members get no login for calling. |
| Email-OTP gate via `request-email-otp` Edge Function | Supabase Auth email-OTP | Reuse existing. Do not port the Edge Function. |
| `contact.is_enabler` boolean | *dropped* | Two sources of truth alongside `role`, one written as a **string** into a boolean column. One column here. |
| Legacy `users` table (uid/phone/token) | *dropped* | Vestigial dual-write, still read and written by one orphaned screen in the source. `folk_hkmc` has one `public.users`. |

## 2. Features that carry over directly

| Source feature | Source file | Capability | Notes |
|---|---|---|---|
| Campaign list + create/edit | `lib/events/events_widget.dart`, `lib/events/create_event_dialog.dart` | CAP-2 | Carries `gap_duration`, `audience_filter`, status. |
| Survey builder, drag-and-drop | `lib/events/create_event_dialog.dart` | CAP-2 | Includes quick presets and per-card FIELD PREVIEW. |
| Contacts add dialog | `contact_assignment_widget.dart:2181` | CAP-3 | |
| CSV import, 45 headers | `contact_assignment_widget.dart:2348` | CAP-3 | Must fix: source is not duplicate-safe. |
| CSV export contacts + call logs | `contact_assignment_widget.dart:2524, 2667` | CAP-3, CAP-8 | Column contract needs rebasing onto `folk_hkmc` contacts. |
| Caller roster, promote-from-contacts + add manually | `lib/enablers/enablers_widget.dart` | CAP-4 | |
| Per-caller assign/unassign/transfer | `lib/enablers/enabler_assignment_widget.dart` | CAP-5 | Transfer is worth keeping. |
| Assignment hub, filters, bulk select | `lib/contact_assignment/contact_assignment_widget.dart` | CAP-5 | |
| Assigned-contacts list + progress | `lib/pages/assigned_contacts/assigned_contacts_widget.dart` | CAP-1, CAP-6 | |
| Auto-dialer session | `lib/auto_dialer/auto_dialer_widget.dart` | CAP-6, CAP-7 | Core. See §4 for what changes. |
| Calling dashboard (single contact) | `lib/calling_dashboard/calling_dashboard_widget.dart` | CAP-7 | Includes re-editing a previous logged call. |
| Admin dashboard funnel | `lib/folk_guide_dashboard/folk_guide_dashboard_widget.dart` | CAP-8 | |
| Event analytics + outcome pie | `lib/events/event_analytics_widget.dart` | CAP-8 | |
| Recent activity feed | `lib/folk_guide_dashboard/recent_activity_widget.dart` | CAP-8 | |
| Caller leaderboard | `enablers_widget.dart:1180` | CAP-4, CAP-8 | |
| AI assistant | `lib/ai_assistant/ai_assistant_widget.dart` | CAP-10 | Needs the security rework in Constraint 6. |
| Member RSVP | `lib/pages/folk_dashboard/folk_dashboard_widget.dart` | CAP-11 | |
| Phone normalisation to +91 | duplicated in 3 places upstream | all | Single shared helper. |
| Survey builder, drag-and-drop, presets, FIELD PREVIEW | `lib/events/create_event_dialog.dart` | CAP-2 | **Confirmed for v1** (`SPEC.md` Decided). Options become a real table; a choice question with no options is rejected at save. |
| Campaign gap timing | `event.gap_duration` | CAP-2, CAP-6 | Carries, but an admin can now actually set it — no admin screen could in the source. |
| Contact history on the call card | *(not present)* | CAP-6 | **New.** The source gave the caller no memory of the last conversation. |

## 2a. Additions — in the target, not the source

These have no source counterpart. They are not ports.

| Addition | Capability | Why |
|---|---|---|
| **Clipboard fallback on every call** | CAP-6 | A phone browser that cannot open the `tel:` handler still has the number one paste away. The source lost calls silently here. |
| **Contact history panel** | CAP-6 | The caller should not have to remember the last conversation. |

## 3. Features deliberately dropped

| Source feature | Why |
|---|---|
| Android floating survey overlay (`lib/overlay/`, `overlay_bridge.dart`) | No browser equivalent over a native dialer. Replaced by a dedicated disposition screen plus the phone queue drawer (`ux-flows.md` §1–2). The overlay's win — never losing your place — is recovered by the queue and the call card's history; the caller surface is a phone, so there is no desktop side-by-side rail. |
| `phone_state` stream + app-lifecycle call detection | Requires device call permissions. A browser cannot observe a `tel:` call at all. Replaced by an explicit **"I'm back"** action (`ux-flows.md` §3). |
| `flutter_phone_direct_caller` / `tel:` external app | Becomes a plain `tel:` link. |
| WhatsApp deep link button | Out of Non-goals (no WhatsApp messaging). Revisit separately. |
| **AI assistant** (`ai_assistant_widget.dart`, `ai_assistant_service.dart`) | CAP-10 deferred. Its mechanism is arbitrary SQL over the whole database via `run_dynamic_sql`, gated only on `role = 'ADMIN'`, with the provider API key in a client-readable table. The `json:choice` chip UX is preserved for when a tool-based assistant ships — `architecture.md` §6. |
| **Member RSVP** (`folk_dashboard_widget.dart`) | CAP-11 cut. Redundant with `call_outcome` + `follow_up_status`, and it would add a public unauthenticated surface where the source's RLS is `USING (true)` including to anon. |
| Phone OTP login, `access_token` table, token-login tracking | Already retired upstream; docs are stale. |
| Legacy `users` table writes | Vestigial dual-write; `folk_hkmc` has one `public.users` table. |
| `contact.is_enabler` boolean | A second source of truth alongside `role`, written as a string into a boolean. |
| Legacy `Is Enabler?` CSV column | Ignored by the source importer anyway. |
| `folk_guide_id` table | Never read by any source code. |
| ~40 contact profile columns (`caste`, `religion`, `t_shirt_size`, `folk_guide`, residency intent, …) | Nothing in this spec needs them. `folk_hkmc`'s existing 24 `contacts` columns cover the call surface; four calling-relevant fields get a `dialer_contact_profiles` extension. |
| Speech-to-text in the assistant, `₹500` budget tracker | CAP-10 deferred. |
| **Silent campaign auto-creation** (`"FOLK Camp Campaign"`, hardcoded at `contact_assignment_widget.dart:149`) | An admin was never blocked, and never knew what they were assigning into either. A blocked admin plus a one-click "No campaigns yet · Create one" is clearer than a silent default. |

## 4. Known source defects — do not port

Each row was found by reading the source, not by reading the spec.

### Correctness

| Defect | Location | Rule |
|---|---|---|
| **Partial survey saves are unrecoverable.** Rows inserted one at a time against `unique (call_log_id, question_id)`; a failure at answer 3 makes every retry fail on answers 1–2. | `auto_dialer_widget.dart:325` | One transactional RPC — `data-model.md`. |
| **`Skip` crashes on the last contact.** `_advanceToNext` indexes `[_currentIndex + 1]` with no bounds guard; the orange "Next Call" button *has* the guard, "Skip" does not. | `auto_dialer_widget.dart:2294`, `:361` | Every skip path is bounded. |
| **Both skip paths discard the disposition silently** — no save, no `SKIPPED` write, no message. | `auto_dialer_widget.dart:396`, `:2294` | Skipping resolves the assignment to a written state. |
| **"Call Now" means *skip* during a countdown.** `_makeCall` diverts to `_skipToNextCall()` when `_timerRunning`. | `auto_dialer_widget.dart:552` | One button, one meaning, stated on its label. |
| **Look-ahead redials the wrong person.** The card shows `displayIndex`, but tapping the number calls `_currentIndex`. | `auto_dialer_widget.dart:867`, `:1308` | The queue shows current and next, and the call card stays on the contact it names — `ux-flows.md` §2. |
| **`is_required` is a lie.** Rendered as `*`, never validated; inserts skip empty answers. | `calling_dashboard_widget.dart:781`, `:324` | Enforced, or not rendered. |
| **`enabler_id` provenance differs between the two disposition screens** — one reads `assignment['enabler_id']`, the other `AuthService.currentUser.id`, and the source resolves four competing identity paths elsewhere. | `auto_dialer_widget.dart:309`, `calling_dashboard_widget.dart:251` | Caller id comes from `getStaffContext()`, never from the request. |
| **Campaign-switch dialog fires while dialing** — the `await` is dropped, so the next line dials mid-fade and dialogs can stack. | `auto_dialer_widget.dart:384` | Awaited; the gap pauses until dismissed. |
| **`Future.any` does not cancel the permission request** — the OS dialog still appears, and a late grant registers a listener after the flow already moved on. | `auto_dialer_widget.dart:88` | No permission-gated init. |
| **Index changes before the survey reload awaits** — the form briefly shows the previous campaign's questions, and answers in that window land on the wrong `question_id`s. | `auto_dialer_widget.dart:366` | Load the campaign's questions before advancing. |

### Data and schema

| Defect | Location | Rule |
|---|---|---|
| `call_log.call_duration` never written — column *and* CSV export header, zero writers. | schema `:116`, `contact_assignment_widget.dart:2721` | Omit until option B exists. |
| `assignment` unique `(contact_id, enabler_id, campaign_id)` makes reassignment create a **second row** instead of moving it — the "already assigned to" snackbar was reporting this. | `initial_schema.sql:100` | Unique on `(contact_id, campaign_id)`. |
| `survey_question.options` is comma-separated `text`; MULTI_SELECT answers reuse the same delimiter. | `initial_schema.sql:126` | `dialer_survey_options` child table. |
| `assignment.IN_PROGRESS` / `SKIPPED` never written; `sort_order` written, never read. | `initial_schema.dart` enum, `contact_assignment_widget.dart:952` | `SKIPPED` is written; `sort_order` is read. |
| `event.audience_filter` stored, editable, never applied. | — | Omitted. |
| `next_call_date` queried on every dashboard load with no index. | `folk_guide_dashboard_widget.dart:93` | Index on `(program_id, next_call_date)`. |
| **RLS grants `select ... using (true)` on `contact`, `assignment` and `call_log` to any authenticated user** — every volunteer could read every member's phone, email, DOB and address, and every call log. | `initial_schema.sql:317` | Program-scoped, caller-scoped policies throughout. |
| `event_rsvp` RLS is `USING (true)`, including to `anon`. | `20240702000000` | CAP-11 cut. |
| `ai_chat_message.role` CHECK rejects `'model'`, inserts fail silently. | `ai_assistant_service.dart:944` | CAP-10 deferred; use `'assistant'` if it ships. |
| CSV import is not duplicate-safe; unique violations counted as plain failures. | `:2464` | Report the offending rows by name. `contacts` already has `unique (phone, program_id)`. |
| Seeded notes pre-filled with `"Interested in attending weekend programs and activities."` in **every** call log. | `calling_dashboard_widget.dart:57` | Never pre-fill user input. |
| Filter facets built from the current page's 50 rows, so dropdown options change as you paginate. | `contact_assignment_widget.dart:256` | Derive from the whole set. |
| AI cost derived from hardcoded per-model rates × `83.5`, silently falling through to `0.10` for unlisted models. | `ai_assistant_service.dart:730` | CAP-10 deferred. |
| History compaction re-calls the LLM on a `:free` router that can return a different model each turn. | `ai_assistant_service.dart:684` | CAP-10 deferred. |

### UI

| Defect | Location | Rule |
|---|---|---|
| `SESSION PAUSED` rendered in red next to a red dot — a paused session looks like an error. | `auto_dialer_widget.dart:982`, `:969` | Paused is a normal state and reads as one. |
| **No sound, vibration or haptic anywhere between calls.** The only inter-call cue is a visual countdown. | whole `lib/` tree | In a browser the caller is looking at a different window during the call; a glanceable re-entry cue is table stakes. |
| Save failure sets `_paused = true` with **no message at all.** | `auto_dialer_widget.dart:242` | Failures are loud — the source's single best reliability behaviour is the pause itself, not the silence. |
| An empty phone number returns silently with no feedback. | `auto_dialer_widget.dart:598` | No silent failures. |
| Secondary text colour identical to primary. | `flutter_flow_theme.dart:175` | Real contrast bug. |
| Gap presets, DB check (`5–3600`) and client clamp (`300`) are three disagreeing ranges, and **no admin screen can set `gap_duration`** — the DB default always applies. | `initial_schema.sql:88`, `auto_dialer_widget.dart:487` | One range, settable by an admin. |
| Hardcoded `Color(0xFFE65100)` for the fast-forward button; FlutterFlow placeholder profile data (`'85.5'`, `'Bangalore'`, `'Arjun Raghav'`) shipped in production. | `auto_dialer_widget.dart:2333`, `local_contact_card_widget.dart:16` | No hardcoded colours; no scaffolding. |
| Stale Firebase/Data Connect docs and config; `README.md` documents a `login-with-token` function that no longer exists. | `firebase.json`, `README.md:61` | Do not port as documentation. |

## 5. Features `folk_hkmc` gets that the source app lacked

- Real, per-role **RLS** rather than `USING (true)` on the whole member table.
- **Program scoping** — `folk_hkmc` serves `folk` and `gita-life` from one codebase; the source app is single-tenant.
- One **staff identity** shared with attendance, sessions and the manage portal — no third identity table, no four competing resolution paths.
- **A transactional write path.** The source app's disposition save could strand a caller with a half-written record and no way forward.
- **`typecheck:workspace` + guardrails** as real gates (the source app had no CI gates), and a Playwright suite with per-role `storageState` to prove the volunteer scope actually holds.
- **A session that survives a reload.** The source kept the queue in a `static` field — a full data loss on any reload.
- **Design tokens with contrast under test.** `folk_hkmc`'s e2e suite already measures `--ring`, `--destructive` and `--card` against sRGB in both themes.