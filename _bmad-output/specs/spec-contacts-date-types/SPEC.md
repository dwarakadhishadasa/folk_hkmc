---
id: SPEC-contacts-date-types
companions:
  - existing-state.md
  - migration-playbook.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate.
>
> **Location note.** Authored in `/tmp/opencode/specs/` while `bmad-loop` held the worktree clean, then moved into the repository at `_bmad-output/specs/spec-contacts-date-types/`. It is written to run **before** `spec-contacts-premium-grid`, whose date-filter operators depend on real date semantics.

# Convert the contacts and session date columns to `DATE`

## Why

A **pain to solve**, in the data rather than the interface. Four columns are declared `TEXT` and hold calendar dates — three on `contacts`, one on `sessions`:

```sql
-- 20261004000000_create_core_tables.sql
date_of_birth      TEXT,   -- contacts :11
initial_contact    TEXT,   -- contacts :17
last_contacted_on  TEXT,   -- contacts :18
session_date       TEXT,   -- sessions :48
```

Everything that makes a date column a *date* — ordering by it, comparing it to today, filtering "in the last 30 days" — is currently guaranteed by a convention rather than by a type. The convention holds: the date editor writes fixed-width `YYYY-MM-DD` (`grid-editors.tsx:860`, `:880`) and `optionalIsoDate` (`lib/manage/api-handlers.ts:90`) validates the prefix. Fixed-width ISO sorts lexicographically, so ordering is accidentally correct.

**Accidentally** is the problem. `spec-contacts-premium-grid` is about to build a filter with `is within`, `is after`, `is before` and a relative-date picker on these columns. A filter that computes a real `Date` and compares it against text is where the convention breaks: a row holding `""` or a partial value yields `NaN`, compares false against everything, and **vanishes from every date-filtered view with no error and no failing test.** The repo already knows this shape of failure — `optionalIsoDate`'s own comment says an unparseable value *"makes the row disappear from the Contact Generation chart with no error anywhere."*

Two things make this worth doing now rather than never:

- **The write path is already validated; the migration path never was.** `optionalIsoDate` guards `PATCH`, but `scripts/migrate-airtable-data.mjs` wrote these columns through a `text()` helper (`:532-539`) that returns `String(number)` for numeric Airtable fields. A column that a validated write path treats as ISO may contain `"35000"` from the import. **The type is the only thing that would have caught it.**
- **One of the three contacts columns does not mean what it says.** `lib/supabase/data.ts:614-621` writes `last_contacted_on: currentProgramDate()` at **insert** and nothing ever updates it. So "last contacted on" is "created on" for every row, and `manage-favorites-view.tsx:559` shows it to users as `Last contacted on: … or never`. Converting the column without fixing this would carefully migrate a value that lies.
- **The fourth has a live producer of trailing content.** `apps/folk/app/api/sessions/route.ts:129` (and the `apps/gita-life` equivalent) writes `startsAt.toISOString()` — a full timestamp — straight through `createSession` (`lib/supabase/data.ts:882`) with no validator. A `DATE` column forces that path to emit a ten-character calendar date, which is also what every reader (`manage-sessions-view.tsx:77`, dashboard sort, `calendarParts`) already expects.

## Capabilities

- **CAP-1 — Data audit**
  - **intent:** An operator knows exactly what is in each date column before anything is altered.
  - **success:** A query reports, per column, the total, the null count, the count matching `YYYY-MM-DD` exactly, the count with a valid prefix but trailing content, and the count that is neither; the report is read and the unconvertible rows are listed by id **before** any `ALTER` runs.

- **CAP-2 — `last_contacted_on` semantics**
  - **intent:** The column means what its name tells an operator it means.
  - **success:** The insert-time write is either removed and the column updated on each contact interaction, or the column is renamed to record creation; `manage-favorites-view.tsx:559` displays the corrected meaning; the audit and the migration both reflect the decision.

- **CAP-3 — Schema migration**
  - **intent:** The four columns store real dates, so comparisons are correct by type rather than by convention.
  - **success:** `date_of_birth`, `initial_contact`, `last_contacted_on` and `session_date` are `DATE`; the cast truncates a valid prefix with trailing content to ten characters; unconvertible values become `NULL` **only after being reported**; the change is one reversible file following the repo's naming convention; `scripts/apply-migrations.mjs` applies it cleanly against the local stack.

- **CAP-4 — Write validation matches the new type**
  - **intent:** What the API accepts is exactly what the column can store.
  - **success:** `optionalIsoDate` no longer permits trailing content, and the sessions POST emits a ten-character date instead of a full ISO timestamp; a value produced by the date editor round-trips unchanged; a full ISO timestamp submitted after deployment is either accepted-and-truncated or rejected with the handler's own message — never silently dropped by Postgres.

- **CAP-5 — Reads do not regress**
  - **intent:** Nothing downstream breaks, and date handling gets better rather than merely changing.
  - **success:** Contacts render in the grid, the dashboard Contact Generation chart still counts them, Favorites still shows the value, sessions still list with their date and dashboard ordering is unchanged, and every existing e2e row covering edit, filter and sort on a date column still passes.

