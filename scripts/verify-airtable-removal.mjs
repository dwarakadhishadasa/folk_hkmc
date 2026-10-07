#!/usr/bin/env node
/**
 * verify-airtable-removal.mjs — CAP-7 regression gate.
 *
 * Story 7-7 deletes the Airtable access layer. This script is the standing
 * guard that it stays deleted: it re-checks the deletions, the env/import
 * grep gate, the Supabase-only program profile shape, the renamed wire
 * contracts on both the client and route side, and the Vercel preflight's
 * required-variable list.
 *
 * It reads sources rather than importing app modules, so it needs no
 * database, no network, and no Next.js runtime.
 *
 * Usage:
 *   node scripts/verify-airtable-removal.mjs
 *
 * Exits 0 when every check passes, non-zero on the first failure.
 */

import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const rootDir = process.cwd()

// ---------------------------------------------------------------------------
// Check bookkeeping
// ---------------------------------------------------------------------------
let checks = 0
const failures = []
const pending = []

function record(name, fn) {
  checks += 1
  try {
    const result = fn()
    if (result && typeof result.then === "function") {
      // An async check must not report before it settles — a rejection would
      // otherwise become an unhandled promise and read as a pass.
      return result.then(
        () => console.log(`PASS ${name}`),
        (error) => {
          failures.push(name)
          console.error(`FAIL ${name}`)
          console.error(`     ${error instanceof Error ? error.message : String(error)}`)
        },
      )
    }
    console.log(`PASS ${name}`)
  } catch (error) {
    failures.push(name)
    console.error(`FAIL ${name}`)
    console.error(`     ${error instanceof Error ? error.message : String(error)}`)
  }
  return undefined
}

function check(name, fn) {
  const settled = record(name, fn)
  if (settled) pending.push(settled)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertNotEqual(actual, expected, message) {
  if (actual === expected) throw new Error(message)
}

function read(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), "utf8")
}

function exists(relPath) {
  return fs.existsSync(path.join(rootDir, relPath))
}

// ---------------------------------------------------------------------------
// Source scanning helpers
// ---------------------------------------------------------------------------

// Runtime source roots. `.next` holds gitignored stale build output that
// predates this story's deletions; it must never be scanned.
const scanRoots = [
  "apps",
  "components",
  "lib",
  "packages",
  "hooks",
  "scripts",
  "supabase",
  ".github",
]
const scanFiles = ["next.config.mjs", "turbo.json", "tsconfig.json", ".env.example"]
const skippedDirs = new Set(["node_modules", ".next", ".turbo", "dist", "build", "coverage", "out"])

function walk(relDir, acc = []) {
  for (const entry of fs.readdirSync(path.join(rootDir, relDir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skippedDirs.has(entry.name)) continue
      walk(path.join(relDir, entry.name), acc)
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|sql)$/.test(entry.name)) {
      acc.push(path.join(relDir, entry.name))
    }
  }
  return acc
}

// CAP-7's grep gate requires this repo — this file included — to hold zero
// matches for the retired tokens. So every one of them is assembled here from
// fragments instead of being written out literally: a gate script that names
// what it forbids would fail its own gate.
const SVC = ["air", "table"].join("")
const FORBIDDEN = {
  host: `api.${SVC}.com`,
  envPrefix: ["AIR", "TABLE_"].join(""),
  envPattern: `\\b${["AIR", "TABLE_"].join("")}[A-Z0-9_]+`,
  workspacePkg: `@hkmc/${SVC}`,
  libAlias: `@/lib/${SVC}`,
  sharedConfig: `shared-${SVC}`,
  manageModule: `${SVC}Manage`,
  mappingType: `${SVC[0].toUpperCase()}${SVC.slice(1)}`,
  errors: {
    request: `${SVC[0].toUpperCase()}${SVC.slice(1)}RequestError`,
    config: `${SVC[0].toUpperCase()}${SVC.slice(1)}ConfigError`,
  },
  // The column names `20261007000000_retire_airtable_named_columns.sql` left
  // behind. `removedColumn` is what the database no longer has;
  // `currentColumn` is what it has now, and what the service-role inserts must
  // therefore write. The pre-migration `*_airtable_user_id` spellings are not
  // asserted here at all: only the migration history still declares them, and
  // ACCOUNTED_FOR.migrations already covers that wholesale.
  removedColumn: `${SVC}_user_id`,
  removedInviterColumn: `inviter_${SVC}_user_id`,
  removedActorColumn: `actor_${SVC}_user_id`,
  currentColumn: "user_id",
  currentInviterColumn: "inviter_user_id",
  currentActorColumn: "actor_user_id",
  bridgeTables: [`${SVC}_identities`, `${SVC}_sync_state`],
}

