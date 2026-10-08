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
pnpm test:e2e
```

When you have touched the e2e suite, add `pnpm test:e2e:determinism` — see
[Proving the suite is a gate](#proving-the-suite-is-a-gate) below.

`pnpm test:e2e` runs the Playwright end-to-end suite against the **local** stack
and is local-only — it refuses a non-loopback `E2E_BASE_URL`, so it can never
touch the hosted project.

Its prerequisites are the stack itself plus the app env file:

```bash
pnpm supabase:start && pnpm mailpit:start && pnpm supabase:push && pnpm supabase:env && pnpm seed:local
pnpm exec playwright install chromium
```

`apps/folk/.env.local` must carry `SUPABASE_SERVICE_ROLE_KEY` and a **loopback**
`SUPABASE_URL`; the unknown-email row queries `auth.users` through the admin API
to prove nothing was provisioned, and it throws rather than skipping when either
is missing.

`pnpm test:e2e` then runs `pnpm local:readiness` as its own gate and boots the folk
app via Playwright's `webServer`, so you do not need to start `pnpm dev` yourself.
(If the app is already running from `pnpm dev:local`, Playwright reuses it and
skips the boot — the readiness gate still runs, because it is not inside
`webServer`. Run `pnpm test:e2e` rather than `pnpm exec playwright test`, which
skips the gate.)

It signs in through the real `/login` → Mailpit OTP → `verifyOtp` path once per
role, writes a `storageState` file per role into the gitignored `e2e/.auth/`, and
every spec then runs signed in without touching `/login`. Those files hold live
Supabase session tokens for the seeded fixture staff accounts — never commit
them.

Re-running is safe and needs no reset: the setup projects delete and regenerate
each `storageState` file on every run.

### Why a green run shows two `✘` marks

`pnpm test:e2e` reports `86 passed` and exits 0 while printing two `✘` lines
(the row numbers shift as specs are added; the titles do not):

```
row 1 — a committed edit shows the new value before the response lands
row 4 — clearing a required field shows the empty value before the response lands
```

Update this paragraph and the table below in the same commit that changes the
suite's shape, or the first thing it says to the next reader is wrong.

Those are `test.fail` rows in `e2e/specs/manage-contacts-edit.spec.ts`. Playwright
counts an expected failure as passing, so they are **not** skipped, not flaky, and
not a broken run. They exist because the behaviour they assert is genuinely
missing: the grid does not show an edited value optimistically, because
`renderCellNode` in `components/grid/use-grid-keyboard.ts` always renders
TanStack's default cell renderer and so bypasses the override.

They are wired in on purpose. The day the defect is fixed they print `✓`, report
"unexpectedly passed", and turn the suite red — which is the signal to update the
coverage map. Details and the full row-to-spec mapping live in
`_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md`.

### What the suite covers today

| Spec | Covers |
|---|---|
| `e2e/specs/smoke.spec.ts` | sign-in, `storageState` reuse, dead session vs role gate, unknown email, gitignored artifacts |
| `e2e/specs/mailpit-reader.spec.ts` | the OTP reader's polling, recipient keying and timeout diagnostics |
| `e2e/specs/harness-guards.spec.ts` | the suite's own guards: local-only target, readiness gate, ignored artifacts |
| `e2e/specs/bulk-fixtures.spec.ts` | `pnpm seed:bulk-local`: volume, idempotence, batching, refusals |
| `e2e/specs/manage-contacts-api.spec.ts` | the 200-item cap and per-item `contactId` isolation, over real HTTP |
| `e2e/specs/manage-contacts-edit.spec.ts` | inline editing: happy path, persistence, 400 revert, empty field, dropped fetch |
| `e2e/specs/manage-contacts-selection.spec.ts` | selection, the indeterminate header, select-all then filter, empty selection |
| `e2e/specs/manage-contacts-bulk.spec.ts` | bulk outcomes: all succeed, partial success, an unreported row, a malformed envelope |
| `e2e/specs/manage-contacts-filter.spec.ts` | the per-column location filter, sort-after-edit, the empty scope |
| `e2e/specs/suite-determinism.spec.ts` | the suite's own determinism: no sleeps, per-run regeneration, order independence, spec registration, and that a broken spec turns the gate red |

### Proving the suite is a gate

`pnpm test:e2e` reporting green once is not evidence that it can go red.

```bash
pnpm test:e2e:determinism
```

That runs `pnpm test:e2e` **twice back to back with nothing between them** — no
`supabase:reset`, no re-seed, no manual reset — and fails naming *which* run
failed, echoing that run's own output. The point is the pair: a suite that only
passes on a fresh stack is not deterministic, and every later run inherits the
doubt. The recorded result in this file and in `docs/development-guide.md` comes
from running it — a count no run produced is a claim, not a record.

Most of the underlying checks run every time as ordinary tests in
`e2e/specs/suite-determinism.spec.ts`; the double-run itself cannot, since a spec
cannot re-run the suite it is inside of.

To claim a matrix row is Covered, follow
[`docs/claiming-a-matrix-row.md`](docs/claiming-a-matrix-row.md) — which layer to
use, what to seed, and what evidence the row needs.

Specs that write to shared fixtures restore what they changed. This matters more
than it looks: `pnpm seed:bulk-local` is idempotent by *exact deterministic name*,
so a spec that leaves a renamed fixture behind makes the next run fail in
`globalSetup` with a `contacts_phone_program` unique-violation that names the
generator rather than the spec.

Add manual verification notes alongside the suite for any flow it does not cover —
especially staff auth, attendance, Supabase-backed reads/writes, and
offline/PWA behaviour.

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

Never commit Supabase service-role keys, Vercel production credentials, GitHub tokens, or other secrets.
