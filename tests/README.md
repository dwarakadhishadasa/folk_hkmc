# Unit tests

Vitest 5, node environment, no browser, no database, no network. A test in this
layer must pass on a clean checkout with nothing started.

Playwright owns `e2e/` and is documented separately in
[`docs/architecture/testing.md`](../../docs/architecture/testing.md). That file
is the contract for *what to run*; this file is how the unit layer is built.

---

## Running

```bash
pnpm test:unit          # both layers: turbo run test, then root vitest run
pnpm test               # alias for the above
pnpm test:unit:root     # root project only — lib/, components/, hooks/, tests/
pnpm test:unit:watch    # root project, watch mode
```

`pnpm test:unit` is the script CI runs, and it is wired into `pnpm quality:ci`.
Run it before claiming any change is verified.

To run one package's tests:

```bash
pnpm --filter @hkmc/data-contracts test
```

To run one file:

```bash
pnpm exec vitest run lib/site-url.test.ts
```

> `pnpm test:unit:root` and `pnpm exec vitest` skip the package projects. That is
> what you want while iterating on a root test, and exactly what you must not
> report as the full run.

---

## Layout

There are three Vitest projects, because there are three places code lives:

| Project | Config | Covers |
|---|---|---|
| `@hkmc/data-contracts` | `packages/data-contracts/vitest.config.ts` | `src/**/*.test.ts` |
| `@hkmc/program-config` | `packages/program-config/vitest.config.ts` | `src/**/*.test.ts` |
| root | `vitest.config.mts` | `lib/`, `components/`, `hooks/`, `tests/` |

The two package projects are reached through `turbo run test`, which is why each
of those manifests carries a `test` script. The other four workspace packages
(`authz`, `ui`, and both apps) deliberately have none: `authz` and `ui` are
re-export shims with no logic of their own, and the apps are thin — their code
lives at the repo root and is covered by the root project.

Tests are **colocated** with the code they cover (`lib/site-url.test.ts`, not
`tests/lib/site-url.test.ts`). Two consequences worth knowing:

- `apps/*/tsconfig.json` includes `../../lib/**`, `../../components/**`,
  `../../hooks/**` and `../../tests/**`, so `pnpm typecheck:workspace` checks
  every unit test. A type error in a test fails the type gate like any other.
- The root `tsconfig.json` is not typechecked by `typecheck:workspace` (the root
  is not a workspace package). Everything under `tests/` is included by both app
  projects to make up for it.

### `tests/support/`

Shared helpers, not tests. Vitest's root `include` matches
`tests/**/*.test.ts`, so a helper that is not named `*.test.ts` is never run as
a suite.

| File | Purpose |
|---|---|
| `tests/support/staff.ts` | `staffContext(overrides)` — a complete valid `StaffContext` |
| `tests/support/server-only.ts` | `server-only` stand-in, aliased in `vitest.config.mts` |

---

## Two things that are not obvious

### `server-only`

Half of `lib/` starts with `import "server-only"`, which throws at import time
unless the bundler selected the `react-server` condition. Next sets that; plain
Node does not. `vitest.config.mts` aliases the specifier to
`tests/support/server-only.ts`, an empty module.

That alias is safe in one direction only. The guard exists to stop server code
reaching a browser bundle, and a Node test never becomes one. Do not invert it —
nothing under test may assume it is running in a client, and nothing here should
be copied into a client-side test setup later.

### Aliases

`vitest.config.mts` restates the `@/*` and `@hkmc/*` aliases from
`tsconfig.json` explicitly, as regexes, in priority order. `@hkmc/program-config`
must precede `@hkmc/program-config/server`, or the server entry resolves to the
index. The root config does **not** glob `packages/**`: those tests belong to
their own projects, and a suite that ran twice would report twice.

---

## Writing a test

Prefer the smallest thing that can fail for the reason you care about.

```ts
import { describe, expect, it } from "vitest"

import { staffContext } from "@/tests/support/staff"

describe("requireRole", () => {
  it("refuses a Volunteer", () => {
    expect(() => requireRole(staffContext({ role: "Volunteer" }), ["Admin"])).toThrow()
  })
})
```

Rules that have already earned their place here:

- **Import `describe`/`it`/`expect` explicitly.** Globals are off. It keeps
  `tsc` honest without a `types` entry, and it makes a file's runner obvious.
- **Build fixtures through `staffContext()`, never an object literal.** An
  authorization test should name the one field it varies.
- **Restore `process.env` in `afterEach`.** `lib/site-url.ts` reads four
  variables at call time; a leaked value makes the next file's failure look
  unrelated. `lib/site-url.test.ts` shows the snapshot/restore pattern.
- **Do not reach for Supabase.** If a function needs a client, the thing to test
  is above or below it — extract a pure helper rather than mocking the client.
- **Do not assert on a mock's calls to prove behaviour.** Assert the return
  value, the thrown error, or the narrowed type.

### Worth unit-testing, in this repo

Pure logic that e2e can only reach through a page render: URL and env
resolution, role/scope predicates, pagination and cap arithmetic, sorting and
dedupe, payload shaping. The `MANAGE_BULK_MAX_ITEMS` cap and the
`normalizeContactId` UUID check in `lib/manage/api-handlers.ts` are the model —
`e2e/specs/manage-contacts-api.spec.ts` proves the route's status codes against
a real server, and a unit test could prove the same rules against a real
function for a fraction of the cost.

### Not worth unit-testing here

Anything that needs a rendered DOM. There is no jsdom and no
`@testing-library/react`; adding one is a decision, not a convenience. A
component's behaviour is asserted in `e2e/specs/`.

---

## CI

`.github/workflows/quality-gates.yml` runs `pnpm test:unit` between the
typecheck and the build. `pnpm quality:ci` runs the same sequence locally, so a
green `quality:ci` predicts a green `quality-gates` job.

The unit layer needs no secrets and no services, which is why it belongs in CI
at all. `pnpm test:e2e` still does not run there — it needs Supabase, Mailpit
and a seeded database.

---

## Write-time enforcement

`bmad-testarch-framework` can install a PreToolUse hook
(`.claude/hooks/tea-enforce.cjs`) that blocks a `.only`, a `waitForTimeout` or
an oversized test file *as it is written*. It was **not** installed here: it
hooks Claude Code's `Write`/`Edit`/`MultiEdit` events, and this repo is worked on
through OpenCode, which has no equivalent interception point. The hook would sit
in a gitignored `.claude/settings.json` and never fire.

Enforcement therefore stays where it already is: `bmad-testarch-test-review` and
human review.

---

## Knowledge base

The workflow's stack-neutral fragments that actually apply to a Node unit layer:

- `fixture-architecture.md` — pure function, then fixture, then compose
- `data-factories.md` — overrides rather than a second factory per case
- `test-quality.md` — one reason to fail per test

The Playwright, network-interception and Pact fragments in the same knowledge
base do not apply to this layer and were not used.
