# Metrics — one definition, computed once

Every number on `/dashboard` is defined here and computed in
`public.dashboard_overview` or `public.dashboard_candidates`. The server loader parses
the payload into typed DTOs; components format and lay out. A component that counts rows,
sums a column or derives a rate is a second definition and is a defect.

All dates are **programme days** in `Asia/Kolkata`. The caller passes `p_today` from
`programDay()`; the functions never call `now()` for a boundary. Window boundaries are
inclusive on both ends.

## 1. Scope

`p_program_scope` is the Admin's All preachers switch. `false` is Own scope and requires
`p_scope_preacher_id`.

| Reader | `?mode=` | Resolved scope |
|---|---|---|
| Admin | absent, `admin`, or anything not `preacher` | `program_scope = true` |
| Admin | `preacher` | `program_scope = false`, id = Admin's `users.id` |
| Preacher | ignored | `program_scope = false`, id = signed-in id |
| Assistant | ignored | `program_scope = false`, id = `assignedPreacherUserId` |
| Volunteer | — | refused before the RPC |

An Assistant's preacher must be an Active `Preacher` in the same programme. A missing id,
a missing row, another role, or an inactive row is an **empty scope**: the page renders
its empty scope notice and the RPC returns zeros, never a refusal and never the programme.

### Base sets

Let `S` be the resolved scope and `P` the programme.

| Set | Predicate |
|---|---|
| `S_contacts` | `contacts.program_id = P` and (`p_program_scope` or `assigned_preacher_id = p_scope_preacher_id`) |
| `S_sessions` | `sessions.program_id = P` and (`p_program_scope` or `preacher_id = p_scope_preacher_id` or `created_by = p_scope_preacher_id`) |
| `S_attendance` | `attendance.program_id = P` join `S_sessions` on `session_id` |
| `S_assignments` | `dialer_assignments.program_id = P` join `S_contacts` on `contact_id` |
| `S_logs` | `dialer_call_logs.program_id = P` join `S_assignments` on `assignment_id` |
| `S_campaigns` | `dialer_campaigns.program_id = P` and (`p_program_scope` or exists an `S_assignments` row for it or exists an `S_sessions` row with `campaign_id` = its id) |

Call logs scope through the **assignment's contact**, never through the caller. An
Assistant's calls on their preacher's contacts belong to that preacher's scope.

Attendance scope is the session's, not the attendee's contact's. A contact assigned to
another preacher who attended this preacher's session is counted here; the attendance
card says so.

**Header counts.** These orient the reader and are not period-scoped:
`scope.contacts = count(S_contacts)`, `scope.sessions = count(S_sessions)`.
`scope.locations` is the count of active locations in `P` in All scope, and the count of
active locations in the scope user's `users.location_ids` in Own scope, so the line narrows
with the switch. The locations number counts places the reader covers, not only places
that hold a scoped contact; that matches the convention already used by the contacts
section header.

## 2. Period

`p_start` is nullable (`NULL` = all time). `p_end` is the last day of the window. The
server resolves the window from the URL before calling the RPC.

| `?period=` | Window |
|---|---|
| `this-month` | first day of the current month … `p_today` |
| `last30` | `p_today − 29` … `p_today` |
| `last90` | `p_today − 89` … `p_today` |
| `this-quarter` | first day of the current calendar quarter … `p_today` |
| `this-year` | 1 January of the current year … `p_today` |
| `last12` | first day of the month 11 months before the current month … `p_today` |
| `all` | `NULL` … `p_today` |

A custom window is `?period=custom&year=YYYY` (the whole year) or
`?period=custom&year=YYYY&month=MM` (one month). It is clipped to `p_today` when it is
the current year or month. A missing or invalid year, an invalid month, or an unknown
`period` falls back to `last90`; the URL is not trusted.

`p_prev_start` / `p_prev_end` are the equal-length window immediately before the current
one, used only for the contacts-collected delta. `NULL` means no delta. For `all` there is
no previous window.

## 3. KPI band

