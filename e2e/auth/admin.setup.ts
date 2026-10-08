/**
 * Sign in as the Admin fixture and persist the session.
 *
 * The target `storageState` file is deleted first on every run. A stale session
 * from a previous run must never silently poison a run, so regeneration — not
 * reuse — is the invariant this file establishes.
 */

import { rm, stat } from "node:fs/promises"
import { expect, test as setup } from "@playwright/test"
import { authenticateAsRole } from "../fixtures/auth"
import { relativeToRepo, storageStatePath, type E2ERole } from "../fixtures/roles"

const ROLE: E2ERole = "admin"
const storageState = storageStatePath(ROLE)

setup(`authenticate as ${ROLE}`, async ({ page }) => {
  await rm(storageState, { force: true })

  // `size > 0` alone would also be satisfied by a leftover file from the last
  // run, so the assertion that matters is that this run's write is the one on
  // disk.
  const startedAt = Date.now()
  await authenticateAsRole(page, ROLE)
  await page.context().storageState({ path: storageState })

  const written = relativeToRepo(storageState)
  await expect
    .poll(async () => (await stat(storageState)).mtimeMs, { message: `${written} was not written` })
    .toBeGreaterThanOrEqual(startedAt)

  expect((await stat(storageState)).size, `${written} should not be empty`).toBeGreaterThan(0)
})
