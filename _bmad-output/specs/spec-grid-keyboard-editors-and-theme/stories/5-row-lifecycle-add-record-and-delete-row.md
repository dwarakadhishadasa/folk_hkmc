---
title: 'Row lifecycle — add record and delete row'
type: 'feature'
created: '2026-10-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: b2a0f67b632ea06403e13c79976113e3f9794d4d
context:
  - _bmad-output/specs/spec-grid-keyboard-editors-and-theme/SPEC.md
  - _bmad-output/specs/spec-grid-keyboard-editors-and-theme/existing-state.md
  - docs/manage-grid-pattern.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-6 is absent. `addRow` / `deleteRow` / `Add record` have zero hits
across `components/`, so an operator can edit and bulk-favourite a contact but
cannot create or remove one from the grid.

**Approach:** The grid ships the row-lifecycle affordances as one opt-in
`rowLifecycle` slot — a small `+ Add record` control in the grid chrome and a
per-row delete control that confirms and reports one outcome per row — and hands
new-row focus to the story-2 keyboard model. The contacts table supplies the row
factory, the create write and the delete write; the create rides the **existing**
`onCellCommit` channel rather than a second mutation path.

## Boundaries & Constraints

**Always:**

- **The primitive never calls an API.** `rowLifecycle` carries a row factory, a
  row label resolver and the delete write; everything else is its own UI.
- **The create write goes through `onCellCommit`.** A cell commit against the
  pending draft row *is* the create: same optimistic override, same `revertCommit`,
  same status line. No second mutation channel, no `createContact` bypass of the
  commit path.
- **Required-field rules live in `parseContactPatch`, once.** An empty or
  partial draft is refused by the real handler with its existing wording
  (`Name is required.` / `Phone is required.`); the client reads it through
  `readError` and throws it into the revert path. No client-side copy of the
  required-field list.
- **New-row focus lands through the keyboard model.** `focusRow` resolves the
  row's index in the *visible* row model, picks its first `editable` column, sets
  anchor/row/column, `scrollToIndex`, `focusCellElement` and `revealCell` — the
  same chain every arrow and `Tab` uses. No ref-and-scroll.
- **Delete confirms, then reports one outcome line per row.** Never a collapsed
  toast, and never a count on its own.
- **Only confirmed deletes are applied locally.** A row the server did not
  confirm stays on screen.
- **`grid-types.ts` gains types only** — zero runtime import edges, so
  `verify-monorepo-guardrails.mjs:542-596` stays satisfied.

**Never:**

- No `Manage*`, `/api/manage` or contacts vocabulary under `components/grid/`
  (CAP-8), and no `dark:` classes or raw colour literals.
- No direct Supabase from a component; no new authorization logic — both new
  handlers use the existing `getStaffContext()` + `requireRole(["Admin","Preacher"])`.
- No set-based delete and no `ON DELETE CASCADE` added to a migration.
- No client-side duplicate of `MANAGE_CONTACT_PATCH_KEYS` or of the
  required-field rules.
- Do not edit `scripts/verify-monorepo-guardrails.mjs`.
- Do not weaken `favoriteStar`: the row gains a second button, so the fixture is
  **scoped by accessible name** (`/favorites$/`), never loosened to `.first()`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| add, then type | `+ Add record` on a filtered grid | blank row appended; its first editable cell holds DOM focus; typing seeds the editor and `Enter` POSTs the whole draft | — |
| add, then immediately type before the row renders | focus lands after the virtualizer reveals the row | focus is retried on the rendered window, not dropped | no silent no-op; a status line names a row hidden by filters |
| create with a blank required field | `name` typed, `phone` left `""` | `POST` → `400 Phone is required.`; cell reverts, carries `text-destructive`, status line names it; nothing persisted | server wording via `readError` → `throw` → `revertCommit` |
| create rejected | intercepted `500` / aborted `POST` | draft cell reverts to blank, destructive, status line names it; draft row is dropped from the grid | `readError` / `Unable to reach the server.` |
| create promoted | `POST` → `200` | draft row is replaced by the server row; keyboard position is retained (focus re-keys onto the new row id) | — |
| delete confirmed | row's delete control → confirm | `DELETE` → `200`; row leaves the grid; one `✓ <name> Deleted.` line | — |
| delete refused | intercepted `403` / `409` / `500`, or a real FK conflict | the row **stays**; one `✕ <name> <server message>` line; no success claimed | server wording via `readError` |
| delete cancelled | dialog → Cancel | no request issued; row untouched | — |
| delete with no handler | `rowLifecycle` absent | no `+` control, no delete column, nothing to delete | — |
| add control disabled | `canCreate: false` | the control renders disabled, not hidden | — |

</intent-contract>

## Code Map

- `components/grid/grid-types.ts:51-61` — `GridColumnMeta`; **read-only** here.
- `components/grid/grid-types.ts:217-255` — `GridCellView`. New
  `GridRowLifecycle<TData>` / `GridNewRow<TData>` land here; type-only, zero
  runtime edges.