| Key | Label | Definition | Caption |
|---|---|---|---|
| `contactsCollected` | Contacts collected | count of `S_contacts` whose `initial_contact` is in the window; `all` includes undated rows | `+N vs previous` / `−N vs previous`, or `No previous period` |
| `callsMade` | Calls made | count of `S_logs` with `called_at` in the window | `{contactsCalled} contacts called` |
| `contactsReached` | Reached | distinct contacts in `S_logs` with a reached log in the window | `{reachRate}% of contacts called` |
| `contactsConfirmed` | Confirmed | distinct contacts whose latest reached log **in the window** is `CONFIRMED` | `{confirmationRate}% of contacts reached` |
| `uniqueAttendees` | Attended | distinct contacts in `S_attendance` whose session date is in the window | `{attendanceRecords} check-ins` |

- `reachRate = contactsReached / contactsCalled`, `0` when the denominator is `0`.
- `confirmationRate = contactsConfirmed / contactsReached`, `0` when the denominator is `0`.
- Percentages are integers rounded half-up and appear only as captions beside the exact
  count.
- `contactsConfirmed` is period activity: a confirmation from an earlier period is not
  carried in. The cohort pipeline's confirmed stage is as-of-now and is labelled so.

## 4. The pipeline

The pipeline cohort is the contacts **collected in the window**:

```
cohort = S_contacts where initial_contact in window
         (all-time: every S_contacts row, including undated)
```

The five bars are strictly nested subsets of the cohort. Each bar is measured as of
`p_today`, not as of `p_end`: a contact collected on the last day of the window may be
called the day after.

| Stage | Subset | Definition |
|---|---|---|
| `collected` | all | `count(cohort)` |
| `assigned` | collected | cohort with at least one `dialer_assignments` row |
| `called` | assigned | cohort with at least one `dialer_call_logs` row |
| `reached` | called | cohort with at least one log whose `status_group` is not `NOT_REACHABLE` or `WRONG_NUMBER` |
| `confirmed` | reached | cohort whose latest reached log, as of `p_today`, has `status_group = CONFIRMED` |

Bar width is `stage / collected`. The drop between two bars is the leak to act on:
`neverAssigned = collected − assigned`, `neverCalled = assigned − called`,
`notReached = called − reached`, `notConfirmed = reached − confirmed`.

**Attendance is a readout, not the sixth bar.** A reached contact can attend without ever
confirming, so making attendance a bar below `confirmed` would understate it. The card
shows:

| Key | Definition |
|---|---|
| `pipeline.invited` | cohort contacts reached in a campaign that has at least one linked session in `S_sessions` (`sessions.campaign_id = campaign.id`) |
| `pipeline.attended` | those with an attendance row in any session linked to that campaign in `S_sessions`, with the attendance date on or after the campaign's first reached call date for that contact |
| `pipeline.attendedConfirmed` | the attended subset whose latest reached log is `CONFIRMED` |
| `pipeline.attendedUnconfirmed` | `attended − attendedConfirmed` |
| `pipeline.unlinkedCampaigns` | campaigns in `S_campaigns` that hold reached cohort contacts but have no linked session in `S_sessions` |

`attended` is exact only for linked campaigns. An unlinked campaign is counted in
`invited`? **No** — `invited` requires a linked session. Its reached contacts are reported
through `unlinkedCampaigns` and the campaign card's `—`, never as a zero conversion.

Attendance before the first reached call does not satisfy the invite: it is organic.

## 5. Calling activity and outcomes

| Key | Definition |
|---|---|
| `callsMade` | count of `S_logs` in the window |
| `contactsCalled` | distinct contact ids in `S_logs` in the window |
| `contactsReached` | distinct contact ids with a reached log in the window |
| `contactsConfirmed` | distinct contact ids whose latest reached log **in the window** is `CONFIRMED` |
| `outcomes[]` | `S_logs` in the window grouped by `status_group`, ordered by count desc then key |

