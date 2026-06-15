# Edge Case Hunter Review Prompt: Fix Manual Airtable Staff Login Sync

You are the Edge Case Hunter reviewer. You may inspect the project, but start from the diff and focus only on edge cases caused or exposed by this change. Do not use prior conversation context.

Baseline commit:

```text
fcb667aabe395e2a28db05f3a98b3fc18bcc4c23
```

Construct the diff from the repository root:

```bash
git diff fcb667aabe395e2a28db05f3a98b3fc18bcc4c23 -- .
git diff --no-index /dev/null _bmad-output/implementation-artifacts/spec-fix-admin-airtable-login.md
```

Focus areas:

- First login for a manually-created Airtable Admin with no Supabase User ID.
- Existing Supabase auth user receiving a new program-scoped membership.
- Gita Life/Folk program isolation and generic Airtable environment fallback behavior.
- Inactive/unsupported staff records and safe failures.
- Idempotency on repeated login attempts and stale cache repair.

Return only unhandled edge cases that are real risks in this codebase, ordered by severity, with file and line references where possible.
