---
id: SPEC-grid-keyboard-editors-and-theme
companions:
  - keyboard-model.md
  - editor-catalog.md
  - theme-contract.md
  - existing-state.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete contract for what to build and validate.

# Grid keyboard completeness, typed editors, and a light/dark switch

## Why

`_bmad-output/specs/spec-manage-dashboard-grid/` built the `/manage` grid. Stories 1 and 2 landed the primitives and the contacts port; **story 2 is `done` as of `3c7bfc1`**. What exists today is a real virtualized grid with a text-only editor and a partial keyboard model.

The gap is specific and was verified by grep, not inferred. Absent from `components/grid/`:

- **Arrow keys, `Tab`, `Shift+Tab`, `Home`/`End`.** `use-grid-keyboard.ts` handles `j`, `k`, `e`, `Enter`, `Escape` and nothing else. No `ArrowDown` string appears in the module.
- **Type-to-edit, `Delete`/`Backspace` clear, `Space` toggle.** No printable-key branch, no clipboard code.
- **Clipboard.** No `clipboard` identifier anywhere in `components/grid/`.
- **Cell range selection.** No shift-key handling; `focusedColumnId` is a single string.
- **Add record / delete row.** No `addRow`/`deleteRow` in `components/`.
- **Typed editors.** Only `name`, `phone`, `notes` are `editable`, and all three are plain text accessors. There is no select, multi-select, date, currency, URL, email, user, or long-text editor. `GridColumnMeta` has no `editor` field. The screenshot the user supplied shows an inline select dropdown and a resize tooltip — the dropdown does not exist here.
- **Column virtualization.** Rows only.

Separately, the app has a dark theme that is **never activated**. `next-themes` is a dependency, `components/theme-provider.tsx` exists, `apps/*/app/globals.css:78` defines a complete `.dark` block, and `@custom-variant dark (&:is(.dark *))` is declared — but `Providers` (`components/providers.tsx:12`) does **not** mount `ThemeProvider`, neither `layout.tsx` sets `suppressHydrationWarning`, and no `setTheme` call exists anywhere. `grep -rn "setTheme" components/` returns nothing. The theme is defined and dead.

## Capabilities

- **CAP-1** — Spreadsheet key navigation
  - **success:** Arrow keys move the focused cell across rows and columns; `Tab`/`Shift+Tab` commit and advance; `Home`/`End` jump to row ends; the focused cell scrolls into view.

- **CAP-2** — Direct-manipulation keys
  - **success:** Typing a printable character on a selected cell opens the editor seeded with that character; `Delete`/`Backspace` clears the value through the normal commit path; `Space` toggles a checkbox cell.

- **CAP-3** — Clipboard
  - **success:** `Cmd/Ctrl+C` copies the selection, `Cmd/Ctrl+V` pastes it, and a paste into an editable cell commits through the existing revertable write path.

- **CAP-4** — Cell range selection
  - **success:** `Shift+click` and `Shift+Arrow` extend a rectangular range from an anchor; `Escape` collapses it back to the anchor; the range is distinguishable from the single focused cell.

- **CAP-5** — Typed editors
  - **success:** Each editor type renders its own control inside the cell, commits a typed value, and validates before commit. Every editor is registered once in the primitive and consumed by column metadata.

- **CAP-6** — Row lifecycle
  - **success:** "Add record" appends a blank row and focuses its first editable cell; deleting a row asks for confirmation and reports the outcome per row the way the existing bulk action does.

- **CAP-7** — Light/dark theme
  - **success:** `ThemeProvider` is mounted per the shadcn recipe, a toggle switches the theme and persists across a reload, and the grid is legible in both.

- **CAP-8** — Scope preservation
  - **success:** Every capability added here remains table-agnostic: zero `Manage*`, `/api/manage` or contacts vocabulary under `components/grid/`.

## Constraints