`sum(outcomes[].count) = callsMade`. A queued disposition has no call log until its replay
lands and is therefore not counted; the card carries that sentence.

## 6. Attendance health

A session is attributed to the date in `sessions.session_date`. When that is null, its
attendance rows are attributed to `attendance.created_at`'s programme day; a session with
no date is excluded from `sessionsHeld`.

| Key | Definition |
|---|---|
| `sessionsHeld` | sessions in `S_sessions` with a date in the window |
| `attendanceRecords` | attendance rows in `S_attendance` attributed to the window |
| `uniqueAttendees` | distinct contact ids in those rows |
| `newAttendees` | unique attendees whose first-ever attendance in `P` is in the window |
| `returningAttendees` | `uniqueAttendees − newAttendees` |
| `repeatAttendees` | unique attendees with at least two attendance rows in the window |
| `repeatRate` | `repeatAttendees / uniqueAttendees` |
| `averageAttendance` | `attendanceRecords / sessionsHeld`, `0` when no session |
| `invitedAttendees` | unique attendees with at least one window attendance row covered by a linked-campaign invite |
| `organicAttendees` | `uniqueAttendees − invitedAttendees` |

A row is covered by an invite when the contact was reached in campaign C, the row's
session X has `X.campaign_id = C.id`, and the first reached call in C is on or before the
attendance date. `invitedAttendees` and `organicAttendees` partition the unique attendees.

**Trend.** `attendanceTrend` is independent of the window: the twelve months ending at
`p_today`'s month, oldest first. Each entry is
`{ month: "YYYY-MM", sessions, attendees, checkIns }` where `sessions` counts
`S_sessions` in that month, `attendees` is distinct contacts in their attendance, and
`checkIns` is the row count. Months with no sessions are `0`, not omitted.

## 7. Team table

`team.groupBy` is `preacher` when `p_program_scope` is true and `location` otherwise.

**Preacher rows.** Every Active `Preacher` in `P`, plus every staff id referenced by an
`S_sessions.preacher_id` or `S_contacts.assigned_preacher_id`, so history does not vanish
when a preacher is deactivated.

**Location rows.** Every Active location in `P`, plus every location referenced by an
`S_sessions.location_id` or an `S_contacts` first location. A contact holds at most one
location.

| Key | Preacher row | Location row |
|---|---|---|
| `contactsCollected` | `S_contacts` assigned to the preacher with `initial_contact` in window | `S_contacts` whose first location is the location with `initial_contact` in window |
| `callsMade` | `S_logs` in window for those contacts | `S_logs` in window for those contacts |
| `reached` | distinct contacts with a reached log in window | same, for the location's contacts |
| `confirmed` | distinct contacts confirmed in window | same |
| `sessions` | sessions with `preacher_id` = the preacher (fallback `created_by`) in window | sessions with `location_id` = the location in window |
| `attendees` | distinct attendees of those sessions in window | distinct attendees of those sessions in window |
| `lastActivity` | latest call date or session date at or before `p_today` | same |

A row with no activity stays listed with zeros. Sort: `attendees` desc, `sessions` desc,
`name` asc. Rows cover contacts with an assigned preacher (or a location) and sessions
with a preacher or creator. A contact with neither is reported in Coverage, not given a
synthetic team row. The table caption reads "Assigned contacts only"; the KPI band remains
the whole-scope total, so the two are not expected to sum on their own.

## 8. Coverage

Whole-scope, not period-scoped. The card says **All contacts in scope**.

| Key | Definition |
|---|---|
| `contacts` | `count(S_contacts)` |
| `withLocation` | first `location_ids` entry resolves to an active `locations` row in `P` |
| `withAssignedPreacher` | `assigned_preacher_id` resolves to a `users` row in `P` |
| `withInitialContact` | `initial_contact IS NOT NULL` |
| `withCollector` | `collected_by_id` resolves to a `users` row in `P` |

A dangling id is not a resolved field. Percentages are `count / contacts`.

## 9. Focus segments

