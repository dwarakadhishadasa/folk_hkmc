#!/usr/bin/env node

import { spawnSync } from "node:child_process"

const orgId = "team_VyUTSoRnf2uz8IBsMVyZhOS4"

const apps = {
  folk: {
    label: "folk",
    envPrefix: "FOLK",
    projectId: "prj_7PJ9LJdWsXe7lUpLTvg6svaaa6V2",
  },
  "gita-life": {
    label: "gita-life",
    envPrefix: "GITA_LIFE",
    projectId: "prj_HEapC71lBCRZg0rv7DICEKpVs18h",
  },
}

const usage = `Usage:
  node scripts/deploy-vercel.mjs <folk|gita-life|all> <preview|production|prod>

Examples:
  pnpm deploy:folk:preview
  pnpm deploy:gita-life:prod
  pnpm deploy:prod`

const [, , appArg, targetArg] = process.argv

const normalizedTarget = targetArg === "prod" ? "production" : targetArg

if (!appArg || !normalizedTarget || appArg === "--help" || appArg === "-h") {
  console.log(usage)
  process.exit(appArg ? 0 : 1)
}

if (appArg !== "all" && !apps[appArg]) {
  console.error(`Unknown app: ${appArg}\n\n${usage}`)
  process.exit(1)
}

if (!["preview", "production"].includes(normalizedTarget)) {
  console.error(`Unknown deployment target: ${targetArg}\n\n${usage}`)
  process.exit(1)
}

const selectedApps = appArg === "all" ? Object.values(apps) : [apps[appArg]]
const isProduction = normalizedTarget === "production"

function run(label, projectId, args, options = {}) {
  console.log(`\n> ${label}: npx vercel@54.14.0 ${args.join(" ")}`)

  const result = spawnSync("npx", ["vercel@54.14.0", ...args], {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: {
      ...process.env,
      VERCEL_ORG_ID: orgId,
      VERCEL_PROJECT_ID: projectId,
    },
  })

  if (result.status !== 0) {
    if (options.capture) {
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim()
      if (output) {
        console.error(output)
      }
    }

    throw new Error(`${label}: vercel ${args[0] || ""} failed with status ${result.status ?? 1}`)
  }

  return result
}

function parseVercelJsonOutput(label, stdout) {
  const jsonStart = stdout.indexOf("{")
  if (jsonStart === -1) {
    throw new Error(`${label}: vercel did not return JSON output`)
  }

  return JSON.parse(stdout.slice(jsonStart))
}

function listRemoteEnvKeys(app, environment) {
  const result = run(app.label, app.projectId, ["env", "ls", environment, "--format", "json"], { capture: true })
  const data = parseVercelJsonOutput(app.label, result.stdout || "")
  const envs = Array.isArray(data.envs) ? data.envs : []
  return new Set(envs.map((env) => env.key).filter(Boolean))
}

function hasAnyKey(keys, names) {
  return names.some((name) => keys.has(name))
}

function assertRemoteRuntimeEnv(app, environment) {
  const keys = listRemoteEnvKeys(app, environment)
  const missing = []

  if (!hasAnyKey(keys, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"])) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL")
  }

  if (
    !hasAnyKey(keys, [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ])
  ) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }

  if (!keys.has("SUPABASE_SERVICE_ROLE_KEY")) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY")
  }

  if (!hasAnyKey(keys, [`${app.envPrefix}_AIRTABLE_API_TOKEN`, "AIRTABLE_API_TOKEN"])) {
    missing.push(`${app.envPrefix}_AIRTABLE_API_TOKEN or AIRTABLE_API_TOKEN`)
  }

  if (!keys.has("NEXT_PUBLIC_SITE_URL")) {
    missing.push("NEXT_PUBLIC_SITE_URL")
  }

  if (missing.length > 0) {
    throw new Error(
      `${app.label}: Vercel ${environment} is missing required environment variable names: ${missing.join(", ")}`,
    )
  }
}

try {
  for (const app of selectedApps) {
    const buildTargetArgs = isProduction ? ["--prod"] : ["--target=preview"]
    const pullEnvironment = isProduction ? "production" : "preview"
    const pullArgs = [
      "pull",
      "--yes",
      `--environment=${pullEnvironment}`,
      "--project",
      app.projectId,
    ]

    if (!isProduction) {
      pullArgs.splice(3, 0, "--git-branch=main")
    }

    console.log(`\nDeploying ${app.label} to Vercel ${pullEnvironment}...`)

    run(app.label, app.projectId, pullArgs)
    assertRemoteRuntimeEnv(app, pullEnvironment)

    run(app.label, app.projectId, [
      "deploy",
      ...buildTargetArgs,
      "--project",
      app.projectId,
      "--yes",
      "--archive=tgz",
    ])
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
