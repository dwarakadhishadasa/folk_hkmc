---
title: 'Install ESLint Tooling'
type: 'chore'
created: '2026-05-20'
status: 'done'
route: 'one-shot'
---

# Install ESLint Tooling

## Intent

**Problem:** `pnpm lint` was already wired to `eslint .`, but the project had no local ESLint dependency or flat config, so lint verification failed before analyzing source code.

**Approach:** Add ESLint and the Next.js ESLint config, create a Next-compatible flat config for this TypeScript App Router project, and update current development notes to distinguish installed tooling from remaining source lint cleanup.

## Suggested Review Order

**Tooling**

- Adds the local CLI and Next-matched config dependency.
  [`package.json:79`](../../package.json#L79)

- Defines the Next flat config, TypeScript rules, and artifact ignores.
  [`eslint.config.mjs:1`](../../eslint.config.mjs#L1)

**Documentation**

- Reframes lint as installed tooling with remaining cleanup work.
  [`development-guide.md:84`](../../docs/development-guide.md#L84)

- Keeps the active deferred note focused on current lint findings.
  [`deferred-work.md:3`](deferred-work.md#L3)
