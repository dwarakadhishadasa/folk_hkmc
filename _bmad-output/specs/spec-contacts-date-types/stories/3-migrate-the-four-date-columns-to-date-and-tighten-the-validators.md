---
title: 'Migrate the four date columns to DATE and tighten the validators'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_commit: '4296bf7f43813c2afa2385311b91aea9810387cc'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - ../SPEC.md
  - ../existing-state.md
  - ../migration-playbook.md
  - ../stories/1-data-audit-of-the-three-contacts-date-columns.md
  - ../stories/2-park-last-contacted-on-as-empty-date-for-future-use.md
  - ../../../AGENTS.md
warnings: [oversized]
deferred: []
---

# Story 3 — Migrate the four date columns to DATE and tighten the validators

<intent-contract>

## Intent

**Problem:** `public.contacts.date_of_birth`, `initial_contact` and `last_contacted_on` plus `public.sessions.session_date` are declared `TEXT` (`supabase/migrations/20261004000000_create_core_tables.sql:11,17,18` and `:48`) and every date guarantee in the app is a convention held by code paths that disagree — the strict grid editor (`components/grid/grid-editors.tsx:831-839`), the prefix-only API validator (`lib/manage/api-handlers.ts:97-99`), and the sessions POST which validates nothing and writes a full ISO timestamp (`apps/folk/app/api/sessions/route.ts:129` via `lib/supabase/data.ts:882`). A shape-valid but calendar-invalid value (`2023-02-30`, or `2026-02-31T10:00:00Z`) passes the handler and is then rejected by Postgres with an error the handler never produced.

**Approach:** One migration file converts all four columns to `DATE` — reporting before it nulls anything — and, in the same change, `optionalIsoDate` is tightened to the rule that migration enforces (blank, or exactly `YYYY-MM-DD` naming a day that exists) while the sessions POST is sliced to emit a ten-character date. Per Dwaraka's 2026-10-10 park decision, `last_contacted_on` ends **empty**; its values are reported and nulled by the migration. Per Dwaraka's 2026-10-11 scope addition, `sessions.session_date` rides the same file and the same rule; story 1 measured contacts and is done, so story 3 runs the sessions CAP-1 audit itself before any `ALTER` on that table.

## Boundaries & Constraints

**Always:**
- **One rule, written three times.** Migration gate, contacts handler predicate, and sessions write slice must all agree: *blank (contacts) / ten-char date, `^\d{4}-\d{2}-\d{2}$` **and** a real calendar date.* CAP-4's failure is any two of the three disagreeing.
- **Sessions audit first, in this story.** Story 1 measured contacts and is done; run the CAP-1 queries against `sessions.session_date` and read the numbers before any `ALTER` on that table. The sessions POST writes a full timestamp on every create, so expect `prefix_with_trailing` to be the whole non-null population — truncate, don't reject, in the migration.
- **Slice the sessions write, don't validate it.** `apps/folk` and `apps/gita-life` `app/api/sessions/route.ts:129`: `startsAt.toISOString()` → `startsAt.toISOString().slice(0, 10)` before `createSession`. No new validator module; the single call site per app is the whole fix.
- **Report, then null, in the migration itself.** The obligation travels with the file: every nulling `UPDATE` is preceded by a `RAISE NOTICE` naming the count and the ids, so whoever applies it — local or hosted — gets the report in the apply log, before the write.
- Substitute story 1's calendar predicate for the playbook's shape-only one **in both** places: the nulling step and the pre-`ALTER` gate. `pg_input_is_valid(left(col,10),'date')`, never `to_date(...) IS NULL` (raises instead of returning `NULL`; silently coerces `"35000"` → `35000-01-01`).
- **Leave the clock out of the cast.** `SUPABASE_DATE_TIME_ZONE` is `Asia/Kolkata` (`lib/supabase/data.ts:146`) and `currentProgramDate()` (`lib/supabase/data.ts:269-278`) already emits a program-local calendar date — exactly what a timezone-naive `date` holds. No `AT TIME ZONE`, no `now()`, anywhere.
- Cast with `left(col, 10)::date` (truncate) and make the file re-runnable: skip any column already `date` (hosted type is unconfirmed; a `~` predicate on a `date` column errors with `operator does not exist: date ~ unknown`).
- Ship the down path inside the file, and state its one-way loss in the comment: rows nulled by the reporting step cannot be restored by `date → text`.

