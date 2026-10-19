#!/usr/bin/env node
/**
 * dev-local-preacher.mjs — boot the local stack AND open a preacher-logged-in browser.
 *
 * The `folk` / `gitalife` shell aliases point here. Preacher is the default
 * login because it is the role developers reach for first: it owns contacts,
 * sessions, and attendance, while Admin adds user management and Volunteer sees
 * almost nothing.
 *
 * Folk boots `pnpm dev:local` (Supabase → Mailpit → migrations → env → seed →
 * folk on :3000); gita-life boots `pnpm dev:local:gita-life` (same chain, ends
 * with gita-life on :3001). Once /login answers, this hands off to
 * `scripts/dev-login-preacher.mjs`, which drives the real email-OTP path and
 * leaves the browser open. Ctrl-C stops the browser and the stack together.
 *
 * Prefer this over running the pieces by hand: the handoff waits for the app
 * instead of racing it, and a stack failure aborts before any browser opens.
 *
 * Usage:
 *   node scripts/dev-local-preacher.mjs --app folk
 *   node scripts/dev-local-preacher.mjs --app gita-life
 *   pnpm dev:folk:preacher
 *   pnpm dev:gita-life:preacher
 *
 * Options:
 *   --app folk|gita-life   Which app to boot and open (default: folk).
 *   --headless             No visible window: boot, log in, report, shut down.
 *                          For verification runs; headed (the default) is the
 *                          development experience.
 */

import { spawn, execFileSync } from "node:child_process"
import { existsSync, rmSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const LOGIN_SCRIPT = path.join(repoRoot, "scripts", "dev-login-preacher.mjs")

// One package script per app so the boot chain has a single name to spawn —
// and so server-only (no browser) stays available as `pnpm dev:local` /
// `pnpm dev:local:gita-life`.
const STACK_SCRIPT = { folk: "dev:local", "gita-life": "dev:local:gita-life" }
const BASE_URL = { folk: "http://127.0.0.1:3000", "gita-life": "http://127.0.0.1:3001" }
const PORT = { folk: 3000, "gita-life": 3001 }
// Cold `supabase:start` plus seeding plus first compile can take minutes; the
// login script's own 120s budget only starts once this wait has succeeded.
const BOOT_TIMEOUT_MS = 600000
const BOOT_POLL_MS = 2000

function flagValue(name) {
  const argv = process.argv.slice(2)
  const index = argv.indexOf(name)
  return index === -1 ? null : (argv[index + 1] ?? "").trim() || null
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name)
}

function fail(message) {
  console.error(`ERROR ${message}`)
  process.exit(1)
}

function parseArgs() {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log("Usage: node scripts/dev-local-preacher.mjs --app folk|gita-life [--headless]")
    process.exit(0)
  }

  const app = (flagValue("--app") ?? "folk").trim()
  if (!STACK_SCRIPT[app]) fail(`--app must be "folk" or "gita-life", got "${app}".`)
  return { app, headless: hasFlag("--headless") }
}

async function waitForLogin(baseUrl) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(5000) })
      if (response.ok) return
    } catch {
      // Not up yet; fall through to the retry below.
    }

    if (Date.now() >= deadline) {
      fail(`The app never answered at ${baseUrl}/login within ${BOOT_TIMEOUT_MS / 1000}s. See the stack output above.`)
    }
    await new Promise((resolve) => setTimeout(resolve, BOOT_POLL_MS))
  }
}

/**
 * PIDs currently listening on a TCP port, via `ss`. Scoped to one port on
 * purpose: booting folk must never kill a gita-life server on its own port.
 */
function pidsListeningOn(port) {
  let output = ""
  try {
    output = execFileSync("ss", ["-ltnp"], { encoding: "utf8" })
  } catch {
    return []
  }

  const pids = new Set()
  for (const line of output.split("\n")) {
    if (!line.includes(`:${port}`)) continue
    for (const match of line.matchAll(/pid=(\d+)/g)) {
      const pid = Number(match[1])
      if (pid > 1 && pid !== process.pid) pids.add(pid)
    }
  }
  return [...pids]
}

function describePid(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim().slice(0, 100) || "unknown"
  } catch {
    return "unknown"
  }
}

/**
 * Stop whatever holds the app's port — invariably a previous `folk` /
 * `gitalife` run whose dev server is still alive. Without this the new run
 * logs into the STALE server (its /login answers first) and then its own
 * `next dev` dies on the port conflict plus the `.next/dev/lock`, exactly the
 * failure this replaces. SIGINT first for a graceful Next shutdown, SIGKILL
 * for survivors, then fail loudly rather than boot into a half-free port.
 */
