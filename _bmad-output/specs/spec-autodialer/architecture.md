# Architecture

Where the feature attaches to `folk_hkmc`, and the seams that carry risk.

## 1. Two surfaces, not one

`folk_hkmc` already separates admin work from caller work, and the dialer inherits that rather than fighting it.

| | Admin / Preacher | Caller (any staff role) |
|---|---|---|
| Route | Campaign nav destination (route TBD) | `/dialer` (phone-first; no desktop caller UI) |
| Auth | `requireRole(staff, ["Admin", "Preacher"])` | `requireRole(staff, ["Admin", "Preacher", "Volunteer", "Assistant"])` |
| Data | campaign payload resolved server-side in `page.tsx` | queue payload resolved by a route handler |
| Writes | service-role after `assertXInScope` | service-role after `assertCallerInScope` |

**Final-design implication.** The current `campaign.figcraft` gives Campaign a top-level nav destination — a desktop Campaign pill and a phone bottom-nav item — not a `/manage` tab. The exact route is still an architecture decision; `/manage?view=campaigns` is no longer assumed. The desktop is the admin surface; the phone is the caller surface. Fine-grained contact selection and assignment are desktop-only. The separate `Mobile — Dialer` design page was dropped intentionally; its caller states live in `Mobile — Campaign`. All staff roles may hold a `dialer_callers` profile. See `design-coverage.md`.

**Why the caller surface cannot be a manage-portal tab.** `/manage` is gated by `requireRole(staff, ["Admin", "Preacher"])` in `apps/*/app/manage/page.tsx`, and the `contacts` RLS policy (`20261006010000_scoped_rls_policies.sql:173`) grants rows only to `Admin`, a `Preacher` on their own `assigned_preacher_id`, and an `Assistant` on their preacher's. There is no `Volunteer` term. A Volunteer therefore reads **zero** contacts through the server client — the portal is not merely gated, the underlying data is invisible to that role. Widening either is possible but both are decisions this spec declines:

- widening `/manage` hands every caller the whole manage nav;
- a `Volunteer` term in the `contacts` policy makes a core table depend on dialer tables, which is a coupling the rest of the repo does not have.

The admin Campaign destination is separate from `/manage` for the same reason: the final design makes it a top-level nav item, and its role gate is still `Admin`/`Preacher`.

## 1a. Weighted assignment is a write-time distribution

The final design lets an admin select contacts, add multiple callers and assign weights. That is one batch write, not a new persisted concept:

- The request carries `contactIds[]`, `campaignId`, and `[{callerId, weight}]`.
- The server re-reads the selected contacts and existing assignments, rejects or skips conflicts, computes `N = selected − already assigned`, and distributes `N` by floor division plus largest remainder.
- Only the resulting `dialer_assignments` rows are written. No weight is stored; the distribution is reproducible from the request, not from a later read.
- The write is one transaction. A partial split is not a valid outcome; a failure reports the offending contacts by name.
- The endpoint is admin-only and program-scoped; the browser never chooses a caller outside the program.

## 2. The scope assertion is the security boundary

Since caller reads are service-role, the only thing between a caller and ~1,030 members' phone numbers is an app-level assertion. It mirrors `lib/supabase/manage.ts` `assertManageContactInScope`: read through the RLS-scoped client first, fall back to the service-role client to distinguish *out of scope* (403) from *does not exist* (404).

```ts
// lib/dialer/scope.ts
async function assertCallerInScope(staff: StaffContext, assignmentId: string) {
  // dialer_assignments → dialer_callers → user_id = staff.userId, program_id = staff.programId
  // no result ⇒ 403 forbidden, never a partial row
}
```

Three rules follow, and each is a place a shortcut would become a data leak:

1. **Resolve the queue as one server-side payload.** The browser never receives a general contacts read and never learns an id it was not given.
2. **The assertion returns nothing useful on failure** — 403 or 404, never a row. The source app's equivalent returned a usable row on failure paths.
3. **The caller id is never taken from the request body.** It comes from `staff.userId`. The source app had four competing identity-resolution paths and wrote `call_log.enabler_id` from three different values.
4. **`dialer_callers.is_active` is checked in the write path.** A deactivated caller is refused at disposition time, not merely hidden from the picker. The source hid inactive callers from pickers while leaving them able to write `call_log` rows indefinitely — so a deactivated caller's dispositions kept landing with no way to see who produced them. Note that `public.users.status` is a *different* switch (a staff-level suspension that `getStaffContext()` already enforces); `is_active` is the dialer-level one.

## 2a. From convention to enforced property

`assertCallerInScope` is a hand-written check in application code. **Nothing structurally prevents the next dialer query from forgetting to call it** — no type, no lint rule, no database constraint. Today the only thing verifying it is a single e2e assertion that one caller's assignment id is refused.

