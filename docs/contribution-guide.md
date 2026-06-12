# Contribution Guide

## Branch Rules

This repository uses a branch-and-review workflow.

- `main` is production and owner-controlled.
- `dev` is the shared development branch.
- `preview` is retired.
- Normal work must happen on `feature/*` branches.
- Do not push directly to `main` or `dev`.
- Production secrets and production deploy controls are owner-only.

## Pull Requests

Open PRs from `feature/*` into `dev` unless Dwaraka explicitly asks for a production-review PR into `main`.

PRs into `main` require Dwaraka to apply the `production-review-approved` label before the branch policy workflow passes.

## Required Review

`.github/CODEOWNERS` assigns all files to `@dwarakadhishadasa`. Dwaraka reviews and merges PRs.

## GitHub Automation

`.github/workflows/pr-branch-policy.yml` enforces:

- PR target must be `dev` or `main`.
- PR source cannot be `main`, `dev`, or `preview`.
- PR source must be `feature/*`.
- `main` target requires `production-review-approved`.

## Local Verification

Before opening a PR, run the checks that fit the change:

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm lint
```

Add manual verification notes for affected flows, especially:

- Staff auth
- Attendance
- Airtable reads/writes
- Offline/PWA behavior
- Role-based redirects and access

## AI Agent Rules

Repository-level Copilot/agent instructions live in `.github/copilot-instructions.md`. Key rules:

- Read `_bmad-output/project-context.md` before product-code changes.
- Keep secrets server-only.
- Do not modify `app/api/admin/invite-user/route.ts` for GitHub collaborator access; that route invites application staff, not repository collaborators.
- Use existing Next.js App Router and `pnpm` patterns.
- Preserve staff auth, Airtable integration, route paths, and service-worker coupling unless the task explicitly changes them.
