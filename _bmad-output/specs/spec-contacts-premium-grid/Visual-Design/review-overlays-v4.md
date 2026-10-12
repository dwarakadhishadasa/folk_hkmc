# Overlays design — review of Stitch export (4)

- **Reviewed:** 2026-10-12
- **Source:** `stitch_folk_operations_console_contacts_grid(4)/{code.html,screen.png}`
- **Against:** `stitch-prompt-contacts-overlays.md`, CAP-6, CAP-12, CAP-14, CAP-17, CAP-18, CAP-19
- **Verdict:** Close on structure, **reject on palette**. All three surfaces are present and
  correctly labelled; four binding requirements are missed.

## What it got right

- Toolbar reshuffled exactly as specified: **Search · Filtered by Name, Phone · Sort · Hide fields · 41 of 226 shown · New contact**. The `Columns` control and the `All contacts` dropdown are both gone.
- Column menu has **exactly four** items — Sort ascending, Sort descending, Hide column, Filter — with the hairline split. No Move left/right, no colour options.
- Sort popover has the right shape: "Sort by", a field select, a direction select, "Clear sort".
- Hide fields popover lists **all fourteen** fields with the right tick states.
- `Actions` column and the red bin are present, matching CAP-19.
- 32px rows, 6px/8px radii (via Tailwind defaults), 12px headers, 13px body.
- Header `···` control appears on hover rather than permanently.

## Blocking

### 1. The filter indicator went off-token — `#D97706` and amber-200, not saffron

```html
<button class="… text-[#D97706] bg-amber-50/70 border border-amber-200 …">
```

This is the **same defect fixed in v1**. `--saffron` is `#F98B1C`; `#D97706` is Tailwind amber-600 — darker, browner, more orange-brown. The border moved to `amber-200` too. Saffron is specified as the *active state only* accent, so this control is precisely where it must land on-token. Three off-palette literals where one token belongs.

**Fix:** `text-[#F98B1C]` / `bg-[#F98B1C]/10` / `border-[#F98B1C]/30`.

### 2. Row hover is amber — a palette and semantics violation

```html
<tr class="h-8 hover:bg-amber-50/30 transition-colors">
```

Eleven amber uses across the file. Two problems:

1. **Token-clean.** CAP-2's constraint is explicit: hierarchy comes from "weight, space and existing semantic tokens — never a new literal colour or a per-option hue." `amber-50` is a new literal.
2. **It collides with the accent.** Amber and saffron are the same hue family. A hover tint in the active-state colour makes a passive row look partially activated. v1 used a neutral `hover:bg-slate-50`, which is correct — hover should read as neutral, not as state.

**Fix:** `hover:bg-[#4A5568]/5` (neutral, resolves in both themes) or `hover:bg-slate-50`.

### 3. Both locked checkboxes are actually toggleable

All **14** checkboxes are enabled; `disabled` count is **0**. The prompt was explicit that **Name** and **Actions** cannot be unticked. The file has three `cursor-not-allowed` occurrences elsewhere, so the pattern was available and simply not applied here.

Unchecking Name drops the pinned identity column; unchecking Actions removes every delete control with no way back.

**Fix:** `disabled` on those two, with `cursor-not-allowed` and a muted treatment.

### 4. Cell padding doubled

`px-4 py-1.5` = **16px horizontal**, 6px vertical. CAP-15 specifies **~8px horizontal**, 4–6px vertical, and v1 was correct at `px-2 py-1`. This is the single biggest thing making the grid read loose rather than dense, which is the original complaint.

**Fix:** `px-2 py-1`.

## Worth fixing

- **Row height is `h-8` with no min/max lock.** v1 used `height/min-height/max-height: 32px`. The spec calls fixed row heights load-bearing because the virtualizer estimates from them (`grid.tsx:633`). `h-8` alone lets content stretch a row. Restore the triple.
- **`bg-slate-50/80` on the header** — a new literal; should be `--muted`.
- **Phone cells** are `text-right font-mono text-xs` — 12px right-aligned. CAP-15 fixes cell text at 13px; right-aligning a phone reads oddly next to left-aligned text.
- **All three overlays are open simultaneously**, which is not a real state, and the column menu overlaps the Hide fields list, hiding field names. Fine for review; unusable as a spec reference image.

## Corrected on review

- ~~"The sort popover clips its direction select"~~ — **withdrawn, my error.** The popover is
  `w-60` (240px) with `p-3`, leaving roughly 174px for the select after its `pr-8`; "Ascending" at
  13px is about 62px and fits with room to spare. What reads as "Ascendin" in the render is the
  text being **occluded by the overlapping Hide fields popover**, which sits above it in z-order.
  It is the overlap artifact already noted, not a width defect. No widening needed.
- ~~"Both locked checkboxes are actually toggleable"~~ — **half wrong, corrected.**
  **Actions was locked correctly in the export all along** (`disabled=""`, `opacity-60`,
  `cursor-not-allowed`, plus a lock icon). My count regex only matched `disabled` appearing *after*
  `type="checkbox"`, and in that element it precedes it, so the check reported 0. Only **Name**
  was genuinely unlocked. Verified after patching: both report `isDisabled() === true`.

## Verified finding: `max-height` does not constrain a table row

Measured in Chromium on the patched file:

```
rowMaxHeight : 32px
rowHeight    : 33.5px      <- max-height is ignored
```

A `<tr>` cannot be height-capped. In a CSS table the row is driven by its cells, `height`
behaves as a **minimum**, and `max-height` does not apply. The same holds for `<td>` — the cell
reported `max-height: 32px` against a used height of 33.5px.

This is worth recording against the spec, which calls fixed row heights **load-bearing** because
the virtualizer estimates from them (`grid.tsx:633`) and states "no cell ever changes its row's
height". Two contributing factors were isolated:

- **`border-collapse: collapse` costs 1px.** Switching the table to `border-separate
  border-spacing-0` — which is what the shipped grid already uses — took the row from 34.5px to
  33.5px. The patched comp now uses `border-separate`, which also matches the implementation.
- **The table strut accounts for the rest.** Content is 19.5px line + 8px padding = 27.5px, and
  an explicit `line-height` on the cell made it *worse* (36px), so the strut is being set from the
  row's inherited metrics rather than the cell's.

**Unresolved: the comp renders 33.5px rows, not 32px.** The implementation must not rely on
`max-height` to pin a row — it needs the cell height fixed at the source, which is what
`grid-row.tsx` does. This is a comp-fidelity gap, not a spec change, and it does not affect any
other verified property.

## Not defects

- `rounded-md` / `rounded-lg` are Tailwind defaults (6px / 8px) that happen to match the decision. Correct, though v1's explicit `rounded-[6px]` was clearer about intent.
- Header sort indicators are present (7 SVGs in `<thead>`).