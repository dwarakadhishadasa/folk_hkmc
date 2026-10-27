/**
 * Root Vitest project — the unit layer for code that lives at the repository
 * root (`lib/`, `components/`, `hooks/`, `tests/`).
 *
 * Playwright owns `e2e/` and asserts behaviour through a running stack. This
 * runner is the opposite: no browser, no Supabase, no network. A test here must
 * pass on a clean checkout with nothing started.
 *
 * The two packages with real logic (`@hkmc/data-contracts`,
 * `@hkmc/program-config`) carry their own `vitest.config.ts` so `pnpm test`
 * reaches them through `turbo run test`. This file deliberately does not glob
 * `packages/**` — a package test that ran twice would be reported twice.
 *
 * `server-only` is aliased to an empty module: the package throws at import
 * time outside a React Server Component graph, and half of `lib/` imports it.
 */

import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const rootDir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: rootDir },
      { find: /^@hkmc\/data-contracts$/, replacement: `${rootDir}packages/data-contracts/src/index.ts` },
      { find: /^@hkmc\/program-config\/server$/, replacement: `${rootDir}packages/program-config/src/server.ts` },
      { find: /^@hkmc\/program-config$/, replacement: `${rootDir}packages/program-config/src/index.ts` },
      { find: /^@hkmc\/authz$/, replacement: `${rootDir}packages/authz/src/index.ts` },
      { find: /^@hkmc\/ui\//, replacement: `${rootDir}packages/ui/src/` },
      { find: /^server-only$/, replacement: `${rootDir}tests/support/server-only.ts` },
    ],
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts", "hooks/**/*.test.ts", "tests/**/*.test.ts"],
  },
})
