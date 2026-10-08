/**
 * The suite's own determinism evidence, asserted offline.
 *
 * The claim this file exists to make is narrow and unfashionable: `pnpm test:e2e`
 * is a *gate*, not a run that happened to pass. Two properties have to hold for
 * that, and neither can be established by reading the suite's source:
 *
 *   1. **It can fail.** A suite that cannot go red proves nothing by going green.
 *      Asserting that is uncomfortable to do honestly, because "a failing spec
 *      exits non-zero" is also satisfied by a harness that is *always* red. So
 *      the red is paired with a green through the identical mechanism, and the
 *      pair is what makes the red mean something.
 *   2. **It does not depend on how it is run.** Not on wall-clock time, not on
 *      rows a previous run left behind, not on execution order. Those three are
 *      asserted against the suite's own files, because that is where each one
 *      would enter — and they are asserted as *text*, since `playwright.config.ts`
 *      is configuration and has nothing to call at runtime.
 *
 * Everything here is offline: no page, no browser, no stack. The nested runs are
 * the exception in kind rather than in cost — they spawn a real `playwright test`
 * against a generated spec, and they are cheap because the generated spec asserts
 * on a literal and never opens a browser.
 *
 * The nested runs get **their own minimal config** in a temp directory, never
 * `playwright.config.ts`. Pointed at the repo's config, a nested run would load
 * `globalSetup`, start `webServer` and recurse into every spec — including the one
 * making the assertion, which would then nest again.
 *
 * The generated spec lives in `os.tmpdir()` and is removed in a `finally`. It is
 * never committed under `e2e/specs/`: a deliberately broken committed spec is a
 * permanently red suite, which is the exact outcome this file is trying to prove
 * is avoidable.
 *
 * The pair of *full-suite* green runs is not asserted here — a spec cannot re-run
 * the suite it is inside. `pnpm test:e2e:determinism` is that mechanism, the
 * recorded result lives in `CONTRIBUTING.md`, and the row below asserts the
 * mechanism's own contract offline.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { repoRoot } from "../fixtures/roles"

/** The repo's own Playwright CLI, resolved rather than assumed on `PATH`. */
const PLAYWRIGHT_BIN = path.join(repoRoot, "node_modules", ".bin", "playwright")

/**
 * A nested run is one tiny spec, so this is generous by a wide margin. It exists
 * so a wedged child surfaces as a failure with a message instead of a hang.
 */
const NESTED_TIMEOUT_MS = 120_000

/** `--list` loads the config and walks every project; it starts nothing. */
const LIST_TIMEOUT_MS = 120_000

// ---------------------------------------------------------------------------
// Row: the gate is deterministic
// ---------------------------------------------------------------------------

