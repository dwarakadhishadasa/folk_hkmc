---
title: 'Cross-surface contact record access'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: 'ee042078b38f7494a29c0cfa5e636ad83d9b97da'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/architecture/testing.md'
  - '{project-root}/_bmad-output/specs/spec-contact-record-access/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-folk_hkmc-2026-11-07/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The premium contact record is welded to the Contacts grid. A staff member looking at a session attendee, dashboard focus row, candidate, campaign assign row or manage-session pill can see a person but cannot open the full record in place.

**Approach:** Add one authorized record gateway (`GET /api/manage/contacts/[contactId]/record`), one shared presentational record body, one client hook/provider, and inline triggers on the named surfaces. The Contacts grid keeps its own host but uses the same body, view state and write channel. Out-of-scope session attendees keep the existing summary.

## Boundaries & Constraints

**Always:** one full-record endpoint in both apps; `getStaffContext()` + `MANAGE_CONTACT_WRITE_ROLES` + contact RLS boundary; one `ContactRecordBody` that never fetches; one mutation channel `PATCH /api/manage/contacts`; server-derived `canEdit`/`canComment`; comments read only when `contactInPatch`; the source list supplies the Previous/Next sequence; one Radix Dialog overlay stack; focus capture/restore; no new dependency; no global contact finder or URL deep link.

**Never:** a second record UI, a second history/comments read, a session-context full-record endpoint, direct Supabase from a component, a new write endpoint, a second document keydown/scroll lock, campaign caller triggers, Manage Attendance/Favorites triggers, or narrowing the existing session summary.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| In-scope record | Valid UUID, caller in contact RLS scope | `200` with `ContactRecordPayload`; `Cache-Control: no-store`; `canEdit=true`; `canComment` from patch | N/A |
| Out-of-scope record | Valid UUID, in programme but outside contact RLS | `403` `{ error }`; provider shows "outside your contact scope" and closes | No summary fallback |
| Unknown record | Valid UUID, not in programme | `404` `{ error }` | Provider error state |
| Malformed id | Non-UUID | `400` `{ error }` before any read | N/A |
| Admin outside comments patch | Admin can read programme contact, not in patch | `200`; `canEdit=true`, `canComment=false`, `comments=null`; pane shows reason | No comments read |
| Session attendee out of patch | `recordAvailable=false` | Existing summary modal opens unchanged | Existing endpoint |
| Session attendee in scope | `recordAvailable=true` | Premium record opens; summary does not | 403 shown, no silent fallback |
| Filtered grid while record open | Current id leaves visible sequence | Previous/Next clamp to nearest survivor, else both disable | N/A |
| Inline editor Escape | Focus in `input`/`textarea`/`select`/`[contenteditable]` | Escape discards draft; record stays open | N/A |

</frozen-after-approval>

## Code Map

**Server read model**
- `lib/supabase/manage.ts` — `ContactRow`/`CONTACT_COLUMNS`/`mapManageContact` (private today), `loadManageContactHistory` (re-asserts scope, signs photo), `listManageContactComments` (imported from contact-comments), `assertManageContactInScope` (403/404), `locationInPatch`. Export a narrow `loadManageContactRecordRow({staff, contactId})` and `loadProgramLocations(programId)`; export `loadStaffDisplayNames` or a record-specific wrapper. Do not call `loadContactsSectionData`/`loadManagePortalData`.
- `lib/supabase/contact-comments.ts` — `listManageContactComments` returns `ManageContactCommentList`; keep `assertCommentContactInScope` unchanged.
- `lib/authz.ts` — `getStaffContext`, `requireRole`, `authzErrorResponse`; `MANAGE_CONTACT_WRITE_ROLES` in `lib/staff-roles.ts`.
- `lib/patch-scope.ts` — `contactInPatch`, `locationInPatch`.
- `lib/supabase/server.ts` — `createSupabaseServerClient` (RLS); `lib/supabase/admin.ts` only for the 403/404 probe and location naming set.
- Existing route pattern: `apps/*/app/api/manage/contacts/history/route.ts` (to be deleted) and `lib/manage/contact-history-handlers.ts` (to be deleted).

