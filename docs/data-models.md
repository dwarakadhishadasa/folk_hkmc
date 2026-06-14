# Data Models

## Overview

The project has two persistence layers:

- Airtable: operational application records
- Supabase Postgres/Auth: program-scoped staff authorization cache, identities, audit events, and invite logging

There are also browser-side transient shapes for auth state, offline queueing, and form state.

## Airtable Configuration

`lib/airtable.ts` resolves the active program through `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID`, then reads program-prefixed Airtable env vars first and generic env vars second. Table IDs fall back to the static mappings in `packages/program-config/src/programs/shared-airtable.ts`.

| Variable | Purpose |
| --- | --- |
| `AIRTABLE_API_TOKEN` | Airtable REST token |
| `AIRTABLE_BASE_ID` | Airtable base |
| `AIRTABLE_CONTACTS_TABLE_ID` | Contacts table |
| `AIRTABLE_ATTENDANCE_TABLE_ID` | Attendance table |
| `AIRTABLE_SESSIONS_TABLE_ID` | Sessions table |
| `AIRTABLE_USERS_TABLE_ID` | Staff users table |
| `AIRTABLE_LOCATIONS_TABLE_ID` | Locations table |
| `AIRTABLE_ANALYTICS_RECORD_ID` | Optional analytics link default |
| `AIRTABLE_MANAGEMENT_URL` | Optional explicit Airtable management URL; must be HTTPS and on `airtable.com` |
| `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID` | Optional `/manage` interface page |

Program-specific overrides use the active profile prefix:

| Program | Prefix examples |
| --- | --- |
| FOLK Chennai | `FOLK_AIRTABLE_API_TOKEN`, `FOLK_AIRTABLE_BASE_ID`, `FOLK_AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID` |
| Gita Life | `GITA_LIFE_AIRTABLE_API_TOKEN`, `GITA_LIFE_AIRTABLE_BASE_ID`, `GITA_LIFE_AIRTABLE_CONTACTS_TABLE_ID` |

## Airtable Records

### Contact

Source types: `ContactFields`, `ContactRecord`.

Fields used:

| Airtable field | Type/shape | Notes |
| --- | --- | --- |
| `Name` | string | Required for creation |
| `Phone` | string/number | Normalized to last 10 digits |
| `Age` | number | Public registration only |
| `Date of Birth` | string | Staff contact form; `YYYY-MM-DD` |
| `Year` | string | Student year or `Unknown` for working |
| `College` | string | Student contacts |
| `Company` | string | Working contacts |
| `Source` | string | e.g. `Public Registration`, `Attendance Registration`, `Pass distribution` |
| `Notes` | string | Staff comments |
| `Initial Contact` | date string | Current Asia/Kolkata date on create |
| `Last Contacted On` | date string | Current Asia/Kolkata date on create |
| `Location` | string or linked record array | Free text or Location record ID depending flow |
| `Assigned Preacher` | linked User IDs | Owner/routing |
| `Collected By` | linked User IDs | Collector or assigned Preacher |
| `Analytics` | linked Analytics IDs | Defaults to `AIRTABLE_ANALYTICS_RECORD_ID` |

### Attendance

Source types: `AttendanceFields`, `AttendanceRecord`.

Fields used:

| Airtable field | Type/shape | Notes |
| --- | --- | --- |
| `Contact` | linked Contact IDs | Required on create |
| `Session` | linked Session IDs | Required on create |
| `Phone` | string | Denormalized mobile |
| `Name` | string | Denormalized contact name |
| `Processed?` | boolean | Set to true |
| `Attendance Date` | string | Read fallback |

Attendance duplicate detection is by Contact within Session.

### Session

Source types: `SessionFields`, `SessionRecord`.

Fields used:

| Airtable field | Type/shape | Notes |
| --- | --- | --- |
| `Name` | string | Session name |
| `Session Date` | datetime string | Creation/start time |
| `Preacher` | linked User IDs | Current staff Preacher/Admin creator |
| `Location` | linked Location IDs | Session scope |
| `Analytics` | linked Analytics IDs | Default analytics record |
| `Attendance Records` | linked Attendance IDs | Used for efficient session reads |
| `Public Attendance Enabled` | boolean | Must be true to accept public attendance |
| `Attendance Opens At` | datetime string | Window start |
| `Attendance Closes At` | datetime string | Window end |
| `Duration Minutes` | number | 1 to 1440 |
| `Attendance URL` | string | Generated `/attend?session=<id>` URL |

### Staff User

Source types: `UserFields`, `StaffUser`.

Fields used:

| Airtable field | Type/shape | Notes |
| --- | --- | --- |
| `Name` | string | Staff display name |
| `Email` | string | Lowercased, used for sign-in |
| `Role` | `Admin`, `Preacher`, `Volunteer` | Required |
| `Status` | `Active`, `Inactive` | Only active users can sign in |
| `Locations` | linked Location IDs | Admin/Preacher scope |
| `Portal Account` | string | Present but not central to current auth |
| `Supabase User ID` | string | Synced to Supabase Auth user ID |
| `Invited By` | linked User IDs | Invite audit in Airtable |
| `Assigned Preacher` | linked User IDs | Volunteer routing |

### Location

Source types: `LocationFields`, `LocationRecord`.

Fields used:

| Airtable field | Type/shape | Notes |
| --- | --- | --- |
| `Name` | string | Display and duplicate lookup |
| `Status` | string | Shown in admin invite form if not active |

## Supabase Tables

Defined in `supabase/migrations/*` and typed in `lib/supabase/types.ts`.

### `public.programs`

Known program registry.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text | Primary key; currently `folk` or `gita-life` |
| `name` | text | Program display name |
| `status` | text | `Active` or `Inactive` |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Trigger-maintained |

RLS is enabled.

### `public.staff_memberships`

Primary program-scoped authorization cache. `getStaffContext()` prefers this table and refreshes from Airtable when the membership is stale.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `program_id` | text | References `programs(id)` |
| `user_id` | uuid | References `auth.users(id)` |
| `email` | text | Lowercased staff email |
| `airtable_user_id` | text | Program Airtable User record ID |
| `name` | text nullable | Staff display name |
| `role` | text | `Admin`, `Preacher`, `Volunteer` |
| `status` | text | `Active`, `Inactive`, `Suspended`, `Revoked` |
| `location_ids` | text[] | Staff location scope |
| `assigned_preacher_airtable_user_id` | text nullable | Volunteer routing |
| `last_synced_at` | timestamptz | Used by stale-sync checks |
| `revoked_at` | timestamptz nullable | Present for revocation tracking |
| `sync_source` | text | Defaults to `airtable` |
| `sync_state` | text | `ok`, `stale`, or `failed`; must be `ok` for access |
| `sync_error` | text nullable | Last sync failure detail |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Trigger-maintained |

Unique constraints cover `(program_id, user_id)` and lowercased `(program_id, email)`. RLS is enabled; app reads/writes use the service-role client.

### `public.staff_profiles`

Legacy-compatible authorization cache keyed by Supabase Auth user ID. New syncs still update this table for compatibility, but program-scoped authorization should treat `staff_memberships` as the primary source.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key; references `auth.users(id)` |
| `program_id` | text | Added for program compatibility; defaults to `folk` |
| `email` | text | Unique |
| `airtable_user_id` | text | Required Airtable User ID |
| `name` | text nullable | Staff display name |
| `role` | text | `Admin`, `Preacher`, `Volunteer` |
| `status` | text | `Active`, `Inactive` |
| `membership_status` | text | `Active`, `Inactive`, `Suspended`, `Revoked`; mapped from Airtable status today |
| `location_ids` | text[] | Staff location scope |
| `assigned_preacher_airtable_user_id` | text nullable | Volunteer routing |
| `last_synced_at` | timestamptz | Updated on profile sync |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Trigger-maintained |

RLS is enabled. Current server access uses the Supabase service-role client.

### `public.airtable_identities`

