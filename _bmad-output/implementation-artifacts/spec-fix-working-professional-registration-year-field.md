---
title: 'Fix Working Professional Registration Year Field'
type: 'bugfix'
created: '2026-07-20'
status: 'done'
route: 'one-shot'
---

# Fix Working Professional Registration Year Field

## Intent

**Problem:** FOLK registration failed for Working Professional submissions because the server sent Airtable a stale `Year` field with `Unknown`, and the active Contacts schema rejects that field.

**Approach:** Stop sending `Year` for working professionals, keep sending `Company`, and make the FOLK API accept both `Working` and `Working Professional` occupation values like the Gita Life routes already do.

## Suggested Review Order

- Public registration no longer emits `Year` and still forwards Company.
  [`registration/route.ts:142`](../../apps/folk/app/api/registration/route.ts#L142)

- API boundary accepts either stored value or label-style occupation text.
  [`registration/route.ts:52`](../../apps/folk/app/api/registration/route.ts#L52)

- Staff contact creation gets the same Airtable payload correction.
  [`contact/route.ts:142`](../../apps/folk/app/api/contact/route.ts#L142)

- Broader test/schema cleanup from review is logged separately.
  [`deferred-work.md:7`](deferred-work.md#L7)
