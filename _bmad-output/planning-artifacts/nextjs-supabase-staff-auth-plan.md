# Next.js Supabase Staff Auth Planning Artifact

- Project: `folk_hkmc`
- Related Airtable repo: `../folk_hkmc_airtable`
- Airtable-side plan: `../../../folk_hkmc_airtable/_bmad-output/planning-artifacts/airtable-auth-portal-plan.md`
- Source bridge artifact: `../../../folk_hkmc_airtable/_bmad-output/implementation-artifacts/supabase-airtable-portal-implementation-plan.md`
- Owner: Next.js app implementer
- Created: `2026-05-04`

## Purpose

This artifact owns the Next.js and Supabase work for replacing demo local auth with real staff authentication, role authorization, session creation, contact creation, volunteer invite flows, and relational attendance creation.

Airtable remains the operational source of truth. Supabase authenticates staff identities and stores a small bridge from Supabase users to Airtable `Users` records.

## Current Frontend Baseline

The app currently uses:

```text
lib/auth-context.tsx
localStorage key folk_auth
hardcoded users volunteer/preacher
```

Implemented route:

```text
app/attendance/route.ts
```

Missing or incomplete production routes:

```text
POST /api/registration
POST /api/contact
```

The target implementation must remove hardcoded staff auth and protect all staff routes server-side.

## Role Model

| Role | Next.js Access | Airtable Portal |
| --- | --- | --- |
| `Admin` | full app/admin access | yes |
| `Preacher` | create contacts, create sessions, view dashboard, invite volunteers | yes |
| `Volunteer` | create contacts only | no |

Volunteers cannot access sessions, dashboard, attendance dashboard reads, or Airtable Portal links.

`Admin` is the only role with all-record access in the Next.js app. `Preacher` access is scoped by owned sessions, assigned contacts, and later location scope. `Volunteer` access is limited to contact creation.

## Supabase Schema

Required:

