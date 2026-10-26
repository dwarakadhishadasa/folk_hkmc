#!/usr/bin/env node
/**
 * verify-dialer-route-coverage.mjs
 *
 * Runs inside `pnpm guardrails`. Enumerates every route file under
 * `apps/folk/app/api/dialer/**` and fails when one has no row in the
 * denial-sweep spec (`e2e/specs/dialer-route-sweep.spec.ts`).
 *
 * A "row" in the sweep is a call to `sweepRoute()` (or the named export
 * the spec uses) with a `route` string matching the route file's path.
 * The script parses the spec as text — it does not execute it — so it
 * works at guardrails time without a browser.
 *
 * Exit codes:
 *   0  — every route file has a sweep row (or no route files exist yet)
 *   1  — at least one route file is missing a sweep row
 *   2  — spec file missing or unreadable
 */

import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const ROUTE_DIR = join(REPO_ROOT, "apps/folk/app/api/dialer")
const SPEC_FILE = join(REPO_ROOT, "e2e/specs/dialer-route-sweep.spec.ts")

function fail(message, code = 1) {
  console.error(`[verify-dialer-route-coverage] ${message}`)
  process.exit(code)
}

function normalizeRoute(routePath) {
  return routePath.length > 1 ? routePath.replace(/\/+$/, "") : routePath
}

function collectRouteFiles(dir, prefix = "") {
  const files = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      const rel = join(prefix, entry.name)
      if (entry.isDirectory()) {
        files.push(...collectRouteFiles(full, rel))
      } else if (entry.isFile() && (entry.name === "route.ts" || entry.name === "route.js")) {
        // Normalize to the route path: /api/dialer/admin/campaigns -> /api/dialer/admin/campaigns
        const routePath = "/api/dialer/" + rel.replace(/\\/g, "/").replace(/\/route\.(ts|js)$/, "")
        files.push(normalizeRoute(routePath))
      }
    }
  } catch (e) {
    if (e.code === "ENOENT") {
      return []
    }
    throw e
  }
  return files
}

function extractSweptRoutes(specContent) {
  const routes = new Set()
  // sweepRoute("route/path")
  const barePattern = /sweepRoute\s*\(\s*"([^"]+)"/g
  // sweepRoute({ route: "route/path", ... }) — route may sit beside method/roles/body
  const objectPattern = /sweepRoute\s*\(\s*\{([\s\S]*?)\}\s*\)/g
  const routeProperty = /route\s*:\s*"([^"]+)"/g

  for (const match of specContent.matchAll(barePattern)) {
    routes.add(normalizeRoute(match[1]))
  }
  for (const match of specContent.matchAll(objectPattern)) {
    for (const property of match[1].matchAll(routeProperty)) {
      routes.add(normalizeRoute(property[1]))
    }
  }
  return routes
}

function main() {
  // 1. Collect route files
  const routeFiles = collectRouteFiles(ROUTE_DIR)
  if (routeFiles.length === 0) {
    console.log(
      "[verify-dialer-route-coverage] No route files found under apps/folk/app/api/dialer/** (absent or empty) — check passes vacuously.",
    )
    return 0
  }

  // 2. Read spec file
  let specContent
  try {
    specContent = readFileSync(SPEC_FILE, "utf8")
  } catch (e) {
    if (e.code === "ENOENT") {
      fail(`Spec file not found: ${relative(REPO_ROOT, SPEC_FILE)}`, 2)
    }
    throw e
  }

  // 3. Extract swept routes from spec
  const sweptRoutes = extractSweptRoutes(specContent)

  // 4. Check each route file has a sweep row
  const missing = []
  for (const route of routeFiles) {
    if (!sweptRoutes.has(route)) {
      missing.push(route)
    }
  }

  if (missing.length > 0) {
    console.error("[verify-dialer-route-coverage] The following routes have no denial-sweep row:")
    for (const route of missing) {
      console.error(`  ${route}`)
    }
    console.error("")
    console.error("Add a sweepRoute() call for each in e2e/specs/dialer-route-sweep.spec.ts")
    return 1
  }

  console.log(`[verify-dialer-route-coverage] All ${routeFiles.length} route(s) covered by denial sweep.`)
  return 0
}

process.exitCode = main()