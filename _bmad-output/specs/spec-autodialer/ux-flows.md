# UX flows — the intuitiveness contract

The source app's real quality is not its data model, it is twenty-odd small decisions that make a volunteer phone call while looking at a screen. Those decisions are the thing worth porting. Each pattern below is stated as what it does, where it came from, and how it survives — or improves on — the move to a browser.

**Final UI authority.** The current `campaign.figcraft` wins on layout, navigation and visible states. This file wins on the capability behaviours the design must still express. Where the design does not show a required state, that is a design omission recorded in `design-coverage.md`, not a descope. The caller surface is a phone; the desktop is the admin surface. The separate `Mobile — Dialer` design page was dropped intentionally; its caller states are integrated into `Mobile — Campaign`.

CAP-9 is the capability this file serves: an untrained volunteer finishes a whole campaign, and no admin task is more than one click from anywhere.

## 1. The disposition problem — the overlay's replacement

**Source.** The phone app backgrounds when the Android dialer opens, so the survey lives in a system overlay window floating above the dialer, with a durable JSON side-channel so answers survive a lost event.

**The move.** The caller surface is a phone PWA. `tel:` hands off to the OS dialer; the caller's tab survives and coming back is one app switch. On return, the caller presses **I'm back** and lands on a dedicated disposition screen. The current design's frame 2456 is the first pass at that screen; it omits the separate outcome, follow-up and survey fields, and the save receipt. Those are required, not optional.

**The rule that replaces the overlay**: the disposition is a dedicated screen, never a floating window, never a dialog, and never buried behind a second route. The save receipt is always visible on it: `Saving…`, `Saved 12:04`, `Queued — will send`, or `Save failed — session paused`. A queued write is a success state, not a failure. A failed save is loud and **pauses the session** rather than discarding the answer.

**The overlay's genuine win — never losing your place — is recovered by the queue (§2), not by a floating window.** The queue shows who you are calling, who is next, and everyone after; the call card keeps the current contact's history and phone number on screen.

## 2. The queue — always show the whole queue, not just the next

**Source.** `displayIndex` pre-empts to the next contact while the gap timer runs, with a live progress bar and a persistent campaign banner. The entire card — name, number, campaign banner, progress bar — swaps to the next person. There is no "who am I on the phone with" on screen, and the progress counter reads `2 /10` before contact 1 has been called.

**Why the source's version is wrong.** It is disorienting at the moment the caller can least afford confusion. And during the gap, tapping the number you are reading redials the *next* contact, because the handler reads the current index, not the displayed one.

**What replaces it.** The call card is the unit of the session, and the queue is one tap away:

- On the phone, the call card carries a **Queue** entry. The queue opens over the card as a full-screen drawer/list with the current row marked `← you`, the next row immediately below it, and everyone after that.
- Tapping any row jumps to that contact. The queue is not a read-only preview; it is the navigation surface.
- On desktop there is no caller queue. The desktop Campaign surface is for admin work only.

The current design's frame 2360 is the queue. It shows `Showing 12 of 487`, the session counts, and a tappable list. That is the right shape.

**The three properties this buys**, none of which the source had:

1. **You always know where you are.** Current and next are visible in the queue, and the call card keeps the current contact anchored.
2. **You can see what's coming**, so the gap is spent reading the next person rather than waiting to find out who is up.
3. **You can jump.** Anything in the queue is reachable, so "skip" is never the only way to move.

**The queue is a virtualised window, not a list.** A realistic queue is 300–500 contacts, not 5 — the source app handled 1,817 members. The queue renders a bounded window around the current row with the rest as `Showing 12 of 487`, scrolls to follow the session, and stays keyboard-navigable. Full list rendering would be a half-second of jank on every advance, which is the one thing that must not happen while someone is mid-conversation.

**The layout is phone-first.** The call card is full width; the queue opens over it. The phone's own chrome competes for the bottom of the screen, so the call button pins just above it. The disposition is its own screen, not a panel beside the card.

This is the single largest intuition gain in the port: the caller can see the whole queue without losing the current contact. The desktop no longer offers a side-by-side rail because the desktop is not a calling surface.

## 3. The loop — call, come back, record, next card

**The decided flow** (`calling-mechanism.md`): press the button → the native phone app opens with the number → the caller talks → they navigate back → **I'm back** → the disposition screen → **Save & continue** opens the next contact card.

**Source.** Four controls in a row — Pause/Resume, Skip, Call Now, Next Call — where "Call Now" silently means *skip to next* while the timer runs, "Skip" crashes on the last contact (no bounds check), and both skip paths discard the current disposition without writing anything.

**What changes here.**

