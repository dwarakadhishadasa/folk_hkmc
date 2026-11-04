# Scenario — Ungated campaign workspace

## Target

Remove the pre-id create step from the Campaign section so a new campaign opens
directly on the full workspace — details, call-outcome survey, weighted assign-to
pane and contact grid — with no `Create campaign` action and no second screen to
unlock assignment.

## Current state

- The Overview's `New campaign` action opens `/campaigns/new`: campaign details
  and a browser-staged survey. There is no assign-to pane and no grid.
- `Create campaign` posts the campaign, then posts the staged questions one by
  one and replaces the URL with `/campaigns/<id>/assign-contacts`.
- Only after that does the operator see the assign-to pane and the grid. Until
  then, assignment is impossible because there is no campaign id.
- The campaign workspace itself already shows all four panes (details, survey,
  assign-to, grid) and its details autosave; only the create step is gated.

## Desired state

- `New campaign` creates one DRAFT campaign and opens
  `/campaigns/<id>/assign-contacts`.
- The workspace renders with all four panes visible and usable on arrival:
  details autosave, the survey is the live builder, the assign-to pane and grid
  accept work immediately.
- The campaign starts with the placeholder name `Untitled campaign` and an end
  date thirty days after the programme day. Both are edited in the details card.
- `/campaigns/new` and the `Create campaign` action are gone.
- `Start campaign` remains the only lifecycle action. Draft abandonment is
  deferred to the next cycle (target 2); until then an abandoned draft stays in
  the list until its end date.

## User journey

1. On `/campaigns`, the operator activates `New campaign` (header or empty
   state), or the equivalent action on Reports or the Dashboard pipeline card.
2. The app creates a DRAFT (`Untitled campaign`, end date = programme day + 30)
   and navigates to its workspace.
3. The operator renames the campaign; the name saves on blur. The end date
   saves when a day is picked. The survey `Add question` writes immediately.
4. The operator ticks contacts in the grid, adds callers to the assign-to pane,
   sets weights and assigns in the same view.
5. `Start campaign` in the head moves the campaign to ACTIVE when the operator
   is ready. Assignment is already allowed while DRAFT.
6. If the operator abandons the draft, it stays in the list with the placeholder
   name until the next cycle adds a discard action.

## Success criteria

- One activation of `New campaign` lands on a workspace where the details
  fields, the `Call-outcome survey` region, the `Assign to` region and the
  contact grid are all present without a further click.
- No `Create campaign` button and no `/campaigns/new` form remain; the Reports
  and Dashboard entry points still create a draft.
- The details autosave and the survey writes against the new campaign id on the
  first render — no staged-survey path remains.
- `Start campaign` still works from the workspace head; starting is not a
  prerequisite for assignment.
- `pnpm typecheck:workspace`, `pnpm test:static`, `pnpm test:unit` and
  `pnpm test:e2e:campaign` are green; the campaign creation e2e asserts the
  four panes on arrival.

## Scope

**Pages**

- `/campaigns` — header and empty-state action become a create-and-open control.
- `/campaigns/new` — no form; the URL redirects to the Overview so old links
  still land somewhere useful.
- Reports and the Dashboard pipeline card — their `Create a campaign` entry
  points use the same create-and-open control.

**Components**

- New `NewCampaignButton`: posts a DRAFT with the placeholder name and default
  end date, then pushes to the workspace.
- Delete `NewCampaignForm` and `CampaignSurveyDraft`; they exist only for the
  pre-id screen.
- `CampaignWorkspace`, `CampaignSurveyBuilder`, `AssignContactsSelect` and
  `CampaignAssignHeader` need no structural change.

**API and data**

- No new endpoint and no schema change: the existing
  `POST /api/dialer/admin/campaigns` creates the draft.

**Risk: Medium.** The change writes on navigation (an abandoned click leaves a
draft). Draft abandonment is accepted for this cycle and recorded as target 2.
The alternative — creating only on a first valid edit — was rejected because it
would show a disabled grid, lose a selection on the URL swap, and keep two
survey modes.

## Out of scope

- Draft discard and abandonment handling (target 2, next cycle).
- The `assign-contacts-select.tsx` decomposition (target 3).
- Dialer wireframe/motion work (target 4).
- The Contacts section (target 5).
- Any change to `Start campaign` semantics.