Focus is **now**, not the reporting window: it answers "what needs me today". Thresholds
are constants in the SQL and do not change with `?period=`.

All segments read `S_contacts` and are independent. A contact may appear in more than one
segment; segment counts are never summed.

Both RPCs use the same segment predicate: `focus[].count` in `dashboard_overview` must
equal `total` in `dashboard_candidates` for the same scope and segment. Define each
predicate once, in a SQL helper or a shared CTE, not twice.

| Key | Label | Definition | Reason text |
|---|---|---|---|
| `confirmed_not_attended` | Confirmed, not attended | latest reached log as of `p_today` is `CONFIRMED` in a campaign linked to a session dated on or before `p_today`, and no attendance row exists for that contact and session | `Confirmed for {session} on {date}; no check-in.` |
| `ready_to_invite` | Ready to invite | latest reached log as of `p_today` has status `MAY_COME`, `CALL_ME_BACK`, `WILL_COME_NEXT_CLASS` or `WILL_COME_NEXT_WEEK`; no attendance in the last 30 days; not assigned to an ACTIVE campaign whose linked session is dated on or after `p_today` | `{disposition} on {date}; last attended {date or never}.` |
| `committed_not_invited` | Committed, not invited | lifetime attendance `>= 3`, or attendance in the last 60 days `>= 2`; no assignment in an ACTIVE campaign | `Attended {n} times; last on {date}. Not in an active campaign.` |
| `new_untouched` | New and untouched | `initial_contact` between `p_today − 90` and `p_today − 7`; no call log ever; no attendance ever | `Collected {date}; waiting {n} days; never called.` |
| `fading` | Fading | lifetime attendance `>= 2`; no attendance in the last 60 days | `Attended {n} times; last on {date}, {n} days ago.` |

One row per contact per segment. `confirmed_not_attended` picks the most recent linked
session dated on or before `p_today`; a contact who attended any session linked to that
campaign after the invite is not in the segment. Sort orders:

- `confirmed_not_attended`: session date desc, then name.
- `ready_to_invite`: last called date desc, then name.
- `committed_not_invited`: lifetime attendance desc, then last attended desc.
- `new_untouched`: `initial_contact` asc (oldest waiting first).
- `fading`: last attended asc (longest gone first).

Segment-specific row fields:

| Key | Extra fields |
|---|---|
| `confirmed_not_attended` | `sessionId`, `sessionName`, `sessionDate`, `lastCalledAt`, `disposition` |
| `ready_to_invite` | `lastCalledAt`, `disposition`, `campaignName` |
| `committed_not_invited` | `lifetimeAttendance`, `lastAttendedAt` |
| `new_untouched` | `initialContact`, `daysWaiting`, `collectorName` |
| `fading` | `lifetimeAttendance`, `lastAttendedAt`, `daysSince` |

Without the Campaign module the three call-dependent segments are not offered, and
`new_untouched` means "no attendance ever" instead of "no call log and no attendance".

Every row carries `contactId`, `name`, `phone`, `preacherName`, `locationName`,
`lastActivity`, `reason`, and the segment's own fields. The dashboard shows the count and
the first three rows; `dashboard_candidates` serves the full list.

## 10. RPC contracts

Both functions live in `public`, are `SECURITY INVOKER`, `STABLE`, and pin
`search_path = public, pg_temp`. `EXECUTE` is revoked from `PUBLIC`, `anon` and
`authenticated`, and granted to `service_role` only. The server calls them through
`createSupabaseAdminClient()` after resolving the staff scope; the browser never receives
a client that can call them.

### `dashboard_overview`

```sql
dashboard_overview(
  p_program_id TEXT,
  p_scope_preacher_id UUID,
  p_program_scope BOOLEAN,
  p_start DATE,
  p_end DATE,
  p_today DATE,
  p_prev_start DATE,
  p_prev_end DATE,
  p_has_dialer BOOLEAN
) RETURNS JSONB
```

