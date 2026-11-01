# Design reference — Sessions

Authority: `_bmad-output/E-Assets/page-designs/sessions.figcraft` (11 frames).
Builder: `build_sessions_designs.py`; renders in `preview/sessions-desktop/`
and `preview/sessions-mobile/`.

All names, figures and dates in the frames are sample data.

These frames describe completed sessions. A session that is `Live now` opens
its attendance dashboard at `/sessions/<id>/live` instead; the saved design set
does not draw that screen.

## Dashboard enhancements

The Overview extends the frames with the dashboard starter's patterns: a
`Live now` rail, gradient KPI tiles with icons, an attendance-pulse line chart,
and Recharts versions of the reports bars and weekly trend.
The table and cards keep the design's structure and tokens; the charts never
introduce capacity, attendance fractions or absence data. The Reports route is
retired, and `New session` is a popover rather than a page section.

## Chrome

| Element | Desktop | Mobile |
|---|---|---|
| App bar | Navy, centred pill nav, `Sessions` active | Navy bar, logo left, moon/logout right |
| Section title | Poppins 22, subtitle 12 muted, action right | Poppins 22 with chevron-down, subtitle under, action right |
| Navigation | Single Overview title; no tab strip | Single Overview title; no chevron menu or pill group |
| Bottom nav | — | Fixed white bar, `Sessions` active |
| Tokens | `globals.css`, Campaign tokens | same |

## Desktop — 1440×900

### Overview (light and dark)
1. Title `Sessions`, subtitle `48 sessions · folk programme`.
2. Right: location filter (`All locations`), primary `+ New session`.
3. Tab strip `Overview` active.
4. Four stat cards: Sessions, Attendees, Avg attendance (with month delta), Repeat attendees.
5. Session table: Session, Date, Location, Attendees, Status, `Open ›`.
6. Status chips: Completed (info), Live now (success), Upcoming (warning).
7. Foot: count left; automatic-status note right.

### Reports (light and dark) — retired

The Reports route is retired. `Attendance by session` and `Attendance trend` now
sit on the Overview with the pulse; the range is the fixed
last-90-days window, and the stat cards and Top sessions are not rendered. The
frame is kept as the visual source for the two charts.

### Session detail (light)
1. Back link `All sessions`; title with `Completed` pill; date · time · location.
2. Right: `Export attendees`.
3. Tabs: Attendees, Session report.
4. Three stat cards: Attended, First-timers, Returning.
5. Attendee table: Name, Phone, Location, Sessions, First session, `View ›`.
6. Foot: attendee count; note that selecting opens the contact.

### Attendee contact (light) — modal
The session-detail table opens the full contact record in a modal rather than a
side panel: initials, name, `Contact · since …`; phone, location, assigned
preacher, first and last contact, sessions attended, past 60-day attendance,
last attended, collected-by, favourite and notes; attended-session history. No
email, no action buttons.

## Mobile — 390×844

### Overview (light and dark)
- Title `Sessions ⌄`; `+ New session` primary button right.
- No pill group.
- 2×2 stat tiles: Sessions, Attendees, Avg attendance, Upcoming.
- `Recent & upcoming` cards: name, date · location, attendance total, status pill, chevron-right.

### Reports — retired
The phone Reports frame is retired with the route; its two charts are stacked
on the Overview after the session cards.

### Session detail
- Back link `Sessions`.
- Title `Weekend Camp 2026 ⌄` with a `Completed` pill.
- Date · time, location.
- Three stat tiles: Attended, First-timers, Returning.
- `Attendees · 42` heading and `Sort`.
- Attendee cards: initials, name, phone, sessions attended, chevron-right.

### Attendee contact
- Back link `Weekend Camp 2026 · Attendees`.
- Hero: initials, name, `Contact · since Sep 2025`.
- Contact details card: phone, location, assigned preacher, first contact, sessions attended, last attended.
- Attendance history: session, date, `Attended`.
- No email, no action buttons.

## Status vocabulary

| Status | Condition | Tone |
|---|---|---|
| Upcoming | `now < opens` | warning |
| Live now | `opens <= now < closes` | success |
| Completed | `now >= closes` | info |

No `Open`, `Draft`, `Scheduled` or manual status.

## Frame inventory

| Page | Frames |
|---|---|
| Desktop — Sessions | Overview (light), Reports (light), Session detail (light), Attendee contact (light), Overview (dark), Reports (dark) |
| Mobile — Sessions | Overview, Session detail, Attendee contact, Reports, Overview (dark) |
