# Contacts Mobile — Figma build prompt

**What this is.** The prompt below builds the **Contacts** surface of the HKMC
staff portal in Figma, reproducing the Airtable mobile application's
"Admin Portal → Contacts" interface page in HKMC's own design language.

**Provenance.** The layout was reverse engineered from Airtable for Android
v7.9.0 (package `com.formagrid.airtable`, base "FOLK Chennai") running on a
Waydroid Android 13 device. Every dimension below was measured off the live
app's accessibility tree, not estimated.

**Reference images.** `_bmad-output/E-Assets/figma/references/` holds seven
**redacted** captures of the source interface — the data is barred, the
interface labels are legible. Attach them as layout reference. They are
redacted on purpose: the originals carry real contact names, phone numbers and
a staff member's name, and those must not enter a design file. The
redaction script is `scripts/redact-airtable-captures.py`.

---

## Copy-paste prompt

```
=== PROJECT CONTEXT ===

App: HKMC — FOLK Chennai programme operations. This is the Contacts surface of
the staff management portal: the list of people a preacher or volunteer follows
up, and one contact's record.
Target: Preachers and volunteers on Android phones; staff on desktop.
Brand feel: Calm, utilitarian, institutional. Dense but never cramped. A tool,
not a consumer app.
Market: India (Chennai). Language: English only. Numbers: en-IN.
Source of truth: the Airtable mobile app's "Admin Portal → Contacts" interface
page, reverse engineered on Android 13 (device 412×915 px @ 180dpi). Every
dimension below is measured, not estimated.

=== DESIGN SYSTEM ===

Colors (use Figma VARIABLES, never raw hex):
- Canvas / card: Ivory #FFFFFF
- Brand / primary: Royal Blue #0F1E54   (app bar, primary actions, active nav)
- Brand light #1A2D6D · Brand dark #0A1640
- Text primary: Charcoal #24324A
- Text secondary: Slate #4A5568
- Surface muted: #F2F2F2
- Hairline border: #E2E8F0
- Accent (saffron) #F98B1C — rare; never for the main CTA
- Success #15803D
- Scrim: #000000 at 40% opacity
- Dark theme: canvas #1F2124 · card #272A2E · text #E9EAEB · muted #32363A ·
  muted text #9DA1A6 · border #3C4045 · the brand band goes #060606

IMPORTANT: the source app used a brand-green app bar (#048A0E). DO NOT USE
GREEN. The app bar in this design is Royal Blue #0F1E54.

Typography:
- Headings: Poppins 600/700, tracking -0.01em
- Body, labels, UI: Inter 400/500/600
- Sizes: screen title 22 Poppins 600 · sheet title 15 Poppins 600 · record
  title 22 Poppins 700 · body/labels 13 · column headers 12 · captions 11

Spacing: 4 / 8 / 12 / 16 / 24 / 32
Radii: 6 inputs · 12 sheet top corners · full-round pills
Elevation: one large shadow (0 8 32 rgba(0,0,0,0.18)) on sheets only. No other
shadows anywhere. Separation is a 1px hairline border, never a shadow.

=== ARTBOARD ===

366 × 813 (the source device, converted from 412×915 px @ 180dpi).
Keep the Android system chrome as separate toggleable frames: status bar 28dp
tall, navigation bar 48dp tall.

=== FILE STRUCTURE ===

Page "Contacts Mobile" — the five screens below, one artboard each.
Page "Foundation" — Colors, Typography, Spacing, Effects (as variables).
Page "Components" — the component set listed at the end.
Page "Prototype" — the wiring listed at the end.

=== SCREEN 1 — CONTACTS LIST ===

Layout, top to bottom:
1. Status bar, 28dp, transparent.
2. App bar, 36dp, fill Royal Blue #0F1E54, white content:
   - Left: hamburger icon 24×24, hit target 40×40, 12dp from the left edge
   - Title "Contacts" — Poppins 600 17px, white, 16dp left of the title
   - Right: "End user controls" icon (two horizontal sliders / tune) 24×24,
     hit target 48×48, 15dp from the right edge
3. Search row, 48dp, white:
   - Magnifier icon 16dp, Slate #4A5568, 16dp from the left
   - Text field, no border, placeholder "Search name or phone", Inter 13
4. Column header, 38dp, fill #F2F2F2, 1dp bottom border #E2E8F0:
   - "Name" at x=16, Inter 500 12px, Slate #4A5568
   - "Phone" at x=165, same style
5. Grid — TWO columns, 60 / 40:
   - Name column 0–220dp · Phone column 220–366dp
   - Row height 44dp, 1dp bottom divider #E2E8F0
   - Cell text Inter 13 #24324A, 16dp left padding, vertically centred
   - Every cell is an independent tap target (this is the whole point: a tap
     opens THAT cell's field)
6. Bottom bar, 80dp, white, 1dp top border, one centred magnifier icon 24dp.

Content (placeholder data only — never real names or numbers):
  Anita Sharma | 9XXXXX XXXXX
  Balaji Menon | 9XXXXX XXXXX
  Chitra Iyer  | 9XXXXX XXXXX
  Deepak Rao  | 9XXXXX XXXXX
  Esha Pillai  | 9XXXXX XXXXX

=== SCREEN 2 — FIELD SHEET (over Screen 1) ===

The sheet covers the lower 348dp of the 813dp artboard; above it the list is
dimmed by a 40% black scrim.

1. Scrim, #000000 40%, covering 0–466dp of the artboard. Clicking it closes.
2. Sheet, from 466dp to the bottom, fill #FFFFFF, top corners 12dp radius,
   shadow 0 8 32 rgba(0,0,0,0.18).
3. Drag handle: 32×4dp bar, #E2E8F0, horizontally centred, 12dp below the
   sheet's top edge. It is a picture of a handle, not a draggable affordance.
4. "Expand contact": Poppins 600 13px, Royal Blue #0F1E54, horizontally
   centred, 16dp below the handle, 48dp tall hit area. This is the way from
   one field to the whole record.
5. Field label, Inter 500 13px #24324A, x=16, 16dp below the link.
6. Input, 48dp tall, 16dp margins both sides, 1px border #E2E8F0, 6dp radius,
   Inter 13, placeholder = the field label, the value pre-filled.

Example (a tapped Phone cell): label "Phone", input containing "9XXXXX XXXXX".

=== SCREEN 3 — EXPANDED RECORD (over Screen 2) ===

Full screen, #FFFFFF, the sheet still mounted underneath it.

1. Status bar 28dp, transparent.
2. Top bar 36dp, white, 1px bottom border:
   - Left: X icon 24dp, hit target 48×48, 8dp from the left edge
   - Right: NOTHING. The source app had a comment affordance here; this app
     has no comment feature, so the slot is deliberately empty.
3. Scrollable body, 16dp side margins:
   - Name — Poppins 700 22px #24324A, editable, 48dp tall, NO border: it is
     the record's title, not a field among others.
   - Then, 24dp apart, each field = a label above its value:
       label  Inter 500 13px #24324A
       value Inter 13 #24324A

   Fields, in this order:
   - Phone ................... EDITABLE — 48dp input, 1px border, 6dp radius
   - Location ............... EDITABLE — picker trigger, 48dp, 1px border,
                              chevron on the right
   - Notes ................... EDITABLE — textarea 96dp, 1px border, 6dp radius
   - Initial Contact ........ READ-ONLY — plain text value, no control
   - Total attendance ....... READ-ONLY — plain text number, no control
   - Past 60 day attendance . READ-ONLY — plain text number, no control
   - Collected By ........... READ-ONLY — a muted pill (#F2F2F2, full round)
   - Favorite ............... READ-ONLY — plain text "Yes" / "No"

   A read-only field is a value and never a control: an input on a field the
   server will not write invites an edit that is refused.

=== SCREEN 4 — SORT SHEET (over Screen 1) ===

1. Sheet from 227dp to the bottom, #FFFFFF, top corners 12dp, same shadow.
2. "Sort by": Poppins 600 15px #24324A, 16dp left margin, 16dp top margin.
3. Nine radio rows, 48dp each:
   - Label Inter 13 #24324A, 16dp left margin, vertically centred
   - Radio 20dp, right edge 15dp from the sheet's right edge
   - The checked row is "Default"
   - The options, in order: Default (checked) · Name · Phone · Location ·
     TotalAttendanceCount · Past60DayAttendanceCount · Last Contacted On ·
     Notes · Collected By

   These nine labels are the source app's sort sheet verbatim, including its
   raw field names. Keep them exactly — this app has no created-timestamp, so
   "Created" is the source's default and becomes "Default" here.

=== SCREEN 5 — NAV DRAWER (over Screen 1) ===

1. Scrim #000000 40% over the list.
2. Drawer panel, 320dp wide, anchored left, #FFFFFF, full height.
3. Drawer top bar 36dp, Royal Blue #0F1E54:
   - Back chevron 24dp, 8dp from the left
   - "FOLK Chennai" Poppins 600 15px, white
4. Section header, 48dp: a wrench icon 20dp, "Admin Portal" Inter 600 15px,
   and a collapse chevron at the right edge (16dp margin).
5. Five nav items, 32dp tall each, 16dp left text inset:
   - Dashboard · Contacts (selected) · Sessions · Attendance · Favorites
   - A 2dp vertical rule at x=34 spans the nav items, marking them as
     children of the section above.
   - The selected item carries a filled marker (Royal Blue) on the rule.
6. Footer, 64dp, 1px top border: "Go to data" with a database icon on the
   left, "Share" with a share icon on the right, Inter 13.

=== COMPONENTS ===

Build these as components with variants, not as loose frames. Name each
"<Name>.<variant> [cmp-00N]" and put the same id in the component description.

  AppBar.mobile        [cmp-001]  variant: contacts | sort | record | drawer
  ColumnHeader.mobile  [cmp-002]  variant: name | phone
  RowCell.mobile       [cmp-003]  variant: name | phone | empty
  Sheet.field          [cmp-004]  variant: text | notes | picker
  RecordField.label    [cmp-005]  variant: editable | readonly
  SortRow              [cmp-006]  variant: checked | unchecked
  DrawerItem           [cmp-007]  variant: selected | default

Every component gets a description with: when to use, when not to use, its
WDS id, and its accessibility notes (role, accessible name, keyboard).

=== PROTOTYPE ===

1. Screen 1 → tap a Name or Phone cell → Screen 2 (that cell's field)
2. Screen 2 → tap "Expand contact" → Screen 3
3. Screen 3 → tap X → back to Screen 2 (the sheet returns, not the list)
4. Screen 2 → tap the scrim → back to Screen 1
5. Screen 1 → tap the tune icon → Screen 4
6. Screen 1 → tap the hamburger → Screen 5
Use "dissolve" for the sheet and record transitions, 200ms, ease-out.

=== CONTENT RULES ===

- Every name, phone number, location and staff name is PLACEHOLDER. Use the
  names given above and masked phones of the form 9XXXXX XXXXX.
- Do not copy any text out of the attached reference captures. They are
  already redacted; keep them that way.
- One language only: English.

=== GENERATION INSTRUCTIONS ===

Build this as a Figma file, not as an image:

- Every colour, spacing step and radius is a VARIABLE bound to the Foundation
  page. No raw hex in a component.
- Bind every text run to a text style.
- The five screens are artboards on the "Contacts Mobile" page, 366×813, with
  the app bar, sheet and drawer built from the Components above.
- Turn on Auto Layout everywhere: vertical stacks for the screen bodies,
  horizontal for the app bar, the search row, the column header and each
  grid row.
- The grid rows are a two-column auto-layout: 60% / 40%, the Name cell first.
- The sheet and the drawer are components that overlap their parent screen —
  place them in the prototype, not baked into the screen artboards.
- Dark theme: add a matching set of the five screens on a second page using
  the dark tokens above.

Deliverables: the Figma file, plus a one-page spec note listing each
component's id, its variants and its accessibility contract.
```

