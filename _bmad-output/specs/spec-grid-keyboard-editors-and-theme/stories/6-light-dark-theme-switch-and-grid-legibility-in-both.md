---
status: ready-for-dev
baseline_revision: 09412d1b3c2437d9f7c47a6c12821d8af19c6bc4
---

# Light/dark theme switch and grid legibility in both

## Resolved 2026-10-09 — read this before implementing

Two dev attempts (`6-dev-1`, `6-dev-1-g1`) stopped at investigation and raised
an intent gap, then a scope gap (Q1–Q4 below). Both are now **decided and
binding**. The answers live in `theme-contract.md` and in this story's
`invoke_dev_with` entry in `stories.yaml`; those two are the authority. The
analysis below is preserved as the **evidence** behind the decisions — the
measured contrast ratios, the exhaustive site lists, and the parity finding all
still hold and are worth re-reading before you edit.

Do not re-open Q1–Q4. They are answered.

| # | Question | Decision |
|---|----------|----------|
| Q1 | `bg-[#FFF9F0]` full-page wrapper on `apps/*/app/manage/page.tsx:37` | **In scope** → `bg-background`. It is the outermost surface of the graded page; dark mode is visibly broken without it. |
| Q2 | Seven `hover:bg-black/5` sites vs the contract's stale "three places" | **All seven** → `hover:bg-foreground/5`. The line-list count was stale; the pattern was never a restriction to one file. |
| Q3 | Three static `bg-black/5` + two `bg-white/95` in `/manage` | **In scope.** The static trio is the same defect in a stronger (non-transient) form → `bg-foreground/5`. The two `SelectTrigger`s → a semantic surface token, no raw colors. |
| Q4 | `layout.tsx` whole-file md5 parity | **Check the `<html>` open tag, not the file md5.** Whole-file md5s never matched and never will — branding, `themeColor` and icon paths differ by intent. |

Explicitly **out of scope**, do not touch: the gita-life `body` gradient
(`globals.css:200-205`), the shared header mobile-nav `bg-white/95`
(`header.tsx:321`), and `text-white` on program-primary headers (that brand
color is dark in both themes).

### Prior investigation (evidence, no longer blocking)

Blocking condition, as originally raised: intent gap — the authorized fix list is
enumerated by pattern, and grep shows the pattern both under- and over-matches
the classes it was written against. Nothing in SPEC.md or theme-contract.md
selected between the defensible readings. All four readings are now settled
above.

### What is unambiguous and ready to build

None of this is in question; it is listed so a resolve unblocks straight to
implementation:

1. **`components/providers.tsx:12-24`** — mount `ThemeProvider` outermost, props
   `attribute="class"`, `defaultTheme="system"`, `enableSystem`,
   `disableTransitionOnChange`. `components/theme-provider.tsx` is correct as-is
   (verified, 11 lines, no rewrite needed).
2. **`apps/{folk,gita-life}/app/layout.tsx:52`** — `suppressHydrationWarning`
   on `<html>`. Currently `<html lang="en">` in both.
3. **`components/theme-toggle.tsx`** — new `"use client"`, `useTheme` +
   `setTheme`, renders `null` until mounted, mounted in the shared app header
   (`components/header.tsx`), not the grid toolbar.
4. **Token lightening** in the `.dark` block of both `globals.css` files. The
   `.dark` blocks are currently byte-identical across the two apps
   (`apps/folk/app/globals.css:78-111` and `apps/gita-life/app/globals.css:110-143`,
   both `--ring: oklch(0.4 0.12 260)`, `--destructive: oklch(0.396 0.141 25.723)`),
   so the edit stays mirrored by construction.
5. **Grid classes stay untouched.** Confirmed token-clean:
   `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|\bwhite\b|\bblack\b|dark:" components/grid/`
   returns zero across all 14 files. Nothing to rewrite.

### Measured confirmation of the two authorized ratios

Computed `oklch` → sRGB → WCAG relative luminance in isolation. This reproduces
`theme-contract.md`'s figures and confirms both starting points land:

