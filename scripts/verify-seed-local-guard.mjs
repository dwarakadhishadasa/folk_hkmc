#!/usr/bin/env node
/**
 * verify-seed-local-guard.mjs — `pnpm test:seed-local-guard`.
 *
 * Everything asserted here is offline: no database, no reachable network, no
 * running stack. The executed cases point at `not-a-local-stack.invalid`, which
 * RFC 6761 reserves and which never resolves.
 *
 * Proves three layers:
 *
 *   1. **Units** — the predicates and parsers that the readiness check's
 *      wrong-target verdict rests on. A `null` normalisation silently compares
 *      equal to another `null`, so that policy needs its own assertion.
 *   2. **Executed refusals** — the seeder actually refusing, and each override
 *      route actually getting past the guard. The refusal must fire *before*
 *      any Supabase client is constructed, which is what makes these runs safe
 *      against a fake host: a refusal after `createClient` would still be
 *      correct in practice, but "zero network I/O" would be incidental rather
 *      than structural.
 *   3. **Wiring** — the wrapper's failure path and `dev:local`'s ordering, so
 *      `&& pnpm seed:local` cannot pass a failed seed into `pnpm dev`.
 *
 * Usage:
 *   pnpm test:seed-local-guard
 */

import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  assertLocalSupabaseTarget,
  endpointsAgree,
  isLocalSupabaseUrl,
  normalizeSupabaseEndpoint,
  parseSupabaseStatusEnv,
  sanitizeSupabaseUrl,
  unquoteEnvValue,
} from "./local-supabase-target.mjs"
import { resolveFixturePasswordDefault } from "./seed-local-fixtures.mjs"
import { countFromContentRange, parseArgs } from "./verify-local-stack-readiness.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SEEDER = path.join(repoRoot, "scripts", "seed-preview-fixtures.mjs")
const WRAPPER = path.join(repoRoot, "scripts", "seed-local-fixtures.mjs")

// `.invalid` is reserved by RFC 6761 and never resolves, so a downstream
// failure is fast and deterministic instead of a real network round-trip.
const FAKE_HOST_URL = "https://not-a-local-stack.invalid"
const HOSTED_URL = "https://etwunirahuucodcxydgs.supabase.co"
const LOCAL_URL = "http://127.0.0.1:54321"
const REFUSAL_MARKER = "Refusing to seed a non-local Supabase target"

// Every spawnSync below is bounded. A hijacking resolver or a hung CLI must
// fail this verifier rather than hang it — story 2 chains off these scripts.
const SPAWN_TIMEOUT_MS = 120000

const failures = []

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`)
    return
  }
  failures.push(detail ? `${label} — ${detail}` : label)
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`)
}

function section(title) {
  console.log(title)
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", timeout: SPAWN_TIMEOUT_MS, ...options })
}

