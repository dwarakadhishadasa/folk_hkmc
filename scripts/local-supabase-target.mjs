#!/usr/bin/env node
/**
 * local-supabase-target.mjs — the single definition of "is this the local
 * Supabase stack?", shared by the seeder, its readiness check, and their
 * verifier.
 *
 * Three copies of this predicate would drift, and a drifted predicate is a
 * silent data-mutation bug: the seeder writes to the hosted pre-cutover
 * project while the app reads empty local Postgres. One module, one answer —
 * including the `NAME="value"` parser, which is duplicated in two callers and
 * would drift the same way.
 *
 * `isLocalSupabaseUrl` is deliberately **fail-closed**: anything it cannot
 * prove is loopback — including the empty string and unparseable input — is
 * classified non-local. The seeder's default target (`etwunirahuucodcxydgs
 * .supabase.co`) is therefore always refused, which is the intended outcome.
 */

/** Loopback hostnames. `::1` parses as `[::1]`, so both spellings are listed. */
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

function parse(url) {
  const raw = typeof url === "string" ? url.trim() : ""
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/**
 * True only for `127.0.0.1` / `localhost` / `::1`, any scheme.
 * Unparseable or empty input → false.
 */
export function isLocalSupabaseUrl(url) {
  const parsed = parse(url)
  if (!parsed) return false
  return LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())
}

/**
 * Strips credentials from a URL so it is safe to print.
 *
 * The refusal message is emitted before the seeder registers its redaction
 * filter, so a URL carrying userinfo (`https://user:token@host`) would put a
 * credential on stderr. Everything printed from these helpers goes through
 * here.
 */
export function sanitizeSupabaseUrl(url) {
  const raw = typeof url === "string" ? url.trim() : ""
  if (!raw) return raw
  const parsed = parse(raw)
  // Nothing parseable, so nothing to strip — and re-quoting it as a URL would
  // lie about what was configured. Return it unchanged.
  if (!parsed) return raw
  if (!parsed.username && !parsed.password) return raw

  // The userinfo is cut textually rather than via `parsed.toString()`, which
  // would reserialise the URL and append a trailing slash. A message the
  // operator reads should look like the value they configured, minus the
  // credential — and the password must not survive in any form, so the whole
  // `user:pass@` span is dropped rather than rewritten.
  const schemeEnd = raw.indexOf("//")
  if (schemeEnd === -1) return raw
  const userinfoStart = schemeEnd + 2
  // The authority runs to the first `/`, `?` or `#` after the `//`.
  const authorityTail = raw.slice(userinfoStart)
  const authorityEnd = userinfoStart + (authorityTail.search(/[/?#]/) === -1 ? authorityTail.length : authorityTail.search(/[/?#]/))
  // `lastIndexOf` because a literal `@` in a password must not be mistaken for
  // the userinfo terminator (a percent-encoded one is `%40` and cannot match).
  const at = raw.lastIndexOf("@", authorityEnd)
  if (at === -1 || at < userinfoStart) return raw
  return `${raw.slice(0, userinfoStart)}${raw.slice(at + 1)}`
}

/**
 * The host to name in a refusal message, or a stable placeholder when the
 * value is empty or unparseable. Never includes userinfo.
 */
export function describeSupabaseHost(url) {
  const raw = typeof url === "string" ? url.trim() : ""
  if (!raw) return "(unset)"
  const parsed = parse(raw)
  if (!parsed) return `${sanitizeSupabaseUrl(raw)} (not a parseable URL)`
  return parsed.host
}

/**
 * Refuses a non-loopback target by throwing. Three outcomes:
 *
 *   - local target → returns `true`, no throw.
 *   - non-local target with `allowNonLocal` → returns `false`, no throw.
 *   - non-local target without it → **throws**; this is the refusal.
 *
 * Empty input is a fourth, deliberate case: it returns `false` without
 * throwing. There is nothing to classify, and the seeder's own `requireEnv`
 * reports a missing variable in its own words, which beats a refusal here.
 * Only a *present but non-loopback* value is a refusal.
 */
export function assertLocalSupabaseTarget({ url, allowNonLocal = false, variableName = "NEXT_PUBLIC_SUPABASE_URL" } = {}) {
  const raw = typeof url === "string" ? url.trim() : ""

  // Nothing to classify. Let the seeder's requireEnv report the missing
  // variable with its own, better-worded message.
  if (!raw) return false

  if (isLocalSupabaseUrl(raw)) return true
  if (allowNonLocal) return false

  const host = describeSupabaseHost(raw)
  throw new Error(
    [
      `Refusing to seed a non-local Supabase target: ${variableName} is ${sanitizeSupabaseUrl(raw)} (host ${host}).`,
      "",
      "This script writes rows. Against the hosted project that mutates pre-cutover",
      "data the app is not reading, while the app silently renders empty local",
      "Postgres. Use `pnpm seed:local`, which exports local credentials first and",
      "never reaches this guard.",
      "",
      "If you genuinely mean to seed a non-local project, pass `--allow-non-local`",
      "or set SEED_ALLOW_NON_LOCAL=1. There is no implicit override.",
    ].join("\n"),
  )
}

/**
 * Reduces a URL to `host:port`, treating the loopback spellings as one and
 * ignoring a trailing slash. Returns `null` for empty or unparseable input.
 */
export function normalizeSupabaseEndpoint(url) {
  const parsed = parse(url)
  if (!parsed) return null
  let host = parsed.hostname.toLowerCase()
  if (host === "localhost" || host === "::1" || host === "[::1]") host = "127.0.0.1"
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80")
  return `${host}:${port}`
}

/**
 * Whether two endpoints are the same stack.
 *
 * The `null` case is the whole point of this helper. `normalizeSupabaseEndpoint`
 * returns `null` for unparseable input, so two garbage values would compare
 * equal under a bare `!==` and a readiness check driven that way would report
 * "agrees" for two values it could not read. Unparseable is therefore always a
 * disagreement — fail-closed, same as `isLocalSupabaseUrl`.
 */
export function endpointsAgree(a, b) {
  const left = normalizeSupabaseEndpoint(a)
  const right = normalizeSupabaseEndpoint(b)
  if (left === null || right === null) return false
  return left === right
}

/**
 * Removes one surrounding quote pair. `supabase status -o env` emits
 * `NAME="value"`; the quotes are part of the output, not part of the value.
 * Single quotes are tolerated too, because nothing guarantees which shell
 * quoting style produced a given status dump.
 *
 * `scripts/use-local-supabase-env.sh` deliberately keeps the quotes because
 * `dotenv` tolerates them in env *files* — but here the values land in
 * `process.env` and in URL comparisons, where a leading `"` corrupts both.
 */
export function unquoteEnvValue(value) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (trimmed.length < 2) return trimmed
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Parses `supabase status -o env` output into a plain name → value map, with
 * the quotes stripped. Shared so the wrapper and the readiness check cannot
 * disagree about what a credential value is.
 */
export function parseSupabaseStatusEnv(stdout) {
  const values = {}
  for (const line of String(stdout ?? "").split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
    if (match) values[match[1]] = unquoteEnvValue(match[2])
  }
  return values
}
