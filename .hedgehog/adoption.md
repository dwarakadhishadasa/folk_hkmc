# Hedgehog adoption — folk_hkmc

Hedgehog was adopted onto this repo's existing codebase on 2026-10-26 at
commit `bbbd5ad` on branch `feature/campaign-autodialer`. No workspace was
scaffolded and no existing source was modified: this repo's layout,
tooling, and conventions were already settled, and they stay settled.

## The repo's own commands, and where each comes from

Every `verify` command in `core.yaml` is one of this repo's own commands.
None was invented.

| Command | What it actually does | Source |
| --- | --- | --- |
| `pnpm test:static` | `pnpm guardrails && pnpm typecheck:workspace && pnpm lint` — the monorepo architecture check, the type gate, and lint. No stack, no browser. | `package.json`; the same three steps CI runs in `.github/workflows/quality-gates.yml` |
| `pnpm supabase:push` | `pnpm dlx supabase@2.98.2 db push --local --yes` — applies pending migrations to the local Supabase database. | `package.json` |
| `pnpm seed:local` | `scripts/seed-local-fixtures.mjs` — writes the seeded staff, locations, contacts, and sessions the e2e suite signs in against. | `package.json` |
| `pnpm test:e2e <filter>` | `pnpm local:readiness && playwright test <filter>` — the readiness gate, then the Playwright suite filtered by regex. | `package.json` |
| `pnpm test:e2e` | The full suite: 289 specs plus 3 setup projects, one worker. | `package.json` |

**`pnpm test` is not a verify command and must never become one.** It is
`turbo run test`, and no package in this monorepo defines a `test` script —
it finds nothing, warns, and exits 0. A green `pnpm test` is not evidence
that anything was tested. `docs/architecture/testing.md` §1 is the contract,
and this chain honours it.

**One e2e runner at a time.** Every spec shares one seeded database, so
concurrent runs corrupt each other's fixtures and produce false failures.
The `join` layer's full-suite run is the only place the whole suite runs,
and it runs last, after every intent has landed.

## Why the layers are ordered the way they are

The chain is a set of **seams**, not a recipe for one feature. Each intent
compiles the whole per-intent chain into its own tasks, and a task whose
scope has no changes closes as a no-op without running its verify command.
That is what lets one chain serve nine stories — and whatever comes after
them — without a task ever existing for work nobody asked for.

The order follows the dependency rule this repo already enforces:

```
schema  ->  server  ->  api  ->  ui  ->  chrome  ->  join
```

- **schema** owns the database: additive timestamped migrations, the seed,
  the RLS policy matrix, and the story files that record what landed. It is
  the head because nothing else can be written against a schema that does
  not exist yet.
- **server** owns the service layer — `lib/dialer/**`, the authorization
  boundary in `lib/authz.ts`, and the `lib/supabase/**` data access. It
  comes after schema because the service layer reads tables the schema
  layer creates.
- **api** owns the route handlers under `apps/folk/app/api/dialer/**`, the
  static route-coverage guardrail, and the e2e harness files those routes
  are swept by. It comes after server because a route handler is a thin
  delegate over a service-layer handler, not the other way round.
- **ui** owns the browser surfaces — `apps/folk/app/campaigns/**` and
  `components/campaign/**`. It comes after api because a client component
  calls a route handler; it never imports `lib/dialer` directly.
- **chrome** owns the shared shell — `components/header.tsx`, the two
  app-level proxy matchers, the root `public/sw.js`, and the
  `packages/program-config/src/**` module flags. It comes last among the
  per-intent layers because it is the layer that wires everything else
  into navigation: the header item needs the routes to exist.
- **join** is the tail safety net: the only layer whose verify sees the
  whole repo. It is `once: true`, so it compiles exactly one task for the
  entire build rather than one per intent, and it carries the single
  full-suite run. Nothing earlier can catch what this catches — a change
  that passed its own narrow layer's verify but broke something the
  narrower command could not see.

### The two deliberate asymmetries

**The full suite runs once, not per story.** `join` is `once: true`, so the
full-suite cost is paid exactly once across the whole build, however many
intents pass through the chain. An earlier draft of this chain put the full
suite on two per-intent layers; against nine stories that was eighteen full
executions — about two hours — against a feature budget of two. The
asymmetry is the point: `chrome` (which changes `components/header.tsx` and
`lib/supabase/**`, both full-regression surfaces in
`docs/architecture/testing.md` §5) verifies with `pnpm test:static` only, and
the full suite catches its breakage at `join`.

**`ui` and `api` verify with a filter, not the whole suite.** `pnpm test:e2e
campaign-` and `pnpm test:e2e dialer-route` are the repo's own filter
convention, and they are the suite's real signal for these layers. A layer
whose verify command passes because it has no tests certifies nothing, so
both filters must match at least one spec when the layer lands — an empty
filter result is a silent pass and must be reported, not assumed.

### Builders skip their own sanity run on e2e-bearing layers

`hedgehog-authored-loop` step 3 asks the builder to run the packet's verify
command as a sanity check before reporting back. For the `api` and `ui`
layers that check is an e2e run, and running it twice — once by the builder,
once by `hedgehog verify` — doubles the cost for no extra signal, since
`hedgehog verify` re-runs the same command against the same tree and is the
gate that actually moves the task. Builders therefore skip the sanity run on
`api`, `ui`, and `join`, and report the work without it; `hedgehog verify`
remains the sole execution of those commands.

