---
id: SPEC-playwright-test-foundation
companions:
  - local-environment.md
  - auth-and-fixtures.md
  - matrix-coverage-map.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete contract for what to build and validate. This spec introduces no user-facing capability: it builds the local verification harness that makes other specs' matrices honestly testable.

# Local environment and Playwright test foundation

## Why

Every story whose intent-contract carries an **I/O & Edge-Case Matrix** must satisfy `bmad-build-auto` step 3's **Matrix Test Audit**, which requires each matrix row to be covered by a test that *verifies its expected behavior* **and that ran and passed**. A covering test that exists but did not run — unregistered, filtered, skipped — counts as missing. The rule is unconditional; there is no manual-check escape hatch.

This repository cannot satisfy it. `CONTRIBUTING.md:36` states outright that there is no automated test suite, and that is accurate: the five `test:*` scripts are static `verify-*.mjs` analysis scripts, and a repo-wide search finds **zero** `*.test.*` / `*.spec.*` files. The consequence is already paid for twice:

- **Story 1** (`spec-manage-dashboard-grid`) passed its 12-row matrix using throwaway harnesses written to `/tmp`. Story 1's own record states the cost plainly: *"The matrix test audit is satisfied by throwaway harnesses under `/tmp`, not by committed tests … Nothing in the repo will re-run these checks."* Twelve passing checks that evaporate with the container.
- **Story 2** refused to repeat the trick. It found the audit genuinely unsatisfiable and halted with `matrix test audit failed` — 0 of 19 rows covered — spending a full dev attempt (~1.7M weighted tokens) to report a problem **no dev session can solve from inside a story**, because the missing thing is test infrastructure.

Left alone this recurs on every remaining story, and every occurrence costs a dev attempt to rediscover the same wall.

**The fix is not a story.** Adding a test runner to a refactor story would smuggle cross-cutting infrastructure into a feature's verification story, and would license every later story to add tests opportunistically. It earns its own spec, built before story 2 re-runs.

## Capabilities

- **CAP-A** — Reproducible local stack
  - **intent:** A developer can bring up Supabase, Mailpit, seeded fixtures, and both Next apps locally with one command, so tests run against the same shapes CI and preview use.
  - **success:** One documented command sequence yields a reachable local Supabase on `:54321`, Mailpit on `:8025`, and the folk app on `:3000`, with a seeded staff chain that can actually sign in.

- **CAP-B** — Committed Playwright suite
  - **intent:** The behaviors our matrices promise are covered by tests that live in the repo and re-run on demand, rather than by `/tmp` harnesses that disappear.
  - **success:** `pnpm test:e2e` runs the committed suite headlessly against the local stack and exits non-zero on failure; a matrix row is covered only when a committed spec verifies its expected behavior and that spec passed in the run output.

- **CAP-C** — Deterministic staff authentication
  - **intent:** Every spec starts already signed in as a known staff role, with no human at the keyboard and no dependence on wall-clock or mailbox state.
  - **success:** A `storageState` fixture signs in as a seeded Admin or Preacher and is reusable across specs; the sign-in path is automated end to end, not stubbed.

- **CAP-D** — Per-row matrix mapping
  - **intent:** Any story author can tell, without running anything, which of their matrix rows are covered and which are not — before they claim completion.
  - **success:** A committed mapping lists each matrix row to the spec that verifies it; a row with no entry, or whose entry did not pass, is visibly uncovered.

## Non-goals

- **No Vitest or any unit runner.** Playwright covers every row we need. API-level rows (the 200-item cap, a bad `contactId`, a malformed `results` body) are exercised over real HTTP via Playwright's `APIRequestContext`, which also proves the route's status codes and body shape rather than a mock's idea of them.
- **No hosted-environment runs.** This spec is local-only by design. The hosted project is pre-cutover and disposable; pointing an E2E suite at it would make tests mutate production-shaped data. Hosted verification stays with the existing `verify-*.mjs` scripts.
- **No test coverage of pre-existing grid logic beyond what matrices claim.** Stories own their rows. This spec builds the harness; it does not retro-audit stories 1–3.
- **No CI workflow changes.** Wiring `pnpm test:e2e` into `.github/workflows` is a follow-up once the suite is green and not flake-prone. Out of scope here, deliberately: a red suite in CI blocks everyone.

## I/O & Edge-Case Matrix

Per the audit rule, this spec's own matrix is held to the same standard. Every row below is covered by a committed spec in this spec's suite.

**Bootstrap caveat, stated rather than hidden.** Rows 1–4 and 8 are verifiable only *after* this spec's own harness exists. A dev session running this spec's first story will hit the same wall story 2 hit, because the audit is unconditional and there is no harness yet. That is inherent to bootstrapping a test harness and it has exactly two honest exits:

