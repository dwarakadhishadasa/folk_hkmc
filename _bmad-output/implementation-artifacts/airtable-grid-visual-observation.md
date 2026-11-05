# Airtable grid and views — visual observation

Target: `https://airtable.com/appqea9DRLOXqErXb/tbltzdtCmCHf6gJKD/viwSEPxjXAN17fCdv`
(FOLK Chennai → Contacts → Grid view), observed 2026-11-06 at 1440×900 in the
dedicated Airtable Chrome profile.

Method: REA `capture_web_screenshot` for the dark render, then CDP computed-style
and DOM inspection of the live page for both theme token sets. The light values
below come from Airtable's own light custom properties and from toggling the
page's theme class for measurement; the dark values come from the rendered
page. No Airtable control was activated and no Airtable data was changed.

## Measured values

| Surface | Value |
| --- | --- |
| Font | System stack: `-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif` |
| Grid / header row height | 32px |
| Header label | 13px / 500; field glyph 16px in `#91959C` |
| Header background | `#FFFFFF` light, `#1D1F25` dark |
| Header divider | 1px `#D1D1D1` light; `rgba(255,255,255,0.1)` equivalent dark |
| Cell divider | 1px `#DEE1E3` (`hsl(202 10% 88%)`) light; `rgba(255,255,255,0.1)` equivalent dark |
| Cell text | 13px / 400, `#1D1F25` light, `#FFFFFF` dark |
| Row number | 12px, `#616670` light, `#91959C` dark |
| Row hover / active row | `#F8F8F8` light, `#060606` dark |
| Selected row | `#F1F6FF` light, `#083065` dark |
| Sidebar selected item | `rgba(0, 0, 0, 0.05)` light, `rgba(255,255,255,0.05)` dark |
| Active cell | 2px control-blue outline, inset |
| View sidebar | 280px wide; 48px header; 32px rows; selected row `rgba(0, 0, 0, 0.05)` |
| View-bar controls | 26px high, borderless, 3px radius, 13px / 400, icon 16px |
| Control hover | neutral `#F2F4F8` (light) / raised neutral (dark) |
| Active control | `#C4ECFF` fill, `#041D2D` ink; dark: `#272F33` fill, `#88DBFF` ink |
| Select / linked pill | 22px high, fully rounded, 13px, 10px horizontal padding, tinted fill, no border |
| Footer | 13px, `#616670` light / `#91959C` dark, above a 1px cell-coloured rule |

## What this changed in the app

The desktop grid now takes the system stack and the values above through
`[data-grid-root]` / `[data-grid-views-bar]` variables in each app's
`app/globals.css`. The grid frame is full-bleed instead of a rounded card, the
saved views are a 280px sidebar beside the grid, the view bar controls are
right-aligned 26px controls with the search at the trailing edge, the header
shares the cell surface and is separated by `#D1D1D1`, read-only values use the
same ink as typed ones, pills are 22px full-radius, and the footer uses the
reference's neutral ink.

The active row takes the cursor surface (`#F8F8F8` / `#060606`), selected rows
take the blue selection tint (`#F1F6FF` / `#083065`), and the sidebar keeps its
neutral selected item. The open editor keeps the card surface while the rest of
its row stays on the cursor colour.

The sidebar's view name and chevron open that view's actions — rename,
duplicate, copy link, delete — with no separate three-dot button. A 32px,
6px-radius hamburger sits 12px inside the chrome's leading edge and stays at
that same offset in both states: inside the sidebar header when open, and over
the view bar when closed, with the view name beside it. Its label flips between
"Close list of views" and "Open list of views". The sidebar animates to zero
width over 150ms while the grid takes the full width, and the preference
persists in `localStorage` as `{version: 2, shouldExpandOnBaseOpen}` under
`hkmc.contacts.viewSidebarConfig`.

## Cell editing

Measured on a live Phone cell:

| Property | Value |
| --- | --- |
| Active cell | 2px control-blue inset shadow |
| Editing cell | 1px control-blue inset shadow; row stays 32px |
| Cell box while editing | padding `0`; the input carries the padding |
| Input | padding `6px`, border `0`, transparent over the cell; 13px / 19.5px |
| Openers | double-click, `Enter`, and the first printable character |
| Caret | at the end on `Enter` and double-click; after the replacing character on type-to-edit |
| Commit | `Enter` moves down, `Tab` moves right, blur commits where clicked |
| Cancel | `Escape` |
| Row hover | `#F8F8F8` light, `#060606` dark; the editing cell keeps the card surface |

Our implementation uses the same outer/inner padding split (`td` `px-0` while
editing, input `p-1.5`), the 2px/1px ring split, caret-at-end focusing, and
type-to-edit seeded with the first character. `Enter` commits and steps down,
`Tab` commits and steps right, `Escape` discards.

## Deliberate divergences

These are product or test contracts, not missed details:

- **No new Airtable features.** Group, color, share and row-height controls,
  the add-record ghost row, the "Find a view" input, and non-grid view types
  remain unbuilt. The sidebar lists the saved views the product already has.

## Mobile

The phone contacts list and overview are separate surfaces and were not
touched. The token block is scoped to `[data-grid-root]` and
`[data-grid-views-bar]`, both desktop-only. Before/after screenshots at
390×844 and 768×1024 compare pixel-identical.
