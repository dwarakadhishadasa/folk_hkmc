# FOLK Contacts — design set

**Source:** `contacts.figcraft` (FigCraft) · **Build:** `build_contacts_designs.py` ·
**References:** `references/` (captured off the running app and, for the Contact tab, off the live stack in Waydroid) ·
**Previews:** `preview/contacts/`
**Spec:** `_bmad-output/specs/spec-contacts-overview-reports/`

Nine frames across three pages, in the app's own light and dark themes, at 1440×900
(desktop) and 390×844 (phone).

---

## Why this is not a new app

Every control is taken from the running `folk_hkmc` app, not invented for this feature.
The generator imports the campaign set's token table, icon fitting and chrome helpers
directly from `build_campaigner_designs.py`, so a change to the app's primary colour lands in
both files:

| Element | Source in the repo |
|---|---|
| Navy app bar, five centre-aligned nav pills, active pill white-on-navy | `components/header.tsx` |
| Phone app bar and the five-item bottom nav | `components/header.tsx` `data-mobile-app-nav` |
| Tab strip (`Overview | Contacts | Reports`), 2px active underline | `components/manage/manage-portal.tsx` |
| Page title (Poppins 22) + 12px muted scope line | `components/manage/manage-portal.tsx` |
| Grid toolbar — search, Filter, Sort, `N hidden fields`, density, `Add record` | `components/grid/grid-toolbar.tsx` |
| Grid table — hairline rows, chips, footer count and sums | `components/grid/` |
| Stat cards, navy panel headers | `components/manage/manage-dashboard.tsx` |
| Every colour, radius and type size | `apps/folk/app/globals.css` |

The **section sits behind the existing first `Contact` pill**, so there is no sixth nav item:
the app bar and the phone bottom nav are the campaign generator's own, and this file does not
draw one. That is the structural half of "one contact home".

---

## The decisions the frames encode

Taken from `_bmad-output/specs/spec-contacts-overview-reports/`. Where that spec and an
earlier draft of this file disagreed, the spec won, and the corrections are listed in its
opening table.

1. **The Overview is numbers and links; the grid is the detail surface.** No contact list, no
   drawer, no per-contact route. Every tile, bar, location row and collector row is a door into
   the filtered grid.
2. **`Initial Contact` is not the only date.** The collection date falls back to the record's
   creation day — which is a real date for migrated rows, because the Airtable migration maps
   `created_at` from `record.createdTime`. That is what makes the month card count rows added
   through the grid, which write no `initial_contact`.
3. **"Never attended", not "Never contacted".** `last_contacted_on` is parked empty by the date
   migration, so no field can answer the original tile. The nearest real question is the one
   the Reports quality list already asks, and the two now carry the same number.
4. **"No location" and "Unknown location" are two rows.** A contact with no location and a
   contact whose location row was deleted are different facts; only the first is the amber
   tile's count. The rows sum to the total.
5. **One derived, read-only `Collected` column** is added to the grid and hidden by default, so
   the toolbar reads `6 hidden fields` while the table still draws the app's eight visible
   columns. A tile's link can then reproduce the tile's count.
6. **The scope switch is on every tab**, not only the two the first draft drew it on: it
   narrows the server read for the whole section.
7. **Six months on the Overview, twelve on Reports.** The Overview's body has 484px left on a
   900px frame; twelve rows do not fit above the sources card. Each card states its own window.
8. **The phone navigates by chevron and a full-screen menu**, `campaign-menu.tsx`'s takeover
   panel — the strip drawn in the first build was replaced. Three labels fit 390px, but fitting
   is not the question: a strip under the chevron is a second navigation competing with the
   first. The phone's Reports period is a control, not a subtitle: a report whose window cannot
   be changed on the surface most readers hold is a screenshot.
9. **The phone keeps the two amber tiles** and drops `Active in 60 days` — standing in a hall,
   the tiles with an action behind them are the ones that matter; a success metric can wait for
   the desk.
10. **The phone's add action is in the header, and it opens the form.** `Add contact` sits at the
    right of the title row and navigates to `/contact/new` — captured in Waydroid and on the
    References page. The footer carries the record count alone: the frame's original footer
    button was below the fold on an 844px screen, and it duplicated the action once the header
    had it.

---

## Pages and frames

### References
The real app, captured off the local stack at build time, beside the frames that borrow from
it.

