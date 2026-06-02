# Deferred Work

- 2026-05-20: ESLint is installed and `pnpm lint` now runs, but the codebase is not lint-clean yet. Current failures are pre-existing Next/React lint findings such as JSX returned inside `try/catch`, synchronous state updates inside effects, and impure render-time calls.
- 2026-06-02: Collaborator policy files document local checks and secret handling, but PR quality/security enforcement still relies on owner-side GitHub settings. Consider adding required CI for `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm lint`, and GitHub secret scanning/push protection where available.
