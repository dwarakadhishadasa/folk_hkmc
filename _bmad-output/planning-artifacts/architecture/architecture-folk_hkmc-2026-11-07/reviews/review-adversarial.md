# Adversarial architecture review — cross-surface contact record

**Spine reviewed:** `ARCHITECTURE-SPINE.md` (draft, 2026-11-07)
**Review type:** adversarial construction — find two compliant descendants that cannot integrate
**Reviewer:** architecture review subagent
**Edit status:** spine not edited; this file is the only artefact.

## Verdict

The spine is directionally right and unusually explicit about authorization, but it stops one level too high on the seams it is most proud of. "One body, thin frames" fixes *where* the UI lives and leaves *what the body receives* undefined; "the grid keeps its own host" fixes *that* duplication is allowed and leaves *how the duplicated host gets history, comments and capabilities* undefined. Consequently a provider-side build and a grid-side build can each quote every AD literally and still disagree on the body's prop type, on whether history is payload data or a self-fetch, on whether comments are supplied or loaded, on whether a write result is merged or replaced, and on which overlay owns Escape and scroll lock. The same pattern recurs at the server boundary: `recordAvailable` is specified as "computed by RLS" but the only existing session loader is service-role, so the flag can be computed against the wrong client and show a trigger for a contact the record endpoint refuses. None of these are style disagreements; each is a compile break or an observable wrong state at the seam. The spine needs a small number of new contracts — a frozen `ContactRecordBody` prop type, a frozen read-state type for history and comments, one overlay-layer registry, one `recordAvailable` helper, one merge rule — rather than a rewrite.

## Method

For every hole below I construct two hypothetical units one level down — a **provider unit** and a **grid/host unit**, or a **server-loader unit** and a **client-host unit**. Each is asserted to obey every AD as written; the argument for compliance is included. The incompatibility is then stated as a concrete build or runtime failure, not a taste preference. Disposition is one of:

- **autofix** — the spine can be tightened mechanically; no product decision required.
- **discuss** — the tightening requires a product or authorization decision.
- **defer** — real, but safe to leave to the implementation with a named check.

Severity: **Blocker** = the two units cannot integrate at all, or one loses data / shows a trigger it cannot open. **High** = an observable wrong state in normal use. **Medium** = inconsistent behaviour in a narrower path. **Low** = edge case.

---

## AR-01 — History is payload data in one host and a self-fetch in the other

**Severity:** Blocker · **Disposition:** autofix
**ADs in tension:** AD-1, AD-3, AD-10
**Evidence:** `components/manage/contact-record-dialog.tsx:237-286` defines `HISTORY_ENDPOINT = "/api/manage/contacts/history"` and `useContactHistory(contactId)`; `:632-674` renders `Loading attendance…` / `No attendance recorded.` from that state. `components/manage/contact-history-handlers.ts:17-31` serves it. The spine's payload includes `history`, and AD-3 says the body "takes data and callbacks; it does not fetch."

**Unit A (provider host).** Builds `ContactRecordBody` with `history: ManageContactHistory` taken from `ContactRecordPayload.history`. The body is purely presentational: it maps `history.attendance` and `history.campaigns` to cards. This obeys AD-1 (payload field), AD-3 (body takes data, does not fetch), and AD-10 (one read on open).

**Unit B (grid host).** Keeps the existing `ContactRecordDialog` shape: the frame calls `useContactHistory(contact.id)` and passes the resolved `history` down to the body. The body still takes data and does not fetch; the *frame* fetches, and AD-3 explicitly allows frames to "position, scroll, and supply the header actions" — it never says a frame may not read. This also obeys AD-1 (the grid is not the provider and has no `ContactRecordPayload`), AD-3 (the grid keeps its own open state, mirror and commit), and AD-10 (the provider is the only thing that must not call `loadContactsSectionData`; the grid already has its own read).

**Concrete incompatibility.** The body's `history` prop has no agreed state. Unit A's type is `history: ManageContactHistory` — always ready. Unit B needs `loading | error | ready`, because the frame fetches after mount. Either:

- Unit B passes `{ attendance: [], campaigns: [], photoUrl: null }` while the request is in flight, and the body renders **"No attendance recorded."** for a contact that has attendance — a false empty state that Unit A never shows; or
- Unit B changes the prop to `history: ContactHistoryState`, which Unit A cannot satisfy without inventing a spinner it has no source for; or
- The two units ship different `ContactRecordBody` implementations and the "one body" claim is false.

The same argument applies to `photoUrl`, which lives inside `ManageContactHistory` (`components/manage/manage-types.ts:129-133`) and is rendered by the dialog at `:624`. Unit A gets it from the payload; Unit B gets it from the history response. A third unit that keeps the photo endpoint (`/api/manage/contacts/photo`, `lib/manage/api-handlers.ts:530-545`) issues a second request per open and flashes "No photo".

**Tightening.** Amend AD-3 (and AD-1) to freeze the body's read-state contract:

> `ContactRecordBody` receives exactly one `record: ContactRecordViewState`, declared in `components/contacts/contact-record-types.ts`:
> `{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; contact: ManageContact; history: ManageContactHistory; comments: ManageContactCommentList | null; capabilities: ContactRecordCapabilities; locations: ManageLocation[]; locationOptions: ManageLocation[]; staffNames: Record<string,string>; booksReadOptions: string[]; sourceOptions: string[] }`.
> The body renders loading, error and ready from that discriminant and never issues a read. The provider produces `ready` from `GET /record`. The grid host produces the same state from one `GET /record?contactId=` per open — it does **not** keep `/api/manage/contacts/history` as a second record read. `history.photoUrl` is the only photo URL in the record; neither host calls the photo endpoint on open.

If the grid host is to keep the history endpoint for a transition period, at minimum give it the same `ContactHistoryState` type and force the body to render loading/error, so the false-empty state is impossible. Retiring the endpoint is the cleaner autofix because it removes the second read model AD-1 exists to prevent.

---

## AR-02 — The comments pane is payload-supplied in one host and self-fetching in the other

**Severity:** Blocker · **Disposition:** autofix
**ADs in tension:** AD-2, AD-3, AD-10
**Evidence:** `components/manage/contact-comments-pane.tsx:53-57` — the public props are `{ contactId, contactName }`; `:233` — `ContactCommentsPane({ contactId, contactName })`; `:255-263` — a `useEffect` fetches `COMMENT_ENDPOINT = "/api/manage/contacts/comments"` on mount and stores `comments`, `readerUserId`, `readerName`. AD-2 puts `comments: ManageContactCommentList | null` in the payload and says it is non-null only when `canComment`; AD-3 says the body owns the comments layout and does not fetch.

**Unit A (payload unit).** Refactors the pane to a presentational component: props `{ comments: ManageContactCommentList; canComment: boolean; onMutated: ... }`. The body passes `payload.comments` when non-null, renders nothing when null. The pane issues only mutation requests (create, edit, delete, reaction) to the existing comment endpoints. This obeys AD-2 (comments from the payload, pane absent when null) and AD-3 (body does not fetch; the *body* does not fetch — a child that only mutates is not a read).

**Unit B (reuse unit).** Keeps `<ContactCommentsPane contactId={contact.id} contactName={contact.name} />` as the body's comments subtree. The body itself still does not fetch; the existing pane is "the comments layout" and AD-2 explicitly binds `components/manage/contact-comments-pane.tsx`, which suggests reuse is intended. This also obeys AD-2 (the pane's own read applies the comments endpoint's patch predicate) and AD-3 (the body composes the pane; the pane is not the body).

**Concrete incompatibility.** Unit B opens every record with **two** comment reads: the payload's `comments` (paid for by AD-1/AD-10) and the pane's mount fetch. The two can disagree:

- The payload is read at open; the pane re-reads a moment later. A comment posted in another tab appears in the pane but not in the payload's count; a comment deleted between the two reads appears in the payload but not the pane.
- The pane's reader identity (`readerUserId`, `readerName`) comes from its own response; Unit A takes it from `comments`. A unit that renders the composer from `payload.canComment` but the edit/delete affordances from the pane's `isOwn` can show a composer before the pane's identity resolves.
- When `canComment` is false, AD-2 says `comments` is null. Unit A hides the pane. Unit B receives `contactId` anyway and mounts the pane; the comments endpoint uses `CONTACT_COMMENT_ROLES` plus `contactInPatch` (`lib/supabase/contact-comments.ts:55-70`), so an Admin editing an out-of-patch programme contact gets a **403 error pane** inside a record they are legitimately allowed to edit. AD-2 says this split "is explicit, not an error"; Unit B renders it as an error.
- The reverse violation — `canComment: true` with `comments: null` because the comments read failed — is not covered by AD-2 at all. Unit A hides the pane silently; Unit B fetches and shows either the list or an error.

**Tightening.** Amend AD-2 with a comments contract:

