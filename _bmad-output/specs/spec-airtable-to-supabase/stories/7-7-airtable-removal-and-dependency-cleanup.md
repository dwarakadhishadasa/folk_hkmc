---
title: 'Airtable removal and dependency cleanup'
type: 'chore'
created: '2026-10-07'
status: 'in-progress'
baseline_revision: 4c5952cb2e5fa7e19f7428e76a9edd955319d30a
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-airtable-to-supabase/SPEC.md'
  - '_bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Every runtime read of an operational entity already goes to Supabase (stories 7.1–7.6), but the Airtable dependency is still physically present: `lib/airtable.ts` (941 lines), the `@hkmc/airtable` workspace package, `packages/program-config/src/programs/shared-airtable.ts` with every table ID, `AIRTABLE_*` env config across `.env.example`/`turbo.json`/Vercel checks, and ~170 `*Airtable*` identifiers in code that now carry `public.users` UUIDs. CAP-7's success condition — repo-wide search finds no runtime Airtable reference, and build/lint/typecheck pass with no Airtable env set — is unmet, and the repo docs still describe Airtable as the operational store.

**Approach:** Delete the Airtable access layer and its package; strip the Airtable table-ID config from `program-config`; delete every `AIRTABLE_*` env declaration; rename the remaining `*Airtable*` TypeScript identifiers to the vocabulary story 7.5 already established at the authz boundary (`userId` / `assignedPreacherUserId`); update the verification scripts that assert on the deleted files; and rewrite `docs/data-models.md`, `docs/architecture.md`, `docs/api-contracts.md` plus the remaining docs that assert Airtable as the operational store (playbook step 22). Prove the build clean with the Airtable env unset.

## Boundaries & Constraints

**Always:**
- The rename pairs must move together or not at all: `ContactPayload.assignedPreacherAirtableUserId` ↔ `components/contact-form.tsx`'s form-state key are one wire contract; `InviteUserForm`'s key is read by `apps/*/app/api/admin/invite-user/route.ts`. Rename the route interface and the client form in the same change.
- Reuse the names story 7.5 already shipped: `lib/authz.ts` uses `userId` and `assignedPreacherUserId`. Do not invent a third spelling.
- `public.users.id` is the value every renamed identifier now carries. `lib/supabase/data.ts` maps `row.id` / `row.assigned_preacher_id` into them already; only the names change.
- Delete, do not stub: no compatibility re-exports of `lib/airtable.ts`, `@hkmc/airtable`, `getProgramAirtableManagementUrl`, or the `StaffMembershipContext` interface.
- `scripts/verify-program-readiness.mjs` and `scripts/verify-monorepo-guardrails.mjs` must keep enforcing something real after the deletions; `pnpm guardrails` and `node scripts/verify-program-readiness.mjs` must both exit 0.
- `public/sw.js`, every `proxy.ts`, `supabase/migrations/**` (already-applied history), and `lib/supabase/types.ts` (generated) are untouched.
- Docs are rewritten to describe the Supabase-only reality: `public.users` is the staff source of truth, `contact_attendance_counts` is the rollup, `/manage` is the in-app portal (story 7.6), and no `AIRTABLE_*` variable is read.

