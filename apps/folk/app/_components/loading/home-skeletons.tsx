import { LoadingRegion } from "./loading-region"
import { ShimmerEffect } from "./shimmer-effect"
import { Skeleton, SkeletonText } from "./skeleton"

export function HomePageSkeleton() {
  return (
    <LoadingRegion label="Loading the FOLK course page" className="min-h-screen bg-background">
      <div aria-hidden="true">
        <section className="relative flex min-h-[60vh] items-center justify-center overflow-hidden bg-muted py-12 md:min-h-[75vh] md:py-20">
          <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4">
            <Skeleton className="mb-8 h-36 w-36 rounded-full border-4 border-background/50 bg-foreground/10 md:h-72 md:w-72" />
            <Skeleton className="mb-4 h-16 w-56 rounded-lg bg-foreground/15 md:h-28 md:w-96" />
            <Skeleton className="mb-8 h-10 w-64 rounded-full bg-foreground/10 md:w-80" />
            <Skeleton className="h-4 w-full max-w-2xl rounded-full bg-foreground/10" />
            <Skeleton className="mt-3 h-4 w-3/4 max-w-xl rounded-full bg-foreground/10" />
          </div>
          <ShimmerEffect />
        </section>

        <section className="mx-auto max-w-7xl px-6 py-24 md:px-12">
          <div className="flex flex-col items-center gap-16 md:flex-row">
            <div className="w-full space-y-4 md:w-1/2">
              <Skeleton className="h-10 w-3/4 rounded-md" />
              <Skeleton className="h-2 w-24 rounded-full" />
              <SkeletonText lines={4} />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
            <Skeleton className="h-[320px] w-full rounded-t-full md:h-[500px] md:w-1/2" />
          </div>
        </section>

        <section className="bg-muted/40 py-24">
          <div className="mx-auto max-w-7xl px-6 md:px-12">
            <div className="mb-16 flex flex-col items-center gap-4">
              <Skeleton className="h-10 w-64 rounded-md" />
              <Skeleton className="h-4 w-full max-w-2xl rounded-full" />
            </div>
            <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
              {[0, 1, 2].map((card) => (
                <div key={card} className="rounded-2xl border border-border bg-card p-10">
                  <Skeleton className="mb-8 size-16 rounded-full" />
                  <Skeleton className="mb-4 h-6 w-2/3 rounded-md" />
                  <SkeletonText lines={3} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </LoadingRegion>
  )
}
