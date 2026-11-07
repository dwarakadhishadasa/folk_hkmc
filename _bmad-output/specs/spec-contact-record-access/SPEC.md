---
id: SPEC-contact-record-access
companions:
  - ../../planning-artifacts/architecture/architecture-folk_hkmc-2026-11-07/ARCHITECTURE-SPINE.md
sources:
  - ../spec-contacts-premium-grid/SPEC.md
  - ../spec-sessions-flow/SPEC.md
  - ../spec-program-dashboard/SPEC.md
  - ../spec-autodialer/SPEC.md
  - ../../planning-artifacts/architecture/architecture-folk_hkmc-2026-11-03/ARCHITECTURE-SPINE.md
---

> **Canonical contract.** This SPEC and its architecture spine are the complete contract for opening the premium contact record outside the Contacts grid. The old spec's CAP-5 withdrawal is historical; this spec reopens the record as a cross-surface capability.

# Cross-surface contact record access

## Why

The premium contact record is built, but only the Contacts grid can open it. A staff member looking at a session attendee, a dashboard focus row, a candidate list or a campaign assign row can see a name but cannot open the full record without navigating to Contacts, searching, and opening it there. The session page has a different, read-only summary card; the other surfaces have nothing.

The product need is simple: **when a staff member sees a person, they can open that person's record in place.** The boundary is equally simple: the full record is the manage-scope record, and a contact outside the caller's patch does not open it. The existing session summary stays as the fallback so today's out-of-patch attendee behaviour does not regress.

This is **not** a global contact finder. There is no header search, command palette or `?contact=` URL in this feature.

## Capabilities

- **CR-1 — One full-record read gateway**
  - **intent:** every surface opens the record from one server read, with one authorization boundary.
  - **success:** `GET /api/manage/contacts/[contactId]/record` is the only full-record endpoint; it runs `getStaffContext()` + `MANAGE_CONTACT_WRITE_ROLES` + the contact RLS boundary, reads the full row with the RLS client, and returns `ContactRecordPayload`. There is no session-context full-record endpoint. The route is `force-dynamic`, `Cache-Control: no-store`, and returns the existing `{ error }` envelope. A malformed id is a 400; out-of-scope uses the existing 403/404 distinction.

- **CR-2 — One record body, two responsive frames**
  - **intent:** the desktop dialog and the phone frame show the same record, with the same history and comments.
  - **success:** one `ContactRecordBody` takes one `ContactRecordViewState` and never fetches; the desktop dialog and phone frame only position, scroll and supply header actions. The comments pane is presentational and never reads on mount. The Contacts grid's desktop and phone hosts share the body and the view state; the old `useContactHistory` and `GET /api/manage/contacts/history` are retired, and the record no longer calls `GET /api/manage/contacts/comments` for its read. The phone record gains the attendance and campaign sections and the comments pane.

- **CR-3 — Inline triggers on the named surfaces**
  - **intent:** a staff member opens a person's record where the person appears.
  - **success:** triggers on (a) session detail attendee table and phone cards, (b) sessions overview Top 5 attendees, (c) dashboard Focus rows and Candidates page, (d) campaign assign-contacts grid, (e) manage Sessions attendee pills. A trigger appears only when `loadContactRecordAvailability` (RLS client) says the contact is in manage scope; for the session detail and Top 5, `recordAvailable=false` keeps the existing summary or plain text. Dashboard and campaign row sets are contact-scoped by construction; manage Sessions uses the availability set computed on the server. No campaign caller screen, no live attendance list, no global finder.

- **CR-4 — Editable in scope, comments only when allowed**
  - **intent:** the full record can be edited in place; a contact outside the comments patch does not expose comments.
  - **success:** every write goes through `PATCH /api/manage/contacts` with `MANAGE_CONTACT_PATCH_KEYS`; a successful result is merged by spread into the hook's contact and the grid mirror; a failed write re-reads the record, shows the server message, and reverts the mirror. `canEdit` is true for the manage-context record. `canComment` is `contactInPatch(...)`; when false, the loader does **not** read comments, `comments` is `null`, and the pane shows the reason. The comments module's `assertCommentContactInScope` is not relaxed. An Admin can edit a programme contact outside their patch but cannot comment on it.

- **CR-5 — Campaign assign expand control**
  - **intent:** open a record from the assign grid without disturbing row selection.
  - **success:** the assign grid's leading gutter gains a generic `GridRowExpandControl`, matching the Contacts grid's geometry; the leading column widens to fit the serial/checkbox slot plus the expand slot. The control is a real, labelled button, carries `data-grid-row-expand`, stops pointer/click propagation, and does not toggle selection. It is pointer/touch, matching the Contacts grid's `tabIndex={-1}` modality; the required keyboard route is a row context menu item **Expand record** reached with Shift+F10 or the Menu key, which the assign grid gains. Making in-cell controls Tab-reachable would require fixing the grid's pre-existing Tab trap and is not part of this feature.

