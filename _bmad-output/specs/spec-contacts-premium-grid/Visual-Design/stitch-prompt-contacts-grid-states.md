=== PROJECT CONTEXT ===

App: FOLK Chennai — church program operations console for managing a youth program
Target: Program coordinators and volunteers who manage several hundred contacts daily.
Brand feel: Calm, trustworthy, institutional. Premium enterprise software, not a consumer app.
Market: India (Chennai), staff-facing operations tool.

This is an internal operations tool. It should feel like professional software an
administrator trusts all day — dense, legible, unhurried. It should NOT feel like a
marketing page, and it should NOT feel playful.

=== CRITICAL — MATCH THE ATTACHED DESIGNS EXACTLY ===

Two approved compositions are attached. They are the visual source of truth. Reproduce their
header, their icons, and their colours **exactly**. Do not reinterpret, restyle or "improve"
any of it. This page shows different STATES of the same grid, so anything that differs from
the attachments will read as a different product.

**Top header bar — reproduce exactly:**
- Background royal blue `#0F1E54`, full width, bottom border `#0F1E54`
- Left: the FOLK logo inside a WHITE rounded-full pill (`rounded-full`, white fill, height 44px)
- Centre: a pill-shaped navigation container — `background rgba(27,41,91,0.8)`,
  `rounded-full`, `padding 6px 8px`, a 1px `rgba(255,255,255,0.10)` border, items spaced 4px
- Inside it, four nav items: **Contact · Sessions · Invite · Manage**
- **Manage is active**: white fill, royal blue `#0F1E54` text, `rounded-full`, semibold,
  subtle shadow
- The other three are inactive: `rgba(255,255,255,0.8)` text, no fill, medium weight
- Right: "Dwarakadhisha Dasa (Admin)" at 13px `rgba(255,255,255,0.95)`, then a **Logout**
  button — `rgba(255,255,255,0.10)` fill, `rgba(255,255,255,0.20)` border, white text,
  `rounded-full`

**Icons — use Material Symbols Outlined, 18px, exactly these glyph names:**
  Contact  →  person
  Sessions →  calendar_month
  Invite   →  send
  Manage   →  tune
  Logout   →  logout  (16px)

**Filter icon — the three-line "filter_list" shape, NOT a funnel:**
three horizontal strokes of decreasing length (full width, then shorter, then shortest),
1.5px stroke, round caps. This exact shape appears in the toolbar's "Filtered by Name, Phone"
button in both attachments. A funnel is wrong.

**Column menu icon — three vertical dots** (`MoreHorizontal`), 12px.

**Toolbar (shown once, at the top, exactly as in the attachments):**
Search field with placeholder "Search all columns" · a saffron "Filtered by Name, Phone"
button · a "Sort" button · a "Hide fields" button · right-aligned "41 of 226 shown" ·
a royal blue "New contact" button.

**There is NO "Columns" button and NO view dropdown in this product.**

=== DESIGN SYSTEM — these values are exact, do not substitute ===

Colors:
- Page canvas: Ivory `#FFF9F0`
- Surfaces (toolbar, grid, popovers): White `#FFFFFF`
- Primary / CTA: Royal Blue `#0F1E54`, hover `#1A2D6D`
- Accent, active state only: Saffron `#F98B1C` — never a darker amber, never `#D97706`
- Text: Charcoal `#24324A`
- Secondary text: Slate `#4A5568`
- Hairlines and every divider: `#E2E8F0`, 1px
- Column header surface: `#F8F5EF` (warm off-white, one step down from ivory)
- Row hover: `rgba(74, 85, 104, 0.05)` — a NEUTRAL slate. Never amber, never saffron. Hover
  must not read as an active state.
- Active-cell outline: Royal Blue `#0F1E54`, 1px inset ring
- Cell-range highlight: saffron at 30% opacity
- Error / rejected save: `#DC2626`

Typography: Inter throughout; Poppins for the page title only.
Page title 22px semibold. Toolbar and menu labels 13px medium. Column headers 12px
semibold uppercase with letter-spacing. Cell text 13px regular. Counts 12px regular.

Component styles: 6px corner radius on controls, 8px on cards and surfaces. 1px hairline
borders. No drop shadows except on floating overlays. No gradients. No pills or chips except
the header nav. Radius must NOT grow — these are enterprise controls, not a consumer app.

Density (fixed, this is the point of the page):
- Rows are 32px tall
- Cell padding 8px horizontal, 4px vertical
- Text vertically centred
- Column headers 32px tall

=== SCREEN DETAILS ===

