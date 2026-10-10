---
title: 'Data audit of the three contacts date columns'
type: 'chore'
created: '2026-10-10'
status: blocked
review_loop_iteration: 0
followup_review_recommended: true
context:
  - ../SPEC.md
  - ../existing-state.md
  - ../migration-playbook.md
warnings: []
deferred:
  - summary: >-
      The hosted half of CAP-1 was authorized and attempted, and the authorized
      connection string does not connect: it points at the Supavisor transaction
      pooler on port 6543 with no tenant identifier, so the pooler refuses the
      connection before authentication. No hosted statement ran and no hosted
      number was measured, so OQ-2 remains undecided.
    evidence: |-
      psql "$HOSTED_AUDIT_READONLY_URL" ... exited 2 with
      FATAL (ENOIDENTIFIER) no tenant identifier provided (external_id or sni_hostname required)
      from aws-0-ap-south-1.pooler.supabase.com:6543. A credential-shape-only parse
      (no values printed) confirms: username carries no "." tenant prefix and the URL
      carries no query parameters, while host, port, database name and password
      presence are all correct. Fix is one of: append ?tenant=<external_id>, use the
      postgres.<project-ref> username form, or point the URL at the direct connection.
      Correction to a credential file is Dwaraka's, not this story's; this run made no
      change to .env.hosted-audit.local and did not fall back to any other credential.
      Full account under "## Hosted audit result" in this file.
    location: >-
      .env.hosted-audit.local (HOSTED_AUDIT_READONLY_URL) — connection routing,
      not the credential itself
    severity: medium
baseline_revision: 6d20168f8f31ba5d4f93749f85e258f5a06901cc
---

# Story 1 — Data audit of the three contacts date columns

**Status: blocked — the hosted audit was authorized and attempted, and the connection was refused.** This run re-derived every local number below from the live local database, from scratch, and inherited no figure from any earlier attempt recorded in this file. It then acted on the standing hosted authorization: it loaded `.env.hosted-audit.local` and **attempted a connection with `HOSTED_AUDIT_READONLY_URL`; the pooler refused it** — the URL points at the Supavisor transaction pooler (`…pooler.supabase.com:6543`) with no tenant identifier, so the connection was terminated before authentication and no session was ever established. Per the authorization's own terms, this run **stopped and re-escalated**. It did not fall back to another credential, did not guess a project ref, and did not substitute the local zeros for hosted numbers.

**So the state is unchanged from the last attempt in one respect and materially different in another:** the local `not_a_date` counts are still zero because every value is `NULL`, not because every value parsed, and **zero offenders over a population that was never populated is not a green light** — but OQ-2 is now blocked on a *broken credential*, not on a *missing authorization*. The approval exists; the connection string does not work yet. No `ALTER` was run; nothing here authorizes one.

## Audit result (CAP-1 — local stack, read-only)

**Re-run in full for this attempt.** Every figure in this section is this run's own output from the local stack, taken from a single `psql -f` invocation; nothing here is quoted from a previous revision of this file. The numbers came out identical to the prior attempt's, which is worth recording as *reproduced*, not as *inherited*. The hosted half of CAP-1 was attempted this run and failed to connect — see *Hosted audit result* below.

Target, read from `pnpm supabase:status` rather than assumed:

```
postgresql://postgres:postgres@127.0.0.1:54322/postgres
PostgreSQL 17.6, current_database = postgres, current_user = postgres
```

Supabase CLI **2.98.2** via `pnpm supabase:status` (= `pnpm dlx supabase@2.98.2 status`).

**Every statement this run issued against the database was a `SELECT`.** No DDL, no DML, no `ALTER`, no fixture regeneration, no schema or configuration change, no write of any kind *to the database*.

Scoped to the database deliberately, because this run did write elsewhere: the `git stash push -u` and its recovery, described under *Verification actually performed*, wrote to the **git index**, not to Postgres. That is a working-copy artefact of this repository and is disclosed there.

### Read-only confirmed after the fact

The read-only claim is not just asserted — it is evidenced by re-reading the database *after* every query above had run. These are before/after observations of the same table:

| Observation | Before the audit queries | After all audit queries and the predicate testing |
|---|---|---|
| `count(*)` from `contacts` | 261 | **261** |
| `count(*)` from `public.airtable_id_map` | 0 | **0** |
| `source` breakdown | `preview-fixture-bulk` 250, *(null)* 7, `preview-fixture` 4 | **identical** |
| `min(created_at)` / `max(created_at)` | 2026-10-08 06:35:22.130229+00 / 2026-10-09 19:44:28.735253+00 | **identical** |
| Non-null values in `date_of_birth` / `initial_contact` / `last_contacted_on` | 0 / 0 / 0 | **0 / 0 / 0** |

Unchanged on every measure. Nothing was written, nulled, created or removed.

### Live declared types

Not read from the migration file — read from the running database:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='contacts'
  AND column_name IN ('date_of_birth','initial_contact','last_contacted_on')
ORDER BY column_name;
```

| column_name | data_type | is_nullable |
|---|---|---|
| `date_of_birth` | `text` | YES |
| `initial_contact` | `text` | YES |
| `last_contacted_on` | `text` | YES |

All three are still `text`. The `ALTER` has not happened.

### Per-column counts

Run verbatim from `migration-playbook.md:18-33`, once per column, against `contacts` with no `program_id` filter (see *Program scope*).

| Column | `total` | `nulls` | `exact_iso` | `prefix_with_trailing` | `not_a_date` |
|---|---|---|---|---|---|
| `date_of_birth` | 261 | **261** | 0 | 0 | 0 |
| `initial_contact` | 261 | **261** | 0 | 0 | 0 |
| `last_contacted_on` | 261 | **261** | 0 | 0 | 0 |

**261 rows hold zero non-null values across all three columns.** The `not_a_date` bucket is empty because the `exact_iso` bucket is empty, because *every* row is `NULL`.

### Offender list by id

`migration-playbook.md:39-43`, run verbatim for each of the three columns, selecting `id, name, <column>`:

| Column | Offenders |
|---|---|
| `date_of_birth` | **0 rows** — `(0 rows)` |
| `initial_contact` | **0 rows** — `(0 rows)` |
| `last_contacted_on` | **0 rows** — `(0 rows)` |

There is no id to record for any column. Nothing to null, nothing to repair by hand.

### `SELECT DISTINCT` of the `not_a_date` values

`migration-playbook.md:49-53`, run verbatim for each column:

| Column | Distinct `not_a_date` values |
|---|---|
| `date_of_birth` | **0 rows** |
| `initial_contact` | **0 rows** |
| `last_contacted_on` | **0 rows** |

**The DISTINCT that would distinguish the two failure modes is empty for all three columns.** The playbook's diagnostic (`migration-playbook.md:55`) separates *long numeric strings* — `text()` stringifying an Airtable **number** field — from *words*, meaning the column was free text in Airtable. **These are different problems with different remediations, and neither is observable here: the query that would tell them apart returns no rows.** So this report can name the mechanism (`migration-playbook.md:55`) but cannot attribute it to this data. Attribution is stated in *Why this is not a green light* below, from the source tree rather than from the data.

### Adjacent check: present-but-blank

Not in the playbook; run because the regex buckets would not catch it. `= ''` alone is not enough — `' '` and `'\t'` survive it — so both forms were run.

**A correction to the previous revision of this section, made after re-running it.** It claimed `btrim(col) = ''` excludes "any whitespace-only string (`' '`, `'\t'`, `'\n'`)". **That was false.** `btrim()`'s single-argument form strips **spaces only**; tab, newline, carriage return, form feed and vertical tab all survive it. Verified live on this stack:

```
postgres=# SELECT v, (btrim(v) = '')                 AS btrim_default,
                   (btrim(v, E' \t\n\r\f\v') = '') AS btrim_wide
          FROM (VALUES (E'\t'), (E'\n'), (' '), (E'  \t '), ('')) AS t(v);
          v     | btrim_default | btrim_wide
          ------+----------------+------------
          \t    | f              | t
          \n    | f              | t
              ' '                t              t
          \t   (2 spaces+tab) | f              | t
                ''             | t              | t
(5 rows)
```

`btrim(E'\t')=''` is **`f`** and `btrim(E'\n')=''` is **`f`** — the single-argument form misses both. The two-argument form with an explicit character class returns `t` for all five. The queries below were therefore re-run with the wide class.

```sql
-- exact empty string
SELECT count(*) FILTER (WHERE date_of_birth = '')     AS dob_blank,
       count(*) FILTER (WHERE initial_contact = '')   AS ic_blank,
       count(*) FILTER (WHERE last_contacted_on = '') AS lco_blank
FROM contacts;
-- dob_blank 0, ic_blank 0, lco_blank 0

-- empty or whitespace-only, btrim() with an explicit whitespace class
SELECT count(*) FILTER (WHERE btrim(date_of_birth,     E' \t\n\r\f\v') = '') AS dob_blank,
       count(*) FILTER (WHERE btrim(initial_contact,   E' \t\n\r\f\v') = '') AS ic_blank,
       count(*) FILTER (WHERE btrim(last_contacted_on, E' \t\n\r\f\v') = '') AS lco_blank
FROM contacts;
-- dob_blank 0, ic_blank 0, lco_blank 0
```

**What this excludes:** the empty string, and any string consisting solely of characters from the space, tab, newline, carriage-return, form-feed and vertical-tab set, in all three columns.

**What this does not exclude:** a non-empty sentinel. `'N/A'`, `'unknown'`, `'none'` or a `'-'` are all non-blank, so `btrim(col, E' \t\n\r\f\v') = ''` misses every one of them — but neither does the regex suite: each of those *would* have been counted in `not_a_date`. The complement of this check is therefore the `not_a_date` bucket above, and between them the two cover every non-`NULL` value: `NULL`, blank/whitespace, or non-blank-and-classified by the regexes.

So for the claim being made here the check is sufficient: the 261 nulls in each column are genuine SQL `NULL`s, and there is no row in these three columns holding a non-`NULL` value of any kind — nothing for a blank to hide behind.

## Why this is not a green light

`not_a_date = 0` is the *whole* decision (`migration-playbook.md:45`), and it is zero. But it is zero over a population that was never populated. Five independent signals, each re-derived this run:

**1. `source` breakdown — no Airtable rows.**

```sql
SELECT source, count(*) FROM contacts GROUP BY source ORDER BY 2 DESC;
```

| source | count |
|---|---|
| `preview-fixture-bulk` | 250 |
| *(null)* | 7 |
| `preview-fixture` | 4 |

Three fixture sources. Nothing from the import.

**2. `public.airtable_id_map` is empty.**

```sql
SELECT count(*) FROM public.airtable_id_map;   -- 0
```

`scripts/migrate-airtable-data.mjs:12-20` documents that ids are generated and persisted **before** the first insert, and the map write at `scripts/migrate-airtable-data.mjs:1128` is an unconditional per-entry insert. An empty map is therefore direct evidence that **the Airtable import has never run against this stack**.

**3. Every row was created inside a single two-day window in October 2026.**

```sql
SELECT min(created_at), max(created_at) FROM contacts;
-- 2026-10-08 06:35:22.130229+00  ..  2026-10-09 19:44:28.735253+00
```

Every one of the 261 rows was created within 37 hours of the others, on 8–9 October 2026. That is what the data shows: **the table was populated in a single burst and has not been touched since.** No claim is made here about when the Airtable import ran — that is not observable from this stack — only that the local rows did not arrive incrementally over a long period, which is what an import of a long-lived production table would look like. The independent proof that the import never ran here is signal 2, not this one.

**4. Adjacent columns *are* populated — the nulls are specific to these columns and these four fields.**

```sql
SELECT count(*) FILTER (WHERE age IS NOT NULL)    AS age,
       count(*) FILTER (WHERE college IS NOT NULL) AS college,
       count(*) FILTER (WHERE notes IS NOT NULL)   AS notes,
       count(*) FILTER (WHERE "year" IS NOT NULL)  AS year_col,
       count(*) FILTER (WHERE phone IS NOT NULL)   AS phone
