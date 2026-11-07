---
title: 'Accessibility and interaction review — cross-surface contact record'
type: architecture-review
status: draft
reviewed: 'AD-8 (overlay accessibility and focus contract), AD-3 (one record body, thin frames)'
binds: [AD-3, AD-5, AD-6, AD-7, AD-8]
scope: 'The current record frames and every inline trigger surface named in AD-6'
created: '2026-11-07'
method: 'Static review of the spine and the current source. No browser, screen reader or e2e run was performed.'
verdict: 'AD-8 is the right contract and cannot be implemented as written. The one record frame that exists today violates every clause except role/aria-modal, and AD-5''s openContactRecord signature gives the provider no way to receive the trigger AD-8 requires it to capture.'
---

# Accessibility and interaction review — cross-surface contact record

## 1. What was reviewed

The spine (`ARCHITECTURE-SPINE.md`, AD-3 and AD-8, with AD-5/AD-6/AD-7 read where they bind the trigger) and this code:

| File | What it is today |
| --- | --- |
| `components/manage/contact-record-dialog.tsx` | Desktop record frame. Manual `fixed` overlay, no focus trap, no scroll lock. |
| `components/manage/manage-contact-record.tsx` | Phone record frame. Manual `absolute` overlay, no focus trap. |
| `components/manage/manage-contact-sheet.tsx` / `manage-contact-list.tsx` | The sheet under the phone record, and the host that stacks sheet and record. |
| `components/manage/manage-contacts-table.tsx` | `RowExpandButton`, the row context menu, the desktop dialog host. |
| `components/sessions/session-attendee-table.tsx` / `-cards.tsx` | Existing triggers; a Radix dialog fallback already exists in `session-attendees.tsx`. |
| `components/dashboard/focus-section.tsx` | Server component. Name is plain text; only `Call` is interactive. |
| `components/campaign/assign-contacts-select.tsx` | Selection is checkbox-only; no row menu, no expand control. |
| `components/grid/grid-row.tsx` / `grid.tsx` | The cell-level pointer/keyboard model the trigger sits inside. |

Not verified: real screen-reader output, real touch hardware, browser focus behaviour. The findings below are reads of the DOM/ARIA the code produces and of the Radix primitives it already depends on (`@radix-ui/react-dismissable-layer@1.1.3`, `react-dialog@1.1.4` present in `node_modules`).

Severity: **Critical / High / Medium / Low**. Decision: **autofix** (implement, no debate) / **discuss** (spine or product decision) / **defer** (record only).

## 2. Verdict

AD-8 names the right four failures (focus left behind, Escape closing the wrong layer, a scrolling background, no focus return) and the code fails all four, so this is not a speculative review: the current desktop dialog is a `role="dialog" aria-modal="true"` frame with no trap, no inert background, no scroll lock, no focus capture and no focus restore, and its accessible name is the frame type ("Detail view dialog") rather than the person. The deeper problem is architectural rather than local: AD-5's `openContactRecord({ contactId, sequence? })` never receives the element that opened the record, so the provider cannot satisfy AD-8's first clause, and AD-8's "restore focus to the trigger" has no defined answer when an edit filters the row out or virtualization unmounts it. Escape is broken by construction in three independent ways (a Radix menu/picker prevents the default and the dialog ignores that; the phone sheet and record both listen on `document` and both close; `stopPropagation` never stops sibling listeners on the same node), and the campaign-assign surface has no keyboard route at all, so copying the Contacts `RowExpandButton` verbatim (`tabIndex={-1}`, opacity 0 until hover, no row menu there) would ship a pointer-only, touch-invisible action. The good news: Radix Dialog is already installed and already used by the session fallback, so the focus trap, inert background, scroll lock, focus restore and layered Escape come for free with no new dependency; the work is a frame rewrite plus a small shared overlay stack, a named trigger API, and a labelled expand control that matches the Contacts grid in geometry but not in modality. None of this is a reason to weaken AD-8; it is a reason to make it implementable.

## 3. Findings

| # | Finding | Severity | Decision |
| --- | --- | --- | --- |
| F1 | AD-5's trigger API cannot supply the trigger AD-8 requires; restore has no fallback when the row is gone | High | **discuss** (spine) + autofix |
| F2 | Escape closes the record when the top layer is a menu, picker or inline editor; phone record and sheet close together | High | autofix |
| F3 | No focus trap, no inert background, no scroll lock — `aria-modal` is a claim the DOM does not back | High | autofix |
| F4 | The expand affordance is hover-only and `tabIndex={-1}`; copying it to campaign assign leaves no keyboard or touch route | High (campaign) / Medium (contacts) | **discuss** (AD-3) + autofix |
| F5 | Desktop dialog is named after the frame ("Detail view dialog"), has no `h1`/`h2`, and Next/Previous announce nothing | Medium | autofix |
| F6 | The expand button does not stop `pointerdown`; a press arms the grid's range drag and moves the active cell | Medium | autofix |
| F7 | Read-only field labels are orphaned (`<label for>` points at nothing) on the desktop record | Medium | autofix |
| F8 | Session rows expose two controls for one action; neither trigger names the outcome | Medium | **discuss** (design) + autofix |
| F9 | The scrim is a clickable `aria-hidden` div; icon hit areas are 24px wide; "Close dialog" is not record-specific | Low | autofix |
| F10 | Provider and grid host can hold two open records with no shared owner; reduced motion and overscroll are unhandled | Medium / Low | **discuss** + autofix |

