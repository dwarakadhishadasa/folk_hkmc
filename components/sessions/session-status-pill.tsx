import { cn } from "@/lib/utils"
import type { SessionStatus } from "@/lib/sessions/data"

/**
 * The three derived states, in the design's tones: Upcoming warning, Live now
 * success, Completed info. The tints are mixed against `--card` so they lift
 * off the near-black canvas in dark mode the same way they do in light.
 */
const STATUS_CLASSES: Record<SessionStatus, string> = {
  "Live now": "bg-[#e8f5ec] text-[#15803d] dark:bg-[#10331c] dark:text-[#7ee2a3]",
  Upcoming:
    "bg-[color-mix(in_oklab,var(--grid-warning-ink)_12%,var(--card))] text-[var(--grid-warning-ink)]",
  Completed: "bg-[color-mix(in_oklab,var(--info)_10%,var(--card))] text-[var(--info)]",
}

export function SessionStatusPill({ status }: { status: SessionStatus }) {
  return (
    <span
      data-session-status-pill={status}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-[3px] text-[12px] font-medium whitespace-nowrap",
        STATUS_CLASSES[status],
      )}
    >
      {status}
    </span>
  )
}
