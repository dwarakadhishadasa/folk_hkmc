---
status: draft
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/specs/spec-contacts-date-types/SPEC.md
  - _bmad-output/specs/spec-contacts-date-types/existing-state.md
  - _bmad-output/specs/spec-contacts-date-types/migration-playbook.md
---
# folk_hkmc - Epic Breakdown (contacts date types)

## Overview

This document provides the complete epic and story breakdown for folk_hkmc, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Run order is load-bearing: `spec-contacts-date-types` runs FIRST (its DATE type is what `spec-contacts-premium-grid` CAP-12's date-filter operators are written against). Note: this file is `epics-contacts-date-types.md`, not `epics.md` — `planning-artifacts/epics.md` already holds the completed Gita Life operations breakdown and was left untouched. `epics-contacts-grid.md` already covers FR1–FR6 below alongside the premium-grid scope; this file is the date-types-only spine.

## Requirements Inventory

### Functional Requirements

Source: `spec-contacts-date-types` (CAP-1 – CAP-6):

FR1: The system shall report, per date column (`date_of_birth`, `initial_contact`, `last_contacted_on`) against the local stack, total, null count, exact-`YYYY-MM-DD` count, valid-prefix-with-trailing-content count, and not-a-date count, and list offender rows by id with a SELECT DISTINCT of the offending values, before any ALTER runs.
FR2: The system shall park `last_contacted_on` as an empty DATE field for future use — remove the insert-time write (`lib/supabase/data.ts`), null existing values only after reporting every id (they record creation, not contact), and show `never` in `manage-favorites-view.tsx` until a future feature defines the interaction.
FR3: The system shall convert the three columns to `DATE` in one reversible migration file following the repo naming convention, nulling unconvertible rows only after reporting them (recording every id), truncating valid-prefix trailing content to ten characters, with no clock/timezone expression in the cast and a documented lossy down path.
FR4: The system shall tighten `optionalIsoDate` (`lib/manage/api-handlers.ts`) to agree exactly with the `DATE` type (reject or truncate trailing content) in the same change as the migration, so no accepted value can later fail at Postgres.
FR5: The system shall keep all reads working after conversion: contacts render in the grid, the dashboard Contact Generation chart still counts them, Favorites still shows the value, and every existing e2e row covering date edit/filter/sort still passes.
FR6: The system shall change nothing outside the three columns: no RLS modification, no new route, no new authorization logic, both apps mirrored, no invented values.

### NonFunctional Requirements

NFR1: The audit gates the migration — no ALTER runs until the CAP-1 report has been read; a cast that throws partway leaves a partially-migrated table with no working read path.
NFR2: No timestamp or timezone conversion — Postgres `date` is timezone-naive and the existing `currentProgramDate()` (Asia/Kolkata program-local calendar date) is already compatible; introducing `AT TIME ZONE` shifts dates across the day boundary.
NFR3: Verification is the gate: `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`, `scripts/apply-migrations.mjs` on a fresh local stack, `pnpm test:e2e` (one runner, 5–7 min, shared seeded database). `pnpm test` runs zero tests and is not a gate; CI does not run e2e; `pnpm build` is not a type gate (`ignoreBuildErrors`).
NFR4: Production is never touched — audit and migration run against the local stack; a hosted-project audit is a separate Dwaraka-approved step.
NFR5: Date comparisons are correct by type after conversion; unparseable values are handled explicitly with a visible reason — rows never silently vanish from filtered views or the Contact Generation chart.
NFR6: No backfilling (NULL stays NULL), no retroactive repair of imported data beyond report-and-null, no `timestamptz`, no attendance-table changes.

### Additional Requirements

AR1: One reversible migration file following `supabase/migrations/YYYYMMDDHHMMSS_name.sql` (latest: `20261008000000_add_airtable_id_map.sql`); down path `date` → `text` via `USING col::text` with a comment stating rows nulled in the up path are not restored.
AR2: Null-then-cast order inside the migration: report and record ids/counts first, UPDATE unrecoverable rows to NULL, then `ALTER ... TYPE date USING left(col, 10)::date`.
AR3: The migration and the `optionalIsoDate` tightening land in the same change (OQ-3: reject past ten chars or truncate on the way in — same rule in both places).
AR4: Client type ripple is zero — Supabase `gen-types` emits `string` for both `text` and `date`, so regenerated `lib/supabase/types.ts` must be byte-identical (`git diff` empty); hand-written `string | null` surfaces need no change.
AR5: RLS is untouched — `20261006010000_scoped_rls_policies.sql` references these columns zero times.
AR6: Both apps stay mirrored (`apps/folk` and `apps/gita-life`); no new route, no new authorization logic; do not edit `scripts/verify-monorepo-guardrails.mjs` (`verify-airtable-removal.mjs` asserts it).
AR7: Record the audit counts and every nulled-row id in the story file; update `matrix-coverage-map.md` in the same commit if a row retires; never commit a deliberately broken spec (generate failures into a temp dir, remove in a `finally`).

### UX Design Requirements

No standalone UX design doc exists for this scope; per SPEC Non-goals there is no UI work except the CAP-2 display correction. The SPEC trio is the design authority.

UX-DR1: Park the single user-visible date label in scope — `manage-favorites-view.tsx:559` renders `never` for `last_contacted_on` (empty DATE, no time component) until a future feature defines the interaction; no other UI work.

### FR Coverage Map

FR1: Epic 1 - Per-column audit with offender ids before any ALTER.
FR2: Epic 1 - `last_contacted_on` parked as empty DATE (insert write removed, existing values nulled after report, display shows `never`).
FR3: Epic 1 - One reversible DATE migration, report-then-null, truncated prefix, no clock.
FR4: Epic 1 - `optionalIsoDate` tightened in the same change as the migration.
FR5: Epic 1 - Grid, chart, Favorites, and e2e date rows still pass.
FR6: Epic 1 - Nothing outside the three columns changed.

## Epic List

### Epic 1: Contact dates you can trust and filter
An operator knows exactly what each date column holds, the column means what its name says, and every row with a date appears correctly in filtered views — with no row silently missing because its value did not parse.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6

## Epic 1: Contact dates you can trust and filter

An operator knows exactly what each date column holds, `last_contacted_on` sits empty as a DATE for a future feature, and every row with a date appears correctly in filtered views — with no row silently missing because its value did not parse.

### Story 1.1: Data audit of the three contacts date columns

As an operator,
I want per-column counts and offender ids before any schema change,
So that the migration decision is based on measured data, not assumption.

**Acceptance Criteria:**

**Given** the local stack is running (production never touched, NFR4)
**When** the CAP-1 queries from `migration-playbook.md` run for `date_of_birth`, `initial_contact`, and `last_contacted_on`
**Then** per column `total, nulls, exact_iso, prefix_with_trailing, not_a_date` plus offender `id, name` lists and `SELECT DISTINCT` of offending values are recorded in the story file (FR1, AR7)
**And** no ALTER runs in this story (NFR1).

**Given** `not_a_date` is a handful of rows
**When** the report is reviewed
**Then** every id is recorded for report-and-null in Story 1.3
**And** a large count blocks the migration for manual repair instead.

### Story 1.2: Park `last_contacted_on` as empty DATE for future use

As a preacher,
I want the misleading contact date gone and the field held empty,
So that no one mistakes creation date for last contact.

**Acceptance Criteria:**

**Given** `lib/supabase/data.ts:616-621` writes `last_contacted_on` at insert with no update path anywhere in the app
**When** the change lands
**Then** the insert write is removed, no update path is added, and new rows store `NULL` (FR2)
**And** `initial_contact` keeps its insert write (creation is its correct meaning).
  
**Given** existing rows hold creation dates displayed as last contact
**When** the migration in Story 1.3 runs
**Then** those values are nulled only after every id is reported (Dwaraka-approved null), the column stays `DATE`, and no value is invented (FR2, NFR6, AR2, AR7).

**Given** Favorites renders a parked column
**When** the value is `NULL`
**Then** `manage-favorites-view.tsx:559` shows `never` as plain text with no time component (UX-DR1).

### Story 1.3: Migrate columns to DATE and tighten the validator

As an operator,
I want the three columns stored as `DATE` with matching write validation,
So that date filters compare by type and no row silently vanishes.

**Acceptance Criteria:**

**Given** Story 1.1's audit has been read and offender ids are known
**When** the migration runs
**Then** unconvertible rows (including all existing `last_contacted_on` values per the park decision) are nulled only after reporting with every id recorded, valid-prefix trailing content truncates via `left(col, 10)::date`, no `AT TIME ZONE` expression appears, and the change ships as one file under `supabase/migrations/YYYYMMDDHHMMSS_name.sql` with a lossy down path (`USING col::text` plus comment that nulled rows are not restored) (FR3, NFR1, NFR2, AR1, AR2).

**Given** the migration lands
**When** `optionalIsoDate` (`lib/manage/api-handlers.ts`) is reviewed
**Then** it rejects or truncates trailing content in the same change (OQ-3, same rule both places), so no accepted value can later fail at Postgres (FR4, AR3).

**Given** the change is complete
**When** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`, a fresh `scripts/apply-migrations.mjs`, and `pnpm test:e2e` (one runner) run
**Then** all pass, contacts render in the grid, the dashboard Contact Generation chart still counts them, Favorites shows the value/`never`, every existing e2e row covering date edit/filter/sort still passes, `git diff lib/supabase/types.ts` is empty, `apps/folk` and `apps/gita-life` stay mirrored, and no RLS policy, route, or authorization logic changed (FR5, FR6, NFR3, NFR5, AR4, AR5, AR6).
