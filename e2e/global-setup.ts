/**
 * Suite-wide fixture generation.
 *
 * `matrix-coverage-map.md` is the reason this exists: 16 of story 2's 19 rows need
 * row volume `pnpm seed:local` does not produce. Running the generator here means
 * a developer cannot end up with a green suite against a 24-row database — the
 * suite either has its data or it fails at the gate with the generator's own
 * output, which is the readable failure.
 *
 * Two properties make this cheap:
 *
 *   - **Idempotent.** `--count` is a floor, not a truncate, and row names are
 *     deterministic, so a second invocation inserts 0. Every suite run is
 *     therefore a live idempotence check, which is why `bulk-fixtures.spec.ts`
 *     can assert `Total created: 0` in-process rather than trusting this file.
 *   - **Outside the timed tests.** Playwright's global setup budget is not the
 *     60s test timeout, so a cold `supabase status` or a first insert of 250 rows
 *     cannot show up as an unexplained spec timeout.
 *
 * Nothing here re-implements the generator: the child is the same command
 * `pnpm seed:bulk-local` runs, so the suite and a manual run cannot drift.
 */

import { spawnSync } from "node:child_process"
import { GENERATOR } from "./fixtures/bulk-contacts"
import { repoRoot } from "./fixtures/roles"

/**
 * `pnpm dlx supabase status -o env` is bounded at 120s inside the generator, and
 * a bulk insert of 250 rows is a few seconds. This ceiling exists so a hang
 * surfaces as a setup failure with a message rather than as a run that never
 * finishes.
 *
 * It is deliberately *larger* than `GENERATOR_TIMEOUT_MS` in
 * `bulk-fixtures.spec.ts`: that one bounds a single spec's spawn, this one bounds
 * a whole cold generation before any test starts. Collapsing them into one
 * constant would force the tighter per-test budget onto the setup path.
 */
const GENERATOR_TIMEOUT_MS = 300_000

export default function globalSetup(): void {
  const result = spawnSync(process.execPath, [GENERATOR], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: GENERATOR_TIMEOUT_MS,
  })

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()

  if (result.error || result.status !== 0) {
    // The generator's own wording names the fix — a missing `pnpm seed:local`, a
    // DW-3 violation, a bad flag. Re-wrapping it would only bury that.
    throw new Error(
      [
        `Bulk fixture generation failed (\`pnpm seed:bulk-local\` exited ${result.status ?? "with a signal"}).`,
        "This is the row-volume prerequisite for the manage-contacts matrix; fix the cause above, then re-run.",
        result.error ? `Underlying error: ${result.error.message}` : "",
        "",
        output,
      ]
        .filter((line) => line !== "")
        .join("\n"),
    )
  }

  // Printed rather than swallowed: `Total created: 0` here is the proof that
  // idempotence holds, which is one of the matrix rows' own requirements.
  if (output) {
    console.log(output)
  }
}
