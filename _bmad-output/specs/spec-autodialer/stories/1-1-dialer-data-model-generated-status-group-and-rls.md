---
title: 'Dialer data model, generated status group, and RLS'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/data-model.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FOLK has no native storage for campaigns, callers, assignments, calling profiles, call outcomes, or survey definitions. Supabase's default grants for new public tables would also let browser clients write or delete dialer history outside the server boundary.

**Approach:** Add one timestamped migration with exactly seven program-scoped tables, a total stored `status_group` generated from the 13 caller-written dispositions, scoped SELECT-only RLS, and regenerated TypeScript types.

## Boundaries & Constraints

**Always:**
- Create only `dialer_campaigns`, `dialer_callers`, `dialer_assignments`, `dialer_contact_profiles`, `dialer_call_logs`, `dialer_survey_questions`, and `dialer_survey_options`. Every table has `program_id TEXT NOT NULL`; follow `data-model.md` § Tables for every other column, check, index, and unique constraint.
- The three unique constraints are callers `(program_id,user_id)`, assignments `(contact_id,campaign_id)`, and logs `(assignment_id,attempt)`.
- `dialer_call_logs.status_group TEXT GENERATED ALWAYS AS (CASE disposition_status ...) STORED NOT NULL`. The 13-to-six mapping is exactly AD-4: confirmed, may-come, seven deferrals, two unreachable, wrong-number, and not-interested. The disposition CHECK permits exactly those 13 values; no client or RPC writes the group.
- Use six `ON DELETE RESTRICT` FKs: assignments→contacts/callers/campaigns, logs→callers, callers→users, questions→campaigns. Use CASCADE for profiles→contacts, logs→assignments, options→questions. Use SET NULL for nullable `created_by`, `assigned_by`, and `promoted_by` staff references.
- Enable RLS on all seven tables. Every policy filters `program_id = public.caller_program_id()` and uses the existing caller helpers. Campaign/question/option rows are program-readable to Admin/Preacher/Assistant and assignment-scoped to an own caller. Caller, assignment, log, and profile rows carry the role/contact scope defined in `data-model.md`; an own caller may additionally read their own linked rows. RLS is defence-in-depth; Story 1.2's service-role assertion remains the endpoint boundary.
- Revoke all table privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role`; grant only SELECT to `authenticated`, and SELECT/INSERT/UPDATE only to `service_role`. No application role holds DELETE and no authenticated write policy exists.

**Never:**
- Do not create `dialer_survey_responses`, the disposition RPC, UI, routes, or a `contacts` column. Do not add `next_call_date`, `call_duration`, `audience_filter`, `follow_up_status`, weights, or `SCHEDULED`.
- Do not edit `lib/supabase/manage.ts`; Story 1.3 owns its RESTRICT delete message.
- Do not edit an earlier migration or weaken a grant/RLS rule.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid disposition | Any checked value | Its exact generated group | No error |
| Unknown disposition | Value outside the 13 | Rejected | CHECK violation |
| Duplicate work | Repeat assignment, attempt, or caller in program | Rejected | UNIQUE violation |
| Browser write | anon/authenticated INSERT, UPDATE, DELETE | Denied | Privilege denied |
| History delete | Delete a referenced history parent | Refused | FK RESTRICT |
| Wrong program | Authenticated user selects another program | Zero rows | RLS filters silently |

## Human Decisions

1. **Timestamps (Option A).** `dialer_assignments`, `dialer_survey_questions`, and `dialer_survey_options` each get the standard `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` pair plus the `public.set_updated_at()` trigger, matching every other non-log table. The three per-table lists in `data-model.md` are extended, not treated as exhaustive.
2. **Caller-roster scope (Option A).** Add exactly one new `SECURITY DEFINER` helper in the new migration — `public.caller_assignable_user_ids()` — returning the AD-3 assignable set as `uuid[]`: Admin → every active staff user in the program; Preacher → staff users whose `public.users.assigned_preacher_id = auth.uid()` **plus the Preacher themself**; Assistant → staff users whose `public.users.assigned_preacher_id = caller_assigned_preacher_id()` **plus the Assistant themself**. Deactivated callers are excluded. The `dialer_callers` SELECT policy uses it. This is the only new helper; `caller_role()`, `caller_program_id()`, `caller_assigned_preacher_id()`, and `caller_effective_location_ids()` stay unchanged.

</frozen-after-approval>


## Code Map

- `_bmad-output/specs/spec-autodialer/data-model.md` — authoritative columns, checks, FK actions, indexes, mappings, and RLS semantics.
- `_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md` — binding AD-4, AD-11–AD-14 and conventions.
- `supabase/migrations/20261006010000_scoped_rls_policies.sql` — reuse `caller_role()`, `caller_program_id()`, `caller_assigned_preacher_id()` and the policy shape; do not change it.
- `supabase/migrations/20260504101000_harden_staff_bridge_advisor_findings.sql` — reuse `public.set_updated_at()`.
- `supabase/migrations/20261019000000_contacts_single_location.sql` — latest migration; the new one sorts after it.
- `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md` — append one scoped read row for each dialer table.
- `lib/supabase/types.ts` — regenerate; no hand edits.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261025000000_create_dialer_tables.sql` — create the seven tables, constraints, indexes, generated column, timestamps/triggers, RLS policies, and exact grants.
- [x] `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md` — add seven dialer rows and clarify service-role-only writes with no DELETE grant.
- [x] `lib/supabase/types.ts` — regenerate after applying the local migration with `pnpm dlx supabase@2.98.2 gen types typescript --local > lib/supabase/types.ts`; review for unrelated schema changes. Landed as part of `feat(server): service layer` (commit bec5ea4); all seven dialer table types present with `caller_assignable_user_ids` function signature; diff reviewed against fresh local generation — identical except CLI stderr banner and `__InternalSupabase` header (committed version has it, generator omits it; this is expected).
- [x] Record rolled-back SQL probe outputs in Implementation Notes: all 13 mappings, all three unique constraints, privileges by role, all six RESTRICT FKs, and cross-program RLS visibility.