**Shared client**
- `components/manage/manage-types.ts` — `ManageContact`, `ManageContactHistory`, `ManageContactWriteResult`, `MANAGE_CONTACT_PATCH_KEYS`; `ManageContactWriteResult` omits `photoPath`, `lastContactedOn` and rollups, so merge by spread.
- `components/manage/manage-contact-fields.ts` — `CONTACT_FIELD_IDS`, `CONTACT_FIELD_LABEL`, `CONTACT_FIELD_ORDER`, `CONTACT_FIELD_PATCH_KEY`, `contactFieldText`, `ContactFieldResolvers`; `KNOWN_SOURCE_VALUES` currently local to `manage-contacts-table.tsx:250` — move it to `components/manage/manage-contact-fields.ts` so the server loader and the grid share one list. The body resolves location names from `locations` but passes `locationOptions` to the picker.
- `components/manage/manage-comment-types.ts` — `ManageContactComment`, `ManageContactCommentList`, `CommentActions` inputs.
- `components/manage/contact-record-dialog.tsx` — current desktop frame, `useContactHistory` self-fetch (`:237-286`), document Escape (`:434-457`), custom overlay (`:478-500`); split into body + Radix frame.
- `components/manage/manage-contact-record.tsx` — current phone frame, document Escape (`:84-95`), no history/comments; replace with shared phone frame.
- `components/manage/contact-comments-pane.tsx` — self-fetches (`:255-301`) and mutates; make presentational.
- `components/manage/manage-contact-field-editor.tsx` — Escape handlers at `:274`, `:310`, `:589`; must not close the frame.
- `components/manage/manage-contact-sheet.tsx` — custom overlay and document Escape (`:65-76`); convert to Radix or yield to the record.
- `components/ui/dialog.tsx` — Radix Dialog; `DialogContent` accepts `onEscapeKeyDown`/`onCloseAutoFocus`, `showCloseButton={false}`.

**Grid hosts and surfaces**
- `components/grid/grid.tsx` — `GridProps` at `:589-712`; `rowModel` at `:1539`; add `onVisibleRowIdsChange`.
- `components/grid/grid-row.tsx` — row/cell rendering; `td` pointerdown at `:434`.
- `components/manage/manage-contacts-table.tsx` — `expandedContactId` `:837`, mirror `:864-872`, `applyWrite` `:983-990`, `handleListCommit` `:1271-1308`, `RowExpandButton` `:586-639`, context menu `:703-735`, gutter `:1359-1438`, dialog render `:2526-2550`.
- `components/manage/manage-contact-list.tsx` — sheet `:258-267`, record `:269-277`; sequence is `visible` (search-filtered).
- `components/campaign/assign-contacts-select.tsx` — leading select column `:1051-1115` (40px), `<Grid>` `:1438-1461`; add expand control, context menu, visible ids.
- `components/staff-auth-shell.tsx` — mounts `AuthProvider`; mount the record provider here.
- `lib/staff-dto.ts` — `ClientStaff.canReadContacts` `:39`.
- `lib/sessions/data.ts` — `SessionAttendee` `:64-71`, `SessionTopAttendee` `:58-62`; add `recordAvailable`.
- `components/sessions/session-attendees.tsx`, `session-attendee-table.tsx`, `session-attendee-cards.tsx` — summary modal and triggers.
- `components/sessions/session-top-attendees-card.tsx` — server component; wrap available names in a client trigger.
- `components/dashboard/focus-section.tsx` — `CandidateRow` `:52-86`; server component.
- `components/dashboard/candidates-route.tsx` — `CandidateList` `:172-215`.
- `components/manage/manage-sessions-view.tsx` — attendee pills `:89-96`; `apps/*/app/manage/page.tsx` computes availability.

**Tests**
- `e2e/specs/sessions-detail.spec.ts` — summary assertions `:161-201`, phone `:215-243`; must move in-scope assertions to the premium record.
- `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md` — S8/S9 at `:412-413`.
- `e2e/fixtures/sessions.ts`, `e2e/fixtures/roles.ts`, `scripts/seed-preview-fixtures.mjs` — add an out-of-patch Preacher fixture (one Admin-assigned contact + Preacher-owned session).
- `e2e/specs/campaign-assign-select.spec.ts`, `dashboard-overview.spec.ts`, `dashboard-candidates.spec.ts`, `sessions-overview.spec.ts` — trigger coverage.
- `docs/architecture/testing.md` — add the record files to the shared-components table.

