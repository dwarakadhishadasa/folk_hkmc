# Security and Data-Exposure Review — Cross-surface contact record

- **Artifact under review:** `_bmad-output/planning-artifacts/architecture/architecture-folk_hkmc-2026-11-07/ARCHITECTURE-SPINE.md` (draft, 2026-11-07)
- **Inherited decision:** `architecture-folk_hkmc-2026-11-03/ARCHITECTURE-SPINE.md` AD-5 (RLS grants the patch; a page may narrow, never widen)
- **Lens:** authorization boundary, cross-patch data exposure, capability/UI drift, service-role reads
- **Date:** 2026-11-07
- **Method:** spine read against the live loaders, RLS migrations and client shells in this worktree. The feature is **not implemented yet** (`lib/contacts/record.ts`, `lib/manage/record-handlers.ts`, the record route, `contact-record-provider.tsx`, `contact-record-body.tsx` are all absent), so every finding is a statement about what the spine *permits an implementer to write*, tested against how the existing code actually behaves.

## Verdict

**Ship the boundary, not yet the wording.** The structural decision is right and unusually well aligned with the database: full record is manage-scope only, `canComment` equals the exact predicate of the `contact_comments` policy, `recordAvailable` is server-computed, there is no session-context endpoint, no deep link and no finder. But three of the rules are one sentence away from the holes they intend to close. AD-1 authorises with a disjunction ("`assertManageContactInScope` **or** the equivalent full-row read") and never names the client, so a full-row service-role read can be written as "the equivalent" and becomes an IDOR for any programme contact. AD-2 computes `canComment` but never says the comments read is *skipped*, while the existing comments pane self-fetches and the comment guard 403s for an Admin outside their personal patch — the intended Admin-edits-out-of-patch flow therefore fails unless the one guard that keeps Admins out of other patches' comments is relaxed. And AD-9 keeps the session summary's `notes` field, which is read with the service role and gated only by "attended a session I can see", so the "premium record is manage-scope only" decision is a convenience boundary, not a confidentiality one. None of these is fatal; all are fixable with wording, and the fixes are listed below as exact sentences. The spine should not proceed to build until AD-1, AD-2 and AD-9 are amended.

## Findings

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| SEC-1 | **High** | AD-1's authorizer is a disjunction with no named client; the payload needs columns the assertion does not read. An admin-client full-row read can be written as "the equivalent full-row read". | autofix |
| SEC-2 | **High** | `canComment` gates the field but not the read. Calling `listManageContactComments` unconditionally makes the intended Admin-out-of-patch record 403; the obvious repair is to relax the only guard keeping Admins out of every patch's comments. | autofix |
| SEC-3 | Medium | `recordAvailable` is a render-time hint, not a gate. The spine never names the RLS client for it, never defines the 403 fallback, and AD-6 claims to prevent "a trigger that 403s" — which a snapshot cannot. | autofix |
| SEC-4 | Medium | The out-of-patch session summary still renders `notes` (and `favorite`, `collected_by`) from a service-role read. AD-9 preserves it, so "full record = manage-scope only" is not a confidentiality boundary for the one field that matters. | discuss |
| SEC-5 | Medium | `staffNames`, `sourceOptions`, `booksReadOptions`, `locations` are named in the payload with no scope rule. `staffNames` in particular regresses an existing, deliberately narrow read. | autofix |
| SEC-6 | Low | `canEdit` is a constant, not a capability; and the shared body has no server-derived capability source on `/contacts`. | autofix |
| SEC-7 | Low | Hardening: 403/404 existence oracle, malformed UUID returns 500, no `no-store` on a PII GET, `commentCount` without a pane, Manage Sessions trigger set varies with Admin `mode`. | autofix / defer |

---

## SEC-1 — AD-1 authorises with a disjunction and names no client (High, autofix)

**Spine text (AD-1, line 63):**

> It runs behind `getStaffContext()`, `requireRole(staff, MANAGE_CONTACT_WRITE_ROLES)`, and the contact RLS boundary (`assertManageContactInScope` **or the equivalent full-row read**).

**Why this is a hole.** Two different things are named as one boundary:

- `assertManageContactInScope` is itself two layers: an RLS-scoped read of four columns (`id, program_id, assigned_preacher_id, photo_path` — `lib/supabase/manage.ts:998`), then, only when that read is empty, a **service-role existence probe** used purely to distinguish 403 from 404 (`lib/supabase/manage.ts:1011-1027`). The probe never returns a row to the caller.
- "The equivalent full-row read" is undefined. The record payload needs columns the assertion does not select — `age`, `designation`, `year`, `address`, `notes`, `books_read`, `rounds`, `is_favorite`, plus rollups, history and comments. An implementer reading the spine can reasonably write `createSupabaseAdminClient().from("contacts").select("*").eq("id", contactId)` and call that "the equivalent full-row read". The RLS-scoped client is what makes it a boundary; the admin client is what makes it an IDOR that returns any contact in any programme to a Preacher who guesses a UUID.