Two of them are new and were taken in **Waydroid** (LineageOS, Android 13, `wm size 390x844`,
`wm density 160`, Jelly browser, `adb reverse tcp:3000`), signed in through the real email-OTP
path as the seeded Admin:

| Capture | What it settles |
|---|---|
| `mobile-light-contact-new.png` | The app's Contact tab today — the `New Contact` panel, its navy head and the role notice. This is what the phone's **Add contact** action opens. |
| `mobile-light-contact-new-lower.png` | The form's lower half — occupation, assigned preacher, location (disabled until a preacher is chosen), comments, and a `Save` that stays disabled until the form is valid. |

### Desktop — Contacts (1440×900)

| Frame | What it settles |
|---|---|
| Overview (light / dark) | Five tiles with the two amber ones, the 860/480 split, the six-month strip, the source mix with `Not recorded` as a row, the location distribution summing to 272, and the three engagement rows |
| Reports (light / dark) | The scope switch, period select and CSV export on one header line; the four-stage collection funnel with its warning line; the twelve-month column chart on one baseline; the collector leaderboard with its own disclaimer; the whole-scope quality list |
| Grid (light) | The existing `/manage` table with the section header above it — eight visible columns, `6 hidden fields`, `Add record`, eleven rows, `272 records` and the sums in the footer |

### Mobile — Contacts (390×844)

| Frame | What it settles |
|---|---|
| Overview | Four tiles (two amber), the two-month strip with its "still filling" note, all six location rows including both unresolved kinds |
| Menu | The section menu: title and close, the scope line, and **Overview · Contacts · Reports** with the current one underlined |
| Reports | The period control, the funnel with all four stages, the quality list, the sticky CSV export above the bottom nav |
| Grid | `Add contact` on the title row, search, the eight-row Name/Phone list, `272 records` in the footer |

The tab order is **Overview · Contacts · Reports** on both shapes — the desktop strip and the
phone menu read the same `contact-nav.ts` list.

---

## Rebuilding

```sh
cd _bmad-output/E-Assets/page-designs
python3 build_contacts_designs.py . ./references      # -> contacts.json
/snap/figcraft/18/bin/figcraft-cli run contacts.json --out contacts.figcraft \
  --automation-read-root "$PWD/references" --automation-write-root "$PWD"
/snap/figcraft/18/bin/figcraft-cli export contacts.figcraft \
  --page "Desktop — Contacts" -o preview/contacts/desktop --format png
/snap/figcraft/18/bin/figcraft-cli export contacts.figcraft \
  --page "Mobile — Contacts" -o preview/contacts/mobile --format png
```

`references/` is committed, so the build is reproducible without a running app.

**`figcraft` on `PATH` is the GUI launcher, not the CLI.** It execs a helper that is not
installed on this machine, so it fails with `No such file or directory`. Use
`/snap/figcraft/18/bin/figcraft-cli` — the same binary the launcher ships beside.

Three notes for anyone editing the build script:

- **A drawn button has no theme.** `button(kind="outline")` hard-codes the light theme's ink on
  its icon and label, which is invisible on a dark surface. `recolor_last()` repaints the two
  nodes a caller just made; the Reports export needs it.
- **A drawn frame clips silently.** `clip=True` on the frame means an over-tall body loses its
  last card without an error — the first build cut `Where contacts came from` and `Engagement`
  in half at 900px. Always export and look at the PNG; `figcraft-cli info` reports node counts,
  not overflow.
- **A cell's text does not stop at its column.** The grid's `Notes` cell needed `clip=True`, or
  a long note ran under the `Collected By` chip.


## Removed on 2026-11-01

The `All preachers | Own scope` switch is gone from all three desktop frames — the section does not
need it, because `contacts` RLS already gives a Preacher their own rows and an Admin the program.
`/manage` keeps its own switch for the tabs it still owns.

## Editing this file after 2026-11-01

The saved `contacts.figcraft` now carries two `1 Contacts List` frames (393×852) pasted in from
`~/figcraft-scratch/contacts-mobile-prototype.figcraft`, plus the desktop `Add contact` button and
the `5 hidden fields` label. **The generator does not create the pasted frames**, so running
`build_contacts_designs.py` and replaying it would drop them. Edit the file in the app for anything
that must survive alongside them, or fold them into the generator first.