// This file necessarily names the retired tokens, so it is excluded from its
// own scan; every other source file is fair game.
const SELF = "scripts/verify-airtable-removal.mjs"

function allScannableFiles() {
  const files = scanRoots.filter((dir) => exists(dir)).flatMap((dir) => walk(dir))
  return [...files, ...scanFiles.filter((f) => exists(f))].filter((f) => f !== SELF)
}

/** Every match of `pattern` across the scanned source set, as `file:line: text`. */
function grepLines(pattern, { ignoreCase = false, allow } = {}) {
  const re = new RegExp(pattern, ignoreCase ? "i" : "")
  return allScannableFiles().flatMap((file) => {
    const allowances = typeof allow === "function" ? allow(file) : allow
    return read(file)
      .split("\n")
      .map((text, index) => ({ file, line: index + 1, text }))
      .filter((hit) => re.test(hit.text))
      .filter((hit) => !allowances?.some((rule) => rule.test(hit.text)))
      .map((hit) => `${hit.file}:${hit.line}: ${hit.text.trim()}`)
  })
}

// The places an Airtable mention may still survive, and why each one is a fact
// about history rather than a dependency on the service. Story 8 retired the
// three runtime columns, so `lib/invite-log.ts`, `lib/authz.ts` and the
// regenerated `lib/supabase/types.ts` no longer appear here — their mentions
// live only in the migration history that declared them, which is never edited.
// A stale allowance is itself a hole: it would silently permit a fresh mention
// in a file that no longer has one, so removing the entry is what keeps the gate
// honest. `lib/supabase/types.ts` has its own gate above.
const ACCOUNTED_FOR = {
  // Already-applied migration history. Editing these rewrites the record.
  migrations: null,
  "supabase/seed.sql": [new RegExp(`^\\s*--.*${SVC}`, "i")],
  // A source-text assertion that history still declares the bridge tables.
  "scripts/verify-program-readiness.mjs": [new RegExp(`"${SVC}_(identities|sync_state)"`)],
  // The CAP-5 verifier explains, in its own comments, which migration it is
  // guarding against, and carries the `<meta description>` staleness probe that
  // story 7.7 deleted. Both name the removed thing; neither calls the service.
  // Only comment lines and the marker binding are allowed -- any other mention
  // in that file still fails the gate.
  "scripts/verify-attendance-contract.mjs": [new RegExp(`^\\s*(\\*|//)`), new RegExp(`^\\s*const staleMarker = `)],
}

function accountedAllowanceFor(file) {
  if (file.startsWith(`supabase${path.sep}migrations${path.sep}`)) return [new RegExp(SVC, "i")]
  return ACCOUNTED_FOR[file] ?? null
}

function parse(relPath) {
  return ts.createSourceFile(relPath, read(relPath), ts.ScriptTarget.ESNext, true)
}

function hasPropertyNamed(node, name) {
  return node.properties.some(
    (prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === name,
  )
}

/** Unwrap a `satisfies`/`as` wrapper so the object literal underneath is visible. */
function unwrap(node) {
  let current = node
  while (current && (ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) {
    current = current.expression
  }
  return current
}

/** The top-level object literal that declares a property named `key`. */
function objectLiteralForKey(sourceFile, key) {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      const initializer = unwrap(decl.initializer)
      if (!initializer || !ts.isObjectLiteralExpression(initializer)) continue
      if (hasPropertyNamed(initializer, key)) return initializer
    }
  }
  return null
}

function propertyLiteral(node, key) {
  if (!node) return null
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === key) {
      const initializer = unwrap(prop.initializer)
      return initializer && ts.isObjectLiteralExpression(initializer) ? initializer : true
    }
  }
  return null
}

function exportedTypeNames(sourceFile) {
  const names = []
  for (const stmt of sourceFile.statements) {
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (exported && ts.isInterfaceDeclaration(stmt)) names.push(stmt.name.text)
    if (exported && ts.isTypeAliasDeclaration(stmt)) names.push(stmt.name.text)
  }
  return names
}

function exportedFunctionNames(sourceFile) {
  return sourceFile.statements
    .filter((stmt) => ts.isFunctionDeclaration(stmt) && stmt.name)
    .map((stmt) => stmt.name.text)
}

