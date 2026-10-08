---
title: 'Bulk-data fixture generator for matrix row coverage'
type: 'chore'
created: '2026-10-08'
status: 'done'
baseline_revision: '408b0056542c38603dd2f5a693200a2f05e5239e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - _bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md
  - _bmad-output/specs/spec-playwright-test-foundation/local-environment.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `scripts/seed-preview-fixtures.mjs` creates **one** in-scope contact per program, while `matrix-coverage-map.md` shows 16 of story 2's 19 rows needing row volume the local environment does not produce (≥40 rows for the indeterminate header and select-all, distinct joined location names for the per-column filter, 2–5 selectable rows for bulk rows). Story 2 already halted once at `matrix test audit failed` for the missing harness; this is the next wall, and building the harness first without the data produces a green suite that still cannot cover the matrix it exists to cover.

**Approach:** A standalone generator script that takes a service-role key, refuses a non-loopback target exactly as the seeder does, applies the same DW-3 assertion to the staff rows its scope depends on, and bulk-inserts `preview-fixture-`-tagged contacts in **batched** PostgREST calls. Volume is a flag with a fast default of 250 in-scope rows — above the 200-item bulk cap and above row 7's 40 — while the 1,052 rows story 2 measured belongs to a manual/perf check.

## Boundaries & Constraints

**Always:**
- **Refuse a non-loopback `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` before any client is constructed**, reusing `assertLocalSupabaseTarget` from `scripts/local-supabase-target.mjs`. Zero network I/O on a refused run.
- **Resolve local credentials the way `pnpm seed:local` does** — `supabase status -o env`, quotes stripped by the repo's one `KEY=value` parser — so one command works from a clean shell.
- **Apply DW-3 to the staff rows the generator depends on**: `public.users.id` MUST equal the `auth.users.id` it names, and the row MUST be `Active`. Mismatch is unfixable corrupt data: print the violation and exit 1 **before writing anything**, mirroring `seed-preview-fixtures.mjs:394-407`.
- **Every generated row carries the `preview-fixture-` prefix in `contacts.name` and `locations.name`**, so `seed-preview-fixtures.mjs --wipe` (which filters on `name like 'preview-fixture%'`) finds and removes them. No untagged row is ever created or deleted.
- **Insert in batches.** One PostgREST call per chunk (`--chunk-size`, default 250), never one call per row.
- **Idempotent.** `--count` is a *floor*, not a truncate: the generator tops up to at least N tagged rows per program and never deletes rows a lower `--count` would drop. A second run inserts 0.
- **Specs clean up after themselves.** `e2e/fixtures/bulk-contacts.ts` owns both the shared selector helpers and a `cleanupTaggedContacts` helper; a spec that creates a tagged row deletes it in the same test. No spec may rely on a row a previous run left behind.

**Never:**
- No edits to `scripts/seed-preview-fixtures.mjs`'s seeding logic, its DW-3 assertion, its `--wipe` filter, or its `preview-fixture-` tag convention.
- No truncation, no `delete` outside the generator's own `--wipe`, and no delete of anything lacking the tag.
- No `TRUNCATE`, no direct Postgres/`psql` access, no new runtime dependency — PostgREST via the existing `@supabase/supabase-js`.
- No CI wiring, no Vitest, no changes to `verify-monorepo-guardrails.mjs`.
- No second copy of the `supabase status -o env` parser, the `KEY=value` parser, or the loopback predicate.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Default run | stack up, `pnpm seed:local` already run, no flags | ≥250 tagged contacts for `folk`; names distinct; every `location_ids` entry resolves to a real `locations` row in the program; ≥1 contact with `phone` set and exactly 1 with `phone` = `''`; both in-scope (Preacher) and out-of-scope rows; `Total created: N` and `DW-3 check passed: …` printed | missing locations or staff → exit 1 naming `pnpm seed:local` |
| Repeatable | same command again | `Total created: 0`; no duplicate rows; no `auth.users` collision | a non-zero created count means the tag/`phone` filter broke |
| Volume is a parameter | `--count 1052` | tops the program up to ≥1052 rows and prints the request count and elapsed time | `--count 0`, `--count abc`, or a trailing `--count` with no value → exit 1 naming the flag |
| Batched insert | any volume | `N` rows arrive in `ceil(missing / chunk-size)` PostgREST requests, reported in the output | a chunk error names the chunk index and Supabase's own message |
| Locations are real | generated `location_ids` | every id is a row in `locations` for the same `program_id`, named `preview-fixture-bulk-location-<n>-<program>` | a location missing → exit 1 before insert |
| Preacher can resolve names | bulk locations exist, Preacher signed in | the Preacher's `users.location_ids` is the union of its seeded ids and the program's bulk locations, so a Preacher session renders location **names**, not raw ids | absent Preacher row → exit 1 naming `pnpm seed:local` |
| Phone coverage | default volume | exactly one row per program with `phone` = `''` (the NOT NULL + `(phone, program_id)` unique pair permits no more), all others with distinct phones | a second blank-phone row would violate the unique index → reported as a constraint error, not swallowed |
| Scope on both sides | default volume | in-scope rows carry the seeded Preacher's id in `assigned_preacher_id`; out-of-scope rows carry the seeded Admin's | Preacher/Admin row missing or inactive → DW-3 exit 1 |
| Wipe | `--wipe` | deletes only rows whose name starts with `preview-fixture-bulk-` (contacts and generated locations), reports counts, leaves the 24 seeded rows intact | deleting a non-tagged row is impossible by construction — the filter is the only path |
| Refuses non-local | hosted `NEXT_PUBLIC_SUPABASE_URL` | exit 1 with the refusal naming the host and both overrides, before any client exists | `--allow-non-local` / `SEED_ALLOW_NON_LOCAL=1` get past the guard and fail downstream instead |
| Missing prerequisite | no `preview-fixture-` locations for the program | exit 1 naming `pnpm seed:local`, nothing written | — |
| Bad flag | unknown `--flag`, or a flag with no value | exit 1 listing the supported flags | — |

</intent-contract>

## Code Map

**Read-only, except one sanctioned edit:** `scripts/seed-preview-fixtures.mjs`'s `--wipe` delete loops are batched at 100 ids per request (see Spec Change Log 1). Its seeding logic, DW-3 assertion, `--wipe` filter, and tag convention stay untouched, and everything else below is read-only.

