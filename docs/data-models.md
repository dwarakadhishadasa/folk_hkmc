# folk_hkmc - Data Models

**Date:** 2026-05-04

## Overview

The application does not use a traditional relational database, ORM, or migration system. The live operational data model is an Airtable base, while the current Next.js code still reads and writes only a smaller subset of that base through `lib/airtable.ts`.

Live Airtable base:

| Property | Value |
| --- | --- |
| Base id | `appqea9DRLOXqErXb` |
| Contacts table | `tbltzdtCmCHf6gJKD` |
| Attendance table | `tblxfB2W2l6OXc2IX` |
| Sessions table | `tbl9AbwkiIaAwK20X` |
| Analytics table | `tbldQTIJb7EgPIDVE` |
| Locations table | `tbl5IOOcS2RUkXzyG` |
| Users table | `tbl2aiD2NfvrBMnfI` |

Live record counts from Airtable MCP:

| Table | Records | Purpose |
| --- | ---: | --- |
| `Contacts` | 546 | Master person/contact records, outreach state, ownership, and engagement analytics |
| `Attendance` | 904 | Attendance event records linked to contacts and sessions |
| `Sessions` | 84 | Session catalog and public-attendance control records |
| `Analytics` | 1 | Singleton aggregate support record |
| `Locations` | 2 | Location reference records |
| `Users` | 3 | Staff/operator reference and authorization records |

The effective model is:

```text
Users <----> Locations
  |             |
  v             v
Contacts <---- Attendance ----> Sessions ----> Analytics
    |
    v
Analytics
```

## External Data Models

### Airtable Contacts

`Contacts` is the master record for students, contacts, outreach state, assigned ownership, and contact-level analytics.

Core identity and profile fields:

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `singleLineText` | Primary display field |
| `Phone` | `singleLineText` | Main lookup key; app code normalizes phone numbers to 10 digits |
| `Year` | `singleSelect` | `1st year`, `2nd year`, `3rd year`, `4th year`, `Unknown` |
| `Age` | `number` | Captured by registration/contact flows |
| `Date of Birth` | `date` | Optional profile data |
| `Current status` | `singleSelect` | `Studying`, `Working` |
| `Branch` | `singleSelect` | Academic branch/category |
| `Photo` | `multipleAttachments` | Contact media |

Outreach and follow-up fields:

| Field | Type | Notes |
| --- | --- | --- |
| `WhatsappEnabled?` | `singleSelect` | WhatsApp contact state |
| `Interest` | `singleSelect` | Interest category |
| `Source` | `singleSelect` | `Pass distribution`, `Reference`, `College orientation `, `Old`, `new`, `Unknown` |
| `Interest level` | `singleSelect` | Engagement level |
| `Status` | `singleSelect` | Contact lifecycle state |
| `Rounds` | `number` | Outreach count/tracking |
| `Notes` | `singleLineText` | Operator notes |
| `Initial Contact` | `date` | First contact date |
| `Last Contacted On` | `date` | Follow-up history |
| `Next Follow-up` | `date` | Follow-up planning |
| `Delete` | `singleSelect` | Soft-delete/manual cleanup marker |

Relationship and access fields:

| Field | Type | Notes |
| --- | --- | --- |
| `Location` | `multipleRecordLinks` | Link to `Locations`; intended as one logical primary location |
| `Assigned Preacher` | `multipleRecordLinks` | Link to `Users`; prefers single record in Airtable config |
| `Collected By` | `multipleRecordLinks` | Link to `Users`; staff member who submitted the contact |
| `Analytics` | `multipleRecordLinks` | Link to the singleton `Analytics` record |
| `Attendance Records` | `multipleRecordLinks` | Inverse link from `Attendance.Contact` |
| `Visible To` | `multipleLookupValues` | Read-only lookup from `Assigned Preacher` to `Users.Portal Account`; not a writable collaborator field in the current MCP schema |

Derived analytics and legacy audit fields:

| Field | Type | Notes |
| --- | --- | --- |
| `ContactId` | `formula` | Airtable record id helper |
| `TotalAttendanceCount` | `count` | Count of linked attendance records |
| `AttendanceLog` | `rollup` | Attendance log rollup |
| `Past60DayAttendanceCount_New` | `rollup` | Recent attendance count |
| `TotalSessionCount` | `multipleLookupValues` | Lookup through analytics |
| `Past60DaySessionCount` | `multipleLookupValues` | Lookup through analytics |
| `Past60DayPercentage` | `formula` | Recent attendance percentage |
| `Status Quo` | `formula` | Engagement bucket |
| `*_Legacy` fields | mixed | Retained for audit/comparison after migration |

Current Next.js `lib/airtable.ts` writes only this subset for registration/contact-style records:

```text
Name
Phone
Age
Year
Source
Location
```

### Airtable Attendance

`Attendance` is the event table for attendance submissions. Newer writes should link a contact and a session; older app code still writes phone/name/date snapshots.

