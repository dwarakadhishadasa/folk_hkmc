# Reality-check review — cross-surface contact record

- **Spine reviewed:** `_bmad-output/planning-artifacts/architecture/architecture-folk_hkmc-2026-11-07/ARCHITECTURE-SPINE.md` (draft, 2026-11-07)
- **Review type:** independent reality check — every committed decision and factual claim checked against the worktree
- **Reviewer:** architecture review subagent
- **Edit status:** spine not edited; this file is the only artefact.
- **Worktree:** `2d66df6` plus uncommitted changes. The review reads the **working tree**, because the premium record (`contact-record-dialog.tsx`, `manage-contact-record.tsx`, `contact-comments-pane.tsx`, `manage-contacts-table.tsx`, `manage-types.ts`, `lib/supabase/manage.ts`) and the history route/handler are modified or untracked there. If those changes are not the intended baseline, re-verify before building.
- **Method:** read the spine, then the named files, `package.json`, both `proxy.ts` matchers, the RLS migrations, the session RPCs, the e2e specs, the matrix map, the cited spec and `.memlog.md`. No tests were run; every statement below is source inspection with file:line evidence. This is a read-only review.

## Verdict

The spine's **inventory of existing symbols and its version table are substantially accurate**: `OPERATIONAL_ROLES`, `MANAGE_CONTACT_WRITE_ROLES`, `CONTACT_COMMENT_ROLES`, `contactInPatch`, `assertManageContactInScope`, `loadManageContactHistory`, `listManageContactComments`, `assertCommentContactInScope` and `ClientStaff.canReadContacts` all exist and mean what the spine says; the new record route is covered by both `/api/manage/:path*` matchers; the session attendee/summary reads really are service-role RPCs that can return contacts outside the contact patch; and the package versions are current (Tailwind's `^4.1.9` is the only caret-precision nit). The failures are in the **claims about what does not exist**, in **app parity**, and in the **contracts the spine leaves undefined**. AD-1 says there is "no session-context record endpoint" and "the only HTTP surface" while `apps/folk/app/api/sessions/[sessionId]/attendees/[contactId]/route.ts` is exactly a session-context, contact-id-only reader that AD-9 preserves, and the history/comments GETs are further contact-id-only reads. AD-9 binds `apps/*` to a route only `apps/folk` has, and the campaign-assign/Top-5 surfaces are folk-only too. AD-2 states a payload rule but not the read-skip, and the existing comments pane and dialog self-fetch, so the Admin-out-of-patch record the spine declares intended can 403 or double-read. AD-6 changes the existing Admin session-detail e2e contract (matrix rows S8/S9) and will fail `sessions-detail.spec.ts` as written. AD-3 gets the host inventory and campaign-gutter geometry wrong. Finally, the spine cites `spec-contacts-premium-grid/SPEC.md` as a source while that spec still records Dwaraka's **withdrawal of CAP-5** — no record panel, no per-row open, no prev/next — and no `spec-contact-record-access` or supersession pointer exists. The symbol facts are good enough to build from; the spine is not yet a build substrate until the source conflict, the endpoint wording, the comments/body contract, the e2e contract and the host/parity corrections are made.

## Verification matrix

