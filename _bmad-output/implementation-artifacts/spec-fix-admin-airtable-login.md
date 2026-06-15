---
title: 'Fix Manual Airtable Staff Login Sync'
type: 'bugfix'
created: '2026-06-15'
status: 'in-review'
baseline_commit: 'fcb667aabe395e2a28db05f3a98b3fc18bcc4c23'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When an Admin is created manually in Airtable, the portal does not reliably recognize that user as an Admin because the corresponding Supabase authorization cache row is missing or stale. Airtable remains the source of truth, but manual Airtable edits currently depend on a later lazy sync path that is too fragile for first-login bootstrap.

**Approach:** Make staff login preflight an idempotent Airtable-to-Supabase bootstrap: resolve the active program, read the Airtable Users record by email, ensure/link the Supabase auth user, write the Supabase User ID back to Airtable when needed, and upsert the program-scoped Supabase membership cache before OTP verification proceeds. Keep callback/protected-route refresh as a second validation pass, not the first required sync.

## Boundaries & Constraints

**Always:** Preserve Supabase as the identity provider and Airtable Users as the staff authorization source. Keep `Admin`, `Preacher`, and `Volunteer` role semantics unchanged. Apply the fix to both `apps/gita-life` and `apps/folk` where shared behavior exists. Keep Airtable and Supabase service-role code server-only. Make the sync idempotent so repeated login attempts repair missing cache rows without duplicating users or changing valid role/status data. Do not expose tokens or user emails in logs, UI, or docs.

**Ask First:** If the fix requires changing Airtable schema, changing Supabase Auth redirect settings, or mutating live staff records beyond the existing Supabase User ID linking behavior and Supabase cache upserts, stop and ask. If the live deployment actually requires generic `AIRTABLE_BASE_ID` or generic table ID env vars to override a program profile for both apps, stop before removing that behavior.

**Never:** Do not bypass Airtable staff checks, create hardcoded admin users, weaken status/role validation, remove stale-sync safeguards, or make Gita Life read Folk data as a fallback. Do not require admins to use the invite flow when they have already created a valid Airtable Users record. Do not change participant registration/login copy as part of this bug fix.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gita Life Admin first login | Active Admin exists in the Gita Life Users table, Supabase auth user may exist, and no `gita-life` `staff_memberships` row exists | `/api/auth/signin` resolves program `gita-life`, links/provisions the Supabase auth user, upserts `staff_memberships`, `staff_profiles`, and `airtable_identities`, then returns `{ ready: true }` | Supabase/Airtable write failures return safe server errors without exposing secrets |
| Existing Supabase user, new Airtable staff record | Supabase Auth already contains the email from another program or prior login; Airtable manually adds the user as active staff for the current program | Login preflight attaches the current program membership to the existing auth user and updates Airtable `Supabase User ID` if blank/stale | Email mismatch, inactive status, or unsupported role fails closed |
| Folk Admin login | Active Admin exists in the Folk Users table | Folk runs the same bootstrap for program `folk` and preserves current auth behavior | Existing inactive/missing staff errors remain unchanged |
| Cross-program env bleed | Gita Life runtime has a stale generic `AIRTABLE_BASE_ID` pointing at Folk but no `GITA_LIFE_AIRTABLE_BASE_ID` | Gita Life uses its static Gita Life profile base/table IDs, not the generic Folk IDs, before syncing Supabase | Missing token/config errors remain explicit |
| Explicit program override | `GITA_LIFE_AIRTABLE_BASE_ID` or table ID env vars are set | Program-prefixed values override the static profile as before | Invalid IDs fail through existing Airtable request/config errors |

</frozen-after-approval>

## Code Map

- `lib/airtable.ts` -- Airtable base/table resolver and staff lookup used by `/api/auth/signin` and `syncStaffProfileByEmail()`.
- `lib/authz.ts` -- owns `syncStaffProfileByEmail()`, which already writes `staff_profiles`, `staff_memberships`, and `airtable_identities`.
- `apps/gita-life/app/api/auth/signin/route.ts` and `apps/folk/app/api/auth/signin/route.ts` -- identical signin preflight routes; useful for targeted verification but should need little or no route-local change.
- `apps/gita-life/next.config.mjs` and `apps/folk/next.config.mjs` -- app-local Next configs; should embed immutable program identity for deployed server code.
- `packages/program-config/src/server.ts` -- server program/env resolver used by authz, Airtable, invite, and manage flows.
- `supabase/migrations/20260613010000_add_program_scoped_staff_memberships.sql` and `lib/supabase/types.ts` -- schema/types already support the target cache rows; update only if code discovers a missing column/constraint.
- `scripts/verify-program-readiness.mjs` -- static readiness checks for program identity, Airtable mappings, and staff auth sync contracts.
- `eslint.config.mjs` -- source lint scope; generated Vercel output should not be linted.

