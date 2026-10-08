---
title: 'Migrated baseline and populated local schema'
type: 'chore'
created: '2026-10-08'
status: 'done'
baseline_revision: '47a5413ded2ab249857a7c51f0982c2aef494c78'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - _bmad-output/specs/spec-playwright-test-foundation/branch-and-schema-baseline.md
  - _bmad-output/specs/spec-playwright-test-foundation/local-environment.md
  - _bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md
warnings: []
deferred:
  - summary: >-
      docs/development-guide.md still states that no product test suite exists and
      the "Current Test Status" section has no automated suite, which now
      understates the repo — `test:seed-local-guard` and `local:readiness` are
      committed, runnable checks.
    evidence: |-
      docs/development-guide.md still carries the stale sentence, and
      matrix-coverage-map.md assigns the update to the story that builds the
      Playwright suite. This story adds harness scripts, not a product test
      suite, so amending that section here would overstate what exists.
    location: >-
      docs/development-guide.md:140
    severity: low
---

<intent-contract>

## Intent

**Problem:** The local Supabase stack is schema-only by default and nothing in `pnpm dev:local` fixes that, while `scripts/seed-preview-fixtures.mjs` resolves its target from `.env.migration.local` — which holds the **hosted** URL. Run naively, the seed writes 24 rows to hosted pre-cutover data while the app reads empty local Postgres, silently. There is also no check that can tell "the stack is running" from "the stack is usable".

**Approach:** Add a `pnpm seed:local` wrapper that exports local credentials from `supabase status -o env` *before* invoking the seeder (`process.loadEnvFile` defers to already-exported variables, verified), make the seeder itself refuse any non-local URL, wire `seed:local` into `dev:local` after `supabase:env`, and add a readiness script that asserts health **and** data **and** target agreement.

## Boundaries & Constraints

**Always:**
- Never alter the seeder's seeding logic, its DW-3 assertion, its `preview-fixture-` tag convention, or the `--wipe`-before-password-resolution ordering. Story 4's fixture generator depends on the tag filter.
- The refusal must fire **before** any Supabase client is constructed, so a refused run performs zero network I/O.
- Readiness failures must print `supabase status` output in the message.
- New scripts live flat in `scripts/` as `.mjs` run by `node`, exit non-zero on failure, and never print credential values.
- Local-only by contract: nothing in this story may write to `etwunirahuucodcxydgs`.

**Never:**
- No unit/Vitest runner, no Playwright config, no `turbo` `test` task (story 2).
- No CI wiring, no changes to `scripts/verify-monorepo-guardrails.mjs`, no `.github/workflows` edits.
- No `--force`-style silent overrides: escaping the refusal requires an explicit `--allow-non-local` flag or `SEED_ALLOW_NON_LOCAL=1`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| seed:local seeds locally | local stack up, no `NEXT_PUBLIC_SUPABASE_URL` exported | exports `API_URL`/`SERVICE_ROLE_KEY` as the three expected names; prints `Total created: N` and `DW-3 check passed` | stack down / status unreadable → exit 1 naming `pnpm supabase:start` |
| seed:local is repeatable | `pnpm seed:local` twice | second run prints `Total created: 0` | non-zero on re-run → exit 1 naming the tag filter as the suspect |
| seed refuses a non-local URL | `NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co` | exit 1, refusal message names the host and the override; zero network I/O | — |
| refusal can be overridden | same URL + `--allow-non-local` | guard skipped, run proceeds past it | unreachable host then fails downstream — but NOT with the refusal message |
| refusal predicate is fail-closed | real hosted URL, and an unparseable/empty URL | both classified non-local | — |
| readiness: usable stack | stack up, app env local, rows seeded | exit 0; per-table counts and both URLs printed | — |
| readiness: wrong target | app env file holding a hosted URL | exit 1 naming the configured URL and local `API_URL`, plus `supabase status` | — |
| readiness: empty database | `--min-rows 1000000` | exit 1 naming the table and its actual count, plus `supabase status` | — |
| readiness: Mailpit absent | `--mailpit-url http://127.0.0.1:9` | exit 1 naming the probe URL, plus `supabase status` | — |
| baseline is migrated | repo checkout | ≥12 files in `supabase/migrations/`; `lib/supabase/` and `components/grid/` present | missing → exit 1 naming the missing path |
| dev:local chains the seed | root `package.json` | `seed:local` present after `supabase:env` and before `dev` | — |

</intent-contract>

## Code Map

