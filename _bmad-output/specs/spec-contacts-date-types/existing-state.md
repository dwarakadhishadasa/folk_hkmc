# Existing state, verified

Every claim was read out of the tree. File:line references are the evidence.

**Baseline:** `feat/grid-keyboard-editors-and-theme` at `9a43c3b`.

## The four columns

`supabase/migrations/20261004000000_create_core_tables.sql`:

```sql
date_of_birth      TEXT,   -- contacts :11
initial_contact    TEXT,   -- contacts :17
last_contacted_on  TEXT,   -- contacts :18
session_date       TEXT,   -- sessions :48
```

No `date`, no `timestamp`. The neighbouring timestamp columns are real types — `created_at TIMESTAMPTZ DEFAULT now()` (`:20`) — so this is a deliberate-looking TEXT choice in the original import, not a database default.

## Why the type matters now

`spec-contacts-premium-grid` CAP-12 is building, over these exact columns:

- `is after`, `is before`, `is on or after`, `is on or before`
- `is within`, with a relative-date picker (today, yesterday, one week ago, N days ago, exact date)

Every one of those computes a real `Date` and compares. A cell holding `""` or a partial value makes `getTime()` return `NaN`, which compares false against everything — **the row leaves every date-filtered view with no error and no failing assertion.**

**The repo already knows this failure mode.** `lib/manage/api-handlers.ts:83-89`:

> *"`initial_contact` and `date_of_birth` are read as ISO dates, so an unparseable value makes the row disappear from the Contact Generation chart with no error anywhere. Blank is allowed, and anything after a leading `YYYY-MM-DD` is allowed, so contacts already holding a full ISO timestamp still round-trip."*

The handler guards the **write** path. The **migration** path never had that guard — see below.

## The two write paths disagree

**Guarded — `optionalIsoDate`, `lib/manage/api-handlers.ts:90-100`:**

```ts
const date = boundedText(value, field, 40)
if (date === null) return null
if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
  throw new AuthzBadRequest(`${field} must be blank or start with YYYY-MM-DD.`)
}
```

Prefix-only. Trailing content is **deliberately** allowed, because rows already hold a full ISO timestamp.

**Unguarded — `scripts/migrate-airtable-data.mjs:532-539`:**

```js
function text(value) {
  if (typeof value === "string") { const trimmed = value.trim(); return trimmed ? trimmed : null }
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}
```

`date_of_birth` (`:661`) and `initial_contact` (`:667`) both go through it. If Airtable held those as a **number** field, the column now contains something like `"35000"`. **A `date` column is the only thing that would have caught this** — which is the argument for doing the conversion rather than adding more application-layer validation.

## The client type ripple is zero

This corrects a claim made in the sibling spec. `lib/supabase/types.ts:154`, `:156`, `:158` already declare:

```ts
date_of_birth:      string | null
initial_contact:    string | null
last_contacted_on:  string | null
```

Supabase `gen-types` emits `string` for **both** `text` and `date`. So after the migration, regenerating `lib/supabase/types.ts` produces a **byte-identical** file, and `git diff lib/supabase/types.ts` is a free correctness check. The ripple is entirely in validation and migration.

Hand-written surfaces that keep the same `string | null` shape and need no change: `lib/supabase/manage.ts:113`, `lib/supabase/data.ts:177`/`:183`/`:109`, `components/manage/manage-types.ts:59`, `manage-contacts-table.tsx:916`. Sessions keeps the same shape too: `lib/supabase/types.ts:361`/`:377`/`:393`, `lib/supabase/manage.ts:125`, `lib/supabase/data.ts:206`, `components/manage/manage-types.ts:83`/`:97`, `components/sessions-manager.tsx:16` — all `string | null`, already correct for `date`.

## The sessions write path has no validator

