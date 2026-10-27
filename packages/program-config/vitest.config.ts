/**
 * Package-local Vitest project. `turbo run test` reaches this through the
 * package's `test` script, so the package is covered by `pnpm test:unit`
 * without the root config having to glob into it.
 */

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
