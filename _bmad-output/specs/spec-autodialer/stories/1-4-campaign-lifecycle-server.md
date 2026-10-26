---
title: 'Campaign lifecycle service layer'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/design-coverage.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `dialer_campaigns` exists and the admin gate exists, but nothing in the server layer can read, create or move a campaign. Without that service, the campaign routes would each have to re-implement the same program filter, field validation, `DRAFT` default and AD-12 transition rules — and the conditional update that makes a lost race a `409` rather than a double-applied status.

**Approach:** Add one server-only module, `lib/dialer/campaigns.ts`, with exactly four operations: list (all statuses, newest date first), read one, create in `DRAFT` with validated defaults, and transition through AD-12's four legal moves. Every operation opens with `requireCampaignAdmin`, every read and write is filtered by `staff.programId`, and every transition is a single conditional update on the source status. Invalid input is refused field by field with a name and a `400`, never silently corrected.

## Boundaries & Constraints

**Always:**
- Every operation calls `requireCampaignAdmin(staff)` first, so a Volunteer is refused before any read or write, including for a malformed id.
- Campaign rows are program-level (AD-3): the list is filtered by `program_id` only, with no preacher narrowing and no per-campaign counts. A count this layer cannot compute is absent, never `0`.
- Ordering is `campaign_date` descending, then `created_at` descending, with `id` ascending as a stable tiebreak so paged reads cannot duplicate or skip a row at a page boundary.
- `createCampaign` inserts `status: "DRAFT"`, `program_id` and `created_by: staff.userId`. Nothing auto-activates. `gapDuration` defaults to 20 and `maxAttempts` to 3 only when the key is absent.
- Validation returns one named `AuthzError` per bad field — `invalid_name`, `invalid_description`, `invalid_campaign_date`, `invalid_campaign_time`, `invalid_gap_duration`, `invalid_max_attempts` — each `400`, each message naming the field.
- The four legal transitions are exactly AD-12: `DRAFT → ACTIVE`, `ACTIVE → COMPLETED`, `DRAFT → CANCELLED`, `ACTIVE → CANCELLED`. Every one is a conditional update on the source status; a lost race is `409 campaign_status_conflict` and is never retried.
- A missing or foreign campaign is `404 campaign_not_found` on the admin surface. There is no caller-surface no-oracle rule here; the error keeps the repo's `{ error, code }` JSON shape through `authzErrorResponse`.
- The module is `import "server-only"`, uses double quotes, `@/*` alias imports, the service-role client, and the `Database` row alias for its row type.

