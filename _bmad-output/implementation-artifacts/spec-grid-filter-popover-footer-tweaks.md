---
title: 'Filter popover footer — drop the footer rule and quiet the two footer actions'
type: 'refactor'
created: '2026-10-19'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-contacts-premium-grid/stories/6-the-filter-conditions-popover-with-per-field-type-operators.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The filter popover's footer reads as a second form region rather than as quiet actions on the list above it. A `border-t` hairline cuts it off from the conditions, and `+ Add condition` is set in brand royal with an underline hover — the loudest control in the surface — beside a `Clear all` that is plain muted text. The two do not read as a pair.

**Approach:** Remove the footer's rule and nothing else; the header keeps its `border-b`. Give both footer actions one shared treatment: `ghost`, `font-semibold`, muted at rest, no hover fill — and on hover the label goes white in the dark theme and `--foreground` in the light theme, because white against the light popover (`--popover: #ffffff`) is invisible. Story 6's AC-D3 and its e2e assertion describe the old surface, so both move with it.

</frozen-after-approval>

## Implementation Notes

**The light-theme hover is mine, not the request.** Dwaraka's answer was "I am talking about the dark theme" for `hover:text-white`. Applied unqualified, that renders white on the light `bg-popover` (`#ffffff`, `globals.css:52`) — invisible on hover in the default theme. Resolved as `hover:text-foreground dark:hover:text-white`: white where he asked for it, and `#24324a` in light. Note this is the same value ghost's own `hover:text-accent-foreground` already gives in light, so light does not actually change; only dark does. Flagged at the checkpoint for veto.

**No hover fill needs the `dark:` variant spelled out.** `ghost` fills with `hover:bg-accent` (light `#f2f2f2`) and `dark:hover:bg-accent/50` (dark `#dde0e4`). Those are two different variant scopes, so `hover:bg-transparent` alone leaves the dark fill standing; `dark:hover:bg-transparent` is required and is not redundant. `cn()` is `twMerge(clsx(...))` (`lib/utils.ts`), so the later class wins within each variant scope — no `!` modifier, matching `grid-toolbar.tsx:227`.

**`gap-1` is kept on both buttons rather than dropped from Clear all.** A single shared class string is what makes "matched" true by construction; `gap-1` on a one-child flex is inert.

**The footer keeps its 24px gap.** `mt-3 pt-3` measured 12 + 12 = 24px above the footer's content; with the rule gone, `pt-3` has nothing to pad, so the gap moved to `mt-6` (24px) and the pair's position is unchanged.

**Story 6's AC-D3 is marked superseded, not deleted.** This repo's convention (see `SPEC.md:201`, `epics.md:220`) is that a reversed decision keeps its historical text so a later reader cannot conclude it was never a concern.

**Files changed:** `components/grid/grid-filter-popover.tsx`, `e2e/specs/grid-filter-conditions.spec.ts`, `_bmad-output/specs/spec-contacts-premium-grid/stories/6-the-filter-conditions-popover-with-per-field-type-operators.md`.
