---
title: 'Typed editors, the editor registry, and DW-27'
type: 'feature'
created: '2026-10-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 05cbd6ae5f6931ad706b8e48eb47e809f8561df8
context:
  - _bmad-output/specs/spec-grid-keyboard-editors-and-theme/SPEC.md
  - _bmad-output/specs/spec-grid-keyboard-editors-and-theme/editor-catalog.md
  - _bmad-output/specs/spec-grid-keyboard-editors-and-theme/existing-state.md
  - docs/manage-grid-pattern.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The grid has one editor — a bare `<input>` — and one untyped
`meta.grid.editor: string`. Every other typed control the product needs (select,
multi-select, date, currency, checkbox, URL, email, person, long text) is
absent, and `deferred-work.md` DW-27 records a trap that makes adding any of
them silently lose the optimistic display. The contacts table has no column that
can exercise six of the eleven types.

**Approach:** Add a typed, keyed editor registry to the primitive (eleven
entries, none a stub) resolved from `meta.grid.editor`, and resolve DW-27 in the
cell by handing every editor the already-overridden display text so a widget
renderer cannot re-read the stale stored value. Wire the types real contact data
supports (`text`, `longtext`, `select` on `source`, `multiselect` on `booksRead`,
`date` on `initialContact`/`dateOfBirth`) and demonstrate the other six on the
existing `/dev/grid-preview` harness.

## Boundaries & Constraints

**Always:**

- **DW-27 is in scope.** `GridRow` prefers `cell.render` over `cell.text`, and
  `cell.text` is where the optimistic override lives. The fix belongs in the
  cell: the editor receives the already-overridden text and whatever it returns
  renders; `undefined` falls back to `cell.text`.
- **`resolveConsumerRenderers` stays table-agnostic.** It must not learn which
  columns are editable. The compensation for a column that authors its own cell
  node is the exemption, applied where the write is decided.
- **Validation is `parse()` throwing.** The hook catches it and reuses the
  existing revert path, so a rejected value shows the same destructive cell and
  the same status message a rejected write shows. **No editor gets its own error
  UI** — one validation story, one presentation.
- **Registry, not a switch.** `GridColumnMeta.editor` is a closed
  `GridEditorKey` union resolved through one map; adding a type is an entry, not
  a branch in the cell renderer.
- **`checkbox` is the only editor with `commitsOnInteraction`.** Every other
  type commits on Enter, blur-free explicit commit, or an explicit close —
  clicking away mid-edit writes nothing.
- **Editors render anchored, never in-cell and growing.** Single-line controls
  render in-cell at the row's own height; anything with a list, a search, a
  calendar or a multi-line body renders in a `Popover` portal, because
  `GridRow` enforces fixed row heights. `longtext` is a popover precisely
  because it cannot fit in 32px.
- **One write path.** Every commit — typed, picked, cleared, pasted — ends at
  the existing `onCellCommit`. No editor calls `fetch`; no second mutation
  channel; no new dependency.
- **`GridColumnMeta` stays presentation-only.** It gains `editor` and
  `editorOptions` and carries no value.
- **`favorite` keeps its star `display` column.** Converting it would make
  `getByRole("checkbox")` ambiguous at three green spec sites and break
  `favoriteStar` (`getByRole("button")` inside a row) at four more.
- **No schema change.** `source` is an existing nullable `TEXT` column
  (`supabase/migrations/20261006000000_add_users_and_contact_columns.sql:63`).
  Plumbing it through is a one-key write-surface growth on an existing column,
  which the story resolution authorizes explicitly.

**Never:**

- No `dark:` classes and no raw hex / `rgb(` / `white` / `black` under
  `components/grid/` — the token-clean property is what makes CAP-7 a switch
  rather than a rewrite.
- No `Manage*`, `/api/manage` or contacts vocabulary anywhere under
  `components/grid/` (CAP-8).
- No schema migration, no new dependency, no RLS change.
- No direct Supabase from a component, no new authorization logic.
- No drop shadow on any editor surface (`design-constraints.md`).
- No `<button>` in an editor's **closed display state** — `favoriteStar` resolves
  `getByRole("button")` unscoped inside a row, so a button in every editor cell
  makes four green assertions ambiguous.
