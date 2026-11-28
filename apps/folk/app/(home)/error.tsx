"use client"

import { useEffect } from "react"

import { RouteError } from "../_components/loading"

export default function HomeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[home] route error", error)
  }, [error])

  return (
    <div className="container mx-auto max-w-md px-4 py-16">
      <RouteError
        title="We couldn't load the FOLK page"
        description="The course details didn't arrive. Check your connection and try again."
        onRetry={reset}
      />
    </div>
  )
}
