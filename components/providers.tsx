"use client"

import type React from "react"

import { AuthProvider } from "@/lib/auth-context"
import { AuthHashCallback } from "@/components/auth-hash-callback"
import { NavigationFeedbackProvider } from "@/components/navigation-feedback-provider"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import { OfflineIndicator } from "@/components/offline-indicator"
import { PageTransitionController } from "@/components/page-transition-controller"
import { ThemeProvider } from "@/components/theme-provider"
import { VisualViewportHeight } from "@/components/visual-viewport-height"

export function Providers({ children }: { children: React.ReactNode }) {
  // Outermost by contract: `next-themes` sets the class on `<html>` during
  // hydration, so anything that reads a token before it runs sees the wrong theme.
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NavigationFeedbackProvider>
        <AuthProvider>
          <AuthHashCallback />
          <ServiceWorkerRegister />
          <OfflineIndicator />
          <VisualViewportHeight />
          {children}
          <PageTransitionController />
        </AuthProvider>
      </NavigationFeedbackProvider>
    </ThemeProvider>
  )
}
