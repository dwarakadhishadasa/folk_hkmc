# Analysis — Campaign workspace, 2026-11-04

## Product snapshot

FOLK HKMC is the program-operations monorepo for the FOLK Chennai and Gita Life
web apps. The stack is Next.js 16 App Router, pnpm + Turborepo, Supabase for
staff auth and data, shadcn/ui over program colour tokens, Vitest for the unit
layer and Playwright for the e2e suite.

The Campaign section has six routes:

| Route | Surface |
|---|---|
| `/campaigns` | Overview: stat tiles, status filter, campaign list |
| `/campaigns/new` | Campaign details and a browser-staged survey, one `Create campaign` action |
| `/campaigns/[campaignId]/assign-contacts` | Campaign workspace: details, survey, weighted assign-to pane, contact grid; a COMPLETED campaign reads as a report |
| `/campaigns/callers` | Caller roster |
| `/campaigns/reports` | Reports |
| `/campaigns/assignments` | Phone-only caller queue |

The flow is create → workspace (survey, assignment) → `Start campaign` → callers
work the queue → the campaign closes at its end date → report.

At the time of this analysis the working tree carries an uncommitted change that
restructured the campaign page into the scrolling two-pane workspace from design
frames 212 → 324: campaign details and the call-outcome survey on the first
screen, the weighted assign-to pane on the left and the grid on the right below
them. The survey is always visible; the earlier slide-over panel is gone.
Unrelated theme edits are also uncommitted and were not touched.

Existing WDS context: `_bmad-output/specs/spec-autodialer/`, the FOLK Campaign
design set in `_bmad-output/E-Assets/page-designs/campaign.figcraft`, the
weighted-assign alternate, `_bmad-output/D-Design-System/00-design-system.md`,
and `_bmad-output/_progress/00-design-log.md`.

## Improvement targets

Prioritized by impact on the campaign surface and the effort each requires.

| # | Target | Impact | Effort |
|---|---|---|---|
| 1 | **Ungated campaign workspace** — remove the `Create campaign` action; a new campaign opens with details, survey, assign-to and grid already present | Removes the last setup gate; matches the two-pane design's "one screen" intent | Medium — needs a draft-creation decision and removal of the staged-survey path |
| 2 | **Draft lifecycle** — a draft created by the un-gated flow needs a discard or cancel path | Prevents abandoned drafts lingering until their end date | Medium — write API plus a list action |
| 3 | **Decompose `assign-contacts-select.tsx`** — 1,085 lines covering selection, precheck, preview, write, conflict dialog and column definitions | Reduces change risk in the most-edited campaign surface | Medium |
| 4 | **Campaign wireframe/motion gap** — the phone dialer queue motion and the offline-queue state have no wireframe | De-risks the caller surface before further work | Medium |
| 5 | **Contacts section implementation** — the `/contact` overview and reports from their spec | Highest product value, but outside this campaign cycle | High |

## Selected target

**#1 — Ungated campaign workspace.**

Rationale: the campaign page already shows details, survey, assignment and grid
in one document once the campaign exists, so the only remaining gate is the
pre-id create step. Removing it completes the intended screen rather than adding
a new one. #2 is the enabling decision for #1, not a separate cycle: an un-gated
page must decide when the row is created and what an operator can do if they
abandon it. The two are scoped together.

Out of scope for this cycle: the 1,085-line assign component refactor (#3), the
dialer wireframe pass (#4) and the Contacts section (#5).

## Open decisions for scoping

1. When is the campaign row created — on the `New campaign` action, on a first
   edit, or on an explicit save that is not the page-level `Create campaign`?
2. What happens to a draft the operator abandons (discard action, automatic
   cleanup, or leave it until its end date)?
3. Does the call-outcome survey stay a live builder on the first render, or does
   a pre-id page still stage questions in the browser?
4. Does `Start campaign` remain the draft's only lifecycle action while
   assignment is already allowed?

## Next action

Scope the change as a Phase 8 scenario (`[S] Scope Improvement`), resolving the
four decisions above before implementation.
