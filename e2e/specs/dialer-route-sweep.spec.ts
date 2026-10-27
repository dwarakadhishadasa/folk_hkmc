import { test, expect, request as playwrightRequest } from "@playwright/test"
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createDisposableCampaign, deleteDisposableCampaign } from "../fixtures/dialer-campaign"
import {
  createCallerAssignment,
  ensureActiveCaller,
  firstContactId,
  type AssignmentFixture,
  type CallerFixture,
} from "../fixtures/dialer-caller"
import { fixtureEmail, repoRoot, storageStatePath, type E2ERole } from "../fixtures/roles"

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

/** A caller id that is valid in shape and absent by construction, like the ids above. */
const ABSENT_CALLER_ID = "00000000-0000-4000-8000-000000000002"

/** A contact id that is valid in shape and absent by construction, like the ids above. */
const ABSENT_CONTACT_ID = "00000000-0000-4000-8000-000000000003"

/** An assignment id that is valid in shape and absent by construction, like the ids above. */
const ABSENT_ASSIGNMENT_ID = "00000000-0000-4000-8000-000000000004"

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
  kind?: "caller" | "caller-collection" | "admin"
  /** The role whose storageState holds this route's legitimate access. */
  owningCallerRole?: E2ERole
  /** A different signed-in role that must be refused. */
  nonOwningCallerRole?: E2ERole
  /** Statuses the owner's request may return; anything else is a denial. */
  ownerStatuses?: number[]
  /**
   * `caller-collection` only: the status a different caller's own request may
   * return. A collection is not a foreign row — another caller gets their own
   * (usually empty) view, never a 404.
   */
  nonOwnerStatuses?: number[]
  /** Body for the request; a function is resolved per request, for an id created in `beforeAll`. */
  body?: Record<string, unknown> | (() => Record<string, unknown>)
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
    nonOwnerStatuses = [200],
    body,
  } = options

  const resolveUrl = () => `${BASE_URL}${typeof url === "function" ? url() : url}`
  const resolveBody = () => (typeof body === "function" ? body() : body)
  const isAdmin = kind === "admin"
  const isCollection = kind === "caller-collection"

  test.describe(`Denial sweep: ${method} ${route} — unauthenticated`, () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test("is refused", async ({ request }) => {
      const response = await request.fetch(resolveUrl(), { method, data: resolveBody() })
      expect([401, 403], `unauthenticated ${method} ${route} returned ${response.status()}`).toContain(
        response.status(),
      )
    })
  })

  test.describe(`Denial sweep: ${method} ${route} — non-owner (${nonOwningCallerRole})`, () => {
    test.use({ storageState: storageStatePath(nonOwningCallerRole) })

    if (isAdmin) {
      test("is refused as a 403 with a JSON error", async ({ request }) => {
        const response = await request.fetch(resolveUrl(), { method, data: resolveBody() })
        expect(response.status(), `non-owner ${method} ${route}`).toBe(403)
        expect(
          response.headers()["content-type"] ?? "",
          `non-owner ${method} ${route}`,
        ).toContain("application/json")

        const payload = (await response.json()) as { code?: unknown }
        expect(payload.code, `non-owner ${method} ${route} must name the refusal`).toEqual(expect.any(String))
      })
    } else if (isCollection) {
      test("gets their own scoped view, not a foreign row", async ({ request }) => {
        const response = await request.fetch(resolveUrl(), { method, data: resolveBody() })
        expect(
          nonOwnerStatuses,
          `non-owner ${method} ${route} returned ${response.status()}`,
        ).toContain(response.status())
      })
    } else {
      test("is refused as a 404 with no payload", async ({ request }) => {
        const response = await request.fetch(resolveUrl(), { method, data: resolveBody() })
        expect(response.status(), `non-owner ${method} ${route}`).toBe(404)
        expect(await response.text(), `non-owner ${method} ${route} must not leak a body`).toBe("")
      })
    }
  })

  test.describe(`Denial sweep: ${method} ${route} — owner (${owningCallerRole})`, () => {
    test.use({ storageState: storageStatePath(owningCallerRole) })

    test("is not denied", async ({ request }) => {
      const response = await request.fetch(resolveUrl(), { method, data: resolveBody() })
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
// A second campaign, for the assign-contacts read. It must be a real row:
// `listAssignableContacts` resolves the campaign before reading contacts, so
// an absent id is a 404 and would prove only that the gate admits the Admin.
// Nothing is assigned in this file, so the cleanup delete cannot be blocked by
// `dialer_assignments`.
// ============================================================================

let assignContactsCampaignId: string

test.beforeAll(async () => {
  const adminRequest = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: storageStatePath("admin"),
  })

  try {
    assignContactsCampaignId = await createDisposableCampaign(adminRequest, "assign contacts")
  } finally {
    await adminRequest.dispose()
  }
})

test.afterAll(async () => {
  if (assignContactsCampaignId) {
    await deleteDisposableCampaign(assignContactsCampaignId)
  }
})

// ============================================================================
// A third campaign, for Story 1.8's assignment routes. Both the pre-check and
// the write resolve the campaign before they read a contact, so an absent id
// would be a 404 and prove only that the gate admits the Admin. Their owner
// rows send `{}`, which the service refuses before any read or write, so this
// file still creates no assignment — the delete cannot be blocked by
// `dialer_assignments`.
// ============================================================================

let assignWriteCampaignId: string

test.beforeAll(async () => {
  const adminRequest = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: storageStatePath("admin"),
  })

  try {
    assignWriteCampaignId = await createDisposableCampaign(adminRequest, "assign write")
  } finally {
    await adminRequest.dispose()
  }
})