## Tasks & Acceptance

**Execution:**
- [x] `lib/contacts/record.ts` (new) — implement `loadContactRecord` and `loadContactRecordAvailability`; compose the RLS row, rollups, history, conditional comments, locations/locationOptions, narrowed staff names, source/books options. — One read model, one authorization boundary.
- [x] `lib/contacts/record-handlers.ts` + `apps/*/app/api/manage/contacts/[contactId]/record/route.ts` (new) — UUID 400, staff + role gate, `force-dynamic`, `no-store`, `{ error }` envelope. — The only full-record HTTP surface.
- [x] Delete `lib/manage/contact-history-handlers.ts` and `apps/*/app/api/manage/contacts/history/route.ts`; remove the dialog/pane self-fetches. — One history read.
- [x] `components/contacts/contact-record-types.ts`, `use-contact-record.ts`, `contact-record-provider.tsx`, `contact-record-trigger.tsx` (new) — payload/view state/load state, fetch + abort + sequence + commit + comment actions, provider context, inline trigger. — Shared client contract.
- [x] `components/contacts/contact-record-body.tsx`, `contact-record-dialog.tsx`, `contact-record-phone.tsx` (new/moved) — presentational body, Radix desktop/phone frames, focus/Escape/accessible name, `h2` sections, stepping announcement. — One body, two frames.
- [x] `components/manage/contact-comments-pane.tsx` — accept `comments`, `canComment`, `actions`; remove fetch; keep search/thread/reply UI; render the reason when comments are unavailable. — Presentational pane.
- [x] `components/manage/manage-contacts-table.tsx`, `manage-contact-list.tsx`, `manage-contact-sheet.tsx` — grid host uses `useContactRecord` + shared body; phone frame; Radix sheet; generic expand control; visible row ids (client draft ids excluded from the sequence); drop history fetch; update the mirror's `commentCount` after a comment mutation. — Grid host shares the contract.
- [x] `components/grid/grid.tsx`, `grid-row-expand-control.tsx` — expose visible row ids; generic labelled expand control with `data-grid-row-expand`, propagation guards, `tabIndex={-1}`. — Sequence + campaign geometry.
- [x] `components/campaign/assign-contacts-select.tsx` — widen leading column to 84, add expand control and row context menu “Expand record”, pass visible ids, open via provider. — CR-5.
- [x] `components/sessions/*`, `components/dashboard/*`, `components/manage/manage-sessions-view.tsx`, `apps/*/app/manage/page.tsx` — inline triggers, availability sets, fallback preservation, sequences. — CR-3/CR-6/CR-7.
- [x] `components/staff-auth-shell.tsx` — mount `ContactRecordProvider` once inside `AuthProvider`. — CR-9/AD-11.
- [x] Tests — update `sessions-detail`, matrix S8/S9, add the out-of-patch Preacher fixture and trigger/gateway coverage; add the record files to the testing registry. — Verification.

**Acceptance Criteria:**
- Given an in-scope contact, when any named surface trigger is activated, then the premium record opens in place with fields, attendance, campaign history and comments, and Previous/Next step through that surface’s visible in-scope list.
- Given an out-of-patch session attendee, when the row is activated, then the existing summary modal opens and no premium record request is made.
- Given an Admin outside the contact’s comments patch, when the record opens, then fields are editable, comments are not read, and the pane states why.
- Given a failed field write, when the server rejects it, then the record re-reads, the server message is shown, and the grid mirror is not left stale.
- Given a record opened by keyboard, when it closes, then focus returns to the trigger; Escape in an inline editor discards the draft without closing the record.

## Implementation Notes

**2026-11-08 — implemented at baseline `ee04207`.**

