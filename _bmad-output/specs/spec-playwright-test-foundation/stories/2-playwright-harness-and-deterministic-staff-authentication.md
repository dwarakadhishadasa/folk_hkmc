---
title: 'Playwright harness and deterministic staff authentication'
type: 'chore'
created: '2026-10-08'
status: 'done'
baseline_revision: '1dd7dc702e541abe7d1c6dc38c496b77e8e2d582'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - _bmad-output/specs/spec-playwright-test-foundation/auth-and-fixtures.md
  - _bmad-output/specs/spec-playwright-test-foundation/local-environment.md
warnings: [oversized]
deferred:
  - summary: >-
      Nothing automated runs the suite — `.github/workflows/quality-gates.yml`
      executes guardrails, typecheck, build, and lint only — so a break in the
      `/login` -> Mailpit OTP -> `verifyOtp` path is observed only when a human
      runs `pnpm test:e2e` by hand.
    evidence: |-
      The gap layer verified this by reading the workflow in full and listing its
      steps; neither `pnpm test:e2e` nor `pnpm test` appears. The demonstration:
      breaking the `Send Code` submit path in
      `apps/folk/app/login/login-page-client.tsx` leaves `quality-gates.yml`
      green, because `pnpm lint` and `pnpm typecheck:workspace` do not exercise
      the runtime path. The suite would catch it, if run.

      Deferred rather than patched because the intent excludes it:
      SPEC.md's non-goals state "No CI workflow changes. Wiring
      `pnpm test:e2e` into `.github/workflows` is a follow-up once the suite is
      green and not flake-prone", and doing it properly needs Supabase and
      Mailpit as CI services — a substantially larger change than this story.
    location: >-
      .github/workflows/quality-gates.yml
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The repo has no committed test runner, so every I/O & Edge-Case Matrix row in every later spec is unverifiable — story 2 of `spec-manage-contacts-table` already halted on `matrix test audit failed` because of it. The missing piece is staff authentication: no spec can start signed in as a known role without a human at the keyboard, and Supabase's 6-digit email OTP is the one step that fails silently if it breaks.

**Approach:** Install `@playwright/test`, add a root `playwright.config.ts` whose **setup projects** sign in once per role by reading the OTP out of Mailpit's HTTP API on `:8025` and writing `storageState` to gitignored files; every ordinary spec then declares `test.use({ storageState: ... })` and never touches `/login`. A `webServer` gate runs `pnpm local:readiness` and boots the folk app. The story's deliverable is one green smoke spec proving stack + seed + OTP + `storageState` + session reuse all work together.

## Boundaries & Constraints

**Always:**
- **Never stub Supabase auth.** Drive the real `/login` → Mailpit OTP → `verifyOtp` path. A stub is exactly what would hide the break this harness exists to catch.
- **Target Mailpit's HTTP API (`:8025`), not Supabase internals** — `GET /api/v1/messages` and `GET /api/v1/message/{ID}` — because Mailpit's message API is a stable documented surface and Supabase's email-delivery internals are not.
- **Poll with a bounded retry keyed on the recipient address; never `waitForTimeout`.** Mail delivery is asynchronous and is the flakiest step in the suite. On timeout, fail with the captured message ids, subjects, and recipients — a bare "timed out waiting for OTP" is the worst possible failure message.
- **Regenerate `storageState` every run** (delete the file, then sign in) so a stale session can never silently poison a run; and make a dead session fail as **`401` with `code: "unauthenticated"`**, not a confusing downstream failure.
- **Add an explicit `.gitignore` entry** for the `storageState` directory. It holds live Supabase session tokens for fixture accounts and the repo's `.gitignore` (`.env*`, `.bmad-loop/runs/`) covers nothing of the sort.
- Local-only. Nothing here may read or write `etwunirahuucodcxydgs`.
- Use Playwright only. **No Vitest, no unit runner** — API-level assertions use Playwright's `request` fixture over real HTTP.

**Never:**
- No CI workflow edits (SPEC non-goal), no `.github/workflows` changes.
- No changes to `scripts/verify-monorepo-guardrails.mjs`, no seed-logic edits, no `turbo` changes beyond the one `test` task.
- No `waitForTimeout` anywhere in the harness, and no reliance on Mailpit's optional `?query=` filter — filter client-side from the full list.
- Do not delete Mailpit messages: a parallel spec's mail must survive. Key on recipient + request timestamp instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Admin smoke | Admin `storageState` reused; navigate to `/` | lands on `/` (Admin's `landingPathForRole`) **with a live session**: `/api/auth/me` returns a staff row whose `role` is `Admin` | landing on `/` with `staff: null` is a failure, not a pass — `/` is also the public page |
| Session reuse | any spec project declaring `storageState` | no `/login` navigation on first navigation | — |
| OTP read | Admin fixture email submitted at `/login` | 6-digit code polled from Mailpit, submitted, session established | absence/unreadable code → fail with the captured message ids, subjects, recipients, and the address polled for |
| Cross-run staleness | a `storageState` file from a previous run exists | setup deletes it and re-authenticates; the file on disk afterwards is from this run | — |
| Dead session | `storageState` carrying a revoked/garbage token | the manage API answers `401` with `code: "unauthenticated"` | must not surface as a downstream page error |
| Role gate | Volunteer `storageState` against the manage API | `403`, not `401` — the 401/403 pair is what distinguishes "session dead" from "role insufficient" | — |
| Unknown email | an address that is not a seeded staff account | sign-in fails visibly; **no account is provisioned** (`shouldCreateUser: false`) | failure surfaces the app's message, not a timeout |
| Artifacts are ignored | `e2e/.auth/` populated after a run | `git check-ignore` reports the `storageState` files as ignored | an unignored token file fails the suite |

</intent-contract>

## Code Map

