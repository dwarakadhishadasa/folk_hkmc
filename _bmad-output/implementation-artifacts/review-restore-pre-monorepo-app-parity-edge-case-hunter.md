# Edge Case Hunter Review Prompt

Use the `bmad-review-edge-case-hunter` skill.

You have read access to the project. Review the diff below for edge cases and boundary failures. Focus only on real issues caused or exposed by this change.

## Diff

```diff
diff --git a/app/globals.css b/app/globals.css
index 077cf5b..469271b 100644
--- a/app/globals.css
+++ b/app/globals.css
@@ -1,6 +1,11 @@
 @import "tailwindcss";
 @import "tw-animate-css";

+@source "../app/**/*.{ts,tsx}";
+@source "../components/**/*.{ts,tsx}";
+@source "../apps/*/app/**/*.{ts,tsx}";
+@source "../packages/ui/src/**/*.{ts,tsx}";
+
 @custom-variant dark (&:is(.dark *));

 /* New HKM Chennai theme with Royal Blue and Saffron palette */
```

## Untracked Workflow Artifact

- `_bmad-output/implementation-artifacts/spec-restore-pre-monorepo-app-parity.md`

## Suggested Project Files To Inspect

- `app/globals.css`
- `apps/folk/app/layout.tsx`
- `apps/gita-life/app/layout.tsx`
- `apps/folk/app/page.tsx`
- `apps/gita-life/app/page.tsx`
- `components/header.tsx`
- `packages/ui/src/button.tsx`
- `postcss.config.mjs`
- `apps/folk/postcss.config.mjs`
- `apps/gita-life/postcss.config.mjs`

## Output

Return findings only, ordered by severity. For each finding include:

- Severity
- File/line
- Edge case or boundary condition
- Why the current diff fails or may fail
- Suggested fix
