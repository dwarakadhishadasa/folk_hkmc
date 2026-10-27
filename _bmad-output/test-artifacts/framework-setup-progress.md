---
stepsCompleted: ['step-01-preflight', 'step-02-select-framework', 'step-03-scaffold-framework', 'step-04-docs-and-scripts', 'step-05-validate-and-summary']
lastStep: 'step-05-validate-and-summary'
lastSaved: '2026-10-27'
---

# Test framework setup — Vitest unit layer

**Status:** complete
**Run date:** 2026-10-27
**Owner:** Dwaraka

---

## Preflight

| Check | Result |
|---|---|
| `test_stack_type` | `auto` → resolved **frontend** |
| Project type | Next.js 16 App Router ×2 (`apps/folk`, `apps/gita-life`), Turborepo, pnpm 10.33.0 |
| Bundler | Next's built-in (webpack/Turbopack); Vitest brings Vite |
| Backend manifest | none (`pyproject.toml`, `go.mod`, `pom.xml`, `Gemfile`, `Cargo.toml` all absent) |
| Mobile indicators | none |
| Node | 22.23.2 local, `node-version: 22` in CI |
| Existing framework | **`playwright.config.ts` + `@playwright/test ^1.62.0`**, 46 spec files under `e2e/` |
| Existing unit runner | none |

### Deviation from `step-01-preflight`

The step halts when `playwright.config.*` exists, and Vitest is not a
first-class framework anywhere in this workflow — it appears only as the unit
config for a mobile stack and for Pact contract tests. Both facts were raised
with the user before scaffolding, and the run proceeded on an explicit decision:

> Keep Playwright as the E2E layer, untouched. Add Vitest as a **new** unit
> layer. Record this deviation rather than presenting Vitest as the workflow's
> native output.

The preflight's "no existing E2E framework" requirement is therefore treated as
satisfied-for-a-different-layer, not as a pass.

### Decisions taken

| Decision | Choice | Consequence |
|---|---|---|
| Preflight conflict | Adapt — add a layer, replace nothing | Playwright config untouched; no `e2e/` changes |
| Placement | Per-package **and** root | `turbo run test` finally runs something; root code covered by a root project |
| Scope | Unit only, node environment | No `jsdom`, no `@testing-library/react`, no component tests |
| CI | `pnpm test:unit` wired into `quality:ci` and `quality-gates.yml` | A broken unit test fails CI |

---

## Framework selection

**Vitest 5.0.5**, node environment.

Playwright was already the browser framework and is not replaced. Vitest was
chosen over Jest because the repo is already ESM (`"type": "module"` in every
package), runs Node 22, and has no Babel layer — Vitest consumes the TypeScript
and the `tsconfig` path aliases with no transform config.

---

## Scaffold

### Configuration

| File | Role |
|---|---|
| `vitest.config.mts` | Root project. Explicit regex aliases for `@/*`, `@hkmc/*`, and `server-only`; `include` covers `lib/`, `components/`, `hooks/`, `tests/` |
| `packages/data-contracts/vitest.config.ts` | Package project, `src/**/*.test.ts` |
| `packages/program-config/vitest.config.ts` | Package project, `src/**/*.test.ts` |

The root config uses `.mts` because the root `package.json` has no
`"type": "module"`; a `.ts` config loads as CommonJS and Vite warns that ESM
syntax is unsupported under the upcoming native config loader.

### Support

| File | Role |
|---|---|
| `tests/support/server-only.ts` | Empty stand-in, aliased over the `server-only` package |
| `tests/support/staff.ts` | `staffContext(overrides)` fixture factory |

The `server-only` alias is what makes `lib/` importable at all: 18 files under
`lib/` begin with `import "server-only"`, which throws outside the
`react-server` condition Next sets and plain Node does not.

### Sample tests

| File | Tests | Covers |
|---|---|---|
| `lib/site-url.test.ts` | 8 | Env precedence, trim/quote clean, Vercel fallback, invalid-candidate skip, throw path |
| `packages/data-contracts/src/index.test.ts` | 24 | `isProgramId` / `isStaffRole` / `isStaffMembershipStatus`, incl. prototype-key rejection |
| `packages/program-config/src/index.test.ts` | 4 | Profile map keys match `PROGRAM_IDS`; six module flags per program |

