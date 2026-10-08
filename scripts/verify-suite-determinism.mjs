#!/usr/bin/env node
/**
 * verify-suite-determinism.mjs — `pnpm test:e2e:determinism`.
 *
 * "Green once" is not the claim this spec makes; "green twice back to back with
 * no manual reset" is. A suite that only passes on a freshly seeded database is
 * order-dependent or leak-dependent, and no amount of reading its source will
 * tell you — the failure is a property of the *pair* of runs, so it has to be
 * produced by running the pair.
 *
 * So this script is two `pnpm test:e2e` invocations, back to back, with nothing
 * in between: no `supabase:reset`, no `--wipe`, no re-seed. Each run's exit
 * status and pass count are captured and printed; a run that is not green fails
 * the script, names *which* run failed, and echoes that run's own output rather
 * than a summary of it — the second run's output is the evidence for the second
 * run's verdict, and a paraphrase of it is worth nothing.
 *
 * Pass counts are read from the run output, never estimated. The numbers quoted
 * in `CONTRIBUTING.md` and `docs/development-guide.md` come from runs of this
 * script; a count no run produced is a claim, not a record.
 *
 * `test:e2e` is invoked as-is, so each run keeps its own `pnpm local:readiness`
 * gate, its own `globalSetup` generation and its own per-role `storageState`
 * regeneration. That is the point: the reset this script deliberately does *not*
 * do is exactly the reset those three perform per invocation.
 *
 * Usage:
 *   pnpm test:e2e:determinism
 *   node scripts/verify-suite-determinism.mjs --timeout-ms 1800000
 *
 * Options:
 *   --runs <n>         How many consecutive gated runs (default: 2, minimum 2 —
 *                      one run cannot demonstrate determinism).
 *   --gate <command>   Run something other than `pnpm test:e2e`. Exists only so
 *                      `e2e/specs/suite-determinism.spec.ts` can exercise this
 *                      script's own logic offline; a spec must not re-run the
 *                      suite it is inside of. Never used by `pnpm
 *                      test:e2e:determinism`.
 *   --timeout-ms <n>   Per-run ceiling (default: 1800000 — a full run is
 *                      minutes, and an unbounded wait would hang the gate that
 *                      story 2's `webServer` and every developer waits on).
 */

import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const DEFAULTS = {
  runs: 2,
  gate: ["pnpm", "test:e2e"],
  timeoutMs: 1_800_000,
}

/**
 * Thrown rather than `process.exit`-ed so a caller can assert the failures — the
 * same seam `verify-local-stack-readiness.mjs` exposes.
 */
export function parseArgs(argv) {
  const options = { ...DEFAULTS }
  const raw = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith("--")) continue
    const eq = arg.indexOf("=")
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)

    if (!["runs", "gate", "timeout-ms"].includes(name)) {
      throw new Error(`Unknown flag --${name}. Supported: --runs, --gate, --timeout-ms.`)
    }

    let value = eq === -1 ? undefined : arg.slice(eq + 1)
    if (value === undefined) {
      const next = argv[index + 1]
      // A trailing `--gate` or one followed by another flag is the shape that
      // silently yields `undefined` and then runs the wrong command.
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`--${name} requires a value.`)
      }
      value = next
      index += 1
    }
    if (value === "") throw new Error(`--${name} requires a non-empty value.`)

    switch (name) {
      case "runs":
        raw.runs = value
        options.runs = Number.parseInt(value, 10)
        break
      case "gate":
        options.gate = tokenize(value)
        break
      case "timeout-ms":
        raw.timeoutMs = value
        options.timeoutMs = Number.parseInt(value, 10)
        break
    }
  }

  // One run proves nothing about determinism, so the floor is 2 rather than 1.
  if (!Number.isInteger(options.runs) || options.runs < 2) {
    throw new Error(`--runs must be an integer >= 2, got ${JSON.stringify(raw.runs ?? DEFAULTS.runs)}.`)
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(
      `--timeout-ms must be a positive integer, got ${JSON.stringify(raw.timeoutMs ?? DEFAULTS.timeoutMs)}.`,
    )
  }
  if (options.gate.length === 0) {
    throw new Error("--gate must name a command to run.")
  }

  return options
}

/**
 * Splits a command string into argv, honouring single and double quotes. Handled
 * here rather than handed to a shell: a shell would also honour `;`, `|` and
 * `&&`, and this script never needs to run two commands.
 *
 * A quoted token is emitted where it closes, which is the whole point of quoting
 * it: `--gate "node /tmp/a b.mjs"` is three argv entries, not one.
 */