```sql
create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  airtable_user_id text not null unique,
  name text,
  role text not null check (role in ('Admin', 'Preacher', 'Volunteer')),
  status text not null check (status in ('Active', 'Inactive')),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Recommended:

```sql
create table public.invite_log (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  airtable_user_id text not null,
  invited_by uuid references auth.users(id),
  invitee_role text not null check (invitee_role in ('Admin', 'Preacher', 'Volunteer')),
  status text not null check (status in ('Invited', 'Accepted', 'Revoked', 'Failed')),
  error_message text,
  sent_at timestamptz default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
```

Keep Supabase lean. Do not duplicate Contacts, Sessions, Attendance, Locations, or Analytics in Supabase.

Supabase RLS is not part of this rollout. Treat `staff_profiles` and `invite_log` as server-maintained bridge/audit tables, not browser-queryable application data. Client components should not query these tables directly. Next.js route handlers and server components enforce authorization through `lib/authz.ts`, and Airtable `Users` remains the final role/status source.

Authorization rule:

```text
Supabase = who is logged in
Airtable Users = what role/status/scope is currently allowed
```

## Environment Variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=

AIRTABLE_API_TOKEN=
AIRTABLE_BASE_ID=appqea9DRLOXqErXb
AIRTABLE_CONTACTS_TABLE_ID=tbltzdtCmCHf6gJKD
AIRTABLE_ATTENDANCE_TABLE_ID=tblxfB2W2l6OXc2IX
AIRTABLE_SESSIONS_TABLE_ID=tbl9AbwkiIaAwK20X
AIRTABLE_USERS_TABLE_ID=tbl2aiD2NfvrBMnfI
AIRTABLE_LOCATIONS_TABLE_ID=tbl5IOOcS2RUkXzyG
```

## Dependencies

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

## App Architecture Changes

Add Supabase utilities:

```text
lib/supabase/client.ts
lib/supabase/server.ts
lib/supabase/admin.ts
lib/supabase/proxy.ts
proxy.ts
```

SSR/proxy contract:

1. `lib/supabase/client.ts` creates the browser client for login UI and other client-only auth calls.
2. `lib/supabase/server.ts` creates a request-scoped cookie server client for Server Components, Route Handlers, and Server Actions.
3. `lib/supabase/admin.ts` creates the service-role client and must only be imported from server-only code.
4. `lib/supabase/proxy.ts` refreshes Supabase auth cookies.
5. Root `proxy.ts` calls the proxy updater and defines the matcher.

The proxy's job is session cookie maintenance, not final business authorization. Staff pages and API routes must still call `lib/authz.ts` and re-check Airtable `Users.Status` and `Users.Role`.

Initial proxy matcher should cover staff surfaces and auth callbacks while avoiding static assets:

```text
/dashboard/:path*
/contact/:path*
/sessions/:path*
/volunteers/:path*
/auth/:path*
/api/contact
/api/sessions/:path*
/api/volunteers/:path*
/api/admin/:path*
```

Use server-side verified user/claims for protected routes. Do not trust `getSession()` as an authorization check in server code. Authenticated pages and routes that can write cookies should be dynamic/no-store to avoid caching session-bearing responses.

Add authorization helpers:

```text
lib/authz.ts
lib/airtable-staff.ts
```

`lib/authz.ts` should:

1. Read the verified Supabase user from cookies through the server Supabase client.
2. Load `staff_profiles`.
3. If needed, match `auth.users.email` to Airtable `Users.Email` and upsert `staff_profiles`.
4. Load Airtable `Users` as final authorization truth.
5. Require `Status = Active`.
6. Return:

```ts
type StaffContext = {
  supabaseUserId: string
  email: string
  airtableUserId: string
  name: string
  role: "Admin" | "Preacher" | "Volunteer"
  locationIds: string[]
  assignedPreacherAirtableUserId?: string
}
```

For volunteers, `assignedPreacherAirtableUserId` comes from Airtable `Users.Assigned Preacher`; do not trust a browser payload for this value.

## Auth Routes

Add:

```text
app/auth/confirm/route.ts
app/auth/signout/route.ts
```

Simple invite flow:

1. Admin or preacher invite endpoint validates the inviter's staff context.
2. Server creates or updates the Airtable `Users` record first.
3. Server calls Supabase Admin invite for the staff email.
4. Staff member receives one invite email.
5. Staff member clicks one link.
6. `/auth/confirm` verifies the invite token, creates the cookie session, syncs `staff_profiles`, and redirects by role.

There is no separate human confirmation screen in the default path. The word "confirm" here means server-side token verification, not another approval step.

Supabase invite email template must point directly to the app callback so the server can create cookies:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">
  Accept invite
</a>
```

`/auth/confirm` behavior:

1. Read `token_hash`, `type`, and optional `next`.
2. Require `type = invite` for invite acceptance.
3. Verify the Supabase invite token.
4. Create a cookie session.
5. Upsert `staff_profiles` by matching email to Airtable `Users.Email`.
6. Redirect:

```text
Admin / Preacher -> /dashboard or requested safe path
Volunteer -> /contact
```

If staff login after the first invite should remain passwordless, reuse the same callback for Supabase magic-link login later. That keeps the model simple: email link creates a server cookie, then Airtable decides access.

## Staff Route Permissions

| Route | Admin | Preacher | Volunteer |
| --- | --- | --- | --- |
| `/contact` | yes | yes | yes |
| `POST /api/contact` | yes | yes | yes |
| `/dashboard` | yes | yes | no |
| `GET /attendance` dashboard read | yes | yes, scoped | no |
| `POST /api/sessions` | yes | yes | no |
| `GET /api/sessions` | yes | yes, scoped | no |
| `POST /api/volunteers/invite` | yes | yes | no |
| `POST /api/admin/invite-user` | yes | no | no |

## Contact Creation Flow

Route:

```text
POST /api/contact
```

Server behavior:

1. Require active staff.
2. Allow `Admin`, `Preacher`, `Volunteer`.
3. Normalize mobile to last 10 digits.
4. Check existing Airtable contact by normalized phone.
5. Resolve assigned preacher:

```text
Volunteer -> Airtable Users.Assigned Preacher
Preacher -> current staff Airtable user id
Admin -> explicit assignedPreacherId or reject
```

6. Write Airtable `Contacts`:

```text
Name
Phone
Age
Year / Current status as applicable
Location if provided
Collected By = current staff Airtable user id
Assigned Preacher = resolved preacher
Source = submitted acquisition/intake source if provided
```

7. Trigger or write visibility:

```text
Visible To = assigned preacher Portal Account + admins
```

8. Return minimal success for volunteers.

Volunteer guardrail:

```text
Volunteers cannot choose or override Assigned Preacher.
```

## Session Creation Flow

Route:

```text
POST /api/sessions
```

Server behavior:

1. Require active staff.
2. Allow `Admin`, `Preacher`.
3. Deny `Volunteer`.
4. Use current staff Airtable user id as session owner.
5. Verify selected location is allowed unless role is `Admin`.
6. Create Airtable `Sessions`:

```text
Name
Session Date
Preacher/User = current staff Airtable user id
Location
Public Attendance Enabled
Attendance Opens At
Attendance Closes At
```

7. Generate:

```text
/attend?session=<session record id>
```

8. Persist `Attendance URL`.
9. Return session id and attendance URL.

Route:

```text
GET /api/sessions
```

Rules:

```text
Admin -> all operational sessions
Preacher -> owned sessions or allowed-location sessions
Volunteer -> 403
```

## Volunteer Invite Flow

Route:

```text
POST /api/volunteers/invite
```

Rules:

```text
Preacher can invite Volunteer only.
Admin can invite Volunteer with explicit assigned preacher.
Volunteer cannot invite anyone.
```

Server behavior:

1. Require `Admin` or `Preacher`.
2. Create/update Airtable `Users`:

```text
Name
Email
Role = Volunteer
Status = Active
Invited By = current staff Airtable user id
Assigned Preacher = preacher inviter, or admin-selected preacher
Portal Account = empty
```

3. Call Supabase admin invite.
4. Upsert or wait to upsert `staff_profiles`.
5. Write `invite_log`.
6. Redirect volunteer invite acceptance to `/contact`.

## Admin Invite Flow

Route:

```text
POST /api/admin/invite-user
```

Rules:

```text
Admin can invite Admin, Preacher, Volunteer.
Preacher cannot use this endpoint.
Volunteer cannot use this endpoint.
```

For volunteers, admin must provide an assigned preacher.

## Attendance Flow Rewrite

Student attendance remains public, but the route must validate session state.

Route:

```text
POST /attendance
```

Payload:

```json
{
  "mobile": "9876543210",
  "sessionId": "recXXXXXXXX"
}
```

Server behavior:

1. Normalize mobile.
2. Load Airtable session by `sessionId`.
3. Require session exists and `Public Attendance Enabled`.
4. Apply open/close time gates if configured.
5. Find Airtable contact by normalized phone.
6. If no contact, return `notRegistered` and preserve `sessionId`.
7. Check duplicate by:

```text
Contact + Sessions
```

8. Create Airtable `Attendance`:

```text
Contact
Sessions
Phone
Name snapshot
Processed? = true
```

9. Trigger/write visibility from linked session/contact.

Registration follow-up:

```text
/register?mobile=9876543210&session=recXXXXXXXX
```

Registration session follow-through:

1. Attendance form posts `{ mobile, sessionId }`.
2. If the mobile is unknown, `/attendance` returns `notRegistered = true`, the normalized mobile, and the same `sessionId`.
3. Client redirects to `/register?mobile=<mobile>&session=<sessionId>`.
4. Registration form pre-fills the mobile and preserves the session id.
5. `POST /api/registration` creates the Airtable `Contacts` record.
6. If a valid session id is present, the client automatically posts `/attendance` with the same `{ mobile, sessionId }` after contact creation succeeds.
7. Duplicate attendance response after auto-submit should be treated as a completed outcome, not a failed registration.

When registration happens from a session attendance link, the contact assignment should come from the session owner/preacher unless a stronger assignment rule is added.

## Frontend Pages

Update or add:

```text
app/login/page.tsx
app/contact/page.tsx
app/dashboard/page.tsx
app/sessions/page.tsx
app/volunteers/page.tsx
app/attend/page.tsx
app/register/page.tsx
```

Volunteer UX should be narrow:

```text
Login -> Contact form -> Success
```

No dashboard, session list, attendance dashboard, or portal link.

## Offline And PWA Impact

Update service worker queue payloads if these request shapes change:

```text
POST /attendance must preserve sessionId
POST /api/contact must preserve staff auth requirement and should not be treated as anonymous offline queue unless offline staff auth is explicitly designed
POST /api/registration should preserve session query context
```

Do not silently queue staff contact creation without a valid server session unless a clear offline-auth strategy is added.

## Testing Plan

Auth:

- Active admin/preacher reaches `/dashboard`.
- Active volunteer reaches `/contact`.
- Volunteer cannot access dashboard/session routes.
- Inactive Airtable user is denied despite valid Supabase session.
- Unknown Supabase user not present in Airtable is denied.

Invites:

- Preacher can invite volunteer.
- Preacher cannot invite preacher/admin.
- Admin can invite all staff roles.
- Volunteer invite creates Airtable `Users.Assigned Preacher`.
- Invite email is a one-click flow into `/auth/confirm`; no extra approval/confirmation screen is required.

Contacts:

- Volunteer-created contact sets `Collected By` to volunteer.
- Volunteer-created contact assigns preacher from Airtable `Users.Assigned Preacher`.
- Volunteer cannot override assigned preacher.
- Preacher-created contact assigns preacher to self.
- Admin-created contact requires assigned preacher.

Sessions:

- Preacher can create session.
- Volunteer cannot create/list sessions.
- Session owner comes from server staff context.
- Attendance URL is generated and works.

Attendance:

- Attendance creates linked `Contact + Sessions`.
- Duplicate contact/session is rejected.
- Closed/invalid session is rejected.
- Unknown mobile redirects to registration with session preserved.
- Registration from attendance auto-submits attendance after contact creation.

## Rollout Steps

1. Add Supabase dependencies and env vars.
2. Remove the Airtable base fallback and fail fast when required Airtable env vars are missing.
3. Create Supabase `staff_profiles`.
4. Configure Supabase Site URL, allowed redirect URLs, and invite email template for `/auth/confirm`.
5. Add Supabase SSR browser/server/admin/proxy helpers.
6. Add root `proxy.ts` with staff/auth matchers.
7. Add `lib/authz.ts`.
8. Replace `lib/auth-context.tsx` and localStorage auth.
9. Implement auth confirm/signout routes.
10. Implement staff contact creation endpoint at existing `POST /api/contact`.
11. Implement preacher volunteer invite endpoint.
12. Implement admin invite endpoint if needed in first release.
13. Implement session create/list endpoints and UI.
14. Rewrite attendance route for session-linked attendance.
15. Update registration to auto-submit attendance after contact creation when `session` is present.
16. Update service worker paths/payload assumptions.
17. Smoke test with one admin, one preacher, one volunteer.

## Acceptance Criteria

- No protected staff flow depends on hardcoded users or `folk_auth`.
- Every staff server action checks Supabase session and Airtable `Users.Status`.
- Volunteer access is limited to contact creation.
- Volunteer-created contacts are assigned to the volunteer's assigned preacher.
- Preacher-created sessions link to the preacher's Airtable `Users` record.
- Attendance links to both contact and session.
- Production env points to Airtable base `appqea9DRLOXqErXb`.
- App startup fails fast instead of silently falling back to another Airtable base.