| # | Claim in the spine | Code reality | Verdict |
|---|---|---|---|
| 1 | Next.js 16.0.7 | `package.json:118` — `"next": "16.0.7"` | ✅ |
| 2 | React 19.2.0 | `package.json:121` — `"react": "19.2.0"`; `:123` react-dom | ✅ |
| 3 | TypeScript 5.x | `package.json:146` — `"typescript": "^5"` | ✅ |
| 4 | Tailwind CSS 4.1.9 | `package.json:143` — `"tailwindcss": "^4.1.9"` | ⚠️ caret omitted |
| 5 | `@supabase/supabase-js` ^2.105.1 | `package.json:105` | ✅ |
| 6 | `@tanstack/react-table` ^8 | `package.json:106` — `"^8"` | ✅ |
| 7 | `@tanstack/react-virtual` ^3 | `package.json:107` — `"^3"` | ✅ |
| 8 | Playwright ^1.62 | `package.json:134` — `"@playwright/test": "^1.62.0"` | ✅ |
| 9 | Vitest ^5.0.5 | `package.json:147` | ✅ |
| 10 | pnpm 10.33.0 | `package.json:5` — `"packageManager": "pnpm@10.33.0"` | ✅ |
| 11 | `OPERATIONAL_ROLES` exists | `lib/staff-roles.ts:7` — `["Admin", "Preacher", "Assistant"]` | ✅ |
| 12 | `MANAGE_CONTACT_WRITE_ROLES` exists | `lib/staff-roles.ts:22` — alias of `OPERATIONAL_ROLES` | ✅ |
| 13 | `CONTACT_COMMENT_ROLES` exists | `lib/staff-roles.ts:35` — same three roles, deliberately separate | ✅ |
| 14 | `contactInPatch` exists | `lib/patch-scope.ts:7-9` — `ownerId !== null && assignedPreacherId === ownerId` | ✅ |
| 15 | `assertManageContactInScope` exists | `lib/supabase/manage.ts:991` — primary read through `createSupabaseServerClient()` at `:995-1001`; 403/404 probe through `createSupabaseAdminClient()` at `:1011-1027` | ✅ (with a service-role fallback the spine does not mention) |
| 16 | `updateManageContact` uses the scope assertion | `lib/supabase/manage.ts:1297-1303` — `await assertManageContactInScope(staff, contactId)`; the update itself uses `createSupabaseAdminClient()` at `:1307` | ✅ |
| 17 | `loadManageContactHistory` exists | `lib/supabase/manage.ts:1621-1626` — asserts scope then reads attendance/dialer history with the RLS client at `:1630-1646` | ✅ |
| 18 | `listManageContactComments` exists | `lib/supabase/contact-comments.ts:189-196` — calls `assertCommentContactInScope` then reads with the admin client | ✅ |
| 19 | Comments read is patch-gated by `assertCommentContactInScope` | `lib/supabase/contact-comments.ts:66-79` — `assertManageContactInScope` **plus** `contactInPatch`; throws 403 `contact_comment_out_of_patch` | ✅ |
| 20 | `ClientStaff.canReadContacts` exists | `lib/staff-dto.ts:28` — `canReadContacts: boolean`; computed at `:39` as `isOperational && (role !== "Assistant" || hasPatchScope)` | ✅ (there is no `ContactStaff` type; the spine correctly uses `ClientStaff`) |
| 21 | `/api/manage/:path*` is matched | `apps/folk/proxy.ts:14` and `apps/gita-life/proxy.ts:14` — both matchers include it; the proposed `/api/manage/contacts/[contactId]/record` is covered | ✅ |
| 22 | `ContactRecordDialog` is only hosted in `manage-contacts-table.tsx` | `components/manage/manage-contacts-table.tsx:17` imports it; `:2527` renders it; no other import found | ✅ |
| 23 | `ManageContactRecord` is the phone variant | `components/manage/manage-contact-record.tsx:54` — full-screen `role="dialog"` record; hosted only by `components/manage/manage-contact-list.tsx:6,270` | ✅ |
| 24 | The phone host is `manage-contact-list.tsx` | `components/manage/manage-contact-list.tsx:110` owns `recordId`; `:134` `closeRecord`; `:269-277` renders `ManageContactRecord`. AD-3's bind list and the structural seed omit this file | ❌ omission |
| 25 | Session attendees are read through a service-role RPC | `lib/sessions/data.ts:3` imports `createSupabaseAdminClient`; `:324-328` calls `.rpc("session_attendees")`; the function is `SECURITY INVOKER`, granted only to `service_role` (`supabase/migrations/20261101000000_sessions_flow.sql:650,660`) | ✅ |
| 26 | Session attendees can include contacts outside the contact patch | `20261101000000_sessions_flow.sql:502-506` reads `attendance` for a visible session; `:530-532` left-joins `public.contacts` by `id` and `program_id` only — no `assigned_preacher_id` filter. `20261102020000_sessions_top_attendees.sql:61-71` joins `public.contacts` with no patch filter. `contact_attendance_summary` checks only programme membership (`sessions_flow.sql:553-560,633-637`) | ✅ |
| 27 | `assertManageContactInScope` uses the RLS-scoped client | Primary read: `createSupabaseServerClient()` at `:995`; the empty-result probe uses the admin client at `:1011` but returns no row | ✅ (disjunction in AD-1 is still unsafe; see R-02) |
| 28 | Proposed files fit the monorepo guardrails | New files are in `lib/`, `components/`, `apps/*`; no package reaches outside; `apps/*/tsconfig.json` includes `../../lib/**/*.ts` and `../../components/**/*.tsx`. `lib/contacts/record.ts` and `lib/manage/record-handlers.ts` must carry `import "server-only"`; `components/contacts/contact-record-types.ts` must remain client-safe (types from `components/manage/*`, not `lib/supabase/*`) | ✅ with required markers |
| 29 | Both apps need the record route | Both apps have `/manage`, `/contacts/grid`, `/dashboard`, `/dashboard/candidates`, and `/api/manage/contacts/*`; both matchers cover `/api/manage/:path*`. **But** `apps/gita-life` has no `/sessions/[sessionId]` page or attendee route, no Top 5 card, and no `/campaigns` pages | ✅ for the record route; ❌ for `apps/*` session route |
| 30 | `ContactRecordDialog` lives at `components/contacts/contact-record-dialog.tsx` | Existing file is `components/manage/contact-record-dialog.tsx`; the seed's path is a **new** path with no "move" instruction | ❌ path/duplication risk |
| 31 | `ContactRecordBody`, `ContactRecordProvider`, `ContactRecordTrigger`, `GridRowExpandControl` exist | None exist (`components/contacts/contact-record-*`, `components/grid/grid-row-expand-control.tsx` absent) | ✅ proposed, not existing (the spine does not claim they exist) |
| 32 | `ContactRecordPayload`, `loadContactRecord`, `recordAvailable`, `canEdit`, `canComment` exist | None exist; `SessionAttendee`/`SessionTopAttendee` have no `recordAvailable` (`lib/sessions/data.ts:58-71`); `ManageContact` has no `canComment` (`components/manage/manage-types.ts:50-90`) | ✅ proposed, not existing |
| 33 | `GET /api/manage/contacts/[contactId]/record` exists | Absent; the existing contact-id-only GETs are `/api/manage/contacts/history` and `/api/manage/contacts/comments` (both apps) | ✅ proposed, but AD-1's "only HTTP surface" is false |
| 34 | The premium record "exists" | Desktop `ContactRecordDialog` and phone `ManageContactRecord` exist in the working tree; the **cited spec** withdrew CAP-5 and says "no record panel, no per-row open affordance, and no prev/next navigation" (`spec-contacts-premium-grid/SPEC.md:40,60`) | ⚠️ code-true, spec-contradicted; see R-01 |
| 35 | The dialog already has `role="dialog"`, `aria-modal="true"`, an accessible name | `contact-record-dialog.tsx:493-495` — yes, but the name is `"Detail view dialog"`, not the contact; the phone frame uses `Contact: ${contact.name}` (`manage-contact-record.tsx:103`) | ✅/⚠️ |
| 36 | The dialog focuses into the record | `contact-record-dialog.tsx:416` — `rootRef.current?.focus()`; no focus return, inert background or scroll lock | ✅ partial; AD-8 is the fix |
| 37 | History is payload data and the body does not fetch | Existing `ContactRecordDialog` self-fetches history from `/api/manage/contacts/history` (`:237-286`); the payload would be a second source unless the frame is changed | ❌ lifecycle unresolved |
| 38 | Comments are payload data | Existing `ContactCommentsPane` self-fetches `/api/manage/contacts/comments` on mount (`contact-comments-pane.tsx:64,255-301`) and re-reads after mutations; the payload would be a second source and the pane is a second authority | ❌ lifecycle unresolved |
| 39 | `ManageContact` field is `assigned_preacher_id` | Client type uses `assignedPreacherId` (`manage-types.ts:76`); only the raw `ContactScopeRow` uses `assigned_preacher_id` (`lib/supabase/manage.ts:135,175,998`) | ⚠️ ambiguous spelling |
| 40 | The grid host has a server-derived `canComment` | `ManageContact` has no `canComment`; the grid's `loadContactsSectionData` filters to `assigned_preacher_id = ownerId` (`lib/supabase/manage.ts:919-921`), so every grid row is in the patch; the provider's `ContactRecordPayload` has the flag, the grid host has only `payload.scope.patchOwnerId` (and it is `null` for an Admin in `mode=admin`, `loadManagePortalData:835`) | ❌ capability source undefined |
| 41 | Campaign assign's leading gutter matches the Contacts grid | Campaign first column is `size: 40` (`assign-contacts-select.tsx:1109`) with one select/serial slot; Contacts first column is `size: 84` (`manage-contacts-table.tsx:1433`) with grip + checkbox + expand. Not a drop-in | ❌ geometry |
| 42 | `sourceOptions`/`booksReadOptions` are known values or a scoped query | `sourceOptions` is `KNOWN_SOURCE_VALUES` (`manage-contacts-table.tsx:250`) plus the current contacts' values (`:971-981`); the constant is local and not exported. The phone host `ManageContactList` does not receive either option list | ⚠️ loader/host gap |
| 43 | The record read must not call `loadContactsSectionData`/`loadManagePortalData` | Both exist and both read the full scoped contact set (`lib/supabase/manage.ts:580-853,873-976`); the record loader must not call them | ✅ |
| 44 | The existing "Copy contact URL" is unconsumed | `contact-record-dialog.tsx:550-551` copies `${href}#contact-${id}`; no listener found | ✅ |
| 45 | The session summary endpoint is unchanged | `apps/folk/app/api/sessions/[sessionId]/attendees/[contactId]/route.ts:18-48` exists and is the only session-context contact reader; `apps/gita-life` has no equivalent | ✅ for folk; ❌ for `apps/*` |
| 46 | Existing Admin session detail will keep working | `e2e/specs/sessions-detail.spec.ts:126` uses `storageState("admin")`; the fixture contacts are assigned to the preacher (`:59-70`); the Admin's contact RLS is programme-wide (`20261006010000_scoped_rls_policies.sql:178`), so `recordAvailable` is true and the premium record replaces the summary the spec asserts (`:161-201,212-249`) | ❌ test contract changes |
| 47 | The matrix map can stay as is | `matrix-coverage-map.md:412-413` marks S8/S9 Covered by `sessions-detail.spec.ts` | ❌ must be updated with the spec |
| 48 | The phone e2e hooks can stay as is | `e2e/specs/manage-contacts-list.spec.ts:251` asserts `aria-label="Contact: <name>"`; `:257-268` asserts nine `data-contact-field` ids; `:274` clicks `Close`. The new body/frame must preserve them | ✅ constraint the spine omits |
| 49 | The feature's source spec supports it | `spec-contacts-premium-grid/SPEC.md:60` withdraws CAP-5 and says no record panel/per-row open/prev-next; `.memlog.md:21` records the unresolved "new spec or reopen CAP-5" question; no `spec-contact-record-access` exists | ❌ source conflict |
| 50 | The feature has a verification plan | `docs/architecture/testing.md:361` lists `components/staff-auth-shell.tsx` as shared (`smoke` + `test:e2e:manage`); `:366-367` lists `lib/authz.ts`/`lib/staff-roles.ts` etc. as full `pnpm test:e2e`; the spine has no test section | ❌ omitted |

