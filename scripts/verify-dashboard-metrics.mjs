#!/usr/bin/env node
/**
 * verify-dashboard-metrics.mjs — the dashboard's one-definition contract.
 *
 * `dashboard_overview` and `dashboard_candidates` are the only places a
 * dashboard number is computed. This script checks that against direct SQL on
 * the loopback stack, using a disposable slice of the programme:
 *
 *   - contactsConfirmed matches the direct latest-reached count
 *   - the pipeline stages are nested
 *   - sum(outcomes) = callsMade
 *   - uniqueAttendees = invitedAttendees + organicAttendees
 *   - the campaign card equals `campaign_progress` for the same scope
 *   - an unlinked campaign's attended is null, never 0
 *   - a campaign with two linked sessions aggregates attended across them
 *   - every focus count equals its drill-down total
 *   - the RPC guards and the no-dialer path behave as contracted
 *
 * It refuses a non-loopback Supabase URL (the same fail-closed predicate the
 * e2e config uses) and removes every row it created in a `finally`.
 *
 * Usage:
 *   pnpm test:dashboard-contract
 *   pnpm test:dashboard-contract --program gita-life
 *   node scripts/verify-dashboard-metrics.mjs --keep
 */

import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { isLocalSupabaseUrl } from "./local-supabase-target.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
for (const file of ["apps/folk/.env.local", ".env.local", ".env.migration.local"]) {
  const target = path.join(repoRoot, file)
  if (existsSync(target)) {
    try {
      process.loadEnvFile(target)
    } catch {
      // Already-exported environment wins; a malformed file is not this gate's failure.
    }
  }
}

const argv = process.argv.slice(2)
function flagValue(name) {
  const index = argv.indexOf(name)
  return index === -1 ? null : argv[index + 1]
}

const PROGRAM = flagValue("--program") ?? "folk"
const KEEP = argv.includes("--keep")
const HAS_DIALER = PROGRAM === "folk"

if (!["folk", "gita-life"].includes(PROGRAM)) {
  console.error(`ERROR --program must be folk or gita-life (got ${PROGRAM})`)
  process.exit(1)
}

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERROR SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing. Run `pnpm supabase:env`.")
  process.exit(1)
}

if (!isLocalSupabaseUrl(SUPABASE_URL)) {
  console.error(`ERROR Refusing to run this contract against a non-loopback URL: ${SUPABASE_URL}`)
  process.exit(1)
}

let pass = 0
function check(label, condition, detail = "") {
  if (!condition) {
    throw new Error(`${label}${detail ? `: ${detail}` : ""}`)
  }

  pass += 1
  console.log(`ok ${pass} - ${label}`)
}

async function rows(query) {
  const response = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`SQL failed (${response.status}): ${text.slice(0, 600)}`)
  }

  if (!text.trim()) {
    return []
  }

  return JSON.parse(text)
}

