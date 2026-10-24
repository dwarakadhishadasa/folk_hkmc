---
id: SPEC-autodialer
companions:
  - architecture.md
  - parity-matrix.md
  - data-model.md
  - calling-mechanism.md
  - ux-flows.md
  - diagrams.md
  - design-coverage.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

> **Design authority.** The current `_bmad-output/E-Assets/page-designs/campaign.figcraft` is the final UI authority. It wins on layout, navigation, labels and visible states. This spec wins on capabilities, data, security and backend behaviour. A required state the design does not show is a **design omission**, not a descope; `design-coverage.md` is the frame-by-frame record.

# FOLK Autodialer — feature parity for folk_hkmc

## Why

An **opportunity to capture, plus a pain to solve.** FOLK has a working autodialer at `/home/dwarakadhisha-dasa/projects/autodialer` — a Flutter app where admin builds campaigns, assigns members to volunteer callers, and each caller works a paced queue while recording outcomes. It works, but it is a separate island: its own Supabase project, its own `contact` table, its own role model, and volunteers must install an Android APK to place a call. Meanwhile `folk_hkmc` is where staff already live — the same people, the same program data, the same auth. Every campaign run today splits FOLK's data in half and puts a native app in the hands of volunteers whose job is to talk to people, not to manage software.

Carrying the feature set into `folk_hkmc` collapses that split: one contacts table, one staff identity, one place staff already trust. The hard part is not the data model — it is that the source app's best ideas are **mobile-shaped**. The floating survey overlay that floats above the native Android dialer, and `phone_state` call detection, have no browser equivalent. Porting them literally would produce something worse than what exists today. So this spec carries the features and the UX quality bar, and treats the calling mechanism — now decided, below — as the one thing that had to be settled before the rest could be designed.

## Capabilities

- **CAP-1 — Volunteer access to their own queue**
  - **intent:** A volunteer caller signs in and immediately sees exactly the people assigned to them, scoped to their program and nothing else.
  - **success:** A volunteer who has never used the tool lands on a working call list without an admin creating anything extra; attempting to open another volunteer's list returns a permission error, not data.

- **CAP-2 — Campaigns with a call-outcome survey**
  - **intent:** An admin creates a campaign with a name, date, target audience and per-campaign gap timing, and attaches a survey that shapes what every caller records.
  - **success:** A new campaign is fully configured and assignable without engineering help; its survey fields appear in every caller's disposition form for that campaign only.

- **CAP-3 — Contact universe**
  - **intent:** An admin maintains the population of people who can be called — adding them individually, importing a batch, and exporting the list back out.
  - **success:** A 500-row CSV import either completes with an explicit per-row success/failure count or reports which rows failed and why; a duplicate row never silently corrupts the list.

- **CAP-4 — Caller roster**
  - **intent:** An admin turns staff members into callers by promoting an existing contact who has an email address, or inviting someone directly, switches them active or inactive, and sees how each is performing per campaign. Any staff role is eligible.
  - **success:** A contact with an email becomes a working caller by one invite rather than by re-typing them, and an inactive caller immediately disappears from assignment pickers while their history is retained.

- **CAP-5 — Batch assignment with conflict detection**
  - **intent:** An admin selects a batch of contacts, chooses one or more callers and a campaign, and assigns them together — with anyone already assigned in that campaign surfaced before anything is written. Multi-caller assignment uses weights to distribute the batch.
  - **success:** A batch containing 5 already-assigned contacts produces a readable list of those 5 conflicts and writes none of the batch until the admin decides what to do; a weighted multi-caller split assigns exactly the selected unassigned contacts, with whole-number counts that add up to the batch.

- **CAP-6 — The call session**
  - **intent:** A caller works their queue on a phone as a guided session: the whole queue is one tap away with the current and next contact visible, calls are paced, the campaign change is explicit, and one primary action names the next step rather than four controls that mean different things.
  - **success:** One button starts a session that runs the whole queue unattended apart from recording outcomes; the caller never has to remember who is next or who they are currently on the phone with, and skipping a bad number never wedges the session. Finishing shows what the session achieved **and offers to re-queue everyone who was never picked up**, so an unreachable contact comes back as work rather than being lost.

  - **Only one session runs at a time.** A second tab on the same queue is refused rather than silently duplicating dispositions.