**Acceptance Criteria:**
- Given the local stack, when the migration is pushed, then exactly the seven named tables exist with the specified columns, checks, FKs, indexes, and unique constraints, and no response table exists.
- Given a valid disposition, when a log is inserted, then its generated group is exact; an invalid disposition is rejected and the group cannot be written directly.
- Given a duplicate assignment, attempt, or caller profile, when inserted, then its unique constraint rejects it.
- Given anon or authenticated, when it writes, then the privilege is absent; SELECT is program- and role-scoped, and no application role has DELETE.
- Given a history-bearing parent, when deletion is attempted, then each of the six RESTRICT FKs refuses it.
- Given the migration commit, when matrix and types are inspected, then seven matrix rows and seven generated table types are present.

## Implementation Notes

### What landed

`supabase/migrations/20261025000000_create_dialer_tables.sql` (one additive timestamped
migration, sorts after `20261019000000_contacts_single_location.sql`). No earlier migration
was edited. It creates exactly seven tables, each with `program_id TEXT NOT NULL`:

| Table | Notes |
|---|---|
| `dialer_contact_profiles` | PK `contact_id` FK `contacts(id)` ON DELETE CASCADE; four nullable facets (`centre`, `level`, `gender`, `language`) |
| `dialer_campaigns` | `status` CHECK `DRAFT,ACTIVE,COMPLETED,CANCELLED`; `max_attempts` CHECK 1–10; `gap_duration` CHECK 5–300; `created_by` FK `users` ON DELETE SET NULL |
| `dialer_callers` | `user_id` FK `users(id)` ON DELETE **RESTRICT**; `UNIQUE (program_id, user_id)`; `promoted_by` ON DELETE SET NULL |
| `dialer_assignments` | `UNIQUE (contact_id, campaign_id)`; contact/caller/campaign FKs all ON DELETE **RESTRICT**; `assigned_by` ON DELETE SET NULL |
| `dialer_call_logs` | `status_group` GENERATED ALWAYS AS (CASE …) STORED NOT NULL; `UNIQUE (assignment_id, attempt)`; `called_at`, no `updated_at`; assignment FK ON DELETE CASCADE, caller FK ON DELETE **RESTRICT** |
| `dialer_survey_questions` | `campaign_id` FK ON DELETE **RESTRICT**; `question_type` CHECK `TEXT,DROPDOWN,RADIO,MULTI_SELECT,DATE` |
| `dialer_survey_options` | `question_id` FK ON DELETE CASCADE; `label`/`value`/`sort_order` |

