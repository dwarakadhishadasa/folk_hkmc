# Epic 2 — Waydroid visual verification

Date: 2026-10-27
Device: Waydroid (LineageOS), 390 × 844 logical viewport (`wm size 390x844`,
`wm density 160`), browser: Jelly.

The caller surface was opened against the local dev server through
`adb reverse tcp:3000 tcp:3000` and `adb reverse tcp:54321 tcp:54321`, signed in
as the seeded Admin. The fixture campaign was `Weekend Camp 2026` with three
assignments; the first contact had one prior `NOT_INTERESTED` call.

## Frames compared

| Frame | Result |
|---|---|
| `figcraft://node/2263` — Assignments card | App bar, title/chevron, campaign selector, `N of M called` progress, Queue pill, name, phone + Copy, Previous history and the pinned Call button all render in the same order and at the same spacing. |
| `figcraft://node/2360` — Queue | Full-screen drawer, close circle, `showing X of Y`, four stat tiles (Pending in amber), current row in the pale blue highlight with the navy phone mark and `← you`, pending rows with the grey dot. |
| `figcraft://node/2456` — Disposition | Full-screen screen with no app bar or bottom nav, `How did it go?`, close circle, Status + green Required pill, the thirteen chips in frame order, Notes + Optional, placeholder, pinned Save & continue. Selected chip is navy and the button is active. |

## Adjustments made during the pass

- The contact card header now gives the name the full card width; Skip and
  Pause moved to the receipt row so a long name stays on one line, as the frame
  draws it.
- The disposition branch is a fixed full-screen surface (`z-60`), so the shared
  app bar and mobile bottom nav do not appear behind it; the frame has neither.
- The disposition screen renders nothing below Notes when the campaign has no
  survey questions, instead of an "empty survey" line the frame does not show.
- The desktop Campaign sub-nav is rendered above the caller session so the
  shared navigation test still sees the Assignments tab; it is hidden on the
  phone, where the frame uses the Campaign menu instead.

## Known content differences (data, not layout)

- The seed contact is `Priya Balasubramanian`, not the frame's `Priya R`; the
  card therefore carries a longer name and the raw stored phone
  (`8100000006`) rather than the frame's formatted sample number.
- The queue fixture has three pending assignments and one prior call, so the
  drawer shows `3 of 3` and no answered rows; the frame's answered rows are a
  session history state, while the callable queue is PENDING-only (FR9).
