## Summary

- 

## Branch and Access Checklist

- [ ] This PR is from a `feature/*` or `fix/*` branch.
- [ ] This PR targets `dev`, or Dwaraka explicitly requested a `main` target.
- [ ] If this PR targets `main`, Dwaraka will apply the `production-review-approved` label.
- [ ] I did not push directly to `main` or `dev`.
- [ ] I did not use or expose production secrets, credentials, or environment access.
- [ ] Dwaraka is the required reviewer before merge.

## Local Verification

- [ ] `pnpm guardrails`
- [ ] `pnpm typecheck:workspace`
- [ ] `pnpm build:apps`
- [ ] `pnpm lint`
- [ ] CI Quality Gates pass with typecheck before build.
- [ ] Manual checks documented below, if relevant.

## Manual Checks

-

## Notes for Dwaraka

-