**Fixture identities (verified against the running local stack — note the program suffix; `auth-and-fixtures.md`'s `preview-fixture-<role>@example.com` is shorthand):**
- `preview-fixture-{admin,preacher,volunteer,assistant}-folk@example.com`, all present in `auth.users`.
- Seed rows are `preview-fixture-` tagged; `pnpm seed:local` is idempotent and asserts DW-3 (`public.users.id === auth.users.id`).

**Sign-in surface — read-only:**
- `apps/folk/app/login/login-page-client.tsx` — `MIN_EMAIL_OTP_LENGTH = 6` (`:10`); `landingPathForRole` (`:13-19`) → **Admin/Preacher `/`, Volunteer/Assistant `/contact`**; `handleSubmit` (`:96-114`) → `login(email)`; `handleVerifyCode` (`:116-129`) → `verifyLoginCode` then `window.location.replace(safeRedirectPath(...))`. Two steps on **one page**, no route change: step 1 renders `getByLabel("Email")` (`:155-164`) + submit whose accessible name is `"Send Code"`/`"Sending code..."` (`:174`); step 2 renders `getByLabel("Email code")` (`:188-202`) + `"Verify Code"`/`"Verifying..."` (`:212`), disabled until 6 digits. Errors render as plain text in `.text-red-700` (`:147-152`, `:181-186`) — no `role="alert"`, no `data-testid` anywhere in `apps/folk`. The page shows a bare `Loading...` until `isHydrated` (`:84-90`), so wait for the form, not `load`.
- `apps/folk/app/login/page.tsx` — server shell only, `force-dynamic`; URL is `/login`, no route group.
- `lib/auth-context.tsx` (repo root, **not** under `apps/folk/`) — `login` (`:118-146`) POSTs `/api/auth/signin` then `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`; `verifyLoginCode` (`:148-170`) strips non-digits, rejects `< 6`, calls `verifyOtp({ type: "email" })` then `completeStaffProfileSync()`; `completeStaffProfileSync` (`:52-75`) POSTs `/api/auth/complete-implicit` with retries `[0, 150, 400]ms`. **No localStorage** — the session is Supabase cookies only, so `storageState` is the only persistence mechanism that works.
- `apps/folk/app/api/auth/signin/route.ts` — `400` on a malformed email, **`403` `"This email is not linked to an active staff account."`** for an unknown/inactive staff row (`:90-92`), `200 { ready: true, email, authEmailBranding }` otherwise. This 403 is what an unknown-email spec sees; `shouldCreateUser: false` is the second line of defence underneath it.
- `apps/folk/app/api/auth/me/route.ts` — returns `200 { staff: null }` when unauthenticated (swallows the 401). Good for proving a session; **useless for proving a dead session.**
- `proxy.ts` (root, re-exported by `apps/folk/proxy.ts`) — refreshes Supabase cookies only, never redirects. `/login` and `/api/auth/*` are outside its matcher. There is no `middleware.ts`. Auth failures on staff pages come from `getStaffContext()` throwing server-side, not from a proxy bounce.

**Status-code surface for the 401/403 pair (read-only):**
- `lib/authz.ts` — `getStaffContext` (`:179`) throws `AuthzError(401, "unauthenticated", "Staff sign-in is required.")`; `requireRole` (`:52`) then throws `403`; `authzErrorResponse` (`:206`) renders `{ error, code }`.
- `lib/manage/api-handlers.ts` — `handleManageContactPhotoUrl` (`:412-424`) is `getStaffContext()` → `requireRole(staff, ["Admin","Preacher"])` → param check. `GET /api/manage/contacts/photo?contactId=<uuid>` is therefore **read-only** and returns `401` for a dead session and `403` for a Volunteer. Auth runs before the contact lookup, so no seeded contact is needed.
- `MANAGE_BULK_MAX_ITEMS = 200` (`:40`) — context only; bulk rows belong to stories 3–4.

**Environment (verified live this run):**
- Supabase `:54321` and Mailpit `:8025` are running; the folk app is not — `webServer` must start it.
- `supabase/config.toml` — `[auth.email.smtp]` → `mailpit:1025` (`:192-203`); `otp_length = 6` (`:250`); `otp_expiry = 3600`; `[auth.rate_limit] email_sent = 2` (`:216-217`) is **not enforced locally** (10 rapid requests at 1.2s spacing all returned `200`), but `[auth.email] max_frequency = "1s"` (`:248`) **is**: two requests inside one second returned `429 over_email_send_rate_limit`. `additional_redirect_urls` (`:155-166`) already allow `http://127.0.0.1:3000` and `localhost:3000`, so either host works as `baseURL`.
- Mailpit message API, exercised directly: `GET /api/v1/messages` returns **newest-first** `{ messages: [{ ID, To: [{ Address }], Subject, Created, Snippet, ... }] }`; `Created` is UTC `…Z`. `GET /api/v1/message/{ID}` returns `Text` where the code appears as `Your FOLK sign-in code is:\n\n*917013*` — starred, so a naive `/\d{6}/` on the whole body is fine here but a body-shaped regex is safer. `POST /auth/v1/verify` with `{ type: "email", token }` was confirmed to return a session for a seeded Admin, so the plan below is verified, not assumed.
- `scripts/ensure-local-mailpit.sh` — container `mailpit`, network `supabase_network_folk_hkmc`, `8025:8025`. `scripts/verify-local-stack-readiness.mjs` (`pnpm local:readiness`) exits `0`/`1`, drains bodies, bounds every probe, and treats `:3000` as a **warning** — so it is a valid `webServer` gate that runs *before* the app starts. `STATUS_TIMEOUT_MS` is `120000`, so the gate's `timeout` must exceed two minutes.

**Tooling:**
- Root `package.json` — `dev:folk` is `pnpm --filter @hkmc/folk dev` → `PROGRAM_ID=folk next dev` on the default port 3000. Existing `test:*` scripts are all `verify-*.mjs`; **`test` and `test:e2e` are free**. devDeps include `playwright-core@^1.63.0` but **not `@playwright/test`** — it must be added at `^1.63.0` to match `~/.cache/ms-playwright/chromium-1234` (revision 1234 is what 1.63.0 resolves).
- `turbo.json` — turbo 2.x `tasks` key with `build`/`dev`/`lint`/`typecheck` only; no package has a `test` script, so a `dependsOn: ["^test"]` task resolves to nothing today.
- Root `tsconfig.json` `include: ["**/*.ts","**/*.tsx"]` with only `node_modules` excluded — `playwright.config.ts` and `e2e/**` are typechecked by it. `strict: true`, `isolatedModules: true`.
- `eslint.config.mjs` — `globalIgnores` does **not** cover `e2e/` or `playwright.config.ts`, so both are linted; Playwright globals need declaring or an override block for that glob.
- `.gitignore` — `.env*`, `.bmad-loop/runs/`, `.turbo/`, etc. Nothing covers `*.json` session artifacts.
- `pnpm-workspace.yaml` globs only `apps/*` and `packages/*` — a root `e2e/` folder is not a workspace package and needs no change.
- Stale docs to correct in the same pass: `CONTRIBUTING.md:36` ("no full automated test suite") and `docs/development-guide.md` §`Current Test Status` (`:285-287`) — the latter is the item story 1 deferred to this story.

## Tasks & Acceptance

**Execution:**
- `package.json` -- add `@playwright/test@^1.63.0` to devDependencies; add `"test": "turbo run test"` and `"test:e2e": "playwright test"` -- one command runs the suite, and the turbo task is reachable.
- `turbo.json` -- add a `test` task (`dependsOn: ["^test"]`, `cache: false`) -- turbo has no test pipeline today, so `turbo run test` currently fails.
- `.gitignore` -- add an explicit block for the `storageState` directory plus `playwright-report/` and `test-results/` -- these hold live Supabase session tokens and nothing else in the file covers them.
- `playwright.config.ts` (NEW, repo root) -- `testDir: "e2e/specs"`, `baseURL` from `E2E_BASE_URL` (default `http://127.0.0.1:3000`), fullyParallel off, retries `0` locally / `1` in CI, reporter `list`; `webServer` array running `pnpm local:readiness` then `pnpm dev:folk` with `reuseExistingServer` and timeouts above the readiness script's 120s status budget; three `setup-*` projects (`admin`, `preacher`, `volunteer`) with `dependencies` wired into the consuming projects; a `smoke-anonymous` project with `storageState: {}` -- the gate, the storageState matrix, and the projects all live in one place.
- `e2e/fixtures/roles.ts` (NEW) -- role → seeded email map (program-aware, `folk` default), the per-role landing path, the per-role `storageState` path, and env overrides -- the one place that knows fixture identities, so a rename touches one file.
- `e2e/fixtures/mailpit.ts` (NEW) -- `readOtpForRecipient(email, { since, timeoutMs, intervalMs })` over `GET /api/v1/messages` + `GET /api/v1/message/{ID}`, newest-first, filtered on `To[].Address` **and** `Created >= since`, bounded retry, and a timeout error that enumerates the captured message ids/subjects/recipients -- the flake-critical seam, and the single reason the harness must not use `waitForTimeout`.
- `e2e/fixtures/auth.ts` (NEW) -- `authenticateAsRole(page, role)`: navigate to `/login`, fill `Email`, submit, wait for the `Email code` field, request the OTP **before** submitting (so the poll carries a `since` watermark), fill the code, submit, wait for the role's landing URL -- the one place the two-step form is driven, so no spec re-implements it.
- `e2e/auth/{admin,preacher,volunteer}.setup.ts` (NEW) -- delete the target `storageState` file, `authenticateAsRole`, write `context.storageState({ path })` -- regeneration every run is what makes staleness impossible.
- `e2e/specs/smoke.spec.ts` (NEW) -- the deliverable plus the story's matrix coverage: the Admin landing-and-live-session smoke; session reuse with no `/login` navigation; the `401` dead-session probe; the Volunteer `403` role gate; the unknown-email failure that provisions nothing; and an offline assertion that the `storageState` artifacts are gitignored -- one spec file, six cheap tests, headline first.
- `eslint.config.mjs` -- declare the Playwright globals for the `e2e/**` glob -- the new files are linted and `no-undef` would fail otherwise.
- `docs/development-guide.md` + `CONTRIBUTING.md` -- replace the "no automated suite" claims with `pnpm test:e2e`, document the storageState gitignore, the Mailpit read path, and re-running twice -- a doc that contradicts the harness costs more than it saves.

**Acceptance Criteria:**
- Given the local stack up and fixtures seeded, when `pnpm test:e2e` runs, then it exits 0 and the Admin smoke spec passes, having driven the real OTP path through Mailpit.
- Given the suite has run once, when it runs again without any manual reset, then it is green again — the setup projects deleted and regenerated the `storageState` files.
- Given a `storageState` whose session token is dead, when a spec uses it against `/api/manage/contacts/photo`, then the response is `401` with `code: "unauthenticated"`, and a Volunteer session on the same route is `403` — the two failures are distinguishable.
- Given a `storageState` file exists on disk after a run, when `git check-ignore -q` is run against it, then it exits 0.
- Given a deliberate failure is introduced into `e2e/specs/smoke.spec.ts`, when `pnpm test:e2e` runs, then it exits non-zero and names the failing spec — a suite that cannot fail is not a gate.

## Spec Change Log

Six deviations from the Tasks & Acceptance list, all forced by a documented Playwright or environment behaviour. Nothing in the intent contract, the matrix, or the boundaries changed.

1. **`@playwright/test` is `^1.62.0` (lockfile resolves 1.62.0), not `^1.63.0`.** `browsers.json` for 1.63.0/1.64.0 asks for `chromium-1243`; the only browser in this environment's cache is `chromium-1234`, which is **1.62.0**'s revision, and the CDN download times out (`Failed to download Chrome for Testing 153.0.8010.12`). Verified with `npx playwright install chromium --dry-run` → install location `~/.cache/ms-playwright/chromium-1234`. The caret means a future lockfile refresh can drift past 1.62 and pull an unavailable browser — re-pin before bumping.
2. **`webServer` is a one-entry array running `pnpm local:readiness && pnpm dev:folk`**, not two entries. Playwright's `WebServerPlugin` rejects `_processExitedPromise` on *any* exit, including exit 0, as `Process from config.webServer exited early` — so a short-lived readiness gate cannot be its own entry. The `&&` chain preserves the intended ordering (assert the stack, then boot the app) and stdout is piped, so the gate's full report is visible in the run output.
3. **The three `setup-*` projects declare their own `testDir: "e2e/auth"`.** `testMatch` filters files discovered under `testDir`; the top-level `testDir: "e2e/specs"` (kept as specified, and what later specs will add to) does not discover `e2e/auth/*.setup.ts` at any `testMatch`.
4. **The `smoke-anonymous` project became a `test.use({ storageState: { cookies: [], origins: [] } })` describe block** inside `e2e/specs/smoke.spec.ts`. The six rows need three identities; a config-level project per identity re-runs all six rows once per project, which is both slower and makes the row names ambiguous in the report.
5. **`readOtpForRecipient` gained an optional `ignoreIds`.** `Created` is second-granular while `since` is `Date.now()`, so a message created in the watermark's own second can parse as *older* than it. The setup now snapshots the mailbox ids before submitting and accepts a message that is either newer than `since` *or* absent from that snapshot — belt and braces against both clock granularity and a leftover OTP from the previous run. `snapshotMessageIds` is the new export that makes this possible.
6. **The dead-session token keeps its `base64-` envelope.** Replacing the whole `sb-<ref>-auth-token` cookie value with a bare JWT makes supabase-js throw client-side (`Cannot create property 'user' on string`) and the 401 then comes from a parse error, not from a rejected token. `deadSessionCookieValue` decodes the envelope and swaps `access_token`/`refresh_token`/`expires_at`, so the server sees the production shape with a token auth refuses. Verified: the server-side `TypeError` is gone from the run log and the route still answers `401 {"code":"unauthenticated"}`.

Also: the "no account is provisioned" row is asserted through Supabase's admin API with the local service-role key from `apps/folk/.env.local`, not left implicit. It throws when the key is absent rather than degrading to a vacuous pass.

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 71 findings — high 0, medium 27, low 38, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` **B1** — the documentation tells the reader to run `pnpm dev:local`, whose final step is `pnpm dev`, in the same breath as telling them not to start `pnpm dev`; `dev:local` ends in `&& pnpm dev` (`package.json:30`) so the two instructions cannot both be followed — the two paragraphs were reconciled against the new gate arrangement.
  - `[medium]` `[patch]` **B2** — the `local:readiness` gate **never runs** when the folk app is already listening on `:3000`: `reuseExistingServer: !isCI` short-circuits before `command` is spawned, so the entire chained command is skipped — **REPRODUCED** against a running `:3000`. This is the documented workflow, so the stack-readiness assertion the story presents as always-on is dead on a developer's machine. Gate hoisted out of `webServer` into `test:e2e`.
  - `[low]` `[patch]` **B3** — `pnpm dev:local` is the wrong instruction for the suite even ignoring B2, because it occupies `:3000` with a server the suite is designed to own — folded into the documentation patch.
  - `[medium]` `[patch]` **B4** — `E2E_BASE_URL` is accepted verbatim, so the whole suite (real OTP emails, real sessions) can be pointed at the hosted project the story's boundary forbids — verified: `playwright.config.ts:19-20` applies no check. Loopback assertion added.
  - `[medium]` `[patch]` **B5** — `listAuthUsersMatching` (`e2e/specs/smoke.spec.ts:64-73`) queries `auth.users` with the service-role key against whatever `SUPABASE_URL` the app env file holds, with no loopback check; on a machine whose `.env.local` still points at hosted, the row that "proves" `shouldCreateUser: false` proves it about the wrong stack — **REPRODUCED** by reading the URL construction. Guarded with the repo's own `isLocalSupabaseUrl`.
  - `[medium]` `[patch]` **B6** — `listAuthUsersMatching` truncates at `per_page=200, page=1` with no pagination, so a provisioned user beyond page 1 makes the "nothing was provisioned" assertion vacuously green — the precise outcome its own docstring says it exists to prevent. Paginated.
  - `[medium]` `[patch]` **B7** — `readOtpForRecipient`'s accept rule `freshEnough || !known.has(ID)` re-admits what it means to exclude: with the snapshot already covering "new message", the `freshEnough` half only widens acceptance, so a leftover OTP within the 5 s skew window stays eligible and surfaces as a 30 s URL timeout rather than a wrong-code diagnostic. Id-exclusion now takes precedence when a snapshot is supplied.
  - `[low]` `[reject]` **B8** — a Mailpit failure *inside* the poll costs the full 30 s budget instead of failing fast. Rejected: the delayed outcome is still fully contextual — probe URL, watermark, and every captured id and subject — which is exactly what the intent demands; failing on the first blip trades a diagnostic for a flake.
  - `[medium]` `[patch]` **B9** — the rate-limit retry mis-classifies from attempt 2: `waitForCodeStepOrError` resolves on the *stale* `.text-red-700` node left by the previous attempt, so the retry reads the previous error text and can loop to exhaustion. Verified by the render order — `handleSubmit` clears the error, but the probe runs before React re-renders. The stale node is now awaited away before a re-click.
  - `[low]` `[patch]` **B10** — the retry re-clicks `Send Code` without asserting the form is back in step 1; it works today only by the component's render order. Asserted explicitly as part of the same `auth.ts` fix.
  - `[low]` `[patch]` **B11** — `e2e/.auth/dead-session.json` is written and never removed, so a live-shaped session artifact accumulates permanently, and it is the one file in that directory whose name matches no role, so a narrowed ignore rule would escape the gitignore test. Cleaned up.
  - `[low]` `[patch]` **B12** — the claim that the manage photo probe "writes nothing" holds only on the two failure paths; for an Admin the handler reaches `createSignedUrl` (`lib/manage/api-handlers.ts:412` → `lib/supabase/manage.ts:1050`) — verified. The overclaiming comment corrected.
  - `[low]` `[reject]` **B13** — adding a role is a four-file change, not the advertised one, and the three setup files are near-identical. Rejected: collapsing them is a refactor that adds indirection, and no story in this spec needs a fourth role.
  - `[medium]` `[patch]` **B14** — `preacher` is authenticated but never asserted: `preacher.json` is consumed by nothing but the gitignore existence check, so a Preacher whose role mapping or landing path regressed stays green everywhere. Each role's artifact now has to yield a live session with its expected role.
  - `[low]` `[reject]` **B15** — `pnpm test` is a vacuous green (`turbo run test` reports "No tasks were executed" and exits 0). Rejected: the turbo `test` task is exactly what the intent asked for, no workspace package defines a `test` script yet, and turbo's own warning is visible in the output. The story's Verification row is re-worded so it stops reading as a check that asserts something.
  - `[low]` `[patch]` **B16** — the ESLint globals block for `e2e/**` is dead configuration justified by an inaccurate rationale — **verified** with `eslint --print-config e2e/__probe.ts`: `no-undef` is `[0, …]`, and every new file imports `test`/`expect` explicitly. Removed, with the rationale deleted rather than reworded.
  - `[low]` `[patch]` **B17** — `playwright-report/` and `test-results/` are unanchored, so they match at any depth and a future `apps/*/test-results` would become silently untracked; `blob-report/` is not covered at all. Anchored and completed.
  - `[low]` `[patch]` **B18** — six environment knobs (`E2E_BASE_URL`, `E2E_MAILPIT_URL`, `E2E_PROGRAM_ID`, `E2E_<ROLE>_EMAIL`, `E2E_<ROLE>_STORAGE_STATE`, `E2E_UNKNOWN_EMAIL`) are documented nowhere, although the per-role email override is the escape hatch for a differently-seeded stack. Documented.
  - `[low]` `[patch]` **B19** — `apps/folk/.env.local` with a service-role key is an undocumented hard precondition; the smoke spec throws by design without it. Documented alongside B18.
  - `[low]` `[patch]` **B20** — no documentation of `pnpm exec playwright install chromium` or of the `@playwright/test` pin, so a fresh clone following the docs hits an unexplained browser-download failure — the exact risk the story itself flags as open. Documented.
  - `[low]` `[reject]` **B21** — `git check-ignore` couples the suite to a git worktree and would fail in a tarball export. Rejected: git is a precondition of this repository's documented workflow, and skipping the check would weaken the one genuinely sensitive artifact assertion.
  - `[false]` `[reject]` **B22** — the empty `## Review Triage Log` heading reads as a placeholder implying a review with nothing to say. Disproved: it is this section, now populated with 71 rows.
  - `[low]` `[reject]` **B23** — `workers: 1` / `fullyParallel: false` are hardcoded while the comments reason about parallel specs. Rejected: the recipient-keyed invariant is defensive guidance for the later stories that will enable parallelism, not a claim about the current mode.
  - `[medium]` `[patch]` **E1** — a failed code verification surfaces as a bare 30 s `page.waitForURL` timeout (`e2e/fixtures/auth.ts:62`) instead of the app's own message — the same context-free failure the intent forbids for the mail poll, on the other half of the OTP flow. The URL wait now races the error node.
  - `[medium]` `[patch]` **E2** — the global `timeout: 60_000` is below the setup projects' own worst case (three OTP attempts, each up to 20 s for the code step plus 30 s of polling), so a rate-limited setup is killed by the harness before its budget is spent. Setup projects given their own timeout.
  - `[medium]` `[patch]` **E3** — `codeField.or(loginError)` resolves to two elements whenever a bad code leaves both mounted, and `toBeVisible()` on a multi-match locator is a strict-mode crash with an opaque message. `.first()` added.
  - `[low]` `[patch]` **E4** — when neither the code field nor an error appears (hydration stall, a 500 page), the timeout names neither cause. The no-step case now reports the URL and a slice of the page body.
  - `[low]` `[reject]` **E5** — a transient failure in `snapshotMessageIds()` aborts setup although the poll itself retries. Rejected: failing loudly on an unreachable mailbox is correct, and continuing with an empty snapshot would make `ignoreIds` accept every historical message — strictly worse.
  - `[low]` `[patch]` **E6** — an error node present with empty text yields `Sign-in failed for <email>: ` with no cause, because `?? "unknown"` does not catch `""`. Falsy-checked instead.
  - `[low]` `[patch]` **E7** — a session-cookie envelope that is not valid base64/JSON throws an opaque `SyntaxError` with no role or cookie context. The parse now names the cookie and the file.
  - `[low]` `[reject]` **E8** — a live cookie not prefixed `base64-` is returned unchanged, so the "dead session" test would prove nothing. Verified and rejected: the test then fails loudly with `200 ≠ 401` rather than passing vacuously, so there is no silent green to close.
  - `[low]` `[reject]` **E9** — `cookies.find(c => c.name.includes("auth-token"))` may select a `.1` chunk rather than the session cookie. Rejected: the fixture session cookie is ~1–2 KB, far below `@supabase/ssr`'s chunking threshold, and a wrong pick fails loudly at `JSON.parse` rather than producing a false green.
  - `[low]` `[patch]` **E10** — a `readMessageBody` failure for one candidate (404, deleted mid-poll) aborts the whole candidate loop into the catch-and-retry, discarding codes found in sibling candidates. A per-candidate failure now skips to the next.
  - `[low]` `[patch]` **E11** — a message with a missing or unparseable `Created` makes the newest-first ordering undefined, so the wrong OTP can be chosen. Such messages sort to the epoch rather than poisoning the comparator.
  - `[low]` `[reject]` **E12** — the poll can overshoot its declared timeout by up to one interval. Rejected: negligible against a 30 s budget, and clamping is new branching rather than a correction.
  - `[low]` `[reject]` **E13** — a non-JSON body from Mailpit throws an unnamed `SyntaxError`. Rejected: unreachable through Mailpit's own HTTP surface (a non-2xx is already reported with status and URL), and the fix is a new guard branch rather than a correction.
  - `[medium]` `[patch]` **E14** — the 200-user truncation of B6, filed independently at `e2e/specs/smoke.spec.ts:73`. Same root cause; one fix.
  - `[medium]` `[patch]` **E15** — the "no account is provisioned" assertion only proves *no change*: `toEqual(before)` holds when `before` is already non-empty, which is exactly the state it must rule out. The baseline is now asserted empty first.
  - `[low]` `[patch]` **E16** — `listAuthUsersMatching` cannot see a service-role key supplied through the environment rather than `apps/folk/.env.local`, even though the suite may be run with exported local credentials. `process.env` is read first.
  - `[low]` `[reject]` **E17** — the inline env-file parser does not strip an `export` prefix or an inline comment. Rejected: the file's shape is written by `scripts/use-local-supabase-env.sh` in a fixed `KEY=value` form, and a mis-parse fails loudly at the admin API rather than reading the wrong project.
  - `[low]` `[patch]` **E18** — the headline URL assertion `toHaveURL(/\/$/)` matches any path ending in a slash. The headline is the story's whole deliverable; it now asserts the exact landing pathname.
  - `[low]` `[patch]` **E19** — `visited[0]` is compared without first asserting that any navigation was observed, so an empty list compares `undefined` and the message hides the cause. Guarded.
  - `[low]` `[reject]` **E20** — `spawnSync("git", …)` yields `status: null` with no reason when git is missing. Rejected: git is a precondition of the repo's documented workflow, and the assertion message already names the exit value.
  - `[medium]` `[patch]` **E21** — the `reuseExistingServer` short-circuit of B2, filed independently at `playwright.config.ts:84`. Same root cause; one fix.
  - `[medium]` `[patch]` **E22** — the unvalidated `E2E_BASE_URL` of B4, filed independently at `playwright.config.ts:20`. Same root cause; one fix.
  - `[low]` `[patch]` **E23** — the `CONTRIBUTING.md` replacement dropped the instruction to add manual verification notes for staff auth and Supabase-backed reads/writes — a `deletion`-kind finding, and those flows are exactly what the new suite does *not* yet cover. Restored.
  - `[low]` `[patch]` **E24** — the `docs/development-guide.md` replacement dropped `pnpm build` and the manual-check pointer from the check list. Restored. (`deletion`-kind finding.)
  - `[medium]` `[patch]` **E25** — claim check: "keyed on recipient + request timestamp" overstates what `freshEnough || !known.has(ID)` delivers. Same root cause as B7.
  - `[medium]` `[patch]` **E26** — claim check: "no account is provisioned" is asserted as equality with a possibly non-empty baseline. Same root cause as E15.
  - `[medium]` `[patch]` **E27** — claim check: "nothing here may read or write the hosted project" is untrue at `e2e/specs/smoke.spec.ts:73`. Same root cause as B5.
  - `[medium]` `[patch]` **E28** — claim check: "a `webServer` gate runs `local:readiness` then boots the app" is untrue whenever `:3000` already answers. Same root cause as B2.
  - `[low]` `[reject]` **E29** — claim check: the docs' "never a fixed sleep" is inaccurate, since `e2e/fixtures/mailpit.ts` does `setTimeout(intervalMs)` between polls. Rejected on substance — the wait is condition-driven with a bounded budget, not an unconditional sleep — and the doc wording is tightened as part of the documentation patch rather than left ambiguous.
  - `[medium]` `[patch]` **G1** — regeneration is a stated matrix row and a documented guarantee, but the only assertion is `stat(storageState).size > 0`, which a leftover file satisfies; no assertion distinguishes "written by this run" from "survived from the last one". **Filed pre-verified** with a worked demonstration: deleting the `rm` + re-auth in `preacher.setup.ts` leaves every assertion green. The setup projects now assert the artifact's mtime is from this run. (same root cause as B14)
  - `[medium]` `[patch]` **G2** — missing adoption: the new Supabase admin-API call site skips the repo's own local-target guard. `scripts/local-supabase-target.mjs` is documented as "the single definition of 'is this the local Supabase stack?'", is asserted by `scripts/verify-seed-local-guard.mjs`, and is imported by neither new file. **Filed pre-verified** with a worked demonstration: with a hosted `SUPABASE_URL`, the admin call reads hosted `auth.users` and every assertion in the unknown-email test still passes. Imported and applied. (same root cause as B5)
  - `[medium]` `[defer]` **G3** — nothing automated runs the suite: `.github/workflows/quality-gates.yml` runs guardrails, typecheck, build, and lint only, so a break in the `/login` → Mailpit OTP path is observed only when a human runs `pnpm test:e2e`. **Filed pre-verified** with a worked demonstration. Deferred: the intent excludes it — SPEC.md's non-goals state "No CI workflow changes… a follow-up once the suite is green and not flake-prone" — and wiring it needs Supabase and Mailpit services in CI, a substantially larger change than this story.
  - `[low]` `[reject]` **O1** — `pnpm test` is documented as a check but executes nothing. Rejected for the same reason as B15; the story's Verification row is re-worded so it no longer reads as a passing check that asserts something.
  - `[medium]` `[patch]` **O2** — `readOtpForRecipient`'s freshness clause re-admits messages it means to exclude. Same root cause as B7.
  - `[low]` `[patch]` **O3** — `e2e/fixtures/roles.ts:98` documents `relativeToRepo` as returning an "Absolute `file://` URL"; it returns a plain repo-relative path. JSDoc corrected.
  - `[medium]` `[patch]` **O4** — the single-page read of `auth.users` again, filed independently. Same root cause as B6.
  - `[low]` `[patch]` **O5** — the unanchored `.gitignore` patterns. Same root cause as B17; anchored.
  - `[low]` `[reject]` **O6** — a failed setup project leaves its artifact absent, which the `existsSync` assertion reports as a harness failure rather than a sign-in failure. Rejected: the setup failure is reported first and names the real cause.
  - `[false]` `[reject]` **I1** — the smoke spec should itself drive the Admin sign-in rather than consume a setup project's `storageState` (R1). The intent's deliverable is "stack + seed + OTP + storageState + session reuse all work together", which only the chain proves; a self-driving spec would exercise a different surface.
  - `[low]` `[patch]` **I2** — the `smoke` project's project-level `storageState: admin` means every later spec silently signs in as Admin unless it overrides, and nothing in the config or docs warns about it. Documented.
  - `[medium]` `[patch]` **I3** — R4 is thin where it matters: the setup layer only checks that a file was written, never that it holds a live session, and only Admin's is proven live, so a Preacher file written but immediately invalid would surface later as a confusing failure — the exact outcome the intent asked to prevent. Same root cause as B14.
  - `[false]` `[reject]` **I4** — the unknown-email test must fail *through* `shouldCreateUser: false` (R5). The intent asks for a failed sign-in and no provisioned account; both are asserted — the app's 403 message, the absence of a code field, and an unchanged `auth.users` — and the route's 403 is the mechanism the running stack actually short-circuits on.
  - `[false]` `[reject]` **I5** — the Preacher-scoping and out-of-scope-contact facts must be asserted by this story (R6). The intent supplies them as facts to reason with; its deliverable list names no scope assertion, and `requireRole` is used here only to pick the 401/403 probe route.
  - `[false]` `[reject]` **I6** — `@playwright/test` must be `^1.63.0` to match the existing `playwright-core` (R7). **Disproved by inspection**: `node_modules/playwright-core/browsers.json` (1.63.0) requests `chromium` revision **1243**, while `playwright-core@1.62.0`'s requests **1234** — the revision present in `~/.cache/ms-playwright`. `^1.62.0` is correct; the deviation is recorded in the Spec Change Log.
  - `[medium]` `[patch]` **I7** — R8 honoured the "no unit runner" prohibition, but the consequence is that the flake-critical file's contract has no automated coverage at all: nothing calls `readOtpForRecipient`, and the manual dead-port check exercises `mailpitFetch`'s network branch, **not** the timeout-enumeration branch the intent called out by name. A spec now drives the reader with an injected `fetchImpl` and asserts the timeout message enumerates ids, subjects, and recipients.
  - `[medium]` `[patch]` **I8** — the local-only boundary is enforced only when the gate runs, and with B2 the gate often does not run; nothing in the harness itself refuses a non-local target. Same root cause as B4 and B5.
  - `[low]` `[reject]` **I9** — `pnpm test` is a reachable but empty pipeline. Rejected for the same reason as B15.
  - `[false]` `[reject]` **I10** — the harness's use of the source-verified `preview-fixture-<role>-<program>@example.com` overrides the companions' `preview-fixture-<role>@example.com`. Correct: `scripts/seed-preview-fixtures.mjs` builds the program-suffixed form, and the instruction was to trust the traced source over the abbreviated companion prose.

### 2026-10-08 — Follow-up review pass

Layer counts: blind-hunter 27, edge-case-hunter 20, verification-gap 11 (6 filed + 5 "other"), intent-alignment 4 (1 descriptive report + 3 actionable divergences).

- verdicts: 62 findings — high 0, medium 10, low 32, false 20, maybe-false 0
- routed: patch 10 (high 0, medium 6, low 4) — reject 48, defer 4. No `intent_gap`, no `bad_spec`, so no loopback was needed.
- findings:
  - **Blind hunter**
    - `[false]` `[reject]` **N1** — `roles.ts:45` resolves `repoRoot` from `__dirname` with no module-format declaration in the diff. Disproved: root `package.json` has no `"type"` field, so Playwright's transform is CJS and `__dirname` is defined; the recorded green runs (`14 passed`, and `18 passed` on this pass) already depend on it resolving, since every `storageState` path hangs off it.
    - `[false]` `[reject]` **N2** — `ignoreIds: []` is indistinguishable from "no snapshot supplied", so an empty mailbox re-widens the accept rule to the ±5 s `Created` window. Disproved: an empty snapshot means the mailbox held *no* messages at watermark time, so any message addressed to the recipient that appears afterwards is genuinely new and the skew window can only admit something that was already delivered — which an empty snapshot proves was not there. The rule is also documented as cardinality-conditional at `e2e/fixtures/mailpit.ts:70-74`, so the code matches its contract.
    - `[false]` `[reject]` **N3** — `since` is dead weight in the production path because `authenticateAsRole` always supplies `ignoreIds`. It still carries every timeout report (`mailpit.ts:243`) and is the whole accept rule for a caller with no snapshot; removing it would remove the watermark the intent requires in the failure message.
    - `[low]` `[reject]` **N4** — `LOOSE_CODE`, the fallback that can return an unrelated 6-digit run, has no test. A wrong pick is not a silent green: `verifyOtp` rejects and `waitForLanding` throws `Code verification failed for <email>` with the app's text and a page slice (`e2e/fixtures/auth.ts:128`). Closing it means adding a test, not correcting the code.
    - `[low]` `[patch]` **N5** — `mailpit-reader.spec.ts` claims to be stack-free but runs in the `smoke` project, which depends on all three setup projects. Grouped with **E19** and **VG-O1**; one claim corrected in `docs/development-guide.md`.
    - `[low]` `[reject]` **N6** — `playwright-core@^1.63.0` was left at the version the story says cannot work here, leaving two copies installed (`1.63.0` at the root, `1.62.0` under `@playwright/test`). Verified real but inert: each copy has its own consumer — the root one is imported by the pre-existing `scripts/verify-pwa-offline-queue.mjs:444`, and aligning it would change which Chromium revision that script looks for, which is a different script's concern. The pin rationale is already in the docs.
    - `[low]` `[reject]` **N7** — the lockfile churn is wider than one devDependency needs and no `--frozen-lockfile` check exists. The churn is pnpm rewriting the `next@16.0.7` peer key because `@playwright/test` became an optional peer of `next`; it is not author-chosen. The lockfile does carry the new importer entry (`pnpm-lock.yaml:183`), so the two are consistent.
    - `[low]` `[reject]` **N8** — `tw-animate-css` was reordered inside the `devDependencies` hunk. Alphabetical ordering inside the block the change had to touch anyway; no behavioural difference.
    - `[low]` `[reject]` **N9** — `E2E_MAILPIT_URL` is not loopback-checked while `E2E_BASE_URL` is, so the docs' local-only guarantee is narrower than stated. The mail URL carries no credential and cannot address the hosted Supabase project, which is what both documents claim; the fix would be a third guard branch.
    - `[medium]` `[patch]` **N10** — `CONTRIBUTING.md` says "Its only prerequisite is the stack itself" while `docs/development-guide.md` says `apps/folk/.env.local` must carry `SUPABASE_SERVICE_ROLE_KEY` and a loopback `SUPABASE_URL`, which `listAuthUsersMatching` throws without. Verified by reading both. The prerequisite was added to `CONTRIBUTING.md` alongside the browser install.
    - `[low]` `[patch]` **N11** — `CONTRIBUTING.md`'s bring-up omits `pnpm exec playwright install chromium`, which the guide documents as mandatory on a fresh machine; a clone following only `CONTRIBUTING.md` hits the browser-launch failure the story itself flags as the pin's failure mode. Added.
    - `[medium]` `[patch]` **N12** — nothing warns that `pnpm exec playwright test` bypasses the readiness gate now that it lives in the script, and the story's own Observed evidence is partly gathered through ungated invocations. Grouped with **VG3**; the wiring is now asserted and both documents name the bypass.
    - `[false]` `[reject]` **N13** — `pnpm test` is documented as a check while asserting nothing. Disproved: `pnpm test` appears in neither `CONTRIBUTING.md`'s check list nor the guide's "Other checks"; the guide presents it as the turbo task and says the e2e suite is deliberately not routed through it.
    - `[false]` `[reject]` **N14** — an `E2E_<ROLE>_STORAGE_STATE` override outside the repo makes `git check-ignore` exit 1. That is the safe direction: the row then reports a configuration that would write unignored session tokens, rather than passing quietly.
    - `[false]` `[reject]` **N15** — the seeded `Assistant` role is omitted and undocumented. `e2e/fixtures/roles.ts:31` states that Assistant lands on `/contact` alongside Volunteer, and **B13** already rejected adding a fourth setup file; the intent's matrix has no Assistant row.
    - `[low]` `[reject]` **N16** — `E2E_ROLES` does not drive the config's `dependencies` list or the per-role setup files. Carried from **B13**'s rejection: adding a role is a three-part change by design, and the file header's "one-file change" claim is scoped to renames.
    - `[false]` `[reject]` **N17** — `code: "forbidden"` is asserted but named nowhere in the code map. Disproved: `lib/authz.ts:52-54` throws `new AuthzError(403, "forbidden", "You do not have access to this staff action.")`, and `authzErrorResponse` renders `{ error, code }`.
    - `[low]` `[reject]` **N18** — the admin-API `fetch` has no `AbortSignal` or timeout. A refused GoTrue endpoint already throws with status and URL (`e2e/specs/smoke.spec.ts:111`); a socket that connects and never answers is not reachable against a local container, and the fix adds a signal and a guard.
    - `[low]` `[reject]` **N19** — `AUTH_USERS_MAX_PAGES = 50` truncates silently at 10,000 users. Reaching that needs a fixture change far outside this story, and the paging loop already stops on the short-page signal.
    - `[low]` `[reject]` **N20** — `e2e/.auth/` session tokens persist on disk after a run. Gitignored, documented in both entry points, and regenerated on every run; the story's own manual check asserts `git status` stays clean.
    - `[low]` `[defer]` **N21** — the `DW-25` heading in `deferred-work.md` is truncated mid-sentence ("…→ `verifyOtp` path is"). Real and cosmetic. **Not actioned:** `deferred-work.md` is the orchestrator-owned ledger, and this dispatch forbids modifying or rewriting its entries.
    - `[low]` `[reject]` **N22** — the frontmatter `deferred` block and `DW-25` are near-verbatim duplicates. Both are written from one finding by design — spec-local for the story, repo-ledger for the sweep — and the frontmatter item is the one this workflow owns.
    - `[false]` `[reject]` **N23** — `review_loop_iteration: 0` with a follow-up flag and a 71-row log is internally inconsistent. That is the mechanism itself: a `done` spec re-dispatched sets the iteration to `0` and the follow-up flag to `true` for a fresh review pass.
    - `[medium]` `[patch]` **N24** — the Verification section's command list cites `5678c08` for the guardrails diff while the Observed table and the frontmatter `baseline_revision` cite `1dd7dc70`. Verified: both strings are present for the same check. Corrected to the baseline the Observed table already ran.
    - `[low]` `[reject]` **N25** — the acceptance criteria omit the loopback refusal, the offline diagnostic assertion, and the per-role liveness check. Those are this story's verifications, not obligations the intent's own acceptance set carries; the intent states its ACs and this list reproduces them.
    - `[medium]` `[patch]` **N26** — the matrix audit maps the "OTP read" row partly to `mailpit-reader.spec.ts`, which injects `fetchImpl` and never touches Mailpit, so three of the four "covering tests" prove the reader against a synthetic mailbox. Verified by reading the spec. The audit row now says which surface each test covers.
    - `[medium]` `[patch]` **N27** — prerequisite prose is duplicated across the two entry points and has already diverged materially: `CONTRIBUTING.md` said "you do **not** start `pnpm dev` yourself" while the guide said "you do **not** *need* `pnpm dev` running". Reconciled to one wording in both, and the prerequisites are now stated in both. Consolidating the whole block into a single source is rejected as a refactor beyond this pass.
  - **Edge-case hunter**
    - `[false]` `[reject]` **E1** — `GET /api/v1/messages` is paginated and no `limit`/`offset` is passed, so the snapshot and candidate filter see only the newest page. Disproved against the live mailbox: the endpoint returns `total=50, returned=50`, is unmoved by `?limit=500`, and `?offset=40` returns the same first message — the harness sees the entire mailbox.
    - `[false]` `[reject]` **E2** — same root claim as **N2**, filed independently. Disproved on the same grounds: an empty snapshot proves the mailbox was empty at watermark time.
    - `[low]` `[reject]` **E3** — `mailpitFetch` passes no `AbortSignal`, so a Mailpit that accepts a connection and never answers outlives `timeoutMs`. A refused port already throws naming the probe URL (exercised below), a hung-but-accepted local socket is not reachable, and the fix adds a controller plus a remaining-budget computation.
    - `[false]` `[reject]` **E4** — a `Created` string without a timezone designator would shift every message by the local UTC offset. Disproved live: Mailpit returns `Created` as `2026-10-08T03:15:21.086Z`, and the story's Code Map records the same measurement.
    - `[low]` `[reject]` **E5** — `describeMessages` enumerates 20 of N while the header prints N. Bounding the enumeration is the point of the report and the full count is printed beside it, so nothing is silently hidden.
    - `[false]` `[reject]` **E6** — `extractCode` never falls back to the HTML body, so a code that exists only in HTML is never found. Deliberate and reasoned at `e2e/fixtures/mailpit.ts:151-153`: the HTML body is full of unrelated 6-digit runs (ids, versions), so matching it is worse than not matching it. Supabase's MIME always carries `Text`.
    - `[low]` `[reject]` **E7** — a session envelope decoding to `null`, an array, or a string throws `TypeError: Cannot set properties of null`, replacing the cookie diagnostic. Requires Supabase to change the cookie's payload shape from an object; the reachable malformed-JSON branch already names the cookie and file (**E7** of the prior pass).
    - `[low]` `[reject]` **E8** — `writeDeadSessionStorageState` reads and parses the source `storageState` unguarded, so an absent or truncated file yields a bare `ENOENT`/`SyntaxError` naming neither role nor file. The file was written by the same run's setup project seconds earlier; this is the E7 fix's already-patched neighbourhood, not a reachable path.
    - `[low]` `[reject]` **E9** — a parsed `storageState` with no `cookies` array throws on `.find`. Playwright's own writer always emits the array, and a shape change here is what **E7**'s message already tells a reader to look for.
    - `[low]` `[patch]` **E10** — `browser.newContext` sits outside the `try`, so a context that fails to open leaves `e2e/.auth/dead-session.json` on disk — the one file in that directory whose name matches no role. Verified at `e2e/specs/smoke.spec.ts:116`. The context creation moved inside the `try` with a guarded close.
    - `[false]` `[reject]` **E11** — the dead-session cookie is written with `expires: -1`, so the browser may drop it and the 401 would prove an anonymous request rather than a rejected token — which would make the story's headline claim ("the server sees the production shape with a token auth refuses") untrue. **Measured and disproved**: with `expires: -1` a request issued through `context.request.get` still carries `Cookie: sb-ref-auth-token=base64-abc` to the server, identical to a far-future `expires`. The token really does reach the handler.
    - `[low]` `[reject]` **E12** — same root as **N19**, filed independently. Same rejection.
    - `[low]` `[reject]` **E13** — same root as **N18**, filed independently. Same rejection.
    - `[false]` `[reject]` **E14** — same root as **N14**, filed independently. Same refutation: the failing direction is the loud one.
    - `[low]` `[reject]` **E15** — a loopback `E2E_BASE_URL` on a port other than 3000 leaves `webServer` polling a URL `pnpm dev:folk` never binds, for the full 600 s. The timeout names the URL it was waiting on, and the fix adds a `PORT` parameter to the command — more than a direct correction.
    - `[low]` `[reject]` **E16** — `isCI = Boolean(process.env.CI)` treats `CI=false` as CI, so a local run silently gets `retries: 1` and `forbidOnly`. This is Playwright's own canonical idiom; `CI=false` is not a convention it supports.
    - `[low]` `[reject]` **E17** — `??` lets an empty `E2E_MAILPIT_URL` / `E2E_PROGRAM_ID` / `E2E_UNKNOWN_EMAIL` survive into the address and URL. Every variant fails loudly and by name: a relative probe URL reports the malformed `GET` target, a malformed fixture address gets the app's own 403, an empty unseeded address never satisfies the error-text assertion.
    - `[low]` `[reject]` **E18** — the setup projects' `mtimeMs` assertion can report a correctly written artifact as "not written" on a coarse-mtime filesystem or a backwards clock step. A 1 s-granularity filesystem still resolves "this run" across a ~30 s run, and the clock stepping backwards mid-run is not reachable here.
    - `[low]` `[patch]` **E19** — `docs/development-guide.md` claims `mailpit-reader.spec.ts` asserts the diagnostic "offline, with an injected mailbox and no stack", but the file executes inside the `smoke` project, which `dependencies` on all three setup projects. Grouped with **N5** and **VG-O1**. The wording now claims only what holds — an injected mailbox, no real message read — and the new `harness-guards.spec.ts` is described alongside it.
    - `[low]` `[defer]` **E20** — `DW-24` still reports as `open` although the stale "no product test suite exists" sentence it tracks was replaced by this diff. The gap is real; **not actioned**, because `deferred-work.md` is the orchestrator-owned ledger and its status is the orchestrator's to resolve. Deliberately not mirrored into this spec's `deferred` list, which would only duplicate the ledger entry.
  - **Verification gap** (filed pre-verified; evidence accepted as filed)
    - `[medium]` `[patch]` **VG1** — no committed test covers the `E2E_BASE_URL` loopback refusal at `playwright.config.ts:36`; deleting it leaves every spec green and the suite drivable against a LAN host. Grouped with **VG2**. Asserted: a spec now runs `playwright test --list` with a hosted `E2E_BASE_URL` and requires a non-zero exit naming the refusal.
    - `[medium]` `[patch]` **VG2** — no committed test covers the `SUPABASE_URL` loopback refusal in the provisioning assertion; deleting it lets the row prove `shouldCreateUser: false` about hosted `auth.users`. Grouped with **VG1**. Asserted by calling `listAuthUsersMatching` with a hosted `SUPABASE_URL` exported and requiring the refusal message.
    - `[medium]` `[patch]` **VG3** — the hoisted `pnpm local:readiness` pre-gate has no verification; restoring `"test:e2e": "playwright test"` leaves all 14 specs green and the stack-readiness verdict gone, which is the **B2** regression returning silently. Grouped with **N12**. Asserted by reading the root `test:e2e` script and requiring `pnpm local:readiness && playwright test`.
    - `[low]` `[patch]` **VG4** — no test observes the three anchored report-directory ignore rules or their anchoring; reverting `/test-results/` to unanchored leaves the suite green while an `apps/*/test-results` becomes untracked. Asserted: one positive case per rule and a negative case under `apps/folk/`.
    - `[low]` `[defer]` **VG5** — the rate-limit retry branch, including its own **B9**/**B10** fixes, is exercised by no test. Filed disposition honoured: reaching it needs a real 429 from `[auth.email] max_frequency`, and manufacturing one means deliberately perturbing the limiter the suite depends on. **Not** mirrored into this spec's `deferred` list — it is an unclosed coverage gap in this story's own harness, recorded in this log.
    - `[medium]` `[patch]` **VG6** — missing adoption: `readEnvValue` reimplemented the repo's `KEY=value` parser in the one assertion that must never be vacuous, while `scripts/local-supabase-target.mjs` documents itself as the single definition and exports `parseSupabaseStatusEnv` at `:182`. The parser moved to `e2e/fixtures/auth-users.ts` and calls the shared one; the hand-rolled loop is deleted.
    - `[low]` `[patch]` **VG-O1** — `mailpit-reader.spec.ts`'s "No browser, no app, no Docker" header contradicts its own execution. Grouped with **N5** and **E19**; one claim corrected in the guide.
    - `[false]` `[reject]` **VG-O2** — same root as **N13**, filed independently. Same refutation.
    - `[false]` `[reject]` **VG-O3** — `.github/workflows/quality-gates.yml` does not run `pnpm test:e2e` while the docs now list it as a pre-PR check. Same claim as this story's `deferred` item and ledger entry `DW-25`; **carried, not re-raised** — the intent excludes CI changes and the orchestrator owns that entry's status.
    - `[false]` `[reject]` **VG-O4** — `writeDeadSessionStorageState` keeps the chunk template's `domain`, `path` and `sameSite`. Those are copied verbatim from the real session cookie, so they are correct by construction; only the token and expiry are rewritten.
    - `[false]` `[reject]` **VG-O5** — if `@supabase/ssr` changes its cookie name shape, `deadSessionCookieValue` returns the value unchanged and the row fails as `200 ≠ 401`. That is the loud direction, and it is the **E8**-of-the-prior-pass reasoning this story already recorded.
  - **Intent alignment** (descriptive; no prescriptive findings)
    - `[false]` `[reject]` **IA1** — the audit's divergence report. Adopted as written: every divergence it names is either already adjudicated in the prior pass (**I2** the project-level Admin default, **I4** the unknown-email mechanism, **B2**/**G3** the gate and CI) or is one of the patched rows above (**IA2**, **IA3**, **N7**). No separate action.
    - `[false]` `[reject]` **IA2** — the matrix's "Session reuse" row is narrowed to Admin, because the `framenavigated` assertion runs only in the Admin-configured project. Disproved as a gap: the row's input is "any spec project declaring `storageState`", and one project discharges "any"; per-role identity is separately proven by `every role storageState file is a live session for that role`.
    - `[low]` `[reject]` **IA3** — the dead-session row's "must not surface as a downstream page error" clause is unexercised, since the probe uses `context.request` and never navigates. The clause describes the app's response, which the asserted `401` + `code: "unauthenticated"` already pins; covering the page surface is a new fuzzy assertion rather than a correction.
    - `[low]` `[reject]` **IA4** — the lockfile churn is an unanticipated surface. Grouped with **N7**; same rejection.
  - **Carried from the prior pass, not re-raised**
    - `[medium]` `[defer]` **G3** — nothing automated runs the suite. **Carried:** the intent's non-goals exclude CI workflow changes, the finding is the story's own existing `deferred` item, and ledger entry `DW-25` is orchestrator-owned — its status and resolution are untouched by this pass.