## Findings

### R-01 — The cited spec withdraws the record panel the spine reintroduces (High, discuss)

**Evidence.** `_bmad-output/specs/spec-contacts-premium-grid/SPEC.md:40` says "Its record panel is **not** adopted — CAP-5 was withdrawn." `:60` is explicit: "**CAP-5 — WITHDRAWN by Dwaraka, 2026-10-12.** Record review is **not** in scope. There is no record panel, no per-row open affordance, and no prev/next navigation." The spine's AD-3 reintroduces a record body/dialog/phone frame, AD-6 adds per-row triggers, and AD-7 adds previous/next. The `.memlog.md:21` records the question: "The existing spec-contacts-premium-grid withdrew CAP-5. A new spec-contact-record-access (with a supersession pointer in the old spec) is the cleaner home than reopening CAP-5." No such spec exists under `_bmad-output/specs/`.

**Why it matters.** The code has a record dialog and phone record (the uncommitted premium-grid work), so the spine's "the premium contact record exists" is code-true. But the cited planning source says the opposite. A builder or reviewer cannot tell whether this feature is approved work or a reintroduction of a withdrawn capability. The `.memlog` line 24-25 records a reversal to contact/manage scope but not a reopening of CAP-5.

**Fix.** Either add `_bmad-output/specs/spec-contact-record-access/SPEC.md` with a supersession pointer in `spec-contacts-premium-grid/SPEC.md`, or record Dwaraka's explicit decision to reopen CAP-5 in the spine. Do not leave `spec-contacts-premium-grid/SPEC.md` as the only cited spec while contradicting CAP-5.

### R-02 — AD-1's "no session-context record endpoint" and "only HTTP surface" are false (High, autofix)

**Evidence.** `apps/folk/app/api/sessions/[sessionId]/attendees/[contactId]/route.ts:18-48` is a session-context, contact-id-only read under `/api/sessions`, outside `/api/manage`. It returns `{ name, summary }` with `notes`, `favorite`, `preacherName`, attendance and history from `contact_attendance_summary` (`20261101000000_sessions_flow.sql:537-641`). The spine's AD-9 preserves it "exactly as they are" and says "the premium record never uses the session endpoint." That is the correct product decision, but it contradicts AD-1's "There is no session-context record endpoint and no contact-id-only read outside the manage boundary." The existing `GET /api/manage/contacts/history` and `GET /api/manage/contacts/comments` are also contact-id-only reads (inside the manage boundary), so "the only HTTP surface" is false even if read as "the only record surface."

