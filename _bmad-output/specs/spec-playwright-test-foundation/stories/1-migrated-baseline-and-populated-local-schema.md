---
title: 'Migrated baseline and populated local schema'
type: 'chore'
created: '2026-10-08'
status: 'draft'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - _bmad-output/specs/spec-playwright-test-foundation/branch-and-schema-baseline.md
  - _bmad-output/specs/spec-playwright-test-foundation/local-environment.md
warnings: []
deferred: []
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

## Design Notes

**The password default is conditional, not unconditional.** Exporting a literal default `PREVIEW_FIXTURE_PASSWORD` unconditionally would override the seeder's own precedence (`:167-177`), silently changing the password of auth users that already exist — `Total created: 0` would still print while every seeded sign-in broke, which is the exact failure mode story 2 depends on. So the wrapper exports a default **only** when the env var is unset *and* `.env.preview-seed.local` is absent; otherwise it leaves the env untouched and the seeder's file fallback wins. The verified manual command in `branch-and-schema-baseline.md:95` is a one-off, not a contract, and its unconditional default is not reproduced here.

**`supabase status -o env` emits quoted values.** Observed: `API_URL="http://127.0.0.1:54321"`. `use-local-supabase-env.sh`'s `cut -d= -f2-` deliberately keeps the quotes (which `dotenv` tolerates), so both new scripts must strip one leading/trailing `"` pair themselves or every comparison fails against a quoted env-file value.

**`GET :3000/login` is a warning, not an assertion.** `dev:local` runs the app last and blocks, so a readiness script that hard-requires `:3000` can never be run from the bring-up chain it is meant to validate. It reports as a warning; story 2's Playwright `webServer` owns that check.

**The guard precedes the client.** Refusing after `createClient` would still be safe in practice, but before it makes "zero network I/O" structurally true rather than incidental — which is what lets `verify-seed-local-guard.mjs` execute the refusal path safely against a fake host.

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