**Never:**
- Do not delete a campaign. There is no `DELETE` path, no `deleteCampaign`, and `COMPLETED`/`CANCELLED` are terminal.
- Do not read or write `dialer_assignments`, `dialer_survey_*`, weights, or survey state. Starting a campaign makes its existing `PENDING` assignments callable through the queue's own filter; this layer does not touch them.
- Do not apply `campaignScope(staff)` to the campaign list. Campaign rows carry no contact, so AD-3 scopes counts and contact-linked lists, not the campaign row itself.
- Do not invent a per-campaign count, a status histogram, or a default for a value that was supplied but invalid.
- Do not edit `apps/**`, `e2e/**`, `components/**`, `package.json` or `playwright.config.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List, no campaigns | Admin in a program with zero rows | `[]` | — |
| List, mixed statuses | Draft, active, completed and cancelled rows | All rows, `campaign_date` desc then `created_at` desc | — |
| List as a Volunteer | Active staff session, role `Volunteer` | No read attempted | `403 forbidden` |
| List with more than one page | More than 1,000 campaigns | Pages concatenated; a full final page at the page budget throws | `500 campaign_list_truncated`, `500 campaign_read_failed` |
| Read own campaign | Admin, campaign in `staff.programId` | The full row | — |
| Read another program's campaign | Campaign id exists under a different `program_id` | Nothing returned | `404 campaign_not_found` |
| Read a malformed id | `"abc"` | No query issued | `404 campaign_not_found` |
| Create, minimal input | `{ name, campaignDate }` | Row in `DRAFT`, `gap_duration = 20`, `max_attempts = 3`, `description = null`, `campaign_time = null`, `created_by = staff.userId` | — |
| Create, padded input | `"  Sunday class  "`, `"  "` description, `"  "` time | Name trimmed, description and time `null` | — |
| Create, empty or over-long name | `""`, 121 characters, non-string | Refused, no insert | `400 invalid_name` |
| Create, non-string description | `42` | Refused, no insert | `400 invalid_description` |
| Create, impossible date | `"2026-02-30"`, `"2026-13-01"`, `"2026-2-1"` | Refused, no insert | `400 invalid_campaign_date` |
| Create, out-of-range time | `"24:00"`, `"9:30"`, `"12:60"` | Refused, no insert | `400 invalid_campaign_time` |
| Create, gap outside 5–300 | `4`, `301`, `20.5`, `"20"`, `null` | Refused, no insert; `undefined` takes the default | `400 invalid_gap_duration` |
| Create, attempts outside 1–10 | `0`, `11`, `3.5`, `"3"`, `null` | Refused, no insert; `undefined` takes the default | `400 invalid_max_attempts` |
| Create, insert rejected by PostgREST | Any write error | No row returned | `500 campaign_write_failed` |
| Start a `DRAFT` | `action = "start"`, current status `DRAFT` | Row returned with `status = "ACTIVE"` | — |
| Complete an `ACTIVE` | `action = "complete"`, current status `ACTIVE` | Row returned with `status = "COMPLETED"` | — |
| Cancel a `DRAFT` or `ACTIVE` | `action = "cancel"`, current status `DRAFT` or `ACTIVE` | Row returned with `status = "CANCELLED"` | — |
| Start a non-`DRAFT` | `action = "start"`, current `ACTIVE`/`COMPLETED`/`CANCELLED` | No status written | `409 campaign_status_conflict`, message names the current status and the action |
| Complete a non-`ACTIVE` | `action = "complete"`, current `DRAFT`/`COMPLETED`/`CANCELLED` | No status written | `409 campaign_status_conflict` |
| Cancel a terminal campaign | `action = "cancel"`, current `COMPLETED`/`CANCELLED` | No status written | `409 campaign_status_conflict` |
| Two requests race one transition | Both read `DRAFT`, both send `start` | Exactly one update matches; the loser re-reads and conflicts | `409 campaign_status_conflict` for the loser |
| Transition a missing or foreign campaign | Unknown id, or another program's id | The conditional update matches nothing and the re-read is empty | `404 campaign_not_found` |
| Non-admin transitions | Volunteer, any action | Refused before the shape check | `403 forbidden` |
| Unknown action at runtime | A value outside `start`/`complete`/`cancel` | Refused, no write | `400 invalid_campaign_action` |

## Human Decisions

1. **A new shared pager rather than a third inline loop.** AD-16 names one shared pager, but it does not exist yet: `manage.ts`'s is private and throws the raw PostgREST error, while `scope.ts`'s is private and roster-specific. `lib/supabase/paging.ts` is the dependency-free home with an injected failure factory, so each caller keeps its own code and message. The two legacy copies are not migrated in this layer — `manage.ts` is a heavily-tested read whose error surface this story should not change — and remain recorded as debt.
2. **Cancel is one conditional update over two source statuses.** `.in("status", ["DRAFT", "ACTIVE"])` instead of two sequential updates or a read-then-write. It is still a single predicate, so a row another request already moved matches nothing and the loser gets the same `409` as any other lost race.
3. **Only `undefined` takes a default.** `null` for `gapDuration` or `maxAttempts` is refused as invalid, not silently replaced with 20 or 3. A form that clears the field is told which field is wrong; a client that wants the default omits the key. The `20`/`3` defaults stay in the service so the API layer cannot invent a different pair.
4. **A blank campaign time is `null`.** An optional form input submits `""`, and refusing that would make an optional field unusable. Blank normalises to null the same way an absent description does; a non-blank value must be exactly `HH:MM` in 24-hour time.
5. **A malformed id is a `404`, and an unknown action is a `400`.** Without the shape check, PostgREST raises a uuid cast error that the service would flatten into a misleading `500`; `assertCampaignIdShape` mirrors `scope.ts`'s assignment check. The action guard is unreachable from the API's own fixed routes, but it keeps a bad runtime value from being reported as a status race.

</frozen-after-approval>

## Code Map

- `lib/dialer/campaigns.ts` — the four service operations, the status/action unions, the input type and the row alias.
- `lib/supabase/paging.ts` — `collectPagedRows` with an injected failure factory; the shared pager AD-16 asks for.
- `lib/dialer/scope.ts` — `requireCampaignAdmin`, the gate every operation applies (read-only here).
- `lib/authz.ts` — `AuthzError` and `StaffContext` (read-only here).
- `lib/supabase/admin.ts` — `createSupabaseAdminClient`, the service-role client (read-only here).
- `lib/supabase/types.ts` — the generated `dialer_campaigns` row (read-only here).
- `supabase/migrations/20261025000000_create_dialer_tables.sql` — the column set and the `status`/`max_attempts`/`gap_duration` CHECKs this layer validates against (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `lib/supabase/paging.ts` — the shared pager, with read-error and truncation factories.
- [x] `lib/dialer/campaigns.ts` — `listCampaigns`, `getCampaign`, `createCampaign`, `transitionCampaign`.
- [x] `lib/dialer/campaigns.ts` — field validation, trimming and the two documented defaults.
- [x] `lib/dialer/campaigns.ts` — AD-12's transition table and the conditional-update race guard.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-4-campaign-lifecycle-server.md` — this record.

