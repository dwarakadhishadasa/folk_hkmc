# FOLK Sessions — design set

**Source:** `sessions.figcraft` (FigCraft) · **Build:** `build_sessions_designs.py` ·
**Previews:** `preview/sessions-desktop/`, `preview/sessions-mobile/`

11 frames across 2 pages, in the app's light and dark themes, at 1440×900
(desktop) and 390×844 (phone).

---

## Why it looks like Campaign

The Sessions surface is built from the same script library, tokens and chrome as
`campaign.figcraft`, so it reads as another tab of the same product:

| Element | Reused from |
|---|---|
| Navy app bar, centred nav pills, active pill white-on-navy | `components/header.tsx` via the campaign builder |
| Phone app bar and fixed bottom nav (Sessions active) | same |
| Overview / Reports underline tab strip | `components/manage/manage-portal.tsx` pattern |
| Stat cards, hairline table, chips, navy panel headers | campaign builder's `stat_card`, `table`, `panel_header` |
| Colour, radius, type sizes | `apps/folk/app/globals.css` tokens carried in the builder |

Nothing new was invented for the chrome; the only new content is the Sessions
information architecture.

---

## The screens

### Desktop — 1440×900

| Frame | What it answers |
|---|---|
| **Overview (light)** | Every session with name, date, location, attendance (`42 of 60`) and status, plus the four programme-level stats. `Open ›` on each row leads to the session. |
| **Reports (light)** | Attendance by session, weekly check-in trend, top sessions and the sessions that ran under-filled over the last 90 days. |
| **Session detail (light)** | One session: attended / first-timers / returning, then the attendee table with phone, location, sessions attended and first session. |
| **Attendee contact (light)** | The same table with the contact panel open: phone, location, preacher, first contact, sessions attended, last attended and attended-session history. |
| **Overview (dark)** | The overview in the dark theme. |
| **Reports (dark)** | The reports in the dark theme. |

### Mobile — 390×844

| Frame | What it answers |
|---|---|
| **Overview** | `Sessions ⌄` with `+ New session`, stat tiles, then recent and upcoming cards with date, location, attendance and a chevron into the session. No pill nav. |
| **Reports** | `Reports ⌄`; the same four stats, attendance bars and top sessions. No pill nav. |
| **Session detail** | Session header with chevron and status, three stats, and attendee cards (name, phone, sessions attended) that open the contact. |
| **Attendee contact** | Full contact record: phone, location, preacher, first contact, sessions attended, last attended and attended history. No email or actions. |
| **Overview (dark)** | The phone overview in the dark theme. |

---

## Decisions the frames encode

1. **The session is the unit, not the campaign.** Overview is a list of sessions;
   the row carries the four facts the user asked for — name, date, attendance
   and status — and one way in.
2. **Attendance is shown as a fraction, not a bare number.** `42 of 60` makes a
   half-empty hall visible without a chart.
3. **Clicking an attendee never loses the session.** The desktop opens the
   contact in a side panel beside the table; the phone pushes a contact screen
   with a back path to the session.
4. **The contact card is the same record the rest of the app edits.** Phone,
   email, location, assigned preacher, first contact and attendance history —
   not a reduced "attendee" object.
5. **Reports are attendance reports, not call reports.** Turnout, trend and top
   sessions; the Campaign reports stay about the dialer.
6. **Status is automatic.** A session is Upcoming, Live now, or Completed, and
   the last follows from its date and duration — there is no Draft or manual
   "mark complete". The overview says so under the table.
7. **The reports header creates the next session.** "New session" replaces the
   generic export action and leads into the attendance flow.
8. **Same chrome, light and dark.** The Sessions tab sits where Campaign does in
   both nav rows; the dark frames use the same tokens as the campaign dark set.

---

## Rebuilding

```sh
cd _bmad-output/E-Assets/page-designs
python3 build_sessions_designs.py .                        # -> sessions.json
figcraft.cli run sessions.json --out sessions.figcraft \
  --automation-read-root "$PWD/references" --automation-write-root "$PWD"
figcraft.cli export sessions.figcraft --out preview/sessions-desktop --page "Desktop — Sessions"
figcraft.cli export sessions.figcraft --out preview/sessions-mobile --page "Mobile — Sessions"
```

The sample names, dates and counts are illustrative; the fields are the real
ones — `sessions.name`, `sessions.session_date`, `sessions.location_id`, and
attendance joined to `contacts`.