The repo already has the correct pattern, one function away: `loadManageContactHistory` asserts first, then reads (`lib/supabase/manage.ts:1621-1626`). The spine should make that pattern mandatory rather than offering a synonym.

**Craft path.** `GET /api/manage/contacts/<uuid-of-another-patch>/record` as a Preacher → `requireRole` passes (Preacher is in `MANAGE_CONTACT_WRITE_ROLES`), and the only remaining control is whichever read the author chose.

**Fix (exact wording):**

> `loadContactRecord` calls `assertManageContactInScope(staff, contactId)` **unconditionally and first**, and treats its return as the authorization decision. Every subsequent read of that contact — the full row, rollups, history, comments — may use either Supabase client **only after** that call returns. No service-role read of `contacts` may precede it, and no function may be described as "the equivalent" of it. The route rejects a non-UUID `contactId` with 400 before the assertion.

Add the same sentence to the Consistency | Authorization row (line 133), which currently says only "the contact RLS boundary".

---

## SEC-2 — `canComment` gates the field, not the read; the pane is a second authority (High, autofix)

**Spine text (AD-2, line 69):**

> `capabilities.canComment` is `contactInPatch(contact.assigned_preacher_id, staff.patchOwner?.userId ?? null)`. `comments` is non-null only when `canComment`; otherwise the pane is absent or shows the reason. An Admin may edit a programme contact outside their patch but cannot comment on it; that split is explicit, not an error.

**Three separate problems.**

1. **The read is not gated.** `listManageContactComments` calls `assertCommentContactInScope`, which is `assertManageContactInScope` **plus** `contactInPatch`, and throws 403 for an Admin on an out-of-patch contact (`lib/supabase/contact-comments.ts:66-79`). AD-1 and AD-10 tell the loader to read "its comments when allowed" but never say the call is *skipped* when `canComment` is false. If the loader calls it unconditionally — the natural reading of "the payload has `comments`" — then **the record GET fails 403 for exactly the Admin case the spine declares intended**. That failure will land in review as a bug, and the shortest repair is to relax `assertCommentContactInScope` so an Admin can read comments anywhere in the programme. That is the precise hole `supabase/migrations/20261105110000_contact_comments_admin_patch_scope.sql` exists to close ("a comment is not a contact … or an Admin could read every patch's notes via a direct table read"). The spine must forbid that repair in writing.

2. **The existing pane fetches for itself.** `ContactRecordDialog` always renders `<ContactCommentsPane contactId contactName>` (`components/manage/contact-record-dialog.tsx:678-680`), and the pane fetches `/api/manage/contacts/comments?contactId=…` on mount (`components/manage/contact-comments-pane.tsx:264`). So `comments: null` in the payload does not stop the pane; only a render condition does. If AD-3's shared body keeps the pane as-is, the Admin-out-of-patch record renders a pane that immediately 403s and displays "That record is outside your patch." — not "absent or shows the reason" as designed, but a second authorization decision the client did not ask for.

3. **Two sources of truth for the same read.** Provider-hosted records would get comments from the payload; grid-hosted records get them from the pane's fetch. That is exactly the drift AD-1 exists to prevent.

**Fix (exact wording):**

> When `canComment` is false, `loadContactRecord` **does not call** `listManageContactComments`; `comments` is `null` and no comment row is read. `assertCommentContactInScope` is not relaxed: an Admin's access to comments stays the personal patch, not the programme. `ContactCommentsPane` renders only when `canComment` is true, and when rendered it takes its comments from the payload in the provider host; the grid host may keep its own fetch, which is already patch-gated. In neither host does the pane fetch when `canComment` is false.

Also add `commentCount` to the same rule: `ManageContact` carries a comment count from a service-role read (`loadCommentCounts`, `lib/supabase/manage.ts:416-442`). It is already exposed to an Admin programme-wide by the grid, so it is not a new disclosure — but render it only where the pane can open, or set it to `null` when `canComment` is false. Do not leave a count with no way to read the comments.

---

## SEC-3 — `recordAvailable` is a hint; name the client and define the 403 fallback (Medium, autofix)

**Spine text (AD-6, line 94; AD-7, line 106; Consistency, line 131):**

> `SessionAttendee.recordAvailable` is computed by intersecting the attendee ids with an RLS-scoped `select id from contacts` read. … `recordAvailable` is a boolean computed by RLS, never by a client heuristic.

