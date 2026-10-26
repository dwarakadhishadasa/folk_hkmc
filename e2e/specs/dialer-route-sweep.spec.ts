import { test, expect } from "@playwright/test"
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { storageStatePath, repoRoot, type E2ERole } from "../fixtures/roles"

/**
 * Denial sweep for every /api/dialer/** route.
 *
 * Two route shapes exist, because the two populations have different rules:
 *
 * **`kind: "caller"`** (the default) — the row belongs to one caller. The
 * assertions are:
 * 1. Unauthenticated request is refused (401/403).
 * 2. A non-owning caller gets 404 with no payload — a caller must learn nothing
 *    about another caller's row (AD-7's no-oracle rule).
 * 3. The owning caller succeeds.
 *
 * **`kind: "admin"`** — the row belongs to the admin surface, where
 * `requireCampaignAdmin` refuses a Volunteer with 403 and a JSON error, and a
 * missing campaign is a 404 *for the admin too*. The assertions are:
 * 1. Unauthenticated request is refused (401/403).
 * 2. A non-owner (default `volunteer`) gets 403 with a JSON error body.
 * 3. The owner succeeds with a status in `ownerStatuses` — the default is the
 *    generic success set, but an admin row may pin a specific status (`[400]` for
 *    a deliberately invalid create, `[404]` for a campaign that does not exist).
 *
 * The sweep reads per-role `storageState` fixtures written by the setup
 * projects rather than running a second sign-in flow.
 *
 * Routes are registered via `sweepRoute()` calls at module top level so the
 * static guardrail (`scripts/verify-dialer-route-coverage.mjs`, run inside
 * `pnpm guardrails`) can parse them as text and fail when a route file has
 * no row here. The script parses this file — it does not execute it. That is
 * why `route:` always names the route file's path exactly, while the request
 * path lives in the separate `url:` option: a dynamic route's real request
 * needs a concrete `[campaignId]` value, but the guardrail only understands
 * the bracketed directory name.
 *
 * THE SWEEP REGISTERS ONLY ROUTES THAT EXIST. `pnpm guardrails` fails on a
 * route file with no row, so the registration list grows as route files are
 * created — never ahead of them. A sweep row for a route that does not
 * exist yet asserts against Next's own 404, not the boundary, and proves
 * nothing.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"

/**
 * A campaign id that is valid in shape and absent by construction: every
 * campaign row is generated with `gen_random_uuid()`, so this one can never be
 * seeded by this suite or by `pnpm seed:local`.
 */
const ABSENT_CAMPAIGN_ID = "00000000-0000-4000-8000-000000000000"

interface SweepRouteOptions {
  /** The route file's path, exactly as the guardrail derives it from the directory. */
  route: string
  /** Request path; defaults to `route`. Dynamic routes pass a concrete id here. */
  url?: string
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  /** Which boundary the route sits behind. Defaults to the caller boundary. */
  kind?: "caller" | "admin"
  /** The role whose storageState holds this route's legitimate access. */
  owningCallerRole?: E2ERole
  /** A different signed-in role that must be refused. */
  nonOwningCallerRole?: E2ERole
  /** Statuses the owner's request may return; anything else is a denial. */
  ownerStatuses?: number[]
  body?: Record<string, unknown>
}

/**
 * Register one route/method pair for the denial sweep and emit its three
 * assertions. Also parsed statically by verify-dialer-route-coverage.mjs —
 * the `route:` string must match the route file's path exactly.
 */
export function sweepRoute(options: SweepRouteOptions) {
  const {
    route,
    url = route,
    method = "GET",
    kind = "caller",
    owningCallerRole = "admin",
    nonOwningCallerRole = kind === "admin" ? "volunteer" : "preacher",
    ownerStatuses = [200, 201, 202, 204],
    body,
  } = options

  const fullUrl = `${BASE_URL}${url}`
  const isAdmin = kind === "admin"

  test.describe(`Denial sweep: ${method} ${route} — unauthenticated`, () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test("is refused", async ({ request }) => {
      const response = await request.fetch(fullUrl, { method, data: body })
      expect([401, 403], `unauthenticated ${method} ${route} returned ${response.status()}`).toContain(
        response.status(),
      )
    })
  })

  test.describe(`Denial sweep: ${method} ${route} — non-owner (${nonOwningCallerRole})`, () => {
    test.use({ storageState: storageStatePath(nonOwningCallerRole) })

    if (isAdmin) {
      test("is refused as a 403 with a JSON error", async ({ request }) => {
        const response = await request.fetch(fullUrl, { method, data: body })
        expect(response.status(), `non-owner ${method} ${route}`).toBe(403)
        expect(
          response.headers()["content-type"] ?? "",
          `non-owner ${method} ${route}`,
        ).toContain("application/json")

        const payload = (await response.json()) as { code?: unknown }
        expect(payload.code, `non-owner ${method} ${route} must name the refusal`).toEqual(expect.any(String))
      })
    } else {
      test("is refused as a 404 with no payload", async ({ request }) => {
        const response = await request.fetch(fullUrl, { method, data: body })
        expect(response.status(), `non-owner ${method} ${route}`).toBe(404)
        expect(await response.text(), `non-owner ${method} ${route} must not leak a body`).toBe("")
      })
    }
  })

  test.describe(`Denial sweep: ${method} ${route} — owner (${owningCallerRole})`, () => {
    test.use({ storageState: storageStatePath(owningCallerRole) })

    test("is not denied", async ({ request }) => {
      const response = await request.fetch(fullUrl, { method, data: body })
      expect(
        ownerStatuses,
        `owner ${method} ${route} returned ${response.status()}`,
      ).toContain(response.status())
    })
  })
}

