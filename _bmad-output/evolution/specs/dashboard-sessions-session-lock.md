# Dashboard and Sessions — Session Lock Update Specification

## Change Summary
Simplify session startup to the minimum fields needed by preachers and admins: session name and location. Starting a session opens attendance immediately, closes it automatically after two hours, and locks the Sessions flow into the live dashboard until the session expires.

## Before
The Sessions page asks for session date, location record ID, public attendance toggle, open time, close time, and shows a historical session list. Dashboard links users back to Sessions to manage attendance links.

## After
The Sessions page shows a compact Start Session form with only session name and location. Location is chosen from a dropdown using readable location names. After a session starts, the Sessions page displays only the live attendance dashboard with the active session context, QR code, attendance link, and expiry time. When the two-hour window expires, the Sessions page returns to the Start Session form.

## Components
- `SessionsManager`: Manages active-session detection, simplified start form, location dropdown, and locked dashboard mode.
- `LiveAttendanceDashboard`: Accepts optional active-session context and displays the active session, expiry, QR code, and attendance link when present.
- `/api/sessions`: Creates sessions with server-controlled start and close times. Session date and open time are set to now; close time is set to two hours after start.
- `lib/airtable`: Provides location listing so dropdowns can show names instead of record IDs.

## Responsive Behavior
The start form remains one column on mobile and two columns on wider screens. Locked dashboard mode keeps the existing responsive dashboard layout and uses compact text so long location/session names wrap cleanly.

## Acceptance Criteria
- Starting a session requires only session name and location.
- Location selection displays location names in a dropdown.
- Session creation automatically sets attendance open time to now and close time to two hours later.
- While an active session exists, `/sessions` shows the live dashboard only.
- After the active session expires, `/sessions` returns to the start form.
- Existing staff scoping remains intact: preachers can only start sessions for assigned locations, admins can start sessions for any listed location.