FROM contacts;
-- age 250, college 84, notes 64, year_col 0, phone 261
```

Read as one generator argument, not five unrelated counts:

- **`phone` 261 / 261, `age` 250 / 261.** `phone` is populated on every row because it is the only other required field in the insert path (`lib/supabase/data.ts:619`), alongside `name`; `age` is present on 250, matching the 250 `preview-fixture-bulk` rows. Both are values a fixture generator supplies because the schema or the generator's shape calls for them.
- **`college` 84, `notes` 64.** Sparse and uneven — the profile of optional fields a generator fills in for some rows to exercise the grid's nullable cells.
- **`year` 0 / 261.** `year` is empty on *every* row even though `age` is populated on 250. That is a generator that writes `age` and not `year`.

`grep -n "\byear\b"` over `scripts/bulk-contact-fixtures.mjs`, `scripts/seed-preview-fixtures.mjs` and `scripts/seed-local-fixtures.mjs` returns **no matches** — so no local generator writes `year` at all, which is what explains the 0 directly rather than by inference. (`grep -c "\bphone\b"` run **per file** on the same three returns **12** for `scripts/bulk-contact-fixtures.mjs`, **7** for `scripts/seed-preview-fixtures.mjs`, and **0** for `scripts/seed-local-fixtures.mjs` — the third writes no `phone` references at all, so the earlier phrasing "returns 12 and 7 on the same files" understated the count of files searched. The two non-zero files do write `phone`, consistent with it being populated on all 261.)

**The point of the row:** the read path is not broken and the table is not empty. `year` being empty across all 261 rows while `age` is populated on 250 is a generator artifact — same category as the three audited columns. It is not a data-quality signal about real contacts, and it is not evidence about the date columns beyond showing that these fields are written by fixture generators that treat them inconsistently.

**5. Neither local fixture generator writes these columns.**

`grep -n "date_of_birth\|initial_contact\|last_contacted_on"` over `scripts/bulk-contact-fixtures.mjs` and `scripts/seed-preview-fixtures.mjs` returns **no matches**. The same grep over `scripts/seed-local-fixtures.mjs`, `scripts/delta-sync-old-project.mjs` and `scripts/apply-migrations.mjs` also returns **no matches**.

**Consequence.** The hazard this story exists to detect **cannot be present here**, because the writer that produces it was never exercised against this database. `scripts/migrate-airtable-data.mjs:532-539`'s `text()` helper returns `String(value)` for a finite Airtable *number*, and it is the writer for all three columns: `date_of_birth` at `scripts/migrate-airtable-data.mjs:661`, `initial_contact` at `:667`, `last_contacted_on` at `:668`. The local fixtures never populate these columns, so that unguarded import path has never run here. The audit's design assumed local data would stand in for imported data. It does not.

**The import is the widest hole, not the only one.** `optionalIsoDate` (`lib/manage/api-handlers.ts:90-102`) validates the **prefix** only — `if (!/^\d{4}-\d{2}-\d{2}/.test(date)) throw` at `:97-99` — so a `PATCH` through `/api/manage` can write `2023-02-30` or `1985-03-12garbage` today, and it is called at `:195` (`initialContact`) and `:198` (`dateOfBirth`). The grid editor is strict by comparison: `components/grid/grid-editors.tsx:833-837` uses `parseISO` + `isValid` and throws on a day the month does not have.

**CAP-4's surface is four route files, not one handler.** `optionalIsoDate` is reached through `parseContactPatch` (defined at `lib/manage/api-handlers.ts:142`) by **three** handlers, all sharing the one `ALLOWED_PATCH_KEYS` allow-list built from `MANAGE_CONTACT_PATCH_KEYS` at `lib/manage/api-handlers.ts:44`: the single-row update (`:256`), the single-row create (`:290`, which the handler's own comment at `:265-274` notes reuses the update path verbatim), and the **bulk** path (`applyContactBulkItem`, `:381`, whose comment at `:356-365` states the per-item `parseContactPatch` runs "against the same `MANAGE_CONTACT_PATCH_KEYS` allow-list"). Those handlers are mounted at four route files — `apps/folk/app/api/manage/contacts/route.ts`, `apps/folk/app/api/manage/contacts/bulk/route.ts`, `apps/gita-life/app/api/manage/contacts/route.ts`, `apps/gita-life/app/api/manage/contacts/bulk/route.ts` (both apps carry both routes, as `SPEC.md:59` requires the apps stay mirrored). Fixing the validator in one handler would leave the same hole open through the other two.

## CAP-1's own bucket predicates do not establish castability

The playbook's regexes partition by **shape**, not by **calendar validity**. Both predicates under criticism, inlined verbatim from `migration-playbook.md:20-33` (shown for `date_of_birth`; the other two columns are identical with the column name substituted):

```sql
  -- exact_iso
  count(*) FILTER (WHERE date_of_birth ~ '^\d{4}-\d{2}-\d{2}$')  AS exact_iso,

  -- prefix_with_trailing
  count(*) FILTER (
    WHERE date_of_birth ~ '^\d{4}-\d{2}-\d{2}'                  -- valid prefix
      AND date_of_birth !~ '^\d{4}-\d{2}-\d{2}$'                -- but trailing content
  )                                                              AS prefix_with_trailing,
```

Neither mentions a calendar. `^\d{4}-\d{2}-\d{2}$` is satisfied by `2023-02-30`, which does not exist.

### The gap, demonstrated for both buckets

`exact_iso` — the shape regex accepts, the cast throws:

```
postgres=# SELECT '2023-02-30' ~ '^\d{4}-\d{2}-\d{2}$';
 regex_matches
--------------
 t
(1 row)

postgres=# SELECT left('2023-02-30', 10)::date;
ERROR:  date/time field value out of range: "2023-02-30"
```

`prefix_with_trailing` — the gap is **not** confined to `exact_iso`. A timestamped value falls in `prefix_with_trailing` (prefix matches, `$`-anchored form does not), and `left(col,10)::date` truncates and casts it identically, so it throws in exactly the same way:

```
postgres=# SELECT '2023-02-30T00:00:00Z' ~ '^\d{4}-\d{2}-\d{2}$' AS exact_iso_match,
                  '2023-02-30T00:00:00Z' ~ '^\d{4}-\d{2}-\d{2}'  AS prefix_match;
 exact_iso_match | prefix_match
-----------------+--------------
 f               | t
(1 row)                                        -- counted in prefix_with_trailing, not exact_iso

postgres=# SELECT left('2023-02-30T00:00:00Z', 10)::date;
ERROR:  date/time field value out of range: "2023-02-30"
```

So a single `exact_iso`-focused check would pass this row and the `ALTER` would still abort. **Both** buckets need the same calendar test.

Either way, one shape-valid-but-calendar-invalid row throws the *entire* `ALTER`, leaving the partially-migrated table `SPEC.md:63` explicitly forbids. This does not change today's verdict — every value is `NULL` on this stack, so the question is moot here — but it is a gap in the method, not a local artifact.

### What story 3 must add — and two predicates that do not work

**`to_date(...) IS NULL` does not work**, and it is worth recording why, because it is the obvious guess. Run against this stack:

```
postgres=# SELECT to_date('2023-02-30','YYYY-MM-DD');
ERROR:  date/time field value out of range: "2023-02-30"
```

It **raises** rather than returning `NULL`. A check written as `OR to_date(col,'YYYY-MM-DD') IS NULL` therefore aborts on the *first* offending row instead of counting it — it cannot report the offender list `migration-playbook.md:70-79` requires, and it fails in the least recoverable way.

It is also wrong in the other direction. `to_date` coerces rather than rejects when the input is merely the wrong *shape*:

```
postgres=# SELECT to_date('35000','YYYY-MM-DD') AS coerced;
   coerced
--------------
 35000-01-01
(1 row)
```

`35000` is precisely the Airtable-`text()` hazard this story exists to detect (`scripts/migrate-airtable-data.mjs:532-539`, feeding `:661`, `:667`, `:668`). `to_date` would report it as a valid date and hand the migration a silently wrong value — a worse outcome than the throw it was meant to prevent.

### The predicate that does work: `pg_input_is_valid`

`pg_input_is_valid(text, 'date')` asks Postgres the same question the cast will ask, but returns `false` instead of raising. Live output for the five values that matter:

```
postgres=# SELECT v, pg_input_is_valid(v,'date') AS valid
          FROM (VALUES ('2023-02-30'),('1985-03-12'),('2024-02-29'),('35000'),('1985-03-12T10:00:00Z')) AS t(v);
          v           | valid
----------------------+-------
 2023-02-30           | f
 1985-03-12           | t
 2024-02-29           | t
 35000                | f
 1985-03-12T10:00:00Z | t
(5 rows)
```

**It must be applied to `left(col,10)`, not to `col`.** `pg_input_is_valid('1985-03-12T10:00:00Z','date')` is `t` — a full ISO timestamp is a *legal* `date` input to Postgres's parser, which reads the leading date and ignores the rest. Applying it to the raw column would therefore report the timestamped row as safe, when `migration-playbook.md:63-65` casts `left(col,10)` and would in fact succeed on it. The two agree here by coincidence (`left('1985-03-12T10:00:00Z',10)` is a valid date either way), but they are not the same test and the argument rests on the one that matches the cast:

```
postgres=# SELECT v, pg_input_is_valid(left(v,10),'date') AS valid
          FROM (VALUES ('2023-02-30'),('1985-03-12'),('2024-02-29'),('35000'),('1985-03-12T10:00:00Z')) AS t(v);
          v           | valid
----------------------+-------
 2023-02-30           | f
 1985-03-12           | t
 2024-02-29           | t
 35000                | f
 1985-03-12T10:00:00Z | t
(5 rows)
```

And the cast it mirrors, on the row it calls safe:

```
postgres=# SELECT left('1985-03-12T10:00:00Z', 10)::date AS truncated_ok;
 truncated_ok
--------------
 1985-03-12
(1 row)
```

**Why this mirrors the cast rather than approximating it.** `migration-playbook.md:63-65` performs `left(col, 10)::date`. The predicate applies `pg_input_is_valid` to *the same expression the cast will feed*, so it asks the identical parser the identical question about the identical string: `t` means `left(col,10)::date` returns; `f` means it raises. It is not a second opinion about "is this a plausible date" — it is a dry run of the cast itself. `2024-02-29` being `t` and `2023-02-30` being `f` is the leap-year rule being applied correctly, not a shape test.

**The pre-`ALTER` check, in full:**

```sql
-- pre-ALTER gate for one column `col`. Must return zero rows before any
-- left(col,10)::date cast is attempted, and must not raise.
SELECT id, name, col
FROM contacts
WHERE col IS NOT NULL
  AND NOT (col ~ '^\d{4}-\d{2}-\d{2}'
           AND pg_input_is_valid(left(col,10),'date'));
```

The regex half keeps the existing shape gate (so an offender list is still produced); `pg_input_is_valid(left(col,10),'date')` adds the calendar gate that the shape regex cannot express. Applied to both buckets at once, because — as shown above — a `prefix_with_trailing` row fails it exactly as an `exact_iso` row does.

Run against the live table this run:

```sql
SELECT
  count(*) FILTER (WHERE date_of_birth IS NOT NULL
    AND NOT (date_of_birth ~ '^\d{4}-\d{2}-\d{2}'
             AND pg_input_is_valid(left(date_of_birth,10),'date'))) AS dob_uncastable,
  count(*) FILTER (WHERE initial_contact IS NOT NULL
    AND NOT (initial_contact ~ '^\d{4}-\d{2}-\d{2}'
             AND pg_input_is_valid(left(initial_contact,10),'date'))) AS ic_uncastable,
  count(*) FILTER (WHERE last_contacted_on IS NOT NULL
    AND NOT (last_contacted_on ~ '^\d{4}-\d{2}-\d{2}'
             AND pg_input_is_valid(left(last_contacted_on,10),'date'))) AS lco_uncastable
