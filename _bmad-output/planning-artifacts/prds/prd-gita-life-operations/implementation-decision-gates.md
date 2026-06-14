# Implementation Decision Gates

Last updated: 2026-06-13
Owner: Dwaraka
Source of truth: Airtable base metadata, Supabase migration files, Program Capability Profiles in `packages/program-config/src/`, and app deployment environment variables.

## DD-1: Airtable Schema Mapping

Status: Resolved for MVP implementation.
Acceptance risk: Low for current parity flows; Airtable tokens remain environment-only.
Dependent stories unblocked: 2.5, 3.1-3.4, 4.1-4.3, 5.1-5.4, 6.1-6.4.

Program bases:

| Program | Base name | Base ID |
| --- | --- | --- |
| FOLK | FOLK Chennai | `appqea9DRLOXqErXb` |
| Gita Life | Gita Life | `appzbssqNK53yqjZH` |

Operational tables:

| Capability | Table | Table ID | Primary field | Writable fields | Read-only lookup/formula fields |
| --- | --- | --- | --- | --- | --- |
| Contacts | Contacts | `tbltzdtCmCHf6gJKD` | `fld8SsX2vXZU3uE1g` Name | Name, Phone, Year, Source, Notes, Initial Contact, Last Contacted On, Age, Date of Birth, Location, Assigned Preacher, Collected By, Analytics, College, Company | ContactId, TotalAttendanceCount, AttendanceLog, Past60DayAttendanceCount, Status Quo, Visible To, Visible To User Role |
| Attendance | Attendance | `tblxfB2W2l6OXc2IX` | `fldlneeesd7tMxUIG` Phone | Phone, Name, Processed?, Session, Contact, Visible To | Session Date, Location, Session Preacher, Attendance Date, Session Name, IsPast60Days, Log Line |
| Sessions | Sessions | `tbl9AbwkiIaAwK20X` | `fld5z4R4R9ervCeGR` Name | Name, Notes, Session Date, Location, Preacher, Status, Analytics, Public Attendance Enabled, Attendance Opens At, Attendance Closes At, Attendance URL, Duration Minutes | Attendance Records, Session Key, IsPast60Days, Attendee Count, Location Users, Visible To |
| Staff | Users | `tbl2aiD2NfvrBMnfI` | `fldAxt0CvuegC3MnZ` Name | Name, Email, Role, Status, Locations, Portal Account, Supabase User ID, Invited By, Assigned Preacher, Invite Status, Invite Sent At, Deactivated At, Deactivated By, Deactivation Reason | Assigned Contacts, Sessions, Invited Users, Assigned Volunteers, Collected Contacts |
| Locations | Locations | `tbl5IOOcS2RUkXzyG` | `fldarUNLPjl1aCg2M` Name | Name, Code, Status | Users, Contacts, Sessions |

Interface mappings:

| Interface | Interface ID | Page | Page ID | Source table |
| --- | --- | --- | --- | --- |
| Admin Portal | `pbdulzzIJXUBqdPut` | Contacts | `pagHmCzuqPSMcXjZx` | Contacts |
| Admin Portal | `pbdulzzIJXUBqdPut` | Dashboard | `pagc77PtbNsr9ljWu` | Contacts |
| Admin Portal | `pbdulzzIJXUBqdPut` | Sessions | `pager0WDWhaPcr3B5` | Sessions |
| Admin Portal | `pbdulzzIJXUBqdPut` | Contact Details | `paglQ8Ap69TqRidpA` | Contacts |

Implementation rule: raw Airtable IDs live only in server/planning artifacts and `packages/program-config/src/server.ts` reachable server-side. Client components use route responses and public Program branding only.

## DD-3, DD-6, DD-10: Access, Login, Domains

Status: Resolved for MVP implementation with configurable deployment values.
Acceptance risk: Medium until production DNS values are finalized in Vercel/Supabase dashboards.
Dependent stories unblocked: 2.2-2.4, 2.6, 5.1, 6.1-6.4.

Decisions:

- Revocation/stale-sync policy: staff membership reads fail closed when `last_synced_at` is older than `STAFF_SYNC_STALE_AFTER_MINUTES`. Default is 1440 minutes if unset; `.env.example` recommends 15 minutes for production.
- Login method: Supabase email OTP and invite links remain the MVP login method for both Program Apps.
- Session policy: app-local Supabase SSR cookie sessions per deployed Program App; no cross-subdomain SSO in MVP.
- Launch URLs: each app uses its own `NEXT_PUBLIC_SITE_URL` in its Vercel Project. Final DNS is deployment configuration, not committed source.
- Attendance URLs: generated from the active app's `NEXT_PUBLIC_SITE_URL` and the session-specific `/attend?session=<id>` route.

## DD-8: Contact Privacy And Staff Visibility

Status: Resolved for MVP implementation.
Acceptance risk: Medium; policy should be re-reviewed before broad production rollout.
Dependent stories unblocked: 4.1-4.3, 6.1-6.4.

Policy:

- Admin: full Program-scoped operational visibility for Contacts, Sessions, Locations, Users, invite logs, and management handoff.
- Preacher: can view/use Contacts and Sessions assigned to them or their location scope; can invite Volunteers assigned to themselves.
- Volunteer: create-only Contact workflow; contacts are assigned to the Volunteer record as collector and routed to the assigned active Preacher.
- Sensitive contact fields such as Notes/comments, Date of Birth, College, Company, and phone remain server/Airtable-backed and are not exposed in broad client lists unless the current role and screen require them.
- Error messages must remain actionable without exposing Airtable API details, Supabase service-role errors, OTPs, or tokens.

## DD-9: Retention Policy

Status: Resolved for MVP implementation.
Acceptance risk: Medium until formal HKM retention approval.
Dependent stories unblocked: 2.6, 4.1-4.3, 6.1-6.4.

Policy:

- Airtable Contacts, Attendance, Sessions, Users, and Locations remain operational source-of-truth records and are retained according to Program operations policy until manually archived/deleted in Airtable.
- Supabase `staff_memberships` and `airtable_identities` retain runtime authorization mirrors while the staff identity exists; revoked memberships remain for auditability.
- Supabase `invite_log` and `audit_events` retain operational security events for at least 365 days.
- Deletion/anonymization work is out of MVP automation scope but the schema keeps audit/sync data separate from primary Airtable operational records so later retention jobs can target them.
