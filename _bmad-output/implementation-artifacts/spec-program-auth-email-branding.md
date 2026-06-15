---
title: 'Program Auth Email Branding'
type: 'bugfix'
created: '2026-06-15'
status: 'done'
baseline_commit: 'c31933a971489506c8e541df86befd175d13ce28'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Staff auth emails requested from the Gita Life app can still read like the FOLK app, for example "Your FOLK HKMC sign-in code is". The same risk applies to Supabase invite emails in the shared auth project, which can confuse invited staff about which portal they are joining.

**Approach:** Make the active program name available to Supabase Auth email templates through user metadata before sign-in OTPs, fresh invites, and existing-user invite fallbacks are sent. Use the existing program profile branding so FOLK sends "FOLK" and Gita Life sends "Gita Life", then update local/templates documentation so Magic Link/OTP and invite emails render metadata instead of hardcoded FOLK copy.

## Boundaries & Constraints

**Always:** Keep Supabase service-role operations server-only. Preserve the existing staff preflight: validate an active Airtable staff user, ensure/reuse the Supabase Auth user, sync staff profile, and only then let the client call `signInWithOtp`. Preserve existing invite rules: route authorization, Airtable user upsert, invite log writes, and existing-user fallback delivery. Use `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID` through existing program-config helpers as the source of truth. Preserve any existing Supabase user metadata keys when writing the email brand metadata.

**Ask First:** Any change that creates separate Supabase projects per app, changes the staff login method away from Supabase email OTP/invite, changes hosted Supabase settings directly from code, or changes email copy beyond replacing/adding the app/program name.

**Never:** Do not expose service-role keys or Airtable tokens to client code. Do not hardcode Gita Life in FOLK routes or FOLK in Gita Life routes. Do not make Supabase Auth identity metadata an authorization source; it is email presentation data only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| FOLK staff OTP | FOLK app runs with `PROGRAM_ID=folk`; active staff email submits login | Supabase Auth user metadata includes `auth_email_brand_name: "FOLK"` before OTP send; template renders `Your FOLK sign-in code is:` | Existing invalid/inactive staff errors remain unchanged |
| Gita Life staff OTP | Gita Life app runs with `PROGRAM_ID=gita-life`; active staff email submits login | Supabase Auth user metadata includes `auth_email_brand_name: "Gita Life"` before OTP send; template renders `Your Gita Life sign-in code is:` | Existing invalid/inactive staff errors remain unchanged |
| Fresh staff invite | Admin/Preacher invite creates a new Supabase Auth user | Invite metadata includes current program brand; invite template renders an app-specific invitation such as `You have been invited to Gita Life` | Existing invite validation and safe Supabase errors remain unchanged |
| Existing-user invite fallback | Invitee email already has a Supabase Auth user | Existing user's metadata is updated for the current program before the fallback sign-in link/OTP email is sent | If metadata update or fallback email fails, invite log records failure and API returns safe error |
| Existing shared Supabase user | Same email already exists from another program or earlier login | Metadata update preserves unrelated `user_metadata` keys and overwrites only the auth email branding keys for the current request | If admin metadata update fails, login/invite preflight fails safely before email send |
| Missing metadata in template | Hosted template has not yet been copied or metadata is absent | Local templates fall back to FOLK instead of rendering an empty brand | Hosted Supabase must be updated manually if it still contains hardcoded FOLK text |

</frozen-after-approval>

## Code Map

- `apps/folk/app/api/auth/signin/route.ts` -- FOLK staff login preflight; validates Airtable staff, ensures Supabase user, syncs profile before browser OTP send.
- `apps/gita-life/app/api/auth/signin/route.ts` -- Gita Life copy of the same login preflight and current source of incorrect email branding when metadata is not program-specific.
- `lib/auth-context.tsx` -- browser OTP sender; must forward request-scoped email branding from `/api/auth/signin` into `signInWithOtp`.
- `lib/supabase/invite.ts` -- shared server-only invite sender; calls Supabase Admin `inviteUserByEmail` for fresh invites and passwordless `signInWithOtp` for existing-user fallback.
- `components/invite-user-form.tsx` -- invite feedback message for fresh invites and existing-user fallback delivery.
- `packages/program-config/src/programs/folk.ts` and `packages/program-config/src/programs/gita-life.ts` -- existing source of public/server program branding; `branding.shortName` is the desired OTP email brand.
- `supabase/config.toml` -- local Supabase auth template config; currently configures invite only.
- `supabase/templates/invite.html` -- existing local auth email template example and style baseline.
- `docs/deployment-guide.md` and `docs/development-guide.md` -- operational docs for hosted Supabase settings and local Supabase behavior.

## Tasks & Acceptance

