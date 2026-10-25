# Diagrams

All diagrams for this spec live here. SPEC.md holds prose only.

**Design authority.** The current `campaign.figcraft` wins on layout and visible states. These diagrams define the required state machine and system shape; where the current design omits a state, that is a design omission tracked in `design-coverage.md`, not a descope.

## 1. System shape

Where the new pieces attach to the existing `folk_hkmc` architecture.

```
   Admin / Preacher                        Caller (any staff role)
        |                                        |
        v                                        v
+---------------------------+        +----------------------------+
| Campaign (admin)         |        | /campaigns/assignments     |
|  create - assign - report |        |  queue - pace -            |
|  desktop only             |        |  disposition - receipt     |
| campaign payload resolved |        |                            |
| server-side in page.tsx   |        | queue payload resolved by  |
+------------+--------------+        | one route handler          |
             |                        +-------------+--------------+
             |                                      |
             +--------------------+------------------+
                                  | fetch()
                                  v
        +-----------------------------------------------+
        |  app/api/dialer/**/route.ts                   |
        |                                               |
        |  getStaffContext()  ->  requireRole()         |
        |  assertCallerInScope()  <- the security edge   |
        |  try/catch -> authzErrorResponse()            |
        +-------+----------------------------+----------+
                | reads                      | writes
                v (RLS-scoped)              v (service role)
   +----------------------------+   +-------------------------------+
   | contacts (scoped SELECT)   |   | dialer_campaigns              |
   | public.users               |   | dialer_callers                |
   +----------------------------+   | dialer_assignments            |
                                    | dialer_call_logs              |
   writes also: service role,       | dialer_survey_questions       |
   behind assertXInScope            | dialer_survey_options         |
                                    | dialer_survey_responses       |
                                    | dialer_contact_profiles       |
                                    | -- RLS via caller_role() /    |
                                    |    caller_program_id()        |
                                    |                               |
                                    | + record_call_disposition()   |
                                    |   ONE transaction: call log   |
                                    |   + responses + assignment    |
                                    +-------------------------------+
                                  ^
                                  | existing
                    +-------------+--------------+
                    | sessions - attendance      |  <- same identity, same
                    | contacts - public.users    |    staff rows
                    +----------------------------+

                    +------------------------+
                    | Native phone dialer    | <-- tel: link
                    |  (a human always       |      (see
                    |   places the call)     |       calling-mechanism.md)
                    +------------------------+

    Boundaries that are load-bearing:
      1. Nothing but route handlers touches the database.
      2. The browser never talks to a telephony provider.
      3. A caller never receives a general contacts read - only an
         already-scoped queue. assertCallerInScope() is the whole of
         that boundary, so it gets direct e2e coverage.
      4. The session timer, queue and pause state live in the browser.
         No server-side session, so no webhook can ever wedge a queue.
```

Two surfaces, because `folk_hkmc` already separates admin work from caller work: `/manage` is gated `requireRole(["Admin","Preacher"])`, and the `contacts` RLS policy has no caller term, so a caller cannot reach contacts through the portal at all. See `architecture.md` §1.

## 2. Caller session state machine

The decided loop (`calling-mechanism.md`): press the button → the native phone app opens with the number → the caller talks → they navigate back → the survey is asked → submission opens the next contact card.

The queue must never wedge. Every transition is reachable from the UI alone, and **the phase is carried by one primary action whose label names it** — the source app's four controls, two of which silently meant "skip".

```
                        start session
                             |
                             v
                      +---------------+
                      |     READY     |  "Call Priya"
                      |  queue +      |  card shows contact, history,
                      |  history      |
                      +-------+-------+
                              |  tel: handoff + number copied
                              v
                      +---------------+
                      |  ON THE CALL  |  "I'm back"
                      | nothing in the|  <- no browser API observes a
                      | browser can   |    tel: call; this is the honest
                      | observe this  |    replacement
                      +-------+-------+
                              | caller returns and says so
                              v
                      +---------------+
                      |  DISPOSITION  |  one 13-chip status; notes
                      |               |  always; survey appears ONLY
                      |               |  when the status reached a
                      |               |  conversation (survey only)
                      +--+---------+--+----------------+
            save ok      |         | offline accepted | save failed
                         v         v                  v
                  +-----------+  +----------------+  +----------------+
                  | PERSISTED |  | QUEUED         |  | SAVE_FAILED    |
                  | Saved 12:04| | Queued — send  |  | loud + paused  |
                  +-----+-----+  +-------+--------+  +-------+--------+
                        |                | retry on           | retry
            +-----------+----------------+--------------------+
            v                                      |
   +------------------+                             |
   | SKIP (no call)   |  writes SKIPPED, never drops|
   +--------+---------+                             |
            |                                       |
            +-------------------+-------------------+
                                v
                     +---------------------+
                     |  NEXT CARD OPEN     |  opens immediately so
                     |  full card readable |  the caller reads the
                     |  during the gap     |  next person while
                     +----------+----------+  waiting
                                |
                     gap runs on the CALL BUTTON,
                     not on navigation
                                |
                +---------------+---------------+
                |                               |
         gap expires                      caller skips ahead
                |                               |
                +---------------+---------------+
                                v
                      +---------------+
                      |     READY     |
                      +-------+-------+
                              |
                    last item? yes
                              v
                      +---------------+
                      |    SUMMARY    |  counts + outcomes, exit
                      +---------------+
```

