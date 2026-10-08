/**
 * The harness's own guards, asserted offline.
 *
 * Everything here protects a boundary rather than the app: the local-only
 * refusals, the readiness gate's wiring, and the ignore rules for the artifacts
 * a run leaves behind. None of it needs a browser, a page, or a reachable stack —
 * a refusal that is never exercised is a comment, not a guard.
 *
 * The two refusals are the ones that keep real OTP emails and real sessions off
 * any non-local target. They are deliberately asserted *at their refusal*, not
 * only on the passing path, because the passing path is what a developer with a
 * correct `.env.local` already sees.
 */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { listAuthUsersMatching } from "../fixtures/auth-users"
import { repoRoot } from "../fixtures/roles"

/** The hosted project the whole suite refuses to touch. */
const HOSTED_SUPABASE_URL = "https://etwunirahuucodcxydgs.supabase.co"

/** The repo's own Playwright CLI, resolved rather than assumed on `PATH`. */
const PLAYWRIGHT_BIN = path.join(repoRoot, "node_modules", ".bin", "playwright")

test("the provisioning assertion refuses to read auth.users from the hosted project", async () => {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  process.env.SUPABASE_URL = HOSTED_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = "not-a-real-key"

  try {
    // `process.env` wins over the env file, so this exercises the refusal the
    // same machine-state that would otherwise read the hosted project.
    await expect(listAuthUsersMatching("preview-e2e-not-a-staff-folk@example.com")).rejects.toThrow(
      /not a loopback address/,
    )
  } finally {
    restoreEnv("SUPABASE_URL", previousUrl)
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", previousKey)
  }
})

test("the suite refuses a non-loopback E2E_BASE_URL at config load", () => {
  expect(existsSync(PLAYWRIGHT_BIN), `${PLAYWRIGHT_BIN} should exist; run pnpm install`).toBe(true)

  const result = spawnSync(PLAYWRIGHT_BIN, ["test", "--list"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: cleanEnv({ E2E_BASE_URL: HOSTED_SUPABASE_URL }) as NodeJS.ProcessEnv,
  })

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  expect(result.status, `\`playwright test --list\` with a hosted E2E_BASE_URL exited ${result.status}:\n${output}`).not.toBe(0)
  expect(output, "the refusal must name the reason, or it is not actionable").toContain("must be a loopback address")
})

test("`test:e2e` still runs the stack-readiness gate before Playwright", () => {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>
  }
  const command = manifest.scripts?.["test:e2e"] ?? ""

  expect(command, "root package.json no longer defines test:e2e").toContain("pnpm local:readiness")
  expect(command, "test:e2e must run the gate before Playwright, not after").toContain(
    "pnpm local:readiness && playwright test",
  )
})

test("the run-artifact directories are ignored, and only at the repo root", () => {
  // The anchoring is the point of these rules: an unanchored `test-results/`
  // would silently untrack a same-named directory deeper in the tree.
  for (const rule of ["/playwright-report/", "/blob-report/", "/test-results/"]) {
    expect(ignored(`${rule.replace(/^\/|\/$/g, "")}/marker.txt`), `${rule} should be ignored`).toBe(true)
    expect(
      ignored(`apps/folk/${rule.replace(/^\/|\/$/g, "")}/marker.txt`),
      `${rule} is unanchored: a same-named directory under apps/ would be swept up`,
    ).toBe(false)
  }

  // The session tokens themselves — the one artifact that must never be tracked
  // — are covered where they are produced, in `smoke.spec.ts`.
  expect(ignored("e2e/.auth/admin.json"), "/e2e/.auth/ holds live Supabase session tokens").toBe(true)
})

function ignored(relativePath: string): boolean {
  return spawnSync("git", ["check-ignore", "-q", relativePath], { cwd: repoRoot, stdio: "ignore" }).status === 0
}

/** `process.env` without the variables that would confuse a nested runner. */
function cleanEnv(overrides: Record<string, string>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("TEST_") && !key.startsWith("PW_")) {
      env[key] = value
    }
  }

  return { ...env, ...overrides }
}

function restoreEnv(key: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = previous
  }
}