| Token | Theme | Value | vs `--card` | Target |
|-------|-------|-------|-------------|--------|
| `--ring` | dark | `oklch(0.4 0.12 260)` (current) | **2.01:1** | >=3:1 — FAIL |
| `--ring` | dark | `oklch(0.55 0.12 260)` (contract start) | **3.84:1** | >=3:1 — OK |
| `--destructive` | dark | `oklch(0.396 0.141 25.723)` (current) | **1.87:1** | >=4.5:1 — FAIL |
| `--destructive` | dark | `oklch(0.6 0.141 25.723)` (contract start) | **4.45:1** | >=4.5:1 — **marginal, 0.05 short** |
| `--destructive` | light | `oklch(0.577 0.245 27.325)` | **4.76:1** | >=4.5:1 — OK |

`--card` is `oklch(0.18 0.01 250)` in dark, `oklch(1 0 0)` in light.
`theme-contract.md`'s numbers (2.02, 1.88, 3.86, 4.44, 4.77) agree with these to
rounding, so the analysis is sound and the defect is real.

**One item is not a gap and needs no decision:** the contract's destructive
starting point measures 4.45:1 against a >=4.5:1 target — but the contract
already says "tune until >=4.5:1 measures", so tuning upward is instructed
behavior, not an open question. A sweep at fixed C/H 0.141/25.723 puts L=0.62 at
4.83:1 and L=0.65 at 5.45:1.

### Q1 — `bg-[#FFF9F0]` on the `/manage` page wrapper is not in any list
### DECIDED: in scope → `bg-background` (both apps)

`apps/folk/app/manage/page.tsx:37` and `apps/gita-life/app/manage/page.tsx:37`
both render:

```tsx
<div className="min-h-screen bg-[#FFF9F0]">
```

This is a **fixed light cream full-page background that ignores the theme
entirely**. It is neither a `hover:bg-black/5`, nor a `text-white` on a
program-primary header, nor the gita-life `body` gradient — it is unmentioned by
SPEC.md, theme-contract.md and the story's own `invoke_dev_with`, all three of
which enumerate the out-of-scope items carefully enough to name
`header.tsx:321`'s `bg-white/95` by line number.

It is also the **most consequential finding in this investigation**: it is the
outermost painted surface of `/manage`, the one page the story exists to grade.
In dark mode the grid's dark cells would sit on a hardcoded cream page. Under
CAP-7's success condition ("the grid is legible in both"), shipping the
provider, the toggle and the two token fixes while leaving this would produce a
surface that is visibly broken in dark mode — and the story's own e2e assertion
targets `/manage`.

**Which way does this cut?** *(answered: Reading A — in scope)*

- **Reading A — in scope.** The contract's rule for `/manage` is stated as a
  principle, not a line list: "`hover:bg-black/5` **is a real dark-mode bug**:
  black at 5% on a dark surface is invisible." A full-page hardcoded light
  background is a strictly worse instance of the same defect, on the same
  surface, and CAP-7's success condition cannot be met without fixing it.
  Naturally it becomes `bg-background`.
- **Reading B — out of scope.** The story says "do not go looking for hardcoded
  colors to fix", and the contract closes with "A repo-wide token audit is a
  separate piece of work and is not smuggled in here." This wrapper was simply
  missed when the list was drawn up; fixing it widens a deliberately bounded
  change.

Both readings are defensible and produce observably different results. Reading A
changes a file the story never mentions; Reading B ships a known dark-mode defect
on the story's own target page.

### Q2 — `hover:bg-black/5` matches 7 sites across 3 files; the contract names 3 in 1
### DECIDED: all seven → `hover:bg-foreground/5`

`theme-contract.md:41` scopes the fix to "`hover:bg-black/5` in three places in
`manage-attendance-view.tsx`". Grep finds **seven**, in three files:

| File | Line |
|------|------|
| `components/manage/manage-attendance-view.tsx` | 133, 145 |
| `components/manage/manage-favorites-view.tsx` | 345, 486, 514 |
| `components/manage/manage-portal.tsx` | 84, 96 |

The pattern as written (`hover:bg-black/5`) matches all seven unambiguously. Two
sub-cases, and they may not want the same answer:

