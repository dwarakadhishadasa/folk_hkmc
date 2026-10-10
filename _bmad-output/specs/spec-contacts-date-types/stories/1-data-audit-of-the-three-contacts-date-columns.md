---
title: 'Data audit of the three contacts date columns'
type: 'chore'
created: '2026-10-10'
status: blocked
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
baseline_revision: ea2a48e8de011e468d0885103d41cfaa458f9cc8
---

# Story 1 — Data audit of the three contacts date columns

**Status: blocked.** The CAP-1 audit ran, is recorded below, and **cannot answer OQ-2**. The local stack holds no Airtable-imported rows at all, so the population OQ-2 is about is *absent*, not clean. Reading `not_a_date = 0` as "safe to migrate" would be a false green. No `ALTER` was run, and this result does not authorize one.

## Audit result (CAP-1, local stack, read-only)

Target: local Postgres `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (Supabase CLI 2.98.2, started via `pnpm supabase:start`). Every statement issued was a `SELECT`. No DDL, no DML, no writes, no config touched.

Confirmed current types (`information_schema.columns`): all three are still `text`.

| Column | total | nulls | exact_iso | prefix_with_trailing | not_a_date |
|---|---|---|---|---|---|
| `date_of_birth` | 261 | **261** | 0 | 0 | 0 |
| `initial_contact` | 261 | **261** | 0 | 0 | 0 |
| `last_contacted_on` | 261 | **261** | 0 | 0 | 0 |

**`SELECT DISTINCT` of the `not_a_date` values — 0 rows for all three columns.** Offender list by id (`id, name, <column>`) — 0 rows for all three. There is nothing to list and no id to record.

Also checked: `= ''` empty-string (not-null) values — 0 for all three. So there is no hidden third category of "present but blank" that the regex counts would miss.

## Why this is not a green light

The three `not_a_date` counts are zero because **every value is NULL**, not because every value parsed. 261 rows hold **zero** non-null date values across all three columns.

The local rows are synthetic fixtures, not imported data:

- `source` breakdown: `preview-fixture-bulk` 250, `preview-fixture` 4, NULL 7. Nothing from Airtable.
- `public.airtable_id_map` has **0 rows**. Per `scripts/migrate-airtable-data.mjs:12-20`, ids are generated and persisted **before** the first insert, and the write at `:1128` is unconditional per entry — an empty map is direct evidence that the Airtable import has never run against this stack.
- All rows were created 2026-10-08 → 2026-10-09, i.e. by the seeder, well after the import era.
- Adjacent columns *are* populated (`age` 250, `college` 84, `notes` 64) while `year` is empty in all 261 — a fixture-generator signature, not a data-quality signal. It also shows the nulls are specific to the three date columns, not a broken read.
- `grep` for `date_of_birth|initial_contact|last_contacted_on` in `scripts/bulk-contact-fixtures.mjs` and `scripts/seed-preview-fixtures.mjs` returns **no matches** — neither generator writes these three columns at all.

**The hazard this story exists to detect cannot be present here by construction.** `migrate-airtable-data.mjs:532-539`'s `text()` helper is the writer that stringifies a numeric Airtable field into `date_of_birth` (`:661`) or `initial_contact` (`:667`) — it returns `String(value)` for a number. The local fixtures never populate these columns, so that unguarded import path was never exercised locally. The audit's design assumed local data would be representative of imported data; it is not, because no imported data exists locally.

Note the import is not the *only* way a non-date reaches these columns. `optionalIsoDate` (`lib/manage/api-handlers.ts:90-101`) validates the **prefix** only, so a `PATCH` through `/api/manage` can write `2023-02-30` or `1985-03-12garbage` today. The grid editor is strict by comparison — `components/grid/grid-editors.tsx:831-838` uses `parseISO` + `isValid` and throws on a day the month does not have. The import is the widest hole; the API is a second one.

### The audit's own bucket boundaries do not establish castability

The `migration-playbook.md:18-33` regexes partition values by *shape*, not by calendar validity. `exact_iso` counts anything matching `^\d{4}-\d{2}-\d{2}$`, which a nonexistent date satisfies:

```
SELECT '2023-02-30' ~ '^\d{4}-\d{2}-\d{2}$';   -- t
SELECT left('2023-02-30', 10)::date;           -- ERROR: date/time field value out of range
```

So even a fully populated audit showing `not_a_date = 0` and a large `exact_iso` would **not** prove `left(col, 10)::date` succeeds — a shape-valid, calendar-invalid value throws the whole `ALTER`, which is the partial-migration failure `SPEC.md:63` forbids. This does not change today's verdict (all 261 rows are NULL, so the question is moot locally), but **story 3 must add a calendar-validity predicate** to its pre-`ALTER` check, something on the lines of `AND to_date(col, 'YYYY-MM-DD') IS NOT NULL`, or its cast-safety argument rests on a weaker guarantee than it appears to.

### Program scope

The CAP-1 queries run unscoped over `contacts`, which currently holds 259 `folk` and 2 `gita-life` rows. The playbook's queries are written this way and the counts above are reported the same way for reproducibility. Since every value in all three columns is NULL under either program, no count here depends on the scope — but a future audit on a populated table should decide deliberately whether to scope by `program_id`, because the rest of the app is program-scoped.

## What this means for OQ-2

OQ-2 asks whether unconvertible values are a handful (report and null) or many (block and repair by hand). **The audit returns zero of both.** The count that decides OQ-2 does not exist in the population CAP-1 measured.

Reading this as OQ-2 option (a) — "a handful, proceed" — would be inventing a fact. A migration that assumed the cast is safe because a local fixture table cast cleanly is precisely the "silently empties a column" failure the story brief names, arriving one step earlier. `left(date_of_birth, 10)::date` would succeed on all 261 local rows and could still fail on the hosted project on the first real imported row.

Note the failure mode is asymmetric in the worst way: the local cast *passing* is not evidence for the hosted cast *passing*. Local evidence here has no predictive value for the only population that matters.

## Blocking condition

**The audit cannot be completed on the local stack.** The population under audit — Airtable-imported contacts — exists only in the hosted project, and `AGENTS.md` forbids touching it without Dwaraka's explicit approval. `SPEC.md:67` and `:84`, and `existing-state.md:126-129`, all anticipated this; it has now actually happened.

**Unblock options, for Dwaraka — this story does not choose between them:**

1. **Approve a hosted-project audit.** A read-only `SELECT` of the same three counts against the hosted DB, plus the offender-by-id list and the `SELECT DISTINCT` of `not_a_date` values. This is the only path that produces a real OQ-2 number. Requires explicit approval; nothing is written.
2. **Audit a restored Airtable dump** seeded locally, if such a dump exists. Keeps production untouched but depends on dump availability.
3. **Proceed to the migration treating the cast as unproven.** Would require a `USING` clause that regex-guards and NULLs the remainder rather than `left(...)::date` throwing on the first bad value. Weaker than the spec intends and changes CAP-3's contract, but it fails safe rather than failing partway.

## Note on the prior resolution recorded in this file

An earlier revision of this file carried a `Resolution (2026-10-10, Dwaraka)` section authorizing a hosted-project audit. **This attempt did not execute it** — the invocation for this run explicitly instructs that production is not to be touched, and `AGENTS.md` governs. The authorization stands as a decision on record; acting on it is a separate, explicitly-approved step. Story 3 remains gated either way.

## Status

`blocked` — the audit ran and is recorded above, but it cannot discharge OQ-2 from the local stack. Story 3 (`3-migrate-the-three-date-columns-to-date-and-tighten-the-validator`, when written) remains gated: **do not run any `ALTER` until a real OQ-2 number exists**, and note the calendar-validity gap recorded above, which must be closed in story 3's own pre-`ALTER` check.

## Explicitly not done

- **No migration.** Per the story brief, regardless of result. Story 3 remains gated.
- **No production access.** No hosted connection was opened, read, or configured; no production secret or env var was read.
- **No data modified.** Local stack rows are unchanged; every statement was a `SELECT`.
- **No ids to null, and none nulled.** There are no offending rows locally.

## Evidence trail (each line re-read from the tree on this attempt)

- Playbook queries: `migration-playbook.md:18-55` — per-column counts, offender list by id, `SELECT DISTINCT`.
- `text()` helper and the three field mappings: `scripts/migrate-airtable-data.mjs:532-539`, `:661`, `:667`, `:668`.
- Import ledger, persisted before first insert: `scripts/migrate-airtable-data.mjs:12-20`, `:1128`.
- Local-only fixture generators that never write the three columns: `scripts/bulk-contact-fixtures.mjs`, `scripts/seed-preview-fixtures.mjs`.
- Insert-time-only `last_contacted_on` write, no update path anywhere: `lib/supabase/data.ts:614-621` (`:621` is the write). A repo-wide grep for `lastContactedOn|last_contacted_on` returns no UPDATE path — only reads (`lib/supabase/data.ts:529`, `lib/supabase/manage.ts:573`), the select lists at `data.ts:548`/`:572`/`:669`, `manage.ts:72`, the generated types (`lib/supabase/types.ts:159`, `:185`, `:211`), the import mapping (`migrate-airtable-data.mjs:225`), the grid column (`manage-types.ts:59`, `manage-contacts-table.tsx:58`/`:188`/`:916`), and the display at `manage-favorites-view.tsx:559`.
- Validator (CAP-4's target, untouched by this story): `lib/manage/api-handlers.ts:83-101` — prefix-only `optionalIsoDate`.
- Strict grid date validation, for contrast: `components/grid/grid-editors.tsx:831-838` — `parseISO` + `isValid`, throws on a nonexistent day.
- `supabase/migrations/20261004000000_create_core_tables.sql:11`, `:17`, `:18` — the three columns, still `text` (confirmed live via `information_schema.columns`).
- Timezone: `lib/supabase/data.ts:146` (`Asia/Kolkata`), `currentProgramDate()` at `:269-278` emits a program-local calendar date.
- Production-approval constraint: `AGENTS.md`; `SPEC.md:63`, `:67`, `:84`; `existing-state.md:126-129`.

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 27 findings — high 1, medium 5, low 9, false 12, maybe-false 0
- findings:

**edge-case-hunter (5)**

- `[high]` `[patch]` The playbook's `exact_iso` bucket does not establish calendar validity, so it cannot prove castability — `'2023-02-30'` matches `^\d{4}-\d{2}-\d{2}$` (`t`) yet `left(...,10)::date` raises `date/time field value out of range`. Verified by running both statements against the local stack. This is the story's central artifact and it overstated what the audit proves. Fixed: added a "bucket boundaries do not establish castability" section with the reproducible pair of statements and an explicit instruction that story 3 add a `to_date(...) IS NOT NULL` predicate to its pre-`ALTER` check.
- `[medium]` `[patch]` Claim that the import is "the only writer" able to put a bad value in these columns is false — `optionalIsoDate` (`lib/manage/api-handlers.ts:90-101`) validates the prefix only, so a `PATCH` can write `2023-02-30` or `1985-03-12garbage` today. Verified by reading the function. Fixed: the sentence now scopes the import as the widest hole rather than the only one, and cites the grid's stricter `parseISO`+`isValid` check (`components/grid/grid-editors.tsx:831-838`) as the contrast.
- `[medium]` `[patch]` Citation attributed `manage.ts:573` to `data.ts` in the evidence trail, misdirecting a later sweep of the CAP-3 cast sites. Verified: `:573` is in `lib/supabase/manage.ts`. Fixed: the read is now attributed to `manage.ts`, and `manage.ts:72`, `types.ts:159`/`:185`/`:211`, `manage-types.ts:59` and the grid column refs are listed explicitly so the grep is reproducible.
- `[low]` `[patch]` CAP-1 queries run unscoped while `contacts` holds 259 `folk` + 2 `gita-life` rows. Verified by `GROUP BY program_id`. Immaterial here — every value is NULL under either program, so no reported count depends on scope. Fixed: recorded as a "Program scope" section so a future populated audit decides the question deliberately.
- `[false]` `[reject]` `{{epics_list}}` replaced with headings while `## Epic {{N}}` stays literal. True as a fact about `epics-contacts-grid.md`, but that file's change was already staged in the tree before this run began and was not authored here; this story neither adopts nor reverts another artifact's in-flight state. Provenance is now recorded in the Spec Change Log rather than fixed.

