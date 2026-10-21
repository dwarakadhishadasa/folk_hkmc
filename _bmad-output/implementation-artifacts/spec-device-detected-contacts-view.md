---
title: 'Device-detected contacts view — the contact list on a phone, the grid on a desktop'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_commit: '3a6060d5972c2936a0d35f1ed1eb951373e467a5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Airtable-derived contact surface — a two-column list that stacks a field sheet and then the whole record — shipped as an optional overlay opened with a "Contact list" toolbar button, on every device. On a phone the thirteen-column grid is unusable, and the button substitutes a decision the device can make for itself.

**Approach:** Detect the viewport and present one view per device: the contact list on a narrow viewport, the contacts grid on a wide one. The "Contact list" button goes, because the detection makes it redundant.

## Boundaries & Constraints

**Always:**
- The grid is untouched: same columns, same write path, same keyboard model. The list and the grid keep sharing one commit handler, so there is still one place where a contact is written.
- On a phone the list is the **whole** contacts view: the grid is not mounted underneath it, so nothing behind it leaks into the accessibility tree or the tab order.
- A refused write is still reported on the same `role="status"` notice line, above whichever view is showing.
- The breakpoint is the repository's existing one — `MOBILE_BREAKPOINT` (768px), the value `hooks/use-mobile.ts` and Tailwind's `md` already use.
- No hook is called after a conditional return: `react-hooks/rules-of-hooks` is an error here. The device decision branches in JSX, after every hook.

**Never:**
- No user-agent sniffing: the viewport is the signal. No server-side guess either — the first render shows neither view rather than the wrong one.
- No second write path for the list, and no second place where a contact is written.
- Out of scope: the Favorites and Attendance tabs (already card- and roster-shaped), and responsive work inside `components/grid/**`.
- **Decided:** the mobile list is read-and-edit only. The grid's `+ Add record` is a grid control, and on a phone the grid is not mounted, so creating a contact on a phone is not offered. A create flow for the list is its own story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Desktop viewport | `/manage?view=contacts`, width ≥ 768px | Grid renders; no contact list in the DOM; no "Contact list" button | n/a |
| Mobile viewport | `/manage?view=contacts`, width < 768px | Contact list renders; no `[data-grid-root]` in the DOM | n/a |
| Viewport not yet known | server render, first client render | Neither view renders; the container keeps its box, so the page does not jump | n/a |
| Viewport crosses the breakpoint | resize 390 → 1200 and back | The view swaps; no stale grid or list left mounted | n/a |
| Write from the list | edit a field on a phone | The value reaches the database through the grid's commit path | A refused write is reported on the notice line; the value reverts |

</frozen-after-approval>

## Code Map

- `components/manage/manage-contacts-table.tsx` -- the contacts view's owner: `overlayOpen` (568), the `toolbarExtra` "Contact list" button (1511-1533), the overlay render (1545-1553), the notice line (1472-1483), and `handleOverlayCommit` (961) -- the shared write path.
- `components/manage/manage-contact-overlay.tsx` -- becomes `manage-contact-list.tsx`: the list, the stack's state machine, the required `onClose` prop and the "Close contacts" button (147-157).
- `hooks/use-mobile.ts` -- the repository's mobile breakpoint (768) and its boolean `useIsMobile`; the tri-state detection hook belongs here, so one file owns what "mobile" means.
- `components/manage/manage-contact-sheet.tsx`, `manage-contact-record.tsx` -- unchanged; both position absolutely inside the list's frame, which is already a positioned element.
- `e2e/specs/manage-contacts-sheet.spec.ts` -- becomes `manage-contacts-list.spec.ts`: it clicks the "Contact list" button (73, 228) and asserts the surface is over the grid (225-239).
- `docs/airtable-mobile-interface.md:189-219` -- states that the surface is over the grid and that the grid is not replaced. Both change.
- `docs/architecture/testing.md:189`, `CONTRIBUTING.md:76`, `docs/development-guide.md:418` -- the registry row and two prose mentions of the spec file.

## Tasks & Acceptance

**Execution:**
- [x] `hooks/use-mobile.ts` -- export `MOBILE_BREAKPOINT` and add a tri-state `useDeviceView()` -- the extra state is what lets the first render be neither view instead of the wrong one.
- [x] `components/manage/manage-contact-list.tsx` -- rename from `manage-contact-overlay.tsx`; make `onClose` optional and drop the "Close contacts" button when it is absent -- on a phone there is nothing to close back to.
- [x] `components/manage/manage-contacts-table.tsx` -- branch on the detected view (list on a phone, grid on a desktop, neither before the answer) and delete the "Contact list" button -- the button is exactly what the detection replaces.
- [x] `e2e/specs/manage-contacts-list.spec.ts` -- rewrite the spec around the two views -- the old spec drove the button that is being removed.
- [x] `docs/airtable-mobile-interface.md`, `docs/architecture/testing.md`, `CONTRIBUTING.md`, `docs/development-guide.md` -- update the prose -- each of them states that the surface is over the grid.

