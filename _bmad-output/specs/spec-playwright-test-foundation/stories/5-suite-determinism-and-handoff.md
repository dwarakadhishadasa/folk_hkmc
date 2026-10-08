---
title: 'Suite determinism and handoff'
type: 'chore'
created: '2026-10-08'
status: 'done'
baseline_revision: 'c2cfaa6894332a44945eaf0701cdb9aafb1d126a'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: ''
context:
  - _bmad-output/specs/spec-playwright-test-foundation/SPEC.md
  - _bmad-output/specs/spec-playwright-test-foundation/local-environment.md
  - _bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The suite can be green once; nothing yet proves it is a *gate*. SPEC.md's two remaining manual checks — re-run `pnpm test:e2e` twice green with no reset, and prove a deliberately broken spec turns the run non-zero — have been performed by hand in earlier stories and recorded only in prose. And the guidance a later story author needs in order to claim a matrix row is covered is scattered across `matrix-coverage-map.md`, `CONTRIBUTING.md` and the specs themselves, so it has to be re-derived per story.

**Approach:** Commit the determinism evidence as mechanisms rather than as claims: a `pnpm test:e2e:determinism` script that runs the gate twice back to back and fails if either run is not green, and an offline `e2e/specs/suite-determinism.spec.ts` that nests a real Playwright run to prove a failing spec exits non-zero and is named, plus scans that assert no spec depends on wall-clock time, on a previous run's rows, or on execution order. Then write one handoff document — layer choice, seeding, and the "Covered requires a passed spec in the recorded run" rule — and cross-link it from the place the question gets asked.

## Boundaries & Constraints

**Always:**

- Every determinism check is **committed and re-runnable**. A check that lives in a conversation, a scratch file, or `/tmp` is exactly the story-1 failure mode this spec exists to end, and it must not reappear here.
- The nested failing spec is **generated into a temp directory and removed in a `finally`**, never committed under `e2e/specs/`. A deliberately broken committed spec would be a permanently red suite.
- The nested runs use their **own minimal config** in the temp directory — no `globalSetup`, no `webServer`, no repo config. A nested run that loaded `playwright.config.ts` would recurse into the whole suite.
- `package.json`, `CONTRIBUTING.md` and `docs/development-guide.md` are updated **in the same change** that alters the suite's shape, as `CONTRIBUTING.md:80` already requires.
- The recorded-run figures quoted anywhere (pass counts, revision) are **read from an actual run**, never estimated.

**Never:**

- **No CI.** Do not touch `.github/workflows/`. SPEC.md's non-goals say so explicitly, and a red or flaky suite in CI blocks everyone; wiring `test:e2e` there is a follow-up once the suite is stable.
- Do not change the behaviour of any existing spec, fixture, or config key. This story adds evidence and guidance; it does not alter what the suite tests.
- Do not edit any `## I/O & Edge-Case Matrix` table to match what was easy to check. Story 2's matrix stays byte-unchanged, as `matrix-coverage-map.md:261` records.
- Do not mark a matrix row Covered without a passed spec in the recorded run — including rows in this story's own matrix, whose coverage mechanisms are named explicitly below.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| The gate is deterministic | `pnpm test:e2e:determinism` — two consecutive `pnpm test:e2e`, no reset between | both runs exit 0; the script exits 0 and prints each run's pass count | a non-zero run fails the script and names which run failed, with that run's own output |
| A broken spec turns the gate red | a generated failing spec, nested `playwright test` with a temp config | exit code is non-zero **and** the output names the failing spec and test title | the temp directory is removed even when the run fails, so no artifact survives |
| A sound spec stays green | a generated passing spec, same nested mechanism | exit code 0 — proving the red above came from the failure, not from the harness | a non-zero exit here fails with the nested output |
| No spec depends on wall-clock time | every file under `e2e/` | no `waitForTimeout` call anywhere in the suite | the scan fails naming the file and line, so the fix is one edit away |
| No run depends on a previous run's rows | `playwright.config.ts` | `globalSetup` is wired (fixtures regenerate per invocation) and each setup project deletes its `storageState` first | missing wiring fails with the config line it expected |
| No run depends on execution order | `playwright.config.ts` | `fullyParallel: false`, `workers: 1`, and `retries: 0` when `CI` is unset — a flaky pass cannot be hidden by a retry | any missing key fails naming the key |
| Every written spec is a registered spec | `e2e/specs/*.spec.ts` | every spec file appears in `playwright test --list` output | an unregistered or filtered file fails naming that file |
| The determinism gate is wired | `package.json` | `test:e2e:determinism` invokes `scripts/verify-suite-determinism.mjs` | a missing or renamed script fails, so the gate cannot be silently dropped |