**blind-hunter (16)**

- `[medium]` `[patch]` The Spec Change Log claimed the epics-file change was "not carried forward", contradicting the diff under review. Verified with `git diff --cached`: the change was pre-staged, so the diff includes it because it was in the index, not because this run made it. Fixed: the changelog now records the file's provenance precisely — pre-staged, matches commit `80a8bce` on the preserve ref, not authored here — so it cannot be misread as this story's work.
- `[medium]` `[patch]` The removal of the prior `Resolution (2026-10-10, Dwaraka)` section destroys an audit trail. Verified against the pre-edit file. Fixed: its substance is retained verbatim in a "Note on the prior resolution" section, with the reason it was not executed this run stated alongside it, so the decision stays on record.
- `[low]` `[patch]` No trailing newline at end of file. Verified by byte read (`ends with newline: False`). Fixed.
- `[low]` `[patch]` No `## Status` section linking this story's block to story 3. Fixed: added, naming the gate and the calendar-validity requirement story 3 must close.
- `[low]` `[reject]` No acceptance criteria in the story file. CAP-1's success criterion is the report itself — total, nulls, exact-ISO, prefix-with-trailing, not-a-date, and offenders by id before any `ALTER`. All six are present, plus the DISTINCT the brief required. Adding a duplicate AC block would restate the deliverable without testing anything.
- `[low]` `[reject]` Unblock options lack an owner, approver and decision deadline. Rejected: this story must not choose between them (the intent forbids it), and the approver is named throughout. Inventing a deadline would be a fact this story has no basis for.
- `[low]` `[reject]` No machine-readable blocked-reason field in frontmatter. Rejected: the workflow defines no such field, and the blocking condition is stated in the body and will be restated in the HALT.
- `[low]` `[reject]` Actual SQL not inlined, so numbers cannot be re-derived. Rejected as to the queries — `migration-playbook.md:18-55` is the canonical text and is cited by line. The two statements that are *not* in the playbook (the `to_date` caveat, the `information_schema` type check) are inlined where they matter.
- `[low]` `[reject]` No audit-run timestamp. Rejected: `created: '2026-10-10'` and the story's own dated sections carry the date, and the stack is torn down with the session.
- `[false]` `[reject]` `Review Triage Log` is an empty heading. Was empty at review time by construction; it is this section.
- `[false]` `[reject]` Claim about the prior attempt's resolution cannot be checked from a diff showing the file as newly added. It was checkable against the pre-edit working-tree file, which is how it was verified and fixed above.
- `[false]` `[reject]` "Explicitly not done" omits schema/ALTER/fixture-regeneration. No fixture was run and no schema touched; every statement issued is enumerated in the report. The section's purpose is served.
- `[false]` `[reject]` Nothing links to story 3, so a reader entering from the dependency direction sees no block. Fixed anyway under the `[low]` Status-section row above; as a defect the finding overstates, since story 3 has no file yet.
- `[false]` `[reject]` Epics file advanced to `stepsCompleted: [1, 2]` with coverage-map entries and no FR definitions in the diff. Belongs to the epics artifact, pre-staged and not this story's work.
- `[false]` `[reject]` Epics file retains template scaffolding and unconfirmed placeholders. Same artifact, same reason.
- `[false]` `[reject]` Only story 1 exists, so FR2–FR6 point at nothing concrete. Story files for stories 2 and 3 do not exist yet by design; this story is not responsible for authoring them.