- **CR-6 — The source list supplies the sequence**
  - **intent:** Previous/Next steps through the list the operator is looking at, not a global order.
  - **success:** `openContactRecord({ contactId, sequence? })`; the sequence is the visible, in-scope list in display order. Absent or singleton disables both chevrons. Session detail passes in-scope attendee ids; Top 5 the in-scope five; dashboard the current list; campaign assign the visible in-scope rows; manage Sessions the current session's attendee ids filtered by availability. The Grid exposes its current filtered/sorted visible row ids to both grid hosts (`onVisibleRowIdsChange` or equivalent); the desktop must not use the unfiltered mirror.

- **CR-7 — Out-of-scope session summary is unchanged**
  - **intent:** the feature does not regress the session attendee behaviour.
  - **success:** `recordAvailable=false` on a session attendee opens the existing summary modal and endpoint exactly as today; no premium record, comments, campaign history or edit is added to it. The summary's existing wider-than-contact-RLS read is a pre-existing exception, recorded with Dwaraka as owner. In-scope attendees (including every Admin, whose contact RLS is programme-wide) open the premium record, so the `sessions-detail` summary assertions and matrix rows S8/S9 change in the same story; add an out-of-patch Preacher fixture for the fallback.

- **CR-8 — Overlay accessibility and focus**
  - **intent:** the record is operable without a mouse and closing it returns the operator to the trigger.
  - **success:** frames mount inside the existing Radix Dialog primitive or one shared overlay stack; background inert and scroll-locked; topmost layer owns Escape; no frame registers its own document keydown. The dialog's `onEscapeKeyDown` yields to an open inline editor: if the event target is `input`, `textarea`, `select` or `[contenteditable]`, Escape discards the draft and does not close the record. Every host passes its trigger; focus returns to it if connected, otherwise to `[data-contact-list]`, `[data-grid-scroll]` or a `tabIndex={-1}` heading. The dialog's accessible name includes the contact; sections start at `h2`; stepping records announces the new contact. The phone sheet yields Escape to the record.

- **CR-9 — Preservation**
  - **intent:** no second data path, dependency or general contact reader is introduced.
  - **success:** the record gateway reads one contact and its reference data, never `loadContactsSectionData`/`loadManagePortalData` or every contact; `staffNames` stays narrowed to referenced ids; `locations` is the naming set and `locationOptions` the patch picker set; `sourceOptions`/`booksReadOptions` are the record's own values plus constants or a scoped distinct read. The provider lazy-loads the record chunk and fetches only on open. Both apps get the record route; the shared code stays in `lib/`/`components/`. No new dependency. `pnpm guardrails`, `pnpm typecheck:workspace`, `pnpm test:unit`, and the feature e2e scripts pass.

## Constraints

- **Parent spine is binding.** `architecture-folk_hkmc-2026-11-03` AD-1 (patch owner), AD-3 (patch predicate), AD-4 (role sets), AD-5 (RLS narrows, never widens) and AD-6 (Preacher label) apply unchanged. The full record is manage-scope only; the session summary is the one pre-existing exception and is not extended.
- **One record body.** A second record UI, a second history fetch, or a second comments fetch is a defect, not an implementation choice.
- **One mutation channel.** `PATCH /api/manage/contacts` is the only field write; no new endpoint, no direct Supabase from a component.
- **One overlay layer.** Do not add a second document keydown or scroll lock. Use the existing Radix Dialog/overlay stack.
- **No global contact reader.** No header search, command palette or URL deep link. The copy-URL button in the record stays as it is; its hash is not consumed by this feature.
- **Session detail contract changes.** The in-scope attendee now opens the premium record, so the existing summary assertions and matrix rows must be updated; the fallback is covered by an out-of-patch Preacher fixture.
- **e2e discipline.** Use `pnpm test:e2e:*` scripts, regex filters, one runner at a time. Never `pnpm exec playwright test`. A green `pnpm test` is the unit layer, not e2e.
- **No new dependency.** Compose the installed Radix Dialog, grid primitives and `lucide-react`.

## Non-goals

- A global contact finder, command palette or contact search endpoint.
- URL deep linking (`?contact=<id>` or `#contact-<id>` consumption).
- Campaign caller call card/queue/disposition triggers; a caller in a call flow should not open a full record, and a Volunteer caller has no contact read.
- A second record affordance in Manage Attendance or Manage Favorites; those views keep their own selected-detail panels.
- Narrowing the existing session summary's wider read; that is a separate security change.
- A route-based record page with its own URL/back-button model.
- Server-side record caching, prefetching or a new read model for the contacts list.

## Suggested split

1. **Server:** `loadContactRecord`, `loadContactRecordAvailability`, payload types, the manage record route in both apps, and the comments skip when `canComment` is false.
2. **Shared client:** `useContactRecord`, `ContactRecordBody`, the presentational comments pane, the desktop/phone frames, the overlay/focus contract, and the Contacts grid host switch off the old history/comments self-fetches.
3. **Surfaces:** dashboard Focus and Candidates, session detail + Top 5 + fallback, campaign assign expand control, manage Sessions availability set.
4. **Verification:** update `sessions-detail` and matrix S8/S9, add the out-of-patch fixture, run the feature e2e scripts.
