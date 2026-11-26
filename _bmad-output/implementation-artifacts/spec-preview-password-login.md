---
title: 'Preview-only password sign-in'
type: 'feature'
created: '2026-11-26'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/preview-environment.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** QA testers on the preview deployment must sign in through email OTP, which means sharing the Mailtrap sandbox inbox and consuming email quota for every login. The dev and production deployments must keep OTP-only sign-in.

**Approach:** Add a preview-branch-only `/preview-login` route that signs in with Supabase email/password using the existing fixture accounts, and show a link to it on `/login` only on the `preview` branch deployment. Leave the OTP form, `/api/auth/signin`, the auth context, and the Staff Login buttons unchanged.

</frozen-after-approval>

## Implementation Notes

- Gate: `lib/preview-login.ts` requires `VERCEL_ENV === "preview"` and `VERCEL_GIT_COMMIT_REF === "preview"`, with an explicit `PREVIEW_PASSWORD_LOGIN=1` + `NODE_ENV=development` local override. Unit-tested.
- Page: `apps/{folk,gita-life}/app/preview-login/page.tsx` returns 404 when gated off, lists active `*.fixture.test` staff for the current program through `lib/preview-login-accounts.ts`, and renders the shared `components/preview-login-form.tsx`.
- Action: `lib/preview-login-actions.ts` re-checks the gate, requires the submitted account to be in the active fixture list, requires a real session (not only a user), signs in with Supabase password auth, syncs the staff profile, signs out on failure, and redirects through `safeStaffRedirectPath`. Rate-limit and unexpected errors have distinct messages; unexpected errors are logged.
- Link: `apps/{folk,gita-life}/app/login/page.tsx` passes the gate result to `LoginPageClient`; the client renders a preview-only "Sign in with a password" link and leaves the OTP form and `/api/auth/signin` untouched.
- Docs: `docs/preview-environment.md` now covers the route, the branch gate, local testing, passcode source and rotation, the password-grant-vs-branch-gate distinction, the FOLK-only preview scope, and the required preview `SITE_URL` for attendance links.
- Verifier: `scripts/verify-preview-environment.mjs` now asserts `/preview-login` serves 200, `/login` links to it, and the preview database has at least four active fixture staff.
- The untracked `_bmad-output/planning-artifacts/architecture/architecture-folk_hkmc-2026-11-26/` directory was present before this change; it is user work, was not edited, and is excluded from this commit.
- Verification: `pnpm exec vitest run lib/preview-login.test.ts` (6/6), `pnpm test:unit` (24 root files / 200 tests plus both package suites), `pnpm typecheck:workspace`, `pnpm lint` (0 errors; 29 pre-existing warnings), `pnpm guardrails` (passed; 2 pre-existing warnings), `pnpm build:apps` (both apps; `/preview-login` emitted as a dynamic route), and a production-build runtime check (`/login` 200, `/preview-login` 404 with the gate off).
- Not yet run: `pnpm test:preview-environment` requires the `preview` branch deployment to carry this change. Its new route/link/staff assertions will fail until that deployment exists.

## Review Triage Log

- Spec Implementation Notes empty — `medium`; patched by recording files, decisions, and verification above.
- Verifier does not exercise the new route — `medium`; patched with `/preview-login` 200, `/login` link, and active-fixture-staff assertions.
- Only the environment predicate has tests — `medium`; patched with unit coverage, the deployed-route verifier, and the gate-off production-build check. Full action e2e is deferred to the post-deploy verifier because the preview branch is not deployed yet.
- Password success detected by `data.user` rather than a session — `high`; patched to require `data.session` before syncing and redirecting.
- All auth failures collapse to “invalid”; thrown failures are uncaught — `medium`; patched with try/catch, a rate-limit branch, a server-error branch, and server-side logging.
- Docs imply the Vercel branch gate is the password-auth boundary — `medium`; patched: the docs now state that the shared passcode is the credential and rotation is the revocation mechanism.
- Action accepts any `*.fixture.test` auth user — `medium`; patched by requiring membership in the same active fixture list the page renders.
- Fixture-load failure is conflated with an empty set and swallowed — `medium`; patched with a distinct message and a server-side log.
- Error redirect loses the selected account; submit has no pending state — `low`; patched with an `email` error parameter and a `useFormStatus` submit button.
- Local-testing instructions are not executable — `medium`; patched: use `PREVIEW_PASSWORD_LOGIN=1 pnpm dev`; `NODE_ENV` comes from `next dev`; both password sources are named.
- Passcode rotation loses the new value — `medium`; patched: update `.env.preview-seed.local`; an env override must update or delete the file in the same step.
- `SITE_URL` is single-origin while the seeder writes both programs — `low`; patched with a FOLK-only preview scope note and the explicit preview `SITE_URL` reseed command.
- Worktree mixes the auth change with an untracked architecture spine — `false`; the architecture directory is pre-existing untracked user work, not part of this diff, and is excluded from the commit.
- AD-20 `period_contacts` claim — `false`; the cited file is untracked user work outside this change and was not edited.
- AD-20 “single scoped read” claim — `false`; same untracked architecture artifact, outside this change.
- AD-18 409 lookup claim — `false`; same untracked architecture artifact, outside this change.
- AD-19 “never null the owner” claim — `false`; same untracked architecture artifact, outside this change.
- AD-21 delete-guard claim — `false`; same untracked architecture artifact, outside this change.
- AD-22 backfill module claim — `false`; same untracked architecture artifact, outside this change.
- Next.js version/review-loop claim — `false`; same untracked architecture artifact, outside this change.
