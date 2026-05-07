"use client"

import type React from "react"

import { AuthProvider } from "@/lib/auth-context"
import { AuthHashCallback } from "@/components/auth-hash-callback"
import { NavigationFeedbackProvider } from "@/components/navigation-feedback-provider"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import { OfflineIndicator } from "@/components/offline-indicator"
import { PageTransitionController } from "@/components/page-transition-controller"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NavigationFeedbackProvider>
      <AuthProvider>
        <AuthHashCallback />
        <ServiceWorkerRegister />
        <OfflineIndicator />
        {children}
        <PageTransitionController />
      </AuthProvider>
    </NavigationFeedbackProvider>
  )
}