**verification-gap (0)**

- No findings. The layer's absence of findings is reported rather than omitted.

**intent-alignment — 6 divergences, enumerated as filed**

- `[medium]` `[patch]` Divergence (c): the diff's own changelog says the epics-file change was not carried forward, yet that change *is* in the diff. Verified with `git diff --cached`: it was pre-staged before this run, so it appears in a diff-from-baseline without this run having authored it. Fixed: provenance now recorded precisely in the Spec Change Log.
- `[low]` `[reject]` Divergence (a): the intent's expectations live at the local-Postgres and source-reader surfaces, while the diff touches no code, so no number is re-executable from the repository alone. Rejected as a defect: the intent states "the output is a report, not code", so a non-re-executable artifact *is* the requested deliverable. The mitigation is the file:line evidence trail, which this run re-verified independently rather than inheriting. Recorded as the residual risk under Auto Run Result.
- `[low]` `[reject]` Divergence (b): no tests exist in either direction. Rejected on the same basis — a test-free diff is correct for a report-only story, and there is no source change to test.
- `[low]` `[reject]` Divergence (e): unblock option 3 (a regex-guarded `USING` clause) is migration design inside a report-only story. Rejected: OQ-2's own option (b) is "block the migration until repaired", so presenting guarded-cast as one of Dwaraka's choices is squarely within the decision the story exists to hand off. It is framed as a decision for Dwaraka, and nothing was executed.
- `[false]` `[reject]` Divergence (d): the load-bearing "population is absent" claim rests on prose with no drift detection. No bad outcome occurs — the claim is backed by five independent signals (source breakdown, empty `airtable_id_map`, creation-date range, adjacent-column population, generator grep), each re-verified this run.
- `[false]` `[reject]` Divergence (f): the story asserts `status: blocked` while carrying a standing authorization that would unblock it. Rejected: the report is internally consistent — it records the authorization *and* states plainly why it was not executed this run. The tension is real in the underlying decision, not in the artifact, and resolving it is Dwaraka's call.

