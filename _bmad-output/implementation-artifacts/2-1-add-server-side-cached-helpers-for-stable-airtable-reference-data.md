# Story 2.1: Add Server-Side Cached Helpers For Stable Airtable Reference Data

Status: review

## Story

As a staff user,
I want stable location and preacher choices to load quickly,
so that staff forms are not blocked by repeated Airtable reference reads.

## Acceptance Criteria

1. Given `listLocations()` reads Airtable `Locations`, when the developer adds a cached helper, then server-side callers can read cached Locations with a 20-minute TTL, and the original uncached `listLocations()` or an equivalent bypass remains available.
2. Given `listActivePreachers()` reads Airtable `Users`, when the developer adds a cached helper, then server-side callers can read cached active Preachers with a 20-minute TTL, and the original uncached `listActivePreachers()` or an equivalent bypass remains available.
3. Given the app runs on Next.js App Router with dynamic protected pages, when caching is implemented, then the cache uses Next.js server caching such as `unstable_cache` or an equivalent server-only approach that works despite dynamic route rendering, and Airtable API tokens remain server-only.
4. Given cached helper results are returned, when multiple requests need the same reference data within 20 minutes, then repeated Airtable network requests are avoided for those helper calls, and cache keys or tags clearly distinguish Locations from active Preachers.

## Tasks / Subtasks

- [x] Add server-only cached wrappers around `listLocations()` and `listActivePreachers()` in or near `lib/airtable.ts`. (AC: 1, 2, 3)
  - [x] Use a 20-minute TTL (`1200` seconds).
  - [x] Keep the existing uncached helpers callable for validation, mutation, admin refresh, and bypass paths.
- [x] Give cache entries distinct keys and tags such as `airtable-locations` and `airtable-active-preachers`. (AC: 4)
- [x] If using `unstable_cache`, keep `cookies()`, `headers()`, Supabase session reads, and staff context reads outside cached functions. (AC: 3)
- [x] Add a documented bypass or invalidation helper shape for future admin flows. (AC: 1, 2)
- [x] Verify cached helpers are server-only and Airtable API tokens do not enter client bundles. (AC: 3)

## Dev Notes

- Current `lib/airtable.ts` has `airtableFetch()` with `cache: "no-store"`, and `listLocations()` / `listActivePreachers()` call Airtable every time.
- Do not cache writes, duplicate checks, contact lookups, attendance checks, invite operations, session attendance reads, or staff authorization hot-path decisions.
- The current repo uses Next.js `16.0.7`. As of the current Next.js docs, `unstable_cache` still works but is marked replaced by Cache Components / `use cache` in Next.js 16. A conservative story implementation can use `unstable_cache` because it is available and matches the existing App Router setup; document the choice.
- If adding tag invalidation, use server-only `revalidateTag(tag, "max")` or a deliberate immediate-expiry variant where appropriate. Do not call revalidation from client components or proxy.
- Cached helpers should return plain serializable data already shaped by `mapLocation()` and `mapStaffUser()`.

### Project Structure Notes

- `lib/airtable.ts` is the central Airtable adapter. Keep cached wrappers there or in a small server-only module such as `lib/airtable-cache.ts` if it avoids mixing concerns.
- Keep imports server-only. `lib/airtable.ts` already imports `"server-only"`.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-2.1]
- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#ADR-PR-002]
- [Source: lib/airtable.ts]
- [Latest: Next.js `unstable_cache` docs, https://nextjs.org/docs/app/api-reference/functions/unstable_cache]
- [Latest: Next.js `revalidateTag` docs, https://nextjs.org/docs/app/api-reference/functions/revalidateTag]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Code-path review confirmed cached helpers live in `lib/airtable.ts`, which imports `server-only`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added `listCachedLocations()` and `listCachedActivePreachers()` using `unstable_cache` with 1200-second revalidation.
- Kept `listLocations()` and `listActivePreachers()` available as uncached bypass helpers.
- Added `revalidateAirtableReferenceCache()` for future admin refresh/mutation flows.

### File List

- `lib/airtable.ts`

### Change Log

- 2026-05-07: Added server-only cached Airtable reference-data helpers.
