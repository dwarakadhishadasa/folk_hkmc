---
title: 'Fix Vercel Turborepo Build Env'
type: 'bugfix'
created: '2026-06-14'
status: 'done'
route: 'one-shot'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

# Fix Vercel Turborepo Build Env

## Intent

**Problem:** Vercel root builds run app builds through Turborepo strict environment mode, so Vercel project variables that are not declared in `turbo.json` are filtered out and can break Next.js app builds.

**Approach:** Declare the build-time Airtable, Supabase, and site URL variables in the build task, while passing true secrets through without adding them to the cache hash.

## Suggested Review Order

**Build Env Contract**

- Build task now receives all app configuration vars used by Vercel deployments.
  [`turbo.json:6`](../../turbo.json#L6)

- Secret tokens stay available to builds without becoming cache hash inputs.
  [`turbo.json:44`](../../turbo.json#L44)
