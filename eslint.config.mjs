import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: ["apps/folk/", "apps/gita-life/"],
      },
    },
    rules: {
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    ".vercel/**",
    "apps/*/.next/**",
    // Vendored agent-harness trees. These are tracked copies of BMAD skill
    // resources, not product code: they use `require()` in CommonJS hooks and
    // would otherwise fail this repo's TS rules. `.agents/**` was the older
    // spelling; the directory is `.agent` (singular).
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codebuddy/**",
    ".codex/**",
    ".neovate/**",
    ".opencode/**",
    ".qwen/**",
    "_bmad/**",
    "_bmad-output/**",
    "out/**",
    "build/**",
    "design-artifacts/**",
    "docs/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
