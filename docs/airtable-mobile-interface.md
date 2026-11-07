# Airtable Mobile Interface — Reference

## Overview

[`airtable-legacy-base.md`](./airtable-legacy-base.md) documents the Airtable
**base** and the **desktop web** interface built on it, captured through a
browser session and a HAR. This document documents the **mobile application** —
the same base, the same "Admin Portal" interface, rendered by Airtable for
Android — because the mobile app renders that interface *differently* from the
desktop one, and the difference is the part worth having.

Everything here was observed on **2026-10-21** against Airtable for Android
**v7.9.0** (version code 384, package `com.formagrid.airtable`), running on a
**Waydroid Android 13** device (x86_64, 412×915 px at 180 dpi). The app was
already signed in and already showing the base, so no credential was used and
none was needed.

PII-free, like its sibling document: **no record values, no contact names, no
phone numbers, no staff names and no record ids are included.** Where a screen
had to be described with a value in it, the value is described by its *kind*.

The observation method, and its limits, are in §7.

## The finding that matters

**The mobile app renders the desktop interface as a three-level stack, and it
gives every cell its own tap target.**

The desktop interface is a canvas: a list beside a detail pane, read-only
throughout. The mobile app takes the same interface and renders it as:

```
list  →  field sheet  →  expanded record
```

Each level is a full screen, and the transition between them is a dismissal,
not a navigation. Tapping a cell does **not** open the record — it opens a
sheet holding *that one cell's* editor, and the sheet's only way onward is an
**"Expand contact"** action that opens the whole record over it.

That is a different interaction model from the desktop one, and it is the
reason the mobile app is worth reverse engineering separately rather than
reading off the web capture: the web capture could never have shown the
per-cell edit affordance, because the web interface had none.

## 1. Navigation

The drawer's shape is base → interface → pages:

| Level | Observed |
|---|---|
| Base | `FOLK Chennai` |
| Interface | `Admin Portal` (a section header, collapsible, with a wrench glyph) |
| Nav pages | `Dashboard`, `Contacts`, `Sessions`, `Attendance`, `Favorites` |

The drawer's footer carries **`Go to data`** and **`Share`**. `Go to data`
switches from the interface to the base's raw table view — which is a
*different* surface, and a good one to know about, because it is where the
base's own field names are visible.

**Only five of the bundle's eleven pages are in the drawer's nav.** The web
capture recorded eleven (`docs/airtable-legacy-base.md`); the mobile drawer
shows five. The other six are reachable only by navigation, not by the nav
list. Which five, and what became of the other six, is not established.

## 2. The Contacts page

The interface's `Contacts` page, as the mobile app renders it:

| Element | Observed |
|---|---|
| App bar | 36dp, brand green, title `Contacts`, left hamburger, right **"End user controls"** |
| Column header | 38dp, muted fill, labels `Name` and `Phone` |
| Grid | Two columns, **60 / 40** |
| Row | 44dp, hairline divider, 13px text |
| Cell | **Independently tappable** — the tap target is the cell, not the row |
| Bottom bar | 80dp, one centred magnifier |
| Floating action | A dotted green circle, `Chat with Omni` |

Only two of the Contacts table's fields are on this page. The record's other
fields are reached through the stack, not the grid.

### "End user controls"

The right-hand app-bar control opens a popover with **one** item: `Sort`. It
is the Airtable app's view-configuration affordance, and it is nearly empty on
this page.

`Sort` opens a second sheet: a radio list of **nine** sortable fields, with
`Created` checked as the default:

```
Created (Default) · Name · Phone · Location · TotalAttendanceCount
Past60DayAttendanceCount · Last Contacted On · Notes · Collected By
```

Two things in that list are worth recording. First, it names fields by their
**raw Airtable names** — `TotalAttendanceCount`, not the label the record view
prints for the same field. Second, `Last Contacted On` is there but `Status`
and `Next Follow-up` are not, which independently corroborates the web
capture's finding that those two fields have **zero bindings across all
eleven pages** of the bundle.

