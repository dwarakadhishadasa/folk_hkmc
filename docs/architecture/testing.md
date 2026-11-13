# Testing architecture and policy

**Audience:** any coding agent or human changing this repository.
**Status:** mandatory. Read this before you change code, not after.

This file is the contract for *what to run*. The root
[`AGENTS.md`](../../AGENTS.md) carries the short version; this is the long
version with the reasoning and the lookup tables.

---

## 1. Read this first: `pnpm test` is the unit layer, not the suite

`pnpm test` is `pnpm test:unit`, which is `turbo run test && vitest run`:

- `turbo run test` runs the two package Vitest projects
  (`@hkmc/data-contracts`, `@hkmc/program-config`).
- `vitest run` then covers root code: `lib/`, `components/`, `hooks/`, `tests/`.

**A green `pnpm test` says the unit layer passed. It says nothing about a page
render, a route's status code, or a database write.** Those are `test:e2e:*`,
and reporting unit results as behavioural verification is the failure this
section exists to prevent.

Some `_bmad-output/` specs and stories still say `pnpm test` runs zero tests.
They record the repository before the unit layer existed; this file is the
contract. The inverse trap is the live one: a green `pnpm test` is still not an
e2e run.

The complete set of suites is `pnpm test:static`, `pnpm test:unit`, the
feature-scoped `test:e2e:*` scripts, and full `pnpm test:e2e`.

---

## 2. Three test surfaces, and which one a test belongs to

| Surface | Where | Runner | Needs the stack? |
|---|---|---|---|
| **Source/contract gates** | `scripts/*.mjs` | `node`, via `pnpm` | mostly no |
| **Unit** | `lib/**/*.test.ts`, `components/**`, `hooks/**`, `tests/**`, `packages/*/src/**` | Vitest 5, node environment | no |
| **End-to-end behaviour** | `e2e/specs/` | `@playwright/test` | **yes** |

The split is mechanical: if the thing under test is callable as a function with
no database, no HTTP and no harness-provided environment, it is a unit test. If
it needs a rendered page, a session, or a row, it is an e2e spec.

The unit layer is **node environment only**. There is no `jsdom`, no
`@testing-library/react` and no component-testing setup; a component whose only
observable behaviour is in the DOM is covered by e2e. See
[`tests/README.md`](../../tests/README.md) for the layer's own conventions,
including the `server-only` alias that makes `lib/` importable at all.

Do not add a fourth runner for a single story without a decision from Dwaraka.

---

## 3. Command reference

### 3a. Source, contract and unit gates

Fast and safe to run constantly. Run these first, on every change. **The
"Stack" column is the important one** — a gate marked *yes* needs Supabase and
Mailpit up, everything marked *no* runs anywhere.

| Command | Asserts | Stack? |
|---|---|---|
| `pnpm test:static` | guardrails + typecheck + lint. The fast pre-flight | no |
| `pnpm guardrails` | Monorepo architecture: server-only boundaries, import direction, script wiring | no |
| `pnpm typecheck:workspace` | `tsc --noEmit` across all 6 packages. **The type gate** | no |
| `pnpm lint` | ESLint | no |
| `pnpm test:unit` | The Vitest unit layer: package projects via turbo, then root code | no |
| `pnpm test:seed-local-guard` | The seeder refuses non-local targets; the override routes work | no |
| `pnpm test:program-readiness` | Program-scoped signin wiring in both apps | no |
| `pnpm test:airtable-removal` | Airtable is gone: deletions, env/import grep, wire contracts | no — **currently failing, see §6** |
| `pnpm test:attendance-contract` | 21 attendance-eligibility contract rows | **yes** |
| `pnpm test:dashboard-contract` | 28 dashboard metric, scope and campaign-link invariants against direct SQL | **yes** |
| `pnpm test:offline-queue` | 19 PWA offline-queue rows | **yes** |
| `pnpm build:apps` | Both apps build | no |
| `pnpm quality:ci` | `guardrails && typecheck:workspace && test:unit && build:apps && lint` | no |

The two *yes* rows create and remove their own rows, so they leave the database
as they found it — but they do need the stack running.