- **CAP-7 — Call disposition that never loses data**
  - **intent:** After each call the caller records the call outcome, and — only when the call was answered — follow-up status, notes and the campaign survey, then commits with one primary action. No separate save screen is needed.
  - **success:** A caller who closes the tab mid-queue keeps every outcome already entered, and a failed save is visible and pauses the session rather than discarding the answer.

- **CAP-8 — Reporting and export**
  - **intent:** An admin sees how campaigns are actually performing — a funnel that separates **assigned**, **attempted**, **reached**, and **never attempted**, plus a **confirmed** count, per-campaign progress, outcome mix, caller leaderboard and recent activity — and can take it away as a CSV.
  - **success:** An admin can answer "of the 200 people we assigned, how many were actually called, how many we reached, how many confirmed, what the outcomes were, and **who was never called at all**" from the reporting screen alone, and can export those exact numbers. The never-attempted bucket is what makes a stalled volunteer visible before the campaign ends.

- **CAP-9 — Intuitive by default**
  - **intent:** A first-time volunteer finishes a whole campaign without training, and no admin task needs more than one screen to reach its starting point.
  - **success:** An untrained volunteer completes a full campaign start-to-finish on a phone with no asker present, and an admin reaches create-campaign, assign, and export in one click each from the desktop Campaign surface.

## Deferred — not in v1

- **CAP-10 — Campaign assistant.** An admin asks questions about campaign performance in plain language and gets an answer from live data. *Deferred from v1.* If it ships it ships as **typed tools with server-validated arguments**, never as model-generated SQL — see `architecture.md` §6. The chip-based answer UX is preserved for when it does ship.

- **CAP-11 — Member RSVP self-service.** *Cut.* `folk_hkmc` already has sessions and attendance, and "did the member want to be called" is what `call_outcome` and `follow_up_status` already record. A public unauthenticated surface would also be where this feature is weakest.

## Constraints

