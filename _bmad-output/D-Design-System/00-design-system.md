# 00 — Design System

**Project:** folk_hkmc
**Created:** 2026-11-01
**Method:** Whiteport Design Studio (WDS), extracted from the shipped UI
**Mode:** `design_system_mode: none` → this document is a **reference extraction**, not a new source of truth

---

## Purpose

This document holds the visual decisions that page specifications must not repeat: colour values, type sizes, spacing, elevation and the shared component patterns. It exists because the page specs are implementation-grade and would otherwise carry CSS classes, hex codes and pixel values — which the WDS standard forbids in a page spec.

**The code is the source of truth.** Every token below is declared in `apps/folk/app/globals.css` and `apps/gita-life/app/globals.css`; every pattern is implemented in the file named beside it. If this document and the code disagree, the code wins and this document is corrected.

---

## Foundations

### Colour

Semantic tokens only. A page must never name a literal colour; it names the token, and the program's theme supplies the value.

| Token | Role | FOLK (light) | Gita Life (light) | Dark (both apps) |
|-------|------|--------------|-------------------|------------------|
| `--program-primary` | Brand bar, card headers, active nav | `#0f1e54` | `#2d0a0a` | header goes near-black |
| `--program-primary-light` | Hover on brand surfaces | `#1a2d6d` | `#451010` | — |
| `--program-primary-dark` | Pressed brand surfaces | `#0a1640` | `#1d0707` | — |
| `--program-text` | Headings, figures, primary ink | `#24324a` | `#2d0a0a` | `#e9eaeb` |
| `--program-accent` | CTA ramp and header accents | `#f2f2f2` | `#ea580c` | FOLK `#dde0e4`; Gita stays saffron |
| `--program-accent-dark` | CTA hover | mixed 86 % black | `#d97706` | follows the light value |
| `--background` | Page canvas | `#ffffff` | `#fff9f0` | `#1f2124` |
| `--card` | Card and tile surface | `#ffffff` | `#fffdf9` | `#272a2e` |
| `--panel-header` | Card title band | `var(--program-primary)` | `var(--program-primary)` | black |
| `--border` | Hairlines, card edges | `#e2e8f0` | `#ead8c9` | `#3c4045` |
| `--muted-foreground` | Secondary ink, captions | `#4a5568` | `#6b4c3f` | `#9da1a6` |
| `--success` | Live state, positive status | `#15803d` | `#0f766e` | `#4ade80` |
| `--destructive` | Errors | `#c2410c` | oklch red | `#f08a5d` |
| `--ring` | Focus ring on light surfaces | `#0f1e54` | `#ea580c` | `#7da3e8` |
| `--tab-active-underline` | Active tab indicator | `#0f1e54` | — | `#048a0e` |
| `--chart-1…5` | Chart series | navy, green, orange, navy, slate | — | lightened pair |

**Rules**

- `--program-accent` is **not** a reliable border or focus colour in FOLK: it resolves to `#f2f2f2`, a near-white. Use `--ring` for focus on light surfaces, and `--success` / `--program-primary` for emphasis.
- `--program-text` is text-only. Never use it as a background.
- A literal hex is allowed only inside a token declaration in `globals.css`, or in a documented exception with a comment. `components/grid/` is hex-free by guardrail; new shared components should follow it.

### Typography

| Token | Family | Size / line | Weight | Use |
|-------|--------|-------------|--------|-----|
| `DS-Type.page-title` | Poppins | 22 / tight | 600 | Page H1 |
| `DS-Type.card-title` | Poppins | 18 / snug | 600 | Card H2, live session name (16) |
| `DS-Type.stat-value` | Poppins | 32 / none | 700 | KPI value |
| `DS-Type.stat-value-sm` | Poppins | 24 / none | 700 | Live check-in count |
| `DS-Type.body` | Inter | 14 / 20 | 400 | Table cells, body copy |
| `DS-Type.body-strong` | Inter | 14 / 20 | 500–600 | Row names, actions |
| `DS-Type.meta` | Inter | 12 / 16 | 400 | Scope line, captions, timestamps |
| `DS-Type.micro` | Inter | 11 / 14 | 600 | Table heads, KPI labels, unit labels |

