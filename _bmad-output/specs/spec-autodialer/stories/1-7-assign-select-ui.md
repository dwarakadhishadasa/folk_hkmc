---
title: 'Assign-contacts selection surface'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/design-coverage.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `listAssignableContacts`, `listAssignableCallers` and
`previewAssignmentSplit` are reachable over HTTP, but no screen uses them. The
design's Assign contacts frame (324) is a desktop two-pane surface: a contact
grid with a selection that outlives the page, four calling facets, a `Showing
X–Y of N` pager, and an `Assign to` panel of weighted callers with a live split.
Two properties of that frame are load-bearing and easy to lose in a naive build:
the selection is a set of contact ids, not a page's ticks, and the facet options
come from the whole scoped set rather than the rows on screen. The design also
carries a conflict warning and an `Assign N contacts` button, neither of which
this story can make functional: the pre-check and the write are Story 1.8.

**Approach:** `/campaigns/[campaignId]/assign-contacts` is a server page behind
`requireCampaignAdmin`, `getCampaign` (404 → `notFound()`) and
`listAssignableCallers(staff)`, which passes the AD-3 caller set, the programme's
location names and the campaign id to one client selection surface. A
`matchMedia` gate mounts that surface only at `md` and wider; below it the page
renders an explicit "Open this on a desktop" state and issues no contact read.
The surface pages `GET /api/dialer/admin/campaigns/<id>/contacts`, keeps a
`Set<contactId>` across pages and filters, renders the payload's whole-set facets
as four `<select>`s, and posts `{ total, callers }` to
`/assignments/preview` after every selection or weight change so the per-caller
counts are the service's arithmetic. The primary action renders `Assign N
contacts`, is disabled at zero — and, because no write exists yet, disabled at
every other count too, with the handoff to Story 1.8 stated inline. The campaign
detail page links here only while the campaign is `DRAFT` or `ACTIVE`.

## Boundaries & Constraints

**Always:**
- The page is a server component; only `AssignContactsDesktopGate` and
  `AssignContactsSelect` are `"use client"`. The page applies
  `requireCampaignAdmin` before `getCampaign`, and `listAssignableCallers` is
  AD-3's set — the surface offers no caller it was not given.
- `getCampaign`'s 404 is the page's 404 (`notFound()`), a 401 redirects to
  `/login?redirect=…` and a 403 to `/auth/error?code=staff-authorization-failed`,
  exactly as the campaign detail page does.
- The desktop gate is JavaScript, not CSS: below `md` the contact surface is not
  mounted, so it never fetches contacts and never holds a selection behind a
  hidden element. The server snapshot is the narrowed state, so SSR never
  mounts the grid either.
- Selection is a `Set` of contact ids. A page change or a facet/search change
  keeps every tick, the header reads `X of N selected` where `N` is the
  whole-set total from the first unfiltered read, and a visible `+ K hidden
  selected` names the part of the selection the current page cannot show.
- The select-all checkbox adds or removes **only the current page's ids**, and
  renders indeterminate when some of the page is ticked.
- The four facet `<select>`s take their data options from the response's
  `facets` object, in its order, on every page and under every filter. The only
  extra option is the `Any <facet>` clear control.
- A contact with no `dialer_contact_profiles` row renders an em dash in each of
  the four facet cells, never `null`. A contact with no location renders `—`.
- The split preview is always the route's answer. Each caller's count and the
  total come from `POST …/assignments/preview`, debounced ~250 ms; a preview
  whose key does not match the current selection and weights renders `—`, so a
  stale split is never shown against a newer selection.
- Weights are UI state only: a positive integer per caller, `1` on add, held as
  text, never stored and never sent anywhere but the preview request.
- The primary action is disabled; the inline note says the conflict check and
  the assignment write arrive with the assignment step. No fake success, no
  optimistic row, no request.
- Errors from either route render the server's named `code` and `error`, never
  a generic failure, and the contact list offers `Try again`.
- Shared primitives and programme tokens only; double quotes, the `@/*` alias,
  `cn`.

**Never:**
- No write endpoint, no `POST` to an assignments collection, no `assignments`
  table read. Story 1.8 owns the pre-check, the skip/move choice and the write.
- No client-side re-derivation of the split (no `floor(N × weight ÷ total)`) and
  no weights column, weights table or local storage.
- No second paging, facet or scope implementation: `page`, `pageSize`, `search`
  and the four facet values are forwarded as the route's query parameters, and
  the response is rendered as it arrives.
- No contact grid below `md`, no squeezed table, no `display:none` grid.
- No `Import roster`, `Invite caller`, promote or add-person control; the caller
  picker is AD-3's set (UX-DR32, AD-13).
- Do not render the design's conflict warning: the pre-check that would make it
  true is Story 1.8's.
- Do not edit `lib/**`, `apps/folk/app/api/**`, `components/header.tsx`, the
  proxies, `public/sw.js`, `e2e/fixtures/**`, `e2e/auth/**`,
  `playwright.config.ts` or `package.json`.
- Do not weaken, delete or renumber an existing campaign assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin opens the screen | DRAFT campaign, seeded programme | `Assign contacts` title, the contact grid, `Showing 1–25 of N`, the four facets, the caller panel | — |
| Paging | `Next` on page 1 | `Showing 26–50 of N`, page 2's rows, `Previous` enabled; `Previous` returns | — |
| Selection across pages | One row on page 1, one on page 2 | `2 of N selected` and `+ 1 hidden selected`; both ticks survive a return to page 1 | — |
| Select-all on page | Header checkbox | Adds/removes exactly the 25 current page ids; other pages' ticks untouched; indeterminate when partial | — |
| Facet options | A value that only an off-page contact holds | The option exists on page 1, and the select's options equal the payload's `facets` array | — |
| Facet filter | `centre = <value>` | Page resets to 1, selection kept, `Showing 1–1 of 1` when one contact holds it | — |
| Search | A seeded full name, submitted by Enter or `Search` | Page resets to 1, total and rows narrowed to the match | — |
| Contact without a profile | No `dialer_contact_profiles` row | Four em dashes in Centre / Level / Gender / Language | — |
| Contact without a location | `location_ids` empty | Location reads `—` | — |
| Location id with no name | An id absent from the programme lexicon | `Unknown location`, never a silent blank | — |
| Caller picker | Admin, seeded staff | Only AD-3's assignable set; each added row has a weight input defaulting to 1 | — |
| Weighted preview | 6 selected, weights 2 and 1 | Route answers `4` and `2`; the panel reads `Preview: 6 contacts across 2 callers` | — |
| Invalid weight | `0`, `1.5`, empty | No preview request; inline "whole numbers of 1 or more" | — |
| Zero selection | No ticks | `Assign 0 contacts` disabled, `Preview: —`, no dialer write issued | — |
| Narrow viewport | 390 px wide | `Open this on a desktop`, no table, no caller panel, no contact request | — |
| Terminal campaign | `COMPLETED` / `CANCELLED` detail page | No `Assign contacts` link | — |
| Volunteer | No caller profile needed | Refused at the page before the read | `403` → `/auth/error?code=staff-authorization-failed` |
| No session | No cookie | Redirected to sign in, naming the page | `401` → `/login?redirect=…` |
| Missing / other-program campaign | Absent or foreign id | Next's not-found page | `404` → `notFound()` |
| Contact route refuses | `400` / `500` | The server's `code — error` in a `role="alert"` and a `Try again` button | Named message, never generic |
| Preview route refuses | `400` / `500` | The server's `code — error` in the panel; counts read `—` | Named message |

## Human Decisions

1. **The surface is client state; the page is the gate.** Paging, filtering,
   selection, weights and the preview all change without a navigation, so they
   belong to one client component. The page stays a server component because
   AD-2's gate, the campaign 404 and AD-3's caller set must be resolved on the
   server before any markup is sent.

2. **The desktop contract is a JS gate, not a breakpoint class.** UX-DR9/UX-DR10
   say the phone admin surface does not reproduce this grid. A `hidden md:block`
   wrapper would still mount the surface — and its contact reads and selection —
   on a phone. `AssignContactsDesktopGate` reads `matchMedia("(min-width: 768px)")`
   through `useSyncExternalStore`, whose server snapshot is the narrow state, so
   a phone never constructs the component at all.

3. **The selected count's denominator is the whole scoped set.** The page object
   carries the filtered `total` and the whole-set `facets`, but no scope total.
   The surface keeps the `total` of the first unfiltered read for the session.
   A filtered denominator would print `5 of 12 selected` while twenty contacts
   are ticked, which is the exact misreading the hidden count exists to prevent.

4. **`+ K hidden selected` is page-relative, not filter-relative.** The story's
   contract is "the current page cannot show it", so `K = selected − selected on
   this page`. A tick filtered out by a facet counts as hidden, which is honest:
   the admin cannot see or untick it from here either.

5. **The preview's `callerId` is the staff user id.** AD-13's auto-promote means
   an eligible caller usually has no `dialer_callers` row until their first
   assignment writes one, so `callerId` in the AD-3 set is absent. The staff
   `userId` is the only identity every offered caller has, and Story 1.8's write
   resolves it to (or creates) the caller profile. `previewAssignmentSplit` is
   arithmetic over opaque ids, so the preview is exact either way.

6. **Every preview is keyed to the selection it was computed for.** The response
   arrives after a debounce, so a slow answer for weights `1:1` could land after
   the admin has typed `2`. The stored preview carries
   `selection|fingerprint|weights` and is only rendered when that key matches
   the current state; otherwise the count cells read `—`. This is a display
   guard, not a second computation.

7. **The primary action is disabled at every count in this layer.** The story
   keeps the write for Story 1.8. A button that posts nothing and reports
   success, or one that looks live and does nothing, both lie; the button
   carries the real `N`, the real disabled state, and an inline sentence naming
   what arrives next. Story 1.8 replaces this state rather than extending it.

8. **The Location column is resolved by the server page.** The service's page
   object carries `locationIds` only — no names — and this layer may not add a
   join to `lib/dialer/assignments.ts`. The page passes the programme's location
   lexicon from the existing `listLocations()` read, and the client maps ids to
   names. An id with no name reads `Unknown location` rather than pretending the
   contact has no location.

9. **A terminal campaign has no `Assign contacts` link.** AD-12 makes
   `COMPLETED` and `CANCELLED` terminal. The link is absent rather than disabled:
   a control that can never succeed is not an affordance. Direct navigation to
   the URL still renders the surface, because no story decision says it should
   refuse and this layer does not invent one (see "What this layer does not
   prove").

10. **The design's Filter / Sort toolbar, `5 hidden fields` pill and `Reset to
    equal` are not built.** The story's surface is the four facet selects, the
    pager, the selection and the caller panel. A Sort control has no server
    parameter, the field-visibility pill belongs to the manage grid's view
    state, and `Reset to equal` would be the only weight shortcut nobody asked
    for. Each would advertise behaviour with no service behind it.

11. **The facet e2e fixture owns a `dialer_contact_profiles` row.** The seed
    writes no profiles, so a whole-set facet cannot be proved from seeded data:
    an empty facet array would make the assertion vacuous. The spec inserts one
    row for a page-2 contact, reads the expectation from the route's own
    `facets`, and deletes the row in a `finally` through the loopback-guarded
    SQL endpoint (`service_role` holds no DELETE on the dialer tables).

12. **The four facet selects and the search are the only filters.** The route
    accepts `centre`, `level`, `gender`, `language` and `search`; the UI sends
    exactly those. A filter the route does not read would be a control that
    appears to narrow the set and does not.

</frozen-after-approval>

## Code Map

- `apps/folk/app/campaigns/[campaignId]/assign-contacts/page.tsx` — `requireCampaignAdmin`, `getCampaign` (404), `listAssignableCallers`, the location lexicon, the 401/403 redirects and the surface mount.
- `apps/folk/app/campaigns/[campaignId]/page.tsx` — the `Assign contacts` link, present only for `DRAFT` and `ACTIVE`.
- `components/campaign/assign-contacts-desktop-gate.tsx` — the `matchMedia` gate and the "Open this on a desktop" state.
- `components/campaign/assign-contacts-select.tsx` — the only selection client: paging, search, facets, the `Set` selection and hidden count, the caller picker and weights, the debounced preview, the disabled primary action and the named errors.
- `components/campaign/assign-contacts-types.ts` — the client contract mirrored from the `server-only` service (page object, facet keys and labels, caller and split shapes, location option).
- `e2e/specs/campaign-assign-select.spec.ts` — nine tests: paging, cross-page selection, whole-set facets (with the disposable profile), search, weighted preview, zero selection, the detail entry point, the narrow viewport and the Volunteer refusal.
- `lib/dialer/assignments.ts` — `listAssignableContacts`, `listAssignableCallers`, `previewAssignmentSplit` (read-only here).
- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/{contacts,assignments/preview}/route.ts`, `apps/folk/app/api/dialer/admin/assignable-callers/route.ts` — the three routes this surface calls (read-only here).
- `lib/supabase/data.ts` — `listLocations`, the programme's location names (read-only here).
- `e2e/fixtures/dialer-campaign.ts` — `createDisposableCampaign` / `deleteDisposableCampaign` (read-only here).
- `components/ui/{table,button,checkbox,input}.tsx` — the primitives reused (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `apps/folk/app/campaigns/[campaignId]/assign-contacts/page.tsx` — the gate, the campaign 404, AD-3's caller set and the location names.
- [x] `apps/folk/app/campaigns/[campaignId]/page.tsx` — the `Assign contacts` link for `DRAFT`/`ACTIVE` only.
- [x] `components/campaign/assign-contacts-desktop-gate.tsx` — the desktop-only state and the surface mount.
- [x] `components/campaign/assign-contacts-select.tsx` — the grid, pager, facets, selection, picker, weights, preview and the stubbed primary action.
- [x] `components/campaign/assign-contacts-types.ts` — the client contract and facet labels.
- [x] `e2e/specs/campaign-assign-select.spec.ts` — nine tests with a disposable campaign and a disposable profile.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-7-assign-select-ui.md` — this record.

**Acceptance Criteria:**
- Given an Admin at a desktop viewport, then `/campaigns/<id>/assign-contacts` renders the scoped contact grid, `Showing 1–25 of N`, the four facet selects and the caller panel.
- Given page 1, then `Next` shows `Showing 26–50 of N` with page 2's rows, and `Previous` returns.
- Given a tick on page 1 and a tick on page 2, then the count reads `2 of N selected`, `+ 1 hidden selected`, and both ticks survive returning to page 1.
- Given a profile value held only by an off-page contact, then that value is an option on page 1 and the select's options equal the payload's `facets` array.
- Given a contact with no profile, then its four facet cells read em dashes.
- Given a seeded name in the search box, then the rows and the total narrow to it and a non-matching page-1 row disappears.
- Given six selected contacts and two callers weighted 2 and 1, then the panel shows `4`, `2` and `Preview: 6 contacts across 2 callers`.
- Given zero selected contacts, then `Assign 0 contacts` is disabled, nothing is previewed and no dialer write is issued.
- Given a 390 px viewport, then the page renders `Open this on a desktop`, no table, no caller panel, and issues no contact request.
- Given a `COMPLETED` campaign, then its detail page has no `Assign contacts` link.
- Given a Volunteer, then the page is refused before the read.
- Given `pnpm test:e2e campaign-`, then 42 tests run (4 role setups + 38 spec tests) and all pass.

## Implementation Notes

### The interaction contract

| Control | What it does | What it keeps |
|---|---|---|
| `Search contacts` + `Search` | Sets `search`, resets to page 1, re-reads the route | Selection |
| Four facet selects | Sets one exact facet value, resets to page 1, re-reads | Selection; the option list stays whole-set |
| Select-all (header checkbox) | Adds or removes exactly the current page's ids; indeterminate when partial | Every other page's ticks |
| Row checkbox | Adds or removes one contact id | — |
| `Previous` / `Next` | Moves one page within `1…totalPages`; disabled at the bounds | Selection and the hidden count |
| `Add caller` | Appends one AD-3 caller at weight 1 | Selection |
| Weight input | Sets that caller's weight; invalid values suppress the preview | Selection and other weights |
| `X` on a caller row | Removes that caller and its count | Selection |
| `Assign N contacts` | Disabled: `N = 0` is the story's floor, `N > 0` awaits Story 1.8 | — |

### Selection carries ids, not page positions

`selectedIds` is a `Set<string>` of `contactId`s, and every mutation produces a
new `Set` so React re-renders. A row is ticked when its id is in the set, so the
same contact stays ticked after a page change, a facet change or a search. The
select-all checkbox compares `pageIds` to `selectedIds`: it never enumerates
anything but the current page.

The header count is `selectedIds.size of <scopeTotal> selected`. `scopeTotal`
is captured from the first read that carries no search and no facet — the only
reads where the route's `total` *is* the scoped set — and kept for the session.
The hidden indicator is `selectedIds.size − (page ids in the set)` and appears
only above zero, so a wholly visible selection never claims hidden ticks. After
the story's two-page scenario it reads `+ 1 hidden selected` on either page.

### Whole-set facets and the disposable profile

The response's `facets` is built by the service from every contact in scope
before search and facet filters, so the four selects are stable across pages and
under their own filters. The select's data options are `facets[key]` in its
order; the `Any <facet>` entry is the clear control, not a data option.

The seed has no `dialer_contact_profiles` rows, so the spec inserts one for a
page-2 contact with a unique `centre`, then asserts that page 1's select offers
it while page 1's rows do not hold it. The expectation is the route's own
`facets` payload, never a hard-coded list. The row is removed in a `finally`
through `POST /pg/query` after the target is asserted loopback; an existing
profile is never overwritten — the spec picks a contact with none and throws a
named error if a future seed leaves no such page-2 row.

### The preview comes from the route

After a selection or weight change the surface waits 250 ms and posts
`{ total: selectedCount, callers: [{ callerId, weight }] }` to
`/api/dialer/admin/campaigns/<id>/assignments/preview`. Each caller's `Contacts`
cell is the matching `split` entry's `count`; the summary is the sum of the
returned counts. Nothing on the client divides by a weight total.

The stored preview is keyed by `selectedCount|sorted ids|weights`, and a key
mismatch renders `—`. That is what keeps a slow `1:1` answer from being shown
against a `2:1` panel that has not answered yet. A zero selection, no callers,
or an invalid weight sends nothing and clears the preview. The e2e's `4`/`2`
for six contacts at `2:1` are the route's own numbers.

### The primary-action stub and its 1.8 handoff

The button renders the real count (`Assign 0 contacts` … `Assign 12 contacts`)
and is always disabled in this layer. The sentence beneath it —
"The conflict check and the assignment write arrive with the assignment step.
Nothing is assigned from this screen yet." — is the whole of the "not built"
claim, and the title repeats it for a hover. Story 1.8 replaces the `disabled`
attribute with the pre-check, the skip/move choice and the write; it also owns
the design's conflict warning, which this layer deliberately does not draw.

The zero-selection e2e row asserts the disabled button, an empty preview line
and **no** non-GET request to `/api/dialer/**`, so "no request is issued" is a
network fact rather than an inference from the attribute.

### Desktop-only

`AssignContactsDesktopGate` uses `useSyncExternalStore` over
`matchMedia("(min-width: 768px)")`; `getServerSnapshot` returns `false`, so the
server-rendered HTML is the desktop notice and a wide client replaces it after
hydration. Below `md` the gate returns the notice and never constructs the
selection surface, which is why the narrow spec can assert an empty set of
`/contacts` requests. The notice is a `<h2>` inside a bordered card with the
copy "Open this on a desktop" and one sentence naming what the phone layout
does not carry.

### Layout and tokens

The surface is a two-column grid from `lg`: the contact card on the left and a
360 px `Assign to` panel on the right, matching frame 324's 944/408 split at a
narrower wrapper. Below `lg` the panel stacks under the grid. The selection
line sits on the `color-mix(--muted 35%, --card)` tint the survey builder uses,
the table is the shared `Table` primitive with the campaign list's header
treatment, and the pagination and picker use the same `Button` sizes as the
lifecycle and survey controls. No new colour token was introduced; the disabled
primary action is the stock disabled style.

A 1440×1000 pass over a throwaway campaign with two cross-page ticks and two
callers at `3:1` measured `document.scrollWidth === clientWidth === 1440` (no
horizontal overflow), the preview reading `2 contacts across 2 callers`, and the
390×844 pass rendering the notice with zero tables.

### The e2e fixture and cleanup

Campaigns come from `createDisposableCampaign` / `deleteDisposableCampaign`,
which create through the admin route and delete through the loopback-guarded
SQL endpoint. Every test deletes its campaign in a `finally`; the facet test
also deletes its profile row there, before the campaign. Expected totals, page
ranges, facet arrays, caller names and matching searches are all read from the
routes the surface calls, so a seed change moves the expectations with it.

## Spec Change Log

- No frozen intent changed. This layer is the UI half of Story 1.7; the service
  and route halves are `1-7-assign-select-server.md` and
  `1-7-assign-select-api.md`.

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e campaign-` (the packet's VERIFICATION
  command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `Monorepo guardrails passed.` and
    `[verify-dialer-route-coverage] All 12 route(s) covered by denial sweep.`,
    with the four pre-existing type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen
    pre-existing and in files this layer did not touch.
- `pnpm test:e2e:list campaign-` — `Total: 42 tests in 9 files`; the filter
  selects the five campaign specs plus the four role setups.
- `pnpm test:e2e:list campaign-assign-select` — `Total: 13 tests in 5 files`
  (4 role setups + 9 spec tests), so the story's filter selects real tests.
- `pnpm test:e2e campaign-` — **PASS**, exit 0, `42 passed (1.7m)`: the four
  role setups plus thirty-eight spec tests, with no `✘` mark anywhere. Run four
  times in this session (twice alone, twice chained with `test:static`), 42
  passed each time with no database reset between runs; the final chained run
  was on the tree this record describes.
- `git rev-parse --short HEAD` at verification time: `3a9a9ba`;
  `@playwright/test` `^1.62.0`; `baseURL` `http://127.0.0.1:3000`; workers `1`.

**Spec tests added (`campaign-assign-select.spec.ts`):**
- `the assign-contacts surface — an Admin › pages the scoped contact set and reports the range it is showing`
- `the assign-contacts surface — an Admin › keeps a selection that spans pages and names the hidden count`
- `the assign-contacts surface — an Admin › builds every facet's options from the whole set, not the current page`
- `the assign-contacts surface — an Admin › narrows the set when a seeded name is searched for`
- `the assign-contacts surface — an Admin › previews the weighted split the assignment route computes`
- `the assign-contacts surface — an Admin › disables the primary action and issues no request at zero selection`
- `the campaign detail — an Admin › offers Assign contacts only while the campaign can take assignments`
- `the assign-contacts surface — a narrow viewport › asks for a desktop and never mounts the contact grid`
- `the assign-contacts page — a Volunteer › is refused before the campaign is read`

**Spec tests kept, unchanged:** the nine in `campaign-campaigns.spec.ts`, the six
in `campaign-surfaces.spec.ts`, the five in `campaign-callers.spec.ts` and the
nine in `campaign-survey.spec.ts` all pass inside the same run. No existing
selector was renamed, scoped differently or loosened; the new page's labels
(`Assign contacts`, `Previous`, `Next`, `Search`) do not collide with any of
them because no existing spec visits this page.

**Post-run state:** `public.dialer_campaigns`, `public.dialer_contact_profiles`
and `public.dialer_callers` hold zero rows after the gated run.

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0
  without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `campaign-`, and
  the full suite belongs to the join layer.
- `pnpm test:e2e:determinism` was not run. The repository defers it to Epic 4,
  Story 4.2; every row this spec writes is deleted in a `finally`, and the three
  tables were confirmed back at zero rows after the gated run.
- `pnpm test:airtable-removal` was not run. It is a known pre-existing failure on
  this branch and is unrelated to these files.

## What this layer does not prove

- **A terminal campaign's direct URL is unrefused.** The detail page hides the
  link for `COMPLETED`/`CANCELLED`, and the e2e asserts that. Navigating to
  `/campaigns/<terminal id>/assign-contacts` still renders the surface, because
  no story decision says the page must refuse and this layer does not invent
  one. If it should refuse, that is a new decision for the page's gate.
- **The contact route's named refusals are unasserted in the browser.** The
  surface only ever sends `page ≥ 1`, `pageSize = 25` and trimmed strings, so
  `invalid_page` / `invalid_page_size` are unreachable from it; the route sweep
  owns those codes. The UI renders `code — error` from whatever the route
  answers, and that rendering is code-only.
- **The preview route's refusals are unasserted.** The surface validates weights
  locally (positive integers, unique callers) and never sends a bad body, so
  `invalid_weight` / `invalid_caller_list` / `invalid_total` need a bypassed
  client. The route sweep covers the happy path.
- **An inactive caller's absence from the picker is not browser-proven.** The
  page passes `listAssignableCallers`' set and the surface offers every entry it
  receives; the exclusion is `campaignScope`'s rule and the seed has no
  deactivated caller. Proving it would mean deactivating a seeded caller, which
  this layer may not do.
- **The Assistant's picker scope is unasserted.** Only the Admin's picker is
  driven in a browser; the Assistant takes the same server prop through
  `campaignScope`, which the route sweep exercises without asserting membership.
- **Facet combinations are unasserted.** One facet value is filtered in the
  browser; the route's intersection of two or more filters is the service's, not
  this layer's, and no browser row proves the combination.
- **The hidden count under a filter is unasserted.** The cross-page scenario
  proves it with paging. A tick that a facet filter hides takes the same
  arithmetic (`selected − selected on page`), but no test filters after ticking.
- **The search's own debounce/clear path is unasserted.** The row submits on
  Enter and on `Search`; clearing the box and submitting re-reads the full set,
  but no test does that round trip.
- **The exact desktop breakpoint boundary is unasserted.** The narrow test runs
  at 390 px and the rest at the desktop default; 767 px and 768 px are not
  exercised.
- **Dark mode was not checked.** The visual pass was light-mode only; the
  surface reuses the campaign tokens (`--program-text`, `--muted`,
  `--border`, `--card`, `--destructive`), which the theme spec covers on other
  surfaces.
- **The 401 redirect on this page is unasserted.** It follows the other campaign
  pages' pattern, but no spec in this filter covers a signed-out visit.
- **Weights are never persisted by construction, not by assertion.** The surface
  holds them in React state and sends them only to the preview route; there is
  no storage write to assert against, and Story 1.8's write must not add one.
- **`assign-contacts-types.ts` mirrors the service contract by hand.** A field
  added to `AssignableContactPage` in `lib/dialer/assignments.ts` will not reach
  the client types until this file is updated; the route's verbatim response and
  the browser reads are the only cross-check today.