function outputOf(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`
}

/** A run that got past the guard must fail on the network, not silently succeed. */
function failedDownstream(output) {
  return /fetch failed|getaddrinfo|ENOTFOUND|EAI_AGAIN|TypeError/i.test(output)
}

// ===========================================================================
// 1. The predicate
// ===========================================================================

section("Predicate (isLocalSupabaseUrl)")
check("hosted project URL is non-local", isLocalSupabaseUrl(HOSTED_URL) === false)
check("127.0.0.1 is local", isLocalSupabaseUrl(LOCAL_URL) === true)
check("localhost is local", isLocalSupabaseUrl("http://localhost:54321") === true)
check("::1 is local", isLocalSupabaseUrl("http://[::1]:54321") === true)
check("https on loopback is local", isLocalSupabaseUrl("https://localhost:54321") === true)
check("unparseable input is non-local (fail-closed)", isLocalSupabaseUrl("not a url at all") === false)
check("empty input is non-local (fail-closed)", isLocalSupabaseUrl("") === false)
check("undefined input is non-local (fail-closed)", isLocalSupabaseUrl(undefined) === false)
check("supabase.co lookalike on loopback-looking host is non-local", isLocalSupabaseUrl("https://localhost.evil.supabase.co") === false)

// ===========================================================================
// 2. assertLocalSupabaseTarget
// ===========================================================================

section("Assertion (assertLocalSupabaseTarget)")
check("local target passes", assertLocalSupabaseTarget({ url: LOCAL_URL }) === true)
check("empty target defers to requireEnv instead of refusing", assertLocalSupabaseTarget({ url: "" }) === false)

let refusal = null
try {
  assertLocalSupabaseTarget({ url: HOSTED_URL })
} catch (error) {
  refusal = error
}
check("hosted target throws", refusal !== null)
check("refusal names the host", refusal !== null && refusal.message.includes("etwunirahuucodcxydgs.supabase.co"))
check("refusal names --allow-non-local", refusal !== null && refusal.message.includes("--allow-non-local"))
check("refusal names SEED_ALLOW_NON_LOCAL=1", refusal !== null && refusal.message.includes("SEED_ALLOW_NON_LOCAL=1"))
check(
  "allowNonLocal returns false rather than throwing",
  assertLocalSupabaseTarget({ url: HOSTED_URL, allowNonLocal: true }) === false,
)

section("Credential redaction (sanitizeSupabaseUrl)")
// The refusal is emitted before the seeder registers its redaction filter, so a
// URL with userinfo would otherwise put a password on stderr.
const credentialUrl = "https://admin:s3cr3t-token@etwunirahuucodcxydgs.supabase.co"
check("sanitize strips userinfo", sanitizeSupabaseUrl(credentialUrl) === "https://etwunirahuucodcxydgs.supabase.co")
check("sanitize keeps the port and path around the stripped userinfo", sanitizeSupabaseUrl("https://u:p@host.example.com:54321/rest/v1") === "https://host.example.com:54321/rest/v1")
check("sanitize strips a username with no password", sanitizeSupabaseUrl("http://user@127.0.0.1:54321") === "http://127.0.0.1:54321")
check("sanitize leaves a credential-free URL untouched", sanitizeSupabaseUrl(HOSTED_URL) === HOSTED_URL)
check("sanitize leaves unparseable input untouched", sanitizeSupabaseUrl("not a url") === "not a url")
let credentialRefusal = null
try {
  assertLocalSupabaseTarget({ url: credentialUrl })
} catch (error) {
  credentialRefusal = error
}
check("refusal never echoes a userinfo password", credentialRefusal !== null && !credentialRefusal.message.includes("s3cr3t-token"))
check("refusal still names the host when userinfo was stripped", credentialRefusal !== null && credentialRefusal.message.includes("etwunirahuucodcxydgs.supabase.co"))

// ===========================================================================
// 3. Endpoint agreement — the wrong-target verdict
// ===========================================================================

section("Endpoint agreement (normalizeSupabaseEndpoint / endpointsAgree)")
check("hosted URL disagrees with the local stack", endpointsAgree(HOSTED_URL, LOCAL_URL) === false)
check("127.0.0.1 agrees with 127.0.0.1", endpointsAgree(LOCAL_URL, "http://127.0.0.1:54321") === true)
check("localhost agrees with 127.0.0.1", endpointsAgree("http://localhost:54321", LOCAL_URL) === true)
check("[::1] agrees with 127.0.0.1", endpointsAgree("http://[::1]:54321", LOCAL_URL) === true)
check("trailing slash agrees with no trailing slash", endpointsAgree("http://127.0.0.1:54321/", LOCAL_URL) === true)
check("default port agrees with explicit port", endpointsAgree("http://127.0.0.1:80", "http://127.0.0.1") === true)
check("unparseable value does NOT agree with a good value", endpointsAgree("not a url", LOCAL_URL) === false)
check("good value does NOT agree with an unparseable value", endpointsAgree(LOCAL_URL, "not a url") === false)
// The real hole: both normalise to null, so a bare `!==` would call these equal
// and readiness would report "agrees" for two values it could not read.
check("two unparseable values do NOT agree with each other", endpointsAgree("garbage a", "garbage b") === false)
check("two empty values do NOT agree with each other", endpointsAgree("", "") === false)
check("normalize returns null for unparseable input", normalizeSupabaseEndpoint("garbage") === null)
check("normalize tolerates a trailing slash", normalizeSupabaseEndpoint("http://127.0.0.1:54321/") === "127.0.0.1:54321")

// ===========================================================================
// 4. Shared parsers
// ===========================================================================

section("Status/env parsing (unquoteEnvValue / parseSupabaseStatusEnv)")
check("strips double quotes", unquoteEnvValue('"http://127.0.0.1:54321"') === "http://127.0.0.1:54321")
check("strips single quotes", unquoteEnvValue("'http://127.0.0.1:54321'") === "http://127.0.0.1:54321")
check("leaves an unquoted value untouched", unquoteEnvValue("http://127.0.0.1:54321") === "http://127.0.0.1:54321")
check("leaves a single character untouched", unquoteEnvValue('"') === '"')
check("leaves a mismatched pair untouched", unquoteEnvValue(`"value'`))
check("keeps an = inside a JWT (cut -d= -f2- hazard)", parseSupabaseStatusEnv('SERVICE_ROLE_KEY="a=b=c"').SERVICE_ROLE_KEY === "a=b=c")
check("parses API_URL from real status output", parseSupabaseStatusEnv('API_URL="http://127.0.0.1:54321"\nANON_KEY="x"').API_URL === "http://127.0.0.1:54321")
check("ignores non KEY=value lines", parseSupabaseStatusEnv('supabase local development setup is running.').API_URL === undefined)
check("tolerates empty input", Object.keys(parseSupabaseStatusEnv(undefined)).length === 0)

// ===========================================================================
// 5. Readiness argument parsing
// ===========================================================================

section("Readiness arguments (parseArgs)")
check("defaults to both app env files", parseArgs([]).appEnvFiles.length === 2, JSON.stringify(parseArgs([]).appEnvFiles))
check("--app-env-file narrows to one file", parseArgs(["--app-env-file=apps/folk/.env.local"]).appEnvFiles.length === 1)
check("--flag value form parses --min-rows", parseArgs(["--min-rows", "40"]).minRows === 40)
check("--flag=value form parses --min-rows", parseArgs(["--min-rows=40"]).minRows === 40)
check("--flag value form parses --mailpit-url", parseArgs(["--mailpit-url", "http://127.0.0.1:9"]).mailpitUrl === "http://127.0.0.1:9")
check("--flag=value form parses --mailpit-url", parseArgs(["--mailpit-url=http://127.0.0.1:9"]).mailpitUrl === "http://127.0.0.1:9")
check("default --min-rows is 1", parseArgs([]).minRows === 1)

for (const [label, argv, expected] of [
  ["unsupported flag names the flag and the supported set", ["--nope", "1"], "--nope"],
  ["trailing --min-rows names the flag", ["--min-rows"], "--min-rows"],
  ["--min-rows followed by another flag names the flag", ["--min-rows", "--mailpit-url", "x"], "--min-rows"],
  ["trailing --mailpit-url names the flag", ["--mailpit-url"], "--mailpit-url"],
  ["trailing --app-env-file names the flag", ["--app-env-file"], "--app-env-file"],
  ["trailing --timeout-ms names the flag", ["--timeout-ms"], "--timeout-ms"],
]) {
  let thrown = null
  try {
    parseArgs(argv)
  } catch (error) {
    thrown = error
  }
  check(label, thrown !== null && thrown.message.includes(expected), thrown ? thrown.message : "did not throw")
}

let zeroRows = null
try {
  parseArgs(["--min-rows", "0"])
} catch (error) {
  zeroRows = error
}
check("--min-rows 0 is rejected (non-zero is the requirement)", zeroRows !== null)

// ===========================================================================
// 6. PostgREST count parsing
// ===========================================================================

section("PostgREST counts (countFromContentRange)")
check("normal table parses to 24", countFromContentRange("0-0/24") === 24)
check("empty-table */0 form parses to 0 (not null)", countFromContentRange("*/0") === 0)
check("0 is falsy but not null — callers must compare with === null", countFromContentRange("*/0") !== null)
check("large count parses", countFromContentRange("0-0/1052") === 1052)
check("missing header parses to null", countFromContentRange(null) === null)
check("empty string parses to null", countFromContentRange("") === null)
check("unparseable header parses to null", countFromContentRange("garbage") === null)

// ===========================================================================
// 7. Fixture-password default — the one silent failure branch
// ===========================================================================

section("Fixture password default (resolveFixturePasswordDefault)")
// Breaking this condition to unconditional still prints `Total created: 0` and
// passes DW-3, while every seeded sign-in breaks — story 2 depends on this.
check("env var set → no default exported (seeder's env wins)", resolveFixturePasswordDefault({ envPassword: "FromEnv", seedFileExists: false }) === null)
check("seed file present → no default exported (file fallback wins)", resolveFixturePasswordDefault({ envPassword: undefined, seedFileExists: true }) === null)
check("neither source → local-only default exported", resolveFixturePasswordDefault({ envPassword: undefined, seedFileExists: false }) === "LocalDevFixture123!")

// ===========================================================================
// 8. dev:local ordering
// ===========================================================================

section("dev:local wiring (package.json)")
const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"))
const devLocalSteps = String(rootPackage.scripts?.["dev:local"] ?? "").split("&&").map((step) => step.trim())
const indexOfStep = (step) => devLocalSteps.indexOf(step)
check("dev:local contains `pnpm seed:local`", indexOfStep("pnpm seed:local") !== -1, devLocalSteps.join(" && "))
check("seed:local sits after supabase:env", indexOfStep("pnpm supabase:env") !== -1 && indexOfStep("pnpm seed:local") > indexOfStep("pnpm supabase:env"), devLocalSteps.join(" && "))
check("seed:local sits before dev", indexOfStep("pnpm dev") !== -1 && indexOfStep("pnpm seed:local") < indexOfStep("pnpm dev"), devLocalSteps.join(" && "))
check("readiness is exposed as local:readiness", rootPackage.scripts?.["local:readiness"] === "node scripts/verify-local-stack-readiness.mjs")

// ===========================================================================
// 9. Executed refusals
//
// Only reached when every in-process assertion passes, so a predicate bug never
// turns into a spawned run against a non-loopback host.
// ===========================================================================

if (failures.length > 0) {
  console.error("")
  console.error(`seed-local guard verification FAILED (${failures.length} problem(s)):`)
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}

const baseEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: FAKE_HOST_URL,
  SUPABASE_URL: FAKE_HOST_URL,
  SUPABASE_SERVICE_ROLE_KEY: "guard-verification-dummy-service-role-key",
  SEED_ALLOW_NON_LOCAL: "",
}

