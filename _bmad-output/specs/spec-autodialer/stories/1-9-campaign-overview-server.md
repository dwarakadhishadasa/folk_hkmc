---
title: 'Campaign overview and progress service layer'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/data-model.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ux-flows.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The migration defines `campaign_progress(campaign_id, scope_preacher_id, program_scope)` as the one reporting computation, but nothing in the server layer calls it. The Overview page still lists campaigns with no counts, the roster still shows no performance columns (Story 1.6 deferred its AC to this story), and the Reports screen that follows has nowhere to read from. Without a service that resolves the AD-3 scope, calls the function with it, and parses its payload once, every screen would either compute its own funnel or pass a scope argument of its own invention — and `null` for a preacher is the exact value that widens a read to the whole programme.

**Approach:** A new `lib/dialer/progress.ts` owns the function's only call site. `getCampaignProgress` gates on the admin surface, checks the campaign id shape, resolves `campaignScope` **before** the RPC so an Assistant with no active preacher is refused with no program data read, resolves the campaign through `getCampaign` so a foreign program's id cannot reach the function, then calls the RPC once and parses the JSON into a camelCase DTO. `listCampaignsWithProgress` resolves the scope once and calls the same per-campaign helper for each campaign `listCampaigns` returns, keeping a Preacher's campaign row visible with a true-zero summary. `getRosterProgress` reuses those same per-campaign results and sums each caller's rollup by `dialer_callers.id`, so the roster's four performance columns have one source and no client-side count.

## Boundaries & Constraints

**Always:**
- All three entry points open with `requireCampaignAdmin(staff)`. A Volunteer is refused with `403 forbidden` before any read.
- `getCampaignProgress` checks the campaign id's UUID shape and answers `404 campaign_not_found` for a malformed id before any read.
- `campaignScope(staff)` runs before the RPC in every path. `kind: "program"` sends `p_program_scope = true` and `p_scope_preacher_id = null`; `kind: "preacher"` sends `false` and the scope's `userId`. Nothing else is ever sent: no null preacher with `program_scope = false`, no `program_scope = null`.
- `getCampaignProgress` resolves the campaign with `getCampaign(staff, campaignId)` before the RPC. A malformed, missing or other-program campaign is `404 campaign_not_found`; the function derives its program from the campaign row, so this is the only check that stops a foreign program's aggregates being returned for an Admin.
- The RPC is called through `createSupabaseAdminClient().rpc("campaign_progress", { p_campaign_id, p_scope_preacher_id, p_program_scope })`. This module issues no PostgREST insert, update or delete.
- RPC failures map on message and SQLSTATE: `campaign_not_found` (code `P0002`) → `404 campaign_not_found`; `scope_preacher_required` (code `22023`) → `403 campaign_scope_missing`; anything else, including `invalid_scope`, → `500 campaign_progress_read_failed`. The mapping never reads the HTTP status, because PostgREST answers `P0002` with HTTP 500.
- The RPC payload is parsed field by field, never cast. A missing, null or non-numeric count throws `500 campaign_progress_read_failed`; it is never replaced by `0`.
- `listCampaignsWithProgress` returns `{ campaigns: [{ campaign, summary }] }` for every row `listCampaigns` returns. A campaign stays in the list when the caller's scope holds none of its contacts; its summary is then true zeros.
- `getRosterProgress` returns a `Map` keyed by `dialer_callers.id`, the id `CallerRosterEntry.callerId` carries. Each caller's counts are the sum of that caller's row across every visible campaign.
- One RPC call per campaign, reused for every caller in that campaign. At most `PROGRESS_CAMPAIGN_CONCURRENCY = 4` calls are in flight at once.
- The module stays `import "server-only"`, double quotes, `@/*` imports, and camelCase DTOs.