## 4. Findings in detail

### F1 — High — The provider cannot capture the trigger, and "restore to the trigger" has no fallback

**Binds:** AD-8 vs AD-5 and AD-3.

**Evidence.**

- The desktop dialog focuses its own root on mount and does nothing on close:
  - `contact-record-dialog.tsx:415-417` — `rootRef.current?.focus()` in a `useEffect([])`.
  - `manage-contacts-table.tsx:2536` — `onClose={() => setExpandedContactId(null)}`. The frame unmounts; the focused node is removed; focus falls to `document.body`.
- The phone frame has the same shape: `manage-contact-record.tsx:72-74` focuses the root; `manage-contact-list.tsx:275` closes with `setRecordId(null)`.
- AD-5 defines `openContactRecord({ contactId, sequence? })`. There is no `trigger` parameter, no `event`, no ref. `document.activeElement` is not a substitute:
  - Safari does not focus a `<button>` on click, so a pointer open reports `body`.
  - The Contacts keyboard route opens from a Radix context-menu item (`manage-contacts-table.tsx:718-722`), where the active element is a menu item that is about to be unmounted.
  - The campaign route (F4) will open from a button in a virtualized row.
- Restoring a captured element fails in four real cases (all verifiable in this code):
  1. **Virtualization.** `grid.tsx` renders only visible rows; `RowExpandButton` (`manage-contacts-table.tsx:586`) exists only while its row is in the render window. Scrolling the grid while the record is open (nothing prevents it today) unmounts the trigger.
  2. **Filter/sort after an edit.** `expandedContact` is derived: `contacts.findIndex(...)` → `expandedIndex >= 0 ? contacts[expandedIndex] : null` (`manage-contacts-table.tsx:881-884`). An edit that changes a filtered or sorted column removes the row from `contacts`; the dialog unmounts **without calling `onClose`**, so any capture/restore in `onClose` never runs.
  3. **Previous/Next.** `onNext` sets a different `expandedContactId` (`:2542-2546`). The original trigger is now the wrong row; restoring to it points at a different person.
  4. **Phone.** The record's natural return target is the sheet's "Expand contact" button (`manage-contact-sheet.tsx:116-123`), not the list cell two frames down; the sheet stays mounted (`manage-contact-list.tsx:252-277`), so that target is stable and should be preferred.

**What it would take.**

1. Change the API. `openContactRecord({ contactId, sequence?, trigger?: HTMLElement | null })` (or `origin?: { element; restore: () => HTMLElement | null }`). The trigger wrapper passes `event.currentTarget` on pointer/Enter/Space activation; the context-menu path passes the row's identity cell instead. Do not rely on `document.activeElement`.
2. Define the restore chain in the frame, not in each surface:
   ```
   restore = trigger?.isConnected ? trigger
           : document.querySelector(`[data-record-trigger="${contactId}"]`)
           ?? document.querySelector(`[data-grid-row="${contactId}"] [data-grid-cell$="-name"]`)
           ?? sourceContainer            // e.g. [data-grid-scroll], the list root, the section heading
   ```
   A surface-hosted frame (the grid) can implement the middle step locally; the provider-hosted frame needs a `restoreTarget` resolver passed with the open call, because it must not know grid internals.
3. When the resolver finds nothing, do **not** leave focus on `body`. Focus the source container and announce the removal in a polite status region ("Contact record closed. <Name> is no longer in this list."). This is the case where "restore focus to the trigger" is literally impossible; AD-8 needs to say what happens instead.
4. For Next/Previous, prefer the row for the contact **currently on screen**, not the original trigger. If the source uses a roving grid (`grid.tsx:1978-1988` is a single tab stop with `aria-activedescendant`), returning focus to a button inside the row breaks arrow-key navigation until the user tabs back; returning to the row's identity cell (or the scroll container with that row active) is the better target. That is a grid-API question, not a record question, and should be settled before the grid host is rewritten.
5. Close the dialog explicitly when the contact disappears (`expandedContact === null && expandedContactId !== null` → announce + `setExpandedContactId(null)`), rather than letting the render branch silently unmount it.

**Why this is a spine issue, not just code:** AD-8's first and last clauses are unimplementable against AD-5's signature, and its restore clause has no failure branch. Fix the words before three surfaces implement three different answers.

### F2 — High — Escape closes the wrong layer, and on the phone closes two layers

**Binds:** AD-8 ("Escape closes the top record"), AD-3.

**Evidence.** `contact-record-dialog.tsx:434-457` binds a **bubble-phase** `keydown` listener on `document`:

```ts
if (event.key === "Escape") {
  event.stopPropagation()
  onClose()
  return
}
```

1. **Nested Radix layers.** `DropdownMenu` (`:527-547`), `Select`, `Popover`/`Calendar` in `manage-contact-field-editor.tsx`, and any open combobox all use Radix `DismissableLayer`. Its Escape listener is registered on `document` in the **capture** phase, and on dismissal it calls `event.preventDefault()` but **not** `stopPropagation` (`@radix-ui/react-dismissable-layer@1.1.3`, `useEscapeKeydown`). The event then bubbles to the dialog's listener, which ignores `defaultPrevented` and closes the record.
   - Result: Escape in "More options" dismisses the menu **and** the record.
   - Result: Escape while a location/source picker is open closes the record instead of the picker.
   - Result: Escape in an inline field editor (`manage-contact-field-editor.tsx:273-278, 303-313`) calls `preventDefault()` to revert the draft, then the record still closes. The editor's own contract — "Escape puts the field back to the value it had" (`:64`) — is broken.
