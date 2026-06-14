---
title: 'Fix Gita Life Invite Redirects And Supabase Setup'
type: 'bugfix'
created: '2026-06-14'
status: 'done'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Gita Life staff invites can be generated with the wrong callback URL, especially after local Supabase setup rewrites app env files with the FOLK localhost. Local Supabase also only allow-lists the FOLK localhost redirect, so Gita Life invite links can fail before `/auth/confirm` gets a chance to establish staff cookies.

**Approach:** Make invite routes use a validated server-side auth-confirm redirect helper that prefers the current request origin, update local Supabase setup to preserve per-app site URLs, and allow-list the Gita Life local callback URLs. Keep the existing `/auth/confirm`, `/auth/hash-callback`, and implicit-session completion flow intact because it already supports Supabase `code`, `token_hash`, and fragment-based callbacks.

## Boundaries & Constraints

**Always:** Keep service-role Supabase access server-only. Preserve program-scoped staff authorization and Airtable-first invite mutation rules. Apply the same route hardening to FOLK and Gita Life so shared invite behavior stays aligned.

**Ask First:** Any hosted Supabase project-setting change that cannot be represented in repo config or docs. Any change to invite email copy, landing-page routing by role, or Airtable schema.

**Never:** Do not expose Supabase service-role keys or tokens. Do not remove the hash-fragment fallback flow. Do not make the browser responsible for constructing service-role invite links.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gita Life local invite | `apps/gita-life/.env.local` has `NEXT_PUBLIC_SITE_URL=http://localhost:3001` | Supabase invite receives `redirectTo=http://localhost:3001/auth/confirm` | N/A |
| Gita Life hosted invite with stale env | Request reaches the Gita Life deployment but `NEXT_PUBLIC_SITE_URL` still points at FOLK | Supabase invite receives the Gita Life request origin plus `/auth/confirm` | Hosted Supabase template must use `{{ .RedirectTo }}` or `{{ .ConfirmationURL }}` |
| Missing site URL | Invite API runs without a valid app base URL | API fails before Airtable user mutation or Supabase invite | Return an actionable server error without secrets |
| Existing Supabase user | Supabase rejects invite because the email is already registered | App sends a passwordless sign-in link to the same `/auth/confirm` callback | Surface a successful “sign-in link sent” result |
| Local Supabase setup | Developer runs `pnpm supabase:env` | FOLK keeps port 3000 and Gita Life keeps port 3001 | Script exits on missing local Supabase credentials |
| Local redirect allow-list | Supabase local auth receives Gita Life callback redirect | `localhost:3001/auth/confirm` and `127.0.0.1:3001/auth/confirm` are permitted | Supabase rejects only non-allow-listed URLs |

</frozen-after-approval>

## Code Map

- `apps/gita-life/app/api/admin/invite-user/route.ts` -- Admin staff invite endpoint currently builds `redirectTo` inline from `NEXT_PUBLIC_SITE_URL`.
- `apps/gita-life/app/api/volunteers/invite/route.ts` -- Preacher/Admin volunteer invite endpoint has the same inline redirect construction.
- `apps/folk/app/api/admin/invite-user/route.ts` and `apps/folk/app/api/volunteers/invite/route.ts` -- Matching FOLK endpoints that should stay behaviorally aligned.
- `scripts/use-local-supabase-env.sh` -- Local credential writer currently emits one `NEXT_PUBLIC_SITE_URL` for both apps.
- `supabase/config.toml` -- Local Supabase auth allow-list currently contains only FOLK localhost URLs.

## Tasks & Acceptance

**Execution:**
- [x] `lib/site-url.ts` -- add a server-only helper for request-origin-first `/auth/confirm` redirect construction with env fallback -- prevents stale FOLK env from leaking into Gita Life invites.
- [x] `lib/supabase/invite.ts` -- add a server-only invite sender that falls back to passwordless sign-in for existing Supabase users -- prevents already-registered staff from producing a hard 502.
- [x] `apps/*/app/api/**/invite*/route.ts` -- replace inline redirect string construction with the helper and validate before Airtable mutation -- prevents half-created invites when setup is broken.
- [x] `components/invite-user-form.tsx` -- show when an existing user received a sign-in link instead of a fresh invite -- gives inviters accurate feedback.
- [x] `scripts/use-local-supabase-env.sh` -- write app-specific local site URLs -- prevents Gita Life env from being reset to FOLK port 3000.
- [x] `supabase/config.toml` -- allow-list Gita Life local auth callback URLs -- lets local Supabase accept the Gita Life invite redirect.
- [x] `docs/development-guide.md` and `docs/deployment-guide.md` -- document the per-app localhost URLs and hosted Supabase callback requirement -- makes setup reproducible.

**Acceptance Criteria:**
- Given Gita Life local env uses port 3001, when either invite API sends a Supabase invite, then the redirect URL points to `http://localhost:3001/auth/confirm`.
- Given the site URL is absent or invalid, when either invite API is called, then it fails before Airtable user creation and reports the configuration issue safely.
- Given `pnpm supabase:env` is run, when the script rewrites app env files, then FOLK receives port 3000 and Gita Life receives port 3001.
- Given local Supabase auth validates redirects, when a Gita Life invite callback uses `/auth/confirm`, then the local allow-list includes the URL.

## Spec Change Log

## Verification

**Commands:**
- `pnpm guardrails` -- expected: monorepo guardrails pass.
- `pnpm typecheck:workspace` -- expected: all workspace type checks pass.
- `pnpm lint` -- expected: no new lint failures.
