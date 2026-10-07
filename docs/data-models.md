# Data Models

## Overview

Supabase Postgres is the only operational datastore. Every program-scoped entity — contacts, attendance, sessions, locations, and staff users — lives in Postgres, and Supabase Auth owns identity. Every server read and write goes through `lib/supabase/data.ts` (service-role client) or the scoped RLS policies described below.

There are no Airtable environment variables, and no Airtable access layer exists in the repo.

There are also browser-side transient shapes for auth state, offline queueing, and form state.

## Supabase Configuration

`lib/supabase/admin.ts` and `lib/supabase/server.ts` resolve the project from the environment. The active program is resolved separately by `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID` through `packages/program-config`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL; `SUPABASE_URL` is accepted as a server-side fallback |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key for browser and server auth clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy anon-key fallback |
| `SUPABASE_PUBLISHABLE_KEY` | Server-side fallback when the `NEXT_PUBLIC_*` value is absent |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Bypasses RLS; used by every server route |
| `NEXT_PUBLIC_SITE_URL` | Absolute site origin used to build attendance links |

Program separation is by `program_id` column, not by separate projects or per-program credentials: every table carries `program_id` and both `folk` and `gita-life` live in the same Supabase project.

## Core Records

Record IDs are UUIDs (`gen_random_uuid()`), not external `rec…` strings. The `*Record` interfaces below are the shapes `lib/supabase/data.ts` returns to routes.

### Contact

Source types: `ContactFields`, `ContactRecord`. Table `public.contacts`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `program_id` | text | Program scope; part of the phone uniqueness key |
| `name` | text | Required for creation |
| `phone` | text | Normalized to last 10 digits |
| `age` | integer | Public registration only |
| `date_of_birth` | text | Staff contact form; `YYYY-MM-DD` |
| `year` | text | Student year or `Unknown` for working |
| `college` | text | Student contacts |
| `company` | text | Working contacts |
| `designation` | text | Gita Life contact field |
| `notes` | text | Staff comments |
| `source` | text | e.g. `Public Registration`, `Attendance Registration`, `Pass distribution` |
| `initial_contact` | text | Current Asia/Kolkata program date on create |
| `last_contacted_on` | text | Current Asia/Kolkata program date on create |
| `address` | text | Street address |
| `location_ids` | text[] | Location scope; no join table |
| `assigned_preacher_id` | uuid | FK → `public.users(id)`, `ON DELETE SET NULL` |
| `collected_by_id` | uuid | FK → `public.users(id)`, `ON DELETE SET NULL` |
| `photo_path` | text | Storage object path in the private `contact-photos` bucket |
| `rounds` | text | Rounds completed |
| `books_read` | text[] | Books distributed/read |
| `is_favorite` | boolean | Drives the favorites view in `/manage` |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

Unique index `idx_contacts_phone_program` covers `(phone, program_id)` — one contact per phone per program, enforced by Postgres. Indexed on `program_id` and `phone`.

The former Airtable `Analytics` linked record has no column and no default link.

### Attendance

Source types: `AttendanceFields`, `AttendanceRecord`. Table `public.attendance`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `program_id` | text | Program scope |
| `contact_id` | uuid | FK → `public.contacts(id)`; required |
| `session_id` | uuid | FK → `public.sessions(id)`; required |
| `phone` | text | Denormalized mobile |
| `name` | text | Denormalized contact name |
| `created_at` | timestamptz | Default `now()` |

Unique index `idx_attendance_contact_session` covers `(contact_id, session_id)` — one attendance row per contact per session. A duplicate insert surfaces as Postgres `23505`, which the route maps to `409`. Indexed on `program_id`, `contact_id`, `session_id`, and `created_at`.

### Session

Source types: `SessionFields`, `SessionRecord`. Table `public.sessions`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `program_id` | text | Program scope |
| `name` | text | Session name |
| `session_date` | text | Creation/start time |
| `preacher_id` | uuid | FK → `public.users(id)`, `ON DELETE SET NULL` |
| `location_id` | uuid | FK → `public.locations(id)`, `ON DELETE RESTRICT` |
| `public_attendance_enabled` | boolean | Must be true to accept public attendance |
| `attendance_opens_at` | timestamptz | Window start |
| `attendance_closes_at` | timestamptz | Window end |
| `duration_minutes` | integer | 1 to 1440 |
| `attendance_url` | text | Generated `/attendance?session=<uuid>` URL |
| `created_by` | uuid | FK → `public.users(id)`, `ON DELETE SET NULL`; drives session RLS scope |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

`sessions.location_id` is `ON DELETE RESTRICT` so a location with sessions cannot be deleted silently. The former Airtable `Analytics` link is dropped.