**Rules**

- Semantic level and visual size are independent: an `h2` may be 18 px; a `dt` may be 11 px.
- Numbers that sit in columns or update in place use `tabular-nums`.
- Only Poppins carries titles and figures. Body, meta and micro are Inter.

### Spacing

Base unit 4 px (Tailwind). The scale in use:

| Token | Value | Use |
|-------|-------|-----|
| `DS-Space.hairline` | 1 px | Card border |
| `DS-Space.xs` | 4 px | Label-to-value gap |
| `DS-Space.sm` | 8 px | Tight pairs |
| `DS-Space.md` | 12–16 px | Card body, list row padding |
| `DS-Space.lg` | 20–24 px | Card header padding, section gap |
| `DS-Space.xl` | 32 px | Chart body height rhythm |
| `DS-Space.2xl` | 48 px | Empty-state vertical padding |
| `DS-Space.touch` | 56 px | Minimum mobile touch target |

**Page recipes**

- Page gutter: 16 px on phones, 24 px from the `sm` breakpoint.
- Section rhythm: 24 px.
- Card padding: 16 px body; 20 px horizontal / 16 px vertical header.
- Tile padding: 20 px all round.

### Radius and elevation

| Token | Value | Use |
|-------|-------|-----|
| `DS-Radius.card` | 8 px (`rounded-lg`) | Cards, notices, live band |
| `DS-Radius.tile` | 12 px (`rounded-xl`) | Stat tiles, tables |
| `DS-Radius.pill` | full | Nav items, pills, scope switch |
| `DS-Radius.button` | 6 px (`rounded-md`) | Buttons |
| `DS-Elevation.card` | `0 18px 50px rgba(45,10,10,0.08)` | Every card, tile and table |
| `DS-Elevation.header` | `0 10px 15px -3px rgb(0 0 0 / 0.1)` | App header only |

The card shadow is deliberately warm and low-contrast. Do not substitute a Tailwind shadow preset.

### Breakpoints

| Name | Width | Consequence |
|------|-------|-------------|
| base | < 640 px | One column; bottom nav visible; tables become lists |
| `sm` | ≥ 640 px | 24 px page gutter; inline rows |
| `md` | ≥ 768 px | Inline nav; tables visible; KPI band can hold five |
| `lg` | ≥ 1024 px | Full desktop composition |
| `xl` | ≥ 1280 px | Two-column chart rows |

### Motion

| Token | Value | Use |
|-------|-------|-----|
| `DS-Motion.fast` | 150 ms, background/colour/transform | Hover, active, focus |
| `DS-Motion.live-pulse` | 2 s pulse | Live indicator only; disabled under `prefers-reduced-motion` |
| `DS-Motion.lift` | −2 px translate on hover | Desktop nav items and primary actions only |

---

## Components

Each pattern is a **recipe**: the exact classes and structure an implementer copies. A page spec references the pattern ID, not the classes.

### DS-Shell — page frame

**Code:** `apps/folk/app/campaigns/layout.tsx`, `apps/folk/app/manage/page.tsx`

```
wrapper: flex min-h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col bg-background
main:    flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-6
```

The height subtraction reserves the fixed mobile bottom nav. A scrolling page uses `min-h`; a page that owns its scroll uses `h` plus `overflow-hidden`.

### DS-PageHeader — title, scope line, action

**Code:** `components/manage/manage-portal.tsx`, `components/campaign/campaign-page-header.tsx`

```
wrapper:  flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between
title:    font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]
scope:    mt-0.5 text-xs text-[var(--muted-foreground)]
```

The title and scope line are one optical unit; an action or switch aligns to the scope line (`sm:items-end`), not to its own label.

### DS-ScopeSwitch — program / own scope

**Code:** `components/manage/manage-portal.tsx`

Desktop pill:

```
wrapper:  hidden w-fit items-center gap-1 rounded-full border border-[var(--border)] bg-card p-1 md:inline-flex
active:   rounded-full bg-[var(--program-primary)] px-4 py-1.5 text-sm font-semibold text-white
inactive: rounded-full px-4 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-foreground/5
```