test.afterAll(async () => {
  if (assignWriteCampaignId) {
    await deleteDisposableCampaign(assignWriteCampaignId)
  }
})

// ============================================================================
// A fourth campaign, for Story 1.9's campaign-progress read. `getCampaignProgress`
// resolves the campaign through `getCampaign` before the RPC, so an absent id is
// a 404 and would prove only that the gate admits the Admin. The owner row is a
// real 200: a fresh campaign has no assignment, so the function answers an
// all-zero summary and three empty lists without writing anything. Nothing is
// assigned into it, so the cleanup delete cannot be blocked by
// `dialer_assignments`.
// ============================================================================

let progressCampaignId: string

test.beforeAll(async () => {
  const adminRequest = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: storageStatePath("admin"),
  })

  try {
    progressCampaignId = await createDisposableCampaign(adminRequest, "campaign progress")
  } finally {
    await adminRequest.dispose()
  }
})

test.afterAll(async () => {
  if (progressCampaignId) {
    await deleteDisposableCampaign(progressCampaignId)
  }
})

// ============================================================================
// A fifth campaign, for the caller routes. It is ACTIVE and holds one PENDING
// assignment owned by the Admin's caller profile; the Preacher also holds an
// active profile, so the caller branch's non-owner case reaches the body-less
// 404 rather than `requireDialerCaller`'s 403. The assignment and profiles are
// removed before the campaign, because `campaign_id` is ON DELETE RESTRICT.
// ============================================================================

let callerCampaignId: string
let callerAssignmentId: string
let adminCaller: CallerFixture
let preacherCaller: CallerFixture
let callerAssignment: AssignmentFixture

test.beforeAll(async () => {
  const adminRequest = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: storageStatePath("admin"),
  })

  try {
    callerCampaignId = await createDisposableCampaign(adminRequest, "caller routes")

    const started = await adminRequest.post(
      `/api/dialer/admin/campaigns/${callerCampaignId}/transition`,
      { data: { action: "start" } },
    )
    expect(started.status(), `starting the caller fixture campaign: ${await started.text()}`).toBe(200)

    adminCaller = await ensureActiveCaller(fixtureEmail("admin"))
    preacherCaller = await ensureActiveCaller(fixtureEmail("preacher"))
    callerAssignment = await createCallerAssignment(
      callerCampaignId,
      adminCaller.callerId,
      await firstContactId(),
    )
    callerAssignmentId = callerAssignment.assignmentId
  } finally {
    await adminRequest.dispose()
  }
})

