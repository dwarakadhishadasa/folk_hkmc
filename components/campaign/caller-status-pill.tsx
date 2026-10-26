import { cn } from "@/lib/utils"

export type CallerStatus = "active" | "inactive" | "unassigned"

/**
 * The roster's three profile states (frame 645).
 *
 * `Not a caller` is not a lesser kind of inactive: a staff user with no
 * `dialer_callers` row has never been promoted, so nothing can be switched off
 * and no history is at stake. The neutral surface says exactly that, and keeps a
 * deactivated caller's warm tint reserved for a real deactivation.
 */
const STATUS_CLASSES: Record<CallerStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-[color-mix(in_oklab,var(--success)_12%,var(--card))] text-[var(--success)]",
  },
  inactive: {
    label: "Inactive",
    className: "bg-[color-mix(in_oklab,var(--destructive)_10%,var(--card))] text-[var(--destructive)]",
  },
  unassigned: {
    label: "Not a caller",
    className: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  },
}

export function CallerStatusPill({ status }: { status: CallerStatus }) {
  const definition = STATUS_CLASSES[status]

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.04em]",
        definition.className,
      )}
    >
      {definition.label}
    </span>
  )
}