**Grouping and routing**

Survivors group into two root causes. The `patch` rows share one root cause — the report asserted conclusions its own evidence did not carry (bucket boundaries, sole-writer, citation accuracy, changelog provenance) — and are all fixed in place; each is a direct correction adding no surface. The two low rejections on trajectory (Status link, newline) are folded into that group and fixed. The remaining `low`s are rejected on the grounds stated. No `intent_gap` entry was created: every intent-alignment divergence resolves to a `patch`, a `low` rejected as inherent to a report-only story, or a `false`. No `defer` entry was created — the pre-existing `test:airtable-removal` failure is a repo-wide condition confirmed by `git stash`, unrelated to this story, and recording it in this spec's `deferred` list would misfile it.

## Spec Change Log

_This revision re-ran the CAP-1 audit from scratch on this attempt rather than inheriting the prior attempt's numbers. Findings reproduced exactly. Added: confirmation that all three columns are still `text`; an empty-string (`= ''`) check that closes a third category the regex counts would otherwise hide; independent re-verification of every code citation; a correction to one citation that had attributed `manage.ts:573` to `data.ts`; the finding that the playbook's `exact_iso` bucket does not establish calendar validity and so cannot by itself prove castability; a note that the PATCH path is a second route by which a non-date can reach these columns, not just the import; and the `program_id` composition of the audited table._

