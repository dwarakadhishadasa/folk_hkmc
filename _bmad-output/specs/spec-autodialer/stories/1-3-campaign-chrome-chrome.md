---
title: 'Campaign chrome: the header destination, the module flag, the proxies and the service worker'
type: 'feature'
created: '2026-10-26'
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

**Problem:** Campaign had surfaces but no way in. The section was reachable only by typing a URL: the shared header offered no Campaign entry, Gita Life had no flag to withhold one, the two app matchers did not refresh a session on `/campaigns/**` or `/api/dialer/**`, and the service worker would have cached campaign pages and dropped an offline disposition POST on the floor. Each of those is chrome, and each has to land in one place because `components/header.tsx` is a shared component.

**Approach:** Resolve the header item from three inputs already on hand — the staff role, the caller-profile flag the auth context carries, and the program's `modules.dialer` — so the link a staff member sees is the link their role can actually use. Add `modules.dialer` to `packages/program-config` (true for Folk, false for Gita Life). Cover `/campaigns/:path*` and `/api/dialer/:path*` in both app matchers and in the root matcher they mirror. Teach the root `public/sw.js` that `/campaigns` is network-only and that `/api/dialer/caller/disposition` is a queued POST.

## Boundaries & Constraints

**Always:**
- An Admin, Preacher or Assistant gets the Campaign item whether or not they hold a caller profile, and it points at `/campaigns`.
- A Volunteer with an active `dialer_callers` profile gets the Campaign item pointing at `/campaigns/assignments`.
- A Volunteer without an active profile gets no Campaign item at all — not a disabled one, not a link that lands on a 403.
- `modules.dialer: false` suppresses the item entirely, so the shared header renders no Campaign entry in Gita Life, where the routes do not exist.
- `/campaigns/:path*` and `/api/dialer/:path*` are in `apps/folk/proxy.ts`, `apps/gita-life/proxy.ts` and the root `proxy.ts` matcher the two apps mirror.
- `/campaigns` is network-only in `public/sw.js`; `/api/dialer/caller/disposition` is a queued POST, so an offline disposition is kept and retried rather than lost.
- App and feature code uses double quotes; local modules are imported through the `@/*` alias.

**Never:**
- Do not render the item for a Volunteer whose profile read came back false. A false result is the honest "no profile" answer; the server refuses the request outright when the read itself fails.
- Do not reach into the campaign pages or the sub-nav from the header. The item is a destination; the section's own tabs are the section's.
- Do not edit `apps/*/public/sw.js`: both app directories symlink their `public` to the root one, so the root file is the only copy Next serves.
- Do not weaken `pnpm test:static` or skip the full suite to make the layer green.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin, Preacher or Assistant, dialer enabled | Active staff session | Campaign item in the desktop pill and the phone bottom nav, href `/campaigns`, current on any `/campaigns/**` page | — |
| Volunteer with an active caller profile | `dialer_callers.is_active = true` | Campaign item, href `/campaigns/assignments` | — |
| Volunteer without an active profile | No `dialer_callers` row, or `is_active = false` | No Campaign item in either nav | — |
| Any staff member in Gita Life | `modules.dialer: false` | No Campaign item in either nav, for every role | — |
| Signed-out visitor | No session | No nav at all, so no Campaign item | — |
| A page under `/campaigns` | Session-expiry refresh | The request passes through the app proxy's new matcher | Refreshed by `updateSupabaseSession` |
| Offline navigation to a Campaign page | Service worker active | Network-only: no cache write, the offline fallback answers | — |
| Offline `POST /api/dialer/caller/disposition` | Service worker active | `202 {queued:true}`, the request stored in `folk-offline-db/pending-requests` | Replayed on the next sync |

## Human Decisions

1. **One item, two placements.** The desktop pill and the phone bottom nav are rendered from the same `navItems` array, so the Campaign entry is written once and appears in both. The design's two placements are the same link, and splitting them would let them drift.
2. **The module flag belongs in program-config, not in each app.** `modules.dialer` is the same kind of switch as `modules.sessions`: it says whether the program has the capability, so the shared header reads it once instead of each app branching around the shared component.
3. **The header reads `hasActiveCallerProfile` off the auth context.** The auth context already carries the whole `StaffContext`, and the server layer put the caller-profile flag there, so the header needs no request of its own. A separate fetch in a 22-surface shared component would put a network read in the header of every page.
4. **`isPreacher` is Admin-or-Preacher in this context.** The auth context defines it as `role === "Admin" || role === "Preacher"`, so the admin surface set is `isPreacher || isAssistant`; the code says so rather than re-testing the role strings.

</frozen-after-approval>

## Code Map