And per the repo's own testing policy, **CI does not run e2e at all.** CI runs guardrails, typecheck, build and lint. So the single test protecting the only boundary between a caller and ~1,030 members' phone numbers runs when somebody remembers to run it locally — which is precisely the moment after `lib/authz.ts` or `proxy.ts` has just changed.

**The fix is a sweep, not a better test.** A generated spec that walks every route under `/api/dialer/**` and asserts three things for each:

1. an unauthenticated request is refused;
2. a caller who does not own the resource receives 403 — never a row, never a partial payload;
3. the same request as the owning caller succeeds.

**It enumerates routes from the filesystem, so a new endpoint is covered by existing CI-visible text rather than by remembering to write a test.** A route added without a sweep row fails the sweep, and the sweep is a spec file — so it is asserted by `playwright --list`, which is the part CI and the determinism gate can see.

This converts the boundary from something a developer must remember into something the suite proves.

## 3. Attachment points

| # | Surface | Path | Change |
|---|---|---|---|
| 1 | Caller route | `apps/folk/app/dialer/page.tsx` | new; server component, `getStaffContext` + `requireRole` for all staff roles with a caller profile. **Not created under `apps/gita-life`** — see §3a |
| 2 | Admin Campaign nav | `components/header.tsx` nav item + a new Campaign route/page (exact route TBD) | the final design makes Campaign a top-level pill, not a `/manage` tab; the page owns its Overview/Callers/Reports sub-nav. `modules.dialer` hides the pill in gita-life. |
| 3 | Route handlers | `lib/dialer/api-handlers.ts` + `apps/folk/app/api/dialer/**/route.ts` | thin delegates over shared handlers, `export const dynamic = "force-dynamic"` |
| 4 | Schema | `supabase/migrations/<ts>_*.sql` | 8 tables, `program_id` on each, RLS enabled, `SELECT` policies via `caller_role()`/`caller_program_id()`, plus the `record_call_disposition` RPC |
| 5 | RLS matrix | `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md` | add rows **in the same commit** as the migration |
| 6 | Types | `lib/supabase/types.ts` | regenerate; it is checked in |
| 7 | Program gate | `packages/program-config/src/types.ts` `modules` + both profiles | add `dialer: boolean`. Presentation only — see §3a |
| 8 | Service worker | `apps/folk/public/sw.js` **and** `apps/gita-life/public/sw.js` | add `"/dialer"` to `NETWORK_ONLY_PATH_PREFIXES` in both, even though only folk serves the route. The root copy ships nothing |
| 9 | Proxy | `proxy.ts` + per-app copies | `/dialer/:path*`, `/api/dialer/:path*`, and the new Campaign route, or no session refresh — same gap `/manage` has today |
| 10 | Tests | `e2e/specs/dialer-*.spec.ts` + `e2e/fixtures/dialer.ts` | `getByRole`-first handles, per-`describe` `storageState` |

**Three traps, verified against the code:**

- `contacts.location_ids` is `text[]` while `locations.id` is `uuid` — `lib/supabase/manage.ts:844` already guards this. Any location filter inherits the guard.
- PostgREST caps reads at 1,000 rows and folk holds ~1,030 contacts. `collectPagedRows` throws `manage_paging_truncated` on a full final page; dialer list endpoints must do the same rather than silently truncating.
- `packages/program-config` `modules.*` flags are declared and **never read anywhere in the repo**. `dialer: false` would be the mechanism's first live use, and there is no precedent for what a disabled module does. Enforce with `requireRole` and `program_id`, never with the flag.

## 3a. `folk`-only in v1, expressed two ways

`folk` only is enforced by **route absence**, not by a runtime check:

- **The `/dialer` route and `/api/dialer/**` are not created under `apps/gita-life` at all.** Not gated — absent. There is nothing to reach, so there is no permission check that could be forgotten, and no chance of a gita-life deployment inheriting the feature because someone flipped an env var.
- **`modules.dialer` is still added** — `true` for folk, `false` for gita-life — because `components/header.tsx` is a **shared** component. Both apps render the nav, so the Campaign pill has to be hidden somewhere, and this seam is what it exists for.

That makes this the **first live exercise of a `modules` flag that has never been read anywhere in the repo** (all five existing flags are `true` for both programs and unused). Its defined behaviour here is narrow: `false` ⇒ the tab is not rendered. Authorization is never delegated to it — `requireRole` and `program_id` do that work, and adding `dialer` to a program later is a config change rather than a code change.

The service worker entry is added to **both** copies regardless. The two `sw.js` files are byte-identical and hardcode `folk-chennai-v4` even in the gita-life app, so diverging them for this feature would be a trap for the next person to touch them.

## 4. The call session is client state, and it must stay that way

The session has no server-side authority. The queue is fetched once, the timer runs in the tab, and the only server contact is a write on each disposition. This follows directly from `calling-mechanism.md`: the browser never talks to a telephony provider, so no webhook can wedge the queue.

Consequences that shape the build:

