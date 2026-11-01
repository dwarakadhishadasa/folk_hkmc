"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * The phone detail's `Sort`, which toggles the attendee order the server
 * renders: attendance order (the default) or name A–Z. The URL carries the
 * choice so the ordering is testable and survives a refresh; the desktop table
 * has no sort control in its frame.
 */
export function SessionAttendeeSort() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const value = searchParams.get("sort") === "name" ? "name" : "attendance"

  return (
    <select
      aria-label="Sort attendees"
      value={value}
      onChange={(event) => {
        const next = new URLSearchParams(searchParams.toString())
        if (event.target.value === "attendance") {
          next.delete("sort")
        } else {
          next.set("sort", event.target.value)
        }

        const query = next.toString()
        router.push(query ? `${pathname}?${query}` : pathname)
      }}
      className="bg-transparent text-[12px] font-medium text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
    >
      <option value="attendance">Sort</option>
      <option value="name">Name A–Z</option>
    </select>
  )
}