Refuses, with `SQLSTATE 22023`: `p_program_scope IS NULL` (`invalid_scope`);
`p_scope_preacher_id IS NULL` when not program-scoped (`scope_preacher_required`);
`p_end IS NULL OR p_today IS NULL OR (p_start IS NOT NULL AND p_start > p_end)`
(`invalid_period`). Refuses `P0002` `program_not_found` when `P` is not in `programs`.
`p_has_dialer` false skips every `dialer_*` CTE and returns empty `outcomes` and
`campaigns` arrays, so a programme without the Campaign module reads no campaign rows.

Payload keys (camelCase, as returned):

```json
{
  "programId": "folk",
  "programScope": false,
  "scopePreacherId": "uuid|null",
  "period": { "start": "2026-08-01|null", "end": "2026-10-31", "today": "2026-11-01" },
  "scope": { "contacts": 0, "locations": 0, "sessions": 0 },
  "kpis": {
    "contactsCollected": 0, "contactsCollectedPrev": 0, "contactsCollectedDeltaPct": null,
    "callsMade": 0, "contactsCalled": 0, "contactsReached": 0, "contactsConfirmed": 0,
    "reachRate": 0, "confirmationRate": 0,
    "sessionsHeld": 0, "uniqueAttendees": 0, "attendanceRecords": 0,
    "newAttendees": 0, "returningAttendees": 0, "repeatAttendees": 0,
    "repeatRate": 0, "averageAttendance": 0,
    "invitedAttendees": 0, "organicAttendees": 0
  },
  "pipeline": {
    "cohort": 0,
    "stages": [
      { "key": "collected", "count": 0 }, { "key": "assigned", "count": 0 },
      { "key": "called", "count": 0 }, { "key": "reached", "count": 0 },
      { "key": "confirmed", "count": 0 }
    ],
    "attended": { "invited": 0, "attended": 0, "confirmed": 0, "unconfirmed": 0 },
    "unlinkedCampaigns": 0
  },
  "outcomes": [ { "statusGroup": "CONFIRMED", "count": 0 } ],
  "attendanceTrend": [ { "month": "2025-12", "sessions": 0, "attendees": 0, "checkIns": 0 } ],
  "coverage": { "contacts": 0, "withLocation": 0, "withAssignedPreacher": 0, "withInitialContact": 0, "withCollector": 0 },
  "team": { "groupBy": "preacher", "rows": [ { "key": "uuid", "name": "Name", "contactsCollected": 0, "callsMade": 0, "reached": 0, "confirmed": 0, "sessions": 0, "attendees": 0, "lastActivity": "2026-10-31|null" } ] },
  "campaigns": [ { "id": "uuid", "name": "Name", "status": "ACTIVE", "campaignDate": "2026-10-25", "sessionCount": 0, "sessionId": "uuid|null", "sessionName": "string|null", "sessionDate": "2026-10-26|null", "assigned": 0, "attempted": 0, "reached": 0, "confirmed": 0, "neverAttempted": 0, "attended": null } ],
  "recentSessions": [ { "id": "uuid", "name": "Name", "sessionDate": "2026-10-26|null", "preacherName": "string|null", "locationName": "string|null", "attendees": 0 } ],
  "focus": [ { "key": "confirmed_not_attended", "count": 0, "rows": [ { "contactId": "uuid", "name": "Name", "phone": "string", "preacherName": "string|null", "locationName": "string|null", "lastActivity": "2026-10-31|null", "reason": "string", "sessionId": "uuid|null", "sessionName": "string|null", "sessionDate": "2026-10-26|null" } ] } ],
  "generatedAt": "2026-11-01T10:32:00+05:30"
}
```

`campaigns` carries ACTIVE campaigns only, sorted `campaign_date` asc then name. Its counts
match `campaign_progress` assignment-grain definitions: `attempted` = assignment with at
least one log, `reached` = assignment with at least one reached log, `confirmed` = latest
reached log is `CONFIRMED`, `neverAttempted` = assignment with no log.

