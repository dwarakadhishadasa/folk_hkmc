---
title: 'CSV export of the same numbers'
type: 'feature'
created: '2026-10-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The reports screen can show the campaign's result, but there was no way to take the same numbers away. The source app's export header promised a `call_duration` the product never records.

**Approach:** `GET /api/dialer/admin/campaigns/[campaignId]/export` reads `campaign_progress` with the same staff context and scope as the page, renders the same four sections as a CSV, and returns it with a filename. The reports control fetches that route and only saves a file after a successful response.

## Boundaries & Constraints

**Always:**
- The export is the page's one read: `getCampaignProgress` and `buildCampaignReportCsv`.
- The same `getStaffContext()` → `requireCampaignAdmin` → `campaignScope` path applies; a Preacher's or Assistant's file cannot contain another scope's rows.
- The file carries the funnel, all six outcome groups, the caller rollup and the recent-activity rows.
- Values carrying a comma, quote or newline are quoted; a quote doubles.
- A failed export is a named JSON error with no `Content-Disposition`; the control paints the message and saves nothing.
- Paged reads in the feature use `lib/supabase/paging`, which concatenates pages and throws loudly when its budget is exhausted.

**Never:**
- No `call_duration` column, no client-side recomputation, no second progress read.
- No empty file returned as success.
- No new runtime service or scheduled job; the export is request-time.

</frozen-after-approval>

## Code Map

- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/export/route.ts` — the scoped CSV response.
- `lib/dialer/reports.ts` — `buildCampaignReportCsv`, the section order, escaping and file name.
- `lib/dialer/reports.test.ts` — sections, zero groups, order, escaping, no `call_duration`.
- `lib/supabase/paging.ts` — the shared pager; `lib/dialer/scope.ts` now consumes it instead of a private copy.
- `lib/supabase/paging.test.ts` — full-page concatenation, loud truncation, read-error mapping.
- `components/campaign/reports/report-toolbar.tsx` — fetch, content-type check, blob download and the visible failure.
- `e2e/specs/campaign-export.spec.ts` — Admin file, Preacher scope, unauthenticated refusal, named failure.
- `e2e/specs/dialer-route-sweep.spec.ts` — the export route's denial-sweep row.

## Human Decisions

1. **The CSV is sectioned, not one wide table.** Funnel, outcome mix, rollup and activity answer different questions with different columns. A blank line separates four titled tables; forcing one header would invent columns that mean nothing for two of them.
2. **`campaign_progress` returns one payload.** The export therefore has no PostgREST page to concatenate. The shared pager is still the only paged-read implementation in the feature, and `lib/dialer/scope.ts` was moved onto it so the 1,000-row rule has one home. A 1,000+ row export is covered by the pager's unit tests, not by fabricating a second read path.
3. **The download is a fetch, not a link.** A plain link would save whatever the server returned, including an error body or an empty file. The control reads the status and JSON error first, then creates the blob URL.
4. **The file name is ASCII and derived from the campaign name.** A name that strips to nothing falls back to `campaign-report.csv`; the header is always an attachment.

## Verification

**Commands run:**
- `pnpm test:static` — PASS, exit 0. Guardrails passed (22 dialer routes covered), six typechecks Done, ESLint 0 errors.
- `pnpm test:unit` — PASS. 20 root tests including the CSV and pager suites; package tests 2/2 tasks successful.
- `pnpm test:e2e campaign-export` — PASS, **8 tests**, 32 s.
- `pnpm test:e2e dialer-route` — PASS, **112 tests**, including the new export sweep row.
- `pnpm test:e2e campaign-` — PASS, **92 tests**, 7.3 min.

**Not run:**
- `pnpm test:e2e:determinism` — deferred to Story 4.2.
- No 1,000+ row export fixture: the RPC payload is aggregate and the pager's limit is unit-tested instead.

**Unproven:**
- A real browser download dialog; the spec checks the response contract and the control's error branch, not the OS save dialog.