- `scripts/seed-preview-fixtures.mjs` — the pattern to copy. `TAG = "preview-fixture-"` (`:127`); local-target refusal before `requireEnv`/client (`:57-66`); `requireEnv("NEXT_PUBLIC_SUPABASE_URL"/"SUPABASE_SERVICE_ROLE_KEY")` (`:148-157`); DW-3 **pre-write** read-then-compare (`:394-407`) and the reason a post-write comparison cannot detect it; post-write `assertIdAlignment` (`:563-583`); `Total created:` (`:634`); redaction filter (`:72-119`); per-program location/staff upserts (`:350-418`); in-scope = `assigned_preacher_id = Preacher`, out-of-scope = Admin (`:424-438`).
- `scripts/local-supabase-target.mjs` — the one loopback predicate and the one env parser. `assertLocalSupabaseTarget` (`:101-125`), `isLocalSupabaseUrl` (`:36-41`), `parseSupabaseStatusEnv` (`:182-189`), `unquoteEnvValue` (`:166-177`).
- `scripts/seed-local-fixtures.mjs` — the credential chain the generator must reproduce: `STATUS_COMMAND` pinned to `supabase@2.98.2` (`:42`), `STATUS_TIMEOUT_MS = 120000` (`:47`), `describeExit` because a timed-out `spawnSync` reports `status === null` (`:73-79`), and `resolveFixturePasswordDefault` (exported; `verify-seed-local-guard.mjs:46` imports it — the export must survive the refactor).
- `scripts/verify-local-stack-readiness.mjs` — `parseArgs` (`:113-153`) is the repo's flag-parsing precedent, including the missing-value and unknown-flag errors. `countFromContentRange` (`:249-254`).
- `supabase/migrations/20261004000000_create_core_tables.sql` — `contacts` (`:5-25`): **`phone TEXT NOT NULL`** and `UNIQUE (phone, program_id)` (`:29`) — so "a contact with no phone" can only be the empty string, and at most one such row per program exists. `location_ids TEXT[] DEFAULT '{}'` (`:20`) — an array of location ids, not a scalar column. `locations` (`:32-39`), `name` NOT NULL, `status` default `Active`.
- `supabase/migrations/20261006000000_add_users_and_contact_columns.sql` — `public.users.location_ids UUID[]` (`:19`) and `UNIQUE (program_id, email)` (`:22`); `contacts` gains `source`/`rounds`/`books_read`/`is_favorite` (`:88-94`).
- `supabase/migrations/20261006010000_scoped_rls_policies.sql` — `contacts` SELECT scope is `program_id = caller_program_id() AND (Admin | Preacher assigned_preacher_id = auth.uid())` (`:161-170`); `locations` SELECT scope is `Admin | id = ANY(caller_effective_location_ids())` (`:186-192`), and `caller_effective_location_ids()` returns a **Preacher's own** `users.location_ids` (`:68-80`). **This is why the generator must widen the Preacher's `location_ids`**: a Preacher session cannot resolve a location name the Preacher is not scoped to.
- `lib/supabase/manage.ts` — `loadManagePortalData` narrows `scopedLocationRows` to `staff.locationIds` when `mode === "preacher"` (`:521-531`) and builds `locationNameById` from those rows (`:533`); `CONTACT_COLUMNS` (`:56-77`) is what the grid reads; `updateManageContact` → `assertProgramLocations` rejects a location not in the program (`:834-861`).
- `components/manage/manage-contacts-table.tsx` — the location column is a **joined** accessor over `contact.locationIds → locationNameById.get(id) ?? id` (`:525-531`), which is why distinct location *names* matter and an unresolvable id degrades to a raw UUID in the cell.
- `lib/manage/api-handlers.ts` — `MANAGE_BULK_MAX_ITEMS = 200` (`:40`); `Phone is required.` / `Name is required.` (`:161-166`, `:174-179`); per-item failures are `200` + `ok:false`, envelope errors are `400` (`:317-357`).
- `e2e/fixtures/auth-users.ts` — `readEnvValue` (process env wins over `apps/folk/.env.local`) and `listAuthUsersMatching`; the loopback refusal precedent to copy for any admin-API call.
- `playwright.config.ts` — `globalSetup` is not yet declared; `testDir: "e2e/specs"`, `fullyParallel: false`, `workers: 1`, and the three `setup-*` projects.
- `e2e/specs/harness-guards.spec.ts` — the precedent for asserting a guard offline by `spawnSync`-ing a repo script and matching its refusal text (`:47-59`), and for asserting `package.json` wiring (`:61-71`).

## Tasks & Acceptance

