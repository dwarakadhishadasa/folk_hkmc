# Local environment

The one sequence that yields a stack the E2E suite can run against. Written to be followed verbatim from a clean shell — if a step is missing, this document is wrong and gets fixed here rather than left as tribal knowledge.

## Prerequisites

- Docker running (`docker info` must succeed). Both Supabase and Mailpit are containers.
- Node 22, pnpm 10.33.0 (repo pins `packageManager`).

## Bring-up

```bash
pnpm dev:local
```

That single script chains, in order (`package.json`):

| Step | Script | What it does |
|---|---|---|
| 1 | `supabase:start` | `supabase@2.98.2 start` — local stack on `:54321` (REST/gRPC), `:54322` (Postgres) |
| 2 | `mailpit:start` | `ensure-local-mailpit.sh` — standalone Mailpit container, attached to `supabase_network_folk_hkmc`, ports `1025` (SMTP) / `8025` (UI + API) |
| 3 | `supabase:push` | `db push --local --yes` — applies `supabase/migrations/` |
| 4 | `supabase:env` | `use-local-supabase-env.sh` — reads `supabase status -o env`, writes local URL/anon/service-role into `apps/folk/.env.local` and `apps/gita-life/.env.local` |
| 5 | `dev` | `dev:folk` → `next dev` with `PROGRAM_ID=folk` |

**Order matters and is not cosmetic.** Mailpit must exist and be on the Docker network *before* the auth service starts, or auth cannot deliver mail and every sign-in fails at step 3 with a connection error that looks like a config bug.

## Ports

| Service | Port | Used by |
|---|---|---|
| Supabase API | 54321 | app, tests |
| Postgres | 54322 | `supabase psql`, seed scripts |
| Mailpit SMTP | 1025 | Supabase auth only |
| **Mailpit HTTP API + UI** | **8025** | **the E2E suite — reads OTP codes** |
| folk app | 3000 | primary suite target |
| gita-life app | 3001 | parity checks where a spec names both |

Port 8025 is the load-bearing one for automation: `GET /api/v1/messages` lists captured mail and each message's text carries the 6-digit sign-in code.

## Fixture seed

```bash
pnpm seed:preview-fixtures          # idempotent
pnpm seed:preview-fixtures --wipe   # delete tagged rows + auth users
```

`scripts/seed-preview-fixtures.mjs` seeds, per program (`folk`, `gita-life`): two locations, four staff (Admin, Preacher, Volunteer, Assistant), an in- and out-of-scope contact, an open session plus a deliberately out-of-scope one, and one attendance row.

**Every seeded row is tagged `preview-fixture-`**, so `--wipe` filters on that prefix rather than truncating. Rows without the tag are never touched. Tests depend on this: a spec may seed its own tagged rows and clean up after itself without touching anyone else's data.

**DW-3 invariant.** `public.users.id` MUST equal the `auth.users.id` it names. The pre-Supabase sign-in self-heal is gone, so a mismatch is unfixable corrupt data; the script asserts equality for every seeded user and **exits 1** rather than writing a row it cannot vouch for.

### Credentials

Fixture emails are `preview-fixture-<role>@example.com`. The shared password is read from `PREVIEW_FIXTURE_PASSWORD`, else the gitignored `.env.preview-seed.local`, else generated and written there — the script prints the *path*, never the value.

For CI or a fresh clone, set `PREVIEW_FIXTURE_PASSWORD` in the environment rather than relying on the generated file.

## Readiness assertions

Do not let a test suite discover a broken stack by timing out. Before the suite starts, assert:

1. `GET http://localhost:54321/auth/v1/health` → 200
2. `GET http://localhost:8025/api/v1/messages` → 200
3. `GET http://localhost:3000/login` → 200

On failure, surface `supabase status` output in the failure message. A bare timeout here costs more debugging time than the assertion costs to write.

## Teardown

```bash
pnpm supabase:stop        # stop the stack
docker stop mailpit      # Mailpit is standalone, not part of `supabase stop`
```

`supabase:reset` (`db reset --local`) rebuilds from `migrations/` + `seed.sql` when schema state is suspect — but it **destroys local data**, including fixture rows, so re-seed afterwards.
