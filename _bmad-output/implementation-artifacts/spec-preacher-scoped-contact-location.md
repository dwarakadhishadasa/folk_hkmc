---
title: 'Preacher Scoped Contact Location'
type: 'feature'
created: '2026-05-06'
status: 'done'
baseline_commit: 'd3088e3906d2a5b9000b17cb5545e52c9849b59d'
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/planning-artifacts/nextjs-supabase-staff-auth-plan.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staff contact creation currently accepts arbitrary location text and lets Airtable typecast it into the linked `Contacts.Location` field, so a volunteer can submit a random or invalid location instead of one of the responsible preacher's configured locations.

**Approach:** Treat contact location as a required Airtable `Locations` record ID for staff-created contacts. Resolve the assigned preacher first, filter the UI to that preacher's allowed locations, and reject any posted location outside that set server-side.

## Boundaries & Constraints

**Always:** Staff-created contacts must write `Contacts.Location` as `[locationRecordId]`, where the ID is present in the resolved preacher's `Users.Locations`. Volunteers inherit the assigned preacher and may only select that preacher's locations. Preachers may only select their own locations. Admins must choose the assigned preacher first, then choose one of that preacher's locations. Attendance-session registration continues to use the linked session location.

**Ask First:** Changing public, non-session registration into a preacher-owned flow; creating or editing Airtable `Locations`; adding fuzzy location matching or new location creation.

**Never:** Do not trust client-submitted location names. Do not rely on Airtable `typecast` to create or infer contact locations for staff contact creation. Do not permit a contact to be saved with an invalid location when an assigned preacher exists.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Volunteer staff contact | Active volunteer has `Assigned Preacher = P`; P has `Locations = [L1, L2]`; form submits `locationId = L1` | Contact is created with `Assigned Preacher = P`, volunteer collector metadata, and `Location = [L1]` | N/A |
| Volunteer invalid location | Same volunteer submits `locationId = recOutsideScope` or free text | No contact is created | `422` with scoped-location error |
| Preacher staff contact | Active preacher has `Locations = [L1]`; form submits `locationId = L1` | Contact is created with `Assigned Preacher = preacher`, `Collected By = preacher`, and `Location = [L1]` | N/A |
| Admin staff contact | Admin chooses preacher P; P has `Locations = [L1, L2]`; form submits `locationId = L2` | Contact is created for P at `Location = [L2]` | N/A |
| Admin mismatch | Admin chooses preacher P but submits location from another preacher | No contact is created | `422` with scoped-location error |
| No preacher locations | Resolved preacher has no linked locations | Form disables save path; API rejects any contact create | `422` asking admin/preacher config to be fixed |

</frozen-after-approval>

## Code Map

- `lib/airtable.ts` -- shared Airtable adapter; maps staff `Locations`, contact `Location`, and contact create payload.
- `app/contact/page.tsx` -- server page that loads staff context and passes preacher/location options into the client contact form.
- `components/contact-form.tsx` -- staff contact creation UI; currently uses free-text `location`.
- `app/api/contact/route.ts` -- server enforcement point for contact ownership, duplicate checks, and Airtable create.
- `app/api/registration/route.ts` -- attendance registration path; already replaces typed location with session location when `sessionId` is present.
- `app/register/page.tsx` -- active attendance registration UI that can currently show a free-text location field during session registration.

## Tasks & Acceptance

**Execution:**
- [x] `lib/airtable.ts` -- add explicit `locationId` support for `createContact()` and use it from validated contact/session paths -- removes Airtable typecast dependence from preacher-scoped writes.
- [x] `app/api/contact/route.ts` -- resolve the full responsible preacher, require `locationId`, and verify it is in the preacher's `locationIds` before calling `createContact()` -- hardens the server boundary.
- [x] `app/contact/page.tsx` -- pass preacher `locationIds` and readable location options into `ContactForm` -- lets the UI derive valid selections.
- [x] `components/contact-form.tsx` -- replace free-text location with a dropdown scoped to the selected/resolved preacher; disable submit when no valid location is available -- prevents random location entry.
- [x] `app/api/registration/route.ts` -- pass session location as `locationId` into `createContact()` -- keeps attendance registration linked by record ID.
- [x] `app/register/page.tsx` -- hide free-text location while completing session-based attendance registration -- prevents misleading ignored input.

**Acceptance Criteria:**
- Given a volunteer with an assigned preacher, when they open `/contact`, then the Location control lists only that preacher's linked Airtable locations.
- Given an Admin selects a preacher, when the Location control renders, then it lists only that preacher's linked Airtable locations and resets if the selected preacher changes.
- Given any staff role posts `/api/contact` with a location outside the resolved preacher's `locationIds`, when the request is handled, then the API returns `422` and does not create an Airtable contact.
- Given attendance registration includes a valid session, when the contact is created, then `Contacts.Location` receives the session's linked location record ID.

## Spec Change Log

## Verification

**Commands:**
- `pnpm exec tsc --noEmit` -- passed.
- `pnpm build` -- passed.
- `pnpm lint` -- blocked because the workspace does not provide a local `eslint` binary.

## Suggested Review Order

**Server Enforcement**

- Resolve the responsible preacher before accepting any submitted location.
  [`route.ts:36`](../../app/api/contact/route.ts#L36)

- Reject missing, unconfigured, or outside-scope locations before Airtable writes.
  [`route.ts:91`](../../app/api/contact/route.ts#L91)

- Write validated contact locations through explicit Airtable record IDs.
  [`airtable.ts:464`](../../lib/airtable.ts#L464)

**Scoped Staff UI**

- Load preacher locations and readable location names for the contact form.
  [`page.tsx:12`](../../app/contact/page.tsx#L12)

- Derive available locations from the selected or resolved preacher.
  [`contact-form.tsx:56`](../../components/contact-form.tsx#L56)

- Replace arbitrary text entry with a required scoped dropdown.
  [`contact-form.tsx:322`](../../components/contact-form.tsx#L322)

**Attendance Registration**

- Use session location as the linked contact location record ID.
  [`route.ts:50`](../../app/api/registration/route.ts#L50)

- Hide free-text location during session-backed registration.
  [`page.tsx:271`](../../app/register/page.tsx#L271)