**Why it matters.** A builder following AD-1 literally would delete or refuse to touch the fallback endpoint that AD-9 requires. A reviewer would flag the inconsistency and the spine would lose authority. The session endpoint is the exact compatibility surface the feature depends on for out-of-patch attendees.

**Fix.** Change AD-1 to: "There is no **new** session-context full-record endpoint. The existing `GET /api/sessions/[sessionId]/attendees/[contactId]` remains the sole session-scoped contact reader, unchanged per AD-9. `GET /api/manage/contacts/[contactId]/record` is the only **full-record** HTTP surface; the existing history/comments GETs remain the grid host's partial reads (or are retired — choose one)."

### R-03 — The body's read-state and write contract is undefined; comments/history are double-read or double-authority (High, discuss)

**Evidence.** AD-3 says `ContactRecordBody` "takes data and callbacks; it does not fetch." AD-1 puts `history` and `comments` in `ContactRecordPayload`; AD-10 says one record, one read. The existing code has two independent fetches:

- `components/manage/contact-record-dialog.tsx:237` defines `HISTORY_ENDPOINT = "/api/manage/contacts/history"`; `:252-286` `useContactHistory(contactId)` fetches it on open and renders `loading | error | ready`.
- `components/manage/contact-comments-pane.tsx:64` defines `COMMENT_ENDPOINT = "/api/manage/contacts/comments"`; `:255-301` fetches it on mount and stores `comments`, `readerUserId`, `readerName`.
- The grid's `onCommit` is fire-and-forget: `manage-contacts-table.tsx:2533-2535` does `void handleListCommit(...)`; `:1296-1305` catches and writes a notice, so it never rejects. A provider-side body that awaits `onCommit` for an inline error cannot use that callback unchanged.

The body's two hosts therefore have different data shapes: the provider has a payload (`contact`, `history`, `comments`, `capabilities`), while the grid host has `ManageContact` from the payload, history from `useContactHistory`, comments from the pane's own fetch, and `canEdit=true`/`canComment=true` by construction (the grid is self-scoped). The spine never freezes a prop type or a read-state discriminant.

**Why it matters.** The "one body" is the spine's central claim. Two compliant builders can make the grid body expect `history: ManageContactHistory` (always ready) and the provider body expect `history: ContactRecordHistoryState` (`loading | error | ready`), or one can keep the pane's fetch and the other the payload — exactly the drift AD-1/AD-10 exist to prevent. The admin-out-of-patch comments case also fails silently or 403s: `listManageContactComments` calls `assertCommentContactInScope` (`contact-comments.ts:194`), which throws 403 for an Admin outside the patch (`:66-79`). AD-2 says `comments` is non-null only when `canComment`, but it does not say the loader **skips** the call; an implementer who calls it unconditionally fails the record GET for the exact Admin case AD-2 declares intended.

**Fix.** Freeze `ContactRecordBodyProps` (or a `ContactRecordViewState` discriminant) in `components/contacts/contact-record-types.ts`: `status: "loading" | "error" | "ready"`, `contact: ManageContact`, `history: ManageContactHistory`, `comments: ManageContactCommentList | null`, `capabilities`, `locations`, `locationOptions`, `staffNames`, `booksReadOptions`, `sourceOptions`, `canEdit`, `canComment`, and an `onCommit: (key, value) => Promise<...>` that both hosts can satisfy. State: when `canComment` is false, `loadContactRecord` **does not call** `listManageContactComments`; `comments` is null. Refactor `ContactCommentsPane` to take `comments`/`canComment` in the provider host and only mutate; the grid host may keep its patch-gated fetch, but it must not mount the pane when `canComment` is false. If the grid keeps `useContactHistory`, give it the same `loading | error | ready` state, or retire `/history` and use the record gateway for both hosts.

### R-04 — AD-6 changes the existing Admin session-detail e2e contract (High, autofix)

**Evidence.** `e2e/specs/sessions-detail.spec.ts:126` uses `storageState: storageStatePath("admin")`. The fixtures create Zulu and Alpha with `assignedPreacherId: preacher.id` (`:59-70`), and the sessions are created by the Admin (`:73-90`). The Admin's contact RLS is programme-wide (`supabase/migrations/20261006010000_scoped_rls_policies.sql:178`), so the new RLS-scoped `recordAvailable` intersection returns **true** for both. AD-6 then opens the premium record instead of the summary the spec asserts:

- `:161-201` expects the summary card: `getByText("Assigned preacher", { exact: true })` (lowercase p; the premium record uses `"Assigned Preacher"`, `manage-contact-fields.ts:97`), `[data-attendance-history]` (`:189-192`), and the summary's field labels.
- `:212-249` expects "Contact details" and "Attendance history" headings (`:238-239`), which are `ContactAttendanceCard` headings, not the premium record.

The matrix map marks S8/S9 **Covered** by this spec (`matrix-coverage-map.md:412-413`). The existing spec has **no** out-of-patch attendee for the Admin; the fallback branch (`recordAvailable=false`) has no fixture at all. The `.memlog` says the out-of-patch attendee keeps the summary, but the test cannot prove it.

**Why it matters.** A green e2e run is the only verification of this behaviour; the feature's own AD-6 makes two committed specs red. The matrix map would become false. The testing policy requires `pnpm test:e2e:sessions` and, because `StaffAuthShell`/`lib/authz` are shared, the full `pnpm test:e2e` before a PR (`docs/architecture/testing.md:361,366-367`).

**Fix.** Update `sessions-detail.spec.ts` to assert the premium record for the Admin (or switch to a Preacher), and add a separate fixture where the attendee is assigned to **another** preacher so the Preacher's `recordAvailable` is false and the summary branch is covered. Update S8/S9 in `matrix-coverage-map.md` in the same commit. Add the e2e impact to the spine's AD-6/AD-9, not only to the implementation story.

### R-05 — AD-9's `apps/*` session route is folk-only; the session/top-5/campaign surfaces are not mirrored (Medium, autofix)