test.afterAll(async () => {
  await callerAssignment?.cleanup()
  await preacherCaller?.cleanup()
  await adminCaller?.cleanup()

  if (callerCampaignId) {
    await deleteDisposableCampaign(callerCampaignId)
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

// The edit page's Save. The body is valid, so the 404 proves the campaign
// lookup runs after the gate admitted this actor.
sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]",
  url: `/api/dialer/admin/campaigns/${ABSENT_CAMPAIGN_ID}`,
  method: "PATCH",
  kind: "admin",
  ownerStatuses: [404],
  body: { name: "Sweep campaign", campaignDate: "2026-11-14" },
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

// The assign-contacts read needs the campaign it would assign into: the
// service resolves the campaign before reading a single contact, and a contact
// page for a campaign that does not exist is a 404, not the success case.
sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/contacts",
  url: () => `/api/dialer/admin/campaigns/${assignContactsCampaignId}/contacts`,
  method: "GET",
  kind: "admin",
  ownerStatuses: [200],
})

// ============================================================================
// Caller roster. Neither row needs a fixture row: the roster read answers for
// whatever the program holds, and the status row pins `404` because the gate
// admits the Admin before the deliberately absent caller is looked up. That is
// also what keeps the sweep from creating or toggling a caller profile.
// ============================================================================

sweepRoute({
  route: "/api/dialer/admin/callers",
  method: "GET",
  kind: "admin",
  ownerStatuses: [200],
})

sweepRoute({
  route: "/api/dialer/admin/callers/[callerId]",
  url: `/api/dialer/admin/callers/${ABSENT_CALLER_ID}`,
  method: "PATCH",
  kind: "admin",
  ownerStatuses: [404],
  body: { isActive: false },
})

// The assigner's picker reads the AD-3 assignable set, which is a different
// population from the roster: it excludes deactivated callers. The preview is
// pure arithmetic behind the same gate, so a one-caller body is a real 200 and
// writes nothing.
sweepRoute({
  route: "/api/dialer/admin/assignable-callers",
  method: "GET",
  kind: "admin",
  ownerStatuses: [200],
})

sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/assignments/preview",
  url: () => `/api/dialer/admin/campaigns/${assignContactsCampaignId}/assignments/preview`,
  method: "POST",
  kind: "admin",
  ownerStatuses: [200],
  body: { total: 10, callers: [{ callerId: ABSENT_CALLER_ID, weight: 1 }] },
})

// `{}` carries no `contactIds`, so the service refuses it with 400
// invalid_contact_ids before any contact or assignment read: the owner case
// proves the gate admits this actor and writes nothing.
sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/assignments/precheck",
  url: () => `/api/dialer/admin/campaigns/${assignWriteCampaignId}/assignments/precheck`,
  method: "POST",
  kind: "admin",
  ownerStatuses: [400],
  body: {},
})

// `{}` carries no `contactIds` either, so the write refuses it with the same
// 400 before anything is written — no contact, caller or assignment row is
// created by this row.
sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/assignments",
  url: () => `/api/dialer/admin/campaigns/${assignWriteCampaignId}/assignments`,
  method: "POST",
  kind: "admin",
  ownerStatuses: [400],
  body: {},
})

// AD-5's one reporting read. The owner is a genuine 200 because the campaign
// exists and a fresh one answers an all-zero summary, so this row proves the
// route reaches `campaign_progress` and not merely that it admits an Admin.
sweepRoute({
  route: "/api/dialer/admin/campaigns/[campaignId]/progress",
  url: () => `/api/dialer/admin/campaigns/${progressCampaignId}/progress`,
  method: "GET",
  kind: "admin",
  ownerStatuses: [200],
})

// ============================================================================
// Caller routes. The queue is a collection: another caller is not a foreign
// row, so their own read succeeds with their own view. The assignment-keyed
// routes use the real fixture assignment; the Preacher has an active profile
// too, so the 404 is the no-oracle refusal rather than requireDialerCaller's
// 403. Skip is registered after the summary and recall rows because it writes
// SKIPPED into the fixture assignment.
// ============================================================================

sweepRoute({
  route: "/api/dialer/caller/queue",
  method: "GET",
  kind: "caller-collection",
  owningCallerRole: "admin",
  nonOwningCallerRole: "preacher",
  ownerStatuses: [200],
  nonOwnerStatuses: [200],
})

