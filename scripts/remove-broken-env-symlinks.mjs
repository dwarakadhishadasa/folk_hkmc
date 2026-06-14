#!/usr/bin/env node

import { lstat, readlink, stat, unlink } from "node:fs/promises"
import path from "node:path"

const ENV_FILES = [".env", ".env.local", ".env.production", ".env.production.local"]
const ENTRY_MISSING_CODES = new Set(["ENOENT"])
const BROKEN_TARGET_CODES = new Set(["ENOENT", "ENOTDIR", "ELOOP"])

function hasErrorCode(error, codes) {
  return error && codes.has(error.code)
}

async function lstatIfPresent(filePath) {
  try {
    return await lstat(filePath)
  } catch (error) {
    if (hasErrorCode(error, ENTRY_MISSING_CODES)) {
      return null
    }

    throw error
  }
}

async function validateAppDir(appDir) {
  const entry = await lstat(appDir)

  if (!entry.isDirectory()) {
    throw new Error(`App path is not a directory: ${appDir}`)
  }
}

async function removeBrokenEnvSymlink(filePath) {
  const entry = await lstatIfPresent(filePath)

  if (!entry || !entry.isSymbolicLink()) {
    return
  }

  try {
    await stat(filePath)
  } catch (error) {
    if (!hasErrorCode(error, BROKEN_TARGET_CODES)) {
      throw error
    }

    const target = await readlink(filePath)
    const latestEntry = await lstatIfPresent(filePath)

    if (!latestEntry || !latestEntry.isSymbolicLink()) {
      return
    }

    if ((await readlink(filePath)) !== target) {
      return
    }

    await unlink(filePath)
    console.log(
      `[env-preflight] Removed broken env symlink ${path.relative(process.cwd(), filePath)} -> ${target}`,
    )
  }
}

async function main() {
  const appDirs = process.argv.slice(2)

  if (appDirs.length === 0) {
    console.error("Usage: node scripts/remove-broken-env-symlinks.mjs <app-dir> [...app-dir]")
    process.exitCode = 1
    return
  }

  for (const appDir of appDirs) {
    const absoluteAppDir = path.resolve(process.cwd(), appDir)
    await validateAppDir(absoluteAppDir)

    for (const envFile of ENV_FILES) {
      await removeBrokenEnvSymlink(path.join(absoluteAppDir, envFile))
    }
  }
}

main().catch((error) => {
  console.error("[env-preflight] Failed to inspect env symlinks")
  console.error(error)
  process.exit(1)
})