**Acceptance Criteria:**
- Given an admin, when they list campaigns, then every status is returned for their program, newest `campaign_date` first, with no preacher narrowing and no invented counts.
- Given a missing, foreign or malformed campaign id, when the admin reads or transitions it, then the answer is `404 campaign_not_found`.
- Given a create request, when a field is invalid, then the insert is not attempted and the error code names that field with `400`.
- Given a valid create request, when it is saved, then the row is `DRAFT` with `created_by` set and `gap_duration`/`max_attempts` from the input or the documented default.
- Given `DRAFT → ACTIVE`, `ACTIVE → COMPLETED`, `DRAFT → CANCELLED` or `ACTIVE → CANCELLED`, when no other request moved the row, then the update returns the new row.
- Given a stale status or a terminal campaign, when a transition is sent, then it is `409 campaign_status_conflict` and the status is not written.
- Given a Volunteer, when any operation is called, then it is `403 forbidden` before a read or write.

## Implementation Notes

### Exported surface

| Export | Signature |
|---|---|
| `CampaignRow` | `Database["public"]["Tables"]["dialer_campaigns"]["Row"]` |
| `CampaignStatus` | `"DRAFT" \| "ACTIVE" \| "COMPLETED" \| "CANCELLED"` |
| `CampaignTransitionAction` | `"start" \| "complete" \| "cancel"` |
| `CreateCampaignInput` | `{ name; description?; campaignDate; campaignTime?; gapDuration?; maxAttempts? }` |
| `listCampaigns` | `(staff: StaffContext) => Promise<CampaignRow[]>` |
| `getCampaign` | `(staff: StaffContext, campaignId: string) => Promise<CampaignRow>` |
| `createCampaign` | `(staff: StaffContext, input: CreateCampaignInput) => Promise<CampaignRow>` |
| `transitionCampaign` | `(staff: StaffContext, campaignId: string, action: CampaignTransitionAction) => Promise<CampaignRow>` |

### Error codes