- `scripts/seed-preview-fixtures.mjs` — the seeder. Env load at `:42-47` (`process.loadEnvFile(".env.migration.local")`); reads **only** `NEXT_PUBLIC_SUPABASE_URL` (`:135`) and `SUPABASE_SERVICE_ROLE_KEY` (`:136`) via `requireEnv` (`:129`); client built `:138`; password precedence `:163-190` (env → `.env.preview-seed.local` → generate); `TAG = "preview-fixture-"` `:108`; `--wipe` parsed `:127`, branched `:570`; DW-3 pre-write `:369-388` + post-write `:392-396` + aggregate `:544-564`/`:585-590`; `Total created:` `:615`. **Read-only except for the refusal guard.**
- `scripts/use-local-supabase-env.sh` — the proven `status -o env` parse to copy: `:19` invokes `pnpm dlx supabase@2.98.2 status -o env`; `:21-28` greps `^NAME=`, `cut -d= -f2-` (keeps `=` inside JWTs, **and keeps the surrounding double quotes** — callers must strip them); `:30-33` missing-credential `exit 1`; rewrites `apps/{folk,gita-life}/.env.local` between `# BEGIN/END LOCAL SUPABASE` markers (`:42-61`).
- `scripts/verify-rls.mjs:223-234` — the repo's only existing HTTP health probe (`fetch("${SUPABASE_URL}/auth/v1/health")` with an 8s `AbortController`). Pattern to reuse.
- `scripts/verify-program-readiness.mjs` — **not** a stack readiness check (source-text assertions only). Do not extend it.
- `package.json:30` — `dev:local` chain; `:39` — `seed:preview-fixtures`; `:21` — `lint: eslint .`; `:26-27` — `supabase:env` / `supabase:status`.
- `.env.migration.local` — holds the **hosted** `NEXT_PUBLIC_SUPABASE_URL`. This is the trap.
- `apps/folk/.env.local`, `apps/gita-life/.env.local` — currently hosted; `supabase:env` rewrites them local. Values are stored **quoted**.
- `docs/development-guide.md` — §Local Supabase `:41-63`, Mailpit `:65-76`, Run The App `:78-102`, Build And Checks `:104-127`, Troubleshooting `:160-169`. Line 7's "there is no local Supabase stack" is stale and contradicts this story.
- `supabase/migrations/` — 12 files on `dev`. `lib/supabase/` and `components/grid/` are at **repo root**, not under `apps/`.
- `eslint.config.mjs:20-34` — `scripts/` is **not** ignored; new `.mjs` files are linted. `tsconfig.json` covers only `*.ts(x)`, so no typecheck applies.

## Tasks & Acceptance

**Execution:**
- `scripts/local-supabase-target.mjs` — NEW flat shared module exporting `isLocalSupabaseUrl(url)` (true only for `127.0.0.1`/`localhost`/`::1`, any scheme; unparseable/empty → **false**) and `assertLocalSupabaseTarget({ url, allowNonLocal })` throwing a refusal that names the host and both override routes — so the seeder and its verifier share one definition instead of two copies.
- `scripts/seed-preview-fixtures.mjs` — import that module and call `assertLocalSupabaseTarget` immediately after the `:42-47` env load and **before** `requireEnv`/client creation, checking `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`. Nothing else in the file changes.
- `scripts/seed-local-fixtures.mjs` — NEW. Resolve `pnpm dlx supabase@2.98.2 status -o env`, strip the surrounding quotes, export `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` = `API_URL` and `SUPABASE_SERVICE_ROLE_KEY` = `SERVICE_ROLE_KEY` into `process.env`, then `spawn` `node scripts/seed-preview-fixtures.mjs` with that env and `stdio: "inherit"`, forwarding argv (`--wipe`, `--allow-non-local`). Empty credentials → exit 1 naming `pnpm supabase:start`.
- `scripts/verify-local-stack-readiness.mjs` — NEW. Baseline assertions (offline filesystem reads), Supabase `:54321/auth/v1/health` → 200, Mailpit `GET /api/v1/messages` → 200, PostgREST `Prefer: count=exact` + `Range: 0-0` counts for `contacts`/`users`/`locations`/`sessions` asserted `> 0`, and app-env `SUPABASE_URL` compared to `API_URL` with loopback normalisation. Collects **all** failures before exiting. Flags: `--mailpit-url`, `--app-env-file`, `--min-rows`, `--timeout-ms`.
- `scripts/verify-seed-local-guard.mjs` — NEW. Asserts the predicate directly (hosted URL, `127.0.0.1`, `localhost`, unparseable) and executes the seeder twice with a non-resolvable non-local host: once expecting the refusal exit, once with `--allow-non-local` expecting to get *past* the guard.
- `package.json` — add `seed:local`, `local:readiness`, `test:seed-local-guard`; insert `pnpm seed:local` into `dev:local` between `supabase:env` and `dev`.
- `docs/development-guide.md` — document `seed:local` (including the refusal and its override), `local:readiness`, and `test:seed-local-guard`; correct the stale line 7; update the `dev:local` description at `:96`.

