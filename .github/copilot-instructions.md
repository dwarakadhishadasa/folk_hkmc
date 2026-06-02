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
- Do not modify `app/api/admin/invite-user/route.ts` for GitHub collaborator access. That route invites application staff users, not repository collaborators.
- Use `pnpm` commands and existing Next.js App Router patterns.
- Preserve staff auth, Airtable integration, route paths, and service-worker coupling unless the task explicitly covers them.

## Verification

Before opening a PR, run relevant local checks:

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm lint
```

If a check is not applicable or cannot run locally, include the reason in the PR.