**Execution:**
- [x] `lib/supabase/auth-email-branding.ts` -- add a server-only helper that resolves current program branding and merges `auth_email_brand_name` into Supabase user metadata without deleting unrelated keys.
- [x] `apps/folk/app/api/auth/signin/route.ts` and `apps/gita-life/app/api/auth/signin/route.ts` -- call the helper after ensuring the Auth user and before returning `{ ready: true }`.
- [x] `lib/auth-context.tsx` -- pass the returned branding metadata into the browser `signInWithOtp` request so the email send uses request-scoped branding.
- [x] `lib/supabase/invite.ts` -- pass the same metadata to `inviteUserByEmail`; for existing-user fallback, update metadata before sending the fallback `signInWithOtp` email and include `options.data` as an extra guard.
- [x] `components/invite-user-form.tsx` -- keep existing-user fallback feedback neutral as a sign-in email rather than assuming link-only copy.
- [x] `supabase/templates/magic-link.html` -- add a local Magic Link/OTP template that uses `{{ .Data.auth_email_brand_name }}` with FOLK fallback and includes `{{ .Token }}` for the email code.
- [x] `supabase/templates/invite.html` -- update the existing invite template to render the same metadata-backed brand in the invite copy.
- [x] `supabase/config.toml` -- add `[auth.email.template.magic_link]` pointing at the new local template.
- [x] `docs/development-guide.md` and `docs/deployment-guide.md` -- document that hosted Supabase Magic Link/OTP and Invite templates must use the metadata-backed brand expression.

**Acceptance Criteria:**
- Given the FOLK app handles `/api/auth/signin`, when an active staff email passes preflight, then the Supabase Auth user metadata contains `auth_email_brand_name` set to `FOLK`.
- Given the Gita Life app handles `/api/auth/signin`, when an active staff email passes preflight, then the Supabase Auth user metadata contains `auth_email_brand_name` set to `Gita Life`.
- Given either app sends a fresh staff invite, when Supabase renders the invite email, then the visible copy includes that app's brand.
- Given an invite falls back to a sign-in email for an existing Supabase user, when the fallback email renders, then the visible copy includes that app's brand.
- Given a Supabase Auth user already has unrelated metadata, when either app updates auth email branding, then unrelated metadata keys remain intact.
- Given local Supabase sends a Magic Link/OTP or invite email, when the template renders, then the visible copy uses the metadata brand and no hardcoded `FOLK HKMC` string.

## Spec Change Log

## Verification

**Commands:**
- `pnpm guardrails` -- expected: monorepo package/server-only guardrails pass.
- `pnpm typecheck:workspace` -- expected: both apps and shared packages typecheck.
- `pnpm lint` -- expected: no new lint errors.
- `rg -n "FOLK HKMC|auth_email_brand_name" apps lib supabase docs` -- expected: no hardcoded `FOLK HKMC`; metadata key appears only in server helper/template/docs locations.

**Manual checks:**
- In Supabase Dashboard Auth Email Templates, copy the Magic Link/OTP body from `supabase/templates/magic-link.html` and the Invite body from `supabase/templates/invite.html`, or at least replace hardcoded app names in both templates with `{{ if .Data.auth_email_brand_name }}{{ .Data.auth_email_brand_name }}{{ else }}FOLK{{ end }}`.

## Suggested Review Order

**Branding Source And Metadata**

- Active program short name is the single email brand source.
  [`auth-email-branding.ts:65`](../../lib/supabase/auth-email-branding.ts#L65)

- Metadata merge preserves unrelated fields and skips unchanged writes.
  [`auth-email-branding.ts:47`](../../lib/supabase/auth-email-branding.ts#L47)

- FOLK signin preflight returns the resolved email brand.
  [`route.ts:102`](../../apps/folk/app/api/auth/signin/route.ts#L102)

- Gita Life signin preflight mirrors the same brand handoff.
  [`route.ts:102`](../../apps/gita-life/app/api/auth/signin/route.ts#L102)

**OTP Email Send Path**

- Browser forwards request-scoped branding into Supabase OTP send.
  [`auth-context.tsx:117`](../../lib/auth-context.tsx#L117)

**Invite Email Path**

- Fresh invites and fallback sign-in emails share the brand metadata.
  [`invite.ts:57`](../../lib/supabase/invite.ts#L57)

- Existing-user fallback feedback stays neutral for link or code emails.
  [`invite-user-form.tsx:175`](../../components/invite-user-form.tsx#L175)

**Templates And Operations**

- Local OTP template renders the metadata-backed program name.
  [`magic-link.html:1`](../../supabase/templates/magic-link.html#L1)

- Invite template uses the same brand expression and redirect target.
  [`invite.html:1`](../../supabase/templates/invite.html#L1)

- Local Supabase config registers the Magic Link template.
  [`config.toml:254`](../../supabase/config.toml#L254)

- Hosted Supabase template guidance covers OTP and invite emails.
  [`deployment-guide.md:91`](../../docs/deployment-guide.md#L91)

- Local development docs call out template restart behavior.
  [`development-guide.md:78`](../../docs/development-guide.md#L78)
