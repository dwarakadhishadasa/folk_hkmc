import { cn } from "@/lib/utils"

/**
 * The status pill frame 32 shows in the campaign table, and the detail page
 * reuses beside the lifecycle actions.
 *
 * The four fills are the design's own values expressed through the program
 * tokens — success, info and destructive for the three coloured states, the
 * muted surface for `DRAFT` — mixed against `--card` so the tint lifts off the
 * near-black canvas in dark mode the same way it does in light. `CANCELLED` is
 * the destructive hue and `COMPLETED` the info hue, so a terminal state never
 * reads as the active green.
 */
const STATUS_CLASSES: Record<string, string> = {
  DRAFT: "bg-[var(--muted)] text-[var(--grid-linked-fg)]",
  ACTIVE: "bg-[color-mix(in_oklab,var(--success)_12%,var(--card))] text-[var(--success)]",
  COMPLETED: "bg-[color-mix(in_oklab,var(--info)_10%,var(--card))] text-[var(--info)]",
  CANCELLED: "bg-[color-mix(in_oklab,var(--destructive)_10%,var(--card))] text-[var(--destructive)]",
}

/**
 * `dialer_campaigns.status` is typed as `string`, not as the four-member union
 * the database's CHECK constraint enforces, so an unrecognised value falls back
 * to the neutral `DRAFT` surface. It still renders the stored word rather than
 * hiding it.
 */
function classesFor(status: string): string {
  // Own-key lookup: a status string is data, and `STATUS_CLASSES["constructor"]`
  // would otherwise hand `cn` a function.
  return Object.prototype.hasOwnProperty.call(STATUS_CLASSES, status)
    ? STATUS_CLASSES[status]
    : STATUS_CLASSES.DRAFT
}

export function CampaignStatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.04em]",
        classesFor(status),
      )}
    >
      {status}
    </span>
  )
}
