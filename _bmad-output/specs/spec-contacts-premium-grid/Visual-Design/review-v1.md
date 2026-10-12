# Review — Contacts filter design, Stitch variant 1

- **Reviewed:** 2026-10-11
- **Against:** `SPEC.md` CAP-1, CAP-6, CAP-12 · `surface-and-toolbar.md` CAP-1, CAP-6, CAP-12
- **Outcome:** ACCEPTED WITH CHANGES. All three original blocking findings were resolved —
  two withdrawn by review, one reversed by Dwaraka. Spec files updated 2026-10-12.

## Final decisions (Dwaraka, 2026-10-12)

1. **Popover, not an inline bar.** OQ-18 reversed a third time. The popover is anchored under
   the toolbar's filter control, which keeps the live matching-row count visible in the
   toolbar row. Accepted cost, recorded in the spec: the popover covers the grid, so the
   operator cannot watch *which* rows match while composing.
2. **The disabled value control stays.** A greyed control that reads "not applicable" is
   better than one that silently disappears. Carries a real `disabled`/`aria-disabled`.
3. **No drag handle on condition rows.** Because one connective governs the whole list,
   conditions are a set of columns rather than an ordered expression, so reordering cannot
   change the result set. The `⠿` was a transcription artifact from the reference screenshot,
   alongside "Copy from another view", Ask AI and `+ Add condition group`.
4. **One filter indicator, not two.** The toolbar control is both the trigger and the
   indicator — it opens the popover and, when conditions are active, names the columns it is
   filtering in saffron ("Filtered by Name, Phone"). The old two-indicator rule existed to
   compensate for a toolbar that could only show a count; that is withdrawn with the inline bar.

### Spec files updated

| File | Change |
| --- | --- |
| `SPEC.md` CAP-12 | success criteria rewritten for popover, no drag handle, one indicator |
| `SPEC.md` OQ-18 | records all three reversals and why each was made |
| `SPEC.md` OQ-11 | marked superseded by the current OQ-18 |
| `surface-and-toolbar.md` CAP-12 | surface section rewritten; comparison table now has three columns |
| `surface-and-toolbar.md` | ASCII sketch corrected — `⠿` and "Copy from another view" removed, with reasoning |
| `surface-and-toolbar.md` | operator table: value control disabled, not hidden |
| `surface-and-toolbar.md` | "Two filters, two indicators" → "One indicator, and it names the columns" |
| `stories.yaml` Story 6 | "THIS IS AN INLINE BAR, NOT A MODAL" → popover, plus the four decisions |
| `stories.yaml` Story 7 | filter control is a button again and doubles as the indicator |

## What remains open

- **Drag handle** — settled as out of scope.
- **Header-side indicator** — deliberately dropped. Residual recorded: a filtered column
  scrolled out of the horizontal viewport is named but not located. Revisit only if it bites,
  and it must never become a permanently visible control.
- **Screen 2** — record review sheet (Story 9), not yet generated.

## Original blocking findings, for the record

### 1. ~~The filter bar is a popover, not an inline bar~~ — RESOLVED BY REVERSAL

Originally judged blocking against OQ-18. Dwaraka reversed OQ-18 after reviewing the
composition: the popover keeps the count visible because it hangs below the toolbar, which
neutralises the objection that sank the modal. The review conceded that the spec's argument
was tied to a weak toolbar indicator, which this design does not have.

### 2. ~~An empty value input sits next to `Is not empty`~~ — WITHDRAWN

The control is **disabled**, not inert. Withdrawn on review: a greyed control communicates
"not applicable" in a way a hidden one cannot. Now recorded as a deliberate deviation from
CAP-12's original "hidden" wording, with its accessibility obligations.

### 3. ~~No active-filter indicator~~ — RESOLVED IN VARIANT 2

The regenerated design shows **"Filtered by Name, Phone"** in saffron in the toolbar. This
supersedes both the original finding and the spec's two-indicator requirement; see decision 4.

## Blocking — must change

### 1. The filter bar is a popover, not an inline bar

The design renders the conditions as a floating card **over the grid**, with a close `×`.
OQ-18 — RESOLVED by Dwaraka — is explicitly the opposite:

> An **inline bar** above the grid, not a modal.

`surface-and-toolbar.md` CAP-12 repeats it: "It is an inline bar… This is not a dialog or a
popover", and notes `components/ui/dialog.tsx` exists and is **not** used here.

This is not a taste call. The reason OQ-18 overturned the modal is stated in the spec: the
inline bar's whole advantage is that **the grid and the live matching-row count stay visible
while conditions are composed**. A popover covering the grid removes exactly the benefit the
decision was made for, and the `×` implies a dismissible surface an inline bar must not have.

### 2. An empty value input sits next to `Is not empty`

Row 1 renders `Name · Is not empty · [empty input]`. The CAP-12 operator table requires the
value control to be **hidden for the two empty operators**. An inert input beside an
operator that takes no value is a control that does nothing — the specific defect the brief
forbids.

Related: the spec's reference case is `Current status · is empty`, not `Name · Is not empty`.
Worth using, because `is empty` is the condition OQ-20 proved **cannot round-trip the URL**
today (`grid-view-state.ts:130` and `:211` drop zero-length values). The design should show
the operator under most scrutiny.

### 3. No active-filter indicator anywhere

Toolbar shows a plain `Filter` button; no saffron dot, no "2 filters active". Meanwhile
"41 of 226 shown" states that two conditions are narrowing 226 rows to 41.

CAP-12's "Two filters, two indicators" requires the state in **both** places — toolbar *and*
the affected column headers — "or one of them lies". Neither is present here. The saffron
accent is used nowhere in the design, so its "sparingly, for active state only" role is
currently unused.

## Missing

- **Drag handle on condition rows.** The spec's condition row is `Field · operator · value`
  plus `[🗑] [⠿]`. Only trash appears.
- **Header filter indicator.** `Name` and `Phone` are the filtered columns; neither header
  marks itself.
- **Truncated column labels** — visible as `…STATUS`. Flagged as a current-state defect to
  fix; the design repeats it.

## Correct — keep these

- **CAP-1 header.** Title and metadata form one unit; scope control right-aligned to the
  same optical block. Exactly the spec's ask.
- **Tabs.** Five, in order, active one unmistakable via weight + royal blue underline.
- **CAP-6 toolbar band.** Compact single row, controls left, counts right, royal blue
  primary. The hierarchy reads correctly.
- **CAP-14 at rest.** Headers show only label + sort indicator, no permanently visible
  funnel or `···`. This is the fix for the single worst problem in the current build, and
  Stitch got it right without being pushed.
- **Name column visually weighted**, per the success signal.

## Re-prompt guidance

The popover is the one failure worth re-asking for. The prompt already said "always visible
when filters are active — it is not a dialog or a popover" and Stitch produced a popover
anyway; it is a strong default pattern. State it as a layout constraint instead:

- The filter bar occupies its **own full-width row between the toolbar and the grid**,
  pushing the grid down. It does not overlap, float, or overlay anything.
- It has **no close button** and cannot be dismissed — it is a permanent row.
- Render the grid header row **below** it, fully visible, with the live count readable.