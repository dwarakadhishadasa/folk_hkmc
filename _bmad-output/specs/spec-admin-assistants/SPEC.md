---
id: SPEC-admin-assistants
companions:
  - ../../planning-artifacts/architecture/architecture-folk_hkmc-2026-11-03/ARCHITECTURE-SPINE.md
  - migration-notes.md
sources:
  - ../../planning-artifacts/architecture/architecture-folk_hkmc-2026-11-03/DECISION-admin-assistants.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Admin-supervised Assistants

## Why

An Admin cannot currently have an Assistant. The invite path and the main scope resolvers require the staff member an Assistant is assigned to to be an Active **Preacher**, so an Admin's helper cannot be bound to the Admin, and an Assistant's operational reach excludes the contacts grid, the manage portal and the staff attendance read. Programmes need an Admin to delegate their personal patch — contacts, sessions, attendance and campaign work — to an Assistant without granting that Assistant programme-wide read access. This spec closes that gap with one Assistant construct: an Assistant mirrors the personal patch of the assigned Preacher, whether that person's staff role is Admin or Preacher.

## Capabilities

- **CAP-1 — Bind an Assistant to an Admin**
  - **intent:** An Admin can invite or move an Assistant assigned to any Active Admin or Preacher in the programme, while a Preacher can bind an Assistant only to themselves.
  - **success:** An Admin invite with an Admin assignee succeeds and writes that Admin's `public.users.id` to `assigned_preacher_id`; a Preacher invite can only target the Preacher; a role change to Admin/Preacher clears the binding, to Volunteer requires an Active Preacher, and to Assistant requires an Active Admin or Preacher.

- **CAP-2 — Read and write the assigned Preacher's patch**
  - **intent:** An Assistant can read and write the contacts, sessions, attendance, dashboard and campaign data that belong to the assigned Preacher's personal patch, and nothing else.
  - **success:** With an Admin-owned contact and session, a colleague's contact and session, and a programme-level row seeded, the Assistant sees only the Admin's rows; a contact the Assistant creates is owned by the Admin and collected by the Assistant; a session they create names the Admin as `preacher_id` and the Assistant as `created_by`.

- **CAP-3 — Open the operational surfaces**
  - **intent:** An Assistant can open `/contacts` (overview, grid, reports), `/manage`, `/sessions`, `/dashboard`, the staff `/attendance` read, the `/campaigns` admin surface and `/contact`, with the same role set on each page and its handlers.
  - **success:** An Assistant with a patch opens each surface and sees patch data; `/api/manage/contacts/**` accepts create, update, delete, bulk and photo on patch rows; `/admin/**` and `/volunteers` remain refused; an Assistant without a patch sees the surface-specific empty state and no dead Contacts/Manage/Invite nav item.

- **CAP-4 — Keep a null patch empty**
  - **intent:** An Assistant whose assigned Preacher is missing, inactive, cross-programme or the wrong role gets zero rows on every operational surface and a clear explanation, never programme data and never a redirect loop.
  - **success:** With a null/ineligible assignee, `/contacts`, `/manage`, `/sessions`, `/dashboard`, `/attendance` and `/campaigns` return no patch rows; `/manage` and `/contacts` show a surface-specific explanation; the header hides Contacts, Manage and Invite; `/campaigns` keeps the autodialer 403; no surface returns programme rows.

- **CAP-5 — Make RLS match the patch**
  - **intent:** The database grants exactly the Assistant's patch, preserves the Admin's programme scope, and never lets a service-role read or a page widen beyond the patch.
  - **success:** `verify-rls.mjs` fixtures show an Assistant reads the assigned Preacher's contacts, sessions and attendance and no programme rows; an Admin still reads the programme; an ineligible or cross-programme assignment yields zero; a session shown in `/sessions` is counted in `/manage` attendance.

- **CAP-6 — Keep the Preacher label**
  - **intent:** The assigned person is labelled "Preacher" for both an Admin and a Preacher, with the role shown where the person is named, and the stored column keeps its name.
  - **success:** The invite picker's field label is "Assigned Preacher" and lists Admins and Preachers with their role; no user-facing string renders "Supervisor"; `assigned_preacher_id` and `assignedPreacherUserId` keep their names; the four staff roles are unchanged.

## Constraints

- Staff roles remain exactly four: `Admin`, `Preacher`, `Volunteer`, `Assistant`. "Preacher" is the relationship label for the assigned staff member, not a fifth role.
- An Assistant never receives programme scope (`program_scope = true` or `kind:"program"`); the Admin's programme scope stays unchanged.
- An eligible assigned Preacher is `Active`, in the same programme, and role `Admin` or `Preacher`.
- `/volunteers` is the Preacher's self-only surface; an Admin invites from `/admin/invite`. Only an Admin may demote an Assistant to Volunteer.
- Keep `assigned_preacher_id` and `assignedPreacherUserId`; no `supervisor_user_id`. User-facing copy keeps "Preacher" for both role cases.
- The `/contact` form keeps its existing per-role assignment and collector rule; grid create stamps owner/actor, grid update preserves ownership.
- The Admin's `/sessions` remains creator-only; the Assistant patch follows the dashboard's personal-scope definition.
- The staff `/attendance` GET is in scope; the public attendance POST and registration are not.
- `dashboard_overview` and `campaign_progress` are owner-only; the `programme_attendance` CTE is a programme-wide KPI input by design.
- No new runtime service, table or environment variable. The proxy matcher gains `/manage`, `/api/manage/*`, `/admin/*` and `/attendance`.

## Non-goals

- Programme-wide Assistant scope.
- A fifth staff role, or a role named "Supervisor".
- Per-assistant capability overrides.
- Renaming `assigned_preacher_id`.
- Unifying `collected_by_id` between `/contact` and the grid.
- Admitting Assistants to `/volunteers`.
- Changing the Campaign admin/caller split or the autodialer AD-2 role set.
- Changing the Admin's `/sessions` creator-only filter.
- A Next.js upgrade or CVE remediation as part of this slice.

## Success signal

- An Admin invites an Assistant assigned to themselves. The Assistant signs in and sees only the Admin's patch across contacts, manage, sessions, dashboard, attendance and campaigns. A Preacher's Assistant sees the Preacher's patch; a Volunteer still uses the contact form and caller queue; a null-patch Assistant gets the empty states; `verify-rls.mjs` and the relevant e2e matrix rows pass; no user-facing "Supervisor" string.

## Assumptions

- `assigned_preacher_id` can already hold an Admin's `public.users.id`; Admin-created contacts already do.
- The Admin's existing "Own scope" dashboard predicate is the patch definition.
- The autodialer AD-13 gate and the docs role matrix are updated in the same change.

## Open Questions

- Pre-deploy data audit: for the ineligible assignments and legacy session shapes, do we repair, reassign, or accept the rows? Decide after the audit counts are collected.