**Acceptance Criteria:**
- Given `/manage?view=contacts` at a viewport ≥ 768px, when the page settles, then the contacts grid is visible, no contact list is in the DOM, and no "Contact list" button exists.
- Given `/manage?view=contacts` at a viewport < 768px, when the page settles, then the contact list is visible and no `[data-grid-root]` is attached.
- Given a phone viewport, when the operator edits a field in the list, then the value reaches the database through the grid's commit path, and a refused write is reported on the notice line.
- Given the first render, before the viewport is known, when the page is served, then neither the grid nor the list is in the server's HTML.
- Given any viewport, when the operator looks at the contacts tab, then there is no "Contact list" button.

## Implementation Notes

**Shipped.** The contacts tab now presents one view per device. `useDeviceView()`
answers `"mobile"`, `"desktop"` or `null`; `ManageContactsTable` renders the
contact list on a phone, the grid on a desktop, and neither before the viewport
is known. The "Contact list" toolbar button is gone, and with it the grid's
`toolbarExtra` slot on this page. The list was renamed to match what it now is:
`manage-contact-overlay.tsx` → `manage-contact-list.tsx`, `ManageContactOverlay`
→ `ManageContactList`, `data-contact-overlay` → `data-contact-list`, and
`onClose` is optional, so the "Close contacts" X is not rendered on a phone —
there is nothing to close back to.

**Decisions taken during implementation.**
- `useIsMobile()` was rewritten on top of `useDeviceView()` rather than left
  beside it. It answered the same question with the same breakpoint, and two
  implementations of one question is how they drift. Its observable behaviour
  is unchanged: `false` until the viewport is known, then the truth.
- The list's frame stayed `absolute inset-0` inside a `relative flex-1`
  wrapper, so the sheet and the record still resolve against the list's own
  frame and "Expand contact" stays reversible.
- The write path is untouched. The list still commits through the grid's
  `handleCellCommit`, and a refusal still lands on the one `role="status"`
  notice line above whichever view is showing.

**Verified.**
- `pnpm test:static` — exit 0. Guardrails, `tsc --noEmit` across all six
  packages, and ESLint: **0 errors, 17 warnings**, none of them in a file this
  change touched. (The 12-warning figure in `docs/architecture/testing.md` was
  already stale on this branch; 17 is the pre-existing count, unchanged by
  this work.)
- `pnpm test:e2e:list` — 331 tests in 30 files; the `manage-contacts` filter
  selects 48 in 10 files; the new spec carries 11 tests. The counts written
  into `docs/architecture/testing.md` are these numbers.
- The dev server was restarted and `/manage` compiles and answers 307 (the
  auth redirect an unauthenticated `curl` gets), with no resolution errors.

**Not verified — the e2e suite was not run.** Dwaraka waived it, so the eleven
tests in `e2e/specs/manage-contacts-list.spec.ts` are **written but never
executed**: the device split, the breakpoint at 767/768, the resize swap, the
absence of the button, the JavaScript-off "neither view" case, the list's
stack, the write through the grid's path, and the refused-write notice. They
assert against the implementation as it now stands, but no run has confirmed
them. `pnpm test:e2e manage-contacts-list` is the command that settles it.

**One incident worth recording.** A `next dev` server that had been running
since before the rename served `Module not found: Can't resolve
'@/components/manage/manage-contact-overlay'` after the file was renamed. The
source was correct — `tsc --noEmit` resolved the new path — and the fault was
Turbopack's module graph holding the deleted file. Restarting the server
cleared it. A rename under a running dev server needs that restart; the error
names the *old* path, which is the tell.

## Spec Change Log

## Review Triage Log

## Design Notes

The detection is a `useSyncExternalStore` over a `matchMedia` query, and it returns **three** answers, not two: `"mobile"`, `"desktop"`, or `null` for "not yet known". The server cannot know the viewport, so the first render is a guess; guessing wrong on a phone mounts the grid's keyboard model and virtualization before swapping it out — the exact cost this change exists to avoid. So the first render shows neither view, and the container keeps its box so the page does not jump. The list's root stays `absolute inset-0` inside a `relative flex-1` wrapper, so the sheet and the record still resolve against the list's frame.
## Verification

**Commands:**
- `pnpm test:static` -- expected: guardrails, typecheck and lint clean. **Ran: exit 0, 0 errors, 17 warnings, none in a changed file.**
- `pnpm test:e2e:list` -- expected: the counts written into `docs/architecture/testing.md` hold. **Ran: 331 tests in 30 files; `manage-contacts` selects 48 in 10 files; the new spec carries 11 tests.**
- `pnpm test:e2e manage-contacts-list` -- expected: the rewritten spec passes. **NOT RUN** — waived by Dwaraka. The eleven tests are unexecuted.
- `pnpm test:e2e manage-contacts` -- expected: the whole manage slice passes. **NOT RUN** — waived by Dwaraka.