sweepRoute({
  route: "/api/dialer/caller/assignments/[assignmentId]",
  url: () => `/api/dialer/caller/assignments/${callerAssignmentId}`,
  method: "GET",
  kind: "caller",
  owningCallerRole: "admin",
  nonOwningCallerRole: "preacher",
  ownerStatuses: [200],
})

sweepRoute({
  route: "/api/dialer/caller/session/summary",
  url: () => `/api/dialer/caller/session/summary?campaignId=${callerCampaignId}`,
  method: "GET",
  kind: "caller",
  owningCallerRole: "admin",
  nonOwningCallerRole: "preacher",
  ownerStatuses: [200],
})

sweepRoute({
  route: "/api/dialer/caller/session/recall",
  method: "POST",
  kind: "caller",
  owningCallerRole: "admin",
  nonOwningCallerRole: "preacher",
  ownerStatuses: [200],
  body: () => ({ campaignId: callerCampaignId }),
})

// A valid body with an assignment that does not exist still reaches the RPC:
// the owner 404 is the function's assignment_not_found, and the Preacher's is
// the same body-less refusal because the assignment is not theirs either.
sweepRoute({
  route: "/api/dialer/caller/disposition",
  method: "POST",
  kind: "caller",
  owningCallerRole: "admin",
  nonOwningCallerRole: "preacher",
  ownerStatuses: [404],
  body: {
    assignmentId: ABSENT_ASSIGNMENT_ID,
    attempt: 1,
    dispositionStatus: "CONFIRMED",
    followUpNotes: null,
    responses: [],
  },
})