**Never:**
- Do not widen a Preacher or Assistant to program scope, and do not pass a null scope id with `program_scope = false`.
- Do not call the RPC before `campaignScope` has resolved, and do not derive a scope from a request body.
- Do not recompute a funnel, outcome mix, caller rollup or recent-activity list from assignments or call logs in this module or expose the raw snake_case payload.
- Do not filter, re-sort or truncate the function's lists. `recent` is already capped and ordered by the function.
- Do not translate the rollup to `users.id` with a second read; the key is the caller id.
- Do not read a roster entry's missing progress as anything but a true zero; a profile-less row has no caller id, so it cannot hold an assignment.
- Do not select campaigns by status for the roster aggregate: the row list is `listCampaigns`' list.
- Do not add an `/api` route, page, component, migration, e2e spec, package manifest or Playwright config.
- Do not modify `lib/dialer/callers.ts`; the roster-progress read lives here and the UI layer composes it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Progress, Admin | Any campaign in their program | `p_program_scope = true`, `p_scope_preacher_id = null` | — |
| Progress, Preacher | Any campaign in their program | `p_program_scope = false`, `p_scope_preacher_id = staff.userId` | — |
| Progress, Assistant with an active preacher | Any campaign in their program | `p_program_scope = false`, `p_scope_preacher_id = assignedPreacherUserId` | — |
| Progress, Assistant with no preacher | Any campaign | No scope read, no RPC | `403 campaign_scope_missing` |
| Progress, Volunteer | Any request | No read | `403 forbidden` |
| Progress, malformed campaign id | `"abc"` | No scope read, no RPC | `404 campaign_not_found` |
| Progress, missing or other-program campaign | Valid UUID, no row in `staff.programId` | No RPC | `404 campaign_not_found` |
| Progress, campaign read fails | `getCampaign` read fails | No RPC | `500 campaign_read_failed` |
| Progress, campaign removed between reads | RPC raises `P0002 campaign_not_found` | No payload | `404 campaign_not_found` |
| Progress, scope id refused by the function | RPC raises `22023 scope_preacher_required` | No payload | `403 campaign_scope_missing` |
| Progress, null program scope | RPC raises `22023 invalid_scope` | No payload | `500 campaign_progress_read_failed` |
| Progress, any other RPC failure | Unrecognised SQLSTATE or message | No payload | `500 campaign_progress_read_failed` |
| Progress, unreadable payload | Not an object, or a count missing / not an integer | No DTO | `500 campaign_progress_read_failed` |
| Progress, campaign with no assignments | No assignments in scope | `summary` all zeroes, `outcomes`/`callers`/`recent` empty | — |
| Progress, deactivated caller with history | Rollup row for an inactive profile | Row returned with its counts | — |
| Overview, no campaigns | `listCampaigns` returns `[]` | `{ campaigns: [] }`, no RPC | — |
| Overview, Preacher with no contacts in a campaign | Campaign visible, scoped counts zero | Row stays, `summary` all zeroes | — |
| Overview, five campaigns | Five visible campaigns | Five RPCs, at most four concurrent | — |
| Overview, campaign vanishes | One RPC raises `campaign_not_found` | No overview | `404 campaign_not_found` |
| Roster, caller in two campaigns | Rollup rows in both | One entry, counts summed | — |
| Roster, caller with no assignments | No rollup row in any campaign | No key in the map (true zero) | — |
| Roster, staff user without a caller profile | `callerId` absent | No key in the map (true zero) | — |
| Roster, deactivated caller with history | Rollup row exists | Entry present with its counts | — |
| Roster, terminal campaign | `COMPLETED`/`CANCELLED` campaign | Its rollup still counts | — |
| Roster, no campaigns | `listCampaigns` returns `[]` | Empty map, no RPC | — |
| Roster, Volunteer | Any request | No read | `403 forbidden` |

## Human Decisions

1. **`getCampaignProgress` resolves the campaign with `getCampaign` before the RPC, which the brief did not name.** `campaign_progress` reads `program_id` from the campaign row and scopes on that, not on the caller's program, so an Admin passing another programme's campaign id would receive that programme's funnel, outcome mix and recent activity. `getCampaign` is campaigns.ts's existing program-scoped 404, not a new predicate; the RPC's `P0002` mapping stays as the vanish-between-reads case.
2. **The per-caller rollup's `attempted`, `reached` and `confirmed` are counts, not booleans.** The brief described them as booleans on the per-caller rows; the installed migration computes them with `count(*) FILTER (WHERE …)::INT` in the `callers` CTE. The booleans exist only in the internal `stats` CTE and never reach the payload, so the DTO types them as integers.
3. **Roster progress is keyed by `dialer_callers.id`, not `users.id`.** The rollup carries `caller_id` and `caller_name` only — no staff user id — and `CallerRosterEntry.callerId` is already that id. Keying on the user id would need an extra profile read to translate, and the translation is where a caller and a user could diverge.
4. **The roster aggregate covers every campaign `listCampaigns` returns, terminal campaigns included.** A caller's completed work does not stop being true when a campaign is completed or cancelled, and excluding those rows would give the roster a different denominator than the Overview's table above it.
5. **An absent roster key is a measured zero, not an unavailable value.** A staff row with no caller profile cannot hold an assignment, so its true counts are all zero; a caller profile with no assignments in scope has the same true zero. The UI looks up `entry.callerId` and treats a miss as zero — the alternative, seeding every roster entry, would need `listRoster` inside this module and a second source of caller ids.
6. **The fan-out is bounded at four calls.** AD-5 requires one function call per campaign, and AD-16's pager does not apply to a list a SQL function returns. Four in flight keeps the pool small on the seeded programme without serialising the list; the bound is named rather than hidden in a `Promise.all` over every campaign.
7. **An unreadable payload is `500 campaign_progress_read_failed`, not a partial DTO.** The function always returns all eight summary counts and three arrays, so a missing count is a contract breach; defaulting it to `0` would render an unmeasured value as a measurement.
8. **`lib/supabase/types.ts` gains the `campaign_progress` Functions entry.** The migration is committed and the local database has the function, but the declared schema did not. The admin client is untyped today, so nothing changes at the call site; the entry keeps the declared schema truthful for the next typed read, as Story 1.8 did for `assign_dialer_contacts`.