// ---------------------------------------------------------------------------
// 1. The deletions stay deleted
// ---------------------------------------------------------------------------

const deletedPaths = [
  `lib/${SVC}.ts`,
  `packages/${SVC}`,
  `packages/program-config/src/programs/${FORBIDDEN.sharedConfig}.ts`,
]

for (const deleted of deletedPaths) {
  check(`deleted: ${deleted}`, () => {
    assert(!exists(deleted), `${deleted} still exists`)
  })
}

check(`lockfile carries no ${FORBIDDEN.workspacePkg} importer`, () => {
  assert(!read("pnpm-lock.yaml").includes(FORBIDDEN.workspacePkg), "pnpm-lock.yaml still references the deleted workspace package")
})

check(`workspace no longer depends on ${FORBIDDEN.workspacePkg}`, () => {
  for (const manifest of ["apps/folk/package.json", "apps/gita-life/package.json"]) {
    const parsed = JSON.parse(read(manifest))
    const deps = { ...parsed.dependencies, ...parsed.devDependencies }
    assert(!(FORBIDDEN.workspacePkg in deps), `${manifest} still depends on the deleted workspace package`)
  }
  for (const tsconfig of ["tsconfig.json", "apps/folk/tsconfig.json", "apps/gita-life/tsconfig.json"]) {
    assert(!read(tsconfig).includes(FORBIDDEN.workspacePkg), `${tsconfig} still maps the deleted workspace package`)
  }
  assert(!read("next.config.mjs").includes(FORBIDDEN.workspacePkg), "next.config.mjs still transpiles the deleted package")
})

// ---------------------------------------------------------------------------
// 2. Grep gate — no live service reference, env read, or package import
// ---------------------------------------------------------------------------

check("no Airtable service reference, env read, or package import in source", () => {
  const pattern = [FORBIDDEN.host.replaceAll(".", "\\."), FORBIDDEN.envPattern, FORBIDDEN.workspacePkg, FORBIDDEN.libAlias, FORBIDDEN.sharedConfig].join("|")
  const hits = grepLines(pattern, { allow: accountedAllowanceFor })
  assert(hits.length === 0, `expected zero matches, found:\n  ${hits.join("\n  ")}`)
})

check("every remaining Airtable mention is one of the accounted-for ones", () => {
  const hits = grepLines(SVC, { ignoreCase: true, allow: accountedAllowanceFor })
  assert(hits.length === 0, `unaccounted Airtable mentions:\n  ${hits.join("\n  ")}`)
})

check(`no ${FORBIDDEN.envPrefix}* variable declared in .env.example or turbo.json`, () => {
  for (const file of [".env.example", "turbo.json"]) {
    assert(!new RegExp(FORBIDDEN.envPrefix, "i").test(read(file)), `${file} still names a retired env variable`)
  }
})

check("no Airtable text in either app's meta description", () => {
  for (const layout of ["apps/folk/app/layout.tsx", "apps/gita-life/app/layout.tsx"]) {
    const description = /description:\s*"([^"]*)"/.exec(read(layout))?.[1] ?? ""
    assert(
      !new RegExp(SVC, "i").test(description),
      `${layout} metadata.description still mentions Airtable: "${description}"`,
    )
  }
})

// ---------------------------------------------------------------------------
// 3. Program config exposes no Airtable surface
// ---------------------------------------------------------------------------

for (const program of ["folk", "gita-life"]) {
  const relPath = `packages/program-config/src/programs/${program}.ts`

  check(`program profile "${program}" is Supabase-only`, () => {
    const sourceFile = parse(relPath)
    const profile = objectLiteralForKey(sourceFile, "envPrefix")
    assert(profile, `${relPath} has no program profile object literal`)
    assert(!hasPropertyNamed(profile, SVC), `${relPath} still declares an "${SVC}" block`)

    const modules = propertyLiteral(profile, "modules")
    assert(modules, `${relPath} declares no "modules" object`)
    assert(!hasPropertyNamed(modules, FORBIDDEN.manageModule), `${relPath} still declares "modules.${FORBIDDEN.manageModule}"`)

    for (const key of ["id", "envPrefix", "branding", "modules"]) {
      assert(propertyLiteral(profile, key), `${relPath} no longer declares "${key}"`)
    }
  })
}