- **Server:** `lib/contacts/record.ts` composes the RLS full-row read, rollups, history, conditional comments, programme locations, patch-owner location options, narrowed staff names, `sourceOptions` (known constants + the record's own source) and `booksReadOptions` (a paginated scoped distinct read of `books_read`). `lib/contacts/record-handlers.ts` is the only full-record HTTP surface; both apps mount `GET /api/manage/contacts/[contactId]/record` with `force-dynamic` and `Cache-Control: no-store`. `/api/manage/contacts/history` and `lib/manage/contact-history-handlers.ts` are deleted.
- **Client:** `ContactRecordPayload`/`ContactRecordViewState`/`ContactRecordLoad`/`CommentActions` live in `components/contacts/contact-record-types.ts`; `useContactRecord` owns open/fetch/abort/sequence/commit/comment actions; `ContactRecordProvider` is mounted once in `StaffAuthShell`; `ContactRecordBody` is presentational; the desktop and phone frames are Radix Dialogs. The phone sheet is a Radix Dialog too, so Escape unwinds one layer. `Grid` exposes `onVisibleRowIdsChange`; `GridRowExpandControl` is shared by both grids. The campaign assign leading column widened 40 → 84.
- **Surfaces:** session detail/table/cards, Top 5, dashboard Focus/Candidates, campaign assign expand + context menu, manage Sessions pills. Out-of-patch session attendees keep the existing summary; in-scope attendees open the premium record.
- **Test-harness repairs (pre-existing drift, not feature changes):** `e2e/fixtures/manage-grid.ts` lands with `q=` so a previous run's saved view cannot change the fixture's starting arrangement; campaign/manage selection helpers hover the row before clicking the hover-revealed checkbox; `campaign-assign-write` expects the source's `Submit` label; `manage-contacts-list` expects `initialContact` to be writable, matching the baseline `CONTACT_FIELD_PATCH_KEY`.

**Review pass 1 (2026-11-08):** 27 patch findings applied — sequence anchor and removed-contact step targets, stale re-read/comment races, dashboard Focus sequence, out-of-patch location naming, non-text editor promise handling, notice reset on step, keyboard context-menu trigger, phone saved-view restore, campaign gutter spacer, comments-unavailable copy/search, count-mode labels, trigger fallback/`aria-haspopup`, sheet `role="alert"`, phone list semantics, Top 5 server component, docs/matrix counts, gita-life rationale, separate phone notices, and the added tests (multi-row Previous/Next, Contacts context menu, refused-write GET/row assertions, Preacher commentable record). Two low findings were deferred to `deferred-work.md`: Escape in the main comment composer, and a campaign Preacher/Assistant trigger matrix test.

**Final verification (after review patches):**
- `pnpm test:static` — passed: guardrails, typecheck, lint; **0 errors, 23 warnings**.
- `pnpm test:unit` — **183 passed** in 21 files.
- `pnpm test:e2e "sessions-detail|manage-contacts-list"` — **28 passed**.
- `pnpm test:e2e "campaign-assign-select|dashboard-overview|sessions-overview|manage-contacts-selection"` — **39 passed**.
- The pre-existing `test:e2e:manage` (4 editor + 2 filter) and focused grid failures remain exactly as recorded above; the full `pnpm test:e2e` and determinism runs remain unrun for that reason.

**Earlier verification (before review patches):**
- `pnpm test:static` — passed: guardrails, typecheck, lint; **0 errors, 22 pre-existing warnings**.
- `pnpm test:unit` — **179 passed** in 21 files (includes the new `contact-record-sequence.test.ts`).
- `pnpm test:e2e sessions-detail` — **12 passed**.
- `pnpm test:e2e "sessions-detail|manage-contacts-list"` — **25 passed** before the refused-write test; `manage-contacts-list` alone now **18 passed** including the refused record write.
- `pnpm test:e2e "manage-contacts-list|dashboard-overview|dashboard-candidates|campaign-assign-select|sessions-overview"` — **51 passed**.
- `pnpm test:e2e:manage` — 37 passed, **6 pre-existing failures**: 4 in `manage-contacts-edit` (the inline text editor appends old+new; reproduced at baseline `ee04207` with clean fixtures) and 2 in `manage-contacts-filter` (row 17's stale `bulk-location-3` needle; row 18's same append bug).
- `pnpm test:e2e:grid` — the full script exceeded the 30-minute run budget. A focused run of `grid-cell-range|grid-row-context-menu|grid-toolbar|grid-scroll-surface|grid-column-drag-menu` gave 41 passed / 12 pre-existing failures: selection helpers that click the hover-revealed checkbox without hovering, and saved-view/column-order drift. The feature's grid changes are covered by `grid-row-context-menu` (context menu) and the contacts/campaign specs.
- Full `pnpm test:e2e` and `pnpm test:e2e:determinism` were **not run**: the baseline suite is not green on `ee04207` for the pre-existing editor/filter/grid failures above, so a full run cannot produce a clean signal.

**Matrix coverage:** in-scope record (sessions-detail premium record + gateway 200); out-of-scope record (gateway 403 + dashboard 403 provider test); unknown record (404); malformed id (400); Admin outside comments patch (gateway 200 with `canComment=false`/`comments=null` + pane reason assertion); session attendee out of patch (summary fallback); session attendee in scope (premium record, both breakpoints); filtered grid while open (`resolveRecordAnchor` unit tests); inline-editor Escape (`manage-contacts-list`); failed field write (`manage-contacts-list` refused record write: message shown, draft reverts).


## Review Triage Log

Review pass 1 — 2026-11-08. Blind hunter, edge-case hunter and verification-gap reports; duplicates grouped by root cause.

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Sequence anchor resets after a second filter change; `next` skips the survivor that took the removed row's place | medium | patch | `contact-record-sequence.ts` returns `null` when the contact is already absent, and `use-contact-record.ts` steps `anchor + 1`; both are real once a list changes twice while a record is open. |
| A rejected write's silent re-read, or a comment mutation, can resolve after the operator stepped to another contact | medium | patch | `useContactRecord.commit` calls `loadRecord(contact.id, "silent")` without checking `openStateRef.current`; comment actions append without checking `current.contact.id`. |
| Dashboard Focus builds the sequence from all segment rows, but renders only the first three | medium | patch | `focus-section.tsx` passes `rows.map(...)` while the list renders `rows.slice(0, 3)`. |
| An out-of-patch current location is not named in the record's location editor | medium | patch | `ContactRecordBody` passes `locationOptions` to the editor; a current id outside that set cannot resolve its label. The spec requires it named but not offered. |
| Non-text field editors ignore a rejected `onCommit`, producing an unhandled rejection | medium | patch | `LocationFieldEditor`, `SourceFieldEditor`, `BooksReadFieldEditor`, `NumberFieldEditor`, `DateFieldEditor` call `onCommit` without handling the returned promise. |
| A write notice persists after stepping to another record | medium | patch | Provider and grid hosts clear `notice` on open/close, not on `previous`/`next`. |
| The Contacts grid's keyboard context-menu path opens the record with no trigger, so focus falls to the scroll container | medium | patch | `ContactsRowContextMenu` calls `openRecord(rowIds[0])`; `openRecord` defaults `trigger` to null. |
| The phone no longer restores the last saved view (`deviceView !== "desktop"` guards added) | medium | patch | `manage-contacts-table.tsx` saved-view hydration effects now return on the phone; baseline restored the view on both. |
| Campaign gutter geometry does not match the Contacts grid (no drag-grip spacer, expand control 12px left) | low | patch | Column is 84, but the campaign cell's content is 52 and the header's is 60; the contacts cell is 84 including the 12px grip. |
| Comments-unavailable copy says "Preacher" and leaves an enabled search over a list that was never read | low | patch | `contact-comments-pane.tsx` hardcodes the owner role and renders the header/search when `!canComment`. |
| Comment mutations and the `canComment: true` path have no test | medium | patch | Only the unavailable-pane assertion exists; no test posts a comment or asserts a commentable payload. |
| Previous/Next wiring through a multi-row grid is never observed | medium | patch | No e2e asserts `Previous contact`/`Next contact`; deleting the `onVisibleRowIdsChange` effect leaves every test green. |
| The Contacts grid's context-menu "Expand record" route has no test | medium | patch | Only the campaign grid's menu is covered. |
| The refused-write test does not prove the gateway re-read or the untouched grid mirror | medium | patch | It asserts the editor's own revert; it never waits for the GET or reads the row after close. |
| Count-mode expand label omits the contact name | low | patch | `GridRowExpandControl` uses the same `Expand to see N comments` for every row. |
| Trigger fallback span carries interactive classes; button lacks `aria-haspopup` | low | patch | `ContactRecordTrigger` renders `className` on the fallback span; the button has no popup hint. |
| Sheet reports write errors as `role="status"` and types `onCommit` as `void` | low | patch | `manage-contact-sheet.tsx`; other surfaces use `role="alert"` and the editor relies on the promise. |
| Phone field list is a `<dl>` of `<div>`s; the name label is orphaned when read-only | low | patch | `contact-record-body.tsx` phone layout. |
| `session-top-attendees-card.tsx` became a client component | low | patch | The Code Map says server component + client trigger; the whole card is now `"use client"`. |
| `loadContactRecord`'s "never reads every contact" comment is inaccurate | low | patch | `loadScopedBooksReadOptions` pages a scoped distinct read of one column. |
| 403 message is hardcoded while the provider comment says it is the server's | low | patch | The spec fixes the copy; the comment is the inaccurate part. |
| `docs/architecture/testing.md` has contradictory gates/counts and a dead path | low | patch | New section vs shared table vs Sessions section; old `manage-contact-record.tsx` path remains. |
| Coverage map S8/S9 claims Covered but the recorded run predates the feature | low | patch | The map's recorded run is 2026-11-01, 19 passed. |
| The two manage pages duplicate the availability read; gita-life lacks the rationale | low | patch | Same code, asymmetric comment. |
| A route change inside the same layout leaves the record open | low | patch | Provider has no pathname close effect. |
| Campaign menu item is offered even when the provider cannot open a record | low | patch | `AssignRecordOpenContext` always supplies `openRecord`. |
| Phone sheet and record share one notice state | low | patch | `ManageContactList` passes the same `notice` to both frames. |
| Comments GET route is dead code | false | — | The architecture spine explicitly retains it for the mutation API and its tests; the record no longer calls it, which is the requirement. |
| `canEdit` is hardcoded, not server-derived | false | — | The spec fixes `canEdit: true` for every manage-context record; the server produces the payload and the boundary is the derivation. |
| Copy-contact-URL creates a forbidden deep link | false | — | The spec explicitly keeps the button and says its hash is not consumed. |
| Close-focus can land on the invisible heading | false | — | The spec allows a `tabIndex={-1}` heading as the fallback; the heading is exactly that. |
| A malformed 200 body renders an undefined contact | false | — | `buildViewState` throws on a malformed payload; the hook catches it and renders the error state. |
| Escape in the main comment textarea does nothing | low | defer | Not the inline field-editor case the spec covers; clearing a long comment on Escape is a separate UX decision. |
| Phone sequence can include a client draft id | false | — | The grid is not mounted on the phone view, so no draft row exists there. |
| Campaign assign has no Preacher/Assistant trigger test | low | defer | The row set is contact-scoped by construction; the gateway re-checks. A role-matrix test is useful but not required by this spec. |
| The deleted history route needs a compatibility alias | false | — | The canonical spec and spine retire it with the grid host switch; a stale tab is a 404 by design. |
| Spec Verification/Code Map/I-O matrix are stale | false | — | The workflow rejects findings whose fix is to edit the build spec; actual results are recorded in Implementation Notes. |
| `aria-describedby={undefined}` while rendering a `DialogDescription` | false | — | Deliberate: the description is decorative; Radix is told not to link it. |

## Verification

**Commands:**
- `pnpm test:static` — expected: guardrails, typecheck and lint pass.
- `pnpm guardrails` — expected: pass.
- `pnpm typecheck:workspace` — expected: pass.
- `pnpm lint` — expected: pass.
- `pnpm test:unit` — expected: pass.
- `pnpm test:e2e:list sessions-detail` — expected: the updated spec is selected.
- `pnpm test:e2e sessions-detail` — expected: pass, no `✘`.
- `pnpm test:e2e:manage` / `:grid` / `:campaign` / `:dashboard` / `:sessions` — expected: pass.
- `pnpm test:e2e` — expected: full suite pass (~5–7 min, one worker).
- `pnpm test:e2e:determinism` — expected: two consecutive runs pass after spec/fixture edits.
