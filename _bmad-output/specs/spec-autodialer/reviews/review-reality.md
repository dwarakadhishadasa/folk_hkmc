# Reality-check review — FOLK Autodialer architecture spine

**Reviewer role:** reality-check reviewer, architecture-spine gate
**Date:** 2026-10-25
**Subject:** `ARCHITECTURE-SPINE.md` (status: draft), checked against the live repository and against external sources fetched today
**Spine edits made by me:** none. Advisory only.
**Sibling reviews:** `review-security.md` (H1–H5), `review-adversarial.md`. Where this review overlaps I cross-reference rather than repeat.

---

## Verdict

**Request changes — the spine is sound in shape, but three of its "this is already true in the repo" premises are false, and two of them would silently disable the boundary it claims to protect.**

The stack table is accurate to the lockfile and the "16.4.3 is current" check is genuinely right, which tells me the author did check npm rather than recall versions. The RLS-helper, paging, nav and service-worker *behaviour* claims all check out. What does not check out is the **shape** of three touched files:

1. `proxy.ts` — the matcher the spine tells you to edit is not the file Next reads. Edited literally, `/campaigns/**` and `/api/dialer/**` get **no** session refresh.
2. `apps/*/public/sw.js` — these are symlinks to one file, not two copies. The "both copies" instruction has no target, and gita-life's served worker necessarily gains the dialer path.
3. `modules.dialer` — does not exist. It is a new required key on a closed shared-package type, not an inherited flag.

None of the three is hard to fix; all three change what a developer would actually do. The remaining findings are version/CVE and contract-precision items.

---

## Evidence base

### Repository (read today)

| Read | What it establishes |
|---|---|
| `proxy.ts` `:8-19`; `apps/folk/proxy.ts` `:1-20`; `apps/gita-life/proxy.ts` `:1-20` | **Three** proxy files. The two app-local ones hold the matcher Next actually uses; root `proxy.ts` is the handler module and its `config` export is inert |
| `apps/folk/public`, `apps/gita-life/public`; `git ls-tree HEAD apps/folk` | Both `public` dirs are committed **symlinks** (`120000`) to `../../public`. `stat` shows one inode for all three `sw.js` paths |
| `apps/folk/public/sw.js` `:6`, `:8-18`, `:108`, `:252-262`, `:297-301`, `:326-328` | Exact-path `QUEUED_POST_PATHS`; `/campaigns` absent from network-only; drain on `ok \|\| 409`; 202 body; Background Sync **listener** exists but nothing registers the tag here |
| `components/header.tsx` `:211-224`, `:289-305`, `:334-355` | One `navItems` array feeds both the desktop pill and `data-mobile-app-nav`; Volunteer today gets Contact only |
| `lib/auth-context.tsx` `:197-200` | `isPreacher` is `role === "Admin" \|\| role === "Preacher"` — not the server predicate |
| `lib/authz.ts` `:36-56`, `:121-132`, `:179-213` | `AuthzError`, `requireRole`, `getStaffContext`, `authzErrorResponse`; `userId === supabaseUserId === public.users.id` |
| `lib/supabase/manage.ts` `:40-42`, `:196-225`, `:1140-1159` | `collectPagedRows` page size 1000, 50-page backstop, throws `manage_paging_truncated`; contact delete maps **any** 23503 to "has attendance" |
| `packages/program-config/src/types.ts` `:16-26`; `programs/folk.ts` `:16-22` | `modules` is a closed 5-boolean shape; no `dialer` key |
| `lib/current-program.ts` `:1-9`; `components/providers.tsx` `:22`; `components/offline-indicator.tsx` `:45-119` | `modules` is client-reachable via `currentProgramProfile`; `OfflineIndicator` is globally mounted and posts `SYNC_QUEUE` on mount/online/visibility |
| `components/attendance-form.tsx:40`, `components/contact-form.tsx:56`, `apps/folk/app/register/page.tsx:84` | The only `registration.sync.register("sync-requests")` calls in the repo |
| `supabase/migrations/20261006000000_add_users_and_contact_columns.sql:16-28`; `20261006010000_scoped_rls_policies.sql:41-85`, `:133-143`, `:169-182` | `public.users.id` FK → `auth.users(id)`; `caller_*` helpers are `SECURITY DEFINER` over `public.users`; contacts RLS gives a Volunteer **zero** rows; only *function* grants are revoked |
| `supabase/config.toml:18`, `:36`; `turbo.json`; `next.config.mjs` | `max_rows = 1000`; `major_version = 17`; build env narrow with `passThroughEnv: [SUPABASE_SERVICE_ROLE_KEY]`; `ignoreBuildErrors: true`, no `cacheComponents` |
| `e2e/fixtures/roles.ts:27-30`; `playwright.config.ts:68`, `:84-122` | Role matrix is admin/preacher/volunteer only; `workers: 1` |
| `e2e/specs/manage-contacts-row-lifecycle.spec.ts:317, 894`; `grid-row-context-menu.spec.ts:237` | Three assertions pin the deletion 409 message and code |
| `pnpm-lock.yaml`; `package.json:5,27,108,124,130,134-136` | Resolved versions below |