- `components/header.tsx` — `campaignHrefFor` and the Campaign entry in `navItems`.
- `packages/program-config/src/types.ts` — `modules.dialer`.
- `packages/program-config/src/programs/folk.ts` — `dialer: true`.
- `packages/program-config/src/programs/gita-life.ts` — `dialer: false`.
- `apps/folk/proxy.ts`, `apps/gita-life/proxy.ts` — the two matchers Next reads.
- `proxy.ts` — the matcher both apps mirror, and the handler they delegate to.
- `public/sw.js` — `NETWORK_ONLY_PATH_PREFIXES` and `QUEUED_POST_PATHS`.
- `apps/folk/app/campaigns/**`, `components/campaign/**` — the surfaces this layer links to (read-only here).
- `lib/authz.ts` — `StaffContext.hasActiveCallerProfile` (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `packages/program-config/src/types.ts` — `dialer` on the public module map.
- [x] `packages/program-config/src/programs/folk.ts` — dialer enabled.
- [x] `packages/program-config/src/programs/gita-life.ts` — dialer disabled.
- [x] `components/header.tsx` — the role- and profile-resolved Campaign item.
- [x] `apps/folk/proxy.ts`, `apps/gita-life/proxy.ts`, `proxy.ts` — `/campaigns/:path*` and `/api/dialer/:path*` on all three matchers.
- [x] `public/sw.js` — `/campaigns` network-only, `/api/dialer/caller/disposition` queued.

**Acceptance Criteria:**
- Given an Admin, Preacher or Assistant, when the header renders, then Campaign is present in the desktop pill and the phone bottom nav with href `/campaigns`, with or without a caller profile.
- Given a Volunteer with an active caller profile, then Campaign is present with href `/campaigns/assignments`.
- Given a Volunteer without an active caller profile, then no Campaign item is rendered.
- Given Gita Life, then `modules.dialer: false` and no Campaign item is rendered for any role.
- Given either app, then its matcher covers `/campaigns/:path*` and `/api/dialer/:path*`; the root matcher mirrors both.
- Given the root `public/sw.js`, then `/campaigns` is network-only and `/api/dialer/caller/disposition` is a queued POST.
- Given `pnpm test:static`, then it passes.

## Implementation Notes

### The rule, in one place

`campaignHrefFor` is a pure function above the component: dialer off → `null`; admin surface → `/campaigns`; otherwise a Volunteer with an active profile → `/campaigns/assignments`; otherwise `null`. Every branch is a role the auth context can produce, so there is no default that quietly grants the item.

### The root matcher is inert, and still kept in sync

`apps/folk/proxy.ts` and `apps/gita-life/proxy.ts` are the matchers Next actually reads; each declares its own `config.matcher` and delegates the handler to the root `proxy.ts`. The root matcher therefore changes nothing at runtime, but Story 1.3's acceptance criteria keep it in sync as the shared source, and a stale mirror is how a later route gets "added everywhere" and still missed. The root file is outside this layer's compiled scope, so it is covered by a recorded scope override:

```
hedgehog override add STORY-1-3-CAMPAIGN-CHROME-CHROME --scope proxy.ts --reason "..."
```

### The service worker is one file

`apps/folk/public` and `apps/gita-life/public` are symlinks to `../../public`, and `git ls-files` holds exactly one `public/sw.js`. Editing a per-app path edits the root file through the symlink; there is no second copy to keep in sync. `/api/` is already network-only, but the fetch handler tests `isQueueablePost` before the network-only branch, so adding the disposition path to `QUEUED_POST_PATHS` is what makes an offline disposition queue instead of fail.

### What this layer does not prove

The chrome layer's verify command is `pnpm test:static`, and its scope holds no `e2e/**` path, so nothing here executes the header. The behaviour above is proven by reading the rule, not by a browser. Story 1.3's test scope names a `campaign-navigation` run that does not exist yet; the join layer, whose scope is the whole repository, is the only remaining task in this intent that can add that spec before the full run. It is declared as debt on this task.

### The phone Campaign menu is still unbuilt

The sub-nav is hidden below `md`, and frame 2217 ("Campaign (phone) — Menu", Overview / Assignments / Callers / Reports) is opened from the page title in frame 1752, not from the shared header. That menu belongs to `components/campaign/campaign-page-header.tsx`, which this layer does not own, so a phone admin can reach `/campaigns` but cannot switch to Callers or Reports. Declared as debt; it is a gap in the UI layer's surface, not in this one.

## Spec Change Log

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0. Guardrails: "Monorepo guardrails passed." with the same four pre-existing type-import warnings; every workspace typecheck project Done; ESLint "✖ 16 problems (0 errors, 16 warnings)", all pre-existing and outside the files this layer touched.

**The full suite — not completed:**
- `pnpm test:e2e` was started once for Story 1.3 (the intent's single full run) and **interrupted at the user's direction** after 90 of 339 tests, so it is not a verdict on the story. Before the interruption it had recorded 7 failures: `bulk-fixtures` cleanup (33 ms), `grid-cell-metrics` metrics 4, `grid-cell-renderers` type 8, and `grid-column-drag-menu` drags 1–4. Six of those are the failures `docs/architecture/testing.md` §6 already records as pre-existing on a clean tree; the `bulk-fixtures` cleanup row is not on that list and may be leftover tagged-contact state from the interrupted run.
- The run booted its own dev server (the stale one on :3000 was stopped first); no runner was left behind.

**Not run:**
- The full suite was therefore never completed for this story. Its OUTCOME line ("the full suite passes once here") is **not satisfied**, and the header routing this layer added is still unproven by a browser test. The join layer carries both the full run and a declared decision to add `e2e/specs/campaign-navigation.spec.ts` first.
- `pnpm test:e2e:determinism` was not run: it is deferred to Epic 4 (Story 4.2), which owns the release gate over the accumulated suite.
- `pnpm test` was not run: it finds no test script in any package and exits 0 without running anything.