| Code | HTTP | Raised by | Trigger |
|---|---|---|---|
| `forbidden` | 403 | all four | `requireRole` refuses a Volunteer |
| `campaign_not_found` | 404 | read, transition | malformed id, or no row in this program |
| `invalid_name` | 400 | create | name empty after trim, over 120 characters, or not a string |
| `invalid_description` | 400 | create | description present but not a string or null |
| `invalid_campaign_date` | 400 | create | not `YYYY-MM-DD`, or not a real calendar date |
| `invalid_campaign_time` | 400 | create | not `HH:MM` 24-hour time (blank is accepted as null) |
| `invalid_gap_duration` | 400 | create | not an integer, or outside 5–300; `null` is invalid |
| `invalid_max_attempts` | 400 | create | not an integer, or outside 1–10; `null` is invalid |
| `invalid_campaign_action` | 400 | transition | runtime action outside the union |
| `campaign_status_conflict` | 409 | transition | the conditional update matched no row that still exists |
| `campaign_read_failed` | 500 | list, read, transition re-read | PostgREST read error |
| `campaign_write_failed` | 500 | create, transition | PostgREST insert/update error |
| `campaign_list_truncated` | 500 | list | the page budget ran out on a full final page |

### Transition matrix

| Action | Legal source | Result | Any other source, including terminal |
|---|---|---|---|
| `start` | `DRAFT` | `ACTIVE` | `409 campaign_status_conflict` |
| `complete` | `ACTIVE` | `COMPLETED` | `409 campaign_status_conflict` |
| `cancel` | `DRAFT`, `ACTIVE` | `CANCELLED` | `409 campaign_status_conflict` |

### The race guard

The update carries the source status as a predicate: `.eq("status", …)` for the single-source moves and `.in("status", …)` for `cancel`. PostgREST applies the predicate in the same statement as the write, so a row that moved after the caller read it matches zero rows. `null` from `maybeSingle()` is therefore never treated as success: the service re-reads the row to distinguish a vanished campaign (`404`) from a moved one (`409`), and never retries the update.

### What this layer does not prove

There is no unit runner in this repo and no `/api/dialer/**` route calls these functions yet, so `pnpm test:static` proves the types, the import boundaries and the lint contract only. No row was written and no transition was executed by an automated check; the runtime behaviour described above is unproven until the API layer's route sweep and the UI layer's campaign spec exercise it.

The campaign list pages through `lib/supabase/paging.ts`, but the pager itself is only type-checked. The first runtime proof will be the API layer's list route, which is also the first caller to exercise it.

The API and UI layers still owe: the route-level mapping from a fixed path to `CampaignTransitionAction`, the `authzErrorResponse` handler wrapper, the client form's `fetch` payload shape, the `DRAFT`/`ACTIVE`/`COMPLETED`/`CANCELLED` display, and the gap presets (5/10/20/30/60) whose values this layer accepts but does not enumerate.

`description` is trimmed but has no length cap: neither the story nor the column sets one, and inventing a limit here would refuse input the schema accepts. If the admin surface needs a cap, it is a deliberate validation rule for that surface, not a default this layer should guess.

## Spec Change Log

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — "Monorepo guardrails passed." with the four pre-existing type-import warnings in `lib/auth-context.tsx`, `components/auth-hash-callback.tsx`, `components/invite-user-form.tsx` and `components/staff-auth-shell.tsx`, plus the vacuous `[verify-dialer-route-coverage]` check for the still-absent `apps/folk/app/api/dialer/**`.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — "✖ 16 problems (0 errors, 16 warnings)"; all sixteen warnings are pre-existing and in files this layer did not touch.

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
- No e2e command was run. This layer has no route or page, another runner may hold the shared seeded database, and the story's `pnpm test:e2e campaign-campaigns` scope belongs to the API and UI layers.
- No runtime smoke test was possible: the module is `server-only`, has no route, and the repo has no unit runner. See "What this layer does not prove".

**Post-run state:** no database was contacted, so no row was created or changed.