### External (fetched today, 2026-10-25)

- `registry.npmjs.org` — `next` latest **16.4.3**; `typescript` latest **7.0.2**; `react` **19.3.1**; `tailwindcss` **4.3.3**; `@playwright/test` **1.64.1**; `turbo` **2.11.10**; `pnpm` **12.15.0**.
- `nextjs.org/docs/app/api-reference/file-conventions/proxy` — proxy file must sit "at the same level as `pages` or `app`"; named export `proxy` is valid; `:path*` is *zero or more* segments, so `/campaigns/:path*` covers `/campaigns`.
- `api.osv.dev` — vulnerability queries for `next@16.0.7`, `@supabase/ssr@0.10.2`, `@playwright/test@1.62.0`; GHSA detail for fix versions.
- `postgresql.org/docs/17/ddl-generated-columns.html` — only stored generated columns exist in 17; expression must be immutable; the column cannot be written except `DEFAULT`.
- `supabase.com/docs/guides/database/postgres/row-level-security` — current guidance: new tables in `public` receive **every** privilege for `anon`/`authenticated` by default, including `maintain` on PG 17; adding policies does not remove grants.
- `api.github.com/repos/supabase/cli` — `v2.98.2` exists (2026-05-05); latest `v2.122.0` (2026-10-23).

No dialer code exists yet (`apps/folk/app` has no `campaigns`; `grep -rn dialer scripts apps lib components supabase` → nothing), so everything below is a check of premises and contracts.

---

## Findings

### R1 — `proxy.ts` is not the file with the matcher (High)

**Rule claimed.** AD-1: "`proxy.ts` matches `/campaigns/:path*` and `/api/dialer/:path*`."

**Reality.** Next resolves `proxy.ts` at the **project root**, "the same level as `pages` or `app`" (docs, fetched today). Each app is its own Next project: `apps/folk/next.config.mjs`, `apps/folk/app/`, `apps/folk/.next/`.

- `apps/folk/proxy.ts:8-19` and the byte-identical `apps/gita-life/proxy.ts:8-19` hold the matcher array.
- Root `proxy.ts:8-19` also exports a `config`, but nothing reads it: root is imported as a plain module by the shims (`apps/folk/proxy.ts:2` → `import { proxy as rootProxy } from "../../proxy"`). Its `config` export is a dead property.
- The repo already speaks this way inaccurately: `docs/architecture.md:28`, `docs/project-overview.md:26`, and `e2e/fixtures/auth.ts:245` all call the root file "the matcher". The spine inherited the belief instead of checking it.

