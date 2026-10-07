#!/usr/bin/env node
/**
 * configure-hosted-project.mjs — story 7.8: field-by-field Auth configuration
 * of the hosted Supabase project.
 *
 * `supabase config push` is deliberately NOT used. `supabase/config.toml`'s
 * `[auth]` section is the discarded local-Mailpit configuration, so pushing it
 * would repoint the hosted project's Auth at localhost. Every field is set
 * through the Management API instead.
 *
 * The script never trusts a 2xx. Supabase silently drops unknown PATCH keys —
 * that is exactly how `redirect_urls = null` survived the original setup — so
 * after PATCHing it re-reads `…/config/auth` and asserts each intended field.
 * That is what makes the exit code mean something.
 *
 * Usage:
 *   node scripts/configure-hosted-project.mjs --dry-run   # print the patch, change nothing
 *   node scripts/configure-hosted-project.mjs             # patch, then verify
 *
 * Options:
 *   --dry-run             Print the intended patch and exit. No request is sent.
 *   --project-ref <ref>   Override the project ref (default: derived from NEXT_PUBLIC_SUPABASE_URL).
 *
 * Credentials come from the gitignored `.env.migration.local`. Secret values
 * (`smtp_pass`, `smtp_user`, `SUPABASE_SERVICE_ROLE_KEY`,
 * `SUPABASE_ACCESS_TOKEN`, any Postgres password) are scrubbed from this
 * script's own output and are never sent in the patch.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
try {
  process.loadEnvFile(path.join(repoRoot, ".env.migration.local"))
} catch {
  // Fall back to an already-exported environment.
}

// ---------------------------------------------------------------------------
// Output redaction
//
// Registered before anything is printed, so no code path can leak a secret by
// forgetting to redact its own value. Every known secret is replaced by a
// placeholder rather than truncated, so a leaked value cannot be reconstructed
// from its own prefix.
// ---------------------------------------------------------------------------

const REDACTED = "***redacted***"
const secretValues = new Set()

function registerSecret(name) {
  const value = process.env[name]
  if (typeof value === "string" && value.length >= 8) {
    secretValues.add(value)
  }
}

for (const name of [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET",
  "SMTP_PASS",
  "SMTP_USER",
  "POSTGRES_PASSWORD",
  "OLD_SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_TOKEN",
  "PREVIEW_FIXTURE_PASSWORD",
]) {
  registerSecret(name)
}

// A Postgres URL embeds its password, so register the password separately.
for (const name of ["POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "OLD_POSTGRES_URL", "OLD_POSTGRES_URL_NON_POOLING"]) {
  const url = process.env[name]
  if (typeof url !== "string") continue
  try {
    const password = new URL(url).password
    if (password.length >= 8) secretValues.add(password)
  } catch {
    // Not a parseable URL; nothing to register.
  }
}

function redact(value) {
  if (value === null || value === undefined) return value
  const isString = typeof value === "string"
  let text = isString ? value : JSON.stringify(value)
  for (const secret of secretValues) {
    // Replace the JSON-escaped spelling too: a secret holding `"` or `\` is
    // escaped inside JSON.stringify, so matching the raw value would miss it.
    for (const spelling of new Set([secret, JSON.stringify(secret).slice(1, -1)])) {
      if (spelling && text.includes(spelling)) text = text.split(spelling).join(REDACTED)
    }
  }
  if (isString) return text
  // A substituted secret can only make the JSON unparseable if it held a quote;
  // fall back to the redacted text rather than throwing out of `log()`.
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function log(message = "") {
  console.log(redact(message))
}

function fail(message) {
  console.error(redact(`ERROR ${message}`))
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const dryRun = argv.includes("--dry-run")
const allowNonDisposable = argv.includes("--allow-non-disposable")
const refFlagIndex = argv.indexOf("--project-ref")
const refFlag = refFlagIndex === -1 ? argv.indexOf("--project-id") : refFlagIndex
const refFlagName = refFlagIndex === -1 ? "--project-id" : "--project-ref"
// Both spellings resolve to ONE index, and the value is read with THAT index.
// Reading it with `refFlagIndex` (which is -1 on the `--project-id` branch)
// silently yields argv[0] - the flag name itself - as the project ref, so the
// PATCH would target a project literally named `--project-id`.
const projectRefOverride = refFlag === -1 ? null : argv[refFlag + 1]
if (refFlag !== -1 && (!projectRefOverride || projectRefOverride.startsWith("--"))) {
  fail(`${refFlagName} requires a value, e.g. ${refFlagName} etwunirahuucodcxydgs`)
}

function requireEnv(name, purpose) {
  const value = process.env[name]?.trim()
  if (!value) {
    // Name the variable, never its value.
    fail(`${name} is not set (needed to ${purpose}). Set it in .env.migration.local or the environment.`)
  }
  return value
}

// ---------------------------------------------------------------------------
// Desired configuration
// ---------------------------------------------------------------------------

const ACCESS_TOKEN = requireEnv("SUPABASE_ACCESS_TOKEN", "call the Supabase Management API")

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "derive the project ref")
let derivedRef
try {
  derivedRef = new URL(supabaseUrl).hostname.split(".")[0]
} catch {
  fail("NEXT_PUBLIC_SUPABASE_URL is not a parseable URL")
}
const projectRef = projectRefOverride?.trim() || derivedRef

// `NEXT_PUBLIC_SITE_URL` is the name the repo documents (.env.example, and the
// var `apps/*/app/api/sessions/route.ts` builds attendance links from);
// `PRODUCTION_URL` is accepted as an alias. Only when neither is set does the
// go-live constant apply, so an operator who set the documented variable is not
// silently overridden by a hardcoded default.
const siteUrl = (
  process.env.PRODUCTION_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://folk-hkmc-rho.vercel.app"
).replace(/\/+$/, "")

try {
  const parsedSiteUrl = new URL(siteUrl)
  if (parsedSiteUrl.pathname !== "/" || !/^https?:$/.test(parsedSiteUrl.protocol)) {
    fail(`the site URL must be a bare http(s) origin, got "${siteUrl}"`)
  }
} catch {
  fail(`the site URL is not a parseable URL, got "${siteUrl}"`)
}

// An explicit ref override is the one way to aim this script at a project other
// than the disposable pre-cutover one the app is configured against, so it has
// to be asked for by name. A mistyped ref otherwise silently repoints hosted
// Auth config at a live project.
if (projectRefOverride && projectRef !== derivedRef && !allowNonDisposable) {
  fail(
    [
      `Refusing to configure ${projectRef} from ${refFlagName}: the app's own project is ${derivedRef},`,
      "which is the disposable pre-cutover project this script is written for.",
      `Re-run with ${refFlagName} ${derivedRef} to configure the right project, or pass`,
      "--allow-non-disposable if you really mean to change another project's Auth config.",
    ].join("\n"),
  )
}