`sessionCount` is the number of sessions linked to the campaign (`sessions.campaign_id`).
`sessionId`, `sessionName` and `sessionDate` describe the most recent linked session
(date desc, nulls last), or null when none. `attended` is `null` when `sessionCount` is 0,
never `0`; otherwise it is the distinct reached contacts who attended any linked session
after their first reached call in that campaign.

`sessionCount` counts linked sessions in `S_sessions` only. A campaign linked only to a
session outside the reader's session scope reads `No session linked` in that scope: the
reader cannot see the attendance, so it is not counted as a zero conversion.

`recentSessions` is the five most recent sessions with a date on or before `p_today`.

`focus[].rows` is capped at three per segment; `count` is the full segment size.

When `modules.dialer` is false the server skips this function entirely and builds the
attendance-only shape from a narrower RPC or the existing reads; see `sections.md`.

### `dashboard_candidates`

```sql
dashboard_candidates(
  p_program_id TEXT,
  p_scope_preacher_id UUID,
  p_program_scope BOOLEAN,
  p_has_dialer BOOLEAN,
  p_today DATE,
  p_segment TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
) RETURNS JSONB
```

Refuses `22023` for the same scope rules, an unknown segment (`invalid_segment`), a
`p_limit` outside 1…100 (`invalid_limit`), or a negative `p_offset`. With
`p_has_dialer` false, `confirmed_not_attended`, `ready_to_invite` and
`committed_not_invited` return `total: 0` and no rows, `new_untouched` drops its call
test, and `fading` is unchanged. Returns:

```json
{
  "segment": "new_untouched",
  "total": 0,
  "limit": 50,
  "offset": 0,
  "rows": [ { "contactId": "uuid", "name": "Name", "phone": "string", "preacherName": "string|null", "locationName": "string|null", "lastActivity": "2026-10-31|null", "reason": "string" } ]
}
```

Rows are sorted per segment as defined in §9 and are stable across pages: every sort ends
with `contactId` as the tie-break.

## 11. Indexes and performance

The migration adds, if absent:

- `contacts (program_id, assigned_preacher_id)` and `contacts (program_id, initial_contact)`.
- `dialer_call_logs (program_id, called_at DESC)` and `dialer_call_logs (assignment_id, called_at DESC, id DESC)`.
- `sessions (campaign_id)` and `sessions (campaign_id, session_date DESC)`.
- `attendance (session_id, created_at)`.
- `sessions (program_id, preacher_id, session_date)` and `sessions (program_id, location_id, session_date)`.

`dashboard_overview` is one statement over CTEs, not a loop of per-campaign calls. It must
finish under 500 ms at p95 with 5,000 contacts, 50,000 call logs, 20,000 attendance rows
and 100 sessions on the local stack. The implementation records the `EXPLAIN (ANALYZE,
BUFFERS)` output for the seeded dataset in the story's verification notes.

The page issues one `dashboard_overview` call. It does not call `campaign_progress` per
campaign; the campaign card's figures come from the overview payload.

## 12. Reconciliation rules

1. A figure on `/dashboard` and a figure on an owning surface must agree for the same
   scope and window. The owning surfaces are `/campaigns/reports` (campaign funnel),
   `/sessions` (sessions and attendance) and `/contacts` (contacts and attendance rollups).
2. A disagreement is fixed in the definition or the query, never by adjusting a caption.
3. `contactsConfirmed` is period activity; `pipeline.stages[confirmed]` is as-of-now. They
   are different figures with different labels and must never be presented as the same
   count.
4. `attendanceRecords` counts rows; `uniqueAttendees` counts people. Neither is a ratio and
   neither is labelled "attendance" alone.
5. An unlinked campaign shows `—` for attendance, not `0`. A campaign with no assignments
   shows zeros, because zero is the true count.
6. A contact outside the scope never appears in a focus row, a team row, a KPI or a link,
   even when they attended a scoped session.
7. The campaign card is campaign-lifetime, not window-scoped; it is the one section the
   period does not change. Its figures must equal `campaign_progress` for the same campaign
   and scope.