Both arrays are byte-identical today, so the built `functions-config-manifest.json` cannot disambiguate the two candidates; the docs rule (file must sit beside `app/`) plus the shim's existence (`apps/folk/proxy.ts` imports `../../proxy` precisely because Next requires an app-root entry) settle it. If a reviewer prefers to prove it rather than infer it, add a temporary matcher to the app-local file and watch it appear in `apps/folk/.next/server/functions-config-manifest.json`.

**Consequence.** An implementer who follows AD-1 literally edits root `proxy.ts`, ships no matcher change, and `/campaigns/**` and `/api/dialer/**` never refresh the Supabase cookie — precisely the failure AD-1's "Prevents" clause names. It also repeats the known `/manage` gap: `/manage` is absent from *both* app matchers today, and a reviewer comparing root-vs-app would not notice.

**Required change.** Name both files and both matchers: `apps/folk/proxy.ts` and `apps/gita-life/proxy.ts`. Either state "edit both, keep them identical" or make the app file re-export the root `config` (one source of truth). Add the matcher text to the static guardrail so a future app-local proxy cannot diverge silently. If AD-1 wants `/manage` fixed at the same time, say so or say it stays out of scope.

---

### R2 — `apps/*/public/sw.js` are symlinks, not copies (High)

**Rule claimed.** AD-1: "both `apps/*/public/sw.js` copies list `/campaigns` in `NETWORK_ONLY_PATH_PREFIXES`"; AD-10: "`/api/dialer/disposition` joins `QUEUED_POST_PATHS` and `/campaigns` joins `NETWORK_ONLY_PATH_PREFIXES` in both `apps/*/public/sw.js` copies."