## Auto Run Result

Status: done

### Summary

A **follow-up review pass** over a `done` story, not new implementation. The
harness from the first pass was re-reviewed by four independent layers (blind
hunter, edge-case hunter, verification-gap, intent-alignment) against the full
diff from `baseline_revision`. 62 findings; no `high`. The work converged: 10
entries patched, 48 rejected on verified evidence, 4 deferred, and no
`intent_gap` or `bad_spec` to loop back on.

What actually changed is coverage of the harness's *own* boundaries. The first
pass added three refusals and a gate — a loopback check on `E2E_BASE_URL`, a
loopback check on the admin `SUPABASE_URL`, the `pnpm local:readiness` pre-gate —
and none of them had a test. Deleting any of them leaves the whole suite green,
which is precisely the failure mode this story exists to prevent. They are now
asserted at their refusals, not only on the passing path.

Also folded away: a second copy of the repo's `KEY=value` env parser, a
`storageState` artifact that could survive a failed context, and two
self-contradictions in the story's own documentation.

### Files changed

| File | Change |
|---|---|
| `e2e/fixtures/auth-users.ts` | **NEW.** `readEnvValue` / `listAuthUsersMatching`, moved out of the spec and onto the repo's shared `parseSupabaseStatusEnv` — the hand-rolled parser is deleted. Extracted so the refusal can be asserted without importing a spec. |
| `e2e/specs/harness-guards.spec.ts` | **NEW.** Four offline tests for the harness's own guards: the `SUPABASE_URL` refusal, the `E2E_BASE_URL` refusal (exercised through a nested `playwright test --list`), the `test:e2e` gate wiring, and the anchored ignore rules for the run-artifact directories. |
| `e2e/specs/smoke.spec.ts` | Imports the two helpers instead of defining them; the dead-session context is now created inside the `try`, so a context that fails to open cannot leave `dead-session.json` behind. |
| `docs/development-guide.md` | The "offline, with no stack" claim narrowed to what holds (an injected mailbox; no real message read); the direct-`playwright test` bypass of the readiness gate named explicitly. |
| `CONTRIBUTING.md` | Prerequisites completed: the `SUPABASE_SERVICE_ROLE_KEY` / loopback `SUPABASE_URL` requirement and `pnpm exec playwright install chromium`. The "do not start `pnpm dev`" vs "do not need `pnpm dev`" divergence reconciled to one wording in both files. |
| `stories/2-…-authentication.md` | Triage log for this pass; the stale `5678c08` guardrails reference corrected to `1dd7dc70`; the matrix audit's "OTP read" row now says which surface each covering test actually covers. |

