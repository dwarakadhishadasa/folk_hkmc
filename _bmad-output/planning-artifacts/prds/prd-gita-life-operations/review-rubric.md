# PRD Quality Review - HKM Program Operations Portals

## Overall verdict

The PRD is ready for downstream UX, architecture, and epic generation. It now states the central product bets clearly: two branded Next.js Program Apps, one shared Supabase identity/authorization layer, two Airtable Bases as operational sources of truth, and role-aware portals for members/participants, volunteers, preachers/facilitators, and admins.

The remaining risk is not hidden scope; it is explicitly deferred implementation detail. Section 12 captures the decisions that must be resolved before dependent implementation stories are accepted, and the addendum now flags the only important repo-context caveat found during validation: Gita Life route/API ownership was not verified in this workspace.

## Decision-readiness - adequate

The PRD is decision-ready for the product direction. Sections 1, 7, and 8 make the biggest choices explicit: two program-specific operations apps, one shared Supabase project/database, separate Airtable Bases, no combined operations portal app in MVP, and no reuse of existing admin surfaces as the new Program operations foundation.

The document is honest about unresolved implementation decisions. Section 12 converts unresolved items into owned deferred decisions with revisit points and blocking scope, which is much stronger than leaving a generic unresolved-items list in a final PRD.

### Findings

- **medium** Deferred decisions must be carried into architecture and epics (§12) - DD-1 through DD-10 are not blockers to PRD finalization, but several are blockers for implementation acceptance: Airtable schema, staff registry, revocation window, role taxonomy, login method, sensitive-data visibility, and retention. *Fix:* Treat section 12 as prerequisite input for architecture and create explicit prerequisite stories or architecture decisions before dependent implementation stories.

## Substance over theater - strong

The personas and journeys are load-bearing rather than decorative. UJ-1 through UJ-5 map directly to FR clusters: portal entry, personal home, attendance, cohort care, and admin operations. The success metrics validate the main operational promises rather than generic engagement theater: portal access success, attendance throughput, and sync confidence.

The NFRs in section 6 were tightened during finalization so they now describe product-specific constraints: no live Airtable calls on normal auth guards, fail-closed admin behavior on stale sync, mobile 360px support, and observable sync/auth events.

### Findings

- No substantive findings.

## Strategic coherence - strong

The PRD has a coherent thesis: preserve distinct Gita Life and FOLK experiences while sharing identity, data contracts, authorization semantics, and operating conventions. The feature groups serve that thesis consistently. The MVP scope excludes a single combined operations app, complex gamification, immediate Airtable replacement, ICVK admin migration, and cross-program analytics, which keeps the work aligned with the two-app operating model.

Success metrics and counter-metrics reinforce the thesis. SM-1, SM-3, and SM-4 validate trustworthy access, sync, and member portal adoption; SM-C1 and SM-C2 guard against two plausible product harms: optimizing engagement at the cost of privacy or care quality, and crowding public pages with internal portal language.

### Findings

- No substantive findings.

## Done-ness clarity - adequate

Most FRs include verifiable consequences. Examples: FR-2 names the two subdomains; FR-7 requires access revocation within a defined sync window and fail-closed admin behavior; FR-14 names scan outcomes and duplicate handling; FR-22 limits report mixing by explicit cross-program permission.

Some implementation-level acceptance detail still belongs downstream. Admin dashboards, reports, and role management define the correct capability boundaries, but architecture and stories will still need concrete report formats, filters, role policy rules, and sync thresholds.

### Findings

- **low** Admin/reporting FRs still need story-level acceptance detail (§4.7) - FR-19 through FR-22 define useful capability boundaries, but not the exact dashboard widgets, export formats, filters, or role-policy edge cases. *Fix:* During epic/story generation, add acceptance criteria for report format, export fields, filters, permissions, and audit behavior.
- **low** Route naming remains intentionally flexible (§5) - The PRD allows each Program App to use `/`, `/portal`, `/ops`, or equivalent host-based routes. That is acceptable at PRD level, but implementation needs one chosen convention. *Fix:* Architecture should select the final app-local portal route convention before route stories are accepted.

## Scope honesty - strong

Scope is unusually clear for a cross-program operations PRD. MVP inclusions and exclusions are explicit in section 8, deferred decisions are explicit in section 12, assumptions are indexed in section 13, and the decision log records the superseded one-app decision.

The addendum also separates product requirements from technical guidance. It keeps implementation notes out of the main PRD while preserving enough context for architecture.

### Findings

- No substantive findings.

## Downstream usability - adequate

The PRD is usable for UX, architecture, and story creation. It has stable FR IDs, UJ IDs, SM IDs, a glossary, a rollout sequence, and cross-cutting requirements. The addendum provides architecture-relevant notes without contaminating the PRD with mechanism-heavy prose.

One downstream caveat remains: the current workspace did not verify an active Gita Life route or `/api/gita-life` endpoint. This does not break the product PRD, but it is important for architecture intake and repo ownership planning.

### Findings

- **medium** Gita Life public-page ownership is unverified in this workspace (addendum §Current Repo Context) - The PRD assumes public Gita Life and FOLK entry points, but finalization did not find an active Gita Life route or `/api/gita-life` endpoint in this repo. *Fix:* Architecture should confirm whether Gita Life public-page ownership lives in this repo or another HKM site before implementation planning assigns route work.

## Shape fit - strong

The shape fits a chain-top product PRD feeding UX, architecture, and epics. The document uses journeys because this is a multi-stakeholder operational product with meaningful participant, volunteer, care, and admin experiences. It also uses capability-oriented FRs because the product has strong platform and access-control concerns.

The addendum is the right place for the technical operating model: app boundary, Supabase mirror, Airtable integration, Edge compatibility, and future PWA/mobile considerations.

### Findings

- No substantive findings.

## Mechanical notes

- Frontmatter status is `final`, with `updated: 2026-06-11`.
- FR IDs are contiguous from FR-1 through FR-22.
- UJ IDs are contiguous from UJ-1 through UJ-5.
- SM IDs are contiguous for SM-1 through SM-5, with counter-metrics SM-C1 and SM-C2.
- Inline `[ASSUMPTION]` tags round-trip into section 13.
- The decision log records that the original one-app decision was superseded by the two-app decision.
- Addendum repo facts were updated during finalization to avoid stale Next.js, React, Airtable helper, and route/API claims.
