---
title: 'Pick a linked record in the cell and in the filter, instead of typing it'
type: 'feature'
created: '2026-10-19'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7eecfbdc56455501ad97dfa0a7cd317699589b42'
context:
  - '{project-root}/docs/architecture/testing.md'
  - '{project-root}/docs/manage-grid-pattern.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A linked-record field can only be set by typing its label. In the filter, `linked` rides `TEXT_OPERATORS` with `valueShape: "text"` (`grid-filter-operators.ts:156`), so the value control is a free-text `Input` and the evaluator substring-matches the displayed label (`:670-674`). In the grid, the `location` column is `fieldType: "linked"` with no `editor` and no `editable` (`manage-contacts-table.tsx:797-810`), so the cell cannot be set from the grid at all. And a contact is supposed to belong to **one** location, but nothing says so: the favourites view renders Location as a multi-toggle pill list (`manage-favorites-view.tsx:497-523`) that PATCHes several ids, and `location_ids` is an unbounded `text[]`.

**Approach:** Make a linked record pickable in both places, from one scoped list, and make the one-location rule real. The `location` column becomes editable through a new single-record editor that commits `[id]`; the cell renders the picked record as a pill that carries **its own** remove control, so clearing a record never opens an editor — a different record is chosen by clearing first (the reference is the 2026-10-19 screenshot of row 20, `Selaiyur ×`; the control sits in the cell's pill, and the editor popover carries no clear button of its own). An empty linked cell renders a `+` that opens the picker on a **single** click — a deliberate, recorded scoping of CAP-10, because such a cell has no text to type into and double-click would otherwise be its only door. The filter's `linked` value control becomes a record dropdown, keeping its operator ids and its label-valued URL so shared links and matrix row 17 keep their meaning. The rule is enforced by a `contacts.location_ids` CHECK, with the API rejecting a second id as a 4xx so the constraint is never reached, and the favourites view made single-select so no shipped UI can produce the rejected request.

## Boundaries & Constraints

**Always:**
- Options come only from the caller-scoped `payload.locations` (`manage.ts:534-536`, RLS `scoped_rls_policies.sql:208-216`), and the write is scope-checked server-side as well — the option list being scoped is not a guarantee.
- The filter commits the record's **label**. `linked` keeps `TEXT_OPERATORS`' ids, and `contains` must stay its first value-taking operator, because `legacyOperatorFor` (`grid-filter-operators.ts:211-224`) reads a bare token as that operator. Do not touch the codec or `evaluateCondition`.
- One location per contact at most: the CHECK is on `contacts.location_ids` only. **`users.location_ids` stays plural** — it is the RLS scoping mechanism (`caller_effective_location_ids()`), not the same field.
- The migration refuses rather than truncates: it must abort when any row holds more than one id, so a data fix is a deliberate, human-run step.
- The editor and the `×` are generic to any `editable` linked field; only `location` opts in now.
- `components/grid/**` stays token-only: no hex/rgb/`white`/`black`, no `dark:` variant, no viewport units (`harness-guards.spec.ts:89-132`).

**Never:** a multi-select picker; an Assigned preacher column; record rows carrying Code/Users/Contacts counts (names + status only); making `collectedBy` editable; a new contacts column; changing the filter codec, `evaluateCondition`, or `linked`'s operator ids.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| ADD_TO_EMPTY | cell empty, a record picked | `location_ids = [id]`; cell shows the record's name | write rejected → cell reverts to empty |
| ADD_VIA_PLUS | cell empty, its `+` clicked **once** | the picker opens on that click | n/a |
| CELL_BODY_CLICK | a linked cell's body clicked once, empty or set | the cell focuses; no editor opens | n/a |
| CLEAR | cell holds a location, the pill's `×` clicked | `location_ids = []`; cell renders empty and `is empty` matches it | write rejected → the pill stays |
| REPLACE_WHILE_SET | cell already set, editor opened | the current record is shown as the chip; a second value is not offered until `×` clears it | n/a |
| SECOND_ID | a request carrying two ids | 400 `invalid_patch` from the API, nothing written | rejected before the DB |
| SECOND_ID_DIRECT | a direct two-id write past the API | the CHECK rejects it | DB error, row unchanged |
| OUT_OF_SCOPE_ID | PATCH carrying an id the caller cannot see | 400 `invalid_patch`, no write | rejected; cell reverts |
| NON_ADMIN_OPTIONS | non-Admin opens either picker | only the records `caller_effective_location_ids()` grants | n/a |
| UNRESOLVED | the row's id is absent from the scoped list | `UNRESOLVED_LOCATION`, never blank or a raw id | n/a |
| FILTER_PICK | a linked condition, a record picked | a dropdown of labels; stores the label | n/a |
| LEGACY_FILTER_TOKEN | bare `f.location=<label>` | reads as `contains`, exactly as before | n/a |

</frozen-after-approval>

## Code Map

- `components/grid/grid-editor-types.ts:25-36` -- `GridEditorKey` (no linked/record key today). `:47-56` -- `GridEditorOptions` (`options?`, `users?`, `currency?`, `locale?`). `:67-117` -- `GridEditorContext`; `commitValue: (value: unknown)` at `:109` is how a non-string commit travels. `:127-143` -- `GridEditorDefinition` (`renderDisplay`, `renderEditor`, `parse`, `draftSeed`).
- `components/grid/grid-editors.tsx:1140-1209` -- `userEditor` + `UserControl`: the id+name picker to copy, including the `×`-free single-value shape. `:407-409` `readOptions`; `:184-268` `PopoverEditor` (commits on close, `onEscapeKeyDown` at `:255-259`); `:430` `OptionSearch autoFocus`; `:1227-1239` `GRID_EDITOR_REGISTRY`; `:1248-1258` `resolveGridEditor`.
- `components/grid/use-grid-keyboard.ts:934-948` -- `openEditor` refuses unless `meta.grid.editable === true`. `:816-845` `revertCommit`; `:853-902` `runCommit`.
- `components/manage/manage-contacts-table.tsx:184-192` -- `PATCH_KEY_BY_COLUMN`; **`location` is absent, so a commit throws at `:639-642` before any request.** `:635-683` `handleCellCommit`; `:531-559` `patchContact`; `:515-522` `applyWrite`; `:797-810` the `location` column; `:815-827` `source` + `:832-844` `booksRead` are the two real editable examples.
- `components/manage/manage-favorites-view.tsx:203-215` -- `toggleDraftValue` (the plural toggle); `:217-229` the PATCH of the whole draft; `:497-523` the multi-toggle Location fieldset to make single-select.
- `components/manage/manage-types.ts:36-40` -- `ManageLocation { id; name; status }`; `:144` `locations` on the payload; `:155-168` `MANAGE_CONTACT_PATCH_KEYS` already lists `"locationIds"`.
- `lib/manage/api-handlers.ts:225-235` -- the `locationIds` PATCH case (array, ≤50, deduped, UUID-checked): the length cap changes to one.
- `lib/supabase/manage.ts:87-100` -- `CONTACT_COLUMN_BY_PATCH_KEY` (`locationIds: "location_ids"` at `:99`); `:534-536` `scopedLocationRows`; `:538` `locationNameById`; `:713-717` the `ManageLocation[]` map; `:839-867` `assertProgramLocations` (program membership only — the scope hole); `:881-949` `buildContactWritePayload`.
- `supabase/migrations/20261010000000_contacts_date_columns_to_date.sql` -- the latest migration; a new one must sort after it (`YYYYMMDDHHMMSS_slug.sql`). The CHECK belongs here.
- `supabase/migrations/20261006010000_scoped_rls_policies.sql:88-108` -- `caller_effective_location_ids()`; `:208-216` the `locations` SELECT policy.
- `components/grid/grid-filter-operators.ts:39-48` -- `GridFilterValueShape` (already has `option-list`); `:72-79` `TEXT_OPERATORS`; `:146-162` the registry; `:211-224` `legacyOperatorFor`; `:438-458` `matchesText`; `:670-674` the `linked` evaluator branch.
- `components/grid/grid-filter-popover.tsx:31-45` -- `GridFilterField` (`options?: readonly string[]`); `:726-795` `FilterValueControl`, whose `option-list` Select branch is what the linked control becomes.
- `components/grid/grid.tsx:1083-1108` -- `filterFields`, the only channel carrying column options into the filter.
- `e2e/specs/harness-guards.spec.ts:89-132` -- the `components/grid/**` token rules. `docs/architecture/testing.md:196-210` -- source→spec map; `:247` `components/grid/**` widens to `test:e2e:grid` **+** `test:e2e:manage`.
- Local evidence for the constraint: `select count(*) filter (where cardinality(location_ids) > 1) from public.contacts` returned **0** of 264 (max cardinality 1, 10 empty) on 2026-10-19. Production is unmeasured; the migration's abort is what makes that safe.

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/20261019000000_contacts_single_location.sql` -- add `CHECK (cardinality(location_ids) <= 1)` on `contacts`, with the pre-flight query and the abort behaviour stated in the file -- the one guarantee no UI can provide; `users.location_ids` must be left alone.
- [ ] `lib/manage/api-handlers.ts` -- reject a `locationIds` array longer than one as 400 `invalid_patch` (replacing the ≤50 cap) -- the client deserves a clean 4xx instead of a constraint violation surfacing as a 500.
- [ ] `lib/supabase/manage.ts` -- extend `assertProgramLocations` to reject any id outside the caller's effective location set, resolved through the same source the read path uses (Admin: the program's locations; otherwise the caller's effective ids) -- RLS scopes the read and nothing scoped this write, so the picker's narrowed list was the only guard.
- [ ] `components/grid/grid-editor-types.ts` + `components/grid/use-grid-keyboard.ts` + `components/grid/grid-editors.tsx` -- add `open: () => void` to `GridEditorContext`, wired to the same opener `onCellDoubleClick` calls, and render a `+` in a blank `linked` cell that invokes it -- the one single-click opener, and a deliberate, recorded scoping of CAP-10 (story 1's Phase B deleted `ctx.open` for exactly this reason; the cell-wide click and the keyboard openers stay retired).
- [ ] `components/grid/grid-editor-types.ts` -- add `"linked"` to `GridEditorKey` and `records?: readonly { id: string; label: string; detail?: string }[]` to `GridEditorOptions` -- `detail` carries the record's status; generic so any editable linked field can use it.
- [ ] `components/grid/grid-editors.tsx` -- add a single-record picker (mirror `userEditor`: `PopoverEditor` + `OptionSearch` + `OptionList`; `renderDisplay` mapping a known id to its label; `parse` validating against `options.records`), register it as `"linked"`, and render the current record as a pill carrying its own remove control that commits `[]` without opening the editor (the popover carries no clear button of its own) -- commits `[id]`, an array of one, because the field is plural. Leave `user` and `multiselect` untouched.
- [ ] `components/grid/grid-filter-operators.ts` -- give `linked` its own operator list: the same ids and labels as `TEXT_OPERATORS`, with `valueShape: "option-list"` on the four value-taking operators and `"none"` on the two empty ones, `contains` still first -- no new shape, no codec change, no evaluator change.
- [ ] `components/grid/grid.tsx` -- in `filterFields`, fall back to `editorOptions.records.map((record) => record.label)` when a column has `records` but no `options` -- the filter's only channel for the pickable labels.
- [ ] `components/manage/manage-contacts-table.tsx` -- add `[LOCATION_COLUMN_ID]: "locationIds"` to `PATCH_KEY_BY_COLUMN`; on the `location` column add `editable: true`, `editor: "linked"`, `editorOptions: { records: … }` from `payload.locations` (`label: name`, `detail: status`) -- without the map entry the commit throws before any request.
- [ ] `components/manage/manage-favorites-view.tsx` -- make the Location fieldset single-select with the same clear-then-pick behaviour -- otherwise a shipped screen can produce a request the new constraint refuses.
- [ ] `e2e/specs/grid-linked-record-picker.spec.ts` -- cell pick, `×` clear, the cell's display after each (a name, never a raw id), a second id refused, an out-of-scope id refused, a non-Admin's option list, the filter dropdown, and the legacy bare `f.location` token still filtering as `contains`.
- [ ] `docs/architecture/testing.md` -- add the new spec to the source→spec table with its count -- the table is the contract the guide is read from.

**Acceptance Criteria:**
- Given a focused `location` cell, when the editor opens, then it lists the caller's locations by name and status, and choosing one writes `[<id>]`.
- Given an empty linked cell, when its `+` is clicked once, then the picker opens — and when the cell *body* is clicked once, then the cell focuses and no editor opens.
- Given a cell holding a location, when the cell renders, then the record is a pill carrying its own remove control, and activating it writes `[]` with no editor opened.
- Given a row whose store location is outside the caller's scoped list, when it renders, then it shows `UNRESOLVED_LOCATION` rather than a blank or a raw id.
- Given a commit the server refuses, when the request rejects, then the cell reverts and does not keep the refused value.
- Given a linked condition, when the value control renders, then it is a dropdown of location names and not a text input.
- Given a bare operator-less `f.location=<label>` from a shared link, when the grid loads, then it filters as `contains` exactly as before.
- Given a non-Admin, when either picker opens, then it contains only the locations `caller_effective_location_ids()` grants them.
- Given a Preacher PATCHing an out-of-scope location id, when the request is handled, then it is refused with a 4xx and no write occurs.
- Given a PATCH carrying two location ids, when it is handled, then it is refused with a 4xx and no write occurs.
- Given a direct two-id write that bypasses the API, when it is attempted, then the database rejects it.
- Given the favourites view, when Location renders, then only one pill can be active at a time.

## Implementation Notes
