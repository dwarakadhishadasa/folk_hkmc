"use client"

import type React from "react"

import { AuthProvider } from "@/lib/auth-context"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import { OfflineIndicator } from "@/components/offline-indicator"
import { PWAInstallPrompt } from "@/components/pwa-install-prompt"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ServiceWorkerRegister />
      <OfflineIndicator />
      <PWAInstallPrompt />
      {children}
    </AuthProvider>
  )
}