**The client is the whole property.** `lib/sessions/data.ts` reads every session RPC through `createSupabaseAdminClient()` (lines 192, 203, 230, 273, 307, 324, 355, 410). The new contact-id read must **not** follow that pattern. `createSupabaseServerClient()` carries the caller's JWT and is the only thing that makes the Admin/Preacher/Assistant branches of the contacts policy apply (`supabase/migrations/20261006010000_scoped_rls_policies.sql:173-182`). If it is written with the admin client, `recordAvailable` is `true` for every attendee of every session and every trigger opens a record that 403s. No data leaks — the endpoint still refuses — but the feature becomes a wall of errors, and the pressure will be to "fix" the endpoint. Name the client in AD-6:

> The intersection read uses `createSupabaseServerClient()`; a service-role client would mark every attendee available and is forbidden for this computation.

**`recordAvailable` is a snapshot, not a gate.** It is computed at page render. Between render and click, a contact can be reassigned, an Assistant's supervisor can change, or a Preacher can be demoted. `AuthProvider` never refreshes when `initialStaff` is present (`lib/auth-context.tsx:103-117`: `if (initialStaff) { setStaff(initialStaff); return }`), and a `StaffAuthShell` mounted in a layout (e.g. `apps/folk/app/sessions/layout.tsx`) keeps its staff object for the lifetime of the client session. So `canReadContacts` can be stale-true and `recordAvailable` can be stale-true. That is acceptable **only if** the UI has a defined behaviour for the 403:

> A 403 from the record endpoint renders the "no longer in your scope" state, never an empty record and never a retry. In session detail, a 403 falls back to the existing summary. AD-6's guarantee is "no trigger is rendered for a contact that was out of scope at render time"; a 403 after a stale render is handled, not prevented.

Then soften AD-6's `Prevents` entry "a trigger that 403s" to "a trigger rendered for a contact that RLS already excludes at render time".

---

## SEC-4 — The summary still carries `notes`; AD-9 preserves it (Medium, discuss)

**What the fallback actually returns.** `contact_attendance_summary` is a `SECURITY INVOKER` function called with the **admin client** (`lib/sessions/data.ts:351-360`), so RLS on `contacts` does not apply. Its JSON includes `name`, `phone`, `notes`, `location_names`, `preacher_name`, `first_contact`, `last_contacted`, `collected_by_name`, `favorite`, attendance counts and the full attended-session history (`supabase/migrations/20261101000000_sessions_flow.sql:588-631`). The record component renders `notes` verbatim (`components/sessions/contact-attendance-card.tsx:44`).

The route is correctly gated: it requires the contact to be an attendee of a session the caller can see (`apps/folk/app/api/sessions/[sessionId]/attendees/[contactId]/route.ts:31-37`). But `contact_attendance_summary` itself checks only that the contact exists in the programme (`sessions_flow.sql:553-560`). Its session-membership guarantee lives entirely in that one caller.

**Consequence for the product decision.** "The premium full record is manage-scope only" is true of *fields* (address, college, company, designation, year, age, books read, rounds, comments, history) and false of *confidentiality*: `notes` — the one free-text field staff write about a person — remains readable for any attendee of a visible session. The feature therefore does not narrow what an out-of-patch Preacher can learn about a person they met once; it only withholds form fields and comments. That may be the right product call (the person was physically present at your session, and the summary is the fallback the decision explicitly keeps), but the spine should not use "premium" language that implies otherwise.

**Recommendation (choose one, in the spine):**

- **Narrow now.** Remove `notes` (and arguably `favorite` / `collected_by_name`) from `contact_attendance_summary`'s JSON and from `ContactAttendanceCard`. It is a two-file change, it does not touch the new feature's code, and it makes the product decision true. This is the only option that makes AD-9's "pre-existing wider read" stop being a `notes` leak.
- **Defer with an owner and a date.** If narrowing is out of scope, say so explicitly: "the summary is a convenience fallback, not a confidentiality boundary; `notes` remains cross-patch readable in session context until <owner> narrows it." Do not leave the deferral as an undated bullet.

Either way, bind the function, not just the route:

> `getContactAttendanceSummary` is not a contact reader. Its SQL checks programme membership only; every caller must first prove the contact is an attendee of a visible session. It must never be called by the record path.

That last sentence matters because the function is exported from `lib/sessions/data.ts` and a future route that passes a bare `contactId` would be a programme-wide `notes` reader with no visible sign of the mistake.

---

## SEC-5 — Reference data is named but not scoped (Medium, autofix)

AD-1 lists `locations`, `locationOptions`, `staffNames`, `booksReadOptions`, `sourceOptions` in the payload. AD-10 says only:

> `booksReadOptions` and `sourceOptions` are known values or a scoped distinct query, never the full contact set.

That leaves `staffNames` and `locations` unruled, and "a scoped distinct query" does not say *which client*.

**`staffNames` is the sharp one.** `loadStaffDisplayNames` deliberately narrows to the ids the already-scoped rows reference, with the reason stated in the code: reading the whole programme through the service role "would hand a Preacher every other role's name in the program" (`lib/supabase/manage.ts:479-490`). `ContactRecordPayload.staffNames` has no such rule, and the natural reason to put `staffNames` in a *record* payload is a picker — which invites the programme roster. That is a regression of an existing, explicit decision.

