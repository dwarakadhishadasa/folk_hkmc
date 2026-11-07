# Review — Cross-surface contact record (architecture spine)

**Reviewed:** `_bmad-output/planning-artifacts/architecture/architecture-folk_hkmc-2026-11-07/ARCHITECTURE-SPINE.md`
**Against:** parent spine `architecture-folk_hkmc-2026-11-03/ARCHITECTURE-SPINE.md`, `spec-contacts-premium-grid/SPEC.md`, and the brownfield code paths named in the brief.
**Lens:** good-spine checklist (divergence points, enforceability, Deferred, tech, brownfield ratification, spec coverage, parent conflicts, dimensions).
**Mode:** read-only. No files were edited except this review. No tests were run; every claim below is from source inspection, with file:line evidence.

---

## Verdict

The spine is directionally right and unusually honest about the hard part: it ratifies the shipped authorization model almost exactly (`MANAGE_CONTACT_WRITE_ROLES`, `assertManageContactInScope`, `contactInPatch`, `CONTACT_COMMENT_ROLES`, `ClientStaff.canReadContacts` all match the code), it refuses the tempting global contact reader, and it names the session summary's wider read instead of hiding it. But it is not yet a build substrate. Five things a story-level builder would have to guess or could implement two ways are left open: the new AD ids collide with five inherited AD ids; the "one record read" does not bind the two existing self-fetching sub-resources (the history endpoint and the comments pane), so the grid host and the provider can end up with two data lifetimes for the same body; `recordAvailable` has no decided source and no migration; the campaign-assign trigger is defined two contradictory ways; and the out-of-scope fallback is a *wider* read than the premium record it falls back from. Two more are self-defeating rather than dangerous: `canEdit` is a restatement of the read gate, and AD-8's focus contract cannot be implemented from the API AD-5 defines. Fix the id collisions, pick one history/comments lifecycle, and decide the fallback's information asymmetry, and this becomes a strong spine.

---

## Findings

| # | Severity | Finding | Disposition |
|---|---|---|---|
| F1 | High | New AD-1/3/4/5/6 collide with inherited AD-1/3/4/5/6 | autofix |
| F2 | High | "One record read" does not bind the existing history endpoint or the self-fetching comments pane; the grid host keeps a second data lifetime | autofix |
| F3 | High | The out-of-scope session summary reads wider than the premium record it is the fallback for, and one list now shows two record UIs | discuss |
| F4 | High | `recordAvailable` has no decided source; AD-6's "RLS-scoped select" does not fit `lib/sessions/data.ts`, and no migration is named | autofix |
| F5 | Medium | AD-3 (gutter expand control) and AD-6 (every row is a trigger) contradict each other for campaign assign; gutter slot unspecified | autofix |
| F6 | Medium | `canEdit` is always true — read and write share the same gate — so the capability is vacuous | discuss |
| F7 | Medium | AD-4's merge field list is incomplete and misses the shipped spread-merge; `contact` has no named type | autofix |
| F8 | Medium | File placement puts the manage-scope record in the Contacts *section* folder and adds a third contact-read module | discuss / autofix |
| F9 | Medium | Operational/environmental envelope missing: no cache rule for a per-user PII GET, no matcher statement, no "no new env/service", CVE caveat dropped | autofix |
| F10 | Medium | CAP-5's withdrawal is not reconciled with a feature that reintroduces its two defining affordances | discuss |
| F11 | Medium | AD-8's focus-return rule cannot be implemented by `openContactRecord({ contactId, sequence })` | autofix |
| F12 | Low | AD-10: "must not read every contact" conflicts with "a scoped distinct query" | autofix |
| F13 | Low | Two phone frames, one header contract; the grid's phone host is missing from the structural seed | discuss |
| F14 | Low | Stack table is not exact where it claims to be verified from `package.json` | note |

---

### F1 — The new AD numbering collides with the inherited one (High, autofix)

**Evidence.** The inherited table (spine lines 47–55) binds parent **AD-1, AD-3, AD-4, AD-5, AD-6**. The spine then defines its own **AD-1 … AD-10** (lines 59–124). Five numbers mean two unrelated rules:

- `AD-1` = "patch owner resolved once at the staff boundary" (parent) **and** "one record read model, one authorization boundary" (new).
- `AD-3` = "one patch predicate, one actor/owner vector" (parent) **and** "one record body, thin frames" (new).
- `AD-4` = "role sets and the surface matrix" (parent) **and** "one mutation channel" (new).
- `AD-5` = "RLS grants the patch; a page may narrow, never widen" (parent) **and** "one provider per staff shell" (new).
- `AD-6` = "the stored name and the UI label stay Preacher" (parent) **and** "inline triggers only" (new).

