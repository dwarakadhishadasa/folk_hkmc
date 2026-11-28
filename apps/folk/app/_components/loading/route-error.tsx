import { AlertTriangle, RotateCw } from "lucide-react"

import { cn } from "@/lib/utils"

interface RouteErrorProps {
  title?: string
  description?: string
  retryLabel?: string
  onRetry: () => void
  className?: string
}

export function RouteError({
  title = "We couldn't load this page",
  description = "Something went wrong while loading. Check your connection and try again.",
  retryLabel = "Try again",
  onRetry,
  className,
}: RouteErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "mx-auto w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-overlay",
        className,
      )}
    >
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="font-[family-name:var(--font-poppins)] text-lg font-bold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--program-accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-[var(--program-accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RotateCw className="size-4" aria-hidden="true" />
        {retryLabel}
      </button>
    </div>
  )
}