- **Every record carries `program_id`.** Callers only ever see their own program's campaigns, contacts and call data. This is inherited `folk_hkmc` architecture, not a new feature — it is a constraint because it rules out any design that would query across programs.
- **Calls are placed by a human. The system never dials.** The caller presses a button, the native phone app opens with the number, the caller talks, returns to the browser and records the outcome. No telephony provider in v1. **Decided** — see `calling-mechanism.md`. Because nothing observes the call ending, **"I'm back" is an explicit user action**, not an inferred event.
- **The admin Campaign surface is a top-level navigation destination, not a `/manage` tab.** The final design gives it a desktop Campaign pill and a phone bottom-nav Campaign item. The exact route is an architecture decision; `/manage?view=campaigns` is no longer assumed. The caller session remains a separate `/dialer` route. A caller must not gain admin Campaign access by sharing the nav chrome; the role and scope gates remain. See `architecture.md` §1.
- **The desktop is the admin surface; the phone is the caller surface.** Fine-grained contact selection and assignment are desktop-only. The phone admin surface covers overview, reports, callers and the Campaign menu; it does not reproduce the contact grid. Calls are placed on a phone, not from the desktop.
- **The current `campaign.figcraft` is the final UI authority.** Its 25 current frames supersede the older 18-frame summary and `preview/dialer/*` exports. Where the design shows a state, it wins on layout and interaction. Where a capability requires a state the design does not show, that is a design omission tracked in `design-coverage.md`, not a descope.
- **Weighted multi-caller assignment is part of CAP-5.** Weights are a UI distribution rule only; the database persists the resulting per-contact assignments, never a weight. The split is floor division plus largest-remainder, deterministic and exact.
- **Confirmed is a standard reporting stat.** It must derive from a standard outcome field, not from an arbitrary campaign survey question; the data-model definition is an open question.
- **Caller contact reads are service-role, behind a scope assertion.** The browser never receives a general contacts read; it receives one already-scoped queue payload. This mirrors `lib/supabase/manage.ts` `assertManageContactInScope`. It is permitted *instead of* adding a caller term to the `contacts` policy, which would couple the core table to dialer tables.
- **The Flutter autodialer is not modified, deprecated or migrated.** This is additive work in `folk_hkmc`. Its schema quirks are not inherited.
- **No dynamic SQL in the calling product surface, ever.** The source app lets an LLM run arbitrary SQL through a `run_dynamic_sql` RPC, gated only on `role = 'ADMIN'`, with the provider key in a client-readable table. An allowlist does not rescue that in a browser tab holding a session cookie. Any assistant that ships selects **named tools with server-validated arguments**, and the database is never a SQL string target. See `architecture.md` §6.
- **Campaigns are cancelled, never deleted, and survey questions are retired, never deleted.** Both tables are `on delete cascade` targets, so a delete silently destroys a live queue or historical answers. `status = 'CANCELLED'` and a `retired_at` column exist for exactly this.
- **New tables follow existing conventions exactly.** Additive timestamped migrations under `supabase/migrations/`, `program_id` on every table, RLS through the existing `caller_role()` / `caller_program_id()` helpers, a row added to `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md`, and `lib/supabase/types.ts` regenerated.
- **Writes are service-role only, as today.** Authenticated clients get no direct INSERT/UPDATE/DELETE grants; all mutations go through route handlers guarded by `getStaffContext()` + `requireRole()`.
- **Server-only boundaries hold.** Provider credentials are read only through a server-only module modelled on `lib/supabase/env.ts`; any new staff route is added to the `proxy.ts` matcher; `turbo.json` `build.env` / `passThroughEnv` are extended or secrets are stripped at build time.
- **Follow the manual-form pattern, not shadcn `Form`.** Shipped features use `useState` + hand-written handlers + `fetch` to a route handler. Do not introduce `react-hook-form`/`zod` for this feature. Validation is hand-rolled with an explicit allowed-key allowlist, matching `lib/manage/api-handlers.ts`.
- **Disposition save is one transaction, not a loop.** A partial survey save is unrecoverable if each answer is written separately: the `unique (call_log_id, question_id)` constraint makes the retry fail on the rows that already landed. `record_call_disposition(...)` is a single `SECURITY DEFINER` RPC that writes the call log, its responses and the assignment status together.
- **Disposition has one explicit commit and a persistent receipt.** `Save & continue` is the commit; a localStorage draft preserves in-flight answers. The receipt is always visible as `Saving…`, `Saved 12:04`, or `Save failed — session paused`; a failed save pauses the session and keeps the answers. Autosave may back the draft but is not a second save ritual.
- **The design's single `Status` list does not replace the data model.** The disposition must still capture a separate `call_outcome`, conditional `follow_up_status`, notes and the campaign survey. The design omission is tracked in `design-coverage.md`; the field mapping is an open question.
- **Every dialer query is paged.** `folk_hkmc` holds ~1,030 folk contacts and every PostgREST read caps at 1,000 rows. Any list endpoint must concatenate pages and fail loudly on truncation, as `lib/supabase/manage.ts` `collectPagedRows` already does.
- **Do not disturb the existing offline queue, but the dialer needs its own.** The service worker's Background Sync paths (`/api/contact`, `/api/registration`, `/registration`, `/attendance`) must not capture autodialer traffic. `/api/dialer/*` is already network-only via the existing `"/api/"` prefix; add `/dialer` and the new Campaign route to `NETWORK_ONLY_PATH_PREFIXES` in **both** `apps/*/public/sw.js` copies, and add `/dialer/:path*`, `/api/dialer/:path*` and the Campaign route to the matcher in `proxy.ts` (which today does not match `/manage` either).
- **Disposition queueing is offline-capable and separate from the existing queue.** Add `/api/dialer/disposition` to the dialer's own Background Sync queue. The endpoint must be idempotent because `sw.js` drains on `ok || 409`; `unique (assignment_id, attempt)` is the idempotency key. The caller sees `Queued — will send`, never `Save failed`, and the localStorage draft survives a killed tab. This queue must not capture `/api/contact`, `/api/registration`, `/registration` or `/attendance` traffic.
- **Verifiable by demonstration, not by build success.** `next build` ignores TypeScript errors in this repo; `pnpm typecheck:workspace` and `pnpm guardrails` are the real gates. E2E verification is `pnpm test:e2e` — one runner at a time, since every spec shares one seeded database.

## Non-goals

