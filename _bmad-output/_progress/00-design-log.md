# WDS Design Log

## Current
- 2026-11-01: Dashboard — the canonical spec is `_bmad-output/specs/spec-program-dashboard/`. It adopts a top-level `/dashboard`; the WDS page's `/overview` route is superseded. The page is pipeline-led (contacts → calls → invites → attendance) and the session carries the campaign link from the `+ New session` popover. Not implemented.
- 2026-11-01: Contacts section — `/contact` becomes Overview · Contacts · Reports, with the grid moved out of `/manage`, specifying the existing `contacts.figcraft` design set. Specified in `_bmad-output/specs/spec-contacts-overview-reports/`; not implemented. Next step is the section shell and the grid move, then `lib/contacts/metrics.ts`.
- 2026-10-23: Alternate "Assign contacts" design — the same screen with a weighted "Assign to" panel, so a coordinator can split the selected contacts between callers by weight and watch every count update. New page in `_bmad-output/E-Assets/page-designs/campaign-weighted-assign.figcraft`; the nav, page title and contacts table are copied from the original frame, not redrawn.
- 2026-10-22: FOLK Campaign design set — 18 frames (desktop admin, phone dialer session, phone admin) in the app's own light and dark themes, built as a FigCraft document from the autodialer spec. Every control is taken from the running app, not invented. Design file, build script and captured references in `_bmad-output/E-Assets/page-designs/`.
- 2026-10-21: Contacts mobile surface — the Airtable mobile app's "Admin Portal → Contacts" interface page reverse engineered on Waydroid (Android 13, Airtable v7.9.0) and brought into `/manage` as a contact surface over the contacts grid. Prompt and redacted references in `_bmad-output/E-Assets/figma/`.
- 2026-05-05: Dashboard and Sessions session-lock improvement implemented on `evolution/session-dashboard-lock`.

## Backlog
- Implement the Contacts section from `_bmad-output/specs/spec-contacts-overview-reports/`: the `/contact` shell and role-shaped tabs, the grid move off `/manage`, `lib/contacts/metrics.ts`, then Overview and Reports.
- Review live-dashboard refresh behavior with real Airtable data after the first active session is started.
- Build the Contacts mobile frames in Figma from `_bmad-output/E-Assets/figma/contacts-mobile-figma-prompt.md`; the dark-theme variant and the nine-field record are not yet designed.
- The FOLK Campaign set has no wireframe stage — the pages were designed straight from the spec's `ux-flows.md`. A low-fidelity pass may still be wanted for the phone dialer's motion (the queue rail opening over a live call) and for the offline-queue state, which the spec leaves open.

## Design Loop Status

| Scenario | Page | Name | Status | Updated |
|---|---|---|---|---|
| 01-staff-program-overview | 01.1 | Dashboard | specified | 2026-11-01 |
| 01-staff-program-overview | 01.1 | Dashboard | validated (pass) | 2026-11-01 |