2. **Two manual frames on the phone.** `ManageContactSheet` (`manage-contact-sheet.tsx:65-76`) and `ManageContactRecord` (`manage-contact-record.tsx:84-95`) each add a document bubble listener. The sheet mounts first (`manage-contact-list.tsx:258`) and its listener is registered first; the record mounts second (`:269`). On Escape the dispatcher runs the sheet's listener first (closes the sheet), then the record's (closes the record). **Both frames close in one keystroke**, which is exactly what the comment at `manage-contact-record.tsx:76-83` says must not happen.
3. `stopPropagation()` does not help in any of these cases: it stops propagation to *other nodes*, not other listeners on the same `document` node (`stopImmediatePropagation` would, but then registration order decides the winner, which is not a contract).

**What it would take.** One owner for Escape:

- A module-level layer stack (`lib/ui/overlay-stack.ts`): `push(id)`, `pop(id)`, `top()`. Pure, so it is unit-testable in the repo's node-only Vitest layer.
- One document listener, **bubble** phase, owned by the top frame (or one global listener that dispatches to the top):
  ```ts
  if (event.defaultPrevented) return   // Radix menu/picker/field editor already handled it
  if (stack.top() !== myId) return
  close()
  ```
  Checking `defaultPrevented` is what makes the Radix capture handlers win; the stack is what makes the phone sheet lose. Drop the `stopPropagation()` calls — they are no-ops here and mislead the next reader.