The Capability → Architecture Map (lines 175–188) cites bare `AD-1`, `AD-3`, `AD-4`, `AD-5`, `AD-6` with no disambiguation. A story that says "follow AD-5" can mean the RLS invariant or the provider mount rule — and one of those is a hard security constraint while the other is a component placement instruction.

**Why it matters.** The spine's whole purpose is to be the substrate the level below builds from. Ambiguous identifiers are not a cosmetic defect; they are exactly the divergence the document exists to prevent.

**Fix.** Prefix the new decisions (`AD-C1`…`AD-C10`, or renumber to `AD-7`…`AD-16` now that the parent AD-1…AD-6 are fixed) and update every reference in the inherited table, the map, and the Deferred entries. Nothing outside this file cites the new ids yet, so the rename is contained.

---

### F2 — "One record read" does not bind the two existing self-fetching sub-resources (High, autofix)

**Evidence.** AD-1 (line 63) puts `history` and `comments` inside `ContactRecordPayload` and says "the only HTTP surface is `GET /api/manage/contacts/[contactId]/record`". AD-3 (line 75) says the body "does not fetch". But the shipped code has two independent fetches:

- `ContactRecordDialog` fetches history itself from `HISTORY_ENDPOINT = "/api/manage/contacts/history"` (`components/manage/contact-record-dialog.tsx:237`, hook at `:252–286`), served by `lib/manage/contact-history-handlers.ts:17–35` over `loadManageContactHistory` (`lib/supabase/manage.ts:1621`).
- `ContactCommentsPane` fetches comments itself from `COMMENT_ENDPOINT = "/api/manage/contacts/comments"` on mount (`components/manage/contact-comments-pane.tsx:64`, `:255–281`), and re-reads after every mutation.

AD-3 keeps the grid as its own host with its own open state, mirror and sequence. So unless the spine says which read the grid host uses, the likely outcome is: the grid keeps the old history endpoint and the old comment GET, while the provider uses the new payload. That is two sources for the same body — precisely what AD-1 claims to prevent — and the `history`/`comments` fields in the payload are either dead or double-fetched. `lib/manage/contact-history-handlers.ts` and the comments GET route are not in any bind list, and "the only HTTP surface" is already false (PATCH, comments GET/POST, reactions, order, history all exist).

**Second-order problem.** Moving `comments` into the payload also breaks the pane's mutation lifecycle: it currently `setState`s after each POST. With props it needs a refresh channel. AD-4 ("one mutation channel") covers contact field writes only; comment writes are a second write path that mutates the same record, and the spine never says how the provider's `comments` and `commentCount` stay current.

**Fix (pick one, name the files):**

- **Preferred:** retire `GET /api/manage/contacts/history` and have the grid host consume the record read while keeping its own open state/mirror/sequence. Bind `lib/manage/contact-history-handlers.ts` and its route in AD-1/AD-3, and say the route is deleted (or kept as a deprecated alias for one release). Deferred "converging the grid host" then becomes "converge the grid host's *read*, keep its open state" — a much smaller and already-happening convergence.
- **Alternative:** keep the history endpoint as the grid host's source and drop `history` from the payload; but then the provider's body has no history, contradicting AD-1.
- Either way: define the comments refresh (`comments` + `canComment` + an `onCommentsChanged` callback the provider can apply, or keep the pane self-fetching and remove `comments` from the payload), and state that the comment write routes are unchanged and are not "a second record channel".

---

### F3 — The fallback reads wider than the record it falls back from (High, discuss)

**Evidence.** AD-9 (lines 114–118) preserves the session summary "exactly as they are" and says its read is "wider than contact RLS". That is accurate: `contact_attendance_summary` (`supabase/migrations/20261101000000_sessions_flow.sql:537–632`) gates only through `sessions_visible` and then reads `c.notes`, `c.is_favorite`, `c.location_ids`, `c.assigned_preacher_id`, `c.collected_by_id` for any contact in the programme. It never applies `contactInPatch`. The premium record is patch-scoped (AD-1) and its comment read is patch-scoped (`lib/supabase/contact-comments.ts:66–79`). The consequence is inverted:

- A **Preacher** opening a session they created sees an out-of-scope attendee's **notes, favourite, location and assigned preacher** in the fallback summary.
- The "premium" record for that same contact is refused, because the contact is outside their patch.

So the fallback is not a reduced view — it is a *different, wider* view. AD-6 uses it as the fallback for exactly the contacts the premium record refuses (lines 93–100). The session list therefore presents two record experiences in one list, with no explanation, and the shipped footer copy — "open their complete contact record — every contact field and their attended-session history" (`components/sessions/session-attendees.tsx:50–53`) — becomes false for the fallback rows. AD-9's stated prevention, "two summary UIs", is contradicted by its own rule.

