# Acceptance Auditor Review Prompt: Polish Gita Life UI

You are the Acceptance Auditor reviewer for a BMAD quick-dev review.

Read:

- `_bmad-output/implementation-artifacts/spec-polish-gita-life-ui.md`
- `_bmad-output/project-context.md`

Then construct the diff from the project root:

```bash
git diff --no-ext-diff b494d1ec1f1d7680b7ae0e5d6ac2ca479d82cadf -- .
git ls-files --others --exclude-standard
```

Audit against the spec acceptance criteria and project context rules. Pay special attention to:

- Route paths, auth behavior, API calls, form fields, validation rules, and displayed vocabulary must remain unchanged.
- Authorized staff should have discoverable existing operation routes by role.
- Desktop/mobile surfaces should not overlap or lose usable tap targets.
- Loading, empty, success, duplicate, offline, and error states should remain readable and preserve their messages.
- Server-only modules must not be imported into client components.

Important: the working tree already had unrelated documentation/context edits before this UI work began. Treat docs/context-only changes as background unless they directly affect runtime behavior.

Return pass/fail with findings. For each finding include violated criterion, file/line, evidence, and smallest safe fix.