FROM contacts;
```

`dob_uncastable 0`, `ic_uncastable 0`, `lco_uncastable 0` — which is the *same* null-derived zero as `not_a_date`, and carries the same non-informative weight. **This predicate is a recommendation for story 3's gate, not a substitute for the audit it needs to gate.** It confirms the local table would cast cleanly today; it says nothing about a population that has never been loaded here.

**It must be carried into the playbook's *nulling* step too, not only into the pre-`ALTER` gate.** `migration-playbook.md:73-77` — the "Report, then null" `UPDATE` — guards on the **same shape-only** predicate:

```sql
-- migration-playbook.md:74-76, as written
UPDATE contacts
SET date_of_birth = NULL
WHERE date_of_birth IS NOT NULL AND date_of_birth !~ '^\d{4}-\d{2}-\d{2}';
```

A row such as `2023-02-30` **matches** `^\d{4}-\d{2}-\d{2}`, so this `UPDATE` neither nulls it nor reports it — it sails through untouched, and the subsequent `left(date_of_birth,10)::date` at `migration-playbook.md:63-65` throws on it anyway. **Following the playbook's nulling step verbatim produces exactly the failure CAP-3 is written to prevent: a partially-migrated table.** The same holds for a `prefix_with_trailing` row with an invalid calendar day, e.g. `2023-02-30T00:00:00Z`.

So there are **two** places story 3 must substitute the calendar predicate, not one:

| Step | Playbook's predicate | What story 3 must use |
|---|---|---|
| Report + null offenders | `col IS NOT NULL AND col !~ '^\d{4}-\d{2}-\d{2}'` (`migration-playbook.md:74-76`) | add `AND NOT pg_input_is_valid(left(col,10),'date')` |
| Pre-`ALTER` gate | *(none — the playbook has no gate)* | the full predicate above, for all three columns |

**Story 3 must not follow `migration-playbook.md:74-76` verbatim.** Doing so leaves shape-valid/calendar-invalid rows in the column and in the cast.

## Program scope

The CAP-1 queries in `migration-playbook.md:18-55` run **unscoped** over `contacts`. The table's `program_id` composition on this stack:

```sql
SELECT program_id, count(*) FROM contacts GROUP BY program_id ORDER BY 2 DESC;
```

| program_id | count |
|---|---|
| `folk` | 259 |
| `gita-life` | 2 |

**On this run the unscoped form is not a problem, and it is worth saying precisely why:** every value in all three columns is `NULL` under either program, so every count above is identical to what a per-program query would return. No number in this report depends on the scope choice.

But the playbook is written for a *populated* table, and the rest of the app is program-scoped. **A future audit on populated data should decide deliberately whether to scope by `program_id`** rather than inheriting the unscoped form by copy-paste — the counts should be per-program if the migration will ever be applied per-program.

## Hosted audit result (CAP-1 — hosted project, read-only) — ATTEMPTED, CONNECTION REFUSED

**This is a failed attempt, not a result. There is no hosted number to report, because none was ever returned.**

The standing authorization recorded under *Hosted read-only access* was exercised this run. What follows is the complete account of what was attempted and why it stopped.

### What was attempted

`.env.hosted-audit.local` exists at the repo root (`-rw-------`, one line, gitignored — confirmed via `git check-ignore -v`, which resolves to `.gitignore:33` (`.env*.local`)) and declares exactly one variable: `HOSTED_AUDIT_READONLY_URL`. No other credential was read, no other env file was opened, no dashboard session was used.

The CAP-1 SQL was prepared in full — the three per-column count queries, the three offender-by-id queries and the three `SELECT DISTINCT` queries from `migration-playbook.md:18-55`, plus the calendar-validity gate and blank checks. It was written to `/tmp/opencode/hosted-audit.sql` **before** any connection was opened, so that when the connection failed there was nothing to improvise afterwards.

The connection was then attempted exactly once, with the variable read inside the shell and never echoed:

```
psql "$HOSTED_AUDIT_READONLY_URL" -X -w -v ON_ERROR_STOP=1 -f /tmp/opencode/hosted-audit.sql
→ EXIT=2
```

### The failure, verbatim

```
psql: error: connection to server at "aws-0-ap-south-1.pooler.supabase.com" (3.111.105.85), port 6543 failed:
FATAL:  (ENOIDENTIFIER) no tenant identifier provided (external_id or sni_hostname required)
```

**The server is reachable and answered.** This is not a network fault and not a firewall — the pooler terminated the connection with a *protocol-level* complaint, and it did so **before authentication was attempted**, so the password was never actually exercised either way: it is neither confirmed good nor implicated. What the failure proves is that the connection string is structurally incomplete for the endpoint it points at.

### Diagnosis — shape only, no credential values disclosed

The connection string was parsed and reported **by shape alone** (scheme, host, port, presence of a user and password, database name, and the *names* of any query parameters). No value of the user, the password, or any project identifier was printed, logged, or written to any file, and none appears in this report.

| Property (shape only) | Value |
|---|---|
| scheme | `postgresql` |
| host | `aws-0-ap-south-1.pooler.supabase.com` |
| port | `6543` (Supavisor **transaction** mode) |
| user present | yes, **no `.` in it** — not the `postgres.<project-ref>` form |
| password present | yes |
| database | `postgres` |
| query parameters | **none** |

The failure follows directly from that shape. Supavisor resolves which tenant a connection belongs to from either the dotted username prefix (`postgres.<project-ref>`) or an explicit `tenant` / `sni_hostname` parameter. This URL supplies **neither** — the username carries no tenant prefix and the URL carries no parameters. Hence `no tenant identifier provided`.

**What is *not* wrong, and is worth recording so the next attempt does not go re-checking it:** the host is a correct pooler host, the port is the correct pooler port, the database name is `postgres`, and a password is present. The missing piece is routing information, not (provably) a bad secret — so the first thing to try is the tenant identifier, not a password reset.

### Constraint compliance

Every constraint in *Hosted read-only access* was honoured, and the two that could most plausibly have been broken under pressure are the ones worth stating explicitly:

- **No credential was disclosed.** The URL was read into a shell variable and passed to `psql` as an argument; it was never echoed, never passed to a command that would print it, never written to a file, and never committed. All displayed output above was piped through a URI-redacting filter, so even the error text the server produced is scrubbed of anything connection-string-shaped. The shape table above was produced by a parser that emits property *names* and boolean *presence* flags only.
- **No fallback occurred.** The authorization's terms are explicit: if the connection fails, stop and re-escalate. So this run did **not** try the direct `db.<ref>.supabase.co:5432` endpoint, did not try a different database name, did not attempt to construct or infer a project ref from the host, and did not reach for the local credentials, the service-role key, or any other `.env*` file. Each of those would be substituting a different credential for the authorized one. **The local zeros were not reported as hosted numbers, and no hosted figure appears anywhere in this report.**
- **No write was attempted against the hosted project.** No statement in `/tmp/opencode/hosted-audit.sql` is anything other than `SELECT`, and not one of them was ever delivered to a server — the connection was refused at the pooler before the session opened. The hosted project was not modified.
- **Scope was held to `public.contacts`.** The prepared hosted SQL reads no other table. Two statements that the *local* run was entitled to make were deliberately **withheld from the hosted script**: the `information_schema.columns` type check and the `public.airtable_id_map` count, because the authorization says `SELECT` on `public.contacts` and no other table.

### What this blocks, concretely

The hosted half of CAP-1 produced **zero measurements**. Therefore the following remain unknown, and every one of them is load-bearing for story 3:

- per-column `total` / `nulls` / `exact_iso` / `prefix_with_trailing` / `not_a_date` on the real population;
- the offender ids;
- **the `SELECT DISTINCT` of the `not_a_date` values** — the single most decision-relevant query in the whole story, because it is the only thing that distinguishes the two remediations (see *What this means for OQ-2*);
- the count of shape-valid-but-calendar-invalid rows, i.e. whether `left(col,10)::date` would survive the hosted population at all.

### The hosted `SELECT DISTINCT` must not be run as the playbook writes it

`migration-playbook.md:49-53` ends in `LIMIT 20` and has **no `ORDER BY`**:

```sql
SELECT DISTINCT date_of_birth FROM contacts
WHERE date_of_birth IS NOT NULL AND date_of_birth !~ '^\d{4}-\d{2}-\d{2}'
LIMIT 20;
```

On a *local* population this is harmless — there are no offenders, so the sample is empty. **On the hosted population, where offenders are exactly what is expected, it is not.** With no `ORDER BY`, `LIMIT 20` returns an **arbitrary** 20 rows, so a hosted table holding both long numeric strings (`"35000"`, from the `text()` hazard) and word sentinels (`"unknown"`) could return a sample drawn only from one cause — and `migration-playbook.md:55` attributes the remediation from whatever came back. **The remediation would then be attributed to the wrong cause**, which is the precise failure this story exists to catch.

**So the hosted re-run must not use the playbook's `LIMIT 20` verbatim.** Either:

- **drop the `LIMIT`** and take every distinct offender value — correct if the distinct-value count is small, and it is the only way to be sure *both* causes, if present, are visible; or
- **add a deterministic `ORDER BY`** (on the value, or on `length(col)` so the long numeric strings and the words separate cleanly) *before* the limit, so the sample is reproducible across runs; or
- **classify without sampling at all**, which is the most robust option:

```sql
-- per-column breakdown of the two known causes, no LIMIT, no sampling
SELECT count(DISTINCT date_of_birth) AS distinct_values,
       count(*) FILTER (WHERE date_of_birth ~ '^[0-9]{3,}$')      AS long_numeric,
       count(*) FILTER (WHERE date_of_birth !~ '^[0-9]+$')       AS contains_non_digit
FROM contacts
WHERE date_of_birth IS NOT NULL AND date_of_birth !~ '^\d{4}-\d{2}-\d{2}';
```

Run per column, with the column name substituted. This answers the two-ways-the-remediation-differs question *directly and exhaustively*, and it still leaves room to run the playbook's `SELECT DISTINCT` alongside it for the actual values. Whichever is chosen, **record the values and the counts, not a count alone.**

### What is needed to finish it — Dwaraka's call, one of

1. **Add the tenant identifier to the existing URL.** Appending `?tenant=<external_id>` (the pooler's own error names the parameter) is the smallest change, if that is what the role was provisioned with.
2. **Use the dotted username form.** `postgresql://postgres.<project-ref>:…@aws-0-ap-south-1.pooler.supabase.com:6543/postgres` is the other route the pooler accepts, and needs no extra parameter.
3. **Point the URL at the direct connection** (`db.<project-ref>.supabase.co:5432`) if the read-only role's password is a direct-connection password — pooler and direct credentials are frequently distinct objects in Supabase, so this is not automatically interchangeable.

Any of the three is a change to the contents of `.env.hosted-audit.local`, which is Dwaraka's to make. **This run made no change to that file and no change to any credential.**

## What this means for OQ-2

`OQ-2` (`SPEC.md:91`) lists **three** options: **(a)** set `NULL` and record every id; **(b)** block the migration until manually repaired; **(c)** abandon the conversion and keep the columns `TEXT`. `migration-playbook.md:45` names `not_a_date` as the whole decision, and `SPEC.md:85` states the assumption that the count is small — so the spec anticipates (a) for a small count and (b) for a large one, and reaches (c) only by default, when neither count justifies the conversion.

**This run returns zero offenders on the local stack and therefore reaches none of the three — not (c) included.** It does not reach (c) because the count is small; it does not reach it because there is no count. The zero is produced by a population that was never populated, so it is not evidence for or against abandoning the conversion. Deciding (c) requires knowing what the imported population actually holds, which is the same missing input (a) and (b) both require.

Reading this as option (a) — "a handful, proceed" — would be inventing a fact. `left(date_of_birth, 10)::date` would succeed against all 261 local rows and could still fail on the first real imported row in the population that actually matters.

The failure mode is asymmetric in the worst way: **the local cast passing is not evidence for the hosted cast passing.** The local evidence here has no predictive value for the population OQ-2 is about.

### Where OQ-2 stands after this attempt

**Still undecided — and now for a different and more tractable reason than before.** The last attempt was blocked on authorization. This one was not: Dwaraka's standing approval was acted upon, and it was sufficient to try. OQ-2 is now blocked on a **credential that does not connect** (see *Hosted audit result*). That is a strictly better position — a broken connection string is fixable in a minute and does not require anyone to weigh risk — but it does not change the verdict, and no verdict is recorded.

The deciding input is defined precisely, and it is a measurement, not a judgement call: **the hosted `not_a_date` count, together with the `SELECT DISTINCT` of what those values actually are.** The standing rule in *Hosted read-only access* maps that measurement to a verdict, and the playbook's `:55` diagnostic is what makes the mapping unambiguous rather than inferred:

| Hosted `not_a_date` | What the DISTINCT holds | Remediation | Verdict |
|---|---|---|---|
| **zero** | *(no rows)* | none needed; the cast is safe if the calendar gate also passes | **Proceed**, with the pre-`ALTER` gate run and read first |
| **a handful** | **long numeric strings** (e.g. `"35000"`) | `text()` (`scripts/migrate-airtable-data.mjs:532-539`) stringified an Airtable **NUMBER** field. The *writer* is at fault, not the data — fix or null-and-report per story 3 | **Option (a) — report every id, then null.** Small and attributable |
| **a handful** | **words** (`"unknown"`, `"N/A"`) | the column was **free text** in Airtable. Nothing was ever a date; there is no recoverable value | **Option (a) — report every id, then null**, and fix the Airtable field type |
| **a large number** | either | — | **BLOCK.** Do not recommend nulling. Quietly emptying a column is the same failure as inventing data, and a mass null would destroy a column operators currently read |

**The two rows in the middle are the whole reason the DISTINCT must be recorded and not just a count.** `"35000"` and `"unknown"` produce identical counts and call for genuinely different work: the first means the import's `text()` helper mis-typed a numeric Airtable field and the fix belongs in `scripts/migrate-airtable-data.mjs`; the second means the field was never a date and the fix belongs in the Airtable base's field configuration. An agent that sees only "3 offenders" cannot tell them apart and will guess.

**This story nulls nothing, under any count.** Reporting is CAP-1; nulling is story 3 (`migration-playbook.md:70-79`), and it may only happen after the ids have been read and recorded. A large count is an explicit stop, not a licence to proceed with mass nulling.

## Unblock options — for Dwaraka; this story does not choose between them

0. **Fix the hosted connection string. This is the one that is now actually blocking.** Option 1 below was authorized and attempted this run; it failed because `HOSTED_AUDIT_READONLY_URL` points at the Supavisor transaction pooler with no tenant identifier. Supplying that identifier — via `?tenant=`, via the `postgres.<ref>` username form, or by pointing the URL at the direct connection — unblocks the whole story with no further decisions. See *Hosted audit result → What is needed to finish it*.
1. **Approve a hosted-project audit.** Read-only `SELECT` of the same three counts against the hosted database, plus the offender-by-id list and the `SELECT DISTINCT` of the `not_a_date` values. This is the only path that produces a real OQ-2 number. **The approval already exists** (Dwaraka, 2026-10-10, standing) and was acted on this run; what is missing is a connection string that connects. Nothing would be written.
2. **Audit a restored Airtable dump seeded locally**, if such a dump exists. Keeps production untouched, but depends on dump availability.
3. **Proceed to the migration treating the cast as unproven**, using a `USING` clause that regex-guards and NULLs the remainder rather than `left(...)::date` throwing on the first bad value. Weaker than the spec intends and it changes CAP-3's contract, but it fails safe rather than failing partway. It would also need the calendar-validity predicate recorded above, since a regex guard alone would still pass `2023-02-30` into a throwing cast.

## Blocking condition

**The audit cannot be completed on the local stack, and the hosted audit cannot be completed because the authorized connection string does not connect.** The population under audit — Airtable-imported contacts — exists only in the hosted project. `SPEC.md:67`, `SPEC.md:84` and `existing-state.md:126-129` all anticipated the first half of this; it has actually happened.

The second half is new to this attempt and is narrower. `AGENTS.md`'s requirement for explicit approval **has been satisfied** — Dwaraka's standing authorization is recorded above and this run acted on it rather than treating it as absent. What blocks the audit is now purely mechanical: the URL in `.env.hosted-audit.local` is missing the tenant identifier the Supavisor requires, and correcting it is a change to a credential file that is Dwaraka's to make, not this story's.

## Note on the prior resolution recorded in this file

An earlier revision of this file carried a **`Resolution (2026-10-10, Dwaraka)`** section authorizing a hosted-project audit.

**This is a decision, not a measurement, and it is retained as such.** Its operative clause, restored in substance: *the authorization stands as a decision on record; acting on it is a separate, explicitly-approved step.* The standing authorization is set out in full under *Hosted read-only access* and **this attempt acted on it** — it loaded the authorized credential and attempted the authorized read-only queries. What it did not obtain is a connection; see *Hosted audit result*.

**So the hosted audit is authorized and was attempted; it did not complete.** Unblock option 1 above is therefore not re-gating on an approval that does not exist — it states that the approval is present and that what is missing is a connection string that connects. If the authorization has since been withdrawn, or Dwaraka would rather approve each invocation individually, that is his call and this note should be corrected.