sweepRoute({
  route: "/api/dialer/caller/assignments/[assignmentId]/skip",
  url: () => `/api/dialer/caller/assignments/${callerAssignmentId}/skip`,
  method: "POST",
  kind: "caller",
  owningCallerRole: "admin",
  nonOwningCallerRole: "preacher",
  ownerStatuses: [200],
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

test.describe("Assignable contacts envelope", () => {
  test("is `{ rows, page, pageSize, total, totalPages, facets }`", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/dialer/admin/campaigns/${assignContactsCampaignId}/contacts`,
    )

    expect(response.status()).toBe(200)

    const body = (await response.json()) as {
      rows?: unknown
      page?: unknown
      pageSize?: unknown
      total?: unknown
      totalPages?: unknown
      facets?: unknown
    }

    expect(Array.isArray(body.rows), "the list route answers with a `rows` array").toBe(true)
    expect(body.page, "an unrequested page is page 1").toBe(1)
    expect(body.pageSize, "an unrequested page size is 25").toBe(25)
    expect(body.total, "the total is the real set size, not the page length").toEqual(expect.any(Number))
    expect(body.totalPages, "totalPages is derived from the real total").toEqual(expect.any(Number))
    expect(body.facets, "all four facets answer an array, even an empty one").toMatchObject({
      centre: expect.any(Array),
      level: expect.any(Array),
      gender: expect.any(Array),
      language: expect.any(Array),
    })
  })
})

test.describe("Assignable contacts query: page validation is the service's", () => {
  const pageUrl = (query: string) =>
    `${BASE_URL}/api/dialer/admin/campaigns/${assignContactsCampaignId}/contacts${query}`

  test("is a 400 invalid_page for a page that is not a whole number", async ({ request }) => {
    const response = await request.get(pageUrl("?page=abc"))

    expect(response.status(), "a non-numeric page is a named refusal, not a silent page 1").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_page" })
  })

  test("is a 400 invalid_page for a page below 1", async ({ request }) => {
    const response = await request.get(pageUrl("?page=0"))

    expect(response.status()).toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_page" })
  })

  test("is a 400 invalid_page_size above the 100-row cap", async ({ request }) => {
    const response = await request.get(pageUrl("?pageSize=101"))

    expect(response.status(), "the cap is a contract, not a clamp").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_page_size" })
  })

  test("is a 400 invalid_page_size for a size that is not a whole number", async ({ request }) => {
    const response = await request.get(pageUrl("?pageSize=abc"))

    expect(response.status()).toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_page_size" })
  })
})

test.describe("Assignment pre-check: the selection gate is the service's", () => {
  const precheckUrl = () =>
    `${BASE_URL}/api/dialer/admin/campaigns/${assignWriteCampaignId}/assignments/precheck`

  test("is a 400 invalid_body for unparseable JSON", async ({ request }) => {
    const response = await request.post(precheckUrl(), {
      headers: { "content-type": "application/json" },
      data: "{not json",
    })

    expect(response.status(), "a parse failure is the caller's mistake, not a 500").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_body" })
  })

  test("is a 403 contact_not_assignable naming an out-of-set contact, and writes nothing", async ({
    request,
  }) => {
    const response = await request.post(precheckUrl(), {
      data: { contactIds: [ABSENT_CONTACT_ID] },
    })

    expect(response.status(), "a contact outside the AD-3 set is refused, never dropped").toBe(403)
    const payload = (await response.json()) as { code?: string; error?: string }
    expect(payload.code).toBe("contact_not_assignable")
    expect(payload.error, "the refusal names the offending id").toContain(ABSENT_CONTACT_ID)
  })
})

test.describe("Assignment write: the pre-check runs inside the write", () => {
  const writeUrl = () => `${BASE_URL}/api/dialer/admin/campaigns/${assignWriteCampaignId}/assignments`
  const callers = [{ userId: ABSENT_CALLER_ID, weight: 1 }]

  test("is a 400 invalid_body for a JSON array", async ({ request }) => {
    const response = await request.post(writeUrl(), { data: [] })

    expect(response.status(), "an array is valid JSON but not a request body").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_body" })
  })

  test("is a 400 invalid_caller_list before any contact is read", async ({ request }) => {
    const response = await request.post(writeUrl(), { data: { contactIds: [ABSENT_CONTACT_ID] } })

    expect(response.status(), "a selection with no callers is refused before the pre-check").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_caller_list" })
  })

  test("is a 403 contact_not_assignable naming an out-of-set contact, and writes nothing", async ({
    request,
  }) => {
    const response = await request.post(writeUrl(), {
      data: { contactIds: [ABSENT_CONTACT_ID], callers },
    })

    expect(response.status(), "the write re-runs the pre-check rather than trusting the client").toBe(403)
    const payload = (await response.json()) as { code?: string; error?: string }
    expect(payload.code).toBe("contact_not_assignable")
    expect(payload.error, "the refusal names the offending id").toContain(ABSENT_CONTACT_ID)
  })

  test("forwards mode untouched: an unknown mode is the service's 400 invalid_mode", async ({
    request,
  }) => {
    const response = await request.post(writeUrl(), {
      data: { contactIds: [ABSENT_CONTACT_ID], callers, mode: "pause" },
    })

    expect(response.status(), "the route must not default or rewrite the mode").toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_mode" })
  })
})

test.describe("Caller roster list envelope", () => {
  test("is `{ callers }` for a roster read", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/dialer/admin/callers`)

    expect(response.status()).toBe(200)
    const body = (await response.json()) as { callers?: unknown }
    expect(Array.isArray(body.callers), "the list route answers with a `callers` array").toBe(true)
  })
})

test.describe("Caller status: a flag that is not a boolean", () => {
  test("is a 400 invalid_is_active, mapped from the service", async ({ request }) => {
    const response = await request.patch(
      `${BASE_URL}/api/dialer/admin/callers/${ABSENT_CALLER_ID}`,
      { data: { isActive: "false" } },
    )

    expect(
      response.status(),
      "the flag is validated before the caller lookup, so the id's absence is not the reason",
    ).toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_is_active" })
  })
})

test.describe("Caller status: a caller is deactivated, never removed", () => {
  test("has no DELETE handler", async ({ request }) => {
    const response = await request.delete(`${BASE_URL}/api/dialer/admin/callers/${ABSENT_CALLER_ID}`)

    expect(response.status(), "deactivation is the is_active switch; the route exports no DELETE").toBe(
      405,
    )
  })
})

