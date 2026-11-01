# Data model and queries — Sessions

## Tables used

| Table | Fields |
|---|---|
| `sessions` | `id`, `program_id`, `name`, `session_date` (`DATE`), `preacher_id`, `location_id`, `duration_minutes`, `attendance_opens_at`, `attendance_closes_at`, `attendance_url`, `public_attendance_enabled`, `created_by` |
| `attendance` | `id`, `program_id`, `contact_id`, `session_id`, `phone`, `name`, `created_at`; unique `(contact_id, session_id)` |
| `contacts` | `id`, `name`, `phone`, `location_ids`, `assigned_preacher_id`, `initial_contact`, `created_at` |
| `locations` | `id`, `name` |

No table or column changes. Read-only functions are added and called with
`.rpc()` from the service-role client.

## Scope

Aligned with the `sessions` RLS policy
(`20261007120000_scope_sessions_by_preacher.sql`):

| Role | Sessions visible |
|---|---|
| Admin | `program_id = p_program_id` |
| Preacher | `program_id` and (`created_by = p_user_id` or `preacher_id = p_user_id` or `created_by in (select id from users where assigned_preacher_id = p_user_id and status = 'Active')`) |
| Assistant | `program_id` and (`created_by = p_user_id` or `preacher_id = p_user_id` or `created_by = p_assigned_preacher_id` or `preacher_id = p_assigned_preacher_id`) |

- A Preacher's assigned-preacher id is null, so the assistant-created subquery is
  what adds the sessions their assigned assistants created.
- An Assistant with no active assigned preacher passes null, leaving their own
  creations.
- This widens today's `GET /api/sessions` (`created_by` only). It is a deliberate
  behaviour change, not a reuse.

## Functions

All are `security invoker`, `revoke all ... from public, anon, authenticated`,
`grant execute ... to service_role`. The app calls them with the service-role
client after the staff assertion.

### `sessions_visible(p_program_id text, p_user_id uuid, p_role text, p_assigned_preacher_id uuid)`

```sql
returns setof sessions
-- Admin: program.
-- Preacher: created_by = p_user_id OR preacher_id = p_user_id
--           OR created_by IN (active staff assigned to p_user_id).
-- Assistant: created_by = p_user_id OR preacher_id = p_user_id
--           OR created_by/preacher_id = p_assigned_preacher_id.
```

The single scope predicate every other function uses.

### `sessions_overview(p_program_id text, p_user_id uuid, p_role text, p_assigned_preacher_id uuid)`

```sql
returns table (
  id uuid, name text, session_date date, location_id uuid,
  location_name text, attendance_count bigint, status text,
  attendance_url text, opens_at timestamptz, closes_at timestamptz
)
```

- One row per visible session, newest first by `coalesce(attendance_opens_at, session_date)` desc, then `id`.
- `attendance_count` = `count(attendance)` for the session.
- `location_name` from a left join; `—` when null or the location was deleted.
- `status` = the derivation below.
- `location_id` is what the desktop location filter matches; `opens_at` and
  `closes_at` are the boundaries the overview's one timer arms against.
- The page shows the total and the filtered count; the table virtualises.

### `sessions_overview_stats(p_program_id text, p_user_id uuid, p_role text, p_assigned_preacher_id uuid)`

```sql
returns table (
  sessions_count bigint,
  attendees_total bigint,
  avg_attendance_current numeric,
  avg_attendance_previous numeric,
  repeat_attendees bigint,
  upcoming_count bigint
)
```

| Figure | Definition |
|---|---|
| Sessions | visible sessions |
| Attendees | attendance rows on visible sessions |
| Avg attendance (current month) | attendees ÷ sessions whose start falls in the current calendar month, `Asia/Kolkata` |
| Avg attendance (previous month) | same for the previous calendar month |
| Delta | `round(current - previous)`, rendered signed (`+4`, `−3`, `0`) |
| Repeat attendees | distinct contacts with at least two attendance rows on visible sessions (attended a session previously) |
| Upcoming | visible sessions whose derived status is `Upcoming` |

Sessions with zero attendance count in the average denominator.

### `sessions_report(p_program_id text, p_user_id uuid, p_role text, p_assigned_preacher_id uuid, p_from date, p_to date)`

```sql
returns jsonb  -- { sessions_run, total_attendance, avg_per_session,
               --   repeat_rate, by_session: [...], weekly: [...], top: [...] }
```