**Reality.** `git ls-tree HEAD apps/folk` shows `apps/folk/public` as mode `120000` → `../../public`; `apps/gita-life/public` is the same. `stat -c '%i'` returns **one** inode for `apps/folk/public/sw.js`, `apps/gita-life/public/sw.js` and `public/sw.js`. There is one file, tracked as `public/sw.js`. (AGENTS.md's "exists in three copies… edit the app copies; a root-only edit ships nothing" is itself stale for this check-out.)

**Consequence.**
- There is nothing to keep "both" in sync. A copy-parity guardrail would compare a file to itself and pass vacuously.
- gita-life's served worker **will** contain `/campaigns` and `/api/dialer/disposition`. No route exists there, so it is inert, but AD-14's "no Campaign route, page or API in gita-life" and AD-1's "gita-life inheriting by accident" cannot be enforced at this layer. Say that the worker is shared and the two strings are the only gita-life exposure.
- The instruction sends an implementer to two paths that are links; a reviewer asked to verify "both copies" has nothing to compare.

**Required change.** Rewrite both rules against `public/sw.js` (single file), state that both apps serve it, and drop the copy-parity idea. If gita-life isolation matters, gate the two constants on `PROGRAM_ID` at build time or accept and document the shared worker.

---

### R3 — Next 16.0.7 carries four HIGH proxy-bypass advisories; "upgrade out of scope" was not risk-checked (Medium-High)

**Rule claimed.** Stack: "Next.js 16.0.7 (repo pin; 16.4.3 is current, upgrade out of scope)."

**Reality.** The version facts are correct — `pnpm-lock.yaml` pins `next@16.0.7`, and npm `latest` is `16.4.3` (verified today). But OSV reports, for `next@16.0.7`:

| Advisory | Severity | Fixed in |
|---|---|---|
| GHSA-267c-6grr-h53f / CVE-2026-44575 — Middleware/Proxy bypass via segment-prefetch | HIGH | 16.2.5 |
| GHSA-26hh-7cqf-hhc6 / CVE-2026-45109 — same class, incomplete fix follow-up | HIGH | 16.2.6 |
| GHSA-492v-c6pp-mqqv / CVE-2026-44574 — Middleware/Proxy bypass via dynamic route parameter injection | HIGH | 16.2.5 |
| GHSA-6gpp-xcg3-4w24 / CVE-2026-64642 — Middleware/Proxy bypass, Turbopack + single locale | HIGH | 16.2.11 |

plus CRITICAL remote-code-execution advisories (image-optimizer SVG/AVIF; `use cache` + typed arrays) and a long tail of HIGH DoS/SSRF entries.

**Consequence.** AD-1 adds two new proxy-matched route trees and treats the matcher as the session-refresh guarantee. AD-2/AD-7 correctly do not rely on proxy for authorization — `requireRole` runs in pages and handlers — so the *authorization* boundary survives. But the *refresh* guarantee AD-1 claims is implemented by a proxy build with known bypass classes. Declaring the upgrade out of scope without recording that trade-off is the kind of assertion this gate exists to catch.

**Required change.** Either (a) narrow the claim: "proxy is session refresh, never authorization; a bypass costs a stale session, not access", or (b) schedule the bump to ≥16.2.11 before Campaign routes ship, with `eslint-config-next` to match. Do not leave it as an unqualified "out of scope".

---

### R4 — "DELETE is not granted to any role" is false by Supabase default (Medium)

**Rule claimed.** AD-12: "No endpoint deletes either, and `DELETE` is not granted to any role." Conventions: "Mutations: service-role only."

**Reality.** Supabase's current RLS guide (fetched today) states that on existing projects a new table in `public` "starts with every privilege already granted to all three roles" — `select, insert, update, delete, truncate, references, trigger`, and `maintain` on PG 17 — and that "adding policies doesn't take those grants back". This repo revokes only **function** grants (`20261006010000_scoped_rls_policies.sql:133-143`); no migration contains `REVOKE ALL ON TABLE`. What blocks a delete today is the absence of a DELETE *policy*, and no table is `FORCE ROW LEVEL SECURITY` (the migration header says so explicitly), so the owner bypasses RLS.

**Consequence.** AD-12 and the "service-role only" convention describe the outcome (no delete path) but name the wrong mechanism (grant). If a future migration adds a permissive policy, or a table is created without RLS, the grant is already there.

**Required change.** Bind the mechanism: `REVOKE ALL ON TABLE … FROM anon, authenticated` in the same migration, then grant back the reads the dialer needs; and state that "service-role-only writes" means "no INSERT/UPDATE/DELETE policy **and** no client grant". This also makes the RLS defence-in-depth in AD-3/AD-14 do real work rather than sitting under a bypassable app gate.

---

### R5 — `ON DELETE RESTRICT` on `dialer_assignments.contact_id` collides with the existing delete contract (Medium)

**Rule claimed.** AD-12: "`dialer_assignments.contact_id` is `ON DELETE RESTRICT`: a contact with dialer history cannot be deleted through `/manage`, because the cascade would destroy the calls."

**Reality.** `lib/supabase/manage.ts:1149-1156` maps **any** `23503` on a contact delete to:

```ts
new AuthzError(409, "manage_contact_has_attendance",
  "This contact has attendance recorded against it and cannot be deleted.")
```

Three e2e assertions pin that exact string and code: `e2e/specs/manage-contacts-row-lifecycle.spec.ts:317` and `:894`, `e2e/specs/grid-row-context-menu.spec.ts:237`. The comment at `:1125-1132` explains the mapping exists because `attendance.contact_id` has no cascade.

**Consequence.** A contact blocked by *dialer* history will be reported to the admin as having *attendance* — wrong reason, same code, and any new dialer assertion on this path either duplicates the attendance string (misleading) or replaces it (breaking three existing tests). The spine lists `lib/supabase/manage.ts` nowhere, yet the change forces an edit there, in a file `docs/architecture/testing.md:271` puts in the full-e2e blast radius.

**Required change.** Decide the mechanism before build: pre-check `dialer_assignments` in `deleteManageContact` and return a distinct `manage_contact_has_calls` 409, **or** inspect the violated constraint name instead of the bare SQLSTATE. Either way, list `lib/supabase/manage.ts` and the three assertions as touched.

---

### R6 — `modules.dialer` does not exist; it is a shared-package type change (Medium)

**Rule claimed.** AD-2: "`modules.dialer` gates the single header item, which feeds both the desktop pill and the phone bottom nav"; AD-14: "`modules.dialer` hides the shared header item only".

**Reality.** `packages/program-config/src/types.ts:19-25` declares `modules` as exactly `publicRegistration`, `publicAttendance`, `staffContacts`, `sessions`, `staffInvites`. Both `programs/folk.ts:16-22` and `programs/gita-life.ts:18` enumerate those five. There is no `dialer` key, and no gate enumerates module keys (`scripts/verify-program-readiness.mjs` does not read `modules`).

The mechanism is viable — `currentProgramProfile` (`lib/current-program.ts`) already exposes `modules` to the client and the header imports that module for `branding` — but it requires a change to a shared package used by both apps, plus `guardrails` and `typecheck:workspace`.

**Consequence.** The spine records an inherited flag that must be designed. Also, the "single header item" is currently unreachable for Volunteers: `header.tsx:211-224` yields Contact only for a Volunteer, so AD-2 adds a branch, not a flag to an existing item — and a Volunteer who is not a `dialer_callers` row gets a header link to a page that will 403, a state AD-2 does not name (the empty-state convention covers "no campaigns", not "not a caller").

**Required change.** Record the `packages/program-config` type + both profiles as touched files, state the gita-life value (`false`), and define the non-caller Volunteer state.

---

### R7 — The e2e role matrix has no Assistant (Medium)

**Rule claimed.** AD-2: three roles on the admin surface, including Assistant. AD-3: Assistant scope is `{ kind: "preacher", userId: staff.assignedPreacherUserId }`. Conventions: "per-role `storageState`".

**Reality.** `e2e/fixtures/roles.ts:27-30` defines `E2ERole = "admin" | "preacher" | "volunteer"` and `E2E_ROLES` with those three; `playwright.config.ts` sets up exactly `setup-admin`, `setup-preacher`, `setup-volunteer`.

**Consequence.** Assistant is the role whose scope derivation is the most fragile (`assigned_preacher_id`, which `caller_assigned_preacher_id()` NULLs when the preacher is inactive), and it is the one role the harness cannot sign in as. AD-8's three-case sweep never exercises it; AD-3's Assistant branch would ship untested. The security review's H5 (nullable scopes) makes this worse.

**Required change.** Add an Assistant fixture (and a second Assistant with no assigned preacher, expecting zero rows — not the whole program), or state explicitly that Assistant is unit-verified only and name the test that proves the NULL-to-empty behaviour.

---

### R8 — AD-5's single function returns four shapes, and has no precedent here (Medium)

**Rule claimed.** AD-5: "one `campaign_progress(campaign_id, scope_preacher_id uuid)` function … returns the funnel, the outcome mix by `status_group`, the per-caller rollup, the skipped / wrong-number / closed-after-cap counts … and the recent-activity rows."

**Reality.** A Postgres function returns one type. Four heterogeneous result shapes mean either a `jsonb` document or four functions (or `REFCURSOR` juggling). No migration in this repo defines a `RETURNS jsonb` function or a `SETOF` reporting function — the only RPC precedents are scalar predicates (`caller_role()`, `caller_can_read_attendance_session(uuid)`).

Also under-specified for a "consistency contract":
- `scope_preacher_id IS NULL` must explicitly mean **program** scope (Admin) and must be distinguishable from an unassigned Assistant, which must mean **no rows** (cross-ref security review H5).
- "Latest reached log" has no deterministic order. `called_at` is insert-time and never updated (AD-6), so a replay can order before an earlier call, and two rows can share a second. Use `(attempt DESC)` or `(called_at DESC, attempt DESC)` and say so.

**Required change.** Fix the return contract in the spine (`RETURNS jsonb` with named keys is the least-bad fit) and the ordering tiebreaker. This is a sentence, but it is the difference between four screens agreeing and four screens each writing their own SQL.

---

### R9 — The `(assignment_id, attempt)` constraint is not a single-session guarantee (Medium)

**Rule claimed.** AD-9: "`unique (assignment_id, attempt)` is the real single-session guarantee; a `BroadcastChannel` lock with a `localStorage` fallback refuses a second tab."

**Reality.** The constraint guarantees at most one log per attempt. It does not stop a second device (or a second browser profile, where neither BroadcastChannel nor localStorage is shared) from reloading, being handed the *next* attempt, and writing it — consuming attempt 2 for one physical call. That is a cap-accuracy and reporting problem, not a duplicate-write problem. The broadcast lock is best-effort by nature and cannot cover cross-device.

**Required change.** Call the constraint what it is — an idempotency guard, not a session lock — and either accept the cross-device double-attempt (document it) or add a write-time rule (e.g. reject an attempt whose `next_call_date`/gap has not elapsed, or an `attempt` no greater than the count of `PENDING` transitions).

---

### R10 — Offline replay has no bound trigger for the dialer (Medium)

**Rule claimed.** AD-10: "`sw.js` drains on `ok || 409`… A queued disposition is not counted in reporting until its replay lands."

**Reality.** `syncQueuedRequests` is fired by (a) a `sync` event for tag `sync-requests`, but nothing in `sw.js` registers that tag — the only registrations in the repo are `components/attendance-form.tsx:40`, `components/contact-form.tsx:56` and `apps/folk/app/register/page.tsx:84`; (b) `self.addEventListener("online")` in the worker (`sw.js:326-328`), which is unreliable in worker scope; (c) a `SYNC_QUEUE` postMessage from `components/offline-indicator.tsx:45-119`, which is globally mounted (`providers.tsx:22`) and fires on mount, `online`, and `visibilitychange` — but only while a page is open.

So a caller who queues a disposition and closes the tab may not replay until they next open any page online. AD-10's "the tab must already be open" is written about the *session*; it silently also becomes the *replay* condition.

**Required change.** Bind the trigger: the caller shell registers `sync-requests` on queue, and/or the spine states that replay is page-open-only. Also note the queue is shared across staff on a device: an entry queued by caller A replays under whoever is signed in next, is refused (403), and — per R11 — is never removed. (Security review H2 covers the lost-disposition path; this is the trigger/replay-identity half.)

---

### R11 — A permanently rejected queue entry is never dropped (Medium)

**Reality.** `sw.js:108` removes the row on `ok || 409` and does nothing otherwise: a 401/403/500 leaves it in IndexedDB forever, retried on every `SYNC_QUEUE`/`online`/`visibilitychange`, with the pending badge stuck. The 202 envelope is only synthesised when `fetch` *throws*; an HTTP rejection while online goes straight to the client (so the "Save failed — session paused" path is fine synchronously), but the *queued* path has no terminal failure state.

**Required change.** Add the terminal rule AD-10 is missing: drop on 4xx that is not 409 (or on a named `permanently_rejected` code), keep retrying only 5xx; and key the queue by user id or clear it on sign-out. Cross-ref security review H2; this is the same storage, different failure.

---

### R12 — "The same predicate" is two different predicates (Medium)

**Rule claimed.** AD-2: "The Campaign sub-nav is built from the same predicate" as `requireCampaignAdmin`.

**Reality.** Server: `requireRole(staff, ["Admin", "Preacher", "Assistant"])` — literal roles (`lib/authz.ts:52-56`). Client: `useAuth()` exposes `isPreacher = role === "Admin" || role === "Preacher"` (`lib/auth-context.tsx:198`), a coarser flag that happens to cover the same set today. A client check written as `isPreacher || isAssistant` agrees with the server by coincidence, not construction; a future change to either side drifts with nothing to catch it.

**Required change.** Export one plain `CAMPAIGN_ADMIN_ROLES` constant (in a module importable from client code — **not** `lib/dialer`, which is server-only) and have both `requireCampaignAdmin` and the header/sub-nav use it. Assert the rendered nav set per role in an e2e header test, which the repo does not have today.

---

### R13 — Stack table: two entries are not what is installed (Low)

| Spine | Resolved | Note |
|---|---|---|
| Tailwind CSS 4.1.9 | `tailwindcss@4.2.0` (`^4.1.9`) | 4.1.9 is the range floor, not the installed version. Latest is 4.3.3 |
| Playwright 1.62.0 | `@playwright/test@1.62.0` **and** `playwright-core@1.63.0` | `package.json:131` adds a direct `playwright-core@^1.63.0`; two copies are installed. Latest is 1.64.1 |

Everything else in the table checks out (see "What checked out"). Supabase CLI 2.98.2 exists (tag 2026-05-05) and latest is 2.122.0 (2026-10-23) — the pin is deliberate, ~24 releases behind; no claim of currency is made, so no defect, but `supabase/config.toml` includes `[experimental.pgdelta]` and `[auth.passkey]` blocks that may postdate the pin. Unknown config keys are normally ignored; I did not run the pinned CLI to prove it.

---

### R14 — Two conventions name artefacts that are not where the spine implies (Low)

- "`lib/supabase/types.ts` regenerated" — there is **no** `supabase:gen-types` script in `package.json`, and AGENTS forbids a bare `supabase` CLI (version pin). The file is generated (its `__InternalSupabase.PostgrestVersion: 'XX'` header is the generator's), so the convention is right and unwired. Add `"supabase:gen-types": "pnpm dlx supabase@2.98.2 gen types typescript --local > lib/supabase/types.ts"` (or the project-specific equivalent) before relying on it.
- "the matching `rls-policy-matrix.md` row" — the only copy is `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md`, a one-off planning artefact in another spec. `docs/architecture/` contains only `testing.md`. Either point at that path or say the dialer carries its own matrix under `spec-autodialer/`.

---

### R15 — Smaller reality notes (Low)

- **Contact-profile FK unbound.** AD-13 adds `dialer_contact_profiles` as "four nullable fields" but never states its `ON DELETE` action. `RESTRICT` repeats R5's misleading 409; `CASCADE` is almost certainly right (a profile is enrichment, not history). Say which.
- **`~1,030 contacts`** is a production figure the repo cannot confirm; the bulk fixture is `--count 1052` (`package.json:47`). The paging rationale stands; the number is unverified.
- **`13 chips`** matches the AD-4 table (counted: 13 values) ✓, but the chip labels themselves live in the source spec and were not re-checked here.
- **`5–300 s` gap presets** — design input, unverifiable from the repo; fine as a binding.
- **Hosted Postgres version** — `supabase/config.toml:36` pins 17 locally and its own comment requires parity with the remote. The hosted project's major version was not verifiable from this repo and was not assumed.
- **`swap` of `module.dialer` into the bottom nav for Volunteers** collides with the existing `OfflineIndicator` fixed bar at `bottom-4` (`offline-indicator.tsx:128`); both are `z-50`. Not architectural, but it will look broken on a phone at the exact moment a disposition is queued. Worth a design note.

---

## What checked out (do not re-litigate)

| Claim | Verdict | Evidence |
|---|---|---|
| Next.js 16.0.7 repo pin; 16.4.3 is current | **True** | `pnpm-lock.yaml`; npm `latest` today |
| `proxy.ts` is the Next 16 file convention, named export `proxy` | **True** | Next docs, fetched today |
| `/campaigns/:path*` covers `/campaigns` itself (`:path*` = zero or more) | **True** | Next docs |
| PostgreSQL 17, `STORED` generated columns, non-writable except `DEFAULT` | **True** | `config.toml:36`; PG 17 §5.4 |
| AD-4's generated `status_group` is enforceable by the DB | **True** | PG 17: cannot be written; immutable CASE is legal |
| Supabase CLI 2.98.2 exists as pinned | **True** | GitHub tag, 2026-05-05 |
| `getStaffContext` / `requireRole` / `AuthzError` / `authzErrorResponse` exist as AD-2 assumes | **True** | `lib/authz.ts:36-56`, `:179-213` |
| `staff.userId` is `public.users.id` and equals `supabaseUserId` | **True** | `lib/authz.ts:121-132`; `users.id` FK → `auth.users(id)` (`:16`) |
| AD-3's Assistant scope mirrors the existing contacts RLS | **True** | `... Assistant AND assigned_preacher_id = caller_assigned_preacher_id()` (`20261006010000:180`) |
| A Volunteer cannot read `contacts` through PostgREST today | **True** | Policy admits Admin/Preacher/Assistant only (`:173-182`) → AD-7's "no general contacts read" holds |
| AD-16's paging rationale and the shared pager | **True** | `manage.ts:196-225`; `max_rows = 1000` (`config.toml:18`) |
| sw.js prefixes and drain rule | **True as stated, absent as required** | `sw.js:6`, `:8-18`, `:108` — the dialer path and `/campaigns` are the change, not a fiction |
| `202 { success:false, queued:true, message }` envelope | **True** | `sw.js:252-262` |
| One nav array feeds desktop pill and phone bottom nav | **True** | `header.tsx:289-305`, `:334-355` |
| No desktop caller layout already the pattern | **True** | Header/bottom-nav split at `md` |
| `export const dynamic = "force-dynamic"` is the existing route-handler convention | **True** | `apps/folk/app/api/contact/route.ts:11` and four others |
| `lib/supabase/env.ts` exists; `turbo.json` env is narrow and need not widen | **True** | `turbo.json` build env + `passThroughEnv` |
| `import "server-only"` is enforced against client graphs | **True** | `scripts/verify-monorepo-guardrails.mjs:247`, `:573-585` |
| Admin-only invite (AD-2) | **True already** | `app/admin/invite/page.tsx:13`, `api/admin/invite-user/route.ts:29` |
| An invited staff user gets both auth and `public.users` rows | **True** | `lib/supabase/data.ts:404-505` (`upsertStaffUser`) |
| CI does not run e2e; AD-8's sweep is a pre-merge human gate | **True** | AGENTS.md; AD-8 does not claim otherwise |
| One e2e runner at a time | **True** | `playwright.config.ts:68` (`workers: 1`) |
| `package.json` is not text-pinned against a new guardrail entry | **True** — safe to edit | Only `test:e2e`, seed and determinism scripts are asserted |
| `pnpm guardrails` is a single script, so AD-8 needs a wiring edit | **True** | `package.json:7`; no spec pins its text |

---

## What was asserted and could not be confirmed

Name these as assumptions in the spine, or check them before build:

1. **`modules.dialer`** — does not exist (R6).
2. **Hosted Supabase Postgres major version** — local is 17; remote unverified.
3. **`~1,030 contacts`** — repo fixture is 1,052; production count unverified.
4. **The 13 chip labels and the 5–300 s presets** — sourced from the design/source app, not this repo.
5. **`supabase@2.98.2` accepting the current `config.toml`** — not executed.
6. **The pinned `next@16.0.7` build being the one deployed to production** — repo pin is 16.0.7; the Vercel project's actual build was not inspected. The CVE finding (R3) applies to the pin either way.

---

## Bottom line for the gate

The spine's *architecture* is coherent and its external version facts are better than average. Its *repo premises* need one pass: fix R1 and R2 (both would misdirect implementation today), decide R3 and R4 (both are security-shaped and were asserted, not checked), and settle R5–R12 before a developer builds from AD-2, AD-5, AD-9, AD-10 and AD-12 literally. Nothing here argues for a redesign; three of the fixes are a file path, a sentence, and a `REVOKE`.
