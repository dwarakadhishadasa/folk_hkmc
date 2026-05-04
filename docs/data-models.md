# folk_hkmc - Data Models

**Date:** 2026-04-23

## Overview

The application does not use a traditional relational schema, ORM, or migration system. Instead, the active data model is split across:

- Airtable records for contacts and attendance
- browser-side auth/session data
- browser-side offline queue records
- legacy in-memory TypeScript types in `lib/store.ts`

## External Data Models

### Airtable Contact Record

Defined by usage in `lib/airtable.ts`.

| Field | Type | Usage |
| --- | --- | --- |
| `id` | string | Airtable record identifier |
| `fields.Name` | string | Participant/contact name |
| `fields.Phone` | string or number | Lookup key for registration and attendance |
| `fields.Year` | string | Student year / classification |
| `fields.Source` | string | Registration source |
| `fields.Age` | number | Age captured during registration |
| `fields.Location` | string | Participant location |

### Airtable Attendance Record

Defined by usage in `lib/airtable.ts`.

| Field | Type | Usage |
| --- | --- | --- |
| `id` | string | Airtable record identifier |
| `fields.Phone` | string or number | Participant mobile number |
| `fields.Name` | string | Participant display name |
| `fields["Attendance Date"]` | string | ISO-like date used for duplicate checks and dashboard display |

## Browser-Side Data Models

### Auth Session

Stored in localStorage key `folk_auth`.

```json
{
  "username": "preacher",
  "role": "preacher"
}
```

Related source: `lib/auth-context.tsx`

### Static User Credentials

```ts
type UserRole = "volunteer" | "preacher"

interface User {
  username: string
  password: string
  role: UserRole
}
```

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

- `id` (auto-increment key)
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

### In-Memory Store Types

`lib/store.ts` defines local `Registration` and `Attendance` interfaces plus sample centers:

- `registrations: Registration[]`
- `attendances: Attendance[]`
- `CENTERS`

These structures are not part of the active Airtable-backed attendance flow and should be treated as legacy or incomplete migration remnants unless proven otherwise.

## Schema Observations

- There are no database migration files or schema-management tools in the repo
- Airtable field names are part of the effective contract and must be preserved
- Mobile number normalization to 10 digits is a cross-cutting data rule
- Date comparisons depend on string-based ISO date handling

---

Generated using the BMAD `document-project` workflow pattern.