export function tokenize(command) {
  const tokens = []
  let current = ""
  let quote = null

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]

    if (quote !== null) {
      if (char === quote) {
        tokens.push(current)
        current = ""
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
    } else if (/\s/.test(char)) {
      if (current !== "") {
        tokens.push(current)
        current = ""
      }
    } else {
      current += char
    }
  }

  if (quote !== null) throw new Error(`Unbalanced ${quote === '"' ? "double" : "single"} quote in --gate.`)
  if (current !== "") tokens.push(current)

  return tokens
}

/**
 * The pass count as Playwright's `list` reporter prints it (`77 passed (4.0m)`),
 * read from a run's own output. Returns `null` rather than 0 when the line is
 * absent, because "the run printed no total" and "the run passed zero tests" are
 * different facts and a report that conflates them reports a truncated or failed
 * run as a green empty one.
 */
export function summarizeRun(output) {
  const text = String(output ?? "")
  const passed = lastCount(text, /(\d+)\s+passed/g)
  const failed = lastCount(text, /(\d+)\s+failed/g)
  const skipped = lastCount(text, /(\d+)\s+skipped/g)
  const flaky = lastCount(text, /(\d+)\s+flaky/g)

  return {
    passed,
    failed: failed ?? 0,
    skipped: skipped ?? 0,
    flaky: flaky ?? 0,
    total: passed ?? null,
  }
}

/** The final match wins: Playwright prints per-file counts before the total. */
function lastCount(text, pattern) {
  const matches = [...text.matchAll(pattern)]
  if (matches.length === 0) return null
  return Number.parseInt(matches[matches.length - 1][1], 10)
}

function describeExit(result) {
  if (result.error) return result.error.message
  if (result.status === null) return `was killed (signal ${result.signal}) after the timeout`
  return `exit ${result.status}`
}

function runOnce(label, options) {
  const [command, ...args] = options.gate
  console.log("")
  console.log(`── ${label}: ${[command, ...args].join(" ")}`)

  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", timeout: options.timeoutMs })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  const summary = summarizeRun(output)
  const green = !result.error && result.status === 0

  // `passed: null` on a green run means the reporter's total never appeared —
  // a filtered or empty run. It is reported as a failure of the gate rather
  // than passed off as green, because a determinism claim about zero tests is
  // not a claim.
  const noTotal = green && summary.total === null

  return {
    label,
    status: result.status,
    green: green && !noTotal,
    summary,
    output,
    problem: result.error
      ? describeExit(result)
      : noTotal
        ? "exited 0 but printed no `N passed` total, so there is no pass count to compare"
        : !green
          ? describeExit(result)
          : null,
  }
}

export function main(argv) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(`ERROR ${error.message}`)
    return 1
  }

  console.log(`Suite determinism — ${options.runs} consecutive runs, no reset between`)
  console.log(`  gate:     ${options.gate.join(" ")}`)
  console.log(`  revision: ${describeRevision()}`)
  console.log(`  per-run timeout: ${options.timeoutMs}ms`)

  const runs = []
  for (let index = 1; index <= options.runs; index += 1) {
    runs.push(runOnce(`run ${index} of ${options.runs}`, options))
  }

  console.log("")
  console.log("Pass counts")
  for (const run of runs) {
    const total = run.summary.total === null ? "(no total printed)" : `${run.summary.total} passed`
    console.log(`  ${run.label}: ${total}${run.summary.failed ? `, ${run.summary.failed} failed` : ""}`)
  }

  // Runs are reported even when earlier ones failed: a first red run followed by
  // two greens is the order-dependence this script exists to expose, and
  // stopping at the first failure would hide exactly that shape.
  const failed = runs.filter((run) => !run.green)
  if (failed.length === 0) {
    console.log("")
    console.log(`Suite determinism PASSED — ${runs.length} consecutive green runs.`)
    return 0
  }

  console.error("")
  for (const run of failed) {
    console.error(`FAILED: ${run.label} ${run.problem}. That run's own output follows.`)
    console.error("")
    console.error(run.output.trimEnd())
    console.error("")
  }
  console.error(
    [
      `Suite determinism FAILED — ${failed.length} of ${runs.length} runs were not green.`,
      "A suite that is green once is not a gate. If a run failed, the output above names the failing spec.",
      "Do not re-seed or reset to make the next attempt green: the point is that it needs no reset.",
    ].join("\n"),
  )

  return 1
}

/** Recorded beside every pass count, so a number is never quoted without its commit. */
function describeRevision() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" })
  const revision = (result.stdout ?? "").trim()
  return revision || "(unknown — not a git checkout)"
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}