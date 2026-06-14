---
title: 'Fix FOLK Preview Build Env Stat Failure'
type: 'bugfix'
created: '2026-06-14T13:21:13+05:30'
status: 'done'
baseline_commit: 'c36e4a7fde22639df54d6bfc83ef6e81dc99dbf8'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FOLK preview deployment fails during `pnpm build` with `ENOENT: no such file or directory, stat '/vercel/path0/apps/folk/.env'`. Local investigation reproduced the same error when `apps/folk/.env` exists as a broken symlink, revealing that the current local convenience pattern `apps/*/.env -> ../../.env.local` is fragile in monorepo deployments.

**Approach:** Align the repo with monorepo env best practice: each app should use its own ignored `apps/<app>/.env.local` for local development, while Vercel Preview/Production should use Vercel project environment variables. Remove reliance on `.env` symlinks as a supported setup path, document the app-local pattern, and keep a small build preflight only as a migration safety net for broken symlinks that may already exist in local or uploaded build contexts.

## Boundaries & Constraints

**Always:** Keep secrets out of the repo; do not commit `.env` or `.env.local` contents. Preserve the existing program build scripts' `PROGRAM_ID` and `NEXT_PUBLIC_PROGRAM_ID` values. Local env guidance must point developers to `apps/folk/.env.local` and `apps/gita-life/.env.local`, not root env symlinks. The cleanup must be safe for local development: ordinary files and valid symlinks must remain untouched.

**Ask First:** If the implementation would require changing Vercel project settings, changing secret names, committing real env values, or deleting an existing valid local env symlink, halt and ask before proceeding.

**Never:** Do not solve this by committing an empty `apps/folk/.env`, weakening `.gitignore` so real env files can be tracked, embedding secret values into scripts, or changing runtime configuration semantics. Do not introduce new symlinks as part of the documented setup.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| App-local env file | `apps/folk/.env.local` exists and `apps/folk/.env` is absent | `pnpm --filter @hkmc/folk build` uses the app-local env file and does not look for a root symlink | No warning required |
| Vercel preview env | No env files are present, but required variables are configured in Vercel Preview env | `pnpm build` runs without requiring `apps/folk/.env` | Missing required runtime values should fail at the existing app boundary, not as filesystem `ENOENT` |
| Broken legacy symlink | `apps/folk/.env` is a symlink whose target is missing | Build preflight removes that symlink before `next build`, preventing the Next/Vercel `stat` failure | Print a concise build log line identifying the removed broken symlink |
| Real env file or valid symlink | `apps/folk/.env` is a regular file or valid symlink from an existing developer setup | Build preflight leaves it untouched and `next build` runs normally | No warning required |

</frozen-after-approval>

## Code Map

- `apps/folk/package.json` -- FOLK workspace build script that currently invokes `next build` directly after setting program IDs.
- `apps/gita-life/package.json` -- Gita Life workspace build script with the same shape and same potential broken symlink failure.
- `scripts/use-local-supabase-env.sh` -- Existing local helper already writes app-local `.env.local` files for both apps; this supports the recommended pattern and should not be changed to create symlinks.
- `.env.example` -- Current tracked example of required env names; may need comments that app developers copy values into app-local `.env.local` files or configure them in Vercel.
- `.gitignore` -- Confirms `.env*` files are intentionally ignored and should stay ignored, except tracked example files if app-local examples are added.

## Tasks & Acceptance

**Execution:**
- [x] `.env.example` -- add concise monorepo guidance that real local values belong in `apps/folk/.env.local` or `apps/gita-life/.env.local`, and Preview/Production values belong in the matching Vercel project environment -- documents that `.env` symlinks are not required.
- [x] `.gitignore` -- if app-local example files are introduced, add explicit exceptions for `.env.example` and `apps/*/.env.example` while keeping real `.env`, `.env.local`, `.env.production`, and `.env.production.local` files ignored -- permits safe examples without exposing secrets.
- [x] `apps/folk/.env.example` and `apps/gita-life/.env.example` -- evaluated and intentionally did not add duplicate app-local templates because the root `.env.example` now documents app-local copy targets -- gives developers a non-symlink path without creating template drift.
- [x] `scripts/remove-broken-env-symlinks.mjs` -- add a small Node script that checks each supplied app directory for `.env`, `.env.local`, `.env.production`, and `.env.production.local`; remove only entries that are symlinks whose targets cannot be stat'ed -- neutralizes legacy broken symlinks without making symlinks part of the architecture.
- [x] `apps/folk/package.json` -- prepend the cleanup script to `build` before `PROGRAM_ID=folk NEXT_PUBLIC_PROGRAM_ID=folk next build` -- prevents the reproduced preview failure while app-local/Vercel env becomes the source of truth.
- [x] `apps/gita-life/package.json` -- prepend the cleanup script to `build` before `PROGRAM_ID=gita-life NEXT_PUBLIC_PROGRAM_ID=gita-life next build` -- keeps the sibling app protected from the same legacy symlink failure.

