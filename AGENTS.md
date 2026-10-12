<!-- bmad:context -->
<!-- Verified 2026-10-08 against 188fe8e. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## folk_hkmc

HKMC program-operations monorepo for the FOLK Chennai and Gita Life web apps. Next.js 16 App Router with `proxy.ts`, pnpm + Turborepo, Supabase-backed staff auth. Planning specs in `_bmad-output/specs/<spec>/`; documentation index at `docs/index.md`.

## Policy

- Never push to `main` or `dev`; open a PR from `feature/*` or `fix/*` (`preview` is retired). `.github/workflows/pr-branch-policy.yml` enforces the branch and label rules — read it rather than working around it.
- `main` is owner-controlled production; Dwaraka alone merges and promotes.
- Ask Dwaraka before inviting collaborators, changing repository roles or branch protection, deleting branches, touching production settings, merging, or any direct remote branch update.
- Never run `pnpm deploy:prod`, `deploy:folk:prod`, or `deploy:gita-life:prod`, and never read or modify production secrets or production environment config, without asking Dwaraka.

## Where things are

- Planning and per-story specs: `_bmad-output/specs/<spec>/`
- Staff authorization boundary: `lib/authz.ts` — `getStaffContext()`, `requireRole()`
- E2E suite: specs in `e2e/specs/`, config `playwright.config.ts`. Claiming a matrix row is Covered? `docs/claiming-a-matrix-row.md`
- Story 2's 19-row coverage map: `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md`

## Running and verifying

