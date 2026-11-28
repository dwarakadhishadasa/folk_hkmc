import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

import { LoadingRegion } from "./loading-region"
import { Skeleton, SkeletonCard, SkeletonText } from "./skeleton"

const SPINNER_SIZES = {
  sm: "size-3.5 border-[1.5px]",
  md: "size-5 border-2",
  lg: "size-8 border-[3px]",
} as const

export function LoadingSpinner({
  size = "md",
  className,
}: {
  size?: keyof typeof SPINNER_SIZES
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-loading-spinner=""
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent motion-reduce:animate-none",
        SPINNER_SIZES[size],
        className,
      )}
    />
  )
}

export function InlineLoader({
  label,
  className,
  spinnerClassName,
}: {
  label?: string
  className?: string
  spinnerClassName?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}>
      <LoadingSpinner className={spinnerClassName} />
      {label ? <span>{label}</span> : null}
    </span>
  )
}

type ButtonLoadingProps = ComponentProps<"button"> & {
  busy?: boolean
  loadingLabel?: string
  children: ReactNode
}

export function ButtonLoading({
  busy = false,
  loadingLabel = "Working…",
  children,
  className,
  disabled,
  type = "button",
  ...props
}: ButtonLoadingProps) {
  return (
    <button
      {...props}
      type={type}
      aria-busy={busy || undefined}
      disabled={busy || disabled}
      className={className}
    >
      {busy ? (
        <>
          <LoadingSpinner className="size-4 border-2" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

export function PageLoading({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children?: ReactNode
}) {
  return (
    <LoadingRegion label={label} className={cn("mx-auto w-full max-w-4xl px-4 py-8", className)}>
      {children ?? (
        <div className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-8 w-1/2 rounded-md" />
            <Skeleton className="h-4 w-3/4 rounded-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <SkeletonText lines={6} />
          </div>
        </div>
      )}
    </LoadingRegion>
  )
}