// AD-2's split, on the one pair of routes where it is not implied by the
// population: a Preacher reads the scoped roster and is still refused the
// status switch, which stays an Admin action.
test.describe("Caller roster: a Preacher reads it but cannot switch is_active", () => {
  test.use({ storageState: storageStatePath("preacher") })

  test("lists their scoped roster", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/dialer/admin/callers`)

    expect(response.status(), `a Preacher's roster read returned ${response.status()}`).toBe(200)
    const body = (await response.json()) as { callers?: unknown }
    expect(Array.isArray(body.callers), "the list route answers with a `callers` array").toBe(true)
  })

  test("is refused a deactivation with 403 forbidden", async ({ request }) => {
    const response = await request.patch(
      `${BASE_URL}/api/dialer/admin/callers/${ABSENT_CALLER_ID}`,
      { data: { isActive: false } },
    )

    expect(response.status(), "deactivation is an Admin action only").toBe(403)
    expect(await response.json()).toMatchObject({ code: "forbidden" })
  })
})

test.describe("Campaign progress envelope", () => {
  const progressUrl = () => `${BASE_URL}/api/dialer/admin/campaigns/${progressCampaignId}/progress`

  test("is `{ progress }` with a zeroed funnel for a campaign nothing is assigned into", async ({
    request,
  }) => {
    const response = await request.get(progressUrl())

    expect(response.status()).toBe(200)

    const body = (await response.json()) as {
      progress?: {
        campaignId?: unknown
        programScope?: unknown
        summary?: Record<string, unknown>
        outcomes?: unknown
        callers?: unknown
        recent?: unknown
      }
    }
    const progress = body.progress

    if (!progress) {
      throw new Error("the progress route answered 200 without a `progress` object")
    }

    expect(progress.campaignId, "the payload names the campaign that was requested").toBe(
      progressCampaignId,
    )
    expect(progress.programScope, "an Admin's read is a program-scope read").toBe(true)

    // The five funnel buckets AD-5 defines, plus the three assignment status
    // counts the session summary reads. A fresh campaign is the only state this
    // file can create, and there a measured zero is the true answer.
    expect(progress.summary, "the summary is the service DTO's eight counts, all measured").toMatchObject({
      assigned: 0,
      attempted: 0,
      reached: 0,
      confirmed: 0,
      neverAttempted: 0,
      completed: 0,
      skipped: 0,
      pending: 0,
    })

    for (const key of ["assigned", "attempted", "reached", "confirmed", "neverAttempted"]) {
      expect(progress.summary, `the funnel key \`${key}\` must survive the route`).toHaveProperty(key)
    }

    expect(progress.outcomes, "the outcome mix is an array even with no call log").toEqual([])
    expect(progress.callers, "the caller rollup is an array even with no assignment").toEqual([])
    expect(progress.recent, "recent activity is an array even with no call log").toEqual([])
  })
})

// AD-3's scope is decided by `campaignScope` and travels as an argument to
// `campaign_progress`, so the payload's own `programScope` is the one place the
// HTTP surface can be seen to carry a Preacher's scope rather than widening it.
test.describe("Campaign progress: the scope the function is called with", () => {
  test.use({ storageState: storageStatePath("preacher") })

  test("answers programScope false for a Preacher, never the programme", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/dialer/admin/campaigns/${progressCampaignId}/progress`,
    )

    expect(response.status(), `a Preacher's progress read returned ${response.status()}`).toBe(200)
    const body = (await response.json()) as { progress?: { programScope?: unknown } }
    expect(
      body.progress?.programScope,
      "a Preacher's read is scoped to their contacts, never widened to the programme",
    ).toBe(false)
  })
})

test.describe("Campaign progress: a read-only route", () => {
  test("has no POST handler", async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/dialer/admin/campaigns/${progressCampaignId}/progress`,
    )

    expect(response.status(), "the progress route exports GET only").toBe(405)
  })
})

// The admin surface keeps the 403/404 distinction (AD-7), and the progress
// route's 404 is `getCampaign`'s program-scoped lookup, not the RPC's: an id
// that names no campaign is refused before `campaign_progress` is called.
test.describe("Campaign progress: a campaign that is not in the program", () => {
  test("is a 404 campaign_not_found naming no counts", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/dialer/admin/campaigns/${ABSENT_CAMPAIGN_ID}/progress`,
    )

    expect(response.status()).toBe(404)
    expect(await response.json()).toMatchObject({ code: "campaign_not_found" })
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
