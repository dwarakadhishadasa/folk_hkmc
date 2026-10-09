# Theme contract

Binding contract for CAP-7. Follows the recipe the user named: <https://ui.shadcn.com/docs/dark-mode/next>.

## The state today

`existing-state.md` records it in full. In short: the theme is **defined and dead**. `next-themes` is installed, `components/theme-provider.tsx` is correct, both `globals.css` files carry a complete 31-token `.dark` block, and nothing mounts the provider or offers a control. Exception, decided 2026-10-09: the `.dark` values of `--ring` and `--destructive` are too dark for the grid (measured in Chromium against `--card`: ring 2.02:1, destructive 1.88:1) and are authorized to be lightened per the ratios below; the other 29 tokens stand as complete.

One line makes this a live concern rather than cosmetics: `components/ui/sonner.tsx:7` already calls `useTheme()`. Existing code expects a mounted provider and is currently getting a no-op. Mounting the provider fixes that as a side effect.

## What to do

Per the shadcn recipe, in both apps:

1. **`components/providers.tsx:12`** — mount `ThemeProvider` as the outermost provider, wrapping all five existing ones. It must be outermost: `next-themes` sets a class on `<html>` during hydration, and anything that reads a token before it runs sees the wrong theme.

2. **`apps/*/app/layout.tsx:52`** — add `suppressHydrationWarning` to `<html>`. Required: the server renders no theme class, the client adds one, and without it React logs a hydration mismatch on every load.

3. **Props exactly as the recipe specifies:** `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.

   `disableTransitionOnChange` is not optional here. It suppresses transitions during a theme swap; without it, every `transition-colors` in the app animates across the swap and the grid — thousands of cells — visibly cascades. The grid is the worst case in the app for that.

4. **`components/theme-toggle.tsx`** — new, `"use client"`, `useTheme` + `setTheme`. Goes in the **shared app header, not the grid toolbar**: it is an app-level control, and the grid consumes it by being legible rather than by owning it.

   Renders `null` until mounted. `next-themes` cannot know the theme during SSR, and a toggle that renders the wrong icon server-side then flips is a hydration mismatch of its own.

## The grid is already token-clean

`grep` for raw hex, `rgb(`, `white`, `black` under `components/grid/` returns **zero**. The grid uses `bg-card`, `border-border`, `text-muted-foreground`, `bg-muted/50`, `border-ring`, `text-destructive` — all semantic, all of which have `.dark` counterparts.

**That is the whole job for the grid.** There is nothing to rewrite. `theme-contract.md` exists to record that fact so a later agent does not go looking for hardcoded colors to fix, and does not introduce any.

The two theme-sensitive grid details that do need attention:

- **The frozen run's right border.** `grid-row.tsx` puts `border-r` on the last frozen column only. In dark mode a 1px `border-border` on a dark surface needs to be one step lighter than its surroundings or it disappears. It already resolves through `--border`, so this is a token-value question, not a code change: confirm it reads at both themes rather than assuming.
- **The focus ring.** The focused cell is `ring-ring ring-1 ring-inset` at **full** opacity (`grid-row.tsx:208`); `bg-ring/60` and `border-ring/40` live on the column resize handle (`grid-header-cell.tsx:244`) and the editor inputs, not the cell ring — the earlier description of a partial-opacity ring was wrong. Alpha is **not** the lever here: on a dark surface lowering alpha moves the color toward the surface and contrast only decreases (measured in Chromium: dark `--ring` 2.02:1 at full opacity, worse at any lower alpha). The authorized fix is to lighten the `.dark` value of `--ring` until the ring measures **>=3:1 against `--card` in both themes** (starting point `oklch(0.55 0.12 260)`, ~3.86:1). Grid classes stay untouched.
- **The destructive cell.** `text-destructive` measures 4.77:1 in light but **1.88:1 in dark** against `--card` — same cause, same remedy: lighten the `.dark` value of `--destructive` until it measures **>=4.5:1 in both themes** (starting point `oklch(0.6 0.141 25.723)`, ~4.44:1 — tune until >=4.5:1 measures). Token edits stay in the two mirrored `globals.css` files only; no grid class changes, zero raw colors still.

## What is in scope outside the grid

`components/manage/` has hardcoded colors on program-primary headers: `bg-[var(--program-primary)] text-white` in `manage-dashboard.tsx:102`, `manage-attendance-view.tsx:109`, and `hover:bg-black/5` in three places in `manage-attendance-view.tsx`.

- `text-white` on a fixed dark brand color is **correct in both themes** — `--program-primary` is royal blue in `:root` and `--royal-blue-dark` in the dark block. Leave it.
- `hover:bg-black/5` **is a real dark-mode bug**: black at 5% on a dark surface is invisible. It needs `hover:bg-foreground/5`, which resolves correctly either way. Decided 2026-10-09: the contract's old "three places" count is stale — all SEVEN sites are in scope (`manage-attendance-view.tsx:133,145`, `manage-favorites-view.tsx:345,486,514`, `manage-portal.tsx:84,96`).
- The three static `bg-black/5` sites are the same defect (stronger case — not transient) and are in scope → `bg-foreground/5`: `manage-favorites-view.tsx:344` (active chip), `:376` (placeholder), `manage-sessions-view.tsx:92` (pill).
- The two `bg-white/95` `SelectTrigger`s (`manage-dashboard.tsx:145,158`) are in scope → a semantic surface token, no raw colors.
- The `bg-[#FFF9F0]` full-page wrapper on `apps/*/app/manage/page.tsx:37` (both apps) is in scope → `bg-background`. It is the outermost surface of the graded page; dark mode is visibly broken without it.

Scope is bounded to `/manage`, the surface this grid lives in. Explicitly out: the gita-life `body` gradient (`globals.css:200-205`) and the shared header mobile-nav `bg-white/95` (`header.tsx:321`). A repo-wide token audit is a separate piece of work and is not smuggled in here.

## Two-app parity

`apps/folk` and `apps/gita-life` `layout.tsx`, `providers.tsx` usage and `globals.css` mirror each other and must stay mirrored. `components/` is shared, so `theme-provider.tsx` and the new `theme-toggle.tsx` are written once.

The repo already has a byte-parity habit for exactly this — the bulk route files are md5-identical across apps. For `layout.tsx`, whole-file md5s never matched (branding, themeColor, icon paths differ by intent), so after editing confirm the `<html>` open tag matches across apps instead — that is where `suppressHydrationWarning` lands.

## Verification

- Theme persists across a reload — the hard one, because it fails if `attribute` is wrong or the provider is not mounted.
- System preference is honored — `enableSystem` with `defaultTheme="system"`.
- The grid is legible in both themes: header sticky rule visible, row separators visible, focus ring visible, frozen-run divider visible, destructive cell visible.
- `grep -rn "dark:" components/grid/` is still **0** after all of this.
- `suppressHydrationWarning` is present on `<html>` in both apps — its absence shows up only as console noise, which is exactly the kind of defect that survives to production.