`pnpm lint` currently reports **0 errors**, with pre-existing warnings that do
not fail the command; none are in the unit-test files.

> `pnpm test:static` deliberately excludes `build:apps` to stay fast. A build is
> needed before a release or a CI-shaped check, not before every edit.
>
> `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so a green
> `pnpm build` is **not** type-safety. `pnpm typecheck:workspace` is the gate.

### 3b. E2E — needs the local stack

The stack gate lives in the `test:e2e` script, **not** in `webServer`:
`reuseExistingServer` short-circuits the whole command the moment
`/login` answers, which is exactly the state `pnpm dev:local` leaves behind, so
a gate chained into `webServer` would silently never run on a developer's
machine.

```bash
pnpm dev:local     # once per machine session
```

| Command | Scope | Measured cost |
|---|---|---|
| `pnpm test:e2e:guards` | `harness-guards` + `suite-determinism` + `mailpit-reader` | **21 s** (24 passed) |
| `pnpm test:e2e:theme` | `theme-switch.spec.ts` | **38 s** (16 passed) |
| `pnpm test:e2e:sessions` | The two `sessions-*.spec.ts` files | **1.7 min** (19 passed: 4 setup + 15 spec) |
| `pnpm test:e2e:dashboard` | `dashboard-` files (the Gita Life file skips without its own stack) | ~2 min |
| `pnpm test:e2e:manage` | The six `manage-contacts-*.spec.ts` files | **4.5 min** (35 tests: 32 spec + 3 setup) |
| `pnpm test:e2e:grid` | The eleven `grid-*.spec.ts` files | **28 min observed** (181 tests) — green baseline 3.2 min predates the status strip; see §6 |
| `pnpm test:e2e` | **Full suite.** 289 specs + 3 setup. | ~5–7 min |
| `pnpm test:e2e:determinism` | Two full runs back to back, no reset | ~12 min |

Costs are from a warm stack on this machine, one worker. Every run also pays
the fixed setup cost — readiness gate, `globalSetup` fixture generation, three
OTP sign-ins, and the `next dev` boot — which is why the three-spec
`test:e2e:guards` and the 16-spec `test:e2e:theme` cost about the same.

Prefer `--list` when you only need to know scope; it costs seconds and starts
no browser.

**One runner at a time.** Every spec shares one seeded database, so concurrent
runs corrupt each other's fixtures and produce false failures.

**Never `pnpm exec playwright test`.** Use `pnpm test:e2e` (or a `test:e2e:*`
script that delegates to it). The bare CLI skips the readiness gate and runs
against an unasserted stack.

**Filtering** — `test:e2e` forwards extra args to Playwright, and the readiness
gate still runs:

```bash
pnpm test:e2e grid-           # run (also honours the gate)
pnpm test:e2e:list            # every test, no gate, no browser
pnpm test:e2e:list grid-      # one slice, no gate, no browser — cheapest
pnpm test:e2e grid-keyboard -g "Tab advances"
```

`test:e2e:list` is a bare `playwright test --list`, which is safe here because
`--list` starts no browser, no web server and no fixtures — it only enumerates.
Anything that *runs* must go through `test:e2e`. Note that
`pnpm test:e2e --list <filter>` also works but still pays the readiness gate;
use `test:e2e:list` when you only want scope.

Positional args are **regexes matched against file paths, not shell globs**:

```bash
pnpm test:e2e "e2e/specs/grid-*.spec.ts"   # ✗ Total: 0 tests in 0 files
pnpm test:e2e grid-                        # ✓ 57 tests in 7 files
```

The glob form silently selects **nothing** and still exits 0 — the same class
of false green as `pnpm test`. Measured scope for the filters the §3b scripts
use, each including the 3 setup tests that every run pays for:

| Filter | Script | Tests |
|---|---|---|
| `grid-` | `test:e2e:grid` | 181 in 14 files |
| `manage-contacts` | `test:e2e:manage` | 48 in 10 files |
| `record-review-` | `test:e2e:attendance` | 9 in 4 files |
| `theme-switch` | `test:e2e:theme` | 16 in 4 files |
| `dashboard-` | `test:e2e:dashboard` | 6 files (the Gita Life file skips without `E2E_GITA_LIFE_URL`) |
| `harness-guards suite-determinism mailpit-reader` | `test:e2e:guards` | 24 in 6 files |

Multiple positional filters are **OR**-ed, which is how `test:e2e:guards`
selects three files in one run.

---

## 4. Feature-to-test registry

Every path below is verified to exist. Counts are from `pnpm test:e2e:list`
(328 spec tests + 3 setup tests, 331 total).

### Staff auth and session handling — `pnpm test:e2e smoke`

| Source | Spec | Tests |
|---|---|---|
| `proxy.ts`, `lib/authz.ts`, `apps/*/app/login/login-page-client.tsx`, `apps/*/app/auth/*` | `e2e/specs/smoke.spec.ts` | 7 |

Asserts: role landing paths, live `storageState` per role, 401 on a dead
session, 403 for a Volunteer, and that a failed sign-in provisions nothing.

### Manage contacts — data and grid behaviour — `pnpm test:e2e:manage`

| Source | Spec | Tests |
|---|---|---|
| `components/manage/manage-contacts-table.tsx`, `apps/*/app/api/manage/contacts/route.ts`, `lib/manage/api-handlers.ts`, `lib/supabase/manage.ts` | `e2e/specs/manage-contacts-api.spec.ts` | 3 |
| " | `e2e/specs/manage-contacts-edit.spec.ts` | 7 |
| " | `e2e/specs/manage-contacts-filter.spec.ts` | 5 |
| " | `e2e/specs/manage-contacts-bulk.spec.ts` | 2 |
| " | `e2e/specs/manage-contacts-selection.spec.ts` | 6 |
| " | `e2e/specs/manage-contacts-row-lifecycle.spec.ts` | 3 — the primitive's opt-in and the two delete guarantees; the inline-create cases retired with the control |
| `components/manage/manage-contact-list.tsx`, `components/contacts/contact-record-phone.tsx`, `manage-contact-field-editor.tsx`, `manage-contact-fields.ts`, `hooks/use-mobile.ts` | `e2e/specs/manage-contacts-list.spec.ts` | 19 |

These six are the specs for story 2's 19-row matrix; the row-to-verdict mapping
lives in
[`matrix-coverage-map.md`](../../_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md).

The contact-list spec is **not** a matrix row. It covers the contact list —
the list → field sheet → expanded record stack described in
[`airtable-mobile-interface.md`](../airtable-mobile-interface.md) — and the
device detection that chooses between that list and the grid, so it is listed
separately because it has no matrix row to claim.

`/manage` no longer hosts the contacts grid: the fixture's
`manageContactsUrl()` now resolves `/contacts/grid`, and the six specs above run
against the Contacts section's personal scope. The grid's inline create is
retired on that surface, so `manage-contacts-row-lifecycle.spec.ts` keeps the
delete cases and the primitive's opt-in; the create cases are gone with the
control.

### Contacts section — Overview, grid and Reports — `pnpm test:e2e contact-`

| Source | Spec | Tests |
|---|---|---|
| `lib/contacts/metrics.ts`, `lib/program-day.ts` | `lib/contacts/metrics.test.ts`, `lib/contacts/program-day.test.ts` (unit) | 23 |
| `apps/*/app/contacts/page.tsx`, `components/contacts/contacts-overview.tsx`, `contacts-metric-card.tsx` | `e2e/specs/contact-overview.spec.ts` | 3 |
| `apps/*/app/contacts/reports/page.tsx`, `components/contacts/contacts-reports.tsx`, `contacts-period-select.tsx` | `e2e/specs/contact-reports.spec.ts` | 4 |
| `apps/*/app/contacts/grid/page.tsx`, `components/contacts/contacts-grid-surface.tsx`, `apps/*/app/manage/page.tsx` | `e2e/specs/contact-grid.spec.ts` | 3 |

The two e2e specs assert the section's one invariant: every linked figure lands
on a grid whose status readout reports the same count. The metric definitions
themselves are unit tests, because they are pure functions over a fixture array.
`contact-grid.spec.ts` also covers the `/manage?view=contacts` redirect.

### Attendance tab — the record review and its location filter — `pnpm test:e2e:attendance`

| Source | Spec | Tests |
|---|---|---|
| `components/manage/manage-attendance-view.tsx`, `components/manage/manage-location-filter.tsx`, `components/record-review/**` | `e2e/specs/record-review-attendance.spec.ts` | 6 |

Covers the record-review arrangement (cards, focused record, the focused id in
the URL, the search) and the location dropdown: one ticked location narrows
the roster to that location's contacts, two ticked locations give the UNION of
the two, un-ticking one narrows back, and "All locations" clears the filter.
The roster's count is read from the badge's raw value, so the assertion does
not depend on the locale the number is formatted in.

`components/record-review/**` is imported by the Attendance tab only, so the
blast radius of a change there is this spec — but `components/grid/**`, which
the tab's filtering leans on for the condition encoding, widens to the grid
specs — see §5.

### Contact record — cross-surface — `pnpm test:e2e:sessions`

| Source | Spec | Tests |
|---|---|---|
| `components/contacts/contact-record-*`, `components/contacts/use-contact-record.ts`, `lib/contacts/record.ts`, `lib/contacts/record-handlers.ts`, `apps/*/app/api/manage/contacts/[contactId]/record/route.ts` | `e2e/specs/sessions-detail.spec.ts` | 7 record/gateway cases; the same file carries the 9 session-detail tests below |

The detail spec owns the one record gateway and the session surfaces: an
in-scope attendee opens the premium record on both breakpoints, the out-of-patch
Preacher keeps the existing summary, and the gateway's `400`/`403`/`404`,
`Cache-Control: no-store` and server-derived `canEdit`/`canComment` are asserted
directly. The trigger on each other surface is covered by that surface's own
spec (`dashboard-overview`, `dashboard-candidates`, `sessions-overview`,
`campaign-assign-select`, `manage-contacts-list`). The record's sequence helpers
are unit-tested in `components/contacts/contact-record-sequence.test.ts`.

### Sessions — overview, insights, detail and live dashboards — `pnpm test:e2e:sessions`

| Source | Spec | Tests |
|---|---|---|
| `apps/folk/app/sessions/**`, `components/sessions/**`, `lib/sessions/**`, `supabase/migrations/20261101000000_sessions_flow.sql` | `e2e/specs/sessions-overview.spec.ts` | 11 |
| " | `e2e/specs/sessions-detail.spec.ts` | 9 |

The overview spec owns why the three derived statuses are visible, why the
location filter narrows the rows without moving the programme-wide figures, and
that a page left open flips `Live now` → `Completed` through `router.refresh()`
rather than a reload. It also asserts that the insights now on the Overview
match a direct count of `attendance` over the fixed 90-day window: the weekly
series sums to the total and the by-session bars are the direct top four. The
detail spec owns the attendee rows, the premium contact record on both
breakpoints, the out-of-patch summary fallback, the record gateway's 400/403/404
and its server-derived capabilities, and the 404s.

The Reports route is retired; its two charts live on the Overview, so the
insight assertions are part of the overview spec rather than a separate file.
The live dashboard is its own URL per session — `/sessions/<id>/live` — so two
live sessions in one scope do not share a screen. A live row, and a direct
detail visit for a live session, both land there; a session that is not live at
`/live` redirects to the detail.

The fixtures are disposable sessions, contacts and one location, written with
the service role and removed in `afterAll`. They are not the seed: the seed's
one open session must stay untouched for the attendance contract.

`lib/supabase/data.ts` remains a shared file (see §5), so a change there still
runs the full `pnpm test:e2e`. `apps/folk/app/attendance/route.ts` now reuses
the sessions scope predicate, so a change to that route also runs
`pnpm test:attendance-contract`.

### Programme dashboard — `/dashboard`, focus and the session link — `pnpm test:e2e:dashboard`

| Source | Spec | Tests |
|---|---|---|
| `apps/*/app/dashboard/**`, `components/dashboard/**`, `lib/dashboard/**`, `supabase/migrations/20261102010000_dashboard_rpcs.sql`, `supabase/migrations/20261113090000_dashboard_people_series.sql` | `e2e/specs/dashboard-overview.spec.ts` | 4 |
| " | `e2e/specs/dashboard-scope.spec.ts` | 4 |
| " | `e2e/specs/dashboard-period.spec.ts` | 6 |
| " | `e2e/specs/dashboard-candidates.spec.ts` | 5 |
| `components/sessions/new-session-popover.tsx`, `apps/folk/app/api/sessions/route.ts`, `lib/supabase/data.ts` | `e2e/specs/dashboard-campaign-link.spec.ts` | 3 |
| `packages/program-config/src/server.ts` (`modules.dialer`) | `e2e/specs/dashboard-no-dialer.spec.ts` | 1, skipped unless `E2E_GITA_LIFE_URL` and `E2E_GITA_LIFE_STORAGE_STATE` are set |

The layout is one server render with two reads: `dashboard_overview` carries the
period figures and `dashboard_people_series` carries the preacher-by-location
bars, the per-preacher totals and the twelve-month attendee lines.
`components/dashboard/*` never counts a row; the bars are scaled in the
component only for display. Call work is not part of this page.
`dashboard-candidates.spec.ts` owns the 50-per-page drill-down and its 404.
`dashboard-campaign-link.spec.ts` drives the real `+ New session` popover and
reads `sessions.campaign_id` back through the service role; a foreign or
cancelled campaign must be a named 400.

The contract gate is the non-browser half:
`pnpm test:dashboard-contract` creates a disposable campaign slice and compares
the overview and candidates payloads with direct SQL, including the
`campaign_progress` reconciliation and the unlinked-campaign `attended: null`
rule. Run it with `--program gita-life` to assert the `p_has_dialer = false`
path without starting the second app.

`components/header.tsx` and the four login landing-path files are shared, so a
change there still escalates to the full `pnpm test:e2e`.

### Grid primitive — keyboard, editors, range, clipboard, chrome — `pnpm test:e2e:grid`

| Source | Spec | Tests |
|---|---|---|
| `components/grid/use-grid-keyboard.ts` | `e2e/specs/grid-keyboard.spec.ts` | 8 |
| `components/grid/grid-editors.tsx`, `components/grid/grid-editor-types.ts` | `e2e/specs/grid-editors.spec.ts` | 37 |
| `grid-editors.tsx` (`linked`), `grid-editor-types.ts`, `grid-filter-operators.ts`, `grid.tsx`; `components/manage/manage-contacts-table.tsx`, `manage-favorites-view.tsx`; `lib/supabase/manage.ts`, `lib/manage/api-handlers.ts`; `supabase/migrations/20261019000000_contacts_single_location.sql` | `e2e/specs/grid-linked-record-picker.spec.ts` | 11 |
| `components/grid/grid.tsx`, `grid-row.tsx` | `e2e/specs/grid-cell-range.spec.ts` | 4 |
| " | `e2e/specs/grid-clipboard.spec.ts` | 5 |
| `components/grid/grid.tsx`, `grid-row.tsx`, `grid-cell-renderers.tsx` | `e2e/specs/grid-cell-renderers.spec.ts` | 12 |
| " | `e2e/specs/grid-cell-metrics.spec.ts` | 6 |
| `components/grid/grid-scroll-surface.spec.ts`'s surface: the frame, the scroll container, the status strip below it, and the column layout | `e2e/specs/grid-scroll-surface.spec.ts` | 10 |
| `components/grid/grid-header-cell.tsx`, `grid-toolbar.tsx` (CAP-18's column menu), `grid.tsx` drag handling | `e2e/specs/grid-column-drag-menu.spec.ts` | 11 |
| `components/grid/grid-edit-model.spec.ts`'s model: `use-grid-keyboard.ts`, `grid-editors.tsx`, the optimistic override | `e2e/specs/grid-edit-model.spec.ts` | 24 |
| `components/grid/grid-filter-popover.tsx`, `grid-filter-tree.ts`, `grid-filter-operators.ts`, `grid-view-state.ts` (`f.`/`fa.`/`fg`) | `e2e/specs/grid-filter-conditions.spec.ts` | 51 |
| `components/grid/grid-toolbar.tsx`, `grid-view-state.ts` (`hide`), `use-grid-view-state.ts`, `grid-sort-popover.tsx`, `grid-row-lifecycle.tsx` | `e2e/specs/grid-toolbar.spec.ts` | 18 |
| " (contacts only — CAP-18's default field set and the status row) | `e2e/specs/manage-contacts-selection.spec.ts` | 6 |

`components/grid/**` is a **shared primitive**: it is imported by
`components/manage/manage-contacts-table.tsx` and
`apps/*/app/dev/grid-preview/page.tsx` only. A grid change therefore widens to
the manage contacts specs — see §5.

### Theme and legibility — `pnpm test:e2e:theme`

| Source | Spec | Tests |
|---|---|---|
| `components/theme-provider.tsx`, `components/theme-toggle.tsx`, `components/providers.tsx`, `apps/*/app/globals.css` | `e2e/specs/theme-switch.spec.ts` | 13 |

### Harness integrity — `pnpm test:e2e:guards`

| Source | Spec | Tests |
|---|---|---|
| `playwright.config.ts`, `package.json`, `.gitignore`, `components/grid/` boundaries | `e2e/specs/harness-guards.spec.ts` | 8 |
| `scripts/verify-suite-determinism.mjs`, `playwright.config.ts` | `e2e/specs/suite-determinism.spec.ts` | 9 |
| `e2e/fixtures/mailpit.ts` | `e2e/specs/mailpit-reader.spec.ts` | 4 |

### Fixture generator — `pnpm test:e2e bulk-`

| Source | Spec | Tests |
|---|---|---|
| `scripts/bulk-contact-fixtures.mjs`, `e2e/fixtures/bulk-contacts.ts` | `e2e/specs/bulk-fixtures.spec.ts` | 36 |

---

## 5. Shared components widen the regression blast radius

These files are imported by **more than one** feature surface. Editing one is
not a local change — run the specs named for every consumer.

| Shared file | Consumed by | Also run |
|---|---|---|
| `components/header.tsx` | **22 route surfaces** — every page in both apps, including `/`, `/login`, `/register`, `/attend`, `/manage` | Full `pnpm test:e2e` |
| `components/providers.tsx` | Both root layouts — i.e. **every route** | Full `pnpm test:e2e` |
| `components/staff-auth-shell.tsx` | `/manage`, `/sessions`, `/dashboard`, `/contact`, `/volunteers`, `/admin/invite` ×2 apps | `smoke` + `test:e2e:manage` |
| `components/grid/**` | `manage-contacts-table.tsx`, `/dev/grid-preview` | `test:e2e:grid` **+** `test:e2e:manage` |
| `components/contacts/contact-record-*`, `components/contacts/use-contact-record.ts`, `contact-record-trigger.tsx` | Contacts grid (desktop + phone), Sessions detail and Top 5, dashboard Focus/Candidates, campaign assign, manage Sessions | `test:e2e:sessions` + `test:e2e:dashboard` + `test:e2e:campaign` + `test:e2e:manage` |
| `lib/contacts/record.ts`, `lib/contacts/record-handlers.ts`, `apps/*/app/api/manage/contacts/[contactId]/record/route.ts` | Every surface above; the one full-record gateway | Full `pnpm test:e2e` |
| `components/manage/manage-types.ts` | Manage UI **and** `lib/manage/api-handlers.ts` (server) | `test:e2e:manage` |
| `hooks/use-mobile.ts` | `manage-contacts-table.tsx` (the device detection) and `components/ui/sidebar.tsx` | `test:e2e:manage` |
| `lib/manage/api-handlers.ts` | The three `/api/manage/contacts/*` routes ×2 apps | `test:e2e:manage` |
| `lib/authz.ts` | Every staff page + every authz'd API route ×2 apps | Full `pnpm test:e2e` |
| `lib/staff-roles.ts`, `lib/staff-patch.ts`, `lib/patch-scope.ts`, `lib/staff-dto.ts`, `lib/staff-routes.ts` | Every staff page, every auth route, both invite routes and the scoped data layer ×2 apps | Full `pnpm test:e2e` |
| `lib/supabase/data.ts` | Sessions, dashboard, contact, invite, attendance, registration ×2 apps | Full `pnpm test:e2e` |
| `lib/attendance-session.ts` | `/attendance` **and** `/api/registration` ×2 apps | `pnpm test:attendance-contract` |
| `components/ui/*` primitives | Widely; `table.tsx` is attendance-view only, `button`/`checkbox` are manage-only | Match the consuming feature |

Two boundaries worth stating explicitly, because they are easy to assume wrong:

- **The public registration/attend pages and the manage grid share no
  component.** `apps/*/app/register/page.tsx` defines its form inline and does
  not import `components/registration-form.tsx` (that file has zero importers);
  `/attend` uses `components/attendance-form.tsx`. The only files crossing both
  surfaces are `components/header.tsx`, `components/providers.tsx`, and the
  `lib/supabase/*` server layer.
- **`components/theme-provider.tsx` reaches every route through
  `providers.tsx`, but `components/grid/**` imports neither it nor
  `ThemeToggle`.** That separation is asserted offline by
  `e2e/specs/harness-guards.spec.ts` — keep it true.

**Rule of thumb:** if the file you edited is in the table above, the targeted
run is the *floor*, not the ceiling.

---

## 6. Diagnosing a failure

### First: is it yours?

Establish the baseline before debugging. On a clean tree:

```bash
git stash            # or work on a scratch branch
pnpm test:e2e:guards # ~20 s, fastest real signal
```

**Known pre-existing failure — `pnpm test:airtable-removal` currently fails
3 of 30 checks** on `main`/`dev` as of `44d9812`:

- `no Airtable service reference, env read, or package import in source`
- `every remaining Airtable mention is one of the accounted-for ones`
- `/manage has no Airtable URL, redirect, or fallback card`

Cause: the story 7-9 WIP `scripts/migrate-airtable-data.mjs` (`220eab5`) and a
comment in `components/manage/manage-contacts-table.tsx:122` (`d401405`) are
not in the script's accounted-for list. This is **not** a regression from your
change — confirm with `git stash` and say so in your report rather than
"fixing" it by editing the gate. Whether the migration script should be in the
allowlist or the comment reworded is Dwaraka's call.

**Known pre-existing failures — `manage-contacts-filter` rows 17/18 and 18
`grid-*` tests**, confirmed by stash-cycle on `ec60255` (failures reproduce
with the status-row change shelved):

- Rows 17/18 fail on fixture-data drift, before any changed code runs: row 17's
  `LOCATION_NEEDLE` (`"bulk-location-3"`) matches no location the current
  generator writes (temple names), and row 18's renamed row cannot sort first
  while seeded `"Anand …"` names exist under either collation.
- `grid-column-drag-menu` (5), `grid-edit-model` (5), `grid-editors` (4),
  `grid-cell-metrics` (1), `grid-cell-renderers` (1), `grid-filter-conditions`
  (2): mostly 60 s actionability timeouts plus one stale `hide` expectation, in
  specs and code paths (drag, keyboard, view-state, row rendering, filter
  connective) owned by the other in-tree workstreams — all reproduce with this
  change shelved.

### Then: read the actual failure

- **Exit code 0 but zero tests** → you hit a glob, not a regex (§3b), or you
  ran `pnpm test`. Check `pnpm test:e2e --list <filter>` first.
- **`✘` marks in an otherwise-green run** → either a `test.fail` tripwire
  firing because its defect got fixed (remove the marker *and* update
  `matrix-coverage-map.md` in the same commit), or a genuine failure being
  misreported. Never leave a deliberately broken spec under `e2e/specs/`.
- **401/403/sign-in failures everywhere** → usually an env-file target split,
  not an auth bug. `pnpm local:readiness` reports it precisely; run it.
- **Failures that appear only in a full run** → order dependence or shared
  database state. Never depend on another spec's leftovers.
- **`Route is already handled!` inside a `finally`** → a parked
  `page.route` handler resumed during `unroute`. Await the release before
  unrouting.

### Recording a result

Quote real values, never estimates: the pass count from that run's output, the
revision (`git rev-parse --short HEAD`), the `baseURL`, the worker count (1),
and — when claiming a matrix row Covered — the `@playwright/test` version from
`package.json`. See
[`docs/claiming-a-matrix-row.md`](../claiming-a-matrix-row.md).

---

## 7. What CI does and does not enforce

`.github/workflows/quality-gates.yml` runs, on PRs to `dev`/`main` and pushes
to `dev`:

```yaml
pnpm guardrails
pnpm typecheck:workspace
pnpm test:unit
pnpm build:apps
pnpm lint
```

That is `pnpm quality:ci`, in the same order. The unit layer runs in CI because
it needs no secrets and no services.

**CI does not run the e2e suite, and does not run the contract gates
(`test:attendance-contract`, `test:offline-queue`, `test:airtable-removal`,
`test:seed-local-guard`).** A green CI run therefore says **nothing** about
e2e, and a green `test:unit` says nothing about a route or a page. E2E needs
Supabase + Mailpit + a seeded database, so it is a local-only gate by design;
that is a deliberate trade, not an oversight.

Two consequences for agents:

- Do not treat a green PR check as verification of a behavioural change.
- Do not weaken a local gate because CI would not have caught it.

`.github/workflows/pr-branch-policy.yml` enforces the branch/label policy; it
runs no tests.

---

## 8. Choosing a testing level

| Level | When | Command |
|---|---|---|
| **Targeted** | Default. Every edit, before reporting done. | `pnpm test:static && pnpm test:unit`, then the `test:e2e:*` script for the feature |
| **Feature regression** | A shared component in §5 changed; before finishing a story; before claiming a matrix row | `pnpm test:e2e:manage` / `:grid` / `:theme` / `:guards` (or `smoke`) |
| **Full regression** | `lib/authz.ts`, `lib/supabase/*`, `proxy.ts`, `components/header.tsx`, `components/providers.tsx`, a shared `components/ui/*` primitive; before a PR; after touching specs/fixtures/config | `pnpm test:e2e` |
| **Determinism** | After editing specs, fixtures, or `playwright.config.ts` | `pnpm test:e2e:determinism` |

The unit layer is the cheapest real assertion in the repo. If a change adds or
alters pure logic, `pnpm test:unit` should carry a new or updated test: a green
`test:static` proves the code compiles, not that it is correct.

Escalate one level when the file you touched appears in §5, when a targeted run
surfaces an unrelated failure, or when the change crosses feature boundaries.

---

## 9. Rules

1. **`pnpm test` is the unit layer, not the e2e suite.** A green run is real
   evidence about pure logic and no evidence about behaviour (§1). Say which
   layer you ran.
2. **Always go through `pnpm test:e2e` or a `test:e2e:*` script**, never bare
   `pnpm exec playwright test` — the readiness gate lives in the script.
3. **Filter with regexes, never globs.** A glob selects nothing and still exits
   0.
4. **One e2e runner at a time** — the specs share one seeded database.
5. **Escalate when you touch a shared component** (§5).
6. **Never weaken a gate to make it pass.** If an assertion goes red, fix the
   source. Editing an assertion to match your change converts a broken gate
   into a green run — the suite asserts `package.json` and
   `playwright.config.ts` as text specifically to catch that.
7. **Never commit a deliberately broken spec** under `e2e/specs/`. Generate
   failures into a temp dir and clean up in a `finally`.
8. **No `waitForTimeout` anywhere under `e2e/`.** Wait on a condition with
   `expect.poll`.
9. **Report the commands you actually ran and their real results** — the exact
   command, the pass count from that run, and any failure you did *not* cause,
   named as pre-existing.
10. **Do not fabricate a green run.** If you could not run something, say so
    and name what is unverified.