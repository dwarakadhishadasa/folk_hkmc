---
title: 'Default Contact Creation Metadata'
type: 'feature'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
---

# Default Contact Creation Metadata

## Intent

**Problem:** Newly created Airtable Contacts were not automatically stamping `Initial Contact` and `Last Contacted On`, were not linked to the singleton `Analytics` record, and non-volunteer contact creation could leave `Collected By` pointing at the staff actor instead of the responsible preacher.

**Approach:** Set both contact date fields and the Analytics link in the shared Airtable contact writer, and make collector resolution prefer the explicit volunteer collector while defaulting to the resolved preacher when no volunteer collector is provided.

## Suggested Review Order

- Shared defaults stamp every new Contact before the Airtable write.
  [`airtable.ts:486`](../../lib/airtable.ts#L486)

- New Contacts link to the singleton Analytics record.
  [`airtable.ts:482`](../../lib/airtable.ts#L482)

- Contact mapping now carries the new Airtable date fields back to callers.
  [`airtable.ts:441`](../../lib/airtable.ts#L441)

- Collector fallback preserves volunteers while defaulting other paths to preacher ownership.
  [`airtable.ts:504`](../../lib/airtable.ts#L504)

- Staff contact creation passes preacher as collector unless the staff actor is a Volunteer.
  [`route.ts:74`](../../app/api/contact/route.ts#L74)