`dialer_survey_responses` is **not** created — it belongs to story 2.3 with the disposition RPC.

**Timestamps.** `dialer_campaigns`, `dialer_callers`, `dialer_assignments`,
`dialer_contact_profiles`, `dialer_survey_questions` and `dialer_survey_options` each carry
`created_at`/`updated_at` NOT NULL DEFAULT now() plus the existing `public.set_updated_at()`
trigger. `dialer_call_logs` is exempt: `called_at` only, immutable per attempt.
`dialer_assignments.assigned_at` and `dialer_callers.promoted_at` are nullable, per
`data-model.md`.

**The one new helper.** `public.caller_assignable_user_ids()` (SECURITY DEFINER, STABLE,
pinned `search_path`), returning the AD-3 assignable set as `uuid[]`:
Admin → every active staff user in the program; Preacher → their own assignees plus
themselves; Assistant → their preacher's assignees plus themselves; a staff user whose
`dialer_callers.is_active = false` is excluded from every set. `caller_role()`,
`caller_program_id()`, `caller_assigned_preacher_id()` and `caller_effective_location_ids()`
are reused unchanged. `EXPLAIN` is revoked from `PUBLIC` and `anon`; `EXECUTE` is granted to
`authenticated` and `service_role`.

**RLS.** Enabled on all seven tables. Fifteen SELECT policies, none for any write command:
campaign/question/option rows are program-readable to Admin/Preacher/Assistant and
campaign-scoped to an own caller; the roster is Admin-program / assignable-set / own-row;
assignments, call logs and contact profiles are Admin-program / contact-linked / own-linked.
Every policy filters `program_id = public.caller_program_id()`.

**Grants.** `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated` and `service_role` on all
seven tables, then: `authenticated` → SELECT only; `service_role` → SELECT/INSERT/UPDATE.
`anon` holds **no** privilege on any dialer table. **No role holds DELETE** (only the table
owner `postgres` does).

**Policy names.** Postgres truncates identifiers at 63 bytes, so two policy names were
shortened to fit: `dialer_survey_questions are readable by admins in program` and
`dialer_survey_options are readable by admins in program`. Without this the migration emits
two `identifier … will be truncated` notices and lands with mangled names.

### Rolled-back SQL probe outputs

All probes ran against the local database inside a transaction that was rolled back; no
probe row persists.

**P1 — the 13 status_group mappings (13/13 PASS).** Each disposition inserted into a
`dialer_call_logs` row; the generated `status_group` compared against the AD-4 table.

```
 attempt |     disposition      | expected_group |  actual_group  | result
---------+----------------------+----------------+----------------+--------
       1 | CONFIRMED            | CONFIRMED      | CONFIRMED      | PASS
       2 | MAY_COME             | MAY_COME       | MAY_COME       | PASS
       3 | WILL_COME_NEXT_CLASS | DEFERRED       | DEFERRED       | PASS
       4 | WILL_COME_NEXT_WEEK  | DEFERRED       | DEFERRED       | PASS
       5 | VISITING_HOME_TOWN   | DEFERRED       | DEFERRED       | PASS
       6 | CALL_ME_BACK         | DEFERRED       | DEFERRED       | PASS
       7 | HEALTH_IS_NOT_GOOD   | DEFERRED       | DEFERRED       | PASS
       8 | OUT_OF_STATION       | DEFERRED       | DEFERRED       | PASS
       9 | BUSY_CANNOT_COME     | DEFERRED       | DEFERRED       | PASS
      10 | CALL_DID_NOT_CONNECT | NOT_REACHABLE  | NOT_REACHABLE  | PASS
      11 | SWITCHED_OFF         | NOT_REACHABLE  | NOT_REACHABLE  | PASS
      12 | WRONG_NUMBER         | WRONG_NUMBER   | WRONG_NUMBER   | PASS
      13 | NOT_INTERESTED       | NOT_INTERESTED | NOT_INTERESTED | PASS
```