Maps program-scoped Airtable users to Supabase users.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `program_id` | text | References `programs(id)` |
| `user_id` | uuid | References `auth.users(id)` |
| `airtable_base_id` | text | Program Airtable base ID |
| `airtable_user_id` | text | Program Airtable User record ID |
| `email` | text | Staff email |
| `last_synced_at` | timestamptz | Last Airtable identity sync |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Trigger-maintained |

Unique constraints cover `(program_id, airtable_user_id)` and `(program_id, user_id)`. RLS is enabled.

### `public.airtable_sync_state`

Program/source sync health table reserved for Airtable sync state.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `program_id` | text | References `programs(id)` |
| `source` | text | Sync source name |
| `status` | text | `ok`, `stale`, or `failed` |
| `last_synced_at` | timestamptz nullable | Last successful sync |
| `error_message` | text nullable | Last failure detail |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Trigger-maintained |

RLS is enabled.

### `public.audit_events`

Authorization/audit event log written by `writeAuditEvent()`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | Primary key |
| `program_id` | text | References `programs(id)` |
| `actor_supabase_user_id` | uuid nullable | Supabase actor |
| `actor_airtable_user_id` | text nullable | Airtable actor |
| `actor_role` | text nullable | Staff role at event time |
| `action` | text | Event action |
| `target_id` | text nullable | Optional target |
| `source` | text | Event source, e.g. `authz` |
| `sync_state` | text nullable | Membership sync state |
| `metadata` | jsonb | Additional event metadata |
| `created_at` | timestamptz | Default `now()` |

RLS is enabled.

### `public.invite_log`

Invite audit log written by `lib/invite-log.ts`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | Primary key |
| `program_id` | text nullable | Program for the invite; defaults to `folk` for legacy rows |
| `invitee_email` | text | Lowercased |
| `airtable_user_id` | text nullable | Invited Airtable User |
| `inviter_airtable_user_id` | text nullable | Inviter in Airtable |
| `inviter_supabase_user_id` | uuid nullable | Inviter Supabase user |
| `invitee_role` | text | Staff role |
| `status` | text | `pending`, `sent`, `failed`, `accepted` |
| `error_message` | text nullable | Supabase invite error |
| `invited_at` | timestamptz | Defaults to now |
| `accepted_at` | timestamptz nullable | Present but not currently updated in code |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Trigger-maintained |

## In-Memory And Client State

### `StaffContext`

Returned by `/api/auth/me` and used by `AuthProvider`:

```ts
interface StaffContext {
  programId: "folk" | "gita-life"
  supabaseUserId: string
  email: string
  airtableUserId: string
  name: string
  role: "Admin" | "Preacher" | "Volunteer"
  status: "Active" | "Inactive" | "Suspended" | "Revoked"
  locationIds: string[]
  assignedPreacherAirtableUserId?: string
  lastSyncedAt: string
}
```

### Auth Provider State

`lib/auth-context.tsx` stores React state only:

- `staff`
- `isHydrated`
- derived role booleans

It does not own durable auth credentials. Supabase cookies and Supabase browser client session state do that.

### Service Worker Queue

`public/sw.js` stores failed POST requests in IndexedDB:

```ts
{
  id: number,
  url: string,
  method: "POST",
  body: string,
  timestamp: number
}
```

The store is `pending-requests` in `folk-offline-db`.

### Legacy Local Offline Store

`lib/offline-sync.ts` defines a separate localStorage queue:

```ts
{
  id: string,
  type: "registration" | "attendance",
  data: Record<string, unknown>,
  timestamp: number
}
```

This path is not active because `OfflineSyncProvider` is not mounted.

### Legacy In-Memory Store

`lib/store.ts` defines `registrations`, `attendances`, and static `CENTERS`. Current route handlers do not use this store for production behavior.

## Data Integrity Rules

- Mobile numbers normalize to the last 10 digits.
- Staff email is trimmed and lowercased.
- Session attendance requires an open eligible session.
- Contact creation always links the default analytics record.
- Staff profile/membership sync rejects inactive or missing Airtable staff users.
- Staff membership access requires matching program, email, active status, trusted `sync_state`, and fresh `last_synced_at`.
- Preacher session access is limited by linked Preacher ID or overlapping location scope.