## What was deliberately left out

- **No stack migration.** The repo's language, package manager, tooling, and
  layout were already decided before adoption and are not Hedgehog's to
  change. No Nx, no Drizzle, no opinionated substitute for pnpm, Turborepo,
  Supabase, or Next.js — not even as a suggestion.
- **No legacy review.** `reviewer` judges only the unit under change. The
  pre-existing failures described below were not fixed here and were not
  asked about by anything in the graph.
- **No second contact store, no dialer identity table, no telephony
  provider.** Those are product decisions belonging to the campaign spec,
  not to adoption.
- **No `dialer_survey_responses` table.** The spec defers it to the
  disposition story alongside the transaction that writes it.
- **No per-story e2e filters.** A chain layer's verify command is a constant
  across every intent, because there is no `{module}` axis to vary it by.
  Story-specific filter selection lives in the story files, which record the
  exact command each story expects.

## Repo shape, as of adoption

Read 2026-10-26 at commit `bbbd5ad`. This is a snapshot of what the repo
looked like when read — not a live model, and not authoritative past that
date. Refresh it by re-running `hedgehog-adopt`, never by hand.

**Layout.** A pnpm + Turborepo monorepo. `pnpm-workspace.yaml` declares two
workspace globs: `apps/*` and `packages/*`. Two apps — `apps/folk` and
`apps/gita-life` — and four packages — `packages/data-contracts`,
`packages/program-config`, `packages/authz`, `packages/ui`. Shared source
lives at the repo root: `lib/`, `components/`, `hooks/`. Supabase lives in
`supabase/`; the e2e suite in `e2e/`; the contract gates in `scripts/`.

**Dependency direction.** One way, and guardrails enforce it. `packages/*`
depend on `packages/data-contracts`; `apps/*` depend on all four packages;
shared root modules (`lib/`, `components/`) are imported by the apps through
the `@/*` path alias, which maps to the repo root. Nothing imports back up
into an app. `scripts/verify-monorepo-guardrails.mjs` fails the build when a
server-only module (`lib/authz.ts`, `lib/supabase/admin.ts`,
`lib/supabase/server.ts`, `lib/invite-log.ts`,
`@hkmc/program-config/server`) is imported from client code.

**Observed architecture: `layered`.** The evidence is the enforced one-way
chain above — the workspace manifest declares a package graph whose
dependency direction runs from packages to apps and never back, and the
guardrail script fails the build on a reverse import. This is not a
domain/adapter split: `packages/data-contracts` is a leaf of shared types,
not a domain core, and nothing branches inward. The declared value is
`layered`, and the chain matches it: a strict linear sequence, one dependent
per layer.

**Entry points.** `apps/folk/proxy.ts` and `apps/gita-life/proxy.ts` are the
matchers Next actually reads — each delegates to the root `proxy.ts` handler
but declares its own `config.matcher`. The root `proxy.ts` alone changes
nothing, which is a trap this repo has hit before. `apps/*/public` are
symlinks to the root `public/`, so `public/sw.js` is one file served by both
apps; there is no per-app copy to keep in sync.

**Conventions.** Feature and app code uses double quotes; the generated
`components/ui/*` primitives use single quotes — match the file you are
editing. Local imports go through the `@/*` alias rather than long relative
paths. Forms are hand-written: `useState` plus explicit handlers plus
`fetch`, with no `react-hook-form` and no `zod`. Staff roles are `Admin`,
`Preacher`, `Volunteer`, and `Assistant`; role, status, `location_ids`, and
`assigned_preacher_id` all live on `public.users`, scoped by `program_id`.
Every program-scoped row carries `program_id`, and the service-role client
bypasses RLS — so the application-level scope assertion, not the database
policy, is the enforcement boundary.

**Testing surfaces.** There is no unit-test runner in this repo: no Vitest,
no Jest, no `__tests__/`, no `*.test.ts`. There are exactly two surfaces —
the standalone Node contract gates in `scripts/`, and the Playwright specs in
`e2e/specs/`. `pnpm test` is the trap that looks like a third.

**Pre-existing failures at adoption time.** A full `pnpm test:e2e` run on
the adoption commit produced **29 failures and 300 passes** in 34.5 minutes,
before any change passed through this graph. Two causes, both confirmed
pre-existing and neither touched by adoption:

1. `e2e/specs/zz-debug.spec.ts` is a zero-byte file committed at `1b05acf`.
   It registers no tests, so `e2e/specs/suite-determinism.spec.ts` — the row
   asserting every spec file is a registered test — fails on it.
2. The grid specs (`grid-cell-metrics`, `grid-cell-renderers`,
   `grid-column-drag-menu`, `grid-edit-model`, `grid-editors`,
   `grid-linked-record-picker`, `grid-row-context-menu`,
   `manage-contacts-filter`) fail against the grid work committed at
   `49ecbe2` (2026-10-13), plus the `harness-guards` row asserting
   `components/grid/**` carries no `dark:` variant — `grid-filter-popover.tsx`
   does. A `pnpm supabase:reset` and reseed does not clear them, so they are
   not fixture pollution.

These are not this graph's to fix, and the `join` layer's full-suite verify
will keep reporting them until they are. That is the honest state of the
repo at adoption: **the full e2e suite is red before this work starts.**
Any story that reports a full-suite run must name these failures as
pre-existing rather than claiming a green suite.
