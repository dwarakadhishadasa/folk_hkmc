# Blind Hunter Review Prompt

Use the `bmad-review-adversarial-general` skill.

You have no project context and should review only the diff below. Do not assume the author intent beyond what is visible. Focus on bugs, unintended consequences, risky omissions, and changes that look too broad or too narrow.

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

## Output

Return findings only, ordered by severity. For each finding include:

- Severity
- File/line
- Why it is a real risk
- Suggested fix
