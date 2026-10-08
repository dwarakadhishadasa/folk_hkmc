# Development Guide

## Prerequisites

- Node.js 20+ recommended
- `pnpm`
- Docker running — the local Supabase stack and Mailpit are containers
- Supabase credentials for the hosted project (used for deploys and migrations; local development uses `pnpm dev:local` instead)

## Install

```bash
pnpm install
```

## Environment

Start from `.env.example` and place app-specific local values in `apps/folk/.env.local` or `apps/gita-life/.env.local`. Required production-like variables:

```bash
PROGRAM_ID=
NEXT_PUBLIC_PROGRAM_ID=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional:

```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

Program separation is by the `program_id` column in Postgres, not by per-program credentials, so both `folk` and `gita-life` share the same Supabase project and the same service-role key.

Never commit real `.env`, `.env.local`, Supabase service-role keys, or Vercel secrets.

## Local Supabase

```bash
pnpm supabase:start
pnpm supabase:push
pnpm supabase:env
```

`pnpm supabase:env` runs `scripts/use-local-supabase-env.sh`, reads local Supabase credentials from `supabase status -o env`, and rewrites only the local Supabase block in `apps/folk/.env.local` and `apps/gita-life/.env.local`.
It writes app-specific callback origins: FOLK uses `http://localhost:3000`, and Gita Life uses `http://localhost:3001`.
`pnpm supabase:push` applies pending migrations to the running local Supabase database. Run it after pulling schema changes; otherwise auth may succeed in Supabase but fail when the app syncs staff authorization tables.
Local Supabase auth email templates live under `supabase/templates/`. The Magic Link/OTP and Invite templates render `{{ .Data.auth_email_brand_name }}` so FOLK emails say FOLK and Gita Life emails say Gita Life. Invite links prefer `{{ .Data.auth_email_invite_action_url }}` with `{{ .RedirectTo }}` fallback so a shared Supabase Site URL cannot send Gita Life invitees to the FOLK app; do not use `{{ .SiteURL }}` for shared FOLK/Gita Life invite links. Restart local Supabase after changing template files or `supabase/config.toml`.

Useful commands:

```bash
pnpm supabase:status
pnpm supabase:push
pnpm supabase:reset
pnpm supabase:stop
pnpm seed:local
```

`supabase/seed.sql` is intentionally a stable empty seed hook today.

### Seeding the local database

`pnpm dev:local` seeds for you, but the seed is also usable on its own:

```bash
pnpm seed:local            # idempotent — safe to re-run
pnpm seed:local --wipe     # delete `preview-fixture-` rows + their auth users
```

`pnpm seed:local` reads local credentials from `supabase status -o env`, exports
them into the seeder's environment, and then runs `scripts/seed-preview-fixtures.mjs`.
The export is what redirects it: `scripts/seed-preview-fixtures.mjs` otherwise loads
the **hosted** URL from `.env.migration.local`, and Node's `process.loadEnvFile`
defers to variables that are already exported.

**The seeder refuses any non-local target.** If `NEXT_PUBLIC_SUPABASE_URL` or
`SUPABASE_URL` is not `127.0.0.1`/`localhost`/`::1`, it exits 1 before it
constructs a Supabase client, so a refused run performs no network I/O and
writes nothing. This turns the silent "seeded hosted, tested empty local"
failure into a loud one. There is no implicit override; escaping the refusal
requires one of:

- `--allow-non-local` (forwarded through `pnpm seed:local`), or
- `SEED_ALLOW_NON_LOCAL=1`.

Both routes still leave you writing to whatever host you named. Prefer
`pnpm seed:local`.

#### The fixture password

Seeded staff sign in as `preview-fixture-<role>@example.com` (for example
`preview-fixture-admin-folk@example.com`). The shared password is resolved in
this order:

1. `PREVIEW_FIXTURE_PASSWORD` from the environment, if set.
2. `.env.preview-seed.local` — gitignored, written by the seeder on first run.
   The seeder prints this file's **path**, never its value.
3. A generated password, written back to that same file.