### Review findings breakdown

- **Patched — 6 medium entries** (`VG1`+`VG2`, `VG3`+`N12`, `VG6`, `N10`+`N27`, `N24`, `N26`): the three untested local-only / gate guards now have committed assertions; the duplicated env parser is gone; the contributor prerequisites and the story's own stale hash and audit row are corrected.
- **Patched — 4 low entries** (`N5`+`E19`+`VG-O1`, `N11`, `E10`, `VG4`): the "no stack" documentation claim, the missing browser-install prerequisite, the leaked dead-session artifact, and the unobserved ignore rules.
- **Deferred — 4**: `G3`/`VG-O3` (nothing automated runs the suite — the intent excludes CI changes, and the entry is orchestrator-owned); `N21` (the truncated `DW-25` heading) and `E20` (`DW-24` still open although this diff resolved it) — both in the orchestrator-owned ledger, which this dispatch forbids modifying. None was mirrored into this spec's `deferred` list, which would only duplicate a ledger entry.
- **Rejected — 48.** The 20 `false` verdicts each carry a refutation; the most load-bearing ones were measured rather than reasoned: `E11` (a dead-session cookie written with `expires: -1` is **not** dropped by Chromium — a request still carries it to the server, so the 401 does come from a rejected token, which is what the story's Spec Change Log item 6 claims); `E1` (Mailpit returns the whole mailbox — `total=50, returned=50`, unmoved by `?limit=500` or `?offset=40`); `E4` (`Created` is UTC `…Z`); `N1` (no `"type"` field, so `__dirname` is defined and every recorded green run depends on it); `N17` (`lib/authz.ts:52-54` does throw `403 "forbidden"`). The 28 `low` rejections are dominated by one argument: a hang, a malformed-but-impossible shape, or a hostile-but-contrived override is either unreachable or fails loudly, and closing it means adding a guard branch or a new test rather than correcting the code.
- **Carried — 1** (`G3`): the prior pass's own deferral, re-raised verbatim by the verification-gap layer's "other findings" and re-rejected on the same grounds. The orchestrator owns its status; nothing was re-opened or rewritten.

### Follow-up review recommendation

**`false`.** This was a follow-up pass, and the bar for recommending another one is a patched `high` — there were none. The 6 patched medium entries are all closed by committed tests that ran, so patch volume is not grounds for another loop.

The one risk worth naming, unchanged by this pass: `devDependencies["@playwright/test"]` is `^1.62.0`, a caret over a lockfile that resolves the release whose Chromium revision (`1234`) is the only one this environment can download. A lockfile refresh resolves a newer 1.x and the suite then fails at browser launch rather than at an assertion. This pass also observed a second copy — the pre-existing root `playwright-core@^1.63.0`, consumed by `scripts/verify-pwa-offline-queue.mjs` — left in place deliberately (`N6`); reconciling it touches that script's browser resolution, which is outside this story.

### Verification performed

Every command below was executed against the patched tree.

| Command | Result |
|---|---|
| `pnpm test:e2e` (run 1, patched) | exit 0 — `18 passed (35.8s)`, up from 14; the four new `harness-guards.spec.ts` tests pass |
| `pnpm test:e2e` (run 2, immediately after) | exit 0 — `18 passed (31.4s)`; regeneration, not reuse |
| `pnpm test:e2e` (run 3, after the canary was removed) | exit 0 — `18 passed (35.6s)` |
| canary assertion appended to a spec | exit 1 — `1 failed`, `18 passed`, naming `[smoke] › e2e/specs/harness-guards.spec.ts` |
| `pnpm exec eslint e2e playwright.config.ts` | exit 0 |
| `pnpm lint` | the same `24 problems (12 errors, 12 warnings)`, byte-identical to the pre-change baseline; none in `e2e/` or `playwright.config.ts` |
| `pnpm exec tsc --noEmit` | 0 errors outside generated `.next/**/types/validator.ts` |
| `pnpm guardrails` | `Monorepo guardrails passed.` |
| `pnpm typecheck` | SUCCESS, unchanged |
| `pnpm test` | `turbo run test` resolves the task and prints `No tasks were executed` — **it asserts nothing yet**; recorded as a reachable pipeline, not a passing check |
| `pnpm test:airtable-removal` | the same pre-existing failure, unchanged |
| `git check-ignore -v e2e/.auth/admin.json` | exit 0, `.gitignore:48:/e2e/.auth/` |
| `git diff --stat 1dd7dc70 -- scripts/verify-monorepo-guardrails.mjs` | empty |
| `git status --short` after a full run | no `e2e/.auth/` entry |
| `E2E_MAILPIT_URL=http://127.0.0.1:8026 pnpm exec playwright test --project=setup-admin` | exit 1 — `Mailpit request failed (GET http://127.0.0.1:8026/api/v1/messages): fetch failed`, naming the probe URL |
| `E2E_BASE_URL=https://etwunirahuucodcxydgs.supabase.co` (now asserted in-suite, `harness-guards.spec.ts`) | non-zero exit whose output contains `must be a loopback address` |

**Live probes taken to settle findings** (each turned a `maybe-false` into a decided verdict):

- Chromium cookie retention with `expires: -1`, through `context.request.get` against a local HTTP server: the request still carried `Cookie: sb-ref-auth-token=base64-abc`, identical to a far-future expiry — refuting `E11`.
- Mailpit's message list against the running container: `total=50, returned=50`, unchanged by `?limit=500` and by `?offset=40` — refuting `E1`.
- The suite's own `git check-ignore` assertions, now covering the report directories and their anchoring.

### Residual risks

- **Unverified: the OTP rate-limit retry (`VG5`).** No test reaches its second attempt, because reaching it needs a real 429 from `[auth.email] max_frequency` — the limiter the suite depends on. The **B9**/**B10** fixes inside that branch (awaiting the stale error node away, asserting the form is back in step 1) are therefore unproven in CI and unproven here.
- **Unverified: the `LOOSE_CODE` fallback (`N4`).** It is the one path in the reader that can return an unrelated 6-digit run, and nothing exercises it. A wrong pick fails loudly rather than silently, so the risk is a confusing diagnosis, not a false green.
- **The `smoke` project's Admin default** remains a hazard for later specs, documented at I2 and in the development guide. Adding a role is a three-part change (`roles.ts`, a setup file, a `dependencies` entry), not the "one-file change" the header of `roles.ts` promises for renames.
- **The suite is still run by hand only.** `G3` / `DW-25` stand, untouched.
- Pre-existing and unchanged by this story: `pnpm lint`'s 24 problems, and `tsc --noEmit`'s generated `.next/**/types/validator.ts` errors.

## Design Notes

**Fixture emails carry a program suffix.** The seeder creates `preview-fixture-admin-folk@example.com`, not `preview-fixture-admin@example.com`; the companion doc abbreviates. `e2e/fixtures/roles.ts` keys off the verified strings and exposes an `E2E_*_EMAIL` override per role, so a fixture rename is a one-file change rather than a hunt.

**The OTP watermark is captured before the request, not after.** Mail delivery is fast enough that reading `since = Date.now()` *after* submitting can miss the message entirely. The flow records the timestamp, then submits, then polls — which is why `authenticateAsRole` (not the reader) owns the ordering.

**`/api/auth/me` cannot prove a dead session.** It swallows the 401 and answers `200 { staff: null }`, which reads identically to "signed out on purpose". `GET /api/manage/contacts/photo?contactId=<uuid>` is the probe: auth runs before the contact lookup, so it returns `401` for a dead session and `403` for a Volunteer with a live one, and it writes nothing.

**Admin landing on `/` is not by itself proof.** `/` is also the public marketing page, so `toHaveURL('/')` passes for an unauthenticated browser. The smoke therefore asserts the URL **and** a live `role: "Admin"` from `/api/auth/me`. That is what makes this one spec worth more than a screenshot.

**Retry the request, not just the poll.** `[auth.email] max_frequency = "1s"` returns `429 over_email_send_rate_limit` for two OTP requests inside a second (measured). Three setup projects each drive their own address sequentially, so this should not fire — but when it does, the honest response is a bounded retry with the Supabase message surfaced, never a silent skip.

## Verification

**Commands:**
- `pnpm test:e2e` -- expected: exit 0; the three setup projects authenticate and the smoke spec passes.
- `pnpm test:e2e` (second run, immediately after) -- expected: exit 0, proving regeneration rather than reuse of a cached session.
- `pnpm test` -- expected: exit 0, routing through the new turbo `test` task.
- `pnpm lint` -- expected: SUCCESS, no new errors in `e2e/` or `playwright.config.ts`.
- `pnpm exec tsc --noEmit` -- expected: SUCCESS (the root tsconfig already includes both new paths).
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.`
- `pnpm typecheck` -- expected: SUCCESS, unchanged.
- `pnpm test:airtable-removal` -- expected: the same two pre-existing failures, no regression.
- `git check-ignore -v e2e/.auth/admin.json` -- expected: exit 0 naming the new rule.
- `git diff --stat 1dd7dc70 -- scripts/verify-monorepo-guardrails.mjs` -- expected: empty.

**Manual checks:**
- Confirm `git status` is clean of any `e2e/.auth/` file after a full run.
- Confirm the OTP reader fails loudly: point `E2E_MAILPIT_URL` at a dead port and confirm the error names the probe URL rather than timing out blank.

**Observed** (local stack up, `apps/folk/.env.local` pointing at `127.0.0.1:54321`, folk app not running — `webServer` started it). Every command below was executed by the orchestrating session against the patched tree, not reported by the implementer.

| Command | Result |
|---|---|
| `pnpm test:e2e` (run 1, patched) | exit 0 — `14 passed (30.4s)` |
| `pnpm test:e2e` (run 2, no reset) | exit 0 — `14 passed (30.1s)`; the readiness gate's report is now visible ahead of the app boot |
| `pnpm test:e2e` (run 3, after the `waitForLanding` fix) | exit 0 — `14 passed (31.0s)` and again `14 passed (30.2s)` on an immediate re-run |
| canary assertion in the headline spec | exit 1 — `1 failed`, `8 passed`, naming `[smoke] › e2e/specs/smoke.spec.ts` |
| `pnpm exec eslint e2e playwright.config.ts` | exit 0 |
| `pnpm guardrails` | `Monorepo guardrails passed.` |
| `pnpm typecheck` | SUCCESS, unchanged |
| `pnpm test` | `turbo run test` resolves the new task; prints `No tasks were executed` — **it asserts nothing yet**, because no workspace package declares a `test` script. Recorded as a reachable pipeline, not as a passing check. |
| `pnpm lint` | the same `24 problems (12 errors, 12 warnings)`, byte-identical to the pre-change baseline; none in `e2e/` or `playwright.config.ts` |
| `pnpm exec tsc --noEmit` | 52 errors, **all** inside generated `.next/**/types/validator.ts`; `grep -v '^\.next/'` over the error lines returns 0 |
| `pnpm test:airtable-removal` | the same `2/30` pre-existing failures, unchanged |
| `git check-ignore -v e2e/.auth/admin.json` | exit 0, `.gitignore:48:/e2e/.auth/` |
| `git status --short` after a full run | no `e2e/.auth/` entry; `e2e/.auth/` holds exactly `admin.json`, `preacher.json`, `volunteer.json` |
| `git diff --stat 1dd7dc70 -- scripts/verify-monorepo-guardrails.mjs` | empty |
| `E2E_BASE_URL=https://etwunirahuucodcxydgs.supabase.co pnpm exec playwright test --list` | exit 1 — `E2E_BASE_URL must be a loopback address (127.0.0.1, localhost or ::1). Refusing "https://etwunirahuucodcxydgs.supabase.co"` |
| `E2E_MAILPIT_URL=http://127.0.0.1:8026 pnpm exec playwright test --project=setup-admin` | exit 1 — `Mailpit request failed (GET http://127.0.0.1:8026/api/v1/messages): fetch failed`, naming the probe URL |

**Matrix test audit: 8 of 8 rows covered by committed specs that ran and passed.** Each covering test is in `e2e/` and appeared in the run output above; none is skipped, filtered, or marked expected-failure.

| Row | Covering test(s), all passed |
|---|---|
| Admin smoke | `Admin lands on its landing path with a live staff session` |
| Session reuse | `a storageState session is reused without navigating to /login` |
| OTP read | the three setup projects (`authenticate as admin/preacher/volunteer`) prove the real `GET /api/v1/messages` → `GET /api/v1/message/{ID}` read against Mailpit; `mailpit-reader.spec.ts`'s four tests pin the reader's own contract against an injected mailbox — they never touch Mailpit, so they cover the reader's accept rule and diagnostics, not the live read |
| Cross-run staleness | each setup project asserts the artifact's `mtimeMs` is from this run; `every role storageState file is a live session for that role` proves the artifact is usable |
| Dead session | `a dead session is 401 unauthenticated on the manage API` |
| Role gate | `a Volunteer session is 403 forbidden on the same route` |
| Unknown email | `anonymous › an unseeded email fails visibly and provisions nothing` |
| Artifacts ignored | `the storageState artifacts are gitignored`, plus `the run-artifact directories are ignored, and only at the repo root` |

**Known pre-existing failures, unchanged by this story** (both reproduce on a clean `git stash -u` of this work):
- `pnpm lint` — `24 problems (12 errors, 12 warnings)`, all in `.agent/`, `.codebuddy/`, and `.neovate/` skill directories.
- `pnpm exec tsc --noEmit` — 52 errors, all in generated `.next/**/types/validator.ts` (stale local build artifacts).

**Risk left open:** `devDependencies["@playwright/test"]` is `^1.62.0`. `chromium-1234` in `~/.cache/ms-playwright` is 1.62.0's revision (1.63.0 asks for `chromium-1243`, which this environment cannot download), so a lockfile refresh resolves a newer 1.x and the suite then fails at browser launch rather than at an assertion. The pin rationale is now in `docs/development-guide.md`, but nothing mechanically prevents the drift.

