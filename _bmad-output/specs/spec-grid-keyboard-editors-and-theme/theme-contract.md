# Theme contract

Binding contract for CAP-7. Follows the recipe the user named: <https://ui.shadcn.com/docs/dark-mode/next>.

## The state today

`existing-state.md` records it in full. In short: the theme is **defined and dead**. `next-themes` is installed, `components/theme-provider.tsx` is correct, both `globals.css` files carry a complete 31-token `.dark` block, and nothing mounts the provider or offers a control.

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
- **The focus ring.** `bg-ring/60` and `border-ring` at partial opacity are tuned for a light surface. Confirm legibility in dark; adjust the alpha, not the token.

## What is in scope outside the grid

`components/manage/` has hardcoded colors on program-primary headers: `bg-[var(--program-primary)] text-white` in `manage-dashboard.tsx:102`, `manage-attendance-view.tsx:109`, and `hover:bg-black/5` in three places in `manage-attendance-view.tsx`.

- `text-white` on a fixed dark brand color is **correct in both themes** — `--program-primary` is royal blue in `:root` and `--royal-blue-dark` in the dark block. Leave it.
- `hover:bg-black/5` **is a real dark-mode bug**: black at 5% on a dark surface is invisible. It needs `hover:bg-foreground/5`, which resolves correctly either way.

Scope is bounded to `/manage`, the surface this grid lives in. A repo-wide token audit is a separate piece of work and is not smuggled in here.

## Two-app parity

`apps/folk` and `apps/gita-life` `layout.tsx`, `providers.tsx` usage and `globals.css` mirror each other and must stay mirrored. `components/` is shared, so `theme-provider.tsx` and the new `theme-toggle.tsx` are written once.

The repo already has a byte-parity habit for exactly this — the bulk route files are md5-identical across apps. Follow it: after editing, `md5sum` the two `layout.tsx` files and confirm they still match, or differ only where they are intended to.

## Verification

- Theme persists across a reload — the hard one, because it fails if `attribute` is wrong or the provider is not mounted.
- System preference is honored — `enableSystem` with `defaultTheme="system"`.
- The grid is legible in both themes: header sticky rule visible, row separators visible, focus ring visible, frozen-run divider visible, destructive cell visible.
- `grep -rn "dark:" components/grid/` is still **0** after all of this.
- `suppressHydrationWarning` is present on `<html>` in both apps — its absence shows up only as console noise, which is exactly the kind of defect that survives to production.