- **One primary action per phase, and its label states the consequence.** `Call Priya` → `I'm back` → `Save & continue` → `Next call in 14s`. No button whose meaning changes invisibly.
- **"I'm back" is a real button**, because nothing can detect call end. It is the honest replacement for `phone_state` detection, and the source's substitute for it — an app-lifecycle `resumed` handler — fired for unrelated reasons and started the gap timer even when no call had happened.
- **The number is copied to the clipboard on every call**, so a phone browser that cannot open `tel:` still has the number one paste away. The source app lost calls silently here: `_makeCall` returned with no feedback when a number was empty.
- **The next card opens immediately after saving, and the gap gates the call button, not the navigation.** This keeps the source app's best pacing idea — reading the next person while waiting — while never forcing a caller to sit through a countdown before they can read.
- **Pause and Skip live in the call-card header**, always present, always bounded. Skipping writes `SKIPPED`; it never drops the contact silently. The current design does not show either control; that is a required omission.
- **The disposition is its own screen**, not a panel that must stay beside the card. The current design's frame 2456 is the starting point; it must add the missing outcome, follow-up, survey and receipt states.

**The card is the unit of the session**, and it carries the history the caller needs so they do not have to remember the last conversation:

```
   ┌── call card ─────────────────────────────────────────────┐
   │  Priya R                       [Skip]        [Pause]     │
   │  +91 98401 23456  [Copy]                 Hindi · L2      │
   │                                                         │
   │  PREVIOUS                                               │
   │  12 Aug · No answer · tried twice · no follow-up set    │
   │  03 Aug · Answered · Not interested · "shift timings"   │
   │                                                         │
   │            ┌──────────────────────────────┐              │
   │            │      📞  Call Priya           │  ← pinned   │
   │            └──────────────────────────────┘              │
   │  Hindi · Level 2 · Anna Nagar                            │
   └─────────────────────────────────────────────────────────┘
```

Three rules for that history panel, because "relevant" is doing real work:

1. **It is read-only and it is contact-scoped, deliberately across campaigns.** The caller sees this contact's prior calls anywhere in the program — never another contact's, and never a general contacts read. Notes are therefore written knowing that a future caller assigned this contact may read them.
2. **It is the last N entries, not all of them.** A contact with forty calls does not push the call button off the screen.
3. **It sits directly above the call button.** History a caller has to scroll to find is history that shapes no conversation.

## 3a. The summary, and the recall

**What happens when the queue empties.** It does not just end — it reports what was achieved and offers the one action that turns an unlucky contact list into a second pass:

```
   ┌───────────────────────────────────────────────┐
   │  Session complete                             │
   │                                               │
   │   18 called    11 reached    7 no answer      │
   │   3 wrong number   2 skipped early           │
   │                                               │
   │   7 people were not reachable.                │
   │                                               │
   │   [ Re-queue those 7 and continue ]           │
   │   [ Done — back to my queue ]                 │
   └───────────────────────────────────────────────┘
```

**Why the recall is the important half.** A contact who was busy at 7pm is not a contact who declined — treating them as finished and closing their assignment loses them permanently, and the campaign looks complete when it is not. Re-queueing returns those assignments to `PENDING` so the next session picks them up, which is what a second pass actually means.

Two boundaries keep this from becoming an infinite loop:

- **Re-queue does not bump `attempt`**; the next call log is the next attempt. There is a per-campaign **attempt cap** (default 3). Past the cap the contact leaves the queue and shows in the summary as *closed after N attempts* rather than vanishing.
- **A reached contact is never re-queued by this button.** Only `CALL_DID_NOT_CONNECT` and `SWITCHED_OFF` — the `NOT_REACHABLE` group — are eligible. A wrong number is corrected through contacts; a deferral is recorded and completes the assignment, and does not re-queue in v1.

The current design does not contain the summary screen. That is a required omission, not a reason to drop the capability.

## 4. Controls that cannot wedge the session

**Source.** Pause/Resume, Skip, Call Now, and a colour-differentiated "Next Call" fast-forward for bailing out of a stuck call. Five-second gap presets with the selected one checked. Gap presets `[5, 10, 20, 30, 60]`, default 20.

**Survives**, as a **constraint on the design**: the queue must never depend on telephony state, so nothing can wedge a session. Skip is always available, is always bounded, and always resolves the current assignment to a written state rather than dropping it. Pause is always available and reads as a normal state, not an error.

Two corrections carried from the source's defects:

- **Skipping writes.** `SKIPPED` exists in the schema and is written by no code in the source app. Here it is written, or the caller is asked whether to record an outcome first.
- **The gap timer derives from elapsed time, not a decrementing counter.** A backgrounded tab throttles `setInterval`; a countdown driven by `Date.now()` against a target stays honest.

The presets stay `[5, 10, 20, 30, 60]` with 20 selected. The source had three disagreeing ranges — DB `5–3600`, client clamp `300`, UI offers `60` — and a campaign gap that no admin screen could set. Here the range is `5–300`, the admin can set it, and a value outside the preset list still renders as the current value rather than as *no selection*.

