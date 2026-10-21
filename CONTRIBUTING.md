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

### `test.fail` rows, and what they are for

`pnpm test:e2e` reported `86 passed` and exited 0 with **no `✘` in the output**
at revision `464b4ed`. It now carries eleven more tests, from
`e2e/specs/manage-contacts-list.spec.ts` — the device-detected contact list,
whose spec replaced the older five-test contact-surface one — and the combined
total has not been re-measured — so treat `86` as the last *observed* figure
rather than the current one. It used to print two.

Those two were `test.fail` rows in `e2e/specs/manage-contacts-edit.spec.ts`, for
matrix rows 1 and 4: the grid did not show an edited value optimistically,
because `renderCellNode` in `components/grid/use-grid-keyboard.ts` always
rendered TanStack's default cell renderer and so bypassed the override that
carries the draft. Playwright counts an expected failure as passing, so the run
stayed green while the behaviour was genuinely missing.

That is the pattern to reach for when you find a real defect rather than working
around it:

```ts
// Row N — <what the row asserts>
test("...", async ({ page }) => {
  // `fail(condition, description)`: `true` marks the tripwire, and the
  // description is what a future reader needs in order to remove it.
  test.fail(true, "known defect: <link> — fixed in <sha>, or unfixed")
  // the correct assertion for the row's expected behavior — not a weakened one
})
```

The bodies still run, so the assertions stay live, and the day the defect is fixed
they report "unexpectedly passed" and turn the suite red — which is the signal to
fix the code, then remove the marker and update the coverage map **in the same
commit**. Leaving the marker behind after fixing the defect is a permanently red
suite.

It is also the run that surfaces defects in the test's own teardown. Rows 1 and 4
parked a PATCH inside a `page.route` handler and released it from the `finally`;
unrouting a still-parked request resumed it through Playwright's fallback, so the
handler's later `route.continue()` threw `Route is already handled!` — inside the
`finally`, failing both rows for a reason unrelated to the assertion, while the
captured page showed the edited value rendering correctly. `release` is now awaited
before `unroute`, and both rows assert the interception actually caught the write —
otherwise "shows before the response lands" is also satisfied by a slow server.

Update this section and the table below in the same commit that changes the
suite's shape, or the first thing it says to the next reader is wrong. Details and
the full row-to-spec mapping live in
`_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md`.

### What the suite covers today

The specs a contributor is most likely to need first. This is **not** the whole
suite — the complete source-to-spec registry, with a per-file test count for
each, is `docs/architecture/testing.md` §4.

| Spec | Covers |
|---|---|
| `e2e/specs/smoke.spec.ts` | sign-in, `storageState` reuse, dead session vs role gate, unknown email, gitignored artifacts |
| `e2e/specs/mailpit-reader.spec.ts` | the OTP reader's polling, recipient keying and timeout diagnostics |
| `e2e/specs/harness-guards.spec.ts` | the suite's own guards: local-only target, readiness gate, ignored artifacts, `components/grid/` token and viewport bans |
| `e2e/specs/bulk-fixtures.spec.ts` | `pnpm seed:bulk-local`: volume, idempotence, batching, refusals |
| `e2e/specs/manage-contacts-api.spec.ts` | the 200-item cap and per-item `contactId` isolation, over real HTTP |
| `e2e/specs/manage-contacts-edit.spec.ts` | inline editing: happy path, persistence, 400 revert, empty field, dropped fetch |
| `e2e/specs/manage-contacts-selection.spec.ts` | selection, the indeterminate header, select-all then filter, and an empty selection offering **no** bulk chrome at all |
| `e2e/specs/manage-contacts-bulk.spec.ts` | bulk outcomes: all succeed, partial success, an unreported row, a malformed envelope |
| `e2e/specs/manage-contacts-filter.spec.ts` | the per-column location filter, sort-after-edit, the empty scope |
| `e2e/specs/grid-toolbar.spec.ts` | the toolbar: the band order, *Hide fields* and CAP-18's default field set, the `hide=` encoding, the global Sort entry point, the contextual selection band |
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
