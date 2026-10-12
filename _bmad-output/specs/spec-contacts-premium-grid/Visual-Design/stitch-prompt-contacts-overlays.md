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
- Surface: White (#FFFFFF) — toolbar, popovers and the grid sit on white
- Primary / CTA: Royal Blue (#0F1E54), hover #1A2D6D
- Accent, used sparingly for active state only: Saffron (#F98B1C)
- Text: Charcoal (#24324A)
- Secondary text: Slate (#4A5568)
- Hairline borders: a single soft grey-blue, 1px (#E2E8F0), used for every divider
- Error: a restrained red (#DC2626), used only for a rejected save

Use royal blue as the one strong brand weight. Do not introduce additional brand colors.
Do not color-code values, options or tags — every cell reads as text on a surface.

Typography:
- Font: Inter for everything; Poppins for the page title only.
- Page title: 22px, semibold. Toolbar and menu labels: 13px, medium weight.
- Column headers: 12px, semibold, uppercase tracking, muted slate.
- Cell text: 13px regular. Counts and secondary metadata: 12px, regular, muted.

Component styles:
- Buttons: 6px corner radius, 1px hairline border on secondary, solid royal blue fill on
  primary. No shadows. No gradients.
- Inputs and select controls: 6px corner radius, 1px hairline border, 32px tall, white fill.
  Focus is a 2px royal blue ring, not a glow.
- Cards: 8px corner radius, white fill, 1px hairline border, no drop shadow.
- Popovers and menus are floating overlays: a soft shadow tinted to the brand is correct
  here, and is the only shadow in the system.
- Pills and chips: avoid entirely.

Density: rows are 32px tall. Cell padding is 8px horizontal, 4px vertical. This density is
intentional and must not be relaxed.

=== SCREEN DETAILS ===

Screen: Toolbar overlays for the Contacts grid
Purpose: The three floating surfaces that hang off the contacts toolbar and the column
headers — sort, field visibility, and the column menu.
User context: An operator tidies their working view before starting the day's list, and
occasionally sorts a column they are reading.

Show the approved Contacts screen as the background, with the grid visible behind each
overlay. Draw the overlays in their open state. You may show all three in one composition
side by side, clearly separated, or three times if that reads more clearly — but each must
look anchored to a real control on the bar.

--- SURFACE 1: GLOBAL SORT POPOVER ---

Opens from a **Sort** control in the toolbar, with a sort icon and the label "Sort".

Contents, top to bottom:

- A small muted heading: "Sort by"
- A select showing "Name ▾" — the field being sorted
- A second select showing "Ascending ▾" — the direction
- A quiet text button at the bottom left: "Clear sort"

The two selects are stacked full width of the popover, 32px tall, with a hairline between
them. The popover is about 240px wide.

**This is the only sort control in the product.** The column headers are NOT buttons and
must be drawn as plain labels with a sort indicator only.

--- SURFACE 2: HIDE FIELDS POPOVER ---

Opens from a **Hide fields** control in the toolbar, with a column/grid icon and the label
"Hide fields".

A short muted heading: "Fields". Below it, a single scrollable list of fourteen rows, each
32px tall, each row being: a checkbox on the left, then the field name. The list is in this
order, and the ticks must match exactly:

  [x] Name
  [x] Phone
  [x] Location
  [ ] Source
  [ ] Books Read
  [x] Initial Contact
  [ ] Date of Birth
  [x] Total Attendance
  [x] Past 60 Days
  [ ] Last Contacted On
  [x] Notes
  [x] Collected By
  [ ] Favorite
  [x] Actions

Nine ticked, five unticked. Tick boxes are 16px, royal blue when ticked, 1px hairline when
not. Field names are 13px charcoal; unticked rows are NOT dimmed — they are simply unticked,
because the operator can turn any of them on.

The popover is about 260px wide and tall enough to show all fourteen rows without scrolling.

**Two rows cannot be unticked.** Draw their checkboxes ticked and visibly unavailable —
muted, and not interactive:

- **Name** — the pinned identity column; scrolling right must never lose the row's identity.
- **Actions** — it holds each row's delete control. Hiding it would leave an operator with no
  way to delete anything and no way to get it back.

--- SURFACE 3: COLUMN MENU ---

Opens from a small "···" control that appears on a column header when the pointer is over
it. Anchor it to the **Location** header.

Exactly four items, in this order, each 32px tall with a small leading icon:

  Sort ascending
  Sort descending
  Hide column
  Filter

Nothing else. No "Move left", no "Move right", no colour options, no duplicate, no rename.

The first two items open the sort popover from SURFACE 1, pre-filled so that both the field
and the direction are already set. "Hide column" turns off that column's visibility in the
same list as SURFACE 2. "Filter" opens the conditions popover, which is not drawn here.

The menu is about 200px wide, white, 8px radius, 1px hairline, soft brand-tinted shadow.
A hairline separates the two sort items from the two action items.

=== CURRENT STATE NOTES ===

The attached approved Contacts design is the visual reference. Match its header, tab row,
toolbar band, grid and colours exactly — these overlays are part of that same screen.

The attached screenshot of the current grid shows what is being fixed. Do NOT copy its
visual style.

- The current grid shows a funnel AND a three-dot menu on every column, permanently. At
  rest a column header must show only its label and a sort indicator; its menu appears on
  hover and on keyboard focus.
- The current toolbar has a "Columns" control. That is replaced here by "Hide fields", and
  a "Sort" control is added. There is no view dropdown.

=== GENERATION INSTRUCTIONS ===

Generate the three overlay surfaces described above, matching:
- The visual identity, density and component style of the attached approved Contacts design
- The exact labels, wording and tick states listed above
- Each overlay anchored to a real control, with the grid still visible behind it

Viewport: Desktop 1440px