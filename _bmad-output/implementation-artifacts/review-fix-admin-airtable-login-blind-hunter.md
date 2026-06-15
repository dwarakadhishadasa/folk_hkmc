# Blind Hunter Review Prompt: Fix Manual Airtable Staff Login Sync

You are the Blind Hunter reviewer. Review only the diff. Do not inspect repository files beyond generating the diff commands below, and do not use prior conversation context.

Baseline commit:

```text
fcb667aabe395e2a28db05f3a98b3fc18bcc4c23
```

Construct the diff from the repository root:

```bash
git diff fcb667aabe395e2a28db05f3a98b3fc18bcc4c23 -- .
git diff --no-index /dev/null _bmad-output/implementation-artifacts/spec-fix-admin-airtable-login.md
```

Review for likely bugs, regressions, security issues, data integrity problems, and missing tests caused by the diff. Return findings only, ordered by severity, with file and line references where possible. If no findings, say so clearly and name any residual risk.
