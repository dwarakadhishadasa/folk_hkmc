# Migration and verification notes

Implementation-facing detail for `SPEC-admin-assistants`. The binding rules, patch predicate, surface matrix and RLS booleans are in the adopted architecture spine (AD-1 through AD-6); this file carries the updates and checks that sit outside the five-field kernel.

## Existing docs and specs to update

| Artifact | Current statement | Change |
| --- | --- | --- |
| `_bmad-output/specs/spec-contacts-section/SPEC.md:45,128` | Assistants are redirected from `/contacts*` to `/contact` | Assistants open the contacts section on their patch |
| `_bmad-output/specs/spec-program-dashboard/SPEC.md:64` | A non-Preacher assignment is an empty scope | An Admin can be the assigned Preacher |
| `docs/architecture.md` Role Matrix | `/manage` and contacts are Admin/Preacher | Update the Assistant row |
| `docs/api-contracts.md:295` | Volunteer and Assistant invites require an active Preacher | Assistant: active Admin or Preacher; Volunteer: active Preacher |
| `_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md` AD-13 | `/api/manage/contacts/**` is fixed at `["Admin", "Preacher"]` | Superseded for the manage gate; Campaign admin/caller split and AD-2 role set unchanged |
| `docs/data-models.md` | `assigned_preacher_id` is Volunteer/Assistant routing through a Preacher | Assigned Preacher (Admin or Preacher) |
| `apps/folk/proxy.ts`, `apps/gita-life/proxy.ts` | `/manage`, `/api/manage/*`, `/admin/*`, `/attendance` are outside the matcher | Add them; the surfaces become load-bearing |

## Required sibling update

Edit the autodialer spine's AD-13 sentence to cite `SPEC-admin-assistants` / its spine and use `OPERATIONAL_ROLES` for `/api/manage/contacts/**`, or mark AD-13 amended. The autodialer file is `status: final`; leaving it unchanged lets a unit quote a final two-role gate. Add a test or coverage-matrix assertion that the manage write gate equals `OPERATIONAL_ROLES`.

Also record the amendment to the autodialer AD-3 assignable caller set: for an Assistant, include the assigned Preacher alongside the actor and the staff assigned to them. The rest of AD-3 stands.

## Pre-deploy data audit

Count these before applying the migration, decide repair/reassign/accept, and record the counts in the migration PR:

1. Assistants with an ineligible `assigned_preacher_id` (missing, inactive, cross-programme, or role not Admin/Preacher).
2. Assistants who are `preacher_id` but not `created_by` on a session. These lose the legacy row when `preacher_id = actor` is removed.
3. Assistants with a null/ineligible assigned Preacher who created sessions. The null-patch change makes those sessions invisible.
4. Assistants with a valid assigned Preacher who are `created_by` but not `preacher_id` on a session. This is the `/manage` actor-term shape; it must be counted before the filter is aligned.

Add a fixture for each shape to `scripts/verify-rls.mjs`.

## Verification

- `node scripts/verify-rls.mjs` with its `.env.migration.local` prerequisite: assignee role/programme check, attendance predicate, stale-FK gate, a session that `/sessions` shows and `/manage` must count, and null-patch zero-row behavior. Fixtures: an Admin-supervised Assistant, a wrong-role assignee, a cross-programme assignee.
- Unit: `patchOwner` resolution (Admin self, Preacher self, Assistant with Active Admin/Preacher, inactive/wrong-role/cross-programme assignee, Volunteer null); binding lifecycle; patch predicate on contacts, sessions, manage and campaign scope; write attribution (owner vs collector).
- E2E: an Admin invites an Assistant assigned to themselves; the Assistant sees the Admin's patch on `/contacts`, `/manage`, `/sessions`, `/dashboard`, `/attendance` and the campaign admin surface; a Preacher's Assistant sees the Preacher's patch; a Volunteer still sees only the contact form and caller queue; a null-patch Assistant gets the empty states and no dead Contacts/Manage/Invite items.
- Copy check: no user-facing string renders "Supervisor"; the assigned person is labelled "Preacher" in both cases, with the role shown where the person is named.
- Commands: `pnpm test:static`, `pnpm test:unit`, the relevant `pnpm test:e2e:*` scripts, and the full `pnpm test:e2e` before a PR because `/manage`, `/contacts` and `/attendance` are shared surfaces.

## Rollout notes

- The proxy matcher additions are part of the change, not a follow-up. `/manage` and `/api/manage/*` are the known gap; `/admin/*` and `/attendance` are added for the same session-refresh reason.
- Next 16.0.7 is the repo pin and predates CVE-2026-44575 (proxy/middleware bypass, fixed in 16.2.5). This feature does not rely on the proxy for authorization — every page and handler calls `getStaffContext()` — but the framework upgrade should be scheduled before production exposure. It is not part of this slice.
- No new runtime service, table or environment variable. `assigned_preacher_id` remains the stored column; no `supervisor_user_id` migration.
