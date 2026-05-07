---
title: 'Install Vercel Speed Insights'
type: 'chore'
created: '2026-05-07'
status: 'done'
route: 'one-shot'
---

# Install Vercel Speed Insights

## Intent

**Problem:** The app had no Vercel Speed Insights instrumentation, so deployed Core Web Vitals and performance measurements would not be captured through Vercel.

**Approach:** Add the official `@vercel/speed-insights` package and render the App Router `SpeedInsights` component from the root layout so all routes are covered.

## Suggested Review Order

- Root layout imports the official Next.js Speed Insights integration.
  [`layout.tsx:4`](../../app/layout.tsx#L4)

- Instrumentation renders once after app providers across every route.
  [`layout.tsx:70`](../../app/layout.tsx#L70)

- Package manifest declares the runtime dependency.
  [`package.json:42`](../../package.json#L42)

- Lockfile pins the resolved Speed Insights package.
  [`pnpm-lock.yaml:101`](../../pnpm-lock.yaml#L101)

## Post-Install Speed Insights Results

Captured from Vercel Speed Insights on 2026-05-07, desktop preview traffic, last 7 days.

| Metric | P75 result | Status | Route evidence |
| --- | ---: | --- | --- |
| Time to First Byte | 1.92s | Poor | `/` at 1.92s, 3 data points |
| First Contentful Paint | 2.04s | Needs improvement | `/` at 2.04s, 3 data points |
| Largest Contentful Paint | 2.04s | Great | Overall desktop metric is green |
| Interaction to Next Paint | 272ms | Needs improvement | `/contact` at 272ms with 2 data points; `/` at 272ms with 1 data point; `/volunteers` at 216ms with 1 data point |
| Cumulative Layout Shift | 0 | Great | Overall desktop metric is green |
| First Input Delay | 67ms | Great | Overall desktop metric is green |

The Real Experience Score currently shows `0`, and the provided route samples are very small. Treat these numbers as directional field evidence until production has more traffic.

Primary follow-up:

- Investigate `/` server response latency first. The poor `TTFB` and matching `/` `FCP` result suggest initial response time is the main page-load blocker in the captured sample.
- Profile route-level interaction work on `/contact`, `/`, and `/volunteers` for the `INP` findings. The current values are above the 200ms good threshold but below the 500ms poor threshold.
- Re-check mobile results separately; the provided screenshots only cover desktop.

Source screenshots:

- `/home/dwarakadas/Pictures/Screenshots/Screenshot from 2026-05-07 21-56-52.png`
- `/home/dwarakadas/Pictures/Screenshots/Screenshot from 2026-05-07 21-57-01.png`
- `/home/dwarakadas/Pictures/Screenshots/Screenshot from 2026-05-07 21-57-07.png`
