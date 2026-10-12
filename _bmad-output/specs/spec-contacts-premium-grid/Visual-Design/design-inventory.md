# Design asset inventory — spec-contacts-premium-grid

Derived 2026-10-12 after the record-review withdrawal. Maps every capability to its story
and to the design asset it still needs.

## Blocking gap: two decisions have no story

| Capability | Story coverage |
| --- | --- |
| **CAP-17 — One global sort surface** | **zero.** `CAP-17` appears nowhere in `stories.yaml`. |
| **CAP-18 — Default field set** | **zero.** The only match is the Story 9 withdrawal comment. |

Both were decided in this design session (the sort popover and the Hide fields control), and
both are recorded in `SPEC.md` — but no story builds them. `bmad-loop` works the story list,
so **neither will ever be implemented** as things stand. Stories 2 and 7 are the natural
homes: S2 already owns CAP-14's column menu, S7 already owns the toolbar band.

## Coverage map

| Story | Capabilities | Design asset | State |
| --- | --- | --- | --- |
| S1 | CAP-10, CAP-16, CAP-7 | cell editing + save states | **needed** (state matrix) |
| S2 | CAP-13, CAP-14 | column menu, drag affordance, **sort popover** | **needed** |
| S3 | CAP-3, CAP-4 | cell-type samples, linked labels, blank-not-dash | **needed** (state matrix) |
| S4 | CAP-11, CAP-15 | active-cell outline | **needed** (state matrix) |
| S5 | CAP-2 | grid surface, one scroll container | done — screen 1 |
| S6 | CAP-12 | filter popover | **done** — screen 1 |
| S7 | CAP-6, **CAP-18** | toolbar band; **Hide fields control** | partial — Hide fields needed |
| S8 | CAP-1 | page header, tabs, scope | **done** — screen 1 |
| S10 | CAP-8, CAP-9, CAP-16 | recorded visual pass | **needed** (state matrix) |

## Required assets

### 1. Toolbar overlays — prompt written
`stitch-prompt-contacts-overlays.md`. Three surfaces, all anchored to the approved screen 1:

- **Global sort popover** (CAP-17) — field dropdown + direction select
- **Hide fields popover** (CAP-18) — 14 fields, 9 on / 5 off
- **Column menu** (CAP-14) — exactly four items

Stitch-appropriate: these are small, self-contained compositions.

### 2. Grid state matrix — not a Stitch job
`rest · hover · active cell · editing · row selected · range selected · save in progress ·
save failed · empty`.

Story 10 requires a *recorded manual pass* at 1440×900 and 1024×768. That is a grid of
variants of one surface, which is the composition Stitch is weakest at — the workflow file
warns layouts "can be generic", and a state matrix is mostly *not* layout.

**Recommended route: build it in HTML/CSS against the real tokens**, reusing
`contacts-toolbar-stitch-v1-corrected.html` as the base. Every value is then exact rather
than approximated — active-cell ring thickness, hover vs selection vs range tints, the
disabled field control, the error state's hairline and message.

## Already delivered

| Asset | File |
| --- | --- |
| Approved screen 1 | `contacts-toolbar-stitch-v1-corrected.{html,png}` |
| Raw Stitch export (provenance) | `contacts-toolbar-stitch-v1.{html,png}` |
| Deltas vs spec | `screen-1-deltas.md` |
| Review outcome | `review-v1.md` |
| Brand reference | `brand-reference-home-1440x900.png` |
| Current-state baseline | `contacts-current-1440x900.png`, `contacts-current-1024x768.png` |
| Prompt (screen 1) | `stitch-prompt-contacts-toolbar.md` |

## Withdrawn

`stitch-prompt-contacts-record-panel.md` — deleted with CAP-5 on 2026-10-12.