Invariants:

1. **One primary action per phase, and its label states the consequence.** `Call Priya` / `I'm back` / `Save & continue` / `Next call in 14s`. No button whose meaning changes invisibly — the source's "Call Now" meant *skip* whenever the timer happened to be running.
2. **Skip and pause are always available** from any live state — no telephony dependency, no modal traps, and no unbounded index. The source's "Skip" had no bounds guard and threw on the last contact.
3. **A failed save never discards an answer.** It pauses the session, says so, and keeps the answers. The source set `_paused = true` with no message at all.
4. **The explicit save is idempotent and atomic.** One RPC writes the call log, its responses and the assignment status together; the `(call_log_id, question_id)` unique constraint makes a retry safe. The source's per-row insert loop could strand a caller with a half-written record and no way forward.
5. **The gap timer derives from elapsed time**, not a decrementing counter — the tab is backgrounded for the whole of every call and a backgrounded tab throttles `setInterval`.
6. **The card you return to is the card you left.** Position is restored from the URL and a re-fetch, never from a `static` field, so answers cannot land on the wrong contact.
7. **The queue is one tap away**, and the current and next contacts are visible in it. The caller surface is a phone, so the queue is a full-screen drawer/list over the call card; the desktop does not run a caller session.

## 3. Assignment conflict flow

CAP-5, and the reason the database carries the uniqueness constraint.

The constraint is `unique (contact_id, campaign_id)` — **not** the source app's three-column `(contact_id, enabler_id, campaign_id)`. With the triple, reassigning a contact to a different caller creates a *second* row rather than moving the first, so one contact could sit with two callers at once and the app only noticed on the next screen, via the "already assigned to" snackbar. Dropping `caller_id` from the key makes assignment a **move**, and makes the conflict a real constraint rather than a warning about an accident the schema permitted.

```
   admin selects N contacts
             |
             v
    pick campaign + caller
             |
             v
    +---------------------------+
    | pre-check: which of the N |--> any conflicts?
    | already have an assignment|    (by contact_id + campaign_id)
    +---------+-----------------+
              | yes
              v
    +---------------------------+
    | name every conflict:     |--> admin decides:
    | "X is assigned to Y"     |    skip them / move them / cancel
    +---------+-----------------+
              | no conflicts, or confirmed skip/move plan
              v
    +---------------------------+
    | write                     |--> all-or-nothing; failure -> roll back,
    |                           |    report rows BY NAME; no partial success
    +---------+-----------------+
              |
              v
      assignments written
      contact promoted to caller
      if needed (auto-promote)
```

## 4. What the browser cannot do

The dropped source-app capabilities, and what replaces each one.

```
  x  Android floating overlay         ->  phone call card + queue drawer
      (needs a window above an app)       + dedicated disposition screen

  x  phone_state CALL_STARTED/ENDED   ->  explicit "I'm back" action
      (needs CALL_PHONE permission)       (nothing observes a tel: call)

  x  device dialer integration        ->  plain tel: link
      (flutter_phone_direct_caller)

  x  programmatic dial-out             ->  deferred; see calling-mechanism.md
      (provider + job queue + scheduler)

  x  call recording / transcription    ->  non-goal

  x  arbitrary SQL from the assistant  ->  named tools, validated server-side
      (run_dynamic_sql over the DB)      (CAP-10 deferred)

  x  public member RSVP page           ->  cut; disposition_status already
      (RLS was USING (true), incl. anon)  records what RSVP recorded
```

## 5. Caller scope — the boundary that must not leak

A caller must never see another caller's queue, nor a general contacts read. This is the one place where a shortcut becomes a data leak over ~1,030 members' phone numbers.

```
   caller session requests assignment X
                |
                v
   +-----------------------------------------+
   | assertCallerInScope(staff, assignmentX) |
   |                                         |
   |  dialer_assignments -> dialer_callers   |
   |  WHERE assignment.caller_id = caller.id |
   |    AND caller.user_id = staff.userId    |
   |    AND caller.program_id = staff.programId |
   |                                         |
   |  caller id comes from getStaffContext(), |
   |  NEVER from the request body            |
   +----+--------------------+---------------+
        |                    |
   found & mine         not found / not mine
        |                    |
        v                    v
   queue payload        404 for both cases.
   returned only       NEVER a partial row and
   already scoped      never an existence oracle.
```

Two properties make this hold:

- **The browser never learns an id it was not given.** The queue arrives as one scoped payload, so there is no "give me contact #418" path to probe with.
- **The id in the URL is the attack surface, so it is tested directly.** A caller requesting another caller's assignment id gets `404` with no payload, covered by e2e — an assertion that exists only in app code and is never exercised is not a boundary.