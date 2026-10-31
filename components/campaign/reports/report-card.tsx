import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * A reports card: a title band in the program's primary colour, then the body.
 *
 * Frame 790 and its dark twin (1141) draw every reports card this way. The band
 * reads `--primary`, which is the design's navy in light and its brighter blue
 * in dark; a fixed navy would leave a foreign surface on the dark canvas.
 */
export function ReportCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-[var(--border)] bg-card", className)}>
      <header className="bg-[var(--primary)] px-5 py-4 text-[var(--primary-foreground)]">
        <h2 className="font-[family-name:var(--font-poppins)] text-[18px] leading-tight font-semibold">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 hidden text-[13px] leading-5 opacity-80 md:block">{subtitle}</p>
        ) : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}