- Range: session start (`coalesce(attendance_opens_at, session_date)`) between
  `p_from` and `p_to` inclusive, in `Asia/Kolkata`. The Overview calls this with
  the default last-90-days window; the separate Reports route is retired, so
  `by_session` and `weekly` are the two rendered fields and `top` is retained
  only for callers that still ask for it.
- `total_attendance` counts attendance rows for those sessions.
- `avg_per_session` = total ÷ sessions run (0 when none).
- `repeat_rate` = distinct contacts with ≥ 2 attendances in range ÷ distinct
  contacts in range (0 when the denominator is 0).
- `by_session` = top 4 by count; `top` = top 3 by count. Ties break by session
  start desc, then id.
- `weekly` buckets `attendance.created_at` by ISO week in `Asia/Kolkata`,
  clamped to the range (`greatest(created_at, from)`, `least(created_at, to)`),
  with `created_at is null` falling back to the session date. The series sums to
  `total_attendance`.

### `session_attendees(p_session_id uuid, p_program_id text, p_user_id uuid, p_role text, p_assigned_preacher_id uuid)`

```sql
returns table (
  contact_id uuid, name text, phone text, location_names text,
  sessions_attended bigint, first_session date
)
```

- Returns rows only when the session is visible; a missing or foreign id gives
  an empty result and the handler maps it to 404.
- `name`/`phone` fall back to the stored `attendance` snapshot when the contact
  is missing (the FK makes that unreachable in practice).
- `sessions_attended` and `first_session` count only visible sessions.
- Order: attendance order, then contact name.

### `contact_attendance_summary(p_contact_id uuid, p_program_id text, p_user_id uuid, p_role text, p_assigned_preacher_id uuid)`

```sql
returns jsonb  -- { name, phone, notes, location_names, preacher_name,
               --   first_contact, last_contacted, collected_by_name, favorite,
               --   sessions_attended, past_60_day_attendance, last_attended,
               --   history: [{ session_name, session_date, attended }] }
```

- `first_contact` = `contacts.initial_contact`, falling back to `contacts.created_at`, then `—`.
- `last_contacted` = `contacts.last_contacted_on`; `collected_by_name` resolves
  `contacts.collected_by_id`; `favorite` is `contacts.is_favorite`; `notes` is
  the stored note.
- `past_60_day_attendance` counts the contact's attendance rows on visible
  sessions whose start is within the last 60 days.
- `last_attended` = latest visible session the contact attended.
- History lists attended sessions only; no `Absent` rows exist.

## Status derivation

SQL shape, applied per visible session:

```sql
opens_ts  = attendance_opens_at
           ?? (session_date::timestamp AT TIME ZONE 'Asia/Kolkata')
closes_ts = attendance_closes_at
           ?? opens_ts + make_interval(mins => coalesce(duration_minutes, 60))

case
  when opens_ts is null            then 'Completed'
  when now() >= closes_ts          then 'Completed'
  when now() < opens_ts            then 'Upcoming'
  else 'Live now'
end
```

- `public_attendance_enabled` is always true and is not read for status; only
  the creation window and duration decide the state.
- No dates at all → `Completed`, never an endless `Live now`.
- The overview client arms one timer at the earliest future boundary and re-arms
  after it fires, so rows flip without a reload.
- No status is persisted.

## Edge cases

- `session_date` is `DATE`; cast to `timestamp AT TIME ZONE 'Asia/Kolkata'`.
  Never `Date.parse` a `YYYY-MM-DD` string in the browser.
- `attendance` unique `(contact_id, session_id)` prevents duplicate check-ins.
- A non-UUID session id returns 404, not a Postgres cast error.
- `attendance_url` null on a live row: fall back to `/attend?session=<id>`.
- A migration backfills `public_attendance_enabled = true` on every existing row
  and the creation path keeps setting it; the column is never read for status.
- Location null: render `—`, keep the row under `All locations`, and only drop it
  when a specific location is selected.
- Staff deletion nulls `preacher_id` and `created_by`: the session becomes
  Admin-only; no error is shown to Preacher/Assistant.
- A Preacher sees a session created by an assistant assigned to them even when
  `preacher_id` is null on that legacy row.
- Ties in report ordering break by session start desc, then id.
- Zero-denominator guards: average and repeat rate render `0`, bars use
  `max(1, max count)`.
- The footer reports the filtered count, not the mounted rows.
