---
title: 'Collaborator GitHub Rules'
type: 'chore'
created: '2026-06-02'
status: 'done'
baseline_commit: 'ec19aebc5fdb083602f5c5b66c8f587bcb817e33'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/development-guide.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** New GitHub collaborators need explicit rules that keep production access owner-only, allow shared dev work, and require all code changes to flow through feature branches and reviewed pull requests. The repository currently has no `.github/` policy files or contributor guide that communicates those boundaries to humans or AI coding agents.

**Approach:** Add repository-level collaboration instructions, PR guidance, owner code ownership, and a lightweight PR branch-policy workflow. Document the GitHub repository settings that still need to be enforced outside the codebase because the available GitHub MCP tools do not expose branch-protection or ruleset mutation.

## Boundaries & Constraints

**Always:** Treat `main` as the production branch and `dev` as the shared development branch. Replace the existing `preview` branch with `dev` before publishing the new workflow rules, preserving the current `preview` tip as the starting point for `dev` unless Dwaraka says otherwise. Production access and production merges stay with Dwaraka only. Collaborators work locally and on `feature/*` branches, then open a PR for Dwaraka to review and merge. Use `https://api.githubcopilot.com/mcp/` as the GitHub Copilot MCP server reference for collaborators who configure GitHub MCP access. Keep the policy as repo documentation and GitHub workflow metadata, not product staff-auth behavior.

**Ask First:** Any change that invites GitHub collaborators, grants repository roles, modifies production secrets/environments, deletes a branch with unmerged commits, directly pushes to `main`/`dev`, or attempts to apply branch protection/rulesets through an authenticated GitHub API must be confirmed by Dwaraka before execution.

**Never:** Do not modify `app/api/admin/invite-user/route.ts`; it invites app staff users, not GitHub collaborators. Do not expose production secrets, Supabase service-role keys, Airtable tokens, Vercel production credentials, or GitHub tokens in committed files. Do not claim branch protection is fully enforced unless GitHub settings are actually applied.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New collaborator reads repo | Clone/open repository | `CONTRIBUTING.md` and `.github/copilot-instructions.md` explain dev access, owner-only production, feature-branch work, local testing, PR review, and GitHub MCP URL | If collaborator needs production access, docs say to stop and request Dwaraka approval |
| AI assistant works in repo | GitHub Copilot/Codex reads repository instructions | Assistant is told to use feature branches, avoid production, keep secrets out of client code, run local checks, and produce PR-ready changes | If a task asks for production access or direct protected-branch changes, assistant must ask Dwaraka |
| PR opened from bad branch | PR source is `main`, `dev`, `preview`, or not `feature/*` | Branch-policy workflow fails with clear guidance | Direct pushes still require GitHub branch protection/rulesets outside the repo |
| PR opened correctly | PR source is `feature/...` and target is `dev` or `main` | Branch-policy workflow passes and PR template asks for local testing evidence and Dwaraka review | Missing test evidence remains visible in PR checklist |

</frozen-after-approval>

## Code Map

- `app/api/admin/invite-user/route.ts` -- Product staff invitation route; explicitly out of scope for GitHub collaborator rules.
- `docs/development-guide.md` -- Existing local setup, quality gates, environment variables, and manual verification instructions.
- `README.md` -- Sparse project entry point that can point collaborators to setup and contribution rules.
- `.github/copilot-instructions.md` -- New GitHub Copilot/Codex-facing repository instructions.
- `.github/PULL_REQUEST_TEMPLATE.md` -- New PR checklist for branch, local testing, and owner review.
- `.github/CODEOWNERS` -- New owner review signal for all repository paths.
- `.github/workflows/pr-branch-policy.yml` -- New PR guard for feature-branch naming and allowed target branches.
- `CONTRIBUTING.md` -- New human-facing collaborator workflow and GitHub settings checklist.
- GitHub branches -- Remote branch state where `dev` should replace `preview` as the shared development branch.

## Tasks & Acceptance

**Execution:**
- [x] `CONTRIBUTING.md` -- Add the collaborator workflow, environment boundaries, feature-branch policy, PR/review path, local test expectations, and GitHub settings checklist.
- [x] `.github/copilot-instructions.md` -- Add AI-agent rules for GitHub MCP use, branch discipline, production avoidance, local validation, and project-specific implementation constraints.
- [x] `.github/PULL_REQUEST_TEMPLATE.md` -- Add a compact checklist requiring feature branch, target branch, local test evidence, no production access, and Dwaraka review.
- [x] `.github/CODEOWNERS` -- Route all files to `@dwarakadhishadasa` for review visibility.
- [x] `.github/workflows/pr-branch-policy.yml` -- Add a PR-only guard that accepts `feature/*` branches targeting `main` or `dev`, and rejects protected/source mismatch branches.
- [x] `README.md` and/or `docs/development-guide.md` -- Link the new contributor rules so new collaborators find them from the normal project docs.
- [x] GitHub branches -- Verified local `dev`, local `preview`, and `origin/preview` all pointed at `117fcca68cae85dcac1d26e1d0092a7ba55e0159`; deleted local `preview`; documented the required remote `dev`/`preview` handoff because step-03 prohibits remote operations.

