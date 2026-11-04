"use client"

import { Check, RotateCcw } from "lucide-react"

import type { CallerSessionSummary } from "./caller-types"

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[10px] border border-[#E2E8F0] bg-card px-2.5 py-2.5 dark:border-[var(--border)]">
      <span className="truncate text-[10px] font-semibold text-[var(--muted-foreground)]">{label}</span>
      <span className="font-[family-name:var(--font-poppins)] text-[24px] leading-9 font-bold text-[var(--program-text)]">
        {value}
      </span>
    </div>
  )
}

/**
 * Session complete — no frame exists; the shape is ux-flows §3a.
 *
 * The counts are the caller's own work, not `campaign_progress`. Recall is the
 * primary action on the phone because it is the one action that turns an
 * unlucky contact list into a second pass; Done is secondary.
 */
export function SessionSummary({
  summary,
  loading,
  recalling,
  failure,
  receipt,
  onRecall,
  onDone,
}: {
  summary: CallerSessionSummary | null
  loading: boolean
  recalling: boolean
  failure: string | null
  receipt?: { kind: "saving" | "saved" | "queued" | "failed"; text: string } | null
  onRecall: () => void
  onDone: () => void
}) {
  if (loading && !summary) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <p role="status" className="text-[13px] text-[var(--muted-foreground)]">
          Loading your session…
        </p>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
        <p className="text-[13px] text-[var(--muted-foreground)]">Your session summary is not available right now.</p>
        <button
          type="button"
          onClick={onDone}
          className="h-11 rounded-xl border border-[#E2E8F0] px-4 text-[13px] font-semibold text-[var(--program-text)] dark:border-[var(--border)]"
        >
          Back to my queue
        </button>
      </div>
    )
  }

  const { counts, campaign } = summary

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-16 shrink-0 items-center px-4">
        <h1 className="font-[family-name:var(--font-poppins)] text-[22px] leading-tight font-semibold text-[var(--program-text)]">
          Session complete
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        <p className="text-[13px] leading-4 text-[var(--muted-foreground)]">
          {campaign.name} · {counts.total} assigned to you
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <CountTile label="Called" value={counts.called} />
          <CountTile label="Reached" value={counts.reached} />
          <CountTile label="No answer" value={counts.noAnswer} />
          <CountTile label="Wrong number" value={counts.wrongNumber} />
          <CountTile label="Skipped early" value={counts.skipped} />
          <CountTile label="Pending" value={counts.pending} />
        </div>

        <p className="mt-4 text-[13px] leading-5 text-[var(--program-text)]">
          {counts.recallable > 0
            ? `${counts.recallable} ${counts.recallable === 1 ? "person was" : "people were"} not reachable. Re-queueing keeps them in your queue for a second pass.`
            : "No unreachable contacts are waiting to be re-queued."}
        </p>

        {counts.closedAfterCap > 0 ? (
          <p className="mt-2 text-[12px] leading-4 text-[var(--muted-foreground)]">
            {counts.closedAfterCap} {counts.closedAfterCap === 1 ? "contact is" : "contacts are"} closed after{" "}
            {campaign.maxAttempts} attempts.
          </p>
        ) : null}

        {failure ? (
          <p role="alert" className="mt-4 rounded-xl bg-[#FEF2F2] px-3 py-2.5 text-[12px] leading-4 text-[#B91C1C] dark:bg-[#3A1717] dark:text-[#FCA5A5]">
            {failure}
          </p>
        ) : null}

        {receipt ? (
          <p
            role="status"
            className={`mt-4 text-[12px] ${
              receipt.kind === "failed"
                ? "font-semibold text-[#B91C1C] dark:text-[#FCA5A5]"
                : "text-[var(--muted-foreground)]"
            }`}
          >
            {receipt.text}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-[var(--mobile-app-nav-inset,0px)] z-20 mt-auto flex shrink-0 flex-col gap-2 border-t border-[#E2E8F0] bg-card px-4 py-4 dark:border-[var(--border)]">
        {counts.recallable > 0 ? (
          <button
            type="button"
            onClick={onRecall}
            disabled={recalling}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--program-primary)] text-[16px] font-semibold text-white transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="size-4" strokeWidth={2} aria-hidden="true" />
            {recalling ? "Re-queueing…" : `Re-queue those ${counts.recallable} and continue`}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDone}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-card text-[14px] font-semibold text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] dark:border-[var(--border)]"
        >
          <Check className="size-4" strokeWidth={2} aria-hidden="true" />
          Done — back to my queue
        </button>
      </div>
    </div>
  )
}
