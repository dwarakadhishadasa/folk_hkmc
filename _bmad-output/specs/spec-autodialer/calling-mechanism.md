# Calling mechanism — decided: human click-to-call

**Decided 2026-10-09. Option A. Not an open question.**

A human places every call. The caller presses a button, the native phone app opens with the number, the caller talks, returns to the browser, and records the outcome. The system never dials, and there is no telephony provider in v1. The caller surface is `/campaigns/assignments` on a phone PWA; the desktop is the admin surface and does not place calls.

This is the shape the source app already used, and it is the right shape here: no provider credentials, no cost, no webhook infrastructure, nothing to secure or configure. `folk_hkmc` has no cron, no job queue and no worker today, and programmatic dial-out would require all three before it could place a single call.

## The loop

```
   ┌──────────────────────────────────────────────────────┐
   │  Contact card — name, phone, relevant history        │
   │                                                      │
   │                    ┌────────────────────┐            │
   │                    │   📞 Call Priya    │  ← bottom  │
   │                    └─────────┬──────────┘            │
   └──────────────────────────────┼───────────────────────┘
                                  │  tel: handoff
                                  │  + number copied to clipboard
                                  ▼
                     ┌────────────────────────┐
                     │  Native phone app       │
                     │  (a human talks)        │
                     └───────────┬────────────┘
                                 │  caller navigates back
                                 ▼
   ┌──────────────────────────────────────────────────────┐
   │  Outcome  +  survey questions                        │
   │  (follow-up fields only when Answered)               │
   │                                                      │
   │                    ┌────────────────────┐            │
   │                    │  ✓ Save & continue  │            │
   │                    └─────────┬──────────┘            │
   └──────────────────────────────┼───────────────────────┘
                                  │  one transaction
                                  ▼
                        next contact card opens
```

## What each part of that loop requires

**"Opens the native phone app with the number copied."** A `tel:` link, **and** the number written to the clipboard as a fallback. On a phone `tel:` hands off to the dialer. If the handoff fails or the browser cannot open the handler, the number is still one paste away. The source app lost calls silently here: `_makeCall` returned with no feedback when a number was empty, and showed a snackbar only when the dialer actually refused.

Copying first means the number is always one paste away even if the handoff fails. It costs nothing and it removes an entire class of silent failure. The desktop is not a calling surface, so the laptop softphone case is out of scope for v1.

**"Navigate back to the app, then the survey questions will be asked."** Nothing can detect that the call ended, so the return is an explicit user action. Two properties matter:

- **The card the caller returns to must be the card they left.** If the tab re-renders into a different contact, the answers go to the wrong person. Session position is restored from the URL plus a re-fetch, never from a `static` field.
- **The survey must not appear before the call.** Asking for an outcome before the call has happened is asking the caller to guess, and it is how dispositions get filled in as noise.

**"After submission, new contact card is open with the relevant history and call button in the bottom."** The contact card is the unit of the session, and the next one opens immediately rather than after the gap. That is deliberate:

- The next card is **fully readable during the gap**, which is the source app's best pacing idea — the caller reads the next person while waiting instead of waiting to find out who is up.
- The **call button is what the gap gates**, not the navigation. A caller who wants to skip the gap can; a caller mid-preparation is not forced to sit through a countdown before they can read.

## The gap timer

Per-campaign pacing, `5–300` seconds, presets `[5, 10, 20, 30, 60]`, default 20. The caller may override for their own session without changing the campaign value.

Three implementation requirements the source app failed all three of:

- **Derive the countdown from elapsed time**, not a decrementing counter. A backgrounded tab throttles `setInterval`, so a counter drifts — and the tab is backgrounded for the entire duration of every call.
- **One range, not three.** The source had a DB check of `5–3600`, a client clamp to `300`, and a UI offering `[5,10,20,30,60]` — and no admin screen could set the value, so the DB default always applied.
- **A value outside the preset list still renders as the current value**, not as *no selection*.

## What is still true under every future option

1. **A human always talks to the member.** No option places an automated call.
2. **Outcome is always human-confirmed.** A provider status would be a hint, never an authority.
3. **Disposition capture stays on the caller's own page.** No overlay is ported.
4. **The queue never depends on telephony state.** Pacing, skipping and pausing are local to the browser, so nothing can wedge a session.

## Option B, recorded for later

A provider (Exotel, Plivo, Twilio) would place the call server-side, report status by webhook, and return duration. It is a real upgrade — `call_duration` becomes populateable, and `busy` / `no-answer` / `switched-off` can pre-fill the outcome so the caller confirms rather than types.

It also arrives with cost per minute, a signed-webhook trust boundary, a dispatch strategy, an idempotent job claim, and a scheduler, none of which `folk_hkmc` has today.

**Option A is a strict subset of B.** The disposition write path is provider-neutral, so B can be added without reshaping the call card, the loop above, or the queue. Decide whether to invest in B — not whether it is possible.

SIP trunks, WhatsApp Business calling, IVR and AI-placed calls are out of Non-goals. Recorded here so the question is not re-litigated.