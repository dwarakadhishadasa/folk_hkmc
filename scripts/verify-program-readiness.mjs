import { readFile } from "node:fs/promises"
import { strict as assert } from "node:assert"

const files = {
  folk: "packages/program-config/src/programs/folk.ts",
  gitaLife: "packages/program-config/src/programs/gita-life.ts",
  sharedAirtable: "packages/program-config/src/programs/shared-airtable.ts",
  programConfigServer: "packages/program-config/src/server.ts",
  airtableLib: "lib/airtable.ts",
  folkNextConfig: "apps/folk/next.config.mjs",
  gitaLifeNextConfig: "apps/gita-life/next.config.mjs",
  folkSignin: "apps/folk/app/api/auth/signin/route.ts",
  gitaLifeSignin: "apps/gita-life/app/api/auth/signin/route.ts",
  migration: "supabase/migrations/20260613010000_add_program_scoped_staff_memberships.sql",
  decisions: "_bmad-output/planning-artifacts/prds/prd-gita-life-operations/implementation-decision-gates.md",
}

const contents = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])),
)

assert.match(contents.folk, /id:\s*"folk"/)
assert.match(contents.folk, /baseId:\s*"appqea9DRLOXqErXb"/)
assert.match(contents.gitaLife, /id:\s*"gita-life"/)
assert.match(contents.gitaLife, /baseId:\s*"appzbssqNK53yqjZH"/)
assert.match(contents.folkNextConfig, /PROGRAM_ID:\s*"folk"/)
assert.match(contents.folkNextConfig, /NEXT_PUBLIC_PROGRAM_ID:\s*"folk"/)
assert.match(contents.gitaLifeNextConfig, /PROGRAM_ID:\s*"gita-life"/)
assert.match(contents.gitaLifeNextConfig, /NEXT_PUBLIC_PROGRAM_ID:\s*"gita-life"/)

for (const [name, content] of [
  ["folk signin", contents.folkSignin],
  ["gita-life signin", contents.gitaLifeSignin],
]) {
  assert.ok(content.includes("syncStaffProfileByEmail"), `${name} does not bootstrap Supabase staff cache`)
  assert.match(content, /ensureSupabaseAuthUser\([^)]*\):\s*Promise<string>/s, `${name} does not return the Supabase user id`)
  assert.match(
    content,
    /const supabaseUserId = await ensureSupabaseAuthUser\([^)]*\)\s+await syncStaffProfileByEmail\(\{ supabaseUserId, email \}\)/s,
    `${name} does not sync staff membership before returning ready`,
  )
}

assert.ok(
  contents.airtableLib.includes("programScopedAirtableIdEnv") && contents.airtableLib.includes('profile.id === "folk"'),
  "Airtable ID resolution must isolate non-Folk programs from generic AIRTABLE_* IDs",
)
assert.ok(
  contents.programConfigServer.includes("getProgramScopedIdEnv") && contents.programConfigServer.includes('profile.id === "folk"'),
  "Program management URL resolution must isolate non-Folk programs from generic AIRTABLE_* IDs",
)

for (const tableId of [
  "tbltzdtCmCHf6gJKD",
  "tblxfB2W2l6OXc2IX",
  "tbl9AbwkiIaAwK20X",
  "tbl2aiD2NfvrBMnfI",
  "tbl5IOOcS2RUkXzyG",
]) {
  assert.ok(contents.sharedAirtable.includes(tableId), `Missing table mapping ${tableId}`)
  assert.ok(contents.decisions.includes(tableId), `Missing decision artifact table ${tableId}`)
}

for (const table of ["programs", "staff_memberships", "airtable_identities", "airtable_sync_state", "audit_events"]) {
  assert.ok(contents.migration.includes(`public.${table}`), `Missing Supabase table ${table}`)
}

for (const gate of ["DD-1", "DD-3", "DD-6", "DD-8", "DD-9", "DD-10"]) {
  assert.ok(contents.decisions.includes(gate), `Missing decision gate ${gate}`)
}