- `components/grid/use-grid-keyboard.ts:449-473` (`moveFocus`), `:483-537`
  (`stepFocus`) — **the model new-row focus must reuse**: anchor + row index +
  column id + `scrollToIndex` + `focusCellElement` + `revealCell`.
- `components/grid/use-grid-keyboard.ts:721-771` (`runCommit`) and `:683-713`
  (`revertCommit`) — the one write path and its one rejection path. The create
  inherits both by routing through `onCellCommit`.
- `components/grid/use-grid-keyboard.ts:1494-1505` — the `restoreFocusRef`
  effect. The create-promotion re-key guard goes beside it, and reuses its
  "grid owned focus, or lost it to the unmount" condition.
- `components/grid/grid.tsx:611-623` — `virtualizer`; `:618-623` `scrollToIndex`;
  `:717` `virtualRows`. `focusRow` must retry once the window has moved, and
  `virtualRows` is the dependency that proves it moved.
- `components/grid/grid.tsx:637-639` — `virtualizer.measure()` on density; the
  pattern for an effect keyed on the rendered window.
- `components/grid/grid-toolbar.tsx:47-51,159` — `toolbarExtra` slot. The `+`
  control renders immediately before it.
- `components/manage/manage-contacts-table.tsx:356-368` — `handleCellCommit`;
  the draft-row branch goes here.
- `components/manage/manage-contacts-table.tsx:326-354` — `patchContact`, the one
  fetch helper; `createContact` / `deleteContact` reuse its shape.
- `components/manage/manage-contacts-table.tsx:210-248` — `BulkReportPanel`; the
  shape the primitive's per-row delete report mirrors.
- `components/manage/manage-contacts-table.tsx:687-720` — the `favorite`
  row-action column, and the pattern a delete column copies.
- `e2e/fixtures/manage-grid.ts:221-223` — `favoriteStar`. **Must become
  name-scoped** once a row carries two buttons.
- `lib/manage/api-handlers.ts:140-235` (`parseContactPatch`), `:237-261`
  (`handleManageContactUpdate`) — the create handler reuses both verbatim.
- `lib/manage/api-handlers.ts:264-270` — `rowFailureMessage`, the per-row failure
  wording a delete refusal reuses.
- `lib/supabase/manage.ts:868-980` (`updateManageContact`) — its per-key
  validation loop becomes a shared `buildContactWritePayload`; create and update
  both call it so `CONTACT_COLUMN_BY_PATCH_KEY` stays the single mapping.
- `lib/supabase/manage.ts:752-789` — `assertManageContactInScope`, reused by
  delete so scope is decided exactly once.
- `apps/{folk,gita-life}/app/api/manage/contacts/route.ts` — `PATCH` today; gains
  `POST` and `DELETE`, byte-identical across both apps.
- `_bmad-output/specs/spec-grid-keyboard-editors-and-theme/stories/4-…md:318-323`
  — why no `<button>` may appear in a *cell display*. The delete control is a
  different case: it is an action control in its own column, and the star's
  locator is scoped rather than the control suppressed.

## Tasks & Acceptance

**Execution:**

- `components/grid/grid-types.ts` -- add `GridRowLifecycle<TData>` (row factory,
  `getRowLabel`, `onDeleteRow`, optional `canCreate`). Types only.
