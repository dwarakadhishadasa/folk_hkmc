---
title: 'Light/dark theme switch and grid legibility in both'
type: 'feature'
created: '2026-10-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 1bc2a340c7cda29e86786364957ae1eecc575501
context:
  - _bmad-output/specs/spec-grid-keyboard-editors-and-theme/SPEC.md
  - _bmad-output/specs/spec-grid-keyboard-editors-and-theme/theme-contract.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-7 is defined and dead. `next-themes` is installed,
`components/theme-provider.tsx` exists and is correct, both `globals.css` files
carry a full 31-token `.dark` block, and `components/ui/sonner.tsx:7` already
calls `useTheme()` — but nothing mounts `ThemeProvider`, no `<html>` sets
`suppressHydrationWarning`, and no control anywhere calls `setTheme`. The dark
theme has never once been reachable at runtime. Two tokens that the grid depends
on are additionally too dark to read against their own surface: `--ring` is
2.01:1 and `--destructive` is 1.87:1 in dark, against targets of 3:1 and 4.5:1.

**Approach:** Mount the existing provider as the outermost provider in
`components/providers.tsx` with the shadcn recipe's props verbatim, add
`suppressHydrationWarning` to `<html>` in both apps, ship a `null`-until-mounted
theme toggle into the shared app header, lighten the two failing `.dark` tokens
in both mirrored `globals.css` files, and clear the twelve hardcoded `/manage`
color sites that make the graded page broken in dark mode. **No grid class
changes and zero new raw colors** — the grid is already token-clean and this
story is a token question, not a rewrite.

## Boundaries & Constraints

**Always:**

- **`ThemeProvider` is the OUTERMOST provider** in `components/providers.tsx`,
  wrapping `NavigationFeedbackProvider` and the four inner ones. It must be:
  `next-themes` sets a class on `<html>` during hydration, and anything that
  reads a token before it runs sees the wrong theme.
- **Props exactly as the recipe specifies:** `attribute="class"`,
  `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.
  `disableTransitionOnChange` is not optional here — the grid is thousands of
  cells and every `transition-colors` would visibly cascade across the swap.
- **The toggle renders `null` until mounted.** `useTheme()` cannot know the
  theme during SSR; a toggle that renders the wrong icon server-side and flips
  is a hydration mismatch of its own.
- **The toggle goes in the shared app header** (`components/header.tsx`), not
  the grid toolbar. It is an app-level control and the grid consumes it by being
  legible rather than by owning it. The header is the one surface present on
  `/manage`, so the toggle is reachable on the page this story grades.
- **`.dark` token values are edited in both `globals.css` files, kept mirrored.**
  The two `.dark` blocks are byte-identical today, so the edit stays mirrored by
  construction — and must stay that way afterwards.
- **Two-app parity is checked at the `<html>` open tag**, not by whole-file
  md5. Whole-file `layout.tsx` md5s never matched and never will: branding,
  `themeColor` and icon paths differ by intent.
- **`components/theme-provider.tsx` is correct as-is** (11 lines, verified). No
  rewrite, no "improvement".

**Never:**

- **No grid class changes.** `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|\bwhite\b|\bblack\b|dark:" components/grid/`
  returns zero at baseline and must return zero after this story. Do not
  introduce a raw color anywhere to "fix" a theme problem, and do not go looking
  for hardcoded colors to fix — there are none in the grid.
- **Alpha is not the lever on a dark surface.** Lowering alpha moves a color
  toward the surface and contrast only decreases. The authorized fix is the
  `.dark` token value.
- No `dark:` variant classes added outside `components/ui/`.
- `text-white` on `--program-primary` headers stays — that brand color is dark in
  both themes, so white text is correct in both.
- Out of scope, do not touch: the gita-life `body` gradient
  (`apps/gita-life/app/globals.css:200-205`) and the shared header mobile-nav
  `bg-white/95` (`components/header.tsx:321`).
- No new dependency (`next-themes` is already there), no `localStorage` shim of
  our own, no `<Script>` theme bootstrap.
- Do not edit `scripts/verify-monorepo-guardrails.mjs`.
- Scope outside the grid is bounded to `/manage`. A repo-wide token audit is a
  separate piece of work and is not smuggled in here.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| first load, no stored theme, system light | fresh browser, `prefers-color-scheme: light` | `<html>` has no `.dark`; the toggle resolves `light` after mount | — |