- Do not edit `scripts/verify-monorepo-guardrails.mjs`; the airtable-removal
  check asserts its contents.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| text commit | `name`, draft `Ravi`, Enter | cell shows `Ravi` before the PATCH resolves; survives reload | server 400 reverts with the destructive marker |
| longtext commit | `notes`, popover textarea, `Cmd+Enter` | multi-line value written; row height unchanged while open | — |
| longtext rejection | draft of 2001 chars | cell reverts to the prior value, destructive class, status message | `parse` throws → revert path |
| select commit | `source`, pick an option | `source` written; survives reload | — |
| select rejection | draft naming a value outside `options` | reverts in the cell with `"X" is not an option for Source.` | `parse` throws → revert path |
| multiselect commit | `booksRead`, tick a second option, Apply | array written; survives reload | — |
| multiselect rejection | pasted entry outside `options` | reverts; cell unchanged | `parse` throws → revert path |
| date commit | `initialContact`, pick on the Calendar | `YYYY-MM-DD` written; survives reload | — |
| date rejection | draft `2026-02-31` | reverts; day the month does not have never rolls over | `parse` throws (`parseISO` rejects it) |
| checkbox commit | preview `flagged`, click the cell | flips immediately and writes; no editor ever opens | — |
| checkbox rejection | preview `flagged` on the locked row | returns unchecked, destructive, status message | rejected **write** (a boolean has no draft to reject) |
| currency commit | preview `amount`, type `12.50` | stored as 1250 minor units; display `Intl`-formatted | — |
| currency rejection | draft `1.239` | reverts | `parse` throws |
| number commit | preview `quantity`, type `42` | right-aligned `tabular-nums` | — |
| number rejection | draft `12abc` | reverts | `parse` throws |
| url commit | preview `website` | renders as an `http(s)` link | — |
| url rejection | draft `example.org` (no scheme) | reverts | `parse` throws |
| email commit | preview `emailAddress` | shown as text | — |
| email rejection | draft `a@b` (no domain dot) | reverts | `parse` throws |
| user commit | preview `assignee`, pick a person | initials + name shown | — |
| user rejection | an id not in `options.users` | reverts | `parse` throws |
| in flight (all eleven) | write parked mid-flight | the edited cell shows the new value before the write resolves | — |
| positioned popover | any popover editor open | body is outside the `<tr>`; row height identical | — |
| discard | click away mid-edit on a non-checkbox editor | zero PATCH requests; value unchanged | — |

</intent-contract>

## Code Map

- `components/grid/grid-types.ts:37-46` — `GridColumnMeta`; `editor?: string`
  becomes `GridEditorKey` and gains `editorOptions`. This module contributes zero
  runtime import edges (guardrail, `verify-monorepo-guardrails.mjs:542-596`), so
  a new editor **type** module must stay type-only.
- `components/grid/grid-types.ts:186-211` — `GridCellView`, what `GridRow`
  consumes. Gains an optional resolved-editor pair; the definition and its
  context travel together so they cannot disagree.
- `components/grid/grid-row.tsx:173-183` — **the DW-27 fix site.** The
  three-branch ternary: `editing` → `cell.render` → `cell.text`. Becomes
  editor-first, where the editor falls back to `cell.text`.
- `components/grid/grid-row.tsx:42-71` — `GridCellEditor`, the existing bare
  `<input>`; `aria-label="Edit cell value"` is what
  `manage-contacts-edit.spec.ts:203-205` and `manage-contacts-filter.spec.ts:167`
  address. The `text` editor must render a control under that same label.
- `components/grid/grid.tsx:250-269` — `resolveConsumerRenderers`. **Read-only
  for this story** — table-agnostic by contract. `grid.tsx:631` passes the set
  down.
- `components/grid/use-grid-keyboard.ts:670-693` — `openEditor`, the one opener
  story 2 landed; must resolve the editor and route `commitsOnInteraction`.
- `components/grid/use-grid-keyboard.ts:721-751` / `:759-809` —
  `revertCommit` / `runCommit`: the only two exits a write has. `runCommit:763-768`
  already stringifies arrays as `", "`, which is what `multiselect` reads back.