section("Executed refusal: both variables non-local")
const refused = run(process.execPath, [SEEDER], { env: baseEnv })
const refusedOutput = outputOf(refused)
check("seeder exits non-zero", refused.status !== 0, `exit ${refused.status}`)
check("seeder prints the refusal", refusedOutput.includes(REFUSAL_MARKER))
check("refusal names the fake host", refusedOutput.includes("not-a-local-stack.invalid"))
check("refusal names both override routes", refusedOutput.includes("--allow-non-local") && refusedOutput.includes("SEED_ALLOW_NON_LOCAL=1"))

// Without this case, dropping "SUPABASE_URL" from the seeder's guard loop — the
// loop covers both variables — would leave every other assertion green.
section("Executed refusal: loopback NEXT_PUBLIC_SUPABASE_URL, hosted SUPABASE_URL")
const split = run(process.execPath, [SEEDER], {
  env: { ...baseEnv, NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL, SUPABASE_URL: FAKE_HOST_URL },
})
const splitOutput = outputOf(split)
check("seeder exits non-zero", split.status !== 0, `exit ${split.status}`)
check("refusal fires on SUPABASE_URL alone", splitOutput.includes(REFUSAL_MARKER) && splitOutput.includes("SUPABASE_URL"))
check("refusal names the hosted variable's host", splitOutput.includes("not-a-local-stack.invalid"))