| first load, no stored theme, system dark | fresh browser, `colorScheme: "dark"` | `<html>` gains `.dark` before first paint of the grid; the grid paints dark | — |
| toggle to dark | click the header toggle | `<html>` gains `.dark`, `localStorage.theme === "dark"`, the icon flips | — |
| persistence | reload after toggling | `<html>` still carries `.dark`; the toggle still reads dark | — |
| persistence via system | toggle to dark, then reload with system light | `.dark` **survives** — an explicit choice beats `system` | — |
| back to system | toggle back to the system option | `<html>` follows `prefers-color-scheme` again | — |
| focus ring, both themes | focused grid cell | measured `--ring` vs that theme's `--card` ≥ 3:1 | — |
| destructive cell, both themes | a cell carrying `text-destructive` (the preview harness's rejecting `REF-0250`) | measured `--destructive` vs `--card` ≥ 4.5:1 | — |
| frozen-run divider, both themes | the last frozen column's `border-r` | a rendered, non-zero-width divider whose color is distinguishable from the surfaces it separates, at both themes | — |
| toggle not in the grid toolbar | `/manage` contacts view | exactly one toggle exists, inside `<header>`; `components/grid/` imports no toggle | — |
| sonner under both themes | a toast rendered after the provider mounts | `useTheme()` is no longer a no-op — the toast resolves `light`/`dark` | — |
| no hydration warning | any page load | `<html>` carries `suppressHydrationWarning`; no console hydration error for the theme class | — |
| `localStorage` unavailable | a context with storage blocked | the app still renders; the toggle still switches the class for the session | no throw from the toggle |

</intent-contract>

## Code Map

- `components/theme-provider.tsx:1-11` — **correct as-is. Read-only.**
- `components/providers.tsx:12-24` — the provider tree. `ThemeProvider` wraps the
  outermost `<NavigationFeedbackProvider>` here.
- `apps/folk/app/layout.tsx:52` and `apps/gita-life/app/layout.tsx:52` — the
  identical `<html lang="en">` line. `suppressHydrationWarning` lands here in both.
- `components/header.tsx:284-315` — the action cluster (`username (role)`,
  Logout / Staff Login). The toggle renders immediately before the auth control,
  inside `<header>`, on **both** the `isHydrated` branch (`:247`) and the
  pre-hydration branch (`:226-245`), so it does not pop in with the nav.
- `components/header.tsx:321` — the mobile-nav `bg-white/95`. **Out of scope.**
- `components/ui/sonner.tsx:7` — the existing `useTheme()` call that mounting the
  provider fixes as a side effect. No change to this file.
- `apps/folk/app/globals.css:78-111` and `apps/gita-life/app/globals.css:110-143`
  — the `.dark` blocks, byte-identical. `--destructive` at `:96` / `:128`,
  `--ring` at `:102` / `:134`.
- `apps/folk/app/manage/page.tsx:37` and `apps/gita-life/app/manage/page.tsx:37`
  — the `bg-[#FFF9F0]` full-page wrapper; the outermost painted surface of the
  graded page.
- `components/manage/manage-attendance-view.tsx:133,145` — two of the seven
  `hover:bg-black/5`.
- `components/manage/manage-favorites-view.tsx:344` (static active chip), `:345`
  (hover), `:376` (static placeholder box), `:486`, `:514` (hover).
- `components/manage/manage-portal.tsx:84,96` — the `/manage` view-switcher pills.
- `components/manage/manage-sessions-view.tsx:92` — the static pill.
- `components/manage/manage-dashboard.tsx:145,158` — the Year and Month
  `SelectTrigger`s carrying `bg-white/95`.
- `components/ui/select.tsx:64` — `SelectContent` is `bg-popover`; the trigger
  pairing with it is `bg-popover`, which is why that is the token chosen.
- `components/grid/grid-row.tsx:208` — `ring-ring ring-1 ring-inset` at **full**
  opacity. Untouched; the fix is the token.
- `components/grid/grid-row.tsx:214` — the frozen run's `border-r border-border`.
  Untouched.
- `components/grid/grid-row.tsx:209` — `text-destructive` on an errored cell.
  Untouched.
- `components/grid/grid-preview.tsx:179` (`GRID_PREVIEW_FAILING_REF`) — the
  always-rejecting preview row. It is how a real, rendered destructive cell is
  measured without intercepting anything.
- `e2e/fixtures/manage-grid.ts:89-107` — `openPreviewGrid`,
  `focusPreviewCellAt`, `previewScroll`; the theme spec reuses them rather than
  re-deriving preview selectors.
- `e2e/specs/harness-guards.spec.ts` — the pattern for a file-level guard that
  asserts repo text from inside the suite (`spawnSync` / `readFileSync`). The
  token-cleanliness guard follows it.

## Tasks & Acceptance

**Execution:**

- `components/providers.tsx` — import `ThemeProvider` from
  `@/components/theme-provider` and wrap the whole existing tree with it:
  `attribute="class"`, `defaultTheme="system"`, `enableSystem`,
  `disableTransitionOnChange`.
- `apps/folk/app/layout.tsx` and `apps/gita-life/app/layout.tsx` — add
  `suppressHydrationWarning` to `<html lang="en">`. The edit lands on the
  identical line in both.
- `components/theme-toggle.tsx` — **new**, `"use client"`. `useTheme()` +
  `setTheme`, a mounted-state guard returning `null` before mount, a single
  accessible button (stable accessible name, an `aria-label`/`title` that does
  not flip with the icon, `Sun`/`Moon` from `lucide-react` at
  `aria-hidden`), toggling `resolvedTheme === "dark" ? "light" : "dark"`.
  Styling follows the header's own action-button idiom (rounded-full,
  `h-10`, `--header-action-*` vars, `focus-visible:ring-2
  focus-visible:ring-[var(--header-focus-ring)]`) so it does not introduce a new
  visual language on a brand-colored bar.