- Replacing or altering `folk_hkmc`'s existing attendance, session, registration, contact or manage-portal features.
- Building, deploying, modifying or retiring the Flutter autodialer app or its Supabase project.
- IVR menus, voice bots, AI-placed calls, or any automated outbound dialing.
- Call recording, call transcription, or importing recordings from the telephony carrier.
- Outbound SMS, WhatsApp Business messaging, or bulk email campaigns — this spec covers voice calls only.
- Replacing the Supabase Auth email-OTP login that `folk_hkmc` already has.
- **Native mobile clients.** The application is a **browser app and a PWA** — one codebase, installable, no app store. The caller surface is phone-first; `tel:` hands off to the native phone app. The desktop is the admin surface, not a calling surface.
- Payments, billing, or cost-per-minute accounting.
- Model-generated SQL. Any assistant that ships selects from named tools with validated arguments; the database is never a SQL string target.
- Adding a `Volunteer` term to the existing `contacts` RLS policy, or widening `/manage` past `Admin`/`Preacher`.
- Auto-creating a campaign when none exists. The source app silently created a `"FOLK Camp Campaign"` so an admin was never blocked; here a blocked admin is a bug, and the fix is a one-click empty state that says what to do.
- **Import roster.** Callers are created through the invite/promote flow only; the design's `Import roster` control is not in v1 and must not ship.
- A telephony provider, programmatic dial-out, IVR or AI-placed calls in v1. Option B in `calling-mechanism.md` remains possible later without reshaping the session.

## Success signal

An admin creates a campaign on the desktop, imports 30 contacts, assigns them across three volunteers with a weighted split, and exports a CSV of every outcome — then each volunteer completes their queue on a phone, with the first-time volunteer finishing unaided. The demonstration is judged on one thing: nobody had to be taught, and no call outcome was lost.

## Assumptions

- The `folk_hkmc` contacts table is the calling universe; no second contacts table is created. Its 24 existing columns already cover everything a caller needs during a call.
- Role mapping onto existing roles (`Admin | Preacher | Volunteer | Assistant`): source `ADMIN` → `Admin`, source `ENABLER` → `Volunteer`, source `FOLK` → a contact, not a staff user. Any staff role can hold a caller profile; caller identity still comes from `getStaffContext()` plus a `dialer_callers` row.
- The Flutter autodialer stays in service unchanged; `folk_hkmc` is additive.
- Auth reuses `folk_hkmc`'s existing Supabase Auth email-OTP flow, which already matches the source app's email-OTP gate.
- Callers are created through the **existing invite flow** (`upsertStaffUser` → `sendStaffInviteEmail` → `writeInviteLog`), not by writing a bare `public.users` row. A `users` row without a matching `auth.users` row cannot sign in.
- The target surface is a **browser PWA**: phone for the caller session, desktop for admin campaign management. Tablet uses the phone layout. The caller session is shaped around a persistent page rather than an overlay.
- `folk_hkmc` already ships a service worker, a manifest, an `offline.html` fallback and an offline-sync banner, so a PWA install and its affordances are inherited rather than built. The dialer gets its own Background Sync path for dispositions; it does not reuse the existing contact/registration queue.
- `folk` only in v1. `packages/program-config` `modules.dialer` hides the shared Campaign tab in gita-life; it is a **presentation** gate, never an authorization gate.

## Decided