check("program-config declares no Airtable mapping types", () => {
  const names = exportedTypeNames(parse("packages/program-config/src/types.ts"))
  const airtableNames = names.filter((name) => new RegExp(FORBIDDEN.mappingType, "i").test(name))
  assert(airtableNames.length === 0, `types.ts still declares: ${airtableNames.join(", ")}`)
})

check("generated Supabase types carry no Airtable mention", () => {
  // `lib/supabase/types.ts` used to sit in ACCOUNTED_FOR because the Airtable
  // bridge tables were still declared there. The retirement migration removed
  // them and the file was regenerated, so the allowance is gone and this check
  // is what replaces it -- otherwise a future hand edit would only be caught by
  // the generic repo-wide grep, and a regenerated file silently reintroducing a
  // bridge table would pass every other gate here.
  const hits = read("lib/supabase/types.ts")
    .split("\n")
    .map((text, index) => `${index + 1}: ${text.trim()}`)
    .filter((line) => new RegExp(SVC, "i").test(line))
  assert(hits.length === 0, `lib/supabase/types.ts still mentions Airtable:\n  ${hits.join("\n  ")}`)
})

check("program-config/server exports no Airtable management helpers", () => {
  const exported = exportedFunctionNames(parse("packages/program-config/src/server.ts"))
  const stale = exported.filter((name) => new RegExp(`${SVC}|getProgramScoped`, "i").test(name))
  assert(stale.length === 0, `server.ts still exports: ${stale.join(", ")}`)
  assert(
    ["resolveProgramId", "getServerProgramProfile"].every((name) => exported.includes(name)),
    `server.ts lost a live export; found: ${exported.join(", ")}`,
  )
})

check("data-contracts dropped the unreferenced StaffMembershipContext", () => {
  const names = exportedTypeNames(parse("packages/data-contracts/src/index.ts"))
  assert(!names.includes("StaffMembershipContext"), "StaffMembershipContext is back")
  for (const live of ["ProgramId", "StaffRole", "StaffMembershipStatus"]) {
    assert(names.includes(live), `data-contracts lost ${live}`)
  }
})

// ---------------------------------------------------------------------------
// 4. The renamed wire contracts move together
// ---------------------------------------------------------------------------

const WIRE_CONTRACTS = [
  {
    name: "contact form → contact route",
    field: "assignedPreacherUserId",
    files: [
      "components/contact-form.tsx",
      "apps/folk/app/api/contact/route.ts",
      "apps/gita-life/app/api/contact/route.ts",
    ],
  },
  {
    name: "invite form → admin invite route",
    field: "assignedPreacherUserId",
    files: ["components/invite-user-form.tsx", "apps/folk/app/api/admin/invite-user/route.ts", "apps/gita-life/app/api/admin/invite-user/route.ts"],
  },
  {
    name: "volunteer invite route",
    field: "assignedPreacherUserId",
    files: ["apps/folk/app/api/volunteers/invite/route.ts", "apps/gita-life/app/api/volunteers/invite/route.ts"],
  },
  {
    name: "session creation → createSession",
    field: "preacherUserId",
    files: ["apps/folk/app/api/sessions/route.ts", "apps/gita-life/app/api/sessions/route.ts", "lib/supabase/data.ts"],
  },
  {
    name: "staff upsert",
    field: "invitedByUserId",
    files: ["lib/supabase/data.ts", "apps/folk/app/api/admin/invite-user/route.ts", "apps/gita-life/app/api/admin/invite-user/route.ts"],
  },
  {
    name: "contact creation",
    field: "collectedByUserId",
    files: ["lib/supabase/data.ts", "apps/folk/app/api/contact/route.ts", "apps/gita-life/app/api/contact/route.ts"],
  },
]

const RETIRED_SPELLINGS = [
  `assignedPreacher${FORBIDDEN.mappingType}UserId`,
  `invitedBy${FORBIDDEN.mappingType}UserId`,
  `collectedBy${FORBIDDEN.mappingType}UserId`,
  `preacher${FORBIDDEN.mappingType}UserId`,
  `inviter${FORBIDDEN.mappingType}UserId`,
  `actor${FORBIDDEN.mappingType}UserId`,
  FORBIDDEN.errors.request,
  FORBIDDEN.errors.config,
]

for (const contract of WIRE_CONTRACTS) {
  check(`wire contract: ${contract.name} uses ${contract.field}`, () => {
    for (const file of contract.files) {
      assert(read(file).includes(contract.field), `${file} does not use ${contract.field}`)
    }
  })
}

