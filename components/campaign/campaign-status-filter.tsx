"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, Filter } from "lucide-react"

const STATUS_OPTIONS = [
  { value: "all", label: "All campaigns" },
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
]

/**
 * Frame 32's filter control, carried in the URL rather than in client state so
 * the server page (and the tiles above it) narrow to the same set the table
 * shows. `all` is the absence of the parameter, which is what the frame's
 * default reads as.
 */
export function CampaignStatusFilter({ value }: { value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <label className="relative flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-card pl-3 pr-2 text-[13px]">
      <Filter className="size-[15px] shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
      <select
        aria-label="Filter campaigns by status"
        value={value}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString())
          if (event.target.value === "all") {
            next.delete("status")
          } else {
            next.set("status", event.target.value)
          }

          const query = next.toString()
          router.push(query ? `${pathname}?${query}` : pathname)
        }}
        className="appearance-none bg-transparent pr-5 text-[13px] font-medium text-[var(--program-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 size-[15px] text-[var(--muted-foreground)]"
        aria-hidden="true"
      />
    </label>
  )
}
