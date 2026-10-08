# Branch and schema baseline

Two prerequisites that are not really "setup" — they are **preconditions**. Until both hold, the suite runs against the wrong code or an empty database, and every failure afterwards is noise.

## 1. `dev` must carry the migration branch

The Airtable→Supabase migration lives on `feature/migrate-airtable-to-supabase`. It is **not** on `dev`. A developer agent checking out `dev` gets the pre-migration codebase: no `lib/supabase/`, no `components/grid/`, and an `/manage` portal that still resolves through Airtable paths the migration removed.

### Verified divergence

```
$ git merge-base --is-ancestor origin/dev feature/migrate-airtable-to-supabase
YES - clean fast-forward

commits on origin/dev..HEAD : 40
commits on HEAD..origin/dev :  0
```

`dev` has **zero** commits that the migration branch lacks. So this is a **fast-forward, not a merge** — no conflict resolution, no merge commit, no risk of a botched reconciliation:

```bash
git checkout dev
git merge --ff-only feature/migrate-airtable-to-supabase
```

`--ff-only` is deliberate. If it ever refuses, the two branches have genuinely diverged and that needs a human decision, not a forced merge.

Then push: `git push origin dev`.

### The schema rides along in those 40 commits

Six migrations exist **only** on the migration branch. Without them there is no Supabase schema at all:

| Migration | Missing from `dev` |
|---|---|
| `20261004000000_create_core_tables.sql` | contacts, sessions, attendance, locations, audit_events, invite_log, programs |
| `20261006000000_add_users_and_contact_columns.sql` | the `public.users` table and the contact field gaps story 7-1 closed |
| `20261006010000_scoped_rls_policies.sql` | per-role, per-program RLS (story 7-2) |
| `20261007000000_retire_airtable_named_columns.sql` | drops the Airtable-era columns |
| `20261007120000_scope_sessions_by_preacher.sql` | preacher session scoping |
| `20261008000000_add_airtable_id_map.sql` | the migration's id map |

Fast-forwarding `dev` brings the migrations and the code that uses them together, which is the only ordering that makes sense — migrations without the code that queries them, or the reverse, both leave the repo broken.

## 2. The local schema is applied but the database is empty

A verified snapshot of the running local stack:

**Schema: complete.** All 12 migrations applied; 9 tables present:

```
public.airtable_id_map  attendance  audit_events  contacts
invite_log  locations  programs   sessions      users
```

**Rows: none.** `contacts`, `users`, `locations`, `sessions` all returned `0`.

So the schema is not the problem — **the seed never runs as part of `dev:local`**. `pnpm dev:local` is `supabase:start && mailpit:start && supabase:push && supabase:env && dev`. There is no seed step in that chain, and `supabase/seed.sql` is a stub:

```sql
-- Local seed hook.
-- Keep this file present so `supabase db reset` has a stable seed target.
```

An empty database is worse than an absent one: the app boots, renders empty states, and every spec that needs a signed-in staff user fails at sign-in with an error that reads like an auth bug rather than an unseeded database.

## The trap: the seed script targets the HOSTED project by default

`scripts/seed-preview-fixtures.mjs:44` does:

```js
process.loadEnvFile(path.join(repoRoot, ".env.migration.local"))
```

and `.env.migration.local` holds `https://etwunirahuucodcxydgs.supabase.co` — the **hosted** project. Run naively after `pnpm dev:local`, the seed writes 24 rows to the hosted pre-cutover project while the app talks to empty local Postgres. Silent, and it mutates data that is not ours to churn.

The same applies to `apps/folk/.env.local` and `apps/gita-life/.env.local`, which currently carry the hosted `SUPABASE_URL` — `pnpm supabase:env` rewrites them to local, so this is only a hazard if that step is skipped.

### The fix: export first, and `loadEnvFile` yields

Verified empirically rather than assumed:

```
FOO = from_shell
=> loadEnvFile defers to shell
```

`process.loadEnvFile` **does not override already-exported variables.** So exporting local credentials before invoking the script redirects it — no code change to the seed script required:

```bash
eval "$(pnpm dlx supabase@2.98.2 status -o env | sed 's/^/export /')"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export SUPABASE_URL="$API_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export PREVIEW_FIXTURE_PASSWORD="${PREVIEW_FIXTURE_PASSWORD:-LocalDevFixture123!}"
node scripts/seed-preview-fixtures.mjs
```

### Verified end to end

```
Total created: 24
DW-3 check passed: every public.users.id equals its auth.users.id; all fixture staff are Active.
```

Local counts after seeding: `contacts 4`, `users 8`, `locations 4` (two programs × two contacts).

Re-running is idempotent:

```
Total created: 0
DW-3 check passed: ...
```

`Total created: 0` is the success signal, not a warning. A non-zero count on a second run means the tag filter broke and the seed is duplicating.

## What the foundation must build

1. **A `pnpm seed:local` script** that wraps the export-then-invoke sequence above, so no developer has to know the `loadEnvFile` precedence rule. Add it to the `dev:local` chain *after* `supabase:env`, closing the empty-database gap.
2. **A readiness assertion that catches the wrong target**, not just a stopped container. Asserting "Postgres answers" passes against empty local Postgres while the app is configured for hosted. The check must confirm rows exist and the app's configured URL matches `API_URL`.
3. **Refuse to run against a non-local URL.** The seed should refuse when `NEXT_PUBLIC_SUPABASE_URL` is not `127.0.0.1`/`localhost`, unless explicitly overridden. This turns a silent data-mutation bug into a loud failure.