</intent-contract>

## Code Map

- `e2e/specs/harness-guards.spec.ts` — **the pattern this story copies.** Already nests a real `playwright test --list` via `spawnSync(PLAYWRIGHT_BIN, …)`, restores env in a `finally`, and uses `cleanEnv` to strip `TEST_*`/`PW_*` from the child. Read-only; the new spec follows it rather than inventing a second approach.
- `playwright.config.ts:57-107` — read-only. `globalSetup: "e2e/global-setup.ts"`, `fullyParallel: false`, `workers: 1`, `retries: isCI ? 1 : 0`, and the three `setup-*` projects. The order-independence and no-prior-rows scans assert against this file's text, exactly as `bulk-fixtures.spec.ts:935-946` already does for `globalSetup`.
- `e2e/auth/admin.setup.ts:23` (and `preacher`/`volunteer`) — the per-role delete-then-write that makes a stale session unable to survive a run.
- `e2e/fixtures/roles.ts:45` — `repoRoot`, the shared path anchor. Reuse it; do not resolve cwd a second way.
- `e2e/specs/bulk-fixtures.spec.ts:923-946` — precedent for reading `package.json` and `playwright.config.ts` as text and asserting wiring. The two new wiring rows follow it.
- `e2e/global-setup.ts:41-70` — why a run cannot depend on a previous run's rows: the generator is idempotent and runs once per invocation.
- `scripts/bulk-contact-fixtures.mjs` — read-only; the idempotence the double-run depends on.
- `CONTRIBUTING.md:69-116` — the "two `✘` marks" paragraph and the spec table, both of which state a pass count and a spec inventory this story changes. `:80` already requires updating them in the same commit.
- `docs/development-guide.md:358-440` — "Current Test Status"; same obligation.
- `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md:275-291` — "Claiming a matrix row: the rule this map now enforces". The handoff is the long-form version of these five rules; the map gets a cross-link, not a replacement.
- `_bmad-output/specs/spec-playwright-test-foundation/SPEC.md:116-117` — the two manual checks this story turns into committed mechanisms.

## Tasks & Acceptance

**Execution:**