If **neither** the env var nor the file supplies one — a fresh clone, typically —
`pnpm seed:local` falls back to the local-only default **`LocalDevFixture123!`**
and says so on stdout. That default is deliberately *not* used when the file
already exists: overriding the seeder's own precedence would repoint the
password of auth users that already exist, so seeding would still report
`Total created: 0` and pass its integrity check while every sign-in broke.
Setting `PREVIEW_FIXTURE_PASSWORD` yourself always wins.

#### Bulk contact fixtures (row volume)

`pnpm seed:local` creates **one** in-scope contact per program. That is enough to
sign in, and not enough to test a contacts grid: the manage-contacts matrix needs
≥40 rows for an indeterminate header and a select-all, distinct joined location
names for the per-column location filter, and 2–5 selectable rows for the bulk
actions.

```bash
pnpm seed:bulk-local     # 250 tagged contacts for folk (the default)
pnpm seed:bulk-full      # --count 1052 --program folk — manual/perf check only
pnpm seed:bulk-local --wipe   # delete only `preview-fixture-bulk-` rows
```

`scripts/bulk-contact-fixtures.mjs` resolves local credentials the same way
`pnpm seed:local` does, refuses any non-loopback target before it constructs a
Supabase client, and applies the same DW-3 check to the staff rows its scope
depends on. 250 is chosen to sit above the 200-item bulk cap
(`lib/manage/api-handlers.ts`) and far above the matrix's 40; the 1,052 rows a
perf check measures is `pnpm seed:bulk-full`, not something every run pays for.

The refusal names the same two override routes the seeder's does —
`--allow-non-local` (passed straight through) and `SEED_ALLOW_NON_LOCAL=1`. Both
only get a run *past* the guard, which then fails downstream against an unusable
target; they are for a deliberate one-off, not a way to seed the hosted project.

Note the split: **every tenth generated row is assigned to the Admin**, so it is
out of the Preacher's scope. At the 250-row default a Preacher session therefore
sees **225 in-scope rows** and 25 out-of-scope ones; `--count 1052` yields 947 and
105. The ratio exists to keep the in-scope set *above* the 200-item bulk cap, so a
spec can select over the cap — an every-fourth-row split left only 188 in-scope
and made the cap untestable. Both sides have to be non-empty or the scope
assertions have nothing to fail against.

Useful flags:

```bash
pnpm seed:bulk-local --program both   # split --count across folk and gita-life
pnpm seed:bulk-local --count 1052 --program folk   # 1,052 in folk alone
pnpm seed:bulk-local --chunk-size 50               # smaller PostgREST batches
pnpm seed:bulk-local --locations 8                 # more distinct joined location names
```

**Run it after `pnpm seed:local`, and re-run it after any re-seed.** The generator
widens the seeded Preacher's `users.location_ids` so a Preacher session can
resolve location *names* rather than raw UUIDs in the Location column — and
`pnpm seed:local` resets that column on every run. In one line:

```bash
pnpm seed:local && pnpm seed:bulk-local
```

Every generated row is tagged `preview-fixture-bulk-`, a strict prefix of the
seeder's own `preview-fixture-` tag, so the seeder's `--wipe` filter covers it
and no untagged row is ever created or deleted.

`--count` is a **floor, not a truncate**: the generator tops the program up to at
least N tagged rows and never deletes a row a lower `--count` would drop. A
second run therefore inserts 0, which is what makes every Playwright suite run a
live idempotence check — `playwright.config.ts` runs the generator from
`globalSetup`, so a suite cannot report green against a 24-row database.

`pnpm seed:preview-fixtures --wipe` still removes the generated rows — they carry
the seeder's own tag prefix — and both wipes batch their `.in("id", …)` deletes at
100 ids per request, so a wipe works at bulk volume rather than failing with
`URI too long` at exactly the moment it is needed. Checked by hand rather than in
`pnpm test:e2e`: the seeder's wipe deletes the fixture **auth users** and
`seed:local` mints new UUIDs for them, so a spec that ran it would invalidate every
`storageState` file in the run and have to re-authenticate three roles mid-suite —
a global reseed hidden inside a row is exactly the order-dependence story 5 exists
to remove.

### Local stack readiness

```bash
pnpm local:readiness
```