- `pnpm test` runs **zero tests** and exits 0 — no package defines a `test` script. Verify e2e work with `pnpm test:e2e`.
- `pnpm test:e2e` needs the local stack up once (`pnpm dev:local`) and boots the app itself. Never `pnpm exec playwright test`: the readiness gate lives in the script, so a bare invocation runs against an unasserted stack.
- A full e2e run is ~5-7 minutes at one worker. **One runner at a time** — every spec shares one seeded database, so concurrent runs corrupt each other's fixtures and produce false failures.
- After touching specs, fixtures, or `playwright.config.ts`, run `pnpm test:e2e:determinism` (two runs back to back, no reset).
- CI runs guardrails, `typecheck:workspace`, `build:apps`, and lint — and **not** the e2e suite. A green CI run says nothing about e2e.
- `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so a green `pnpm build` is not type-safety. `pnpm typecheck:workspace` is the gate.
- Run `pnpm guardrails` after changing `apps/*`, `packages/*`, `lib/*`, `components/*`, `hooks/*`, package manifests, `tsconfig*.json`, or `turbo.json`. Turborepo is the task runner, not the architecture enforcer; `--graph` on `scripts/verify-monorepo-guardrails.mjs` shows the dependency shape.
- Supabase commands are version-pinned through `pnpm supabase:start` (`pnpm dlx supabase@2.98.2`). Use the pnpm scripts; a bare `supabase` CLI is a different version.

## Conventions that differ from defaults

- Import local modules through the `@/*` alias, not long relative paths.
- Quote style is split: app and feature code uses double quotes, generated `components/ui/*` primitives use single. Match the file you are editing.
- Staff roles are `Admin`, `Preacher`, `Volunteer`, `Assistant`. Role, status, `location_ids`, and `assigned_preacher_id` all live on the `public.users` table, scoped by `program_id`.
- Server-only, enforced by guardrails: `lib/supabase/admin.ts`, `lib/supabase/server.ts`, `lib/invite-log.ts`, `@hkmc/program-config/server`. Client code takes browser-safe DTOs from `@hkmc/data-contracts`.
- `@hkmc/authz` and `@hkmc/ui` are migration shims re-exporting `lib/authz.ts` and `components/ui/button.tsx`. Nothing imports them — import `@/lib/authz` and `components/ui/*` directly.
- The attendance endpoint is `/attendance`, not `/api/attendance`. The human-facing link is `/attend?session=<id>`.
- `public/sw.js` exists in three copies but Next serves only `apps/*/public/`. Edit the app copies; a root-only edit ships nothing. Its `202 {queued:true}` response is the contract four files depend on.
- Dead but still typechecked — do not build on them: `components/registration-form.tsx`, `lib/store.ts`, `lib/offline-sync.ts`, `components/offline-sync-provider.tsx`.

## Known pitfalls

- `proxy.ts` does **not** match `/manage` or `/api/manage/*` (a known gap), nor `/api/auth/me` or `/api/registration`. Session refresh does not run for those — check the matcher rather than assuming a protected route refreshes.
- A green e2e run prints **no** `✘` marks. If one appears, it is either a `test.fail` tripwire firing because its defect got fixed (remove the marker and update `matrix-coverage-map.md` in the same commit) or a real failure the run is misreporting.
- Airtable is removed: `lib/airtable.ts` and `@hkmc/airtable` no longer exist. Do not reintroduce references; `pnpm test:airtable-removal` guards it.
- Never commit a deliberately broken spec under `e2e/specs/` — that is a permanently red suite. Generate failures into a temp dir and remove them in a `finally`.
- The suite asserts `playwright.config.ts` and `package.json` as text. If an assertion goes red, fix the source; editing the assertion to match your change is how a broken gate becomes a green run.
- `StaffContext.lastSyncedAt` is set to `new Date().toISOString()` in `lib/authz.ts` — nothing reads it from a column. Do not treat it as a sync timestamp.

<!-- /bmad:context -->

## Testing policy (mandatory)

**Read [`docs/architecture/testing.md`](docs/architecture/testing.md) before changing code.** It is the contract: which specs cover which source paths, which shared files widen the blast radius, and how to diagnose a failure. This section is the short version.

### The one trap

`pnpm test` runs **zero tests** and exits 0 — no package defines a `test` script, so `turbo run test` finds nothing. **Never report `pnpm test` as a passing test run.** There is no unit runner; the only surfaces are the `scripts/` gates and the Playwright suite.

### Three levels

| Level | When | Command |
|---|---|---|
| **Targeted** | Every change, before reporting done | `pnpm test:static` (guardrails + typecheck + lint, no stack), then the feature script |
| **Feature** | A shared component changed; finishing a story; claiming a matrix row | `pnpm test:e2e:manage` / `:grid` / `:theme` / `:guards` |
| **Full** | `lib/authz.ts`, `lib/supabase/*`, `proxy.ts`, `components/header.tsx`, `components/providers.tsx`, a shared `components/ui/*`; before a PR | `pnpm test:e2e` (~5–7 min) |

Escalate one level when the file you touched is in the shared-components table in the guide, or when a targeted run surfaces an unrelated failure.

### Rules

- Always run e2e through `pnpm test:e2e` or a `test:e2e:*` script. **Never `pnpm exec playwright test`** — the readiness gate lives in the script, so a bare invocation runs against an unasserted stack.
- Filter with a **regex, never a glob**: `pnpm test:e2e grid-` ✓, `pnpm test:e2e "e2e/specs/grid-*.spec.ts"` ✗ (selects 0 tests, still exits 0). Multiple filters are OR'd.
- `pnpm test:e2e --list <filter>` shows scope with no browser — the cheapest way to see what you are about to run.
- **One e2e runner at a time.** Every spec shares one seeded database; concurrent runs produce false failures.
- `pnpm typecheck:workspace` is the type gate — `next.config.mjs` sets `ignoreBuildErrors`, so a green build is not type-safety.
- **Never weaken a gate to make it pass.** Fix the source; the suite asserts `package.json` and `playwright.config.ts` as text to catch exactly that.
- CI runs guardrails, typecheck, build, lint — **not** e2e and not the contract gates. A green CI run is not verification of a behavioural change.
- Known pre-existing failure: `pnpm test:airtable-removal` fails 3 of 30 checks on `dev`/`main` as of `44d9812` (story 7-9 WIP `scripts/migrate-airtable-data.mjs` and a comment at `components/manage/manage-contacts-table.tsx:122` are not in its allowlist). Confirm with `git stash` and report it as pre-existing; do not edit the gate to hide it.

### Reporting

State the **actual commands run** and their **real results** — the exact command, the pass count from that run's output, and any failure you did not cause, named as pre-existing. Do not fabricate a green run: if you could not run something, say what is unverified.
