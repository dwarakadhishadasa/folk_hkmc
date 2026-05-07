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