The current call card and Queue show neither Skip, Pause nor a gap countdown. Those are required omissions.

## 5. Campaign-switch notice

**Source.** When the next assignment belongs to a different campaign, a modal names the incoming campaign and its date before continuing.

**Survives**, with one correction: in the source the dialog is fired without `await` and the next line dials immediately, so **the phone starts ringing while the modal is still fading in**, and the dropped future lets dialogs stack. Here the notice is awaited, the gap countdown pauses, and the next call cannot begin until it is dismissed.

A silent campaign change mid-queue is how a volunteer ends up pitching the wrong event to someone.

The current design has no campaign-switch frame. That is a required omission.

## 6. Conflict-aware assignment

**Source.** Before writing anything, the UI pre-checks existing assignments and returns a readable orange snackbar naming every conflict: `"{Name} is already assigned to {Caller}"`. Warned but not blocked — the rest of the batch is assigned anyway.

**Survives**, and strengthens. The database carries the uniqueness constraint, so conflicts are enforced rather than merely warned about. And because the unique key is `(contact_id, campaign_id)` rather than the source's three-column triple, assignment is a **move** — reassigning a contact does not silently accumulate a second row.

**The final design adds weighted multi-caller assignment.** On desktop, the admin selects contacts, adds one or more callers, gives each a weight, and sees the resulting contact count before writing. Only the unassigned contacts are distributed: `N = selected − already assigned`. Each caller gets `floor(N × weight ÷ total weight)`; leftovers go one at a time to the largest remainders, ties by higher weight then list order. Counts always add up to exactly N. Weights are a UI distribution rule; the database persists the resulting per-contact assignments, never the weight.

Conflicts are presented as a readable list the admin acts on, not a raw uniqueness violation. The design's `5 selected contacts are already assigned and will be skipped` warning is the right shape; the button count is the count that will actually be assigned. The fine-grained grid is desktop-only; the phone admin surface does not reproduce it.

## 7. Pagination-aware bulk selection

**Source.** `Showing X–Y of N`, `Select Page`, `Clear All (n)`, and a **"+ N hidden selected"** indicator when a selection spans pages. Page size 50.

**Survives unchanged**, and it matters more here: `folk_hkmc` holds ~1,030 contacts and every PostgREST read caps at 1,000 rows, so paging is not a nicety but a correctness requirement.

The hidden-selection indicator is the load-bearing detail — drop it and the admin assigns the wrong people. The source also builds its filter facet options from the **current page's 50 rows**, so the "Center" dropdown changes as you paginate; facets here derive from the whole set.

The current desktop Assign frame shows `125 of 272 selected` and `12 hidden on other pages`; that is the required pattern.

## 8. Zero-friction caller onboarding

**Source.** Two modes in one dialog: *From Contacts* (search existing people, promote on assign) and *Add Manually*. Auto-promotion to caller on first assignment. If no campaign exists, one is auto-created so the admin is never blocked.

**Survives**, with two necessary changes:

- **There is no dialer invite.** Callers are existing staff users; the Callers screen is a roster, not a creation surface. An eligible staff user is promoted to a calling profile on first assignment, and that is all — there is no invite, add or import control. Adding a person is the app's single staff invite path (`upsertStaffUser` → `sendStaffInviteEmail` → `writeInviteLog`), outside the Campaign surface; the dialer never creates a `public.users` or `auth.users` row. A contact who is not yet staff must be invited through the core path first; the picker says so rather than offering a control that cannot work.
- **The auto-created campaign is dropped.** The source silently created a `"FOLK Camp Campaign"` whenever none existed, so an admin was never blocked but also never knew what they were assigning into. A blocked admin with a one-click empty state — "No campaigns yet · Create one" — is clearer than a silent default.
- **A created campaign is not live.** It opens in `DRAFT`; the admin sees one **Start campaign** action on the campaign detail. Starting is what puts its pending assignments into callers' queues. Survey editing and assignment are allowed while `DRAFT`, so the campaign can be prepared before it goes live. Complete and Cancel are explicit actions too; a completed or cancelled campaign is terminal in v1 and never returns to a queue by accident.
- **Navigation follows the caller profile, not the role label.** Admin, Preacher and Assistant see Campaign because it is their admin entry; they see Assignments only when they have an active `dialer_callers` profile. A Volunteer sees Campaign only when they are an active caller; otherwise the item is absent, not a 403. An Assistant who cannot correct a wrong number sees **“Ask an Admin or Preacher to correct this number”** rather than a control that leads to `/manage` and fails.

The source's `contact.is_enabler` boolean alongside a `role` column — two sources of truth for the same question, one of them written as a string into a boolean — does not come across. One column.

