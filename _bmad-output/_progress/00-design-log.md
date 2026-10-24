# WDS Design Log

## Current
- 2026-10-23: Alternate "Assign contacts" design — the same screen with a weighted "Assign to" panel, so a coordinator can split the selected contacts between callers by weight and watch every count update. New page in `_bmad-output/E-Assets/page-designs/campaign-weighted-assign.figcraft`; the nav, page title and contacts table are copied from the original frame, not redrawn.
- 2026-10-22: FOLK Campaign design set — 18 frames (desktop admin, phone dialer session, phone admin) in the app's own light and dark themes, built as a FigCraft document from the autodialer spec. Every control is taken from the running app, not invented. Design file, build script and captured references in `_bmad-output/E-Assets/page-designs/`.
- 2026-10-21: Contacts mobile surface — the Airtable mobile app's "Admin Portal → Contacts" interface page reverse engineered on Waydroid (Android 13, Airtable v7.9.0) and brought into `/manage` as a contact surface over the contacts grid. Prompt and redacted references in `_bmad-output/E-Assets/figma/`.
- 2026-05-05: Dashboard and Sessions session-lock improvement implemented on `evolution/session-dashboard-lock`.

## Backlog
- Review live-dashboard refresh behavior with real Airtable data after the first active session is started.
- Build the Contacts mobile frames in Figma from `_bmad-output/E-Assets/figma/contacts-mobile-figma-prompt.md`; the dark-theme variant and the nine-field record are not yet designed.
- The FOLK Campaign set has no wireframe stage — the pages were designed straight from the spec's `ux-flows.md`. A low-fidelity pass may still be wanted for the phone dialer's motion (the queue rail opening over a live call) and for the offline-queue state, which the spec leaves open.

## Completed
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
