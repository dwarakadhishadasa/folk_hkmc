import { test, expect } from "@playwright/test"
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { storageStatePath, repoRoot, type E2ERole } from "../fixtures/roles"

/**
 * Denial sweep for every /api/dialer/** route.
 *
 * For each registered route, asserts three cases:
 * 1. Unauthenticated request is refused (401/403)
 * 2. A non-owning caller gets 404 with no payload
 * 3. The owning caller succeeds
 *
 * The sweep reads per-role `storageState` fixtures written by the setup
 * projects rather than running a second sign-in flow.
 *
 * Routes are registered via `sweepRoute()` calls at module top level so the
 * static guardrail (`scripts/verify-dialer-route-coverage.mjs`, run inside
 * `pnpm guardrails`) can parse them as text and fail when a route file has
 * no row here. The script parses this file — it does not execute it.
 *
 * THE SWEEP REGISTERS ONLY ROUTES THAT EXIST. `pnpm guardrails` fails on a
 * route file with no row, so the registration list grows as route files are
 * created — never ahead of them. A sweep row for a route that does not
 * exist yet asserts against Next's own 404, not the boundary, and proves
 * nothing.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"

interface SweepRouteOptions {
  route: string
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  /** The role whose storageState is the legitimate owner of this route. */
  owningCallerRole?: E2ERole
  /** A different signed-in role that must be refused indistinguishably. */
  nonOwningCallerRole?: E2ERole
  body?: Record<string, unknown>
}

/**
 * Register one route/method pair for the denial sweep and emit its three
 * assertions. Also parsed statically by verify-dialer-route-coverage.mjs —
 * the `route:` string must match the route file's path exactly.
 */
export function sweepRoute(options: SweepRouteOptions) {
  const { route, method = "GET", owningCallerRole = "admin", nonOwningCallerRole = "preacher", body } = options

  const fullUrl = `${BASE_URL}${route}`

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

    test("is refused as a 404 with no payload", async ({ request }) => {
      const response = await request.fetch(fullUrl, { method, data: body })
      expect(response.status(), `non-owner ${method} ${route}`).toBe(404)
      expect(await response.text(), `non-owner ${method} ${route} must not leak a body`).toBe("")
    })
  })

  test.describe(`Denial sweep: ${method} ${route} — owner (${owningCallerRole})`, () => {
    test.use({ storageState: storageStatePath(owningCallerRole) })

    test("is not denied", async ({ request }) => {
      const response = await request.fetch(fullUrl, { method, data: body })
      expect(
        [200, 201, 202, 204],
        `owner ${method} ${route} returned ${response.status()}`,
      ).toContain(response.status())
    })
  })
}

// ============================================================================
// Route registrations — add a sweepRoute() call for every /api/dialer/** route
// file under apps/folk/app/api/dialer/**, exactly as the route file lands.
// The static guardrail fails `pnpm guardrails` when a route file has no row.
//
// Deliberately EMPTY here: no route file exists yet under
// apps/folk/app/api/dialer/**, so the guardrail passes vacuously (its own
// exit-0 message names this case). Each later story that creates a route
// file adds its sweepRoute() row in the same change — that is AD-8's
// "coverage is a guardrail, not a memory".
// ============================================================================

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