### Scripts

Root `package.json`:

| Script | Command |
|---|---|
| `test` | `pnpm test:unit` |
| `test:unit` | `turbo run test && vitest run` |
| `test:unit:root` | `vitest run` |
| `test:unit:watch` | `vitest` |
| `quality:ci` | `guardrails && typecheck:workspace && test:unit && build:apps && lint` |

Both real packages gained `"test": "vitest run"`. The four packages without
logic (`authz`, `ui`, both apps) deliberately gained nothing — `authz` and `ui`
are re-export shims, and the apps' code lives at the repo root.

### Wiring

- `apps/folk/tsconfig.json` and `apps/gita-life/tsconfig.json` include
  `../../tests/**/*.ts`, so `pnpm typecheck:workspace` checks the support
  fixtures. `lib/` and `packages/` were already included.
- `.github/workflows/quality-gates.yml` runs `pnpm test:unit` between the
  typecheck and the build.

### Documentation

- `tests/README.md` — new; layout, alias rules, `server-only`, writing tests,
  what is worth unit-testing here, CI, knowledge-base references.
- `docs/architecture/testing.md` — §1 and §2 rewritten (the "pnpm test is a
  trap" and "there is no unit-test runner" sections were both false after this
  change), §3a table, §7 CI list, §8 levels, §9 rule 1.
- `AGENTS.md` — the testing-policy trap paragraph, the targeted-level row, and
  the CI line.

### Not installed

**Write-time enforcement hook** (`step-04` §3). `.claude/hooks/tea-enforce.cjs`
hooks Claude Code's `Write`/`Edit`/`MultiEdit` events. This repo is worked on
through OpenCode, which has no equivalent interception point, so the hook would
sit in a local `.claude/settings.json` and never fire. `.tea/enforce-config.json`
was therefore not written either — a config with no hook is dead weight.
Enforcement stays with `bmad-testarch-test-review` and human review.

**`.nvmrc`** (`step-03` §3). The workflow suggests Node 24+; CI pins Node 22 and
`@types/node` is `^22`. Adding 24 would contradict the pipeline, so the version
stays single-sourced in `.github/workflows/quality-gates.yml`.

**Pact / playwright-utils scaffolding.** No consumer-provider boundary exists in
this repo (Supabase is the provider and it is not Pact-instrumented), and
Playwright already has a hand-built fixture layer in `e2e/fixtures/`.

---

## Validation

Every command below was run on 2026-10-27 from the repo root.

| Command | Result |
|---|---|
| `pnpm test:unit` | ✅ 3 files, **36 tests passed** (24 data-contracts, 4 program-config, 8 root) |
| `pnpm test` | ✅ same run via the alias |
| `pnpm test:unit:root` | ✅ 1 file, 8 tests |
| `pnpm guardrails` | ✅ passed — 15 dialer routes covered; 4 pre-existing warnings |
| `pnpm typecheck:workspace` | ✅ 6/6 packages |
| `pnpm lint` | ✅ 0 errors (pre-existing warnings only; none in the new files) |

Not run, and why:

- `pnpm build:apps` — part of `quality:ci`, not required by this change, and the
  build needs app env that this run did not configure.
- `pnpm test:e2e` — needs the local stack; no `e2e/` file was touched, and the
  only test-text assertion in the suite (`harness-guards.spec.ts:67`) checks
  that `test:e2e` still contains `pnpm local:readiness`, which it does.

---

## Install note for the next machine

`pnpm add` hung on this machine until Node's happy-eyeballs resolver was
disabled: `registry.npmjs.org` returns AAAA records first and the IPv6 route
blackholes. Any pnpm command that fetches needs:

```bash
NODE_OPTIONS=--no-network-family-autoselection pnpm <command>
```

This is an environment quirk, not a repository setting, so nothing was committed
for it.

---

## Next steps

1. `pnpm test:e2e` once on a fresh checkout — confirms the Playwright suite is
   untouched by the tsconfig and `package.json` edits.
2. Run `bmad-testarch-test-review` against the three sample files before they
   become the pattern others copy.
3. `bmad-testarch-test-design` if the next story needs a coverage plan across the
   unit and e2e layers.
