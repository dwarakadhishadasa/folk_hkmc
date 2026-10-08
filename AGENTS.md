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
- A green e2e run prints two `✘` marks — rows 1 and 4 are `test.fail` tripwires for a real missing optimistic render in `components/grid/use-grid-keyboard.ts`. Not failures, and not to be silenced.
- Airtable is removed: `lib/airtable.ts` and `@hkmc/airtable` no longer exist. Do not reintroduce references; `pnpm test:airtable-removal` guards it.
- Never commit a deliberately broken spec under `e2e/specs/` — that is a permanently red suite. Generate failures into a temp dir and remove them in a `finally`.
- The suite asserts `playwright.config.ts` and `package.json` as text. If an assertion goes red, fix the source; editing the assertion to match your change is how a broken gate becomes a green run.
- `StaffContext.lastSyncedAt` is set to `new Date().toISOString()` in `lib/authz.ts` — nothing reads it from a column. Do not treat it as a sync timestamp.

<!-- /bmad:context -->
