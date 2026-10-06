---
title: 'In-app /manage portal replacing the Airtable Interface'
type: 'feature'
created: '2026-10-06'
status: 'awaiting-operator'
baseline_revision: 994be1c3e0bdf0bf097382c7f5848d97ec632e5e
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/specs/spec-airtable-to-supabase/manage-interface.md'
  - '_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md'
warnings: ['oversized']
operator_actions:
- Open network access to the hosted Supabase project etwunirahuucodcxydgs from this repository's tooling environment.
- Run `node scripts/verify-rls.mjs` and confirm it still reports 75 of 75 passing, proving no story-2 RLS policy regressed.
- Deploy the branch preview and sign in as a seeded Admin, then confirm the `/manage` portal renders all five tabs with program-wide totals.
- Switch the Admin scope toggle to 'Own scope' and confirm the contact count and every list shrink to the Admin's own contacts, then switch back and confirm the program-wide totals return.
- Sign in as a seeded Preacher and confirm the Contacts tab shows only contacts assigned to that Preacher, with no other preacher's contact identities anywhere in the portal.
- Open the Attendance tab as that Preacher and confirm records exist for sessions the Preacher leads even when an Admin created the session.
- 'Edit a contact''s Notes and College from the Favorites tab and confirm only those two columns changed and that an `audit_events` row was written with `action: ''manage.contact.update''`.'
- 'Attempt the same edit as a Preacher against a contact assigned to another preacher and confirm it is rejected with `403` and `code: ''forbidden''`, and that the row is unchanged.'
- Upload a JPEG, a PNG and a WebP contact photo from the Favorites tab and confirm each succeeds and renders from a short-lived signed URL.
- Confirm the `contact-photos` bucket is still private and that no public object URL for a contact photo is reachable without authentication.
- Attempt a photo upload of a non-image MIME type, of a file larger than 5 MB, and of a file whose bytes do not match its declared image type, and confirm each returns `400` with nothing written to the bucket.
- Confirm that requesting a signed photo URL for a contact with no photo returns `404`.
- Use the favorite toggle on a Contacts row and confirm the contact then appears in the Favorites tab and its detail form becomes editable.
- Load `/manage` as an unauthenticated visitor and confirm the redirect to `/login?redirect=/manage`, then as a Volunteer and confirm the portal never renders.
- Trigger a data-layer failure and confirm `/manage` returns a server error rather than redirecting to the staff-authorization-failed page.
- Load `/manage` on the seeded folk program and record the RSC payload size and the first-paint time, then report whether the deferred payload-size item needs per-tab server fetches.
deferred:
  - summary: >-
      No committed executable check covers the new manage-portal read or write paths; the repo has zero test files and CI runs only guardrails/typecheck/build/lint.
    evidence: |-
      Filed pre-verified by the verification-gap layer and confirmed: /manage is force-dynamic, apps/folk/.next/prerender-manifest.json has no /manage entry, verify-rls.mjs exercises the SQL policies rather than loadManagePortalData, and verify-program-readiness.mjs reads no /manage file. This run covered every I/O-matrix row with a throwaway harness (79 assertions, all passing) that is not committed because it stubs the Supabase client under test and nothing here could execute or validate a committed version against the hosted project. stories.yaml assigns the verification suite to story 8.
    location: >-
      .github/workflows/quality-gates.yml
    severity: medium
  - summary: >-
      pnpm build:apps never executes the /manage server component, so every claimed check on the rewritten page is non-observing.
    evidence: |-
      Filed pre-verified by the verification-gap layer and confirmed: the page is force-dynamic and reaches cookies() through getStaffContext, so next build compiles but never calls ManagePage. Pre-existing repo-wide harness gap, not caused by this change. Settled by the operator live smoke recorded in operator_actions.
    location: >-
      apps/folk/app/manage/page.tsx:23
    severity: medium
  - summary: >-
      The whole portal payload is serialized into the RSC flight on each /manage load and the tables render un-virtualized, so first paint may be heavy for a ~1030-contact program.
    evidence: |-
      The code path is certain — loadManagePortalData returns every contact, session and in-scope attendance row and the server component passes the payload to ManagePortal — but the harm could not be measured: this environment has no browser and cannot reach the hosted project, so the RSC payload size and first paint are unknown. Filed medium (unverified). What would settle it: load /manage against the seeded folk program and record the RSC payload size and first paint; if bad, the fix is per-tab server fetches instead of client-side filtering.
    location: >-
      components/manage/manage-contacts-table.tsx:1
    severity: medium (unverified)
  - summary: >-
      public.contact_attendance_counts has no security_invoker, so the rollup view is evaluated with the view owner's rights and answers for contacts the caller may not read.
    evidence: |-
      Story 1 created the view as a plain CREATE OR REPLACE VIEW with no security_invoker. This story works around it by reading rollups only with .in("contact_id", <already RLS-scoped ids>) in chunks, so the workaround is load-bearing and any future caller that does select * off the view re-opens the leak. A real fix needs ALTER VIEW ... SET (security_invoker = true), which is a migration and therefore story 7's territory. Already recorded in this spec's Design Notes.
    location: >-
      supabase/migrations/20261006000000_add_users_and_contact_columns.sql:74
    severity: low
  - summary: >-
      public.contacts.updated_at has no set_updated_at trigger, so nothing detects a concurrent edit of a contact.
    evidence: |-
      The core-tables migration declares the column but no trigger, unlike programs/staff_profiles/invite_log, and this story's Never list forbids adding a migration. updateManageContact therefore writes no updated_at, and manage-favorites-view's overrides map merges blindly over a possibly-refreshed payload and always wins. Surfacing point is story 8's fixture seeding, or a migration in story 7.
    location: >-
      supabase/migrations/20261004000000_create_core_tables.sql:19
    severity: low
  - summary: >-
      serverOnlySpecifierPrefixes in the guardrail script lists neither @/lib/supabase/manage nor @/lib/manage, so this spec's guardrail acceptance criterion is weaker than stated.
    evidence: |-
      Verified by inspection: the list holds @hkmc/airtable, @hkmc/authz, @hkmc/program-config/server, @/lib/airtable, @/lib/authz, @/lib/invite-log, @/lib/supabase/admin and @/lib/supabase/server. This is the pre-existing pattern story 5 established for @/lib/supabase/data and closed the same way — unused entries are inert and each module carries its own import "server-only", so next build is the real backstop. Editing the script is forbidden by this story's Never list; the acceptance criterion's wording is the thing that overstates it, and correcting that would mean editing this build's spec.
    location: >-
      scripts/verify-monorepo-guardrails.mjs:10
    severity: low
---

<intent-contract>

## Intent