> The comments subtree is presentational. It receives `comments: ManageContactCommentList | null` and `canComment: boolean`; it never calls `GET /api/manage/contacts/comments` on mount. `ContactCommentsPane` is refactored to take an initial list and a `canComment` flag, and uses the comments endpoint only for mutations. `comments === null` means "no comments pane"; `canComment === false` is not a permission error and must not produce an error state. `comments !== null && !canComment` is a server contract violation: render the pane in read-only mode (no composer), log once in development, and do not fetch to discover the truth. A failed comments read is a record-level error (`status: "error"`), never a silent `null`.

This also resolves the AD-2 binder list: naming the pane in AD-2 currently reads as "the pane is the data owner", which is exactly Unit B's argument.

---

## AR-03 — `ContactRecordBody`'s prop type is never frozen; capabilities are two different shapes

**Severity:** High · **Disposition:** autofix
**ADs in tension:** AD-2, AD-3
**Evidence:** AD-2 binds `ContactRecordBody` and `ContactRecordPayload.capabilities`; AD-3 says the body "takes data and callbacks". Neither names the body's props. The grid host has `ManageContact` only (`components/manage/manage-types.ts:50-90`); the provider has a payload with `capabilities`.

**Unit A (payload-shaped body).** `interface ContactRecordBodyProps { payload: ContactRecordPayload; onCommit: ...; onClose: ...; onPrevious: ...; onNext: ... }`. Capabilities are read as `props.payload.capabilities.canEdit` / `.canComment`. This is the most literal reading of AD-2: the body is the thing that renders the record, and the record is the payload.

**Unit B (flat body).** `interface ContactRecordBodyProps { contact: ManageContact; history: ManageContactHistory; comments: ManageContactCommentList | null; canEdit: boolean; canComment?: boolean; ... }`. The grid host can satisfy it by passing `canEdit: true` and `canComment: false` (or omitting it, because the grid has no comment capability). This reads AD-3 literally: the body takes data and callbacks, and it does not need the whole payload to render fields.

**Concrete incompatibility.** The two bodies are not interchangeable. Unit A's `onCommit` has the provider's error semantics; Unit B's grid host passes a fire-and-forget `(fieldId, value) => void` (`components/manage/manage-contacts-table.tsx:2533-2535` calls `void handleListCommit(...)`). The grid's `handleListCommit` catches its own errors and writes a notice (`:1296-1305`); it never rejects. If Unit A's body awaits `onCommit` and expects a rejection to render an inline error, opening the record from the grid makes every failed write look successful inside the body while the grid's notice fires behind the overlay. Conversely, if Unit A's body does not await, the provider's failed-write re-read and message are invisible.

The capability shape has the same drift. Unit A passes `capabilities: { canEdit, canComment }`. Unit B passes `canEdit: true` and no `canComment`, or `canComment: undefined`. AD-2 says `canComment` is server-derived and `comments` is non-null only when it is true; it does not say the body must receive `canComment` at all. So:

- Unit A renders a "You cannot comment on this contact" strip when `canComment` is false.
- Unit B treats `undefined` as "this host has no comments" and renders no strip.
- The same out-of-patch Admin contact therefore shows a strip in the provider and no strip in the grid — both compliant.

**Tightening.** New convention in AD-3 (or a new AD-11, "one body contract"):

> `ContactRecordBody` accepts exactly `ContactRecordBodyProps`, exported from `components/contacts/contact-record-types.ts`. `capabilities: ContactRecordCapabilities` is required and contains both `canEdit: boolean` and `canComment: boolean`; neither is optional. `onCommit(fieldId, value): Promise<ContactRecordWriteOutcome>` where `ContactRecordWriteOutcome = { ok: true } | { ok: false; message: string }`; the body renders the error from the outcome and never relies on a host notice. The grid host passes `canComment: false` and `comments: null` (no comments column), and adapts its `handleListCommit` to return the outcome by re-throwing or returning `{ ok: false, message }`. No host may pass a subset of the props or a different callback arity.