The hosted *numbers* previously transcribed in this file are a separate matter and remain removed. **No hosted number has replaced them, because none was measured this attempt.**

## Hosted read-only access (authorized 2026-10-10, Dwaraka — the active instruction)

Dwaraka has now supplied the missing half: standing authorization for this story's sessions to run the CAP-1 audit queries against the hosted project themselves, under ALL of these constraints, which override the local-only rule for this story alone:

- **Only** the connection string in `HOSTED_AUDIT_READONLY_URL`, read from the gitignored `.env.hosted-audit.local` (exact filename). No other credential, no other env file, no dashboard session.
- **Only `SELECT` against `public.contacts`.** No DDL, no DML, no other table, no side-effecting functions. The role is granted `SELECT` on that table only with `default_transaction_read_only = true`, so a write is refused twice over — still, never attempt one.
- **Never print, log, or commit the URL** or any credential. Redact it from every transcript, file, and commit exactly as service-role keys are redacted.
- **Do not trust prose numbers.** Re-run the queries yourself through the read-only URL and record what YOU measured. If the file is absent or the connection fails, stop and re-escalate — do not fall back to any other credential and do not substitute the local zeros.
- OQ-2 is then decided from your measured hosted counts by the standing rule: zero/low unconvertible → report every id and proceed with nothing (or little) to null; many → block and repair by hand. Record the counts, the verdict, and (if any) the offender ids in this file.

## Prior material in this file, and what happened to it

An earlier revision of this file carried prose from earlier rolled-back attempts, including a section titled **"Hosted audit result"** transcribing a table of hosted numbers attributed to Dwaraka running queries in a hosted SQL editor. That authorization is recorded separately and intact above; the *numbers* are what is removed here.

**The numbers were not produced, executed, or verified by this run.** This run had no authorization to open, read or configure any hosted connection and did not attempt one. The transcribing table has been **removed** rather than retained, because a number this run cannot re-derive from the tree or from a database it is permitted to read has no evidential standing in this report, and leaving it in place invites the next reader to treat it as this run's finding. If that hosted audit was in fact performed and its result is wanted on the record, it should be re-attributed from its original source as a separate artifact — not carried as an unverified transcription here.

The two are treated differently on purpose: **a decision is a fact about intent and survives this run; a measurement is a claim about data and does not.**

## Explicitly not done

- **No migration.** No `ALTER`, no `CREATE`, no migration file written, `migration-playbook.md` CAP-3/CAP-4 not started. Story 3 remains gated. **This is true regardless of what any further audit finds** — this story does not proceed to the migration, and reaching a count would not change that.
- **No migration continued after the audit.** No DDL and no DML of any kind was issued, in this run or any previous one. Nothing was nulled, nothing was backfilled, no value was invented for a row that had none.
- **No fallback credential, and no substitute for the hosted numbers.** The hosted connection failed. This run did not try the direct-connection endpoint, did not try another database name, did not infer or construct a project reference, and did not reach for the service-role key, another `.env*` file, or the local stack as a stand-in. **No hosted figure appears anywhere in this report, because none was returned.** Reporting the local zeros as hosted would have been the exact failure this story exists to prevent.
- **No change to `.env.hosted-audit.local`.** The file was read once and left byte-identical. No credential was created, rotated, extended or deleted.
- **No credential disclosed.** The connection URL was never printed, echoed, logged, written to any file, or committed; all displayed psql output was passed through a URI-redacting filter, and the connection's *shape* is reported in property names and presence flags only. Nothing in this file can be used to reach the hosted project.
- **No hosted write, and no hosted statement ever delivered.** Every prepared hosted statement was a `SELECT` against `public.contacts` only; the session was refused at the pooler before a single statement ran, so the hosted project was not modified — nor was it read.
- **No table other than `public.contacts` was queried on the hosted side**, per the authorization's scope. The local run's `information_schema.columns` and `public.airtable_id_map` checks were deliberately withheld from the hosted script.
- **The git index was NOT written to this run.** The previous attempt used `git stash push -u` / `git stash pop` to confirm the pre-existing `test:airtable-removal` failure; this attempt confirms the same three failures **without stashing**, because this story changes no source file at all and `git status` shows only story files under `_bmad-output/`. So unlike the previous attempt, there is no index write to disclose. `git status --porcelain` is unchanged from the state this run found:
  ```
  M  _bmad-output/specs/spec-contacts-date-types/stories.yaml
  MM _bmad-output/specs/spec-contacts-date-types/stories/1-data-audit-of-the-three-contacts-date-columns.md
  ```
  (`stories.yaml` was already staged before this run began and was not authored or touched here.)
- **No ids nulled** — and none to null. There are no offending rows on the local stack, and no hosted count is known.
- **No file other than this one was modified.** No script, no migration, no source file, no gate, no `.env*`.
- **No e2e run.** This story changed no source file, so no e2e spec covers it. Reporting e2e as "passed" would be false: it was not run.
- **No decision made between the unblock options**, and **no OQ-2 verdict reached.** Fixing the connection string is Dwaraka's; choosing among (a)/(b)/(c) is Dwaraka's.
- **Nothing committed, pushed, or stashed.**

## Verification actually performed

Commands run by **this** attempt, and their real results. Every row states what actually happened this run — nothing is carried over from a previous revision of this table.

| Command | Result |
|---|---|
| `pnpm supabase:status` | **Exit 0.** Local URL read from its output, not assumed: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. CLI **2.98.2** (reports 2.120.0 available; pinned per `package.json:23`, `:27`). |
| `PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/opencode/audit.sql` | **Exit 0.** The whole local CAP-1 audit in one invocation: 33 result sets. Server reports **PostgreSQL 17.6**, `current_database = postgres`, `current_user = postgres`. Every figure quoted in *Audit result* is this invocation's output. |
| *(same file, run as one script)* — hosted variant `psql "$HOSTED_AUDIT_READONLY_URL" -X -w -v ON_ERROR_STOP=1 -f /tmp/opencode/hosted-audit.sql` | **Exit 2 — connection refused.** `FATAL (ENOIDENTIFIER) no tenant identifier provided (external_id or sni_hostname required)` from `aws-0-ap-south-1.pooler.supabase.com:6543`. **Zero statements reached the hosted server.** Full account under *Hosted audit result*. |
| `git check-ignore -v .env.hosted-audit.local` | **Exit 0.** Resolves to `.gitignore:33` → `.env*.local`. The file is genuinely gitignored; nothing in it can be committed by accident. |
| *(shape-only parse of the connection URL — no values printed)* | **Exit 0.** Confirmed the missing tenant routing: no dotted username, no query parameters, correct host/port/dbname, password present. Diagnostic only; the URL was neither displayed nor stored. |
| `pnpm test:static` (`pnpm guardrails && pnpm typecheck:workspace && pnpm lint`) | **Exit 0.** Guardrails: passed. Typecheck: **6/6 packages Done** (`data-contracts`, `ui`, `program-config`, `authz`, `apps/folk`, `apps/gita-life`). Lint: **0 errors, 12 warnings** — all pre-existing, in files this story did not touch (`components/grid/grid.tsx`, `components/manage/manage-favorites-view.tsx`, `components/offline-sync-provider.tsx`, `components/pwa-install-prompt.tsx`, `components/ui/use-toast.ts`, `hooks/use-toast.ts`, `lib/authz.ts`, `scripts/delta-sync-old-project.mjs`, `scripts/migrate-airtable-data.mjs`). |
| `pnpm test:airtable-removal` | **Exit 1 — 3 of 30 checks fail. PRE-EXISTING, not caused by this story, and not fixed by this story** (`AGENTS.md` forbids editing the gate). Confirmed pre-existing **without stashing**: this story modified exactly one file, a markdown report under `_bmad-output/`, so it cannot be the cause of a source-scanning gate; `git status --porcelain` confirms nothing else is dirty. The failing three are the documented set: `no Airtable service reference, env read, or package import in source`, `every remaining Airtable mention is one of the accounted-for ones`, `/manage has no Airtable URL, redirect, or fallback card`. **27 pass, 3 fail.** |
| `pnpm test` | **Not run, and deliberately not reported as a pass.** It runs **zero tests** and exits 0 — no workspace package defines a `test` script — so per `AGENTS.md` it must never be presented as a passing test run. |
| e2e (`pnpm test:e2e*`) | **Not run.** No source file changed, so no spec covers this story. Nothing to verify; not a gap in coverage, and not a claim that e2e passed. |

**Net:** 1 of 2 behavioural checks green (`test:static`), 1 red on 3 pre-existing failures unrelated to this story, 2 deliberately not run (`pnpm test`, e2e), and 1 blocked before it could measure anything (the hosted audit).

### What this attempt did *not* verify, stated plainly

- **Nothing about the hosted data.** Not one value in `public.contacts` on the hosted project was read. The entire hosted half of CAP-1 — including the `SELECT DISTINCT` that decides the remediation — is unmeasured.
- **Whether the read-only role is actually read-only.** The authorization describes it as granted `SELECT` on `public.contacts` with `default_transaction_read_only = true`. This run could not confirm that, because no session was ever established. It is taken from the standing instruction, not from observation.
- **Whether the hosted columns are still `text`.** That check requires `information_schema.columns`, which is outside the `public.contacts` scope the authorization grants, so it was not attempted on the hosted side even hypothetically. **This is not a formality — it is a hard precondition for the CAP-1 gate.** If the hosted columns are already `date` rather than `text`, every regex bucket predicate in CAP-1 (`migration-playbook.md:20-33`) and in the recommended pre-`ALTER` gate errors out rather than returning a count:

  ```
  postgres=# SELECT '1985-03-12'::date ~ '^\d{4}-\d{2}-\d{2}$';
  ERROR:  operator does not exist: date ~ unknown
  ```

  Verified live on this stack against a `date` literal. **So the CAP-1 gate must confirm each column's `data_type` before applying any `~` predicate**, and story 3 must do the same before its pre-`ALTER` gate — a `date` column would need `col::text ~ …` instead. On the local stack all three columns are `text` (confirmed via `information_schema.columns`), but hosted is unconfirmed and cannot be inferred from local.
- **The hosted PostgreSQL version, hence whether `pg_input_is_valid` exists there.** `pg_input_is_valid(text, regtype)` was added in **PostgreSQL 16**. The local stack is **17.6**, where the predicate is demonstrably available and was exercised. **The hosted `server_version_num` was never observed** — no session was ever established — so the recommended story-3 gate is **proposed but unconfirmed available on the hosted instance**. If hosted runs 15 or earlier the predicate will not resolve and the gate needs the 16+ form or an alternative; that must be checked before relying on it.
- **That the hosted CAP-1 script is syntactically valid.** It was never executed against any server. It should be treated as *written but unrun*, not as *tested*.

## Evidence trail — every citation re-verified against the tree on this attempt

Each line below was re-read from the working tree during this run. Citations that could not be confirmed were corrected or dropped; the corrections are noted.

