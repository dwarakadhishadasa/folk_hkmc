---
title: 'Fix Gita Life Invite Email Link'
type: 'bugfix'
created: '2026-06-16'
status: 'in-review'
baseline_commit: '90b8f8a406858e0fbf84973f91944afa097a4f9d'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-fix-gita-life-invite-redirects-supabase.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-program-auth-email-branding.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Gita Life invite emails can display the correct Gita Life brand while the action link still points users at the FOLK app. In a shared Supabase Auth project, any template or fallback that depends on the project Site URL can leak the FOLK origin into Gita Life invites.

**Approach:** Carry the request-scoped invite action URL in the same Supabase Auth metadata used for email branding, and update the invite email template/docs to prefer that program-specific URL. Keep the existing `redirectTo` option because Supabase needs it for allow-list validation and confirmation behavior, but give hosted templates a direct program-scoped link that does not depend on the shared Site URL.

## Boundaries & Constraints

**Always:** Preserve the existing invite route authorization, Airtable user upsert, Supabase invite send, existing-user fallback, and invite-log behavior. Keep service-role Supabase access server-only. Resolve the action URL from the current request origin with the existing env fallback behavior, so Gita Life requests produce a Gita Life `/auth/confirm` URL and FOLK requests produce a FOLK one.

**Ask First:** Any direct hosted Supabase dashboard change, separate Supabase project per app, email provider migration, new staff-auth flow, or copy rewrite beyond the invite action link guidance.

**Never:** Do not hardcode Gita Life domains in shared code, do not change the Supabase Auth Site URL from app code, do not expose service-role credentials to client code, and do not make Supabase user metadata an authorization source.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gita Life fresh invite | Request reaches the Gita Life invite API on `https://gita-life.example.org` | Supabase invite metadata includes an action URL beginning `https://gita-life.example.org/auth/confirm`; the template link uses it with `token_hash` and `type=invite` | Existing Supabase invite errors still return safe 502 messages |
| FOLK fresh invite | Request reaches the FOLK invite API on `https://folk.example.org` | Supabase invite metadata includes the FOLK `/auth/confirm` action URL; FOLK behavior remains unchanged except for metadata shape | Existing behavior remains intact |
| Existing-user fallback | Invitee already has a Supabase Auth user | The metadata update before fallback sign-in includes the current program action URL as well as brand name | Metadata/list-user failures still surface through existing safe invite error handling |
| Missing or invalid app URL | Request origin and URL env fallbacks are invalid | Invite send fails before Supabase email delivery; existing route error behavior remains safe | Do not create a misleading email link |

</frozen-after-approval>

## Code Map

- `lib/site-url.ts` -- Existing server-only helper that resolves the public app origin from request URL first, then env fallbacks, and builds `/auth/confirm`.
- `lib/supabase/auth-email-branding.ts` -- Server-only email metadata helper; currently carries only `auth_email_brand_name` and updates existing users.
- `lib/supabase/invite.ts` -- Shared invite sender; computes `redirectTo`, passes metadata into `inviteUserByEmail`, and sends fallback OTP links for existing users.
- `supabase/templates/invite.html` -- Local invite email template; currently builds the action link from `{{ .RedirectTo }}` and should prefer metadata carrying the concrete action URL.
- `docs/deployment-guide.md` -- Hosted Supabase template guidance; should tell operators to use the metadata-backed invite action URL for shared Supabase projects.
- `docs/development-guide.md` -- Local Supabase template guidance; should note that invite links are program-scoped via metadata plus `RedirectTo` fallback.

## Tasks & Acceptance

**Execution:**
- [x] `lib/supabase/auth-email-branding.ts` -- Extend email metadata to optionally include `auth_email_invite_action_url`, preserving unrelated existing user metadata -- gives templates a concrete per-program action URL.
- [x] `lib/supabase/invite.ts` -- Build the auth-confirm redirect once, pass it to both Supabase `redirectTo`/`emailRedirectTo` and the metadata helper, and keep existing invite/fallback error handling -- prevents divergence between confirmation handling and visible email link.
- [x] `supabase/templates/invite.html` -- Prefer `{{ .Data.auth_email_invite_action_url }}` for the `Accept invite` href, falling back to `{{ .RedirectTo }}` with the current `token_hash` and `type=invite` query -- fixes local emails and provides the hosted template source of truth.
- [x] `docs/deployment-guide.md` and `docs/development-guide.md` -- Update the hosted/local Supabase template instructions to copy the metadata-backed invite link and explain that `{{ .SiteURL }}` must not be used for shared FOLK/Gita Life Auth -- makes the operational fix reproducible.

**Acceptance Criteria:**
- Given a Gita Life invite API request, when the Supabase invite email is generated from the repo template, then the `Accept invite` href starts with the Gita Life app origin rather than the FOLK origin.
- Given a FOLK invite API request, when the Supabase invite email is generated from the repo template, then the `Accept invite` href remains FOLK-scoped.
- Given the hosted Supabase template is still using `{{ .SiteURL }}`, when an operator follows the updated deployment docs, then the replacement template no longer depends on the shared Supabase Site URL.
- Given an existing Supabase user is invited through Gita Life, when the fallback sign-in email metadata is updated, then the invite action URL metadata reflects the Gita Life request origin.

## Spec Change Log

## Verification

**Commands:**
- `pnpm typecheck:workspace` -- expected: shared helpers and both app workspaces typecheck.
- `pnpm lint` -- expected: no new lint errors.
- `rg -n "auth_email_invite_action_url|\\.SiteURL" lib supabase docs` -- expected: metadata key appears in invite metadata/template/docs; docs warn against `.SiteURL` for shared invite links.
