# Contributing to folk_hkmc

This repository uses a branch-and-review workflow for every collaborator, including AI coding agents.

## Branches and Access

- `main` is the production branch. Production access, production secrets, production deploys, and production merges are owner-only for Dwaraka.
- `dev` is the shared development branch. Collaborators may use the development environment, but code changes still go through pull requests.
- `preview` is retired. If it still exists in GitHub, only Dwaraka should create `dev` from the current `preview` tip, verify both refs point to the same commit, then remove `preview`.
- `feature/*` branches are the only normal working branches for collaborators.

Do not push directly to `main` or `dev`. Do not request or use production credentials unless Dwaraka explicitly approves the work.

## Development Flow

1. Start from the latest `dev` branch for normal work.
2. Create a feature branch, for example `feature/contact-form-fix`.
3. Make and test changes locally.
4. Open a pull request from `feature/*` into `dev`.
5. Include local verification notes in the PR.
6. Dwaraka reviews the PR and merges it.
7. Dwaraka alone merges or pushes reviewed changes to `main` for production.

Use `main` as a PR target only when Dwaraka asks for a direct production-review PR, such as an urgent owner-approved hotfix. Main-target PRs require Dwaraka to apply the `production-review-approved` label before the branch-policy check passes.

## Local Verification

Before opening a PR, run the checks that fit the change:

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm lint
```

This project currently has no full automated test suite. Add manual verification notes for affected user flows, especially staff auth, attendance, Airtable-backed reads/writes, and offline/PWA behavior.

## GitHub Copilot MCP

Collaborators who use GitHub Copilot MCP should configure the GitHub MCP server at:

```text
https://api.githubcopilot.com/mcp/
```

AI agents must follow the same branch, local-test, PR, and production-access rules as human collaborators.

## Owner GitHub Settings Checklist

Committed files can guide collaborators and fail bad PR branches, but full enforcement requires GitHub repository settings. Dwaraka should configure:

- Branch protection or rulesets for `main` and `dev`.
- Require pull requests before merging into `main` and `dev`.
- Require review from `@dwarakadhishadasa` or code-owner review.
- Restrict direct pushes to `main` and `dev`.
- Require the `PR Branch Policy` status check after the workflow has run at least once.
- Create the `production-review-approved` label for exceptional owner-approved PRs targeting `main`.
- Keep production environment secrets and deployment controls owner-only.
- Confirm `dev` exists remotely and remove `preview` only after `dev` points to the same commit.

Never commit Airtable tokens, Supabase service-role keys, Vercel production credentials, GitHub tokens, or other secrets.