**Evidence.** `apps/folk/app/api/sessions/[sessionId]/attendees/[contactId]/route.ts` exists; `apps/gita-life/app/api/sessions/` contains only `route.ts` (no `[sessionId]`). `apps/gita-life/app/sessions/page.tsx` renders `SessionsManager` (`:3,30`), not the folk `sessions-overview`/`SessionTopAttendeesCard`; `getSessionsTopAttendees` is called only in `apps/folk/app/sessions/page.tsx:104`. `apps/gita-life/app` has no `campaigns/` directory at all, so `AssignContactsSelect` is folk-only. Both apps do have `/manage`, `/contacts/grid`, `/dashboard`, `/dashboard/candidates`, and `/api/manage/contacts/*`, so the **record route** is correctly mirrored.

**Why it matters.** AD-9 binds `apps/*/app/api/sessions/[sessionId]/attendees/[contactId]/route.ts`; a builder would create a gita-life route/page that does not exist and has no caller. The spine's "both apps" wording also hides that the session-detail/Top-5/campaign triggers are folk-only, which changes the test and review scope.

**Fix.** Change AD-9's binder to `apps/folk/app/api/sessions/[sessionId]/attendees/[contactId]/route.ts` (and `components/sessions/*` as folk-only). State explicitly: the record route is mirrored in both apps; the session-detail, Top-5 and campaign-assign triggers are folk-only; the dashboard/manage/contacts triggers are both apps.

### R-06 — AD-3's host inventory and campaign-gutter geometry are wrong (Medium, autofix)

**Evidence.** The desktop dialog is `components/manage/contact-record-dialog.tsx` (imported only by `manage-contacts-table.tsx:17`; rendered at `:2527`), not `components/contacts/contact-record-dialog.tsx`. The phone host is `components/manage/manage-contact-list.tsx` (owns `recordId` at `:110`, `closeRecord` at `:134`, renders `ManageContactRecord` at `:270`), not `manage-contacts-table.tsx`. AD-3 binds `components/manage/manage-contact-record.tsx` and `manage-contacts-table.tsx` but **not** `manage-contact-list.tsx`; the structural seed lists new `components/contacts/contact-record-dialog.tsx` and `contact-record-phone.tsx` without saying "move" or "replace". The Contacts grid's leading column is `size: 84` (`manage-contacts-table.tsx:1433`: grip 12 + checkbox 16 + expand 32 + gaps); the campaign assign grid's leading column is `size: 40` (`assign-contacts-select.tsx:1109`: one 16px select/serial slot). "Matching the Contacts grid" is therefore a layout change, not a copy, and the campaign e2e locators (`campaign-assign-select.spec.ts:341,345` etc. use `contactRow(...).getByRole("checkbox")`) must keep passing.

**Why it matters.** A builder following the seed creates a second desktop dialog and a second phone frame, leaving the grid's existing ones in place — the "two record UIs drifting" AD-3 exists to prevent. The campaign grid's 40px gutter cannot hold the Contacts gutter's 84px control set; the first-column layout, frozen column and checkbox hit area all change.

**Fix.** Bind `components/manage/manage-contact-list.tsx` and `components/manage/contact-record-dialog.tsx` explicitly. Say whether the existing dialog/phone are **moved** to `components/contacts/` or **kept** as thin frames around the new body; do not leave both. For campaign assign, specify the gutter order and width (e.g. select → expand → serial, 84px or a deliberate narrower design), and state that the checkbox/row-selection contract and `campaign-assign-*.spec.ts` locators are unchanged.

### R-07 — AD-2's `assigned_preacher_id` spelling and the grid host's capability source are unresolved (Medium, autofix)

**Evidence.** The client-safe `ManageContact` uses `assignedPreacherId` (`components/manage/manage-types.ts:76`); the raw `ContactScopeRow` uses `assigned_preacher_id` (`lib/supabase/manage.ts:135,175,998`). AD-2 writes `contactInPatch(contact.assigned_preacher_id, ...)`, which only compiles if `contact` is the raw scope row. The payload's `contact` is the client-facing `ManageContact` the body/dialog already take (`contact-record-dialog.tsx:85`, `manage-contact-record.tsx:43`), so the snake_case formula is ambiguous at best. Separately, `ManageContact` has no `canComment`; the grid host is self-scoped (`loadContactsSectionData` filters to `assigned_preacher_id = ownerId`, `lib/supabase/manage.ts:919-921`), so `canComment=true` is true by construction, but AD-2 says "server-derived, never page-derived." The provider has `capabilities`; the grid host has only `payload.scope.patchOwnerId`, which is `null` for an Admin in `mode=admin` (`loadManagePortalData:835`).

**Why it matters.** `pnpm typecheck:workspace` (the real type gate; `next.config.mjs` sets `ignoreBuildErrors`) will reject the snake_case access on `ManageContact`. The grid host cannot implement AD-2 literally without a new server-derived field or a fetch. If it hard-codes `canComment=true`, the Admin-out-of-patch composer bug returns only if the grid is ever used for programme-wide contacts — today it is not, but the spine should say so.

**Fix.** Name the type: compute `canComment` from the `ContactScopeRow` before mapping (`assigned_preacher_id`) or use `assignedPreacherId` on the payload's `ManageContact`. State that the grid host's contacts are all in the patch (`loadContactsSectionData`), so `canEdit=true`/`canComment=true` are safe **by construction**, or add `canComment` to `ManageContact` server-side. Do not leave a client-side patch derivation in `ManageScope`.

### R-08 — AD-5/AD-8's focus contract has no trigger element in the API (Medium, autofix)

**Evidence.** AD-8 says "capture the triggering element" and "restore focus to the trigger." AD-5's API is `openContactRecord({ contactId, sequence? })` — no element. The grid's `RowExpandButton` is pointer-only (`tabIndex={-1}`, `manage-contacts-table.tsx:616`); the keyboard path is the row context menu's "Expand record" (`:720`), whose menu item unmounts when the dialog opens. The phone list and record both listen for `Escape` on `document` (`manage-contact-record.tsx:84-95`, `contact-record-dialog.tsx:434-457`), so the top-layer contract needs a shared stack, not two independent listeners. `AD-5`'s "renders nothing until `openContactRecord` is called" must mean **no overlay**, not `return null`, because the provider is inside `StaffAuthShell` and must render `children`.