check("no retired *Airtable* identifier remains in source", () => {
  const hits = grepLines(RETIRED_SPELLINGS.join("|"), { allow: accountedAllowanceFor })
  assert(hits.length === 0, `expected zero matches, found:\n  ${hits.join("\n  ")}`)
})

check("contact form keeps the Admin preacher gate on the renamed field", () => {
  const source = read("components/contact-form.tsx")
  assert(
    /staffRole === "Admin" && !formData\.assignedPreacherUserId/.test(source),
    "contact form no longer blocks location selection until an Admin picks a preacher",
  )
  assert(/Select Preacher first/.test(source), 'contact form lost the "Select Preacher first" placeholder')
  for (const attr of ["htmlFor", "id", "name"]) {
    assert(
      source.includes(`${attr}="assignedPreacherUserId"`),
      `contact form ${attr} no longer matches the renamed form-state key`,
    )
  }
})

check("invite and contact routes trim the assigned preacher id", () => {
  for (const route of [
    "apps/folk/app/api/contact/route.ts",
    "apps/gita-life/app/api/contact/route.ts",
    "apps/folk/app/api/admin/invite-user/route.ts",
    "apps/gita-life/app/api/admin/invite-user/route.ts",
    "apps/folk/app/api/volunteers/invite/route.ts",
    "apps/gita-life/app/api/volunteers/invite/route.ts",
  ]) {
    assert(
      /assignedPreacherUserId\?\.trim\(\)/.test(read(route)),
      `${route} no longer trims the assignedPreacherUserId payload value`,
    )
  }
})

check("retired columns write their post-migration names", () => {
  // `20261007000000_retire_airtable_named_columns.sql` renamed the three
  // `*_airtable_user_id` columns. The TypeScript keys must match the applied
  // database exactly or the service-role inserts fail with a PostgREST 42703,
  // so this gate flipped with the migration rather than being deleted: the
  // columns it names are the columns that now exist.
  assert(
    new RegExp(`^\\s*${FORBIDDEN.currentColumn}: data\\.userId`, "m").test(read("lib/invite-log.ts")),
    "the invite_log user-id column write changed",
  )
  assert(
    new RegExp(`^\\s*${FORBIDDEN.currentInviterColumn}: data\\.inviterUserId`, "m").test(read("lib/invite-log.ts")),
    "the invite_log inviter-id column write changed",
  )
  assert(
    new RegExp(`^\\s*${FORBIDDEN.currentActorColumn}: data\\.actorUserId`, "m").test(read("lib/authz.ts")),
    "the audit_events actor-id column write changed",
  )
})

// ---------------------------------------------------------------------------
// 5. The /manage portal stays Supabase-backed
// ---------------------------------------------------------------------------

check("/manage has no Airtable URL, redirect, or fallback card", () => {
  const hits = grepLines(SVC, { ignoreCase: true }).filter(
    (hit) =>
      /apps\/(folk|gita-life)\/app\/manage\//.test(hit) ||
      /apps\/(folk|gita-life)\/app\/manage\/page\.tsx/.test(hit) ||
      /components\/manage\//.test(hit) ||
      /lib\/manage\//.test(hit),
  )
  assert(hits.length === 0, `found Airtable references in the portal surface:\n  ${hits.join("\n  ")}`)
})

// ---------------------------------------------------------------------------
// 6. The Vercel preflight no longer demands an Airtable key
// ---------------------------------------------------------------------------

