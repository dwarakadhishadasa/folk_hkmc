---
title: 'Contact Occupation College Company Fields'
type: 'feature'
created: '2026-05-19'
status: 'done'
route: 'one-shot'
---

# Contact Occupation College Company Fields

## Intent

**Problem:** The contact form collects occupation but only reveals Year for students, leaving no place to capture college or company details.

**Approach:** Show a College text input when occupation is Student, show a Company text input when occupation is Working Professional, save only the relevant value to Airtable, and add the missing Airtable text fields.

## Airtable Schema

- `FOLK Test` / Contacts: added `College` and `Company` as `singleLineText` fields.
- `FOLK Chennai` / Contacts: added `College` and `Company` as `singleLineText` fields.

## Suggested Review Order

- Contact form state and occupation switching now keep only the relevant school/work field.
  [`contact-form.tsx:8`](../../components/contact-form.tsx#L8)

- Student now reveals Year plus College.
  [`contact-form.tsx:232`](../../components/contact-form.tsx#L232)

- Working Professional now reveals Company.
  [`contact-form.tsx:275`](../../components/contact-form.tsx#L275)

- Contact API forwards College for students and Company for working professionals.
  [`route.ts:120`](../../app/api/contact/route.ts#L120)

- Airtable contact mapping and create writes include `College` and `Company`.
  [`airtable.ts:14`](../../lib/airtable.ts#L14)
