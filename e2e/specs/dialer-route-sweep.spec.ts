import { test, expect, request as playwrightRequest } from "@playwright/test"
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createDisposableCampaign, deleteDisposableCampaign } from "../fixtures/dialer-campaign"
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
 *
 * Rows whose owner case needs a parent row resolve `url` lazily against a
 * campaign created for this file in `beforeAll` and removed in `afterAll`. An
 * absent campaign id could only ever prove that the gate admits the owner
 * before the campaign lookup, which is the one thing every row already shares.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"

/**
 * A campaign id that is valid in shape and absent by construction: every
 * campaign row is generated with `gen_random_uuid()`, so this one can never be
 * seeded by this suite or by `pnpm seed:local`.
 */
const ABSENT_CAMPAIGN_ID = "00000000-0000-4000-8000-000000000000"

/** A question id that is valid in shape and absent by construction, like the campaign id above. */
const ABSENT_QUESTION_ID = "00000000-0000-4000-8000-000000000001"

interface SweepRouteOptions {
  /** The route file's path, exactly as the guardrail derives it from the directory. */
  route: string
  /**
   * Request path; defaults to `route`. Dynamic routes pass a concrete id here.
   * A function is resolved per request, for an id that only exists after
   * `beforeAll` created the fixture row.
   */
  url?: string | (() => string)
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

  const resolveUrl = () => `${BASE_URL}${typeof url === "function" ? url() : url}`
  const isAdmin = kind === "admin"

  test.describe(`Denial sweep: ${method} ${route} — unauthenticated`, () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test("is refused", async ({ request }) => {
      const response = await request.fetch(resolveUrl(), { method, data: body })
      expect([401, 403], `unauthenticated ${method} ${route} returned ${response.status()}`).toContain(
        response.status(),
      )
    })
  })

  test.describe(`Denial sweep: ${method} ${route} — non-owner (${nonOwningCallerRole})`, () => {
    test.use({ storageState: storageStatePath(nonOwningCallerRole) })

    if (isAdmin) {
      test("is refused as a 403 with a JSON error", async ({ request }) => {
        const response = await request.fetch(resolveUrl(), { method, data: body })
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
        const response = await request.fetch(resolveUrl(), { method, data: body })
        expect(response.status(), `non-owner ${method} ${route}`).toBe(404)
        expect(await response.text(), `non-owner ${method} ${route} must not leak a body`).toBe("")
      })
    }
  })

  test.describe(`Denial sweep: ${method} ${route} — owner (${owningCallerRole})`, () => {
    test.use({ storageState: storageStatePath(owningCallerRole) })

    test("is not denied", async ({ request }) => {
      const response = await request.fetch(resolveUrl(), { method, data: body })
      expect(
        ownerStatuses,
        `owner ${method} ${route} returned ${response.status()}`,
      ).toContain(response.status())
    })
  })
}

// ============================================================================
// A campaign owned by this file, for the survey rows below. None of them
// creates a question, so the cleanup delete cannot be blocked by the
// `ON DELETE RESTRICT` from `dialer_survey_questions`.
// ============================================================================

let surveyCampaignId: string

test.beforeAll(async () => {
  // An explicit admin context: the file's first test runs with an empty
  // storageState, and a `request` fixture taken from that scope would create
  // the fixture campaign unauthenticated.
  const adminRequest = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: storageStatePath("admin"),
  })

  try {
    surveyCampaignId = await createDisposableCampaign(adminRequest, "survey routes")
  } finally {
    await adminRequest.dispose()
  }
})

test.afterAll(async () => {
  if (surveyCampaignId) {
    await deleteDisposableCampaign(surveyCampaignId)
  }
})

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

sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/questions",
  url: () => `/api/dialer/admin/campaigns/${surveyCampaignId}/questions`,
  method: "GET",
  kind: "admin",
  ownerStatuses: [200],
})

// `{}` is a body, not a question: the service refuses it with 400
// invalid_question_title, so the owner case proves the gate admits this actor
// without writing a question.
sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/questions",
  url: () => `/api/dialer/admin/campaigns/${surveyCampaignId}/questions`,
  method: "POST",
  kind: "admin",
  ownerStatuses: [400],
  body: {},
})

sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/questions/[questionId]",
  url: () => `/api/dialer/admin/campaigns/${surveyCampaignId}/questions/${ABSENT_QUESTION_ID}`,
  method: "PATCH",
  kind: "admin",
  ownerStatuses: [404],
  body: { questionTitle: "x" },
})

sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/questions/[questionId]",
  url: () => `/api/dialer/admin/campaigns/${surveyCampaignId}/questions/${ABSENT_QUESTION_ID}`,
  method: "DELETE",
  kind: "admin",
  ownerStatuses: [404],
})

sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/questions/[questionId]/retire",
  url: () => `/api/dialer/admin/campaigns/${surveyCampaignId}/questions/${ABSENT_QUESTION_ID}/retire`,
  method: "POST",
  kind: "admin",
  ownerStatuses: [404],
})

// `{}` carries no `orderedIds`, so the service refuses it with 400
// invalid_question_order before writing anything — an absent order is a
// validation error, never a denial.
sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/questions/order",
  url: () => `/api/dialer/admin/campaigns/${surveyCampaignId}/questions/order`,
  method: "POST",
  kind: "admin",
  ownerStatuses: [400],
  body: {},
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

test.describe("Campaign survey list envelope", () => {
  test("is `{ questions }` for a campaign with none, with and without retired rows", async ({ request }) => {
    for (const query of ["", "?includeRetired=true"]) {
      const response = await request.get(
        `${BASE_URL}/api/dialer/admin/campaigns/${surveyCampaignId}/questions${query}`,
      )

      expect(response.status(), `GET questions${query} returned ${response.status()}`).toBe(200)
      const body = (await response.json()) as { questions?: unknown }
      expect(Array.isArray(body.questions), "the list route answers with a `questions` array").toBe(true)
      expect(body.questions, "a campaign this file created starts with no questions").toHaveLength(0)
    }
  })
})

test.describe("Campaign survey create: the option rule", () => {
  test("is a 400 options_required for a choice question with no options", async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/dialer/admin/campaigns/${surveyCampaignId}/questions`,
      { data: { questionTitle: "Pick a language", questionType: "DROPDOWN" } },
    )

    expect(response.status(), "a choice question with zero options is refused at save time").toBe(400)
    expect(await response.json()).toMatchObject({ code: "options_required" })
  })

  test("is a 400 options_required for an explicitly empty options list", async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/dialer/admin/campaigns/${surveyCampaignId}/questions`,
      { data: { questionTitle: "Pick a language", questionType: "MULTI_SELECT", options: [] } },
    )

    expect(response.status(), "an empty list is zero options, not an abstention").toBe(400)
    expect(await response.json()).toMatchObject({ code: "options_required" })
  })

  test("is a 400 options_not_allowed for options on a TEXT question", async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/dialer/admin/campaigns/${surveyCampaignId}/questions`,
      { data: { questionTitle: "Notes", questionType: "TEXT", options: [{ label: "Yes" }] } },
    )

    expect(response.status()).toBe(400)
    expect(await response.json()).toMatchObject({ code: "options_not_allowed" })
  })

  test("is a 400 invalid_question_type for an Object.prototype key", async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/dialer/admin/campaigns/${surveyCampaignId}/questions`,
      { data: { questionTitle: "Notes", questionType: "constructor" } },
    )

    expect(response.status(), "a prototype key must be a 400, never a 500").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_question_type" })
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
