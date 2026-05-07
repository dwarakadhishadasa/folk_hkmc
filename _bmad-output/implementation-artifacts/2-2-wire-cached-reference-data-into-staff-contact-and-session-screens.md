# Story 2.2: Wire Cached Reference Data Into Staff Contact And Session Screens

Status: review

## Story

As a staff user,
I want contact and session forms to use fast reference-data reads,
so that opening staff workflows feels immediate while validation remains correct.

## Acceptance Criteria

1. Given a staff user opens `/contact`, when the page loads preacher and location options, then it uses the cached Locations helper, and Admin preacher options use the cached active Preachers helper.
2. Given a staff user opens `/sessions`, when the page loads available locations, then it uses the cached Locations helper, and role-based location filtering still uses the current staff context.
3. Given a staff contact submit posts `/api/contact`, when the server validates assigned preacher and location scope, then duplicate contact checks, contact creation, and write paths remain uncached, and correctness-critical preacher/location enforcement uses current staff context, direct Airtable record lookup, or an uncached/bypass helper rather than 20-minute cached active Preacher data.
4. Given an Admin or Preacher changes related Airtable data and needs fresh values, when a future mutation or explicit admin refresh path is added, then the story leaves a documented cache bypass or tag invalidation approach for that path.

## Tasks / Subtasks

- [x] Replace server page reference reads in `app/contact/page.tsx` with cached helper calls where safe. (AC: 1)
  - [x] Use cached Locations for option lists.
  - [x] Use cached active Preachers for Admin option lists.
  - [x] Keep Volunteer assigned preacher resolution fresh or short-cache only; this can affect authorization/scoped routing.
- [x] Replace `listLocations()` in `app/sessions/page.tsx` with the cached Locations helper. (AC: 2)
- [x] Audit `app/api/contact/route.ts` and keep all write-side validation fresh. (AC: 3)
  - [x] `findContactByPhone()` duplicate check remains uncached.
  - [x] `createContact()` remains uncached.
  - [x] assigned preacher and location scope enforcement uses current staff context and direct lookup/bypass helpers.
- [x] Add short implementation notes for future cache bypass or tag invalidation. (AC: 4)
- [x] Verify role-specific contact and session forms still show the same options after cache wiring. (AC: 1, 2, 3)

## Dev Notes

- `app/contact/page.tsx` currently calls `getStaffContext()`, `listLocations()`, `listActivePreachers()` for Admins, and `findStaffUserById()` for Volunteers with assigned preachers.
- `app/sessions/page.tsx` currently calls `getStaffContext()`, checks Admin/Preacher with `requireRole()`, then calls `listLocations()` and filters by `staff.locationIds`.
- `app/api/contact/route.ts` enforces duplicate detection, responsible preacher resolution, and location scoping. Do not route those correctness checks through a 20-minute active-preacher cache.
- Preserve `spec-preacher-scoped-contact-location.md`: staff-created contacts must use linked Airtable `Locations` record IDs, Volunteers inherit assigned preacher locations, Preachers use their own locations, and Admins choose a preacher before choosing that preacher's locations.
- Preserve fast-entry behavior from `spec-contact-fast-entry-feedback.md`: contact form should remain quick to reuse after saves and duplicates.

### Project Structure Notes

- Cached reference reads belong on server pages and server-only helpers.
- Client components (`components/contact-form.tsx`, `components/sessions-manager.tsx`) should receive already-filtered options; do not expose Airtable tokens or make browser Airtable calls.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-2.2]
- [Source: _bmad-output/implementation-artifacts/spec-preacher-scoped-contact-location.md]
- [Source: _bmad-output/implementation-artifacts/spec-contact-fast-entry-feedback.md]
- [Source: app/contact/page.tsx]
- [Source: app/sessions/page.tsx]
- [Source: app/api/contact/route.ts]
- [Source: components/contact-form.tsx]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Code-path review confirmed `/api/contact` still uses uncached duplicate checks, direct staff lookup, and uncached writes.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Wired `/contact` option lists to cached Locations and Admin cached active Preachers.
- Left Volunteer assigned-preacher resolution fresh through `findStaffUserById()`.
- Wired `/sessions` to cached Locations while preserving staff location filtering.
- Future admin refresh or mutation flows can call `revalidateAirtableReferenceCache()`.

### File List

- `app/contact/page.tsx`
- `app/sessions/page.tsx`
- `app/api/contact/route.ts`
- `lib/airtable.ts`

### Change Log

- 2026-05-07: Wired cached Airtable reference-data helpers into staff contact/session pages.
