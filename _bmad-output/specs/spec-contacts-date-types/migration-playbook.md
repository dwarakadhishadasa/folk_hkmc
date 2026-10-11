# Migration playbook

Binding for CAP-3 and CAP-4. Read `existing-state.md` first — every hazard below is sourced there.

## Order of operations

The order is not interchangeable. CAP-2's decision changes what CAP-3 migrates, and CAP-4 must land in the same change as CAP-3 or a valid value starts failing.

1. **CAP-1 — the audit.** Read-only. Nothing else starts until its output has been read.
2. **CAP-2 — decide `last_contacted_on`'s meaning.** A decision, not necessarily code.
3. **CAP-3 + CAP-4 together** — the migration and the tightened validator. Never one without the other.
4. **CAP-5 — verify**, then **CAP-6 — confirm nothing else moved.**

## CAP-1 — the audit

Run against the local stack. Per `AGENTS.md`, production is not touched without asking.

```sql
-- Per column: total, null, exact ISO, valid prefix with trailing content, neither.
SELECT
  count(*)                                                        AS total,
  count(*) FILTER (WHERE date_of_birth IS NULL)                   AS nulls,
  count(*) FILTER (WHERE date_of_birth ~ '^\d{4}-\d{2}-\d{2}$')  AS exact_iso,
  count(*) FILTER (
    WHERE date_of_birth ~ '^\d{4}-\d{2}-\d{2}'                  -- valid prefix
      AND date_of_birth !~ '^\d{4}-\d{2}-\d{2}$'                -- but trailing content
  )                                                              AS prefix_with_trailing,
  count(*) FILTER (
    WHERE date_of_birth IS NOT NULL
      AND date_of_birth !~ '^\d{4}-\d{2}-\d{2}'                -- not a date at all
  )                                                              AS not_a_date
FROM contacts;
```

Repeat for `initial_contact` and `last_contacted_on`, and again for `sessions.session_date` (same shape, `FROM sessions`):

**List the offenders by id before deciding anything:**

```sql
SELECT id, name, date_of_birth
FROM contacts
WHERE date_of_birth IS NOT NULL AND date_of_birth !~ '^\d{4}-\d{2}-\d{2}';
```

**The `not_a_date` count is the whole decision.** It answers OQ-2: a handful of rows get reported and nulled, a large number means block and repair by hand.

Also check what `not_a_date` actually holds before assuming:

```sql
SELECT DISTINCT date_of_birth FROM contacts
WHERE date_of_birth IS NOT NULL AND date_of_birth !~ '^\d{4}-\d{2}-\d{2}'
LIMIT 20;
```

If the values are long numeric strings, that is `migrate-airtable-data.mjs`'s `text()` stringifying an Airtable **number** field (`existing-state.md`). If they are words, the column was free text in Airtable. The remediation differs, and neither is guessable from the count alone.

## CAP-3 — the cast

**Prefix-valid values with trailing content are truncated, not rejected.** `optionalIsoDate` exists precisely because rows hold a full ISO timestamp, and a `date` column cannot store one:

```sql
ALTER TABLE contacts
  ALTER COLUMN date_of_birth    TYPE date USING left(date_of_birth, 10)::date,
  ALTER COLUMN initial_contact  TYPE date USING left(initial_contact, 10)::date,
  ALTER COLUMN last_contacted_on TYPE date USING left(last_contacted_on, 10)::date;
ALTER TABLE sessions
  ALTER COLUMN session_date TYPE date USING left(session_date, 10)::date;
```

`left(..., 10)::date` is safe **only after the audit has confirmed every non-null value starts with a valid `YYYY-MM-DD`**. A single `"35000"` makes the whole statement fail.

**So the order inside the migration is: null the unrecoverable rows first, then cast.** And the nulling must be *reported*, not silent — the brief forbids inventing data, and quietly emptying a column is the same failure wearing a different hat:

```sql
-- Report, then null. Run the SELECT and read the ids before the UPDATE.
-- Repeat per column, on contacts and on sessions.session_date.
UPDATE contacts
SET date_of_birth = NULL
WHERE date_of_birth IS NOT NULL AND date_of_birth !~ '^\d{4}-\d{2}-\d{2}';
```

Record the count and the ids in the story file. An operator whose date of birth vanished deserves to know which rows and why.

**Do not add `USING` expressions that touch the clock.** `now() AT TIME ZONE 'Asia/Kolkata'` inside the cast would shift every date for IST users across the day boundary. `date` is timezone-naive and the write path already produces program-local calendar dates — the migration's job is only to change the type.

### Naming and reversibility

Follow the convention: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`. The latest is `20261008000000_add_airtable_id_map.sql`, so a new file sorts after it.

**Provide the down path.** `date` → `text` is a widening cast and Postgres will do it without a `USING` clause:

```sql
ALTER TABLE contacts
  ALTER COLUMN date_of_birth TYPE text USING date_of_birth::text;
```

It is lossy in exactly one direction: rows that were `NULL` after CAP-3's reporting step were not `NULL` before, and those values are gone. Say so in the down migration's comment rather than implying it is clean.

## CAP-4 — the validator, in the same change

`lib/manage/api-handlers.ts:90-100` today:

```ts
function optionalIsoDate(value: unknown, field: string): string | null {
  const date = boundedText(value, field, 40)
  if (date === null) return null
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
    throw new AuthzBadRequest(`${field} must be blank or start with YYYY-MM-DD.`)
  }
  …
}
```

It validates the **prefix** and explicitly permits trailing content. After CAP-3 that acceptance is a bug: a client sending `2026-02-31T10:00:00Z` passes the handler and is then rejected by Postgres with an error the handler never produced — which is exactly the "unreadable failure" its own comment warns about.

**Tighten to the full value, or truncate on the way in.** The choice is OQ-3; either is acceptable provided it is deliberate:

- **reject** anything past ten characters, with the handler's own message; or
- **truncate** to ten characters in `optionalIsoDate`, so the client and the column agree.

Rejecting is stricter and makes a bad value visible at the boundary. Truncating is friendlier and matches the migration. **Whichever is chosen, the same rule must appear in the migration and in the handler**, or the import path and the API path disagree about what a valid date is.

**Sessions joins the same change.** `apps/folk` and `apps/gita-life` `app/api/sessions/route.ts:129` must slice `startsAt.toISOString()` to ten characters before `createSession`, so the app stops writing the trailing content the migration truncates. No new validator module — the slice at the single call site both apps share in shape is the whole fix.

## What must be true when this is done

- `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails` green
- `scripts/apply-migrations.mjs` applies cleanly on a fresh local stack
- `pnpm test:e2e` green, one runner
- `git diff lib/supabase/types.ts` is **empty** — the regenerated file must be byte-identical, which is the check that confirms the change was type-only on the client
- The audit's counts, and the ids of any nulled rows, recorded in the story file
- `apps/folk` and `apps/gita-life` still mirrored
