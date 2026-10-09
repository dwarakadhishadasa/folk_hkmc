---
status: 'blocked'
---

# Light/dark theme switch and grid legibility in both

## Auto Run Result

Status: blocked

Blocking condition: intent gap (plus a dirty working tree).

### Evidence

**1. Dirty working tree.** `git status --porcelain` is non-empty and the changes
belong to story 5, which is marked `done` in
`stories/5-row-lifecycle-add-record-and-delete-row.md` but was never committed:

```
 M _bmad-output/specs/.../stories/5-row-lifecycle-add-record-and-delete-row.md
M  components/grid/grid.tsx
M  components/grid/use-grid-keyboard.ts
M  docs/manage-grid-pattern.md
M  e2e/fixtures/manage-grid.ts
M  e2e/specs/manage-contacts-row-lifecycle.spec.ts
```

HEAD is `b2a0f67 "feature/story-5-unfinished"`. Story 5's work is uncommitted,
so story 6 would be built on top of an unreviewed, unstaged baseline.

**2. Intent gap — the grid's dark-mode legibility cannot be fixed with the lever
the story names.** The story says: *"confirm that the focus ring, the frozen-run
divider and the destructive cell read at both themes, and adjust alpha rather
than tokens where they do not."*

Token values were read out of `apps/folk/app/globals.css` and resolved to sRGB
in real Chromium (not hand-computed). WCAG contrast of each grid surface against
its own `--card`:

| Grid surface | Where | light | dark | Verdict |
|---|---|---|---|---|
| focus ring (`ring-ring`) | `grid-row.tsx:208` | 14.82:1 | **2.02:1** | fails 3:1 non-text |
| frozen divider + row hairline (`--border`) | `grid-row.tsx:214`, `:176` | 1.27:1 | 1.38:1 | hairline, passes as a divider |
| destructive cell (`text-destructive`) | `grid-row.tsx:209` | 4.77:1 | **1.88:1** | fails 4.5:1 text |

The two failures cannot be reached by alpha. Against a *dark* card, lowering
alpha moves a color **toward** the surface:

```
dark --ring        @1.0  2.02:1     dark --destructive @1.0  1.88:1
dark --ring        @0.9  1.83:1     dark --destructive @0.8  1.60:1
dark --ring        @0.6  1.43:1     dark --destructive @0.6  1.38:1
```

Contrast is monotonically *decreasing* in alpha, so "adjust the alpha" cannot
reach 3:1 (ring) or 4.5:1 (destructive). Nor does any row state rescue them —
`bg-muted/40` (focused) and `bg-muted/50` (hover) make both slightly *worse*
(ring 1.91/1.88; destructive 1.78/1.74). The colors are not on the wrong
surface; the `.dark` token values themselves are too dark.

The measures that would work all require changing something the story forbids:

- **Lighten the `.dark` token values** — `oklch(0.55 0.12 260)` reaches 3.86:1 as
  a ring, `oklch(0.6 0.141 25.723)` reaches 4.44:1 as destructive. This is
  editing `globals.css`, which the story excludes ("adjust alpha rather than
  tokens", and `.dark` is declared correct and complete in `theme-contract.md:7`).
- **Swap the grid to a different token** — `ring-foreground/60` gives 6.1:1 dark
  and 4.82:1 light. But that is a code change in `components/grid/`, and the
  story states the grid must keep zero raw colors and stay token-clean.
- **Defer the legibility half** — mount the provider, toggle, persistence and
  specs (all unambiguous), and record the two contrast failures as a new
  deferred-work entry.

Also stale: `theme-contract.md:36` describes the focus ring as
`bg-ring/60` / `border-ring` "at partial opacity". The focused cell is actually
`ring-ring ring-1 ring-inset` at **full** opacity (`grid-row.tsx:208`); the
`bg-ring/60` and `border-ring/40` classes live on the column resize handle
(`grid-header-cell.tsx:244`) and the editor inputs, not the cell ring. So the
contract's premise for tuning alpha on the ring does not match the code.

Separately worth a decision, not a blocker: `apps/gita-life/app/globals.css:200-205`
sets a hardcoded light `linear-gradient` on `body` immediately after
`@apply bg-background`, so a `.dark` switch changes no page background in
gita-life.

### Questions

1. **Ring and destructive in dark — which lever is authorized?** Lighten the
   `.dark` token values in both `globals.css` (touching a file the story calls
   correct), change grid classes (violating token-clean), or ship the mount plus
   a deferred-work entry?
2. **Should the gita-life `body` gradient and the `components/header.tsx:321`
   mobile-nav `bg-white/95` be in scope?** The story bounds out-of-grid work to
   `/manage` only. Both are white-on-dark leaks that a shipped toggle exposes.
3. **Story 5 is `done` but uncommitted.** Commit it as-is first, or re-run its
   review before story 6 builds on it?