test("row: two consecutive runs with nothing between them is what the gate checks", () => {
  // The full pair is `pnpm test:e2e:determinism` — minutes of real runs, which a
  // spec inside the suite cannot afford to re-trigger. What is assertable
  // offline is the contract that makes the pair a determinism check at all: more
  // than one run, the full `test:e2e` command (so each run keeps its own
  // readiness gate and `storageState` regeneration), no reset of any kind between
  // the runs, and a non-green run propagating to a non-zero exit.
  //
  // The runs' actual verdict is recorded, not re-derived: the pass counts in
  // `CONTRIBUTING.md` and `docs/development-guide.md` come from running it.
  const script = stripComments(readFileSync(path.join(repoRoot, "scripts", "verify-suite-determinism.mjs"), "utf8"))

  expect(script, "the gate must run the full test:e2e command, not a bare `playwright test`").toContain(
    'gate: ["pnpm", "test:e2e"]',
  )
  expect(script, "one run cannot demonstrate determinism").toContain("--runs must be an integer >= 2")
  expect(script, "a non-green run must reach the operator as a non-zero exit").toMatch(/process\.exit\(main\(/)
  expect(script, "the failing run's own output is the evidence; a paraphrase is worth nothing").toContain(
    "run.output.trimEnd()",
  )

  // The reset this script refuses to do, checked against code rather than prose:
  // the file's own header has to *name* `supabase:reset` and `--wipe` to say why
  // they are absent, and a scan that read comments would flag the explanation.
  for (const reset of ["supabase:reset", "seed:local", "seed:preview-fixtures", "--wipe"]) {
    expect(script, `the gate must not reset between runs, but runs ${reset}`).not.toContain(reset)
  }
})

test("row: the gate's own logic passes on two green runs and fails, naming the run, on one red run", () => {
  // Cheap, real coverage of the script above rather than a text scan of it: the
  // gate command is swapped for a stub, so the two-run sequencing, the pass-count
  // reading and the failure propagation are all exercised for real.
  const stubDir = mkdtempSync(path.join(os.tmpdir(), "e2e-gate-stub-"))
  const markerPath = path.join(stubDir, "runs.txt")
  const passingStub = path.join(stubDir, "passing-gate.mjs")
  // Green on its first invocation, red on every one after — the shape a
  // second-run-only failure takes, and the one a "stop at the first bad run"
  // implementation would never notice.
  const failingSecondStub = path.join(stubDir, "second-run-fails-gate.mjs")

  writeFileSync(passingStub, 'console.log("3 passed (0.1s)")\n')
  writeFileSync(
    failingSecondStub,
    [
      'import { existsSync, writeFileSync } from "node:fs"',
      "const marker = process.argv[2]",
      "const second = existsSync(marker)",
      'if (!second) writeFileSync(marker, "1")',
      'console.log(second ? "2 passed, 1 failed (0.1s)" : "3 passed (0.1s)")',
      "process.exit(second ? 1 : 0)",
      "",
    ].join("\n"),
  )

  // Each token quoted individually, not the whole command in one pair of quotes.
  // `tokenize` treats a leading `"` as opening a quoted token, so wrapping the
  // entire command yields ONE token — the full command string — which
  // `spawnSync` then reports as a missing executable (`ENOENT`). Quoting per
  // token is also what makes a temp path containing a space survive the split.
  // `process.execPath` rather than `node`, so the stub runs on the interpreter
  // running this spec and the assertion does not depend on the test worker's
  // `PATH`.
  const gate = (stub: string) =>
    [process.execPath, stub, markerPath].map((token) => JSON.stringify(token)).join(" ")

  try {
    const green = spawnDeterminismScript(["--gate", gate(passingStub)])
    expect(green.status, green.output).toBe(0)
    expect(green.output).toContain("3 passed")
    expect(green.output, "both runs' pass counts are the record; one is not enough").toContain("2 consecutive green runs")

    rmSync(markerPath, { force: true })

    const red = spawnDeterminismScript(["--gate", gate(failingSecondStub)])
    expect(red.status, `a run that is not green must fail the gate:\n${red.output}`).not.toBe(0)
    expect(red.output, "the operator must be told which run failed").toContain("FAILED: run 2 of 2")
    expect(red.output, "only the run that actually failed is reported as failed").not.toContain("FAILED: run 1 of 2")
    expect(red.output, "the failing run's own output belongs in the report").toContain("2 passed, 1 failed")
  } finally {
    rmSync(stubDir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Row: a broken spec turns the gate red
// ---------------------------------------------------------------------------

test("row: a deliberately failing spec exits non-zero and is named", () => {
  const title = "a generated failing spec turns the gate red"

  const { status, output, tempDir } = runNestedSpec(
    `import { expect, test } from "@playwright/test"\n\ntest(${JSON.stringify(title)}, () => {\n  expect("red").toBe("green")\n})\n`,
  )

  try {
    expect(status, `a failing spec must not exit 0:\n${output}`).not.toBe(0)
    // Both halves matter: a non-zero exit with no name is the state of a harness
    // that broke for an unrelated reason, and a named failure with exit 0 is a
    // suite that cannot fail.
    expect(output, "the failing spec's file must be named").toContain("generated.spec.ts")
    expect(output, "the failing test's title must be named").toContain(title)
  } finally {
    expect(existsSync(tempDir), "the temp directory is removed in the finally, so no artifact survives").toBe(false)
  }
})

test("row: a sound spec exits 0 through the identical mechanism", () => {
  // Without this pair, the row above would also be satisfied by a broken config
  // path, a missing browser, or a typo'd temp directory — every one of which
  // makes a nested run red for reasons that have nothing to do with the failing
  // assertion being detected.
  const { status, output } = runNestedSpec(
    'import { expect, test } from "@playwright/test"\n\ntest("a generated passing spec stays green", () => {\n  expect("green").toBe("green")\n})\n',
  )

  expect(status, `the same harness that caught the failing spec must pass a sound one:\n${output}`).toBe(0)
  expect(output).toContain("1 passed")
})

// ---------------------------------------------------------------------------
// Row: no spec depends on wall-clock time
// ---------------------------------------------------------------------------

test("row: no spec sleeps on wall-clock time", () => {
  // `waitForTimeout` is a fixed sleep: it passes on a fast machine and fails on a
  // loaded one, which is the definition of a flaky spec. The wait for a
  // condition is `expect.poll` or an explicit retry — the Mailpit reader is the
  // in-repo example.
  //
  // A call, not the word: `e2e/fixtures/mailpit.ts` names the banned API in prose
  // to explain why it does not use it, and flagging that comment would punish the
  // one file that documents the rule.
  const sleeps = sourceFilesUnder(path.join(repoRoot, "e2e")).flatMap((file) => {
    const lines = stripComments(readFileSync(file, "utf8")).split("\n")
    return lines.flatMap((line, index) =>
      /\.\s*waitForTimeout\s*\(/.test(line) ? [`${path.relative(repoRoot, file)}:${index + 1}`] : [],
    )
  })

  expect(sleeps, `a fixed sleep makes the suite flaky; poll for the condition instead:\n${sleeps.join("\n")}`).toEqual([])
})

// ---------------------------------------------------------------------------
// Row: no run depends on a previous run's rows
// ---------------------------------------------------------------------------

test("row: every run regenerates its own state instead of inheriting the last one's", () => {
  // Two independent guarantees, both required: the config runs `globalSetup` (the
  // idempotent generator, once per invocation, so a run cannot report green
  // against a warm-but-thin database), and each setup project deletes its
  // `storageState` before writing one (so a session that outlived its run cannot
  // silently sign the next run in).
  const config = readFileSync(path.join(repoRoot, "playwright.config.ts"), "utf8")

  expect(config, "fixtures must be regenerated per invocation").toMatch(
    /globalSetup:\s*["']e2e\/global-setup\.ts["']/,
  )

  const setups = sourceFilesUnder(path.join(repoRoot, "e2e", "auth")).filter((file) => file.endsWith(".setup.ts"))
  expect(setups.length, "the three setup projects must still be present").toBe(3)

  for (const file of setups) {
    const source = readFileSync(file, "utf8")
    expect(source, `${path.basename(file)} must delete its storageState before signing in`).toMatch(
      /rm\(\s*storageState\s*,\s*\{\s*force:\s*true\s*\}\s*\)/,
    )
  }
})

// ---------------------------------------------------------------------------
// Row: no run depends on execution order
// ---------------------------------------------------------------------------

test("row: the config forbids parallelism, extra workers and a retry that could hide a flake", () => {
  // `retries: 0` locally is a determinism property, not a CI preference: with a
  // retry, a spec that passes on attempt two is reported green, and "green twice
  // back to back" would then be a statement about the retry, not the suite.
  const config = readFileSync(path.join(repoRoot, "playwright.config.ts"), "utf8")

  expect(config, "shared mutable fixtures must not be written from two workers").toMatch(/fullyParallel:\s*false/)
  expect(config, "one worker keeps a spec from observing another's half-finished writes").toMatch(/workers:\s*1\b/)
  expect(config, "a local retry would hide the flake this suite is supposed to expose").toMatch(
    /retries:\s*isCI\s*\?\s*1\s*:\s*0/,
  )
})

// ---------------------------------------------------------------------------
// Row: every written spec is a registered spec
// ---------------------------------------------------------------------------

test("row: every spec file under e2e/specs/ is a registered test", () => {
  // An unregistered spec is invisible: it is not run, it cannot fail, and the
  // author believes it covers a row. `--list` is the registration manifest, and
  // it costs no stack — nothing starts for a listing.
  const result = spawnSync(PLAYWRIGHT_BIN, ["test", "--list"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: LIST_TIMEOUT_MS,
    env: cleanEnv() as NodeJS.ProcessEnv,
  })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  expect(result.status, `\`playwright test --list\` exited ${result.status}:\n${output}`).toBe(0)

  const specs = readdirSync(path.join(repoRoot, "e2e", "specs")).filter((name) => name.endsWith(".spec.ts"))
  expect(specs.length, "the spec directory should not be empty").toBeGreaterThan(0)

  const unregistered = specs.filter((name) => !output.includes(name))
  expect(unregistered, `these spec files do not appear in \`playwright test --list\`, so they never run:\n${unregistered.join("\n")}`).toEqual([])
})

// ---------------------------------------------------------------------------
// Row: the determinism gate is wired
// ---------------------------------------------------------------------------

test("row: package.json wires test:e2e:determinism to this story's script", () => {
  // Same class of assertion as `bulk-fixtures.spec.ts` reads `package.json` for,
  // and for the same reason: the gate is a documented command, so a rename or a
  // deletion has to fail something committed rather than be discovered by someone
  // following the docs and finding a command that does not exist.
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>
  }

  expect(manifest.scripts?.["test:e2e:determinism"]).toBe("node scripts/verify-suite-determinism.mjs")
  expect(manifest.scripts?.["test:e2e"], "the determinism gate must not replace the suite it gates").toContain(
    "playwright test",
  )
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every source file under a directory, recursively. */
function sourceFilesUnder(directory: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      // `e2e/.auth/` holds live session tokens written by the last run, not source.
      if (entry.name === ".auth") continue
      found.push(...sourceFilesUnder(full))
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      found.push(full)
    }
  }

  return found
}

/**
 * Removes comments while preserving line numbering, so a scan can assert on code
 * without tripping over the prose documenting the rule it enforces — this very
 * file names `waitForTimeout` and `supabase:reset` for exactly that reason.
 *
 * String and template literals are copied **verbatim**, because they are code:
 * blanking their contents would make `gate: ["pnpm", "test:e2e"]` unreadable,
 * and the scan that asserts on it would then never match. A regular expression
 * literal containing a quote is therefore still not interpreted, so a call that
 * sits on the same line as such a literal can be missed by a scan. That is a
 * limitation, not a hidden assumption: the run's flake would surface it.
 */
function stripComments(source: string): string {
  let output = ""
  let index = 0

  /**
   * Copies a quoted string verbatim, escapes included. A string is code, not
   * prose: blanking its contents would leave `gate: ["pnpm", "test:e2e"]`
   * unreadable as `gate: ["    ", "        "]`, which is what an earlier version
   * of this function did — and the positive assertions could then never match.
   */
  function copyQuoted(quote: string): void {
    output += quote
    index += 1
    while (index < source.length && source[index] !== quote) {
      if (source[index] === "\\") {
        output += source[index] + (source[index + 1] ?? "")
        index += 2
        continue
      }
      output += source[index] === "\n" ? "\n" : source[index]
      index += 1
    }
    if (index < source.length) {
      output += quote
      index += 1
    }
  }

  /**
   * Copies a template literal verbatim. `${ … }` is code, so it is scanned as
   * code until its matching brace rather than to the next backtick — this script
   * nests a template literal inside another's interpolation, and a scanner that
   * stopped at the first backtick would desynchronize on it and blank the rest of
   * the file.
   */
  function copyTemplate(): void {
    output += "`"
    index += 1
    while (index < source.length && source[index] !== "`") {
      if (source[index] === "\\") {
        output += source[index] + (source[index + 1] ?? "")
        index += 2
        continue
      }
      if (source[index] === "$" && source[index + 1] === "{") {
        output += "${"
        index += 2
        let depth = 1
        while (index < source.length && depth > 0) {
          const char = source[index]
          const next = source[index + 1]
          if (char === "{") {
            depth += 1
          } else if (char === "}") {
            depth -= 1
          } else if (char === '"' || char === "'") {
            copyQuoted(char)
            continue
          } else if (char === "`") {
            copyTemplate()
            continue
          } else if (char === "/" && next === "/") {
            while (index < source.length && source[index] !== "\n") {
              output += " "
              index += 1
            }
            continue
          } else if (char === "/" && next === "*") {
            blankBlockComment()
            continue
          }
          output += char
          index += 1
        }
        continue
      }
      output += source[index]
      index += 1
    }
    if (index < source.length) {
      output += "`"
      index += 1
    }
  }

  function blankBlockComment(): void {
    output += "  "
    index += 2
    while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
      output += source[index] === "\n" ? "\n" : " "
      index += 1
    }
    output += index < source.length ? "  " : ""
    index += 2
  }

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        output += " "
        index += 1
      }
    } else if (char === "/" && next === "*") {
      blankBlockComment()
    } else if (char === '"' || char === "'") {
      copyQuoted(char)
    } else if (char === "`") {
      copyTemplate()
    } else {
      output += char
      index += 1
    }
  }

  return output
}

/**
 * Runs a real `playwright test` over one generated spec and returns its exit status
 * and output. The caller owns the cleanup: the temp directory is reported so the
 * caller can assert its removal in its own `finally`.
 *
 * The generated spec imports `@playwright/test`, which Node resolves from
 * `node_modules` by walking up from the spec — and `os.tmpdir()` has none. The
 * symlink is what lets the nested run use the same assertion library as the suite
 * instead of a second, subtly different one.
 */
function runNestedSpec(specSource: string): { status: number | null; output: string; tempDir: string } {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "e2e-suite-determinism-"))

  writeFileSync(path.join(tempDir, "playwright.config.ts"), nestedConfig(tempDir))
  writeFileSync(path.join(tempDir, "generated.spec.ts"), specSource)
  symlinkSync(path.join(repoRoot, "node_modules"), path.join(tempDir, "node_modules"), "dir")

  try {
    const result = spawnSync(PLAYWRIGHT_BIN, ["test", "--config", path.join(tempDir, "playwright.config.ts")], {
      cwd: tempDir,
      encoding: "utf8",
      timeout: NESTED_TIMEOUT_MS,
      env: cleanEnv() as NodeJS.ProcessEnv,
    })

    return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}`, tempDir }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

/**
 * Only three keys, deliberately. Inheriting the repo's config would bring
 * `globalSetup`, `webServer` and `testDir: e2e/specs` with it — and the last of
 * those makes the nested run recurse into this very file.
 */
function nestedConfig(tempDir: string): string {
  return [
    "export default {",
    `  testDir: ${JSON.stringify(tempDir)},`,
    '  reporter: "list",',
    "  workers: 1,",
    "}",
    "",
  ].join("\n")
}

function spawnDeterminismScript(args: string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "verify-suite-determinism.mjs"), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: LIST_TIMEOUT_MS,
    env: cleanEnv() as NodeJS.ProcessEnv,
  })

  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` }
}

/** `process.env` without the variables that would confuse a nested runner. */
function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("TEST_") && !key.startsWith("PW_")) {
      env[key] = value
    }
  }

  return env
}