**Execution:**
- `scripts/local-supabase-credentials.mjs` — NEW. Exports `readLocalSupabaseCredentials({ cwd, run })`: runs `pnpm dlx supabase@2.98.2 status -o env` with a 120s timeout, returns `{ apiUrl, serviceRoleKey }` parsed through `parseSupabaseStatusEnv`, and throws a message naming `pnpm supabase:start` when either is missing or the command times out (`status === null` described, never "exited null"). One definition, so the generator and the seeder wrapper cannot drift on the credential chain.
- `scripts/seed-local-fixtures.mjs` — import that helper and delete its inlined copy of the same chain. `resolveFixturePasswordDefault` stays exported and the `stdio: "inherit"` spawn, the password precedence, and the exit-code propagation stay byte-identical in behaviour: `pnpm test:seed-local-guard` is the proof.
- `scripts/bulk-contact-fixtures.mjs` — NEW. Flags `--count` (default 250), `--program` (default `folk`; `both` splits the count), `--locations` (default 5), `--chunk-size` (default 250), `--wipe`, `--allow-non-local`. Order: parse flags → resolve credentials (or refuse) → `assertLocalSupabaseTarget` on both URL variables **before** constructing the client → verify the program's seeded staff (Preacher, Admin) and locations exist → DW-3 pre-write check on those rows → create/ensure the program's `preview-fixture-bulk-location-<n>-<program>` rows → widen the Preacher's `location_ids` to the union of its seeded ids and the bulk locations → select existing tagged rows by `(program_id, name like 'preview-fixture-bulk-%')` → build the missing rows → insert them in chunks → DW-3 post-write re-assert → verify the matrix invariants against a re-read (row count, distinct names, every `location_ids` entry resolving to a real location, ≥1 phone set and exactly 1 empty, in-scope and out-of-scope both non-empty, every name tagged) → print `Total created: N`, the request count, the elapsed time, and the DW-3 line. Row generation is deterministic (no randomness, so a re-run is byte-identical): name `preview-fixture-bulk-<program>-<NNNN>-<Name>` from a fixed name pool, phone `8<1|2><8-digit index>` (a range disjoint from the seeder's `9000000001-4`), index 0 carrying `phone: ""`. Row shapes vary across `college`/`company`/`notes`/`is_favorite`/`books_read` so per-column filters have something to filter on. `--wipe` deletes only the `preview-fixture-bulk-` tagged contacts and locations and reports both counts. Every exit path names the fix, and no credential value is ever printed.
- `e2e/fixtures/bulk-contacts.ts` — NEW. A service-role client built on `readEnvValue` + the repo's loopback predicate (throwing rather than degrading if the key or the local URL is missing, so a mis-pointed stack cannot produce a false green); selectors for the shared shapes story 4's rows need (in-scope set, out-of-scope set, the phone-set and phone-empty rows, per-location groups, distinct names, the Preacher's `location_ids`); and `cleanupTaggedContacts(ids)` for rows a spec created itself.
- `e2e/global-setup.ts` — NEW. Runs the generator once per suite invocation through `pnpm seed:bulk-local` semantics, asserts its exit code, and fails the run with the generator's own output when it fails. Idempotent, so a second run inserts 0 — which makes every suite invocation a live idempotence check.
- `playwright.config.ts` — declare `globalSetup: "e2e/global-setup.ts"`. Nothing else changes: the storageState matrix, the `webServer`, and the projects stay as they are.
- `package.json` — add `seed:bulk-local` (`node scripts/bulk-contact-fixtures.mjs`) and `seed:bulk-full` (the same script with `--count 1052 --program folk`, the manual/perf check story 2 measured — `folk` alone, because `--program both` *splits* the count).
- `e2e/specs/bulk-fixtures.spec.ts` — NEW. One row per matrix row above: the default volume's shape (distinct names, real locations, phone coverage, scope on both sides, Preacher `location_ids` widened), idempotence (a second in-process run reports `Total created: 0`), the `--count` floor and its three bad-input refusals, the batched-insert request count reported by the generator, `--wipe` removing only tagged rows and the seeded rows surviving (restore in a `finally`, since the shared set is what later rows depend on), the non-local refusal with `--allow-non-local` getting past it, the missing-prerequisite refusal, the `preview-fixture-%` seeder-filter discoverability of generated rows, and `cleanupTaggedContacts` removing a row the spec itself created. CLI-only rows spawn the script; the data rows read through `e2e/fixtures/bulk-contacts.ts`.
- `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md` — record that the row-volume prerequisite now exists, naming the default volume, the batched-insert strategy, and the flags. **Row verdicts stay exactly as they are** — story 4 owns them, and a verdict must never flip because a fixture landed.
- `docs/development-guide.md` — document `pnpm seed:bulk-local`, `--count`/`--program`/`--chunk-size`/`--wipe`, the `preview-fixture-bulk-` tag, and the ordering rule that it runs **after** `pnpm seed:local` (a re-seed resets the Preacher's `location_ids`, which the generator then re-widens).

**Acceptance Criteria:**
- Given the local stack up and `pnpm seed:local` already run, when `pnpm seed:bulk-local` runs with no flags, then it exits 0, prints `Total created: 250` on a clean database and `Total created: 0` on an immediate re-run, and both runs print the DW-3 line.
- Given the generator has just run, when `seed-preview-fixtures.mjs --wipe` runs, then every generated contact and generated location is removed by the existing `preview-fixture-%` filter and the 24 originally seeded rows are untouched.
- Given the seeded Preacher's `location_ids` hold only `preview-fixture-location-1-<program>`, when the generator runs, then they afterwards hold that id plus every bulk location of the program, and a Preacher session renders location names rather than raw ids.
- Given a stack with no `preview-fixture-` locations for the program, when the generator runs, then it exits 1 naming `pnpm seed:local` and writes nothing.
- Given `NEXT_PUBLIC_SUPABASE_URL` set to the hosted project, when the generator runs, then it exits 1 with the refusal naming the host and both override routes, and no Supabase client is constructed.

## Spec Change Log

Three deviations from the Tasks & Acceptance list. None changed the intent
contract, the matrix, or a boundary's *substance*.

1. **`scripts/seed-preview-fixtures.mjs`'s `--wipe` now batches its `.in("id", …)`
   deletes at 100 ids per request.** The Code Map marked that file read-only, and
   the boundary's intent was to protect the seeding logic, the DW-3 assertion, the
   **`--wipe` filter**, and the `preview-fixture-` tag convention — none of which
   this touches: the filter is byte-identical, and only the number of requests
   changed. It had to change: `.in()` puts every id in the query string, so with
   ~250 bulk contacts the seeder's wipe failed `URI too long`, and Acceptance
   Criterion 2 ("`seed-preview-fixtures.mjs --wipe` removes every generated row")
   was unsatisfiable. A wipe that only works below the default volume is a wipe
   that fails exactly when a developer needs it. Verified: `pnpm seed:local --wipe`
   now removes all 279 tagged rows, where before it aborted on the first delete.
2. **`seed:bulk-full` is `--program folk`, not `--program both`.** The task list as
   written contradicted the intent's own perf check: `--program both` *splits* the
   count, so `--count 1052 --program both` produces 526 per program and cannot
   reproduce a ">1,000 rows in folk" measurement. The flag's documented splitting
   semantics are kept; the script now names the program it means.
3. **The matrix-invariant phone and out-of-scope checks are conditioned on volume**
   (`target >= 2`, `target >= 4`). Asserted flat, the generator exited 1 on the
   legal input `--count 1`, because index 0 is the blank-phone row and index 3 is
   the first out-of-scope row. A generator that refuses valid input is worse than
   one that asserts what a given volume can prove.
   *(Superseded in the follow-up pass: the first pass's G4 change moved the
   out-of-scope split to every tenth row, so the constant is now
   `MIN_INDEXES_FOR_OUT_OF_SCOPE = 10` and the first out-of-scope index is 9, not
   3. `MIN_INDEXES_FOR_PHONE = 2` is unchanged. The code is authoritative; this
   entry is left as the record of why the checks are conditioned at all.)*

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 43 findings — high 0, medium 13, low 17, false 13, maybe-false 0
- layers: blind hunter (22), edge-case hunter (14), verification gap (4 gaps + 4 other), intent alignment (descriptive; its actionable divergences are triaged in their own right)
- grouped entries:
  - **G1 (patch)** — coverage gaps on the change's own surfaces: the seeder's batched `--wipe` has no automated coverage; the guard's `SUPABASE_URL` half is untested; `--program both` splitting is untested; DW-3's id-mismatch clause is untested; `SEED_ALLOW_NON_LOCAL=1`, `--flag=value`, `--locations` and the `package.json` wiring are untested; the "touched no auth.users row" claim is indirect; the "in-process" title misdescribes a spawn; a `spawnSync` timeout reports `status: null` with no cause.
  - **G2 (patch)** — assertion weakness: location-name distinctness is only asserted as `length > 0`, location names are compared by list position, per-column variation is unasserted, and `assertInvariants` does not catch a row assigned to neither staff id.
  - **G3 (patch)** — `cleanupTaggedContacts` deletes by id with no tag check, and its doc comment describes a signature it does not have.
  - **G4 (patch)** — the out-of-scope ratio left only 188 in-scope rows at the 250 default, below the 200-item cap the volume is required to make meaningful.
  - **G5 (patch)** — documentation drift: `matrix-coverage-map.md` and the development guide still named `--program both` for `seed:bulk-full`, the guide's `URI too long` troubleshooting row described a failure this change removed, and neither recorded the story's deviations.
  - **G6 (patch)** — `runGenerator`'s timeout blindness, `readFixtureStaff` ignoring its `program` argument, `parseArgs` accepting positional typos and non-decimal numerics, and an unordered `seededLocations` select that breaks the byte-identical-rerun claim.
  - **G7 (patch)** — dead surface: the injectable `run` seam in `local-supabase-credentials.mjs` has no caller.
  - **G8 (patch, then partly reverted by the orchestrator)** — the seeder-`--wipe` spec row: implemented, measured at 5 minutes and order-sensitive, then removed — see the row below.
- findings:
  - `[medium]` `[patch]` the seeder's batched `--wipe` — Acceptance Criterion 2's own subject — had no automated coverage — verified: `verify-seed-local-guard.mjs` never passes `--wipe`, and no other runner invokes it. A row was added (G8).
  - `[medium]` `[patch]` deleting `"SUPABASE_URL"` from the refusal loop left every row green — added `the guard also catches a hosted SUPABASE_URL beside a local NEXT_PUBLIC one`; the implementer verified mutation-sensitivity by removing the entry and watching the row fail.
  - `[medium]` `[patch]` `--program both` splitting was asserted nowhere, so doubling it would have been silent — added `--program both splits the count across the two programs`.
  - `[medium]` `[patch]` DW-3's id-mismatch clause — the invariant the intent names as its headline — had no test; only the `status` clause was reached — added a DW-3 id-mismatch row that builds a swapped-id pair in an isolated throwaway program, so no shared fixture is touched.
  - `[medium]` `[patch]` `SEED_ALLOW_NON_LOCAL=1`, the `--flag=value` form, `--locations`, and the `package.json` wiring were all documented and none exercised — four rows added; the `package.json` one exists because that exact string had already drifted once in this story.
  - `[medium]` `[patch]` the "touched no auth.users row" claim was inferred from an unchanged contact set — the row now snapshots both fixture addresses through `listAuthUsersMatching` before and after.
  - `[medium]` `[patch]` "in-process run" misdescribed a double spawn, and a `spawnSync` timeout surfaced as `expected 1, got null` — title corrected; `runGenerator` now throws naming `result.error`.
  - `[medium]` `[patch]` a regression pinning every contact to one location would have kept both suites green, defeating the per-column filter row the story exists to serve — `Locations are real` now asserts the distinct-name count and compares names order-independently, and a per-column variation row was added.
  - `[medium]` `[patch]` `cleanupTaggedContacts` could delete an untagged row, which the intent's Never clause forbids — it now reads first and throws naming any id whose name lacks `BULK_TAG`; the doc comment now matches the signature.
  - `[medium]` `[patch]` every fourth row out of scope left 188 in-scope at the default, under the 200 cap — ratio changed to every tenth row (225 / 25 at 250), `MIN_INDEXES_FOR_OUT_OF_SCOPE` raised to match, comments updated.
  - `[medium]` `[patch]` `parseArgs` ignored positional arguments and accepted `1e3` / `0x10` / `" 5 "` for numeric flags — non-`--` tokens are now refused by name and numerics must match `^\d+$`.
  - `[medium]` `[patch]` `seededLocations` was read unordered while `buildContact` used `[0]`, so the byte-identical-rerun claim did not hold — `.order("name", { ascending: true })` added.
  - `[low]` `[patch]` `assertInvariants` accepted a row assigned to neither staff id — it now reports any such row.
  - `[low]` `[patch]` `readFixtureStaff(role, program)` filtered on `program_id` but looked the row up by the suite-wide address — it now derives the address from `program`.
  - `[low]` `[patch]` the `run` seam in `local-supabase-credentials.mjs` had no caller — deleted; exports and messages unchanged.
  - `[low]` `[patch]` the map and guide still described `seed:bulk-full` as `--program both`, and the guide's `URI too long` troubleshooting row described a failure this change removed — all corrected, with a deviations section added to the map.
  - `[low]` `[patch]` the guide's Test Status section did not mention `bulk-fixtures.spec.ts` or that a run tops the set up — added, along with the 225/25 split.
  - `[low]` `[patch]` `runGenerator`, `GENERATOR` and `HOSTED_SUPABASE_URL` were duplicated across the spec and `global-setup.ts` — the path and URL now come from `e2e/fixtures/bulk-contacts.ts`; the two timeout constants stay separate with a note on why.
  - `[low]` `[patch]` the scope-split assertion hard-coded `floor(250 / 10)`, so it failed on the second suite run once the top-up row had grown the set — derived from the tagged total instead. Found by the orchestrator, not by a layer.
  - `[low]` `[reject]` the seeder's `locations` delete is still a single unbounded request — refuted: it filters on `name like …` and carries no id list, so the URI-length rationale that drove the batching does not apply.
  - `[low]` `[reject]` `batched()` now exists in two scripts, duplicating the Never clause's anti-duplication rule — the clause covers the `supabase status -o env` parser, the `KEY=value` parser and the loopback predicate, none of which is duplicated; sharing this helper would make the seeder import from the generator that depends on it.
  - `[low]` `[reject]` `verifyPrerequisites`' `like('preview-fixture%')` also matches the bulk locations, so a program holding only generated locations would pass the prerequisite check — the only reachable state requires hand-deleting the seeder's locations while leaving generated ones, and every row written would still point at a real location; excluding the bulk prefix is a new branch for a state no command produces.
  - `[low]` `[reject]` `ensureLocation` does not restore a non-Active status — refuted: `loadManagePortalData` selects `status` but filters on nothing, so an inactive location still renders its name.
  - `[low]` `[reject]` a failed chunk leaves earlier chunks committed — that is the floor semantics working: the run exits 1 loudly and the next run tops the set up, which is the documented recovery.
  - `[low]` `[reject]` `--wipe` leaves the Preacher holding ids for the locations it deleted — self-healing by design: the next generate run drops ids that no longer resolve, as its own comment states.
  - `[low]` `[reject]` three rows assume the second program holds no generated rows — each asserts and restores that state in its own `finally`, so none depends on another having run; order-independence across retries is story 5's determinism work.
  - `[low]` `[reject]` no composite script chains `seed:local` → `seed:bulk-local` — the ordering rule is documented and `globalSetup` enforces it per suite run; chaining a 250-row insert into every `dev:local` boot is a cost decision this story should not make silently.
  - `[low]` `[reject]` the map's sequencing step keeps its imperative with a `Done` marker — cosmetic; the marker carries the status.
  - `[low]` `[reject]` the map's "What landed" table omits the deviations — patched instead, as part of G5.
  - `[false]` `[reject]` nothing asserts that the service-role key never appears in output — a row was added (`Secrets: the service-role key never appears in the generator's output`), which is the honest response rather than a rejection of the gap.
  - `[false]` `[reject]` the generator never closes its client and may hang on keep-alive sockets — refuted by measurement: every run in this story returned in 2.5–3.6 s wall, repeatedly.
  - `[false]` `[reject]` a `db-max-rows` below 1000 would silently truncate `collectPaged` — the local stack sets no limit, and this is the same paging shape `lib/supabase/manage.ts` already uses.
  - `[false]` `[reject]` `bulk-contacts.ts` imports a `.mjs` module with no tsconfig support — refuted: `tsconfig.base.json` sets `allowJs: true` and `playwright.config.ts` already imports the same module; `tsc --noEmit` reports 0 errors.
  - `[false]` `[reject]` the generator inserts columns the migrations do not define — refuted: `age`, `college`, `company`, `designation` and `collected_by_id` are all declared in `20261004000000_create_core_tables.sql:5-25`.
  - `[false]` `[reject]` the fixture client and the generator could read different stacks without anything noticing — refuted: a key mismatch makes the generator's rows invisible to the reader, so every data row fails loudly rather than passing vacuously.
  - `[false]` `[reject]` `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` disagreement in the fixture reader is unguarded — the loopback check already refuses any hosted value it would pick, and the reader is not the app runtime.
  - `[false]` `[reject]` the Review Triage Log was empty while the status read `in-review` — this entry.
  - `[false]` `[reject]` five acceptance criteria cannot cover a twelve-row matrix — by template design: acceptance criteria carry system-level behaviour, and the matrix rows are carried by the spec.
  - `[false]` `[reject]` the shared generated set is "rows a previous run left behind", against the intent's cleanup requirement — the set is a declared, reproducible fixture with a floor contract, not residue; what the intent forbids is a spec *relying on* a row it did not create, and the three rows that mutate shared state all restore it.
  - `[false]` `[reject]` the intent's "without phone (forced-400 row)" is unmet as data — `contacts.phone` is `NOT NULL`, so the blank row exists and is the only such row possible; the 400 itself is produced by submitting an empty patch value, which needs no such row.
  - `[false]` `[reject]` the diff is off-intent for wiring `globalSetup` into the harness — the intent asks for a generator the matrix's rows can be written against; running it once per suite is how "specs must clean up after themselves" is enforced without every row re-seeding.
  - `[false]` `[reject]` no committed spec opens the grid, so the location-name requirement is only asserted as a precondition — correct for this story: the grid rows are story 4's, and the precondition plus the recorded live `/manage` probe is the honest boundary.
  - `[medium]` `[reject]` the blank-phone row cannot serve a forced 400 on its own — refuted: `parseContactPatch` rejects an empty `phone` on any contact, so the requirement is a data shape the generator satisfies; nothing further was owed here.

### 2026-10-08 — Follow-up review pass

- verdicts: 39 findings — high 0, medium 3, low 30, false 6, maybe-false 0
- layers: blind hunter (18), edge-case hunter (16), verification gap (3 gaps + 2 other), intent alignment (descriptive; its actionable divergences are triaged in their own right)
- one row per finding below, in the order each layer reported it, each ending with the layer that filed it — so a claim two layers reported independently appears as two rows rather than silently merged.
- **carried** marks a finding whose location and claim match a row in the first pass's log above and whose code still reads as that row describes: the verdict and route are kept, verification is skipped, and nothing is patched or deferred again. Three findings carried — the seeder-`--wipe` coverage gap (G8), the shared generated set as declared fixture rather than residue, and the unguarded `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` disagreement in the fixture reader.
- findings:
  - `[medium]` `[patch]` the `--count existing+55` row topped the **shared** folk set up by 55 rows and never restored them, so every suite invocation grew the set story 4 selects from without bound — measured before this pass: the set stood at 305 (250 plus one leaked top-up), and a second run under the old code would have made it 360. The first pass's claim that "the three rows that mutate shared state all restore it" did not hold for this one. **Fixed**: the row now runs against `OTHER_PROGRAM` and wipes it in a `finally`, the pattern its three neighbours already use. Folk measured 305 across two consecutive `pnpm test:e2e` runs afterwards. _(filed by the blind hunter)_
  - `[low]` `[patch]` a spec comment says "index 3 is the first out-of-scope row, so the scope-on-both-sides check needs ≥4"; the code says `index % 10 !== 9` with `MIN_INDEXES_FOR_OUT_OF_SCOPE = 10`. A maintainer sizing thresholds from the comment would break the `--count 8` runs two rows depend on. **Fixed**: corrected to name index 9 and the constant. _(filed by the blind hunter)_
  - `[low]` `[patch]` an empty section header — "The seeder's own `--wipe`, which must cover the generated rows" — was left in the spec file with no row under it, so the file advertises coverage it does not have. **Fixed**: deleted. _(filed by the blind hunter)_
  - `[low]` `[patch]` `SEEDER_TAG` is exported from `e2e/fixtures/bulk-contacts.ts` and never imported, while the spec hard-codes `preview-fixture%`, `preview-fixture-location-%`, `preview-fixture-contact-%` and `preview-fixture-location-1-<program>` in four places — the constant exists and the duplication it was meant to prevent remains. **Fixed**: all four derive from `SEEDER_TAG`. _(filed by the blind hunter)_
  - `[low]` `[patch]` `STATUS_COMMAND` and `STATUS_TIMEOUT_MS` are exported from `scripts/local-supabase-credentials.mjs` with the comment "Exported so a caller asserting the chain does not re-spell the version", and no such caller exists — the same dead-surface class the first pass deleted the `run` seam for. **Fixed** together with the verification-gap row below: the guard imports both and asserts them. _(filed by the blind hunter)_
  - `[low]` `[patch]` the `--program both` row hard-codes a delta of 10 and computes a second delta as `perProgram - otherBefore`; both hold only while the other program holds no generated rows, so the row fails run alone (`--grep`) or after a partial earlier run. **Fixed**: the delta is `Math.max(0, perProgram - otherBefore)` — a floor never deletes — and the "split, not doubled" claim now reads the generator's own `10 row(s) each` banner, which does not depend on the starting state. _(filed by the blind hunter)_
  - `[low]` `[reject]` nothing exercises the full-volume `--count 1052` path. The intent assigns it to a manual/perf check by name ("while the 1,052 rows story 2 measured belongs to a manual/perf check"), and this pass ran it: 1,052 rows, 947 in-scope + 105 out-of-scope, 747 inserted over 3 PostgREST requests in 2.9 s. _(filed by the blind hunter)_
  - `[low]` `[reject]` Acceptance Criterion 1's "Total created: 250 on a clean database" cannot be asserted in-suite, because `globalSetup` generates before any row runs. True, and not worth a row that wipes the shared set mid-suite to manufacture the condition; the clean-database half is verified manually and the invariants are asserted against a re-read. _(filed by the blind hunter)_
  - `[false]` `[reject]` Acceptance Criterion 3's UI outcome has no test that renders the grid, and the "recorded live `/manage` probe" the first pass relied on is recorded nowhere. Both halves resolved: the grid rows are story 4's, which the first pass already logged as the correct boundary; and the probe **is** recorded — commit `c198058`'s copy of this file's Auto Run Result carries `GET /manage?view=contacts` at 1,052 rows as the seeded Preacher and as the Admin, 200 both times, 947 and 1,052 bulk contacts, all five `preview-fixture-bulk-location-*-folk` names rendered and the raw-UUID fallback absent. This pass re-generated at that volume but did not re-run the browser probe. _(filed by the blind hunter)_
  - `[low]` `[reject]` `--locations` does not redistribute existing rows onto the new locations, and the guide describes it only as "more distinct joined location names". Not a defect: the flag's documented meaning is how many locations the program *offers*, the row exercising it asserts the location count, and backfilling would contradict the generator's own invariant — it never rewrites an existing row, because that would silently revert an edit a story-4 row made. _(filed by the blind hunter)_
  - `[low]` `[patch]` the generator's refusal names `--allow-non-local` and `SEED_ALLOW_NON_LOCAL=1`, and a spec comment calls the env override "documented in docs/development-guide.md next to the flag", but the guide's bulk-fixture section documented neither. **Fixed**: a paragraph added, stating that both overrides only get a run past the guard and then fail downstream. _(filed by the blind hunter)_
  - `[false]` `[reject]` the guide documents no remedy after `--wipe`, which removes the bulk locations and leaves the Preacher holding their ids. Refuted: no contact references those ids, so nothing renders them, and the next generate run drops ids that no longer resolve — a state the guide's own "run it after `pnpm seed:local`" rule already sends the developer through. _(filed by the blind hunter)_
  - `[low]` `[patch]` the wipe row compared Postgres-ordered rows against an `localeCompare`-sorted list, so a difference between the two collations fails the row for a reason unrelated to the wipe. **Fixed**: both sides are mapped to names and sorted in one collation. A first attempt that also compared `id`s failed the suite — the restore deletes and re-inserts the rows, so "restored" means the same set of names. _(filed by the blind hunter)_
  - `[low]` `[reject]` "Zero network I/O on a refused run" is asserted through a wording proxy — the absence of the banner. The banner is printed after the client would have been constructed, so its absence is a real ordering assertion; observing the network directly would mean instrumenting the runner. _(filed by the blind hunter)_
  - `[low]` `[reject]` the selectors re-read the entire tagged set on every call, with no caching — several hundred redundant round trips across the file. Rejected: each read is a single-digit-millisecond local query, and the suite's wall time is dominated by `spawnSync`ed node processes; a cache would add state whose staleness is its own bug surface. _(filed by the blind hunter)_
  - `[low]` `[reject]` `source` is a single constant across all 250 rows, and the per-column-variation row omits `source` and `age`. No matrix row and no task names `source` variation, and a single-valued column is still filterable by equality in the grid, so nothing a row needs is missing. _(filed by the blind hunter)_
  - `[low]` `[reject]` the seeder-wipe verification cites two row counts — 279 in Spec Change Log 1, "254 tagged contacts present" in the orchestrator note. Both are recorded with their referents (254 contacts in; 279 public rows removed across contacts, locations and users), and reconciling the wording changes no behaviour. _(filed by the blind hunter)_
  - `[low]` `[reject]` shared-state safety rests entirely on `fullyParallel: false` / `workers: 1` in `playwright.config.ts`, with no `test.describe.configure({ mode: "serial" })`, so `--workers=4` would race the wipe/top-up/prerequisite rows. Refuted for today: `fullyParallel: false` already keeps tests inside a file ordered and in one worker whatever the worker count, and the only other spec files are offline. Order-independence across retries is story 5's determinism work, which the first pass already recorded. _(filed by the blind hunter)_
  - `[low]` `[reject]` the generator's `--wipe` can abort on a foreign key when deleting generated locations: `sessions.location_id` is `ON DELETE RESTRICT` (`20261006000000_add_users_and_contact_columns.sql:57`). No command in the repo points a session at a generated location — the seeder is the only writer of `sessions` and writes against its own seeded rows — so the state needs a hand-written insert, and a wipe that refuses loudly on it is correct behaviour. _(filed by the edge-case hunter)_
  - `[low]` `[reject]` the same wipe can abort deleting generated contacts, because `attendance.contact_id` has no `ON DELETE` clause (`20261004000000_create_core_tables.sql:68`). Same reachability: the seeder is the only writer of `attendance`, and it writes against seeded contacts. The seeder's own wipe handles this by deleting attendance and sessions first; the generator's wipe has nothing to delete. _(filed by the edge-case hunter)_
  - `[low]` `[reject]` a program re-seeded with new `auth.users` UUIDs while old tagged rows remain makes the post-write `unassigned` check exit 1 rather than topping up. Every path that re-mints a staff id — `pnpm seed:local --wipe`, `pnpm seed:preview-fixtures --wipe` — deletes the `preview-fixture-%` contacts in the same run, so the rows that would carry the stale ids are gone too. Reaching it needs an auth user deleted by hand while the contacts stay. _(filed by the edge-case hunter)_
  - `[low]` `[reject]` `ensureLocation`'s `maybeSingle()` on `(program_id, name)` surfaces a bare `PGRST116` when two locations share a name, and no unique index prevents that. It also prevents the generator from creating the duplicate: it reads first, and the name it reads is derived from `--locations`. Only a hand-inserted duplicate reaches the error. _(filed by the edge-case hunter)_
  - `[false]` `[reject]` `redact()` would throw a `TypeError` from `out.includes(secret)` when handed a value that is neither a string nor JSON-serialisable. Refuted: every call site passes a string — `error.message` from this module's own `Error`s at `:281`, `:291`, `:324` and `:811`, or a template literal — so `JSON.stringify`'s `undefined` return is unreachable. _(filed by the edge-case hunter)_
  - `[low]` `[reject]` `await main()` at the top level is unguarded, so a throw that never reached `fail()` would print a raw stack instead of a message naming the fix. Rejected: every failure path — flags, both refusals, credentials, every query through `unwrap`, the invariants — already routes through `fail()`, and the bare `await` only runs code that has thrown a programming error. _(filed by the edge-case hunter)_
  - `[low]` `[reject]` `cleanupTaggedContacts`'s unpaged `.in("id", …)` read and delete would hit `URI too long` on a large id list — the failure this change batched everywhere else. Rejected: the helper's documented contract is the rows *a spec created itself*, and no spec creates more than a handful; a batching loop would guard a volume nothing reaches. _(filed by the edge-case hunter)_
  - `[low]` `[reject]` `bulkFixtureClient` caches on URL alone, so a rotated service-role key leaves the suite querying with a dead one for the rest of the run. Rejected: the failure is loud on every data row, not a silent wrong answer, and rotating the key mid-run means restarting the local stack mid-run. _(filed by the edge-case hunter)_
  - `[false]` `[reject]` `resolveBulkFixtureTarget` prefers `SUPABASE_URL` over `NEXT_PUBLIC_SUPABASE_URL` without an agreement check, so two different loopback stacks would be read — against the module's own "no false green" docstring. Carried from the first pass's log: the loopback check refuses any hosted value it would pick, and a URL or key mismatch makes the generator's rows invisible to the reader, so every data row fails loudly rather than passing vacuously. _(filed by the edge-case hunter)_
  - `[medium]` `[patch]` `contactsMatchingSeederFilter` read the seeder-filter set in a single unpaged select, and `supabase/config.toml:18` sets `[api] max_rows = 1000`. **Measured** at the `pnpm seed:bulk-full` volume: the unpaged select returned **1,000 of 1,054** rows. Both sides of the wipe row's set comparison come from this same function, so the truncation is invisible there, and `Default run: every name carries the preview-fixture- tag` compares 1,000 tagged rows against 1,052 read through the paged helper and fails — reachable with two documented commands. **Fixed**: the helper pages at 1,000 like the generator's `collectPaged`; both affected rows pass at 1,052 rows. _(filed by the edge-case hunter)_
  - `[low]` `[patch]` the two override rows assert the literal `Invalid API key`, so a runner with no outbound access to the hosted project fails on a transport error while proving the same thing — that both overrides got past the guard. **Fixed**: the wording assertion accepts the transport failures too; the guard-bypass assertions above it are unchanged. _(filed by the edge-case hunter)_
  - `[low]` `[reject]` `staffEmailFor` honours the `E2E_<ROLE>_EMAIL` override for the suite's program while the generator's `emailFor` always spells `preview-fixture-<role>-<program>@example.com`, so the override makes `globalSetup` refuse and the suite cannot start. Rejected: the override exists for "a stack seeded differently", which this suite refuses anyway, and the fix is to thread it into the generator — new surface this story did not ask for. _(filed by the edge-case hunter)_
  - `[low]` `[reject]` the auth-snapshot row calls `listAuthUsersMatching`, which requires `SUPABASE_URL` specifically, so with only `NEXT_PUBLIC_SUPABASE_URL` exported it throws where the fixture client (which falls back) resolves fine. Rejected: `SUPABASE_URL` is a precondition the harness already requires — story 2's `auth-guards` rows call the same helper — so the state in which this row fails spuriously is one in which the suite already cannot run, and the fix belongs to a shared helper this story does not own. _(filed by the edge-case hunter)_
  - `[low]` `[patch]` the stale "index 3 is the first out-of-scope row" comment, reported independently by this layer, with the same location and claim as the blind hunter's second row. **Fixed** once, by that patch. _(filed by the edge-case hunter)_
  - `[false]` `[reject]` the data rows read a generated set that `globalSetup` left behind, against the intent's "no spec may rely on a row a previous run left behind". Carried from the first pass's log: the set is a declared, reproducible fixture with a floor contract rather than residue, what the clause forbids is a spec *relying* on a row it did not create, and the rows that mutate shared state restore it in a `finally`. _(filed by the edge-case hunter)_
  - `[false]` `[reject]` the module docstring sells "a mis-pointed stack … is a false green" as prevented, while two different loopback stacks are both accepted. Carried from the first pass's log, with the same refutation as the row above: the loopback check refuses any hosted value it would pick, and a mismatch surfaces as loud data-row failures. _(filed by the edge-case hunter)_
  - `[medium]` `[patch, carried]` the seeder's batched `--wipe` — Acceptance Criterion 2's own subject — still has no automated coverage: `verify-seed-local-guard.mjs` never passes `--wipe`, no other runner invokes it, and the spec row that would have was implemented, measured at 5 minutes and order-sensitive, then removed by the orchestrator. Carried: the gap is unchanged, its verdict and route stand, and nothing is re-actioned here. The generator's own `--wipe` row exercises the identical batching shape at 250 rows, and Criterion 2 remains verified by the orchestrator's manual run documented in `docs/development-guide.md`. _(filed by the verification gap)_
  - `[low]` `[patch]` `playwright.config.ts`'s `globalSetup` — the wiring that makes "a suite cannot report green against a 24-row database" true — is asserted nowhere, and every row in `bulk-fixtures.spec.ts` spawns the generator itself, so deleting the key leaves the file green on any database that already holds the rows. **Fixed** with an offline row reading the config, mirroring the existing `package.json` wiring row. Mutation-checked: commenting the key out turns the row red. _(filed by the verification gap)_
  - `[low]` `[patch]` the credential chain's `supabase@2.98.2` pin is asserted nowhere: the wrapper's `PATH`-emptied run fails before argv is read, and the guard's stub `pnpm` answers any `dlx` invocation, so an unpinned CLI would reach both `pnpm seed:local` and `pnpm seed:bulk-local` silently. **Fixed** together with the blind hunter's dead-export row: `scripts/verify-seed-local-guard.mjs` imports `STATUS_COMMAND` and `STATUS_TIMEOUT_MS` and asserts the exact argv and a finite timeout. Mutation-checked: unpinning turns the new assertion red. _(filed by the verification gap)_
  - `[low]` `[patch]` the spec's Spec Change Log records the volume conditioning as `target >= 2` / `target >= 4` with "index 3" as the first out-of-scope row, which the G4 ratio change superseded. Reported independently by this layer, with the same claim as the blind hunter's stale-comment row. **Fixed** once: the code comment corrected, and a superseding note added to the change-log entry without rewriting it. _(filed by the verification gap)_
  - `[low]` `[patch]` the leftover empty section header in `bulk-fixtures.spec.ts`, reported independently by this layer, with the same claim as the blind hunter's third row. **Fixed** once, by deleting it. _(filed by the verification gap)_

### Orchestrator follow-up on the first pass

The seeder-`--wipe` row (G8) was implemented and then **removed by the orchestrator after measuring it**. It wiped the stack mid-suite, `seed:local` minted new `auth.users` UUIDs, and the run's three `storageState` files became invalid; restoring them needed three fresh OTP sign-ins inside a row, which took 5 minutes and pushed the file past the global test timeout. Re-authenticating inside the row removed the invalidation but left a global reseed — and three contended OTP logins — hidden in a single spec, which is the order-dependence story 5 exists to eliminate. Acceptance Criterion 2 is therefore verified by the orchestrator's own run (`pnpm seed:local --wipe` with 254 tagged contacts present: exit 0, `279 public rows and 8 auth users removed`) and documented as such in `docs/development-guide.md`, including why it is not automated. The generator's own `--wipe` row does exercise the identical batching shape at 250 rows.

## Design Notes

**Why `phone: ""` is "the contact with no phone".** `contacts.phone` is `NOT NULL` and `UNIQUE (phone, program_id)`, so there is exactly one such row per program and it is the empty string. A generated contact cannot have a null phone, so the empty-required-field row and the forced-400 row are served by one deliberately blank row plus the route interception story 4 uses. Generating a second blank row would violate the unique index — the generator asserts exactly one and says so rather than letting a raw constraint error surface.

**Why the Preacher's `location_ids` is widened rather than the contacts pinned to its seeded location.** `caller_effective_location_ids()` gives a Preacher only its own `users.location_ids`, and `manage-contacts-table.tsx:525-531` renders `locationNameById.get(id) ?? id` — so a contact pointing at a location the Preacher is not scoped to shows a raw UUID in the cell and breaks the per-column location filter. Widening the union is a fixture-side change that keeps both names resolvable; it is also why the generator must run *after* `pnpm seed:local`, which resets that column.

**Phone range.** `8` + `1` (folk) or `2` (gita-life) + an 8-digit index, so generated phones cannot collide with the seeder's `9000000001-4` and the `(phone, program_id)` unique index stays the idempotency key rather than something the generator has to work around.

**Determinism.** No randomness anywhere in row generation. A re-run must produce byte-identical rows, which is what lets the generator select existing rows by `(program_id, name like 'preview-fixture-bulk-%')` and insert only the difference instead of upserting — upserting would silently revert a name a story-4 row edited.

## Verification

**Commands:**
- `pnpm seed:bulk-local` -- expected: exit 0, `Total created: 250` (or `0` when the rows already exist), the request count, and `DW-3 check passed: …`.
- `pnpm seed:bulk-local` (immediately again) -- expected: `Total created: 0`, proving idempotence.
- `pnpm test:e2e` -- expected: exit 0, the new `bulk-fixtures.spec.ts` rows included and `globalSetup` reporting the generator's own output.
- `pnpm test:seed-local-guard` -- expected: unchanged, proving the `seed-local-fixtures.mjs` refactor moved no behaviour.
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.`
- `pnpm lint` -- expected: the same pre-existing `24 problems (12 errors, 12 warnings)`, none in `scripts/bulk-contact-fixtures.mjs`, `e2e/`, or `playwright.config.ts`.
- `pnpm exec tsc --noEmit` -- expected: 0 errors outside generated `.next/**/types/validator.ts`.
- `git diff --stat 1dd7dc70 -- scripts/verify-monorepo-guardrails.mjs` -- expected: empty.

**Manual checks:**
- `pnpm seed:bulk-full`, then sign in as the seeded Preacher on `http://localhost:3000/manage?view=contacts` and confirm the Location column shows names (not UUIDs) and the grid carries more than 1,000 rows. Every tenth generated row is assigned to the Admin, so 1,052 tagged rows resolve to 947 in-scope + 105 out-of-scope.
- `pnpm seed:preview-fixtures --wipe && pnpm seed:bulk-local` -- expected: the generator recreates the full set from scratch, which is the only proof the seeder's `--wipe` filter really covers the generated rows.


## Auto Run Result

Status: done

### What this pass was

A **follow-up review pass** on a `done` spec: no re-implementation, no
loopback. Four review layers re-read the same diff (`408b005..worktree`, 171 KB)
independently and returned 39 findings, all triaged in
`### 2026-10-08 — Follow-up review pass` — 3 medium, 30 low, 6 false, no high.
Two of the three medium findings were real defects in this story's own test
surface and both were patched; the third was carried unchanged from the first
pass. 11 entries were patched, none touching the generator's behaviour.

### Patches applied (11 entries: 2 medium, 9 low)

| Finding | Fix |
|---|---|
| **medium** — the `--count existing+55` row grew the shared folk set by 55 rows every run, never restoring | Moved to `OTHER_PROGRAM` with a `finally` wipe, the pattern its three neighbours already use. Folk measured **305 rows across two consecutive `pnpm test:e2e` runs** after the fix (it would have been 360) |
| **medium** — `contactsMatchingSeederFilter` was an unpaged select against `[api] max_rows = 1000` | Paged at 1,000, like the generator's `collectPaged`. Measured at `seed:bulk-full` volume: the old read returned **1,000 of 1,054** rows |
| **low** — `STATUS_COMMAND` / `STATUS_TIMEOUT_MS` exported for a caller that did not exist; the pin asserted nowhere | `scripts/verify-seed-local-guard.mjs` imports both and asserts the exact argv and a finite timeout. Mutation-checked (unpinning turns it red) |
| **low** — `playwright.config.ts`'s `globalSetup` unasserted, and every row spawns the generator itself so deleting the key stays green | Offline row reading the config, mirroring the `package.json` wiring row. Mutation-checked (commenting the key out turns it red) |
| **low** — wipe row mixed Postgres and ICU collations | Both sides mapped to names and sorted in one collation. The first attempt also compared `id`s and **failed the suite** — the restore re-inserts rows, so "restored" means the same names |
| **low** — `SEEDER_TAG` exported and unused while four seeder-tag literals were hard-coded | All four now derive from `SEEDER_TAG` |
| **low** — `--program both` row hard-coded a delta of 10 | `Math.max(0, perProgram - otherBefore)`, plus the split claim read off the generator's own `10 row(s) each` banner |
| **low** — a stale "index 3 / ≥4" threshold comment | Corrected to index 9 / `MIN_INDEXES_FOR_OUT_OF_SCOPE = 10`; Spec Change Log 3 annotated as superseded, its text left as the historical record |
| **low** — an empty section header left where the seeder-`--wipe` row was removed | Deleted |
| **low** — the two override rows asserted the literal `Invalid API key` | Accepts transport failures too; the guard-bypass assertions are unchanged |
| **low** — the guide's bulk section documented neither override route | Paragraph added |

**Nothing was deferred.** The `deferred:` list stays empty. Three findings were
carried from the first pass's log unchanged (the seeder-`--wipe` coverage gap, the
shared generated set as declared fixture rather than residue, and the unguarded
`SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` disagreement in the fixture reader) —
same location, same claim, code still reading as the logged rows describe, so
their verdicts and routes stand and none was re-actioned.

### Verification performed

Every command in `## Verification`, run against the live local stack:

| Command | Result |
|---|---|
| `pnpm seed:bulk-local` | exit 0 — `Total created: 0` on a warm set, `Insert requests: 0`, `DW-3 check passed: …`, 305 tagged rows / 305 distinct names / 275 in-scope + 30 out-of-scope |
| `pnpm seed:bulk-local` (again) | exit 0 — `Total created: 0` |
| `pnpm test:e2e` | **53 passed** (1.9 m), including the two new/rewritten rows |
| `pnpm test:seed-local-guard` | `seed-local guard verification passed.` — now 2 assertions longer |
| `pnpm guardrails` | `Monorepo guardrails passed.` |
| `pnpm lint` | the same pre-existing `24 problems (12 errors, 12 warnings)`, none in the files this story owns |
| `pnpm exec tsc --noEmit` | 0 errors outside generated `.next/**/types/validator.ts` |
| `pnpm seed:bulk-full` (manual) | 1,052 tagged rows — 947 in-scope + 105 out-of-scope, 747 inserted over **3 PostgREST requests in 2.9 s**, `Insert requests: 3` |
| `playwright test -g "every name carries\|Wipe:"` at 1,052 rows | 5 passed — the two rows the `max_rows` truncation would have broken |
| `playwright test -g "wires globalSetup"` with the key removed | 1 failed, as intended (mutation check) |
| `pnpm test:seed-local-guard` with the pin un-pinned | the new assertion turns red (mutation check) |

After the perf run the stack was returned to the default volume: `seed:bulk-local
--wipe` removed 1,057 bulk-tagged rows, `pnpm seed:bulk-local` recreated 250 with
`Total created: 250`.

### Residual risks

- **The seeder's batched `--wipe` still has no automated coverage** — carried
  forward, unchanged, for the reason the orchestrator recorded: it re-mints
  `auth.users` UUIDs and invalidates the run's `storageState` files.
  Acceptance Criterion 2 rests on the orchestrator's manual run, documented in
  `docs/development-guide.md`.
- **Acceptance Criterion 3's UI half** is a precondition plus a recorded live
  probe (`GET /manage?view=contacts` at 1,052 rows as the Preacher and as the
  Admin, both 200, all five bulk location names rendered, no raw-UUID fallback —
  recorded in this file's Auto Run Result at commit `c198058`). This pass
  re-generated at that volume but did not re-run the browser probe.
- **Acceptance Criterion 1's clean-database half** is not asserted by a row:
  `globalSetup` generates before any test runs, so observing it would mean wiping
  the shared set mid-suite. This pass did observe it by hand instead — after
  `seed:bulk-local --wipe` removed 1,057 rows, `pnpm seed:bulk-local` reported
  `Total created: 250`.
- **The rows that mutate shared state rely on file-level ordering.** Safe today —
  `fullyParallel: false` keeps tests inside a file in one worker whatever the
  worker count, and the only other spec files are offline — but nothing asserts
  it, and a future spec file that touches the same rows would race them. Story 5's
  determinism work owns making that explicit.
- The first pass's own record of this work (its measured numbers, the
  requirement-to-landing table and the per-file change list) is in this file's
  Auto Run Result at commit `c198058`; this entry supersedes it.

### Follow-up review recommendation

**`false`.** This was a follow-up pass, where the bar is a patched `high`: none
was found — 0 high, and the two medium findings were both in the spec file's own
assertions rather than in shipped behaviour. Patched this pass: 2 medium, 9 low.
The work has converged; the residual risks above are recorded rather than open.