- `components/grid/grid-row-lifecycle.tsx` -- **new**, `"use client"`:
  provider, `useGridRowLifecycle()`, `GridRowDeleteControl` (the button a
  consumer's action column renders), the `AlertDialog` confirmation, and the
  per-row outcome report. No fetch, no route, no table vocabulary.
- `components/grid/use-grid-keyboard.ts` -- expose `focusRow(rowId)` and
  `focusRowCell(rowId)` on `GridKeyboardApi`; add the create-promotion re-key
  guard beside the existing `restoreFocusRef` effect.
- `components/grid/grid.tsx` -- accept `rowLifecycle`; render the small `+`
  control into the chrome; own the dialog and the report; drive the
  scroll-then-focus retry off `virtualRows`.
- `components/grid/grid-toolbar.tsx` -- a `rowAction` slot rendered before
  `toolbarExtra`.
- `components/grid/index.ts` -- export the lifecycle surface.
- `components/manage/manage-contacts-table.tsx` -- draft row factory; the
  draft-row branch inside `handleCellCommit`; `createContact` / `deleteContact`
  through the existing fetch helper; a `delete` action column rendering
  `GridRowDeleteControl`; `canCreate` false while a draft is unresolved.
- `lib/supabase/manage.ts` -- extract `buildContactWritePayload`; add
  `createManageContact` (assigns the creating staff member, audits
  `manage.contact.create`) and `deleteManageContact` (reuses
  `assertManageContactInScope`, audits `manage.contact.delete`). Map `23503` to a
  clear attendance conflict and `23505` on `phone` to a clear duplicate.
- `lib/manage/api-handlers.ts` -- `handleManageContactCreate` and
  `handleManageContactDelete`, both through `getStaffContext()` +
  `requireRole` + `parseContactPatch`.
- `apps/folk/app/api/manage/contacts/route.ts` and
  `apps/gita-life/app/api/manage/contacts/route.ts` -- add `POST` and `DELETE`;
  `md5sum` the pair afterwards.
- `e2e/fixtures/manage-grid.ts` -- scope `favoriteStar` by accessible name; add
  `addRecordButton`, `rowDeleteButton`, `deleteConfirmDialog`,
  `deleteConfirmButton`, `deleteReportPanel`, `deleteReportRows`.
- `e2e/fixtures/bulk-contacts.ts` -- `ROW_LIFECYCLE_TAG` plus tag-checked
  `createRowLifecycleContact` / `cleanupRowLifecycleContacts`, so a spec can
  clean up after itself without touching the shared generated set.
- `e2e/specs/manage-contacts-row-lifecycle.spec.ts` -- **new**, the five cases
  the matrix rows above name.
- `docs/manage-grid-pattern.md` -- a row-lifecycle section: the opt-in slot, the
  create-through-`onCellCommit` rule, delete confirmation and per-row reporting,
  and the two new routes. Update the "favorite star is the only row action" gap.

**Acceptance Criteria:**

- Given the contacts grid, when `+ Add record` is pressed, then a blank row is
  appended and its first editable cell holds DOM focus — observed through the
  focused cell's own `data-grid-cell`, not through a ref the test cannot see.
- Given a new row, when `Ravi` is typed and `Enter` pressed, then the optimistic
  value paints before the write resolves and survives a reload.
- Given a draft whose `phone` is blank, when it is committed, then the cell
  carries the destructive class, the grid status line names the server's reason,
  and no row exists in the database.
- Given a row, when its delete control is pressed, then a confirmation names the
  row and **no** `DELETE` request is issued until it is confirmed.
- Given a confirmed delete, when the server answers, then one outcome line per
  deleted row names the row and the server's own message, successes included.
- Given a refused delete, when the report renders, then the row is still on
  screen and its line claims no success.
- Given a `rowLifecycle`-less grid, when it renders, then there is no `+`
  control and no delete affordance anywhere.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the create rides `onCellCommit` rather than a `rowLifecycle.onCreateRow`.**
The draft row is an ordinary row in the consumer's own state, so the first cell
commit on it is indistinguishable from any other commit at the grid's boundary.
Routing it through the existing handler buys the optimistic override, the
destructive revert and the status line for free, and keeps the "one write path"
constraint structurally true rather than by review.

**Why an invalid required field round-trips instead of being caught client-side.**
`parseContactPatch` is the single place the required-field rules and their
wording live. A client-side pre-check would be a second copy that drifts; the
400 is the same answer the single-row route already gives, and the revert
presentation is the one story 4 established.

**Why the primitive retries focus on the rendered window.** `scrollToIndex` only
moves the scroll offset; the virtual range updates on the render *after* it, so
a synchronous `focusCellElement` finds no cell and parks focus on the container.
`virtualRows` is the dependency that proves the window moved, so the retry hangs
off it rather than off a timeout.

**Why the star's locator is scoped, not the delete control suppressed.** Story 4
kept `<button>`s out of *cell displays* because `favoriteStar` resolved
`getByRole("button")` unscoped inside a row. That constraint was about a cell
that renders a value; a delete control is an action in its own column, and the
honest fix is a precise locator. The star keeps its accessible name and every
green assertion keeps its subject.

**Where new-row focus could silently fail.** A draft row whose every cell is
blank is filtered out by any active text filter, so `focusRow` resolves no row.
That reports through the status line rather than doing nothing — the same rule
every other keyboard-model no-op in the hook already follows.

## Verification

**Commands:**

- `pnpm typecheck:workspace` -- expected: SUCCESS, no errors.
- `pnpm lint` -- expected: SUCCESS.
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.` with only the
  four pre-existing `lib/authz` type-import warnings.
- `grep -rn "Manage\|/api/manage\|contacts" components/grid/` -- expected: no
  table vocabulary (CAP-8).
- `grep -rn "dark:\|rgb(\|#[0-9a-fA-F]\{3,6\}" components/grid/` -- expected: no
  hits.
- `md5sum apps/{folk,gita-life}/app/api/manage/contacts/route.ts` -- expected:
  identical.
- `pnpm test:e2e` -- expected: the whole suite green, one runner at a time.
  Requires the local stack up once (`pnpm dev:local`).
- `pnpm test:e2e:determinism` -- expected: green twice back to back, no reset.
  Required after touching specs or fixtures.

**Manual checks (if no CLI):**

- `/manage`: `+ Add record` lands focus on `name`; `Esc` on the draft discards
  nothing but leaves it blank; the delete dialog names the row it will remove.
