"use client"

import type React from "react"

import { AuthProvider } from "@/lib/auth-context"
import { AuthHashCallback } from "@/components/auth-hash-callback"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import { OfflineIndicator } from "@/components/offline-indicator"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthHashCallback />
      <ServiceWorkerRegister />
      <OfflineIndicator />
      {children}
    </AuthProvider>
  )
}