**Acceptance Criteria:**
- Given a developer reads the env setup guidance, when they configure local development, then the documented path is app-local `.env.local` files or `vercel env pull` per linked app project, not `.env` symlinks to the repo root.
- Given `apps/folk/.env` is absent and Vercel Preview variables are configured, when `pnpm --filter @hkmc/folk build` runs in preview, then the build does not fail with `ENOENT ... stat ... apps/folk/.env`.
- Given `apps/folk/.env` is a broken legacy symlink, when `pnpm --filter @hkmc/folk build` runs, then the symlink is removed and the build does not fail with `ENOENT ... stat ... apps/folk/.env`.
- Given `apps/folk/.env` is a valid symlink or regular file, when the cleanup script runs, then that file remains in place.
- Given `apps/gita-life/.env` has the same broken legacy symlink state, when `pnpm --filter @hkmc/gita-life build` runs, then it receives the same cleanup behavior.

## Spec Change Log

## Design Notes

The architectural target is app-local env ownership: each deployable app should be buildable without depending on a root `.env` file. Vercel project env vars remain the source for Preview/Production, and ignored `apps/<app>/.env.local` files are only for developer machines.

The implementation keeps one root `.env.example` instead of adding app-local example files so the list of supported env names has one tracked source. Developers should copy from that template into the app-local `.env.local` file they need.

Use Node rather than shell conditionals for the migration guard so it is readable, testable, and portable across package-manager environments. The script should use `lstat` to identify symlinks and `stat` to validate the symlink target; only `ENOENT`/`ENOTDIR` target failures should trigger removal. Other filesystem errors should be thrown so real permission or path issues are not hidden.

## Verification

**Commands:**
- `node scripts/remove-broken-env-symlinks.mjs apps/folk apps/gita-life` -- expected: succeeds without removing valid local env symlinks or app-local `.env.local` files.
- `pnpm --filter @hkmc/folk build` -- expected: succeeds when `apps/folk/.env` is absent and app-local/Vercel env values are supplied.
- `tmpdir=$(mktemp -d); if [ -e apps/folk/.env ] || [ -L apps/folk/.env ]; then mv apps/folk/.env "$tmpdir/folk.env"; fi; ln -s ../../missing-env-file apps/folk/.env; pnpm --filter @hkmc/folk build; status=$?; rm -f apps/folk/.env; if [ -e "$tmpdir/folk.env" ] || [ -L "$tmpdir/folk.env" ]; then mv "$tmpdir/folk.env" apps/folk/.env; fi; rmdir "$tmpdir"; exit $status` -- expected: succeeds and restores any prior local symlink/file after proving the broken-symlink case.
- `pnpm guardrails` -- expected: succeeds after package script changes.

## Suggested Review Order

**Build Preflight**

- Validate app directories before scanning env files.
  [`remove-broken-env-symlinks.mjs:26`](../../scripts/remove-broken-env-symlinks.mjs#L26)

- Remove only unusable env symlinks, with a final symlink recheck.
  [`remove-broken-env-symlinks.mjs:34`](../../scripts/remove-broken-env-symlinks.mjs#L34)

- FOLK build runs the preflight before Next reads env files.
  [`package.json:8`](../../apps/folk/package.json#L8)

- Gita Life build uses the same migration guard.
  [`package.json:8`](../../apps/gita-life/package.json#L8)

**Env Guidance**

- Document app-local env files and Vercel project env ownership.
  [`.env.example:1`](../../.env.example#L1)

- Keep real env files ignored while safe examples remain trackable.
  [`.gitignore:23`](../../.gitignore#L23)