**P2 — unknown disposition rejected; the group cannot be written.**

```
PROBE 2a PASS: not_null_violation - the total CASE yields NULL for an unknown disposition
PROBE 2b PASS: cannot insert a non-DEFAULT value into column "status_group" (SQLSTATE 428C9)
PROBE 2c PASS: column "status_group" can only be updated to DEFAULT (SQLSTATE 428C9)

   attname    | attnotnull | attgenerated | has_expression
--------------+------------+--------------+----------------
 status_group | t          | s            | t
```

Note on which error fires: Postgres evaluates the generated expression before the
`disposition_status` CHECK, so an unknown disposition raises `not_null_violation` (23502) on
`status_group`, not `check_violation` (23514). The row is still rejected — the contract's
"Rejected / CHECK violation" outcome holds — but the SQLSTATE differs. The `disposition_status`
CHECK is still present and enforces the 13-value set independently.

**P3 — the three unique constraints (3/3 PASS).**

```
PROBE 3a PASS: unique_violation on dialer_assignments_contact_id_campaign_id_key
PROBE 3b PASS: unique_violation on dialer_call_logs_assignment_id_attempt_key
PROBE 3c PASS: unique_violation on dialer_callers_program_id_user_id_key

                    conname                    |        tbl         |               def
-----------------------------------------------+--------------------+----------------------------------
 dialer_assignments_contact_id_campaign_id_key | dialer_assignments | UNIQUE (contact_id, campaign_id)
 dialer_call_logs_assignment_id_attempt_key    | dialer_call_logs   | UNIQUE (assignment_id, attempt)
 dialer_callers_program_id_user_id_key         | dialer_callers     | UNIQUE (program_id, user_id)
```

**P4 — the six ON DELETE RESTRICT foreign keys (6/6 PASS).** Each delete was attempted
against a history-bearing parent.

```
PROBE 4a PASS: foreign_key_violation on dialer_assignments_contact_id_fkey
PROBE 4b PASS: foreign_key_violation on dialer_assignments_caller_id_fkey
PROBE 4c PASS: foreign_key_violation on dialer_assignments_campaign_id_fkey
PROBE 4d PASS: foreign_key_violation on dialer_call_logs_caller_id_fkey
PROBE 4e PASS: foreign_key_violation on dialer_callers_user_id_fkey
PROBE 4f PASS: foreign_key_violation on dialer_survey_questions_campaign_id_fkey

                 conname                  |           tbl           |                                     def
------------------------------------------+-------------------------+------------------------------------------------------------------------------
 dialer_assignments_caller_id_fkey        | dialer_assignments      | FOREIGN KEY (caller_id) REFERENCES dialer_callers(id) ON DELETE RESTRICT
 dialer_assignments_campaign_id_fkey      | dialer_assignments      | FOREIGN KEY (campaign_id) REFERENCES dialer_campaigns(id) ON DELETE RESTRICT
 dialer_assignments_contact_id_fkey       | dialer_assignments      | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT
 dialer_call_logs_caller_id_fkey          | dialer_call_logs        | FOREIGN KEY (caller_id) REFERENCES dialer_callers(id) ON DELETE RESTRICT
 dialer_callers_user_id_fkey              | dialer_callers          | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
 dialer_survey_questions_campaign_id_fkey | dialer_survey_questions | FOREIGN KEY (campaign_id) REFERENCES dialer_campaigns(id) ON DELETE RESTRICT
```