- `scripts/verify-suite-determinism.mjs` — NEW. Runs `pnpm test:e2e` twice back to back with no reset between, captures each run's exit status and pass count from the Playwright output, prints both, and exits non-zero if either is not green — naming **which** run failed and echoing that run's output. Bounded per-run timeout; nothing is written outside the repo's own gitignored artifacts.
- `package.json` — add `test:e2e:determinism` wired to that script. Do not touch `test:e2e`.
- `e2e/specs/suite-determinism.spec.ts` — NEW, offline. Eight tests, one per matrix row, titled with the row they cover: nested failing run (non-zero **and** named, temp dir removed in `finally`), nested passing run (exit 0), no `waitForTimeout` under `e2e/`, `globalSetup` + per-project `storageState` delete wired, `fullyParallel`/`workers`/`retries` keys present, every `e2e/specs/*.spec.ts` appearing in `playwright test --list`, and the `test:e2e:determinism` script wired.
- `docs/claiming-a-matrix-row.md` — NEW handoff. Which layer to use (UI / `request` API / `page.route` interception) with the observable that selects each; how to seed what a row needs (tag `preview-fixture-`, seed your own rows, restore anything you rename in a `finally`, never depend on another spec's leftovers); and the rule that **Covered requires a spec that passed in a recorded run**, with the run's revision, Playwright version, `baseURL` and worker count. Include the `test.fail` tripwire pattern and the two-row worked example that stays Manual.
- `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md` — add a cross-link to the handoff from the "Claiming a matrix row" section, pointing at it as the long-form version. Do not alter the 19-row verdict table.
- `CONTRIBUTING.md` — update the pass count and the two-`✘` paragraph to the counts this story's run actually produced; add `test:e2e:determinism` to the commands and a pointer to the handoff.
- `docs/development-guide.md` — same obligation in "Current Test Status": record the determinism script and the new spec.

**Acceptance Criteria:**

- Given the local stack is up, when `pnpm test:e2e:determinism` runs, then both runs report their own pass counts, both exit 0, and the script exits 0 — with no manual reset, seed, or `supabase:reset` between them.
- Given the determinism script has just run, when `pnpm test:e2e` is run a third time, then it is still green, proving the script left no state behind.
- Given a deliberately broken committed spec, when `pnpm test:e2e` runs, then it exits non-zero and prints the failing spec's title; and after reverting the break, `pnpm test:e2e` is green again and `git diff` shows no trace of the deliberate failure.
- Given `e2e/specs/suite-determinism.spec.ts`, when it runs inside the suite, then all eight matrix rows are covered by tests that ran and passed in that run's output — no row covered by a skipped or filtered test.
- Given a later story author with a matrix row and no idea which layer to use, when they follow `docs/claiming-a-matrix-row.md` from the link in `matrix-coverage-map.md`, then they can name the layer, the seeding, and the evidence required to flip the row to Covered, without running anything.
- Given `.github/workflows/`, when this story's diff is inspected, then it is untouched.

## Spec Change Log

## Review Triage Log

## Design Notes

**The nested run gets its own minimal config, not the repo's.** A nested `playwright test` pointed at `playwright.config.ts` would load `globalSetup`, spin up `webServer`, and recurse into every spec — including the one making the assertion. The nested config declares only `testDir` inside the temp directory, `reporter: "list"`, `workers: 1`. The nested spec uses plain `expect` on a literal, so no browser or stack is needed and the check stays cheap enough to run every time.

**Proving the gate can fail needs a paired green run.** Asserting only "a failing spec exits non-zero" is satisfied by a harness that is *always* red — a bad config path, a missing browser, a typo'd temp directory. The generated passing spec runs through the identical mechanism and must exit 0, which is what makes the red meaningful.

**The scans assert text, deliberately.** `playwright.config.ts` and `package.json` are configuration, not behaviour; there is nothing to call at runtime. Asserting their keys as text is the same technique `bulk-fixtures.spec.ts:935` already uses for `globalSetup`, and it is mutation-checkable — deleting the key turns the test red.

**`retries: 0` locally is a determinism property, not a CI setting.** `isCI ? 1 : 0` means a developer's run cannot hide a flake behind a retry. That is exactly what "green twice back to back" has to mean to be worth anything.

## Verification

**Commands:**

- `pnpm test:e2e:determinism` -- expected: two runs, each reporting its pass count, both `exit 0`, script `exit 0`. This is the story's primary gate.
- `pnpm test:e2e` -- expected: `exit 0` after the determinism script, with no reset in between.
- `pnpm test:e2e` with a deliberate failure injected into one spec -- expected: **non-zero** exit, and the output names that spec's title. Revert immediately afterwards and confirm with `git diff` that no trace of the deliberate failure remains.
- `pnpm typecheck` -- expected: SUCCESS, no output.
- `pnpm lint` -- expected: SUCCESS, no new errors in `e2e/`, `scripts/verify-suite-determinism.mjs`, or `playwright.config.ts`.
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.`
- `pnpm test:airtable-removal` -- expected: no regression; the count of pre-existing failures must not increase.
- `git diff --stat 5678c08 -- .github/workflows/` -- expected: empty. Proves the CI non-goal was honoured.