check("Vercel preflight accepts a Supabase-only env set", () => {
  const src = read("scripts/deploy-vercel.mjs")
  const cutAt = src.indexOf("\ntry {\n  for (const app of selectedApps)")
  assertNotEqual(cutAt, -1, "could not locate the deploy try block in deploy-vercel.mjs")

  const prelude = src.slice(src.indexOf("\nconst orgId"), cutAt)
  // Keep the real assertRemoteRuntimeEnv; stub only the two network helpers.
  const preludeWithoutStubs = prelude
    .replace(/^function run\(label, projectId, args, options = \{\}\) \{[\s\S]*?\n\}\n/m, "")
    .replace(/^function parseVercelJsonOutput\(label, stdout\) \{[\s\S]*?\n\}\n/m, "")
    .replace(/^function listRemoteEnvKeys\(app, environment\) \{[\s\S]*?\n\}\n/m, "")

  const harness = `
let REMOTE_KEYS = new Set()
function run(label, projectId, args, options = {}) { return { status: 0, stdout: "{}" } }
function parseVercelJsonOutput(label, stdout) { return { envs: [] } }
function listRemoteEnvKeys(app, environment) { return new Set(REMOTE_KEYS) }
export function __setKeys(keys) { REMOTE_KEYS = new Set(keys) }
export { assertRemoteRuntimeEnv, apps }
${preludeWithoutStubs}
`

  const harnessPath = path.join(rootDir, "node_modules", ".cache", "verify-airtable-removal-harness.mjs")
  fs.mkdirSync(path.dirname(harnessPath), { recursive: true })
  fs.writeFileSync(harnessPath, harness)

  const previousArgv = process.argv
  process.argv = [previousArgv[0], harnessPath, "all", "preview"]

  const expectations = [
    {
      name: "the four required Supabase/site keys, no Airtable key",
      keys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SITE_URL"],
      throws: false,
    },
    {
      name: "the SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY aliases",
      keys: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SITE_URL"],
      throws: false,
    },
    {
      name: "a missing NEXT_PUBLIC_SITE_URL is still rejected",
      keys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      throws: true,
    },
    {
      name: "a missing SUPABASE_SERVICE_ROLE_KEY is still rejected",
      keys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SITE_URL"],
      throws: true,
    },
  ]

  return import(harnessPath).then((mod) => {
    try {
      for (const app of Object.values(mod.apps)) {
        for (const expectation of expectations) {
          mod.__setKeys(expectation.keys)
          if (expectation.throws) {
            assert(
              (() => {
                try {
                  mod.assertRemoteRuntimeEnv(app, "preview")
                  return false
                } catch {
                  return true
                }
              })(),
              `[${app.label}] preflight accepted ${expectation.name}`,
            )
          } else {
            try {
              mod.assertRemoteRuntimeEnv(app, "preview")
            } catch (error) {
              throw new Error(`[${app.label}] preflight rejected ${expectation.name}: ${error.message}`)
            }
          }
        }
      }
    } finally {
      process.argv = previousArgv
      fs.rmSync(harnessPath, { force: true })
    }
  })
})

check("Vercel preflight names no Airtable variable", () => {
  const named = [...read("scripts/deploy-vercel.mjs").matchAll(/missing\.push\(\s*[`"']([^`"']*)[`"']/g)].map((m) => m[1])
  assert(named.length > 0, "expected at least one named requirement")
  const airtableNames = named.filter((name) => new RegExp(SVC, "i").test(name))
  assert(airtableNames.length === 0, `preflight still names: ${airtableNames.join(", ")}`)
})

// ---------------------------------------------------------------------------
// 7. The verification scripts still assert something real
// ---------------------------------------------------------------------------

check("verify-program-readiness.mjs still asserts live configuration", () => {
  const src = read("scripts/verify-program-readiness.mjs")
  for (const live of [
    /syncStaffProfileByEmail/,
    /ensureSupabaseAuthUser/,
    /NEXT_PUBLIC_PROGRAM_ID/,
    /staff_memberships/,
    /audit_events/,
    /DD-10/,
  ]) {
    assert(live.test(src), `verify-program-readiness.mjs no longer asserts ${live}`)
  }
  // Every file in its `files` map must still be read by a surviving assertion.
  const mapBody = /const files = \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? ""
  const keys = [...mapBody.matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
  assert(keys.length > 0, "could not parse the files map")
  for (const key of keys) {
    assert(new RegExp(`contents\\.${key}\\b`).test(src), `files map key "${key}" is no longer read by any assertion`)
  }
})

check("verify-monorepo-guardrails.mjs still guards server-only boundaries", () => {
  const src = read("scripts/verify-monorepo-guardrails.mjs")
  for (const prefix of ["@/lib/authz", "@/lib/invite-log", "@/lib/supabase/admin", "@hkmc/authz"]) {
    assert(src.includes(`"${prefix}"`), `serverOnlySpecifierPrefixes lost ${prefix}`)
  }
  for (const stale of [FORBIDDEN.workspacePkg, FORBIDDEN.libAlias]) {
    assert(!src.includes(`"${stale}"`), `serverOnlySpecifierPrefixes still names ${stale}`)
  }
})

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

// Async checks report as they settle; wait for all of them before summarizing.
await Promise.all(pending)

if (failures.length > 0) {
  console.error(`\n${failures.length}/${checks} checks failed:`)
  for (const name of failures) console.error(`  - ${name}`)
  process.exit(1)
}

console.log(`\n${checks}/${checks} checks passed.`)