**Never:**
- No database schema change. Do not add a migration, do not rename `invite_log.airtable_user_id` / `invite_log.inviter_airtable_user_id` / `audit_events.actor_airtable_user_id`, and do not drop `airtable_identities` / `airtable_sync_state` / `staff_memberships` / `staff_profiles`. Reason and hand-off are in Design Notes; they belong to story 8, which owns hosted-project access.
- Do not edit already-applied migrations to rename historical columns, and do not hand-edit `lib/supabase/types.ts` to match a migration this story does not ship.
- No change to route paths, response shapes, status codes, role scoping, the service-worker offline queue, or `Asia/Kolkata` date logic. `STAFF_SYNC_STALE_AFTER_MINUTES` stays in `.env.example` until story 8 proves the staleness gate is gone.
- Do not touch generated or archival artifacts: `docs/project-scan-report.json`, `docs/.archive/**`, `docs/executive-deck.md`, `.agent/`, `.agents/`, `.codebuddy/`, `.neovate/`, `.qwen/`, `.claude/skills/**` (their "Airtable-style" wording is an unrelated adjective).
- Do not change `pnpm-lock.yaml` by hand — regenerate via `pnpm install` after removing the workspace dep.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build with no Airtable env | All `AIRTABLE_*` / `FOLK_AIRTABLE_*` / `GITA_LIFE_AIRTABLE_*` unset in every env file | `pnpm build:apps` succeeds for both apps; no module reads a missing Airtable var | Any read of an unset Airtable var throws at request time — build/lint/typecheck must be clean |
| Vercel preflight | `scripts/deploy-vercel.mjs` with only Supabase + `NEXT_PUBLIC_SITE_URL` keys present | Env validation passes; no Airtable key is required | The check must stop naming `AIRTABLE_API_TOKEN` or the script fails every future deploy |
| Contact form round-trip | Admin submits the contact form with an assigned preacher | Request body key is `assignedPreacherUserId`; route trims it, resolves the preacher, and writes `contacts.assigned_preacher_id` | Mismatched client/server spelling → `422`/`400` from `findStaffUserById`; this is the wire contract the rename must not break |
| Invite round-trip | Admin invites a Volunteer with an assigned preacher | Body key is `assignedPreacherUserId`; `upsertStaffUser` writes `assigned_preacher_id` and `invited_by` | Untrimmed/whitespace id → PostgREST `22P02`; behavior unchanged from story 7.5 (DW-7), not fixed here |
| Program config without Airtable | Any server or client module resolving a program profile | `getServerProgramProfile("folk")` returns branding + modules + `envPrefix`; `modules.airtableManage` is gone; no table-ID map exists | A consumer still reading `profile.airtable.tables` fails typecheck — that is the intended early failure |
| `/manage` portal unchanged | Signed-in Admin or Preacher loads `/manage` | Portal renders five tabs from Supabase; no Airtable URL, redirect, or fallback card | Unchanged: 401 → `/login`, 403 → never renders (story 7.6 contracts) |

</intent-contract>

## Code Map

**Delete outright (no consumer remains — verified by repo-wide grep):**
- `lib/airtable.ts` — 941 lines; the Airtable REST access layer. Nothing imports it since story 7.5.
- `packages/airtable/package.json`, `packages/airtable/src/index.ts` (`export * from "../../../lib/airtable"`), `packages/airtable/tsconfig.json` — the `@hkmc/airtable` package.
- `packages/program-config/src/programs/shared-airtable.ts` — 179 lines; the five table-ID mappings (`tbltzdtCmCHf6gJKD`, `tblxfB2W2l6OXc2IX`, `tbl9AbwkiAaAwK20X`, `tbl2aiD2NfvrBMnfI`, `tbl5IOOcS2RUkXzyG`) and the Airtable Interface page IDs.

**Workspace dependency removal (7 references):**
- `apps/folk/package.json:14`, `apps/gita-life/package.json:14` — `"@hkmc/airtable": "workspace:*"`.
- `apps/folk/tsconfig.json:16`, `apps/gita-life/tsconfig.json:16`, `tsconfig.json:17` — the `@hkmc/airtable` path mapping.
- `next.config.mjs:3` — `"@hkmc/airtable"` in `transpilePackages`.

**`packages/program-config` — strip the Airtable profile shape:**
- `packages/program-config/src/types.ts:25` `modules.airtableManage`; `:29-49` `AirtableFieldAccess`, `AirtableFieldMapping`, `AirtableTableMapping`, `AirtableInterfaceMapping`; `:53-66` `ServerProgramProfile.airtable`.
- `packages/program-config/src/programs/folk.ts:2` (`import { adminPortalInterface, operationalTables } from "./shared-airtable"`), `:36` (`airtableManage: true`), `:38-48` (the `airtable` block, `baseId: "appqea9DRLOXqErXb"`). The folk-only `address` field mapping at `:5-16` exists solely to extend the Airtable contacts table — it goes too.
- `packages/program-config/src/programs/gita-life.ts:2`, `:39`, `:41-…` — same shape for `appzbssqNK53yqjZH`.
- `packages/program-config/src/server.ts:35-42` `getProgramScopedIdEnv` (only `getProgramAirtableManagementUrl` used it), `:44-67` `getProgramAirtableManagementUrl` (zero callers since story 7.6 replaced the `/manage` redirect), and `:31-33` `getProgramScopedEnv` — the generic program-prefixed env reader whose only caller was `lib/airtable.ts`, so it is dead the moment that file goes (see Design Notes).

**Env config removal:**
- `.env.example:26-48` — the `AIRTABLE_*`, `FOLK_AIRTABLE_*`, `GITA_LIFE_AIRTABLE_*` blocks.
- `turbo.json:7-33` — 27 `AIRTABLE_*` / `*_AIRTABLE_*` names in `globalEnv`; `:45-47` — the three `*_AIRTABLE_API_TOKEN` names in the secret list.
- `scripts/deploy-vercel.mjs:119-121` — the required-`AIRTABLE_API_TOKEN` preflight that would fail every deploy once the vars are gone.