`apps/folk/app/api/sessions/route.ts:129` (and the `apps/gita-life` equivalent) builds `startsAt = new Date()` and passes `sessionDate: startsAt.toISOString()` — a full timestamp — into `createSession`, which writes it straight to `session_date` (`lib/supabase/data.ts:879-887`) with no check. So unlike contacts, where trailing content is legacy import data, sessions produces trailing content on every create today. The migration must truncate it the same way, and the POST must be sliced to ten characters in the same change, or the app's own write breaks the day the column becomes `DATE`.

Readers already expect a calendar date: `manage-sessions-view.tsx:77` renders `session.sessionDate ?? "No date"`, both dashboards sort by `readTime(session.sessionDate)`, and `manage.ts:646-647` / `:669-684` compare via `Date.parse` / `calendarParts`, which behave identically on a `date`-serialised `YYYY-MM-DD`.

## RLS is not involved

`grep -c "date_of_birth\|initial_contact\|last_contacted_on\|session_date" supabase/migrations/20261006010000_scoped_rls_policies.sql` → **0**.

No policy references these columns, so the migration touches no policy and cannot weaken scoped access. This was the highest-risk unknown in the sibling spec's assessment; it is now closed.

## Timezone: already compatible, do not "fix" it

```ts
// lib/supabase/data.ts:146
const SUPABASE_DATE_TIME_ZONE = "Asia/Kolkata"
```

`currentProgramDate()` (`:269-278`) formats `new Date()` in that zone and returns `` `${year}-${month}-${day}` ``. A Postgres `date` is timezone-naive and holds exactly that.

**So the existing write path already produces the right value for a `date` column.** The danger is the opposite of the obvious one: someone "helpfully" adding `USING (col AT TIME ZONE 'Asia/Kolkata')::date` to the cast would shift every date for IST users across the day boundary. Leave the clock out of the migration entirely.

## The `last_contacted_on` bug

`lib/supabase/data.ts:614-621`:

```ts
const createdDate = currentProgramDate()

const insertPayload: Record<string, unknown> = {
  program_id: programScopedFilter(),
  name: data.name.trim(),
  phone: normalizedPhone,
  initial_contact: createdDate,
  last_contacted_on: createdDate,
}
```

Written once at **insert**, and `grep -rn lastContactedOn` across the app finds **no update path** — the only other references are the Airtable field mapping (`migrate-airtable-data.mjs:225`, `:668`), the reads in `manage.ts:573` and `manage-contacts-table.tsx:916`, and the display at `manage-favorites-view.tsx:559`.

```tsx
· Last contacted on: {selectedContact.lastContactedOn ?? "never"}
```

So every contact reports its **creation date** as the date it was last contacted, and a contact created today and never spoken to reads identically to one spoken to this morning. **This is a user-visible correctness bug today**, independent of the schema work, and it should be decided (OQ-1) before the column is converted.

## The date editor is already strict

`grid-editors.tsx:832-836` rejects `2026-02-31` rather than letting `new Date` roll it into 3 March, and writes `format(next, "yyyy-MM-dd")` (`:860`). So values arriving from the grid are well-formed. The risk is entirely in values that predate the grid or came through the import.

## Migration conventions

- `supabase/migrations/YYYYMMDDHHMMSS_name.sql`; latest is `20261008000000_add_airtable_id_map.sql`
- `scripts/apply-migrations.mjs` applies them to the local stack
- `scripts/verify-rls.mjs`, `verify-attendance-contract.mjs`, `verify-seed-local-guard.mjs` are the adjacent gates
- `AGENTS.md`: `proxy.ts` does not match `/manage` or `/api/manage/*`; Supabase CLI is version-pinned via `pnpm supabase:start`

## Policy

- `AGENTS.md`: never run `pnpm deploy:prod`, `deploy:folk:prod`, `deploy:gita-life:prod`, and never read or modify production secrets or production environment config, without asking Dwaraka.
- Therefore the audit runs against the **local** stack, and the hosted project is a separate approved step.
