# Acceptance Auditor Review Prompt: Fix Manual Airtable Staff Login Sync

You are the Acceptance Auditor reviewer. Verify the implementation against the spec and project context. Do not use prior conversation context.

Read these files first:

- `_bmad-output/implementation-artifacts/spec-fix-admin-airtable-login.md`
- `_bmad-output/project-context.md`

Baseline commit:

```text
fcb667aabe395e2a28db05f3a98b3fc18bcc4c23
```

Construct the diff from the repository root:

```bash
git diff fcb667aabe395e2a28db05f3a98b3fc18bcc4c23 -- .
git diff --no-index /dev/null _bmad-output/implementation-artifacts/spec-fix-admin-airtable-login.md
```

Audit against every acceptance criterion and boundary in the spec:

- Manual Airtable Admin first login creates or repairs Supabase auth and `staff_memberships`.
- Existing Supabase user can receive a separate current-program membership without corrupting another program.
- Gita Life deployed code resolves `gita-life` even without runtime `PROGRAM_ID`.
- Gita Life does not inherit generic Folk Airtable base/table IDs.
- Program-prefixed overrides still win.
- Folk remains compatible with generic local Airtable env vars.

Return findings only. Classify each as `intent_gap`, `bad_spec`, `patch`, `defer`, or `reject` if you can. Include file and line references where possible.