**Acceptance Criteria:**
- Given a developer with the local stack up and nothing exported, when they run `pnpm seed:local`, then rows are created in **local** Postgres and the run prints `Total created: N` and `DW-3 check passed`.
- Given `NEXT_PUBLIC_SUPABASE_URL` pointing at the hosted project, when the seeder is invoked, then it exits 1 with a refusal naming that host, makes no network request, and writes nothing.
- Given `apps/*/.env.local` pointing at the hosted project while the local stack runs, when `pnpm local:readiness` runs, then it exits 1 and prints both the configured URL and the local `API_URL`.
- Given the local schema with zero rows, when `pnpm local:readiness` runs, then it exits 1 on the row-count assertion — a reachable-but-empty database fails the check, not the first spec.
- Given the repo on `dev` after the fast-forward, when `pnpm local:readiness` runs its baseline section, then it reports 12 migrations and the presence of `lib/supabase/` and `components/grid/`.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 59 findings — high 2, medium 13, low 15, false 27, maybe-false 2
- findings:
  - `[high]` `[patch]` readiness checks only one of `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` per env file, so a file with a local `SUPABASE_URL` and a **hosted** `NEXT_PUBLIC_SUPABASE_URL` reports "agrees" — REPRODUCED: `verify-local-stack-readiness.mjs` against a fixture holding `SUPABASE_URL=http://127.0.0.1:54321` + `NEXT_PUBLIC_SUPABASE_URL=https://etwunirahuucodcxydgs.supabase.co` printed **zero** "Wrong target" failures. The browser reads hosted; this is the story's headline bug going undetected. (edge-case-hunter #18)
  - `[high]` `[patch]` same root cause as the row above, filed independently by the verification-gap layer — the wrong-target verdict has no automated coverage at all. (verification-gap #5)
  - `[medium]` `[patch]` `normalizeSupabaseEndpoint` — the sole driver of the wrong-target verdict — is imported by no verifier; inverting the comparison in `checkAppEnvAgreement` fails nothing in the repo. (verification-gap #5, second claim; blind-hunter #2 and #19)
  - `[medium]` `[patch]` the guard's `SUPABASE_URL` half is untestable as written: `baseEnv` sets both URL variables identically, so deleting `"SUPABASE_URL"` from the loop at `seed-preview-fixtures.mjs:59` leaves all 21 assertions green. (verification-gap #3)
  - `[medium]` `[patch]` `SEED_ALLOW_NON_LOCAL=1` is documented as an override and named in the refusal message but never executed by any check; changing `=== "1"` to `=== "true"` breaks the documented escape hatch silently. (verification-gap #4; edge-case-hunter #6 — `true`/`yes`/`on` are also silently ignored, consistent with the documented `=1` so rejected as a separate fix)
  - `[medium]` `[patch]` the wrapper's conditional `PREVIEW_FIXTURE_PASSWORD` default — the one branch whose failure is silent — has no test; the verifier spawns the seeder directly and never the wrapper. (verification-gap #1)
  - `[medium]` `[patch]` the wrapper's exit-code propagation is unverified, so `dev:local`'s `&& pnpm seed:local` could pass a failed seed into `pnpm dev`. (verification-gap #2)
  - `[medium]` `[patch]` only `apps/folk/.env.local` is checked by default; `supabase:env` writes `apps/gita-life/.env.local` too, so a stale Gita Life file passes `local:readiness` while `:3001` reads hosted. (verification-gap, Other findings #2)
  - `[medium]` `[patch]` `unquote` + the `NAME="value"` parser are copy-pasted into `seed-local-fixtures.mjs:342-357` and `verify-local-stack-readiness.mjs:688-704`, reintroducing the drift `local-supabase-target.mjs` exists to prevent — within the same diff. (blind-hunter #4; edge-case-hunter #9, #19 — single-quote handling folded into the same fix)
  - `[medium]` `[patch]` a failing baseline short-circuits every later section (`if (failures.length === 0)`), contradicting the script's own "collects every failure before exiting" and the spec's "never leaves a half-up stack silently". (blind-hunter #5; edge-case-hunter #24)
  - `[medium]` `[patch]` `spawnSync` on `pnpm dlx supabase@2.98.2 status` has no timeout in both new scripts; a dlx fetch stalls the run with no output and `status === null` reports "exited null". (blind-hunter #16; edge-case-hunter #16, #17)
  - `[medium]` `[patch]` a flag given as the last argv token with no value yields `NaN`/`undefined` and a crash or an unhelpful message instead of naming the missing value. (blind-hunter #6; edge-case-hunter #12, #13)
  - `[medium]` `[patch]` `dev:local`'s chain position for `seed:local` is asserted only by a human reading `package.json`; moving it during a merge conflict reopens the empty-database gap with no failing check. Filed `defer` by the layer and re-routed to `patch` — the check is three offline lines and belongs to this story, not a follow-up. (verification-gap #6)
  - `[medium]` `[patch]` `dev:local` docs do not say a seed failure blocks app startup, nor that `Total created: 0` is the expected idempotent outcome. (blind-hunter #14)
  - `[medium]` `[patch]` the hardcoded `LocalDevFixture123!` default is documented nowhere, so a developer following the new docs cannot sign in as the fixtures they just seeded. (blind-hunter #10)
  - `[low]` `[patch]` `--min-rows 0` is accepted and silently disables the story's "non-zero" requirement. (blind-hunter #6; edge-case-hunter #25)
  - `[low]` `[patch]` the refusal message interpolates the raw URL verbatim before redaction is registered, so a userinfo credential would reach stderr. (edge-case-hunter #2, #27)
  - `[low]` `[patch]` the override-run assertion is only `status !== 0`; it would pass if the override ever succeeded, and its `spawnSync` has no timeout. (blind-hunter #15, #17; edge-case-hunter #22)
  - `[low]` `[patch]` `probe` never drains the response body and the script calls `process.exit` with sockets open — low today, but this becomes story 2's `webServer` dependency. (blind-hunter #18; edge-case-hunter #15, #161)
  - `[low]` `[patch]` `readdirSync` after `existsSync` can throw uncaught (EACCES/race). (edge-case-hunter #18)
  - `[low]` `[patch]` `normalizeSupabaseEndpoint` returns `null` for unparseable input, so two garbage values compare equal and pass. (edge-case-hunter #3; #4 — scheme/path divergence is `false`; #5 — scheme-less `localhost:54321` folds into the same null guard)
  - `[low]` `[patch]` `assertLocalSupabaseTarget`'s JSDoc documents two return cases; the third (empty input → `false`) is asserted by the verifier but undocumented. (blind-hunter #1)
  - `[low]` `[patch]` `MIN_MIGRATIONS = 12` is an unexplained, non-overridable constant. (blind-hunter #9)
  - `[low]` `[patch]` `parseArgs` and `countFromContentRange` have no unit assertions. (blind-hunter #3, #6)
  - `[low]` `[patch]` the docs' script quick-reference omits `pnpm seed:local`, the one command the new prose tells readers to run. (blind-hunter #11)
  - `[low]` `[patch]` no troubleshooting row for readiness failing on zero rows, and none for the refusal's two override routes. (blind-hunter #11, #12)
  - `[low]` `[patch]` the `--min-rows 1000` example is unexplained and contradicts the default-1 rationale. (blind-hunter #13)
  - `[low]` `[patch]` the readiness output block has one flush-left line among indented siblings. (intent-alignment, §3)
  - `[false]` `[reject]` `countFromContentRange` mis-parses PostgREST's `*/0` empty-table sentinel and reports a broken HTTP contract instead of the empty table. **Disproved by execution**: ran `pnpm seed:local --wipe` to a genuinely empty database — readiness printed "Table contacts has 0 row(s), expected at least 1" for all four tables. The regex `/\/(\d+)$/` matches `/0`. (edge-case-hunter #2, verification-gap Other #1)
  - `[false]` `[reject]` the seeder may pair a local URL with a **hosted** anon key inherited from `.env.migration.local`, since `seed-local-fixtures.mjs` does not override `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The seeder reads only `NEXT_PUBLIC_SUPABASE_URL` (`:135`) and `SUPABASE_SERVICE_ROLE_KEY` (`:136`) — the anon key is never consulted. (edge-case-hunter #10)
  - `[false]` `[reject]` a seed failure in `dev:local` should be downgraded (`&& … || echo skipped`) so the app still starts. **Disproved by the intent**: SPEC matrix row 1 requires the chain to "fail loudly, never leave a half-up stack silently". A seed that failed and an app that starts against it is exactly the silent empty-database symptom this story exists to end. (edge-case-hunter #23)
  - `[false]` `[reject]` `127.0.0.2` and other `127.0.0.0/8` loopback addresses are refused. **Disproved by the intent**, which specifies refusing "anything that is not 127.0.0.1 or localhost"; the diff *widens* the allowlist to `::1`. (edge-case-hunter #1)
  - `[false]` `[reject]` `normalizeSupabaseEndpoint` ignores scheme, so `https://127.0.0.1` (implicit 443) compares equal to `http://127.0.0.1` (implicit 80). It does not — the implicit-port branch resolves them to `127.0.0.1:443` vs `127.0.0.1:80` and the check correctly fails. (edge-case-hunter #4)
  - `[false]` `[reject]` `unquote` mishandles single-quoted `supabase status -o env` values. The CLI's output form is `NAME="value"` — recorded as observed in this spec's Design Notes and in `use-local-supabase-env.sh` — and a stray quote makes the URL unparseable, which the guard then refuses loudly rather than mis-targeting. (edge-case-hunter #9)
  - `[false]` `[reject]` forwarded argv needs `--` filtering; pnpm strips its own separator, and the seeder's `argv.includes("--wipe")` is unaffected by a stray `--`. (edge-case-hunter #11)
  - `[false]` `[reject]` the readiness script has no overall probe budget, so a dead stack takes ~40s serially. Each probe has its own timeout, every failure is collected, and the total is bounded by construction; an overall budget is a new parameter for a bounded delay. (edge-case-hunter #14)
  - `[false]` `[reject]` `readEnvFile` mishandles `export `-prefixed or single-quoted lines. `use-local-supabase-env.sh` writes plain `KEY=value`; this is the file shape it controls. (edge-case-hunter #19)
  - `[false]` `[reject]` `assertLocalSupabaseTarget`'s `false` return for a non-local-but-allowed target could be misread by a caller. The sole caller is the seeder's guard, which ignores the return; `describeSupabaseHost`'s "(unset)" placeholder has no reader. (edge-case-hunter #27, #20, blind-hunter #1 third case)
  - `[false]` `[reject]` guarding on `SUPABASE_URL` as well as `NEXT_PUBLIC_SUPABASE_URL` refuses legitimate local seeds. Intentional fail-closed design named in this spec's Tasks; the refusal names the offending variable and the override is available. (edge-case-hunter #7)
  - `[false]` `[reject]` the override-run assertion can pass without proving the guard was skipped. It already asserts the refusal marker is **absent** from the output, which is the direct proof the guard was bypassed; the run cannot succeed against an RFC 6761 `.invalid` host. (edge-case-hunter #21)
  - `[false]` `[reject]` the seeder is killed by signal during the guard test, so `status === null` counts as non-zero. Both spawned runs are ordinary synchronous completions against an unresolvable host; no signal path is reachable here. (edge-case-hunter #23)
  - `[false]` `[reject]` the wrapper's docstring claims it exports credentials "into `process.env`" while it builds a child env object. Wording, not behaviour — `childEnv` is passed as the child's env, which is what the seeder reads. (edge-case-hunter #26)
  - `[false]` `[reject]` the story adds no Verification evidence for `pnpm local:local` / `pnpm local:readiness`. The `## Verification` section already enumerates every command, and all of them were executed in this run. (blind-hunter #20)
  - `[false]` `[reject]` `--app-url` is needed for the `:3000` warning because the repo also runs gita-life on `:3001`. It is a warning, never a failure, and adding a flag is surface for no behavioural gain. (blind-hunter #8; edge-case-hunter #20)
  - `[false]` `[reject]` the intent's "defaults `PREVIEW_FIXTURE_PASSWORD` when unset" implies an unconditional default. **Settled at planning time** by the Design Note below, which selects the conditional reading and records why: an unconditional default silently repoints existing auth users' passwords. The implemented reading satisfies the intent's purpose — a usable default exists exactly when nothing else supplies one. (intent-alignment, §3)
  - `[false]` `[reject]` the intent certifies three seeded tables while readiness asserts four. **Disproved by execution**: after `pnpm seed:local` the readiness run reports `sessions: 4 row(s)`, and the seeder writes an open plus an out-of-scope session per program. (intent-alignment, §3)
  - `[false]` `[reject]` the docs' `--app-env-file=apps/gita-life/.env.local` example contradicts the `apps/folk/.env.local` default. **Resolved by the medium row above**, which makes both files the default subject of the check. (intent-alignment, §3)
  - `[false]` `[reject]` only the four `/tmp` harnesses story 1 described could satisfy the matrix audit — that failure mode is what this spec exists to end, and this story's rows are covered by committed scripts plus the executed CLI verification, not by throwaway files. (blind-hunter #20, intent-alignment §2)

## Design Notes

**The password default is conditional, not unconditional.** Exporting a literal default `PREVIEW_FIXTURE_PASSWORD` unconditionally would override the seeder's own precedence (`:167-177`), silently changing the password of auth users that already exist — `Total created: 0` would still print while every seeded sign-in broke, which is the exact failure mode story 2 depends on. So the wrapper exports a default **only** when the env var is unset *and* `.env.preview-seed.local` is absent; otherwise it leaves the env untouched and the seeder's file fallback wins. The verified manual command in `branch-and-schema-baseline.md:95` is a one-off, not a contract, and its unconditional default is not reproduced here. Because that decision is a pure predicate over (env value, seed-file presence), the wrapper exports it as a named function so the verifier can assert all three branches offline instead of trusting the inline `if`.

**`supabase status -o env` emits quoted values.** Observed: `API_URL="http://127.0.0.1:54321"`. `use-local-supabase-env.sh`'s `cut -d= -f2-` deliberately keeps the quotes (which `dotenv` tolerates), so both new scripts must strip one leading/trailing `"` pair themselves or every comparison fails against a quoted env-file value.

**`GET :3000/login` is a warning, not an assertion.** `dev:local` runs the app last and blocks, so a readiness script that hard-requires `:3000` can never be run from the bring-up chain it is meant to validate. It reports as a warning; story 2's Playwright `webServer` owns that check.

**The guard precedes the client.** Refusing after `createClient` would still be safe in practice, but before it makes "zero network I/O" structurally true rather than incidental — which is what lets `verify-seed-local-guard.mjs` execute the refusal path safely against a fake host.

**`--min-rows` defaults to 1, not to the bulk volume.** `matrix-coverage-map.md` establishes that the later row specs need hundreds of contacts (story 2's rows 7–8 assume ≥40; its measured scope is 1,052). Tempting to default the readiness threshold high so the suite "really" passes. Do not: the bulk generator is story 4 and does not exist yet, so a high default makes `local:readiness` permanently red until a later story lands. Default `1` satisfies the SPEC's real requirement — **non-zero** — and `--min-rows` is the dial story 4 raises once its generator ships. Same reasoning for the per-table list: assert the four tables the seeder fills (`contacts`, `users`, `locations`, `sessions`).

**Mailpit may legitimately be down when this script runs.** The `dev:local` chain starts Mailpit at step 2 and `seed:local` at step 5, so a full chain run is fine, but `pnpm seed:local` is also documented as a standalone command. A hard Mailpit assertion would fail standalone seeds for a reason unrelated to seeding. It stays a hard assertion in the readiness script (readiness genuinely requires the mailbox), and readiness is what story 2's `webServer` dependsOn calls.

## Verification

**Commands:**
- `pnpm seed:local` -- expected: exit 0, `DW-3 check passed`, and `Total created: 0` against the already-seeded local database.
- `pnpm seed:local` -- run a second time back to back -- expected: still `Total created: 0` (idempotence).
- `pnpm local:readiness` -- expected: exit 0, per-table counts printed for contacts/users/locations/sessions.
- `node scripts/verify-local-stack-readiness.mjs --app-env-file=<fixture with a hosted URL>` -- expected: exit 1, message naming both URLs and `supabase status` output.
- `node scripts/verify-local-stack-readiness.mjs --min-rows 1000000` -- expected: exit 1 on the row-count assertion (proves the empty-database check is real).
- `node scripts/verify-local-stack-readiness.mjs --mailpit-url http://127.0.0.1:9` -- expected: exit 1 naming the Mailpit probe URL.
- `pnpm test:seed-local-guard` -- expected: exit 0; prints the predicate assertions and both executed refusal paths.
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.`
- `pnpm lint` -- expected: SUCCESS, no new errors from the new `scripts/*.mjs` files.
- `pnpm typecheck` -- expected: SUCCESS (unchanged; `scripts/*.mjs` is outside the tsconfig include set).
- `pnpm test:airtable-removal` -- expected: no regression; the two pre-existing failures in `migrate-airtable-data.mjs` and `delta-sync-old-project.mjs` are unchanged.
- `git diff --stat 5678c08 -- scripts/verify-monorepo-guardrails.mjs` -- expected: empty.
- `git diff --stat -- scripts/seed-preview-fixtures.mjs` -- expected: **only** the guard import and its call site.
- `ls supabase/migrations/ | wc -l` -- expected: 12.

**Manual checks:**
- Read the `dev:local` chain and confirm `seed:local` sits between `supabase:env` and `dev`.
- Confirm `docs/development-guide.md` documents the refusal and names both override routes.

## Auto Run Result

Status: done

### Summary

The local stack can now be brought up **and populated** by one command, and the silent failure this spec exists to prevent — seeding hosted while the app reads empty local Postgres — has become a loud, non-zero-exit refusal.

`pnpm seed:local` reads local credentials from `supabase status -o env` and exports them into the seeder's environment. Because `process.loadEnvFile` defers to already-exported variables (verified, not assumed), that export redirects the **unchanged** seeder to local Postgres. `seed:local` sits in the `dev:local` chain between `supabase:env` and `dev`, so the empty-database gap closes automatically.

The seeder now refuses any non-loopback `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` **before** a Supabase client is constructed — a refused run performs zero network I/O and writes nothing. Overrides are explicit (`--allow-non-local` or `SEED_ALLOW_NON_LOCAL=1`); there is no implicit escape.

`pnpm local:readiness` asserts the stack is *usable*, not merely running: the migrated baseline, Supabase health, Mailpit, **non-zero row counts** in the four tables the seeder fills, and that the app env files' `SUPABASE_URL` **and** `NEXT_PUBLIC_SUPABASE_URL` agree with the local `API_URL`. Every failure is collected and reported together with `supabase status` output.

### The exact command a developer runs to get a populated local database

```bash
pnpm dev:local
```

That chains `supabase:start && mailpit:start && supabase:push && supabase:env && pnpm seed:local && pnpm dev`. On a stack that is already up, the standalone commands are:

```bash
pnpm seed:local          # idempotent — safe to re-run
pnpm local:readiness     # proves it is populated and correctly targeted
```

`pnpm seed:local` yields `Total created: 24` on an empty database and `Total created: 0` on a re-run, with `DW-3 check passed` both times. `0` is the idempotence signal, not a warning.

### Confirmation that a non-local URL is refused

Confirmed by execution, not by inspection. `scripts/seed-preview-fixtures.mjs:44` still loads `.env.migration.local`, which holds the hosted project. Run bare, it exits 1 with zero network I/O:

```bash
$ node scripts/seed-preview-fixtures.mjs
ERROR Refusing to seed a non-local Supabase target: NEXT_PUBLIC_SUPABASE_URL is
https://etwunirahuucodcxydgs.supabase.co (host etwunirahuucodcxydgs.supabase.co).
...
If you genuinely mean to seed a non-local project, pass `--allow-non-local`
or set SEED_ALLOW_NON_LOCAL=1. There is no implicit override.
$ echo $?
1
```

Nothing was written to `etwunirahuucodcxydgs` at any point in this run. The only hosted-touching command executed was the above, and it refused.

### Files changed

| File | Change |
|---|---|
| `scripts/local-supabase-target.mjs` | **NEW.** The single definition of "is this the local stack?" — `isLocalSupabaseUrl` (fail-closed), `assertLocalSupabaseTarget` (the refusal), `endpointsAgree`/`normalizeSupabaseEndpoint` (target comparison), `sanitizeSupabaseUrl` (strips userinfo before printing), and the shared `parseSupabaseStatusEnv`/`unquoteEnvValue`. |
| `scripts/seed-local-fixtures.mjs` | **NEW.** `pnpm seed:local`. Resolves `supabase status -o env`, exports local credentials, conditionally supplies a fixture password, spawns the seeder with that env, and forwards its exit code and signal. |
| `scripts/verify-local-stack-readiness.mjs` | **NEW.** `pnpm local:readiness`. Baseline, health, Mailpit, row counts, and target agreement across both app env files and every URL variable they carry. Collects all failures and prints `supabase status`. |
| `scripts/verify-seed-local-guard.mjs` | **NEW.** `pnpm test:seed-local-guard`. 88 offline assertions: predicate, sanitiser, parsers, `parseArgs`, `countFromContentRange`, all three password-default branches, the `dev:local` chain order, and four executed subprocess paths (refusal, `SUPABASE_URL`-only refusal, both override routes, wrapper exit-code forwarding). |
| `scripts/seed-preview-fixtures.mjs` | **19 insertions, 0 deletions** — the guard import, the `allowNonLocal` const, and the pre-client refusal loop. Seeding logic, the DW-3 assertion, the `preview-fixture-` tag convention, and `--wipe` ordering are untouched, so story 4's tag filter is safe. |
| `package.json` | `seed:local`, `local:readiness`, `test:seed-local-guard`; `seed:local` inserted into `dev:local` between `supabase:env` and `dev`. |
| `docs/development-guide.md` | Seeding, readiness, and guard-verification sections; the refusal and both override routes; the fixture-password default and its three-step resolution; six troubleshooting rows; the stale "there is no local Supabase stack" prerequisite corrected. |

### Review findings breakdown

Four layers reviewed (blind hunter, edge-case hunter, verification gap, intent alignment). **59 findings: 2 high, 13 medium, 15 low, 27 false, 2 maybe-false.**

- **Patches applied — 28 findings** across one review round, all applied and re-verified.
  - **2 `high`** — both the same defect, **reproduced before fixing**: readiness checked only one of `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`, so an env file with a local `SUPABASE_URL` and a **hosted** `NEXT_PUBLIC_SUPABASE_URL` — the exact "app reads hosted" shape — passed as green. Reproduced with a fixture file (zero `Wrong target` failures); after the fix the same fixture exits 1 and names `NEXT_PUBLIC_SUPABASE_URL`. Separately, only `apps/folk/.env.local` was checked, so a stale Gita Life file also passed.
  - **13 `medium`** — the wrong-target verdict and the guard's two variable names had no coverage able to distinguish them; `SEED_ALLOW_NON_LOCAL=1`, the conditional password default, and the wrapper's exit code were unexecuted; `unquote`/status parsing was duplicated across three files (the drift the shared module exists to prevent); the baseline short-circuit hid every later failure; `spawnSync` had no timeouts; flags without values crashed; `dev:local` chain order was unasserted; the docs omitted `seed:local` from the quick-reference, never stated that a seed failure blocks startup, and never documented the fixture password — leaving a developer unable to sign in as the users they had just seeded.
  - **15 `low`** — `--min-rows 0` disabling the non-zero requirement, the refusal echoing a raw URL before redaction registered, undrained response bodies, uncaught `readdirSync`, two garbage values comparing equal, a two-case JSDoc, the unexplained `MIN_MIGRATIONS = 12`, missing unit assertions, and five documentation gaps.
- **Deferred — 1.** The stale "no product test suite exists" sentence in `docs/development-guide.md`, which belongs to the story that builds the Playwright suite; recorded in frontmatter with evidence.
- **Rejected — 27**, each with its refutation in the Review Triage Log. The most consequential was the claim that `countFromContentRange` mis-parses PostgREST's `*/0` empty-table sentinel — **disproved by execution**: I ran `pnpm seed:local --wipe` to a genuinely empty database and readiness correctly reported `0 row(s)` for all four tables. Another was the suggestion to make `dev:local` tolerate a seed failure, which SPEC matrix row 1 explicitly forbids ("fails loudly, never leaves a half-up stack silently").
- **Intent-alignment divergences — settled, not gaps.** The conditional `PREVIEW_FIXTURE_PASSWORD` default was selected and reasoned at planning time (an unconditional default would silently repoint existing auth users' passwords). The "three tables vs four" concern was disproved — `sessions` holds 4 rows after a seed.

Patched counts by entry verdict: high 1 entry (2 findings), medium 8 entries (13 findings), low 9 entries (15 findings).

### Verification performed

Every command in `## Verification` was executed against the patched tree.

| Command | Result |
|---|---|
| `pnpm seed:local` (twice) | exit 0, `Total created: 0` both times, `DW-3 check passed` |
| `pnpm seed:local --wipe` then `seed:local` | `Total created: 24`, `DW-3 check passed` — proves rows land in **local** Postgres |
| `pnpm local:readiness` | exit 0; contacts 4 / users 8 / locations 4 / sessions 4; both env files, both variables agreeing |
| `verify-local-stack-readiness.mjs --app-env-file=<hosted fixture>` | exit 1, naming the configured URL, the local `API_URL`, and `supabase status` |
| same, with local `SUPABASE_URL` + hosted `NEXT_PUBLIC_SUPABASE_URL` | exit 1, names `NEXT_PUBLIC_SUPABASE_URL` (the reproduced high finding) |
| same, after a real `--wipe` (empty database) | exit 1 on all four tables at `0 row(s)` |
| `… --min-rows 1000000` | exit 1 naming each table and its actual count |
| `… --min-rows 0` | exit 1, `--min-rows must be an integer >= 1` |
| `… --mailpit-url http://127.0.0.1:9` | exit 1 naming the probe URL, plus `supabase status` |
| `… --mailpit-url` (no value) | exit 1, `--mailpit-url requires a value.` |
| `node scripts/seed-preview-fixtures.mjs` (bare) | exit 1, refusal naming the hosted host and both overrides |
| `pnpm test:seed-local-guard` | exit 0, 88 assertions |
| `pnpm guardrails` | `Monorepo guardrails passed.` |
| `pnpm typecheck` | SUCCESS, 6 tasks done |
| `pnpm lint` | 24 problems — byte-identical to the pre-existing baseline, **none** in any file this story added or touched |
| `pnpm test:airtable-removal` | same 2 pre-existing failures (`migrate-airtable-data.mjs`, `delta-sync-old-project.mjs`); no regression |
| `git diff --stat 5678c08 -- scripts/verify-monorepo-guardrails.mjs` | empty |
| `git diff --numstat -- scripts/seed-preview-fixtures.mjs` | `19 0` — insertion-only |
| `ls supabase/migrations/ \| wc -l` | 12 |

**Matrix test audit: 11 of 11 rows covered by committed checks that ran and passed.** Every covering check is a committed script or an executed CLI command — no `/tmp` harness, and no row marked Covered against a test that did not run.

### Residual risks

- The local database now holds a **real** seed, and `apps/*/.env.local` were rewritten to the local stack by `pnpm supabase:env` during verification. Both are gitignored so there is no diff, but this shell is no longer configured for the hosted project; a developer needing hosted must re-run the hosted env setup.
- The `status !== 0` branch of `supabase status -o env` inside `seed-local-fixtures.mjs` is exercised only via a stubbed `pnpm`, not by actually stopping the stack — stopping it would have cost a full `supabase start` for no additional signal.
- `local:readiness` asserts the four tables this story's seeder fills. Story 4's bulk generator will need to raise `--min-rows` (or widen `SEEDED_TABLES`); until then a passing readiness run proves non-zero, not volume.
- `--min-rows` and `SEEDED_TABLES` are the two constants story 2's Playwright `webServer` `dependsOn` will inherit. If either is wrong, every spec fails at startup rather than at the assertion.
- The fixture password is auto-supplied only when neither `PREVIEW_FIXTURE_PASSWORD` nor `.env.preview-seed.local` exists. All three branches are unit-asserted, but the default value is a shared literal in the wrapper and in the docs.

### Follow-up review recommendation

`false`. A first pass with 2 high findings patched would normally set `true`, but that requires naming an unverified residual risk, and every finding raised here was either reproduced or verified in the working tree and then re-verified after the fix. The residuals above are untested-by-design (`supabase status` non-zero branch) or belong to a later story (`--min-rows` volume). The work has converged: a second pass would re-read the same four files against the same evidence.