// The allow-list is deliberately narrow: the go-live origin, the `/auth/confirm`
// child that `lib/site-url.ts#getAuthConfirmRedirectUrl` builds, and the local
// dev origin. Never `*.vercel.app`.
//
// The Management API takes `uri_allow_list` as a comma-separated string (an
// array is rejected with `expected string, received array`) and echoes it back
// in the same shape, so `readUriAllowList` normalizes either form.
const uriAllowList = [siteUrl, `${siteUrl}/auth/confirm`, "http://localhost:3000/**"]

function readUriAllowList(config) {
  const raw = config.uri_allow_list
  if (Array.isArray(raw)) return raw.map((entry) => String(entry).trim()).filter(Boolean)
  if (typeof raw === "string") return raw.split(",").map((entry) => entry.trim()).filter(Boolean)
  return []
}

async function readTemplate(fileName) {
  const templatePath = path.join(repoRoot, "supabase", "templates", fileName)
  try {
    return await readFile(templatePath, "utf8")
  } catch {
    fail(`supabase/templates/${fileName} could not be read — refusing to configure a template from memory`)
  }
}

const inviteTemplate = await readTemplate("invite.html")
const magicLinkTemplate = await readTemplate("magic-link.html")

const desired = {
  site_url: siteUrl,
  // Sent as the comma-separated string the Management API accepts; asserted
  // below against the parsed list.
  uri_allow_list: uriAllowList.join(","),
  smtp_admin_email: requireEnv("SMTP_SENDER_EMAIL", "set the Auth sender address"),
  smtp_sender_name: requireEnv("SMTP_SENDER_NAME", "set the Auth sender name"),
  mailer_templates_invite_content: inviteTemplate,
  mailer_templates_magic_link_content: magicLinkTemplate,
}