- If the frame becomes Radix Dialog, `DismissableLayer` already implements exactly this stack, **but only if every frame is Radix**. Converting the record while leaving `manage-contact-sheet.tsx` manual reintroduces the double close (Radix closes the record; the sheet's bubble listener still fires). Convert both or run both through the house stack.
- Test the three cases explicitly; the comments in the two files currently assert the opposite of the behaviour.

### F3 — High — No focus trap, no inert background, no scroll lock

**Binds:** AD-8 ("move focus into the record, and make the background inert and scroll-locked").

**Evidence.**

- The desktop frame is `role="dialog" aria-modal="true"` on a `fixed inset-0 z-50` overlay (`contact-record-dialog.tsx:479-500`). The scrim is `aria-hidden` (`:481`). Nothing marks the page behind inert, and nothing intercepts Tab. The header links, the grid toolbar, the grid scroll container (`grid.tsx:1983`, `tabIndex={0}`) and every visible row control stay in the tab order behind the scrim. `aria-modal="true"` tells assistive technology the rest is unavailable while the keyboard still walks into it — a false claim, and the exact failure AD-8 lists.
- The phone frame (`manage-contact-record.tsx:98-106`) is `absolute inset-0 z-50` inside the list root. The list's search input and every row button stay tabbable behind it. Both the sheet and the record carry `aria-modal="true"` at once, so the accessibility tree exposes two modal frames at the same time.
- Scroll is not locked. This is currently masked on `/manage` because the shell is `h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] overflow-hidden` (`apps/folk/app/manage/page.tsx:92`), so the page cannot scroll there. It is **not** masked on the other AD-6 surfaces: `/dashboard` and `/sessions/[id]` scroll the document, and the provider-hosted frame there will move the page behind the record on wheel/touch. A test that only runs on `/manage` will pass and prove nothing.
- Two smaller consequences of the manual overlay:
  - `contact-record-dialog.tsx` is rendered inside `<main>`, and `PageTransitionController` animates `main` with `y: 8` (`components/page-transition-controller.tsx:17-27`). A `position: fixed` descendant of a transformed element is fixed to that element, so opening a record within the 220 ms transition window can mis-position the overlay. Portaling removes the class of bug.
  - The dialog measures the page header (`:400-413`) to set `top`. That is a layout dependency on an element the dialog is supposed to be modal over; if the header's stacking or the portal changes, the number silently drifts.

**What it would take.** Radix Dialog is already in the repo (`components/ui/dialog.tsx`) and already used for the out-of-scope session summary (`components/sessions/session-attendees.tsx:6,104`). Map the frame onto it:

```tsx
<Dialog open onOpenChange={…}>
  <DialogPortal>
    <DialogOverlay className="fixed inset-0 z-50 bg-black/25" />
    <DialogContent
      showCloseButton={false}
      aria-labelledby={titleId}
      onCloseAutoFocus={(e) => { e.preventDefault(); restoreFocus() }}
      className="fixed inset-x-3 bottom-3 top-[var(--record-top)] …"
    >
      <DialogTitle id={titleId} className="sr-only">Contact record: {contact.name}</DialogTitle>
      …
```

What that buys, clause by clause: FocusScope traps Tab and restores to the previously focused element (override it with the F1 chain); `DismissableLayer` handles Escape by layer (F2); `react-remove-scroll` locks the document; `hideOthers` (aria-hidden + `pointer-events: none`) removes the background from the accessibility tree; `aria-modal` becomes true. Caveats:

- Radix uses `aria-hidden`, not the literal `inert` attribute. If the spine means the attribute (it also blocks find-in-page and text selection), add it explicitly; if it means "unreachable to pointer, keyboard and AT", Radix satisfies the intent. Decide which, so the implementation is not judged against a word it cannot meet.
- `DialogPortal` renders to `document.body`. The theme tokens live on `:root` in both apps (`apps/folk/app/globals.css:46,169`; `apps/gita-life/app/globals.css:41,184`), so `--program-text`, `bg-card`, etc. survive the portal. The phone frame needs `container={listRoot}` to keep covering the list rather than the viewport.
- The frame starts under the page header by design. Radix's top layer will paint above the sticky header (`components/header.tsx:304`, `z-50`) and its scrim will dim the header. The current overlay already does that (the overlay is later in DOM at equal z-index); the `top` offset keeps the dialog body clear of it. Keep the measurement, but move it into a CSS variable or a shared hook rather than leaving it in one frame.
- A native `<dialog>` + `showModal()` is the dependency-free alternative (top layer, inert background, UA Escape, `cancel` event). It cannot cover the phone's list-local frame without a top-layer layout change, its two stacked dialogs need explicit `cancel` routing, and focus restore is still manual. Radix is the smaller change here.

### F4 — High for campaign assign, Medium for contacts — The expand affordance has no keyboard or touch route to copy

**Binds:** AD-3 ("The campaign assign grid uses one generic `GridRowExpandControl` … matching the Contacts grid"), AD-6.

**Evidence (current `RowExpandButton`, `manage-contacts-table.tsx:586-639`).**

- `tabIndex={-1}` and, without comments, `opacity-0 transition-opacity [tr:hover_&]:opacity-100`. At rest it is invisible and unreachable by Tab. The only keyboard route on Contacts is the row context menu's "Expand record" (`:718-722`), reachable with Shift+F10/Menu — a route a keyboard user has to know exists.
- `focus-visible:opacity-100` (`:626`) is dead code: the button cannot receive focus from Tab. It only fires if something programmatically focuses it.
- The hover variant is the arbitrary `[tr:hover_&]`, not Tailwind's `hover:` variant, so it is **not** gated by `@media (hover: hover)`. On touch, `:hover` sticks after a tap — after the tap has already been consumed by the cell — so the control appears only once you no longer need it. A `<768px` device gets the phone list (`hooks/use-mobile.ts`, `max-width: 767px`), but a 768–1024px tablet gets this grid, which is exactly the touch case.
- With comments the control becomes a permanently visible "N 💬" (`:622-636`), so the affordance is visible only on rows that have comments. Users learn "speech bubble = comments", not "the left gutter expands".
- The label loses the name when a count exists: `Expand to see 2 comments` (`:605-607`). In a list of rows read out of context, that does not say **whose** record opens.

**Campaign assign specifically.** `assign-contacts-select.tsx:1438-1461` passes `rows`, `columns`, `getRowId`, `state`, `onRowSelectionChange`, `ariaLabel`, `density`, `transient`, `onClearFilters` — and **no `rowContextMenu`**, no row lifecycle. There is no Shift+F10 equivalent. If the generic control copies `tabIndex={-1}` + hover-only, campaign's "expand record" action is:

- unreachable by keyboard (no menu, not tabbable),
- invisible on touch until after a tap (opacity 0, hover-only),
- reachable by a screen reader in browse mode (a `<button>` stays in the tree despite `tabIndex={-1}`), so the action exists but has no keyboard path — WCAG 2.1.1 with an equivalent that does not exist.

Copying the Contacts control is therefore copying a defect into the one surface where its compensating route is absent.

**What it would take.**

- The generic `GridRowExpandControl` should match the Contacts grid in **geometry and label**, not in modality. Give it:
  - always visible on coarse pointers (`pointer-coarse:opacity-100` — Tailwind 4.1 supports the variant; or a `@media (pointer: coarse)` rule),
  - reveal on `:focus-visible` **and** on row `:focus-within`/selected,
  - a label that always names the person: `Open record for ${name}` and, when counted, `Open record for ${name} (2 comments)`,
  - a minimum target of 32×32 (the current glyph wrapper is 24×24; AD-3's 84px gutter has room).
- Keep `tabIndex={-1}` only if the grid gains a documented row-level keybinding that opens the focused row **and** campaign gets the same row context menu. The grid is a single tab stop by design (`grid.tsx:1978-1988`); adding N tabbable buttons per row breaks that model, so the honest choice is one of:
  1. add "Open record" to the row context menu in both grids (cheapest, consistent, already built on Contacts), **and**
  2. add a grid keybinding (`Enter` on a non-editing row, or `Ctrl/Cmd+Enter` if `Enter` must stay "edit") exposed via `aria-keyshortcuts` and the grid's help text.
  Then the gutter button can remain a pointer convenience with a real keyboard equivalent, which is what WCAG 2.1.1 requires.
- If the design insists the control be hover-only on fine pointers, it must still be focusable and become visible when focused. Invisible-until-hover is acceptable as a *visual* treatment; invisible-until-hover as the *only* route is not.

**Decision:** discuss, because AD-3's "matching the Contacts grid" is the sentence that would authorise the copy. Amend it to say "matching the Contacts grid in geometry and label; reachable without hover".

### F5 — Medium — The dialog is named after its frame, has no heading, and announces nothing on Next/Previous

**Binds:** AD-8 ("an accessible name").

**Evidence.**

- `contact-record-dialog.tsx:495` — `aria-label="Detail view dialog"`. A screen reader announces the widget type, which the role already says, and not the person the user opened. The phone frame does this correctly (`manage-contact-record.tsx:103` — `Contact: ${contact.name}`).
- No `h1`/`h2` in either frame. `RecordSection` starts at `h3` (`contact-record-dialog.tsx:302`) with no `h2` above it, so heading navigation jumps a level and lands on "Attendance"/"Campaign history" with no parent. The comments pane is a `<section aria-label="Comments">` with a `<header>` of plain spans and no heading at all (`contact-comments-pane.tsx:857-906`).
- Previous/Next replace `contact` without any announcement (`manage-contacts-table.tsx:2537-2546`; the frame stays mounted and only `useContactHistory` refetches, `:252-283`). A screen-reader user presses Next and nothing says the record changed.
- Related focus loss: pressing Next until the last record flips `canGoNext` to false (`:2547-2548`). The focused Next button becomes `disabled`; Chromium and Firefox blur a disabled focused control, so focus leaves the dialog even before it closes. A trap would move focus to the frame; without one it goes to `body`.

**What it would take.**

- Name the frame for the record, from props, not from the live input:
  ```tsx
  <h2 id={titleId} className="sr-only">Contact record: {contact.name}</h2>
  <div role="dialog" aria-labelledby={titleId} …>
  ```
  Do **not** point `aria-labelledby` at the editable name input: its accessible-name computation changes on every keystroke, so a screen reader re-announces the dialog title while the user types.
- Promote `RecordSection` to `h3` under the new `h2` (it already is `h3`; the missing `h2` is the bug), and give the comments pane an `h3` "Comments".
- Add a polite status region for stepping: `<p role="status" className="sr-only">Viewing {name}, {index + 1} of {total}</p>`, updated when `contact.id` changes, or an `aria-live` announcement in the frame header. Announce the end of the sequence too ("Last record").
- If the Alt+Arrow shortcuts stay, expose them (`aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"`) and keep them out of the way of an open editor: the handler currently fires on any Alt+Arrow, including inside a text field (`:442-451`). Gate it on `event.defaultPrevented` and on the target not being an editable control.
- Consider keeping the Next/Prev buttons enabled but `aria-disabled` rather than `disabled`, or move focus to the frame before disabling, so the last press cannot drop focus.

### F6 — Medium — The expand button does not stop `pointerdown`; it arms the grid's range drag

**Binds:** AD-3 ("Its row selection and row click behaviour are unchanged"), the grid's pointer model.

**Evidence.** `grid-row.tsx:434-445` runs `onCellPointerDown(row.id, cell.columnId, event.shiftKey)` for every pointer press inside a cell, and the shared keyboard hook treats a press as arming a range drag. `RowExpandButton` (`manage-contacts-table.tsx:609-627`) has no `onPointerDown`, so:

- pressing it moves the grid's active cell into the leading gutter (the wrong cell to return to),
- dragging from it paints a cell range across rows,
- on the campaign grid, the same cell holds the selection checkbox, whose wrapper already stops pointerdown for exactly this reason (`assign-contacts-select.tsx:1064-1071`).

There is no `onRowClick`/row-activation in `components/grid/grid.tsx` or in `assign-contacts-select.tsx` today, so "row click selects" is latent rather than present. The guard is still needed before the generic control ships, because the moment a row-click is added, an un-stopped click would both open the record and toggle selection.

**What it would take.** In `GridRowExpandControl`:

```tsx
onPointerDown={(e) => { e.stopPropagation() }}   // don't move the active cell, don't arm a range
onClick={(e) => { e.stopPropagation(); onExpand(id) }}
```

and keep it outside the checkbox's `<label>`/wrapper so the checkbox's `aria-label="Select X"` and the control's label never merge. If a row-level click-to-select is added later, the expand control must not be inside the clickable row element.

### F7 — Medium — Orphaned labels on the desktop record

**Evidence.** `RecordFieldRow` always renders `<label htmlFor={inputId}>` (`contact-record-dialog.tsx:188`), then chooses between `ManageContactFieldEditor` (which receives `inputId`, `:212-221`) and a plain `<div><span>{value}</span></div>` (`:222-231`) for non-editable fields. For a read-only field nothing carries `inputId`, so the label points at a nonexistent element. `isContactFieldEditable` is `CONTACT_FIELD_PATCH_KEY[id] !== null` (`manage-contact-fields.ts`), which covers the rollups, `Collected By`, `Initial Contact`, `Favorite`, and the counts: a screen-reader user reaches "247" with no "Total attendance" association.

The phone frame already does this correctly with `<dt>`/`<dd>` (`manage-contact-record.tsx:147-193`), so the shared body should adopt that shape for read-only rows (or `aria-labelledby` on the value span). This is body work, not frame work, and it should land with AD-3 rather than be duplicated per host.

### F8 — Medium — Session rows expose two controls for one action; neither trigger names the outcome

**Evidence.**

- `session-attendee-table.tsx:43-49` makes the name a `<button>` whose accessible name is just the name; `:64-71` adds a second button labelled `View ${name}`. Two tab stops, two identical actions, and the first does not say what it does.
- `session-attendee-cards.tsx:23-45` makes the whole card a button; its name is the concatenation of name, phone and "N sessions". That is acceptable and useful, but it means the phone number cannot be selected to copy.
- `focus-section.tsx` is a server component; the name is a `<p>` (`:71`) and the only interactive element is the `tel:` link (`:75-82`). A row-level `onClick` here would fail 2.1.1/4.1.2 and swallow the `Call` link; AD-6's "every row is a trigger" must be implemented as a **client trigger on the name**, with `Call` as a sibling.

**What it would take.**

- One control per session row: keep the name button with `aria-label={`Open contact record for ${attendee.name}`}`, and either remove the trailing "View" button or mark it as a duplicate for pointer users (`tabIndex={-1}`, `aria-hidden` on the visible label). Do not leave two tab stops for one action.
- Button, not link: correct as-is, because the record has no URL (`session-attendee-table.tsx:10-12`). Keep it.
- Dashboard: import a `ContactRecordTrigger` client island (the spine's `components/contacts/contact-record-trigger.tsx`) around the name. `aria-label={`Open contact record for ${row.name}`}`. Do not wrap the whole `<li>`; if a full-row hit area is wanted, use a stretched pseudo-element on the name button with the `Call` link stacked above it (`relative z-10`), never nested interactives. Selection of the reason text and phone stays intact.
- Once the trigger is a name-only button, the text-selection concern is limited to the name itself; the phone/reason remain selectable.

### F9 — Low — Scrim, hit areas, close naming

- The desktop scrim is `<div aria-hidden="true" onClick={onClose}>` (`contact-record-dialog.tsx:480-484`). It is a mouse-only dismissal path with no role, no name and no keyboard equivalent. The phone sheet already solves this correctly: the scrim is a `<button aria-label="Close sheet">` (`manage-contact-sheet.tsx:80-89`, with a comment explaining why). Copy that pattern for the record; a touch user gets a large dismiss target and AT gets a control.
- Header icon buttons are `h-12 w-6` — 24px wide (`:139-155`). That meets WCAG 2.5.8's 24×24 minimum but is half the 44px comfortable target, and it is the only way out of a 1104px frame. Widen the close button's hit area (the wrapper can stay 24px visually).
- `aria-label="Close dialog"` (`:574`) should be "Close contact record" so the name is meaningful out of context and matches the phone frame's "Close" upgrade.

### F10 — Medium / Low — Two frames can be open, and the motion/scroll details

**Two open records.** AD-8 says "A second record cannot open over the first; the provider replaces it." That is true **within** the provider. The grid host keeps its own `expandedContactId` (`manage-contacts-table.tsx:837`) and is not the provider, so on the Contacts page — where `ContactRecordProvider` is mounted once in `StaffAuthShell` (AD-5) — both states can be non-null. Nothing coordinates them: two `role="dialog"` frames, two scroll locks, two Escape listeners. AD-8's guarantee needs a single record slot (move the grid's open state into the same store, or have each open call close the other). This is the strongest argument for the deferred convergence, and it should be decided before the second host is written, not after.

**Reduced motion.** Neither record frame animates today; the only motion on the trigger is `transition-opacity` (`manage-contacts-table.tsx:624`) and the header buttons' `transition-[background-color,opacity]` (`:148`). Add `motion-reduce:transition-none` when the generic control lands. If a slide/fade is added to the phone frame, gate it on `prefers-reduced-motion` the way `page-transition-controller.tsx:13` and `live-sessions-band.tsx:115` already do.

**Scroll behaviour.** Give the record's inner scroller `overscroll-contain` so a trackpad fling at the end of the field list does not chain to the page/list behind. The scroll lock must not shift layout when the scrollbar disappears; `scrollbar-gutter: stable` on `html` (or Radix's padding compensation) is the cheap fix.

## 5. Proposed AD-8 amendment — for discussion, **not applied**

The spine was not edited. If the architect accepts F1/F2/F4/F10, the smallest wording that makes AD-8 implementable:

> **AD-8 — Overlay accessibility and focus contract**
>
> **Binds:** `contact-record-dialog.tsx`; `contact-record-phone.tsx`; `ContactRecordProvider`; the grid hosts; `GridRowExpandControl`.
>
> **Prevents:** focus left on the page behind; Escape closing the wrong layer; a scrolling background; no focus return to the trigger; a record frame that cannot say who it is showing.
>
> **Rule:** `openContactRecord({ contactId, sequence?, trigger?, restoreTarget? })` receives the element that opened the record — the trigger passes `event.currentTarget`; a context-menu open passes the row's identity cell. On open, record the trigger, move focus into the frame, make every sibling of the frame inert and lock the host page's scroll. On close, restore focus in this order: the trigger if it is still connected; the row or `[data-record-trigger]` for the contact **currently on screen**; the source list's focusable container. Never leave focus on `body`. If the contact is no longer in the list, focus the container and announce it in a polite status region. One overlay stack owns `Escape`, `inert` and the scroll lock per document; `Escape` closes only the top frame, a nested menu or picker closes before the frame, and a handler must ignore an event whose default is already prevented. The frame carries `role="dialog"`, `aria-modal="true"` and an accessible name that identifies the record — "Contact record: <name>" supplied from props, never read from the editable name input. The phone frame follows the same contract and prefers the sheet's "Expand contact" control as its restore target. A second record cannot open over the first anywhere in the app: the provider and the grid host share one record slot.

And the one-line AD-5 change: `openContactRecord({ contactId, sequence?, trigger?, restoreTarget? })`.

And the AD-3 sentence: replace "matching the Contacts grid" with "matching the Contacts grid in geometry and label; its keyboard and touch routes are at least those of the surface it sits on — no action may be reachable by hover alone".

And a sentence in AD-8 or AD-3 for the campaign control: "The leading-gutter control always names the contact, is visible on coarse pointers, and has a non-pointer route (the row context menu or a documented grid key)."

## 6. Verification plan (what I would test, not what was run)

The repo's testing contract applies: e2e only through `pnpm test:e2e` / `test:e2e:*` with regex filters, one runner at a time, never a bare `playwright test`.

**Unit (Vitest, node — no DOM).** The overlay stack as a pure module: push/pop ordering, `top()` after out-of-order close (a frame unmounting underneath), and the `defaultPrevented` gate as a pure predicate. Keep the DOM wiring out of the unit test; node has no `document`.

**Playwright, `/manage/contacts/grid`.**
1. Open via the row context menu, press Escape once with "More options" open: the menu closes, the record stays; press Escape again: the record closes. Same with an open location picker and with an inline text editor mid-draft (the draft must revert, the record must stay).
2. Open, Tab 40 times: focus never leaves the dialog. Assert `document.activeElement` is inside `[role=dialog]` on every step.
3. Open, edit the filtered column so the row leaves the filter, close: the dialog closes, focus is on the grid container (not `body`), and a status message names the disappearance.
4. Open the second row, Next twice, close: focus is on the **third** row, not the first.
5. `getByRole("dialog", { name: "Contact record: <name>" })`; `getByRole("button", { name: "Open contact record for <name>" })`.
6. Keyboard only: focus the grid, move to a row, open the record without a pointer (context menu or the new key), and return.

**Playwright, `campaign assign`.** With the new control: Tab reaches the expand control (or its documented key/menu equivalent); the control opens the record; Space on the row checkbox only toggles selection and does not open the record; a touch viewport (e.g. 834×1112) shows the control at rest; a press-and-drag from the control selects no cell range.

**Playwright, `/sessions/[id]` and `/dashboard` (the provider host).** This is where the document scrolls: assert the page does not scroll while the record is open, and that Tab stays in the frame. Assert one control per attendee row and its accessible name.

**Playwright, phone `<768px`.** Open sheet → expand record: Escape once closes the record and leaves the sheet; Escape again closes the sheet; Tab from the last record field does not reach the list behind.

No axe package is added: the spine's Stack says this feature adds no dependency, and Radix is already present. The assertions above are the ones a human would otherwise have to repeat.

## 7. Patterns to keep

- The trigger being a `<button>`, not a link, is correct — the record has no URL, and AD-6 rules out a deep link (`session-attendee-table.tsx:10-12`).
- The sheet's scrim-as-button is the right pattern (`manage-contact-sheet.tsx:80-89`); reuse it, do not invent a third dismissal style.
- `aria-pressed` on the comments toggle and search toggle is correct (`contact-record-dialog.tsx:566`; `contact-comments-pane.tsx:878`).
- Decorative glyphs are consistently `aria-hidden` across the record, the session table and the dashboard; keep that in the shared body.
- The phone view not mounting the grid underneath (`manage-contacts-table.tsx:2552-2563`) is exactly the right call and should survive the refactor; the provider-hosted desktop frame should meet the same bar via `inert`.
- The record's editable name as a labelled title is fine as a visual pattern; it just must not be the dialog's accessible name (F5).

## 8. Deferred and out of scope

- The shared Grid exposes `role="group"` with `aria-activedescendant` (`grid.tsx:1981-1987`), which is not a valid combination (activedescendant requires a composite widget role). Pre-existing, not caused by this feature; record it rather than fix it inside this change.
- The out-of-scope session summary stays on its Radix dialog and its wider endpoint (AD-9). It is the correct model for the new frame; do not change its read.
- A global contact finder, URL deep link and route-based phone record remain deferred per the spine.
- A design-system `useModalLayer` hook versus Radix: this review recommends Radix because it is already installed and used, not because a hook could not work. If the house prefers a hook, the stack + `defaultPrevented` gate above is the minimum it must implement, and the phone sheet must move to it in the same change.

## Addendum — re-check against the revised spine (2026-11-08)

Re-read AD-7 through AD-16. **Cleared by the revision:** the provider path now mounts inside Radix Dialog or one shared stack with no per-frame document keydown, top-layer Escape, inert background and scroll lock (AD-14); the frame is named for the contact and sections start at `h2`; stepping announces the new contact; `openContactRecord` takes the trigger and defines a connected/disconnected fallback (AD-11/AD-14); the campaign expand control is a real labelled button that stops propagation and widens the leading column (AD-9). F1's API contradiction, F3, F4's intent, F5, F6 and F7 are addressed on paper.

Four high-severity items remain. None is critical.

### H1 — High — Campaign's "reachable by keyboard" button collides with the shared grid's key handler

AD-9 requires the campaign control to be "reachable by keyboard and touch", but the grid it lives in owns every key. `use-grid-keyboard.ts:66-76` treats only `INPUT`, `TEXTAREA`, `SELECT` and Radix popper content as guarded; a `<button>` is not. `handleContainerKeyDown` (`:1900`) then intercepts, for any other descendant:

- `Tab` (`:1948-1958`) — `preventDefault()` + `moveTab`, so a button inside the scroll container can never be reached by Tab, and Tab pressed while on it is re-routed to the grid cells;
- `Enter` (`:1973-1990`) — opens the active cell's editor and `preventDefault()`s, cancelling the button's native activation;
- `Space` (`:2042`) — `preventDefault()` + `toggleCheckboxCell`, so it toggles the active row's checkbox instead of pressing the button.

The obvious implementation of AD-9 therefore fails its own requirement: the button is visible, labelled and pointer-operable, but keyboard-only users cannot focus or activate it, and Space can toggle the wrong row's selection. AD-9 does not bind `components/grid/use-grid-keyboard.ts`, and the structural seed does not include it, so the required mechanism has no home.

**Fix:** bind `use-grid-keyboard.ts` in AD-9 and either (a) extend `isGuardedTarget` / the container handler to yield `Tab`, `Enter` and `Space` to `[data-grid-row-expand]` (and any `BUTTON`/`A` in a cell), or (b) name a non-button keyboard route — campaign gets the row context menu's "Expand record" and/or a documented grid key — and say that the button is the pointer/touch affordance for that route. Without one of these, AD-9 is not implementable as written.

### H2 — High — The field sheet still closes with the record on Escape

The phone record becomes a Radix Dialog: Escape is handled on `document` in the **capture** phase and the layer calls `preventDefault()` but not `stopPropagation` (`@radix-ui/react-dismissable-layer@1.1.3`). `manage-contact-sheet.tsx:65-76` still registers its own **bubble**-phase `document` Escape handler with no `defaultPrevented` check, and neither AD-14 nor AD-9 binds it (the structural seed omits `manage-contact-sheet.tsx`). One Escape on the phone closes the record (Radix), then the sheet (bubble) — the same double close F2 reported, and the "closing the record returns to the sheet" contract is lost.

**Fix:** bind `manage-contact-sheet.tsx` in AD-14/AD-9 and move it onto the same Dialog/stack, or at minimum change its handler to `if (event.defaultPrevented) return` before `onClose()`. Test the pair: Escape once leaves the sheet, twice leaves the list.

### H3 — High — The trigger-capture clause is provider-only, but the two existing hosts do not use the provider

AD-9 keeps the Contacts grid host and the phone host (`manage-contact-list.tsx`) on their own open state; AD-11's `openContactRecord` belongs to the provider. AD-14 then says "On open, **the provider** records the triggering element passed to `openContactRecord`". Neither existing host calls it, so by the letter of the spine the primary surface has no recorded trigger and no restore; the `binds` list includes "the grid hosts" but the operational sentence does not. This is the same gap as F1, moved rather than closed.

**Fix:** make the subject "the host" and state that the grid host captures the row's expand control and the phone host captures the sheet's "Expand contact" control, then passes it to its frame. The provider path is one instance of the same rule, not the whole rule.

### H4 — High — The disconnected fallback target is not focusable

AD-14's fallback is "the nearest `main h1` or the list container". Every `main` heading in the app is a plain `<h1>` with no `tabindex` (e.g. `components/manage/manage-portal.tsx:107`, `apps/folk/app/sessions/[sessionId]/page.tsx:103`), so `.focus()` on it silently does nothing and focus stays on `body` — the exact case the fallback exists for. The list container branch is viable: `[data-contact-list]` already has `tabIndex={-1}` (`manage-contact-list.tsx:139`) and `[data-grid-scroll]` has `tabIndex={0}` (`grid.tsx:1983`).

**Fix:** make the fallback an element that is focusable as found (the list/grid container, or `[data-record-trigger]` first), or require a temporary `tabindex="-1"` on the `h1` before focusing it. Pin the row-removed case in a test; a fallback that no-ops is indistinguishable from the old behaviour.

**Verdict of the re-check:** not "no blockers" — H1 and H2 are concrete interaction failures in code the spine does not bind; H3 and H4 are one-line contract fixes that otherwise reproduce the old focus failures on the primary surface.

**Final verdict (2026-11-08):** Not fully closed — two high-severity blockers remain: (1) Radix's capture-phase Escape still preempts the inline field editor's Escape-to-revert, so Escape closes the record instead of cancelling the field (the editor is not a layer; the frame needs an editable-target guard on `onEscapeKeyDown`); and (2) the campaign expand control is still not Tab-reachable because `use-grid-keyboard.ts` never focuses in-cell controls and its Tab corners never release focus (a pre-existing WCAG 2.1.2 trap the AD-9 hook change must also release) — the four previously reported items are otherwise resolved.

**Final confirmation (2026-11-08):** No critical/high blockers remain for this feature — AD-14's `onEscapeKeyDown` guard covers the inline editor and keeps the record and sheet open, and AD-9's campaign two-route model (pointer/touch leading control plus the Shift+F10/Menu row context menu) supplies the required keyboard route; the grid's pre-existing Tab trap is explicitly out of scope and no longer load-bearing for this feature.