- **Calling mechanism is human click-to-call.** The caller presses a button, the native phone app opens with the number, they talk, return, and record the outcome. No provider, no `call_duration`. **Option A in `calling-mechanism.md`.** *(decided 2026-10-09)*
- **The free-form per-campaign survey builder ships.** Not a fixed outcome set. `dialer_survey_options` is therefore a real table, choice questions require options, and a builder with validation ships in v1. *(decided 2026-10-09)*
- **`folk` only in v1.** The `campaigns` tab is gated on `modules.dialer`, which is `true` for folk and `false` for gita-life. This is the first live exercise of a mechanism declared but never read. *(decided 2026-10-09)*
- **Caller surface is `/dialer`, separate from `/manage`.** `/manage` is `requireRole(["Admin","Preacher"])` and `contacts` RLS has no caller-role term, so the caller session has no path into the portal. *(decided 2026-10-09)*
- **Caller contact reads are service-role behind an explicit scope assertion**, not a new `contacts` RLS term. *(decided 2026-10-09)*
- **CAP-10 deferred to v2**, and if it ships it uses typed tools, never model-generated SQL. The source's `run_dynamic_sql` — arbitrary SQL over the whole database, gated only on `role = 'ADMIN'`, with the provider key in a client-readable table — does not ship to a browser tab. *(decided 2026-10-09)*
- **CAP-11 cut.** Redundant with `call_outcome` + `follow_up_status`, and it would add a public unauthenticated surface. *(decided 2026-10-09)*
- **Browser app and PWA, with a phone caller surface and a desktop admin surface.** No native client. The queue is a **virtualised window** rather than a rendered list — a realistic queue is 300–500 contacts, and full rendering would jank on every advance, mid-conversation. *(decided 2026-10-10; device split confirmed 2026-10-25)*
- **Campaigns are cancelled, never deleted; survey questions are retired, never deleted.** Both are `on delete cascade` targets, so a delete is silent and total. `status = 'CANCELLED'` and `retired_at` exist for this. *(decided 2026-10-10)*
- **The session summary offers a recall.** Finishing reports what was achieved and offers to re-queue everyone not picked up, bounded by a per-campaign attempt cap (default 3). A contact who was busy at 7pm is not a contact who declined. *(decided 2026-10-10)*
- **Only one session per queue at a time.** Enforced by `unique (assignment_id, attempt)` — the real guarantee — with a browser-side lock as the courtesy. *(decided 2026-10-10)*
- **The leaderboard ranks on completed attempts in v1.** Nothing in the system can verify a conversation happened, so no quality signal is claimed. The conversion that *would* be real — people called who then attended a session — is measurable by joining `dialer_call_logs` to `attendance` by contact and date, and is the natural v2 ranking. *(decided 2026-10-10)*
- **Contact profile fields resolved.** Existing `contacts` columns for the call surface; a small `dialer_contact_profiles` extension for `centre`, `level`, `gender`, `language`; everything else — `caste`, `religion`, `t_shirt_size`, `folk_guide`, residency intent and ~20 more — is dropped. `folk_hkmc` does not absorb speculative programme data. *(decided 2026-10-09)*
- **The current `campaign.figcraft` is the final UI authority.** The current file has three pages and 25 frames; the older 18-frame summary and `preview/dialer/*` exports are historical evidence, not authority. The separate `Mobile — Dialer` page was dropped intentionally; its caller states are integrated into `Mobile — Campaign`. *(decided 2026-10-25)*
- **Campaign is a top-level navigation destination, not a `/manage` tab.** The final design gives it a desktop Campaign pill and a phone bottom-nav Campaign item; the exact route is for architecture. *(decided 2026-10-25)*
- **Desktop is admin; phone is the caller.** Fine-grained contact selection and assignment are desktop-only. The phone admin surface covers overview, reports, callers and the Campaign menu; it does not reproduce the contact grid. *(decided 2026-10-25)*
- **Weighted multi-caller assignment is part of CAP-5.** Weights are a UI distribution rule; only the resulting per-contact assignments persist. The split is floor division plus largest-remainder. *(decided 2026-10-25)*
- **The current design's missing CAP-6/CAP-7/CAP-9 states are design omissions, not descopes.** On-the-call/I'm back, Skip, Pause, gap countdown, campaign-switch notice, separate outcome/follow-up/survey, save receipt, queued-offline receipt, save-failed/paused, summary/re-queue, empty states and resume-session remain required. *(decided 2026-10-25)*
- **Disposition is one explicit `Save & continue` commit with a persistent receipt and a localStorage draft.** Autosave may back the draft; there is no separate save dialog. *(decided 2026-10-25)*
- **Disposition queueing is offline-capable.** The dialer uses its own Background Sync queue for `/api/dialer/disposition`; the caller sees `Queued — will send` and never a false failure. The endpoint is idempotent on `(assignment_id, attempt)`. *(decided 2026-10-25)*
- **All staff roles can be callers.** Admin, Preacher, Volunteer and Assistant may hold a `dialer_callers` profile; program and assignment scope still come from `getStaffContext()` and the caller row. *(decided 2026-10-25)*
- **Import roster is out of v1.** Callers are created through the invite/promote flow only; the design control is removed. *(decided 2026-10-25)*
- **`call_outcome` and `follow_up_status` are distinct fields.** `call_outcome` records what happened on the attempt; `follow_up_status` records the post-answer relationship and is collected only when the outcome is `ANSWERED`. The design's single `Status` list must be split or mapped. *(decided 2026-10-25)*
- **Confirmed is a first-class reporting stat.** Its source must be a standard outcome field, not an arbitrary campaign survey question; the data-model definition is still open. *(decided 2026-10-25)*

## Open Questions

- **How does the design's single `Status` list map to the data model?** The spec requires separate `call_outcome`, conditional `follow_up_status` and campaign survey answers. The design's list mixes them; `data-model.md` has the definitions and a proposed split, but the final chip mapping must be settled before the disposition migration.

- **What is the source of the Confirmed metric?** The options are to reuse `follow_up_status = 'JOINED'`, add a `CONFIRMED` follow-up value, add a separate attendance-intent field, or make the `Status?` survey question standard. Deferred until the database options are reviewed in architecture.