// ---------------------------------------------------------------------------
// Management API
// ---------------------------------------------------------------------------

const AUTH_CONFIG_URL = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`

async function apiFetch(method, body) {
  let response
  try {
    response = await fetch(AUTH_CONFIG_URL, {
      method,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    // Without this the rejection escapes `main()` as an unhandled rejection and
    // the run dies with no statement about whether the PATCH landed.
    fail(`${method} ${AUTH_CONFIG_URL} did not complete: ${error?.message ?? error}`)
  }
  const text = await response.text()
  if (!response.ok) {
    fail(`${method} ${AUTH_CONFIG_URL} -> HTTP ${response.status}: ${redact(text).slice(0, 500)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    fail(`${method} ${AUTH_CONFIG_URL} -> response was not JSON: ${redact(text).slice(0, 200)}`)
  }
}

function summaryOf(config) {
  return {
    site_url: config.site_url ?? null,
    uri_allow_list: readUriAllowList(config),
    smtp_admin_email: config.smtp_admin_email ?? null,
    smtp_sender_name: config.smtp_sender_name ?? null,
    smtp_host: config.smtp_host ?? null,
    mailer_templates_invite_content: config.mailer_templates_invite_content ? `<${config.mailer_templates_invite_content.length} chars>` : null,
    mailer_templates_magic_link_content: config.mailer_templates_magic_link_content ? `<${config.mailer_templates_magic_link_content.length} chars>` : null,
  }
}

log(`Hosted project : ${projectRef}  (ref derived from NEXT_PUBLIC_SUPABASE_URL: ${derivedRef})`)
log(`Site URL       : ${siteUrl}`)
log(`SMTP host      : ${process.env.SMTP_HOST ?? "(unchanged — not sent by this script)"}`)
log("")