"Is the stack running?" and "is the stack usable?" are different questions, and
only the second one matters before a suite runs. `local:readiness` checks the
migrated baseline (`supabase/migrations/`, `lib/supabase/`, `components/grid/`),
Supabase auth health, Mailpit's message API, row counts for `contacts`/`users`/
`locations`/`sessions`, and that every Supabase URL variable in **both**
`apps/folk/.env.local` and `apps/gita-life/.env.local` agrees with the local
stack's `API_URL`. It collects every failure before exiting — a broken baseline
does not suppress the other sections — and prints `supabase status` in the
message. A reachable-but-empty database fails here rather than at the first spec.

Both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` are checked in every file
because they can disagree: the browser reads `NEXT_PUBLIC_*` and the server
reads the unprefixed one, so a file that is half-local is a real bug even when
one half looks right.

Useful flags:

```bash
# Check one env file instead of both app defaults
node scripts/verify-local-stack-readiness.mjs --app-env-file=apps/gita-life/.env.local

# Require real row volume instead of merely "some rows"
node scripts/verify-local-stack-readiness.mjs --min-rows 1000

# Point at a different Mailpit, or give slow services longer
node scripts/verify-local-stack-readiness.mjs --mailpit-url http://127.0.0.1:8025
node scripts/verify-local-stack-readiness.mjs --timeout-ms 15000
```

`--min-rows` defaults to **1** — the requirement is that the seeded tables are
non-empty, not that they are large. Raise it once a spec genuinely needs bulk
volume: `pnpm seed:bulk-local` creates the row volume (see above), so a
`--min-rows 300` gate is satisfiable by running it first. The value must be at
least 1, since `0` would silently disable the check.

The app on `:3000` is reported as a **warning, not a failure** — `pnpm dev:local`
runs the app last and blocks, so this script is commonly run before it starts.

### Verifying the seed guard

```bash
pnpm test:seed-local-guard
```

Asserts the local-target predicate directly (hosted → non-local, loopback →
local, unparseable → non-local) and executes both refusal paths: once expecting
the seeder to refuse a non-resolvable non-local host, once with
`--allow-non-local` expecting it to get *past* the guard and fail downstream
instead. No database and no network required.

### Local auth email (Mailpit)

Local Supabase auth delivers every auth email (magic links, OTP codes, invites) to a standalone Mailpit container instead of the built-in Inbucket catcher. `supabase/config.toml` sets `[auth.email.smtp]` to `mailpit:1025`, and `scripts/ensure-local-mailpit.sh` starts the container and attaches it to the `supabase_network_folk_hkmc` Docker network so the auth service can reach it by container name.

```bash
pnpm mailpit:start   # run after `pnpm supabase:start`
```

- SMTP: `localhost:1025`
- Web UI: http://localhost:8025

`pnpm dev:local` runs `pnpm mailpit:start` automatically. If you start Supabase manually, run `pnpm mailpit:start` before testing sign-in or invite flows.

## Run The App

```bash
pnpm dev
```

`pnpm dev` starts the FOLK app. To run Gita Life, use:

```bash
pnpm dev:gita-life
```

Or start local Supabase, update env, and run Next:

```bash
pnpm dev:local
```

`pnpm dev:local` starts the local Supabase stack, starts and connects Mailpit, applies migrations, writes app-local Supabase env values, **seeds the local database**, and starts the FOLK app.
The steps are chained with `&&`, so a seed failure **stops the chain and the app never starts** — that is deliberate, because a booted app over an unseeded database fails later at sign-in with an error that reads like an auth bug.
The seed is idempotent: re-running `pnpm dev:local` prints `Total created: 0`, which is the expected success signal. A non-zero count on a later run means the `preview-fixture-` tag filter broke and rows are being duplicated.
For a local Gita Life invite-flow smoke test, run `pnpm supabase:env` and then `pnpm dev:gita-life` so invite emails use the Gita Life callback origin.

The app workspace scripts set `PROGRAM_ID` and `NEXT_PUBLIC_PROGRAM_ID`:

- `@hkmc/folk`: `folk`
- `@hkmc/gita-life`: `gita-life`

## Build And Checks

```bash
pnpm guardrails
pnpm typecheck:workspace
pnpm build:apps
pnpm lint
pnpm quality:ci
pnpm test:program-readiness
pnpm test:airtable-removal
pnpm test:seed-local-guard
pnpm local:readiness
pnpm seed:local
pnpm build
pnpm start
pnpm start:gita-life
```

Notes:

- `apps/folk/next.config.mjs` and `apps/gita-life/next.config.mjs` import the shared root `next.config.mjs`, which has `typescript.ignoreBuildErrors = true`.
- `pnpm build` runs a prebuild workspace typecheck, but CI should still call `pnpm typecheck:workspace` explicitly before `pnpm build:apps`.
- `pnpm typecheck:workspace` uses recursive pnpm package scripts; broken shared package contracts must block app builds.
- `pnpm guardrails` checks Turborepo/package boundaries, workspace dependency cycles, declared `@hkmc/*` dependencies, and client leakage of server-only services.
- `pnpm lint` uses `eslint.config.mjs` and ignores `.next`, `.agents`, `_bmad-output`, `docs`, generated output, and `next-env.d.ts`.
- `pnpm test:program-readiness` runs the current readiness smoke script for program-scoped setup checks.
- `pnpm test:airtable-removal` is the CAP-7 regression gate: it re-checks the Airtable deletions, the env/import grep gate, the Supabase-only program profiles, the renamed wire contracts on both the client and route side, and the Vercel deploy preflight. It reads sources only — no database, no network.
- `pnpm test:seed-local-guard` proves the seeder refuses non-local targets and that the override routes work. Reads sources and spawns the seeder against an unresolvable host — no database, no reachable network.
- `pnpm local:readiness` is the only check that talks to the running stack; run it after `pnpm dev:local` steps 1-4, before the app starts.

## Important Development Rules

- Keep server secrets in server-only modules.
- Keep `@hkmc/authz`, `@hkmc/program-config/server`, `lib/authz.ts`, `lib/invite-log.ts`, and `lib/supabase/*` out of client component runtime graphs.
- Use `lib/authz.ts` for staff server authorization.
- Keep `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID` aligned with the app workspace and preserve FOLK/Gita Life route parity unless requirements intentionally diverge.
- Use `StaffAuthShell` when a server page has already validated staff and needs to seed client auth state.
- Preserve `/attendance` as the attendance API route.
- Keep public registration, attendance, service worker queue paths, and dashboard polling in sync.
- Use UUIDs for record references; all record IDs are `public.*` primary keys.
- Preserve mobile normalization to the last 10 digits.
- Run `pnpm guardrails`, `pnpm typecheck:workspace`, `pnpm test:e2e`, and the manual smoke checks; the e2e suite covers staff auth and the manage API, not attendance, offline/PWA, or the registration flows.

## Manual Smoke Checks

Use the flows relevant to your change:

- Login with the email of an `Active` `public.users` row in the program.
- Complete OTP or invite callback.
- Confirm `/api/auth/me` returns staff after sign-in.
- Verify Volunteer redirects/permissions go only to `/contact`.
- Create a staff contact as Admin, Preacher, and Volunteer where applicable.
- Create a session from `/sessions`.
- Open the generated `/attend?session=<id>` URL and mark attendance.
- Confirm unknown attendance mobile redirects to `/register?mobile=...&session=...`.
- Confirm session-backed registration also marks attendance.
- Watch `/dashboard` or active session dashboard refresh attendance.
- Invite a Volunteer from `/volunteers`.
- Invite staff and add locations from `/admin/invite`.
- Test service worker queue behavior if changing PWA/offline paths.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Supabase URL must contain a valid Supabase URL` | Missing Supabase env vars |
| `SUPABASE_SERVICE_ROLE_KEY is required` | Server/admin auth route missing service-role key |
| Attendance links fail to generate | `NEXT_PUBLIC_SITE_URL` missing |
| Staff can sign in but gets authorization error | `public.users` row missing/inactive for the program, unsupported `PROGRAM_ID`, or a `status` other than `Active` |
| Preacher cannot create session for location | Location not in staff profile `location_ids` |
| App boots but every list is empty, locally | Env file still points at the hosted project — run `pnpm supabase:env`, then `pnpm seed:local`. `pnpm local:readiness` names the mismatch |
| `local:readiness` fails with `Table <name> has 0 row(s)` | The local database is reachable but unseeded — run `pnpm seed:local` |
| `Refusing to seed a non-local Supabase target` | The seeder resolved the hosted URL from `.env.migration.local` — use `pnpm seed:local`. Override only with `--allow-non-local` or `SEED_ALLOW_NON_LOCAL=1` |
| Location column shows raw UUIDs for a Preacher | `pnpm seed:local` reset the Preacher's `location_ids` — re-run `pnpm seed:bulk-local` |
| Sign-in emails never arrive | Mailpit is down — run `pnpm mailpit:start`; `pnpm local:readiness` asserts it |

## Current Test Status

`pnpm test:e2e` is the automated application test suite (Playwright, specs under
`e2e/specs/`). It is **local-only**: the config throws at load if `E2E_BASE_URL`
is not loopback, so the suite can never be pointed at the hosted project.

Prerequisite: the local stack (Supabase on `:54321`, Mailpit on `:8025`) up and
seeded — `pnpm supabase:start && pnpm mailpit:start && pnpm supabase:push &&
pnpm supabase:env && pnpm seed:local`. `pnpm test:e2e` then runs
`pnpm local:readiness` as its own gate and boots the folk app through Playwright's
`webServer`, so you do not need `pnpm dev` running (if it is, Playwright reuses
it and skips the boot). Use `pnpm test:e2e`, not `pnpm exec playwright test`:
the readiness gate lives in the script precisely because Playwright's
`reuseExistingServer` short-circuits a command chained into `webServer`, so a
direct `playwright test` runs against an unasserted stack.

Playwright's `globalSetup` also runs `pnpm seed:bulk-local` once per invocation,
so the suite has its contact row volume without anyone remembering to generate
it. It **tops the folk set up rather than replacing it** — `--count` is a floor,
not a truncate — so a warm database costs a no-op run and a suite that cannot get
its data fails at that gate with the generator's own message instead of reporting
green against 24 rows.

`e2e/specs/bulk-fixtures.spec.ts` owns that fixture contract: one row per case in
the story's matrix, from the batched-insert request count and the Preacher's
widened `location_ids` through the non-local refusal, the `cleanupTaggedContacts`
tag guard, and DW-3's id-mismatch clause. The
CLI rows spawn the generator; the data rows read it back through
`e2e/fixtures/bulk-contacts.ts`, which story 4's row specs also use so "in scope"
and "the blank-phone row" mean one thing across both.

`pnpm test` is the turbo task (`turbo run test`) for per-package `test` scripts.
The e2e suite is not routed through turbo because it needs a live stack.

### Proving the suite is deterministic

A green run is not evidence the suite can go red, and it is not evidence the suite
passes twice. Both are now committed mechanisms rather than habits:

- `pnpm test:e2e:determinism` (`scripts/verify-suite-determinism.mjs`) runs
  `pnpm test:e2e` **twice back to back with nothing between them** — no
  `supabase:reset`, no re-seed, no manual reset — and fails naming which run
  failed, echoing that run's own output. Pass counts are read from the run's
  reporter output, never estimated.
- `e2e/specs/suite-determinism.spec.ts` asserts the rest offline, on every run:
  no `waitForTimeout` anywhere under `e2e/`; `globalSetup` wired and each setup
  project deleting its `storageState` before writing one; `fullyParallel: false`,
  `workers: 1` and `retries: 0` when `CI` is unset, so a flake cannot hide behind
  a retry; every `e2e/specs/*.spec.ts` appearing in `playwright test --list`; and
  a deliberately failing generated spec exiting non-zero *with its name*, paired
  with an identical passing spec that must exit 0 — the pair is what stops a
  permanently-red harness from satisfying the red case.

The double-run itself cannot live in the suite, because a spec cannot re-run the
suite it is inside of. That is why it is a script.

Recorded result: **86 passed on each of two consecutive runs**, script exit 0, at
revision `c2cfaa6` with Playwright 1.62.0. Note `retries` is a determinism
property here, not a CI preference — under `CI` the key becomes 1, so treat a CI
number as a different measurement rather than this one.

Nothing runs the e2e suite in CI (`.github/workflows/quality-gates.yml` covers
guardrails, typecheck, build and lint). That is deliberate: a red or flaky suite in
CI blocks everyone, and wiring it in is a follow-up once the suite is stable.

### Claiming a matrix row

[`docs/claiming-a-matrix-row.md`](claiming-a-matrix-row.md) is the handoff for
turning a matrix row green: which layer to use (UI, Playwright `request`, or
`page.route` interception) and the observable that selects each, what the row
needs seeded, and what evidence flips it to **Covered** — a spec that passed in a
recorded run, quoted with that run's revision, Playwright version, `baseURL` and
worker count. It also covers the `test.fail` tripwire pattern used for rows 1 and 4
above. Cross-linked from the coverage map's "Claiming a matrix row" section.

### How staff auth works in the suite

- The `setup-admin` / `setup-preacher` / `setup-volunteer` projects drive the real
  two-step `/login` form. The 6-digit OTP is read from **Mailpit's HTTP API** on
  `:8025` (`GET /api/v1/messages`, then `GET /api/v1/message/{ID}`). The wait is
  condition-driven with a bounded budget — never an unconditional sleep — and it
  never stubs Supabase. On timeout it fails with the captured message ids,
  subjects, recipients, probe URL and watermark; `e2e/specs/mailpit-reader.spec.ts`
  asserts that diagnostic against an injected mailbox, so no real message is
  ever read or written by the assertion itself.
  `e2e/specs/harness-guards.spec.ts` covers the harness's own boundaries the
  same way — the two loopback refusals, the `test:e2e` gate wiring, and the
  ignore rules for the directories a run leaves behind.
- On success the browser's `storageState` is written to `e2e/.auth/<role>.json`,
  and the setup asserts the file's `mtimeMs` is at or after the run's start — so
  "written by this run" is distinguishable from "survived from the last one".
- `e2e/.auth/` is gitignored: those files are live session tokens for the seeded
  fixture staff accounts. The setup projects delete and regenerate them on every
  run, so re-running twice in a row is safe with no manual reset.
- The `smoke` project defaults to the **Admin** `storageState`, so a new spec
  under `e2e/specs/` is signed in as Admin unless it calls
  `test.use({ storageState: ... })` itself. Add a `setup-*` project and a
  `dependencies` entry in `playwright.config.ts` when a spec needs a new role.

### Environment knobs

| Variable | Effect |
|---|---|
| `E2E_BASE_URL` | App under test. Default `http://127.0.0.1:3000`. Refused unless loopback. |
| `E2E_MAILPIT_URL` | Mailpit base URL. Default `http://127.0.0.1:8025`. |
| `E2E_PROGRAM_ID` | Program whose fixtures are used. Default `folk`. |
| `E2E_ADMIN_EMAIL`, `E2E_PREACHER_EMAIL`, `E2E_VOLUNTEER_EMAIL` | Override one fixture address. |
| `E2E_ADMIN_STORAGE_STATE`, `E2E_PREACHER_STORAGE_STATE`, `E2E_VOLUNTEER_STORAGE_STATE` | Override a `storageState` path. |
| `E2E_UNKNOWN_EMAIL` | The unseeded address used by the "provisions nothing" row. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Read from `process.env` first, then `apps/folk/.env.local`. |

`apps/folk/.env.local` must carry `SUPABASE_SERVICE_ROLE_KEY` and a **loopback**
`SUPABASE_URL` for the suite to run: the unknown-email row queries
`auth.users` through the admin API to prove nothing was provisioned, and it
refuses a non-loopback URL rather than checking the hosted project by mistake.

### Browsers

`@playwright/test` is pinned at `^1.62.0` because that is the release whose
Chromium revision (`1234`) is what this environment has cached; a newer 1.x wants
a revision that cannot be downloaded here. On a fresh machine run
`pnpm exec playwright install chromium` before `pnpm test:e2e`, and if you bump
the pin, check `npx playwright install chromium --dry-run` first — the failure
mode of a mismatched pin is a browser launch error, not a readable assertion.

### Other checks

`pnpm guardrails`, `pnpm typecheck:workspace`, `pnpm build`, `pnpm lint`, and the
`verify-*.mjs` scripts. `pnpm lint` and `pnpm exec tsc --noEmit` also cover
`e2e/` and `playwright.config.ts`. Manual checks still apply to everything the
suite does not cover — see [Manual Smoke Checks](#manual-smoke-checks). Add
specs deliberately if a change introduces shared logic or risky behaviour.