- **Extend, do not fork.** `components/grid/` is a primitive consumed by four tables. `SPEC-manage-dashboard-grid.md:74` forbids a parallel implementation. Every addition lands in the existing modules; `components/grid/grid.tsx` grows a keyboard branch, not a second grid.
- **The commit path is reused, never bypassed.** `use-grid-keyboard.ts` already owns draft, optimistic display and visible revert. A typed editor supplies *input parsing and validation*; it does not get its own write path. A new editor that calls `fetch` directly is a defect.
- **One `onCellCommit` per write.** Typed editors must not add a second mutation channel.
- **Registry, not a switch statement.** Editors are looked up by an `editor` key on `GridColumnMeta` through a typed registry. A new editor is a new registry entry, not a new branch in the cell renderer.
- **`GridColumnMeta` stays presentation-only.** It describes how a cell looks and is edited. It never carries a value.
- **Keyboard must not steal text input.** The existing `isGuardedTarget` guard is the model: container keys are inert while a draft, input, textarea or `[contenteditable]` has focus. This applies to the new keys identically.
- **`event.preventDefault()` on `e` is load-bearing** and the reason is recorded at `use-grid-keyboard.ts:423`. Every new key that opens an editor needs the same call, or the key both opens the editor and types itself.
- **Theme work follows the shadcn recipe the user named:** `next-themes` `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`, plus `suppressHydrationWarning` on `<html>`. `components/theme-provider.tsx` already exists and needs no rewrite.
- **Both apps must stay byte-identical where they already are.** `apps/folk` and `apps/gita-life` `layout.tsx` and `globals.css` mirror each other; edits land in both.
- **Grid colors stay semantic.** Zero occurrences of a raw hex or a `white`/`black` literal under `components/grid/` today and that must remain true — it is what makes CAP-7 a token question rather than a rewrite. `components/manage/` already has `text-white` and `hover:bg-black/5` on program-primary headers; those are in scope for the theme story, the grid is not.
- **Verification.** `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`, and `pnpm test:e2e`. Per `AGENTS.md`, `pnpm test` runs zero tests, CI does not run e2e, and `pnpm build` is not a type gate. One runner at a time — the suite shares one seeded database.
- **`scripts/verify-monorepo-guardrails.mjs` must not be edited**; `scripts/verify-airtable-removal.mjs` asserts its contents.

## Non-goals

- No undo/redo, saved views, grouped rows, linked records, formula fields, or CSV export — all already out of scope upstream and untouched here.
- No multi-user or realtime collaboration.
- No change to the Supabase schema or RLS.
- **No column virtualization.** Noted as missing, deliberately excluded: it interacts with the sticky header, the frozen run and `columnOrder` in ways that need their own spec, and no table here has enough columns for it to matter.
- The `/manage` per-table routes, loader split and remaining table ports (stories 3–6 of the upstream spec) stay where they are.

## Success signal

An operator on `/manage` selects a cell with the mouse, presses `→`, types `Ravi` and presses `Enter` — the value appears immediately and survives a reload. They select three rows' `Status` cells with `Shift+↓`, copy, and paste the value into one `Status` cell. They click a `Status` cell and pick `Follow up` from a popover anchored to that cell. They toggle the theme and the grid stays legible, hairline borders intact, no shadows, no stripes. Every one of those flows is a committed Playwright spec, and `grep -rn "dark:" components/grid/` is still zero.

## Assumptions

- `next-themes@0.4.6` is already installed at the workspace root and resolves for both apps. **Verified** against `package.json:96`.
- A complete `.dark` token block already exists in both `globals.css` files. **Verified** — `apps/folk/app/globals.css:78`, 31 tokens.
- The editor set can be built on primitives already in `components/ui/`: `select`, `popover`, `command`, `calendar`, `checkbox`, `textarea`, `input`. **Verified** — all present.
- Contact data can supply users for a person selector (`payload.staffNames`) and a location list (`payload.locations`). **Verified** — both already feed `accessorFn` columns in `manage-contacts-table.tsx`.
- Browser clipboard permission for `Cmd+C` in Playwright requires a granted `clipboard-read`/`clipboard-write` context permission. Treated as an implementation detail of the spec, not a blocker.

## Resolved questions

- **Dark vs light is not a conflict.** The user's prompt says light surface; the screenshot is dark; `design-constraints.md` forbids shadows and stripes. Resolution: neither wins. All three agree that density, hairline borders, no drop shadows and no alternating stripes hold in *both* themes, and CAP-7 makes light/dark a switch rather than a choice. `design-constraints.md`'s prohibitions are theme-independent and remain binding.
- **Editor set scope.** The user listed ten editor types. All ten ship; none are stubs. `editor-catalog.md` records which contact column exercises each one so the set is demonstrable against real data rather than a preview fixture.
- **Copy/paste format.** Tab-separated text, matching what a spreadsheet expects, so copy out of the grid pastes into one and vice versa. Range selection is what makes this meaningful; CAP-4 precedes CAP-3 in delivery for that reason.

## Decisions this spec rests on

- **Stories build in dependency order and each is independently shippable:** range selection → keyboard completion → typed editors → row lifecycle → theme. The theme story is last because it is the only one that can be verified visually against a fully populated grid; verifying it earlier would grade a half-built surface.
- **The theme toggle goes in the app shell, not the grid toolbar.** It is an app-level control, `components/theme-toggle.tsx`, consumed by the shared header. The grid consumes it by being legible, not by owning it.
