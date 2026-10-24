# FOLK Campaign — design set

**Source:** `campaign.figcraft` (FigCraft) · **Build:** `build_campaigner_designs.py` ·
**References:** `references/` (captured off the running app)

18 frames across 4 pages, in the app's own light and dark themes, at 1440×900
(desktop) and 390×844 (phone).

---

## Why this is not a new app

Every control in these frames is taken from the running `folk_hkmc` app, not
invented for this feature. The design set reuses:

| Element | Source in the repo |
|---|---|
| Navy app bar, centred `h-10` rounded-full nav pills, active pill white-on-navy | `components/header.tsx` |
| Phone bottom nav, always white even in dark | `components/header.tsx` `data-mobile-app-nav` |
| Tab strip (the Campaigns / Callers / Reports row) | the tab strip in `components/manage/manage-portal.tsx` |
| Grid toolbar — search, Filter, Sort, "N hidden fields", "Default rows" (Add record omitted on Assign) | `components/manage/manage-contacts-table.tsx` |
| Grid table — hairline header, ruled rows, chips, footer count | `components/grid/` |
| Stat cards, navy chart-card title band | `components/manage/manage-dashboard.tsx` |
| Page title (Poppins 22) + 12px muted scope line | `components/manage/manage-portal.tsx` |
| Every colour, radius, type size | `apps/folk/app/globals.css` |

The **Campaign** pill is a new item in that existing nav row — desktop top bar
and phone bottom bar, alongside Contact / Sessions / Invite / Manage. On the
desktop frames the whole pill row is centred in the app bar; the captured
references show the current left-aligned row, so this is the one deliberate
departure from the running chrome.

The `references/` page in the design file holds captures of the real app
beside these frames, so the match can be checked rather than asserted.

---

## The one constraint that shaped everything

**Calls happen on a phone only.** So the two surfaces split by *who holds the
device*, not by screen size:

- **Desktop (1440×900)** — the admin's desk. Campaigns, the survey builder,
  batch assignment with the full contact grid, the caller roster, reporting
  and export.
- **Phone (390×844)** — the caller's hands. The queue, the call card, the
  disposition, the session summary. The desktop's fine-grained controls
  (picking contacts one by one from the grid) are **desktop only**; on the
  phone the admin filters, picks callers, and splits the result equally.

The phone's Campaign screens keep the same components as the desktop, reduced:
the pill row replaces the tab strip, the grid becomes stat cards and list
cards, and the assignment panel drops the contact table for a filter.

---

## The decisions the frames encode

Taken from `_bmad-output/specs/` — the autodialer spec's `architecture.md`,
`ux-flows.md` and `data-model.md`.

1. **Two surfaces, not one.** `/manage` is gated `requireRole(["Admin","Preacher"])`
   and the `contacts` RLS policy has no `Volunteer` term, so a volunteer reads
   zero contacts. The caller's surface is a separate route; the desktop's
   Campaign surface is a separate nav item. Neither widens the other.

2. **One primary action per phase, and the label names the consequence.**
   `Call Priya` → `I'm back` → `Save & continue` → `Next call in 14s`. The
   source app's "Call Now" silently meant *skip* during a countdown; there is
   no button here whose meaning changes invisibly.

3. **"I'm back" is a real button.** No browser can observe a `tel:` call, so
   the return is an explicit user action. The frame says why, on the frame.

4. **The save state is a receipt, not a toast.** `Saved 12:04` / `Saving…` /
   `Save failed — session paused`, always on screen. A toast that disappears
   is not a guarantee a caller can trust mid-conversation. A failed save
   **pauses the session** and keeps the answers.

5. **Follow-up only when it was answered.** The disposition asks the outcome
   first; follow-up, interest and survey appear only on `ANSWERED`. Roughly
   half the screen disappears for an unanswered call, and nothing is lost.

6. **The queue is always visible.** A drawer over the call card shows the
   current contact, the next one and everyone after, with `Showing 12 of 487` —
   a virtualised window, because a realistic queue is 300–500, not 8.

7. **The card carries the history.** Read-only, last N entries, scoped to that
   contact, directly above the call button. The source app gave the caller no
   memory of the last conversation.

8. **"Never attempted" is the final funnel bucket**, and it is the one that
   matters: assigned minus attempted. It is what makes a stalled volunteer
   visible *before* the campaign ends, and it is coloured amber on every
   surface it appears on. **Confirmed** is surfaced beside Reached as its own
   stat: the calls where the contact actually said yes, so a healthy attempt
   rate cannot hide a weak conversion.