---

## Source measurements

Every figure in the prompt came from the live app's accessibility tree on the
Waydroid device. The raw values, for anyone checking the arithmetic:

| Element | px | dp (÷180dpi × 160) |
|---|---|---|
| Screen | 412 × 915 | 366 × 813 |
| Status bar | 0–32 | 28.4 |
| App bar | 32–104 | 35.6 |
| Column header | 104–147 | 38.2 |
| Row | 147–196 | 43.6 |
| Name column | 0–247 | 219.6 |
| Phone column | 247–412 | 146.4 |
| Bottom bar | 771–861 | 80 |
| Sheet top edge | 524 | 465.8 |
| Drag handle | 188–224 × 524–579 | 32 wide |
| "Expand contact" | 126–287 × 585–639 | 48 tall |
| Field label | 18–394 × 725–753 | 16 margins |
| Sheet input | 18–394 × 776–830 | 48 tall |
| Record title input | 18–394 × 109–163 | 48 tall |
| Record field label | 18–394 × 178–198 | 17.8 |
| Record field input | 18–394 × 203–257 | 48 tall |
| Sort sheet top | 255 | 226.7 |
| Sort radio row | 366–420 | 48 tall |
| Sort radio | 341–395 | 15 from right edge |

## Deviations from the source, and why

| Source | Here | Why |
|---|---|---|
| Brand-green app bar `#048A0E` | Royal Blue `#0F1E54` | The Airtable brand is not this app's brand. |
| "Chat with Omni" floating button | omitted | No AI assistant in this product. |
| "Comment" button on the record | omitted | No comment feature; a button that opens nothing is a defect. |
| Search as a bottom-bar magnifier | inline search row under the app bar | The shipped Next.js implementation puts the search where a thumb can reach it. |
| "Created" as the default sort | "Default" | No created-timestamp on this app's contacts; the label would promise a sort the app cannot do. |
| Record fields: Name, Phone, Total Sessions Attended, Last 2 months sessions attended, Came in Touch, Collected By | Nine fields, four editable | The field set and the editability are this product's decision, not the source's. |
| "Expand contact" → record | "Expand contact" → record, then back → sheet | Same chain; the source's back behaviour was not observable, so the sheet is kept mounted and revealed, which is what makes "Expand contact" reversible. |
