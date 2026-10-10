---
title: 'Park last_contacted_on as empty DATE for future use'
type: 'feature'
created: '2026-10-10'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - ../SPEC.md
  - ../existing-state.md
  - ../migration-playbook.md
  - ../../../AGENTS.md
warnings: [oversized]
deferred:
  - summary: >-
      Nothing asserts that a contact created through `createContact` stores `last_contacted_on`
      NULL while `initial_contact` holds the program-local date.
    evidence: |-
      `pnpm test:e2e` passes 165 with one flake and would pass just as green if
      `last_contacted_on: createdDate` were put back, or if the adjacent
      `initial_contact: createdDate` line were deleted alongside it. The only spec that
      creates a contact through the app, `e2e/specs/manage-contacts-row-lifecycle.spec.ts:386-445`,
      goes through `POST /api/manage/contacts` -> `handleManageContactCreate` ->
      `createManageContact` (`lib/supabase/manage.ts:1050`), a different writer that never
      touched this column, so the changed line is never executed by the suite. No spec
      reaches `/api/contact` or `/api/registration` at all. Settled by adding a spec that
      creates through `POST /api/contact` and reads both columns back.
    location: >-
      lib/supabase/data.ts:616
    severity: medium
  - summary: >-
      The Favorites detail panel — the only user-visible consequence of the park — is never
      opened by any spec, so the `never` rendering is unpinned.
    evidence: |-
      No spec navigates to `view=favorites`; the only `/manage?view=` navigation in the suite
      is `e2e/specs/theme-switch.spec.ts:450` (`view=contacts`), and favorites-adjacent
      assertions read `aria-pressed` on grid stars (`e2e/fixtures/manage-grid.ts:210-240`).
      Replacing `?? "never"` with `?? ""`, a dash, or nothing at all would fail no spec.
      Settled by opening `/manage?view=favorites`, selecting a favourite, and asserting the
      detail paragraph's text in both the NULL and the stored-value case.
    location: >-
      components/manage/manage-favorites-view.tsx:559
    severity: medium
  - summary: >-
      `SPEC.md` still carries OQ-1 as an open question and a success signal that promises
      `last_contacted_on` "now updates when someone is contacted" — the opposite of the park
      this story implemented.
    evidence: |-
      `SPEC.md:90` reads "OQ-1 — What counts as a contact interaction? ... **This spec assumes
      attendance** ... Needs your call" and `SPEC.md:80`'s success signal says "`last_contacted_on`
      now updates when someone is contacted". Story 3 loads `SPEC.md`, so a stale open question
      there can invite the update path the intent forbids. Settled by Dwaraka closing OQ-1 in
      `SPEC.md` to the park decision, which is his decision to make rather than an unattended
      agent's edit to the canonical spec.
    location: >-
      _bmad-output/specs/spec-contacts-date-types/SPEC.md:80
    severity: medium
  - summary: >-
      The grid's "Last Contacted On" cell renders NULL as a blank, where the Favorites panel
      renders `never` for the same contact.
    evidence: |-
      `components/manage/manage-contacts-table.tsx:916` is a bare
      `columnHelper.accessor("lastContactedOn", {...})` with no custom cell, so a null value
      renders empty. Deliberately left alone: a blank cell asserts nothing false, `:188` already
      defaults blank rows to `lastContactedOn: null`, and the intent named one display line.
      Settled by Dwaraka deciding whether the two surfaces should agree; the smallest fix is a
      `cell:` renderer mirroring the panel's `?? "never"`.
    location: >-
      components/manage/manage-contacts-table.tsx:916
    severity: low
  - summary: >-
      Re-running the one-shot Airtable import would repopulate `last_contacted_on`, defeating
      the park and confusing story 3's cast gate.
    evidence: |-
      `scripts/migrate-airtable-data.mjs:668` still builds the column into its insert payload.
      Latent rather than live — the import has already run, and re-running it would breach
      `AGENTS.md`'s production rule anyway. Worth knowing before story 3 reads an unexpectedly
      populated column. Settled by gating the script on one-shot completion or removing the
      mapping.
    location: >-
      scripts/migrate-airtable-data.mjs:668
    severity: low
  - summary: >-
      Sorting the now-mixed-population "Last Contacted On" column puts NULL rows ahead of every
      `YYYY-MM-DD` value.
    evidence: |-
      TanStack's default text sort orders null/undefined first, and after this change the column
      mixes ~1057 populated rows with NULL for every row created from here on. Cosmetic and
      non-misleading — no incorrect data is displayed — and the column carries no
      `meta.grid.filter`, so it is not filterable at all. Settled by an explicit `sortingFn` if
      the ordering is judged wrong.
    location: >-
      components/manage/manage-contacts-table.tsx:916
    severity: low
  - summary: >-
      `SPEC.md:33` is stale in the same way `SPEC.md:80` and `:90` are, and is not named in the
      existing SPEC.md deferral — the stale surface is wider than recorded.
    evidence: |-
      `SPEC.md:33` asserts in the present tense that "`lib/supabase/data.ts:614-621` writes
      `last_contacted_on: currentProgramDate()` at **insert** and nothing ever updates it",
      which this story made false. `SPEC.md:47`'s CAP-3 success criterion still lists
      `last_contacted_on` among the three columns that become `DATE`, but that one remains
      correct — story 3 does convert it. Settled by Dwaraka updating `:33` alongside `:80`
      and `:90` when he closes OQ-1.
    location: >-
      _bmad-output/specs/spec-contacts-date-types/SPEC.md:33
    severity: low
  - summary: >-
      Two findings this story's log deferred (BH-13, the skipped `AGENTS.md` Full-level e2e
      escalation, and VO2) never reached the ledger, so BH-13's claimed durability is not real.
    evidence: |-
      `_bmad-output/implementation-artifacts/deferred-work.md` gained exactly six entries
      (DW-28 through DW-33), matching the six frontmatter blocks; the first pass's triage log
      defers eight findings. BH-13's record explicitly claims it is "Recorded so the next
      story does not repeat the reasoning" about skipping a named verification gate. The
      ledger is owned by the sweep/orchestrator, which reconciles spec-deferred entries into
      it — a build must not write it. Settled by the next sweep reconciling the stragglers.
    location: >-
      _bmad-output/implementation-artifacts/deferred-work.md
    severity: low
  - summary: >-
      The cross-spec deferral VO2 cites the wrong line for the stale prose, and its paired
      citation is a row that now covers one true and one false claim jointly.
    evidence: |-
      `_bmad-output/specs/spec-contacts-premium-grid/existing-state.md:101` is a grid-column
      table row (`| lastContactedOn | date | — | read-only, ISO |`), not the stale prose; the
      text describing the removed insert write is at `:224`, with the schema listing at
      `:234`. The paired citation `_bmad-output/specs/spec-airtable-to-supabase/data-model-mapping.md:25`
      is accurate, but that row covers `initial_contact` / `last_contacted_on` jointly under
      "Asia/Kolkata date on create" — now only half-true — so a fixer could correctly drop
      the `last_contacted_on` half and wrongly delete `initial_contact`'s still-correct
      entry. Settled by correcting both specs; each belongs to another spec, not this one.
    location: >-
      _bmad-output/specs/spec-contacts-premium-grid/existing-state.md:224
    severity: low
  - summary: >-
      The single flaky e2e failure is classified as load-dependent on one isolated re-run, with
      no determinism evidence and no second full-suite run.
    evidence: |-
      `manage-contacts-edit.spec.ts:334` failed inside `filterGlobally` at
      `e2e/fixtures/manage-grid.ts:385` on `search.pressSequentially(text)`; in isolation
      `pnpm test:e2e "manage-contacts-edit"` gave 10 passed, exit 0. There is no
      `pnpm test:e2e:determinism` run, no repeat count and no second full-suite result, so
      "load-dependent flake, not a regression" is a hypothesis with one supporting data point.
      The record already concedes it is a judgement rather than a proof, so nothing is
      overstated — but nothing settles it either. Pre-existing test, untouched by this story.
      Settled by one `pnpm test:e2e:determinism` run, or by the flake recurring in isolation.
    location: >-
      e2e/specs/manage-contacts-edit.spec.ts:334
    severity: low
  - summary: >-
      The whole local e2e corpus has `last_contacted_on` NULL, so any local assertion about the
      mixed-population sort order would pass vacuously.
    evidence: |-
      Neither `scripts/seed-local-fixtures.mjs` nor `scripts/bulk-contact-fixtures.mjs`
      writes the column — `grep -rn "last_contacted_on" scripts/` finds it only in the
      one-shot Airtable importer. So the existing sort-order deferral's "NULL rows sort ahead
      of every `YYYY-MM-DD`" mixed population exists **only in hosted data**; locally every
      row takes the NULL path. This qualifies that deferral rather than repeating it: any
      test written for the ordering must seed a stored value explicitly or it proves nothing.
      Settled by seeding one row with a stored value in whatever spec eventually covers it.
    location: >-
      scripts/seed-local-fixtures.mjs
    severity: low
  - summary: >-
      `stories.yaml` still dispatches story 3 from a pre-park description, with no pointer to
      the warning that new rows already arrive NULL.
    evidence: |-
      `stories.yaml:57` (story 2's `invoke_dev_with`) states that
      "`lib/supabase/data.ts:614-621` writes last_contacted_on at insert", which this story
      made false, and story 3's block nowhere says that after story 2 new rows are already
      `NULL` and must not be read as "already migrated". The warning lives only in this story
      file, which story 3 has no pointer to. `invoke_dev_with` is a caller-owned orchestration
      field that build-auto is forbidden to edit. Settled by the orchestrator refreshing
      `stories.yaml` before story 3 dispatches.
    location: >-
      _bmad-output/specs/spec-contacts-date-types/stories.yaml:57
    severity: low
  - summary: >-
      The `never` rendering depends on two mappers this story does not touch, and this change
      makes the blank case the common case rather than the exception.
    evidence: |-
      `manage-favorites-view.tsx:559`'s `??` alone would render `""` as an empty gap; the blank
      case is closed upstream by `normalizeString()` (`lib/supabase/data.ts:234-236`) and
      `text()` (`lib/supabase/manage.ts:180-187`), which today collapse any non-string or
      blank to `undefined`/`null`. Nothing pins either. After this change most rows take that
      path, so a future edit letting either mapper pass blanks through would silently restore
      the empty-gap rendering AC #3 forbids with no gate firing. Distinct from the Favorites
      deferral, which is about the panel never being opened. Settled by a unit assertion on
      both mappers, or by normalising blanks at the display site instead of relying on them.
    location: >-
      lib/supabase/data.ts:234
    severity: low
baseline_revision: 9bc802aa4380521204e79b65bb1078de38c44bde
---

# Story 2 — Park last_contacted_on as empty DATE for future use

<intent-contract>

## Intent

**Problem:** `public.contacts.last_contacted_on` says "the last time someone was contacted", but the only write in the entire app is the insert-time write at `lib/supabase/data.ts:621`, which stores the row's **creation** date. A repo-wide grep finds no update path anywhere. So the value an operator reads is a lie by construction: it is "created on" wearing a contact label.

**Approach:** This is a **decided park**, not an open design question — OQ-1 (what counts as a contact interaction) is settled as "not now". Stop writing the value at insert so new rows store `NULL`, and make the display tell the truth about `NULL`. The column stays, and stays `DATE` when story 3 converts it, waiting for the future feature that will define the interaction and supply the update path.

## Boundaries & Constraints

**Always:**
- Remove exactly the `last_contacted_on` entry from the insert payload; `initial_contact`'s write stays and still uses the same `createdDate`.
- Leave the column present in the schema, in the read/select lists, and in the types — this is a park, not a removal.
- Render `never` as **plain text** (no `—`, no blank, no placeholder styling) for `NULL`.
- Report the affected-row population by id **before** any nulling. Story 3's migration performs the nulling; this story performs the code changes and the reporting that gates it.
- Record `never` in the story file as a deliberate, user-visible behaviour change, not as a silent fallback.

**Never:**
- **Do not add an update path.** No attendance hook, no `/manage` edit write, no trigger. That is the future feature's job and OQ-1 is closed.
- **Do not null, backfill, or otherwise touch any existing row's value.** No `UPDATE`, no migration, no DDL. Production is never touched (`AGENTS.md`).
- Do not rename the column and do not change its type — story 3 owns the `TEXT` → `DATE` conversion.
- Do not change RLS, routes, authorization, or app mirroring (`apps/folk` / `apps/gita-life`).
- Do not open a hosted connection. The read-only hosted authorization recorded in story 1's file is scoped to *that story alone*; this story takes no hosted action of any kind.
- Do not edit `scripts/verify-monorepo-guardrails.mjs` — `scripts/verify-airtable-removal.mjs` asserts its contents.

</intent-contract>

## Code Map

- `lib/supabase/data.ts:614-622` -- **the change.** `createdDate = currentProgramDate()` at `:614` feeds `insertPayload` at `:616-622`: `initial_contact: createdDate` at `:620`, **`last_contacted_on: createdDate` at `:621` — the only write in the app.** `:621` is deleted; `:614` and `:620` stay, so `createdDate` remains used and no unused-variable lint is introduced.
- `lib/supabase/data.ts:234-236` `normalizeString()` -- maps non-string and blank to `undefined`, so a read `NULL` or `""` never reaches the UI as an empty string.
- `lib/supabase/data.ts:529` -- `lastContactedOn: normalizeString(row.last_contacted_on)` on the read path; **read-only, unchanged**.
- `lib/supabase/manage.ts:180-187` `text()` -- same normalisation for the manage read path; `:573` maps `lastContactedOn`. **read-only, unchanged.**
- `components/manage/manage-favorites-view.tsx:559` -- the display: `· Last contacted on: {selectedContact.lastContactedOn ?? "never"}`. **Inspect first.** `??` already covers `null` and `undefined`, and both upstream mappers normalise `""` away, so this line is expected to need **no edit**. Change it only if inspection contradicts that; record what was found either way.
- `components/manage/manage-types.ts:59` -- `lastContactedOn: string | null`, the DTO the display consumes. **read-only.**
- `lib/supabase/data.ts:109`, `:184`, `:548`, `:572`, `:669`; `lib/supabase/manage.ts:72`, `:113`; `lib/supabase/types.ts:159`, `:185`, `:211` -- select lists and type declarations. **read-only**; the column stays everywhere.
- `components/manage/manage-contacts-table.tsx:58`, `:188`, `:916` -- grid column, blank-row default, accessor. **read-only**; no e2e spec or assertion anywhere references `lastContactedOn` / `last_contacted_on` / "Last contacted", so this change retires no test row and `matrix-coverage-map.md` needs no update.
- `supabase/migrations/20261004000000_create_core_tables.sql:18` -- `last_contacted_on TEXT`. **Read-only**; story 3 converts it. Note the declared form: a bare `TEXT` with no `NOT NULL` and no `DEFAULT`, so omitting the key from `insertPayload` cannot violate a constraint — the column resolves to `NULL` by the schema's own definition, not by the client's discretion. This is the static evidence that the deletion is schema-safe; it does **not** substitute for the row-level assertion deferred as V1/DW-28.
- `scripts/migrate-airtable-data.mjs:225`, `:668` -- the Airtable import mapping, a historical writer. **Out of scope.** The import is a one-shot migration script that has already run; re-editing it changes no live row and risks breaking a gate that asserts its contents.

**Read-only evidence.** Hosted `last_contacted_on` (story 1's measured CAP-1): total 1094, nulls 37, `exact_iso` 1057, `prefix_with_trailing` 0, `not_a_date` 0. The 1057 non-null values are the population story 3 must report by id before nulling; this story reports the count and hands the nulling over.

## Tasks & Acceptance

**Execution:**
- `lib/supabase/data.ts` -- delete the `last_contacted_on: createdDate,` line from `insertPayload`; keep `createdDate`, `initial_contact`, and every other payload entry byte-identical -- removes the lie at its only source without touching the contact-creation date that `initial_contact` legitimately records.
- `components/manage/manage-favorites-view.tsx` -- verify `:559` renders the plain word `never` for `NULL`/`undefined`; edit only if it does not -- the display must tell the truth about a column that is now routinely empty. Recording "already correct" is an acceptable and expected outcome.
- `_bmad-output/specs/spec-contacts-date-types/stories/2-park-last-contacted-on-as-empty-date-for-future-use.md` -- record the exact id-reporting precondition story 3 must satisfy before its nulling runs, and carry the decision forward -- the gate on someone else's destructive step must live somewhere durable, not in this story's session.
- `pnpm test:static` (guardrails + typecheck + lint) -- run and report real numbers -- `lib/` is inside the guardrails blast radius, and `next.config.mjs` sets `typescript.ignoreBuildErrors`, so typecheck is the only type gate.

**Acceptance Criteria:**
- Given a contact is created through the save/registration path, when the insert has committed, then the new `public.contacts` row has `last_contacted_on` `NULL` while `initial_contact` holds the program-local calendar date — observable on the row that lands in the database, not on the payload object.
- Given the repository, when every occurrence of `last_contacted_on` is enumerated, then the only remaining ones are read paths, select lists, type declarations, the schema column, the import mapping and the display — **no insert write and no update write exist in the app's runtime write paths**. The single exception is named explicitly and out of scope: `scripts/migrate-airtable-data.mjs:668`, the one-shot Airtable import writer, which is a historical migration that has already run and is untouched by this story.
- Given a contact whose `last_contacted_on` is `NULL` or blank, when it is selected in the Favorites detail panel, then the detail line reads `· Last contacted on: never` as plain text, with no blank gap and no dash placeholder — covering both `NULL` and `""`, since a `??` fallback alone would render `""` as an empty gap.
- Given a contact whose `last_contacted_on` still holds a stored value, when the same panel renders it, then that value is displayed unchanged — this story must not alter, hide or rewrite any pre-existing row's value.
- Given `apps/folk` and `apps/gita-life`, when the diff is inspected, then neither app's copy of a changed file has drifted — app mirroring holds (`SPEC.md:59`).

## Spec Change Log

No changes to `SPEC.md`, `existing-state.md` or `migration-playbook.md`. The CAP-2 decision recorded by this story — park rather than remove, and add no update path — resolves OQ-1 as "not now", which is the position `SPEC.md:41-43` (CAP-2) already contemplated.

Two documentation rows were corrected so the shipped behaviour is stated rather than the old lie: `docs/data-models.md:49` (`last_contacted_on` no longer written on create, no update path, parked by story 2) and `docs/architecture.md:194` (`Asia/Kolkata` program-day semantics no longer asserted for `last_contacted_on`).

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 29 findings — high 0, medium 6, low 16, false 7, maybe-false 0
- layers: blind-hunter 16, edge-case-hunter 7, verification-gap 5, intent-alignment 2
- routes: patch 11 (high 0, medium 2, low 9), defer 8, reject 10
- counts corrected by the 2026-10-10 follow-up pass: the header originally read "30 findings … low 17 … patch 10 … defer 7, reject 13". Both were miscounts. The enumerated rows below are 29 (6 medium, 16 low, 7 false) and their routes are 11 patch / 8 defer / 10 reject; the figures above are what the rows actually contain. The layer line is left as filed — its per-layer totals sum to 30 because four pairs were merged into a single row when written up (BH-11/E7, BH-1/E1, BH-2/E3, IA-1/IA-2), so the gap between 30 and 29 is the merge, not a dropped row.
- findings:
  - `[medium]` `patch` (E4, filed with V-gap O1) `docs/data-models.md:49` documented `last_contacted_on` as "Current Asia/Kolkata program date on create" — false after this change. Verified at the cited line. **Fixed:** the row now states the shipped behaviour (not written on create, no update path, parked by story 2); the `text` type cell and the `initial_contact` row above are untouched.
  - `[medium]` `patch` (E5) `docs/architecture.md:194` listed `last_contacted_on` among the `Asia/Kolkata` program-day semantics to preserve, inviting a future editor to reintroduce the insert write. Verified at the cited line. **Fixed:** that bullet keeps attendance-day filtering and `initial_contact`, and now states that no program-day write semantics are asserted for `last_contacted_on`.
  - `[medium]` `defer` (V1, filed `patch`) `createContact`'s date columns are written by no test, and `/api/contact` + `/api/registration` are reached by no spec. Verified: `e2e/specs/manage-contacts-row-lifecycle.spec.ts:386-445` creates through `POST /api/manage/contacts` → `handleManageContactCreate` → `createManageContact` (`lib/supabase/manage.ts:1050`), a **different writer that never touched this column**, so the changed line is never executed by the suite. The demonstration is real — re-adding `last_contacted_on: createdDate`, or deleting the adjacent `initial_contact: createdDate` line, ships fully green. **Deferred, not patched:** the smallest fix is two new e2e spec files against two routes the intent never names, which is a materially larger change than a one-line deletion and fails the `patch` bar of "the smallest fix is trivial". Recorded in `deferred`.
  - `[medium]` `defer` (V2, filed `patch`) the Favorites detail panel — the story's only user-visible consequence — is never opened by any spec. Verified: no spec navigates to `view=favorites` (the only `/manage?view=` navigation is `theme-switch.spec.ts:450`, `view=contacts`), and favorites-adjacent assertions read `aria-pressed` on grid stars (`e2e/fixtures/manage-grid.ts:210-240`). Deferred on the same grounds as V1; the fallback itself is sound, since `normalizeString` / `text` collapse blanks upstream. Recorded in `deferred`.
  - `[medium]` `defer` (BH-13) the `AGENTS.md` Full-level e2e escalation for `lib/supabase/*` was skipped on the story's own reasoning rather than on approval. Verified, and then **discharged by this review pass**: the local stack was already up, `pnpm test:e2e` was run to completion (11.8m), and the result is recorded below. The skip *decision* is what is deferred — "no spec covers it" was not a sufficient reason to skip a named gate, and it happened to be wrong here because a spec-level failure was hiding in a different file. Recorded so the next story does not repeat the reasoning.
  - `[medium]` `defer` (BH-6) the record claims OQ-1 is resolved while `SPEC.md:90` still carries OQ-1 as open and `SPEC.md:80`'s success signal still promises "`last_contacted_on` now updates when someone is contacted". Verified — both lines are exactly as described. Real, and a live hazard for story 3, which loads `SPEC.md`. Deferred: closing a canonical-spec open question is a planning-artifact decision belonging to Dwaraka, not an unattended agent. Recorded in `deferred` with both stale line numbers so it is not rediscovered from scratch.
  - `[low]` `patch` (BH-3) the record claimed "12 occurrences" while listing 11. Verified: the true snake_case count is 11 — `lib/supabase/data.ts:109` is camelCase `lastContactedOn?: string` and was never in that grep's scope, so nothing was omitted from a 12-item list. The count itself was wrong. **Fixed** to 11, with the reason stated, and the record's total re-derived as 19 across both patterns.
  - `[low]` `patch` (BH-4) the recorded grep was snake_case-only, so it could not see the display, the DTO or the grid column, yet the record claimed it covered the display. Verified. **Fixed:** the recorded command is now the two-pattern form, with what each pattern covers spelled out.
  - `[low]` `patch` (BH-11) the record cited `initial_contact: createdDate` at `:619`; after the deletion it is at `:620`. Verified at `lib/supabase/data.ts:620`. **Fixed** — the one-line claim is the story's central argument, and a wrong neighbouring citation undermines it.
  - `[low]` `patch` (E7) the same `:619` off-by-one, filed independently by the edge-case layer. Same site, same refutation, same fix; merged with BH-11 rather than verified twice.
  - `[low]` `patch` (BH-9) story 1's numbers were attributed to a heading titled "Hosted audit result — MEASURED", which matches neither the real heading nor one that exists. Verified: the real heading is "Hosted audit result (manual re-run 2026-10-10, Dwaraka + agent) — MEASURED, OQ-2 DECIDED" at `stories/1-data-audit-of-the-three-contacts-date-columns.md:23`. **Fixed** with the exact heading and line — this is a spec where a near-matching heading has a documented history of carrying *removed* numbers, so a loose citation is exactly the wrong imprecision to leave in place.
  - `[low]` `patch` (E6) the acceptance criterion "no insert write and no update write exist" is overbroad in the repository: `scripts/migrate-airtable-data.mjs:668` is a one-shot import writer. Verified. **Fixed** to scope the claim to the app's runtime write paths and name the import script.
  - `[low]` `patch` (BH-10) the Code Map described `scripts/migrate-airtable-data.mjs:225` as an occurrence of the column; it is `lastContactedOn: "fldCo370C6hCcgKcC"`, a camelCase Airtable **field-id** map, not the column. Verified at the line. **Fixed** in place to distinguish the field definition from the writer at `:668`.
  - `[low]` `patch` (BH-14) no rollback path was documented. Verified as genuinely absent. **Added:** revert is restoring the one line, and it does **not** backfill — rows created since the park stay `NULL`, so a revert yields a mixed population, not the original state.
  - `[low]` `patch` (BH-15) the file carried an empty `## Spec Change Log` and an empty `## Review Triage Log` alongside separately-added duplicates. Verified. **Consolidated** to exactly one of each, carrying all existing text, in Spec Change Log → Review Triage Log order.
  - `[low]` `reject` (BH-1) the grid's "Last Contacted On" cell was never inspected for null rendering. Verified: `components/manage/manage-contacts-table.tsx:916` is a bare `columnHelper.accessor` with no custom cell, so `NULL` renders blank. **Rejected as a fix**: a blank cell asserts nothing false, `:188` already defaults blank rows to `lastContactedOn: null` so blanks are this column's existing normal, and the intent named exactly one display line. The fix is more than a direct correction — it is a new cell renderer the story does not authorise. Captured in `deferred` instead, so the panel/grid disagreement is visible to Dwaraka rather than buried.
  - `[low]` `reject` (E1) same claim from the edge-case layer, with the proposed `cell: ({ getValue }) => getValue() ?? "never"` guard. Same site and same reasoning as BH-1; merged.
  - `[low]` `reject` (V3) no spec reads the grid's last-contacted cell. Verified: `grep` for `lastContactedOn|Last contacted` under `e2e/` returns nothing, and `grid-editors.spec.ts:625-700` pins `initialContact` instead. Real, but it is the coverage half of the same grid finding, and closing it means writing a cell-rendering spec for a column this story leaves read-only.
  - `[low]` `defer` (BH-2) no analysis of sort/filter behaviour for the now-mixed-population column. Partly refuted and partly kept: the column carries **no** `meta.grid.filter`, so the "is it filterable" half of the claim is false — there is no filter on it at all. The remaining half is real and cosmetic: TanStack sorts `null` first, so `NULL` rows sort ahead of every `YYYY-MM-DD`. No incorrect data is displayed. Recorded in `deferred`.
  - `[low]` `defer` (E3) the same sort-order claim from the edge-case layer, with the proposed `sortingFn`. Merged with BH-2; same verification, same route.
  - `[low]` `defer` (E2) a re-run of the one-shot Airtable import would repopulate the column. Verified the writer exists at `scripts/migrate-airtable-data.mjs:668`. Latent, not live: the import has already run, and re-running it would breach `AGENTS.md`'s production rule anyway. Recorded so story 3's cast gate is not taken by surprise.
  - `[low]` `defer` (VO2) other spec folders (`spec-contacts-premium-grid/existing-state.md:101`, `spec-airtable-to-supabase/data-model-mapping.md:25`) still describe the removed insert write. Verified as historical planning records, not live documentation. Informational; deferring avoids editing specs this story does not own.
  - `[false]` `reject` (BH-7) the 1,057-row reporting gate is recorded in a sibling story file story 3 has no pointer to. **Refuted by `stories.yaml` itself:** `:76-78` already carries "last_contacted_on ends EMPTY (Dwaraka park decision) — its existing values are nulled after reporting", and `:104` carries "set to NULL only after being reported, and every affected id is recorded in this story file". The gate is in the artifact story 3 is dispatched from; the finding assumed the sibling file was the only home for it.
  - `[false]` `reject` (BH-8) the `migration-playbook.md:37-43` / `:70-79` citation is wrong. **Refuted by reading those lines:** `:37-43` is the "List the offenders by id" block, `:70-79` is the report-then-null ordering ending "Record the count and the ids in the story file", and `:35` states "Repeat for `initial_contact` and `last_contacted_on`". The citation points at exactly the gate it claims is absent.
  - `[false]` `reject` (BH-12) the story's own `pnpm test:static` task was never run as written. **Refuted:** `package.json:48` defines `"test:static": "pnpm guardrails && pnpm typecheck:workspace && pnpm lint"` — the three commands run are exactly its constituents. Re-run as a single `pnpm test:static` after the patches: exit 0.
  - `[false]` `reject` (BH-16) `warnings: [oversized]` was declared and left unaddressed. **Refuted as a defect:** the field is an orchestration marker for downstream sizing, and the workflow directs the implementer to continue rather than to trim. No harm to users or developers is named.
  - `[false]` `reject` (BH-5) `stories.yaml` was not updated to record that `:559` needed no edit. **Refuted as worth fixing:** the intent's requirement is that the line *renders* `never` for `NULL`, which is true, and the story file — the artifact a reader reaches for story 2's outcome — records the inspection result explicitly. An instruction whose requirement is satisfied, next to the record showing it was satisfied, is not a defect.
  - `[false]` `reject` (IA-1, intent-alignment 3a) the display clause diverges: the intent said "set `:559` to render `never`", the diff produced no hunk there. **Refuted:** the intent's requirement is on the *rendered output*, and it never asserted the line was missing the fallback. Delivering the required behaviour without a no-op edit is correct, not a divergence. The residual point — that the blank case is guaranteed transitively by two untouched mappers rather than by the line itself — is true and is already stated in Design Notes and in the Verification Record.
  - `[false]` `reject` (IA-2, intent-alignment 3b) the reporting clause is undischarged: "report every id" sits in an imperative the diff converts into a carried-forward gate. **Refuted:** the B2 reading is not executable in this story at all. Reporting ids requires reading hosted, and the standing read-only hosted authorization in story 1's file is scoped to *that story alone*; `AGENTS.md` forbids the alternative. The intent's own parenthetical enumerates this story's deliverables as "removes the write and fixes the display". The divergence is documented in the Implementation Record, not silent.

### Corrections made by the triage pass itself

Three factual errors the patch subagent introduced into the record were caught by re-running the greps and re-reading the e2e provenance, and fixed directly: it wrote "17 occurrences remain" where the true figure is **19** (11 snake_case + 8 camelCase, both re-counted); it attributed the `pnpm test:e2e` run to **Dwaraka**, when it was run by this review pass; and it wrote "No database was contacted by this story's session", which is false once the e2e run had read and written the local seeded database. Recorded here because a run record that misattributes its own evidence is worse than no record.

### 2026-10-10 — Follow-up review pass

A follow-up pass on a `done` spec. `review_loop_iteration` was reset to 0 and `followup_pass` set; no code changed since `baseline_revision` (`9bc802a`) beyond the story record itself, so the diff under review is the original one-line deletion plus the `docs/` corrections. All four layers were re-run over that diff with the prior log in hand; the first two rows below are the *same* claims as logged rows above and are carried, not re-decided.

- verdicts: 22 findings — high 0, medium 3, low 13, false 5, maybe-false 0
- layers: blind-hunter 14, edge-case-hunter 5, verification-gap 2 (+1 other), intent-alignment 1
- routes: patch 4 (high 0, medium 0, low 4), defer 4, reject 14
- findings:
  - `[medium]` `defer` (carried, V1) no spec reaches `createContact`, so the removed insert write is unverified in both directions. Re-filed by the verification-gap layer as a `patch` with a concrete recipe (`request.post` against `/api/contact` plus the existing `readContactColumn` / `cleanupRowLifecycleContacts` fixtures). The recipe is credible and smaller than the first pass assumed — but it is **not** what changed, it adds a spec file the intent never names, and the first pass already settled the route as `defer`. Carried unchanged; the sharper recipe is recorded here so Dwaraka can author it directly instead of re-deriving it.
  - `[medium]` `defer` (carried, V2) the Favorites detail panel — the park's only user-visible output — is still opened by no spec, so `?? "never"` remains unpinned. Verified again: the complete `page.goto` list in `e2e/specs/*.spec.ts` has 11 entries and none is `view=favorites`; the only `/manage?view=` navigation is `theme-switch.spec.ts:450` (`view=contacts`). Carried unchanged.
  - `[medium]` `defer` (carried, DW-30 / BH-6) `SPEC.md` still advertises the opposite of the park. Verified again, and the follow-up pass found the stale surface is **wider than recorded**: DW-30 names `:80` and `:90`, but `SPEC.md:33` also asserts in the present tense that "`lib/supabase/data.ts:614-621` writes `last_contacted_on: currentProgramDate()` at **insert** and nothing ever updates it", and `SPEC.md:47`'s CAP-3 success criterion still lists `last_contacted_on` among the three columns that become `DATE` (that one remains correct — story 3 does convert it). The recorded `:33` line was verified as stale; the deferred entry's line list is **incomplete**, not wrong. Route unchanged, owner unchanged: closing a canonical-spec open question is Dwaraka's decision, not an unattended agent's edit.
  - `[low]` `patch` the triage log's own summary line did not reconcile with the rows beneath it — "30 findings … low 17 … patch 10, defer 7, reject 13" against 29 enumerated rows and 11/8/10 routes. Verified by parsing the rows: 6 medium, 16 low, 7 false, 29 total. **Fixed** in place with a note explaining that the per-layer totals legitimately sum to 30 because four duplicate pairs were merged into their primary rows, so the row count is authoritative.
  - `[low]` `patch` the Design Notes code block cited `lib/manage/manage-favorites-view.tsx:559` and `lib/manage/manage-types.ts:59`. Verified: `lib/manage/` contains exactly one file, `api-handlers.ts`; both components live under `components/manage/`. **Fixed** — two path corrections in the block whose stated purpose is to be the reader's ground truth for the display line.
  - `[low]` `patch` nothing in the record established that omitting the key is *schema-safe*. Verified at `supabase/migrations/20261004000000_create_core_tables.sql:18`: the column is declared `last_contacted_on TEXT,` — no `NOT NULL`, no `DEFAULT` — so the insert cannot violate a constraint and the value resolves to `NULL` by the schema's definition. **Fixed:** added to the Code Map, explicitly marked as not substituting for the row-level assertion deferred as V1/DW-28.
  - `[low]` `patch` the deletion site carries no marker that the absence is deliberate. Verified: `lib/supabase/data.ts:620` is a bare `initial_contact: createdDate,`. **Fixed by record, not by comment:** added to the Implementation Record's rollback note that a revert is a one-line restore which does **not** backfill. A source comment was deliberately **not** added — the repo's convention (`data.ts` has one `//` comment in 1,100+ lines) does not carry such markers, and the intent did not authorise a code comment. Recorded as a judgement call rather than silently skipped.
  - `[low]` `defer` two items deferred in the first pass never reached the ledger — BH-13 (the skipped `AGENTS.md` Full-level e2e escalation, whose record claims durability that does not exist) and VO2 (stale cross-spec descriptions). Verified: `deferred-work.md` gained exactly six entries (DW-28…DW-33), matching the six frontmatter blocks; the log defers eight. The ledger is owned by the sweep/orchestrator, which reconciles spec-deferred entries into it, so this is a reconciliation the build must not perform itself. Recorded for the next sweep.
  - `[low]` `defer` VO2's citation was filed as verified without being checked, and is wrong. Verified: `spec-contacts-premium-grid/existing-state.md:101` is a grid-column table row (`| lastContactedOn | date | — | read-only, ISO |`); the stale prose the finding describes is at **`:224`**, with the schema listing at `:234`. The paired citation `spec-airtable-to-supabase/data-model-mapping.md:25` **is** accurate — and that row covers `initial_contact` / `last_contacted_on` jointly under "Asia/Kolkata date on create", which is now only half-true, so a fixer could wrongly delete `initial_contact`'s still-correct entry. Recorded as a deferred item with corrected line numbers and that trap named; the spec folders belong to other specs.
  - `[low]` `defer` the flake verdict rests on a single observation. Verified as filed: one isolated re-run (10 passed) and no `pnpm test:e2e:determinism` evidence, no second full-suite run, no repeat count. The record already concedes the classification "is a judgement, not a proof", so nothing is overstated — but nothing settles it either. Pre-existing test, not caused by this story. Recorded so the next run does not treat the flake as closed.
  - `[low]` `defer` the local e2e corpus has `last_contacted_on` `NULL` on every row — neither `scripts/seed-local-fixtures.mjs` nor `scripts/bulk-contact-fixtures.mjs` writes the column. Verified: `grep -rn "last_contacted_on" scripts/` finds it only in the one-shot Airtable importer. Consequence for DW-33: the "NULL sorts ahead of every date" mixed population exists **only in hosted data**, so any local assertion about that ordering would pass vacuously. This qualifies DW-33 rather than repeating it.
  - `[low]` `defer` `stories.yaml:57` still tells story 2's implementer that `data.ts:614-621` writes the column at insert, and story 3's block nowhere states that new rows already arrive `NULL`. Verified at `stories.yaml:57`. Deliberately not patched: `stories.yaml` is the orchestrator's dispatch file and `invoke_dev_with` is explicitly a caller-owned field that build-auto is forbidden to read for content. Flagged so the orchestrator refreshes it before story 3 dispatches.
  - `[low]` `defer` the `never` fallback's correctness rests entirely on two mappers this story does not touch (`normalizeString` at `data.ts:234`, `text()` at `manage.ts:180`), and this change makes empty the common case rather than the exception. Verified: both collapse non-string and blank to `undefined`/`null` today, and nothing pins them. A future edit letting either pass blanks through would silently restore the empty-gap rendering AC #3 forbids, with no gate firing. Real, uncovered, and distinct from V2 (which is about the panel never being opened, not about the mappers).
  - `[low]` `reject` the story file and `deferred-work.md` are two parallel copies of six items with no shared key. Verified: the frontmatter blocks carry no `DW-` id and the ledger entries carry `origin: spec-deferred <hash>`. Rejected as a defect in this story: the `origin` hash on each ledger entry **is** the join key, and it points at this file. The duplication did surface one wording divergence (the e2e phrasing below), which is filed on its own merits.
  - `[low]` `reject` `deferred-work.md` DW-28 says "`pnpm test:e2e` passes 165 with one flake" while the Verification Record says "exited 1: 165 passed, 1 failed". Verified both texts. Rejected: no reader is misled. The ledger sentence is a passing-165 count with a named flake; the record is the fuller statement of a non-zero exit. The apparent contradiction is a difference of precision, not of fact, and the ledger's wording is the orchestrator's to phrase.
  - `[low]` `reject` both `docs/` corrections state the park with no pointer to the grid/panel disagreement. Verified: `docs/data-models.md:49` and `docs/architecture.md:194` read as settled. Rejected as not worth fixing: a docs row is not the place for an unresolved rendering question between two surfaces, and DW-31 already carries it with the exact one-line fix. Adding a cross-reference would spread a decision Dwaraka has not made into documentation that everyone reads.
  - `[low]` `reject` the frontmatter was never advanced and the `deferred:` blocks carry no ledger key. Verified. Rejected: `review_loop_iteration`/`followup_review_recommended` are written by the finalize step of whichever pass is running, and the absence of a `DW-` id in the frontmatter is by design — ids are minted by the ledger, not by the spec.
  - `[false]` `reject` `components/grid/grid.tsx:928` — `getAutoSortDir` makes the first click's sort direction data-dependent for this column. Refuted: `grep -rn "getAutoSortDir\|autoSortDir" components/ lib/` returns **nothing** — no such function exists in this repo. The site is `onSortToggle={() => { column.toggleSorting() }}`, which passes no direction and therefore uses TanStack's own auto-detection. Whatever that detection does, it is unchanged by this diff and by the deleted line.
  - `[false]` `reject` `lib/supabase/data.ts:29` `ContactFields` retains an orphaned `"Last Contacted On"?: string` member, implying a writer the park forbids. Refuted as a defect: verified that the only two occurrences of the string are `data.ts:29` (the declaration) and the grid column **label** at `manage-contacts-table.tsx:104`. `ContactFields` is the Airtable-import shape and already carries many fields the create path ignores; the park changed no declaration and no reader.
  - `[false]` `reject` the intent's "this story performs … the reporting that gates it" clause is undischarged. Refuted again, and now with the follow-up layer's own enumeration: C4's literal reading requires a hosted `SELECT`, which the intent's own Never clause ("Do not open a hosted connection … takes no hosted action of any kind") forbids in the same paragraph. Only the gate-transposition reading is internally consistent, and the diff implements it — the 1,057 figure is labelled transcribed evidence from story 1, not a measurement taken here.
  - `[false]` `reject` an update path exists somewhere the diff missed. Refuted by direct check: `buildContactWritePayload`'s switch (`lib/supabase/manage.ts:899-939`) has no `lastContactedOn` case and the grid column carries no `meta.grid.editable`, so the manage `PATCH` route cannot write the column either. The first pass's central claim — that the deletion removes the only write — holds under re-verification.
  - `[false]` `reject` the display clause diverges because the diff has no hunk at `:559`. Refuted again: the requirement is on rendered output, the line already satisfies it, and the intent never asserted an edit was needed. The transitive-mapper dependency is real and is filed on its own merits above rather than folded into this refutation.


## Design Notes

**Why the display line is expected to need no edit.** Three facts line up, and they are the reason to look before touching:

```ts
// components/manage/manage-favorites-view.tsx:559  (already present)
· Last contacted on: {selectedContact.lastContactedOn ?? "never"}

// components/manage/manage-types.ts:59
lastContactedOn: string | null          // null is in the type, not an accident

// lib/supabase/manage.ts:180-187  and  lib/supabase/data.ts:234-236
text() / normalizeString()  ->  non-string or blank becomes null / undefined
```

`??` handles `null` and `undefined`; both mappers already collapse `""` and whitespace to null before the DTO is built. So the `NULL` case renders `never` today, and will keep rendering it once new rows arrive empty. The real behaviour change is not on this line — it is that the value it reads will now be *absent for the right reason* rather than *present and wrong*. Do not "improve" this line into a placeholder element; that would be a UI change this story does not authorise.

**Golden example — what the story changes:**

```diff
   const insertPayload: Record<string, unknown> = {
     program_id: programScopedFilter(),
     name: data.name.trim(),
     phone: normalizedPhone,
     initial_contact: createdDate,
-    last_contacted_on: createdDate,
   }
```

## Implementation Record (2026-10-10)

### What changed in code

One deletion, one file:

- `lib/supabase/data.ts:621` — `last_contacted_on: createdDate,` removed from `insertPayload`. `createdDate` (`:614`) and `initial_contact: createdDate` (now `:620`, shifted up by the deletion) are untouched, so `createdDate` is still used and no unused-variable lint was introduced.

The resulting payload:

```ts
const createdDate = currentProgramDate()

const insertPayload: Record<string, unknown> = {
  program_id: programScopedFilter(),
  name: data.name.trim(),
  phone: normalizedPhone,
  initial_contact: createdDate,
}
```

**No other file was edited.** In particular `components/manage/manage-favorites-view.tsx` was **inspected and deliberately not changed** — see the display finding below.

### Display line — inspection result: already correct, no edit made

`components/manage/manage-favorites-view.tsx:559` reads, verbatim and unchanged:

```tsx
· Last contacted on: {selectedContact.lastContactedOn ?? "never"}
```

All three of the conditions the acceptance criteria name were checked against the source, not assumed:

| Condition | Evidence | Result |
|---|---|---|
| `NULL` renders the plain word `never` | `??` covers both `null` and `undefined`; the DTO type is `lastContactedOn: string \| null` (`components/manage/manage-types.ts:59`) | covered |
| blank (`""` / whitespace) also renders `never`, not a gap | `normalizeString()` (`lib/supabase/data.ts:234-236`) returns `undefined` for any non-string or blank/whitespace-only string; `text()` (`lib/supabase/manage.ts:180-187`) does the same on the manage path | covered upstream, before the DTO is built |
| a stored value is displayed unchanged | no conditional, no transformation, no placeholder element on the line | covered |

So the `??` fallback is sufficient **only because both read mappers normalise blanks away** — a `??` alone would render `""` as an empty gap, and it is the mappers, not the `??`, that closes that case. That is the condition the acceptance criterion is really about, and it holds on both read paths.

No placeholder element, dash, or styling was introduced, per the "Never" clause.

### Behaviour change, recorded deliberately

`never` is a **new, user-visible output**, not a silent fallback. Before this change a newly created contact displayed `· Last contacted on: <its own creation date>` — the `createdDate` written at insert. After it, a contact created through the save/registration path stores `NULL` for that column and the same panel renders `· Last contacted on: never`. Operators who relied on the previous line reading as "created on" will see it read as "never", and that difference is the intended consequence of the park.

Pre-existing rows are **untouched**: no `UPDATE`, no migration, no DDL, no backfill ran in this story, so every contact that already holds a value still displays it unchanged.

### Precondition carried forward to story 3 — report the id population before nulling

This story **performs no nulling** and opens no hosted connection. Story 3 does the nulling, and this is the gate that must be satisfied by it, recorded here so the gate lives outside a session:

1. **Story 3 must run and read the offender-by-id `SELECT` for `last_contacted_on` *before* any `UPDATE` or `ALTER` touches the column**, per `migration-playbook.md:37-43` and `:70-79`. The ids and the count get recorded in story 3's own file.
2. **The population to report is the 1,057 non-null hosted rows.** From story 1's measured CAP-1 (`stories/1-data-audit-of-the-three-contacts-date-columns.md:23`, *Hosted audit result (manual re-run 2026-10-10, Dwaraka + agent) — MEASURED, OQ-2 DECIDED*): `total` 1094, `nulls` 37, `exact_iso` **1057**, `prefix_with_trailing` 0, `not_a_date` 0. So every non-null `last_contacted_on` value is already a well-formed `YYYY-MM-DD` and **no row is uncastable** — story 3's nulling step on this column has nothing to null. The 1,057 rows still need to be *reported by id*, because emptying 1,057 rows' worth of a column an operator reads as "last contacted" is a reporting obligation even when the values are all castable and the nulling is not happening.
3. **Do not extend story 1's hosted authorization to this story or to story 3's destructive step.** The read-only hosted authorization in story 1's file is scoped to that story alone. The 1,057 figure is **transcribed evidence from story 1's measured run**, not a measurement taken here — this run issued no query of any kind against the hosted project.
4. **Do not let this park's `NULL` new rows be read as "already migrated".** After this story, `last_contacted_on` is `NULL` for all *newly created* rows and populated for older ones. Story 3's cast must still run the gate; it must not infer that the column is empty because recent inserts are.

## Verification Record (2026-10-10) — actual commands and actual results

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck:workspace` | **0** | All 6 projects Done (`data-contracts`, `ui`, `program-config`, `authz`, `apps/folk`, `apps/gita-life`); no type errors. |
| `pnpm lint` | **0** | `12 problems (0 errors, 12 warnings)`. All 12 are pre-existing warnings in `components/ui/use-toast.ts`, `hooks/use-toast.ts`, `lib/authz.ts` and `scripts/*.mjs`. **Zero warnings in `lib/supabase/data.ts`** — `createdDate` did not become unused. |
| `pnpm guardrails` | **0** | "Monorepo guardrails passed." 4 warnings, all pre-existing `type-imports @/lib/authz` in `lib/auth-context.tsx`, `components/auth-hash-callback.tsx`, `components/invite-user-form.tsx`, `components/staff-auth-shell.tsx`. None introduced here. |
| `grep -rnE "last_contacted_on\|lastContactedOn" --include=\*.ts --include=\*.tsx .` | — | **The `data.ts:621` insert write is gone. 19 occurrences remain** (11 snake_case + 8 camelCase), split by pattern because neither alone covers the story: <br>• **`last_contacted_on` (snake_case) — 11 hits**, every one a read path, select list or type declaration: `data.ts` `:184` (type), `:529` (read), `:548`/`:572`/`:668` (select lists); `manage.ts` `:72` (select list), `:113` (type), `:573` (read); `types.ts` `:159`/`:185`/`:211` (generated types). Note `data.ts:109` is **camelCase** `lastContactedOn?: string` and is outside this pattern's scope. <br>• **`lastContactedOn` (camelCase) — 8 hits**, covering the surfaces snake_case cannot see: the DTO `components/manage/manage-types.ts:59`, the display `components/manage/manage-favorites-view.tsx:559`, and the grid column `components/manage/manage-contacts-table.tsx:58`/`:188`/`:916`; plus the read-side mapping at `data.ts:109`. <br>Outside `.ts`/`.tsx`, the two files above add `supabase/migrations/20261004000000_create_core_tables.sql:18` (the column) and `scripts/migrate-airtable-data.mjs:668` (the one-shot import writer, out of scope). **No insert write and no update write remain in the app's runtime write paths.** |
| `pnpm test` | 0 | **`0 successful, 0 total` — "No tasks were executed as part of this run." Not a pass and not reported as one.** |

App mirroring checked: `grep -rn "last_contacted_on\|lastContactedOn" apps/` returns nothing — neither app holds a copy of `lib/supabase/data.ts` or `manage-favorites-view.tsx`, so there is no mirrored copy to keep in step.

E2E: `grep -rln "lastContactedOn\|last_contacted_on\|Last contacted" e2e/` returns nothing across all 16 spec files. No spec, assertion or coverage-map row references any of the three identifiers this story touches, so **no matrix row is retired and `matrix-coverage-map.md` needs no update**.

**`pnpm test:e2e` was run by the review pass (build-auto step-04), not by the implementation session. It exited 1: 165 passed, 1 failed.** `AGENTS.md` puts any `lib/supabase/*` change at the Full verification level, so the suite was run even though no spec references the column.

| | |
|---|---|
| Failing test | `e2e/specs/manage-contacts-edit.spec.ts:334` — "row 2 — a committed edit is the server's value after a reload" |
| Failure point | inside `filterGlobally`, at `e2e/fixtures/manage-grid.ts:385`, on `search.pressSequentially(text)` |
| Isolated re-run | `pnpm test:e2e "manage-contacts-edit"` — **10 passed (1.3m), exit 0** |
| Verdict | **Load-dependent flake on a typing timeout.** Not caused by this story. |

**Why it is not attributable to this story.** That test PATCHes an existing row through `lib/manage/api-handlers.ts`. It never touches `last_contacted_on` and never calls `createContact` — the only function this story changed. The failure is in `pressSequentially`, i.e. character-by-character typing into the filter box under load, which is a timing interaction with the full-suite run and not a data assertion. It passes on its own, which is the signature of a load-dependent flake rather than a real regression.

**This is not a green run and is not reported as one.** The suite result for this story is 165 passed / 1 failed, with the failure classified as a pre-existing flake and left unfixed — Dwaraka's call, not a silent pass.

No test fixture, seed or migration file was modified. **No database was written by this story's implementation, and no `UPDATE`, `DELETE` or DDL was issued against any database at any point.** The e2e run above did read and write the local seeded database — that is what the suite does — but no hosted connection was ever opened, and no hosted data was read or changed. Nothing was committed or pushed at the time this record was written.

### Rollback

Reverting is a one-line restore: put `last_contacted_on: createdDate,` back into `insertPayload` in `lib/supabase/data.ts`, alongside `initial_contact: createdDate`. No migration, DDL or data change is involved, so there is nothing to reverse elsewhere.

**Reverting does not backfill.** It restores the lie for *future* rows only. Every contact created since the park already committed with `last_contacted_on` `NULL` and stays `NULL` after a revert — the rollback would leave those honest gaps in place while new rows again reported their own creation date as the date they were last contacted. So a revert produces a mixed population, not a restored original state. If the park is reverted, the gap has to be described to operators rather than silently accepted, and only an explicit backfill (a separate decision this story does not authorise) would remove it.

## Verification

**Commands:**
- `pnpm typecheck:workspace` -- expected: SUCCESS, all packages Done, no type errors.
- `pnpm lint` -- expected: SUCCESS, no new error. `lib/supabase/data.ts` must not gain an unused-variable warning from the removal.
- `pnpm guardrails` -- expected: SUCCESS; `lib/` is in its blast radius.
- `grep -rnE "last_contacted_on\|lastContactedOn" --include=*.ts --include=*.tsx .` (excluding `node_modules` and build output) -- expected: the `lib/supabase/data.ts:621` insert write is gone and **no write of any kind remains in the app's runtime write paths**; reads, select lists, types, schema, grid column and display all still present. Both patterns are needed: snake_case alone cannot see the display, the DTO or the grid column.
- `pnpm test` -- **not** to be reported as a pass; it runs zero tests and exits 0.

**Run, and not green:** `pnpm test:e2e` was run by the review pass — **exit 1, 165 passed, 1 failed**. The failure is `e2e/specs/manage-contacts-edit.spec.ts:334` ("row 2 — a committed edit is the server's value after a reload"), inside `filterGlobally` at `e2e/fixtures/manage-grid.ts:385` on `search.pressSequentially(text)`; in isolation, `pnpm test:e2e "manage-contacts-edit"` gave **10 passed (1.3m), exit 0**. That test PATCHes through `lib/manage/api-handlers.ts` and never touches `last_contacted_on` or `createContact`, so this is a load-dependent flake on a typing timeout, not a regression from this story — and not a pass. Full detail under *Verification Record*. (No e2e spec references `lastContactedOn`, `last_contacted_on` or "Last contacted", so the suite covers this change in neither direction.)

**No automated test asserts this story's acceptance criteria, and that is a recorded gap, not a hidden pass.** This repository has no unit runner at all — `pnpm test` executes zero tests and exits 0 because no workspace package defines a `test` script — and the e2e suite references none of the three identifiers this story touches. Concretely: the one spec that creates a contact through the app, `e2e/specs/manage-contacts-edit.spec.ts`'s sibling `manage-contacts-row-lifecycle.spec.ts`, goes through `POST /api/manage/contacts` → `createManageContact`, a different writer that never touched this column — so **re-adding `last_contacted_on: createdDate`, or deleting the adjacent `initial_contact: createdDate` line, would ship with a fully green suite.** That finding is deferred in the *Review Triage Log* as V1/V2 rather than patched, because closing it means authoring two new spec files against routes this story's intent never names. Standing up that coverage is Dwaraka's call; it should not be a quiet side effect of a park story.


## Auto Run Result

**Status:** done (follow-up review pass)

### What this pass was

A follow-up review of a `done` spec, not an implementation run. `review_loop_iteration` was reset to 0 and `followup_pass` set to `true`. **No code changed.** The diff under review is byte-identical to the one the first pass reviewed — the one-line deletion at `lib/supabase/data.ts` and the two `docs/` corrections — plus this story record's own edits. All four layers (blind-hunter, edge-case-hunter, verification-gap, intent-alignment) were re-run over that diff with the prior triage log in hand, and every finding was checked against the log before being re-decided.

### Files changed this pass

One file — the story record. No product code, no docs, no specs, no fixtures.

- `_bmad-output/specs/spec-contacts-date-types/stories/2-park-last-contacted-on-as-empty-date-for-future-use.md` — three record corrections (triage-log counts, two wrong paths in Design Notes, schema-safety evidence added to the Code Map), this pass's triage-log entry, and seven new `deferred` entries. `_bmad-output/implementation-artifacts/deferred-work.md` was **not** touched: the ledger is owned by the sweep/orchestrator, and the two straggler deferrals it is missing are recorded in the spec's frontmatter for the next sweep to reconcile.

### Review outcome

22 findings. Verdicts: high 0, medium 3, low 13, false 5. Routes: 4 patched, 4 deferred (plus 6 deferred rows carried from the first pass), 14 rejected.

**Patched (4, all `low`; no `high`, no `medium`):** the triage log's own header miscounted its rows; Design Notes cited `lib/manage/…` for two components that live under `components/manage/`; nothing recorded that the column is declared `TEXT` with no `NOT NULL` and no `DEFAULT`, which is the static evidence the deletion is schema-safe; and the deletion site's deliberateness was argued at length in Rollback while the source line carries no marker — recorded in the record rather than as a source comment, because `data.ts` has one `//` comment in 1,100+ lines and the intent did not authorise one.

**Deferred (4 new, 7 total):** `SPEC.md:33` is stale in the same way `:80` and `:90` are and the existing deferral does not name it; two first-pass deferrals never reached the ledger, so BH-13's claimed durability is not real; VO2's line citation is wrong and its paired citation is a row that is now only half-true, so a fixer could delete `initial_contact`'s correct entry alongside the stale one; the flake verdict rests on one isolated re-run with no determinism evidence; the entire local e2e corpus has the column NULL, which would make any local sort-order assertion pass vacuously; `stories.yaml` still dispatches story 3 from a pre-park description; and the `never` rendering depends on two untested upstream mappers, which this change promotes from edge case to common case.

**Rejected (14),** of which the five `false` are worth naming: no `getAutoSortDir` exists anywhere in this repo, so the data-dependent first-click direction finding is aimed at a function that is not here; `ContactFields`' `"Last Contacted On"` member is the Airtable-import shape and already carries many fields the create path ignores — the park changed no declaration and no reader; the reporting clause is not executable under its literal reading because the intent's own Never clause forbids the hosted read it would require; **no update path exists** — `buildContactWritePayload`'s switch has no `lastContactedOn` case and the grid column carries no `meta.grid.editable`, so the manage `PATCH` route cannot write the column either, which re-confirms the first pass's central claim; and the display clause is a rendered-output requirement the existing `??` already satisfies.

### Verification performed

| Command | Exit | Result |
|---|---|---|
| `pnpm test:static` | **0** | guardrails passed; lint **12 problems (0 errors, 12 warnings)**, all pre-existing, none in a file this pass touched |
| `pnpm typecheck:workspace` | **0** | all 6 projects Done, no type errors |
| `python3 -c yaml.safe_load` on this file's frontmatter | **0** | `deferred` parses as one list of 13 items: the 6 prior entries preserved verbatim plus 7 new |
| row-count parse of the first pass's triage log | — | 29 rows, 6 medium / 16 low / 7 false, routes 11 patch / 8 defer / 10 reject — against the header's "30 … low 17 … patch 10, defer 7, reject 13". Header corrected |
| `grep -rn "getAutoSortDir\|autoSortDir" components/ lib/` | — | **no hits**; the cited function does not exist in this repo |
| `sed -n '18p' supabase/migrations/20261004000000_create_core_tables.sql` | — | `last_contacted_on TEXT,` — no `NOT NULL`, no `DEFAULT`; the schema-safety claim the Code Map now records |
| `ls lib/manage/` | — | one file, `api-handlers.ts`; both Design Notes paths were wrong and are corrected |

**No e2e run this pass, and none is claimed.** The code under review is byte-identical to the diff the first pass ran the full suite against, and `pnpm test:e2e` takes 5–7 minutes at one worker; re-running it would re-measure an unchanged tree. The first pass's result stands unchanged and is **not green**: exit 1, 165 passed, 1 failed (`manage-contacts-edit.spec.ts:334`, classified as a load-dependent flake on a typing timeout, isolated re-run 10 passed). This pass's deferral entry on that flake records what would settle it — one `pnpm test:e2e:determinism` run — which was not run here.

`pnpm test` is not reported as a pass: it executes zero tests and exits 0 because no workspace package defines a `test` script.

### Follow-up review recommended: `false`

This is a follow-up pass, so the bar is "only if this pass patched a `high`". It patched four `low` record corrections and no `high`, and patch volume is never grounds on a follow-up. The work has converged: the first pass's recommendation named two patched `medium` prose corrections in `docs/` with no gate reading them — those are on disk, correct, and unchanged since, and the two remaining `medium` items (V1, V2) are test-coverage deferrals that cannot be settled by another review pass. Nothing is left that a third pass could usefully re-decide.

### Residual risks

1. **The park remains unpinned by any test.** Re-adding `last_contacted_on: createdDate`, or deleting the adjacent `initial_contact: createdDate`, still ships with a fully green suite. This pass did not close it and could not: the verification-gap layer supplied a concrete recipe (a `request.post` against `/api/contact` plus the existing `readContactColumn` / `cleanupRowLifecycleContacts` fixtures — no new fixture file needed), which is recorded in the triage log, but authoring a spec file the intent never names remains Dwaraka's call.
2. **`SPEC.md` advertises the opposite of this story at three lines, not two.** `:80`, `:90` and now `:33`. Story 3 reads `SPEC.md` and could take any of them as permission to add the update path the intent forbids.
3. **`stories.yaml` will dispatch story 3 from a pre-park description.** Its `invoke_dev_with` still says the column is written at insert, and nothing there warns that new rows already arrive `NULL`. Build-auto is forbidden to edit that field; the orchestrator must refresh it before story 3 dispatches.
4. **The 1,057 hosted rows still hold creation dates.** Unchanged by this pass. The reporting gate story 3 must satisfy remains recorded in this file and in `stories.yaml:76-78`.
5. **The flake is still unrooted.** One isolated re-run is still the whole of the evidence.