// ============================================================================
// Route registrations — add a sweepRoute() call for every /api/dialer/** route
// file under apps/folk/app/api/dialer/**, exactly as the route file lands.
// The static guardrail fails `pnpm guardrails` when a route file has no row.
// ============================================================================

sweepRoute({
  route: "/api/dialer/admin/campaigns",
  method: "GET",
  kind: "admin",
  ownerStatuses: [200],
})

// The owner case proves the admin gate admits this actor, not that a campaign is
// created: `{}` is deliberately invalid (400 invalid_name), and a created row
// would pollute every later run's campaign counts.
sweepRoute({
  route: "/api/dialer/admin/campaigns",
  method: "POST",
  kind: "admin",
  ownerStatuses: [400],
  body: {},
})

sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]",
  url: `/api/dialer/admin/campaigns/${ABSENT_CAMPAIGN_ID}`,
  method: "GET",
  kind: "admin",
  ownerStatuses: [404],
})

sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/transition",
  url: `/api/dialer/admin/campaigns/${ABSENT_CAMPAIGN_ID}/transition`,
  method: "POST",
  kind: "admin",
  ownerStatuses: [404],
  body: { action: "start" },
})

// ============================================================================
// Payload contracts the three-case denial shape cannot express: what a body
// that is not a JSON object answers, the list envelope, and the service's own
// unknown-action refusal. Each is one route's contract, not a population gate.
// ============================================================================

test.describe("Campaign create body: a body that is not a JSON object", () => {
  test("is a 400 invalid_body for unparseable JSON", async ({ request }) => {
    const response = await request.fetch(`${BASE_URL}/api/dialer/admin/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      data: "{not json",
    })

    expect(response.status(), "a parse failure is the caller's mistake, not a 500").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_body" })
  })

  test("is a 400 invalid_body for a JSON array", async ({ request }) => {
    const response = await request.fetch(`${BASE_URL}/api/dialer/admin/campaigns`, {
      method: "POST",
      data: [],
    })

    expect(response.status(), "an array is valid JSON but not a request body").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_body" })
  })
})

test.describe("Campaign list envelope", () => {
  test("is `{ campaigns }` even when the program has none", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/dialer/admin/campaigns`)

    expect(response.status()).toBe(200)
    const body = (await response.json()) as { campaigns?: unknown }
    expect(Array.isArray(body.campaigns), "the list route answers with a `campaigns` array").toBe(true)
  })
})

test.describe("Campaign transition body: an action outside start|complete|cancel", () => {
  test("is a 400 invalid_campaign_action, mapped from the service", async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/dialer/admin/campaigns/${ABSENT_CAMPAIGN_ID}/transition`,
      { data: { action: "pause" } },
    )

    expect(response.status(), "an unknown action is refused before any status predicate").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_campaign_action" })
  })
})

test.describe("the route-coverage guardrail itself", () => {
  // The story's acceptance row: the guardrail is proven to fail against a
  // temporary unlisted route, and that route is removed in the same run.
  // This is the behavioural half of the guard — the static check alone
  // would pass forever if its route enumeration silently broke. The probe
  // route lives under apps/folk/app/api/dialer/ (the directory the guardrail
  // enumerates), never under e2e/specs/ — AGENTS.md forbids a deliberately
  // broken spec there.
  test("a route file with no sweep row fails the guardrail", () => {
    const probeRouteDir = join(repoRoot, "apps", "folk", "app", "api", "dialer", "admin", "probe-unlisted")
    const probeRouteFile = join(probeRouteDir, "route.ts")

    mkdirSync(probeRouteDir, { recursive: true })
    writeFileSync(probeRouteFile, "export const GET = () => new Response()\n")

    try {
      const result = spawnSync(process.execPath, [join(repoRoot, "scripts", "verify-dialer-route-coverage.mjs")], {
        cwd: process.cwd(),
        encoding: "utf8",
      })
      expect(
        result.status,
        `the guardrail must exit 1 while a route file has no sweep row; output:\n${result.stdout ?? ""}${result.stderr ?? ""}`,
      ).toBe(1)
      expect(result.stderr ?? "", "the failure must name the uncovered route").toContain("probe-unlisted")
    } finally {
      rmSync(probeRouteDir, { recursive: true, force: true })
    }
  })
})
