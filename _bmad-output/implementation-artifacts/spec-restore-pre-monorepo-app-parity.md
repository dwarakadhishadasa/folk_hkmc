---
title: 'Restore Pre-Monorepo App Visual Parity'
type: 'bugfix'
created: '2026-06-13T08:31:47+05:30'
status: 'in-review'
baseline_commit: 'd4359c709b851b43a2e9592e48d490c6c7af4adc'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/1-1a-move-current-folk-runtime-into-the-folk-program-app-boundary.md'
  - '{project-root}/_bmad-output/implementation-artifacts/1-3-build-program-branded-landing-pages.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After the monorepo/program-app split, the FOLK workspace app renders very differently from the earlier root app because the app-local Tailwind build is not seeing the real source files that contain the landing page, shared components, and feature UI class names. The current root build generates a large utility stylesheet, while `apps/folk` and `apps/gita-life` generate much smaller stylesheets that omit expected utilities such as branded arbitrary colors, grid layouts, large type, rounded cards, and other pre-monorepo visual classes.

**Approach:** Restore Tailwind source discovery for the workspace apps so the shared root `app/`, `components/`, and relevant package/app-local source files are included when either program app builds. Keep route behavior, product copy, Supabase auth, Airtable integration, and public assets unchanged unless a verification failure proves a direct regression inside this scope.

## Boundaries & Constraints

**Always:** Preserve the existing FOLK public landing page look and staff/public route contracts. Keep `apps/folk` and `apps/gita-life` independently buildable with their existing app-specific scripts. Keep Airtable and Supabase server-only boundaries intact. Reuse the current `app/globals.css`, App Router wrappers, workspace package scripts, and project conventions instead of introducing a new styling system.

**Ask First:** Ask before moving the root app into `apps/folk`, deleting the root app, replacing the landing page design, changing program copy/branding, adding a new CSS framework, altering deployment domains, or changing auth/Airtable behavior.

**Never:** Do not hide the regression by hand-writing one-off CSS for individual missing classes. Do not duplicate the full root app source into each workspace app as the first fix. Do not expose service-role keys, Airtable tokens, or program-scoped data to client code. Do not make Gita Life inherit FOLK-specific copy while fixing shared styling.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| FOLK workspace CSS build | `pnpm --filter @hkmc/folk build` after the monorepo split | Generated CSS includes utilities used by root FOLK landing/shared components, including branded arbitrary colors, `rounded-2xl`, responsive grid classes, and large heading classes | If missing, treat as failed parity and adjust source discovery rather than patching page CSS manually |
| Gita Life workspace CSS build | `pnpm --filter @hkmc/gita-life build` | App-local Gita Life landing classes and shared component classes are present, with no dependency on `apps/folk` runtime | If missing, include the relevant app-local source path without broadening to generated `.next` output |
| Root app CSS build | `pnpm build` | Existing root FOLK app still builds and keeps its global Tailwind theme/brand styles | If root build loses classes, revert/adjust source patterns before proceeding |
| Runtime smoke | FOLK workspace homepage in browser | Header logo container is positioned, landing page styling matches the pre-monorepo FOLK page, and primary `/login` and `/register` actions remain visible on desktop and 360px mobile | Treat browser CSS/image warnings as regressions if they remain after stylesheet parity is restored |

</frozen-after-approval>

## Code Map

- `app/globals.css` -- shared Tailwind v4 entrypoint imported by the root app and both workspace app layouts; likely source-discovery fix location.
- `apps/folk/app/layout.tsx` -- imports the shared global stylesheet and provides FOLK workspace metadata/fonts/providers.
- `apps/gita-life/app/layout.tsx` -- imports the shared global stylesheet and provides Gita Life workspace metadata/fonts/providers.
- `apps/folk/app/page.tsx` -- thin wrapper around the pre-monorepo root FOLK landing page; depends on Tailwind seeing root `app/page.tsx`.
- `apps/gita-life/app/page.tsx` -- app-local Gita Life landing page; depends on Tailwind seeing workspace app source.
- `components/header.tsx` -- shared header/logo/nav classes currently missing in workspace CSS; browser warning is likely caused by absent `.relative`.
- `package.json`, `apps/folk/package.json`, `apps/gita-life/package.json` -- build/dev/typecheck scripts used for verification.