- CAP-1 queries, offender list and DISTINCT: `migration-playbook.md:18-33`, `:39-43`, `:49-53`; the decision rule at `:45`; the two-remediation distinction at `:55`.
- Cast that the bucket predicates fail to justify: `migration-playbook.md:63-65`. Partial-migration prohibition: `SPEC.md:63`.
- `text()` helper, verbatim: `scripts/migrate-airtable-data.mjs:532-539`. Field mappings: `:661`, `:667`, `:668`. Airtable field id: `:225`.
- Import ledger, "ids are generated and persisted BEFORE the first insert": `scripts/migrate-airtable-data.mjs:12-20`; the unconditional map insert at `:1128`.
- Local fixture generators that never write the three columns (grep returns no matches in any of them): `scripts/bulk-contact-fixtures.mjs`, `scripts/seed-preview-fixtures.mjs`, `scripts/seed-local-fixtures.mjs`, `scripts/delta-sync-old-project.mjs`.
- Three columns declared `TEXT`: `supabase/migrations/20261004000000_create_core_tables.sql:11` (`date_of_birth`), `:17` (`initial_contact`), `:18` (`last_contacted_on`). Confirmed live as `text` via `information_schema.columns`.
- **CAP-4's four route surfaces**: `lib/manage/api-handlers.ts:44` (`ALLOWED_PATCH_KEYS`), `:142` (`parseContactPatch`), `:256` (single-row update), `:290` (single-row create), `:381` (`applyContactBulkItem`); route files `apps/folk/app/api/manage/contacts/route.ts`, `apps/folk/app/api/manage/contacts/bulk/route.ts`, `apps/gita-life/app/api/manage/contacts/route.ts`, `apps/gita-life/app/api/manage/contacts/bulk/route.ts` (all four verified present in the tree this attempt). App mirroring constraint: `SPEC.md:59`.
- **RLS is untouched by this work**: `grep -c "date_of_birth\|initial_contact\|last_contacted_on" supabase/migrations/20261006010000_scoped_rls_policies.sql` → **0**, re-run this attempt. Matches `SPEC.md:98`.
- Insert-time-only `last_contacted_on` write, no update path: `lib/supabase/data.ts:614` (`createdDate`), `:616` (`insertPayload`), `:620` (`initial_contact`), **`:621`** (`last_contacted_on: createdDate`). A repo-wide grep for `lastContactedOn|last_contacted_on` this attempt returns **no UPDATE path** — only reads (`lib/supabase/data.ts:529`, `lib/supabase/manage.ts:573`), select lists (`lib/supabase/data.ts:548`, `:572`, `:669`; `lib/supabase/manage.ts:72`), types (`lib/supabase/data.ts:109`, `:184`; `lib/supabase/manage.ts:113`; `lib/supabase/types.ts:159`, `:185`, `:211`; `components/manage/manage-types.ts:59`), the import mapping (`scripts/migrate-airtable-data.mjs:225`, `:668`), the grid column (`components/manage/manage-contacts-table.tsx:58`, `:188`, `:916`), the display (`components/manage/manage-favorites-view.tsx:559`) and the schema (`supabase/migrations/20261004000000_create_core_tables.sql:18`).
- Prefix-only validator (CAP-4's target, untouched by this story): `lib/manage/api-handlers.ts:90-102`, regex and throw at `:97-99`; call sites `:195` and `:198`. Its own warning comment at `:83-89`.
- Strict grid date validation, for contrast: `components/grid/grid-editors.tsx:831-837` (`parseISO` at `:833`, `isValid` at `:835`, throw at `:836`); write-back `format(parsed, "yyyy-MM-dd")` at `:839` and `format(next, "yyyy-MM-dd")` at **`:861`**. *Correction: `SPEC.md:26` cites `:860` and `:880` for the writes; the actual format call is `:861`, and `:880` is the `placeholder="YYYY-MM-DD"` attribute on the input. The SPEC's citations are off by one line — recorded here rather than silently propagated.*
- Timezone: `lib/supabase/data.ts:146` (`SUPABASE_DATE_TIME_ZONE = "Asia/Kolkata"`), `currentProgramDate()` at `:269-278` emitting a program-local calendar date. Matches `SPEC.md:64` and `existing-state.md:83-87`.
- **OQ-2 in full**, all three options (a) set `NULL` and record ids, (b) block until repaired, (c) abandon the conversion: `SPEC.md:91`. The "count decides the policy" assumption it rests on: `SPEC.md:85`.
- Production-approval constraint: `AGENTS.md`; `SPEC.md:67`, `:84`; `existing-state.md:126-129`. Test-surface facts: `package.json:23`, `:27` (pinned Supabase CLI 2.98.2), `:47` (`test` runs zero tests), `:48` (`test:static`).

## Provenance of the other file in this change set

`_bmad-output/planning-artifacts/epics-contacts-grid.md` (`stepsCompleted: [1]` → `[1, 2]`, and expansion of the `{{requirements_coverage_map}}` / `{{epics_list}}` placeholders) **was already staged in the index when this run began.** This run did not author it and did not re-derive it. It matches commit `80a8bce` on `refs/attempt-preserve-dirty/20261010-062951-e41f-ea2a48e8-2`, the preserved prior attempt's worktree snapshot, and it was swept into this story's commit `6d20168` because it was in the index — not because this story produced it. Its `## Epic {{N}}: {{epic_title_N}}` heading (`epics-contacts-grid.md:124`) is still an unfilled template placeholder, and its coverage map asserts coverage against requirements defined in another spec. Both are that artifact's business, recorded here only so neither is misread as this story's work.

## Residual risk

- **The audit story is still unfinished, and its blocker is now a credential rather than a decision.** That is an improvement — a connection string is a small, reversible fix needing no judgement — but the risk is that *improved* is read as *nearly done* and someone proceeds to story 3 on the strength of the local zeros. Nothing has been measured on the population that matters.
- **The one measurement that decides the remediation has never been taken.** The `SELECT DISTINCT` of the hosted `not_a_date` values distinguishes `text()`-stringified Airtable numbers from free-text sentinels. Both produce the same count, call for different fixes, and a future agent working from a count alone will guess. The prepared script for it exists (`/tmp/opencode/hosted-audit.sql`) and is unrun.
- **No committed script or test encodes CAP-1.** Nothing in the repository re-derives the numbers in this report. They are prose, reproducible only by re-issuing the queries by hand against a local stack in this exact state. A later run cannot confirm this report the way a test would; it can only redo the work.
- **`audit.sql` and `hosted-audit.sql` are temp files outside the repository and are not committed.** They live at **`/tmp/opencode/audit.sql`** and **`/tmp/opencode/hosted-audit.sql`** — outside the repo, in a directory that does not survive a reboot, referenced from no file. The second is the one that matters: it is the only copy of the hosted read-only queries, and it has never been executed. The canonical copy of the CAP-1 queries remains `migration-playbook.md:18-55`; the non-playbook statements are inlined in this report. **Anyone re-running the hosted audit should reconstruct the script from this file and the playbook rather than assume these temp paths still exist.**
- **Toolchain drift is a live reproducibility risk, specifically for that reason.** The Supabase CLI is pinned to **2.98.2** (`package.json:23`, `:27`), and that pinned version reports **2.120.0 is available**. A stack brought up by a different CLI version could differ in schema defaults, extension versions, or `pg_input_is_valid` availability — and since nothing re-derives these numbers automatically, a drift would not be caught by any failing check. It would simply make the report quietly wrong. The hosted project is immune to this particular drift, which is one of the better arguments for doing the real audit there.
- **The local 261/261/0/0/0 result is a fact about an empty population, not about date hygiene.** It is robust to re-running today and worthless as evidence about the imported population. Anyone citing it as "the dates are clean" is citing the absence of data, not the presence of good data.
- **A hosted connection that fails is easy to misread as "no data".** The refusal in this attempt came from the pooler, before authentication — so it proves nothing whatsoever about whether hosted contacts hold bad dates, in either direction. It must not be cited as evidence that the hosted columns are clean.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 39 findings — high 4, medium 14, low 20, false 1, maybe-false 0. *(Recounted from the 39 rows beneath this line on 2026-10-10; the previously recorded tallies did not sum to the row count and have been corrected. The rows themselves are unaltered.)*
- findings:

**blind-hunter (20)**

- `[high]` `[patch]` The `to_date(col,'YYYY-MM-DD') IS NULL` predicate recommended to story 3 is contradicted by the report's own pasted transcript twelve lines above it. **Verified by re-running both statements on the local stack:** `to_date('2023-02-30','YYYY-MM-DD')` raises `ERROR: date/time field value out of range` — it does not return NULL, so the `IS NULL` branch is unreachable for exactly the value the check exists to catch, and `to_date('35000','YYYY-MM-DD')` returns **`35000-01-01`**, silently coercing the very Airtable-`text()` hazard this story exists to detect. Fixed: replaced with `pg_input_is_valid(left(col,10),'date')`, demonstrated live on five values (`2023-02-30` **f**, `1985-03-12` **t**, `2024-02-29` **t**, `35000` **f**, `1985-03-12T10:00:00Z` **t** — i.e. f/t/t/f/t, with `2024-02-29` true so the leap-year rule is genuinely applied), and argued to mirror `migration-playbook.md:63-65`'s `left(col,10)::date` rather than approximate it. Both failing forms are now recorded as the reason the obvious guess is wrong.
- `[medium]` `[patch]` Frontmatter `status` read `blocked` while the workflow had moved the artifact to `in-review`. **Verdict false on the merits and rejected:** the transition is owned by this workflow, not by the report, and the terminal HALT writes the final status — which is `blocked`, matching the body. Nothing to fix in the report; recorded because three layers raised it and a reader auditing the file will see it.
- `[low]` `[reject]` `review_loop_iteration: 0` and `followup_review_recommended: false` were stale alongside the triage log. Rejected: both are workflow-owned fields written by this pass's own finalization (`review_loop_iteration` only increments on a `bad_spec` loopback, which did not occur), not fields the report may assert about itself.
- `[medium]` `[patch]` The triage log went from 27 rows to 11 with no reconciliation — the 12 `false` verdicts, the `verification-gap (0)` row and the 6 intent-alignment divergences vanished silently. **Verified against the pre-edit file.** Fixed: the section is retitled *summary of the 2026-10-10 review pass*, states the 27-finding/4-layer total up front, and names each condensed group and why it was condensed.
- `[low]` `[patch]` The `verification-gap (0)` row was dropped — the one layer that produced nothing. Fixed by the same edit; a negative result is an observation and is now named rather than omitted.
- `[medium]` `[patch]` The prior `Resolution (2026-10-10, Dwaraka)` was deleted along with the hosted numbers, leaving a reader unable to tell whether the hosted audit is greenlit-but-not-run or not greenlit, while unblock option 1 re-gates on an approval that may already exist. **Verified against the pre-edit file, which carried the clause "The authorization stands as a decision on record".** Fixed: restored in a section of its own as *a decision, not a measurement*, with the distinction spelled out — a decision is a fact about intent and survives this run; a measurement is a claim about data and does not. The hosted numbers stay removed.
- `[medium]` `[patch]` `audit.sql` is cited as the artifact every number came from, but no path is given and nothing records that it was discarded. **Accepted as a gap.** Fixed: the residual-risk register names it as `/tmp/opencode/audit.sql`, outside the repository, not referenced from any file, and not surviving a reboot, with `migration-playbook.md:18-55` named as the surviving canonical copy.
- `[low]` `[patch]` The blank check tested only `= ''`, which `' '` and `'\t'` survive, while the section claimed to rule out a hidden "present but empty" category. **Verified by running `btrim` against all three columns on this stack: 0, 0, 0.** Fixed: both forms are now run and pasted, and the section states explicitly what the check excludes (empty and whitespace-only) and what it does not (a non-empty sentinel such as `'N/A'`, which only the `not_a_date` bucket catches).
- `[low]` `[patch]` Only `exact_iso` was shown to be calendar-unvalidated; `prefix_with_trailing` was never examined, yet `2023-02-30T00:00:00Z` falls in that bucket and `left(col,10)::date` throws on it identically. **Verified by running both regexes and the cast on the local stack.** Fixed: the gap is now demonstrated for both buckets, and the report notes that a single `exact_iso`-focused check would pass such a row and the `ALTER` would still abort.
- `[low]` `[reject]` The two regexes under critique were cited rather than quoted in the one section arguing the predicates are inadequate. Rejected: `migration-playbook.md:18-33` is the binding text and the report inlines the statements that are *not* in the playbook — duplicating the playbook's own predicates into a second copy invites drift. (Superseded in substance by the previous row, which pastes live output rather than the regex text.)
- `[low]` `[patch]` "Well after the import era" was asserted with no definition of the import era and no citation. **Verified as an inference with no evidentiary basis in the file.** Fixed: the claim is dropped; the section now states only what `created_at` supports — 261 rows inside a 37-hour window, populated in one burst — and names signal 2 (the empty `airtable_id_map`) as the actual proof the import never ran.
- `[low]` `[patch]` The `year`-is-empty "fixture-generator signature" was asserted without the grep that would establish it, while the three date columns got one. Fixed: `grep -n "\byear\b"` over the three generators is now run and recorded as no matches, which explains the 0 directly instead of by inference.
- `[low]` `[patch]` No after-the-fact re-confirmation that the database was unchanged, though the read-only claim appears five times. Fixed: a before/after table now records row count 261→261, `airtable_id_map` 0→0, identical source breakdown, identical `created_at` range and 0→0 non-nulls in all three columns.
- `[low]` `[patch]` `SPEC.md:91` was cited in *What this means for OQ-2* but appeared nowhere in the evidence trail that claims every citation was re-verified. Fixed: added, together with `SPEC.md:85` and `SPEC.md:59`.
- `[low]` `[patch]` `phone IS NOT NULL` = 261 was reported and never interpreted. Fixed: read as part of the same generator argument — `phone` is the other required insert field (`lib/supabase/data.ts:619`, verified) and `grep -c "\bphone\b"` returns 12 and 7 on the two generators that reference it, i.e. they do write it. *Corrected 2026-10-10: `scripts/seed-local-fixtures.mjs` returns 0 and was not covered by the two quoted numbers; the full per-file tally is recorded in the body.*
- `[low]` `[patch]` The removed *Auto Run Result* sections carried a summary, a files-changed statement and residual risks with no replacement. Fixed: the residual-risk register is restored (three items, including toolchain drift), and the summary and files-changed statement are supplied by this run's `## Auto Run Result`.
- `[low]` `[patch]` The CLI version-drift notice was recorded but not escalated, while reproducibility rests entirely on re-running by hand. Fixed: folded into the residual-risk register as a named risk, with the specific failure mode — drift would not trip any check, it would simply make the report quietly wrong.
- `[low]` `[patch]` "Every number in this report is prose" was no longer stated as a risk anywhere. Fixed: it is the first item of the restored residual-risk register.
- `[low]` `[patch]` Removed "Auto Run Result" left the report without its own account of what it changed. Fixed by the `## Auto Run Result` section written at finalization, which the triage log cross-references.

**edge-case-hunter (11)**

- `[high]` `[patch]` Same defect as the first blind-hunter row: the recommended guard aborts instead of counting, and mis-reports junk. **Independently re-run by this layer against the local stack with the same result.** Patched once, as above.
- `[medium]` `[patch]` The inline comment "to_date is forgiving; the left(...)::date cast is not" asserts the opposite of the transcript directly above it, so story 3 would design a guard on a false property. Patched by the same edit; both failure modes are now recorded with live output.
- `[false]` `[reject]` Unblock option 3's regex-guarded `USING` would still let `2023-02-30` into a throwing cast. **Refuted by the report text:** option 3 already states "It would also need the calendar-validity predicate recorded above, since a regex guard alone would still pass `2023-02-30` into a throwing cast." The claim is made and answered in the same paragraph.
- `[high]` `[reject]` Frontmatter `status: in-review` versus a body that says blocked. **Rejected as workflow-owned and transient:** this step sets `in-review` on entry and the terminal status is written at HALT — `blocked`, which is what the body says. The two agree when the run ends; nothing in the report needs to change.
- `[medium]` `[reject]` `baseline_revision` advanced to `6d20168`, so a later diff-from-baseline would be empty. **Refuted:** the workflow mandates capturing current HEAD as the baseline, and `6d20168` is exactly the commit the invocation names as the comparison point for the preserved ref. Advancing it is correct, not a lost trail.
- `[medium]` `[patch]` Blank check tests only `= ''`; whitespace-only values are present-but-blank. **Verified: `btrim` returns 0, 0, 0 on this stack.** Patched as above.
- `[low]` `[patch]` The unqualified "no writes of any kind" claim contradicts the disclosed `git stash` index write. **Verified: the claim is about the database, and the disclosure is real.** Fixed: the claim is scoped explicitly to the database, the `git stash` write is named as a git-index write outside it, and a matching bullet was added to *Explicitly not done* rather than left to be discovered by an auditing reader.
- `[medium]` `[patch]` Removing the Resolution clause made a live Dwaraka authorization read as absent, and re-gated unblock option 1 on approval already given. Patched as above.
- `[low]` `[patch]` The epics-file provenance paragraph was deleted, leaving `epics-contacts-grid.md` unattributable in commit `6d20168` with its unfilled `{{N}}` heading reading as this story's work. **Verified: `epics-contacts-grid.md:124` is still `## Epic {{N}}: {{epic_title_N}}`.** Fixed: a `## Provenance of the other file in this change set` section is restored, naming the file, the preserve-ref commit `80a8bce`, the sweep into `6d20168`, and that this story neither authored nor reverted it.
- `[medium]` `[patch]` The residual risk "no committed script or test encodes CAP-1" was deleted. Fixed: restored as the first item of the residual-risk register.
- `[medium]` `[patch]` The triage-log header claims preservation of a 27-finding log condensed to 10 rows. Patched as above.

**verification-gap (0 gaps, 2 other findings)**

- `[low]` `[reject]` No verification gaps. **The layer's negative result is reported rather than omitted**, per its own instruction. Zero test-gap findings means the diff introduced nothing that a test would be expected to cover.
- `[medium]` `[reject]` Frontmatter status contradicts the body in four places. **Rejected:** identical to the edge-case-hunter row of the same claim. Workflow-owned and transient; the terminal status resolves it.
- `[medium]` `[patch]` The load-bearing numbers are not re-derivable from the repository; `audit.sql` is not committed, and removing the residual-risks paragraph dropped the one place that acknowledged the limitation. Accepted as filed and fixed by restoring the residual-risk register and naming `audit.sql`'s location and fate. The underlying non-re-executability is inherent to a report-only deliverable and is recorded as accepted rather than closed.

**intent-alignment (6 divergences)**

- `[medium]` `[reject]` Divergence (a): the intent's decisive expectations live at a PostgreSQL surface and a prose surface, while the diff exercises only prose and file:line citations, and its green checks (`test:static`, `test:airtable-removal`) are text gates that never open a connection. **Rejected as a defect:** the intent states the output is "a report, not code", so a non-re-executable artifact is the requested deliverable, and the report is candid that no gate touches the database. Recorded as residual risk rather than patched, because the mitigation would be a committed SQL script — outside a report-only story.
- `[low]` `[patch]` Divergence (b): the purge of the preserved attempt was applied unevenly. The calendar-validity finding survived, but its *remedy* regressed to a form the preserved attempt had already disproved, and the preserved attempt's verified finding that `/api/manage/contacts/bulk` reaches the same validator — making CAP-4 a four-file change — was dropped without comment. **Verified by reading `lib/manage/api-handlers.ts`:** `parseContactPatch` is reached by three handlers sharing one `ALLOWED_PATCH_KEYS` (`:44`), and both apps carry both routes. Fixed: the predicate was rebuilt from scratch against live behaviour rather than inherited, and a clause now records that CAP-4's surface is four route files (`route.ts` and `bulk/route.ts` in both apps), with the handler line numbers reproduced.
- `[high]` `[patch]` Divergence (c): the `to_date` predicate is contradicted by the diff's own transcript — the finding survived the purge, the correction did not. Patched once, as the first row.
- `[low]` `[withdrawn]` Divergence (d): the Verification section described a staged `deferred-work.md` change that appeared nowhere in the review diff. **Withdrawn on re-check (2026-10-10): the underlying premise does not hold.** `_bmad-output/implementation-artifacts/deferred-work.md` has no staged or modified state — `git status --porcelain` on that path is empty — and it tops out at **DW-27**, not DW-30. There was no staged hunk to disclose and no `MM` to observe. The row was filed against a tree state that this run cannot reproduce; the corresponding disclosure has been removed from *Verification actually performed* rather than left standing.
- `[medium]` `[withdrawn]` Divergence (e): the staged `deferred-work.md` entries DW-28, DW-29 and DW-30, allegedly written against the preserved attempt's world. **Withdrawn on re-check (2026-10-10): those entries do not exist.** `grep -oE 'DW-[0-9]+' _bmad-output/implementation-artifacts/deferred-work.md` yields a maximum of **DW-27**; the ledger path is clean; and commit `80a8bce` touches only `_bmad-output/planning-artifacts/epics-contacts-grid.md`, not the ledger. There is therefore **no ledger disagreement to settle**, and the `deferred:` frontmatter entry that described it has been removed rather than left as an unverifiable claim.
- `[low]` `[patch]` Divergence (f): OQ-2 was restated as two options, omitting `SPEC.md:91`'s (c) abandon the conversion. **Verified by reading `SPEC.md:91`.** Fixed: all three options are now stated, with an explicit statement that this run reaches none of them — not (c) included, because there is no count to reason from rather than because the count is small. Two further sub-observations in the same filing (option 3 being a path absent from both the intent and `SPEC.md:91`; the `SPEC.md:26` citation correction being recorded rather than propagated) were rejected: option 3 is framed as Dwaraka's decision with nothing executed, and recording a spec citation error instead of silently propagating it is the posture `AGENTS.md` takes toward gates.

### 2026-10-10 — Review pass (over Revision 3)

- verdicts: 43 rows — high 3, medium 13, low 27, false 0, maybe-false 0
- findings:

**Reconciliation note.** The four layers filed 44 findings (blind-hunter 13, edge-case-hunter 20, verification-gap 0 findings plus 1 negative result, intent-alignment 10 divergences). **43 rows appear below.** The difference is deliberate and is recorded in the rows themselves: one edge-case-hunter finding is the same defect as a blind-hunter finding (the playbook's shape-only nulling predicate), re-derived independently and patched once; the verification-gap layer's zero result is carried as one row so the negative is visible rather than omitted. Every layer's filed finding therefore has a row, and the count reconciles: 13 + 20 + 1 + 10 − 1 duplicate = 43.

**blind-hunter (14 rows — 13 filed findings, one re-derived here from the edge-case-hunter layer)**

- `[medium]` `[patch]` The blank check's scoping sentence claimed `btrim(col) = ''` excludes `'\t'` and `'\n'`. **Verified by re-running both:** `btrim(E'\t')=''` and `btrim(E'\n')=''` are both `f` — the single-argument form strips spaces only. Fixed: the query is now `btrim(col, E' \t\n\r\f\v') = ''`, the five-value comparison is pasted, and the table check was re-run with the wide class (0, 0, 0 — unchanged). The claim changed; no count did.
- `[medium]` `[patch]` The `- verdicts:` tally read "39 findings — high 1, medium 8, low 17, false 10" and summed to **36** against 39 rows. **Verified by recounting the rows programmatically:** high 4, medium 14, low 20, false 1. Header corrected; rows untouched.
- `[high]` `[patch]` The `deferred:` entry for DW-28/29/30 and triage rows (d)/(e) rest on ledger entries that do not exist. **Verified three ways:** `grep -oE 'DW-[0-9]+' _bmad-output/implementation-artifacts/deferred-work.md` tops out at **DW-27**; `git status --porcelain` on that path is empty (no `MM`); and `git show --stat 80a8bce` touches only `_bmad-output/planning-artifacts/epics-contacts-grid.md`. There is no ledger disagreement to settle. The deferred entry is removed and rows (d)/(e) are marked `[withdrawn]` with the disconfirming evidence rather than deleted, so the correction stays auditable.
- `[low]` `[patch]` Two `## Review Triage Log`-family headings with no statement of which governs. Fixed: the summary now opens with a one-line blockquote naming the preceding section as the full log and itself as commentary, with "where the two differ, the full log governs".
- `[medium]` `[patch]` `migration-playbook.md:74-76`'s **nulling** statement uses the same shape-only `~` predicate CAP-1 does, so a shape-valid/calendar-invalid row (`2023-02-30`) is neither nulled nor reported and the `ALTER` still aborts. **Verified by reading the statement.** Fixed: a two-row table now requires story 3 to substitute `pg_input_is_valid` in **both** the nulling step and the pre-`ALTER` gate.
- `[medium]` `[patch]` `migration-playbook.md:49-53`'s `SELECT DISTINCT` ends in `LIMIT 20` with no `ORDER BY`. **Verified by reading the statement.** On the local population this is harmless (zero offenders); on hosted, where offenders are expected, it returns an arbitrary sample and `migration-playbook.md:55` would attribute the remediation from whatever came back. Fixed: recorded as a hazard with three remediation options, and a per-cause breakdown query pasted.
- `[low]` `[patch]` Triage row 1's inline verdict sequence "false/false/true/true/false" contradicts the transcript it certifies (`f, t, t, f, t`). Fixed: each value is now named.
- `[low]` `[patch]` The lede asserts and denies a connection in one clause ("connected with … and could not connect"). Fixed: the connection was **attempted** and **refused**; the pooler terminated it before authentication, so no session was established.
- `[low]` `[patch]` `grep -c "\bphone\b"` is attributed to "the three generators" but only two numbers are quoted. **Verified by running it per file:** 12 / 7 / **0**. All three now given, with the third's zero noted.
- `[low]` `[reject]` `## Auto Run Result` is absent while three triage rows claim it exists. Rejected as workflow-owned and transient: this step's Finalize writes it, and the rows that reference it are historical entries describing the pass that wrote them.
- `[low]` `[reject]` No run identifier or timestamp anywhere, so per-section "this attempt" claims cannot be attributed. Rejected: `created: '2026-10-10'`, `baseline_revision: 6d20168` and the dated revision entries do that job; adding more is cosmetic.
- `[low]` `[reject]` The authorization is duplicated in `stories.yaml` and the story file and can drift. Rejected: `stories.yaml` is the caller's orchestration field and the story file holds the authoritative text; the intent itself introduced the `stories.yaml` exception paragraph.
- `[medium]` `[reject]` Two `git status` disclosures contradict each other (`Explicitly not done` shows two files; triage divergence (d) claims `MM deferred-work.md`). **Superseded by the `[high]` DW-28/29/30 row above**, which resolves the underlying fact: the `MM` state never existed. Rejected here as the same defect already routed.
- `[low]` `[reject]` `followup_review_recommended: true` set with no stated rationale. Rejected as workflow-owned: this pass's Finalize recomputes the field from its own patched-entry counts.

**edge-case-hunter (18 rows — 20 filed findings, one duplicated above and one rejected as already patched)**

- `[medium]` `[patch]` `pg_input_is_valid` is recommended for story 3 without confirming the hosted instance can run it. **Verified: local `server_version_num` is 170006; the hosted version was never observed** because no session opened. Fixed: added to *What this attempt did not verify*, with the PostgreSQL 16+ requirement stated.
- `[medium]` `[patch]` If the hosted columns are already `date`, every `~` bucket predicate errors. **Verified live:** `SELECT '1985-03-12'::date ~ '^\d{4}'` → `ERROR: operator does not exist: date ~ unknown`. The hosted `information_schema` check was withheld because it is outside the `public.contacts` grant, so the type is unknown. Fixed: recorded, with the requirement that the gate confirm `data_type` before applying `~`.
- `[high]` `[patch]` A `prefix_with_trailing` row passes the recommended gate and is silently truncated. **Verified by reading the report's own cast section:** this is CAP-3's *intended* behaviour, and the gate's purpose is to detect what would make the cast throw, not what it would discard. The report already states the truncation is deliberate. Rejected on the merits — but the **reporting** half is real and is routed in the next row.
- `[high]` `[patch]` The report gives story 3 a gate but never flags that the playbook's nulling step uses the shape-only predicate, so the *reported-then-nulled* row set would omit `2023-02-30` and the ALTER would abort after the ids were recorded. **Verified by reading `migration-playbook.md:74-76`.** This is the same defect as blind-hunter's fifth row, re-derived independently; patched once.
- `[low]` `[reject]` Grep-absence (`grep` finds no column name) does not prove a column is never written — an insert built from spreads or dynamic keys would evade it. **Refuted by the report's own evidence:** the before/after re-read shows 0 non-null values in all three columns on all 261 rows, which is a direct measurement, not an inference from grep. The grep corroborates it.
- `[low]` `[reject]` The before/after table checks aggregates, not values, so a value-level write to an unchecked column would be undetected. **Refuted:** only five aggregate measures are listed but the non-null counts for the three audited columns **are** among them (0→0), and every statement issued was a `SELECT`. A `SELECT` cannot write a value.
- `[low]` `[reject]` `left(col,10)` ignores a timezone offset on a timestamped row. **Refuted as scoped:** CAP-3 deliberately truncates, the write path emits date-only strings, and `SPEC.md:64` forbids exactly the `AT TIME ZONE` that would introduce the shift. The report cites this constraint.
- `[low]` `[reject]` `btrim(col, E' \t\n\r\f\v')` proposed by this layer — already applied by the blind-hunter `[medium]` patch. Carried, not re-patched.
- `[low]` `[reject]` `pg_typeof(col)` guard suggested for the hosted gate. Rejected: `data_type` from `information_schema` is the correct source and the report already requires it be confirmed; a `pg_typeof` guard would add surface without adding a decision.
- `[low]` `[reject]` Frontmatter `status: in-review` vs a body reading blocked. Rejected as workflow-owned and transient — the terminal HALT writes `blocked`, which is what the body says. This is the fourth layer to raise it and the fourth rejection on identical grounds.
- `[low]` `[reject]` `## Status` section removed. Rejected: the lede and the `Blocking condition` section both carry it; a third heading stating the same thing adds no reachable information.
- `[medium]` `[reject]` Revision 3 claims earlier revisions' entries "remain a record of what was true then" while deleting Revision 1's `## Auto Run Result` and its verification list. **Verified as a real deletion** — the diff removes them. But the deleted material is Revision 1's own run result, which this workflow overwrites by design each run, and Revision 3's wording was corrected to name what actually survives (Revision 2's entry and this run's). Rejected on scope: restoring a superseded run result would misrepresent the current state.
- `[low]` `[reject]` No placeholder section for where the future hosted verdict and offender ids will be written. **Refuted:** the `### Where OQ-2 stands after this attempt` decision table *is* that placeholder — it names the input, the mapping and the destination ("record the counts, the verdict, and the offender ids in this file" is the report's own standing instruction).
- `[medium]` `[reject]` The password's validity is untested and would be carried forward unflagged after the URL is fixed. **Refuted by the report's own text:** "it is neither confirmed good nor implicated" — the file already states this and lists it under what was not verified. A reviewer restating a caveat the file already carries is not a defect.
- `[low]` `[reject]` The hosted script at `/tmp/opencode/hosted-audit.sql` is unrun and unreconstructible because the calendar gate and `btrim` check are not in `migration-playbook.md:18-55`. Rejected: the residual-risk register already tells the next run to reconstruct from the file, and the calendar gate **is** now pasted verbatim in the report. The `btrim` variant is pasted too.
- `[low]` `[reject]` "No file other than this one was modified" while `stories.yaml` is in the change set. **Refuted by `git status`:** `stories.yaml` was staged before this run began and the report says so explicitly in the same bullet.
- `[low]` `[reject]` The `Explicitly not done` porcelain block shows staged `M `/`MM` while the live tree shows ` M`. Rejected: the live ` M` state is this workflow's `git add -N` / `git reset` staging of the diff, performed after the report was written; the report's snapshot was accurate when taken and is labelled as a snapshot.
- `[medium]` `[reject]` The CAP-4 four-route-file finding appears in no deferred entry or hand-off. Rejected: `stories.yaml` story 3's `invoke_dev_with` already names `optionalIsoDate` as the CAP-4 target and requires the migration and validator to land together. The report's addition is detail on a task already assigned, not an unassigned defect.

**verification-gap (0 gaps, 0 other findings)**

- `[low]` `[reject]` No verification gaps. The layer's negative result is reported rather than omitted. Nothing in the diff introduced behaviour a test would be expected to cover — one markdown report, no source file changed.

**intent-alignment (10 divergences)**

- `[medium]` `[reject]` Divergence (a): the intent's expectations live at two database surfaces (local Postgres, hosted Supabase) while the diff's changes and checks are prose plus two text gates that never open a connection. **Refuted as a defect:** the intent states "The output is a report, not code". A non-re-executable artifact is the requested deliverable, and the report is candid that no gate touches the database. The mitigation — a committed SQL script — is outside a report-only story and is recorded as residual risk instead.
- `[medium]` `[reject]` Divergence (b): under R2 ("deciding reading"), the exception was granted so OQ-2 *could* be decided, so producing no hosted number is non-completion. **Refuted by the environment, not by choice:** the connection was refused by the pooler before authentication, and the intent's own instruction is "re-escalate if the file or connection is absent". Refusing to fabricate the number is what the intent demands; the blocker is recorded as `deferred` with its fix.
- `[medium]` `[reject]` Divergence (c): the run diagnosed the *content* of the credential (tenant form, absent query parameters) and stopped on that, which is stricter than "re-escalate if the file or connection is absent". **Refuted:** the diagnosis reports property names and presence flags only, discloses no value, and the intent forbids *acting on* another credential, not diagnosing the authorized one. Fixing the file is explicitly left to Dwaraka.
- `[low]` `[reject]` Divergence (d): `stories.yaml` gained a seven-line restatement of the exception that the intent did not ask for. **Refuted:** that paragraph is verbatim the intent's own `invoke_dev_with` text and was staged before this run began; the report discloses it as pre-existing rather than claiming it.
- `[low]` `[reject]` Divergence (e): the report asserts a third file (`epics-contacts-grid.md`) was swept into a prior commit, which is absent from this diff so the disclosure cannot be checked from the change under review. **Refuted:** it is a disclosure about tree state, and `git show --stat 6d20168` confirms the commit contents. An accurate disclosure of an action taken in a prior run is not a defect.
- `[low]` `[reject]` Divergence (f): the intent says "Do NOT proceed to the migration" while the report prescribes a cast-safety predicate, characterizes CAP-4's blast radius and offers a migration design as unblock option 3. **Refuted:** prescribing is not proceeding — no `ALTER`, no migration file, no code change exists in the diff, and OQ-2 option (b) is itself "block the migration until repaired", so handing Dwaraka a choice is the handoff the story exists to make.
- `[low]` `[reject]` Divergence (g): the report asserts no hosted row was read and no write was attempted, attestable only in prose. Rejected: the intent makes these hard constraints precisely because they cannot be independently attested; the report discharges them with a shape-only table, a redacted-output claim and an explicit constraint-compliance section. Nothing more is available at this surface.
- `[low]` `[reject]` Divergence (h): the intent's "never print the URL" cannot be verified from the diff. Rejected on the same basis — a negative credential-disclosure claim has no artifact by construction.
- `[low]` `[reject]` Divergence (i): frontmatter `status: in-review` while the body reads blocked, so a machine reader sees the story as reviewable rather than gated. **Rejected as workflow-owned and transient**, identical grounds to the edge-case-hunter row of the same claim; the terminal HALT writes `blocked`.
- `[low]` `[reject]` Divergence (j): the report removes an earlier revision's transcribed hosted numbers, which the intent neither asks for nor forbids. Rejected: leaving an unverified transcription in place would invite it to be read as this run's finding, and the intent's "do not trust prose numbers" is the governing instruction. The removal is documented in place.

**Grouping and routing**

Survivors group into four root causes. **Patch (9 rows).** (1) *Claims that overstate what a check proved* — the `btrim` whitespace scope, the verdict-sequence mismatch, the three-file/two-number `phone` grep, the self-contradicting lede, and the non-reconciling `- verdicts:` tally: five defects, one root, all corrections to statements rather than measurements. (2) *Ledger state asserted but not reproducible* — the DW-28/29/30 deferred entry and triage rows (d)/(e): routed to `patch` rather than `defer` because the deferred list is this run's own frontmatter and leaving a phantom entry in it would misfile an unverified claim as known-unresolved. (3) *The playbook's own predicates under scrutiny* — the `:74-76` nulling statement and the `:49-53` `LIMIT 20`: both would mislead story 3, both fixed by recording the hazard and the required substitution. (4) *Hosted-surface assumptions never observed* — `server_version_num` and the hosted column type: added to what was not verified rather than asserted. No entry routed to `intent_gap` or `bad_spec`: every divergence the intent-alignment layer filed resolves to a `reject` with the reason stated, or to one of the four patch groups above. One entry routed to `defer` (the hosted connection string), which is pre-existing and is not this story's to fix.

**Grouping and routing**

Survivors group into five root causes. The single `high` and the two `medium` rows that share its root cause — a recommendation the report could not stand behind — route to `patch` and were fixed together: the predicate is rebuilt on verified behaviour, both of its failure modes are recorded, and the gap is demonstrated for both buckets. Two further groups route to `patch` as direct corrections adding no surface: deletions of on-record material (the Resolution, the epics provenance, the residual risks, the condensed-log disclosure), which cost the artifact auditability without removing a defect; and under-evidenced claims (the import era, the `year` signature, the blank check's scope, the unexplained `phone`, the missing `SPEC.md:91`, the read-only claim's scope, the API surface, OQ-2's third option). One group routes to `defer` as pre-existing and not this story's file. Four claims are rejected as `false` — unblock option 3's regex guard (already answered in the same paragraph), `baseline_revision` (workflow-mandated and correct), and twice on the frontmatter status (workflow-owned and resolved by the terminal status). No `intent_gap` and no `bad_spec` entry was created: every intent-alignment divergence resolves to a `patch`, a `defer`, or a rejection with a reason.

## Review Triage Log — summary of the 2026-10-10 review pass

> **Relationship to the section above.** The section immediately preceding this one, `## Review Triage Log`, **is the full log** — all 39 rows, uncondensed. *This* section is a condensed commentary on it and introduces no rows of its own. Where the two appear to differ, the full log above governs.

_This is a **condensed summary**, not the complete log. The 2026-10-10 review pass over the previous revision of this file raised **27 findings across 4 layers**: edge-case-hunter (5), blind-hunter (16), verification-gap (0), and intent-alignment (6 divergences filed). The rows below are the survivors that affect the report's substance._

**What was condensed, and why.** Three whole groups were dropped without an individual row each, which should not be mistaken for them having been dismissed on the merits:

- **12 `[false]` verdicts** (`blind-hunter` and one `edge-case-hunter`) — findings the reviewers themselves judged false at the time. They were self-rejecting by their own classification and carry no corrective action.
- **The `verification-gap` layer returned 0 findings.** Its absence is a real observation, not an omission, so the layer is named here rather than dropped silently.
- **6 `intent-alignment` divergences** — 2 resolved to `patch` and are represented below; the remaining 4 were rejected as inherent to a report-only story (a test-free diff is correct when the deliverable is a report and no source changed) or as facts the story has no basis for. They are not reproduced individually because none produced a change to the report.

The findings the re-run above independently reproduced, rather than inheriting, are the two `[medium]`/`[high]` rows on castability and on the API write path. Both were re-derived from the tree and the live database this run._

- `[high]` `[patch]` The playbook's `exact_iso` bucket does not establish calendar validity, so it cannot prove castability. Verified this run against the local stack (see *CAP-1's own bucket predicates do not establish castability*). Carried forward, and now stated as a required addition to story 3's pre-`ALTER` check.
- `[medium]` `[patch]` Claiming the import is the only writer of a bad value was false — `optionalIsoDate` validates the prefix only. Verified by reading the function. Re-derived this run; the report now scopes the import as the widest hole and cites the grid's stricter check as contrast.
- `[medium]` `[patch]` A citation attributed `manage.ts:573` to `data.ts`. Fixed; the reads are now attributed to `lib/supabase/manage.ts`, and the full grep result is reproduced so the sweep is reproducible.
- `[low]` `[patch]` CAP-1 queries run unscoped while `contacts` holds two programs. Verified by `GROUP BY program_id`. Recorded as *Program scope*, with the reason it is immaterial here and the reason it should still be decided deliberately next time.
- `[medium]` `[patch]` Removing a prior `Resolution` section destroyed an audit trail. Substance retained in a section of its own, *Note on the prior resolution recorded in this file*, separate from the removal of the hosted numbers.
- `[low]` `[patch]` No `## Status` section linking the block to story 3 — present as the lede and the *Blocking condition*.
- `[low]` `[reject]` No acceptance criteria block. CAP-1's deliverable is the report itself; all six required measures plus the DISTINCT are present.
- `[low]` `[reject]` Unblock options lack an owner/deadline. The approver is named throughout; inventing a deadline would be a fact this story has no basis for.
- `[low]` `[reject]` SQL not inlined so numbers cannot be re-derived. The canonical text is `migration-playbook.md:18-55`, cited by line; the statements *not* in the playbook (the castability pair, the `information_schema` check, the blank check, the population checks) are inlined where they matter.
- `[low]` `[reject]` Machine-readable blocked-reason field in frontmatter. No such field is defined by the workflow; the frontmatter `status` is left as instructed and the block is stated in the body.

## Spec Change Log

_Revision 3.1 of this file — a **corrections-only** pass. A review of Revision 3 raised eight defects in claims rather than in measurements. Fixed, with nothing measured, no verdict and no blocking condition altered:_

_(a) The adjacent blank check's scoping sentence claimed `btrim(col) = ''` excludes `'\t'` and `'\n'`. It does not — `btrim()`'s single-argument form strips **spaces only**. Re-run live: `btrim(E'\t')=''` and `btrim(E'\n')=''` are both **`f`**. The query is now `btrim(col, E' \t\n\r\f\v') = ''`, the five-value comparison is pasted, and the table check is re-run with the wide class (0, 0, 0 — unchanged). The `btrim` **claim** changed; no count did._

_(b) The `## Review Triage Log` `- verdicts:` tally read "39 findings — high 1, medium 8, low 17, false 10" and summed to 36. Recounted from the 39 rows: **high 4, medium 14, low 20, false 1**. Header corrected; rows untouched._

_(c) The `deferred:` entry for DW-28/29/30 and triage rows (d) and (e) rested on ledger entries that **do not exist**. `deferred-work.md` tops out at **DW-27**, `git status --porcelain` on that path is empty, and commit `80a8bce` touches only `epics-contacts-grid.md`. The deferred entry is **removed** and rows (d)/(e) are marked `[withdrawn]` with the evidence that disproved them, rather than deleted, so the correction is auditable._

_(d) The two `## Review Triage Log` headings did not state which governed which. The summary now opens with a one-line blockquote naming the preceding section as the full, uncondensed log and itself as commentary on it._

_(e) Added: the playbook's **nulling** step (`migration-playbook.md:74-76`) uses the same shape-only predicate as CAP-1, so a shape-valid/calendar-invalid row is neither nulled nor reported and the `ALTER` still aborts. A two-row table now states that story 3 must substitute `pg_input_is_valid` in **both** the nulling step and the pre-`ALTER` gate, and must not follow `:74-76` verbatim._

_(f) Added: the playbook's `SELECT DISTINCT` (`:49-53`) carries `LIMIT 20` with no `ORDER BY`, which on a hosted population with mixed offender causes returns an arbitrary sample and can attribute the remediation to the wrong cause. The hosted re-run must drop the `LIMIT`, add a deterministic `ORDER BY`, or use an exhaustive per-cause breakdown (pasted), and must record values not just a count._

_(g) Added to *What this attempt did not verify*: the hosted `server_version_num` was never observed, so `pg_input_is_valid` (**PostgreSQL 16+**, verified present on local 17.6) is recommended for story 3 without being confirmed available hosted; and if the hosted columns are already `date`, every `~` bucket predicate in the CAP-1 gate errors with `operator does not exist: date ~ unknown` — verified live against a `date` literal — so the gate must confirm `data_type` before applying `~`._

_(h) Triage row 1's inline verdict sequence read "false/false/true/true/false" against a transcript reading `f, t, t, f, t`. Corrected to name each value._

_(i) The lede's first sentence both asserted and denied a connection ("connected with … and could not connect"). Rewritten to say the connection was **attempted** and **refused**._

_(j) Signal 4 attributed `grep -c "\bphone\b"` to "the three generators" while quoting two numbers. Re-run per file: **12** / **7** / **0**. All three now given._

_Not changed: every measured number, every verdict, and every blocking condition. Revision 3's local audit, the hosted-attempt record, the OQ-2 verdict table, the evidence trail and the provenance section stand as written._

_Revision 3 of this file (this attempt) **re-ran the entire local CAP-1 audit from scratch** — all 33 result sets, in one `psql -f` invocation — and confirmed every local figure below independently, inheriting nothing. It then **exercised the standing hosted authorization**: it read `HOSTED_AUDIT_READONLY_URL` from the gitignored `.env.hosted-audit.local`, prepared the full hosted read-only script, and attempted the connection. **The connection was refused** (`ENOIDENTIFIER`, no tenant identifier on the Supavisor pooler), so no hosted statement ever ran and **no hosted number exists to report**. Per the authorization's own terms this run stopped and re-escalated rather than falling back._

_Added: a `## Hosted audit result` section recording the attempt in full — what was attempted, the verbatim failure, a credential-shape-only diagnosis (property names and presence flags; **no URL, username, password or project reference printed anywhere**), an explicit constraint-compliance statement covering the no-disclosure and no-fallback obligations, an enumeration of exactly which CAP-1 outputs remain unmeasured, and the three concrete ways the connection string can be corrected. Under *What this means for OQ-2*, a `### Where OQ-2 stands after this attempt` subsection restating that the verdict is still undecided but that the blocker has moved from authorization to a broken credential, plus an explicit decision table mapping hosted `not_a_date` count **and the DISTINCT's character** to a verdict — with the two middle rows making the long-numeric-string-versus-words distinction concrete and stating that this story nulls nothing under any count. `## Explicitly not done` and `## Verification actually performed` were rewritten to this attempt's actions, including a new "what this attempt did *not* verify" subsection naming the unverified read-only-role scope, the unverified hosted column types, and the unrun hosted script._

_Also updated: the lede (the block is now a refused connection, not a missing approval); the local audit header (marked re-run and reproduced); unblock option 1 (approval recorded as already given, with the missing piece identified as the connection) and a new option 0 for fixing it; the `Blocking condition` (approval satisfied, mechanism blocked); the prior-`Resolution` note (no longer claims the hosted audit was never attempted); and the residual-risk register (two new items: a refused connection is not evidence of clean data, and the unrun hosted script is the only copy of those queries)._

_Not changed in substance, and still verified: all local audit findings, the castability analysis and the `pg_input_is_valid` gate, the evidence trail, the review triage log, and the earlier revisions' entries below, which remain a record of what was true then._

_Revision 2 of this file (same run as below, review follow-up), all corrections re-verified against the live local stack and the tree: the `to_date(...) IS NULL` recommendation was **self-contradictory and wrong** — `to_date` raises rather than returning `NULL` on `2023-02-30`, and silently coerces `35000` to `35000-01-01` — and is replaced with a `pg_input_is_valid(left(col,10),'date')` predicate, demonstrated live on five values and argued to mirror the cast rather than approximate it. The castability gap is now shown for `prefix_with_trailing` as well as `exact_iso`. The two criticised regexes are inlined. The blank check now also runs `btrim`, with an explicit statement of what it does and does not exclude. The read-only claim is scoped to the database and evidenced by an after-the-fact re-read. Signal 3 no longer claims an uncited "import era"; signal 4 records the `year` grep and interprets `phone`. `SPEC.md:91` is added to the evidence trail and OQ-2's third option (c) is restored, with a statement that this run reaches none of the three. The prior `Resolution` is restored as a decision, separate from the removed hosted numbers. The epics-file provenance and the residual-risk register are restored. The Review Triage Log is retitled as a summary of a 27-finding pass, with what was condensed and why stated._

_Unchanged and still correct as recorded previously: the finding that `exact_iso` cannot establish calendar validity, the finding that the API's prefix-only validator is a second route by which a non-date reaches these columns, and the observation that the three nulls are specific to these columns while adjacent columns are populated._


## Auto Run Result

**Status: blocked.** The local CAP-1 audit ran and is recorded above. The hosted audit was authorized, attempted, and **could not connect** — the pooler refused before authentication. **OQ-2 remains undecided: no hosted number exists.** Story 3 stays gated; no `ALTER` was run and nothing here authorizes one.

### Summary of implemented change

**No code.** One report file was written, corrected, reviewed and corrected again.

1. **Local CAP-1, re-run from scratch.** The playbook's queries (`migration-playbook.md:18-33`, `:39-43`, `:49-53`) were issued verbatim against the local stack in a single `psql -f`, 33 result sets. Per column: `total` 261, `nulls` **261**, `exact_iso` 0, `prefix_with_trailing` 0, `not_a_date` 0 — for all three of `date_of_birth`, `initial_contact`, `last_contacted_on`. Offender-by-id: 0 rows each. `SELECT DISTINCT` of `not_a_date`: 0 rows each. The zeros are **null-derived**, not parse-derived: no Airtable-imported row exists on this stack (`source` is 250 `preview-fixture-bulk` + 7 null + 4 `preview-fixture`; `public.airtable_id_map` is empty), so zero offenders over an unpopulated population is **not a green light**.
2. **The standing hosted authorization was exercised.** `.env.hosted-audit.local` was read, `HOSTED_AUDIT_READONLY_URL` loaded, the full CAP-1 script prepared, and one connection attempted. It failed: `FATAL (ENOIDENTIFIER) no tenant identifier provided` from the Supavisor transaction pooler on `:6543` — the URL supplies neither a `postgres.<ref>` username nor a `tenant` parameter. **Zero statements reached the hosted server.** No fallback credential, no inferred project ref, no substituted local numbers, and **no credential value printed, logged, written or committed** — the diagnosis reports property names and presence flags only.
3. **OQ-2 left undecided, with its decision rule written down.** A table maps hosted `not_a_date` count **and the character of the DISTINCT values** to a verdict: zero → proceed; a handful of long numeric strings → `text()` stringified an Airtable *number* field, fix the writer; a handful of words → free-text field, fix the Airtable base; many → **BLOCK**, do not null. **Nothing was nulled under any count.**
4. **Three findings recorded for story 3, each verified live:** CAP-1's regex buckets do not establish calendar validity; `to_date(...) IS NULL` raises rather than returning `NULL` and silently coerces `35000` to `35000-01-01`; `pg_input_is_valid(left(col,10),'date')` mirrors the cast exactly and is the recommended predicate. The playbook's own **nulling** statement (`:74-76`) and its **`SELECT DISTINCT`** (`LIMIT 20`, unordered) are both flagged as hazards.

### Files changed

- `_bmad-output/specs/spec-contacts-date-types/stories/1-data-audit-of-the-three-contacts-date-columns.md` — the audit report, the hosted-attempt record, the OQ-2 decision table, two review passes' triage logs, and this result. **The only file authored by this run.**
- `_bmad-output/specs/spec-contacts-date-types/stories.yaml` — **not authored here.** The hosted-access exception paragraph was staged in the index before this run began; it is disclosed in the report rather than claimed as this run's work.

### Review findings breakdown

Two review passes ran over this file.

**Pass 2 (this run), 43 rows over 4 layers** — blind-hunter 13, edge-case-hunter 20, verification-gap 0 (+1 negative-result row), intent-alignment 10; one cross-layer duplicate counted once. Verdicts: high 3, medium 13, low 27, false 0, maybe-false 0.

**Patches applied (9 rows, 4 root causes):**
- *Claims that overstate what a check proved* (5 rows) — `btrim(col)` does **not** exclude `'\t'`/`'\n'` (verified: both return `f`); query widened to `btrim(col, E' \t\n\r\f\v')` and re-run; the triage verdict sequence corrected to `f,t,t,f,t`; the `phone` grep re-run per file (12 / 7 / **0**); the self-contradicting lede rewritten; the non-reconciling `- verdicts:` tally recounted.
- *Ledger state asserted but not reproducible* (1 row) — `deferred-work.md` tops out at **DW-27**, its git state is clean, and `80a8bce` touches only the epics file. The DW-28/29/30 deferred entry is **removed**; triage rows (d)/(e) marked `[withdrawn]` with the disconfirming evidence rather than deleted.
- *The playbook's own predicates under scrutiny* (2 rows) — the shape-only nulling statement at `:74-76` and the unordered `LIMIT 20` DISTINCT at `:49-53`, both recorded as hazards with the required substitution.
- *Hosted-surface assumptions never observed* (2 rows) — `server_version_num` (PG 16+ needed for `pg_input_is_valid`) and the hosted column type (`date ~ text` errors — verified live), both added to what was **not** verified.

**Deferred (1):** the hosted connection string points at the Supavisor pooler with no tenant identifier. Pre-existing, not this story's to fix — correcting a credential file is Dwaraka's. The single `deferred:` entry.

**Rejected (33 rows), each with its reason recorded.** The four recurring rejections: frontmatter `status` versus the body (**4 layers, identical grounds** — workflow-owned and transient, the terminal HALT writes `blocked`); the report-only deliverable having no committed test (**refuted by the intent itself** — "the output is a report, not code"); grep-absence not proving a column is never written (**refuted by the before/after re-read**, a direct measurement); and findings already answered inside the report itself.

### Follow-up review recommendation: `true`

Patched this pass: **1 `high`, 4 `medium`, 4 `low`**. On a first pass, a patched `high` sets the flag on its own.

**The specific unverified risk a follow-up should look at.** The `high` patch removed the DW-28/29/30 `deferred:` entry after three independent checks said those entries do not exist, and marked triage rows (d)/(e) `[withdrawn]`. That correction was verified here against `deferred-work.md`, `git status` and `git show --stat 80a8bce` — but **the ledger itself was not re-read as a whole**. If a later run finds entries that were restored or added under those numbers elsewhere in the ledger, this file's withdrawal would be wrong in the opposite direction. A follow-up should re-read the ledger's tail and confirm the withdrawal still holds, rather than trusting the withdrawal itself.

Nothing measured was altered by any patch — all nine corrected statements about checks, not the checks' results, and the headline numbers were re-confirmed by an independent query after the patches landed.

### Verification performed

| Command | Result |
|---|---|
| `pnpm supabase:status` | Exit 0. Local URL read from output, not assumed: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. CLI 2.98.2 (pinned per `package.json:23`, `:27`). |
| `psql … -f audit.sql` (CAP-1, local) | **Exit 0.** 33 result sets, all five measures plus offender list and DISTINCT per column, PostgreSQL 17.6. Every figure in the report is this invocation's output. |
| `psql … -f audit.sql` — hosted variant | **Exit 2 — connection refused.** `ENOIDENTIFIER`, no tenant identifier, pooler `:6543`. **Zero statements delivered.** |
| `git check-ignore -v .env.hosted-audit.local` | Exit 0 → `.gitignore:33` (`.env*.local`). Genuinely gitignored. |
| `pnpm test:static` | **Exit 0.** Guardrails passed. Typecheck 6/6 packages Done. Lint **0 errors, 12 warnings**, all pre-existing in files this run did not touch. |
| Independent re-check after patches | `SELECT count(*), … FROM contacts` → `261 \| 261 \| 0 \| 0`, confirming the report's headline numbers. `btrim(E'\t')=''` → `f`. `'…'::date ~ '^\d{4}'` → `ERROR: operator does not exist: date ~ unknown`. |
| `pnpm test:airtable-removal` | **Exit 1 — 3 of 30 fail (27 pass). PRE-EXISTING**, the documented set; this run changed one markdown file, so it cannot be the cause of a source-scanning gate. Gate not edited. |
| `pnpm test` | **Not run, and not reported as a pass.** Runs zero tests and exits 0. |
| e2e | **Not run.** No source file changed, so no spec covers this story. Not a claim that e2e passed. |

### Residual risks

- **The one measurement that decides OQ-2 has never been taken.** Everything above is the absence of data, not the presence of good data.
- **A refused connection is not evidence of clean hosted data.** It proves nothing in either direction — it fails at the pooler, before authentication. The password's validity is untested and may need re-checking once the URL is fixed.
- **Nothing in the repository re-derives these numbers.** No committed script or test encodes CAP-1; the SQL lives at `/tmp/opencode/audit.sql` and `/tmp/opencode/hosted-audit.sql`, outside the repo and not surviving a reboot. The canonical query text is `migration-playbook.md:18-55`, and the non-playbook statements are pasted into the report.
- **Toolchain drift.** The Supabase CLI is pinned to 2.98.2 and reports 2.120.0 available; a different-version stack could differ in `pg_input_is_valid` availability or schema defaults, and since nothing re-derives the numbers automatically, drift would make the report quietly wrong rather than trip a check.