Mobile segmented twin (when the surface has no panel to carry the switch):

```
wrapper:  grid w-full grid-cols-2 gap-1 rounded-full border border-[var(--border)] bg-card p-1 md:hidden
link:     rounded-full px-4 py-2 text-center text-sm font-semibold
```

Both are real links with `aria-current="page"` on the active one, and `scroll={false}` so the page does not jump.

### DS-Notice — scope explanation

**Code:** `components/manage/manage-portal.tsx`

```
rounded-lg border border-[var(--border)] bg-card px-4 py-3 text-sm text-[var(--muted-foreground)]
```

### DS-Card — navy-header card

**Code:** `components/manage/manage-dashboard.tsx` (`ChartFrame`)

```
wrapper:  overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]
header:   bg-[var(--program-primary)] px-5 py-4 text-white
headerRow:flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between
title:    font-[family-name:var(--font-poppins)] text-lg font-semibold
subtitle: text-sm text-white/70
body:     p-4
```

This is the identity of `/manage` and `/campaigns`. Do not restyle it per page.

### DS-StatTile — KPI tile

**Code:** `components/campaign/campaign-overview-stats.tsx`

```
tile:    flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-card p-5
label:   text-[11px] font-semibold text-[#64748b] dark:text-[var(--muted-foreground)]
value:   block font-[family-name:var(--font-poppins)] text-[32px] leading-none font-bold text-[var(--program-text)]
caption: block text-[12px] text-[var(--muted-foreground)]
```

Two tile anatomies exist in the codebase. **This one wins for new work** because it carries a caption slot (where a definition lives) and fits five across at `md`. `ManageDashboard.StatTile` (uppercase 14 px label, 30 px value) is legacy and should not be copied.

### DS-LiveBand — live session row

**Code:** `components/live-attendance-dashboard.tsx` (pill), `components/manage/manage-sessions-view.tsx` (rows)

```
wrapper: overflow-hidden rounded-lg border border-success/40 bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]
list:    divide-y divide-[var(--border)]
row:     flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between
pill:    inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-xs font-semibold text-success
dot:     h-2 w-2 animate-pulse rounded-full bg-success motion-reduce:animate-none
name:    font-[family-name:var(--font-poppins)] text-base font-semibold text-[var(--program-text)]
meta:    text-xs text-[var(--muted-foreground)]
count:   font-[family-name:var(--font-poppins)] text-2xl font-bold tabular-nums text-[var(--program-text)]
```

### DS-Table — desktop table, mobile list twin

**Code:** `components/campaign/campaign-list.tsx`, `components/campaign/campaign-overview-cards.tsx`

```
desktop wrapper: hidden overflow-hidden rounded-xl border border-[var(--border)] bg-card md:block
head row:        border-b border-[var(--border)] bg-[#f8fafc] hover:bg-[#f8fafc] dark:bg-[var(--secondary)] dark:hover:bg-[var(--secondary)]
head cell:       h-11 px-2 text-[11px] font-semibold text-[#64748b] dark:text-[var(--muted-foreground)] sm:px-4
body row:        h-12 border-b border-[var(--border)]
body cell:       px-2 py-3 text-[14px] sm:px-4
number cell:     tabular-nums text-[var(--program-text)]
name cell:       font-medium text-[var(--program-text)]

mobile list:     md:hidden, ul divide-y divide-[var(--border)], li flex items-start justify-between gap-4 px-5 py-4
```

Every head cell carries `scope="col"`. A table below `md` is replaced by its list twin, not horizontally scrolled.

### DS-EmptyState — nothing here, and what to do

**Code:** `components/campaign/campaign-empty-state.tsx`, `components/ui/empty.tsx`

```
wrapper:     Empty primitives, border border-dashed border-[var(--border)] bg-card
title:       EmptyTitle
description: EmptyDescription
action:      EmptyContent + Button asChild
```

An empty state names what is missing **and** the next action. In-card empty text (no action) uses `px-5 py-12 text-center text-sm text-[var(--muted-foreground)]`.

### DS-FocusRing — keyboard focus

