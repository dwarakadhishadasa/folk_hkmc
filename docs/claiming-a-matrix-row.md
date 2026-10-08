# Claiming a matrix row

The long-form version of the five rules in
[`matrix-coverage-map.md`](../_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md#claiming-a-matrix-row-the-rule-this-map-now-enforces).
That section is the contract; this is how you satisfy it.

Read this when you have a row from a `## I/O & Edge-Case Matrix` table and no idea
where to start. By the end you should be able to name three things: the layer, the
seeding, and the evidence that flips the row.

Three questions, in order:

1. [Which layer observes this row?](#1-which-layer-observes-this-row)
2. [What does the row need seeded?](#2-what-does-the-row-need-seeded)
3. [What evidence flips the row to Covered?](#3-what-evidence-flips-the-row-to-covered)

## 1. Which layer observes this row?

The layer is chosen by **what the row asserts**, not by which page the feature
lives on. There are three, and no unit runner.

| Layer | Mechanism | The row asserts something about | Rows like |
|---|---|---|---|
| **UI** | `page.*` against a signed-in `storageState` | what a user sees — optimistic display, keyboard navigation, selection, sorting, filtering | "cell edit reverts in the UI", "indeterminate header appears when 3 of 40 are selected" |
| **API** | Playwright `request` fixture against `/api/manage/...`, carrying the same cookies | a status code or a body shape | "the 200 cap returns 400", "a bad `contactId` touches exactly one row" |
| **Route interception** | `page.route()` fulfilling or aborting | a failure mode a healthy server will not produce on demand | "the grid reverts when the server returns 400", "a dropped fetch shows the error state" |

Three rules that decide it in practice:

**Prefer the cheapest layer that can actually observe the claim.** A cap is a
status code, so it is an API row. Driving 201 rows through the UI to prove a 400
is testing the browser, not the cap.

**Route interception replaces the response, not the handler.** `page.route()` is
not mocking the system under test. Unless the spec deliberately stops the request,
the request still reaches the real handler. This is why rows 3, 5, 11 and 16 in
story 2's matrix are Covered through interception: a live server will not
malform its own `results` body on request, and corrupting real data to force a 400
is worse than the gap.

**Never stub auth.** Nothing in this suite stubs Supabase auth. The
`/login` → Mailpit OTP → `verifyOtp` path is the thing most likely to break
silently, so a stub would hide exactly the break you are testing for. The three
`setup-*` projects drive the real path and write a `storageState`; specs consume
that.

## 2. What does the row need seeded?

**Start from the generator, not from a hand-written row.** Story 3's
`pnpm seed:local` extension is idempotent and keyed on exact deterministic names,
and 16 of story 2's 19 rows need more contacts than the base seed creates. Check
`scripts/bulk-contact-fixtures.mjs` before writing a seed of your own — the row you
need is probably already there.

**Tag anything you add** `preview-fixture-`. That prefix is how the fixture guard
distinguishes generated rows from real ones, and a row without it is invisible to
`pnpm test:seed-local-guard`.

**Restore what you rename, in a `finally`.** The generator is keyed on exact
names, so a spec that leaves a renamed fixture behind breaks the *next* run before
any test executes — and it does so as a confusing failure somewhere else. If your
spec changes a row's name, put the restore in `finally` where a failed assertion
cannot skip it.

**Never depend on another spec's leftovers.** Every run regenerates fixtures via
`globalSetup`, and each setup project deletes its own `storageState` before writing
one. A spec that passes only because another spec ran first is order-dependent, and
it fails on the next run that shuffles the file order. If your row needs a
specific state, the spec creates it.

**Do not sleep.** No `waitForTimeout` anywhere under `e2e/` — it passes on a fast
machine and fails on a loaded one. Wait for the condition with `expect.poll`; the
Mailpit OTP reader in `e2e/fixtures/mailpit.ts` is the in-repo pattern, and it
documents the banned call in a comment precisely so nobody reintroduces it.

## 3. What evidence flips the row to Covered?

**Covered means one thing: the row's spec passed in a run you recorded.**

Not that the spec exists. Not that it looks obviously correct. Not that a human
checked the behavior once against `pnpm dev:folk`. A spec that was written and
never run is Manual, exactly like no spec at all.

A row whose spec is skipped, flaky, or absent stays **Manual**.

### What to record when you flip a row

Quote these from the actual run, in the verdict's Spec column or beside it:

- the **pass count** from that run's own output, never an estimate
- the **revision** the run happened at (`git rev-parse --short HEAD`)
- the **Playwright version** in `package.json`
- the **`baseURL`** — `http://127.0.0.1:3000` by default, and the suite
  **refuses** to run against a non-loopback address
- the **worker count** — 1, per `playwright.config.ts`

### A green run still prints two `✘` marks

This surprises people, so it gets its own note. Rows 1 and 4 of story 2's matrix
carry a `test.fail` tripwire: the spec asserts the row's *expected* behavior, that
assertion currently fails because of one named defect, and `test.fail` marks the
failure as expected so the run stays green while the defect is open. The marks are
the tripwire doing its job.

The tripwire is the pattern to copy when you find a real defect rather than working
around it:

```ts
// Row N — <what the row asserts>
test("...", async ({ page }) => {
  test.fail(/* known defect: <link or issue>, fixed in <sha or unfixed> */)
  // the correct assertion for the row's expected behavior — not a weakened one
})
```

When the underlying defect is fixed, the tripwire turns **red**, which is the
point: it forces the verdict table to be revisited rather than leaving a stale
Manual in place.

### The worked example that stays Manual

Rows 1 and 4 — happy-path cell edit, and empty required field. Both specs are
committed and wired into `pnpm test:e2e`. Both run. Both fail, for one named reason
recorded in the map. Neither is marked Covered.

That is the rule working, not the rule being bent. If you find yourself explaining
why a row deserves Covered despite its spec not passing, the answer is that the
row is Manual and the map should say so.

### The `Unreachable` escape hatch is closed

If the behavior is browser-observable or HTTP-observable, the row is coverable and
the test gets written. Every row that once sat on "unreachable" is now either
Covered or failing with a named defect. Do not edit an `## I/O & Edge-Case Matrix`
table to match what was easy to check — the matrix is the requirement, and the
implementation satisfies it.

## Where the checks live

The suite's own determinism is now a committed mechanism rather than a habit:

- `pnpm test:e2e` — the suite. Run this.
- `pnpm test:e2e:determinism` — two consecutive runs, no reset between, fails
  naming which run failed. Use this when you are about to claim a run is
  trustworthy, and record its counts.
- `e2e/specs/suite-determinism.spec.ts` — asserts, offline and every run, that no
  spec sleeps, that fixtures and `storageState` regenerate per run, that order
  independence is configured, that every `e2e/specs/*.spec.ts` is actually
  registered, and that a deliberately broken spec turns the gate red.

`CONTRIBUTING.md` and `docs/development-guide.md` record the current pass counts and
the spec inventory. Per `CONTRIBUTING.md:80`, update them in the same change that
alters the suite's shape — a spec added without a count update is the stale-doc
failure this doc exists to prevent.
