---
title: 'Session Dashboard Duration Minutes'
type: 'feature'
created: '2026-05-19'
status: 'done'
route: 'one-shot'
---

# Session Dashboard Duration Minutes

## Intent

**Problem:** Starting a session always opened a two-hour live attendance/dashboard window, which is too long for the default operating flow.

**Approach:** Default new sessions to a 15-minute live window, add a duration-in-minutes field to the session form, validate the submitted duration server-side, and persist the chosen duration beside the existing Airtable attendance open/close timestamps.

## Airtable Schema

- `FOLK Test` / Sessions: added `Duration Minutes` as a whole-number field.
- `FOLK Chennai` / Sessions: added `Duration Minutes` as a whole-number field.

## Suggested Review Order

- Session form state now defaults duration to 15 minutes.
  [`sessions-manager.tsx:24`](../../components/sessions-manager.tsx#L24)

- The Start Session form now includes `Duration (minutes)`.
  [`sessions-manager.tsx:324`](../../components/sessions-manager.tsx#L324)

- Session API validates duration and defaults old clients to 15 minutes.
  [`route.ts:28`](../../app/api/sessions/route.ts#L28)

- Session API computes `Attendance Closes At` from the submitted duration.
  [`route.ts:109`](../../app/api/sessions/route.ts#L109)

- Airtable session mapping and writes include `Duration Minutes`.
  [`airtable.ts:41`](../../lib/airtable.ts#L41)
