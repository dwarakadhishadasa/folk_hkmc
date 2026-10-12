---
name: Vibrant Youth Operations
colors:
  surface: '#f9f9ff'
  surface-dim: '#ccdaf9'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e8eeff'
  surface-container-high: '#dfe8ff'
  surface-container-highest: '#d6e3ff'
  on-surface: '#0d1c33'
  on-surface-variant: '#45464f'
  inverse-surface: '#233149'
  inverse-on-surface: '#ecf0ff'
  outline: '#767680'
  outline-variant: '#c6c5d1'
  surface-tint: '#4e5b94'
  primary: '#000832'
  on-primary: '#ffffff'
  primary-container: '#0f1e54'
  on-primary-container: '#7a87c3'
  inverse-primary: '#b8c4ff'
  secondary: '#914c00'
  on-secondary: '#ffffff'
  secondary-container: '#fe8f21'
  on-secondary-container: '#643300'
  tertiary: '#250001'
  on-tertiary: '#ffffff'
  tertiary-container: '#4f0003'
  on-tertiary-container: '#ff423b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c4ff'
  on-primary-fixed: '#05164d'
  on-primary-fixed-variant: '#36437a'
  secondary-fixed: '#ffdcc4'
  secondary-fixed-dim: '#ffb77f'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6f3900'
  tertiary-fixed: '#ffdad6'
  tertiary-fixed-dim: '#ffb4ab'
  on-tertiary-fixed: '#410002'
  on-tertiary-fixed-variant: '#93000b'
  background: '#f9f9ff'
  on-background: '#0d1c33'
  surface-variant: '#d6e3ff'
typography:
  headline-lg:
    fontFamily: Poppins
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Poppins
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Poppins
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Poppins
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system drives an administrative and logistical operations console for large-scale church youth programs, fellowship activities, and operational coordination. 

The aesthetic is crisp, structured, and modern administrative: combining high-density functional enterprise layouts with a grounded, warm, and uplifting spiritual dignity. Visual clutter is stripped away to honor rapid execution, attendance roll-calls, transport tracking, session scheduling, and mentor assignments. 

The interface avoids cold, unfeeling corporate neutrality by resting on an inviting warm ivory substrate, highlighted with royal blue authority and energized sparingly by saffron spiritual vitality.

## Colors

The palette balances warm traditional community tones with authoritative operational utility:

- **Canvas Background (`#FFF9F0` - Ivory):** The foundational layer across the entire console, providing warmth, reducing screen fatigue, and softening stark contrast.
- **Surface Layer (`#FFFFFF` - Crisp White):** Dedicated to data cards, tables, panels, floating popovers, and elevated modal surfaces to ensure maximal data legibility.
- **Primary Brand / Action (`#0F1E54` - Royal Blue):** Primary navigation, interactive controls, decisive action buttons, and dominant headers. States: Default `#0F1E54`, Hover `#1A2D6D`, Active `#0A153D`.
- **Accent Indicator (`#F98B1C` - Saffron):** Employed strictly as a high-visibility, warm accent for active navigation indicators, key status tags, live attendance badges, and urgent highlights.
- **Hairlines & Dividers (`#E2E8F0` - Soft Grey-Blue):** Strict 1px structural grid lines, table cell boundaries, and subtle enclosure borders.
- **Typography Charcoal (`#24324A`):** Dominant text, high-legibility numerical readouts, and primary table data.
- **Typography Slate (`#4A5568`):** Secondary metadata, helper text, inactive column headers, and breadcrumbs.
- **Alert / Destructive (`#DC2626` - Crimson Red):** Warnings, emergency attendance flags, cancellation actions, and destructive confirmations.

## Typography

The typography strategy leverages two precise typefaces:

- **Page Titles & Module Headings:** Set in **Poppins Semibold (600)** strictly for primary section anchors, console page titles, and modal headers. It infuses structural personality and warmth into an otherwise dense utility workspace.
- **Interface, Data, & Operational Copy:** Set in **Inter** across regular (400), medium (500), and semibold (600) weights. Its tall x-height, clear numerical distinctions, and compact tracking enable high scan rates across large data sets, audit logs, and dense operational tables.

Monospaced numbers should be enabled (`font-variant-numeric: tabular-nums`) across all numerical records, phone directories, roll-call counts, and timestamp logs to avoid visual jitter during real-time updates.

## Layout & Spacing

The layout model is optimized for high-information density on enterprise desktop workstations while scaling cleanly down to field-ready tablets:

- **Desktop (1024px+):** Fixed 240px operational left sidebar for primary modules, paired with a fluid central workspace constrained to a maximum content width of 1600px. Standard gutters between modules are 16px (`1rem`), with 24px (`1.5rem`) outer canvas margins.
- **Data Densification:** In high-velocity data surfaces (e.g., live registration, transportation routes), gutters tighten down to 8px (`gutter-dense`) to maximize vertical and horizontal information real estate.
- **Mobile / Field Tablet (Breakpoints below 1024px):** Sidebar collapses into a slide-over panel. Margins drop to 16px (`1rem`). Data grids convert into stacked composite cards with inline badges.