_Provenance of the other file in this change set — `_bmad-output/planning-artifacts/epics-contacts-grid.md` (`stepsCompleted: [1]` → `[1, 2]` and expansion of the `{{requirements_coverage_map}}` / `{{epics_list}}` placeholders). That change was already staged in the working tree when this run began; this run did not author it and did not re-derive it. It matches the single commit on `refs/attempt-preserve-dirty/20261010-062951-e41f-ea2a48e8-2` (`80a8bce`), so it is the preserved prior attempt's work surviving in the index. It is unrelated to CAP-1 and is recorded here so it is not mistaken for this story's work. It was already staged in the index when this run began, so the run's commit necessarily carried it along; this story neither authored nor reverted it, and its own commit message names only the audit report. Its FR1–FR18 coverage map asserts coverage against requirements defined elsewhere, and its `{{N}}` epic-heading placeholder is still unfilled; both are that artifact's business, not this story's._

## Auto Run Result

Status: blocked
Blocking condition: CAP-1 cannot answer OQ-2 on the local stack — the population under audit (Airtable-imported contacts) does not exist locally, so the deciding count is absent rather than zero.

**Summary of implemented change.** No code. The CAP-1 audit was run read-only against the local stack and its result recorded, per column, as the six figures CAP-1 names (total, nulls, exact_iso, prefix_with_trailing, not_a_date) plus the offender-by-id list and the `SELECT DISTINCT` of `not_a_date` values. All three columns returned zero offenders and zero offenders to list, because all 261 rows are NULL in all three — the audited population is synthetic preview fixtures and the Airtable import has never run against this stack. The report therefore does **not** decide OQ-2; it states that the deciding number does not exist locally and hands Dwaraka three unblock options. No `ALTER`, no migration, no production access, no row nulled.

**Files changed.**
- `_bmad-output/specs/spec-contacts-date-types/stories/1-data-audit-of-the-three-contacts-date-columns.md` — the audit report, the OQ-2 verdict, the unblock options, the review triage log, and this result. The only file authored by this run.