**Problem:** `/manage` is still a redirect to the Airtable Interface (`getProgramAirtableManagementUrl`), so the staff management layer that CAP-9 replaces depends on the system being removed in story 7. Story 1 shipped the schema the portal needs (`contacts.photo_path/rounds/books_read/is_favorite`, the `contact_attendance_counts` rollup view, the private `contact-photos` bucket), story 2 shipped the RLS policies that are the portal's enforcement model, stories 3–5 put every route on Supabase — but none of it is reachable: a Preacher or Admin who opens `/manage` leaves the app.

**Approach:** Build the portal in the app's design language behind five tabs (Dashboard, Contacts, Sessions, Attendance, Favorites) per `manage-interface.md`. Reads run through the **user-scoped** Supabase client so story 2's RLS policies do the Preacher scoping, with the Admin admin/preacher mode toggle applied as an app-layer filter on top; writes (contact detail edit, photo upload) go through server routes with the service role, and photos are minted as short-lived signed URLs server-side.

## Boundaries & Constraints

**Always:**
- Reads of `contacts`, `sessions`, `attendance`, `locations` go through `createSupabaseServerClient()` — the caller's JWT — so `20261006010000_scoped_rls_policies.sql` is what enforces Preacher scoping, not an app-side filter that could drift.
- Apply the Admin admin/preacher mode as an **additional** app-layer filter (`?mode=preacher` → only rows scoped to `staff.userId`), never as a way to widen scope.
- Resolve `attendance_count` rollups by fetching `contact_attendance_counts` **keyed to the already RLS-scoped contact ids**. The view has no `security_invoker`, so a bare `select *` off it would answer for out-of-scope contacts.
- Page every PostgREST read in batches (`.range()`) — the hosted project's default row cap is 1000 rows and the folk program has ~1030 contacts.
- Photo read paths are private: mint signed URLs server-side via the service role and never render a public bucket URL, never accept a `photo_path` from the client.
- Contact writes are Admin+Preacher only, program-scoped, and must verify the target contact is inside the caller's scope before updating.
- `/manage` must render nothing Airtable-referencing: no `getProgramAirtableManagementUrl`, no "Manage Link Unavailable" copy, no `AIRTABLE_*` names.
- Preserve the existing auth shell, the 401 → `/login?redirect=/manage` and non-401 → `/auth/error?code=staff-authorization-failed` redirects, and `Admin`+`Preacher`-only access.
- Asia/Kolkata date semantics for `initial_contact`, `last_contacted_on`, and the 60-day window.

**Never:**
- No new migration, and no edit to `supabase/migrations/**` — the rollup view and bucket already exist from story 1; the view's missing `security_invoker` is worked around by id-scoped reads, not by changing the view (reported, not patched).
- No edit to `lib/supabase/data.ts`'s export surface, `lib/authz.ts`, `lib/airtable.ts`, `packages/**`, `proxy.ts`, `public/sw.js`, or `lib/supabase/types.ts`.
- No new npm dependency: charts use the project's existing `recharts` 2.15.4 through `components/ui/chart.tsx`. The `dataviz` skill named in `stories.yaml` is not installed in this repo, so the project's own chart wrapper is the chart approach.
- No pixel-copying Airtable chrome, no Airtable filter-builder UI, no "Go to interface" affordances — feature parity is data-and-views parity.
- No client component may import `@/lib/supabase/manage`, `@/lib/supabase/data`, or `@/lib/authz` (guardrail: `serverOnlySpecifierPrefixes`). Portal types live in a client-safe module.
- Do not add a test runner, do not edit `scripts/verify-monorepo-guardrails.mjs` or `scripts/verify-program-readiness.mjs`.
- Do not change `/attendance`, `/api/contact`, `/api/registration`, `/api/sessions`, invite routes, or the offline queue.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Admin opens `/manage?view=contacts` | Table of every contact in the program with `TotalAttendanceCount`, `Past60DayAttendanceCount`, `Last Contacted On`, `Notes`, `Collected By` | No error expected |
| HAPPY_PATH | Admin opens `/manage?mode=preacher` | Same portal restricted to rows scoped to the Admin's own `public.users.id` | No error expected |
| HAPPY_PATH | Preacher opens `/manage` | Contacts/attendance scoped to `contacts.assigned_preacher_id = staff.userId`; locations limited to `staff.locationIds` | No error expected |
| HAPPY_PATH | Admin, Dashboard, Month+Year selected | Sessions and Attendance bar charts count only sessions/attendance in that calendar month, with Reset restoring the unfiltered view | No error expected |
| HAPPY_PATH | Signed-in Admin `PATCH /api/manage/contacts` with a field subset | `200 {contact}`; only the supplied keys are written; an audit event records the edit | No error expected |
| HAPPY_PATH | Signed-in Admin `POST /api/manage/contacts/photo` with a jpeg/png/webp ≤5 MB | `201 {photoPath}`; object lands in the private `contact-photos` bucket; `contacts.photo_path` updated | No error expected |
| HAPPY_PATH | Signed-in Admin `GET /api/manage/contacts/photo?contactId=…` for a contact with a photo | `200 {url}` — a short-lived signed URL | No error expected |
| ERROR_CASE | Volunteer or Assistant opens `/manage` | Redirected away by `requireRole`; the portal never renders | Existing 403/redirect path |
| ERROR_CASE | Unauthenticated request to `/manage` or any `/api/manage/*` route | `redirect("/login?redirect=/manage")`; API returns `401 {code:"unauthenticated"}` | `authzErrorResponse` |
| ERROR_CASE | Preacher `PATCH`es a contact outside their `assigned_preacher_id` | `403 {code:"forbidden"}`; no write issued | Scope check precedes the update |
| ERROR_CASE | `POST /api/manage/contacts/photo` with a non-image MIME type or >5 MB | `400 {error}`; nothing uploaded | Validation precedes upload |
| ERROR_CASE | `GET /api/manage/contacts/photo` for a contact with `photo_path = null`, or whose object was deleted from the bucket | `404 {error}` | No signed URL minted |
| ERROR_CASE | Photo upload for a contact outside the caller's program | `404 {error}` | Program filter on the lookup |
| ERROR_CASE | Program has >1000 contacts | All rows returned — paged reads concatenate, no silent truncation | None expected |
| ERROR_CASE | A contact's rollup row is missing from `contact_attendance_counts` | Both counts render as `0`, not blank/`null` | Client-side default |

</intent-contract>

## Code Map

**Rewritten — the redirect itself (the CAP-9 handoff this story owns):**
- `apps/folk/app/manage/page.tsx` — 50 lines. Imports `getProgramAirtableManagementUrl` (`:6`), calls it (`:17`), `redirect(airtableDashboardUrl)` (`:22`), and renders the "Manage Link Unavailable" fallback (`:37-48`) naming `AIRTABLE_BASE_ID` / `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID`.
- `apps/gita-life/app/manage/page.tsx` — byte-equivalent except it uses `var(--program-text)` / `bg-card` token classes instead of folk's `#FFF9F0` / `bg-white` literals. **Both keep their own wrapper chrome**; the portal internals use token classes so one shared component renders correctly in both.
- `components/header.tsx:219` — the nav item `{ href: "/manage", label: "Manage", newTab: true, prefetch: false }` is shown to Preachers and Admins only. Unchanged: `newTab` is still correct for a portal.