**Why it matters.** A builder cannot implement AD-8's focus return from the AD-5 API. On touch, `document.activeElement` is often `body`, so the provider cannot reliably capture the trigger. On the grid's context-menu path, the trigger is gone by the time the record closes. The `Escape` listeners can close two layers at once.

**Fix.** Add `trigger?: HTMLElement` to `openContactRecord` (or have `ContactRecordTrigger` pass a ref), define the grid's fallback (the row or the grid), and say the provider always renders its children and only the overlay is conditional. Use the existing Radix `Dialog` (`components/ui/dialog.tsx`) for the focus trap/inert/scroll lock, or a shared overlay stack; do not keep two document-level handlers.

### R-09 — AD-7's Manage Sessions sequence is the wrong set (Medium, autofix)

**Evidence.** `components/manage/manage-sessions-view.tsx:89-96` renders each session's `attendees` inside that session's card. AD-7 says "Manage Sessions passes the attendee ids present in the payload." The natural reading is all attendee ids in `payload.sessions` or `payload.contacts`, which would make Previous/Next jump across sessions. The correct sequence is the **current session's** attendee ids that are also present in `payload.contacts`.

**Why it matters.** A cross-session sequence is observable wrong behaviour: opening a pill in session A and pressing Next lands in session B's attendee, while the card the operator came from is still behind the overlay.

**Fix.** Say: "Manage Sessions passes the current `session.attendees` ids filtered to `payload.contacts`."

### R-10 — No verification section; the existing e2e hooks and shared-component blast radius are omitted (Medium, autofix)

**Evidence.** `docs/architecture/testing.md:361` lists `components/staff-auth-shell.tsx` as shared (`smoke` + `test:e2e:manage`); `:366-367` lists `lib/authz.ts`, `lib/staff-roles.ts`, `lib/staff-patch.ts`, `lib/patch-scope.ts`, `lib/staff-dto.ts` and `lib/staff-routes.ts` as full `pnpm test:e2e`. The provider mount in `StaffAuthShell` plus `lib/manage/record-handlers.ts` importing `lib/authz` puts this feature in the full e2e blast radius. The phone record spec asserts `data-contact-record`, `aria-label="Contact: <name>"`, nine `data-contact-field` ids and the `Close` button (`manage-contacts-list.spec.ts:78,251,257-268,274,293-310`); the new body/frame must preserve them. The testing policy also requires `pnpm test:e2e:determinism` after specs/fixtures (`AGENTS.md`; `docs/architecture/testing.md`).

**Why it matters.** CI does not run e2e (`AGENTS.md`), so a green CI/typecheck is no evidence. The feature changes a shared shell and two existing e2e contracts; a story that only runs `pnpm test` will report a false green.

**Fix.** Add a short "Verification" section to the spine: `pnpm test:static`, `pnpm test:unit`, `pnpm test:e2e:manage` for the grid host, `pnpm test:e2e:sessions` for the session change, `pnpm test:e2e` before a PR; preserve the e2e hooks; update `matrix-coverage-map.md` S8/S9. Name the existing `force-dynamic` routes and `no-store` fetch convention for the new PII GET.

### R-11 — Version table precision (Low, note)

**Evidence.** `package.json:143` is `"tailwindcss": "^4.1.9"`, not exact `4.1.9`; `:134` is `"@playwright/test": "^1.62.0"`, not `^1.62`. Every version named exists; no version is wrong. The spine's "Repo pins" wording is stronger than the caret ranges.

**Fix.** Write `^4.1.9` and `^1.62.0`, or say "declared as" / "resolves to" for the caret ranges.

## Omitted constraints the spine should carry

1. **`import "server-only"`.** The guardrail detects the marker, not the folder (`scripts/verify-monorepo-guardrails.mjs:543-597`). `lib/contacts/record.ts` and `lib/manage/record-handlers.ts` must carry it; `components/contacts/contact-record-types.ts` must stay client-safe (type-only imports from `components/manage/*`, never `@/lib/supabase/*` or `@/lib/authz`).
2. **`force-dynamic` and `no-store`.** Every existing manage contact GET route sets `export const dynamic = "force-dynamic"` (`apps/folk/app/api/manage/contacts/history/route.ts:3`; `comments/route.ts:8`); the new record GET should too, and the client fetch should use `cache: "no-store"` for PII.
3. **The proxy matcher.** The new route is matched by `/api/manage/:path*` in both apps (`proxy.ts:14`); no matcher change is needed. State that, so a builder does not add a fourth matcher entry.
4. **`loadStaffDisplayNames` is deliberately narrow.** It reads only the ids the scoped rows reference (`lib/supabase/manage.ts:479-490`); `ContactRecordPayload.staffNames` must not become a programme roster.
5. **`KNOWN_SOURCE_VALUES` is local.** It lives in `manage-contacts-table.tsx:250`; a server-side record loader cannot cleanly import it from a client component. Move it to a client-safe shared module or accept a scoped distinct query.
6. **The phone host lacks option props.** `ManageContactList` receives `contacts`, `locations`, `resolvers`, `onCommit`, not `sourceOptions`/`booksReadOptions` (`manage-contact-list.tsx:60-90`); `ManageContactRecord`'s editors default both to `[]` (`manage-contact-field-editor.tsx:109-110`). The shared body's pickers need the table to pass them through.
7. **`ManageContactRecord` is stale about comments.** Its doc comment says "This app has no comment feature" (`manage-contact-record.tsx:30-33`); the desktop dialog has had comments since the premium-grid work. The phone body's comments/history addition should update that comment.
8. **The desktop dialog's accessible name is generic.** `aria-label="Detail view dialog"` (`contact-record-dialog.tsx:495`); the phone uses `Contact: ${contact.name}` (`manage-contact-record.tsx:103`). The phone spec asserts the latter; the new shared frames should use the contact name consistently.
9. **The existing record dialog's "Copy contact URL" writes a fragment nobody reads.** `contact-record-dialog.tsx:550-551`; the spine correctly defers the deep link. Keep it unconsumed or remove it deliberately; do not wire it accidentally.
10. **One runner at a time.** Full e2e is 5–7 min, and every spec shares one seeded database (`AGENTS.md`); the verification plan must not run two e2e runners in parallel.