The final design's Callers copy says “All roles can be callers”. That is confirmed: Admin, Preacher, Volunteer and Assistant can all hold a `dialer_callers` profile. A Preacher's roster and assignment picker contain only the staff assigned to them, plus themselves; an Assistant's contain their preacher's assignees, plus themselves. The `Import roster` control is out of v1 and has been removed from the design; callers are existing staff users promoted on assignment, and adding a person is the core invite path.

## 9. Progressive detail, flat summary

**Source.** The calling dashboard shows a name, a big call button and an outcome dropdown, with ~10 profile fields in an accordion.

**Survives unchanged.** The caller needs the phone number, the name, and the outcome control. Everything else is one tap away. Putting 30 profile fields above the outcome dropdown would bury the one thing the caller is there to do. The final call card shows the number, Copy, history and the call button; the extra profile fields stay out of the way.

## 10. Conditional fields — the survey only when there was a conversation

**Source.** Every disposition screen shows all six outcomes and all seven follow-up statuses to every caller, always, regardless of what happened on the call. The `is_required` asterisk is rendered and never enforced.

**What changes.** The design's 13-chip Status list is the whole selector and the stored data model — one `disposition_status`, with `status_group` generated from it. **The campaign survey appears only when the call reached a conversation**, meaning a group other than `NOT_REACHABLE` or `WRONG_NUMBER`. For a call that did not connect, a survey answer is not information; it is a decision about a conversation that never happened. Notes always render, and the `*` required marker is actually enforced or not rendered at all.

The current design's single Status list is therefore the data model, not an omission. What the design omits is the campaign survey below it, which is a required addition and is tracked in `design-coverage.md`.

## 10a. Questions are retired, never deleted

Once a campaign has calls logged against it, a question's answers are **history**. Deleting the question cascades to `dialer_survey_responses` and destroys them silently.

So the builder offers **Retire** rather than Delete for any question with responses. A retired question keeps its rows, stops appearing in the builder and in new dispositions, and its historical answers still resolve and still export. Deletion stays available only for a question with zero responses, and it says so.

## 11. Feedback that confirms, and empties that act

**Source.** Skeleton loaders, progress bars, medal leaderboard, and empty states with actionable copy — "Type to search existing contacts", "Drag fields or tap (+) at bottom-right to add", "No pending contacts to call in the current view."

**Survives unchanged.** The empty states are the clearest expression of the bar: never say "No data", say what to do next. The source also has places that fail silently — a save failure that pauses the session with no message, a `debugPrint` where an error should surface, a silent return when a phone number is empty. Silence is the thing to design against.

The status pill is also worth noting: the source renders `SESSION PAUSED` in red next to a red dot, so a paused session looks like an error. Paused is a normal state and reads as one.

The current design has no empty states, no save receipt, no queued state and no paused state. Those are required omissions; the empty state for a volunteer with no assignments must say what to do, not just show zeroes.

## 12. Answer with buttons, not typing

**Source.** The assistant emits a `json:choice` fenced block rendered as chips; tapping one injects and auto-sends the answer. Rules force ambiguous campaign/caller names to resolve into clickable choices rather than a typed reply.

**Survives**, and is the best idea in the source codebase. CAP-10 is deferred, but the chip pattern is kept for tool disambiguation when it ships, and for any future place the product must resolve "which campaign did you mean" without making the user type.

## 13. Race and staleness guards

**Source.** Monotonic request ids before every `setState`, so fast typing cannot paint stale rows; exact counts rather than estimated ones.

**Survives** and matters more here — the assignment and roster screens are search-heavy and the contacts table is large. Counts are exact, and a slow response is discarded rather than painted over a newer one.

## 14. Server-side search with dynamic facets

**Source.** Filters computed from the dataset rather than hardcoded.

**Survives**, with the facets deriving from real program data (`centre`, `level`, `gender`, `language` — the four fields on the `dialer_contact_profiles` extension) rather than from the loaded page.

## The bar, stated once

> Nothing in this feature may require the user to know something the screen could have told them. No dead ends, no silent failures, no modal that asks for something already on the page, and no flow longer than the task deserves.

## Where intuition is deliberately traded away

The source app's phone-number normalisation is duplicated across three files, its secondary text colour is identical to its primary, its "clear all" counter is computed from the pre-clear value, and its presets, DB constraint and client clamp disagree about the same number three ways. Those are cost-of-carrying decisions a browser build does not inherit: normalise in one shared helper, make hierarchy visible, and compute every display value from state the user can see. Porting a defect is not parity.

The final design also trades away the desktop side-by-side queue and the always-visible disposition panel. That is deliberate: the caller surface is a phone, the queue is one tap away, and the disposition is a dedicated screen. The capability guarantees — save receipt, no lost answers, skip/pause, campaign-switch notice, summary and re-queue — are not traded away; they are the omissions the design still has to express.
