# FOLK Campaign — weighted "Assign to" panel (alternate design)

**File:** `campaign-weighted-assign.figcraft` (FigCraft) ·
**Build:** `build_weighted_assign_design.py` ·
**Source of the frame:** `campaign.figcraft` → "Campaign — Assign contacts
(light, desktop only)"

> **Superseded.** The weighted panel is now part of the main design —
> `campaign.figcraft` → "Campaign — Assign contacts (light, desktop only)".
> This file is kept only as the side-by-side study of the panel states (equal
> weights, single caller), and its screen is rebuilt from the main frame, so
> it now carries the same Location / Assigned To / Notes columns.

One new page, **Alternate — Weighted assign**, with three frames:

| Frame | Size | What it shows |
|---|---|---|
| `Assign contacts (light, desktop only) — weighted` | 1440×900 | The whole screen. Weights 5 / 3 / 1 / 1 → 60 / 36 / 12 / 12. The already-assigned note is expanded. |
| `Assign to panel — equal weights (default)` | 408 wide | The panel on its own, right after four callers were added: all weights 1 → 30 / 30 / 30 / 30, no "Reset to equal". |
| `Assign to panel — single caller` | 408 wide | One caller: no stepper, no column headers, no helper text — the row reads "All 120". |

The top navigation, the page title and the left contacts table are **the same
layers** as in `campaign.figcraft`, copied rather than redrawn — including the
footer, "125 of 272 selected" and "Clear all (125)". 125 selected minus the 5
already assigned is the 120 contacts the panel distributes. Because the main
design was rebuilt with this panel, this file is now the side-by-side study of
the panel's other states, not the source of the screen.

---

## The panel

The card stays in the right column (408 wide, 20px padding, 1px border, 12px
radius), top-aligned with the grid card. Top to bottom:

1. **Assign to** — 16px semibold.
2. **Callers** — 14px medium, with the helper line "Higher weight gets more
   contacts. Equal weights split evenly." at 12px muted.
3. A 12px muted column head: **Caller** (left), **Weight** (centred over the
   steppers), **Contacts** (right).
4. One 48px row per caller, hairline dividers between rows:
   - 28px navy circle avatar with white initials, then the full name at 14px
     (truncated with an ellipsis past 146px).
   - A 100×32 stepper — `[ − ]` 32px, `[ 5 ]` 36px and typeable, `[ + ]` 32px.
     Whole numbers 1–10; `−` is muted and inert at 1, `+` at 10.
   - The resulting contact count at 16px semibold, tabular numerals, right
     aligned. A caller who would receive 0 shows a muted "0".
   - A muted `×` to remove the caller.
5. **+ Add caller** on the left (navy, 14px medium); **Reset to equal** on the
   right (muted, 13px) — only while the weights are not all equal.
6. A plain line, no box: an orange warning icon and orange text — "5 selected
   contacts are already assigned and will be skipped." — with a navy **View**
   link. View expands the list of the five contacts and who holds them today,
   then "Reassign them from the Campaign page."
7. A full-width 44px navy button: **Assign 120 contacts**.

The old panel's "Split equally between callers" toggle, the
"120 contacts ÷ 3 callers = 40 each" line, the caller name chips, the
separate orange "already assigned" card and the grey footnote under the button
are all gone.

## The arithmetic

Only unassigned contacts are distributed: **N = selected − already assigned**
(125 − 5 = 120 here).

- Each caller gets `floor(N × weight ÷ total weight)`.
- The leftovers go one at a time to the callers with the largest remainders;
  ties break by higher weight first, then by list order.
- Counts are always whole numbers and always add up to exactly N.

So 120 contacts over weights 5 / 3 / 1 / 1 (total 10) is exactly
60 / 36 / 12 / 12, and four callers at weight 1 split 120 into 30 / 30 / 30 / 30.

Any weight change — the buttons, typing in the field, or the up/down arrow
keys — recalculates every count immediately. A count that changed gets a brief
400ms light-navy highlight. Rows never reorder.

Empty states: with no callers the button is disabled and reads "Add a caller
to assign"; with nothing selected it is disabled and reads "Select contacts to
assign".

## What is designed and what is not

The **frames** are complete: three states, measured, ready to build from.

The **interaction** is specified here rather than wired into the FigCraft
prototype. A FigCraft prototype can set variables and bind them to layers, but
the distribution rule above (floor division plus a largest-remainder pass over
four callers) is arithmetic a prototype expression cannot express, and a
half-wired prototype would lie about the numbers. Build it in the app.

## Rebuilding

```sh
cd _bmad-output/E-Assets/page-designs
python3 build_weighted_assign_design.py .       # -> campaign-weighted-assign.figcraft
```

The script copies `campaign.figcraft`, adds the page, deletes the old panel,
updates the two footer strings and builds the new panel. It never touches
`campaign.figcraft` itself.