## 3. The field sheet

Tapping a cell opens a bottom sheet. Its shape, from the accessibility tree:

| Element | Observed |
|---|---|
| Scrim | 40% black over everything above the sheet |
| Sheet | From 466dp to the bottom, 12dp top corners |
| Drag handle | 32×4dp, centred, 12dp below the sheet's top edge |
| Action | **`Expand contact`** — blue, centred, 48dp hit area |
| Field label | 13px, 16dp margins |
| Field editor | 48dp tall, bordered, the value pre-filled |

The sheet is the Airtable mobile app's **cell editor**. It is the thing the
desktop interface has no equivalent of.

**The drag handle is decorative.** It is a drawn bar, not a draggable
affordance, and the sheet is dismissed by its scrim, by `Escape`, or by the
list behind it.

## 4. The expanded record

"Expand contact" opens a full-screen record. Its frame is the Airtable mobile
one: an **X** at the left, a comment affordance at the right, and then a
**label over a value** stack — not the desktop interface's side-by-side pair.

The fields it rendered, in order:

| Label as rendered | Kind |
|---|---|
| *(the name itself, bold and large, as the record's title)* | primary field, editable |
| `Phone` | text, editable |
| `Total Sessions Attended` | a number, read-only |
| `Last 2 months sessions attended` | a number, read-only |
| `Came in Touch` | a date, with a calendar quick-action |
| `Collected By` | a linked record, read-only |

### The labels are not field names

**This is the finding that ties the two captures together.**

`Total Sessions Attended`, `Last 2 months sessions attended` and `Came in Touch`
are **not** the base's field names. The base calls them `TotalAttendanceCount`,
`Past60DayAttendanceCount` and `Last Contacted On` — names the mobile app's own
sort sheet uses, verbatim, in the same session.

So the mobile app prints one name in one place and another in another, on the
same screen, about the same field. The difference is **where the label comes
from**:

| String | Where it lives | Evidence |
|---|---|---|
| `Sort by`, `End user controls`, `Drag handle`, `Date quick actions`, `Go to data`, `Open interface`, `Close sheet`, `Chat with Omni` | **Shipped in the app** | present in the APK's compiled `resources.arsc` |
| `Total Sessions Attended`, `Last 2 months sessions attended`, `Came in Touch`, `Expand contact`, `Admin Portal`, `Grid view` | **Server-driven** | absent from the APK's `resources.arsc` *and* from all 14 `classes*.dex` |

The app ships its own chrome and renders the interface's **labels** from the
server. That is the same conclusion the web capture reached from the other
side — the interface defines what a field is *called* on a page, separately
from what the base calls it — and it is now confirmed from two independent
directions, on two clients, against the same base.

### The comment affordance

The record view's top-right carries a comment button. There is no comment
feature in this app, so the shipped surface omits it rather than carrying a
button that opens nothing.

## 5. "Go to data"

The raw table view is a *different* surface from the interface page, and it is
worth knowing what it showed:

| Element | Observed |
|---|---|
| Toolbar | Base name, `Manage Collaborators`, `Open interface`, `More options` |
| View bar | `Contacts` / `Grid view`, plus a view-configuration toggle |
| Grid header | `Phone`, `Branch`, `Favorite` (the name column scrolled off to the left) |
| Body | **"No visible data — Everything is filtered"** |
| Bottom bar | View switcher, add record, search |

The empty body is not a defect to fix: it is the `Visible To = <the signed-in
staff member>` filter the web capture found, and the signed-in account in this
session simply has no contacts under it. The interface page, which is filtered
differently, was populated.

## 6. What this changed in this repository

The mobile interface's stack is now in the app, as a **contact list** — the
view the `/manage` contacts tab shows on a phone.

| Source (mobile app) | Here |
|---|---|
| Two-column list, every cell tappable | `components/manage/manage-contact-list.tsx` |
| Field sheet with `Expand contact` | `components/manage/manage-contact-sheet.tsx` |
| Expanded record, label over value | `components/manage/manage-contact-record.tsx` |
| Shared field vocabulary | `components/manage/manage-contact-fields.ts` |
| Per-field editor | `components/manage/manage-contact-field-editor.tsx` |

Five decisions differ from the source, and each is a decision rather than an
oversight:

1. **The grid is not replaced — it is the *other* view.** The mobile app's
   list is two columns and the grid is fourteen; a spreadsheet that also
   stacked would be neither. So the contacts tab shows one of the two, and
   the viewport chooses: the grid at 768px and above, the list below it. The
   grid is **not mounted** behind the list, so on a phone none of it reaches
   the accessibility tree or the tab order.
2. **The field set is this product's.** Nine fields — `Name`, `Phone`,
   `Location`, `Notes` writable; `Initial Contact`, `Total attendance`,
   `Past 60 day attendance`, `Collected By`, `Favorite` read-only. The
   Airtable record view's six are not the answer to a question this app asks.
3. **The write path is the grid's.** The list hands a value to the grid's
   own commit handler, so the optimistic update, the request, the rollback and
   the rejection are the grid's. There is one place where a contact is
   written, not two.
4. **A single click does not open an editor.** CAP-10 makes the double-click
   the only gesture that opens one, and the list is a *different* component —
   so it does not reopen what CAP-10 retired. The list's cells are a list,
   and a tap on a list item opens that item's field.
5. **Creating a contact is not offered on a phone.** `+ Add record` is a grid
   control, and the grid is not mounted there. A create flow for the list is
   its own story, not something the detection quietly takes over.

## 7. How it was observed, and what is not established

**Method.** The APK was pulled from the device with `adb` (base + three
splits, digests recorded), then the app was launched and driven through
`adb shell input tap` and `adb shell uiautomator dump`. Every dimension in this
document is a bound from an accessibility-tree dump, and every colour is
sampled from a `screencap` frame. The screenshots were **redacted** before
being kept, because they carry real contact names, phone numbers and a staff
name; `scripts/redact-airtable-captures.py` bars the data and leaves the
interface labels legible.

**Not established:**

- The **six nav pages** that are not in the drawer — what they are and whether
  they exist on mobile.
- The **`Chat with Omni`** floating action — an AI affordance with no
  counterpart here, and its behaviour was not exercised.
- The **comment** feature behind the record's comment button.
- The **realtime** channel. The desktop capture decoded Airtable's
  `application/msgpack` framing and its websocket endpoints; the mobile app
  uses the same server, but its traffic was not captured, so the mobile
  client's protocol is not documented here.
- **Per-page drafts.** The desktop capture recorded that page layouts are
  served separately from page data (`readDraft`); whether the mobile app
  fetches them the same way is not established.
- The **field set behind `Contact Details`** — the desktop capture reached
  that page only through the Attendance page's `Go to interface` button and
  landed in a state that is not its normal rendering. The mobile app's
  `Contacts` page may be that page's mobile rendering, but the two were not
  tied together by observation.

**Static analysis.** REA's Android static path needs a caller-supplied
`jadx-headless-mcp` JAR and an `apktool` launcher; neither was present on this
machine, so no class was decompiled. The dex and resource findings above come
from string extraction over the APK's 14 `classes*.dex` files and its
`resources.arsc`, which is enough to establish *where a string lives* and not
enough to describe a method.

## Provenance

- The desktop-side counterpart: [`airtable-legacy-base.md`](./airtable-legacy-base.md),
  and the machine-readable artifacts under `docs/reference/`.
- The Figma build prompt for this interface, and the redacted reference
  captures: `_bmad-output/E-Assets/figma/`.
- The redaction script: `scripts/redact-airtable-captures.py`.
