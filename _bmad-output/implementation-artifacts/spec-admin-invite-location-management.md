---
title: 'Admin Invite Location Management'
type: 'feature'
created: '2026-06-11'
status: 'done'
route: 'plan-code-review'
---

# Admin Invite Location Management

## Intent

**Problem:** Admin staff invites required raw Airtable Location record IDs, which made location assignment hard to understand and easy to mistype.

**Approach:** Replace the raw ID input with a location picker that displays existing locations by name, supports multiple selections, and lets Admin users add a new location inline before sending the invite.

## UX Notes

- Existing locations are visible as checkbox rows with selected-state styling and a live selected count.
- New locations can be added from the same form section; duplicates are detected and selected instead of silently creating a duplicate row.
- Volunteer invite behavior remains on the assigned-preacher path and does not display location assignment controls.
- The interaction stays inside the existing card and visual system: compact form layout, saffron action color, royal-blue feedback surfaces.

## Code Map

- `components/invite-user-form.tsx` - replaces Location Record IDs with the location picker, add-location control, and role-aware payload.
- `app/admin/invite/page.tsx` - loads cached locations for the Admin invite screen.
- `app/api/admin/locations/route.ts` - creates or returns an existing location through an Admin-only endpoint.
- `app/api/admin/invite-user/route.ts` - validates selected location IDs before staff invite persistence.
- `lib/airtable.ts` - adds Airtable helpers for finding and creating Location records.

## Verification

**Commands:**
- `pnpm exec eslint components/invite-user-form.tsx app/admin/invite/page.tsx app/api/admin/invite-user/route.ts app/api/admin/locations/route.ts lib/airtable.ts` - passed.
- `pnpm exec tsc --noEmit --pretty false` - passed.
- `git diff --check` - passed for tracked edits.
- `pnpm lint` - fails on pre-existing `_bmad/wds/scripts/*` CommonJS `require()` lint errors unrelated to this change.

## Suggested Review Order

**Invite UX**

- Start with the role-aware picker, selected count, and inline add flow.
  [`invite-user-form.tsx:82`](../../components/invite-user-form.tsx#L82)

- Review the visible location selection surface replacing raw record IDs.
  [`invite-user-form.tsx:251`](../../components/invite-user-form.tsx#L251)

**Server Contract**

- Confirm Admin invite page supplies cached location records by name.
  [`page.tsx:14`](../../app/admin/invite/page.tsx#L14)

- Confirm new locations require Admin access and duplicate names reuse existing records.
  [`route.ts:16`](../../app/api/admin/locations/route.ts#L16)

- Confirm invite submission validates selected location IDs before persistence.
  [`route.ts:53`](../../app/api/admin/invite-user/route.ts#L53)

- Confirm Airtable helper behavior for find-by-name and create-with-cache-refresh.
  [`airtable.ts:604`](../../lib/airtable.ts#L604)