if (dryRun) {
  log("--dry-run: no request will be sent. Intended PATCH to /config/auth:")
  log(JSON.stringify(redact({ ...desired, uri_allow_list: uriAllowList }), null, 2))
  log("")
  log("`uri_allow_list` is sent as a comma-separated string; the list above is the logical value.")
  log("Fields deliberately NOT sent: smtp_host, smtp_port, smtp_user, smtp_pass, security_captcha —")
  log("  SMTP is already configured on this project and a partial PATCH preserves it.")
  log("")
  log("--dry-run complete. Re-run without --dry-run to apply and verify.")
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Patch only what differs, so a re-run sends no values it does not need to.
// ---------------------------------------------------------------------------

const before = await apiFetch("GET")
log("Current auth config (secrets omitted):")
log(JSON.stringify(summaryOf(before), null, 2))
log("")

const patch = {}
for (const [field, wanted] of Object.entries(desired)) {
  const current = field === "uri_allow_list" ? readUriAllowList(before).join(",") : before[field]
  if (current !== wanted) patch[field] = wanted
}

if (Object.keys(patch).length === 0) {
  log("Auth config already matches the desired values; no PATCH sent.")
} else {
  log(`PATCHing ${Object.keys(patch).length} field(s): ${Object.keys(patch).join(", ")}`)
  await apiFetch("PATCH", patch)
}

// ---------------------------------------------------------------------------
// Verify by re-reading. Every field is asserted, not the ones we just sent.
// ---------------------------------------------------------------------------

const after = await apiFetch("GET")
const failures = []

const currentAllowList = readUriAllowList(after)
for (const origin of [siteUrl, `${siteUrl}/auth/confirm`]) {
  if (!currentAllowList.includes(origin)) {
    failures.push(`uri_allow_list does not admit ${origin}`)
  }
}
if (!currentAllowList.includes("http://localhost:3000/**")) {
  failures.push("uri_allow_list does not admit http://localhost:3000/**")
}
// Containment is not enough. Supabase can accept a PATCH without applying the
// field, and any extra entry - a stale preview host, a hostile origin - would
// then keep receiving invite and magic-link redirects on the project that
// becomes production. So the set must equal the intended set, no wider.
// The one legitimate extra is the `/**` suffix Supabase appends to some
// existing entries; that is normalized away before the comparison.
const normalized = (entries) => entries.map((entry) => String(entry).replace(/\/\*\*\/?$/, "").replace(/\/$/, ""))
const wantedAllowList = normalized(uriAllowList)
const actualAllowList = normalized(currentAllowList)
const extra = actualAllowList.filter((entry) => !wantedAllowList.includes(entry))
const missing = wantedAllowList.filter((entry) => !actualAllowList.includes(entry))
if (extra.length > 0) {
  failures.push(`uri_allow_list admits ${extra.length} entr(ies) outside the intended set: ${extra.join(", ")}`)
}
if (missing.length > 0) {
  failures.push(`uri_allow_list is missing ${missing.length} intended entr(ies): ${missing.join(", ")}`)
}
const wildcards = currentAllowList.filter((entry) => /(^|[^*])\*(\.|$)/.test(String(entry)))
if (wildcards.length > 0) {
  failures.push(`uri_allow_list carries a host wildcard (${wildcards.join(", ")}), which SPEC forbids`)
}

const templateChecks = [
  ["mailer_templates_invite_content", inviteTemplate],
  ["mailer_templates_magic_link_content", magicLinkTemplate],
]

log("Verification (each field re-read from the Management API):")
log(`  site_url = ${after.site_url}`)
if (after.site_url !== siteUrl) failures.push(`site_url is ${after.site_url}, expected ${siteUrl}`)
log(`  uri_allow_list = ${JSON.stringify(currentAllowList)}`)
log(`  uri_allow_list exact set = ${extra.length === 0 && missing.length === 0 ? "match" : `MISMATCH extra=${JSON.stringify(extra)} missing=${JSON.stringify(missing)}`}`)

log(`  smtp_admin_email = ${after.smtp_admin_email}`)
if (after.smtp_admin_email !== desired.smtp_admin_email) {
  failures.push(`smtp_admin_email is ${after.smtp_admin_email}, expected ${desired.smtp_admin_email}`)
}

log(`  smtp_sender_name = ${after.smtp_sender_name}`)
if (after.smtp_sender_name !== desired.smtp_sender_name) {
  failures.push(`smtp_sender_name is ${after.smtp_sender_name}, expected ${desired.smtp_sender_name}`)
}

for (const [field, expected] of templateChecks) {
  const actual = after[field]
  const ok = typeof actual === "string" && actual === expected
  log(`  ${field} ${ok ? "matches" : "MISMATCH"} supabase/templates/${field === "mailer_templates_invite_content" ? "invite.html" : "magic-link.html"}`)
  if (!ok) {
    failures.push(`${field} is ${actual === null || actual === undefined ? "null" : `<${String(actual).length} chars, expected ${expected.length}>`}, expected the contents of the template file`)
  }
}

log("")

if (failures.length > 0) {
  console.error(`${failures.length} field(s) did not reach the desired value:`)
  for (const line of failures) console.error(redact(`  - ${line}`))
  process.exit(1)
}

log("All fields verified against a fresh GET /config/auth.")
process.exit(0)