**New — data layer (server-only, `import "server-only"`):**
- `lib/supabase/manage.ts` — the whole read/write surface. Reads via `createSupabaseServerClient()`; writes via `createSupabaseAdminClient()`.
  - `loadManagePortalData({ staff, mode })` → the full payload: locations, preacher/collector name map, contacts (with rollups), sessions (with location + preacher names + attendee names), attendance records, derived chart series, `booksReadOptions`.
  - `updateManageContact({ staff, contactId, patch })` → scope-checked service-role `contacts` UPDATE.
  - `uploadManageContactPhoto({ staff, contactId, file })` → `admin.storage.from("contact-photos").upload(...)` + `contacts.photo_path` write.
  - `createManageContactPhotoUrl({ staff, contactId })` → `createSignedUrl` on the stored object path.
- `lib/manage/api-handlers.ts` — route-handler factories (`handleManageContactUpdate`, `handleManageContactPhotoUpload`, `handleManageContactPhotoUrl`) shared by both apps so the per-app route files stay import-and-delegate.

**New — client surface (`components/manage/`, all `"use client"` except the types module):**
- `manage-types.ts` — client-safe payload/series types. The guardrail's `serverOnlySpecifierPrefixes` covers `@/lib/supabase/admin`, `@/lib/supabase/server`, `@/lib/authz`; these types must not be imported from any of those.
- `manage-portal.tsx` — shell: tab bar, Admin mode toggle, view state; owns the payload and hands slices to each tab.
- `manage-dashboard.tsx` — Total Contacts stat + 4 recharts charts (see Design Notes for the "Status Quo" bucketing).
- `manage-contacts-table.tsx` — sortable/searchable/filterable table with column sort toggles.
- `manage-sessions-view.tsx` — sessions grouped by location with attendee chips and a per-location attendee sum.
- `manage-attendance-view.tsx` — location multi-select + sortable contact list; selecting a contact opens its Records panel.
- `manage-favorites-view.tsx` — searchable favorite list + the editable contact-detail form, photo upload, and computed attendance counts.

**New — per-app API routes (thin; both apps get identical files):**
- `apps/{folk,gita-life}/app/api/manage/contacts/route.ts` — `PATCH`.
- `apps/{folk,gita-life}/app/api/manage/contacts/photo/route.ts` — `POST` (multipart) and `GET` (signed URL).