This also gives the future read-only context (AD-4's `canEdit: false`) one place to live instead of two prop vocabularies.

---

## AR-04 — AD-4's list of fields to preserve is incomplete: `photoPath` and `lastContactedOn` are dropped

**Severity:** High · **Disposition:** autofix
**ADs in tension:** AD-4
**Evidence:** `ManageContactWriteResult` (`components/manage/manage-types.ts:260-289`) contains no `photoPath`, `lastContactedOn`, `age`, `designation`, `year`, `address`, `totalAttendanceCount`, `past60DayAttendanceCount`, or `commentCount`. AD-4 says the provider merges the result "keeping fields the result does not return (`age`, `designation`, `year`, `address`, rollups, `commentCount`)". The grid's existing merge happens to be a spread (`components/manage/manage-contacts-table.tsx:983-990`), so it preserves everything.

**Unit A (spread merge).** `setContact(current => ({ ...current, ...written }))`. This is exactly the grid's current behaviour and satisfies AD-4's intent. It preserves `photoPath` and `lastContactedOn` even though AD-4 never names them.

**Unit B (named-field merge).** Implements AD-4 literally: builds the next contact from `written`, then copies the six named fields from the previous contact:

```ts
const next = { ...written, age: prev.age, designation: prev.designation, year: prev.year,
  address: prev.address, totalAttendanceCount: prev.totalAttendanceCount,
  past60DayAttendanceCount: prev.past60DayAttendanceCount, commentCount: prev.commentCount }
```

This obeys AD-4 to the letter — every field the AD says to keep is kept. It also obeys AD-1 (the record still has the same shape) and AD-2 (no capability change).

**Concrete incompatibility.** After any successful edit in Unit B, the open record's `photoPath` becomes `undefined` and `lastContactedOn` becomes `undefined`. The photo row (`contact-record-dialog.tsx:193-210`) flips from the photo to "No photo"; the `Last Contacted` field row empties. Both are fields the server did not change. The provider's local contact is now wrong until the record is closed and re-opened, and a subsequent write that includes those fields (there is none today, but the body renders them as read-only values) has no way to recover them. Unit A shows the photo; Unit B does not. Same server row, same PATCH, two different records.

The same class of bug applies to `assignedPreacherId` and `collectedById` if a unit uses a plain replace: the write result does return them, so they survive, but the `commentCount` is only preserved because AD-4 names it.

**Tightening.** Amend AD-4 to state the merge as a rule, not an enumeration:

> `ManageContactWriteResult` is a **partial projection**. The provider merges it as `next = { ...previousContact, ...result }` and never constructs a contact from the result alone. The named-field list in this AD is illustrative, not exhaustive; any field present on `ManageContact` and absent from the result is carried from `previousContact` by the spread. Add a type-level test: every key of `ManageContactWriteResult` is a key of `ManageContact`, and the merge preserves `photoPath`, `lastContactedOn`, `age`, `designation`, `year`, `address`, both rollups and `commentCount`.

If the spine prefers an explicit list, add `photoPath` and `lastContactedOn` to it — but the spread rule is the one that survives a future field addition.

---

## AR-05 — Comment mutations do not update `commentCount`, so the grid badge and the pane disagree

**Severity:** Medium · **Disposition:** autofix
**ADs in tension:** AD-3, AD-4
**Evidence:** `ManageContact.commentCount` drives the gutter badge (`components/manage/manage-contacts-table.tsx:586-637`, `:1420-1425`). `ManageContactWriteResult` has no `commentCount`; AD-4 says the provider "keeps" it, which means it stays at the value read at open. Comment create/delete responses from `/api/manage/contacts/comments` are not part of the record payload.

**Unit A (count from the payload only).** The pane's mutations update the pane's own `comments` array; `contact.commentCount` is untouched. On close, the grid row still shows the old count. This obeys AD-4 (the write merge preserves `commentCount`) and AD-3 (the body owns the comments layout; the grid owns its mirror).

**Unit B (count reconciled on mutation).** The pane calls a host callback `onCommentCountChange(delta)` after a create or delete; the provider updates `contact.commentCount`, and the grid host updates its mirrored row through the same callback when the record is opened from the grid. This also obeys AD-4 — it does not *clobber* the field, it reconciles it — and AD-3, because the host still owns its mirror.

**Concrete incompatibility.** With Unit A, the record opens from a row whose badge says `2`, the pane shows three comments (one added in another tab, or added in this session), the user deletes one, closes, and the badge still says `2` until the next server payload. With Unit B, the badge says `3` while the record is open and `2` after the delete. Both units can claim AD-4 compliance; the user-visible count differs. The same stale count also feeds the comments toggle's accessible label and the empty-state logic.

**Tightening.** Add to AD-2 or AD-4:

> Comment mutations return the new total (or the host reconciles it from the mutation result). The provider merges the total into `contact.commentCount`; the grid host receives the same via `onCommentCountChange` and updates its mirror row. `commentCount` is a rollup of the comments the pane owns, not a field the write merge may leave stale.

If comment counts are considered rollups that only the next read may change, say so explicitly and remove the badge's live-count claim — but do not leave "kept" to mean both "preserved" and "stale".

---

## AR-06 — `recordAvailable` can be computed with the service-role client, and the role gate is missing

**Severity:** High · **Disposition:** autofix
**ADs in tension:** AD-5, AD-6
**Evidence:** AD-6 says `SessionAttendee.recordAvailable` is "computed by intersecting the attendee ids with an RLS-scoped `select id from contacts` read". The structural seed puts the flag in `lib/sessions/data.ts`. That module imports `createSupabaseAdminClient` at line 2 and uses it for **every** read: `listSessionsOverview` (`:191-200`), `getSessionsTopAttendees` (`:268-299`), `getSessionAttendees` (`:320-349`). It never imports `createSupabaseServerClient`. Separately, AD-5 gates the provider on `ClientStaff.canReadContacts`, while AD-6's trigger rule never mentions the flag; `canReadContacts` is `operational && (role !== "Assistant" || hasPatchScope)` (`lib/staff-dto.ts:39`).

**Unit A (literal seed unit).** Implements the intersection inside `lib/sessions/data.ts`, next to `getSessionAttendees`, using the module's existing `supabaseAdmin` client:

```ts
const { data } = await supabaseAdmin.from("contacts").select("id").in("id", ids)
```

It is an RLS-scoped query in the sense that it is `select id from contacts`; it is just executed with a client that bypasses RLS. It obeys AD-6's text (intersection, contact ids), AD-10 (no full contact read — only ids), and AD-1 (no record payload).

**Unit B (new RLS unit).** Adds a separate `loadRecordAvailableContactIds(staff, ids)` in the same module that uses `createSupabaseServerClient()` and the caller's cookies, exactly as `assertManageContactInScope` does (`lib/supabase/manage.ts:991-1009`). It also obeys AD-6, AD-10 and AD-1.

**Concrete incompatibility.** Unit A returns **every attendee id in the programme** for an Admin and every attendee id the service role can see for a Preacher; `recordAvailable` is true for attendees the record endpoint will refuse. The Preacher then gets a premium trigger on an attendee outside their contact RLS scope; the provider opens, `requireRole` passes, `assertManageContactInScope` returns 403, and the trigger is dead. AD-6's stated goal — "prevents a trigger that 403s" — is violated by the most natural implementation in the file the spine names. Unit B returns false for those attendees and keeps the summary fallback.

The second half is independent: Unit A/B both render the trigger based on `recordAvailable` alone. A Volunteer viewing session detail gets `recordAvailable: false` only if the loader computes the role gate; if it computes purely by contact ids and the Volunteer's RLS read (Volunteers have no `caller_role()` branch in the contacts policy, so the RLS read returns nothing — but the service-role read returns everything), the Volunteer can get `true`. The provider's `canReadContacts` gate then silently ignores the open, leaving a visible button that does nothing. AD-5 says "a Volunteer never receives a trigger"; AD-6 never says how. The two ADs need to meet.

**Tightening.** Amend AD-6 and name the helper:

> `recordAvailable` is computed by one helper, `loadRecordAvailableContactIds({ staff, contactIds })`, which:
> 1. returns `[]` unless `staff` is an operational role and, for an Assistant, `staff.patchOwner` is non-null (the same predicate as `ClientStaff.canReadContacts`);
> 2. reads with `createSupabaseServerClient()` under the caller's cookies — **never** `createSupabaseAdminClient`, even inside `lib/sessions/data.ts`;
> 3. selects only `id` and never the contact row.
>
> The flag is `canReadContacts && ids.includes(contactId)`. Every trigger surface renders only when its own `ClientStaff.canReadContacts` is true **and** `recordAvailable` is true; a surface must not render a trigger that the provider's gate would refuse. Add a test: a Preacher's session attendee outside their patch has `recordAvailable: false`; a Volunteer has no trigger on any surface.

This also fixes the Top 5 path: `getSessionsTopAttendees` is a service-role RPC (`:268-299`), so its `recordAvailable` must come from the same helper, not from the RPC's result.

---

## AR-07 — `recordAvailable` disagrees across surfaces for the same Admin and contact

**Severity:** Medium · **Disposition:** discuss
**ADs in tension:** AD-2, AD-6
**Evidence:** AD-2 explicitly allows an Admin to edit a programme contact outside their patch (and forbids commenting on it). AD-6 says Manage Sessions renders a trigger "only when the attendee id is present in `payload.contacts`", and `payload.contacts` is patch-scoped for every role (`lib/supabase/manage.ts:855-862`, `:919-921`). AD-6 says Dashboard Focus/Candidates and Campaign assign are "in manage/campaign scope by construction; every row is a trigger"; for an Admin, `loadManagePortalData` with `mode: "admin"` is programme-wide (`:588-590`, `:646-650`), and campaign scope is the programme for an Admin (`lib/patch-scope.ts:64-66`).

**Unit A (per-surface rule).** Implements AD-6 literally: Manage Sessions gates on `payload.contacts` membership; Dashboard and Campaign gate on the surface's own scope. Both are correct per the AD.

**Unit B (one availability rule).** Implements a single `recordAvailable` helper for all surfaces, as in AR-06, and uses it for Manage Sessions too. This also reads AD-6's consistency convention ("`recordAvailable` is a boolean computed by RLS, never by a client heuristic") as the dominant rule.

**Concrete incompatibility.** For an Admin, a contact assigned to another preacher is:

- visible on Dashboard in `mode=admin` and a trigger there;
- visible in Campaign assign (programme scope) and a trigger there;
- **not** in Manage Sessions' `payload.contacts` (patch scope) and therefore not a trigger there;
- and editable by the endpoint (Admin RLS is programme-wide).

The same contact is a record on two surfaces and plain text on a third. If the Manage Sessions page is viewed with `?mode=preacher`, the same Admin loses the trigger on contacts that were triggers a moment ago. AD-6's "prevents a dead button" is satisfied, but the product rule "the premium record is available wherever a staff member sees a person" is not. This is exactly the "hidden for one it would allow" case in the review brief.

**Tightening (needs a decision).** Amend AD-6 to state one of two rules explicitly:

1. **Programme availability (recommended if the endpoint stays as is):** the record is available to any reader the endpoint admits; `recordAvailable` is computed by the AR-06 helper on every surface, and `payload.contacts` membership is a display fact, not an authorization proxy. Manage Sessions stops using it as the gate. The mode toggle must not change availability.
2. **Patch-only record:** the record endpoint's Admin scope is narrowed to the Admin's patch (a change to inherited AD-5 and to `assertManageContactInScope`), and every surface uses patch membership. Then AD-2's "Admin may edit a programme contact outside their patch" must be removed or scoped to the grid.

Do not leave the current split: it is not a performance optimisation, it is a different authorization story per surface.

---

## AR-08 — Three overlay owners, no layer registry: Escape closes both, and one close unlocks the page

**Severity:** High · **Disposition:** autofix
**ADs in tension:** AD-8
**Evidence:** `ContactRecordDialog` registers `document.addEventListener("keydown", ...)` and calls `event.stopPropagation()` on Escape (`components/manage/contact-record-dialog.tsx:434-457`). `ManageContactRecord` does the same (`components/manage/manage-contact-record.tsx:84-95`). The session summary uses Radix `Dialog` (`components/sessions/session-attendees.tsx:118-120`), which has its own Escape and focus trap. AD-8 says "Escape closes the top record" and "make the background inert and scroll-locked", but never says who owns those effects when two hosts are mounted.

**Unit A (per-host ownership).** Each frame owns its own Escape listener and its own scroll lock, matching the current code. The grid host and the provider are both frames; each does what AD-8 says. The session summary keeps Radix's behaviour. This is fully compliant: every frame captures focus, makes the background inert, scroll-locks, and closes on Escape.

**Unit B (shared registry).** One module-level overlay stack in `contact-record-provider.tsx` (or a `use-overlay-layer` hook) owns Escape, `inert`, and `overflow`. Each frame pushes a layer and pops on close. This also complies with AD-8; it just implements "the top record" as a stack rather than a listener.

**Concrete incompatibility.** With Unit A:

- **Escape:** `stopPropagation()` on a listener attached to `document` does not stop other listeners on the same target; that requires `stopImmediatePropagation()`, and even then registration order decides. If the grid dialog and the provider dialog are both open (possible on a page with a grid host and a dashboard trigger, and certain when the session summary is still open — see AR-12), one Escape closes both, or closes the summary and leaves the record, or closes the record and leaves the summary. The user sees the wrong layer disappear.
- **Scroll lock:** each frame sets `document.body.style.overflow = "hidden"` on mount and `""` on unmount. One close unlocks the page while the other overlay is still open. If a unit saves the previous value, the second close restores the first's "hidden" and the page stays locked forever.
- **Inert:** each frame marks its siblings inert on mount and removes inert on unmount. The provider and the grid host mark *each other* inert; whichever opens second makes the first non-interactive, and the first's close removes the second's inert marker. A Radix modal adds its own `aria-hidden` to the rest of the app, producing nested `aria-hidden` on the record.
- **Focus:** each frame moves focus into itself on mount. Opening the second frame while the first is open moves focus to the second; closing the second restores focus to the first's trigger, which may be inside the first frame's inert subtree.

**Tightening.** Amend AD-8 with a single overlay contract:

> One overlay registry, owned by `contact-record-provider.tsx` and exported as `useOverlayLayer`, owns Escape, scroll lock and background inertness for **every** record frame — the provider's desktop and phone frames and the grid's desktop and phone hosts. A layer pushes on open and pops on close; only the top layer consumes Escape (capture phase, `defaultPrevented` respected), only the top layer owns the scroll lock (ref-counted), and inertness is applied once by the registry, never per frame. Opening a record closes/replaces any open record from any host (grid or provider); the session summary is closed before a premium record opens (see AR-12). The registry exposes `closeTop()` and `replaceTop()` so a host never calls `onClose` behind another layer's back.

If a shared registry is too much for this feature, the minimum is: no `document`-level Escape listeners in frames, one `<dialog>`/Radix primitive for both hosts, and a ref-counted lock — but that is effectively the same contract.

---

## AR-09 — Focus restore targets a trigger that may have unmounted; "replace" is not defined

**Severity:** Medium · **Disposition:** autofix
**ADs in tension:** AD-5, AD-8
**Evidence:** AD-8 says "on open, capture the triggering element ... On close, restore focus to the trigger." AD-7 says Previous/Next move within a sequence; AD-8 says "A second record cannot open over the first; the provider replaces it." The session attendee rows are rendered from a sorted/filtered list; changing the sort (`components/sessions/session-attendee-sort.tsx:18-31`) re-renders the page and can unmount the trigger. The grid's rows are virtualized (`components/grid`), so a row can unmount while the record is open.

**Unit A (capture the element, restore on close).** Stores `triggerRef.current` at open and calls `trigger.focus()` on close. This is the literal AD-8 rule. It is compliant.

**Unit B (capture a restore target).** Stores both the trigger and a stable fallback (the row container, the source's scroll container, or the "Attendees" heading) and focuses the fallback if `!trigger.isConnected`. This also complies — it *does* restore focus to the trigger when the trigger exists, and does something sensible when it does not.

**Concrete incompatibility.** Unit A leaves focus on `document.body` when the trigger unmounted. A keyboard user closes the record and is thrown to the top of the page; the next Tab starts at the skip link. Unit B keeps the user in the list. Both pass AD-8's wording.

The "replace" half is worse. Unit A implements Next as `close()` then `open(nextContact, sequence)`. On close it restores focus to the trigger; on open it captures the trigger again. Between the two records the focus is on the list, and the screen reader announces the list before the new dialog. Unit B implements Next as a provider-internal `moveTo(index)` that replaces the payload without closing the frame; focus stays in the dialog, and Escape still closes once. Both are compliant; the focus behaviour differs, and Unit A can race with the abort of the previous fetch (see AR-16).

**Tightening.** Amend AD-8:

> The provider captures the triggering element **once per open**, not once per record. Previous/Next is a `replace()` that swaps the payload and keeps the frame, focus and scroll lock; it is not a close+open. `close()` restores focus to the captured element only if `element.isConnected`; otherwise it focuses the host-supplied `restoreFocusTo` element (a stable row, heading or scroll container). A trigger surface must pass `restoreFocusTo` when its rows can unmount (virtualized grids, sorted/filtered lists). If neither is available, focus the record's source region and announce the close in a live region; never leave focus on `document.body`.

---

## AR-10 — "The source list supplies the sequence" is not one rule: order, filtering, capture time and replacement all drift

**Severity:** High · **Disposition:** discuss
**ADs in tension:** AD-3, AD-7
**Evidence:** The grid's sequence is `contacts = mirror.rows` (`components/manage/manage-contacts-table.tsx:872-884`), i.e. the **unfiltered payload order**, while the grid's visible order is TanStack's filtered/sorted row model. The comment at `:877-880` claims "the row's position in the *current* order", but sorting happens inside `Grid`, not in `contacts`. The campaign grid sorts its source array before handing it over (`lib/dialer/assignments.ts:561-565`), but its own filters are client-side. The session page sorts by `?sort=name` before rendering (`apps/folk/app/sessions/[sessionId]/page.tsx:78-80`). The dashboard has its own filters.

**Unit A (render-time sequence).** The trigger wrapper receives `sequence` computed from the surface's current rows at render time: grid → filtered/sorted row ids; campaign → visible rows; dashboard → filtered list; session → sorted attendee ids. It passes that array to `openContactRecord` when clicked. This is the natural reading of "in the source's display order" and "the current list's ids". It satisfies AD-7.

**Unit B (open-time sequence).** The surface computes the sequence once when the record opens and keeps it for the session (or the provider stores it in state). This is also natural: AD-7 says "`openContactRecord` accepts `sequence?`", and the provider has no way to know the source re-filtered. It satisfies AD-7.

**Concrete incompatibility.** After the user changes a filter or sort while a record is open (or between opening two records):

- Unit A's Next follows the new visible order; Unit B's Next follows the order at open.
- The grid host's Next follows payload order, the provider's Next follows display order. The same contact's "next" is a different person depending on which host opened it.
- The grid host's mirror includes rows filtered out of the current view, so its chevrons can navigate to a record the user cannot see — violating AD-7's "prevents ... a different list" even though the grid is compliant with AD-3's "own sequence".
- Dashboard "current list" is ambiguous between the server's list and the client's filtered list (Focus has status tabs and search). A unit can pass either.

There is a second drift: AD-7 never says whether an omitted `sequence` **replaces** the previous one or leaves it in place. Unit A calls `openContactRecord({ contactId })` from a surface with no sequence (e.g., a Manage Sessions pill outside the list) and expects chevrons disabled; Unit B treats an omitted sequence as "keep the previous sequence" and navigates the dashboard list from a campaign trigger. Both comply.

**Tightening (needs a decision on filtering).** Amend AD-7:

> `sequence` is the ids of the rows the source is **currently rendering**, in render order, recomputed at click time, not at open time. The trigger wrapper takes a `getSequence(): readonly string[]` and calls it on click. The provider replaces the sequence on every `openContactRecord` call; an omitted `sequence` means "no sequence", never "keep the previous one". If the current contact leaves the sequence while the record is open (a filter changed), Previous/Next clamp to the nearest surviving index; if none survives, both disable. The grid host uses the grid's filtered/sorted row model ids, not the payload array. A surface that cannot know its visible order (e.g., a server-rendered list with client filtering) must pass `undefined` rather than a stale approximation.

If the product intent is "navigate the whole source list, not the filtered view", say so and make the grid pass the payload order too — but then AD-7's "current list's ids" and the grid's behaviour must be reconciled in one sentence, not left to the reader.

---

## AR-11 — The campaign expand control cannot be "in the leading gutter, matching the Contacts grid" without a layout decision

**Severity:** Medium · **Disposition:** autofix
**ADs in tension:** AD-3, AD-6
**Evidence:** The Contacts grid's leading gutter is an **84px** select column containing a drag handle, a 16px serial/checkbox slot, and a 32px expand button (`components/manage/manage-contacts-table.tsx:1351-1438`). The campaign assign grid's leading gutter is a **40px** select column containing only the serial/checkbox slot (`components/campaign/assign-contacts-select.tsx:1051-1115`). Both stop `pointerdown` propagation in the cell (`manage-contacts-table.tsx:1376-1381`; `assign-contacts-select.tsx:1064-1072`). The Contacts expand button is pointer-only: `tabIndex={-1}` and the keyboard route is the row context menu (`manage-contacts-table.tsx:613-617`). Campaign assign does not pass `rowContextMenu` (`:1420-1450` has no `rowContextMenu` prop).

**Unit A (add a slot).** Campaign assign keeps its 40px column and adds the expand control beside the serial/checkbox, because AD-3 says "in the leading gutter". The 40px cell now holds two 16px controls plus padding; the serial and the checkbox already swap in the same 16px slot, so the expand control is a third item. It is compliant with AD-3's placement sentence and with "row selection and row click behaviour are unchanged" — the cell's `stopPropagation` keeps the checkbox and the expand button independent.

**Unit B (match Contacts).** Campaign assign widens the select column to 84px and adds the drag-handle-sized slot (or leaves it empty to preserve the 40px checkbox alignment), "matching the Contacts grid" as AD-3 says. The frozen Name column's offset changes from 40 to 84, which changes the saved-view column sizing and the pinned-offset calculation. It is also compliant.

**Concrete incompatibility.** The two builds differ in column width, frozen offsets, header alignment and saved-view rendering. A saved campaign view created under Unit A (40px) is rendered under Unit B (84px) with a stale `columnSizing`/offset; the Name column is pinned at the wrong x, or the select-all checkbox no longer sits over the row checkboxes. The campaign page's grid and the Contacts grid look different despite "matching the Contacts grid", and a future shared `GridRowExpandControl` has two different parent geometries.

The keyboard half is a second incompatibility. Unit A reuses the Contacts control's `tabIndex={-1}`; campaign assign has no row context menu, so there is **no keyboard route** to the record at all. Unit B makes the control a real button (`tabIndex={0}`); the Contacts grid then gains a tab stop it did not have, changing its keyboard model, which AD-3 says is preserved.

**Tightening.** Amend AD-3 with the control's full contract:

> `GridRowExpandControl` is a real `<button type="button">` with `aria-label={`Expand ${name}`}`; it stops `pointerdown` and `click` propagation so cell focus, row selection and row click are unchanged. The comment-count variant changes only the rendered children and `aria-label` (`Expand to see N comments`); it does not change the control's role, size or tab behaviour. The control lives **inside the existing select column** in both grids; no new column is added. The select column is widened to the same fixed width in both grids (the Contacts 84px value), and the campaign grid's saved-view/frozen-offset expectations are updated in the same change. The control is keyboard reachable in both grids; if the Contacts grid keeps `tabIndex={-1}` for pointer parity, it must supply the row context menu as the keyboard equivalent in campaign assign too — otherwise both get `tabIndex={0}`.

This is autofix if the width is allowed to change; if changing the Contacts grid's 84px is unacceptable, the decision is "campaign stays 40px and the control replaces the serial on hover" — still a decision, but a cheap one.

---

## AR-12 — The session row can open the summary and the premium record at once

**Severity:** High · **Disposition:** autofix
**ADs in tension:** AD-6, AD-8, AD-9
**Evidence:** `SessionAttendees` holds one `selectedId` and renders a `Dialog` from it (`components/sessions/session-attendees.tsx:25-67`, `:118-120`). The desktop table has two buttons per row, both calling `onSelect` (`components/sessions/session-attendee-table.tsx:43-49`, `:64-71`). The premium trigger will be a third control (or a replacement for one of them). AD-6 says `recordAvailable === false` keeps the summary and `true` opens the premium record; AD-9 says the summary is unchanged.

**Unit A (add a trigger).** Leaves both existing buttons on `onSelect` and adds a `ContactRecordTrigger` in the last cell. A `recordAvailable` row now has two affordances: the name/View buttons open the summary, the new trigger opens the premium record. The unit can argue AD-6 is satisfied ("a surface renders a trigger only when ...") and AD-9 is satisfied (the summary is unchanged). It is compliant.

**Unit B (replace the click).** Rewires the name and View buttons: `recordAvailable ? openContactRecord(...) : onSelect(...)`. The summary is only reachable for out-of-scope attendees. It is also compliant: AD-6 says `false` keeps the summary, and it never says `true` must keep the old click target. AD-9 only protects the out-of-scope path.

**Concrete incompatibility.** With Unit A, clicking the name opens the summary; clicking the new trigger opens the premium record. Both overlays can be open at once because `selectedId` and the provider's open state are independent: the summary is a Radix `Dialog`, the record is a custom `role="dialog"`, both `aria-modal`, both with their own Escape and focus trap. Escape closes one, the other stays; the page's scroll lock is owned by two systems. AD-8's "a second record cannot open over the first" does not apply — the summary is not a record — so Unit A is not violating a written rule.

With Unit B, the same row has one click behaviour, no double overlay, and the keyboard route is the same button. The two units look identical in the AD text and different to the user.

**Tightening.** Amend AD-6/AD-9:

> The session summary and the premium record are mutually exclusive. A `recordAvailable` row's primary affordance (name and trailing action) calls `openContactRecord` and must not also call `onSelect`. The summary dialog is closed before `openContactRecord` is called; the provider's overlay registry treats an open summary as a layer that must be popped first. A row renders **one** primary affordance and at most one secondary "View summary" link when `recordAvailable` is true, or the existing summary affordance when false. No surface may render two overlay-opening controls for the same attendee in the same row.

Also state that the summary's Radix dialog and the record frame share the scroll-lock/inert registry (AR-08), or the mutual exclusion is not enough.

---

## AR-13 — The write channel's callback contract, optimism and failed-write re-read are all unspecified

**Severity:** Medium · **Disposition:** autofix
**ADs in tension:** AD-3, AD-4
**Evidence:** AD-4 says "The provider merges `ManageContactWriteResult` into its local contact ... A failed write re-reads the record and surfaces the server's message." It does not say whether the body applies the value optimistically, what `onCommit` returns, or what "re-reads the record" replaces. The grid's commit path applies only the server result (`components/manage/manage-contacts-table.tsx:983-990`, `:999-1027`); its `handleListCommit` is `void`-returning from the body's perspective (`:2533-2535`). The provider may reasonably choose an optimistic update.

**Unit A (result-only, re-read whole payload).** The body shows the old value plus a pending control until the PATCH resolves; on success it merges the result; on failure it calls `GET /record` again and replaces the whole `ContactRecordViewState`, including `history` and `comments`, then shows the error. This is a literal reading of "merges" and "re-reads the record". It is compliant.

**Unit B (optimistic, re-read contact only).** The body immediately writes the new value into `contact` (so the field does not flash back), sends the PATCH, and on failure re-reads only the contact (or merges the last known server value) and shows the error; it deliberately does not replace `history`/`comments` because a comments re-read could wipe an in-flight optimistic comment. This is also compliant: the record *is* re-read, and the provider *does* merge.

**Concrete incompatibility.** On a failed write, Unit A replaces the comments list with the server's list while the user has an unsent composer draft or a pending optimistic comment; the pane's state and the payload state diverge, and the draft may be lost if the pane re-mounts. Unit B keeps the pane but may show a stale contact if the server's rejection was caused by a concurrent change to a different field. On a successful write, Unit A's field shows the old value until the response; Unit B's shows the new value immediately. Both are "one write channel"; the user experience is different, and the integration test that passes for one fails for the other.

There is also a race: Unit A's failure re-read is a second `GET /record` without an abort token tied to the current open. If the user closes or steps to the next record while the re-read is in flight, the re-read resolves and writes the old record into the new one's state. AD-5 says each open owns one `AbortController`; it does not say the failed-write re-read must use it.

**Tightening.** Amend AD-4:

> The body does not optimistically rewrite `contact`; the editor owns the draft and renders a pending state. `onCommit` returns `Promise<ContactRecordWriteOutcome>`; the provider returns `{ ok: true }` after merging `{ ...previousContact, ...result }`, or `{ ok: false, message }` after re-reading **only the contact** from `GET /record` and surfacing the server's message. The re-read uses the open's `AbortController` and is discarded if the record switched or closed. `history` and `comments` are not replaced by a failed-write re-read; a comment draft is never destroyed by a field write failure.

If optimistic updates are wanted, they belong in the editor's local draft, not in the provider's contact; that keeps the failure path deterministic for both hosts.

---

## AR-14 — `sourceOptions`, `booksReadOptions`, `locations` and `locationOptions` can be built differently in the two hosts

**Severity:** High · **Disposition:** autofix
**ADs in tension:** AD-1, AD-10
**Evidence:** The grid builds `sourceOptions` as `KNOWN_SOURCE_VALUES` plus every `contact.source` in the loaded mirror (`components/manage/manage-contacts-table.tsx:971-981`) and passes `payload.booksReadOptions` (`:2532`), which `loadContactsSectionData` builds from the distinct `booksRead` values of the scoped contacts (`lib/supabase/manage.ts:972-974`). The record dialog takes `locations={payload.locationOptions ?? payload.locations}` (`:2529`). AD-1 puts `sourceOptions` and `booksReadOptions` in the payload; AD-10 says "known values or a scoped distinct query, never the full contact set."

**Unit A (known-values unit).** Reads `sourceOptions = KNOWN_SOURCE_VALUES` and `booksReadOptions = KNOWN_BOOKS` (or a static list) in `loadContactRecord`. This is explicitly allowed by AD-10 ("known values") and by AD-1 (the fields are present). It is compliant.

**Unit B (scoped-distinct unit).** Reads the distinct `source` and `books_read` values from the reader's scoped contacts, exactly as the grid does. This is also explicitly allowed by AD-10 ("or a scoped distinct query") and is closer to the grid's existing behaviour. It is compliant.

**Concrete incompatibility.** A contact whose `source` is `"Temple stall"` (a real stored value not in `KNOWN_SOURCE_VALUES`) opens:

- in Unit A with a source picker that does **not** contain its current value; the `select` editor may render blank or refuse to re-commit the unchanged value, so the field looks empty/lost;
- in Unit B with `"Temple stall"` selected, matching the grid.

`booksReadOptions` has the same problem: the grid derives from the scoped contacts, the provider from a static list; a book in the contact's `booksRead` but not in the static list is not offered, and the picker can drop it on the next edit. `locations`/`locationOptions` is the same class: the grid passes `locationOptions ?? locations` but never says whether a contact at an out-of-patch location should resolve its name from `locations` while the picker uses `locationOptions`. Unit A passes `locations` to both; Unit B passes `locationOptions` to the picker and `locations` to the resolver. The dialog's `fieldId === location` row uses the same `locations` prop for both the name and the options, so one of the two units shows "Unknown location" for a real location.

**Tightening.** Amend AD-1/AD-10:

> `sourceOptions` and `booksReadOptions` are built by one shared helper, `loadContactReferenceOptions(staff)`, used by both `loadContactRecord` and `loadContactsSectionData`: the union of the known seed values and the distinct values present in the reader's scoped contacts (for `booksRead`, the distinct elements of the array). The contact's current value is always included even if it is not in the scoped set. No host may substitute a static list for the distinct list or vice versa. `locations` is the full programme lexicon used for name resolution; `locationOptions` is the owner-scoped list used by the picker; the body takes both and never substitutes one for the other. The grid host stops using `locationOptions ?? locations`.

This is autofix and removes a whole class of "the field looks empty" bugs.

---

## AR-15 — The first open has no frame while the lazy chunk loads, so focus, Escape and scroll lock have no owner

**Severity:** Medium · **Disposition:** autofix
**ADs in tension:** AD-5, AD-8
**Evidence:** AD-5 says "The body and frames load through `next/dynamic` with `ssr: false` on first open." AD-8 says "on open, capture the triggering element, move focus into the record, and make the background inert and scroll-locked." The `dynamic` chunk is a network request; the payload is another. Nothing in AD-5's "renders nothing until `openContactRecord` is called" describes what is on screen between the call and the chunk resolving. The consistency conventions list loading/not-found/forbidden/failed states but no "frame loading" state.

**Unit A (body-only lazy).** The provider renders the frame synchronously on open and lazy-loads only `ContactRecordBody` inside it. The frame owns `role="dialog"`, `aria-modal`, focus, Escape and scroll lock from the first tick; the body area shows a spinner until the chunk resolves. This is compliant: the body and frames are lazy (the frame component is small; a unit can argue the dynamic boundary is the body), and AD-8's focus contract has an owner immediately.

**Unit B (whole-frame lazy).** The provider lazy-loads the dialog/frame itself:

```tsx
const Frame = dynamic(() => import("./contact-record-dialog"), { ssr: false })
return open ? <Frame ... /> : null
```

On open, nothing is rendered until the chunk resolves. No `role="dialog"` exists, focus never moves, the background is not inert, and Escape has no handler. This is also compliant with AD-5's words ("the body and frames load through dynamic"), and AD-8's "on open" may be read as "when the frame mounts", which is after the chunk.

**Concrete incompatibility.** On a cold load, Unit B's first open is a blank page with the trigger still focused (or focus lost if the trigger already unmounted); a keyboard user presses Escape and nothing closes; the page behind remains scrollable. Unit A's first open immediately traps focus and closes on Escape. Both pass the AD text; only one is accessible.

A second lazy hazard: a unit that calls `dynamic()` **inside the component render** (rather than at module scope) creates a new component identity on every render, so the chunk remounts and the record flickers/reset on each provider state change. AD-5 does not say "module scope".

**Tightening.** Amend AD-5/AD-8:

> `openContactRecord` synchronously renders a minimal frame shell: `role="dialog"`, `aria-modal="true"`, an accessible name ("Contact record" until the contact loads), focus captured into the shell, background inert and scroll lock acquired. Only the body content is lazy; the frame and the shell are in the initial provider bundle. `dynamic(..., { ssr: false })` is declared at module scope, never created during render. The provider state is `idle | loading | ready | error`; `loading` covers both the chunk and the payload and renders inside the shell. Escape and focus restoration work during `loading`.

---

## AR-16 — Aborted requests can surface as errors, and 403/404 presentation is not pinned

**Severity:** Medium · **Disposition:** autofix
**ADs in tension:** AD-1, AD-5
**Evidence:** AD-5 says each open owns an `AbortController`; closing or switching aborts it. AD-1's consistency conventions say the provider shows "a loading, not-found, forbidden or failed state. A 403 is never rendered as an empty record." The existing history hook treats `controller.signal.aborted` as "not an error" (`components/manage/contact-record-dialog.tsx:269-280`), but that is a local pattern, not an AD. The provider's abort will reject the `fetch` with an `AbortError`.

**Unit A (abort-aware).** Checks `signal.aborted` (or a request id) in the catch and returns to `idle` without setting an error. A 403 sets `{ status: "error", kind: "forbidden", message }` and keeps the frame open with a Close action. This is compliant.

**Unit B (error-on-reject).** Treats any rejected fetch as `failed`, including `AbortError`. Closing the record during the fetch sets an error on an unmounted component (harmless) or, worse, on the *next* record if the provider keeps one state object. Stepping to the next record before the old response lands flashes "Unable to load the record" over the new record. Both units can claim AD-5 compliance (they do abort) and AD-1 compliance (a 403 is not an empty record). The difference is a race the AD does not name.

**Concrete incompatibility.** Close a slow record and immediately open another: Unit A shows the new record cleanly; Unit B shows an error banner from the aborted request, or replaces the new record with the old error. Step Next twice quickly: the same. AD-5's "a stale response overwriting a newer open" is named as a prevention, but the mechanism (a request token, not just an `AbortController`) is not specified, and `AbortController` alone does not prevent a response that already resolved from calling `setState`.

**Tightening.** Amend AD-5:

> Every fetch is tagged with a monotonic request id in addition to its `AbortController`. A response or rejection applies only if its id is the current open's id **and** `!signal.aborted`; an aborted request is never an error and never changes state. Close resets to `idle`; switch resets to `loading` for the new id. 403 renders a forbidden state inside the frame with the server message and a Close action; 404 renders not-found; 401 is left to the shell's auth handling. A failed re-read after a write follows the same rule (see AR-13).

---

## Residual low-severity leaks

These are real but do not change the integration; they should be deferred with a named check rather than blocking.

| ID | Leak | Pair | Tightening |
|---|---|---|---|
| AR-17 | Photo URL is `history.photoUrl` in one unit and a `/api/manage/contacts/photo` fetch in another. The signed URL expires; a long-open record's photo can 403. | Unit A uses `history.photoUrl`; Unit B calls the photo endpoint in the body's photo row. Both comply with AD-1 (the payload includes history) and AD-10 (one record read — the photo endpoint is not the record). | AD-1: `history.photoUrl` is the only photo URL; the body never calls the photo endpoint; a re-open refreshes it. If expiry matters, add `photoUrlExpiresAt` and a re-read on 403. |
| AR-18 | `ContactRecordPayload.contact` is not typed in the AD. Unit A reuses `ManageContact`; Unit B defines `ContactRecordContact` with only the record's fields. A field added to `ManageContact` (a rollup, a new column) appears in one body and not the other. | Both obey AD-1's field list (which says `contact`, not its shape). | AD-1: `contact: ManageContact` (the existing client-safe type), no second contact shape; `contact-record-types.ts` re-exports the alias. |
| AR-19 | `staffNames` completeness. The grid resolves names only for the scoped rows' references (`lib/supabase/manage.ts:923-930`); the provider must resolve the contact's own `assignedPreacherId`/`collectedById` even if they are outside the grid's set. Unit A reuses the grid's `staffNames`; Unit B builds a complete map. | Both obey AD-1 (`staffNames` in the payload); AD-1 does not say "every referenced id". | AD-1: `staffNames` contains every id referenced by `contact` and `history` (caller names), resolved server-side; the body never falls back to a name field. |
| AR-20 | Stale sequence ids. A contact reassigned/deleted between open and Next gives 403/404. Unit A closes the record on the failed move; Unit B keeps the current record and shows the error. | AD-7 only says absent/singleton disables; AD-1 says 403 is not empty. | AD-7: a failed move keeps the current record open, shows the server reason, and leaves the chevron enabled or disables it after the failure; never close silently. |
| AR-21 | Cache across opens. Unit A always re-fetches on open; Unit B caches the payload per contact for the session. Both obey "fetches only on open" (a cache hit does not fetch). | Stale record after another tab's edit; the provider shows a different version than the grid. | AD-10: no cache across opens; closing discards the payload; every open is a fresh `GET /record`. |
| AR-22 | Comments pagination. The payload includes all comments; a unit caps at the latest N and the pane fetches more (a second read), another includes all. The count in the header differs. | AD-10 says "comments when allowed", not "all comments"; AD-2 says `comments` is a `ManageContactCommentList`. | Decide and state: either the payload carries all comments (this feature's size assumption) or it carries the first page + total, and the pane's pagination endpoint is a named exception to "one read". |
| AR-23 | `recordAvailable` N+1. Unit A calls `.in("id", ids)` once; Unit B loops per attendee. Both "intersect". | Not observable except latency on a large session. | AD-6: one set query or RPC, bounded by the attendee count; no per-attendee read. |
| AR-24 | Phone frame scroll lock target. The phone frame is `absolute inset-0` inside the list (`manage-contacts-table.tsx:2564-2576`), not a body-level fixed dialog. Unit A locks `document.body`; Unit B locks the list container. | The header behind still scrolls in A; the list's scroll position is lost in B. | AD-8: the lock target is supplied by the host (`scrollLockTarget`); the desktop dialog locks the body, the phone frame locks its list container. |

---

## AD-by-AD audit

| AD | Verdict | Why |
|---|---|---|
| AD-1 | Leaks | Payload field names are fixed, but the *shapes* of `contact`, `history`, `comments` and the loading/error state are not. Photo URL ownership is implicit. |
| AD-2 | Leaks | `canComment` is well derived, but the pane's data ownership and the `comments` nullability rules are not enough to stop a self-fetch. `canEdit` vs per-field editability is unstated. |
| AD-3 | Leaks | The strongest UI rule, but it never says where the grid host gets history/comments/capabilities, and the `GridRowExpandControl` placement is under-specified against a 40px gutter. |
| AD-4 | Leaks | The merge enumeration is incomplete (`photoPath`, `lastContactedOn`), the callback contract is unstated, and the failed-write re-read scope is unstated. |
| AD-5 | Leaks | Abort is named but the request-token rule, the first-open shell, and the module-scope `dynamic` rule are not. |
| AD-6 | Leaks | `recordAvailable` names the right idea but not the client or the role gate; Manage Sessions uses `payload.contacts` as a proxy; surfaces disagree for an Admin. |
| AD-7 | Leaks | "Display order" is not defined against filters/sorts; capture time and omitted-sequence semantics are open; the grid host's sequence is not covered. |
| AD-8 | Leaks | Focus restore assumes a live trigger; Escape/scroll/inert ownership across three overlays is unstated; the lazy first-open shell has no owner. |
| AD-9 | Sound | The fallback is genuinely left alone; the only risk is AR-12's double-open, which is an AD-6/AD-8 issue. |
| AD-10 | Leaks | "Known values or a scoped distinct query" permits two different option lists; no-cache and pagination are unstated. |

## Proposed spine edits (summary for the author; not applied here)

1. **New AD-11 — one body contract.** Freeze `ContactRecordBodyProps`, `ContactRecordViewState`, `ContactRecordCapabilities`, `ContactRecordWriteOutcome` in `components/contacts/contact-record-types.ts`. Both hosts construct the same `ready` state; the body has one loading/error/ready rendering path.
2. **Amend AD-1.** Name `contact: ManageContact`; make `history.photoUrl` the only photo URL; state that `history` is a ready value in the payload; state that `comments` is a ready list or `null`; add `staffNames` completeness.
3. **Amend AD-2.** The comments subtree is presentational and mutation-only; `canComment` and `comments` are both required; `comments === null` hides the pane; a violation is read-only, not an error; comment mutations reconcile `commentCount`.
4. **Amend AD-3.** The grid host reads the same `GET /record` once per open (retire `/api/manage/contacts/history` as a record read); `GridRowExpandControl`'s button/tab/pointer contract; the select column width and keyboard route in both grids.
5. **Amend AD-4.** Merge by spread; `onCommit` returns an outcome; failed write re-reads only `contact`, under the open's abort token; no optimistic contact rewrite.
6. **Amend AD-5.** Request id + abort; `idle | loading | ready | error`; the synchronous frame shell; `dynamic` at module scope; no cache across opens.
7. **Amend AD-6.** One `loadRecordAvailableContactIds` helper using `createSupabaseServerClient` and the `canReadContacts` predicate; every surface uses it; Manage Sessions stops using `payload.contacts`; the summary and the record are mutually exclusive.
8. **Amend AD-7.** Sequence = currently rendered ids in render order, read at click time; omitted = none; replace on every open; the grid uses its filtered/sorted row model; failed moves keep the record open.
9. **Amend AD-8.** One overlay registry owns Escape, scroll lock and inert; focus restore guards `isConnected` and takes a host fallback; replace is not close+open; Escape unwinds one layer at a time.
10. **Amend AD-10.** One `loadContactReferenceOptions` helper; no cache across opens; decide the comments pagination stance.

## What I did not find

- AD-9's fallback is genuinely insulated; no compliant pair deletes it or extends its read.
- The provider/`AuthProvider` nesting is sound for every page that renders `StaffAuthShell`; all trigger surfaces named in AD-6 are inside one.
- The `MANAGE_CONTACT_WRITE_ROLES` role gate and the `contactInPatch` comment predicate agree today; the risk is a surface using a different proxy (AR-06/AR-07), not the predicates themselves.
- The "no global finder / no deep link" rules are clean; no unit can grow a contact reader from them without violating an explicit prohibition.

---

## Re-check — 2026-11-08 (revised spine)

**Result:** no critical blockers; five high blockers remain. The revision closed the read-path and overlay findings that made the first draft unbuildable. `ContactRecordViewState` + `ContactRecordLoad<T>` is a real shared data contract; AD-7's RLS-client full-row rule and AD-12's `loadContactRecordAvailability` remove the service-role availability trap; AD-10's merge-by-spread removes the `photoPath`/`lastContactedOn` loss; AD-14's one overlay layer removes the per-frame `stopPropagation` race for the provider; AD-9's expand-control paragraph removes the 40px drop-in. The five remaining blockers are all at seams the revision left open: the body's **callbacks** and the hook's **API** (the view state is frozen, the behaviour around it is not), the grid hosts' **sequence**, the grid hosts' **focus/overlay path**, the **location picker**'s use of `locations` vs `locationOptions`, and the **AD-12/AD-16** contradiction for Manage Sessions. Each is a compile-level or observable-wrong-state incompatibility between two units that both quote the revised ADs.

The revised AD numbers (AD-7 … AD-16) supersede the first review's AD-1 … AD-10; the AR ids below are the previous review's.

### Closed by the revision

| Previous finding | Status |
|---|---|
| AR-01 history ownership / false empty state | Closed by AD-9: one `ContactRecordViewState`, `history: ContactRecordLoad`, the grid host uses `useContactRecord`, the `/history` route is retired. |
| AR-02 comments self-fetch | Closed by AD-8/AD-9: the pane is presentational and the load skips the comments read when `canComment` is false. The mutation-callback ownership remains, folded into AR-R1. |
| AR-04 merge drops `photoPath`/`lastContactedOn` | Closed by AD-10: spread, never enumerate. |
| AR-06 availability computed with the service-role client | Closed by AD-7/AD-12/AD-16: `loadContactRecordAvailability` in `lib/contacts/record.ts` uses `createSupabaseServerClient()`. |
| AR-08 Escape/scroll-lock/inert race | Closed for the provider by AD-14's one overlay layer. The grid host's registration is AR-R3. |
| AR-11 campaign expand control | Closed by AD-9: real button, propagation stopped, no selection toggle, keyboard/touch, widened leading column. |
| AR-12 summary + premium double-open | Largely closed by AD-15: in-scope session attendees now open the premium record; the summary is the out-of-scope fallback. The grid host overlay remains AR-R3. |
| AR-14 options drift | Partially closed by AD-7's payload sets. The location picker's `locations` use remains AR-R4. |
| AR-13 write semantics | Partially closed by AD-10's spread. Callback outcome, grid copy, and failed re-read scope remain AR-R1. |
| AR-10 sequence | Not closed — AR-R2. |
| AR-09 focus restore | Partially closed for the provider by AD-14; the grid host remains AR-R3. |

### AR-R1 — The frozen contract stops at data: body callbacks and `useContactRecord` are still open

**Severity:** High · **Disposition:** autofix

AD-9 freezes `ContactRecordViewState` but the body "takes data and callbacks only" and the callbacks are not in the interface. AD-10 says "a host merges" but not what the body's `onCommit` returns. The structural seed names `use-contact-record.ts` but gives no signature. The two units:

- **Unit A.** `ContactRecordBodyProps.onCommit(fieldId, value): Promise<ContactRecordWriteOutcome>`; comments callbacks controlled by the host; `useContactRecord({ contactId, sequence, trigger })` returns `{ viewState, open, close, step, merge, reload }`. The body renders the inline error from the outcome.
- **Unit B.** `onCommit(fieldId, value): void`; the pane owns optimistic insert/rollback; `useContactRecord(contactId | null)` returns `{ state }`. The host surfaces errors through its own notice.

Both obey AD-9 (one view state, data and callbacks) and AD-10 (the host merges). They do not integrate. The grid's current `handleListCommit` is `void`-returning and catches internally (`components/manage/manage-contacts-table.tsx:1271-1308`), so a body expecting an outcome never sees the rejection; a `void` function is not assignable to the Promise-returning prop. The grid host also has two contact copies — `mirror.rows` (`:864-884`) and the hook's `viewState.contact` (AD-9). A write that merges into the mirror through `applyWrite` (`:983-990`) but not the hook leaves the open record's field editor re-rendering the old value; a write that merges into the hook but not the mirror leaves the grid row stale. A failed re-read that replaces the whole view state can wipe an in-progress comment draft. The same gap applies to the comments mutation callbacks: one unit puts optimism in the pane, the other in the host.

**Tightening.** Add to AD-9/AD-10: freeze `ContactRecordBodyProps` and `UseContactRecordResult` in `contact-record-types.ts` / `use-contact-record.ts`; `viewState.contact` is the body's only contact; the grid host's `onCommit` merges into the hook first and mirrors the merged contact into `setContacts`; the failed re-read replaces only `contact` (history and comments retained) under the open's abort token; comment optimism lives in the host, not the pane.

### AR-R2 — The grid hosts' sequence is still not bound by AD-13

**Severity:** High · **Disposition:** discuss

AD-9 says the grid's desktop and phone hosts "keep their own … sequence". AD-13 says "the source's display order" but names `ContactRecordProvider`, `useContactRecord` and "every trigger surface" — not the grid hosts. The current desktop sequence is `contacts` = mirror rows in payload order, unfiltered and unsorted (`manage-contacts-table.tsx:872-884`); the phone host is `manage-contact-list.tsx`, fed `phoneRows` (filtered, `:2204`), and owns `recordId`. The provider's sequence is the source's display order.

- **Unit A.** Desktop = mirror order; phone = `phoneRows`; provider = source display order. This is the current code and is compliant with AD-9's "own sequence".
- **Unit B.** Both grid hosts = the grid's filtered/sorted TanStack row model; the provider = source display order. This is compliant with AD-13's display-order sentence.

The same record's Next is a different contact on desktop, on phone and in the provider. The desktop can step to a row filtered out of the view. The same ambiguity applies to "the current list's ids" for Dashboard Focus (the visible three vs the segment's rows), Campaign assign (visible vs full), and Manage Sessions (payload order vs displayed order). A shared `ContactRecordDialog` prev/next cannot be built against both.

**Tightening.** AD-13: the sequence is the ids of the rows the source is currently rendering, in render order, read at click time; the grid uses its filtered/sorted row model for **both** desktop and phone; every `openContactRecord` replaces the sequence; an omitted sequence means none; if the current id leaves the sequence, clamp to the nearest survivor or disable both. Add a test that the desktop, phone and provider chevrons agree on a filtered grid.

### AR-R3 — AD-14's focus/overlay rule binds the provider, not the grid host

**Severity:** High · **Disposition:** autofix

AD-9 says the grid host keeps its own open state and fetches through `useContactRecord`; AD-14 says "on open, the provider records the triggering element passed to `openContactRecord`". The grid host's open is `setExpandedContactId` (`manage-contacts-table.tsx:837`, `:2527`), not `openContactRecord`. The grid host is not the provider, so AD-14's provider-specific capture never runs for the grid's record.

- **Unit A.** The grid host calls the provider's `openContactRecord` with the trigger and mirrors the open id for its own sequence; the provider owns focus and the overlay layer. This duplicates the open state AD-9 says the grid keeps.
- **Unit B.** The grid host uses `useContactRecord` and its own `ContactRecordDialog`; the shared dialog captures `document.activeElement` and restores it. This is the literal AD-9 path. Focus restore, Escape and stacking are now the dialog's, not the provider's.

Both compile. In Unit B the grid record can leave focus on `document.body`, and a grid record plus a provider record can stack — AD-14 says "the stack closes only the top layer", which permits it — with two different owners and the provider's trigger restore pointing into an inert subtree. The grid is the record path with the most users.

**Tightening.** Put trigger capture and overlay registration in the shared `ContactRecordDialog` / `useContactRecord` contract, not in the provider alone: both the provider's `openContactRecord` and the grid host pass `trigger`; any host's open pushes one layer; a second record from another host replaces or is refused, not stacked; closing restores to the trigger if connected, else the host fallback. This is the remaining half of the previous AR-09/AR-12.

### AR-R4 — `locations` and `locationOptions` are both in the view state, but the location picker's source is unassigned

**Severity:** High · **Disposition:** discuss (one decision) / autofix once decided

AD-7 says "`locations` may be the programme naming set (reference data); `locationOptions` stays the patch owner's set." AD-9's view state carries both. The current `ContactRecordDialog` passes `locations` to every `ManageContactFieldEditor` (`contact-record-dialog.tsx:213-220`), and the grid fills that prop with `locationOptions ?? locations` (`manage-contacts-table.tsx:2529`). The new body's field row has both; no rule says which the editor gets. The location picker reads the `locations` prop; `contactFieldText` reads `resolvers`.

- **Unit A.** The body passes `viewState.locations` (programme) to the editor. The picker offers out-of-patch locations.
- **Unit B.** The body passes `viewState.locationOptions` (patch). The picker is patch-only.

Both are compliant with AD-7's payload sets and AD-9's view state. `parseContactPatch` accepts any location id (`lib/manage/api-handlers.ts:245-258`), so Unit A lets a Preacher assign an out-of-patch location from the record — a widening the grid's picker does not offer. Unit B's current out-of-patch location is not in `locationOptions`, so the field can render blank or lose its value on the next save.

**Tightening.** AD-9/AD-7: the location editor's option list is `locationOptions`; `locations` is the resolver only; the option list carries the contact's current location (or renders it as a current/disabled item) so an out-of-patch value is neither blank nor silently replaced. Apply the same "the editor uses the view-state option lists" rule to `sourceOptions` / `booksReadOptions`.

### AR-R5 — AD-12 and AD-16 disagree about the Manage Sessions availability source

**Severity:** High · **Disposition:** discuss

AD-12's Manage Sessions bullet uses the server-scoped `payload.contacts` set; AD-16 says `loadContactRecordAvailability` "is the only availability read". In `mode=preacher`, an Admin's `payload.contacts` is filtered by `contactInPatch` (`lib/supabase/manage.ts:919-921`); the helper's RLS read for an Admin is programme-wide (`supabase/migrations/20261006010000_scoped_rls_policies.sql:173-182`).

- **Unit A.** Manage Sessions uses `payload.contacts`; the out-of-patch attendee is plain text in `mode=preacher`.
- **Unit B.** Manage Sessions uses the helper; the same attendee is a trigger in `mode=preacher`.

Both quote an AD. The same Admin, same contact, same page mode: one implementation shows the premium record, the other does not; the record endpoint allows both. AD-15's "including every Admin, whose contact RLS is programme-wide" confirms the endpoint's scope, so AD-12's "membership is the manage-scope read" is not the same scope.

**Tightening.** Choose one. Either Manage Sessions uses `loadContactRecordAvailability` and `payload.contacts` is display only (drop the mode dependence), or AD-16 is amended to "the only standalone availability helper; the Manage Sessions contact set is the page's already-scoped read" and AD-12 states that the page mode is the scope. Add an Admin `mode=preacher` fixture with an out-of-patch attendee to pin the choice.

**Addendum result:** no critical blockers; five high blockers (AR-R1 … AR-R5). The first review's top five are closed or narrowed as above. The spine was not edited.

**Final verdict (2026-11-08, third pass):** No critical blockers; three high blockers remain — `CommentActions` is referenced in `ContactRecordBodyProps`/`UseContactRecordResult` but never defined; `UseContactRecordResult.commit` returns `Promise<void>` with no `merge`, so the grid host cannot both update the hook's contact and feed the `ManageContactWriteResult` to `applyWrite`; and the `locations` naming set is still "may be" the programme set while AD-9 requires the resolver to name an out-of-patch location, so a loader that reads it through the RLS client shows Unknown. Everything else from the prior passes is closed.

**Final verdict (2026-11-08, fourth pass):** No critical blockers; one high blocker remains — `CommentActions.create(body: string)` has no `rootCommentId`/reply action, so the existing pane's reply path (which posts `{ contactId, body, rootCommentId }`) cannot be represented and a unit either posts replies as root comments or drops the feature; the `commit`/`applyWrite` and `locations` fixes hold and nothing else from the prior passes remains.