### Location

Source types: `LocationFields`, `LocationRecord`. Table `public.locations`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `program_id` | text | Program scope |
| `name` | text | Display and duplicate lookup |
| `status` | text | Defaults to `Active`; shown in the admin invite form if not active |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

### Staff User

Source types: `UserFields`, `StaffUser`. Table `public.users` — **the staff source of truth** for all four roles.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key; `REFERENCES auth.users(id) ON DELETE CASCADE` |
| `program_id` | text | Program scope |
| `email` | text | Trimmed and lowercased; `UNIQUE (program_id, email)` |
| `name` | text nullable | Staff display name |
| `role` | text | `CHECK IN ('Admin', 'Preacher', 'Volunteer', 'Assistant')` |
| `status` | text | `CHECK IN ('Active', 'Inactive', 'Suspended', 'Revoked')`; defaults to `Active` |
| `location_ids` | uuid[] | Location scope; no join table |
| `assigned_preacher_id` | uuid | FK → `public.users(id)`, `ON DELETE SET NULL`; Volunteer/Assistant routing |
| `invited_by` | uuid | UUID of the inviting staff row |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

`role` and `status` are `TEXT` with `CHECK` constraints, not Postgres enums. Because `id` references `auth.users(id)`, the auth account and the staff record share one UUID — there is no separate identity table and no sync step.

RLS is enabled. Authenticated users may read their own row, or every row in their own program when Admin. There are no authenticated write policies; server routes write with the service role.

Indexed on `program_id` and `assigned_preacher_id`.

### `public.contact_attendance_counts`

View (not a table) used by the `/manage` contacts table. Rolls attendance up per contact:

| Column | Type | Notes |
| --- | --- | --- |
| `contact_id` | uuid | `public.contacts.id` |
| `total_attendance_count` | bigint | All attendance rows for the contact |
| `past_60_day_attendance_count` | bigint | Rows in the rolling 60-day window, computed against `now() AT TIME ZONE 'Asia/Kolkata'` |

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

### `public.audit_events`

Authorization/audit event log written by `writeAuditEvent()`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | Primary key |
| `program_id` | text | References `programs(id)` |
| `actor_supabase_user_id` | uuid nullable | Supabase actor |
| `actor_user_id` | text nullable | Actor's `public.users` UUID; renamed from the Airtable-era name by `20261007000000_retire_airtable_named_columns.sql` |
| `actor_role` | text nullable | Staff role at event time |
| `action` | text | Event action |
| `target_id` | text nullable | Optional target |
| `source` | text | Event source, e.g. `authz` |
| `sync_state` | text nullable | Membership sync state |
| `metadata` | jsonb | Additional event metadata |
| `created_at` | timestamptz | Default `now()` |

RLS is enabled. The Airtable-era `actor_airtable_user_id` column was renamed to `actor_user_id` by `20261007000000_retire_airtable_named_columns.sql`; the rename kept the column so the existing audit history survives. `writeAuditEvent` writes it from `actorUserId`, and its current in-repo callers pass only `actorSupabaseUserId` — so `actor_user_id` is present but empty for every row written today, and `actor_supabase_user_id` (which carries `public.users.id`) is the actor id that is actually populated.

### `public.invite_log`

Invite audit log written by `lib/invite-log.ts`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | Primary key |
| `program_id` | text nullable | Program for the invite |
| `invitee_email` | text | Lowercased |
| `user_id` | text nullable | Invitee `public.users` UUID; renamed from the Airtable-era name by `20261007000000_retire_airtable_named_columns.sql` |
| `inviter_user_id` | text nullable | Inviter `public.users` UUID; renamed from the Airtable-era name by the same migration |
| `inviter_supabase_user_id` | uuid nullable | Inviter Supabase user |
| `invitee_role` | text | Staff role |
| `status` | text | `pending`, `sent`, `failed`, `accepted` |
| `error_message` | text nullable | Supabase invite error |
| `invited_at` | timestamptz | Defaults to now |
| `accepted_at` | timestamptz nullable | Present but not currently updated in code |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Trigger-maintained |

### Legacy Bridge Tables (dropped)

`public.staff_memberships`, `public.staff_profiles`, `public.airtable_identities`, and `public.airtable_sync_state` were the Airtable→Supabase synchronization bridge. No runtime code read or wrote them once `public.users` became authoritative, and `supabase/migrations/20261007000000_retire_airtable_named_columns.sql` dropped all four on the hosted project. The migration files that created them remain in `supabase/migrations/` as applied history and must not be deleted; the tables themselves no longer exist.