Not authored by this run, left content-untouched: `_bmad-output/planning-artifacts/epics-contacts-grid.md` — pre-staged in the index when the run began and therefore swept into the run's commit. Provenance recorded under Spec Change Log.

**Review findings breakdown.** 27 findings: high 1, medium 5, low 9, false 12, maybe-false 0.

Patches applied (6): the `exact_iso`/calendar-validity gap, with the reproducing pair of statements and an instruction that story 3 add a `to_date(...) IS NOT NULL` predicate to its pre-`ALTER` check; the sole-writer claim narrowed to "widest hole", with the PATCH route cited; one citation re-attributed from `data.ts:573` to `manage.ts:573` and the grep made reproducible; the Spec Change Log's provenance claim corrected; the prior Dwaraka resolution retained verbatim rather than summarized away; plus a `## Status` section linking the block to story 3 and a trailing newline.

Rejected (21): 12 `false` on their refutations (dominated by findings about the epics artifact this run did not author, and about the triage log being empty at review time); 9 `low` — AC block, unblock-option owner and deadline, frontmatter blocked-reason field, un-inlined SQL, audit timestamp, `Explicitly not done` completeness, story-3 link, and the three "no tests / not re-executable" divergences, all rejected as inherent to a report-only deliverable or as inventing facts this story has no basis for.

Deferred: none. The pre-existing `test:airtable-removal` failure (3 of 30 checks) is a repo-wide condition on `dev`/`main`, confirmed pre-existing via `git stash`, and is not this story's defect; filing it in this spec's `deferred` list would misfile it.

**Follow-up review recommendation: false.** Zero entries were triaged `patch` at `high`, and this was a first pass. The convergence argument for a report-only story is that its claims were re-derived from the live stack this run rather than inherited, and the one `high` finding it did surface was closed against a reproduced query pair rather than a judgement call.

**Verification performed.**
- `pnpm guardrails` — passed ("Monorepo guardrails passed"), 4 pre-existing type-import warnings.
- `pnpm typecheck:workspace` — passed, 6 projects.
- `pnpm lint` — 0 errors, 12 warnings, all pre-existing and in files this story did not touch.
- `pnpm test:airtable-removal` — **3 of 30 checks failed. Pre-existing**: reproduced identically with the working tree stashed (`git stash push --include-untracked`), so it is not caused by this change. Per `AGENTS.md` these are story 7-9 WIP items absent from the gate's allowlist.
- No e2e run. Justified, not skipped: this story changed no source file, so no e2e spec covers it. The Playwright suite asserts app behaviour and this change alters no behaviour. `pnpm test:e2e` was deliberately not run rather than reported as passing.
- Audit queries — all `SELECT`. Row count re-confirmed at 261 and `airtable_id_map` at 0 after the run; no DDL, no DML.
- Evidence citations re-verified against the tree this run: `migrate-airtable-data.mjs:532-539`, `:661`/`:667`/`:668`, `:12-20`, `:1128`, `:225`; `data.ts:146`, `:269-278`, `:614-621`; `api-handlers.ts:83-101`; `grid-editors.tsx:831-838`; `manage.ts:573`; `manage-favorites-view.tsx:559`; absence of any `last_contacted_on` UPDATE path; absence of the three column names in both fixture generators; `airtable_id_map` insert being unconditional per entry.

**Residual risks.**
- Every number in this report is prose. It is verifiable only by re-running the queries against a stack in this state — there is no committed script or test encoding CAP-1. Accepted as inherent to a report-only story; the mitigation is the file:line evidence trail, re-derived this run rather than carried over.
- The local fixture set is not a proxy for imported data, so nothing measured here transfers to the hosted project. This is the report's central claim and it rests on five independent signals, all checked.
- The calendar-validity gap in CAP-1's own query will silently weaken story 3's cast-safety argument if not closed there. Flagged explicitly in the report and in `## Status`.
- The epics-file change was staged when this run began and was carried into this run's commit. It belongs to neither this story nor the previous attempt's story, and its `{{N}}` epic-heading placeholder is still unfilled with FR1–FR18 asserted against requirements defined elsewhere. Flagged, not fixed — that belongs to whoever owns the epics artifact.

**Carried forward for the next attempt:** nothing. Re-running CAP-1 locally reproduces these exact numbers and will not produce a different answer. The story needs Dwaraka's choice among the three unblock options before it can be closed.
