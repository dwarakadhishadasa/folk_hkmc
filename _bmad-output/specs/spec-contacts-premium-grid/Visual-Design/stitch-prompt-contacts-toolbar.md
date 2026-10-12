=== PROJECT CONTEXT ===

App: FOLK Chennai — church program operations console for managing a youth program
Target: Program coordinators and volunteers who manage several hundred contacts daily.
Brand feel: Calm, trustworthy, institutional. Premium enterprise software, not a consumer app.
Market: India (Chennai), staff-facing operations tool.

This is an internal operations tool. It should feel like professional software an
administrator trusts all day — dense, legible, unhurried. It should NOT feel like a
marketing page, and it should NOT feel playful.

=== DESIGN SYSTEM ===

Colors:
- Background: Ivory (#FFF9F0) — warm off-white page canvas
- Surface: White (#FFFFFF) — toolbar, filter bar and grid sit on white cards
- Primary / CTA: Royal Blue (#0F1E54), hover #1A2D6D
- Accent, used sparingly for active state only: Saffron (#F98B1C)
- Text: Charcoal (#24324A)
- Secondary text: Slate (#4A5568)
- Hairline borders: a single soft grey-blue, 1px, used for every divider
- Error: a restrained red, used only for a rejected save

Use royal blue as the one strong brand weight. Do not introduce additional brand colors.
Do not color-code values, options or tags — every cell reads as text on a surface.

Typography:
- Font: Inter for everything; Poppins for the page title only.
- Page title: 22px, semibold, tight tracking
- Tab labels and toolbar labels: 13px, medium weight
- Column headers: 12px, semibold, uppercase-ish tracking, muted slate
- Cell text: 13px, regular
- Counts and secondary metadata: 12px, regular, muted

Component styles:
- Buttons: 6px corner radius, 1px hairline border on secondary, solid royal blue fill on
  primary. No shadows. No gradients.
- Inputs and select controls: 6px corner radius, 1px hairline border, 32px tall, white fill.
  Focus is a 2px royal blue ring, not a glow.
- Cards: 8px corner radius, white fill, 1px hairline border, no drop shadow. This is a
  dense tool; depth comes from hairlines and whitespace, never from shadow.
- Pills and chips: avoid entirely.

Density: rows are 32px tall. Cell padding is 8px horizontal, 4px vertical. Text is
vertically centered. This density is intentional and must not be relaxed.

=== SCREEN DETAILS ===

Screen: Contacts grid — header, toolbar and filter bar
Purpose: Let an operator scan and filter several hundred contacts without losing their place.
User context: The operator opens Contacts each morning, searches, filters to a segment
(e.g. people with no current status), works the list, and returns to the same view tomorrow.

Layout structure:

1. Page header (single compact band, not a tall hero):
   - Left: page title "Contacts", with a small muted metadata line directly beneath it
     reading "226 contacts · 4 locations"
   - Right, aligned to the same optical block: a scope control reading "All locations ▾"

2. Tab row directly beneath, tight to the header — not separated by large whitespace:
   Dashboard · Contacts · Sessions · Attendance · Favorites
   The active tab must be unmistakable at a glance, marked with weight plus a royal blue
   underline. The inactive tabs are muted slate. These five stay in this order.

3. Toolbar band on a white card — one compact horizontal row, all controls left-aligned,
   counts right-aligned. Contains, left to right:
   - Search field with placeholder "Search all columns"
   - A filter button that shows it is active: a saffron dot plus the text "2 filters active"
   - A view label reading "All contacts" with a chevron
   - A "Columns" button
   - A primary "New contact" button in royal blue
   - Right-aligned, muted 12px: "41 of 226 shown"

4. Filter conditions bar directly below the toolbar, also on white, separated by a hairline.
   This bar is always visible when filters are active — it is not a dialog or a popover.
   Content, verbatim:
   - A muted label: "In this view, show contacts"
   - First condition row: the word "Where", then a select "Current status ▾", then a select
     "is empty ▾", then a small trash icon and a drag handle icon
   - Second condition row: a connective select reading "and ▾", then a select "Phone ▾",
     then a select "contains ▾", then a text input with placeholder "Enter a value",
     then a trash icon and a drag handle icon
   - Below the rows, a quiet text button: "+ Add condition"
   - The grid below updates its matching row count live as conditions change.

5. Below the filter bar: the top edge of the data grid. Show only the header row and two
   or three sample rows — the grid itself is already built and is not what you are designing.

Key elements, using this exact wording:
- Metadata line: "226 contacts · 4 locations"
- Scope control: "All locations ▾"
- Active tab: "Contacts"
- Search placeholder: "Search all columns"
- Filter indicator: "2 filters active"
- View label: "All contacts ▾"
- Primary button: "New contact"
- Result count: "41 of 226 shown"
- Filter bar label: "In this view, show contacts"
- Add button: "+ Add condition"
- Column headers visible: Name · Location · Phone · Current status · Last contacted
- Sample row values: "Ramesh Kumar", "Velachery", "+91 98401 23456", empty, "2026-02-14"

Key interactions:
- Primary: typing in Search narrows the result count live, as does composing a filter condition.
- Secondary: "+ Add condition" appends another condition row to the bar.
- The trash icon on a row removes that one condition. The drag handle reorders conditions.
- The connective between rows is "and" — meaning match all conditions. It is one global
  setting for the whole bar, not a per-row choice.

=== CURRENT STATE NOTES ===

The attached screenshot of the current grid is included to show what is being fixed.
Do NOT copy its visual style.

- Column headers currently show a funnel icon AND a three-dot menu button on every single
  column, permanently. This is the main problem. At rest a header must show only its label
  and a sort indicator. Its menu appears only on hover or keyboard focus.
- Column headers currently truncate to "Re...", "S...", "V..." — give columns enough width
  for their labels.
- The toolbar currently shows only search, Columns, density and "500 of 500 in scope".
  It has no active-filter indicator, no view label and no selection count.
- The filter conditions bar does not exist yet.
- Do not alter the grid's hairlines, 32px row height or ellipsis truncation — those are
  already correct and must survive unchanged.
- The attached home page screenshot shows the brand identity. Carry its royal blue, saffron
  and ivory across, but adopt the tighter, flatter, denser treatment described above —
  the home page's generous rounding and soft shadows do not belong in this tool.

=== GENERATION INSTRUCTIONS ===

Generate the Contacts screen described above, matching:
- Layout structure of this document
- Visual identity (royal blue, saffron, ivory) of the attached home page reference
- All content and wording listed above, exactly as written
- The dense, flat, enterprise treatment specified in DESIGN SYSTEM

Viewport: Desktop 1440px