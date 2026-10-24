# Design coverage — `campaign.figcraft`

**Authority.** The current `_bmad-output/E-Assets/page-designs/campaign.figcraft` is the final UI authority. It has three pages and 25 top-level frames: References (9), Desktop — Campaign (7), Mobile — Campaign (9). The separate `Mobile — Dialer` page was dropped intentionally; its caller states are integrated into `Mobile — Campaign`. The older `campaign-design-set-summary.md` and `preview/dialer/*` exports describe the retired 18-frame, four-page set and are historical evidence, not authority.

**Precedence.** The design wins on layout, navigation, labels and visible states. This spec wins on capabilities, data, security and backend behaviour. A required state that the design does not show is a **design omission**, not a descope; see the coverage matrix.

## Frame inventory

### Desktop — Campaign

| ID | Frame | What it settles |
|---|---|---|
| 32 | Campaign — Campaigns (light) | Campaign nav pill, Overview/Callers/Reports sub-nav, five stat cards including Confirmed, campaign table with `CANCELLED`, no row actions |
| 212 | Campaign — New campaign & survey (light) | Name, description, end date, a required `Status?` survey question with fixed options, a Notes question, Add question, Next |
| 324 | Campaign — Assign contacts (light, desktop only) | Contact grid, desktop-only fine-grained selection, weighted multi-caller split (5/3/1/1 → 60/36/12/12 of 120), conflict warning, `Assign 120 contacts` |
| 645 | Campaign — Callers (light) | Roster, invite path, all-roles copy, active/inactive, deactivation means refusal at disposition write |
| 790 | Campaign — Reports (light) | Four-bucket funnel with amber Never attempted, outcome mix, leaderboard disclaimer, recent activity, Export CSV |
| 961 | Campaign — Campaigns (dark) | Dark-theme parity for 32 |
| 1141 | Campaign — Reports (dark) | Dark-theme parity for 790 |

### Mobile — Campaign

| ID | Frame | What it settles |
|---|---|---|
| 1752 | Campaign (phone) — Overview | Admin stats, active campaign cards, Campaign bottom-nav item; title opens the Campaign menu |
| 1968 | Campaign (phone) — Reports | Mobile funnel and leaderboard, Export CSV |
| 2068 | Campaign (phone) — Overview (dark) | Dark-theme parity for 1752 |
| 2217 | Campaign (phone) — Menu | Overview / Assignments / Callers / Reports navigation |
| 2263 | Campaign (phone) — Assignments | Caller call card: campaign context, progress, Queue entry, phone + Copy, history, `Call Priya` |
| 2360 | Campaign (phone) — Queue | Queue list: `showing 12 of 487`, session counts, current `← you`, tap a row to jump |
| 2456 | Campaign (phone) — Disposition | `How did it go?`, required Status chips, Notes, `Save & continue` |
| 2639 | Campaign (phone) — Callers | Mobile caller roster |
| 2737 | Campaign (phone) — Assignments | Second call-card state for Sanjay K; the call-button label still reads `Call Priya` (prototype defect) |

## Coverage matrix

| Capability / state | Design evidence | Status |
|---|---|---|
| CAP-1 volunteer queue access | 1752, 2263, 2360 | UI covered; scope/security remains spec-owned |
| CAP-2 campaign + survey | 212 | **Partial** — no target-audience control and no gap-duration control visible; only an end date |
| CAP-3 contact universe | not in this design | Out of scope of the Campaign surface; remains the Manage/contacts feature |
| CAP-4 caller roster | 645, 2639 | **Partial** — roster and status shown; all staff roles confirmed; invite dialog not shown; Import roster is out of v1 |
| CAP-5 batch assignment + conflicts | 324 | Covered; weighted multi-caller split is now part of the capability |
| CAP-6 call session | 2263, 2360 | **Partial** — missing on-the-call / I'm back, Skip, Pause, gap countdown, campaign-switch notice, session summary and re-queue |
| CAP-7 disposition | 2456 | **Partial** — missing separate call outcome, conditional follow-up, campaign survey, save receipt, save-failed/paused, queued-offline state |
| CAP-8 reporting + export | 32, 790, 1968, 961, 1141 | Covered on desktop; mobile omits outcome mix and recent activity; mobile also omits Confirmed |
| CAP-9 intuitive by default | all | **Partial** — no empty states and no resume-session affordance; onboarding coach marks are not a spec requirement |
| Single-session / cross-tab refusal | none | **Design omission** — architecture requires a loud refusal |
| Deactivated caller / reassignment 403 | 645 copy only | **Design omission** — the disposition screen needs the failure state |
| Campaign cancelled | 32 shows `CANCELLED` | Not a required v1 session screen; new queues exclude cancelled campaigns, and an active snapshot must fail loudly if it writes |
| Offline disposition queue | none | **Open question**, not a requirement until decided |

## Required omissions to restore

These are required by the capability contract or by `architecture.md`; the current design does not show them.

1. **On-the-call / “I'm back”** — the call card has no state after `tel:` handoff.
2. **Skip and Pause** — CAP-6 requires both from every live state; the current call card and Queue show neither.
3. **Gap countdown** — the call button must be gated by the campaign gap, with a readable countdown.
4. **Campaign-switch notice** — awaited, pauses the gap, blocks the next call until dismissed.
5. **Separate outcome, follow-up and survey** — the current `Status` list mixes outcomes and follow-up statuses; the data model requires `call_outcome`, conditional `follow_up_status` and campaign survey answers.
6. **Save receipt and save-failed/paused** — persistent `Saving…`, `Saved 12:04`, `Save failed — session paused`; answers kept.
7. **Session summary and re-queue** — counts, `closed after N attempts`, eligible re-queue, attempt cap.
8. **Empty states** — no campaigns, no assignments, empty queue, all with an actionable next step.
9. **Resume session** — after tab loss, return to the same contact and keep the in-flight disposition.
10. **Queued-offline receipt** — `Queued — will send` when the Background Sync path accepts the write, never a false `Save failed`.
11. **Cross-tab refusal, deactivated caller and reassignment 403** — loud, explicit failure states.

## Design-only or not required

- **Coach marks / onboarding tour** — CAP-9 is an outcome, not a mandated mechanism; validate with an untrained caller instead.
- **Safe-area insets** — implementation detail; pin the call/save actions above the phone's bottom chrome.
- **Attempt badge in the queue** — the summary needs attempt counts; the queue does not.
- **Queue-item phone/location/history** — the current list shows name and status; the call card carries the detail. This weakens the “read the next person during the gap” promise but is not a capability failure.
- **Campaign-cancelled modal** — not required if a cancelled campaign disappears from new queues and an active write fails loudly.

## Design defects and stale evidence

- Frame 2737 shows Sanjay K but the primary button still reads `Call Priya`; the label must follow the current contact.
- Mobile Overview and Reports omit the Confirmed stat that desktop shows; either add it or state that mobile reporting is a reduced view.
- The separate `Mobile — Dialer` page was dropped intentionally; its caller states are integrated into `Mobile — Campaign`. The summary's 18-frame/four-page description is retired, and `preview/dialer/*` is historical.
- `Import roster` is out of v1 and the control must be removed.
- All staff roles can be callers: Admin, Preacher, Volunteer and Assistant. The design copy is confirmed, not a defect.

## Open questions

1. How does the `Status?` list map to `call_outcome`, `follow_up_status` and survey answers?
2. Is `Status?` fixed on every campaign, or free-form? That decides the source of the Confirmed metric.
