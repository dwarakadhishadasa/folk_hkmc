# Screen 1 — implementation deltas

Measured from `contacts-toolbar-stitch-v1.html` (Stitch export, 2026-10-12) against the
spec. The design is **accepted**; these are the points where the generated markup drifts
from the contract and would be wrong if implemented as-drawn.

## Blocking — contradicts a binding requirement

### 1. The em-dash is back in empty cells — CAP-3 violation

Three cells in the `Current status` column:

```html
<!-- the comment says one thing, the markup does another -->
<!-- Empty Status cell (no pill, no chip, reads as text on a surface) -->
<td class="h-8 px-2 py-1 align-middle border-r border-[#E2E8F0] text-[#4A5568]/40 italic">—</td>
```

The comment claims "no pill, no chip" — but it renders a dash. `GRID_EMPTY_TEXT`
(`use-grid-keyboard.ts:20`) is exactly what CAP-3 retires, and removing it is **one of only
two legitimate assertion edits this spec authorises** (`grid-keyboard.spec.ts:230`,
`grid-clipboard.spec.ts:134` and `:151`, `manage-contacts-edit.spec.ts:436`).

Worse in a design comp than in code: the whole visual argument for blank-not-dash is that
a sparse record stops looking like a wall of punctuation. A design that shows three greyed
italic dashes argues against the change it is supposed to illustrate.

**Fix:** render nothing. The cell is empty, and its hairlines and row height still delimit it.

### 2. `#EA580C` instead of saffron — off-token literal

The filter indicator uses `#EA580C` (Tailwind orange-600) twice, on the icon and the
label. The brand token is `--saffron: #F98B1C`, declared once in the Tailwind config and
then not used.

`#EA580C` is redder and darker than saffron. Saffron is specified as "used sparingly for
active state only" — this *is* the active state, so it is the one place the accent must be
exactly on-token. Anything else introduces a colour the palette does not contain, and
CAP-2's token-clean rule is the spec's load-bearing constraint.

**Fix:** `#F98B1C` on both.

### 3. The header menu never appears for keyboard users — CAP-14 violation

```css
.header-cell:hover .header-menu-btn { opacity: 1; visibility: visible; }
```

Hover only. There is **no `:focus-within`** rule anywhere in the file (0 occurrences).
CAP-14 requires the control be revealed "on header hover **and on keyboard focus**", and
the base state is `opacity-0` with no `visibility: hidden`, so the element is in the tree
and focusable — it simply never becomes visible when focused. A sighted keyboard operator
tabs onto an invisible control.

It is also a `<span>`, not a `<button>`: no role, no `tabindex`, no accessible name.
CAP-8 requires an accessible name on every interactive element.

**Fix:** add `.header-cell:focus-within .header-menu-btn { opacity: 1 }`, and make the
element a real button with a name like "Column options for Name".

## Worth fixing

### 4. `border-collapse` conflicts with the shipped grid

The table uses `border-collapse` with `divide-y` and per-cell `border-r`. The shipped grid
uses `border-separate border-spacing-0` (`grid.tsx:~880`) precisely so `[&>td]:border-b`
produces single hairlines. `border-collapse` merges adjacent cell borders, which can double
them. Not visible at this scale, but it is why the frozen run needs its one `border-r` on
the last pinned member only (`grid-row.tsx:214`).

**Fix:** when implementing, keep the shipped approach. Do not port this markup's table
structure.

### 5. Phone cells are 12.5px, not 13px

Three `text-[12.5px]` on the phone column, plus `font-mono`. CAP-15 fixes cell text at
**13px**. Monospace for a phone number is defensible for digit alignment, but 12.5px is
neither 13px nor a documented exception, and a fractional size is a sign the value was
tuned by eye against the mock rather than derived.

### 6. `#F8FAFC` is not a token

Three uses — header row, footnote strip, disabled input fill. It is Tailwind's slate-50.
The app's equivalent is `--muted: oklch(0.97 0.005 90)`, which is warm (hue 90) while
`#F8FAFC` is cool. On the ivory canvas `#FFF9F0` the cool grey reads slightly blue against
the warm surround.

This is expected in a generated comp and not worth "fixing" in the HTML — but the
implementation must reach for `--muted`, not this literal.

## Not defects — noted so they are not re-litigated

- **Popover drop shadow** (`0 10px 25px -5px rgba(15,30,84,.12)`). The no-shadow decision
  was scoped to the grid's buttons and cards. A floating overlay needs elevation to read as
  floating, and the shadow is tinted to the brand rather than neutral grey. Correct as drawn.
- **`colgroup` widths sum to 900px** against a 1440px container, with an empty
  "trailing flex fill" comment. `table-fixed` absorbs the remainder. Cosmetic.
- **The empty status strip** at the foot of the grid card (lines 371–380) has empty inner
  divs — a placeholder. The real grid must render the `statusMessage` live region
  (`grid.tsx:865`) here, because story 5's per-row delete outcomes report through it and
  dropping it is a silent regression.

## Verified correct

- Row height exactly 32px — `grid-row-h` sets `height`/`min-height`/`max-height: 32px`
- Cell padding 8px horizontal / 4px vertical, `align-middle`
- Buttons 6px radius, cards 8px, no gradient
- Focus ring is a 2px royal-blue ring, not a glow
- 13px cell text, 12px headers and counts, 22px Poppins title, 13px tabs
- Hairline dividers only, no row stripes; hover is a background so nothing reflows
- At-rest headers show label + sort indicator only — CAP-14's core fix holds
- Disabled value input for `is not empty` matches the recorded decision
- No drag handle on condition rows, no "Copy from another view", no Ask AI, no condition groups
- Live count "41 of 226 shown" sits in the toolbar, clear of the popover
- No delete control anywhere on the screen