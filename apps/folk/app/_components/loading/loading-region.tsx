import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface LoadingRegionProps {
  /** The one polite announcement for this region. */
  label: string
  busy?: boolean
  className?: string
  children: ReactNode
}

export function LoadingRegion({ label, busy = true, className, children }: LoadingRegionProps) {
  return (
    <div aria-busy={busy || undefined} data-loading-region={label} className={cn(className)}>
      <span role="status" aria-live="polite" className="sr-only">
        {busy ? label : ""}
      </span>
      {children}
    </div>
  )
}