- **CAP-6 — Scope preservation**
  - **intent:** Nothing outside the four columns changes.
  - **success:** No RLS policy is modified; no new route and no new authorization logic; `apps/folk` and `apps/gita-life` stay mirrored; no value is invented for a row that had none.

## Constraints

- **The audit gates the migration.** No `ALTER` runs until CAP-1's report has been read. A cast that throws partway leaves a partially-migrated table whose column has no working read path.
- **No timestamp or timezone conversion.** `SUPABASE_DATE_TIME_ZONE` is `Asia/Kolkata` (`lib/supabase/data.ts:146`) and `currentProgramDate()` (`:269-278`) already produces a program-local calendar date. Postgres `date` is timezone-naive, so the existing write path is already compatible. Introducing `now() AT TIME ZONE` would shift dates across the day boundary for IST users — the single most damaging thing this spec could do.
- **One reversible migration file.** The convention is `YYYYMMDDHHMMSS_name.sql` (latest: `20261008000000_add_airtable_id_map.sql`). The down path must be provided, because converting `date` back to `text` cannot restore values that were `NULL`.
- **Do not edit `scripts/verify-monorepo-guardrails.mjs`.** `scripts/verify-airtable-removal.mjs` asserts its contents.
- **Production is never touched.** Per `AGENTS.md`, the audit runs against the local stack. If the hosted project holds rows the local one does not, that audit requires Dwaraka's explicit approval and is a separate step.
- **Verification is the gate.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`, `scripts/apply-migrations.mjs`, `pnpm test:e2e`. `pnpm test` runs zero tests, CI does not run e2e, and one e2e runner at a time on a shared seeded database.

## Non-goals

- **No backfilling.** A contact with no date of birth keeps `NULL`. Inventing a date is fabrication.
- **No retroactive repair of imported data.** The audit *reports* bad rows; cleaning historical rows is a separate decision with its own review.
- **No UI work.** The filter modal, the date editor and the grid all belong to `spec-contacts-premium-grid`. This spec makes the storage correct so that spec's operators can rely on it.
- **No change to the attendance tables or their rollups.**
- **No `timestamptz`.** These are calendar dates with no time component and no consumer that needs one.

## Success signal

An operator opens `/manage` → Contacts, double-clicks a date of birth, picks 1985-03-12 from the calendar, and it saves. They open the filter, choose *Date of Birth · is before · one year ago*, and every row that has a date of birth and is older appears — with **no row silently missing because its value did not parse**. They create a session and it stores a ten-character calendar date that lists and sorts exactly as before. The migration's audit shows the exact counts that made the cast safe, `last_contacted_on` now updates when someone is contacted, and the local stack comes up clean on a fresh `apply-migrations` run.

## Assumptions

- **The local stack's data is representative.** The audit runs locally first. If the hosted project carries rows the local one does not, its audit is a separate approved step and the migration does not run against production without Dwaraka saying so.
- **The count of unconvertible rows is small.** If CAP-1 finds many, the decision changes from "report and null" to "block and repair manually" — see OQ-2. The audit decides this, not this spec.
- **No screen displays a contact date's time component.** OQ-3's truncation is therefore lossy only in theory. `manage-favorites-view.tsx:559` renders a plain date.

## Open Questions

- **OQ-1 — What counts as a contact interaction?** `last_contacted_on` needs a write path. Options: updated when a session attendance row is recorded for that contact, when the row is edited in `/manage`, or both. **This spec assumes attendance**, because that is the observable moment a preacher actually spoke to someone. Needs your call.
- **OQ-2 — Unconvertible values.** Rows that are not dates at all (`"unknown"`, `"35000"`). (a) set `NULL` and record every id, (b) block the migration until manually repaired, (c) abandon the conversion. **This spec assumes (a) for a small count and (b) for a large one** — the audit's count decides.
- **OQ-3 — Trailing content.** `optionalIsoDate` deliberately permits a full ISO timestamp after the date prefix because existing rows hold one, and a `date` column cannot — and the sessions POST actively writes one (`route.ts:129`). (a) truncate to ten characters in the migration and tighten the validator, slicing the sessions write to ten characters, (b) keep the column `TEXT`. **This spec assumes (a)** — no screen in this app shows the time. **Story 3 owns the sessions audit** (story 1 measured contacts and is done): the same CAP-1 queries run against `sessions.session_date` and are read before any `ALTER` on that table.

## Resolved Questions

- **Should this be its own spec, before the grid work?** Yes, and it is. `spec-contacts-premium-grid` CAP-12 builds `is within` / `is after` / `is before` / relative-date operators over these exact columns. Running it first means that spec's date operators are written against a type that guarantees them.
- **Does the client type ripple?** **No** — and this corrects the earlier spec. `lib/supabase/types.ts:154,156,158` already declare these columns as `string | null`, and Supabase `gen-types` emits `string` for **both** `text` and `date`. Regenerating the file after the migration produces byte-identical output. The ripple is entirely in **validation and migration**, not in TypeScript.
- **Does this touch RLS?** **No.** `supabase/migrations/20261006010000_scoped_rls_policies.sql` references these four columns **zero** times. The migration touches no policy.