- `components/grid/use-grid-keyboard.ts:834-852` (`clearCell`) and `:973-1053`
  (`pasteText`) — both skip `consumerRenderedCells`. A column carrying an
  `editor` must be **exempt** from that skip or it is unwritable.
- `components/grid/use-grid-keyboard.ts:66-76` — `isGuardedTarget` already treats
  `[data-radix-popper-content-wrapper]` as guarded, so popover keystrokes do not
  reach the container handler. No change needed, but load-bearing.
- `components/grid/use-grid-keyboard.ts:1357-1404` — `getCellView`, where the
  resolved editor and its context are built.
- `components/grid/index.ts:22-37` — the grid module's export surface; the new
  type module and registry lookup are re-exported here.
- `components/grid/grid-preview.tsx:37-98` — `PREVIEW_COLUMNS`. `flagged:96`
  already carries `editor: "checkbox"` and is what `grid-keyboard.spec.ts`
  addresses as the grid's **last** column (`End`, `Tab` wrap) — new columns go
  before it.
- `apps/folk/app/dev/grid-preview/page.tsx:21,38-60` — 500 deterministic rows,
  `flagged: index % 3 === 0`. `apps/gita-life` mirrors it byte-for-byte.
- `components/manage/manage-contacts-table.tsx:46-55,97-101` — column ids and
  `PATCH_KEY_BY_COLUMN` (currently only `name`, `phone`, `notes`).
  `handleCellCommit:302-314` refuses any column with no patch key.
- `components/manage/manage-types.ts:42-65,148-160,171-184` — `ManageContact`
  (no `source`), `MANAGE_CONTACT_PATCH_KEYS` (11 keys), and
  `ManageContactWriteResult`. All three need `source`.
- `lib/supabase/manage.ts:60-77,85-97,99-116,555-578,911,969` — `CONTACT_COLUMNS`
  (no `source`), the exhaustive `CONTACT_COLUMN_BY_PATCH_KEY`, `ContactRow`, the
  read mapping, the exhaustive `switch`, and the write-result mapping. Every one
  is exhaustive over the patch keys, so a missing entry is a compile error.
- `lib/manage/api-handlers.ts:42,140-229` — `ALLOWED_PATCH_KEYS` derives from
  `MANAGE_CONTACT_PATCH_KEYS`; `parseContactPatch`'s `switch` needs a `source`
  case or the route 400s.
- `docs/manage-grid-pattern.md:90-95` — "never mark a column `editable` *and*
  give it a `cell` widget". This story supersedes that rule for `editor`
  columns; the doc must say so.

### Verified against the local stack, not recalled

`psql` on the running `supabase_db_folk_hkmc`:

```
select source, count(*) from contacts group by source;
 preview-fixture-bulk | 250
 preview-fixture      |   4
```