async function one(query) {
  const result = await rows(query)
  return result[0] ?? null
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function uuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Refusing a non-UUID id in SQL: ${value}`)
  }

  return value
}

async function rpc(name, args) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  })

  const text = await response.text()

  if (!response.ok) {
    const error = new Error(`${name} failed (${response.status}): ${text.slice(0, 600)}`)
    error.status = response.status
    error.body = text
    throw error
  }

  return JSON.parse(text)
}

const tag = Date.now().toString(36)
const created = {
  campaignIds: [],
  sessionIds: [],
  contactIds: [],
  callerId: null,
}

let today = null
let scope = null

async function cleanup() {
  if (KEEP) {
    console.log("keeping the disposable fixture because --keep was passed")
    return
  }

  if (
    created.campaignIds.length === 0 &&
    created.sessionIds.length === 0 &&
    created.contactIds.length === 0 &&
    !created.callerId
  ) {
    return
  }

  const campaignList = created.campaignIds.map(uuid).map(quote).join(",")
  const sessionList = created.sessionIds.map(uuid).map(quote).join(",")
  const contactList = created.contactIds.map(uuid).map(quote).join(",")

  const statements = ["BEGIN;"]
  if (sessionList) statements.push(`DELETE FROM public.attendance WHERE session_id IN (${sessionList});`)
  if (campaignList) {
    statements.push(`DELETE FROM public.dialer_assignments WHERE campaign_id IN (${campaignList});`)
  }
  if (sessionList) statements.push(`DELETE FROM public.sessions WHERE id IN (${sessionList});`)
  if (contactList) statements.push(`DELETE FROM public.contacts WHERE id IN (${contactList});`)
  if (campaignList) statements.push(`DELETE FROM public.dialer_campaigns WHERE id IN (${campaignList});`)
  if (created.callerId) {
    statements.push(`DELETE FROM public.dialer_callers WHERE id = ${quote(uuid(created.callerId))};`)
  }
  statements.push("COMMIT;")

  try {
    await rows(statements.join("\n"))
  } catch (error) {
    console.error(`WARN cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function insertCampaign(name) {
  const row = await one(`
    INSERT INTO public.dialer_campaigns (program_id, name, campaign_date, status)
    VALUES (${quote(PROGRAM)}, ${quote(`${name} ${tag}`)}, ${quote(today)}, 'ACTIVE')
    RETURNING id
  `)
  created.campaignIds.push(row.id)
  return row.id
}

async function insertSession(name, sessionDate, campaignId) {
  const row = await one(`
    INSERT INTO public.sessions (
      program_id, name, session_date, preacher_id, location_id, campaign_id,
      public_attendance_enabled, attendance_opens_at, attendance_closes_at,
      duration_minutes, created_by
    )
    VALUES (
      ${quote(PROGRAM)}, ${quote(`${name} ${tag}`)}, ${quote(sessionDate)},
      ${quote(uuid(scope.preacherId))}, ${quote(uuid(scope.locationId))},
      ${campaignId ? quote(uuid(campaignId)) : "NULL"},
      true,
      ${quote(`${sessionDate}T10:00:00+05:30`)},
      ${quote(`${sessionDate}T11:00:00+05:30`)},
      60, ${quote(uuid(scope.preacherId))}
    )
    RETURNING id
  `)
  created.sessionIds.push(row.id)
  return row.id
}

async function insertContact(name, initialDate) {
  const phone = `9${String(Date.now()).slice(-8)}${created.contactIds.length}`
  const row = await one(`
    INSERT INTO public.contacts (
      program_id, name, phone, location_ids, assigned_preacher_id,
      collected_by_id, initial_contact, source
    )
    VALUES (
      ${quote(PROGRAM)}, ${quote(`${name} ${tag}`)}, ${quote(phone)},
      ARRAY[${quote(uuid(scope.locationId))}]::TEXT[],
      ${quote(uuid(scope.preacherId))}, ${quote(uuid(scope.preacherId))},
      ${quote(initialDate)}, 'dashboard-contract'
    )
    RETURNING id
  `)
  created.contactIds.push(row.id)
  return row.id
}

async function insertAssignment(callerId, campaignId, contactId) {
  const row = await one(`
    INSERT INTO public.dialer_assignments (
      program_id, campaign_id, caller_id, contact_id, status, sort_order, assigned_at
    )
    VALUES (
      ${quote(PROGRAM)}, ${quote(uuid(campaignId))}, ${quote(uuid(callerId))},
      ${quote(uuid(contactId))}, 'PENDING', 0, now()
    )
    RETURNING id
  `)
  return row.id
}

async function insertLog(callerId, assignmentId, phone, disposition, calledAt) {
  await rows(`
    INSERT INTO public.dialer_call_logs (
      program_id, assignment_id, caller_id, dial_phone, attempt, disposition_status, called_at
    )
    VALUES (
      ${quote(PROGRAM)}, ${quote(uuid(assignmentId))}, ${quote(uuid(callerId))},
      ${quote(phone)}, 1, ${quote(disposition)}, ${quote(calledAt)}
    )
  `)
}

async function insertAttendance(sessionId, contactId) {
  await rows(`
    INSERT INTO public.attendance (program_id, session_id, contact_id, name, phone)
    SELECT ${quote(PROGRAM)}, ${quote(uuid(sessionId))}, c.id, c.name, c.phone
    FROM public.contacts c
    WHERE c.id = ${quote(uuid(contactId))}
  `)
}

function dateOffset(days) {
  const [year, month, day] = today.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

async function main() {
  const todayRow = await one("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS today")
  today = todayRow.today

  scope = await one(`
    SELECT
      u.id::text AS "preacherId",
      COALESCE(
        (SELECT l.id FROM public.locations l
          WHERE l.program_id = u.program_id AND l.status = 'Active'
            AND l.id = ANY(COALESCE(u.location_ids, ARRAY[]::UUID[]))
          ORDER BY l.name LIMIT 1),
        (SELECT l.id FROM public.locations l
          WHERE l.program_id = u.program_id AND l.status = 'Active'
          ORDER BY l.name LIMIT 1)
      )::text AS "locationId"
    FROM public.users u
    WHERE u.program_id = ${quote(PROGRAM)}
      AND u.role = 'Preacher'
      AND u.status = 'Active'
    ORDER BY u.id
    LIMIT 1
  `)

  check("the programme has an active Preacher and a location", scope?.preacherId && scope?.locationId)

  const windowStart = dateOffset(-365)
  const todayDate = today
  const prevStart = dateOffset(-730)
  const prevEnd = dateOffset(-366)

  const overview = await rpc("dashboard_overview", {
    p_program_id: PROGRAM,
    p_scope_preacher_id: scope.preacherId,
    p_program_scope: false,
    p_start: windowStart,
    p_end: todayDate,
    p_today: todayDate,
    p_prev_start: prevStart,
    p_prev_end: prevEnd,
    p_has_dialer: HAS_DIALER,
  })

  check("overview carries the resolved scope", overview.programScope === false)
  check("overview period echoes the window", overview.period.start === windowStart && overview.period.end === todayDate)

  if (HAS_DIALER) {
    const linkedCampaign = await insertCampaign("ZDash contract linked")
    const unlinkedCampaign = await insertCampaign("ZDash contract unlinked")
    const linkedSessionA = await insertSession("ZDash contract session A", dateOffset(-10), linkedCampaign)
    const linkedSessionB = await insertSession("ZDash contract session B", dateOffset(-3), linkedCampaign)
    const oldSessionA = await insertSession("ZDash contract old A", dateOffset(-90), null)
    const oldSessionB = await insertSession("ZDash contract old B", dateOffset(-80), null)

    // Reuse the Preacher's own caller profile when the seed holds one; only a
    // profile this run creates is removed in cleanup.
    let caller = await one(`
      SELECT id::text AS id FROM public.dialer_callers
      WHERE program_id = ${quote(PROGRAM)} AND user_id = ${quote(uuid(scope.preacherId))}
      ORDER BY is_active DESC, id LIMIT 1
    `)

    if (!caller) {
      caller = await one(`
        INSERT INTO public.dialer_callers (program_id, user_id, display_name, is_active)
        VALUES (${quote(PROGRAM)}, ${quote(uuid(scope.preacherId))}, ${quote(`ZDash caller ${tag}`)}, true)
        RETURNING id::text AS id
      `)
      created.callerId = caller.id
    }

    const confirmedAttended = await insertContact("ZDash contract confirmed attended", dateOffset(-20))
    const confirmedAbsent = await insertContact("ZDash contract confirmed absent", dateOffset(-20))
    const calledNotReached = await insertContact("ZDash contract called not reached", dateOffset(-20))
    const readyToInvite = await insertContact("ZDash contract ready to invite", dateOffset(-20))
    const organic = await insertContact("ZDash contract organic", dateOffset(-20))
    await insertContact("ZDash contract new untouched", dateOffset(-30))
    const fading = await insertContact("ZDash contract fading", dateOffset(-200))
    const committed = await insertContact("ZDash contract committed", dateOffset(-200))

    const assignmentA = await insertAssignment(caller.id, linkedCampaign, confirmedAttended)
    const assignmentB = await insertAssignment(caller.id, linkedCampaign, confirmedAbsent)
    const assignmentC = await insertAssignment(caller.id, unlinkedCampaign, calledNotReached)
    const assignmentD = await insertAssignment(caller.id, unlinkedCampaign, readyToInvite)

    const phoneOf = async (contactId) =>
      (await one(`SELECT phone FROM public.contacts WHERE id = ${quote(uuid(contactId))}`)).phone

    await insertLog(caller.id, assignmentA, await phoneOf(confirmedAttended), "CONFIRMED", `${dateOffset(-15)}T10:00:00+05:30`)
    await insertLog(caller.id, assignmentB, await phoneOf(confirmedAbsent), "CONFIRMED", `${dateOffset(-9)}T10:00:00+05:30`)
    await insertLog(caller.id, assignmentC, await phoneOf(calledNotReached), "CALL_DID_NOT_CONNECT", `${dateOffset(-8)}T10:00:00+05:30`)
    await insertLog(caller.id, assignmentD, await phoneOf(readyToInvite), "MAY_COME", `${dateOffset(-7)}T10:00:00+05:30`)

    await insertAttendance(linkedSessionA, confirmedAttended)
    await insertAttendance(linkedSessionA, organic)
    await insertAttendance(oldSessionA, fading)
    await insertAttendance(oldSessionB, fading)
    await insertAttendance(oldSessionA, committed)
    await insertAttendance(linkedSessionA, committed)
    await insertAttendance(linkedSessionB, committed)

    const after = await rpc("dashboard_overview", {
      p_program_id: PROGRAM,
      p_scope_preacher_id: scope.preacherId,
      p_program_scope: false,
      p_start: windowStart,
      p_end: todayDate,
      p_today: todayDate,
      p_prev_start: prevStart,
      p_prev_end: prevEnd,
      p_has_dialer: true,
    })

    // 1. contactsConfirmed matches the direct latest-reached-in-window count.
    const directConfirmed = await one(`
      WITH scoped AS (
        SELECT c.id FROM public.contacts c
        WHERE c.program_id = ${quote(PROGRAM)}
          AND c.assigned_preacher_id = ${quote(uuid(scope.preacherId))}
      ),
      logs AS (
        SELECT l.id, l.status_group, l.called_at, a.contact_id
        FROM public.dialer_call_logs l
        JOIN public.dialer_assignments a ON a.id = l.assignment_id
        JOIN scoped s ON s.id = a.contact_id
        WHERE l.program_id = ${quote(PROGRAM)}
          AND (l.called_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${quote(windowStart)} AND ${quote(todayDate)}
          AND l.status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER')
      ),
      latest AS (
        SELECT DISTINCT ON (contact_id) contact_id, status_group
        FROM logs
        ORDER BY contact_id, called_at DESC, id DESC
      )
      SELECT count(*)::int AS confirmed FROM latest WHERE status_group = 'CONFIRMED'
    `)
    check(
      "contactsConfirmed equals the direct latest-reached count",
      after.kpis.contactsConfirmed === directConfirmed.confirmed,
      `${after.kpis.contactsConfirmed} vs ${directConfirmed.confirmed}`,
    )

    // 2. The pipeline stages are strictly nested.
    const stageCounts = after.pipeline.stages.map((stage) => stage.count)
    check(
      "pipeline stages are nested",
      stageCounts.every((count, index) => index === 0 || count <= stageCounts[index - 1]),
      JSON.stringify(stageCounts),
    )

    // 3. Outcomes sum to calls made.
    const outcomesSum = after.outcomes.reduce((sum, outcome) => sum + outcome.count, 0)
    check("sum(outcomes) = callsMade", outcomesSum === after.kpis.callsMade, `${outcomesSum} vs ${after.kpis.callsMade}`)

    // 4. The attendance partition is exact.
    check(
      "uniqueAttendees = invitedAttendees + organicAttendees",
      after.kpis.uniqueAttendees === after.kpis.invitedAttendees + after.kpis.organicAttendees,
      `${after.kpis.uniqueAttendees} vs ${after.kpis.invitedAttendees} + ${after.kpis.organicAttendees}`,
    )

    // 5. The campaign card equals campaign_progress for the same scope.
    for (const [label, campaignId] of [
      ["linked", linkedCampaign],
      ["unlinked", unlinkedCampaign],
    ]) {
      const progress = await rpc("campaign_progress", {
        p_campaign_id: campaignId,
        p_scope_preacher_id: scope.preacherId,
        p_program_scope: false,
      })
      const card = after.campaigns.find((campaign) => campaign.id === campaignId)
      check(`the ${label} campaign is on the card`, Boolean(card))
      check(
        `the ${label} campaign matches campaign_progress`,
        card.assigned === progress.summary.assigned &&
          card.attempted === progress.summary.attempted &&
          card.reached === progress.summary.reached &&
          card.confirmed === progress.summary.confirmed &&
          card.neverAttempted === progress.summary.never_attempted,
        JSON.stringify({ card, summary: progress.summary }),
      )
    }

    const linkedCard = after.campaigns.find((campaign) => campaign.id === linkedCampaign)
    const unlinkedCard = after.campaigns.find((campaign) => campaign.id === unlinkedCampaign)

    // 6. An unlinked campaign's attended is null, never 0.
    check("an unlinked campaign has attended: null", unlinkedCard.attended === null)

    // 7. The two linked sessions aggregate to the one invited attendee.
    check("the linked campaign has two linked sessions", linkedCard.sessionCount === 2)
    check("the linked campaign aggregates attendance across both sessions", linkedCard.attended === 1)

    // 8. Every focus count equals its drill-down total.
    for (const segment of [
      "confirmed_not_attended",
      "ready_to_invite",
      "committed_not_invited",
      "new_untouched",
      "fading",
    ]) {
      const candidates = await rpc("dashboard_candidates", {
        p_program_id: PROGRAM,
        p_scope_preacher_id: scope.preacherId,
        p_program_scope: false,
        p_has_dialer: true,
        p_today: todayDate,
        p_segment: segment,
        p_limit: 3,
        p_offset: 0,
      })
      const focus = after.focus.find((entry) => entry.key === segment)
      check(`focus ${segment} count equals its drill-down total`, focus.count === candidates.total)
      check(`focus ${segment} rows are capped at three`, candidates.rows.length <= 3)
    }

    // 9. The guards.
    await assert.rejects(
      () =>
        rpc("dashboard_candidates", {
          p_program_id: PROGRAM,
          p_scope_preacher_id: scope.preacherId,
          p_program_scope: false,
          p_has_dialer: true,
          p_today: todayDate,
          p_segment: "not-a-rule",
          p_limit: 3,
          p_offset: 0,
        }),
      (error) => String(error.body ?? error.message).includes("invalid_segment"),
    )
    pass += 1
    console.log(`ok ${pass} - an unknown segment is refused`)

    const noDialer = await rpc("dashboard_overview", {
      p_program_id: PROGRAM,
      p_scope_preacher_id: scope.preacherId,
      p_program_scope: false,
      p_start: windowStart,
      p_end: todayDate,
      p_today: todayDate,
      p_prev_start: prevStart,
      p_prev_end: prevEnd,
      p_has_dialer: false,
    })
    check("p_has_dialer = false returns no outcomes", noDialer.outcomes.length === 0)
    check("p_has_dialer = false returns no campaigns", noDialer.campaigns.length === 0)

    await assert.rejects(
      () =>
        rpc("dashboard_overview", {
          p_program_id: PROGRAM,
          p_scope_preacher_id: null,
          p_program_scope: false,
          p_start: windowStart,
          p_end: todayDate,
          p_today: todayDate,
          p_prev_start: prevStart,
          p_prev_end: prevEnd,
          p_has_dialer: true,
        }),
      (error) => String(error.body ?? error.message).includes("scope_preacher_required"),
    )
    pass += 1
    console.log(`ok ${pass} - a null scope id in own scope is refused`)
  } else {
    check("a no-dialer programme has no outcomes", overview.outcomes.length === 0)
    check("a no-dialer programme has no campaign card", overview.campaigns.length === 0)
    check("a no-dialer programme still carries the five focus segments", overview.focus.length === 5)
  }

  console.log(`\n${pass} dashboard contract checks passed.`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
} finally {
  await cleanup()
}
