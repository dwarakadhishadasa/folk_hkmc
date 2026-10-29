"use client"

import { Copy, Phone } from "lucide-react"

import { dispositionLabel, isReachedGroup } from "@/lib/dialer/disposition"

import type { CallerContactHistoryEntry, CallerQueueEntry } from "./caller-types"

function formatHistoryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date)
}

function historyOutcome(entry: CallerContactHistoryEntry): string {
  if (isReachedGroup(entry.statusGroup)) {
    return "Answered"
  }

  return entry.statusGroup === "WRONG_NUMBER" ? "Wrong number" : "No answer"
}

function historyDetail(entry: CallerContactHistoryEntry): string {
  if (isReachedGroup(entry.statusGroup)) {
    const label = dispositionLabel(entry.dispositionStatus).split(" — ")[0]
    return [label, entry.followUpNotes].filter(Boolean).join(" · ")
  }

  const attempts = entry.attempt > 1 ? `tried ${entry.attempt === 2 ? "twice" : `${entry.attempt} times`}` : "first call"
  return `${attempts}${entry.followUpNotes ? ` · ${entry.followUpNotes}` : " · no follow-up"}`
}

/**
 * The call card — frame 2263.
 *
 * The design's card is name, phone with Copy, a divider and the last N calls.
 * Skip and Pause are required design omissions: they live in the card header so
 * they are always reachable without a separate control surface. Pause is a
 * normal state, not an error, and a draft banner is neutral paper, not a toast.
 */
export function CallCard({
  entry,
  paused,
  callStarted,
  copyState,
  skipBusy,
  draftNotice,
  receipt,
  onCopy,
  onSkip,
  onTogglePause,
  onResumeDraft,
}: {
  entry: CallerQueueEntry
  paused: boolean
  callStarted: boolean
  copyState: "idle" | "copied" | "failed"
  skipBusy: boolean
  draftNotice: boolean
  receipt?: { kind: "saving" | "saved" | "queued" | "failed"; text: string } | null
  onCopy: () => void
  onSkip: () => void
  onTogglePause: () => void
  onResumeDraft: () => void
}) {
  return (
    <article className="flex flex-col rounded-xl border border-[#E2E8F0] bg-card p-3 text-[var(--program-text)]">
      {receipt ? (
        <p
          role="status"
          className={`mb-2 text-[11px] ${
            receipt.kind === "failed"
              ? "font-semibold text-[#B91C1C] dark:text-[#FCA5A5]"
              : "text-[var(--muted-foreground)]"
          }`}
        >
          {receipt.text}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onSkip}
          disabled={skipBusy}
          className="text-[11px] font-semibold text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] disabled:opacity-50"
        >
          {skipBusy ? "Skipping…" : "Skip"}
        </button>
        <button
          type="button"
          onClick={onTogglePause}
          className="text-[11px] font-semibold text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)]"
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      <h2 className="mt-0.5 font-[family-name:var(--font-poppins)] text-[26px] leading-[1.15] font-semibold tracking-tight text-[var(--program-text)]">
        {entry.contactName}
      </h2>

      {paused ? (
        <span className="mt-2 w-fit rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[10px] font-semibold text-[#4A5568] dark:bg-[var(--secondary)] dark:text-[var(--muted-foreground)]">
          Paused — answers and place kept
        </span>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <p className="text-[15px] leading-6 text-[var(--program-text)]">{entry.phone || "No phone number"}</p>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-card px-3 text-[12px] font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)]"
        >
          <Copy className="size-3" strokeWidth={1.2} aria-hidden="true" />
          {copyState === "copied" ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mt-3 h-px w-full bg-[#E2E8F0] dark:bg-[var(--border)]" />

      <p className="mt-2 text-[11px] font-semibold text-[var(--muted-foreground)]">Previous</p>

      {entry.history.length === 0 ? (
        <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">No previous calls for this contact.</p>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {entry.history.map((history) => (
            <div key={history.callLogId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="w-[38px] shrink-0 text-[11px] text-[var(--muted-foreground)]">
                {formatHistoryDate(history.calledAt)}
              </span>
              <span className="text-[12px] font-semibold text-[var(--program-text)]">{historyOutcome(history)}</span>
              <span className="min-w-0 flex-1 text-[11px] leading-4 text-[var(--muted-foreground)]">
                {historyDetail(history)}
              </span>
            </div>
          ))}
        </div>
      )}

      {draftNotice ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[#7C2D12] dark:bg-[#3A2415] dark:text-[#FDBA74]">
          <p className="text-[11px] leading-4">A call for this contact could not be saved. Its answers are still here.</p>
          <button
            type="button"
            onClick={onResumeDraft}
            className="shrink-0 text-[11px] font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)]"
          >
            Resume
          </button>
        </div>
      ) : null}

      {callStarted ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
          <Phone className="size-3" strokeWidth={1.5} aria-hidden="true" />
          Call in progress. Return to this tab and the outcome screen opens automatically.
        </p>
      ) : null}
    </article>
  )
}
