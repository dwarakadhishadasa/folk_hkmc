# Executive Deck

## 1. Current Product

`folk_hkmc` is the FOLK Chennai web app for public onboarding, attendance, staff outreach, live monitoring, and staff invitations.

## 2. What Changed Since The Old Docs

The April documentation is stale. The code now includes Supabase staff authentication, a local staff profile bridge, implemented contact and registration APIs, session-scoped attendance, staff invite workflows, and GitHub branch-policy automation.

## 3. Current Architecture

The app is one Next.js web application:

- Next.js renders pages and route handlers.
- Supabase authenticates staff and stores local staff profiles.
- Airtable stores operational program records.
- A service worker supports installability and offline queueing for selected form submissions.

## 4. Main Workflows

- Public visitors learn about FOLK and register.
- Participants mark attendance from a session QR/link.
- Staff create contacts after outreach.
- Preachers/Admins create live attendance sessions.
- Admins invite staff and manage locations.
- Preachers/Admins invite Volunteers.

## 5. Role Model

- Volunteer: contact capture only.
- Preacher: contact capture, sessions, dashboard, volunteer invites, Airtable manage link.
- Admin: all staff actions, including staff invite and location creation.

## 6. Operational Dependencies

- Supabase must be configured for staff auth and callbacks.
- Airtable must provide compatible tables and field names.
- Environment variables are required for both systems.
- HTTPS is needed for PWA/service worker behavior outside local development.

## 7. Current Risks

- There is no automated product test suite.
- `next build` ignores TypeScript errors.
- Airtable schema drift can break runtime behavior.
- Service-worker queue paths must stay aligned with actual routes.
- Some legacy files remain in the repo and should not be mistaken for active runtime code.

## 8. Recommended Next Steps

- Treat `docs/index.md` as the primary AI context entry point.
- Keep `_bmad-output/project-context.md` aligned with route/auth/data changes.
- Add automated coverage around auth, registration, attendance, and staff invite flows when practical.
- Confirm production Supabase redirect URLs and Airtable table IDs before deployment changes.
