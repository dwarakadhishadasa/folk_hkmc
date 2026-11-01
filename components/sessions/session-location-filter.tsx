"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, Filter } from "lucide-react"

/**
 * The desktop location filter. The choice lives in the URL so the server page
 * narrows the rows and the footer count to the same set the control names.
 * `all` is the absence of the parameter.
 *
 * The phone Overview has no filter (frame 1752), so the caller hides this
 * control below `md`.
 */
export function SessionLocationFilter({
  locations,
}: {
  locations: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const value = searchParams.get("location") ?? "all"

  return (
    <label className="relative flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-card pr-2 pl-3 text-[13px]">
      <Filter className="size-[15px] shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
      <select
        aria-label="Filter sessions by location"
        value={value}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString())
          if (event.target.value === "all") {
            next.delete("location")
          } else {
            next.set("location", event.target.value)
          }

          const query = next.toString()
          router.push(query ? `${pathname}?${query}` : pathname)
        }}
        className="appearance-none bg-transparent pr-5 text-[13px] font-medium text-[var(--program-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
      >
        <option value="all">All locations</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
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
