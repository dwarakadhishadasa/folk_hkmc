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
import { existsSync, readFileSync, readdirSync } from "node:fs"
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

test("the grid stays token-clean and viewport-free: no raw colour, no theme toggle and no vh under components/grid/", () => {
  // The theme story is a token question, not a rewrite, and this is what keeps
  // it one. A raw hex, an `rgb()`, a `white`/`black` literal or a `dark:`
  // variant under `components/grid/` would bypass the `.dark` block entirely,
  // so it is asserted as *zero* rather than as a list someone has to maintain.
  //
  // `components/grid/` is also where a theme toggle must not appear: the switch
  // is an app-level control the grid consumes by being legible, not by owning
  // it. The grid ships to four tables and to the preview harness; a control in
  // the primitive would be a control in all five.
  const dir = path.join(repoRoot, "components", "grid")
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))

  expect(files.length, "the grid primitive has gone missing").toBeGreaterThan(0)

  for (const name of files) {
    const text = readFileSync(path.join(dir, name), "utf8")

    expect(text, `components/grid/${name} carries a raw colour or a dark: variant`).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|\bwhite\b|\bblack\b|dark:/,
    )
    expect(text, `components/grid/${name} owns a theme toggle`).not.toMatch(
      /theme-toggle|ThemeToggle/,
    )
    // **No viewport unit anywhere under `components/grid/`.** The scroll
    // container used to be capped at `max-h-[70vh]`, and that cap was the cause of
    // both a nested scrollbar and a clipped final column: a viewport-fractioned
    // inner scroller inside a page that also scrolls produces a frame whose
    // geometry moves with the viewport, and the last column's right edge is
    // exactly where the horizontal scrollbar's thumb sits. The grid now takes the
    // height it is *given* (`flex-1` inside a bounded flex column), and there is
    // no honest reason for the primitive to know about the viewport at all.
    //
    // Banning the **unit** rather than the one literal value is the point: it also
    // rejects the `calc(100dvh - X)` substitution, which is the same guess with
    // more arithmetic — the offset above the grid is not a constant (the header
    // height, a tab row that wraps at narrow widths, and a scope notice that only
    // renders in preacher mode all move it). Asserting `70vh` alone would let that
    // form straight through.
    expect(text, `components/grid/${name} asserts a viewport fraction`).not.toMatch(
      /\d\s*(?:d?vh|d?vw|svh|lvh)\b/,
    )
  }
})

test("both apps' <html> open tags match and carry suppressHydrationWarning", () => {
  // **At the open tag, never as a whole-file md5.** `theme-contract.md`'s "Two-app
  // parity" section records why: the two `layout.tsx` files differ by intent —
  // branding, `themeColor`, icon paths — so they have never been byte-identical
  // and never will be. `<html>` is the one line the theme story edits in both,
  // and its absence shows up only as a console hydration mismatch on every load,
  // which is exactly the kind of defect that survives to production.
  const tags = ["folk", "gita-life"].map((app) => {
    const source = readFileSync(path.join(repoRoot, "apps", app, "app", "layout.tsx"), "utf8")
    const tag = source.match(/<html[^>]*>/)?.[0]

    expect(tag, `apps/${app}/app/layout.tsx has no <html> open tag`).toBeDefined()

    return tag as string
  })

  expect(tags[0], "the two apps' <html> tags must stay mirrored").toContain("suppressHydrationWarning")
  expect(tags[1], "the two apps' <html> tags must stay mirrored").toContain("suppressHydrationWarning")
  expect(tags[0], `apps/gita-life's <html> drifted from apps/folk's`).toBe(tags[1])
})

test("the two apps' .dark token blocks are identical", () => {
  // The story edits `.dark` in both `globals.css` files and the Verification
  // section checks it with a shell `diff`. A one-app token edit would otherwise
  // ship silently: the suite would go on measuring the app that was updated, and
  // the other app would quietly keep the old value. This is the same `sed`-shaped
  // extraction the diff runs — `/^\.dark {/,/^}/p` — so the guard and the manual
  // check cannot disagree about what "the `.dark` block" means.
  const blocks = ["folk", "gita-life"].map((app) => {
    const source = readFileSync(path.join(repoRoot, "apps", app, "app", "globals.css"), "utf8")
    const block = source.match(/^\.dark \{[\s\S]*?^\}/m)?.[0]

    expect(block, `apps/${app}/app/globals.css has no .dark block`).toBeDefined()

    return block as string
  })

  expect(
    blocks[0],
    "apps/gita-life's .dark block drifted from apps/folk's; the two must stay byte-identical",
  ).toBe(blocks[1])
})

test("the /manage surfaces carry no hardcoded colour", () => {
  // The theme story cleared twelve hardcoded sites under `/manage` — the ones
  // this replaces — and the story's Verification section checks the cleanup with
  // a manual grep. Reverting any one of them would fail no test otherwise, and
  // the regression is invisible in light mode: `bg-black/5` on a dark surface and
  // `bg-white/95` on a dark surface both "work" right up until a user toggles.
  const roots = [
    path.join(repoRoot, "components", "manage"),
    path.join(repoRoot, "apps", "folk", "app", "manage"),
    path.join(repoRoot, "apps", "gita-life", "app", "manage"),
  ]
  const forbidden = /bg-black\/5|bg-white\/95|bg-\[#FFF9F0\]/

  expect(
    roots.filter((root) => existsSync(root)),
    "a /manage tree has moved; this guard is guarding nothing",
  ).toHaveLength(roots.length)

  for (const root of roots) {
    for (const name of sourceFilesUnder(root)) {
      expect(readFileSync(path.join(root, name), "utf8"), `${root}/${name} reintroduced a raw colour`).not.toMatch(
        forbidden,
      )
    }
  }
})

/** Every `.ts`/`.tsx` file under `root`, recursively, as paths relative to `root`. */
function sourceFilesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return sourceFilesUnder(path.join(root, entry.name))
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) return []

    return [entry.name]
  })
}

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