section("Executed override: --allow-non-local")
const flagOverride = run(process.execPath, [SEEDER, "--allow-non-local"], { env: baseEnv })
const flagOutput = outputOf(flagOverride)
check("override run does NOT print the refusal", !flagOutput.includes(REFUSAL_MARKER), "the guard was not skipped")
check("override run fails downstream on the network", flagOverride.status !== 0 && failedDownstream(flagOutput), `exit ${flagOverride.status}: ${flagOutput.trim().split("\n").find((line) => failedDownstream(line)) ?? "(no network error line)"}`)

section("Executed override: SEED_ALLOW_NON_LOCAL=1")
// The env route is documented and named in the refusal message; if it silently
// stopped working, every other assertion would still pass.
const envOverride = run(process.execPath, [SEEDER], { env: { ...baseEnv, SEED_ALLOW_NON_LOCAL: "1" } })
const envOutput = outputOf(envOverride)
check("override run does NOT print the refusal", !envOutput.includes(REFUSAL_MARKER), "the guard was not skipped")
check("override run fails downstream on the network", envOverride.status !== 0 && failedDownstream(envOutput), `exit ${envOverride.status}`)

// ===========================================================================
// 10. Wrapper failure path and exit-code forwarding
// ===========================================================================

section("Wrapper: unreadable `supabase status` names the remedy")
const emptyPath = mkdtempSync(path.join(tmpdir(), "seed-guard-nopath-"))
const unreadable = run(process.execPath, [WRAPPER], { env: { ...process.env, PATH: emptyPath } })
const unreadableOutput = outputOf(unreadable)
check("wrapper exits 1", unreadable.status === 1, `exit ${unreadable.status}`)
check("message names `pnpm supabase:start`", unreadableOutput.includes("pnpm supabase:start"))
check("message does not claim it exited null", !unreadableOutput.includes("exited null"))