## Code Map

- `lib/dialer/progress.ts` — the three entry points, the camelCase DTOs, the payload parser, the per-campaign RPC helper and its bounded batch, and the RPC error mapper.
- `lib/dialer/scope.ts` — `campaignScope`, `requireCampaignAdmin` and `CampaignScope`, the AD-3 scope this module sends as arguments (read-only here).
- `lib/dialer/campaigns.ts` — `listCampaigns`, `getCampaign` and `CampaignRow`, the visible campaign list, the program-scoped 404 and the row the overview entry carries (read-only here).
- `lib/supabase/admin.ts` — `createSupabaseAdminClient`, the service-role client that calls the RPC (read-only here).
- `lib/supabase/types.ts` — the `campaign_progress` Functions entry, written here to match `20261027010000_campaign_progress.sql`.
- `supabase/migrations/20261027010000_campaign_progress.sql` — the function, its payload keys and the SQLSTATE contract this module maps (read-only here).
- `lib/authz.ts` — `AuthzError` and `StaffContext` (read-only here).
- `_bmad-output/specs/spec-autodialer/stories/1-9-campaign-overview-server.md` — this record.

## Tasks & Acceptance

**Execution:**
- [x] `lib/dialer/progress.ts` — `getCampaignProgress` with the admin gate, the UUID shape check, `campaignScope` before the RPC, the program-scoped campaign read, one RPC call and the camelCase parse.
- [x] `lib/dialer/progress.ts` — the RPC error mapper for `P0002 campaign_not_found`, `22023 scope_preacher_required` and the `campaign_progress_read_failed` fallback.
- [x] `lib/dialer/progress.ts` — `listCampaignsWithProgress`, reusing the per-campaign helper with the scope resolved once and keeping a zero-count campaign row.
- [x] `lib/dialer/progress.ts` — `getRosterProgress`, summing each campaign's caller rollup by `dialer_callers.id` across every visible campaign.
- [x] `lib/dialer/progress.ts` — the exported `CampaignProgressSummary`, `CampaignProgressOutcome`, `CampaignProgressCaller`, `CampaignProgressRecentCall`, `CampaignProgress`, `CampaignOverviewEntry`, `CampaignOverview`, `RosterCallerProgress` and `RosterProgress` DTOs.
- [x] `lib/supabase/types.ts` — the `campaign_progress` Functions entry.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-9-campaign-overview-server.md` — this record.

**Acceptance Criteria:**
- Given an Admin, when the progress is read, then the RPC is called with `p_program_scope = true` and a null scope preacher id.
- Given a Preacher or an Assistant with an active preacher, then the RPC is called with `p_program_scope = false` and that preacher's user id.
- Given an Assistant with no active preacher, then the request is `403 campaign_scope_missing` before the RPC, and no program count is read.
- Given a malformed, missing or other-program campaign id, then the request is `404 campaign_not_found` and the RPC is not called.
- Given a campaign with no assignments in scope, then the summary is zero, the three lists are empty, and the campaign still appears in the Overview.
- Given a Preacher with no contacts in a campaign, then the campaign row remains visible with a zero summary.
- Given the RPC raises `scope_preacher_required` or `campaign_not_found`, then the response is `403 campaign_scope_missing` or `404 campaign_not_found` respectively, keyed on the message, not the HTTP status.
- Given any other RPC failure or an unreadable payload, then the response is `500 campaign_progress_read_failed` and no value is defaulted to zero.
- Given the roster, then each caller's counts are the sum of that caller's rollup across every visible campaign, keyed by `dialer_callers.id`, with one RPC result per campaign.
- Given a roster entry with no caller profile, then it has no progress key, because zero assignments is its true state.

## Implementation Notes

### Exported surface

| Export | Signature |
|---|---|
| `CampaignProgressSummary` | `{ assigned: number; attempted: number; reached: number; confirmed: number; neverAttempted: number; completed: number; skipped: number; pending: number }` |
| `CampaignProgressOutcome` | `{ statusGroup: string; count: number; lastCalledAt: string \| null }` |
| `CampaignProgressCaller` | `{ callerId: string; callerName: string; assigned: number; attempted: number; reached: number; confirmed: number; neverAttempted: number; callsMade: number }` |
| `CampaignProgressRecentCall` | `{ id: string; calledAt: string; statusGroup: string; contactName: string; callerName: string }` |
| `CampaignProgress` | `{ campaignId: string; programId: string; programScope: boolean; summary: CampaignProgressSummary; outcomes: CampaignProgressOutcome[]; callers: CampaignProgressCaller[]; recent: CampaignProgressRecentCall[] }` |
| `CampaignOverviewEntry` | `{ campaign: CampaignRow; summary: CampaignProgressSummary }` |
| `CampaignOverview` | `{ campaigns: CampaignOverviewEntry[] }` |
| `RosterCallerProgress` | `{ assigned: number; attempted: number; reached: number; confirmed: number; neverAttempted: number; callsMade: number }` |
| `RosterProgress` | `Map<string, RosterCallerProgress>` keyed by `dialer_callers.id` |
| `getCampaignProgress` | `(staff: StaffContext, campaignId: string) => Promise<CampaignProgress>` |
| `listCampaignsWithProgress` | `(staff: StaffContext) => Promise<CampaignOverview>` |
| `getRosterProgress` | `(staff: StaffContext) => Promise<RosterProgress>` |

### The RPC contract

```sql
public.campaign_progress(
  p_campaign_id        uuid,
  p_scope_preacher_id  uuid,     -- null only when p_program_scope is true
  p_program_scope      boolean   -- only an Admin sends true
) returns jsonb                  -- { campaignId, programId, programScope, summary, outcomes, callers, recent }
```

| SQLSTATE | Raised message | Meaning | Mapped to |
|---|---|---|---|
| `P0002` | `campaign_not_found` | No campaign with that id | `404 campaign_not_found` |
| `22023` | `scope_preacher_required` | `program_scope = false` with a null scope id | `403 campaign_scope_missing` |
| `22023` | `invalid_scope` | `program_scope` is null | `500 campaign_progress_read_failed` |
| anything else | — | Unrecognised failure | `500 campaign_progress_read_failed` |

The mapping reads the SQLSTATE and message, not the HTTP status: PostgREST answers `P0002` with HTTP 500 and the two `22023` raises with HTTP 400.

### The grain the DTO carries

The function's funnel and campaign counts are assignment-grain: `assigned`, `attempted`, `reached`, `confirmed`, `neverAttempted`, `completed`, `skipped` and `pending` each count assignment rows, and `neverAttempted` is `assigned − attempted` computed inside the same aggregate. `callsMade` and `recent` are log-grain. A queued disposition is absent from every number because it has no call log until its replay lands; this module never adds one. None of these definitions is recomputed here — the parser renames keys and nothing else.

### The Assistant refusal before the RPC

`campaignScope` is the AD-3 resolver, and it refuses a Preacher or Assistant who has no scope id with `403 campaign_scope_missing` rather than falling back to the programme. It runs before the RPC in all three entry points, so an Assistant with no active preacher causes zero `campaign_progress` calls and no count from the programme reaches the caller. The only other place that scope can be wrong is the RPC's own `scope_preacher_required` raise, which is mapped to the same `403` for the case where the two ever disagree.

### The roster aggregation

`getRosterProgress` resolves the scope once, lists the campaigns once, then calls the per-campaign helper for each. Each result's `callers` array is walked once: `assigned`, `attempted`, `reached`, `confirmed`, `neverAttempted` and `callsMade` are added into the entry for `callerId`. The key is `dialer_callers.id` — the same id the assignment and call-log rows carry, and the same id `listRoster` returns as `CallerRosterEntry.callerId` — so the UI joins with a plain lookup and no second read. `listRoster` itself is untouched; this module adds the read and the UI layer composes it.

A caller with no assignment in any visible campaign has no rollup row, so the map has no key for them. That is the true zero, not an unavailable value, and it is the same answer for a staff user who has no caller profile at all: without a caller id they cannot hold an assignment. Deactivated callers are not filtered — the rollup includes every profile with history, which is why the roster's inactive rows keep their counts.

### The campaign row that stays visible

`listCampaigns` is program-level, so a Preacher sees every campaign in the programme. Their summary is zero when none of the campaign's contacts carry their `assigned_preacher_id`. The module does not drop that row and does not substitute a programme-wide count: the row and its zero are both facts the Overview must show.

### Added named failures

| Code | HTTP | Raised by | Trigger |
|---|---|---|---|
| `forbidden` | 403 | all three | Volunteer |
| `campaign_not_found` | 404 | progress, overview | malformed, missing or other-program campaign id, including the RPC's `P0002` |
| `campaign_scope_missing` | 403 | all three | Preacher/Assistant with no scope id, or the RPC's `scope_preacher_required` |
| `campaign_read_failed` | 500 | progress | `getCampaign`'s read failed |
| `campaign_progress_read_failed` | 500 | all three | any other RPC failure or an unreadable payload |
| `dialer_roster_read_failed` / `dialer_roster_truncated` | 500 | all three | inherited from `campaignScope` |
| `campaign_read_failed` / `campaign_list_truncated` | 500 | overview, roster | inherited from `listCampaigns` |

## Spec Change Log

None.

## Review Triage Log

None.

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — "Monorepo guardrails passed." with the four pre-existing type-import warnings in `lib/auth-context.tsx`, `components/auth-hash-callback.tsx`, `components/invite-user-form.tsx` and `components/staff-auth-shell.tsx`, and `[verify-dialer-route-coverage] All 14 route(s) covered by denial sweep.`
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — "✖ 16 problems (0 errors, 16 warnings)"; all sixteen pre-existing and in files this layer did not touch.
- `pnpm exec eslint lib/dialer/progress.ts lib/supabase/types.ts` — no output, exit 0.
- Read-only probes against the already-running local Supabase stack (service-role key from `apps/folk/.env.local`, `campaign_progress` is `STABLE`, no writes):
  - `POST /rest/v1/rpc/campaign_progress` with a campaign id that does not exist and `p_program_scope = true` → `500 {"code":"P0002","message":"campaign_not_found"}`. This is the evidence for mapping on message/SQLSTATE rather than HTTP status.
  - The same call with `p_program_scope = false` and a null preacher → `400 {"code":"22023","message":"scope_preacher_required"}`, the exact message the mapper keys on.
  - The same call with `p_program_scope = null` → `400 {"code":"22023","message":"invalid_scope"}`, which falls into the `500` bucket as documented.
  - `GET /rest/v1/dialer_campaigns?select=id,name,status,program_id&limit=5` → `[]`. The local database has no campaign, so the success payload's keys could not be probed without writing one; the shapes above come from reading the migration.

**Not run:**
- `pnpm test` was not run: no package defines a `test` script, so it would exit 0 without executing anything.
- No e2e command was run, per this layer's verification scope. `pnpm test:e2e campaign-overview` belongs to the API/UI layers: it needs a route, a screen and seeded campaigns, none of which exist yet.
- No successful `campaign_progress` call was made: the local database has no campaign row, and creating one is a write outside this layer.

## What this layer does not prove

There is no unit runner in this repo and no `/api/dialer/**` route reaches this module yet, so `pnpm test:static` proves types, import boundaries and lint only. Everything with a branch in it — the scope-to-argument mapping, the parse of each payload field, the bounded batch, the roster summation and every row of the SQLSTATE table except the three probed above — is verified by reading the code and by the live PostgREST probes, not by an executed success path.

Three things this layer deliberately cannot account for:

- **The success payload's runtime keys.** The DTO's snake_case source keys and integer types come from the migration text, not from a live response: the local database has no campaign, so no payload was returned. The parser is strict on purpose — a wrong key fails loudly at the first call rather than rendering a zero — but the first real read is where it gets proved.
- **The screen and the route.** The stat cards, the campaign table's four count columns, the roster's performance columns, the empty state and the API surface are the downstream layers' work. This layer supplies the numbers and the zero-row rule; it does not render or serialize them.
- **The function's own definitions.** `campaign_progress` is a committed migration outside this layer's scope. This layer proves only that it calls it with the documented arguments and parses the documented shape; whether Attempted, Reached, Confirmed and Never attempted are computed correctly is the SQL's contract, and the e2e spec that watches them is the downstream layer's.
