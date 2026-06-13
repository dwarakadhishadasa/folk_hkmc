"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { currentProgramProfile } from "@/lib/current-program"

const DISMISSAL_TTL_MS = 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

type StandaloneNavigator = Navigator & { standalone?: boolean }

export function PWAInstallPrompt() {
  const { isHydrated, isLoggedIn, staff } = useAuth()
  const { branding } = currentProgramProfile
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isPromptEligible, setIsPromptEligible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      console.log("[v0] App is already installed")
      return
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      console.log("[v0] beforeinstallprompt event fired")
      // Prevent Chrome 76+ from automatically showing the prompt
      e.preventDefault()
      // Stash the event so it can be triggered later
      setInstallPrompt(e as BeforeInstallPromptEvent)
      // Show custom install prompt
      setIsPromptEligible(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    // For iOS, show prompt if not installed
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const standaloneNavigator = window.navigator as StandaloneNavigator
    const isInStandaloneMode = "standalone" in standaloneNavigator && Boolean(standaloneNavigator.standalone)
    setIsIos(isIosDevice)

    if (isIosDevice && !isInStandaloneMode) {
      console.log("[v0] iOS detected, showing manual install prompt")
      setIsPromptEligible(true)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    }
  }, [])

  useEffect(() => {
    if (!staff) {
      setIsDismissed(false)
      return
    }

    const dismissedKey = `pwa-install-dismissed:${staff.airtableUserId}`
    const dismissed = localStorage.getItem(dismissedKey)

    if (!dismissed) {
      setIsDismissed(false)
      return
    }

    const dismissedTime = Number.parseInt(dismissed, 10)
    const hasActiveDismissal = Number.isFinite(dismissedTime) && Date.now() - dismissedTime < DISMISSAL_TTL_MS
    setIsDismissed(hasActiveDismissal)

    if (!hasActiveDismissal) {
      localStorage.removeItem(dismissedKey)
    }
  }, [staff])

  const handleInstallClick = async () => {
    if (!installPrompt) {
      console.log("[v0] No install prompt available")
      return
    }

    console.log("[v0] Triggering install prompt")
    // Show the install prompt
    await installPrompt.prompt()

    // Wait for the user to respond to the prompt
    const { outcome } = await installPrompt.userChoice
    console.log("[v0] User choice:", outcome)

    if (outcome === "accepted") {
      console.log("[v0] User accepted the install prompt")
    } else {
      console.log("[v0] User dismissed the install prompt")
    }

    // Clear the saved prompt since it can't be used again
    setInstallPrompt(null)
    setIsPromptEligible(false)
  }

  const handleDismiss = () => {
    console.log("[v0] User dismissed custom install banner")
    setIsDismissed(true)
    // Remember dismissal for 1 day
    if (staff) {
      localStorage.setItem(`pwa-install-dismissed:${staff.airtableUserId}`, Date.now().toString())
    }
  }

  if (!isHydrated || !isLoggedIn || !staff || !isPromptEligible || isDismissed) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--program-accent)] text-white p-4 shadow-lg border-t-4 border-[var(--program-accent-dark)]">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-white rounded-lg p-2 flex-shrink-0">
            <img src={branding.logoSrc} alt={branding.logoAlt} className="w-10 h-10 object-contain" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg">Install {branding.shortName}</h3>
            {isIos ? (
              <p className="text-sm text-white/80">Tap the Share button, then {"'Add to Home Screen'"}</p>
            ) : (
              <p className="text-sm text-white/80">Install the app for quick access and offline support</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!isIos && installPrompt && (
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 bg-white text-[var(--program-primary)] font-semibold rounded-lg hover:bg-[#FFF9F0] transition-colors"
            >
              Install
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="px-4 py-2 bg-black/15 text-white font-semibold rounded-lg hover:bg-black/25 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