**`sourceOptions` / `booksReadOptions` are safe today only because they are derived from the scoped set.** `sourceOptions` = `KNOWN_SOURCE_VALUES` (two preview fixtures) plus the values in the scoped rows (`components/manage/manage-contacts-table.tsx:969-981`); `booksReadOptions` = a distinct over the scoped contacts (`lib/supabase/manage.ts:826-828`). A programme-wide distinct through the admin client would leak free-text source names (event names, other preachers' campaigns). A distinct through the RLS client is safe but is still "every contact the caller can read", which AD-10 separately forbids.

**`locations` vs `locationOptions`.** `loadContactsSectionData` reads the programme location set with the admin client on purpose — it is a naming set, so a contact at a location outside the reader's patch still resolves (`lib/supabase/manage.ts:898-916`). `locationOptions` is narrowed to `owner.locationIds` (`:964-966`), and writes are validated through `assertProgramLocations`, which reads locations through the RLS client (`:1115-1147`). That split is correct and should be preserved, not reinvented.

**Fix (exact wording):**

> `staffNames` contains only the ids the record references (`assigned_preacher_id`, `collected_by_id`) plus the caller, read through the existing `loadStaffDisplayNames` narrowing. `booksReadOptions` and `sourceOptions` are the record's own values plus the known constants, or a `distinct` through the RLS client — never a service-role read of every contact. `locations` is the programme naming set and may stay programme-wide; `locationOptions` is `owner.locationIds` and every write still passes `assertProgramLocations`.

---

## SEC-6 — `canEdit` is a constant; the shared body has no capability source on `/contacts` (Low, autofix)

AD-2 says:

> `capabilities.canEdit` is true only when the write boundary passes (the manage endpoint already guarantees it).

On a record the endpoint returned, the write boundary **has** passed — by AD-1's own assertion. So `canEdit` is `true` for every record that exists, and its only information content is "the load succeeded". That is fine, but state it, because the failure mode is an implementer "playing safe" with `canEdit = canComment` — which would break the explicit decision that an Admin may edit a programme contact outside their personal patch.

> `canEdit` is `true` for every record the endpoint returns; it is not a re-derivation of the patch. `canComment` is the only field whose value can differ from `true`.

**Second half: the grid host has no capabilities.** AD-3 shares `ContactRecordBody` with the Contacts grid, and AD-2 says capabilities are "never page-derived". But `ContactsSectionPayload` (`components/contacts/contacts-types.ts:17`) has no `capabilities` field, and `/contacts` does not mount `StaffAuthShell` (`apps/folk/app/contacts/page.tsx` uses `ContactsSectionFrame` with a `staff` prop). So the `/contacts` host can only hardcode `{canEdit: true, canComment: true}`. That happens to be *correct* — `loadContactsSectionData` filters to `assigned_preacher_id = owner` (`lib/supabase/manage.ts:919-921`), so every row is in patch — but it is client-side inference, which AD-2 forbids. Either add `capabilities` to the section payload (server-derived, always `true/true` there) or carve the grid host out in one sentence. Do not leave the contradiction.

---

## SEC-7 — Hardening and consistency (Low)

1. **403 vs 404 existence oracle.** `assertManageContactInScope` returns 403 for "in this programme but not yours" and 404 for "not in this programme" (`lib/supabase/manage.ts:1011-1027`). The new GET inherits it. A Preacher can therefore confirm that a UUID exists in the programme — and the manage payload already hands a Preacher the real UUIDs of out-of-patch attendees (labelled "Not in scope", `lib/supabase/manage.ts:708-715`). No record is returned, so this is an oracle, not a read. Accept it for consistency with PATCH/DELETE/comments, or make the GET return 404 for both; do not invent a third shape.

2. **Malformed id.** `assertManageContactInScope` passes `contactId` straight into `.eq("id", …)` on a UUID column; a non-UUID produces a PostgREST error and a 500 "manage_contact_read_failed". The history handler validates first and returns 400 (`lib/manage/contact-history-handlers.ts:25-27`). The record route should do the same.

3. **Cache headers on a PII GET.** The record response carries phone, notes and address. Declare `export const dynamic = "force-dynamic"` as the sibling routes do (`apps/folk/app/api/manage/contacts/route.ts:7`) and return `Cache-Control: private, no-store`. The route is already dynamic in practice (it reads cookies), but a shared cache must not be given the option.

4. **Manage Sessions trigger set varies with Admin `mode`.** AD-6 keys the pill trigger on "the attendee id is present in `payload.contacts`". For an Admin in `mode=admin`, `payload.contacts` is the whole programme, so every pill triggers. For the same Admin in `mode=preacher`, `payload.contacts` is their personal patch, so an attendee outside it renders "Not in scope" with no trigger **even though the record endpoint would allow the read**. That is narrower than the endpoint, so it is safe; it is also an inconsistency a reviewer will flag. Either accept it in one sentence or key the trigger on the Admin's programme scope. Do not "fix" it by widening `payload.contacts` in preacher mode.

5. **`commentCount` without a pane.** See SEC-2.

---

## Question-by-question answers

**Q1. Can a crafted request reach the full record for an out-of-patch contact through the new endpoint, a query parameter, a client-side capability, or the session summary path?**

- **New endpoint — no, if AD-1 means what it should.** The role gate admits Admin/Preacher/Assistant, and `assertManageContactInScope` then applies contact RLS. But see SEC-1: the "or the equivalent full-row read" clause is one edit away from an admin-client IDOR.
- **Query parameter — no.** The record is a path segment; there is no `?contact=` (AD-6, Deferred). The only other contact reader is `?contactId=` on `/api/manage/contacts/history`, and `loadManageContactHistory` asserts scope first (`lib/supabase/manage.ts:1621-1626`). For a Preacher that is a 403; for an Admin it is programme-wide **by design**.
- **Client-side capability — no.** `canEdit`/`canComment` only decide what renders. Every write re-runs `assertManageContactInScope` (`lib/supabase/manage.ts:1297-1305`), and every comment call re-runs `assertCommentContactInScope`. A forged `canEdit` produces an editor whose PATCH is refused; it cannot widen a read.
- **Session summary path — yes, a partial record, and it is the only real cross-patch read.** For any attendee of a visible session: `name`, `phone`, `notes`, `favorite`, `location_names`, `preacher_name`, `collected_by_name`, and the full attended-session history. It does not include address, college, company, designation, year, age, books read, rounds, comments or campaign history. It is pre-existing and AD-9 preserves it (SEC-4).

**Q2. Is `recordAvailable` a trustworthy server-side gate or a UI hint? Does the endpoint independently enforce scope?**

A **server-computed hint**, not a gate. It is a boolean on a row, computed at render, and it can go stale (SEC-3). The gate is the endpoint's `getStaffContext` + `requireRole` + `assertManageContactInScope`; the spine states that, and it is correct — provided SEC-1 is fixed and the intersection read uses the RLS client.

**Q3. Is the Admin branch of `assertManageContactInScope` programme-wide? Is editing an Admin-owned programme contact outside their patch intended?**

Yes — programme-wide, because it is an RLS read and the contacts policy's Admin branch is `caller_role() = 'Admin'` with no personal term (`20261006010000_scoped_rls_policies.sql:173-182`; unchanged by `20261103000000_admin_supervised_assistants.sql`). That matches parent AD-4: `/manage` for an Admin is `mode=admin` (programme) or `mode=preacher` (self), and "an Admin's programme scope stays the programme". So an Admin editing a programme contact outside their **personal** patch is intended. Two clarifications for the spine:

- AD-2's phrase "a programme contact outside their patch" is ambiguous: it means outside the Admin's *personal* patch, inside their *programme* manage scope. Say it that way.
- A **Preacher** editing a contact assigned to an Admin or another Preacher is refused by RLS. That is correct and should stay.

**Q4. Does the spine's canEdit/canComment split leak comments?**

Not if the read is skipped when `canComment` is false. As written, the loader may call `listManageContactComments` and get a 403, or the pane may self-fetch and get a 403. Neither leaks a comment body; both break the intended Admin case and invite the wrong fix (SEC-2). The split itself is exactly right and matches the database: `canComment` = `contactInPatch` = the `contact_comments` policy's Admin/Preacher/Assistant branches (`20261105110000_contact_comments_admin_patch_scope.sql:24-45`). Keep it.

**Q5. Does the payload's `comments` field or the comments pane allow reading comments for a contact outside the patch? Does `listManageContactComments` re-assert?**

`listManageContactComments` re-asserts: `assertManageContactInScope` + `contactInPatch`, 403 otherwise (`lib/supabase/contact-comments.ts:66-79, 189-194`). So the server refuses. The pane is a **second authority** that fetches independently (`contact-comments-pane.tsx:264`), so `comments: null` in the payload does not gate it; only a render condition does. Gate the pane on `canComment` (SEC-2).

**Q6. Do `booksReadOptions` / `sourceOptions` / `staffNames` / locations leak rows outside the caller's scope?**

Today, no — they are derived from the already-scoped payload. The spine does not preserve that property in words. `staffNames` is the regression risk; `sourceOptions`/`booksReadOptions` need a client named; `locations` is deliberately programme-wide and `locationOptions` is patch-narrowed (SEC-5).

**Q7. Does the frame/provider render anything from the record before authorization completes?**

No — provided AD-5's signature is kept: `openContactRecord({ contactId, sequence? })` carries no seed row, so the frame has no page-supplied name, phone or notes to paint while the fetch is in flight. Two conditions: (a) do not add a `seed`/`initialContact` prop to the provider or the frames — that would render data from the *list's* payload, which for session detail is the summary's wider read; (b) the loading state must be neutral (a skeleton or "Loading contact…"), and the dialog's accessible name must not include a contact name until the payload arrives. The existing grid dialog can use `contact.name` because its payload is scoped; the provider cannot.

**Q8. Is the existing session summary's wider read correctly treated as pre-existing and not extended? Is that acceptable, or should the spine force a narrowing?**

Correctly treated as pre-existing and not extended — the feature adds no field to it and never routes through it. "Acceptable" depends on what the decision is claiming. As a **scope** decision ("the full record is manage-scope only"), yes. As a **confidentiality** decision ("out-of-patch staff cannot read another patch's notes"), no: `notes` is in the summary (SEC-4). Force the `notes` narrowing, or restate the decision as convenience rather than confidentiality and give the deferral an owner. Also bind `getContactAttendanceSummary` as "not a contact reader" so a future caller cannot skip the attendee check.

**Q9. Does the campaign assign trigger only appear for contacts in campaign/contact scope? Could an Admin campaign scope include contacts they can't manage? Could a Preacher/Assistant campaign scope include out-of-patch contacts?**

**Verified safe.** Campaign scope is `{kind:"program"}` for an Admin and `{kind:"preacher", userId: owner}` for a Preacher/Assistant (`lib/patch-scope.ts:64-74`). The assign screen's contact read filters `assigned_preacher_id = scope.userId` for the preacher kind and applies no contact filter for the programme kind (`lib/dialer/assignments.ts:349-368`). The record endpoint's scope is the contacts policy: programme for Admin, `assigned_preacher_id = auth.uid()` for Preacher, `= caller_assigned_preacher_id()` for Assistant. **The two sets are identical in every role.** An Admin campaign row is a programme contact, which the Admin may edit; a Preacher/Assistant campaign row is a patch contact. No Admin/Preacher/Assistant campaign-scope contact is outside manage scope. ✓

**Q10. Does the Manage Sessions view trigger use the payload's contact set, and can an attendee outside that set still be clicked?**

Today the pill is a non-interactive `<span>` (`components/manage/manage-sessions-view.tsx:89-96`), so nothing is clickable. The spine's rule — trigger only when the attendee id is present in `payload.contacts` — is implementable and safe, because `payload.contacts` is the same `contactInPatch`-filtered set (`lib/supabase/manage.ts:646-650`). Two traps: key the check on `attendee.contactId` (the real UUID is present even for a "Not in scope" attendee), never on the displayed name or the label; and accept that an Admin's trigger set changes with `mode` (SEC-7.4). Out-of-scope attendees already render "Not in scope" and would have no trigger.

**Q11. Does the provider's `canReadContacts` gate handle an Assistant without a patch, a Volunteer, and a stale auth context?**

- **Assistant without a patch:** `canReadContacts = isOperational && (role !== "Assistant" || hasPatchScope)` → `false` (`lib/staff-dto.ts:39`). Also `patchOwner = null` (`lib/staff-patch.ts:59-65`), and RLS `caller_assigned_preacher_id()` is null, so the endpoint would return nothing even if a trigger were forced. ✓
- **Volunteer:** `isOperational` is false → `false`. `requireRole` also refuses at the endpoint. ✓
- **Stale auth context:** the gate can be stale-true. `AuthProvider` does not refresh when `initialStaff` is present (`lib/auth-context.tsx:103-117`), and a layout-mounted shell keeps that object for the client session. The endpoint is fresh (`getStaffContext()` per request), so a demoted user gets 403 — but the UI must handle it (SEC-3). The *dangerous* variant would be mounting the provider in the root `Providers` `AuthProvider`, where `staff` is `null` on every protected path (`isProtectedStaffPath`, `auth-context.tsx:78-85, 110-114`) and client-fetched only on `/campaigns`; do not move the mount there.

---

## What the spine gets right — do not change

- **No session-context full-record endpoint, no global finder, no URL deep link.** These are the three ways this feature could have become a general contact reader, and all three are closed explicitly.
- **One mutation channel.** `PATCH /api/manage/contacts` already asserts scope (`lib/supabase/manage.ts:1297-1305`), and the provider reusing it means a forged `canEdit` cannot write.
- **The capability split matches the database exactly.** `canComment = contactInPatch` is the same predicate as the `contact_comments` policy; `canEdit` is the same assertion as the write path. This is the strongest part of the spine.
- **`recordAvailable` is server-computed, and `false` keeps the existing summary.** No dead button, no failed request in the normal case.
- **AD-9 does not extend the summary** and does not route the premium record through it.
- **AD-7 forbids the provider inventing a global sequence.** Every cheat path to a contact-id-only reader is closed.
- **AD-10 forbids a hidden programme-wide read** — it just needs the specifics in SEC-5 to be enforceable.

## Residual risk register

| ID | Risk | Status | Owner / action |
| --- | --- | --- | --- |
| R-1 | `notes`, `favorite`, `collected_by` readable cross-patch via the session summary for any attendee of a visible session. | Accepted by AD-9 | Decide: narrow `notes` now, or record the deferral with an owner and a date. |
| R-2 | 403/404 existence oracle on a guessed contact UUID. | Accepted | Consistent with PATCH/DELETE/comments; no record is returned. |
| R-3 | Admin sees a comment count for a contact whose comments they cannot read. | Accepted | Already exposed by the grid's comment-count column; render only with the pane, or leave. |
| R-4 | Stale `canReadContacts` / `recordAvailable` for the lifetime of a browser session. | Accepted | Endpoint is fresh; the UI must render the 403 fallback. |
| R-5 | Programme-wide `staffNames` if SEC-5 is not fixed. | Open | Fix wording; regression of `loadStaffDisplayNames`. |
| R-6 | No explicit `no-store` on a PII GET. | Open | Add the header / `force-dynamic`. |

## Minimal spine edits (proposed, not applied)

1. **AD-1:** replace "`assertManageContactInScope` or the equivalent full-row read" with the unconditional-first rule from SEC-1; add the UUID-validation sentence.
2. **AD-2:** add "when `canComment` is false the loader does not call `listManageContactComments`; `assertCommentContactInScope` is not relaxed; the pane renders and fetches only when `canComment` is true." Add "`canEdit` is `true` on every returned record."
3. **AD-5:** add "a gate failure is a 403 state, not an empty record; `openContactRecord` never takes seed data."
4. **AD-6:** name `createSupabaseServerClient()` for the `recordAvailable` intersection; soften "a trigger that 403s" to the render-time guarantee; define the 403 fallback.
5. **AD-9:** add "`getContactAttendanceSummary` is not a contact reader; callers must prove attendance first." Decide `notes`.
6. **AD-10:** add the `staffNames` / `sourceOptions` / `booksReadOptions` / `locations` scoping rules from SEC-5.
7. **Consistency | Data & formats / Authorization:** state that `capabilities` is server-derived **and** that `recordAvailable` is a render-time hint whose authority is the endpoint.
8. **Consistency | Data & formats:** add `Cache-Control: private, no-store` for the record response.

## Test obligations

1. Preacher `GET /record` for a contact assigned to another Preacher → 403, the project's `{ error }` envelope, no contact fields in the body. Fixture must include an attendance row in the Preacher's own session so the *summary* path remains reachable and is exercised separately.
2. Admin `GET /record` for a programme contact outside their personal patch → 200, `canEdit: true`, `canComment: false`, `comments: null`, and the body contains no comment text.
3. Assistant with a patch → 200 on the supervisor's contact, `canEdit: true`, `canComment: true`.
4. Assistant with `assigned_preacher_id` null → 403/404 with no payload; `toClientStaff().canReadContacts === false`.
5. Volunteer → 403 at the endpoint; no trigger rendered on any surface.
6. `recordAvailable`: out-of-patch attendee of a caller-visible session → `false`; in-patch attendee → `true`; assert the computation used the RLS client (a unit test that mocks both clients and fails if the admin client is used for this read).
7. `recordAvailable` for an Admin is `true` for every attendee; for an Assistant it follows the supervisor's patch.
8. `sequence` containing a foreign id: chevron open → 403 → provider shows the out-of-scope state and does not blank the frame.
9. After an Admin opens an out-of-patch record, `GET /api/manage/contacts/comments?contactId=…` still returns 403 (guard not relaxed).
10. `/contacts` grid host renders `ContactRecordBody` with server-derived capabilities and does not call `useAuth()` (the root `AuthProvider` has `staff: null` on protected paths).
11. Record route returns `Cache-Control: private, no-store` and `dynamic = "force-dynamic"`.
12. Malformed `contactId` → 400, not 500.
13. `lib/contacts/record.ts` imports `server-only`; the client payload type lives in `components/contacts/contact-record-types.ts` with no server-only import graph (guardrail-style test).

## Coverage and limits

- Reviewed the spine, both parent spines' AD-5/AD-4, `lib/supabase/manage.ts`, `lib/supabase/contact-comments.ts`, `lib/patch-scope.ts`, `lib/staff-roles.ts`, `lib/staff-dto.ts`, `lib/staff-patch.ts`, `lib/authz.ts`, `lib/auth-context.tsx`, `lib/sessions/data.ts`, the session attendee route, the contact-comments route/handlers, the contacts RLS migration and the three migrations that amend it, the sessions-flow and top-attendees functions, the dashboard focus/candidates SQL, the campaign scope and assignable-contact reads, the manage sessions view, the campaign assign grid, the comments pane and the existing record dialog.
- Not reviewed: the `apps/gita-life` mirrors line by line (the shared `lib/` and `components/` code is the same; the route files delegate), the `/attendance` public POST, and the invite path (out of this feature's blast radius).
- No live database was queried; RLS conclusions are read from the migration SQL in order (`20261006010000` → `20261007120000` → `20261101000000` → `20261103000000` → `20261103010000` → `20261105110000` → `20261105120000`).
- The feature has no implementation, so none of these findings has been demonstrated with a running request. They are review findings on the contract, ranked by what the contract would let an implementer write.

---

## Addendum — re-check of the revised spine (2026-11-08)

**Scope:** revised `ARCHITECTURE-SPINE.md` (`updated: 2026-11-08`) re-read in full against `lib/supabase/server.ts`, `lib/supabase/admin.ts`, the contacts RLS migration and the same loaders. Only critical/high security or data-exposure blockers are reported.

**Result: no blockers.**

### Prior findings — closed

| Prior | Severity | Status | Evidence in the revised spine |
| --- | --- | --- | --- |
| SEC-1 | High | **Closed** | AD-7: the full row is read with `createSupabaseServerClient()` (RLS), not the admin client; the service-role probe may run only after an empty RLS read, to distinguish 403/404. `createSupabaseServerClient` is anon-key + session cookies (`lib/supabase/server.ts:7-23`), so the contacts policy is the authorizer. |
| SEC-2 | High | **Closed** | AD-8: the loader calls `listManageContactComments` only when `canComment` is true, skips it otherwise, sets `comments: null`, and forbids relaxing `assertCommentContactInScope`. AD-9 makes the pane presentational ("never reads on mount"), so `comments: null` now actually gates it. |
| SEC-3 | Medium | **Closed** | AD-12 names `loadContactRecordAvailability` with the RLS client, defines the post-render 403 state ("outside your contact scope", no silent summary fallback), and makes the Manage Sessions gate the server-scoped `payload.contacts` set. AD-16 repeats the RLS client. |
| SEC-4 | Medium | **Closed as a recorded accepted risk** | AD-15 records `notes`, favourite, location and assigned preacher in the summary, names Dwaraka as owner (2026-11-07), and states this feature neither extends nor fixes it; the Deferred list matches. |
| SEC-5 | Medium | **Closed** | AD-7 payload: `staffNames` narrowed to referenced ids; `locations` the programme naming set; `locationOptions` the patch set; `sourceOptions` the record's own source plus constants; `booksReadOptions` the record's own books plus a scoped distinct through the RLS client. AD-16 repeats "never the full contact set". |
| SEC-7.3 | Low | **Closed** | AD-7: the GET is `force-dynamic`, `Cache-Control: no-store`; Consistency confirms "The record GET is `no-store`". |

### Verification notes (no action)

- The two remaining Low items are unchanged and remain non-blocking: the 403/404 existence oracle (post-RLS, `id`-only, `program_id`-filtered probe — confirms existence, returns no row) and `commentCount` metadata for an Admin's out-of-patch contact (already exposed programme-wide by the grid's comment-count column).
- Re-verified that the row sets still match contact scope: campaign assign filters `assigned_preacher_id = scope.userId` for the preacher kind and programme for the Admin kind (`lib/dialer/assignments.ts:349-368`), and `dashboard_focus_rows` filters `assigned_preacher_id = p_scope_preacher_id` unless `p_program_scope` (`20261102010000_dashboard_rpcs.sql:121-133`). Both equal the record endpoint's scope for every role.
- Re-verified that the Contacts RLS policy is still `Admin` programme-wide, `Preacher` self, `Assistant` via `caller_assigned_preacher_id()` (role-checked by `20261103000000`), and that `createSupabaseServerClient()` genuinely carries the caller's JWT.
- Retiring the `GET /history` and `GET /comments` routes in AD-9 removes no scoped read: both were patch-gated (`loadManageContactHistory` → `assertManageContactInScope`; `listManageContactComments` → `assertCommentContactInScope`), and the bundle that replaces them is gated by the same RLS row read plus the conditional comments call. The record endpoint re-checks every open, so the render-time `recordAvailable` hint cannot widen anything.
- AD-15's in-scope session attendees switching from the summary to the premium record adds no exposure: an Admin's contact RLS is programme-wide, and a Preacher/Assistant only opens contacts in their patch. Out-of-patch attendees keep the summary.

### Residual

- AD-15's accepted exception is the only cross-patch read in the feature's blast radius. It is unchanged, owned and out of scope; the feature introduces no new one.
- The build-time test obligations from the first review still apply. The load-bearing ones are: the availability helper never uses the admin client; the comments guard is not relaxed; an Admin's out-of-patch record carries `comments: null` and no comment text; and an Assistant without a patch or a Volunteer gets 403 with no payload.
