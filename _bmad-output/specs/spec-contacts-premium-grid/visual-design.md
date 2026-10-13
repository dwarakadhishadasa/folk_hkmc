# Visual design contract

Every capability with a visual surface is implemented **from a named file** in `Visual-Design/`. This file is the binding: which composition, which surface inside it, and which measured values it fixes. It exists because the compositions carry corrections that prose cannot express, and an implementer reading `SPEC.md` alone would rebuild the defects the reviews caught.

**Direction, not pixel spec.** These are reviewed Stitch compositions corrected against the spec. The verification gate is the recorded manual pass at 1440×900 and 1024×768 (CAP-8), not a diff against these files.

## How a story uses this

1. Name the composition in the story. A story that touches a surface with no composition is either a gap here or a decision to ship ungraded.
2. Implement the **values in the table below**, not the pixels. Where a comp and a value disagree, the value wins.
3. A story that changes a value fixed here updates the composition in the same commit. Otherwise the comps become history silently.

## The three approved compositions

| File | Screen | Corrected |
| --- | --- | --- |
| `Visual-Design/contacts-toolbar-stitch-v1-corrected.html` | The Contacts screen: header, tabs, toolbar band, filter popover, grid body | Yes — against `screen-1-deltas.md` |
| `Visual-Design/contacts-overlays-stitch-v1-corrected.html` | The three overlays: sort popover, Hide fields, column menu | Yes — against `review-overlays-v4.md` |
| `Visual-Design/contacts-grid-states-v1.html` | Six cell and row states, plus the status strip | Yes — built in HTML/CSS against the real tokens, not generated |

`Visual-Design/stitch-DESIGN-UNVERIFIED.md` is **DO NOT IMPLEMENT FROM.** Stitch's token write-up contradicts its own render (sidebar, 4px radius, pills, mobile cards). Only its Colors section is accurate.

## Capability binding

| Capability | Composition | Surface in it |
| --- | --- | --- |
| CAP-1 page header, tabs, scope | toolbar | Top navy bar, title block, five tabs with royal-blue underline on the active one, scope control right-aligned |
| CAP-2 grid surface maturity | toolbar, grid-states | The grid card; exactly one scroll container; hairline dividers, no row stripes |
| CAP-4 linked-record labels | grid-states | `Location` cells render a name |
| CAP-6 toolbar band | toolbar, overlays | `Search · Filtered by · Sort · Hide fields · count · New contact` |
| CAP-7 edit safety | grid-states | Panel 6, save rejected |
| CAP-10 edit activation | grid-states | Panel 5, editing a cell |
| CAP-11 active cell | grid-states | Panel 3 |
| CAP-12 filter conditions | toolbar | The popover anchored under the Filter control |
| CAP-14 header affordance | overlays | The four-item column menu; label + sort indicator only at rest |
| CAP-15 cell and grid metrics | grid-states, toolbar | The `.grid-cell-standard` rules |
| CAP-16 interaction boundaries | grid-states | Panels 1–6 as distinguishable states |
| CAP-17 one global sort surface | overlays | The sort popover: field dropdown + direction select + Clear sort |
| CAP-18 default field set | overlays | The Hide fields popover, all fourteen fields, 9 checked |
| CAP-19 delete stays | overlays | The `Actions` column and the red bin |

## Three capabilities have no composition — a recorded gap

| Capability | What is missing |
| --- | --- |
| **CAP-3** type-keyed cell renderers | No comp shows text / select / multiselect / date / number / boolean side by side. `contacts-grid-states-v1.html` renders four columns of one type. Renderer distinctions are currently undiscoverable from the design. |
| **CAP-4** unresolved marker | The comps show resolved labels only. The visibly-unresolved marker CAP-4 mandates has no reference. |
| **CAP-13** column drag | Zero `drag` / `grip` / `⠿` occurrences across all three comps. The drag affordance has never been composed. |

Do not invent these by extending a comp. They are unimplemented decisions and belong in a composition first.

## The values the comps fix

| Value | Contract | Source |
| --- | --- | --- |
| Row height | **32px**, pinned on the **cell** — `height: 32px` + `padding: 4px 8px` + `line-height: 24px` | `contacts-grid-states-v1.html:59-66` |
| Cell padding | 8px horizontal, 4px vertical (`px-2 py-1`) | corrected in all three comps |
| Cell / header / count text | 13px / 12px / 12px; page title 22px Poppins; tabs 13px | CAP-15 |
| Active cell | `inset 0 0 0 1px` royal blue `#0F1E54` — 1px, inset, not a glow | `contacts-grid-states-v1.html:73` |
| Focus ring | 2px royal blue, not a glow | `screen-1-deltas.md` |
| Row hover | neutral `rgba(74,85,104,0.05)` — never amber, never saffron | `contacts-grid-states-v1.html:67` |
| Row selected | `rgba(15,30,84,0.08)` | `contacts-grid-states-v1.html:78` |
| Cell range | `rgba(249,139,28,0.30)` — saffron at 30% | `contacts-grid-states-v1.html:82` |
| Error cell | 1px `#DC2626`, `outline-offset: -1px` | `contacts-grid-states-v1.html:98` |
| Editing cell | 2px `#0F1E54` outline, 24px tall, 13px text | `contacts-grid-states-v1.html:87` |
| Accent | `--saffron #F98B1C`, active state only | corrected in all three comps |
| Radii | buttons 6px, cards 8px, no gradient | `screen-1-deltas.md` |
| Dividers | hairlines only, no row stripes | CAP-2 |
| Status strip | one line `#DC2626` **between** the toolbar and the grid, zero height when empty, naming the record | `grid.tsx:871` |
| Emphasis | `Name` is the one visually weighted column; everything else is uniform | Success signal |
| Canvas | ivory `#FFF9F0`, surface `#FFFFFF`, royal `#0F1E54`, charcoal `#24324A`, hairline `#E2E8F0` | Tailwind block in the toolbar comp |

