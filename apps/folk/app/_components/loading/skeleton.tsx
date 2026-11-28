import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

type SkeletonProps = ComponentProps<"div">

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-skeleton=""
      className={cn("relative overflow-hidden rounded-md bg-muted", className)}
      {...props}
    />
  )
}

interface SkeletonTextProps {
  lines?: number
  className?: string
  lineClassName?: string
}

export function SkeletonText({ lines = 3, className, lineClassName }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn(
            "h-3.5 w-full rounded-full",
            index === lines - 1 && lines > 1 && "w-3/5",
            lineClassName,
          )}
        />
      ))}
    </div>
  )
}

const AVATAR_SIZES = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
} as const

export function SkeletonAvatar({
  size = "md",
  className,
}: {
  size?: keyof typeof AVATAR_SIZES
  className?: string
}) {
  return <Skeleton className={cn("shrink-0 rounded-full", AVATAR_SIZES[size], className)} />
}

interface SkeletonCardProps {
  lines?: number
  showAvatar?: boolean
  showMedia?: boolean
  className?: string
}

export function SkeletonCard({
  lines = 3,
  showAvatar = false,
  showMedia = false,
  className,
}: SkeletonCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5", className)}>
      {showMedia ? <Skeleton className="mb-5 aspect-video w-full rounded-lg" /> : null}
      <div className="flex items-start gap-3">
        {showAvatar ? <SkeletonAvatar size="lg" /> : null}
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-5 w-2/3 rounded-md" />
          <SkeletonText lines={lines} />
        </div>
      </div>
    </div>
  )
}

interface SkeletonTableProps {
  rows?: number
  columns?: number
  className?: string
}

export function SkeletonTable({ rows = 5, columns = 4, className }: SkeletonTableProps) {
  const gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
      aria-hidden="true"
    >
      <div
        className="grid gap-4 border-b border-border bg-muted/60 px-4 py-3"
        style={{ gridTemplateColumns }}
      >
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 w-4/5 rounded-full" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className="grid items-center gap-4 px-4 py-3.5"
            style={{ gridTemplateColumns }}
          >
            {Array.from({ length: columns }, (_, column) => (
              <Skeleton
                key={column}
                className={cn("h-4 rounded-full", column === 0 ? "w-3/4" : "w-1/2")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

interface SkeletonListProps {
  rows?: number
  showAvatar?: boolean
  className?: string
}

export function SkeletonList({ rows = 4, showAvatar = true, className }: SkeletonListProps) {
  return (
    <div className={cn("space-y-4", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-start gap-3">
          {showAvatar ? <SkeletonAvatar /> : null}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5 rounded-full" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-4/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonImage({ className }: { className?: string }) {
  return <Skeleton className={cn("aspect-video w-full rounded-lg", className)} />
}