- `components/header.tsx` — render `<ThemeToggle />` in the action cluster of
  **both** the pre-hydration and hydrated header branches, before the
  auth control. Do not touch `:321` or the mobile-nav item styles.
- `apps/folk/app/globals.css` and `apps/gita-life/app/globals.css` — in `.dark`,
  `--ring: oklch(0.4 0.12 260)` → `oklch(0.55 0.12 260)` (3.84:1 vs `--card`)
  and `--destructive: oklch(0.396 0.141 25.723)` → `oklch(0.62 0.141 25.723)`
  (4.83:1 vs `--card`). Keep the two blocks byte-identical.
- `components/manage/manage-attendance-view.tsx:133,145`,
  `components/manage/manage-favorites-view.tsx:345,486,514`,
  `components/manage/manage-portal.tsx:84,96` — `hover:bg-black/5` →
  `hover:bg-foreground/5`. Seven sites.
- `components/manage/manage-favorites-view.tsx:344,376`,
  `components/manage/manage-sessions-view.tsx:92` — static `bg-black/5` →
  `bg-foreground/5`.
- `components/manage/manage-dashboard.tsx:145,158` — `bg-white/95` →
  `bg-popover` (a semantic surface token, matching `SelectContent`'s own
  `bg-popover`; no raw color).
- `apps/folk/app/manage/page.tsx:37` and `apps/gita-life/app/manage/page.tsx:37`
  — `bg-[#FFF9F0]` → `bg-background`.
- `e2e/specs/theme-switch.spec.ts` — **new**. The matrix rows above.
- `e2e/specs/harness-guards.spec.ts` — add the token-cleanliness guard and the
  two-`layout.tsx`-`<html>`-tag parity guard (the parity guard asserts the open
  tag matches, as `theme-contract.md`'s "Two-app parity" section requires —
  never a whole-file md5).

**Acceptance Criteria:**

- Given `components/providers.tsx`, when read, then `ThemeProvider` is the
  outermost element of the returned tree and carries all four recipe props —
  asserted against the source text, not inferred from a rendering.
- Given a fresh browser context with `colorScheme: "dark"` and no stored theme,
  when `/dev/grid-preview` loads, then `<html>` carries `.dark`.
- Given an explicit toggle to dark, when the page is reloaded, then `<html>`
  still carries `.dark` — observed after reload, through the class itself.
- Given the header on any page, when it renders, then exactly one theme toggle
  exists and it is inside `<header>`; `components/grid/` imports no toggle.
- Given a focused cell in either theme, when its `--ring` and `--card` are read
  in real Chromium and converted to sRGB, then the ratio is ≥ 3:1 in **both**
  themes.
- Given a cell carrying `text-destructive` in either theme, when its
  `--destructive` and `--card` are read the same way, then the ratio is ≥ 4.5:1
  in **both** themes.
- Given the frozen-run divider in either theme, when its border color is read,
  then it renders at a non-zero width and is distinguishable from the surfaces
  it separates, at both themes.
- Given both themes, when a screenshot of the grid is captured, then the two
  captures differ, the dark capture's mean luminance is materially lower than
  the light one's, and the sampled grid-surface pixel matches that theme's
  resolved `--card`.
