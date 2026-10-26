---
title: 'Conflict-aware assignment write on the assign-contacts screen'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/stories/1-7-assign-select-ui.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/stories/1-8-assign-write-api.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/stories/1-8-assign-write-server.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.7 shipped the assign-contacts surface with its primary action
disabled at every count, carrying an inline sentence that the conflict check and
the write arrive with the assignment step. The service (`precheckAssignments`,
`writeAssignments`) and both routes now exist, so that stub is the only thing
between the admin and a real batch write — and it is also the only screen where
AD-11's contract can be kept or broken: the button's count must be the count that
will actually be written, conflicts must be a readable decision rather than a
uniqueness error, and an explicit skip/move choice must be the only thing that
starts a write.

**Approach:** `components/campaign/assign-contacts-select.tsx` gains the write
flow on top of its existing selection, picker and preview. `Assign N contacts`
is enabled whenever `N > 0`, runs `POST …/assignments/precheck` on every click,
and then either writes `mode: "move"` directly (no conflicts) or opens one
dialog that lists every conflict by contact name, current caller and status with
exactly two choices — `Skip them · assign K contacts` and `Move them · assign N
contacts` — plus a close that writes nothing. Callers are sent as `userId` in
picker order; weights remain write-time only. A `201` prints
`Assigned N contacts · 1 skipped`, clears the selection and the caller rows and
re-reads the current contact page. Any refusal renders the server's `code —
error` and leaves the selection and callers intact.

## Boundaries & Constraints

**Always:**
- `Assign N contacts` is enabled at `N > 0` and disabled at zero, which keeps
  the 1.7 zero-selection row unchanged. It is also disabled while a pre-check
  or a write is in flight, and it never fires twice.
- The primary button's count is the selection size until a conflict decision
  exists, and the chosen decision's confirmed-set size afterwards (skip → the
  unassigned count, move → `N`). Each dialog choice carries its own resulting
  count, so no count is displayed against an undecided mode.
- Every click pre-checks first. `conflicts.length === 0` writes immediately with
  `mode: "move"` and no dialog; `conflicts.length > 0` opens the dialog and
  writes nothing until a choice is made.
- The dialog lists **every** conflict — contact name, current caller name, and
  the stored status — and offers exactly two writes plus a cancel/close. Escape,
  the X and `Cancel` write nothing.
- The write body is `{ contactIds, callers: [{ userId, weight }], mode }`, with
  callers in the picker's order and weights parsed from the picker's text.
- A `201` prints the server's `written` and `skipped`, clears the selection, the
  picker and the preview, and bumps the contact read so already-assigned rows
  are re-rendered from the service.
- A refusal (`403 caller_not_assignable`, `409 conflicts_require_decision`,
  `409 nothing_to_assign`, `409 caller_inactive`, `409 campaign_not_assignable`,
  `400 …`) renders `code — error` in a `role="alert"` and leaves the selection,
  the callers and the decision intact so the admin can retry.
- Weights are still UI state only; nothing about them is stored or reused.

**Never:**
- No second split computation, no local conflict inference, no optimistic row.
- No default mode. Neither choice is preselected, prefilled or reachable by
  pressing Enter on open, and closing the dialog never writes.
- No `callerId` in the write body — the picker's identity is the staff
  `userId`, and promotion to `dialer_callers` is the service's.
- No client-side campaign-status gate: a terminal campaign is refused by the
  service and the refusal is rendered. The page keeps its 1.7 behaviour of
  hiding the entry link without refusing direct navigation.
- No contact-table column showing assignment state; re-reading the page is the
  whole of the "already assigned" feedback.
- Do not touch `lib/**`, `apps/folk/app/api/**`, `components/header.tsx`, the
  proxies, `public/sw.js`, `e2e/fixtures/**`, `e2e/auth/**`,
  `playwright.config.ts` or `package.json`.
- Do not weaken `campaign-assign-select.spec.ts`: the zero-selection disabled
  button, the desktop gate and the preview row all stay as they are.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean selection | 2 selected, 1 caller, no conflicts | Button `Assign 2 contacts`; pre-check answers empty; write `201`; `Assigned 2 contacts`; selection and callers cleared | — |
| Conflicted selection | 3 selected, 1 already assigned, 2 callers | Button `Assign 3 contacts`; amber line names `1 contact… already assigned`; dialog lists that one row | — |
| Skip | Dialog, `Skip them · assign K contacts` | Writes `mode: "skip"`; button reads `Assign K contacts` for the decision; receipt `Assigned K contacts · M skipped` | — |
| Move | Dialog, `Move them · assign N contacts` | Writes `mode: "move"`; every selected contact lands on the new split; receipt `Assigned N contacts` | — |
| Decision retry | Write refused after a skip choice, selection unchanged | Button still reads `Assign K contacts`; a retry re-pre-checks and re-uses the decision only if the conflict list is identical | Named refusal; state kept |
| Conflict list changed under the decision | A new contact became assigned | The decision no longer matches; the dialog opens again for a fresh choice | — |
| Close the dialog | Escape / X / `Cancel` | No request, no row; amber line stays | — |
| Pre-check in flight | Button clicked | `Checking conflicts…`, button disabled, second click is ignored | — |
| Write in flight | Choice clicked | `Assigning N contacts…`, both choices disabled | — |
| Zero selection | No ticks | `Assign 0 contacts` disabled, no dialer write | — |
| No caller chosen | N selected, picker empty | Button enabled; nothing is sent; inline `Add at least one caller before assigning.` | Local guard |
| Invalid weight | `0`, `1.5`, empty | Nothing is sent; the existing weight alert and `Weights must be whole numbers of 1 or more.` | Local guard |
| Out-of-set caller | `userId` outside AD-3 | — | `403 caller_not_assignable`, named |
| Inactive caller | Deactivated profile | — | `409 caller_inactive`, profile left inactive |
| Terminal campaign | `COMPLETED` / `CANCELLED` direct URL | Surface renders; the write is refused | `409 campaign_not_assignable`, names the status |
| Everything is a conflict | Skip with a fully assigned selection | — | `409 nothing_to_assign` |
| Missing mode | API call with conflicts and no `mode` | — | `409 conflicts_require_decision`, names each conflict |
| Server unreachable | Network failure | Inline `Unable to reach the server…`; selection and callers kept | Named message, never a fake success |

## Human Decisions

1. **The design's amber line cannot say "will be skipped".** Frame 324 reads
   "5 selected contacts are already assigned and will be skipped", which is the
   skip outcome presented as a fact. The story requires an explicit choice, so
   the line names the conflict count and says the choice is pending; the skip
   outcome only appears once skip has been chosen (or in the dialog's own
   button label). The colour is the same: `--grid-warning-ink` is the app's only
   amber ink token (`#F97F29`, the design's value).

2. **The button count is the decision's count, not the design's 120.** The
   design shows `Assign 120 contacts` above a `125 of 272 selected` line
   because its own warning already presumes skip. Here the button reads `N`
   until a decision exists (which is exactly what a no-conflict write writes),
   reads the unassigned count after a skip decision, and reads `N` after a move
   decision. Before the choice, any single number would be a guess; the dialog
   is where both numbers are shown, each on the choice that produces it.

3. **Every click pre-checks, and a decision is bound to a conflict list.** The
   write re-runs the pre-check inside its transaction, so the client's pre-check
   is UX, not safety. Re-asking on every click keeps the list fresh; a recorded
   skip/move decision is re-used only when the fresh conflict set is byte-equal
   to the one it was made against. A concurrent assignment therefore reopens the
   dialog instead of silently applying an old choice — and a retry after a
   refusal does not nag with a second dialog for a decision the admin just made.

4. **A zero-caller or invalid-weight click is refused on the screen.** The
   server would answer `400 invalid_caller_list` / `400 invalid_weight`, but
   those are the surface's own preconditions and the preview already withholds
   its request for the same reasons. Nothing is sent, nothing is written, and
   the message is the same sentence the weight alert uses. Every *state* refusal
   — membership, activity, campaign status, mode — comes from the server.

5. **The dialog is the `Dialog` primitive, not `AlertDialog`.** `AlertDialog`
   is the lifecycle confirmations' one-action shape (`campaign-lifecycle-actions`
   uses it); this needs two equally-weighted writes, a cancel, and a close that
   all leave the dialog open until one is chosen. Neither write is styled as the
   safe default, and the description says in words that closing writes nothing.

6. **No client-side campaign-status gate.** Story 1.7 decided the detail page's
   link is absent for a terminal campaign and that direct navigation still
   renders the surface. Adding a status prop now would change the page's
   contract; the service's `409 campaign_not_assignable` is rendered instead,
   which is also the only way to catch a campaign completed in another tab.

7. **The success line is the server's receipt.** `written` and `skipped` come
   from the response, so a skip that only partly applied (a concurrent write
   added a conflict inside the transaction) reports the real numbers rather than
   the count that was on the button. The line omits `· N skipped` at zero.

8. **A local write failure keeps everything.** The selection, the picker, the
   weights and the recorded decision survive a refusal or a network failure, so
   `Try again` is a second click, not a rebuild. Only a `201` clears state.

</frozen-after-approval>

## Code Map

- `components/campaign/assign-contacts-select.tsx` — the pre-check, the
  conflict dialog, the write, the in-flight guard, the receipt and the refusal
  rendering; the 1.7 grid, facets, pager, picker and preview are unchanged
  except for the new state they now feed.
- `components/campaign/assign-contacts-types.ts` — four mirrored client types:
  `AssignmentConflictView`, `AssignmentPrecheckView`, `AssignmentWriteModeView`,
  `AssignmentWriteResultView`.
- `e2e/specs/campaign-assign-write.spec.ts` — eleven tests: the pre-check's
  named conflict, skip, move, the weighted split, two UI flows, and five
  refusals (out-of-set caller, terminal campaign, missing mode, nothing to
  assign, inactive caller).
- `lib/dialer/assignments.ts` — `precheckAssignments`, `writeAssignments`
  (read-only here).
- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/assignments/{precheck,}/route.ts`
  — the two writes the surface calls (read-only here).
- `e2e/fixtures/dialer-campaign.ts` — `createDisposableCampaign` /
  `deleteDisposableCampaign` (read-only here).
- `components/ui/{dialog,table,button,input,checkbox}.tsx` — the primitives
  reused (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `components/campaign/assign-contacts-types.ts` — the four new client types.
- [x] `components/campaign/assign-contacts-select.tsx` — the write flow, the
  conflict dialog, the button count per decision, the in-flight guard, the
  receipt and the named refusals.
- [x] `e2e/specs/campaign-assign-write.spec.ts` — eleven tests with a disposable
  campaign, promoted-caller cleanup and assignment-first delete order.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-8-assign-write-ui.md` — this
  record.

**Acceptance Criteria:**
- Given a pre-check over an assigned and an unassigned contact, then exactly one
  conflict is returned, naming that contact, its current caller and `PENDING`.
- Given a conflict, then nothing is written until skip or move is chosen; closing
  the dialog leaves the campaign's row count unchanged.
- Given `mode: "skip"`, then `written` is the unassigned count, `skipped` the
  conflict count, and the previously assigned contact keeps its caller.
- Given `mode: "move"`, then the `(contact, campaign)` row is updated, exactly
  one row exists for it, and the pre-check names the new caller afterwards.
- Given six contacts and weights `2` and `1`, then the split is `[4, 2]`, sums
  to six, and the table holds four and two rows per caller.
- Given two contacts and one caller on the screen, then `Assign 2 contacts`
  writes, `Assigned 2 contacts` appears, the selection reads `0 of N selected`,
  the picker empties, and a follow-up pre-check names both contacts.
- Given a conflicting selection on the screen, then the dialog names the contact
  and its caller, Escape writes nothing, and `Move them · assign 2 contacts`
  lands both rows on the replacement caller.
- Given a caller outside the assignable set, then `403 caller_not_assignable`
  names it and no row is written.
- Given a `COMPLETED` campaign, then `409 campaign_not_assignable` names the
  status and no row is written.
- Given conflicts and no `mode`, then `409 conflicts_require_decision` names the
  contact and its current caller, and only the original row exists.
- Given a skip over a fully assigned selection, then `409 nothing_to_assign`.
- Given a deactivated caller, then `409 caller_inactive` names it and the
  profile is still `is_active = false` afterwards.
- Given `pnpm test:e2e campaign-`, then 53 tests run (4 role setups + 49 spec
  tests) and all pass.

## Implementation Notes

### The two choices

The dialog is opened by a pre-check whose `conflicts` array is non-empty. Its
body is a three-column table — `Contact`, `Currently assigned to`, `Status` —
built from the pre-check payload, so every conflict the service named is on
screen. The footer holds `Cancel`, `Skip them · assign K contacts` and
`Move them · assign N contacts`, where `K = assignableCount` and `N` is the
selection size. Choosing either records a `WriteDecision` keyed by
`selection|sorted conflict ids` and posts
`{ contactIds, callers: [{ userId, weight }], mode }`; cancel, Escape and the X
only clear the prompt. The description states the consequence: "closing this
dialog writes nothing."

### The button count per mode

| State | Button |
|---|---|
| No pre-check yet, no decision | `Assign N contacts` (N = selection) |
| Pre-check clean | `Assign N contacts` → writes `move` immediately |
| Pre-check conflicted, no decision | `Assign N contacts` (the dialog carries both counts) |
| Decision `skip` | `Assign K contacts` (K = unassigned) |
| Decision `move` | `Assign N contacts` |
| Pre-checking | `Checking conflicts…` (disabled) |
| Writing | `Assigning N contacts…` (disabled) |
| Zero selection | `Assign 0 contacts` (disabled) |

The count is `writeCount`, so the label and the payload are computed from the
same decision. A decision is dropped as soon as the selection changes, because
the pre-check snapshot it was bound to is keyed to the selection fingerprint.

### The in-flight guard

`isPrechecking` and `inFlightMode` are separate pieces of state, and the button
is disabled when either is set. `beginAssignment` returns early on `isBusy`, so
a double click cannot post twice; the dialog's two choices are disabled while
`inFlightMode` is set. A refusal clears `inFlightMode` before rendering its
message, which is what re-enables the retry.

### Error and receipt surfaces

The refusal renders `code — error` in a bordered `role="alert"` above the
button, reusing the 1.7 surface's `errorMessage` helper so a dialer refusal looks
the same here as on the contact read. The receipt renders in a `role="status"`
block reading `Assigned 3 contacts` or `Assigned 3 contacts · 1 skipped`. Both
sit in the `Assign to` panel, between the preview and the button.

### The e2e fixture and cleanup order

Assignments reference the campaign with `ON DELETE RESTRICT`, and caller
profiles reference the promoted staff users the same way, so the order is fixed:
`dialer_assignments` for the campaign → the caller profiles whose `user_id` was
absent before the test → the campaign. All three go through the loopback-guarded
SQL endpoint (`POST /pg/query`, table owner), because `service_role` holds no
`DELETE` on any dialer table. Promoted profiles are found by diffing
`dialer_callers.user_id` before and after the test, so a caller the seed (or
another spec) already owned is never touched. Every test does this in a
`finally`; the run left `dialer_assignments`, `dialer_callers`,
`dialer_campaigns` and `dialer_contact_profiles` at zero rows.

The conflict fixtures are created through the assignment route itself
(`mode: "move"` on one contact), so the pre-check reads rows the real write
produced rather than hand-inserted ones. Expected conflict names, caller names
and split counts are read from the responses, never hard-coded.

### Layout and the visual pass

The panel keeps frame 324's order: preview, hint, primary action. The hint line
turns amber only while a pre-check's conflicts are on screen. The dialog is
`sm:max-w-2xl`; at the narrower `sm:max-w-xl` the footer's three buttons forced
the grid's content track wider than the dialog's padding box, which pushed the
conflict table past the card's right edge. The wider card plus `sm:flex-wrap` on
the footer fixed it.

A 1440×1000 pass over a throwaway campaign with three selected contacts, one
already assigned and callers weighted `2:1` measured
`document.documentElement.scrollWidth === clientWidth` with the dialog open, and
the dialog showed the conflict row plus `Skip them · assign 2 contacts` and
`Move them · assign 3 contacts`. The receipt pass read `Assigned 3 contacts`,
`0 of 253 selected`, `No callers chosen yet.` and `Assign 0 contacts` disabled.

## Spec Change Log

- No frozen intent changed. This layer is the UI half of Story 1.8; the service
  and route halves are `1-8-assign-write-server.md` and `1-8-assign-write-api.md`.
- Story 1.7's Human Decision 7 ("the primary action is disabled at every count
  in this layer") is superseded by this layer, as that decision said it would be:
  the button is now live at `N > 0`, and the inline "arrives with the assignment
  step" sentence is gone.

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e campaign-` (the packet's VERIFICATION
  command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0, on the final tree.
  - `pnpm guardrails` — `Monorepo guardrails passed.` and
    `[verify-dialer-route-coverage] All 14 route(s) covered by denial sweep.`,
    with the four pre-existing `@/lib/authz` type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen
    pre-existing and in files this layer did not touch.
- `pnpm test:e2e:list campaign-assign-write` — `Total: 15 tests in 5 files`
  (4 role setups + 11 spec tests), so the story's filter selects real tests.
- `pnpm test:e2e campaign-` — **PASS**, exit 0, `53 passed (2.0m)`: the four role
  setups, the nine 1.7 assign-select tests unchanged, the eleven new tests, and
  the twenty-nine other campaign tests. No `✘` mark anywhere. Run three times in
  this session (plus two narrower runs of the new spec) with no database reset
  between runs; the last was on the tree this record describes.
- `git rev-parse --short HEAD` at verification time: `0a6ab2a`;
  `@playwright/test` `^1.62.0`; `baseURL` `http://127.0.0.1:3000`; workers `1`.

**Spec tests added (`campaign-assign-write.spec.ts`):**
- `the assignment pre-check — an Admin › names every already-assigned contact and its current caller`
- `the assignment write — an Admin › writes only the unassigned contacts when the decision is skip`
- `the assignment write — an Admin › moves a conflicting row instead of inserting a second one`
- `the assignment write — an Admin › splits a weighted batch by floor division and writes the whole set`
- `the assign-contacts screen — an Admin › assigns an unconflicted selection and reports the receipt`
- `the assign-contacts screen — an Admin › writes nothing until the conflict dialog's skip or move is chosen`
- `the assignment refusals — an Admin › refuses a caller outside the assignable set by name and writes nothing`
- `the assignment refusals — an Admin › refuses a completed campaign`
- `the assignment refusals — an Admin › requires skip or move when the selection has conflicts`
- `the assignment refusals — an Admin › refuses a skip that would write nothing`
- `the assignment refusals — an Admin › refuses an inactive caller and never reactivates it`

**Spec tests kept, unchanged:** `campaign-assign-select.spec.ts` keeps all nine
tests, including `Assign 0 contacts` disabled, the desktop gate and the
`4`/`2` preview. `campaign-callers`, `campaign-campaigns`, `campaign-surfaces`
and `campaign-survey` all pass inside the same run. No existing selector was
renamed, scoped differently or loosened.

**Post-run state:** `public.dialer_assignments`, `public.dialer_callers`,
`public.dialer_campaigns`, `public.dialer_contact_profiles` and
`public.dialer_survey_questions` hold zero rows after the gated run.

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0
  without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `campaign-`, and
  the full suite belongs to the join layer.
- `pnpm test:e2e:determinism` was not run. The packet restricts e2e to
  `campaign-`, and the repository defers determinism to Epic 4, Story 4.2. The
  new spec did run three times back to back with no reset and no leftover rows.
- `pnpm test:airtable-removal` was not run. It is a known pre-existing failure
  on this branch and is unrelated to these files.

## What this layer does not prove

- **The dialog's own `Skip them` path is unasserted in the browser.** The UI test
  drives `Move them`; skip is proved at the API level and its button label is
  asserted, but no browser row clicks it. The code path is the same
  `runWrite(mode)` call with a different literal.
- **The local guards are unasserted.** `Add at least one caller before
  assigning.` and `Weights must be whole numbers of 1 or more.` need a click with
  an empty/invalid picker; no spec does that, and the weight alert is 1.7's.
- **A refusal rendered in the surface is unasserted.** The e2e proves each
  refusal over HTTP, and the surface prints `code — error`; no browser row makes
  the screen show `409 campaign_not_assignable` (it would need a campaign
  completed between page load and click).
- **The decision-retry path is unasserted.** Re-clicking after a refused write
  with the same selection re-uses the recorded decision without a dialog. Only
  the code and the `lastDecision` key comparison carry that; no spec forces a
  refusal and then retries.
- **A concurrent conflict appearing between pre-check and write is unasserted.**
  The dialog reopening for a changed conflict list is a key comparison; proving
  it needs a second writer inside one test.
- **The `409 caller_inactive` path through the picker is unasserted.** The
  picker never offers a deactivated caller, so the browser cannot trigger it;
  the API row proves the refusal and the no-reactivation rule.
- **Auto-promotion's display name is only implicitly proved.** The tests assert
  the promoted profile's `user_id` and that the conflict names the picker's
  label; they do not assert `display_name`.
- **`nothing_to_assign` and `conflicts_require_decision` are API-only.** Both are
  unreachable from the surface without a stale selection (the screen catches
  them only after a concurrent write).
- **The 401 redirect on this page is unasserted.** It follows the other campaign
  pages' pattern; no spec in this filter covers a signed-out visit.
- **Dark mode was not checked.** The visual pass was light mode only; the new
  elements reuse `--border`, `--muted`, `--card`, `--destructive`,
  `--program-text` and `--grid-warning-ink`, all of which have dark values.
- **`assign-contacts-types.ts` still mirrors the service contract by hand.** The
  four new types have the same failure mode 1.7 recorded: a field renamed in
  `lib/dialer/assignments.ts` will not reach the client until this file is
  updated.
