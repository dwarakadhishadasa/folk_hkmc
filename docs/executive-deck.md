# Executive Deck

## 1. Current Product

`folk_hkmc` is the HKMC program operations monorepo. It currently ships FOLK Chennai and Gita Life web apps for public onboarding, attendance, staff outreach, live monitoring, and staff invitations.

## 2. What Changed Since The Old Docs

The older documentation is stale where it describes a single root app. The code now includes program-scoped Next.js app workspaces, Supabase staff authentication, a program membership bridge, implemented contact and registration APIs, session-scoped attendance, staff invite workflows, monorepo guardrails, and GitHub quality/branch-policy automation.

## 3. Current Architecture

The product is two Next.js web applications backed by shared code:

- `apps/folk` and `apps/gita-life` render program-branded pages and route handlers.
- Supabase authenticates staff and stores local program memberships/profiles.
- Airtable stores operational program records, resolved by program config/env.
- `packages/*` carries browser-safe data contracts, program config, server export shims, and shared UI.
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
- Airtable must provide compatible tables and field names for each program base.
- Environment variables are required for Supabase, program identity, and generic or program-prefixed Airtable config.
- HTTPS is needed for PWA/service worker behavior outside local development.

## 7. Current Risks

- There is no automated product test suite.
- `next build` ignores TypeScript errors.
- Program workspaces must stay in parity unless intentional divergence is documented.
- Airtable schema drift can break runtime behavior.
- Service-worker queue paths must stay aligned with actual routes.
- Some legacy files remain in the repo and should not be mistaken for active runtime code.

## 8. Recommended Next Steps

- Treat `docs/index.md` as the primary AI context entry point.
- Keep `_bmad-output/project-context.md` aligned with route/auth/data changes.
- Add automated coverage around auth, registration, attendance, and staff invite flows when practical.
- Confirm production Supabase redirect URLs, `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID`, and Airtable table IDs before deployment changes.