## Tasks & Acceptance

**Execution:**
- [x] `app/globals.css` -- add explicit Tailwind source directives for root app, shared components/hooks/lib where class names live, workspace app source, and reusable package UI source -- workspace Tailwind builds must compile the same class surface used by the shared pages/components.
- [x] `apps/folk/app/layout.tsx` and `apps/gita-life/app/layout.tsx` -- inspect after CSS fix and only edit if the import path itself is part of the regression -- avoid unnecessary layout churn.
- [x] `components/header.tsx` -- inspect the logo warning after CSS parity is restored; only change markup if the warning persists with `.relative` present in generated CSS.
- [x] `_bmad-output/implementation-artifacts/spec-restore-pre-monorepo-app-parity.md` -- record verification results and any review-loop changes in the appropriate sections/status fields.

**Acceptance Criteria:**
- Given the FOLK workspace app is built, when the generated CSS is inspected, then utilities used by the pre-monorepo FOLK landing page and shared header are present.
- Given the Gita Life workspace app is built, when the generated CSS is inspected, then app-local Gita Life landing utilities and shared component utilities are present.
- Given the root app is built, when the homepage styling is compiled, then the existing root FOLK app remains visually intact.
- Given a 360px-wide viewport, when `/` is opened in the FOLK workspace app, then the page has no horizontal scrolling and the FOLK Portal/Register actions remain visible and styled.
- Given the homepage is opened in the FOLK workspace app, when browser console warnings are checked, then there is no remaining `next/image` warning caused by missing positioning utilities.

## Spec Change Log

## Design Notes

Tailwind v4 supports explicit CSS-level source discovery. The desired fix is to make the shared global stylesheet declare the source roots it needs, because the workspace apps import that stylesheet while most real class names live outside the workspace app folders. Keep the patterns narrow enough to avoid generated output:

```css
@source "../app/**/*.{ts,tsx}";
@source "../components/**/*.{ts,tsx}";
@source "../apps/*/app/**/*.{ts,tsx}";
@source "../packages/ui/src/**/*.{ts,tsx}";
```

Add `hooks` or `lib` only if they contain renderable class strings that verification shows are missing.

## Verification

**Commands:**
- `pnpm --filter @hkmc/folk build` -- expected: succeeds and generated CSS contains representative FOLK/root utilities.
- `pnpm --filter @hkmc/gita-life build` -- expected: succeeds and generated CSS contains representative Gita Life/app-local utilities.
- `pnpm build` -- expected: succeeds for the brownfield root app.
- `pnpm typecheck:workspace` -- expected: succeeds for workspace apps/packages.
- `pnpm lint` -- expected: succeeds or only reports pre-existing warnings unrelated to this change.

**Manual checks (if no CLI):**
- Open FOLK workspace `/` at desktop and 360px mobile widths; expect the royal blue/saffron/warm ivory landing page, styled header/logo, visible Portal/Register actions, and no horizontal scroll.

**Results:**
- `pnpm --filter @hkmc/folk build` -- passed; generated workspace CSS includes representative restored utilities (`relative`, `rounded-2xl`, `grid-cols-1`, `text-6xl`) and brand color values.
- `pnpm --filter @hkmc/gita-life build` -- passed; generated workspace CSS includes shared structure and Gita Life app-local values such as `#123A5A`, `#F8FBF7`, and `min-h-[88vh]`.
- `pnpm build` -- passed for the brownfield root app.
- `pnpm typecheck:workspace` -- passed for all 7 workspace packages/apps.
- `pnpm exec tsc --noEmit` -- passed.
- `pnpm lint` -- passed with 4 pre-existing warnings in offline/PWA/toast files.
- Headless Chrome screenshots of FOLK workspace `/` at 1440px and 360px show restored royal blue/saffron/warm ivory styling, positioned logo/header, visible Portal/Register actions, and no apparent horizontal overflow. No new `next/image` position warning appeared after recompilation; the log still contains the older pre-fix warning entry.