**Acceptance Criteria:**
- Given a new collaborator opens the repository, when they read the top-level docs, then they can find the collaboration policy before making changes.
- Given an AI coding agent reads repository instructions, when it prepares changes, then it is instructed to avoid production, use `feature/*`, test locally, and produce a PR for Dwaraka.
- Given a PR is opened from a non-`feature/*` branch to `main` or `dev`, when GitHub Actions runs, then the branch-policy job fails with an actionable message.
- Given a PR is opened from `feature/*` to `dev` or `main`, when GitHub Actions runs, then the branch-policy job passes.
- Given branch-protection enforcement is outside committed files, when the docs are reviewed, then they clearly state that Dwaraka must enable GitHub rulesets/branch protection for full enforcement.

## Design Notes

Repository files can communicate and partially validate the workflow, but they cannot by themselves prevent direct pushes to protected branches. Full enforcement requires GitHub branch protection/rulesets on `main` and `dev`: require pull requests, require Dwaraka/code-owner review, restrict who can push, and require the branch-policy status check after the workflow exists.

The implementation workflow forbids remote operations, so the remote branch handoff is not performed in this step. Locally, `dev` already preserved the `preview` tip and local `preview` was safely deleted. In GitHub, Dwaraka still needs to create remote `dev` from remote `preview` and remove remote `preview` after confirming both refs match.

## Verification

**Commands:**
- `pnpm lint` -- expected: no new lint/workflow syntax issues from this documentation-only change, or only pre-existing lint findings are reported.
- `git diff --check` -- expected: no whitespace errors.

**Results:**
- `git diff --check` -- passed before and after the review patch.
- Branch-policy shell simulation -- passed for `feature/test -> dev`, passed for `feature/test -> main` with `production-review-approved`, failed for `feature/test -> main` without the label, failed for `preview -> dev`, and failed for `bugfix/test -> dev`.
- `pnpm lint` -- failed on pre-existing React/ESLint findings in untouched application files, including JSX inside try/catch in server pages and set-state-in-effect warnings/errors in existing components.

**Manual checks:**
- Inspect `CONTRIBUTING.md`, `.github/copilot-instructions.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, and `.github/workflows/pr-branch-policy.yml` for exact policy language.

## Review Notes

- Blind Hunter and Edge Case Hunter flagged that `feature/* -> main` PRs needed an owner-approval signal. Patched `.github/workflows/pr-branch-policy.yml` to require the `production-review-approved` label for `main` targets and documented that label in collaborator docs.
- Blind Hunter also noted remote branch deletion and MCP-driven merges needed clearer owner gating. Patched `CONTRIBUTING.md` and `.github/copilot-instructions.md` to make those owner-controlled actions explicit.
- Broader CI and secret-scanning enforcement was classified as deferred work because this story documents and partially validates collaborator rules but does not introduce a full CI/security pipeline.

## Suggested Review Order

**Workflow Contract**

- Human-facing source of truth for branches, access, and production ownership.
  [`CONTRIBUTING.md:7`](../../CONTRIBUTING.md#L7)

- Normal collaborator path from `dev` to reviewed PRs.
  [`CONTRIBUTING.md:14`](../../CONTRIBUTING.md#L14)

- Owner-only settings needed for full GitHub enforcement.
  [`CONTRIBUTING.md:48`](../../CONTRIBUTING.md#L48)

**AI And PR Guardrails**

- Copilot/MCP rules mirror human branch and production boundaries.
  [`copilot-instructions.md:5`](../../.github/copilot-instructions.md#L5)

- MCP-driven merges, labels, and remote branch updates require Dwaraka.
  [`copilot-instructions.md:25`](../../.github/copilot-instructions.md#L25)

- PR checklist captures branch, access, label, and verification expectations.
  [`PULL_REQUEST_TEMPLATE.md:5`](../../.github/PULL_REQUEST_TEMPLATE.md#L5)

**Branch Enforcement**

- Workflow reacts when labels change so main-target approval can re-evaluate.
  [`pr-branch-policy.yml:3`](../../.github/workflows/pr-branch-policy.yml#L3)

- `main` targets require the owner-applied production approval label.
  [`pr-branch-policy.yml:36`](../../.github/workflows/pr-branch-policy.yml#L36)

- Protected and retired branches cannot be PR sources.
  [`pr-branch-policy.yml:41`](../../.github/workflows/pr-branch-policy.yml#L41)

**Discovery And Follow-Up**

- README points new collaborators to the policy before coding.
  [`README.md:5`](../../README.md#L5)

- Development guide summarizes branch rules in setup docs.
  [`development-guide.md:13`](../../docs/development-guide.md#L13)

- Deferred CI/security enforcement is captured separately.
  [`deferred-work.md:4`](deferred-work.md#L4)