## Completed
- Rebuilt `_bmad-output/E-Assets/page-designs/contacts.figcraft` to the spec — nine frames, 1,553 nodes, both themes. The seven corrections are in: no sixth nav pill (the existing first `Contact` pill hosts the section), `Overview` as the Overview frame's title, `6 hidden fields`, "Never attended" in place of the fieldless "Never contacted", "No location" and "Unknown location" as two rows that sum to 272, and a real period control on the phone's Reports. The phone now navigates by the title's chevron into a full-screen section menu (`campaign-menu.tsx`'s takeover panel), replacing the pill strip, and the order is Overview · Contacts · Reports on both shapes — a ninth frame draws the menu. The desktop Contacts tab now carries `Add contact` at the far right of its title row, after the scope switch, and the toolbar's hidden-field pill reads `5 hidden fields` because the collection date became the stored `initial_contact` and no derived column was needed. The phone Contacts tab carries `Add contact` on its title row, opening the add-contact form — captured live in Waydroid (Android 13, 390×844, Jelly, real email-OTP sign-in as the seeded Admin) and added to the References page, and the list is back to the eight rows the frame originally drew. The build also fixed three defects of its own: the Overview's last two cards were clipped at 900px, the phone funnel's counts were cut off by a 16px overflow, and the phone list's `Add record` was pushed off the frame by two rows.
- Created `_bmad-output/E-Assets/page-designs/contacts-design-set-summary.md` — the set's anatomy, the ten decisions the frames encode, the rebuild command, and the three generator traps: a drawn button has no theme, a clipped frame loses its last card silently, and a grid cell's text does not stop at its column.
- Created `_bmad-output/specs/spec-contacts-overview-reports/SPEC.md` — the section's spine: four routes at `/contact`, the six points where the spec corrects the design set (no sixth nav pill, `Overview` as the page title, the sixth hidden field, Never attended instead of Never contacted, Unresolved split in two, the phone's period control), and nine shaping decisions including the grid forcing a bounded layout rather than the Campaigns one.
- Created `_bmad-output/specs/spec-contacts-overview-reports/metrics-contract.md` — one definition per number: the derived `collectedOn` (stored `initial_contact`, else the Asia/Kolkata program day of `created_at`), the five tiles, the four Overview cards, the Reports funnel, leaderboard and quality list, the percentage rule, and the read-cost threshold at which the arithmetic moves into an RPC.
- Created `_bmad-output/specs/spec-contacts-overview-reports/ux-overview.md`, `ux-reports.md`, `ux-contacts-grid.md` — the three page specifications, including the read-only, default-hidden `Collected` grid column that makes a tile link reproduce its own count, and the one-scroller height chain the grid depends on.
- Created `_bmad-output/specs/spec-contacts-overview-reports/existing-state.md` — the sourced findings: the grid's height chain and one-scroller assertion, the URL wire table, the three create paths and which of them write `initial_contact`, the Assistant's read grant that no surface honours, and the parked `last_contacted_on` column that leaves the design's fourth tile without a field.
- Created `_bmad-output/D-Design-System/00-design-system.md` — the design system the WDS standard assumes: semantic colour tokens with both programmes' values, the type and spacing scales, radius/elevation/breakpoints/motion, and thirteen component recipes, each naming the code file that implements it. Extracted from the shipped `/manage`, `/campaigns` and `/sessions` surfaces, not invented.
- Created `_bmad-output/C-UX-Scenarios/01-staff-program-overview/scenario-overview.md` — the scenario, the five-step journey, the navigation order change and the edge cases.
- Created `_bmad-output/C-UX-Scenarios/01-staff-program-overview/pages/01.1-dashboard/01.1-dashboard.md` — the Dashboard specification: nav matrix (Dashboard, Contact, Sessions, Invite, Campaign, Manage), scope model (`?mode=admin|preacher`, Assistant resolves through the assigned preacher), KPI definitions (Contacts, Sessions, Attendees, Attendance, Active campaigns), live-session band, two trend charts, preacher/location breakdown, campaign funnel, recent sessions, states, responsive rules and the shared files the change touches.
- Settled: `/overview` is a new route; `/dashboard` stays as the live-attendance surface and leaves the nav. Attendees counts distinct people; Attendance counts check-ins across all sessions.
- Created `_bmad-output/E-Assets/page-designs/campaign-weighted-assign.figcraft` — the alternate "Assign contacts" screen with a weighted "Assign to" panel: per-caller weight steppers (1–10), the resulting contact count per caller, and the split-equally toggle, chips and orange card removed. Three frames — the full screen, the panel at equal weights, the panel with a single caller.
- Created `_bmad-output/E-Assets/page-designs/build_weighted_assign_design.py` — the generator; copies the screen out of `campaign.figcraft` and rebuilds only the panel, so the nav and the grid cannot drift from the original.
- Created `_bmad-output/E-Assets/page-designs/campaign-weighted-assign-summary.md` — the panel's anatomy, the distribution rule (floor share plus a largest-remainder pass) and why the interaction is specified rather than wired into the FigCraft prototype.
- Created `_bmad-output/E-Assets/page-designs/campaign.figcraft` — the FOLK Campaign design file: References, Desktop — Campaign, Mobile — Dialer and Mobile — Campaign pages, 18 frames total.
- Created `_bmad-output/E-Assets/page-designs/build_campaigner_designs.py` — the generator; rebuilds the file from the committed references without a running app.
- Created `_bmad-output/E-Assets/page-designs/references/` — eight captures of the real app (header, dashboard, grid, phone surfaces, admin drawer) and the FOLK mark, used as the design file's reference page and as the source for the borrowed components.
- Created `_bmad-output/E-Assets/page-designs/campaign-design-set-summary.md` — what each frame settles, and the two FigCraft behaviours (vector path fitting, frame defaults) that the generator has to work around.
- Created `_bmad-output/E-Assets/figma/contacts-mobile-figma-prompt.md` — the Figma build prompt, with the measured source geometry and the deviations from the source.
- Created `_bmad-output/E-Assets/figma/references/` — seven redacted captures of the source interface. `scripts/redact-airtable-captures.py` bars the data and keeps the interface labels legible, because the originals carry real contact names, phone numbers and a staff member's name.
- Created `_bmad-output/evolution/specs/dashboard-sessions-session-lock.md`.
- Simplified Sessions flow to session name and location.
- Added two-hour server-owned session expiry.
- Locked Sessions flow to the live dashboard while a session is active.

---

## Progress

### 2026-11-01 — Validation: 1 page audited, pass
- Audited `C-UX-Scenarios/01-staff-program-overview/pages/01.1-dashboard/01.1-dashboard.md`. Full report at `_progress/validation-report.md`.
- First pass found two format warnings and one design-system separation finding. All three fixed the same day: the header is now an H3, Page Metadata carries an explicit `Inherits From`, and the implementation detail moved to `D-Design-System/00-design-system.md`.
- Created `D-Design-System/00-design-system.md` — colour, type, spacing, radius, elevation, breakpoints, motion, and thirteen component recipes (shell, page header, scope switch, notice, card, stat tile, live band, table, empty state, focus ring, card action, nav item, chart), each naming the code file that implements it.
- Remaining deviation: no sketch. Deliberate — the page reuses existing designed surfaces; the reference captures stand in.
- Page spec now contains no hex codes, no class strings and no `className`; only the two mobile-fit viewport widths remain as test parameters.