- The queue is a snapshot. A contact reassigned mid-session still appears; the disposition write is what resolves it, and a 403 on write pauses the session loudly rather than discarding the answer.
- The gap timer must be immune to tab throttling — a backgrounded tab throttles `setInterval` to ~1s+ in some browsers and the count will drift. Derive elapsed time from `Date.now()` against a target timestamp rather than decrementing a counter. The tab is backgrounded for the whole of every call, so this is the normal case, not an edge case.
- The session position is recoverable. The source app kept the queue in a `static` field, which is a full data loss on any reload. Position lives in the URL (`/dialer?campaign=<id>`) plus a re-fetch of remaining assignments, not in memory alone.

**One session at a time.** Two tabs on the same queue would each write their own `call_logs` row for the same assignment, and every number the campaign reports would double. Two defences, because either alone is insufficient:

- **`unique (assignment_id, attempt)`** makes the duplicate write an idempotent overwrite rather than a second record. This holds even across two devices, which a browser-side lock cannot.
- **A browser-side lock** (`BroadcastChannel`, with a `localStorage` fallback for older mobile browsers) refuses a second tab up front, so the caller is told rather than left to discover it through a doubled count.

The database constraint is the real guarantee; the lock is the courtesy.

## 5. Persistence for CAP-7

The repo has **no** autosave, `beforeunload` guard, dirty-tracking, `localStorage` draft or `useOptimistic` anywhere in active code. All of it is net-new. Three layers, each earning its place:

| Layer | Mechanism | Covers |
|---|---|---|
| Server | explicit `Save & continue` → `record_call_disposition` RPC | the commit; one transaction writes the call log, responses and assignment status |
| Offline | dialer Background Sync queue for `/api/dialer/disposition` | a network gap during the commit; the write replays on reconnect |
| Client | `localStorage` mirror of the in-flight disposition | a crash before the commit, or a failed save with no network |
| Warn | `beforeunload` while dirty, plus a persistent save receipt | accidental tab close |

Autosave may back the draft, but it is not a second save ritual. The **save receipt** is load-bearing, not decoration: a fixed-position `Saved 12:04` / `Saving…` / `Queued — will send` / `Save failed — session paused`. A toast that disappears is not a guarantee a caller can trust mid-conversation. The queued state is a success state, not a failure; `sw.js` drains a replayed row on `ok || 409`, so the endpoint must be idempotent on `(assignment_id, attempt)`. The dialer queue is separate from the existing `/api/contact`, `/api/registration`, `/registration` and `/attendance` paths.

The RPC is one transaction — call log, responses, assignment status. Writing responses individually against `unique (call_log_id, question_id)` makes a partial failure permanently unrecoverable, which is exactly the source app's bug.

## 6. Why CAP-10 cannot port its mechanism

The source app exposes `run_dynamic_sql` — arbitrary SQL over the entire database — gated only on `contact.role = 'ADMIN'`, with the OpenRouter API key in a `app_config` row the client can read. In an APK that is a defensible internal-tool shortcut. In a browser tab holding a session cookie it is not.

If CAP-10 ever ships it ships as **named tools with server-validated arguments**:

```
campaign_progress(campaignId)      → counts by outcome, completion rate, per-caller
caller_performance(campaignId?)    → leaderboard rows
list_campaigns(searchTerm)         → disambiguates campaign names into the chip contract
assign_batch(contactIds[], callerId, campaignId)  → write, always behind confirmation
```

The model picks a tool and fills arguments; the server validates them against an allowlist and runs a parameterized query. No SQL is ever generated. The `json:choice` fenced-block chip UX — the best idea in the source codebase — ports as the disambiguation mechanism between tools.

## 7. What is intentionally different from the source

| Source | Here | Why |
|---|---|---|
| `contact select ... using (true)` for all authenticated | scoped, program-limited, caller-scoped | the single most important fix in the port |
| `assignment` unique `(contact_id, enabler_id, campaign_id)` | unique `(contact_id, campaign_id)` | with the triple, reassigning creates a second row instead of moving it — which is what the "already assigned to" snackbar was really reporting |
| `survey_question.options` as comma-separated `text` | `survey_option` child table | a comma inside an option is unrepresentable, and MULTI_SELECT reuses the same delimiter |
| `call_duration` column, never written | omitted until option B exists | never ship a column the product cannot fill |
| `IN_PROGRESS` / `SKIPPED` statuses never written | `SKIPPED` actually written | a dead enum is a lie in a schema |
| `audience_filter` stored, editable, never applied | omitted | implement it or drop it |
| Queue held in a `static` field | URL + server re-fetch | static state is a full data loss on reload |
| Provider key in a readable table | server-only module | same lesson as `lib/supabase/env.ts` |
| Campaign auto-created when none exists | one-click empty state instead | a silent default is worse than a blocked admin who can see why |
| `tel:` with no fallback | `tel:` **and** clipboard copy | a phone browser that cannot open the handler otherwise loses the number silently |