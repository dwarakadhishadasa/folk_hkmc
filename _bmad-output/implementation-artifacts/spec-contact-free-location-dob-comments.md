---
title: 'Contact Free Location DOB Comments'
type: 'feature'
created: '2026-05-17'
status: 'done'
route: 'one-shot'
---

# Contact Free Location DOB Comments

## Intent

**Problem:** The staff contact form still collected Age and forced Location through a dropdown, while Airtable already has `Date of Birth` and `Notes` fields needed for richer contact capture.

**Approach:** Replace the contact form Age control with a Date of Birth date input, make Location a required text input, and send optional Comments through the staff contact API into Airtable `Notes`.

## Suggested Review Order

- Contact form state now carries `dateOfBirth`, free-text `location`, and `comments`.
  [`contact-form.tsx:8`](../../components/contact-form.tsx#L8)

- Staff-facing fields now show Date of Birth, Location input, and Comments textarea.
  [`contact-form.tsx:199`](../../components/contact-form.tsx#L199)

- Contact page no longer loads location reference data for the form dropdown.
  [`page.tsx:10`](../../app/contact/page.tsx#L10)

- Contact API validates optional DOB format, requires entered location text, and forwards comments.
  [`route.ts:24`](../../app/api/contact/route.ts#L24)

- Airtable contact mapping and writes include `Date of Birth` and `Notes`.
  [`airtable.ts:14`](../../lib/airtable.ts#L14)
