# GitHub Copilot Instructions

Follow these repository rules for every change.

## Collaboration Rules

- Work only on `feature/*` branches.
- Treat `main` as production and owner-controlled.
- Treat `dev` as the shared development branch.
- Do not push directly to `main` or `dev`.
- Do not use, request, expose, or modify production secrets or production environments.
- Open PRs from `feature/*` into `dev` unless Dwaraka explicitly asks for a PR into `main`.
- PRs targeting `main` require Dwaraka to apply the `production-review-approved` label.
- Dwaraka reviews and merges PRs, and Dwaraka alone moves reviewed changes to production.
- `preview` is retired and should not be used as a PR source or target.

## GitHub MCP

When GitHub MCP access is needed, use:

```text
https://api.githubcopilot.com/mcp/
```

Use GitHub MCP for repository, branch, PR, and review context. Ask Dwaraka before inviting collaborators, changing repository roles, changing branch protection, deleting branches, touching production settings, merging PRs, applying production labels, retargeting PRs to `main`, or making any direct remote branch update.

## Project Implementation Rules

- Read `_bmad-output/project-context.md` before implementing product code.
- Keep server secrets server-only.
- Treat Turborepo as the task runner, not the architecture enforcer. Run `pnpm guardrails` after changing workspace packages, imports, or `turbo.json`.
- Do not introduce workspace dependency cycles, undeclared `@hkmc/*` imports, or one-off package config drift. New packages must follow the existing `private`, `type: module`, `lint`, `typecheck`, and `tsconfig.base.json` pattern.
- Keep `@hkmc/airtable`, `@hkmc/authz`, `@hkmc/program-config/server`, `lib/airtable.ts`, `lib/authz.ts`, `lib/invite-log.ts`, and `lib/supabase/*` server-only. Client components may use browser-safe DTOs from `@hkmc/data-contracts` or public profile data from `@hkmc/program-config`.
- `next build` is not a type-safety gate in this repo because `typescript.ignoreBuildErrors` is enabled. Run `pnpm typecheck:workspace` before any build, and keep CI blocking on recursive workspace typecheck.
- Do not modify `app/api/admin/invite-user/route.ts` for GitHub collaborator access. That route invites application staff users, not repository collaborators.
- Use `pnpm` commands and existing Next.js App Router patterns.
- Preserve staff auth, Airtable integration, route paths, and service-worker coupling unless the task explicitly covers them.

## Verification

Before opening a PR, run relevant local checks:

```bash
pnpm guardrails
pnpm typecheck:workspace
pnpm build:apps
pnpm lint
```

If a check is not applicable or cannot run locally, include the reason in the PR.