## Do not copy these

Every one was a real defect in a generated export.

- **No em-dash in empty cells.** `GRID_EMPTY_TEXT` renders punctuation, not absence. The corrected toolbar comp renders **nothing** — the hairlines and row height delimit the cell.
- **No amber and no `#EA580C`/`#D97706`.** Saffron is the accent. Both exports drifted off-token here; the fixed form is `text-#F98B1C` / `bg-#F98B1C/10` / `border-#F98B1C/30`.
- **No amber row hover.** Saffron and amber are the same hue family, so an amber hover makes a passive row look activated.
- **No `#F8FAFC`, no `slate-50` as a surface.** Reach for `--muted`. `#F8FAFC` is cool; `--muted` is warm (hue 90) and the ivory canvas is warm.
- **Header menu reveals on `:focus-within` as well as `:hover`,** and stays in the tree at rest (`opacity-0`, never `display: none`), as a real `<button>` with an accessible name. It must never be a bare `<span>`.
- **Name and Actions are `disabled`** in the Hide fields list — `cursor-not-allowed`, muted, and carrying a lock.
- **The value control under `is empty` / `is not empty` is disabled, not hidden,** and carries `disabled`/`aria-disabled`.
- **No drag handle on condition rows,** no "Copy from another view", no Ask AI, no condition groups.
- **At-rest headers show label + sort indicator only.** No permanently visible funnel or `···`.
- **The `statusMessage` live region renders above the grid, not below it.** The toolbar comp carries a placeholder strip at the foot of the card — that is the wrong end.

## Two comp-fidelity gaps that must not be copied

**1. Row height is pinned on the `<tr>` in the toolbar comp.** `contacts-toolbar-stitch-v1-corrected.html` still uses `border-collapse` (line 215) and applies `.grid-row-h { height/min-height/max-height: 32px }` to the row, so it renders **33.5px**. Measured in Chromium and recorded in `review-overlays-v4.md`: in a CSS table `height` is a minimum, `max-height` does not apply to `<tr>` or `<td>`, and `border-collapse: collapse` costs a further pixel. The overlays and grid-states comps carry the fix — `border-separate border-spacing-0` plus the height on the cell. **Copy the table structure from the overlays or grid-states comp, never from the toolbar comp.** The shipped grid already does this.

**2. One comp draws a column that does not exist — in the grid body only.**

> **Never build a column from a comp.** `Current status` is drawn in both corrected comps' **grid body** and **is not a field** — it is absent from `lib/supabase/types.ts` and from the fourteen at `manage-contacts-table.tsx:820-1010`. `stitch-prompt-contacts-toolbar.md:101` asked for it and Stitch drew it faithfully. The same prompt line shows `Last contacted`, which CAP-18 hides for the OQ-16 reason.

**The Hide fields popover is correct and needs no correction.** Counted in `contacts-overlays-stitch-v1-corrected.html`: **7 checked** (Phone, Location, Initial Contact, Total Attendance, Past 60 Days, Notes, Collected By) + **2 locked** (Name, Actions) = **9 visible**, and **5 unchecked** (Source, Books Read, Date of Birth, Last Contacted On, Favorite). That is CAP-18's nine-of-fourteen, exactly. Whoever wrote the prompt got the field list right and the grid body wrong.

So the divergence is **narrower than it looks**: it is confined to the rendered headers in the body, which is a width and density question. Take the **column set from CAP-18**; take row rhythm, hairlines, density, padding, toolbar proportions, overlay geometry and state appearance from the comps. See OQ-22, which records the decision and the cost of making it.

## Supersedes

`Visual-Design/design-inventory.md` is **superseded by this file.** Its capability→story→asset map is absorbed above. Its claim that CAP-17 and CAP-18 have zero story coverage is **stale** — `stories.yaml` covers both as of 2026-10-12. Kept in the folder as provenance; do not plan from it.

`Visual-Design/review-v1.md`, `review-overlays-v4.md` and `screen-1-deltas.md` are **fully absorbed here** and are audit-only from here. `Visual-Design/stitch-prompt-*.md` are the prompts that produced the comps.