# Contribution Guide

## Branch Rules

This repository uses a branch-and-review workflow.

- `master` is the Vercel production branch for the `folk-hkmc` project (`folk-hkmc-rho.vercel.app`). It is promoted by an owner-approved fast-forward from `dev`.
- `main` is the production branch for the legacy `folk-hkmc-bdnv` preview project. It is not the current production branch and must not be modified.
- `dev` is the shared development branch.
- `preview` is retired.
- Normal work must happen on `feature/*` or `fix/*` branches.
- Do not push directly to `main`, `dev`, or `master`.
- Production secrets and production deploy controls are owner-only.

## Pull Requests

Open PRs from `feature/*` into `dev` unless Dwaraka explicitly asks for a production-review PR into `main`.

PRs into `main` require Dwaraka to apply the `production-review-approved` label before the branch policy workflow passes.

Production promotion is an owner-run fast-forward of `master` to the `dev` tip after the release gates in the [Deployment Guide](./deployment-guide.md) pass. Do not open a PR into `main` as the production promotion path.

## Required Review

`.github/CODEOWNERS` assigns all files to `@dwarakadhishadasa`. Dwaraka reviews and merges PRs.

## GitHub Automation

`.github/workflows/pr-branch-policy.yml` enforces:

- PR target must be `dev` or `main`.
- PR source cannot be `main`, `dev`, or `preview`.
- PR source must be `feature/*` or `fix/*`.
- `main` target requires `production-review-approved`.

`master` is promoted by the owner outside the PR flow; the policy workflow does not gate it.

`.github/workflows/quality-gates.yml` enforces:

- `pnpm guardrails`
- `pnpm typecheck:workspace` before app builds
- `pnpm build:apps`
- `pnpm lint`

## Local Verification

Before opening a PR, run the checks that fit the change:

```bash
pnpm guardrails
pnpm typecheck:workspace
pnpm build:apps
pnpm lint
```

Add manual verification notes for affected flows, especially:

- Staff auth
- Attendance
- Supabase reads/writes and RLS scoping
- Offline/PWA behavior
- Role-based redirects and access

## AI Agent Rules

Repository-level agent instructions live in `AGENTS.md`; Copilot additionally loads its own `.github/copilot-instructions.md`. Key rules:

- Read `AGENTS.md` before product-code changes.
- Keep secrets server-only.
- Treat Turborepo as the task runner, not the package-boundary enforcer; run `pnpm guardrails` after workspace/package/import changes.
- Never rely on `next build` alone for type safety because build-time type errors are ignored by Next config.
- Keep `@hkmc/authz`, `@hkmc/program-config/server`, and server `lib/*` services out of client component runtime graphs.
- Do not modify `apps/*/app/api/admin/invite-user/route.ts` for GitHub collaborator access; that route invites application staff, not repository collaborators.
- Use existing Next.js App Router and `pnpm` patterns.
- Preserve staff auth, Supabase data access, route paths, and service-worker coupling unless the task explicitly changes them.