Use `public.users`. If you need the pre-migration data, it survives in the read-only archive project (`cparpinmalqsimninyfw`), never in this one.

## Row-Level Security

RLS is the scope enforcement layer for authenticated reads. Writes are service-role only, so RLS never governs an insert or update. The scope contract is defined in `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md`.

Scope resolves through the caller's `public.users` row keyed by `auth.uid()`, and **only when that row is `status = 'Active'`**. A missing or non-Active row yields `NULL`/empty scope and therefore zero visible rows.

### Helper functions

All are `STABLE`, `SECURITY DEFINER`, pinned to `search_path = public, pg_temp`, and executable only by `authenticated` and `service_role`.

| Function | Returns | Meaning |
| --- | --- | --- |
| `public.caller_role()` | text | Caller's role, `NULL` when the caller has no `Active` `users` row |
| `public.caller_program_id()` | text | Caller's program under the same condition |
| `public.caller_assigned_preacher_id()` | uuid | Caller's assigned preacher, `NULL` unless both rows are `Active` |
| `public.caller_effective_location_ids()` | uuid[] | Preacher's own `location_ids`; a Volunteer/Assistant's active assigned preacher's `location_ids`; `{}` otherwise |
| `public.caller_can_read_attendance_session(session_id)` | boolean | TRUE when the session is in the caller's program and its `preacher_id` is the caller or the caller's active assigned preacher |

### Read policies

| Table | Policy | Visible rows |
| --- | --- | --- |
| `public.users` | "Users can read own row or program rows as admin" | Own row always; all rows in own program when Admin |
| `public.contacts` | "Contacts are scoped by caller role and program" | Program **and** (Admin ∨ Preacher with `assigned_preacher_id = caller` ∨ Assistant with `assigned_preacher_id = caller's active assigned preacher`) |
| `public.sessions` | "Sessions are scoped by creator and program" | Program **and** (Admin ∨ Preacher/Assistant with `created_by = caller` ∨ Assistant with `created_by = caller's active assigned preacher`) |
| `public.attendance` | "Attendance is scoped by session preacher and program" | Program **and** (Admin ∨ (Preacher/Assistant ∨ Assistant) where `caller_can_read_attendance_session(session_id)`) |
| `public.locations` | "Locations are scoped by effective locations and program" | Program **and** (Admin ∨ `id = ANY(caller_effective_location_ids())`) |

A Volunteer with an assigned preacher falls through to zero rows on contacts, sessions, and attendance; their location scope is the assigned preacher's.

`node scripts/verify-rls.mjs` exercises all 75 checks against the hosted project.

## In-Memory And Client State

### `StaffContext`

Resolved by `getStaffContext()` in `lib/authz.ts`, returned by `GET /api/auth/me`, and consumed by `AuthProvider`:

```ts
interface StaffContext {
  programId: "folk" | "gita-life"
  supabaseUserId: string
  email: string
  userId: string                 // public.users.id (UUID)
  name: string
  role: "Admin" | "Preacher" | "Volunteer" | "Assistant"
  status: "Active" | "Inactive" | "Suspended" | "Revoked"
  locationIds: string[]
  assignedPreacherUserId?: string // public.users.assigned_preacher_id (UUID)
  lastSyncedAt: string
}
```

`userId` and `assignedPreacherUserId` are `public.users` UUIDs — the same vocabulary used by the contact and invite request bodies.

### Auth Provider State

`lib/auth-context.tsx` stores React state only:

- `staff`
- `isHydrated`
- derived role booleans

It does not own durable auth credentials. Supabase cookies and the Supabase browser client session state do that.

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

The store is `pending-requests` in `folk-offline-db`. Queued paths are `/api/contact`, `/api/registration`, `/registration`, and `/attendance`; replay targets the original URL, `409` counts as synced, and an offline submission returns a synthetic `202 {queued: true}`.

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

This path is not active because `OfflineSyncProvider` is not mounted. The service worker above is the live offline queue.

### Legacy In-Memory Store

`lib/store.ts` defines `registrations`, `attendances`, and static `CENTERS`. Current route handlers do not use this store for production behavior.

## Data Integrity Rules

- Mobile numbers normalize to the last 10 digits.
- Staff email is trimmed and lowercased.
- Session attendance requires an open eligible session.
- One contact per phone per program is enforced by the `idx_contacts_phone_program` unique index, not by application code.
- One attendance row per contact per session is enforced by the `idx_attendance_contact_session` unique index.
- Staff access requires an `Active` `public.users` row matching the caller's `auth.uid()` and program; a missing or non-Active row resolves to zero visible rows.
- Preacher session access is limited by `created_by` or, for attendance, by the parent session's `preacher_id`.
