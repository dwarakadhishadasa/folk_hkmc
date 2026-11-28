"use client"

import { useEffect } from "react"

import { Header } from "@/components/header"

import { RouteError } from "../_components/loading"

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[login] route error", error)
  }, [error])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-md px-4 py-16">
        <RouteError
          title="We couldn't load sign-in"
          description="The sign-in page didn't arrive. Check your connection and try again."
          onRetry={reset}
        />
      </main>
    </div>
  )
}
