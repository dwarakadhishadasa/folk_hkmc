/**
 * Offline coverage for the OTP reader's timeout diagnostic.
 *
 * The intent calls this the suite's loudest requirement — "on timeout, fail with
 * the captured message ids, subjects, and recipients — a bare 'timed out waiting
 * for OTP' is the worst possible failure message" — and it had none. A dead-port
 * manual check only exercises the *network* branch; the *enumeration* branch is
 * what a real flake hits, and it only fires against a real Mailpit.
 *
 * So this spec injects the mailbox. No browser, no app, no Docker: the reader
 * takes a `fetchImpl`, so a fixed list and fixed bodies are enough to prove the
 * diagnostic names everything a human needs to debug a genuine timeout.
 */

import { expect, test } from "@playwright/test"
import { readOtpForRecipient } from "../fixtures/mailpit"

const ADMIN = "preview-fixture-admin-folk@example.com"
const VOLUNTEER = "preview-fixture-volunteer-folk@example.com"
const PREACHER = "preview-fixture-preacher-folk@example.com"
const SINCE = Date.parse("2026-10-08T09:00:00.000Z")

interface Captured {
  ID: string
  Subject: string
  Created?: string
  To: Array<{ Address: string }>
}

/**
 * Five messages, none addressed to the Admin with a usable code:
 *
 *   - a well-formed code for *another* fixture (the trap — the poll must key on
 *     the recipient, not on "newest mail"),
 *   - a Preacher message whose body read fails,
 *   - an older Preacher message with the code, so a skipped body read can still
 *     fall through to the next candidate,
 *   - an Admin message with no code,
 *   - an Admin message with no `Created`, which also exercises the sort's epoch
 *     fallback and proves the enumeration keeps undated mail.
 */
const MAILBOX: Captured[] = [
  {
    ID: "msg-newest-unrelated",
    Subject: "FOLK sign-in code (volunteer)",
    Created: "2026-10-08T09:05:00Z",
    To: [{ Address: VOLUNTEER }],
  },
  {
    ID: "msg-broken-body",
    Subject: "FOLK sign-in code (preacher)",
    Created: "2026-10-08T09:03:00Z",
    To: [{ Address: PREACHER }],
  },
  {
    ID: "msg-ours-no-code",
    Subject: "FOLK weekly digest",
    Created: "2026-10-08T09:04:00Z",
    To: [{ Address: ADMIN }],
  },
  {
    ID: "msg-preacher-code",
    Subject: "FOLK sign-in code (preacher, resend)",
    Created: "2026-10-08T09:01:00Z",
    To: [{ Address: PREACHER }],
  },
  {
    ID: "msg-ours-undated",
    Subject: "FOLK password reset requested",
    To: [{ Address: "someone.else@example.com" }, { Address: ADMIN }],
  },
]

const BODIES: Record<string, string> = {
  "msg-newest-unrelated": "Your FOLK sign-in code is:\n\n*111111*",
  "msg-broken-body": "Your FOLK sign-in code is:\n\n*999999*",
  "msg-ours-no-code": "Here is your weekly digest. No code in this one.",
  "msg-preacher-code": "Your FOLK sign-in code is:\n\n*222222*",
  "msg-ours-undated": "We received a password reset request.",
}

function fakeMailpitFetch(url: string): Response {
  if (url.endsWith("/api/v1/messages")) {
    return Response.json({ messages: MAILBOX })
  }

  const id = decodeURIComponent(url.slice(url.lastIndexOf("/message/") + "/message/".length))
  const body = BODIES[id]
  if (body === undefined) {
    return new Response(`no such message ${id}`, { status: 404 })
  }

  return Response.json({ ...MAILBOX.find((message) => message.ID === id), Text: body })
}

const fetchImpl = fakeMailpitFetch as unknown as typeof fetch

async function timeoutMessage(recipient: string, options: { ignoreIds?: string[] } = {}): Promise<string> {
  const error = await readOtpForRecipient(recipient, {
    since: SINCE,
    timeoutMs: 150,
    intervalMs: 25,
    ignoreIds: options.ignoreIds,
    fetchImpl,
  }).then(
    () => null,
    (caught: Error) => caught,
  )

  expect(error, `expected the poll for ${recipient} to time out`).not.toBeNull()
  return (error as Error).message
}

test("a timeout enumerates the mailbox, the probe URL and the watermark", async () => {
  const diagnostic = await timeoutMessage(ADMIN)

  expect(diagnostic).toContain("Timed out after 150ms waiting for a sign-in OTP")
  // The address that was actually polled, so a wrong `E2E_*_EMAIL` is visible.
  expect(diagnostic).toContain(ADMIN)
  // The endpoint that was actually probed.
  expect(diagnostic).toContain("/api/v1/messages")
  // The watermark, and the rule derived from it.
  expect(diagnostic).toContain("2026-10-08T09:00:00.000Z")
  expect(diagnostic).toMatch(/accept rule:/)

  // Every captured message: ids, recipients and subjects. A message addressed
  // to another fixture is exactly what separates "wrong recipient" from "no
  // mail delivered", so it must not be filtered out of the report — and neither
  // must the message with no `Created`.
  expect(diagnostic).toContain(`messages seen (newest first, ${MAILBOX.length})`)
  for (const captured of MAILBOX) {
    expect(diagnostic).toContain(captured.ID)
    expect(diagnostic).toContain(captured.Subject)
    for (const recipient of captured.To) {
      expect(diagnostic).toContain(recipient.Address)
    }
  }
})

test("the poll keys on the recipient, not on the newest message", async () => {
  // `msg-newest-unrelated` carries a well-formed code but belongs to another
  // fixture; asking for that fixture must succeed rather than reading someone
  // else's OTP.
  await expect(
    readOtpForRecipient(VOLUNTEER, { since: SINCE, timeoutMs: 1_000, intervalMs: 25, fetchImpl }),
  ).resolves.toBe("111111")
})

test("ids from the pre-request snapshot are excluded even inside the skew window", async () => {
  // The message's `Created` is well within CREATED_SKEW_MS of the watermark, so
  // a timestamp-only rule would still accept it. The snapshot is the rule.
  const diagnostic = await timeoutMessage(VOLUNTEER, { ignoreIds: ["msg-newest-unrelated"] })

  expect(diagnostic).toContain("absent from the pre-request snapshot")
  expect(diagnostic).toContain("pre-existing ids excluded by id: 1")
})

test("an unreadable body is skipped, not treated as fatal", async () => {
  const flakyFetch = ((url: string) => {
    if (url.includes("/api/v1/message/msg-broken-body")) {
      throw new Error("connection reset")
    }
    return fakeMailpitFetch(url)
  }) as unknown as typeof fetch

  // The Preacher's newest candidate is unreadable; the reader must skip it and
  // still find the code on the next candidate rather than abandoning the poll.
  await expect(
    readOtpForRecipient(PREACHER, { since: SINCE, timeoutMs: 1_000, intervalMs: 25, fetchImpl: flakyFetch }),
  ).resolves.toBe("222222")
})