- Given the repo after all edits, when the token-cleanliness grep runs, then it
  still returns zero under `components/grid/`.
- Given both apps' `layout.tsx`, when their `<html>` open tags are compared,
  then they match and both carry `suppressHydrationWarning`.
- Given the post-edit tree, when the two `.dark` blocks are compared, then they
  are identical to each other.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the toggle returns `null` before mount rather than rendering a
placeholder.** `useTheme()` returns an undefined `theme` during SSR and on the
first client render, because `next-themes` only knows the theme after it has
read storage and `matchMedia`. Rendering an icon from that value produces a
server-rendered icon that disagrees with the client on hydration — a second
hydration mismatch on top of the `<html>` one. Rendering nothing costs one
invisible frame and buys a clean console, which is what the contract's
`suppressHydrationWarning` bullet is actually protecting.

**Why the toggle's accessible name does not flip with the icon.** A test — and a
screen reader — needs one stable handle. `aria-label="Toggle theme"` plus an
`aria-hidden` icon means the button is addressable before and after the swap and
the icon choice carries no semantics of its own.

**Why the divider is asserted as "distinguishable", not against a WCAG ratio.**
`--border` is a hairline, not text or a control boundary: it measures ~1.38:1
against dark `--card` and ~1.35:1 against light `--card`, i.e. the two themes are
already symmetric. There is no authorized `--border` change in this story, and
inventing a 3:1 target for a hairline would either force an out-of-scope token
edit or produce an assertion that can never pass. The honest assertion is that
the divider is rendered, non-zero, and not the same color as either surface it
separates — at both themes. The measured values are recorded in the spec so a
later reader can see the symmetry rather than infer it.

**Why the contrast assertions read tokens rather than sampling pixels.** A pixel
sample of a 1px inset ring is a rendering-engine detail; the defect being fixed
is a token value. Reading the resolved custom property and converting it to sRGB
in the page measures the thing the contract names, in the real browser, and it
is stable across platforms. The screenshot assertion then covers the separate
claim — that the two themes are visually distinct and the dark one is dark — at
the level a screenshot can honestly support.

**Why `bg-popover` for the two `SelectTrigger`s.** They are the closed half of a
control whose open half (`SelectContent`) is `bg-popover`; pairing them keeps the
trigger from reading as a lighter chip against its own dropdown, and it is a
token, not a raw color.

**Why the header's pre-hydration branch also gets the toggle.** That branch
already renders the full header bar with only the logo. Mounting the toggle only
in the hydrated branch would make it pop in after hydration, which is a visible
layout shift in the header of the very page this story grades. `ThemeToggle`
renders `null` before mount anyway, so placing it in both branches costs
nothing and keeps the tree stable.

## Verification

**Commands:**

- `pnpm typecheck:workspace` -- expected: SUCCESS, no errors.
- `pnpm lint` -- expected: SUCCESS.
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.` with only the
  four pre-existing `lib/authz` type-import warnings.
- `pnpm build` -- expected: SUCCESS (note: `next.config.mjs` sets
  `typescript.ignoreBuildErrors`, so this is not a type gate — `typecheck` is).
- `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|\bwhite\b|\bblack\b|dark:" components/grid/`
  -- expected: **zero hits.**
- `diff <(sed -n '/^\.dark {/,/^}/p' apps/folk/app/globals.css) <(sed -n '/^\.dark {/,/^}/p' apps/gita-life/app/globals.css)`
  -- expected: identical.
- `grep -n '<html' apps/folk/app/layout.tsx apps/gita-life/app/layout.tsx`
  -- expected: two identical tags, both carrying `suppressHydrationWarning`.
- `grep -rn "bg-black/5\|bg-white/95\|bg-\[#FFF9F0\]" components/manage/ apps/folk/app/manage apps/gita-life/app/manage`
  -- expected: no hits.
- `pnpm test:e2e` -- expected: the whole suite green, one runner at a time.
  Requires the local stack up once (`pnpm dev:local`).
- `pnpm test:e2e:determinism` -- expected: green twice back to back, no reset.
  Required after touching specs or fixtures.

**Manual checks (if no CLI):**

- `/manage` in dark: toggle flips, reload keeps it, the grid's hairline borders
  and frozen-run divider are visible, a reverted cell's destructive text is
  readable, no toast renders light-on-light.
- `/manage` in light: unchanged from before this story.
- Emulate `prefers-color-scheme: dark` with no stored theme: the page arrives
  dark, with no flash of light content.