**P5 — privileges by role (6/6 PASS).**

```
PROBE 5b PASS: anon holds no privilege on any dialer table
PROBE 5c PASS: authenticated holds SELECT and nothing else on all 7 dialer tables
PROBE 5d PASS: no application role holds DELETE on any dialer table
PROBE 5e PASS: anon INSERT denied - permission denied for table dialer_campaigns
PROBE 5e PASS: anon UPDATE denied - permission denied for table dialer_campaigns
PROBE 5e PASS: anon DELETE denied - permission denied for table dialer_campaigns
PROBE 5f PASS: authenticated INSERT denied - permission denied for table dialer_campaigns
PROBE 5f PASS: authenticated UPDATE denied - permission denied for table dialer_campaigns
PROBE 5f PASS: authenticated DELETE denied - permission denied for table dialer_campaigns
```

The full grant table (21 rows) shows `authenticated` → `SELECT`, `service_role` →
`INSERT,SELECT,UPDATE`, `postgres` (owner) → everything, and no `anon` row at all.

**P6 — cross-program RLS visibility (4/4 PASS).** Run as `SET ROLE authenticated` with
`request.jwt.claim.sub` set to each fixture staff member's `auth.uid`; one campaign,
one caller and one assignment existed per program.

```
      who      | campaigns_folk | campaigns_gita | assignments_folk | assignments_gita | callers_folk | callers_gita
---------------+----------------+----------------+------------------+------------------+--------------+---------------
 folk_preacher |              1 |              0 |                1 |                0 |            1 |            0
 gita_preacher |              0 |              1 |                0 |                1 |            0 |            1
 folk_admin    |              1 |              0 |                1 |                0 |            1 |            0
 folk_volunteer|              0 |              0 |                0 |                0 |            0 |            0
```

Wrong-program SELECT returns zero rows — it does not error.

**P7 — Preacher/Assistant contact-linked scope.** With one contact assigned to the folk
Preacher and one assigned to another preacher:

```
    who    | my_contact_visible | other_visible
----------+--------------------+---------------
 assistant |                  1 |             0
```

The Assistant sees their preacher's contact assignment (1) and not the other (0).

**P9 — clean contact-scope control.** The P7 Preacher row was not a clean control: the
seeded fixture's second folk contact is assigned to the folk Admin, but the P7 probe had
also assigned it to the folk Preacher's *own caller row*, so the "own caller" policy
legitimately made it visible. Re-run with the two assignments on two different caller
profiles — the Preacher's own row for their contact, and a Volunteer's row for the other:

```
      who      | own_contact_visible | other_contact_visible | campaigns_visible | callers_visible
---------------+---------------------+-----------------------+-------------------+-----------------
 folk_preacher |                   1 |                     0 |                 1 |               2
 folk_volunteer|                   0 |                     1 |                 1 |               1
```

The Preacher sees their own contact's assignment (1) and the other contact's (0); the
Volunteer, who is an own caller, sees only their own queue (0 and 1 respectively) and only
their own roster row (1). Each role sees exactly one campaign — the one they hold an
assignment in.

**P8 — the assignable set helper.**

```
      who      |          assignable_emails
---------------+-------------------------------------
 folk_admin    | {kavitha.raman, anand.narayanan, divya.parthasarathy, suresh.kannan}@folk.fixture.test
 folk_preacher | {anand.narayanan@folk.fixture.test}
 folk_assistant| {suresh.kannan@folk.fixture.test}
 folk_volunteer| {}

                  who                  |          assignable_emails
---------------------------------------+-------------------------------------
 folk_preacher (volunteer deactivated) | {anand.narayanan@folk.fixture.test}
```

Admin sees the whole program; the Preacher sees only themselves (their seeded fixture has
no assignees); the Assistant sees only themselves; a Volunteer sees nothing; and a
deactivated caller profile drops the Preacher's Volunteer assignee from the set.

### Scope note — `lib/supabase/types.ts` was not written (resolved in the `server` layer)