section("Wrapper: a failing seeder must not exit 0")
// `dev:local` chains `&& pnpm seed:local && pnpm dev`, so a swallowed child
// failure would start the app against an unseeded database. A stub `pnpm`
// reports a non-loopback API_URL, so the seeder refuses and the wrapper must
// forward that non-zero exit.
const stubDir = mkdtempSync(path.join(tmpdir(), "seed-guard-stub-"))
const stubPnpm = path.join(stubDir, "pnpm")
writeFileSync(
  stubPnpm,
  `#!/bin/sh\nif [ "$1" = "dlx" ]; then\n  echo 'API_URL="${FAKE_HOST_URL}"'\n  echo 'SERVICE_ROLE_KEY="stub-key"'\n  exit 0\nfi\nexit 127\n`,
  { mode: 0o755 },
)
chmodSync(stubPnpm, 0o755)
const forwarded = run(process.execPath, [WRAPPER], { env: { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ""}` } })
const forwardedOutput = outputOf(forwarded)
check("wrapper forwards the child's non-zero exit", forwarded.status === 1, `exit ${forwarded.status}`)
check("the forwarded failure is the seeder's refusal", forwardedOutput.includes(REFUSAL_MARKER))
rmSync(stubDir, { recursive: true, force: true })
rmSync(emptyPath, { recursive: true, force: true })

// ===========================================================================

console.log("")
if (failures.length > 0) {
  console.error(`seed-local guard verification FAILED (${failures.length} problem(s)):`)
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}
console.log("seed-local guard verification passed.")
process.exit(0)
