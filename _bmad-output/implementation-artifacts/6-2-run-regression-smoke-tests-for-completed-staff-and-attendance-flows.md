# Story 6.2: Run Regression Smoke Tests For Completed Staff And Attendance Flows

Status: in-progress

## Story

As a developer agent,
I want a concrete verification checklist,
so that performance changes do not break completed product behavior.

## Acceptance Criteria

1. Given the implementation is complete, when verification runs, then `pnpm exec tsc --noEmit` passes, and `pnpm build` passes.
2. Given `pnpm lint` is still blocked by the missing ESLint dependency, when verification is documented, then the known lint blocker from `_bmad-output/implementation-artifacts/deferred-work.md` is referenced, and the developer does not claim lint passed unless the dependency/script is fixed.
3. Given an Admin, Preacher, and Volunteer account are available, when smoke testing is performed, then login, protected page redirect behavior, role navigation, `/contact`, `/sessions`, `/attend`, session-backed `/register`, live dashboard refresh, Manage-tab access, and staff-only PWA prompt behavior are checked according to role.
4. Given public attendance and registration offline behavior is supported, when offline smoke testing is performed, then supported queued requests retain `sessionId`, and staff contact writes remain online-only.
5. Given all smoke checks are complete, when the developer reports completion, then the report lists changed files, verification commands, manual smoke coverage, known residual risks, and any blocked checks.

## Tasks / Subtasks

- [x] Run `pnpm exec tsc --noEmit` after implementation. (AC: 1)
- [x] Run `pnpm build` after implementation. (AC: 1)
- [x] Attempt or document `pnpm lint` accurately. (AC: 2)
  - [x] If ESLint is still missing, cite `_bmad-output/implementation-artifacts/deferred-work.md`.
  - [ ] If ESLint is fixed, run the command and report the real result.
- [ ] Smoke test Admin, Preacher, and Volunteer staff flows. (AC: 3)
- [ ] Smoke test public `/attend` and session-backed `/register?session=...`. (AC: 3, 4)
- [ ] Smoke test live dashboard refresh and hidden-tab behavior. (AC: 3)
- [ ] Smoke test offline queue behavior for public attendance/registration and online-only staff contact writes. (AC: 4)
- [x] Produce final implementation report with changed files, commands, manual coverage, risks, and blocked checks. (AC: 5)

## Dev Notes

- `package.json` has `lint: "eslint ."`, but `_bmad-output/implementation-artifacts/deferred-work.md` says ESLint is not installed. Do not report lint as passed unless the blocker is actually fixed.
- `next.config.mjs` is known to ignore TypeScript build errors, so `pnpm exec tsc --noEmit` is mandatory even if `pnpm build` passes.
- Manual role checks must preserve current access rules: Volunteers can create contacts only; Preachers and Admins can manage sessions and dashboard reads; Admin retains full access.
- Preserve completed features from previous implementation artifacts: scoped contact locations, analytics links for contacts/sessions, staff-only PWA prompt, Manage tab, session name in live attendance, fast contact entry feedback, and dashboard session attendance fetch.
- For offline smoke tests, public attendance/registration can queue; staff contact writes must remain online-only.
- Capture any Vercel or external connector blockers honestly if deployment/runtime log verification is attempted.

### Project Structure Notes

- Verification notes belong in the final report and relevant story completion notes under `_bmad-output/implementation-artifacts/`.
- Do not add broad test infrastructure unless needed; this story is a smoke checklist for regression safety.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-6.2]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md]
- [Source: _bmad-output/implementation-artifacts/spec-all-epics-staff-auth-attendance.md]
- [Source: _bmad-output/implementation-artifacts/spec-preacher-scoped-contact-location.md]
- [Source: _bmad-output/implementation-artifacts/spec-staff-only-pwa-install-prompt.md]
- [Source: package.json]
- [Source: next.config.mjs]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- `pnpm lint` failed with `sh: 1: eslint: not found`; this matches `_bmad-output/implementation-artifacts/deferred-work.md`.
- Local dev server route smoke: `/`, `/register?session=recSmokeTest12345`, and `/attend?session=recSmokeTest12345` returned `200`; unauthenticated `/contact`, `/sessions`, and `/dashboard` redirected to login.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Final implementation report created at `_bmad-output/implementation-artifacts/performance-responsiveness-implementation-report.md`.
- Manual Admin, Preacher, Volunteer, live dashboard, and offline replay smoke remain blocked until role-specific test accounts/session cookies and safe test Airtable data are available.
- Lint remains blocked by the known missing ESLint dependency.

### File List

- `_bmad-output/implementation-artifacts/performance-responsiveness-implementation-report.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`

### Change Log

- 2026-05-07: Ran type/build/lint verification, captured local route smoke, and documented blocked manual smoke coverage.