async function freePort(port) {
  let holders = pidsListeningOn(port)
  if (holders.length === 0) return

  for (const pid of holders) {
    console.log(`Port ${port} is held by PID ${pid} (${describePid(pid)}) — stopping it …`)
  }
  for (const pid of holders) {
    try {
      process.kill(pid, "SIGINT")
    } catch {
      // Already gone; the poll below confirms it.
    }
  }

  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    holders = pidsListeningOn(port)
    if (holders.length === 0) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  for (const pid of holders) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // Already gone; the check below confirms it.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))

  holders = pidsListeningOn(port)
  if (holders.length > 0) {
    fail(`Port ${port} is still held by PID(s) ${holders.join(", ")} after SIGINT+SIGKILL. Stop them by hand and re-run.`)
  }
}

/**
 * Remove a Next dev lock left behind by a killed server. Next deletes it on a
 * graceful exit but a SIGKILLed holder leaves it, and the next boot then fails
 * with "Unable to acquire lock" even though the port is free. Only removed
 * when no live `next dev` under this app's directory exists — never while a
 * server could still own it.
 */
function clearStaleDevLock(app) {
  const lock = path.join(repoRoot, "apps", app, ".next", "dev", "lock")
  if (!existsSync(lock)) return

  let holderAlive = false
  try {
    const processes = execFileSync("pgrep", ["-af", "next dev"], { encoding: "utf8" })
    holderAlive = processes.split("\n").some((line) => line.includes(`apps/${app}`) && !line.includes("pgrep"))
  } catch {
    holderAlive = false
  }

  if (holderAlive) return
  rmSync(lock, { force: true })
  console.log(`Removed stale Next dev lock for ${app}.`)
}

async function main() {
  const { app, headless } = parseArgs()
  const baseUrl = BASE_URL[app]

  await freePort(PORT[app])
  clearStaleDevLock(app)

  console.log(`Booting the ${app} stack (\`pnpm ${STACK_SCRIPT[app]}\`) …`)
  // Detached so the whole tree (pnpm → sh → next) shares one process group:
  // a plain kill() only takes down the top pnpm and orphans the dev server,
  // but a group kill reaches every descendant. Verified the hard way — a
  // SIGINT to the top pnpm left `next dev` listening on :3000.
  const stack = spawn("pnpm", [STACK_SCRIPT[app]], { cwd: repoRoot, stdio: "inherit", detached: true })

  let stackExited = null
  stack.on("exit", (code, signal) => {
    stackExited = { code, signal }
  })
  stack.on("error", (error) => fail(`Could not start the stack: ${error.message}`))

  let loginChild = null
  const stopStack = async () => {
    if (stackExited || stack.exitCode !== null || stack.pid === undefined) return
    try {
      process.kill(-stack.pid, "SIGINT")
    } catch {
      return
    }
    const exited = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 10000)
      stack.once("exit", () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
    if (!exited) {
      try {
        process.kill(-stack.pid, "SIGKILL")
      } catch {
        // Already gone; nothing left to stop.
      }
    }
  }

  const shutdown = async (code) => {
    if (loginChild && loginChild.exitCode === null) {
      try {
        loginChild.kill("SIGINT")
      } catch {
        // Already gone; fall through to stopping the stack.
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 10000)
        loginChild.once("exit", () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    await stopStack()
    process.exit(code)
  }
  process.on("SIGINT", () => void shutdown(0))
  process.on("SIGTERM", () => void shutdown(0))

  await waitForLogin(baseUrl)
  if (stackExited) {
    fail(`The stack exited (code ${stackExited.code ?? "?"}${stackExited.signal ? `, signal ${stackExited.signal}` : ""}) just as the app came up. See the stack output above.`)
  }

  console.log(`App is up — opening a preacher session …`)
  const loginArgs = [LOGIN_SCRIPT, "--app", app]
  if (headless) loginArgs.push("--headless")
  const loginCode = await new Promise((resolve, reject) => {
    loginChild = spawn(process.execPath, loginArgs, { cwd: repoRoot, stdio: "inherit" })
    loginChild.on("error", reject)
    loginChild.on("exit", (code) => {
      loginChild = null
      resolve(code ?? 1)
    })
  })

  // Headless runs are verification: the stack was booted for the check, so it
  // is shut back down. A headed login only resolves on failure or on the
  // signal whose handler is already shutting the stack down — stopping here
  // on failure (and only skipping when the signal path owns it) means no
  // outcome orphans the dev server.
  if (headless || loginCode !== 0) await stopStack()
  process.exit(loginCode)
}

await main()