- **The `select` option list is `preview-fixture` and `preview-fixture-bulk`,
  plus whatever the payload's own rows carry.** The catalog's
  "Pass Distribution" / "Public Registration" / "Old" are Airtable-era strings
  that no migration, seeder or fixture in this repository writes; offering them
  would put three dead options in front of every operator. Recorded here as the
  story resolution requires ("dev verifies exact case against the local stack and
  records it here").
- `books_read` holds `preview-fixture-book-0` … `-5` on 250 rows, `null` on 4 —
  `payload.booksReadOptions` is exactly that union, already sorted.
- `initial_contact` and `date_of_birth` are **null on every row**, so the date
  editor's empty state is the reachable one and `e` (not a click) is the opener.

### Preserved prior attempt — reference material, not authority

`refs/attempt-preserve-dirty/20261009-054847-325c-217aecff-1` (single commit
`78156ef`, 20 files, +3471/-148) is a complete unverified implementation of this
story. Read it (`git show 78156ef:<path>`) and reuse what is sound. It has not
passed any gate on this branch, and it carries at least these defects to fix:

- `components/grid/grid-editor-types.ts` and both
  `apps/*/app/dev/grid-preview/page.tsx` have no trailing newline.
- `components/grid/index.ts` collapses the `grid-header-cell` export onto the
  closing brace line.
- `KNOWN_SOURCE_VALUES` and the whole `source` option strategy is the right
  call, but its comment asserts a claim about "no migration writes them" that is
  only true of *this* repo — keep it, and record the verified values in this
  story file (done above).
- It does not touch `docs/manage-grid-pattern.md` or close DW-27 in
  `deferred-work.md`; both are in scope.
- Its `e2e/specs/grid-editors.spec.ts` asserts the registry by reading
  `grid-editors.tsx` as text with `/\\n  key: /`. Keep the intent (all eleven
  entries exist, exactly one `commitsOnInteraction`) but loosen the regex so a
  formatting change cannot redden a green suite.

## Tasks & Acceptance

**Execution:**

- `components/grid/grid-editor-types.ts` -- new, **type-only** (no runtime
  imports, no `"use client"`, or the guardrail graph audit has to cover it
  twice): `GridEditorKey` (11 members), `GridEditorOptions` (`options`, `users`,
  `currency`, `locale`), `GridEditorContext<TData>` (`text` = the
  already-overridden display string, `getValue` for seeding only, `draft`,
  `setDraft`, `onDraftKeyDown`, `commitDraft`, `commitValue`, `open`, `close`,
  `editing`, `options`, `label`), `GridEditorDefinition<TData>`
  (`renderDisplay?`, `renderEditor`, `parse`, `commitsOnInteraction?`,
  `draftSeed?`).
- `components/grid/grid-editors.tsx` -- new, `"use client"`: the eleven
  registry entries and `resolveGridEditor`. The registry is a mapped type
  `{ [K in GridEditorKey]: GridEditorDefinition<unknown> }`, so a missing entry
  is a compile error. No persistence, no route, no table vocabulary.
- `components/grid/grid-types.ts` -- `editor?: GridEditorKey`,
  `editorOptions?: GridEditorOptions`, `GridCellView<TData>` plus
  `GridCellEditorView<TData>`.
- `components/grid/grid-row.tsx` -- the DW-27 fix. An editor branch ahead of
  `cell.render`; `renderDisplay` returning `undefined` falls back to
  `cell.text`. No table-agnostic primitive learns what is editable.
- `components/grid/use-grid-keyboard.ts` -- build the editor context in
  `getCellView` (every closure terminates in `runCommit`); `openEditor` routes
  `commitsOnInteraction` straight to `runCommit`; `clearCell` and `pasteText`
  exempt a column carrying an `editor` from the `consumerRenderedCells` skip; a
  `parse` that throws lands in `revertCommit`. `resolveConsumerRenderers` and
  `grid.tsx`'s renderer resolution are **not** touched.
- `components/grid/grid.tsx` -- pass the column-label map through so a
  validation message names the field the operator sees.
- `components/grid/index.ts` -- export the key type, the definition/context
  types, `GRID_EDITOR_KEYS` and `resolveGridEditor`.
- `components/grid/grid-preview.tsx` + `apps/folk/app/dev/grid-preview/page.tsx`
  + `apps/gita-life/app/dev/grid-preview/page.tsx` -- add `currency`, `number`,
  `url`, `email`, `user` columns **before** `flagged` (which must stay last for
  `grid-keyboard.spec.ts`'s `End`/`Tab` assertions), with deterministic values
  and a supplied `users` list; `flagged` gains the checkbox display. `md5sum`
  the two route files afterwards.
- `components/manage/manage-types.ts` + `lib/supabase/manage.ts` +
  `lib/manage/api-handlers.ts` -- plumb `source` through `ManageContact`,
  `MANAGE_CONTACT_PATCH_KEYS`, `CONTACT_COLUMN_BY_PATCH_KEY`, `CONTACT_COLUMNS`,
  `ContactRow`, the read mapping, the exhaustive `switch`, the write-result
  mapping, and `parseContactPatch`. Existing column, new migration: none.
- `components/manage/manage-contacts-table.tsx` -- `editor`/`editorOptions` on
  `name`/`phone` (`text`), `notes` (`longtext`), `source` (`select`),
  `booksRead` (`multiselect`, options `payload.booksReadOptions`), and
  `initialContact`/`dateOfBirth` (`date`); the four ids in `COLUMN_IDS` and
  `COLUMN_LABELS`; the four ids in `PATCH_KEY_BY_COLUMN`. `favorite` untouched.
- `docs/manage-grid-pattern.md` -- replace the "never `editable` *and* a `cell`
  widget" rule with the editor-aware one, and record that a closed-state editor
  display must not be a `<button>`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close DW-27 with
  the resolution site, since this story resolves it.
- `e2e/specs/grid-editors.spec.ts` -- new: commit, validation rejection, and an
  in-flight case for **every** editor type, plus the positioning/discard/
  registry cases and the matrix edge cases above.
- `e2e/specs/grid-keyboard.spec.ts` -- `flagged` no longer renders as
  `"true"`/`"false"` text, so keys 6 and 7 read `aria-checked` instead. The
  behaviour under test is unchanged; only the surface it is read through.

**Acceptance Criteria:**

- Given a column with `meta.grid.editor`, when a commit is in flight, then the
  cell shows the new value before the write resolves — for all eleven types.
- Given a column whose editor supplies a display widget, when the optimistic
  override lands, then the widget renders the overridden text, not
  `getValue()`.
- Given an invalid draft, when it is committed, then the cell reverts, carries
  the destructive class, and the message reaches the grid's status line —
  identical to a rejected write.
- Given a non-`checkbox` editor open mid-edit, when the operator clicks away,
  then no write is issued.
- Given any popover editor open, when it renders, then its body is outside the
  row and the row's height is unchanged.
- Given the 19-row `manage-contacts` matrix, when the suite runs, then every
  previously-Covered row is still green, including the four `favoriteStar` and
  three `getByRole("checkbox")` sites.
- Given `source` is edited on `/manage`, when the page reloads, then the value
  is still there — the write reached the real column.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the option list is a superset of the data.** `select.parse` rejects a
value that is not one of `options`, so the list must contain every value the rows
already hold — otherwise every existing row renders as "not an option" and a
no-op commit is refused. Seeding `KNOWN_SOURCE_VALUES` first and unioning the
payload's own `source` values is what makes that true while still rejecting a
genuinely unknown value.

**Why no `<button>` in a closed display.** `e2e/fixtures/manage-grid.ts:213-215`
resolves the favorite star as `getByRole("button")` **inside the row, unscoped**,
asserted at `manage-contacts-bulk.spec.ts:93,141,328,335`. A button in every
`select`/`multiselect`/`date`/`user` display would make those four ambiguous. A
`<span role="presentation">` with an `onClick` is enough: the cell is already the
focusable, keyboard-reachable thing (`e` opens its editor).

**Why the preview harness grows a slow row.** Every preview commit resolves
synchronously today, which makes "the value appeared before the write resolved"
untestable — a value that appears instantly is indistinguishable from one that
appeared because the write had already landed. One dedicated row resolves late
and stamps a marker column when it does, so the in-flight assertion is proved
rather than assumed. It must be a row no other spec addresses.

## Verification

**Commands:**

- `pnpm typecheck:workspace` -- expected: SUCCESS, no errors. The gate; `pnpm
  build` ignores TS errors (`next.config.mjs`), so it is not a substitute.
- `pnpm lint` -- expected: SUCCESS.
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.` with only the
  four pre-existing `lib/authz` type-import warnings.
- `grep -rn "dark:\|rgb(\|#[0-9a-fA-F]\{3,6\}" components/grid/` -- expected:
  no hits. Zero raw colour literals.
- `grep -rn "Manage\|/api/manage\|contacts" components/grid/` -- expected: no
  table vocabulary (CAP-8).
- `pnpm test:e2e` -- expected: the whole suite green, one runner at a time.
  Requires the local stack up once (`pnpm dev:local`); never invoke
  `pnpm exec playwright test` directly.
- `pnpm test:e2e:determinism` -- expected: green twice back to back, no reset.
  Required after touching specs, fixtures or `playwright.config.ts`.

**Manual checks (if no CLI):**

- `/dev/grid-preview` with `MANAGE_GRID_PREVIEW=1`: every editor opens, and
  opening one never changes the row's height.
- `/manage`: `source`, `booksRead`, `initialContact`, `dateOfBirth` write and
  survive a reload; `favorite` still shows its star.