**Why it matters.** This is the one place where the feature's authorization story reads backwards, and it touches the parent's AD-5. It does **not** widen anything itself — the spine is honest that the widening is pre-existing — but it codifies it as permanent and then builds the new access path on top of it. The Deferred bullet ("narrow it only as its own security change") has no owner, date or decision record, so a future reader sees an accepted risk with no acceptance.

**Fix.** Decide, and write it into AD-9 rather than only Deferred:

- **(a)** Narrow the fallback to attendance-only (session, date, attended count) and accept that "unchanged" becomes "reduced"; update the copy and the endpoint. This is the clean option.
- **(b)** Explicitly ratify the wider read as a programme-scoped exception with an owner and a date, state that it is **wider** than the premium record in the AD-9 rule (not just in Deferred), and explain why the fallback is allowed to show more than the record. Also fix the list copy so an operator is not told both rows open "the complete record".

Either is defensible; leaving the asymmetry implicit is not, because it is the first thing a security review will find.

---

### F4 — `recordAvailable` has no decided source, and the "never a client heuristic" convention is contradicted (High, autofix)

**Evidence.** `SessionAttendee` and `SessionTopAttendee` are produced by service-role RPCs in `lib/sessions/data.ts` (`getSessionAttendees` at `:320–349`, `getSessionsTopAttendees` at `:268–299`), and every read in that module goes through `createSupabaseAdminClient()` + the scope vector. The RPCs are `SECURITY INVOKER` and granted only to `service_role` (`20261101000000_sessions_flow.sql:650–661`; `20261102020000_sessions_top_attendees.sql:81–82`). AD-6 (line 94) says `recordAvailable` is "computed by intersecting the attendee ids with an RLS-scoped `select id from contacts` read" — but that module has no user-scoped client, and no migration is named anywhere in the spine.

Two implementers can therefore:

- add a migration to `session_attendees` / `sessions_top_attendees` returning a boolean; or
- add a second user-scoped read in `lib/sessions/data.ts`.

Both are plausible, and they differ in migration footprint, test fixtures and failure modes. The structural seed only says `lib/sessions/data.ts  # recordAvailable flags` — it does not say whether the flags are computed there or in SQL.

**Also.** AD-6's Manage Sessions rule — "a trigger only when the attendee id is present in `payload.contacts`" (line 96) — **is** a client-side membership test. The consistency table (line 131) says `recordAvailable` is "computed by RLS, never by a client heuristic". The Manage Sessions rule is safe because `payload.contacts` is server-scoped, but the convention as written is false and will be quoted against the implementation.

**Fix.** Choose one mechanism. Recommend: compute both flags in `lib/sessions/data.ts` with one RLS-scoped `select id from contacts` over the page's ids (no migration, and it matches `assertManageContactInScope`'s use of `createSupabaseServerClient`), and say so explicitly. Reword the convention to "server-scoped, never role- or page-derived; a membership test against a server-scoped payload is allowed". If the RPC route is chosen instead, name the two migrations in the structural seed and Deferred.

---

### F5 — AD-3 and AD-6 disagree about the campaign-assign trigger (Medium, autofix)

**Evidence.** AD-3 (line 75): "The campaign assign grid uses one generic `GridRowExpandControl` … in the leading gutter, matching the Contacts grid. Its row selection and row click behaviour are unchanged." AD-6 (line 97): "**Dashboard Focus and Candidates, Campaign assign:** in manage/campaign scope by construction; **every row is a trigger**." If every row is a trigger, row click opens the record, which changes the campaign grid's row-click behaviour and competes with the selection checkbox. The existing campaign grid's first column is the select column, where the serial and the checkbox share one 16px slot (`components/campaign/assign-contacts-select.tsx:1051–1100`); the spine specifies no order or width for the new expand control, and the "same gutter" claim (line 282 comment) means it must not collide with that slot.

**Fix.** Say explicitly that the trigger is the expand control, **not** the row, for both grids; give the gutter order (e.g. select → expand → serial) and require it in both; and separate the interaction models: session/dashboard rows may be row-click, campaign assign must stay selection-first. AD-6's "every row is a trigger" should become "every row offers a trigger".

---

### F6 — `canEdit` is a restatement of the read gate, not a capability (Medium, discuss)

**Evidence.** AD-1 gates the read with `requireRole(staff, MANAGE_CONTACT_WRITE_ROLES)` + the contact RLS boundary. AD-4 writes through `assertManageContactInScope` + `MANAGE_CONTACT_WRITE_ROLES` (`lib/supabase/manage.ts:1297–1303`; `lib/manage/api-handlers.ts`). Every contact the read admits, the write admits — for an Admin programme-wide, for a Preacher/Assistant within the patch. So `capabilities.canEdit` is always `true`, and AD-4's "`canEdit: false` renders values, never editors" is unreachable. It does not prevent the stated divergence ("a session page enabling edit") — the route does.