**Identifier rename sweep — `lib/supabase/data.ts` (1151 lines) is the epicenter:**
- `lib/supabase/data.ts:11` `AirtableRecord<TFields>` (used as `findLocationById`'s return envelope at `:740`), `:152` `AirtableConfigError`, `:159` `AirtableRequestError` (10 sites), `:269` `currentAirtableDate()` (3 sites).
- `lib/supabase/data.ts:93-94` `StaffUser.invitedByAirtableUserId` / `.assignedPreacherAirtableUserId`; `:331-332` populate them from `row.invited_by` / `row.assigned_preacher_id`.
- `lib/supabase/data.ts:409-410, 424-427, 490-494` `upsertStaffUser` payload keys `invitedByAirtableUserId` / `assignedPreacherAirtableUserId`.
- `lib/supabase/data.ts:606-607, 656-659` `createContact` payload keys `collectedByAirtableUserId` / `assignedPreacherAirtableUserId`.
- `lib/supabase/data.ts:872, 884` `createSession` payload key `preacherAirtableUserId`.
- Rename targets, chosen to match `lib/authz.ts`: `AirtableRequestError` → `SupabaseDataRequestError`, `AirtableConfigError` → `SupabaseDataConfigError`, `AirtableRecord` → `DataRow`, `currentAirtableDate` → `currentProgramDate`, `invitedByAirtableUserId` → `invitedByUserId`, `assignedPreacherAirtableUserId` → `assignedPreacherUserId`, `collectedByAirtableUserId` → `collectedByUserId`, `preacherAirtableUserId` → `preacherUserId`.
- Both classes are caught by duck-typed `.status` (e.g. `lib/manage/api-handlers.ts:46`, `apps/*/app/api/auth/signin/route.ts:15`), never by `instanceof`, so renaming the class name touches only `data.ts`.

**Call sites of the renamed identifiers (both sides of each wire contract):**
- `apps/{folk,gita-life}/app/api/contact/route.ts:25,74,147,148` — `ContactPayload.assignedPreacherAirtableUserId`, `collectedByAirtableUserId`, `assignment.preacher.id`.
- `apps/{folk,gita-life}/app/api/registration/route.ts:127,131,146`.
- `apps/{folk,gita-life}/app/api/admin/invite-user/route.ts:14,42,67-69,83,84` — `assignedPreacherAirtableUserId`, `invitedByAirtableUserId`, `airtableUserId`, `inviterAirtableUserId`.
- `apps/{folk,gita-life}/app/api/volunteers/invite/route.ts:14,48,86-87,113-114,127-128` — same set plus the existing-membership comparison at `:86-87`.
- `apps/{folk,gita-life}/app/api/sessions/route.ts:131` — `preacherAirtableUserId`.
- `components/contact-form.tsx:21,47,86,88,106,109,134,148,351,355-357,394,398` — form-state key plus the `htmlFor`/`id`/`name` triple; `:86-88` and `:394` read the Admin "preacher required" gate off it.
- `components/invite-user-form.tsx:19,28,87-88,267,269` — same pattern for the invite form.
- `lib/invite-log.ts:10-11,23-24` — `airtableUserId` → `user_id` write, `inviterAirtableUserId` → `inviter_airtable_user_id` write. **Parameter names only; the two column names are out of scope** (see Design Notes).
- `lib/authz.ts:69,82` — `actorAirtableUserId` parameter of `writeAuditEvent`. Parameter name only.
- `packages/data-contracts/src/index.ts:10-21` — `StaffMembershipContext`, an exported interface with **zero references** anywhere (grep finds only its declaration). Story 7.5's Design Notes assign its deletion here. Delete the whole interface, not just its `airtableUserId` field.

**Verification scripts that assert on the deleted files:**
- `scripts/verify-program-readiness.mjs:7` (`sharedAirtable` path), `:9` (`airtableLib` path), `:22-25` (`baseId` assertions in `folk.ts`/`gita-life.ts`), `:44-47` (`airtableLib` id-resolution assertion), `:48-51` (the `programConfigServer` `getProgramScopedIdEnv` assertion — its subject is being deleted), `:53-62` (the five `sharedAirtable` table-ID assertions). Lines `:26-42` (next.config `PROGRAM_ID`, signin `syncStaffProfileByEmail` / `ensureSupabaseAuthUser`) and `:64-70` (`programs`/`staff_memberships`/`audit_events` migration assertions, decision gates) are unaffected and must keep passing. The `programConfigServer` entry in the `files` map at `:8` becomes unread once its assertion goes — delete the entry too, so the map holds only files an assertion still reads.
- `scripts/verify-monorepo-guardrails.mjs:11,14` (`"@hkmc/airtable"` and `"@/lib/airtable"` in `serverOnlySpecifierPrefixes`) and `:22` (the `packages/airtable/src/index.ts` → `lib/airtable.ts` external-import allowance).

**User-visible strings:**
- `apps/folk/app/layout.tsx:17` and `apps/gita-life/app/layout.tsx:18` — the `<meta description>` "…and Airtable handoff". Story 7.5 kept it because the config still existed; story 7.6 removed the handoff, so it is now false.
- `apps/*/app/manage/page.tsx` — already Airtable-free; verify, do not edit.

**Docs (playbook step 22 names the first three):**
- `docs/data-models.md` — `:7-14` Airtable Configuration, `:18-34` the `AIRTABLE_*` env table and per-program overrides, `:36-140` four "Airtable field" record tables, `:148-220` the bridge-table sections (`staff_memberships`, `staff_profiles`, `airtable_identities`, `airtable_sync_state`), `:238,258-259` the two legacy audit columns, `:280-285` the `StaffContext` snippet still showing `airtableUserId`, `:341` the "rejects inactive Airtable staff users" note.
- `docs/architecture.md` — `:5,13,28-29` the Airtable data-flow diagram and the package table; `:37-41` the sign-in flow; `:47-59` the `getStaffContext` description with `airtableUserId`; `:80-95` the whole "Airtable" section; `:104-105` the bridge tables; `:115-143` the per-route flows; `:158,165,171` the guardrail notes.
- `docs/api-contracts.md` — `:29,40-42` the sign-in contract, `:186,194,278,330` the `"assignedPreacherAirtableUserId": "rec..."` request bodies (the `rec...` placeholder becomes a UUID), `:255` the Airtable location check, `:287` the invite flow, `:298` the admin locations route.
- Targeted falsehood fixes elsewhere: `docs/index.md:5,13,21-22,34,37,53,71`; `docs/project-overview.md:5,13,15,22,25,42-43,53,76,85-86,97`; `docs/development-guide.md:8,27-34,44-62,65,156,162,170,190,192`; `docs/deployment-guide.md:14-15,27-49,70-71,100-110,159,178-179`; `docs/contribution-guide.md:55,67,70`; `README.md:20-21`; `CONTRIBUTING.md:36,61`; `.github/copilot-instructions.md:33,37`.

**Read-only constraints confirmed during investigation:**
- `git ls-files` shows only `.env.example` is tracked; `.env`, `.env.local`, and `.env.migration.local` are gitignored. `.env` holds the only live Airtable secrets (`AIRTABLE_API_TOKEN`, `AIRTABLE_BASE_ID`); `.env.migration.local` has **no** `AIRTABLE_*` key (only a comment), so nothing this story does starves story 9's backfill export.
- `lib/offline-sync.ts` is confirmed dead code per SPEC CAP-6 and contains no Airtable reference — out of scope, leave it.
- `lib/supabase/data.ts:1` carries `import "server-only"`; `pnpm build:apps` is the backstop that no swapped file is client-reachable.
- PostgREST at `etwunirahuucodcxydgs.supabase.co/rest/v1/` **is** reachable from this environment (verified `200` with the service-role key), but the Postgres connection (`POSTGRES_URL_NON_POOLING`) times out and `supabase gen types` cannot authenticate (the `SUPABASE_ACCESS_TOKEN` in `.env.migration.local` is not an `sbp_`-format token). This is why the schema half of CAP-7 is deferred rather than attempted.

## Tasks & Acceptance

**Execution:**
- `lib/airtable.ts`, `packages/airtable/` -- DELETE -- CAP-7's named artifacts; zero importers remain since story 7.5.
- `packages/program-config/src/programs/shared-airtable.ts` -- DELETE -- the table-ID config CAP-7 names; only `folk.ts`/`gita-life.ts` import it and both imports go with it.
- `packages/program-config/src/types.ts` -- EDIT -- drop `modules.airtableManage`, the four `Airtable*` mapping types, and `ServerProgramProfile.airtable`.
- `packages/program-config/src/programs/{folk,gita-life}.ts` -- EDIT -- drop the `shared-airtable` import, the `folkTables` wrapper (and its folk-only `address` field), `airtableManage`, and the whole `airtable` block; keep `id`, `envPrefix`, `branding`, and the remaining `modules` flags so `PublicProgramProfile` still satisfies.
- `packages/program-config/src/server.ts` -- EDIT -- delete `getProgramAirtableManagementUrl`, its now-orphaned private helper `getProgramScopedIdEnv`, and `getProgramScopedEnv` (which loses its only caller, `lib/airtable.ts`, with that deletion).
- `packages/data-contracts/src/index.ts` -- EDIT -- delete the unreferenced `StaffMembershipContext` interface; keep `ProgramId`, `StaffRole`, `StaffMembershipStatus`, `ApiErrorResponse`, `QueuedResponse`, and the three type guards.
- `apps/{folk,gita-life}/package.json`, `apps/{folk,gita-life}/tsconfig.json`, `tsconfig.json`, `next.config.mjs` -- EDIT -- remove the `@hkmc/airtable` dependency and both path/transpile references.
- `lib/supabase/data.ts` -- EDIT -- the ten-identifier rename listed in the Code Map; values and control flow unchanged.
- `apps/{folk,gita-life}/app/api/{contact,registration,admin/invite-user,volunteers/invite,sessions}/route.ts` -- EDIT -- rename the payload keys at the exact lines recorded above; no status code, response shape, or trim/validation behavior changes.
- `components/contact-form.tsx`, `components/invite-user-form.tsx` -- EDIT -- rename the form-state key and its `htmlFor`/`id`/`name` triple so the wire pair stays in lockstep.
- `lib/invite-log.ts`, `lib/authz.ts` -- EDIT -- rename the `airtableUserId` / `inviterAirtableUserId` / `actorAirtableUserId` **parameters** only; the `invite_log` and `audit_events` column keys they assign are unchanged.
- `.env.example` -- EDIT -- delete the `AIRTABLE_*`, `FOLK_AIRTABLE_*`, and `GITA_LIFE_AIRTABLE_*` blocks; keep the Supabase, site-URL, and staff-sync entries.
- `turbo.json` -- EDIT -- delete the 27 `globalEnv` Airtable names and the three `*_AIRTABLE_API_TOKEN` secret names; keep the task graph untouched so `verify-monorepo-guardrails.mjs`'s `validateTurboConfig` still passes.
- `scripts/deploy-vercel.mjs` -- EDIT -- delete the `AIRTABLE_API_TOKEN` required-key check (`:119-121`) so a Vercel env with only Supabase keys passes preflight.
- `scripts/verify-program-readiness.mjs` -- EDIT -- delete the `sharedAirtable`/`airtableLib` file entries and the five assertions that read them (`:22-25` `baseId`, `:44-51`, `:53-62`); keep the `programConfigServer` entry out of the `files` map too, since no surviving assertion reads it. Keep the next.config, signin, migration-table, and decision-gate assertions, and keep the table-ID assertion that reads the planning-artifact decision record.
- `scripts/verify-monorepo-guardrails.mjs` -- EDIT -- delete `"@hkmc/airtable"`, `"@/lib/airtable"` from `serverOnlySpecifierPrefixes` and the `packages/airtable` external-import allowance.
- `apps/{folk,gita-life}/app/layout.tsx` -- EDIT -- drop "and Airtable handoff" from the `metadata.description`.
- `pnpm-lock.yaml` -- REGENERATE -- via `pnpm install --lockfile-only` after the workspace dep is removed; never hand-edited.
- `docs/data-models.md`, `docs/architecture.md`, `docs/api-contracts.md` -- REWRITE for the Supabase-only reality -- playbook step 22; describe `public.users` as the staff source, the `contact_attendance_counts` rollup, RLS scoping, and the in-app `/manage` portal, and delete every `AIRTABLE_*` env row and `rec...` placeholder.
- `docs/index.md`, `docs/project-overview.md`, `docs/development-guide.md`, `docs/deployment-guide.md`, `docs/contribution-guide.md`, `README.md`, `CONTRIBUTING.md`, `.github/copilot-instructions.md` -- EDIT targeted lines -- each names Airtable as the operational store, a required env input, or a guardrail prefix that no longer exists; leaving them would document a dependency this story deletes.
- `_bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md` -- EDIT -- tick Phase 3 steps 14, 15, 16 and Phase 4 step 22 as done on this branch, matching the existing `✅` convention and its "when this spec was written" preamble.

**Acceptance Criteria:**
- Given the repo after the change, when I `grep -rniI --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.turbo airtable` over `apps components lib packages hooks scripts supabase next.config.mjs turbo.json tsconfig.json .env.example .github`, then every remaining match falls in one of exactly five accounted-for categories, and every file outside `lib/supabase/types.ts` and `supabase/migrations/` has zero: `lib/supabase/types.ts` (generated — four legacy bridge tables plus the two audit/invite column names, 31 lines), the `supabase/migrations/2026*` files (already-applied history: comments and column names, 32 lines), `supabase/seed.sql:3` (a comment, 1 line), the three kept column keys in `lib/invite-log.ts:23-24` and `lib/authz.ts:82`, and `scripts/verify-program-readiness.mjs:49` — a source-text assertion that the applied migration still declares the legacy tables, i.e. a check *about* history, not a dependency on it. No match is a live reference to the Airtable service, an `AIRTABLE_*` env read, or an `@hkmc/airtable` import. (`--exclude-dir=.next` is required: `apps/*/.next/` holds gitignored stale build output predating this change.)
- Given the repo after the change, when I `grep -rn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.turbo "api.airtable.com\|AIRTABLE_\|@hkmc/airtable\|@/lib/airtable\|shared-airtable" apps components lib packages hooks scripts next.config.mjs turbo.json tsconfig.json .env.example`, then zero matches (exit 1).
- Given the deleted paths, when I `ls lib/airtable.ts packages/airtable packages/program-config/src/programs/shared-airtable.ts`, then all three are absent.
- Given `pnpm install --lockfile-only`, then it succeeds and `pnpm-lock.yaml` no longer contains `@hkmc/airtable`; its diff shows that importer's removal and nothing but registry-refresh `deprecated:` metadata alongside it.
- Given all `AIRTABLE_*`, `FOLK_AIRTABLE_*`, and `GITA_LIFE_AIRTABLE_*` names absent from the shell environment, when I run `pnpm build:apps`, then folk and gita-life both build clean.
- Given `pnpm guardrails`, then it exits 0 and prints "Monorepo guardrails passed."
- Given `pnpm typecheck:workspace`, then every workspace project type-checks with no unresolved reference to a deleted export.
- Given `pnpm lint`, then no new error or warning appears in any file this diff touches (the 12 pre-existing `.agent/`/`.codebuddy/`/`.neovate/` asset errors are unrelated).
- Given `node scripts/verify-program-readiness.mjs`, then it exits 0 and still asserts the `PROGRAM_ID` config, the signin `syncStaffProfileByEmail` + `ensureSupabaseAuthUser` pairing, the `programs`/`staff_memberships`/`audit_events` migration tables, and the six decision gates.
- Given `node scripts/verify-rls.mjs`, then it exits 0 with every assertion passing — proving no story-2 policy regressed. The check count is not pinned by this story; it was 75 when the spec was drafted and is 79 now, and only "all pass, exit 0" is the contract. (If the environment blocks the run, that failure is recorded as a deferral, not a pass.)
- Given the admin invite form, when an Admin invites a Volunteer with an assigned preacher, then the request body key is `assignedPreacherUserId` and `public.users.assigned_preacher_id` is written.
- Given the contact form, when an Admin submits a contact with an assigned preacher and a location, then the request body key is `assignedPreacherUserId` and the "Select Preacher first" gate at `components/contact-form.tsx:394` still blocks location selection until it is set.
- Given `/manage`, when a signed-in Admin loads it, then the in-app portal still renders and no Airtable URL or redirect remains.
- Given `git diff --name-only`, then `public/sw.js`, every `proxy.ts`, `supabase/migrations/**`, and `lib/supabase/types.ts` do **not** appear.
- Given `scripts/deploy-vercel.mjs`, when Vercel env validation runs with only `NEXT_PUBLIC_SUPABASE_URL`, a Supabase key, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SITE_URL`, then no missing-variable error is raised.

## Spec Change Log

## Review Triage Log

## Design Notes

**The schema half of CAP-7 is deferred, with the reason.** The playbook's Phase 3 steps 14–16 name only files, packages, env vars, and the grep gate, and the `stories.yaml` description for this story enumerates exactly those five artifacts — none of which is a database change. The remaining Airtable-named schema objects are `invite_log.airtable_user_id`, `invite_log.inviter_airtable_user_id`, `audit_events.actor_airtable_user_id`, and the four bridge tables. Renaming or dropping them needs a migration *and* a regenerated `lib/supabase/types.ts`, and neither is reachable here: `supabase gen types` rejects the `SUPABASE_ACCESS_TOKEN` in `.env.migration.local` (`InvalidAccessTokenError: must be like sbp_0102...1920`), `--db-url` against `POSTGRES_URL_NON_POOLING` times out on connect, and there is no local Supabase stack (SPEC constraint). Hand-editing the generated types to match a migration nothing applied would leave the repo and the hosted project disagreeing — exactly what `verify-rls.mjs` and story 8's fixture seeding would then trip over. So this story ships the repo-side removal complete and hands story 8 the schema half.

The drafted DDL, for whoever applies it with database access:

```sql
-- supabase/migrations/<timestamp>_retire_airtable_named_columns.sql
alter table public.invite_log
  rename column airtable_user_id to user_id;
alter table public.invite_log
  rename column inviter_airtable_user_id to inviter_user_id;
alter table public.audit_events
  rename column actor_airtable_user_id to actor_user_id;
drop table if exists public.airtable_identities;
drop table if exists public.airtable_sync_state;
drop table if exists public.staff_profiles;
drop table if exists public.staff_memberships;
```

Both rename targets are free: `public.users` already owns `id`, `invited_by`, and `assigned_preacher_id`, and `invite_log` has no other `user_id` column (`inviter_supabase_user_id` is distinct). The four drops are safe because a repo-wide grep for `staff_memberships`, `staff_profiles`, `airtable_identities`, and `airtable_sync_state` across `apps`, `lib`, `components`, `packages`, and `hooks` returns nothing — story 7.4 made `public.users` authoritative. **Order matters:** apply the migration first, then regenerate `lib/supabase/types.ts`, then rename `lib/invite-log.ts`'s and `lib/authz.ts`'s column keys (`airtable_user_id` → `user_id`, `inviter_airtable_user_id` → `inviter_user_id`, `actor_airtable_user_id` → `actor_user_id`). Doing the TypeScript side first would break the service-role inserts at `lib/invite-log.ts:23-24` and `lib/authz.ts:82` with a PostgREST `42703` for an unknown column. Note also that story 9's delta sync (playbook step 26) copies rows out of the old project, whose columns still carry the old names — the sync script needs the same rename mapping.

**Why the error-class rename uses `SupabaseData*` and not `Airtable*`-substitute names.** `AirtableRequestError` and `AirtableConfigError` are thrown from `lib/supabase/data.ts` against *Supabase*, and their `status` codes (404 for a missing session, 409 for a 23505 duplicate, 422 for an invalid phone) are Supabase/Postgres facts, not Airtable ones. Every consumer catches them by duck-typed `.status` — `lib/manage/api-handlers.ts:46`, `apps/*/app/api/auth/signin/route.ts:15` — and none uses `instanceof`, so the rename is confined to `data.ts` and carries no call-site risk.

**Why `AirtableRecord` becomes `DataRow` and not `SupabaseRow`.** It is a two-field envelope (`{ id, fields }`) that `findLocationById` still returns because a route expects the same shape as before. `DataRow` describes that envelope without claiming a Supabase-native meaning it does not have; `Database["public"]["Tables"][...]["Row"]` is the real row type and DW-17 already records that `data.ts` hand-rolls its own row types instead.

**Why `StaffMembershipContext` is deleted whole rather than its `airtableUserId` field.** It is an exported interface on a workspace package's public API with **zero** references in the repo — grep finds only its own declaration. Renaming a field inside an interface nobody uses leaves a type that still describes `staff_memberships`, the table story 8 drops. Story 7.5's Design Notes assign exactly this deletion here ("Deleting an exported workspace symbol is a package API change with no caller to justify it; it belongs to story 7's sweep alongside the columns it mirrors").

**Why `getProgramScopedEnv` is deleted rather than kept.** This spec was drafted believing `getProgramScopedEnv` (`process.env[`${prefix}_${name}`] || process.env[name]`) had surviving callers. Implementation proved the opposite: `lib/airtable.ts` was its only consumer, so a repo-wide grep for the symbol returns only its own declaration the moment that file is deleted. It is a generic-looking program-prefixed env reader whose entire reason to exist was reading `FOLK_AIRTABLE_*` / `GITA_LIFE_AIRTABLE_*` with a generic fallback — precisely the capability CAP-7 removes. Leaving an exported, unreferenced symbol behind would contradict the same rule that deletes `StaffMembershipContext` two packages over.

**Why the `verify-program-readiness.mjs` assertions are deleted rather than repointed.** Its `baseId` assertions read `appqea9DRLOXqErXb` / `appzbssqNK53yqjZH` out of `folk.ts` / `gita-life.ts` to prove program separation; with the `airtable` block gone, the base IDs have no home in the repo — they are Airtable's, and Airtable is an archive the SPEC preserves without the app referencing it. Its table-ID assertions read `shared-airtable.ts` for the same reason. Repointing either at a Supabase artifact would test something the script's name does not claim. The assertions that remain — `PROGRAM_ID` per app, the signin `syncStaffProfileByEmail`/`ensureSupabaseAuthUser` pairing, the `programs`/`staff_memberships`/`audit_events` migration tables, and the six decision gates — are all still live and still meaningful.

**Why `STAFF_SYNC_STALE_AFTER_MINUTES` stays in `.env.example`.** Story 7.4 removed the staleness gate from `lib/authz.ts`, so the variable is now unread, but `verify-program-readiness.mjs` does not assert it and removing it belongs with the story that proves no staleness surface survives. Deleting only the `AIRTABLE_*` lines keeps this diff to the named artifacts. Worth a follow-up: confirm nothing reads it, then drop it.

**What is deliberately left alone, and why each is not a defect.** `lib/offline-sync.ts` is confirmed dead code by SPEC CAP-6's correction and has no Airtable reference. `docs/executive-deck.md`, `docs/component-inventory.md`, `docs/source-tree-analysis.md`, `docs/project-scan-report.json`, and `docs/.archive/**` are point-in-time generated/analysis snapshots, not living documentation; SPEC explicitly permits matches "outside docs/specs". The `wds-7-design-system` skill files under `.claude/`, `.agent/`, `.agents/`, `.codebuddy/`, `.neovate/`, and `.qwen/` say "Airtable-style filterable view" as an unrelated adjective for a UI pattern and are not a data dependency.

## Verification

**Commands:**
- `grep -rn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.turbo "api.airtable.com\|AIRTABLE_\|@hkmc/airtable\|@/lib/airtable\|shared-airtable" apps components lib packages hooks scripts next.config.mjs turbo.json tsconfig.json .env.example` -- expected: zero matches (exit 1).
- `grep -rniI --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.turbo airtable apps components lib packages hooks scripts supabase next.config.mjs turbo.json tsconfig.json .env.example .github` -- expected: only the five accounted-for categories in the first acceptance criterion; every line inspected by hand. (`--exclude-dir=.next` is mandatory — `apps/*/.next/` is gitignored stale build output from before this change.)
- `ls lib/airtable.ts packages/airtable packages/program-config/src/programs/shared-airtable.ts` -- expected: all three absent (`ls` exits non-zero).
- `pnpm install --lockfile-only` -- expected: succeeds; then `grep -c "@hkmc/airtable" pnpm-lock.yaml` -- expected: 0.
- `env -u AIRTABLE_API_TOKEN -u AIRTABLE_BASE_ID pnpm build:apps` -- expected: 2 successful builds; this is the CAP-7 "with no Airtable env set" gate, and it only means something if the shell genuinely lacks the vars.
- `pnpm guardrails` -- expected: exit 0, "Monorepo guardrails passed." (The 4 pre-existing `@/lib/authz` client type-import warnings are unchanged.)
- `pnpm typecheck:workspace` -- expected: all workspace projects pass with no unresolved reference to a deleted export.
- `pnpm lint` -- expected: no new error or warning in any changed file.
- `node scripts/verify-program-readiness.mjs` -- expected: exit 0.
- `node scripts/verify-rls.mjs` -- expected: exit 0 with every assertion passing, proving no story-2 policy regressed.
- `git diff --name-only` -- expected: `public/sw.js`, `*proxy.ts`, `supabase/migrations/*`, and `lib/supabase/types.ts` absent.
- `git diff --numstat lib/supabase/data.ts` -- expected: insertions equal deletions apart from the identifier lines; a large delta means behavior was edited rather than renamed.

**Manual checks (against the branch preview deployment, which carries the new project's env):**
- Sign in as a seeded `Active` `public.users` row and confirm `GET /api/auth/me` still returns `200` with `staff.userId` and `staff.assignedPreacherUserId`.
- As an Admin, invite a Volunteer with an assigned preacher and confirm `POST /api/admin/invite-user` succeeds, `public.users.assigned_preacher_id` is set, and an `invite_log` row is written.
- As an Admin, create a contact with an assigned preacher and location and confirm `POST /api/contact` returns `201` and the row carries `assigned_preacher_id`.
- Confirm the server log and the Postgres tables show no `api.airtable.com` traffic from any route or page.
- Confirm both `<meta description>` strings no longer mention Airtable.
- Confirm `.env.example`, `turbo.json`, `docs/deployment-guide.md`, and `docs/development-guide.md` list no `AIRTABLE_*` variable.
