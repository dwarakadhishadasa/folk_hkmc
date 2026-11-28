"use client"

import { useEffect } from "react"

import { Header } from "@/components/header"

import { RouteError } from "../_components/loading"

export default function RegisterError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[register] route error", error)
  }, [error])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-lg px-4 py-16">
        <RouteError
          title="We couldn't load registration"
          description="The registration form didn't arrive. Check your connection and try again."
          onRetry={reset}
        />
      </main>
    </div>
  )
}