The story's Code Map and Tasks list `lib/supabase/types.ts` for regeneration, but that path
was **outside the schema layer's ALLOWED SCOPE** (which covers `supabase/migrations/**`,
`supabase/seed.sql`, the RLS matrix, and `spec-autodialer/stories/**`). The types were
therefore regenerated to a temp file outside the repo:

```
pnpm dlx supabase@2.98.2 gen types typescript --local > /tmp/dialer-types.ts
```

That output contains all seven dialer table types (`dialer_assignments`, `dialer_call_logs`,
`dialer_callers`, `dialer_campaigns`, `dialer_contact_profiles`, `dialer_survey_options`,
`dialer_survey_questions`) with `Row`/`Insert`/`Update`/`Relationships`.

**Resolved in the `server` layer** (commit `bec5ea4`, "feat(server): service layer"), whose
ALLOWED SCOPE covers `lib/supabase/**`. The types landed as a reviewed diff, not a blind
overwrite. Two corrections to the caveat the schema layer recorded for that follow-up:

- The local database **does** have an `airtable_id_map` table (migration
  `20261008000000_add_airtable_id_map.sql`). A fresh regeneration against the local stack
  reproduces it, so the table's absence in the schema layer's temp file was an artifact of
  that layer's database state, not a schema difference. It is now present in the committed
  types.
- The generator omits the `__InternalSupabase` header block that the committed file had
  carried since `4e3dd47`. The omission is cosmetic and harmless: `postgrest-js@2.105.1`
  reads `__InternalSupabase` only through a conditional type (`Database extends
  { __InternalSupabase: infer I } ? I : {}`) that falls back to `{}` when the key is absent,
  and the only `Database` consumer in the repo (`lib/authz.ts:58`) indexes
  `Database["public"]["Tables"]["users"]["Row"]` directly. `pnpm typecheck:workspace` passes.

The regeneration was re-run against the local stack and the output is byte-identical to the
committed `lib/supabase/types.ts`.

## Spec Change Log

## Review Triage Log

## Verification

**Commands run (this layer):**
- `pnpm supabase:push && pnpm seed:local` — **PASS.** "Remote database is up to date." followed by the seeder's "Total created: 0" and "DW-3 check passed: every public.users.id equals its auth.users.id; all fixture staff are Active." (The migration was applied earlier, from a clean `pnpm supabase:reset`; every migration in the chain re-applied without error and without any identifier-truncation notice.)
- `pnpm test:static` — **PASS.** "Monorepo guardrails passed."; all 6 workspace typecheck projects Done; ESLint "✖ 16 problems (0 errors, 16 warnings)" — the warnings are pre-existing and in files this layer did not touch.
- `pnpm dlx supabase@2.98.2 gen types typescript --local > /tmp/dialer-types.ts` — **PASS**, exit 0. Output holds all seven dialer table types. NOT written to `lib/supabase/types.ts` — that path is outside this layer's ALLOWED SCOPE (see the scope note above).

**Follow-up in the `server` layer (commit `bec5ea4`):**
- `pnpm dlx supabase@2.98.2 gen types typescript --local > lib/supabase/types.ts` — **PASS**, landed as reviewed diff. Byte-identical to fresh generation against the local stack. Contains all seven `dialer_*` table types plus `caller_assignable_user_ids` function signature; `airtable_id_map` present; `__InternalSupabase` header omitted (cosmetic, harmless, see scope note).

**Manual checks:**
- Local `psql` only, every probe inside a transaction that was rolled back: the 13 mappings, the unknown-disposition rejection, the generated-column write refusal, the three UNIQUE constraints, role privileges, the six RESTRICT FKs, cross-program SELECT isolation, contact-linked scope, and the assignable set helper. Outputs are recorded under Implementation Notes above. No probe row persists in the database.
- `pnpm test` was **not** run (zero tests, exits 0) and no e2e was run — there is no UI yet, and per the repo's testing contract the e2e suite would prove nothing about this schema.