## Elevation & Depth

Visual hierarchy is maintained primarily through structured 1px hairlines (`#E2E8F0`) and solid white surface tiers against the ivory canvas (`#FFF9F0`). 

To avoid the sterile feel of harsh drop shadows while preserving clear layer separation:
- **Base Containers & Cards:** Flat white `#FFFFFF` bounded by a 1px `#E2E8F0` stroke. Zero drop shadow to ensure fast rendering and clean data boundaries.
- **Floating Overlays & Menus:** Layered popovers, filter menus, user action pickers, and tooltips utilize a soft, brand-tinted ambient shadow: `0 4px 16px -2px rgba(15, 30, 84, 0.08), 0 2px 6px -1px rgba(15, 30, 84, 0.04)`.
- **Modals & Drawers:** High elevation surfaces feature an intensified blue-tinted elevation shadow: `0 12px 32px -4px rgba(15, 30, 84, 0.14), 0 4px 12px -2px rgba(15, 30, 84, 0.06)`, anchored against a backdrop overlay of `rgba(15, 30, 84, 0.4)`.

## Shapes

The interface embraces a compact, restrained corner geometry to project precision and structural efficiency:
- **Base Controls & Inputs:** 4px (`rounded-sm`) for text inputs, table action buttons, and small icons.
- **Cards, Modals & Data Panels:** 8px (`rounded-lg`) for parent containers, popover windows, and elevated panels.
- **Status Pills & Indicators:** Full pill (`rounded-full`) exclusively reserved for active counts, category tags, and user presence chips to create clear contrast against angular data tables.

## Components

### Data Grid (Core Component)
- **Geometry:** 32px absolute row heights for standard table rows; 36px for sticky table headers.
- **Padding:** Compact cell padding of 8px horizontal, 4px vertical (`padding: 4px 8px`).
- **Borders & Dividers:** 1px horizontal border using `#E2E8F0`. No vertical borders inside row cells; vertical separators exist solely between column headers.
- **Row States:** Default `#FFFFFF`, hover row tint `rgba(15, 30, 84, 0.02)`, selected row background `rgba(249, 139, 28, 0.06)` with a 3px left border accent in Saffron (`#F98B1C`).
- **Header Cells:** Label-md typography (Inter 11px uppercase, bold), colored in Slate (`#4A5568`), with sticky background matching `#FFF9F0` or `#FFFFFF`.

### Buttons
- **Primary:** Royal Blue `#0F1E54` background, `#FFFFFF` text, 4px border radius. Hover: `#1A2D6D`. Active: `#0A153D`. Height: 32px for operational speed; 36px for primary page CTAs.
- **Secondary:** Surface `#FFFFFF`, 1px hairline border `#E2E8F0`, Charcoal `#24324A` text. Hover: `#F8FAFC` background with border `#CBD5E1`.
- **Accent Action:** Reserved for high-value active triggers (e.g., "Check-in Attendee"): Saffron `#F98B1C` fill, `#FFFFFF` text. Hover: `#E0760C`.
- **Destructive:** White surface with 1px `#DC2626` border and text; fills to `#DC2626` with `#FFFFFF` text on hover.

### Inputs & Filters
- **Form Controls:** 32px input height, 1px `#E2E8F0` border, `#FFFFFF` background, 8px horizontal padding, 13px Inter text (`#24324A`). Placeholder text in Slate (`#4A5568`).
- **Focus State:** 1px border `#0F1E54` with a 2px outer focus glow ring of `rgba(15, 30, 84, 0.15)`.
- **Search & Quick-filter Bars:** Integrated inline within table headers with search icon prefix and keyboard shortcut hint badges.

### Chips & Badges
- **Status Badges:** Compact height (20px), font size 11px Inter (600), rounded full.
  - *Active / Present:* Background `rgba(249, 139, 28, 0.12)`, text `#D97706`, with a 6px solid `#F98B1C` dot indicator.
  - *Confirmed / Registered:* Background `rgba(15, 30, 84, 0.08)`, text `#0F1E54`.
  - *Absent / Action Needed:* Background `rgba(220, 38, 38, 0.10)`, text `#DC2626`.

### Checkboxes & Radios
- **Dimensions:** 14px x 14px square/circle with 1px `#CBD5E1` border.
- **Checked State:** Fill `#0F1E54` with `#FFFFFF` checkmark icon.

### Cards & Metrics Summaries
- **Stat Cards:** 8px rounded corners, `#FFFFFF` surface, 1px `#E2E8F0` border. Padding 16px. Numerical data displayed prominently in tabular Inter 24px bold, with a 2px top border in Saffron (`#F98B1C`) on cards that demand operational attention.