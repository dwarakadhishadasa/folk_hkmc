# folk_hkmc - Development Guide

**Date:** 2026-04-23

## Prerequisites

- Node.js 20+
- `pnpm`
- Airtable API token supplied as `AIRTABLE_API_TOKEN`
- Airtable interface dashboard page supplied as `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID` for Admin dashboard access

## Installation

```bash
pnpm install
```

## Run Locally

```bash
pnpm dev
```

Default Next.js local URL is `http://localhost:3000`.

## Build and Lint

```bash
pnpm lint
pnpm build
pnpm start
```

## Environment Variables

### Required for Implemented Backend Logic

- `AIRTABLE_API_TOKEN`

### Important Notes

- Airtable defaults to base `apprnbZdVhoog9vgG`; table identifiers can be overridden with `AIRTABLE_CONTACTS_TABLE_ID` / `AIRTABLE_CONTACTS_TABLE_NAME` and `AIRTABLE_ATTENDANCE_TABLE_ID` / `AIRTABLE_ATTENDANCE_TABLE_NAME`
- The Admin dashboard Airtable link uses `AIRTABLE_BASE_ID` plus `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID`, currently `pagc77PtbNsr9ljWu`
- without `AIRTABLE_API_TOKEN`, attendance reads and writes will fail

## Local Credentials

The current staff auth system is local-only and hardcoded:

- `volunteer` / `haribol123`
- `preacher` / `haribol456`

These are stored in client code and used only by `lib/auth-context.tsx`.

## Route Map

| Route | Purpose | Access |
| --- | --- | --- |
| `/` | Public homepage | Public |
| `/login` | Local sign-in screen | Public |
| `/register` | Participant registration | Public |
| `/attend` | Attendance entry | Public |
| `/contact` | Contact entry | Client-gated login required |
| `/dashboard` | Live attendance dashboard | Client-gated preacher role |
| `/attendance` | Attendance API route | HTTP-accessible route |

## Manual Verification Checklist

### Public Flows

- Load homepage and confirm brand assets render
- Open `/register` and verify form validation states
- Open `/attend` and verify mobile-number validation

### Auth Flows

- Log in as `volunteer` and confirm `/contact` is accessible but `/dashboard` is blocked
- Log in as `preacher` and confirm `/dashboard` loads
- Refresh the page and confirm auth state hydrates from `localStorage`

### Attendance Flow

- Submit a known registered mobile number and confirm success
- Submit the same number again on the same day and confirm duplicate handling
- Submit an unknown number and confirm redirect to `/register?mobile=...`

### Offline/PWA Flow

- Run on localhost or HTTPS so the service worker can register
- Disable network and submit attendance to verify `202 queued` handling
- Re-enable network and verify queued requests sync
- Confirm the offline indicator shows pending work when relevant

## Known Development Constraints

- There is no automated test suite
- `next.config.mjs` ignores TypeScript build errors during production build
- `GET /attendance` is publicly reachable despite the dashboard being role-gated in the UI
- `/api/registration` and `/api/contact` are referenced by the UI but not implemented in this repository
- PWA install prompt logic includes an incorrect image source (`/public/images/folk-logo.png`) that does not match Next public-path conventions

## Troubleshooting

### Attendance calls fail

Check:

- `AIRTABLE_API_TOKEN` is set
- Airtable base and table identifiers resolve to the intended base/tables
- the participant exists in the Airtable contacts table

### Service worker does not register

Check:

- you are using localhost or HTTPS
- the browser supports service workers
- registration failures are not being silently skipped in the console

### Dashboard stays empty

Check:

- attendance records exist for the requested date
- `/attendance` responds successfully
- Airtable date fields match the filtering logic in `lib/airtable.ts`

---

Generated using the BMAD `document-project` workflow pattern.
