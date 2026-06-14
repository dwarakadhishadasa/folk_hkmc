# Acceptance Auditor Review Prompt

Review the implementation against the approved spec and referenced context. You have read access to the project.

## Required Inputs To Read

- Spec: `_bmad-output/implementation-artifacts/spec-restore-pre-monorepo-app-parity.md`
- Context: `_bmad-output/project-context.md`
- Context: `_bmad-output/implementation-artifacts/1-1a-move-current-folk-runtime-into-the-folk-program-app-boundary.md`
- Context: `_bmad-output/implementation-artifacts/1-3-build-program-branded-landing-pages.md`

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

## Verification Reported By Implementer

- `pnpm --filter @hkmc/folk build` passed.
- `pnpm --filter @hkmc/gita-life build` passed.
- `pnpm build` passed.
- `pnpm typecheck:workspace` passed.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed with 4 pre-existing warnings.
- Headless Chrome screenshots at 1440px and 360px showed restored FOLK styling, positioned logo/header, visible actions, and no apparent horizontal overflow.

## Output

Return findings only, ordered by severity. For each finding include:

- Severity
- Spec/context requirement violated
- File/line
- Why it is a real violation
- Suggested fix
