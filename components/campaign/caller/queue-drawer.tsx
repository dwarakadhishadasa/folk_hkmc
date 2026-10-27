"use client"

import { useEffect, useRef } from "react"
import { Phone, X } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

import type { CallerQueueCounts, CallerQueueEntry } from "./caller-types"

const ROW_HEIGHT = 56
const ROW_GAP = 2

function campaignLabel(entries: CallerQueueEntry[]): string {
  const names = [...new Set(entries.map((entry) => entry.campaignName))]
  return names.length === 1 ? names[0] : "All campaigns"
}

/**
 * The queue drawer — frame 2360.
 *
 * It opens over the card as a full-screen list, marks the current row, and
 * makes every row tappable. The list is virtualised: a 300–500 row queue must
 * advance without jank, and the subtitle reports the rendered window rather
 * than pretending the whole count is on screen.
 */
export function QueueDrawer({
  open,
  onOpenChange,
  entries,
  counts,
  currentId,
  onJump,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: CallerQueueEntry[]
  counts: CallerQueueCounts
  currentId: string | null
  onJump: (entry: CallerQueueEntry) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.assignmentId === currentId),
  )

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT + ROW_GAP,
    overscan: 8,
  })

  useEffect(() => {
    if (!open || entries.length === 0) {
      return
    }

    virtualizer.scrollToIndex(currentIndex, { align: "center" })
  }, [open, currentIndex, entries.length, virtualizer])

  const rendered = virtualizer.getVirtualItems()
  const renderedCount = rendered.length > 0 ? rendered.length : Math.min(entries.length, 8)
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
          {campaignLabel(entries)} · showing {renderedCount} of {entries.length}
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

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {rendered.map((virtualRow) => {
              const entry = entries[virtualRow.index]
              const isCurrent = entry.assignmentId === currentId

              return (
                <button
                  type="button"
                  key={entry.assignmentId}
                  onClick={() => onJump(entry)}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`absolute top-0 left-0 flex w-full items-center gap-4 rounded-[10px] px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] ${
                    isCurrent ? "bg-[#EEF1F8] dark:bg-[var(--secondary)]" : "hover:bg-[var(--secondary)]"
                  }`}
                  style={{
                    height: `${ROW_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <span
                    className={`flex size-[22px] shrink-0 items-center justify-center rounded-full ${
                      isCurrent ? "bg-[var(--program-primary)] text-white" : "bg-[#F1F5F9] dark:bg-[var(--secondary)]"
                    }`}
                  >
                    {isCurrent ? (
                      <Phone className="size-2.5" strokeWidth={1.6} aria-hidden="true" />
                    ) : (
                      <span className="size-1 rounded-full bg-[#CBD5E1]" aria-hidden="true" />
                    )}
                  </span>

                  <span className="w-6 shrink-0 text-[12px] text-[var(--muted-foreground)]">{virtualRow.index + 1}</span>

                  <span
                    className={`min-w-0 flex-1 truncate text-[14px] text-[var(--program-text)] ${
                      isCurrent ? "font-semibold" : "font-normal"
                    }`}
                  >
                    {entry.contactName}
                  </span>

                  <span
                    className={`shrink-0 text-[12px] ${
                      isCurrent ? "font-semibold text-[var(--program-primary)]" : "text-[#64748B]"
                    }`}
                  >
                    {isCurrent ? "← you" : "Pending"}
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