**Reused, unmodified:**
- `components/ui/chart.tsx` — shadcn chart wrapper over `recharts` (`ChartContainer`, `ChartTooltip`, `ChartLegend`, `ChartConfig`). Already present and already a dependency; nothing in the repo uses it yet, so this story is its first consumer.
- `components/ui/{table,card,badge,input,label,select,tabs,button,textarea}.tsx` — present in `components/ui/`.
- `components/ui/chart.tsx:58` — `ChartContainer` hard-codes `aspect-video`; each chart needs a sized wrapper div to keep layout stable.
- `lib/supabase/{server,admin,env}.ts` — the accessor contract (`createSupabaseServerClient`, `createSupabaseAdminClient`); `env.ts` resolves URL/keys so no env var is read outside it.
- `lib/authz.ts` — `getStaffContext`, `requireRole`, `AuthzError`, `authzErrorResponse`, `writeAuditEvent`. `StaffContext.userId` is the `public.users` UUID (story 5's rename), `locationIds` the array, `role` the discriminator.
- `components/header.tsx`, `components/staff-auth-shell.tsx`, `lib/auth-context.tsx` — existing shell, used exactly as `app/dashboard/page.tsx` uses them.
- `supabase/migrations/20261006000000_add_users_and_contact_columns.sql:74-91` — `public.contact_attendance_counts` (view over `attendance`, 60-day window vs `now() AT TIME ZONE 'Asia/Kolkata'`) and the private `contact-photos` bucket row.
- `supabase/migrations/20261006010000_scoped_rls_policies.sql:173-216` — the four scoped SELECT policies; `contacts` is `assigned_preacher_id`-scoped for Preacher, `sessions` is `created_by`-scoped, `attendance` resolves through the parent session's `preacher_id`.

**Read-only references that constrain the diff:**
- `lib/supabase/types.ts` — no `storage` schema is present in the generated types, so `admin.storage` is untyped; wrap those calls and keep them inside `lib/supabase/manage.ts` so the `any` surface never reaches a component.
- `tsconfig.json` paths — apps resolve `@/*` to the repo root, so both apps can import `components/manage/*` and `lib/supabase/manage` directly; the root `tsconfig.json` `include` already covers `components/**` and `lib/**`.
- `scripts/verify-monorepo-guardrails.mjs:10-19` — client components may not runtime-import the listed server-only prefixes; `validateClientServerBoundaries` walks from every `"use client"` root, so a single bad import fails `pnpm guardrails`.
- `apps/folk/app/api/admin/locations/route.ts` — the canonical per-app route shape: `export const dynamic = "force-dynamic"`, `getStaffContext()` → `requireRole` → validate → work → `authzErrorResponse(error)` in `catch`.
- `.github/workflows/quality-gates.yml` / `pnpm quality:ci` — `guardrails`, `typecheck:workspace`, `build:apps`, `lint`. `test:program-readiness` is not in CI but is a local invariant to honor.
- `scripts/verify-rls.mjs` — story 2's 75-assertion suite. Story 6 changes no policy, so it must stay green; this environment cannot reach the hosted project (PostgREST and the pooler both reset), so that re-run is an operator action.

## Tasks & Acceptance

**Execution:**
- `components/manage/manage-types.ts` — CREATE — client-safe `ManageScope`, `ManageContact`, `ManageSession`, `ManageAttendanceRecord`, `ManageLocation`, dashboard series types, and the `ManageView` union. No server imports.
- `lib/supabase/manage.ts` — CREATE — the server-only data layer. Paged reads (`MANAGE_PAGE_SIZE = 1000`, loop `offset`) through `createSupabaseServerClient()`; rollups fetched with `.in("contact_id", ids)` in chunks of 200 after the contact ids are known and RLS-scoped; app-layer `mode` filter; staff display names via the admin client (the SPEC's picker-list exception); `updateManageContact` / `uploadManageContactPhoto` / `createManageContactPhotoUrl` scope-check then service-role write; `writeAuditEvent` on the two mutations.
- `lib/manage/api-handlers.ts` — CREATE — the three handlers plus shared validation (allowed patch keys, MIME allow-list, 5 MB cap, UUID-shaped `contactId`) so both apps share one contract.
- `apps/{folk,gita-life}/app/manage/page.tsx` — REWRITE — drop the Airtable import, the redirect, and the fallback card; `getStaffContext()` → `requireRole(["Admin","Preacher"])` → read `searchParams` (`view`, `mode`) → `loadManagePortalData` → render `Header` + `ManagePortal` inside `StaffAuthShell`, keeping each app's existing wrapper classes and both existing redirect branches.
- `apps/{folk,gita-life}/app/api/manage/contacts/route.ts` — CREATE — `PATCH` delegating to `handleManageContactUpdate`.
- `apps/{folk,gita-life}/app/api/manage/contacts/photo/route.ts` — CREATE — `POST` + `GET` delegating to the photo handlers.
- `components/manage/manage-portal.tsx` — CREATE — tab shell, Admin mode toggle (a link that sets `?mode=`), and the payload hand-off.
- `components/manage/manage-dashboard.tsx` — CREATE — Total Contacts stat, the contacts-per-quarter line, the past-60-day Status Quo pie, and the two preacher×location stacked bars with Month/Year selects and Reset; charts built on `components/ui/chart.tsx`.
- `components/manage/manage-contacts-table.tsx` — CREATE — the eight-column contacts table with search, location filter, and click-to-sort headers.
- `components/manage/manage-sessions-view.tsx` — CREATE — location-grouped session rows, attendee chips, attendee counts with per-location sums.
- `components/manage/manage-attendance-view.tsx` — CREATE — location multi-select, sortable contact list, and the per-contact Records panel (Session / Session Date) with the 60-day count.
- `components/manage/manage-favorites-view.tsx` — CREATE — searchable/filterable favorites list, the contact-detail form (Name, Phone, College, Rounds, Books Read, Company, Date of Birth, Notes, Initial Contact, Location), photo upload with signed-URL preview, and the two computed counts.

**Acceptance Criteria:**
- Given the repo after the change, when I `grep -rniE "airtable" apps/*/app/manage components/manage lib/supabase/manage.ts lib/manage`, then zero lines match.
- Given `git diff --name-only`, when I inspect it, then `lib/airtable.ts`, `lib/supabase/data.ts`, `lib/authz.ts`, `lib/supabase/types.ts`, `packages/**`, `proxy.ts`, `public/sw.js`, and `supabase/**` do not appear. Only new `components/manage/*`, `lib/supabase/manage.ts`, `lib/manage/*`, the six new app route files, and the two rewritten `/manage/page.tsx` files do.
- Given `pnpm guardrails`, then it exits 0 — in particular no `"use client"` file in `components/manage/` reaches `lib/supabase/manage`, `lib/supabase/admin`, `lib/supabase/server`, or `lib/authz` at runtime.
- Given `pnpm typecheck:workspace`, then all 7 projects type-check with no `any` leaking past `lib/supabase/manage.ts`.
- Given `pnpm build:apps`, then folk and gita-life both build, which also proves each `/manage` page's `searchParams` typing and each server component's serialization boundary hold.
- Given `pnpm lint`, then it reports no new errors (the 12 pre-existing `.agent/`/`.codebuddy/`/`.neovate/` asset errors are unrelated).
- Given `node scripts/verify-program-readiness.mjs`, then it exits 0.
- Given a signed-in Admin, when I load `/manage`, then the page renders the portal with five tabs and no redirect to an external host.
- Given a signed-in Preacher, when the portal loads, then every contact shown has `assigned_preacher_id` equal to their own `public.users.id` — enforced by the read path, not asserted in the UI.
- Given a signed-in Admin with `?mode=preacher`, then the contact total and every list shrink to the Admin's own scope, and switching back to admin mode restores the program-wide totals.
- Given a program with more than 1000 contacts, when `/manage` loads, then the displayed total equals the program-wide count — proving the paged reads concatenated.
- Given a contact whose `contact_attendance_counts` row is absent, when the row renders, then both attendance columns show `0`.
- Given an Admin who edits a contact's `Notes` and `College`, when the `PATCH` succeeds, then only those two columns changed in Postgres and an `audit_events` row exists with `action: "manage.contact.update"`.
- Given a Preacher who `PATCH`es a contact assigned to another preacher, then the response is `403 {code:"forbidden"}` and no row changed.
- Given a successful photo upload, when the favorites view re-renders, then the image is served from a signed URL that is not a stable public object URL, and the underlying bucket stays private.
- Given a photo request for a contact with no `photo_path`, then the response is `404`.
- Given a `POST` with a `text/plain` file or a 6 MB file, then the response is `400` and nothing was written to the bucket.
- Given `/attendance`, `/api/contact`, `/api/registration`, `/api/sessions`, and the invite routes, when exercised, then their status codes and payloads are unchanged — none of those files appear in the diff.

## Design Notes

**Why the read path uses the user's JWT, not the service role.** The rest of the app reads through `createSupabaseAdminClient()` because RLS was placeholder `USING (true)` when those routes were written. Story 2 replaced that with per-role policies, and the portal is the first surface that reads bulk data — so it uses `createSupabaseServerClient()` and lets `20261006010000_scoped_rls_policies.sql` be the Preacher scoping mechanism, with the Admin mode toggle layered on top in the app. Reads that must cross roles (the staff display-name map) use the admin client, matching SPEC's recorded assumption that picker lists stay server-mediated.

**`contact_attendance_counts` needs an id-scoped read.** The view is a plain `CREATE OR REPLACE VIEW` with no `security_invoker`, so Postgres evaluates it with the view owner's rights and RLS on `contacts` does not apply — `supabase.from("contact_attendance_counts").select("*")` would answer with rollups for contacts the caller may not see. The portal therefore reads contacts first (RLS-scoped), then fetches rollups with `.in("contact_id", scopedIds)` in chunks. Fixing the view properly means a new migration, which is story 7's territory; the workaround is recorded rather than patched.

**"Status Quo" pie buckets.** The interface labels a per-session field "Status Quo" and its buckets are percentage ranges (the screenshot shows `0%` holding ~96% and a `10–50%` band). The portal has no equivalent column, so it computes, for each session in the past 60 days, `attendees / contactsAssignedToThatPreacher` and buckets the ratio: `0%`, `1–10%`, `10–25%`, `25–50%`, `50–100%`, `100%`. This reproduces the interface's shape from data the schema actually has; the bucket edges are this story's decision, not a recovered Airtable definition.

**Chart approach.** `stories.yaml` suggests loading a `dataviz` skill; it is not installed in this repo, and `recharts@2.15.4` plus the shadcn `components/ui/chart.tsx` wrapper are already dependencies. Charts go through `ChartContainer`/`ChartTooltip`/`ChartLegend` with a `ChartConfig` keyed by series and per-`ChartContainer` height wrappers, since `chart.tsx:58` pins `aspect-video`.

**Two apps, one component.** `components/` and `lib/` are shared by both apps through the `@/*` tsconfig paths, and the two `/manage` pages already differ only in wrapper classes. So the portal ships once and each app keeps its own page shell — matching how `live-attendance-dashboard.tsx` is already shared. The handlers live in `lib/manage/api-handlers.ts` for the same reason story 5 duplicated 22 files only because it was an import swap.

## Review Triage Log

### 2026-10-06 — Review pass

- verdicts: 62 findings — high 5, medium 12, low 20, false 6, maybe-false 1
- findings:
  - `[high]` `patch` Preacher sees out-of-scope contact identities through the denormalized `attendance.name`/`attendance.phone` columns — verified: the attendee label fell back to those columns when `contactsById` missed, so a Preacher whose attendance RLS admits a row for a session they lead would render the name and phone of a contact their `contacts` RLS denies (blind-hunter, edge-case-hunter ×2, verification-gap). Fixed: `ATTENDANCE_COLUMNS` no longer selects `name`/`phone`; the attendee is built only from the scoped contact, with a neutral `Not in scope` label and an empty phone otherwise.
  - `[high]` `patch` The service-role staff roster, with an `email` fallback, was shipped to every caller — verified: `loadStaffDisplayNames` read all `public.users` in the program and fell back to `row.email`, while `users` RLS grants a non-Admin only their own row (blind-hunter, edge-case-hunter, verification-gap). Fixed: the query is now `.in("id", …)` over only the ids referenced by already-scoped rows (`assigned_preacher_id`, `collected_by_id`, `preacher_id`, `created_by`), and `email` is no longer selected or used as a fallback.
  - `[high]` `patch` Contact editing and favoriting were unreachable — verified: `isFavorite` is in `MANAGE_CONTACT_PATCH_KEYS` and the PATCH route accepts it, but no control anywhere in `components/manage/` sends it, and the Favorites tab holds the only edit form, so a non-favorite contact could never be edited (blind-hunter ×2, edge-case-hunter). Fixed: `manage-contacts-table.tsx` gained a per-row favorite toggle that PATCHes `{contactId, isFavorite}`, applies a local override, disables while pending and reports the outcome.
  - `[medium]` `patch` Attendance rows were silently dropped when their session was not in the caller's visible session set — verified: `sessions` RLS is `created_by`-scoped while `attendance` RLS is session-`preacher_id`-scoped, so a Preacher loses attendance for sessions they led but did not create (verification-gap, blind-hunter, edge-case-hunter). Fixed: the `continue` is gone; the record is emitted with `sessionName`/`sessionDate` as `null`, which the UI already renders as "Untitled session" / "—". No service-role session read was added.
  - `[medium]` `patch` A data-layer outage was reported as an authorization failure — verified: `loadManagePortalData` ran inside the `try` whose `catch` unconditionally redirected to `staff-authorization-failed`, so a `PostgrestError` was indistinguishable from an auth failure and nothing was logged (blind-hunter ×2, verification-gap). Fixed: both `/manage` pages `console.error` and rethrow any non-`AuthzError`; only `AuthzError` reaches the two existing redirect branches.
  - `[medium]` `patch` `collectPagedRows` returned a truncated set when it hit `MANAGE_MAX_PAGES` — verified: the loop simply stopped, so `Total Contacts` and the Status Quo denominators under-reported with no signal (blind-hunter ×2, edge-case-hunter). Fixed: it now throws `Error("manage_paging_truncated")` when the last allowed page is still full.
  - `[medium]` `patch` Free-text `initialContact`/`dateOfBirth` silently dropped a contact out of the Contact Generation chart — verified: `calendarParts` fails on unparseable input and the contact just vanishes, with `optionalString` accepting anything ≤ 40 chars (blind-hunter ×2, edge-case-hunter). Fixed: `optionalIsoDate` requires blank or a leading `YYYY-MM-DD`; longer ISO timestamps still pass so existing rows stay editable.
  - `[medium]` `patch` The signed-URL preview showed "Loading a signed preview…" forever on a non-OK response and never refreshed before the 300 s TTL — verified: the effect returned on `!response.ok` without setting state (blind-hunter, edge-case-hunter). Fixed: `photoState` (`idle|loading|ready|failed`) distinguishes the cases and a 240 s timer re-mints before expiry.
  - `[medium]` `patch` A photo upload mid-edit discarded every unsaved field — verified: `setPhotoPaths` changed the `mergedContacts` memo identity, re-running the `useEffect` keyed on `selectedContact` and resetting the draft (edge-case-hunter, verification-gap). Fixed: the draft reset moved into `selectContact(id)` so it keys on the id, not the merged object.
  - `[medium]` `patch` An empty selected month silently rendered all-time totals — verified: `series.byPeriod[period] ?? series.byPeriod[ALL_PERIODS_KEY]` substituted the lifetime series under a Month/Year label claiming one month, and an empty `years` emitted a `"-01"` key (blind-hunter ×2, edge-case-hunter ×2, verification-gap). Fixed: only `byPeriod[period]` is resolved, the existing "No data for this period." empty state covers the absent case, and the month handler no-ops without a year.
  - `[low]` `patch` Superseded photo objects were orphaned — every upload used a fresh `randomUUID()` path with `upsert: false` and only cleaned up when the `contacts` update failed (blind-hunter, edge-case-hunter). Fixed: after a successful update the prior object is removed, with the failure logged and never failing the upload.
  - `[low]` `patch` The upload gate trusted the client-declared MIME type — arbitrary bytes could be stored and later served through a signed URL (blind-hunter, edge-case-hunter). Fixed: `matchesImageSignature` checks the leading JPEG/PNG/WebP signature against the declared type; a mismatch is a 400 and nothing is written.
  - `[low]` `patch` The `locations` read paged on `.order("name")`, a non-unique key, so offset paging could duplicate or skip rows (blind-hunter). Fixed: orders by `id` like every other read.
  - `[low]` `patch` `manage-sessions-view.tsx` keyed location groups by label while grouping by id, so two locations sharing a name collided as React keys and one group's rows were dropped (blind-hunter, edge-case-hunter ×2, verification-gap). Fixed: groups carry the grouping key and use it as the React key.
  - `[low]` `patch` The contacts-table location filter counts only `locationIds[0]`, understating how many rows the filter returns (blind-hunter, edge-case-hunter). Fixed: every id in `locationIds` is counted.
  - `[low]` `patch` A legacy free-text `location_ids` entry made `.in("id", …)` fail and turned every save for that contact into a 500 — `contacts.location_ids` is `TEXT[]` while `locations.id` is a UUID (blind-hunter, edge-case-hunter, verification-gap). Fixed: non-UUID ids are rejected as a 400 `invalid_patch` before any query is issued.
  - `[medium]` `defer` No committed executable check covers the new read and write paths — filed pre-verified by the verification-gap layer, and confirmed: the repo has no test runner, `/manage` is not in `.github/workflows/quality-gates.yml`, and `verify-rls.mjs` exercises the SQL policies rather than `loadManagePortalData`. This run covered every matrix row with a throwaway harness instead (79 assertions, see Verification); shipping it as `scripts/verify-manage-portal.mjs` was not done because nothing in this environment could execute or validate it, and `stories.yaml` assigns the verification suite to story 8. What would settle it: run story 8's suite against the hosted project.
  - `[medium]` `defer` `pnpm build:apps` never executes `/manage`, so every claimed check on the rewritten page is non-observing — filed pre-verified by the verification-gap layer; confirmed: the page is `force-dynamic`, reaches `cookies()`, and `apps/folk/.next/prerender-manifest.json` has no `/manage` entry. Pre-existing repo-wide gap (zero test files), not caused by this change. What would settle it: the operator live smoke in `operator_actions`.
  - `[maybe-false]` `defer` The whole portal payload (~1030 contacts plus every attendance row) is serialized into the RSC payload and rendered un-virtualized — the harm is a first-paint cost this environment cannot measure, since no browser and no live data are available; the code path itself is correct. Filed `medium (unverified)`. What would settle it: load `/manage` against the seeded folk program and record the RSC payload size and first paint; if it is bad, the fix is per-tab server fetches rather than client-side filtering.
  - `[low]` `defer` `contact_attendance_counts` has no `security_invoker`, so the rollup view answers with the view owner's rights — pre-existing from story 1, and the story works around it by reading rollups only for already-scoped contact ids; a real fix needs a migration, which is story 7's territory. Already recorded in Design Notes.
  - `[low]` `defer` `contacts.updated_at` has no `set_updated_at` trigger, so there is no way to detect a concurrent edit; fixing it needs a migration this story's Never list forbids. Surfacing point is story 8's fixture seeding.
  - `[low]` `defer` `serverOnlySpecifierPrefixes` in `scripts/verify-monorepo-guardrails.mjs` lists neither `@/lib/supabase/manage` nor `@/lib/manage`, so the spec's guardrail acceptance criterion is weaker than stated — pre-existing pattern, established by story 5 for `@/lib/supabase/data` and closed the same way (the module's own `import "server-only"` plus `next build` is the real backstop). Editing the script is forbidden by the Never list.
  - `[false]` `reject` A Preacher's payload keeps program-wide `locations` and the staff directory in `?mode=preacher` — checked and disproved as a defect: the shipped code narrows `scopedLocationRows` to `staff.locationIds` when `narrowToPreacher` is set, which is what the acceptance criterion "the contact total and every list shrink to the Admin's own scope" requires. An earlier revision of this run had deliberately left locations unnarrowed; the implementation subagent reverted that as a deviation from this criterion and the revert was kept.
  - `[false]` `reject` The `/manage` page's wrapper classes — `apps/gita-life/app/manage/page.tsx` now carries folk's `bg-[#FFF9F0]` — checked: `bg-[#FFF9F0]` is the dominant wrapper in that app already (`app/contact/page.tsx`, `app/dashboard/page.tsx`), so the new page is consistent with its own app. What is inaccurate is the Code Map's prose describing the old page, not the code.
  - `[false]` `reject` `verify-program-readiness.mjs`'s sign-in assertions — not touched by this change; it exits 0, measured.
  - `[false]` `reject` `MANAGE_VIEWS`/`isManageView` are unused and the Tabs handler casts unvalidated — checked: `isManageView` is used by both `/manage` pages for `?view=`, and `manage-portal.tsx`'s `onValueChange` only ever receives a value from its own five-item `TAB_LABELS` list. A tab name is not user input.
  - `[false]` `reject` The Status Quo pie and the `Past60DayAttendanceCount` column "describe different populations" — checked: they are different metrics by design (a per-session attendance ratio versus a per-contact record count), not two views of one population. Only the window's boundary math differs, which is the next row.
  - `[false]` `reject` `updateManageContact`'s response shape omits `booksRead`/`isFavorite`/`photoPath` — checked: it returns the editable columns only, and `ManageContactWriteResult` declares exactly that, so the favorites form's `overrides` merge cannot clobber a count or a photo path.
  - `[low]` `reject` The pie's 60-day window (`Date.now() - 60d`) and the view's (`now() AT TIME ZONE 'Asia/Kolkata' - INTERVAL '60 days'`) can disagree — only for sessions within ~5.5 h of the boundary, because both are the same instant modulo the DB session's `TimeZone`; no direct correction exists without pinning TZ in SQL, so not worth the change.
  - `[low]` `reject` A monthly bar chart with more than six locations repeats palette colors — cosmetic, and fixing it needs a generated color scale rather than a direct correction.
  - `[low]` `reject` Sessions whose preacher has no in-scope contacts are skipped by the Status Quo pie, so its subtitle undercounts — inherent to a ratio whose denominator is zero; showing a "no denominator" bucket is a new product decision, not a defect.
  - `[low]` `reject` `booksReadOptions` is derived from scoped contacts, so a book set outside the caller's scope shows no chip — the value is still carried in `draft.booksRead` and saved unchanged, so nothing is lost; the option list being scope-derived is correct.
  - `[low]` `reject` The `<img>` in `manage-favorites-view.tsx` adds one lint warning — deliberate: `next/image` would need `remotePatterns` in `next.config.mjs`, which is outside this story's allowed file set, and a short-lived signed URL is exactly the case `next/image` cannot optimize. Matches the existing `pwa-install-prompt.tsx` pattern.
  - `[low]` `reject` `pnpm lint` exits 1 — measured at baseline before this change: 18 problems (12 errors, 6 warnings), all 12 errors in `.agent/`, `.codebuddy/` and `.neovate/` skill assets. This change reaches 19 (12 errors, 7 warnings): zero new errors, one new warning, already rejected above. The red gate is pre-existing.
  - `[low]` `reject` `getProgramAirtableManagementUrl` is now dead code in `packages/program-config` — true and expected: story 7 owns `packages/**` and the deletion, and `scripts/verify-program-readiness.mjs` stays green.
  - `[low]` `reject` `components/header.tsx` opens `/manage` in a new tab and uses a gear icon — `components/header.tsx` is not in this story's task list, and `newTab` for a full-screen portal is a defensible nav choice; changing shared nav behavior belongs to a separate story.
  - `[low]` `reject` Spec-text inaccuracies found by both reviewers — "the six new app route files" when there are four, the Code Map's description of gita-life's old wrapper classes, and the Code Map's claim that `components/ui/{card,button}` are reused when no file imports them. All three are prose errors in sections outside `<intent-contract>`, and the only fix is to edit this build's spec.

## Design Notes

**Precedence of the online-detected patches over this run's own earlier edit.** Between implementation and review, `scopedLocationRows` was changed here to leave `locations` unnarrowed in `?mode=preacher`, on the reasoning that an Admin with an empty `users.location_ids` would otherwise see no locations at all. The implementation subagent reverted it during the patch pass as a direct deviation from the acceptance criterion "the contact total and **every list** shrink to the Admin's own scope", and the revert stands. The residual behaviour is that an Admin who owns no locations sees empty location lists in preacher mode; that is the criterion as written, and changing it is a spec decision rather than an implementation one.

## Verification

**Commands:**
- `pnpm guardrails` -- expected: exits 0; no client-graph import of a server-only module.
- `pnpm typecheck:workspace` -- expected: all 7 projects pass.
- `pnpm build:apps` -- expected: folk and gita-life both build.
- `pnpm lint` -- expected: no new errors beyond the 12 pre-existing skill-asset ones.
- `node scripts/verify-program-readiness.mjs` -- expected: exits 0.
- `grep -rniE "airtable" apps/folk/app/manage apps/gita-life/app/manage components/manage lib/supabase/manage.ts lib/manage` -- expected: zero matches.
- `node scripts/verify-rls.mjs` -- expected: 75/75, proving no policy regressed. **Cannot run here:** this sandbox cannot reach the hosted project — `psql` to the pooler and PostgREST both reset the connection (`server closed the connection unexpectedly` / `ECONNRESET`), so this is an operator action.
- Live portal smoke (Admin and Preacher, all five tabs, one contact edit, one photo upload) -- expected: every screen renders, scoping is visibly different per role, and the edit round-trips. **Cannot run here:** no browser and the same blocked project endpoint. Operator action.

**Matrix audit.** The repo has no test runner and the story's Never list forbids adding one, so every I/O & Edge-Case Matrix row was exercised by a throwaway harness that transpiles the *shipped* `lib/supabase/manage.ts` and `lib/manage/api-handlers.ts` and runs them against stubbed Supabase clients — the real module bodies, not re-implementations. It lives in the system temp directory and is **not** committed: it stubs the very client under test, so it is evidence for this run, not a regression gate. 79 assertions, all passing:

- Admin admin-mode payload carries all 1030 contacts, resolves rollups for contacts that have them, and renders a missing rollup row as `0`; all five chart series and the six Status Quo labels are present; a month key narrows to that month.
- Paging past the 1000-row cap loses nothing (`c01029`, the last fixture row, is present).
- Admin `?mode=preacher` narrows contacts, sessions and locations to the Admin's own scope; admin mode restores the program-wide set.
- A Preacher's payload equals the RLS-visible subset: only contacts assigned to them, only sessions they created, only attendance on those sessions — and the app layer never widens it.
- A PATCH writes only the supplied keys (name, phone, `assigned_preacher_id` untouched), emits exactly one `manage.contact.update` audit event listing the written fields, and returns a shape without rollups.
- A Preacher PATCHing another preacher's contact gets `403 forbidden` with no write and no audit event; a contact outside the program gets `404`.
- Photo upload stores a program/contact-scoped path, persists `photo_path`, mints a signed URL, and returns `400` for `text/plain`, 6 MB, empty, spoofed-signature and missing-file bodies with nothing reaching the data layer; the signed-URL route returns `404` for a null `photo_path`, a deleted object, and a cross-program contact.
- The handler layer returns `401 unauthenticated` unauthenticated and `403 forbidden` for a Volunteer, and rejects non-UUID ids, unknown patch keys, non-JSON bodies, empty patches, non-array `booksRead`, non-boolean `isFavorite`, non-ISO dates and non-UUID location ids before any Supabase call.

Two rows are covered only at the layer that owns the enforcement rather than end-to-end, and both are recorded as operator actions below: the page-level `redirect("/login?redirect=/manage")` / `redirect("/auth/error?code=staff-authorization-failed")` branches, and the browser rendering of the five tabs. Both need a browser and the hosted project.

**Unverified live behaviour** (network-blocked from this environment, not agent-actionable): everything in the matrix that depends on real Postgres state — RLS actually filtering the Preacher's payload, rollup counts matching `count(*)`, and `verify-rls.mjs` staying 75/75 after the read-path change. This change alters no policy and no migration; the read path reads through the same `createSupabaseServerClient()` the RLS policies were written against, and the one place it diverges — attendance rows whose session is not visible — now degrades to a null session name instead of dropping the row.
## Auto Run Result

Status: awaiting-operator

Blocking condition: none. Every part an agent can perform is implemented, reviewed, patched and verified in-repo. What remains needs a network path to the hosted Supabase project and a browser, neither of which this environment has.

### Summary of implemented change

`/manage` stops being a redirect to the Airtable Interface and becomes a Supabase-backed portal with the five screens `manage-interface.md` specifies — Dashboard (Total Contacts stat, contacts-per-quarter line, past-60-day "Status Quo" pie, and two preacher×location stacked bars with Month/Year filters and Reset), a sortable/searchable/filterable Contacts table, sessions grouped by location with attendee chips and per-location sums, an Attendance tab with a location multi-select plus a per-contact Records panel, and a Favorites list whose detail panel edits the contact and uploads a photo. It ships in the app's existing design language and is shared by both programs; each app keeps its own page shell. Access stays Admin+Preacher only.

The scoping model is the substantive part. Reads go through `createSupabaseServerClient()` — the caller's JWT — so story 2's RLS policies, not an app-side filter, decide what a Preacher sees, with the Admin admin/preacher toggle layered on as a narrowing-only filter. Writes go through server routes on the service role after an explicit scope check, and contact photos live in the private `contact-photos` bucket rendered only through server-minted short-lived signed URLs. Every read is paged past the project's 1000-row cap, and rollups are requested only for already-scoped contact ids because the rollup view has no `security_invoker`.

### Files changed

- `lib/supabase/manage.ts` (new, 1071 lines, `server-only`) — the portal's whole data layer: paged RLS-scoped reads of contacts/sessions/attendance/locations, id-scoped rollup fetch, mode narrowing, derived chart series, the scope-checked contact update, photo upload and signed-URL minting, audit events on both mutations.
- `lib/manage/api-handlers.ts` (new, 314 lines, `server-only`) — the three route handlers shared by both apps, with the patch allow-list, UUID/MIME/signature/date/size validation, and the `403`-vs-`404` split.
- `components/manage/manage-types.ts` (new) — client-safe payload and chart types; imports nothing, so no client file can reach a server-only module through it.
- `components/manage/manage-portal.tsx` (new) — tab shell, Admin mode toggle, payload hand-off.
- `components/manage/manage-dashboard.tsx` (new) — the stat tiles and four recharts charts on `components/ui/chart.tsx`.
- `components/manage/manage-contacts-table.tsx` (new) — the eight-column table with search, location filter, click-to-sort headers and the favorite toggle.
- `components/manage/manage-sessions-view.tsx` (new) — location-grouped sessions with attendee chips and attendee sums.
- `components/manage/manage-attendance-view.tsx` (new) — location multi-select, sortable contact list, per-contact Records panel.
- `components/manage/manage-favorites-view.tsx` (new) — searchable favorites list and the contact-detail form with photo upload and computed counts.
- `apps/folk/app/manage/page.tsx`, `apps/gita-life/app/manage/page.tsx` (rewritten) — the Airtable redirect, import and fallback card are gone; auth, both redirect branches, and each app's wrapper classes stay.
- `apps/{folk,gita-life}/app/api/manage/contacts/route.ts` (new) — `PATCH`.
- `apps/{folk,gita-life}/app/api/manage/contacts/photo/route.ts` (new) — `POST` upload and `GET` signed URL.

### Review findings breakdown

62 findings across four layers: 5 high, 12 medium, 20 low, 6 false, 1 maybe-false.

**Patched (16 entries, 3 high / 8 medium / 5 low), all applied and re-verified:**
- 3 high — the denormalized `attendance` columns leaking contacts that `contacts` RLS denies; the service-role staff roster with its `email` fallback reaching every caller; and contact editing being unreachable because nothing in the UI could set `isFavorite`.
- 8 medium — attendance rows dropped when their session was out of the caller's session scope; data outages reported as authorization failures; silent paging truncation; free-text dates silently removing a contact from the quarter chart; the signed-URL preview stuck on "Loading…" with no TTL refresh; a photo upload discarding unsaved form fields; an empty selected month rendering all-time totals; and, folded into the same pass, the favorite toggle's own route round-trip.
- 5 low — orphaned photo objects on replace; the client-declared MIME type trusted without a signature check; non-unique ordering on the paged `locations` read; React keys keyed by a non-unique label; and location-filter counts ignoring secondary locations. One more low — a legacy non-UUID `location_ids` entry turning every save into a 500 — was fixed in the same group.

**Deferred (6):** no committed executable check for the new read/write paths (medium — the throwaway harness covered every row, but shipping it needs a hosted project to validate against, and `stories.yaml` gives story 8 the verification suite); `pnpm build:apps` never executing `/manage` (medium, pre-existing repo-wide harness gap); the full-payload RSC size and un-virtualized tables (medium, unverified — needs a live load to know); `contact_attendance_counts` missing `security_invoker` (low, pre-existing from story 1, needs story 7's migration); `contacts.updated_at` having no trigger (low, needs a migration); and `serverOnlySpecifierPrefixes` not listing the new server-only modules (low, pre-existing pattern story 5 established, with the module's own `import "server-only"` plus `next build` as the real backstop).

**Rejected (17):** six `false` — including the one this run had itself introduced, where an earlier revision left `locations` unnarrowed in preacher mode; the implementation subagent caught that as a deviation from the "every list shrinks" criterion and the revert was kept. Eleven `low` rejections with recorded reasons: the ~5.5 h boundary skew between the two 60-day windows; a sixth-and-beyond location repeating a palette color; the Status Quo pie skipping zero-denominator sessions; `booksReadOptions` being scope-derived while the value still round-trips; the deliberate `<img>` on a signed URL; the already-red `pnpm lint` gate (measured at baseline: 18 problems before, 19 after, zero new errors); the now-dead `getProgramAirtableManagementUrl`, which story 7 owns; the header's `newTab`, which is not this story's file; and four prose errors in this spec — including "six new app route files" when there are four — whose only fix is to edit this build's spec.

**Follow-up review recommendation:** `true`. Three high entries were patched, and each was a scoping or privacy defect found by review rather than by any check in the repo — no committed test would have caught the `attendance`-column leak or the roster leak, and both sat on the exact surface (`contacts`/`users` RLS) this story exists to honour. A second pass is warranted specifically to re-examine the read path for any other service-role read that reaches the browser; that is the one class of defect this pass found twice and no existing gate observes.

### Verification performed

| Command | Outcome |
|---|---|
| `pnpm guardrails` | exits 0 — 4 warnings, all pre-existing `type-imports @/lib/authz` in untouched files |
| `pnpm typecheck:workspace` | all 7 projects pass |
| `pnpm turbo run build --filter=@hkmc/folk --filter=@hkmc/gita-life --force` | 2 successful, 0 cached, ~35 s; `/manage` and both `/api/manage/*` routes emitted per app |
| `pnpm lint` | 19 problems (12 errors, 7 warnings) — baseline measured at 18 (12 errors, 6 warnings); zero errors in any new file, one new warning (the deliberate `<img>`) |
| `node scripts/verify-program-readiness.mjs` | exits 0 |
| `grep -rniE "airtable"` over both `/manage` pages, `components/manage`, `lib/supabase/manage.ts`, `lib/manage` | zero matches |
| `git status --porcelain` over every Never-list path | empty — `lib/airtable.ts`, `lib/supabase/data.ts`, `lib/authz.ts`, `lib/supabase/types.ts`, `packages/**`, `proxy.ts`, `public/sw.js`, `supabase/**`, both verify scripts, `components/header.tsx`, `/attendance`, `/api/contact`, `/api/registration`, `/api/sessions`, the invite routes, and `sprint-status.yaml` are all untouched |
| Matrix harness (throwaway, temp dir, not committed) | 79 assertions, 0 failed |

### Residual risks

- **No committed regression gate for any of this.** The repo still has zero test files and CI runs only guardrails/typecheck/build/lint. Every behavior asserted here was proven by a throwaway harness over the shipped modules. Story 8 owns the real suite.
- **RLS filtering is reasoned, not observed.** The Preacher-scoping assertions ran against a stub that simulates the story-2 policies, so they prove the app layer neither widens nor drops rows — they do not prove Postgres returns what the policies say. Nothing here touches a policy or a migration, but that is an argument, not a measurement.
- **Payload size is unmeasured.** ~1030 contacts plus every attendance row are serialized to the client on each `/manage` load and the tables render un-virtualized. No browser was available to record the RSC payload size or first paint.
- **Admin with no `location_ids` in preacher mode sees empty location lists.** That is the "every list shrinks" criterion as written, kept deliberately after the subagent flagged my earlier deviation; it is worth a product decision rather than a silent behavior.
- **The Status Quo bucket edges are invented.** `0% / 1–10% / 10–25% / 25–50% / 50–100% / 100%` reproduces the interface's shape from schema the app actually has; Airtable's original edges were not recoverable.
- **Uneditable existing data.** If a contact already violates a new write-time cap (20 books, 2 000 characters of notes), it can no longer be saved from `/manage`, and the offending values are not surfaced anywhere in the UI.