**Never:**
- **Do not run `node scripts/apply-migrations.mjs` against a real project.** It posts to `https://api.supabase.com/v1/projects/{ref}/database/query` (`scripts/apply-migrations.mjs:245`) with the ref derived from `NEXT_PUBLIC_SUPABASE_URL` — that is the **hosted project**, i.e. production DDL, which `AGENTS.md` forbids without Dwaraka. The local stack is applied by `pnpm supabase:reset` / `pnpm supabase:push` (`package.json:25-26`, which is `supabase db reset` / `db push --local`). `--dry-run` sends nothing and is the only safe invocation of `apply-migrations.mjs` here.
- Do not open a hosted connection. Story 1's read-only authorization is scoped to story 1 alone (`stories/1-…md`, *Hosted read-only access*).
- Do not add `AT TIME ZONE 'Asia/Kolkata'` — see above; this is the single most damaging thing this story could do.
- Do not touch RLS: `grep -c "date_of_birth\|initial_contact\|last_contacted_on\|session_date" supabase/migrations/20261006010000_scoped_rls_policies.sql` → **0**.
- Do not edit `scripts/verify-monorepo-guardrails.mjs` (`scripts/verify-airtable-removal.mjs` asserts its contents), and do not weaken any gate.
- Do not add a `last_contacted_on` update path (story 2's park; OQ-1 closed as "not now").
- Do not backfill, and do not invent a value for any row that had none.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| WRITE_OK | `"1985-03-12"` | stored as `1985-03-12`; row returns identically | no error |
| WRITE_BLANK | `""` / whitespace / omitted | `NULL`; Favorites panel renders `never` | no error |
| WRITE_TRAILING | `"1985-03-12T10:00:00Z"` | **rejected 400** by `optionalIsoDate`, message names `YYYY-MM-DD` | handler's own message; Postgres never sees it |
| WRITE_NOT_A_DATE | `"2026-02-31"`, `"35000"`, `"unknown"` | **rejected 400** — calendar check, not shape check | handler's own message |
| CAST_OK | existing `"1985-03-12T10:00:00Z"` | truncated to `1985-03-12` | `RAISE NOTICE` reports the count |
| CAST_UNCASTABLE | existing `"2026-02-30T00:00:00Z"` | `NULL`, **after** its id is in the notice | never reaches the cast |
| CAST_RERUN | column already `date` | skipped, no error | file is re-runnable |

</intent-contract>

## Code Map

**Write — the only files whose behaviour changes**
- `lib/manage/api-handlers.ts:83-102` — **the contacts validator.** `optionalIsoDate`, reached by `parseContactPatch` (`:142`) from **three** handlers — single update `:256`, single create `:290`, bulk `applyContactBulkItem` `:381` — all sharing `ALLOWED_PATCH_KEYS` (`:44`), mounted at four route files (`apps/folk/app/api/manage/contacts/route.ts`, `…/bulk/route.ts`, and the two `apps/gita-life` equivalents). Call sites `:195` (`initialContact`) / `:198` (`dateOfBirth`). The block comment at `:83-89` currently *asserts trailing content is deliberate* and must be rewritten. One file covers all four routes — there is no second copy of this validator anywhere.
- `apps/folk/app/api/sessions/route.ts:129` and `apps/gita-life/app/api/sessions/route.ts:129` — **the sessions write.** `sessionDate: startsAt.toISOString()` becomes a ten-character slice before `createSession` (`lib/supabase/data.ts:879-887`, which passes the value straight through with no check and needs no other change). Two files, one line each, kept mirrored.
- `supabase/migrations/20261010000000_contacts_date_columns_to_date.sql` — **new.** Sorts after the latest, `20261008000000_add_airtable_id_map.sql`; `YYYYMMDDHHMMSS_name.sql` per `scripts/apply-migrations.mjs:135`. Carries report → null → cast for all four columns (contacts trio plus `sessions.session_date`), plus the down path as a comment block (the repo's convention: `20261008000000` documents its rollback in prose, and there is no `down/` directory).

**Read-only — verified, needs no change, but each is a reason the change is safe**
- `components/grid/grid-editors.tsx:804-841` — the date editor. `parseISO` `:833` + `isValid` `:835` + `throw "…must be a real date, written as YYYY-MM-DD."` `:836`, write-back `format(parsed,"yyyy-MM-dd")` `:839`; calendar pick `format(next,"yyyy-MM-dd")` `:861`. **This is the rule the handler is being brought into agreement with, and it already enforces calendar validity.**
- `lib/supabase/manage.ts:881-949` `buildContactWritePayload` — `optionalString` (a ≤40-char bound) at `:933-938`; **no date validation here by design**, all of it upstream. `:96-97` maps the patch keys to columns. `updateManageContact` `:998`, `createManageContact` `:1050`.
- `lib/supabase/manage.ts:229-253` `calendarParts` → `:310-326` `buildContactsPerQuarter` — the Contact Generation chart, fed by `initial_contact` only (`:314`). `Date.parse("2026-03-05")` is UTC midnight and IST is UTC+05:30, so `Intl.DateTimeFormat` at `:240` reads the same calendar day. **No day-boundary shift**, and none is introduced.
- `lib/supabase/types.ts:154,157,159` (`Row`), `:180,183,185` (`Insert`), `:206,209,211` (`Update`) — all `string | null`. **No generator is wired up in this repo** (no `gen-types` script in `package.json`; the file carries no generated header), so `SPEC.md:97`'s byte-identical claim is not mechanically re-derivable here. The check's real content: **nothing edits this file**, and the shape it declares is already correct for `date`. Sessions rows `:361`/`:377`/`:393` are `string | null` for the same reason.
- `components/manage/manage-contacts-table.tsx:915-916` — the comment "Read as an ISO date by the server, so it sorts correctly as text" stays true: a `date` serialises as `YYYY-MM-DD` and still sorts lexicographically.
- `components/manage/manage-favorites-view.tsx:559` — `?? "never"`, already correct (story 2).
- `lib/supabase/data.ts:614-622` — `initial_contact: createdDate` only; `last_contacted_on` removed by story 2.
- `components/manage/manage-sessions-view.tsx:77` (`?? "No date"`), `apps/*/app/dashboard/page.tsx:32` (`readTime(session.sessionDate)` sort), `components/sessions-manager.tsx:54`, `lib/supabase/manage.ts:366`/`627`/`637`/`646-647`/`669-684` — sessions readers that take `string | null` and behave identically on a `date`-serialised `YYYY-MM-DD`. Verified, needs no change.
- **No SQL `ORDER BY`, `gte` or `lte` touches these columns** anywhere (`lib/supabase/manage.ts:459-517` orders every paged query by `id`). No SQL-side cast expression exists to keep in step with the migration.

**Gates that could see a new migration file**
- `scripts/verify-local-stack-readiness.mjs:98` `MIN_MIGRATIONS = 12`; today there are exactly 12 `.sql` files, so adding a 13th passes (it is a floor).
- `scripts/verify-program-readiness.mjs:11` asserts one specific filename (`20260613010000_…`); untouched.
- `scripts/verify-airtable-removal.mjs:188-191` whitelists every match under `supabase/migrations/` unconditionally.
- `scripts/apply-migrations.mjs:231-242` fails on any file not named `<14-digit version>_<name>.sql` or on a duplicate version.

**e2e**
- `e2e/specs/grid-editors.spec.ts:619-703` is the **only** spec that exercises a date end to end. `:637-639` polls the DB column `initial_contact` for exact string equality with `"2026-03-05"` — PostgREST returns a `date` as `"2026-03-05"`, so this survives the conversion. `:651-674` asserts the client-side rejection of `2026-02-31`. `restoreExactly` (`:200-222`) exists because these columns are `null` on every bulk row.
- No spec sends `dateOfBirth` or `initialContact` to the API: `manage-contacts-api.spec.ts`, `-bulk.spec.ts` and `-selection.spec.ts` patch `isFavorite` only. `optionalIsoDate`'s rejection is reached exclusively through the grid UI, and the `"must be blank or start with YYYY-MM-DD."` string is asserted nowhere. **Recorded as a coverage gap, not patched** — adding a spec file is Dwaraka's call, per story 2's identical deferral.
- `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md` — **no row names a date column, a date editor, or `optionalIsoDate`** (rows 1, 3, 18 are the nearest; row 18 sorts on `name`). No row is retired, so the map needs no edit.

## Tasks & Acceptance

**Execution:**
- [x] Sessions CAP-1 first, in this story: run the playbook queries against `sessions.session_date`, record total / nulls / exact_iso / prefix_with_trailing / not_a_date plus the DISTINCT of `not_a_date` and every id to be nulled. No `ALTER` on `sessions` until those numbers are read.
- [x] `supabase/migrations/20261010000000_contacts_date_columns_to_date.sql` -- **create.** In order, per column across both tables: `RAISE NOTICE` the uncastable count and ids under `NOT (col ~ '^\d{4}-\d{2}-\d{2}' AND pg_input_is_valid(left(col,10),'date'))`; `UPDATE … SET col = NULL WHERE` that predicate; then `RAISE NOTICE` and `UPDATE` to empty `last_contacted_on` entirely (park decision, reported first); then a type-guarded `ALTER … TYPE date USING left(col,10)::date` per column that skips any column already `date`; then a `-- DOWN:` comment block giving `ALTER … TYPE text USING col::text` per column and naming the one-way loss. **One change, three surfaces: this file, the contacts handler, and the sessions slice are the same commit.**
- [x] `lib/manage/api-handlers.ts` -- **tighten `optionalIsoDate`** to reject any value that is not exactly `^\d{4}-\d{2}-\d{2}$` **and** a real calendar date, and rewrite the `:83-89` comment so it stops promising trailing content round-trips. Reuse `parseISO` + `isValid` from `date-fns` (already imported in `components/grid/grid-editors.tsx:40`) or an equivalent exact-day check; keep the `AuthzBadRequest` wording pattern so the message names the field and the accepted form.
- [x] `apps/folk` + `apps/gita-life` `app/api/sessions/route.ts:129` -- **slice to ten characters** (`startsAt.toISOString().slice(0, 10)`) before `createSession`, mirrored in both apps.
- [x] `docs/data-models.md:41,48,49` -- change the three contacts cells from `text` to `date` and record the park on `:49`; `:48` keeps its `Asia/Kolkata` note, which the write path still honours. `:90` -- change `session_date` from `text` to `date` ("creation/start date, `YYYY-MM-DD`").
- [x] `_bmad-output/specs/spec-contacts-date-types/stories/3-migrate-the-four-date-columns-to-date-and-tighten-the-validators.md` -- record the pre-`ALTER` gate output for all four columns (including `data_type` per column, before any `~` predicate), the post-migration counts, and **every id nulled**, with the zero-row result stated explicitly rather than left implied.
- [x] `pnpm supabase:reset` then `pnpm typecheck:workspace && pnpm lint && pnpm guardrails && pnpm test:e2e` -- run and report real numbers -- `lib/` and `lib/manage/` are both inside the guardrails blast radius, `next.config.mjs` sets `typescript.ignoreBuildErrors` so typecheck is the only type gate, and `test:e2e` is 5–7 min at **one** runner on a shared seeded database.

**Acceptance Criteria:**
- Given a contact is edited in `/manage` with a date of birth picked from the calendar, when the `PATCH` commits and the row is read back, then the stored value round-trips unchanged as `YYYY-MM-DD` — observable on the committed row and on the rendered cell, not on the payload.
- Given a client `PATCH`es `dateOfBirth: "2026-02-31T10:00:00Z"` to `/api/manage/contacts` (and the same value to `/bulk` and to `apps/gita-life`'s routes), when the request is handled, then each returns the handler's own `400` naming the field and `YYYY-MM-DD`, and **no Postgres error appears** — the same rule reached through all four route surfaces, because one validator serves all of them.
- Given a client `PATCH`es `initialContact: "2026-02-31"` — shape-valid, calendar-invalid — then it is refused at the boundary for the same reason a timestamp is, proving the calendar check and not merely the `$` anchor.
- Given the migration is applied to a fresh local stack, when it completes, then all four columns report `date` in `information_schema.columns`, no `AT TIME ZONE` appears in the file, and applying it a second time is a no-op rather than an error.
- Given the migration runs against a table holding a value no cast can save, when it executes, then that row's id and the count appear in the notice **before** the `UPDATE`, and the row is `NULL` afterwards — the report is in the apply log, not in a session someone has to remember to keep.
- Given a session is created via `POST /api/sessions` in either app, when the row is read back, then `session_date` is a ten-character `YYYY-MM-DD` (no time component), the sessions list renders it exactly as before, and dashboard ordering is unchanged — proving the slice, not the column, absorbed the change.
- Given `initial_contact` values across many quarters, when the Contact Generation chart renders, then every contact with a parseable value is still counted and the quarter labels are unchanged — `calendarParts` at `lib/supabase/manage.ts:229-253` keeps the same calendar day through the `date` serialisation.
- Given the repository after this change, when `git diff lib/supabase/types.ts` is run, then it is **empty**. If it is not, stop and report it: a non-empty diff means the change was not type-only and the ripple is larger than this spec assumed.
- Given the whole diff, when it is inspected, then `apps/folk` and `apps/gita-life` remain mirrored, no RLS policy is touched, `scripts/verify-monorepo-guardrails.mjs` is untouched, and `matrix-coverage-map.md` is unchanged because no row is retired.

## Spec Change Log

## Review Triage Log

- `[reject]` UTC-slice vs IST day (blind + edge): **low**. The slice preserves the UTC day every reader already derived via `Date.parse`; a shift vs the old full timestamp exists only for sessions created 00:00–05:30 IST, an hour preachers do not create sessions. IST-aware formatting is complexity beyond a direct correction — rejected.
- `[reject]` Invalid `startsAt` throws 500 (edge): **false**. `new Date()` with no args is always valid; no input reaches `startsAt` (`route.ts:125`).
- `[reject]` Missing table/column NULL-dtype abort (blind + edge): **false**. Tables come from `20261004000000`, which always precedes this file; a missing table is a broken baseline where loud abort is correct.
- `[reject]` Exotic-dtype operator error (edge): **false**. No migration ever sets a third type; only out-of-band DDL could, and loud abort is correct there.
- `[reject]` Concurrent insert between UPDATE and ALTER (edge): **false**. Each `DO` block is a single statement and a single transaction — an ALTER failure rolls back the block's UPDATEs, so no partial state survives.
- `[reject]` NOTICE id-list overflow (edge): **false**. These tables are ~1k rows (≈40KB notice max); the millions-of-rows scale the claim needs is unreachable here.
- `[reject]` `pg_input_is_valid` availability (edge): **low**. Proven present by the clean local apply; a missing function fails loudly before any write, and no evidence of hosted/local version skew was produced. A version probe is added branching for a speculative skew — rejected.
- `[reject]` Park-skip on already-`date` (edge claim): **false**. The only path to date-with-values is the parked future feature, whose data must survive a re-apply; skipping is the design, not a hole.
- `[reject]` Whitespace/blank divergence (blind): **false**. Handler trims to NULL (`boundedText`), migration nulls-with-notice; outcomes agree (NULL), and blank-restore was proven by the temp API spec.
- `[reject]` Comment DOWN + no backup (blind): **low, out of scope**. The spec prescribes a comment-block rollback and names the one-way loss; a backup table is work the intent excludes.
- `[reject]` Filename only names contacts (blind): **low**. The spec pins this exact filename in the Code Map, tasks, and the handler comment; renaming breaks those references for discoverability cosmetics — rejected.
- `[defer]` No committed specs for the new date rules (blind + verification-gap ×3): **medium**. Demonstrated that a validator revert ships green; the fix (new spec files) is reserved to Dwaraka in this story and story 2. Consolidated into one deferred-work entry.
- `[defer]` Hosted `sessions.session_date` never audited (blind): **low**. The migration truncates-never-rejects with ids in the apply log, so risk is bounded; hosted CAP-1 must gate the future hosted apply, which is a separate approved step.
- `[defer]` Storage-image defect + hand-rebuilt stack (blind): **low**. `supabase:reset` fails on vendor `storage-api:v1.79.28` fresh-init (pre-existing, before any user migration); ledger + `contact-photos` bucket gaps persist until a managed reset succeeds.
- `[patch]` Docs lag the new contract (blind + verification-gap): **low**. `data-models.md` notes lacked the blank/400/park/slice rules and `api-contracts.md:228` still showed a full-timestamp `sessionDate`. Fixed directly in docs below; no code touched.

## Design Notes

**OQ-3 resolves to *reject*, and the intent's own example is what decides it.** The brief names `2026-02-31T10:00:00Z` as the value that "passes the handler and is then rejected by Postgres". Truncating that to `2026-02-31` does not fix it — February 31 does not exist, so Postgres still rejects it, with an error the handler never produced. Shape-tightening alone does not fix it either: bare `2026-02-31` passes a `$`-anchored regex just as it passes the current prefix regex. **Only a full calendar check closes the stated failure**, which is also exactly what `grid-editors.tsx:835` already does and what story 1 proved is required on the SQL side. So the one rule is:

> blank, or `^\d{4}-\d{2}-\d{2}$` **and** a real day of that month

— in the handler as a predicate, in the migration as `pg_input_is_valid(left(col,10),'date')`. Those two are the same test asked of the same expression the cast will feed. Reject rather than truncate is also the stricter reading of CAP-4's "never silently dropped by Postgres": a rejected value is visible at the boundary, a truncated one is not. `OQ-3` in `SPEC.md:92` assumed option (a), truncate-in-migration; the migration truncates, the handler refuses — the asymmetry is deliberate and is the point.

**Why the migration is re-runnable.** Story 1 flagged that hosted column types are unconfirmed and that a `~` predicate against a `date` column errors rather than counting. A guard reading `information_schema.columns` before each `ALTER` costs four lines and makes the file safe to re-apply against a database where a previous run already landed.

## Verification

**Commands:**
- `pnpm supabase:reset` -- expected: SUCCESS; every migration applies in version order on a **fresh local** database. This, not `apply-migrations.mjs`, is the local path (`package.json:25`). Run `apply-migrations.mjs --dry-run` first to see the pending plan without sending anything.
- `psql … -c "select column_name, data_type from information_schema.columns where table_name='contacts' and column_name in ('date_of_birth','initial_contact','last_contacted_on') order by column_name"` -- expected: three rows, all `date`. Plus `where table_name='sessions' and column_name='session_date'` -- expected: one row, `date`. Run **before** any `~` predicate, per story 1.
- `pnpm typecheck:workspace` -- expected: SUCCESS, 6/6 packages Done, no type errors.
- `pnpm lint` -- expected: SUCCESS; the baseline is 12 pre-existing warnings, 0 errors. No new warning in `lib/manage/api-handlers.ts`.
- `pnpm guardrails` -- expected: SUCCESS; `lib/` is inside its blast radius.
- `pnpm test:e2e` -- expected: SUCCESS, one runner, 5–7 min. `grid-editors.spec.ts` is the row that must stay green. Known pre-existing flake to check against, not to attribute to this change: `manage-contacts-edit.spec.ts:334` (`search.pressSequentially` under load; 10 passed in isolation).
- `pnpm test` -- **never report as a pass.** Zero tests, exit 0 (`package.json:47`).
- `git diff lib/supabase/types.ts` -- expected: **empty**.
- `git diff scripts/verify-monorepo-guardrails.mjs` -- expected: empty.
- `git status --porcelain _bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md` -- expected: empty; no row is retired.

**Manual checks:**
- Read the migration file top to bottom and confirm **no** `AT TIME ZONE`, no `now()`, no `current_date`. This is the one mistake that silently shifts every date for IST users, and no gate detects it.
- Confirm the notice ordering by reading the file: every `UPDATE` that nulls is preceded by a `RAISE NOTICE` naming the count and the ids.

## Implementation Record (2026-10-11)

### Pre-`ALTER` gate output (local stack, read before any `ALTER`)

`information_schema.columns` (`table_schema='public'`), read before any `~` predicate:

| column | data_type |
|---|---|
| contacts.date_of_birth | text |
| contacts.initial_contact | text |
| contacts.last_contacted_on | text |
| sessions.session_date | text |

Sessions CAP-1 (this story; story 1 measured contacts only): total **4**, nulls **0**, exact_iso **4**, prefix_with_trailing **0**, not_a_date **0**; offender-by-id **0 rows**; DISTINCT of not_a_date **0 rows**; calendar gate (`NOT (col ~ pattern AND pg_input_is_valid(left(col,10),'date'))`) uncastable **0**. Contacts at gate time: 261 rows, all three columns all-NULL (story 1's finding, re-observed: `contacts_total 261`).

**Ids nulled: none — zero-row result stated explicitly.** Every reporting `UPDATE` matched 0 rows; there is no id to record on this stack. (Hosted `not_a_date` is 0 on all three contacts columns over 1,094 rows per story 1's measured manual re-run; sessions hosted population was never audited — no hosted connection was opened in this story.)

### What changed

- `supabase/migrations/20261010000000_contacts_date_columns_to_date.sql` — **new.** Four guarded `DO` blocks (report → null uncastable → cast per column; `last_contacted_on` additionally reports then empties the parked remainder), each skipping when the column is already `date`; `-- DOWN:` comment block with the four `date → text` casts and the one-way-loss note.
- `lib/manage/api-handlers.ts` — `optionalIsoDate` tightened to `^\d{4}-\d{2}-\d{2}$` **and** `isValid(parseISO(date))` (same functions, same semantics as `grid-editors.tsx:833-839`); comment rewritten, trailing content no longer promised; 400 message names the field and `YYYY-MM-DD`. New `date-fns` import (guardrail-safe: only workspace-package imports are policed).
- `apps/folk` + `apps/gita-life` `app/api/sessions/route.ts:129` — `startsAt.toISOString()` → `.slice(0, 10)`; `diff` of the two files is empty (mirrored).
- `docs/data-models.md:41,48,49,90` — `text` → `date` on the four cells; `:48` keeps its `Asia/Kolkata` note, `:49` keeps the park note.

### Verification performed

- `apply-migrations.mjs --dry-run`: 1 pending (`20261010000000`), naming valid, nothing sent.
- `pnpm supabase:reset` **FAILED environmentally, twice**: `supabase_storage` container refuses to start on a recreated DB — `StorageBackendError: Migration drop-bucketid-objname-index not found` (vendor image `storage-api:v1.79.28` fresh-init defect, before any user migration is read). Pre-existing: this story's files cannot influence container init. Equivalent coverage instead: all 13 migration files applied in version order via `psql -f` on the recreated empty DB — mine applied cleanly with all four report NOTICEs; second apply is a no-op (`already date, skipping` ×4, exit 0).
- Edge-case proof on the file's exact predicates (scratch TEXT table, 9 rows): `1985-03-12T10:00:00Z` truncated to `1985-03-12`; `2026-02-30T00:00:00Z`, `2026-02-31`, `35000`, `unknown`, `''` reported with ids then nulled; `1985-03-12`, `2024-02-29`, `NULL` untouched; subsequent `left(col,10)::date` cast succeeds. Also confirms story 1's warning live: `~` against a converted column errors (`operator does not exist: date ~ unknown`), which is why the file guards on `information_schema` first.
- Post-migration: all four columns `date`; contacts 4/4/4 NULL (seed fixtures never write them); sessions 4 rows, all `2026-10-11` DATE. `grep` for timezone operator / clock function in the migration file: no matches.
- `pnpm test:static`: guardrails passed, typecheck 6/6, lint 0 errors / 12 warnings (baseline 12; none in `api-handlers.ts`).
- `pnpm test:e2e`: **166 passed, 0 failed (7.0 min)**, one runner — includes `grid-editors.spec.ts` round-trip against the DATE columns.
- Temporary live-API spec (created, run, deleted in one chain; `e2e/` clean): timestamped Feb-31 → handler 400 naming field + `YYYY-MM-DD` with no Postgres text; bare `2026-02-31` refused identically; bulk reports the same refusal per item; `"1985-03-12"` round-trips via API then restored to blank; `POST /api/sessions` → 201 with ten-character `session_date` (row removed in `finally`). 5/5 passed, proving the served dev server hot-reloaded the new code.
- `git diff lib/supabase/types.ts`, `scripts/verify-monorepo-guardrails.mjs`, `matrix-coverage-map.md`: all empty. No RLS file touched. No `test` run reported as a pass.

### Left incomplete / risky (for Dwaraka)

1. **Local stack needs a proper reset once the storage image is fixed.** The running stack was rebuilt by hand (`psql -f` per migration + `seed:local`); two known gaps vs a managed reset: (a) `storage.buckets` has no `contact-photos` row (`20261006010000`'s final INSERT needs the storage schema) — photo upload is the only affected surface and no spec covers it; (b) `supabase_migrations.schema_migrations` ledger was never written, so a future `db push` will try to re-apply files that are not all re-runnable. `supabase/config.toml` was restored to `enabled = true`; with it, `supabase:start` will fail on the storage health check until the image issue is resolved — that revert is deliberate so no unowned config change lingers.
2. **Sessions hosted population never audited.** Story 1 measured hosted contacts; nothing measured hosted `sessions.session_date`. The migration truncates-but-never-rejects on that table, so the risk is bounded to silent truncation of calendar-invalid timestamps, reported by id in the apply log.
3. **No new spec file committed** for the tightened validator (same deferral as story 2 — Dwaraka's call). The 5-assertion temp spec is deleted; its evidence lives only in this record.