**Why it matters.** Not a runtime bug, but a false abstraction: the next reader will assume a read-only surface exists and design around it, or worse, use `canEdit` as an authorization check on the client. The capability flags should mean something.

**Fix.** Either drop `canEdit` (the write boundary is the rule, and the body's editors already follow `isContactFieldEditable`), or name the case where read ≠ write. There is none today; if the intent is a future Admin programme read with no edit, define it now and make the flag encode it.

---

### F7 — AD-4's merge instruction is incomplete and misses the shipped spread (Medium, autofix)

**Evidence.** `ManageContact` (`components/manage/manage-types.ts:50–90`) carries `age`, `designation`, `year`, `address`, `photoPath`, `lastContactedOn`, `totalAttendanceCount`, `past60DayAttendanceCount`, `commentCount`. `ManageContactWriteResult` (`:260–289`; built at `lib/supabase/manage.ts:1248–1266`) omits `age`, `designation`, `year`, `address`, `photoPath`, `lastContactedOn`, both rollups and `commentCount`. AD-4 lists only "`age`, `designation`, `year`, `address`, rollups, `commentCount`" — **`lastContactedOn` and `photoPath` are missing**. A field-by-field merge written from that list silently drops the record's photo and its "last contacted" value after any edit.

The shipped grid already does the right thing in one line: `{ ...contact, ...written }` (`components/manage/manage-contacts-table.tsx:983–990`). AD-4 should ratify the spread, not enumerate fields.

**Also.** AD-1 names `contact` without a type. Because the body is shared with the grid, it has to be the grid's `ManageContact` (or a type that is structurally identical); say so, or the provider and the grid will each define a payload contact and drift at the join.

**Fix.** "Merge by spreading the result over the existing contact (`{ ...contact, ...result }`), exactly as `applyWrite` does; every key the result does not return — including `lastContactedOn`, `photoPath`, the rollups and `commentCount` — is preserved by construction." And `contact: ManageContact` in `ContactRecordPayload`.

---

### F8 — File placement invents a convention instead of ratifying one (Medium, discuss / autofix)

**Evidence.** The record's parts all live in `components/manage/` today: `contact-record-dialog.tsx`, `contact-comments-pane.tsx`, `contact-record-styles.ts`, `manage-contact-field-editor.tsx`, `manage-contact-fields.ts`, `manage-types.ts`. The spine's structural seed (lines 156–173) puts the body, provider, dialog, phone frame and trigger in `components/contacts/`. But `components/contacts/` currently means the **Contacts section** — overview, reports, `contacts-grid-surface.tsx`, `contacts-section-shell.tsx`, `ContactsSectionPayload` — not the manage record. The record is manage-scope by AD-1's own gateway and by AD-2's write roles, so `components/manage/` is the natural home; `components/contacts/` reads as "the public Contacts tab".

The same issue on the server: `lib/contacts/record.ts` becomes a third contact-read module beside `lib/contacts/section-server.ts` (public section) and `lib/supabase/manage.ts` (manage reads). The seed also mixes `lib/manage/record-handlers.ts` (consistent) with a read model in `lib/contacts/` (not).

**Fix.** Keep the record files in `components/manage/contact-record-*` and put the read model in `lib/manage/record.ts` (or `lib/supabase/manage-record.ts`), or state plainly that this is a **move** of the existing dialog/pane and why the manage vocabulary belongs in the section folder. The six-file move has no functional benefit; the current placement is the brownfield convention.

---

### F9 — The operational/environmental envelope is missing (Medium, autofix)

**Evidence.** The parent's Deferred ends with an explicit envelope line: "Deployment, environments and provider topology. Inherited unchanged … this slice adds no runtime service, table or environment variable" (parent line 222). The new spine's Deferred (lines 189–198) has no equivalent, and no migration/caching entry.

Concretely missing:

- **Cache semantics.** The record GET is a per-user PII read. Nothing says `cache: "no-store"` / `Cache-Control: no-store`; the shipped history fetch sets `cache: "no-store"` (`contact-record-dialog.tsx:259–261`), so the convention exists and should be carried.
- **Matcher.** The new route nests under `/api/manage/…` and is already covered by `/api/manage/:path*` (`apps/folk/proxy.ts:14`), but the spine does not say so. Parent AD-4 makes the matcher a known pitfall, so the omission is not harmless.
- **No new infra.** No new env var, service, table or dependency (the Stacks section implies it, but does not say it).
- **Migrations.** None named — but F4 may require two. If `recordAvailable` is computed in TS, say "no migration"; if in SQL, name them.
- **Next pin.** The Stack repeats 16.0.7 without the parent's note that it predates CVE-2026-44575 (fixed in 16.2.5; parent line 171). The feature inherits the pin, so it should inherit the caveat.

**Fix.** Add a three-line "Envelope" paragraph or Deferred entry: no new env/service/dependency; the record route is matched by `/api/manage/:path*` in both apps; the record fetch and response are `no-store`; Next pin inherited with the CVE note; migration only if `recordAvailable` moves into the RPCs.

---

### F10 — CAP-5 is not reconciled (Medium, discuss)

**Evidence.** `_bmad-output/specs/spec-contacts-premium-grid/SPEC.md:60` withdraws CAP-5 outright: "Record review is **not** in scope. There is no record panel, no per-row open affordance, and no prev/next navigation." The new spine's premise is a per-row open affordance, and AD-7 is prev/next. The grid already contradicts the spec (it ships `ExpandRecordControl` at `manage-contacts-table.tsx:589–639` and `ContactRecordDialog` at `:2527`, both post-dating the withdrawal), so the spec note is stale — but the spine cites the spec as a source and never says which document wins. A later story that reads CAP-5 literally could remove the grid's record and reopen the exact trade the spec recorded.

**Also CAP-9** (`SPEC.md:91`): "`components/grid/` remains table-agnostic (zero contacts vocabulary)". AD-3's comment-count variant must live outside `components/grid/`; the spine says the variant "wraps" the generic control but not where the wrapper lives. Put it in `components/manage/`.

**Fix.** One line in the spine: "CAP-5's withdrawal is scoped to the premium-grid spec's redesign; the grid's record is shipped and this spine extends it to non-grid surfaces. CAP-5 is not reinstated as a grid redesign." And: "the comment-count wrapper stays in `components/manage/`; `components/grid/grid-row-expand-control.tsx` carries no contacts vocabulary."

---

### F11 — AD-8's focus contract cannot be implemented from AD-5's API (Medium, autofix)

**Evidence.** AD-8 (line 112) says "capture the triggering element … on close, restore focus to the trigger". AD-5 (line 87) defines `openContactRecord({ contactId, sequence? })` — no trigger. Today's session list opens on a row click (`components/sessions/session-attendees.tsx:44–45`), and dashboard Focus rows are server-rendered `<li>`s with a `tel:` link (`components/dashboard/focus-section.tsx:52–80`). `document.activeElement` after a row click is the row or the body, not a focusable trigger, so "restore focus" has no defined target.

**Fix.** Either make every trigger a focusable `ContactRecordTrigger` button (and state that row click is not the trigger), or add `trigger?: HTMLElement` to `openContactRecord` and require callers to pass it. Also say what receives `inert` (the shell's content wrapper, not the page body) and whether the phone frame traps focus or only the desktop dialog does.

---

### F12 — AD-10's wording contradicts itself (Low, autofix)

"must not read every contact" (line 124) and "a scoped distinct query" (line 124) cannot both hold: a `select distinct` over `contacts` reads every row, even though it returns few values. Reword to "must not materialise or return every contact; a one-column `select distinct` over the patch is allowed." This matters because `booksReadOptions` is currently derived from the full contact set (`lib/supabase/manage.ts:972–974`) and `sourceOptions` from the rows (`manage-contacts-table.tsx:971–981`); the spine is deliberately changing that, and the distinction between "read" and "materialise" is the rule.

---

### F13 — Two phone frames, one header contract (Low, discuss)

AD-3's "the phone frame" is singular, but there are two: the grid's `ManageContactRecord` (`components/manage/manage-contact-record.tsx:54`, full-screen, its own top bar and Escape handling) and the seed's new `components/contacts/contact-record-phone.tsx`. Both wrap the body, so drift is limited to chrome, but the seed **omits `manage-contact-record.tsx` entirely** even though AD-3 binds it. Either converge the grid's phone host onto the new frame, or name both in the seed and state that they share the body and the AD-8 contract.

---

### F14 — Stack table is not exact where it claims to be (Low, note)

`tailwindcss` is `^4.1.9`, not `4.1.9`; `@playwright/test` is `^1.62.0` and `playwright-core` is `^1.63.0` (two versions) in `package.json`; the spine lists `^1.62`. The parent's Supabase Postgres 17 row is dropped. None of this changes a decision, but the table says "Repo pins, verified from `package.json`", so it should be exact — or say "range as pinned".

---

## Checklist answers

### 1. Does it fix the real divergence points for the level below, and miss none?

It fixes most: provider mount and gating (verified: `StaffAuthShell` wraps `/manage`, `/sessions` (folk layout), `/campaigns` (folk layout), dashboard via `DashboardRoute`, dashboard candidates via `DashboardCandidatesRoute`; `canReadContacts` is exactly `OPERATIONAL_ROLES && (role !== "Assistant" || hasPatchScope)` in `lib/staff-dto.ts:40`), the sequence model, the write route, the a11y contract and the out-of-scope surfaces.

It misses five that two builders would implement differently:
- the history/comments lifecycle (F2);
- the `recordAvailable` source and migration (F4);
- the campaign-assign trigger (F5);
- the trigger element for focus capture (F11);
- the payload `contact` type and the merge field list (F7).

### 2. Is every AD's Rule enforceable, and does it prevent its stated divergence?

Mostly, with four exceptions:
- **AD-1** is enforceable as a single function/route, but its "only HTTP surface" is false today (history, comments, PATCH, order) and it does not bind the history route, so a second read model survives (F2).
- **AD-2** is enforceable, but `canEdit` is vacuous (F6); `canComment` is exactly the shipped `assertCommentContactInScope`, which is good.
- **AD-3** is enforceable, but the "the phone frame" singular covers two frames (F13) and the campaign gutter contradicts AD-6 (F5).
- **AD-8** is not implementable from its own API (F11).
- **AD-9** is enforceable (do nothing), but its "Prevents: two summary UIs" is false — it creates two record experiences (F3).
- **AD-10** is enforceable but self-contradictory in wording (F12).

### 3. Is anything under Deferred capable of letting two units diverge?

Yes, two entries:
- **"Converging the Contacts grid host onto the provider"** — deferring convergence is fine *if* the shared read and body are fixed. As written, it permits the grid to keep the old history endpoint while the provider uses the payload, i.e. two data lifetimes for one body (F2). Fix the read decision, not the convergence.
- **"Narrowing the existing session summary"** — this defers a live widening while AD-6 uses it as the fallback (F3). A security change deferred with no owner is an accepted risk; it should be recorded as one.

The rest (global finder, deep link, Attendance/Favorites, caller screens, caching, route page) are genuine non-goals and cannot cause divergence.

### 4. Is the named tech verified-current, and does it fit?

Yes, with the F14 caveats. Next 16.0.7 / React 19.2.0 / Supabase JS ^2.105.1 / TanStack Table ^8 / Virtual ^3 / Vitest ^5.0.5 / pnpm 10.33.0 all match `package.json`. `next/dynamic` with `ssr: false` is valid from a client provider. No new dependency is proposed, which is right. The one omission is the inherited CVE-2026-44575 note on the Next pin (F9). Tailwind is a range, not a pin (F14).

### 5. Does it ratify the brownfield codebase rather than invent new conventions?

On **authorization, yes — unusually well**:
- `MANAGE_CONTACT_WRITE_ROLES = OPERATIONAL_ROLES` (`lib/staff-roles.ts:22`) and `CONTACT_COMMENT_ROLES` (`:35`) are the shipped sets; AD-1/AD-2 use the right names.
- `assertManageContactInScope` (`lib/supabase/manage.ts:991–1028`) is the RLS-scoped read + 403/404 probe; AD-1's "contact RLS boundary" matches.
- `contactInPatch` (`lib/patch-scope.ts:7`) is the one comment predicate; AD-2's `canComment` expression matches `lib/supabase/contact-comments.ts:66–79` exactly.
- `ClientStaff.canReadContacts` (`lib/staff-dto.ts:40`) is the right gate; AD-5 uses it.
- The proxy matcher already has `/api/manage/:path*` (`apps/folk/proxy.ts:14`); the new route needs no matcher change (though the spine should say so).

On **file placement, no** (F8): the record and its editors live in `components/manage/`, and the seed moves them to the Contacts *section* folder. `lib/contacts/record.ts` is a third contact-read module. That is the one place the spine invents a convention rather than ratifying one.

### 6. Does it cover the spec's capabilities?

The spec's grid capabilities are largely orthogonal (the record already ships and the spec withdrew CAP-5). Two gaps:
- **CAP-5** is not reconciled, and the feature reintroduces both of its defining affordances (F10).
- **CAP-9**'s zero-contacts-vocabulary rule needs the comment-count wrapper's location (F10).

The spine does preserve CAP-7/CAP-10's one-commit-path rule (AD-4) and CAP-9's "no second table implementation" (AD-3's generic control). CAP-18's default field set is untouched, correctly.

### 7. If a parent spine is inherited, does any new AD weaken or contradict an inherited one?

No new AD *adds* a widening: AD-1/AD-3 correctly inherit the parent's AD-1/AD-3; AD-2 keeps `patchOwner` server-side; AD-5 uses an existing client flag. The tension is AD-9:
- It **codifies a pre-existing breach** of parent AD-5 ("a page may narrow, never widen") as permanent, and AD-6 **relies on that breach** as the fallback for contacts the premium record refuses (F3). The spine is honest about the breach, but "recorded in Deferred" is not the same as "ratified by a decision". Either narrow the fallback or record an explicit acceptance with an owner/date.
- Otherwise the inherited table is accurate, including the `Preacher` label (parent AD-6), which AD-1/AD-2 respect.

### 8. Is every dimension this altitude owns decided, deferred, or an open question — especially the operational/environmental envelope?

Mostly. Decided: authorization, payload shape (except `contact`'s type), provider lifecycle, lazy loading, abort, sequence, write channel, a11y, error states, non-goals.

Missing or under-specified:
- **Operational envelope** — F9 (cache, matcher, no new infra, Next CVE note).
- **Migrations** — F4 (none named, though `recordAvailable` may need two).
- **Caching** — F9 (per-user PII GET with no `no-store` rule).
- **Verification seam** — the spine does not say which e2e/unit layer covers the record route or the new flags. The repo's testing policy is strict enough that this is worth one line ("no new spec family; extend `manage-contacts` and `sessions`"), even if the detailed matrix belongs to the story.
- **Comments refresh** — F2 (a write path that mutates the record but has no reconciliation rule).

---

## What is good (and should survive the fixes)

- The **authorization ratification** is the strongest part. Every named boundary exists and means what the spine says it means. That is rarer than it should be.
- The **refusal of a global finder** and the explicit list of trigger surfaces is a real product decision, not an omission.
- **AD-3's "the grid keeps its host"** is the right call for a 2,580-line grid; the spine correctly refuses a rewrite.
- **AD-5's abort/lazy/no-prefetch** rule is exactly the lifecycle the current dialog lacks (it fetches history on mount and has no abort on close/switch; the comments pane has one, but only for its own read).
- **AD-9's honesty** about the session summary is better than silence; it needs to become a decision, not disappear into Deferred.
- The **Deferred list is genuinely deferred**, not a parking lot for undecided design.

---

## Suggested minimal edits (in order)

1. Renumber/prefix the new ADs and update every reference (F1).
2. Add one paragraph to AD-1/AD-3: history/comments lifecycle, the fate of `lib/manage/contact-history-handlers.ts`, the comments refresh, and `contact: ManageContact` (F2, F7).
3. Rewrite AD-9's rule and its Deferred entry with the information asymmetry explicit; choose narrow-or-ratify (F3).
4. Decide `recordAvailable`'s mechanism and name the file/migration; reword the "never a client heuristic" convention (F4).
5. Fix the campaign-assign sentence to "expand control, not row" and specify the gutter order (F5).
6. Replace AD-4's field list with the spread-merge rule; keep `canEdit` or drop it with a reason (F6, F7).
7. Move the record files back to `components/manage/` (or state the move), and place the comment-count wrapper outside `components/grid/` (F8, F10).
8. Add the four-line envelope paragraph: no new infra, matcher, `no-store`, Next CVE note, migration condition (F9).
9. Add `trigger?: HTMLElement` (or make every trigger a focusable button) to AD-5/AD-8 (F11).
10. Reword AD-10's "read every contact" (F12), and either name both phone frames or converge them (F13).

## Open questions for Dwaraka

1. Is the out-of-scope summary allowed to show *more* than the premium record (notes, favourite, location), or should the fallback be reduced to attendance-only? (F3)
2. Does the grid host adopt the record read, retiring `GET /api/manage/contacts/history`, or keep it as a second read? (F2)
3. Is `recordAvailable` a TS read in `lib/sessions/data.ts` (no migration) or a new field on `session_attendees` / `sessions_top_attendees` (two migrations)? (F4)
4. Do the record components stay in `components/manage/`, or is the `components/contacts/` move deliberate? (F8)
5. Is CAP-5 formally superseded for non-grid surfaces, so a later story does not remove the grid's record? (F10)

---

*No spine edits were made. No test suite was run; the review is source-inspection only.*

---

## Addendum — re-check of the revised spine (2026-11-08)

Re-read `ARCHITECTURE-SPINE.md` (revised 2026-11-08, AD-7…AD-16) and the artefacts it cites. **Cleared by the revision:** F1 (AD ids now AD-7…AD-16, no parent collision), F2/F7 (one `ContactRecordViewState`, the history self-fetch and `/history` route retired, the comments pane presentational, the merge by spread), F3 (AD-15 records the pre-existing summary exception with owner/date and names the S8/S9 change), F4 (`loadContactRecordAvailability` via `createSupabaseServerClient()`, no service-role availability read), F5 (campaign-assign defined as an expand control, not row click, with a widened leading column), F11 (the `trigger?` argument and AD-14's focus contract), F13 (the new phone frame replaces the grid-only record).

Two high-severity items remain; the first is a build blocker, the second blocks the campaign surface's stated keyboard requirement.

### B1 — High / blocker — The CAP-5 supersession is asserted, not landed

**Evidence.** The spine now declares `sources: … _bmad-output/specs/spec-contact-record-access/SPEC.md` (line 18) and `supersedes: … spec-contacts-premium-grid/SPEC.md#CAP-5` (lines 12–13), and line 29 says `spec-contacts-premium-grid` "is updated with a pointer in the same change." No such spec exists under `_bmad-output/specs/` (the directory has no `spec-contact-record-access`), and `spec-contacts-premium-grid/SPEC.md:60` still says: "**CAP-5 — WITHDRAWN …** There is no record panel, no per-row open affordance, and no prev/next navigation." The only modified premium-grid file is `surface-and-toolbar.md`, and its diff is an unrelated cell-range tint. The `.memlog.md:21` still records the spec-placement question as open.

**Why it blocks.** The repo's build flow resolves specs by path, and the canonical spec still forbids the feature the spine is the substrate for. A story-level builder will either fail to resolve `spec-contact-record-access/SPEC.md` or follow `spec-contacts-premium-grid` and conclude the record is out of scope. The `supersedes` field cannot override a spec that still says the opposite and has no pointer to the new decision.

**Fix.** Create `_bmad-output/specs/spec-contact-record-access/SPEC.md` and add the supersession pointer to `spec-contacts-premium-grid/SPEC.md` (the reality review asks for the same), or drop the `sources`/`supersedes` claim and record Dwaraka's explicit decision to reopen CAP-5 in the spine. Do not leave the claim in place without the artefact.

### B2 — High / blocker for campaign assign — AD-9's keyboard requirement has no mechanism

**Evidence.** AD-9 says the expand control "is reachable by keyboard and touch in campaign assign" and "stops propagation" (line 102), but it does not bind `components/grid/use-grid-keyboard.ts`, and the seed omits it. The grid owns every key: `GUARDED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])` (`use-grid-keyboard.ts:30`), and `handleContainerKeyDown` intercepts `Tab` (`:1943–1958`), `Enter` (`:1973–1990`) and `Space` (`:2042–2046`) for any unguarded descendant — including a `<button>`. The campaign grid is this grid (`assign-contacts-select.tsx:1438–1461`). A click-only `stopPropagation` (the natural reading of "stops propagation") leaves the button unreachable by Tab, unactivatable by Enter, and toggling the active row's checkbox on Space. If `stopPropagation` is applied to `onKeyDown` for Tab/Enter/Space, the AD is satisfiable without the hook — but the AD does not say which events.

**Why it blocks.** The AD asserts an outcome it does not bind, and the campaign surface is one of the feature's triggers. The first keyboard test fails, and two builders can implement "stops propagation" for different event sets. This is the accessibility re-check's H1, independently confirmed against the source.

**Fix.** Either name `onKeyDown` `stopPropagation` for `Tab`, `Enter` and `Space` (plus click) on the trigger, or bind `use-grid-keyboard.ts` in AD-9 and yield those keys to `[data-grid-row-expand]` (and buttons/links in a cell).

### Remaining high, not counted as build blockers

- **AD-14's trigger capture is provider-only** (accessibility H3): the grid and phone hosts keep their own open state and do not call `openContactRecord`, so the primary surface has no recorded trigger or restore. The sentence should say "the host", not "the provider".
- **The phone field sheet still closes with the record on Escape** (H2): `manage-contact-sheet.tsx:65–76` registers a bubble-phase `document` Escape handler with no `defaultPrevented` check, and no AD binds it; Radix's dismissable layer prevents default but does not stop propagation.
- **The `main h1` focus fallback is not focusable** (H4): `.focus()` on a plain `<h1>` no-ops; use the list/grid container (`manage-contact-list.tsx:139` has `tabIndex={-1}`) or add a temporary `tabindex`.

**Re-check verdict:** not "no blockers" — B1 blocks the build-workflow/spec contract and B2 blocks AD-9's campaign keyboard requirement. The high accessibility items H2–H4 remain but are implementation-time fixes, not build blockers.

**Final verdict (2026-11-08, after the spec/pointer and AD-9 keyboard fixes):** No critical or high blockers remain; `spec-contact-record-access/SPEC.md` and both CAP-5 pointers exist, AD-9 binds `use-grid-keyboard.ts` with `data-grid-row-expand` and the Tab/Enter/Space yield, and the spine is build-ready from this lens.