- **`manage-favorites-view.tsx:345`** is an inactive filter chip whose *active*
  sibling (`:344`) is `bg-black/5` **statically, not on hover**. Black at 5% on a
  dark surface is invisible in *both* slots, so the pair reads as broken
  together — but only `:345` matches the authorized pattern.
- **`manage-portal.tsx:84,96`** are the /manage view-switcher pills, the app-level
  navigation for the very page under test.

Should all seven `hover:bg-black/5` become `hover:bg-foreground/5` (pattern
taken literally, which is the natural reading), or only the three named
(contract's line list taken literally)? *(answered: all seven)*

### Q3 — three static `bg-black/5` and two `bg-white/95` sit beside the named sites
### DECIDED: all five are in scope; static trio → `bg-foreground/5`, SelectTriggers → semantic surface token

Not matched by the authorized pattern, not in any list, and not explicitly
excluded:

- `components/manage/manage-favorites-view.tsx:344` — active filter chip
  (`bg-black/5`, static)
- `components/manage/manage-favorites-view.tsx:376` — contact image placeholder
  box (`bg-black/5`, static)
- `components/manage/manage-sessions-view.tsx:92` — a pill (`bg-black/5`, static)
- `components/manage/manage-dashboard.tsx:145,158` — Year and Month
  `SelectTrigger`s (`bg-white/95`)

The static `bg-black/5` trio is invisible on a dark surface for the same reason
the hover case is — arguably a stronger case, since it is not a transient hover
state. The `bg-white/95` pair is a near-exact twin of `header.tsx:321`'s mobile
nav, which the story **explicitly excludes**; that exclusion was reasoned about
for the header and is silent here, so whether the same reasoning transfers is a
judgment call.

Fix with Q2, or leave as out of scope? *(answered: fix with Q2 — all five in scope)*

### Q4 — parity: `layout.tsx` md5s do not match, and never did
### DECIDED: not a gap; verify the `<html>` open tag matches across apps

`theme-contract.md:52` instructs: "after editing, `md5sum` the two `layout.tsx`
files and confirm they still match, or differ only where they are intended to."
The story repeats "Keep apps/folk and apps/gita-life layout.tsx mirrored — md5sum
them after editing."

Current state, at baseline `f7da840`:

```
5f710b90d7dea5bb690934221f06e289  apps/folk/app/layout.tsx
5efa97345a2cd2a1add7214e21c3535a  apps/gita-life/app/layout.tsx
```

They do not match, and never have: the diff is branding (`"FOLK Portal"` vs
`"Gita Life Portal"`), `themeColor` (`#0F1E54` vs `#FFFFFF`), and icon paths.
This is not a gap in the intent — the phrase "or differ only where they are
intended to" covers it, and `suppressHydrationWarning` lands on the identical
`<html lang="en">` line in both. Recording it so the parity check is written as
"the `<html>` open tag matches", not as a whole-file md5 that can never pass.

The `.dark` blocks in both `globals.css` files **are** byte-identical today, so
the token edit is mirrored by construction.

### Guardrail note — grid token-cleanliness must survive

`grep -rn "dark:" components/grid/` must return zero after this story. No grid
class changes are authorized, and no raw color may be introduced. Verified clean
at baseline across all 14 files under `components/grid/`.

### What was needed to unblock — all answered

1. **Q1** — is `bg-[#FFF9F0]` on `apps/*/app/manage/page.tsx:37` in scope
   (→ `bg-background`), or out? → **in scope, `bg-background`, both apps.**
2. **Q2** — all seven `hover:bg-black/5` sites, or only the three in
   `manage-attendance-view.tsx`? → **all seven → `hover:bg-foreground/5`.**
3. **Q3** — the three static `bg-black/5` and the two `bg-white/95` in
   `/manage`: fix or leave? → **fix. Trio → `bg-foreground/5`; the two
   `manage-dashboard.tsx` `SelectTrigger`s → a semantic surface token.**

This story is unblocked and ready to implement. The binding implementation
contract is `theme-contract.md` plus this story's `invoke_dev_with` in
`stories.yaml`; re-read both in full before touching code.