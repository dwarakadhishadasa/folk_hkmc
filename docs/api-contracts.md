# API Contracts

## Overview

This project uses Next.js route handlers in each program app under `apps/folk/app` and `apps/gita-life/app`. The route paths below are relative to whichever program deployment is running. Most APIs return JSON. Auth-protected APIs use Supabase session cookies and program-scoped `getStaffContext()` from `lib/authz.ts`.

Important route convention: attendance is implemented at `/attendance`, not `/api/attendance`.

Program identity comes from `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID`, set by the app package scripts. Staff responses include `programId`, membership `status`, and `lastSyncedAt` in addition to role/location data.

## Auth Routes

### `GET /api/auth/me`

Returns the current program staff context.

Auth: Supabase session cookie.

Responses:

- `200 { staff: StaffContext }`
- `200 { staff: null }` when unauthenticated
- `403/500 { error, code? }` for authorization/profile errors

Headers include no-store cache controls and `Vary: Cookie`.

### `POST /api/auth/signin`

Prepares an email OTP sign-in for an active Airtable staff user in the current program context.

Request:

```json
{ "email": "staff@example.com" }
```

Behavior:

- Validates email format.
- Finds active Airtable User by email through the current program's Airtable config.
- Ensures Supabase Auth user exists.
- Syncs Supabase user ID to Airtable if needed.
- The browser then calls Supabase `signInWithOtp`.

Responses:

- `200 { "ready": true, "email": "staff@example.com" }`
- `400 { "error": "A valid staff email is required." }`
- `403 { "error": "This email is not linked to an active staff account." }`
- `500 { "error": "..." }`

### `POST /api/auth/complete-implicit`

Completes staff profile and program membership sync after a Supabase browser/session callback.

Auth: Supabase session cookie.

Responses:

- `200 { staff: StaffContext }`
- `401/403/500 { error, code }`

### `GET /auth/confirm`

Supabase email callback route. Accepts either `code` or `token_hash`/`type`. On success it syncs the staff profile/membership for the current program and redirects based on role:

- Volunteer: `/contact`
- Preacher: `/` unless a safe `next` path is allowed
- Admin: `/dashboard` unless a safe `next` path is allowed

Errors redirect to `/auth/error?code=...`.

### `GET|POST /auth/signout`

Signs out through Supabase server client and redirects to `/login?signedOut=1` with no-store headers.

## Public Registration And Attendance

### `POST /api/registration`

Creates a public Contact. When `sessionId` is provided, it also marks attendance for that session.

Request:

```json
{
  "name": "Arjun",
  "mobile": "9876543210",
  "age": "21",
  "occupation": "Studying",
  "year": "2nd year",
  "location": "Anna Nagar",
  "sessionId": "recXXXXXXXXXXXX"
}
```

Validation:

- `name` required.
- `mobile` must normalize to 10 digits.
- If `sessionId` is present, session must exist, be public, be inside attendance window, and have preacher/location routing.

Responses without `sessionId`:

- `201 { contact }`
- `409 { alreadyRegistered: true, contact }`
- `400/500 { error }`

Responses with `sessionId`:

- `200` or `201` with:

```json
{
  "completed": true,
  "sessionBacked": true,
  "registrationOutcome": "contact_created",
  "attendanceOutcome": "attendance_marked",
  "contact": { "id": "rec...", "name": "Arjun", "phone": "9876543210" },
  "attendance": { "id": "rec...", "createdAt": "2026-06-11T..." },
  "sessionId": "rec..."
}
```

`attendanceOutcome` may be `attendance_already_marked`.

### `POST /attendance`

Marks attendance for an existing Contact in a session.

Request:

```json
{ "mobile": "9876543210", "sessionId": "recXXXXXXXXXXXX" }
```

Responses:

- `201 { id, mobile, userName, sessionId, createdAt }`
- `400 { error }` for invalid mobile or missing session
- `403 { error }` for closed/not-open session
- `404 { error, notRegistered: true, mobile, sessionId }`
- `409 { error, duplicate: true, id, mobile, userName, sessionId, createdAt }`
- `500 { error }`

### `GET /attendance`

Returns attendance records for staff dashboard views.

Auth: Admin or Preacher.

Query:

- `session=<sessionId>`: read session-linked attendance.
- `knownAttendanceIds=recA,recB`: optional incremental fetch, max 100 record IDs.
- `date=YYYY-MM-DD`: used only when no session is supplied.

Responses:

- `200 [{ id, mobile, userName, createdAt }]`
- `403 { error, code? }` when outside role/session scope
- `404 { error }` for invalid session

## Staff Contact API

### `POST /api/contact`

Creates a Contact from staff-entered outreach data.

Auth: any active staff role.

Request:

```json
{
  "name": "Arjun",
  "mobile": "9876543210",
  "dateOfBirth": "2003-01-15",
  "occupation": "Working",
  "college": "",
  "company": "Example Co",
  "year": "Unknown",
  "source": "Pass distribution",
  "location": "Anna Nagar",
  "comments": "Met near campus",
  "assignedPreacherAirtableUserId": "rec..."
}
```

Role behavior:

- Volunteer: assigned Preacher comes from staff profile.
- Preacher: assigned Preacher is the current staff user.
- Admin: must provide `assignedPreacherAirtableUserId`.

Responses:

- `201 { contact }`
- `400 { error }` for invalid required fields or invalid DOB
- `409 { duplicate: true, contact }`
- `422 { error }` for missing location/routing
- `401/403/500 { error, code? }`

## Sessions API

### `GET /api/sessions`

Lists sessions visible to Admin or Preacher users.

Auth: Admin or Preacher.

Response:

```json
{
  "sessions": [
    {
      "id": "rec...",
      "name": "Sunday FOLK",
      "sessionDate": "2026-06-11T15:30:00.000Z",
      "locationIds": ["rec..."],
      "preacherIds": ["rec..."],
      "publicAttendanceEnabled": true,
      "attendanceOpensAt": "2026-06-11T15:30:00.000Z",
      "attendanceClosesAt": "2026-06-11T15:45:00.000Z",
      "attendanceUrl": "https://.../attend?session=rec..."
    }
  ]
}
```

Preachers see sessions where they are linked as Preacher or where the session location overlaps their staff profile locations.

### `POST /api/sessions`

Creates a new attendance session and public attendance URL.

Auth: Admin or Preacher.

Request:

```json
{
  "name": "Sunday FOLK",
  "locationId": "rec...",
  "durationMinutes": 15
}
```

Validation:

- `NEXT_PUBLIC_SITE_URL` must be set.
- Duration must be an integer from 1 to 1440.
- Preachers can create sessions only for scoped locations.
- Location must exist in Airtable.

Responses:

- `201 { session }`
- `400/403/500 { error, code? }`

## Admin APIs

### `POST /api/admin/invite-user`

Invites Admin, Preacher, or Volunteer users.

Auth: Admin.

Request:

```json
{
  "name": "Madhav",
  "email": "madhav@example.com",
  "role": "Preacher",
  "locationIds": ["rec..."],
  "assignedPreacherAirtableUserId": "rec..."
}
```

Rules:

- Role must be `Admin`, `Preacher`, or `Volunteer`.
- Volunteer invites require an active assigned Preacher.
- Non-Volunteer roles may receive location access.
- Route upserts Airtable User, sends a Supabase invite or existing-user sign-in link, and writes `invite_log`.

Responses:

- `201 { invited: true, delivery: "invite" | "sign-in-link", user: { id, email, role } }`
- `400 { error }`
- `502 { error }` for safe Supabase email, SMTP, rate-limit, or redirect setup failures
- `401/403/500 { error, code? }`

### `POST /api/admin/locations`

Creates an Airtable Location or returns an existing one.

Auth: Admin.

Request:

```json
{ "name": "Anna Nagar" }
```

Responses:

- `201 { location, existing: false }`
- `200 { location, existing: true }`
- `400 { error }`
- `401/403/500 { error, code? }`

## Volunteer Invite API

### `POST /api/volunteers/invite`

Invites a Volunteer. Admins may choose assigned Preacher; Preachers assign the volunteer to themselves.

Auth: Admin or Preacher.

Request:

```json
{
  "name": "Nitai",
  "email": "nitai@example.com",
  "role": "Volunteer",
  "assignedPreacherAirtableUserId": "rec..."
}
```

Responses:

- `201 { invited: true, delivery: "invite" | "sign-in-link", user: { id, email, role: "Volunteer" } }`
- `400/403/502 { error }`
- `401/500 { error, code? }`

## Service Worker Offline Responses

When `public/sw.js` cannot reach the network for queueable POST paths, it stores the request in IndexedDB and returns:

```json
{
  "success": false,
  "queued": true,
  "message": "Request queued for sync when online"
}
```

with status `202`.

For `/api/contact`, the message is `Contact queued for sync when online`.