1. The harness stories' specs mark these rows with the coverage mechanism they introduce (the readiness assertions, the seed idempotence check, the OTP reader, the coverage-map check) and satisfy the audit against **those** — narrow but real, and each is genuinely runnable the moment its own story lands.
2. Failing forward: the first harness story halts `matrix test audit failed` once, and the resolve step records that this spec is exempt for its own duration because it *is* the thing that ends the exemption for every later spec.

Option 1 is preferred — it keeps the spec honest and costs one clarification. Option 2 is acceptable and is recorded here so it is a decision rather than a surprise. **What is not acceptable is a harness story quietly marking these rows Covered against `/tmp` scripts**, which is precisely the failure mode this spec exists to end.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Stack comes up clean | `pnpm dev:local` on a fresh clone | Supabase `:54321`, Mailpit `:8025`, folk `:3000` all reachable; migrations applied; fixtures seeded | command fails loudly, never leaves a half-up stack silently |
| Seed is idempotent | `pnpm seed:preview-fixtures` twice | second run exits 0 with no duplicate rows and no auth-user collision | a `users.id` ≠ `auth.users.id` mismatch exits 1 (DW-3, already asserted by the script) |
| Sign-in is automated | Admin fixture email + `/login` | 6-digit OTP is read from Mailpit's API, submitted, and the session lands on the app's landing path for the role | an unreadable or absent OTP fails the test with the Mailpit message id, not a bare timeout |
| Reused session | a spec loading the Admin `storageState` | already authenticated on first navigation, no `/login` round trip | an expired/401 session fails fast with the response status |
| API row: cap rejected | bulk POST with 250 items, cap 200 | `400` naming the cap; no partial write | envelope errors never surface as per-row failures |
| API row: bad item isolated | one item's `contactId` not a UUID | that item alone reports `contactId must be a UUID.`; every other item commits | per-item isolation, never a batch rejection |
| API row: malformed response | `200` whose body lacks `results` | client reports a bulk failure naming the response; never renders success | no success state on an unverified payload |
| Coverage map is honest | a row mapped to a spec that did not run | the row reads uncovered | an unrun spec never counts as coverage |

## Verification

**Commands:**

- `pnpm test:e2e` -- expected: exit 0; the suite runs headlessly against the local stack. This is the real gate.
- `pnpm typecheck` -- expected: SUCCESS, no output (`next.config.mjs:4-6` sets `ignoreBuildErrors: true`).
- `pnpm lint` -- expected: SUCCESS, no new errors in `e2e/` or `playwright.config.ts`.
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.` The suite must not reach a server-only specifier from a client context; `verify-monorepo-guardrails.mjs` is the proof.
- `pnpm test:airtable-removal` -- expected: no regression. The two pre-existing failures in `scripts/migrate-airtable-data.mjs` and `scripts/delta-sync-old-project.mjs` were reproduced at `5678c08` before any grid file existed; the count must not increase.
- `git diff --stat 5678c08 -- scripts/verify-monorepo-guardrails.mjs` -- expected: empty. Proves the prefix list was not touched.

**Manual checks:**

- From a clean shell, follow `local-environment.md` verbatim. It must work without tribal knowledge.
- With the stack up, sign in as a seeded Admin on `http://localhost:3000/login` and confirm the OTP arrives in Mailpit at `http://localhost:8025`.
- Re-run `pnpm test:e2e` twice. The second run must be green without a manual reset — a suite that only passes on a fresh stack is not deterministic.
- Introduce a deliberate failure in one spec and confirm `pnpm test:e2e` exits non-zero and names it. A suite that cannot fail is not a gate.

## Risk register

| Risk | Why it bites | Mitigation |
|---|---|---|
| Supabase local is slow/flaky to start | every test run depends on it | assert readiness explicitly before the suite, fail with the `supabase status` output rather than a bare timeout |
| OTP mail is not delivered instantly | sign-in race, the flakiest step in the suite | poll Mailpit's API with a bounded retry, keyed on the recipient, rather than a fixed `waitForTimeout` |
| Tests mutate shared local data | ordering-dependent failures | each spec seeds its own tagged fixtures and cleans up after itself; no reliance on rows left by a previous run |
| Email OTP flow changes | `lib/auth-context.tsx` is a dependency, not a fixture | the OTP reader targets Mailpit's HTTP API, not Supabase internals, so an auth-library change does not break it |
| Matrix audit still unsatisfiable after this ships | would re-block story 2 | CAP-D's coverage map is verified *by this spec* before any dependent story claims a matrix row is covered |