Source and write fields:

| Field | Type | Notes |
| --- | --- | --- |
| `Phone` | `singleLineText` | Snapshot phone value |
| `Name` | `singleLineText` | Snapshot participant name |
| `Year` | `singleSelect` | Snapshot year/classification |
| `Processed?` | `checkbox` | Marks processed attendance |
| `Feedback` | `singleLineText` | Optional feedback |
| `Interest in Future Sessions` | `singleSelect` | Follow-up signal |
| `Contact` | `multipleRecordLinks` | Link to `Contacts`; prefers single record |
| `Session` | `multipleRecordLinks` | Link to `Sessions`; prefers single record |
| `Visible To` | `multipleCollaborators` | Writable visibility list for admins/preachers |

Derived context fields:

| Field | Type | Notes |
| --- | --- | --- |
| `Session Date` | `multipleLookupValues` | From linked session |
| `Location` | `multipleLookupValues` | From linked session |
| `Session Preacher` | `multipleLookupValues` | From linked session owner |
| `Attendance Date` | `multipleLookupValues` | From linked session date |
| `Session Name` | `multipleLookupValues` | From linked session |
| `IsPast60Days` | `formula` | Recent-session helper |
| `Log Line` | `formula` | Attendance rollup helper |

Current Next.js `lib/airtable.ts` writes this older subset:

```text
Phone
Name
Attendance Date
```

That code path is behind the live relational model and should be updated before session-scoped attendance is enabled in the app.

### Airtable Sessions

`Sessions` is the catalog for operational sessions and the control point for public attendance links.

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `singleLineText` | Primary display field |
| `Notes` | `multilineText` | Operator notes |
| `Session Date` | `date` | Canonical session date |
| `Location` | `multipleRecordLinks` | Link to `Locations`; prefers single logical location |
| `Preacher` | `multipleRecordLinks` | Link to `Users`; prefers single record |
| `Status` | `singleSelect` | `Planned`, `Open`, `Completed`, `Cancelled` |
| `Public Attendance Enabled` | `checkbox` | Public attendance route gate |
| `Attendance Opens At` | `dateTime` | Optional open timestamp, `Asia/Kolkata` |
| `Attendance Closes At` | `dateTime` | Optional close timestamp, `Asia/Kolkata` |
| `Attendance URL` | `url` | Public attendance URL generated by Next.js |
| `Visible To` | `multipleCollaborators` | Writable visibility list for admins/preachers |
| `Analytics` | `multipleRecordLinks` | Link to singleton analytics record |
| `Attendance Records` | `multipleRecordLinks` | Inverse link from `Attendance.Session` |
| `Session Key` | `formula` | Human-readable computed key |
| `IsPast60Days` | `formula` | Recent-session helper |
| `Location Users` | `multipleLookupValues` | Users linked to the session location |
| `Attendee Count` | `count` | Count of linked attendance records |
| `Attachments` | `multipleAttachments` | Session attachments |
| `Attachment Summary` | `aiText` | Airtable AI-generated attachment summary |

### Airtable Users

`Users` is the staff/operator reference table and the business authorization source for the planned Supabase staff-auth migration.

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `singleLineText` | Primary display field |
| `Email` | `email` | Used to map Supabase users to Airtable staff records |
| `Role` | `singleSelect` | Live choices: `Admin`, `Preacher`, `Volunteer` |
| `Status` | `singleSelect` | `Active`, `Inactive` |
| `Locations` | `multipleRecordLinks` | Allowed/associated locations |
| `Portal Account` | `singleCollaborator` | Airtable runtime identity for current-user filtering |
| `Supabase User ID` | `singleLineText` | Planned bridge to Supabase `auth.users.id` |
| `Invited By` | `multipleRecordLinks` | Staff user who invited/created this user |
| `Assigned Preacher` | `multipleRecordLinks` | For volunteers, the preacher responsible for their submitted contacts |
| `Invite Status` | `singleSelect` | `Not Invited`, `Invited`, `Accepted`, `Revoked` |
| `Invite Sent At` | `dateTime` | Invite audit timestamp |
| `Deactivated At` | `dateTime` | Offboarding timestamp |
| `Deactivated By` | `singleLineText` | Offboarding actor/process |
| `Deactivation Reason` | `multilineText` | Offboarding note |
| `Assigned Contacts` | `multipleRecordLinks` | Inverse of `Contacts.Assigned Preacher` |
| `Collected Contacts` | `multipleRecordLinks` | Inverse of `Contacts.Collected By` |
| `Sessions` | `multipleRecordLinks` | Inverse of `Sessions.Preacher` |
| `Invited Users` | `multipleRecordLinks` | Inverse of `Users.Invited By` |
| `Assigned Volunteers` | `multipleRecordLinks` | Inverse of `Users.Assigned Preacher` |

Live staff records returned by MCP:

| Name | Email | Role | Status | Location scope | Portal account |
| --- | --- | --- | --- | --- | --- |
| Dwarakadhisha Dasa | `dwkd@hkmchennai.org` | `Admin` | `Active` | `Selaiyur` | populated |
| Dinesh Gudi | `gdinesh.8055@gmail.com` | `Preacher` | `Active` | `Bharath` | populated |
| Saikrishna Yarajarla | `yarajarlasaikrishna@gmail.com` | `Volunteer` | `Active` | empty | empty |

Observed gap: the active volunteer record did not return an `Assigned Preacher` value in the MCP read. Volunteer contact-routing depends on that relationship being populated.

### Airtable Locations

`Locations` is the reference table for location scope and session/contact grouping.

| Field | Type | Notes |
| --- | --- | --- |
| `Name` | `singleLineText` | Primary display field |
| `Code` | `singleLineText` | Stable lowercase code |
| `Status` | `singleSelect` | `Active`, `Inactive` |
| `Users` | `multipleRecordLinks` | Inverse of `Users.Locations` |
| `Contacts` | `multipleRecordLinks` | Inverse of `Contacts.Location` |
| `Sessions` | `multipleRecordLinks` | Inverse of `Sessions.Location` |

Live locations:

| Name | Code | Status |
| --- | --- | --- |
| Selaiyur | `selaiyur` | `Active` |
| Bharath | `bharath` | `Active` |

### Airtable Analytics

`Analytics` is a singleton aggregate-support table.

| Field | Type | Notes |
| --- | --- | --- |
| `SessionLog` | `multilineText` | Historical session-date evidence |
| `CommonID` | `multilineText` | Shared/singleton identifier |
| `Contacts 3` | `multipleRecordLinks` | Legacy inverse relationship |
| `Contacts` | `multipleRecordLinks` | Canonical contact relationship |
| `Sessions` | `multipleRecordLinks` | Linked sessions |
| `TotalSessionCount` | `rollup` | Total linked sessions |
| `Past60DaySessionCount` | `rollup` | Recent linked sessions |

There is one live analytics record: `reca0aQhvHSc5d5A1`.

## Browser-Side Data Models

### Current Auth Session

The checked-in app still uses local browser auth in `lib/auth-context.tsx`.

Stored in localStorage key `folk_auth`:

```json
{
  "username": "preacher",
  "role": "preacher"
}
```

Current static role type:

```ts
type UserRole = "volunteer" | "preacher"

interface User {
  username: string
  password: string
  role: UserRole
}
```

Planned staff auth moves the identity source to Supabase and keeps Airtable `Users.Role` plus `Users.Status` as the final business authorization source.

### Offline Queue Record

There are two queue-related models in the repo:

1. `public/sw.js` IndexedDB queue entries
2. `lib/offline-sync.ts` localStorage queue records

The explicit TypeScript shape exists in `lib/offline-sync.ts`:

```ts
interface OfflineRecord {
  id: string
  type: "registration" | "attendance" | "contact"
  data: Record<string, unknown>
  timestamp: number
}
```

The service worker queue stores:

- `id` as an auto-increment key
- `url`
- `method`
- `body`
- `timestamp`

## Feature Form Shapes

### Registration Form

Used in `app/register/page.tsx` and `components/registration-form.tsx`.

| Field | Type |
| --- | --- |
| `name` | string |
| `mobile` | string |
| `age` | string |
| `occupation` | string |
| `year` | string |
| `location` | string |

### Contact Form

Used in `components/contact-form.tsx`.

| Field | Type |
| --- | --- |
| `name` | string |
| `mobile` | string |
| `age` | string |
| `occupation` | string |
| `year` | string |
| `location` | string |

### Dashboard Attendance Record

Used in `components/live-attendance-dashboard.tsx`.

| Field | Type |
| --- | --- |
| `id` | string |
| `mobile` | string |
| `userName` | string |
| `createdAt` | string |

## Legacy / Transitional Models

`lib/store.ts` defines local `Registration` and `Attendance` interfaces plus sample centers:

- `registrations: Registration[]`
- `attendances: Attendance[]`
- `CENTERS`

These structures are not part of the active Airtable-backed attendance flow and should be treated as legacy or incomplete migration remnants unless proven otherwise.

## Schema Observations

- Airtable field names are part of the effective app/database contract and must be preserved carefully.
- Mobile number normalization to 10 digits remains a cross-cutting data rule.
- The live Airtable base is more advanced than the current `lib/airtable.ts` integration.
- Attendance should move from phone/date duplicate checks to `Contact + Session` duplicate checks.
- `Contacts.Visible To` is currently read-only lookup data; `Sessions.Visible To` and `Attendance.Visible To` are writable collaborator fields.
- Interface and portal filters are Airtable UI configuration, not managed by this repository.
- The active volunteer needs an `Assigned Preacher` before volunteer-created contact routing can be production-safe.

---

Generated from live Airtable MCP schema and record reads.