## Tasks & Acceptance

**Execution:**
- [x] `lib/authz.ts` -- extract or add an idempotent staff sync helper usable by both callback and signin preflight -- centralizes Supabase cache writes and avoids route-level duplication.
- [x] `apps/gita-life/app/api/auth/signin/route.ts` and `apps/folk/app/api/auth/signin/route.ts` -- after ensuring/linking the Supabase auth user, invoke the shared sync helper for the resolved program before returning ready -- makes manual Airtable staff creation sufficient for first login.
- [x] `lib/airtable.ts` -- keep Airtable `Supabase User ID` linking idempotent and safe when the field is blank or stale -- preserves Airtable as the operational staff source while recording the auth identity.
- [x] `apps/gita-life/next.config.mjs` and `apps/folk/next.config.mjs` -- set app-local immutable program identity while preserving root config -- prevents deployed route handlers from resolving the wrong program during sync.
- [x] `packages/program-config/src/server.ts` and/or `lib/airtable.ts` -- distinguish program-prefixed ID overrides from generic fallback where needed -- prevents stale generic Airtable IDs from routing manual staff sync to the wrong base.
- [x] Add or update focused tests/scripts where the repo has suitable coverage -- verify manual staff bootstrap, existing auth-user cross-program membership creation, inactive user denial, and Gita Life/Folk program isolation.
- [x] Review auth error surfaces only as needed -- preserve safe messages while ensuring real configuration/auth failures are debuggable from server-side context.
- [x] `eslint.config.mjs` -- ignore generated `.vercel/**` output -- keeps lint focused on source files after local app builds.

**Acceptance Criteria:**
- Given an active Admin is manually created in Gita Life Airtable with no Supabase User ID, when that email starts staff login, then Supabase has or receives an auth user and a fresh `gita-life` `staff_memberships` row with role `Admin`.
- Given a Supabase Auth user already exists from Folk, when the same email is added manually to Gita Life Airtable as active staff, then Gita Life login creates a separate `gita-life` membership without corrupting the existing Folk authorization state.
- Given Gita Life is built/deployed without runtime `PROGRAM_ID`, when staff auth code calls `resolveProgramId()`, then it resolves `gita-life` instead of falling back to `folk`.
- Given Gita Life has a generic `AIRTABLE_BASE_ID` from Folk and no `GITA_LIFE_AIRTABLE_BASE_ID`, when manual staff sync runs, then it queries the Gita Life profile base and Users table.
- Given a program-prefixed Airtable override exists, when Airtable config is resolved, then that override still wins over the static profile.
- Given Folk uses existing generic local Airtable env vars, when Folk staff login runs, then Folk behavior remains compatible and does not require new prefixed variables.

## Spec Change Log

## Design Notes

Manual Airtable creation is a legitimate staff provisioning path. The architecture should treat login preflight as a pull-based sync event from Airtable into Supabase, not as a purely auth-user preparation route. This is boring and auditable: every login attempt re-reads Airtable source data and repairs the small Supabase authorization cache.

The callback/protected-route sync should remain because authorization still depends on the signed-in Supabase user and fresh Airtable data. The preflight sync makes the first login work; the post-auth sync makes the session trustworthy.

Program identity hardening remains important. Package scripts are good local defaults, but serverless route handlers should not depend on `next start` receiving `PROGRAM_ID`; the app boundary already knows whether it is Folk or Gita Life.

## Verification

**Commands:**
- `pnpm test:program-readiness` -- expected: program identity, Airtable mapping, and signin sync contract checks pass.
- `pnpm guardrails` -- expected: monorepo boundaries remain valid.
- `pnpm typecheck:workspace` -- expected: all workspace package/app typechecks pass.
- `pnpm --dir apps/gita-life build` -- expected: Gita Life builds with embedded `gita-life` program identity.
- `pnpm --dir apps/folk build` -- expected: Folk builds with embedded `folk` program identity and no auth regression.
- `pnpm lint` -- expected: source lint passes; generated `.vercel/**` output is ignored.

**Manual checks (if credentials are available):**
- On Gita Life, submit a manually created active Admin staff email, verify `/api/auth/signin` returns ready, confirm Supabase receives a `gita-life` `staff_memberships` row, complete OTP, and confirm redirect lands on `/dashboard`.
- Repeat a Folk staff login smoke test to confirm no cross-app auth regression.
