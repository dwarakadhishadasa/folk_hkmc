# Data Model Mapping

Airtable → Supabase field-level mapping for the migration. Airtable shapes are per `lib/airtable.ts` and the adopted `docs/data-models.md`; Supabase targets follow `supabase/migrations/20261004000000_create_core_tables.sql`, extended where noted.

## Global changes

- Airtable `rec*` record IDs → Postgres `UUID` primary keys. All stored IDs, client-side ID validation (`rec*` regexes), and linked-record arrays are affected.
- Airtable linked-record arrays (`string[]`) → UUID foreign keys / join rows.
- Every table gains `program_id TEXT` (`folk` | `gita-life`); program-prefixed env config disappears with Airtable.
- `createdTime` → `created_at TIMESTAMPTZ`.
- Asia/Kolkata date strings (`Initial Contact`, `Last Contacted On`, session-day filtering) remain date strings / date semantics, timezone Asia/Kolkata.

## Contacts

| Airtable field | Supabase column | Notes |
| --- | --- | --- |
| `Name` | `name` | required |
| `Phone` | `phone` | normalized last-10-digits; unique per program |
| `Age` | `age` | |
| `Date of Birth` | `date_of_birth` | |
| `Year` | `year` | student year / `Unknown` for working |
| `College` / `Company` / `Designation` | same-named snake_case | |
| `Source` | `source` | **gap:** missing from core-tables migration; add |
| `Notes` | `notes` | |
| `Initial Contact` / `Last Contacted On` | `initial_contact` / `last_contacted_on` | Asia/Kolkata date on create |
| `Address` | `address` | |
| `Location` (text or linked) | `location_ids TEXT[]` → **normalize to UUID FK(s)** | free-text location entries need resolution during backfill |
| `Assigned Preacher` (linked Users) | `assigned_preacher_id UUID` | references `public.users` |
| `Collected By` (linked Users) | `collected_by_id UUID` | references `public.users` |
| `Analytics` (linked) | — | dropped (decided 2026-10-05, OQ-3) |
| `Photo` (attachment) | `photo_path TEXT` → Supabase Storage object | used by the manage interface (CAP-9); attachments export with the Airtable API as URLs, fetch + upload to a **private** `contact-photos` bucket during backfill; render via signed URLs |
| `Rounds` | `rounds TEXT` | used by the manage interface |
| `Books Read` (multi-select) | `books_read TEXT[]` | used by the manage interface |
| Favorite marker (interface "Favorites") | `is_favorite BOOLEAN DEFAULT false` | used by the manage interface |
| `TotalAttendanceCount` (rollup) | — computed | SQL view/query over `attendance`, not a stored column |
| `Past60DayAttendanceCount` (rollup) | — computed | SQL view/query over `attendance`, not a stored column |

## Locations

| Airtable field | Supabase column |
| --- | --- |
| `Name` | `name` |
| `Status` | `status` (default `Active`) |

## Sessions

| Airtable field | Supabase column | Notes |
| --- | --- | --- |
| `Name` | `name` | |
| `Session Date` | `session_date` | |
| `Preacher` (linked Users) | `preacher_id UUID` | owning preacher, references `public.users`; for Assistant-created sessions this is the assigned preacher |
| `Location` (linked) | `location_id UUID` | |
| `Public Attendance Enabled` | `public_attendance_enabled` | |
| `Attendance Opens At` / `Attendance Closes At` | `attendance_opens_at` / `attendance_closes_at` | window eligibility logic in `lib/attendance-session.ts` unchanged |
| `Duration Minutes` | `duration_minutes` | |
| `Attendance URL` | `attendance_url` | generated server-side from `NEXT_PUBLIC_SITE_URL` |
| `Created By` (linked Users) | `created_by UUID` | references `public.users`; **creator scoping is the RLS key for sessions** |
| `Analytics` / `Attendance Records` | — | dropped / replaced by FK from attendance |

## Attendance

| Airtable field | Supabase column | Notes |
| --- | --- | --- |
| `Contact` (linked) | `contact_id UUID` FK | required |
| `Session` (linked) | `session_id UUID` FK | required; unique `(contact_id, session_id)` replaces app-level duplicate check (409 contract kept) |
| `Phone` / `Name` | `phone` / `name` | denormalized for the dashboard feed |
| `Processed?` | — | always true on create; drop |
| `Attendance Date` | `created_at` | read fallback today; `created_at` covers it |

## Users (Airtable Users table → Supabase `public.users`)

Generalized beyond staff/preachers (decided 2026-10-06): one `public.users` table covers **all** roles — Admin, Preacher, Volunteer, Assistant. Distinct from `auth.users`: `public.users.id` = `auth.users.id`, one row per user per program.

| Airtable field | Supabase target | Notes |
| --- | --- | --- |
| `Name`, `Email` | `users.name`, `users.email` | email is the join key to Supabase Auth; `UNIQUE(program_id, email)` |
| `Role` | `users.role` | TEXT + CHECK IN (Admin, Preacher, Volunteer, Assistant) — not a pg enum (assumed 2026-10-06) |
| `Status` | `users.status` | TEXT + CHECK IN (Active, Inactive, Suspended, Revoked) |
| `Locations` (linked) | `users.location_ids UUID[]` | array column (assumed 2026-10-06; no join table) |
| `Supabase User ID` | `users.id` = `auth.users.id` | the bridge direction inverts: Supabase becomes source |
| `Invited By` | `users.invited_by` UUID | |
| `Assigned Preacher` | `users.assigned_preacher_id` UUID | Assistant → Preacher |
| `Portal Account` | — | drop unless a consumer is found |
| (bridge) `staff_memberships`, `staff_profiles`, `airtable_identities` | superseded | per SPEC assumption; `audit_events` retained |
