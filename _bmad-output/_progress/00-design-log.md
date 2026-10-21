# WDS Design Log

## Current
- 2026-10-21: Contacts mobile surface — the Airtable mobile app's "Admin Portal → Contacts" interface page reverse engineered on Waydroid (Android 13, Airtable v7.9.0) and brought into `/manage` as a contact surface over the contacts grid. Prompt and redacted references in `_bmad-output/E-Assets/figma/`.
- 2026-05-05: Dashboard and Sessions session-lock improvement implemented on `evolution/session-dashboard-lock`.

## Backlog
- Review live-dashboard refresh behavior with real Airtable data after the first active session is started.
- Build the Contacts mobile frames in Figma from `_bmad-output/E-Assets/figma/contacts-mobile-figma-prompt.md`; the dark-theme variant and the nine-field record are not yet designed.

## Completed
- Created `_bmad-output/E-Assets/figma/contacts-mobile-figma-prompt.md` — the Figma build prompt, with the measured source geometry and the deviations from the source.
- Created `_bmad-output/E-Assets/figma/references/` — seven redacted captures of the source interface. `scripts/redact-airtable-captures.py` bars the data and keeps the interface labels legible, because the originals carry real contact names, phone numbers and a staff member's name.
- Created `_bmad-output/evolution/specs/dashboard-sessions-session-lock.md`.
- Simplified Sessions flow to session name and location.
- Added two-hour server-owned session expiry.
- Locked Sessions flow to the live dashboard while a session is active.