9. **The leaderboard claims no quality signal.** It ranks on completed
   attempts only, and says so on the frame. Under click-to-call every outcome
   is self-reported, so nothing in the system measures whether a conversation
   happened.

10. **The session summary re-queues.** "7 people were never picked up" with a
    re-queue action, bounded by the per-campaign attempt cap. A contact who
    was busy at 7pm is not a contact who declined.

11. **Inactive means inactive.** A deactivated caller disappears from the
    assignment pickers *and* is refused at the disposition write.

12. **Conflict detection is a constraint, not a warning.** The assign panel
    names every conflict before anything is written, and the count on the
    button is the count that will actually be assigned.

---

## Pages and frames

### References
The real app, captured off the local stack at build time, next to the frames
that borrow from it.

### Desktop — Campaign (1440×900)

| Frame | What it settles |
|---|---|
| Campaigns (light / dark) | The Campaign pill, the Manage-style tab sub-nav, the five stat cards (with Confirmed), the campaign table without Gap or row actions, and `CANCELLED` as a state rather than a delete |
| New campaign & survey (light) | Campaign details with an end date, one required Status? survey question with the fixed outcome list, and a single Next action |
| Assign contacts (light) | The desktop-only fine-grained path: the grid toolbar without Add record, and a table of Name, Phone, Location, Assigned To and Notes — Assigned To names the caller holding each already-assigned contact, and unassigned rows read "—". The weighted caller split (5 / 3 / 1 / 1 → 60 / 36 / 12 / 12 of the 120 assignable contacts) and the conflict list sit beside it. The campaign is already in context, so the title carries no campaign line and the panel has no campaign picker |
| Callers (light) | The roster, the invite path, who can be a caller, and what deactivation actually does |
| Reports (light / dark) | The funnel with the amber bucket, the outcome mix, the leaderboard with its disclaimer, the activity feed, CSV export |

**Assign contacts** now uses the weighted panel adopted from the alternate
`campaign-weighted-assign.figcraft` study: each caller carries a weight and the
120 assignable contacts divide 5 / 3 / 1 / 1 → 60 / 36 / 12 / 12 rather than
an equal split. The alternate file stays as the study of the panel's other
states (equal weights, single caller) and is not the source of the screen.

### Mobile — Dialer (390×844)

| Frame | What it settles |
|---|---|
| Call card | The persistent queue rail entry point, the number with a copy fallback, the contact's tags, the history panel, the call button, the gap that gates the *button* and not the navigation |
| Queue rail | The drawer: current, next, everyone after, `Showing 12 of 487`, tap to jump |
| On the call | "I'm back", and the honest explanation of why it is a button |
| Disposition | Outcome chips, conditional follow-up, notes that are never pre-filled, the campaign survey, the save receipt |
| Save failed, session paused | The failure is loud, the answers are kept, the session stops until the save lands |
| Session summary & re-queue | What the session achieved, and the recall for the people never picked up |
| Call card (dark) | The same screen in the dark theme |

### Mobile — Campaign (390×844)

| Frame | What it settles |
|---|---|
| Campaigns (light / dark) | The phone's Campaign list: stat cards and campaign cards, the pill sub-nav, Campaign in the bottom nav |
| Assign | Filter, caller selection, split equally, and the count — the fine-grained grid is desktop only |
| Reports | The funnel and the leaderboard, read-first |

---

## Rebuilding

```sh
cd _bmad-output/E-Assets/page-designs
python3 build_campaigner_designs.py .                       # -> campaign.json
figcraft.cli run campaign.json --out campaign.figcraft \
  --automation-read-root "$PWD/references" --automation-write-root "$PWD"
```

`references/` is committed, so the build is reproducible without a running
app. Re-capturing the references needs the local stack
(`pnpm dev:local`) and the login script the repo already has
(`scripts/dev-login-preacher.mjs`).

Two notes for anyone editing the build script:

- **FigCraft draws a vector by stretching the path's bounding box to fill the
  node's box.** Lucide draws in a 24×24 grid, so the script computes each
  icon's real bounds and fits the path to the node itself; without that,
  every icon is distorted.
- **A FigCraft frame defaults to a white fill and a fixed 100×100 box.** The
  `frame()` helper in the script sets the fill, the sizing and the cross-axis
  behaviour explicitly for the same reason.