## Exact corrections to the spine

- AD-1: replace "There is no session-context record endpoint and no contact-id-only read outside the manage boundary. The only HTTP surface is..." with "There is no **new** session-context full-record endpoint; the existing `GET /api/sessions/[sessionId]/attendees/[contactId]` is the sole session-scoped summary reader (AD-9). `GET /api/manage/contacts/[contactId]/record` is the only **full-record** HTTP surface; the existing history/comments GETs remain the grid host's partial reads or are retired."
- AD-1: add "Every read after `assertManageContactInScope` uses `createSupabaseServerClient()` for the contact row; the admin client is only for the narrow reference reads and the existing existence probe."
- AD-2: add "When `canComment` is false, `loadContactRecord` does not call `listManageContactComments`; `comments` is `null` and no comment row is read. `assertCommentContactInScope` is not relaxed. The comments pane is presentational in the provider host and does not fetch."
- AD-2: change `contact.assigned_preacher_id` to the named type: `scopeRow.assigned_preacher_id` or `contact.assignedPreacherId`.
- AD-3: bind `components/manage/manage-contact-list.tsx` and `components/manage/contact-record-dialog.tsx`; say the existing frames are moved or kept as thin frames, not duplicated. Add the body prop type/read-state.
- AD-3: replace "matching the Contacts grid" for campaign assign with the exact gutter order and width, and state the checkbox/selection contract and e2e locators are unchanged.
- AD-5: add `trigger?: HTMLElement` to `openContactRecord`; say the provider always renders `children` and only the overlay is conditional.
- AD-6/AD-9: bind `apps/folk` for the session attendee route; say session-detail, Top-5 and campaign-assign are folk-only, and the record route is mirrored in both apps. Add the `sessions-detail.spec.ts`/matrix S8/S9 impact.
- AD-7: say Manage Sessions passes the current session's attendee ids filtered to `payload.contacts`.
- AD-10: say the record loader must not call `loadContactsSectionData`/`loadManagePortalData`; `sourceOptions` needs `KNOWN_SOURCE_VALUES` moved or a scoped query; `staffNames` stays the narrow referenced-id read.
- Add a "Verification" section: `pnpm test:static`, `pnpm test:unit`, `pnpm test:e2e:manage`, `pnpm test:e2e:sessions`, full `pnpm test:e2e`; preserve the e2e hooks; update the matrix map.
- Reconcile `spec-contacts-premium-grid/SPEC.md` CAP-5 with a supersession pointer or a new `spec-contact-record-access` spec.

## Evidence index

Files read (all paths relative to the worktree root):

- `ARCHITECTURE-SPINE.md`; `.memlog.md`; `architecture-folk_hkmc-2026-11-03/ARCHITECTURE-SPINE.md`.
- `package.json`.
- `lib/staff-roles.ts`; `lib/patch-scope.ts`; `lib/staff-dto.ts`; `lib/authz.ts`; `lib/staff-patch.ts`; `lib/auth-context.tsx`; `lib/supabase/manage.ts`; `lib/supabase/contact-comments.ts`; `lib/sessions/data.ts`; `lib/dialer/assignments.ts`; `lib/dialer/scope.ts`; `lib/contacts/section-server.ts`.
- `components/staff-auth-shell.tsx`; `components/manage/contact-record-dialog.tsx`; `components/manage/manage-contact-record.tsx`; `components/manage/manage-contacts-table.tsx`; `components/manage/manage-contact-list.tsx`; `components/manage/contact-comments-pane.tsx`; `components/manage/manage-types.ts`; `components/manage/manage-contact-fields.ts`; `components/manage/manage-contact-field-editor.tsx`; `components/manage/manage-sessions-view.tsx`; `components/sessions/session-attendees.tsx`; `components/sessions/session-attendee-table.tsx`; `components/sessions/session-attendee-cards.tsx`; `components/sessions/session-top-attendees-card.tsx`; `components/sessions/contact-attendance-card.tsx`; `components/sessions/session-attendee-sort.tsx`; `components/dashboard/focus-section.tsx`; `components/dashboard/candidates-route.tsx`; `components/campaign/assign-contacts-select.tsx`; `components/campaign/assign-contacts-desktop-gate.tsx`; `components/campaign/assign-contacts-types.ts`; `components/contacts/contacts-section-frame.tsx`; `components/contacts/contacts-grid-surface.tsx`; `components/contacts/contacts-types.ts`; `components/grid/grid.tsx`.
- `apps/folk/proxy.ts`; `apps/gita-life/proxy.ts`; `apps/folk/app/api/manage/contacts/route.ts`; `apps/folk/app/api/manage/contacts/history/route.ts`; `apps/folk/app/api/manage/contacts/comments/route.ts`; `apps/folk/app/api/sessions/[sessionId]/attendees/[contactId]/route.ts`; `apps/folk/app/manage/page.tsx`; `apps/gita-life/app/manage/page.tsx`; `apps/folk/app/sessions/page.tsx`; `apps/folk/app/sessions/[sessionId]/page.tsx`; `apps/gita-life/app/sessions/page.tsx`; `apps/folk/app/campaigns/[campaignId]/assign-contacts/page.tsx`; `apps/folk/app/dashboard/page.tsx`; `apps/gita-life/app/dashboard/page.tsx`.
- `supabase/migrations/20261006010000_scoped_rls_policies.sql`; `supabase/migrations/20261101000000_sessions_flow.sql`; `supabase/migrations/20261102020000_sessions_top_attendees.sql`; `supabase/migrations/20261105100000_contact_comments.sql`; `supabase/migrations/20261105110000_contact_comments_admin_patch_scope.sql`; `supabase/migrations/20261102010000_dashboard_rpcs.sql`.
- `e2e/specs/sessions-detail.spec.ts`; `e2e/specs/manage-contacts-list.spec.ts`; `e2e/specs/campaign-assign-select.spec.ts`; `e2e/specs/campaign-assign-write.spec.ts`; `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md`.
- `docs/architecture.md`; `docs/architecture/testing.md`; `docs/data-models.md`; `docs/api-contracts.md`; `_bmad-output/specs/spec-contacts-premium-grid/SPEC.md`; `scripts/verify-monorepo-guardrails.mjs`.

