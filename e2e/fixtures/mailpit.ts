/**
 * Reading the Supabase email OTP out of Mailpit.
 *
 * This is the flake-critical seam of the whole suite: mail delivery is
 * asynchronous, so the harness must poll rather than sleep, and when the poll
 * fails it must say *why* -- which address was polled, from which watermark,
 * and every message Mailpit actually held. "Timed out waiting for OTP" with no
 * context costs more debugging time than the whole read takes.
 *
 * Deliberately targets **Mailpit's documented HTTP API**, not Supabase's
 * email-delivery internals: `GET /api/v1/messages` and
 * `GET /api/v1/message/{ID}` are a stable surface, Supabase's SMTP plumbing is
 * not.
 *
 * Two deliberate constraints:
 *
 *   - No `waitForTimeout`. Every wait is a bounded, condition-driven retry.
 *   - No `?query=` filter. Mailpit's search is an optional build feature; the
 *     recipient is matched client-side against the full list instead.
 *   - No deletion. A parallel spec's mail must survive, so the poll is keyed on
 *     recipient + watermark rather than on clearing the mailbox.
 */

export const mailpitBaseUrl = (): string =>
  (process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:8025").replace(/\/+$/, "")

/** Default poll budget. Comfortably longer than local SMTP delivery. */
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_INTERVAL_MS = 500

/**
 * Mailpit records `Created` at second granularity while `since` is taken from
 * `Date.now()`. Without this slack a message created in the same second as the
 * watermark can parse as *older* than it and be discarded.
 */
const CREATED_SKEW_MS = 5_000

/**
 * Body-shaped match first. Supabase renders the code starred
 * (`Your FOLK sign-in code is:\n\n*917013*`), so a bare `/\d{6}/` over the whole
 * body would be at the mercy of any other number in the template.
 */
const SHAPED_CODE = /sign[-\s]?in code is[:\s]*\**\s*(\d{6})\b/i
const LOOSE_CODE = /(?<![\d-])(\d{6})(?![\d-])/

interface MailpitRecipient {
  Address?: string
}

interface MailpitMessageSummary {
  ID: string
  Subject?: string
  Created?: string
  To?: MailpitRecipient[]
}

interface MailpitMessage extends MailpitMessageSummary {
  Text?: string
  HTML?: string
}

export interface ReadOtpOptions {
  /** Epoch ms captured *before* the OTP was requested. */
  since: number
  /** Total poll budget in ms. Default 30000. */
  timeoutMs?: number
  /** Delay between list fetches in ms. Default 500. */
  intervalMs?: number
  /**
   * Message ids already present when the OTP was requested. When this is
   * non-empty it is the *only* accept rule: id-exclusion already means "new
   * message", so widening acceptance with a timestamp risks re-admitting the
   * exact message the snapshot was taken to exclude.
   */
  ignoreIds?: readonly string[]
  /** Injected for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch
}

/** Message ids currently in the mailbox — capture before requesting an OTP. */
export async function snapshotMessageIds(fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const messages = await listMessages(fetchImpl)
  return messages.map((message) => message.ID)
}

/**
 * `fetch` rejects with a bare `TypeError: fetch failed` on a refused or
 * unreachable port, which names nothing. Every Mailpit call goes through here
 * so a misconfigured `E2E_MAILPIT_URL` fails with the probe URL in the message
 * rather than a blank network stack.
 */
async function mailpitFetch(url: string, fetchImpl: typeof fetch): Promise<Response> {
  try {
    return await fetchImpl(url, { headers: { Accept: "application/json" } })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Mailpit request failed (GET ${url}): ${reason}`)
  }
}

async function listMessages(fetchImpl: typeof fetch): Promise<MailpitMessageSummary[]> {
  const url = `${mailpitBaseUrl()}/api/v1/messages`
  const response = await mailpitFetch(url, fetchImpl)

  if (!response.ok) {
    throw new Error(`Mailpit message list failed: ${response.status} ${response.statusText} (GET ${url})`)
  }

  const body = (await response.json()) as { messages?: MailpitMessageSummary[] }
  const messages = Array.isArray(body.messages) ? body.messages : []
  // Documented as newest-first, but sorting on `Created` costs nothing and makes
  // "newest" independent of the server's ordering. A missing or unparseable
  // `Created` sorts to the epoch rather than poisoning the comparator with
  // `NaN` (which would make the ordering unspecified for *every* message).
  return [...messages].sort((a, b) => createdMs(b) - createdMs(a))
}

/** Epoch ms for a message's `Created`, or the epoch when it is unusable. */
function createdMs(message: MailpitMessageSummary): number {
  const parsed = Date.parse(message.Created ?? "")
  return Number.isNaN(parsed) ? 0 : parsed
}

async function readMessageBody(id: string, fetchImpl: typeof fetch): Promise<MailpitMessage> {
  const url = `${mailpitBaseUrl()}/api/v1/message/${encodeURIComponent(id)}`
  const response = await mailpitFetch(url, fetchImpl)

  if (!response.ok) {
    throw new Error(`Mailpit message read failed: ${response.status} ${response.statusText} (GET ${url})`)
  }

  return (await response.json()) as MailpitMessage
}

function recipientsOf(message: MailpitMessageSummary): string[] {
  return (message.To ?? []).map((recipient) => recipient.Address ?? "").filter(Boolean)
}

function extractCode(message: MailpitMessage): string | null {
  for (const body of [message.Text, message.HTML]) {
    if (!body) {
      continue
    }

    const shaped = body.match(SHAPED_CODE)
    if (shaped?.[1]) {
      return shaped[1]
    }
  }

  // Fall back to a bare 6-digit run over the plain-text body only — never over
  // the HTML, which is full of unrelated numbers (ids, versions, sizes).
  const loose = message.Text?.match(LOOSE_CODE)
  return loose?.[1] ?? null
}

function describeMessages(messages: MailpitMessageSummary[]): string {
  if (messages.length === 0) {
    return "    (mailbox was empty)"
  }

  return messages
    .slice(0, 20)
    .map(
      (message) =>
        `    ${message.ID}  created=${message.Created ?? "?"}  to=[${recipientsOf(message).join(", ")}]  subject=${
          message.Subject ?? "?"
        }`,
    )
    .join("\n")
}

/**
 * Poll Mailpit for the newest OTP addressed to `email` and return the 6-digit
 * code. Throws with full diagnostic context on timeout.
 */
export async function readOtpForRecipient(email: string, options: ReadOtpOptions): Promise<string> {
  const { since, timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = DEFAULT_INTERVAL_MS, ignoreIds = [] } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const recipient = email.trim().toLowerCase()
  const known = new Set(ignoreIds)
  const deadline = Date.now() + timeoutMs

  let lastError: unknown = null
  let seen: MailpitMessageSummary[] = []

  for (;;) {
    try {
      seen = await listMessages(fetchImpl)
      const candidates = seen.filter((message) => {
        const addressed = recipientsOf(message).some(
          (address) => address.trim().toLowerCase() === recipient,
        )
        if (!addressed) {
          return false
        }

        // With a snapshot, id-exclusion is the whole rule. The skew window is
        // only the fallback for a caller that has no snapshot to lean on.
        if (known.size > 0) {
          return !known.has(message.ID)
        }

        return createdMs(message) >= since - CREATED_SKEW_MS
      })

      for (const candidate of candidates) {
        let full: MailpitMessage
        try {
          full = await readMessageBody(candidate.ID, fetchImpl)
        } catch (error) {
          // One unreadable body is not a reason to discard the other
          // candidates, nor to abandon the poll — keep the reason for the
          // timeout report.
          lastError = error
          continue
        }

        const code = extractCode(full)
        if (code) {
          return code
        }
      }
    } catch (error) {
      lastError = error
    }

    if (Date.now() >= deadline) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  const probeUrl = `${mailpitBaseUrl()}/api/v1/messages`
  const rule =
    known.size > 0
      ? "accept rule: message ids absent from the pre-request snapshot"
      : `accept rule: Created within ${CREATED_SKEW_MS}ms of the watermark`
  const lines = [
    `Timed out after ${timeoutMs}ms waiting for a sign-in OTP addressed to ${recipient}.`,
    `  poll url   : ${probeUrl}`,
    `  watermark  : since=${new Date(since).toISOString()}`,
    `  ${rule}`,
    `  pre-existing ids excluded by id: ${ignoreIds.length}`,
  ]

  if (lastError instanceof Error) {
    lines.push(`  last probe error: ${lastError.message}`)
  }

  lines.push(`  messages seen (newest first, ${seen.length}):`)
  lines.push(describeMessages(seen))

  throw new Error(lines.join("\n"))
}
