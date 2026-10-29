"use client"

import { useEffect, useState } from "react"
import { Check, Phone, X } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { dispositionLabel } from "@/lib/dialer/disposition"

import type { CallerQueueCounts, CallerQueueRosterItem } from "./caller-types"

const ROW_HEIGHT = 56
const ROW_GAP = 2

function campaignLabel(roster: CallerQueueRosterItem[]): string {
  const names = [...new Set(roster.map((row) => row.campaignName))]
  return names.length === 1 ? names[0] : "All campaigns"
}

function rowStatus(row: CallerQueueRosterItem): string {
  if (row.status === "SKIPPED") {
    return "Skipped"
  }

  if (row.status === "COMPLETED") {
    if (row.latestStatusGroup === "NOT_REACHABLE") {
      return "No answer"
    }

    if (row.latestStatusGroup === "WRONG_NUMBER") {
      return "Wrong number"
    }

    if (row.latestDispositionStatus) {
      return dispositionLabel(row.latestDispositionStatus).split(" — ")[0]
    }

    return "Called"
  }

  return row.actionable ? "Pending" : "Closed"
}

/**
 * The queue drawer — frame 2360.
 *
 * It opens over the card as a full-screen list of the session roster, not just
 * what is left to call: a contact who has already been reached keeps their row
 * and its outcome, so the list reads the same before and after a call. Only
 * actionable rows jump; the list is virtualised because a 300–500 row queue
 * must advance without jank, and the subtitle reports the rendered window
 * rather than pretending the whole count is on screen.
 */
export function QueueDrawer({
  open,
  onOpenChange,
  roster,
  counts,
  currentId,
  onJump,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roster: CallerQueueRosterItem[]
  counts: CallerQueueCounts
  currentId: string | null
  onJump: (assignmentId: string) => void
}) {
  // A callback ref in state, not a plain ref: the drawer's content mounts in a
  // portal one render after the virtualizer's layout effect runs, so a ref read
  // through `getScrollElement` is still null then and no scroll listener is
  // attached. Setting the element into state re-renders the virtualizer once
  // the node exists, and that render is what wires up the observer.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const currentIndex = Math.max(
    0,
    roster.findIndex((row) => row.assignmentId === currentId),
  )

  const virtualizer = useVirtualizer({
    count: roster.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT + ROW_GAP,
    overscan: 8,
    // The drawer mounts inside a portal, so the scroll element has no measured
    // height on the first pass. The seed rect paints the first window before
    // the observer reports the real size.
    initialRect: { width: 390, height: 640 },
  })

  useEffect(() => {
    if (!open || roster.length === 0 || !scrollElement) {
      return
    }

    virtualizer.scrollToIndex(currentIndex, { align: "center" })
  }, [open, currentIndex, roster.length, virtualizer, scrollElement])

  const rendered = virtualizer.getVirtualItems()
  const renderedCount = rendered.length > 0 ? rendered.length : Math.min(roster.length, 8)
  const stats = [
    { label: "Called", value: counts.called, tone: "text-[var(--program-primary)]" },
    { label: "Reached", value: counts.reached, tone: "text-[var(--program-primary)]" },
    { label: "No answer", value: counts.noAnswer, tone: "text-[var(--program-primary)]" },
    { label: "Pending", value: counts.pending, tone: "text-[#F97F29]" },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 shadow-none"
      >
        <div className="flex h-16 shrink-0 items-center gap-3 px-4">
          <DialogTitle className="font-[family-name:var(--font-poppins)] text-[22px] leading-tight font-semibold text-[var(--program-text)]">
            Queue
          </DialogTitle>
          <span className="flex-1" />
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close the queue"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F2F4F7] text-[#24324A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] dark:bg-[var(--secondary)] dark:text-[var(--foreground)]"
            >
              <X className="size-3" strokeWidth={1.4} aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        <DialogDescription className="shrink-0 px-4 pb-2 text-[13px] leading-4 text-[var(--muted-foreground)]">
          {campaignLabel(roster)} · showing {renderedCount} of {roster.length}
        </DialogDescription>

        <div className="grid shrink-0 grid-cols-4 gap-2 px-4 pt-2 pb-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex min-w-0 flex-col rounded-[10px] border border-[#E2E8F0] bg-card px-2.5 py-2.5 dark:border-[var(--border)]"
            >
              <span className="truncate text-[10px] font-semibold text-[#64748B]">{stat.label}</span>
              <span
                className={`font-[family-name:var(--font-poppins)] text-[24px] leading-9 font-bold ${stat.tone}`}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        <div className="h-px w-full shrink-0 bg-[#E2E8F0] dark:bg-[var(--border)]" />

        <div ref={setScrollElement} className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {rendered.map((virtualRow) => {
              const row = roster[virtualRow.index]
              const isCurrent = row.assignmentId === currentId
              const isDone = row.status === "COMPLETED"
              const status = rowStatus(row)

              return (
                <button
                  type="button"
                  key={row.assignmentId}
                  onClick={() => onJump(row.assignmentId)}
                  disabled={!row.actionable}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`absolute top-0 left-0 flex w-full items-center gap-4 rounded-[10px] px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] disabled:cursor-default ${
                    isCurrent
                      ? "bg-[#EEF1F8] dark:bg-[var(--secondary)]"
                      : row.actionable
                        ? "hover:bg-[var(--secondary)]"
                        : ""
                  }`}
                  style={{
                    height: `${ROW_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <span
                    className={`flex size-[22px] shrink-0 items-center justify-center rounded-full ${
                      isCurrent
                        ? "bg-[var(--program-primary)] text-white"
                        : isDone
                          ? "bg-[#15803D] text-white dark:bg-[#4ADE80] dark:text-[#12311F]"
                          : "bg-[#F1F5F9] dark:bg-[var(--secondary)]"
                    }`}
                  >
                    {isCurrent ? (
                      <Phone className="size-2.5" strokeWidth={1.6} aria-hidden="true" />
                    ) : isDone ? (
                      <Check className="size-[13px]" strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <span className="size-1 rounded-full bg-[#CBD5E1]" aria-hidden="true" />
                    )}
                  </span>

                  <span className="w-6 shrink-0 text-[12px] text-[var(--muted-foreground)]">{virtualRow.index + 1}</span>

                  <span
                    className={`min-w-0 flex-1 truncate text-[14px] ${
                      isCurrent
                        ? "font-semibold text-[var(--program-text)]"
                        : isDone || row.actionable
                          ? "font-normal text-[var(--program-text)]"
                          : "font-normal text-[#94A3B8] dark:text-[var(--muted-foreground)]"
                    }`}
                  >
                    {row.contactName}
                  </span>

                  <span
                    className={`shrink-0 text-[12px] ${
                      isCurrent ? "font-semibold text-[var(--program-primary)]" : "text-[#64748B]"
                    }`}
                  >
                    {isCurrent ? "← you" : status}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