**Not verified by execution:** no unit, e2e or contract gate was run. The e2e failure in R-04 is inferred from the fixtures, the Admin RLS policy and the assertions; it should be confirmed with `pnpm test:e2e:sessions` after the implementation lands. The stack versions are read, not resolved from `pnpm-lock.yaml`.

## Addendum — re-check of the revised spine (2026-11-08)

I re-read the revised `ARCHITECTURE-SPINE.md` (updated 2026-11-08) against the same working tree. The revisions resolve the earlier **AD-1/AD-7 endpoint wording**, **AD-9 `apps/folk` scoping**, **AD-15 session-detail/matrix impact**, **AD-8 comments read-skip**, **AD-9 view state + comments-pane/history self-fetch retirement**, **phone-host naming**, **campaign-gutter widening**, **moved dialog**, **`trigger?` API**, and **`loadContactRecordAvailability`**. The following are the remaining blockers.

### A-1 — The claimed new spec does not exist, and the old spec is not marked superseded (blocker)

- Spine `sources` line 18 names `_bmad-output/specs/spec-contact-record-access/SPEC.md`; the file and directory do not exist (`test -e ...` → MISSING; `ls _bmad-output/specs` has no `spec-contact-record-access`).
- `_bmad-output/specs/spec-contacts-premium-grid/SPEC.md` is **unchanged** (`git diff -- SPEC.md` is empty; only `surface-and-toolbar.md` is modified, and that diff is a grid-tint change). It still says at `:40` "Its record panel is **not** adopted — CAP-5 was withdrawn" and at `:60` "**CAP-5 — WITHDRAWN by Dwaraka, 2026-10-12.** ... no record panel, no per-row open affordance, and no prev/next navigation." There is no supersession pointer.
- The spine's `supersedes:` frontmatter (`SPEC.md#CAP-5`) is a claim in the spine, not a change to the cited spec. The `.memlog.md:21` question is still open. A builder cannot treat a missing source as the feature contract.

### A-2 — AD-11's "renders nothing" can hide the staff shell (blocker)

AD-11 line 114: "mount `ContactRecordProvider` once inside `StaffAuthShell`'s `AuthProvider`. It renders nothing until `openContactRecord` is called." The provider is inside `components/staff-auth-shell.tsx:7-9`, which renders `<AuthProvider>{children}</AuthProvider>`. If "renders nothing" is implemented as `return null` while closed, every staff page disappears. Say: "the provider always renders `children`; only the overlay is conditional."

### A-3 — AD-8's `contact.assigned_preacher_id` is typed against the raw row, not the view state (type blocker)

AD-8 line 77: `capabilities.canComment` is `contactInPatch(contact.assigned_preacher_id, ...)`. The raw `ContactRow` has `assigned_preacher_id` (`lib/supabase/manage.ts:135,175`), but the `ContactRecordViewState.contact` is `ManageContact` (AD-9 line 91), whose field is `assignedPreacherId` (`components/manage/manage-types.ts:76`). The formula is valid only if `contact` is the full-row `ContactRow` read in AD-7; it fails `pnpm typecheck:workspace` if read against the view state or payload. Name the row: `scopeRow.assigned_preacher_id` or `contact.assignedPreacherId`.

### A-4 — The grid host's mirror is not bound to the record's write result (high-impact omission)

AD-9 line 102 says the grid host keeps its own mirror and fetches the same bundle through `useContactRecord`; AD-10 line 108 says "A host merges the write result by spreading it over the previous contact." The grid's existing mirror merge is `applyWrite` (`manage-contacts-table.tsx:983-990`) and its write path is `handleListCommit` (`:1271-1305`); neither is named in AD-10's Binds (line 106). The new body's `onCommit` through `useContactRecord` updates the hook/view state, not the grid mirror, so a record edit can leave the grid row stale after close (and an inline grid edit leaves the hook stale until re-open). Bind the write result to both, or state that the grid host's `onCommit` calls `applyWrite` with the hook's result.

### A-5 — AD-13's Manage Sessions sequence is still the wrong set (residual factual error, not a compile blocker)

AD-13 line 133 says "Manage Sessions passes the attendee ids present in the payload." `manage-sessions-view.tsx:89-96` renders each session's `attendees` inside that session's card. The sequence must be the **current session's** attendee ids filtered to `payload.contacts`; "present in the payload" reads as all attendees across all sessions and would make Previous/Next jump between sessions. Fix the sentence.

### Re-check verdict

The revisions fixed most of the earlier factual and structural problems, but **A-1 is a hard build blocker** (missing source spec / unmarked CAP-5), and **A-2–A-4** would produce a blank shell, a type-gate failure, or a stale grid row. Not ready to build until A-1–A-4 are corrected; A-5 is a correctness fix.

**Final re-check (2026-11-08, post-fix):** the new spec/pointer, AD-11 children, AD-8 row types, AD-9/AD-10 grid mirror, and AD-13 Manage Sessions are fixed; two build/type blockers remain — AD-13's desktop visible-row rule has no `Grid` API/bind, and `CommentActions` is referenced but undefined.

**Final re-check (2026-11-08, last three fixes):** one build/type blocker remains — AD-9 defines `CommentActions` but its signatures are too narrow for the existing comments pane (`create` lacks `rootCommentId` for replies, `react` lacks `active` for the toggle, and `create`/`update` return `Promise<void>` instead of the `ManageContactComment` the pane uses for optimistic reconciliation); expand the type, otherwise the presentational pane cannot preserve its current reply/reaction/edit behavior.