Screen: Grid cell and row states
Purpose: Show every distinct visual state of the same Contacts grid, so the states can be
checked against each other and against the two approved screens.
User context: An operator scans, selects, edits and saves across a day. These are the states
they move between.

Draw **six stacked panels** down one page, each introduced by a small muted label. Every panel
shows the SAME grid — same columns, same three data rows — with only the state changed. Keep
each panel to three or four rows so they stay comparable.

**Use these exact columns and values in every panel:**
  NAME · PHONE · LOCATION · INITIAL CONTACT
  Ramesh Kumar | +91 98401 23456 | Velachery | 2026-02-14
  Anandh Swaminathan | +91 94440 98765 | Mylapore | 2026-02-18
  Deepa Sundaram | +91 97890 11223 | Anna Nagar | 2026-01-29

**Panel 1 — "At rest"**
The baseline. Plain rows, no hover, no selection, no ring. Column headers show their label and
a sort indicator only — no menu dots visible at rest. Row dividers are 1px hairlines, not
striped rows.

**Panel 2 — "Row hover"**
Row 1 has the neutral slate hover tint. Nothing else changes — no colour shift, no border, no
icon appears. Emphasise that the tint is neutral, NOT amber.

**Panel 3 — "Active cell"**
Row 2, the Phone cell carries a 1px inset royal blue ring, 2px inside the cell border. The row
itself is NOT hovered and NOT selected. Show clearly that the active cell is distinct from
both. No editor is open — a single click does NOT open one.

**Panel 4 — "Row selected and cell range"**
Row 3 is selected: a royal blue selection tint plus a selection checkbox ticked on the far
left. In row 2, a block of three cells across Phone → Location → Initial Contact carries the
saffron 30% range highlight. A selected row and a range highlight coexist.

**Panel 5 — "Editing a cell"**
Row 2's Name cell is in edit mode: an input with a 2px royal blue focus ring, the text
"Ramse" mid-typing with a caret. The row is not hovered and not selected. The cell border is
replaced by the focus ring — no double border. A small muted hint line beneath the grid reads
"Enter saves · Escape discards · clicking away also saves".

**Panel 6 — "Save rejected"**
Row 1's Phone cell carries a 1px `#DC2626` border, and the cell value has reverted to
"+91 98401 23456".

The message appears in the **status strip directly above the grid**, described below — NOT
below the table and NOT inside the row. The rest of the grid is untouched: the error belongs
to that one field.

=== THE STATUS STRIP ===

A thin, full-width bar sitting **between the toolbar and the grid**, directly above the
column headers. It exists so a message is visible no matter how many rows the grid holds.

- **When there is no message it is completely absent** — zero height, no empty bar, no
  placeholder. Panels 1 through 5 must show no strip at all.
- **When there is a message it is one line**, 13px, in `#DC2626`, with a 1px `#E2E8F0`
  bottom border and 8px horizontal padding. Height about 28px.
- **It names the record**, because the failing row may be scrolled out of sight and the
  operator still has to know which contact it was.

In Panel 6 it reads, in full:

  **Phone number is already in use by another contact — Ramesh Kumar**

Set "Ramesh Kumar" in the same `#DC2626` but at regular weight, with the reason in medium
weight. A small ✕ icon may precede it. No button, no dismiss control — the strip clears
itself on the next successful save.

This strip is the grid's own live region. It is announced to screen readers when it
appears, and it collapses to nothing when empty.

=== RULES THAT MUST HOLD IN EVERY PANEL ===

- **No colour-coded values.** Every cell reads as text on a surface. No coloured tags, no
  pastel pills, no status chips, no per-option hues.
- **No dashes for empty values.** If a value is empty, leave the cell blank. Never an em-dash,
  a hyphen, "N/A" or "null".
- **Row height never changes** between panels — not on hover, not on selection, not on error.
  No message ever sits inside a row.
- **Error messages never go below the table.** They go in the status strip above the grid.
  With several hundred rows, anything below the table is off-screen and the operator never
  sees it.
- **Column headers never show a menu button at rest.** The three-dot control appears only on
  hover and on keyboard focus.
- **Column headers are not sort buttons.** Sorting happens in the Sort popover in the toolbar.
- Keep the toolbar identical across all six panels. Only the grid changes.

=== GENERATION INSTRUCTIONS ===

Generate the six state panels described above, matching:
- The header, icons, toolbar, colours and density of the two attached approved designs EXACTLY
- The same columns and the same three data rows in every panel, so the panels are comparable
- Only the state changes between panels

Viewport: Desktop 1440px