```
focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2
```

`--ring` is the only focus token that is visible on both white cards and the navy header in FOLK. Do not use `--program-accent` here.

### DS-CardAction — text link in a card header

```
text-sm font-semibold text-white/80 transition-colors hover:text-white hover:underline
focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2
```

### DS-NavItem — header navigation item

**Code:** `components/header.tsx`

```
desktop: inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold
mobile:  flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold leading-none
icon:    16 px desktop / 20 px mobile, aria-hidden
active:  desktop = white pill with brand ink; mobile = brand fill with white ink
pending: brand-tinted pill with a spinner in place of the icon
```

The mobile bar holds at most six items on one row. Labels are never truncated or abbreviated; if a label clips, reduce the label size, not the word.

### DS-Chart — chart body and marks

**Code:** `components/manage/manage-dashboard.tsx`

```
body:        h-72 w-full, ChartContainer aspect-auto h-full w-full
line stroke: 2, type monotone, dot r 3
bar radius:  [4, 4, 0, 0] on the top of the stack
grid:        CartesianGrid vertical={false}
axes:        tickLine={false}, axisLine={false}, tickMargin={8}
tooltip:     ChartTooltipContent
```

Series colour comes from `--chart-1…5`, exposed to Recharts as `var(--color-<key>)` through `ChartConfig`.

---

## Component Registry

| Pattern | Code | Used by |
|---------|------|---------|
| DS-Shell | `apps/*/app/*/layout.tsx`, `manage/page.tsx` | Every staff page |
| DS-PageHeader | `components/manage/manage-portal.tsx`, `components/campaign/campaign-page-header.tsx` | `/manage`, `/campaigns`, `/overview` |
| DS-ScopeSwitch | `components/manage/manage-portal.tsx` | `/manage`, `/overview` |
| DS-Notice | `components/manage/manage-portal.tsx` | `/manage`, `/overview` |
| DS-Card | `components/manage/manage-dashboard.tsx` | `/manage`, `/overview` |
| DS-StatTile | `components/campaign/campaign-overview-stats.tsx` | `/campaigns`, `/overview` |
| DS-LiveBand | `components/live-attendance-dashboard.tsx`, `manage-sessions-view.tsx` | `/sessions`, `/overview` |
| DS-Table | `components/campaign/campaign-list.tsx` | `/campaigns`, `/overview` |
| DS-EmptyState | `components/campaign/campaign-empty-state.tsx` | `/campaigns`, `/overview` |
| DS-FocusRing | app-wide convention | Every interactive element |
| DS-CardAction | `components/manage/manage-dashboard.tsx` | `/manage`, `/overview` |
| DS-NavItem | `components/header.tsx` | Every staff page |
| DS-Chart | `components/manage/manage-dashboard.tsx` | `/manage`, `/overview` |

---

## Usage Rules

1. **Reference, don't restyle.** A page spec names `DS-Card`; it does not restate the card's classes. If a page needs a variation, add a documented variant here first.
2. **One definition per pattern.** If two surfaces need the same thing, the second one imports the first. The stat-tile duplication is the cautionary example: two anatomies exist because the second was written inline.
3. **Tokens over literals.** No hex, no arbitrary shadow, no font stack outside `--font-poppins` / `--font-inter`.
4. **Program-agnostic.** A pattern may not assume FOLK's navy. `--program-primary` and `--program-accent` are the only brand hooks.
5. **Accessibility is part of the pattern.** Focus ring, reduced motion, `scope="col"`, and a text equivalent for every chart travel with the component, not with the page.

---

## Change Policy

- A new token or pattern is added here **and** in `globals.css` / its component in the same change.
- A pattern's classes live in exactly one place in code. This document mirrors them; it never becomes the implementation.
- Page specs may keep page-specific **composition** (which sections, in what order, how many columns) and **copy**. They may not keep colour values, type sizes, spacing values or class strings.

---

## Revision History

| Date | Change | Author |
|------|--------|--------|
| 2026-11-01 | Extracted from the shipped `/manage`, `/campaigns`, `/sessions` surfaces to support the `/overview` specification | Freya |
