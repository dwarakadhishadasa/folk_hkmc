"use client"

import { useEffect, useState } from "react"

export function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showPrompt, setShowPrompt] = useState(false)

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
      setInstallPrompt(e)
      // Show custom install prompt
      setShowPrompt(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    // For iOS, show prompt if not installed
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isInStandaloneMode = "standalone" in window.navigator && (window.navigator as any).standalone

    if (isIos && !isInStandaloneMode) {
      console.log("[v0] iOS detected, showing manual install prompt")
      setShowPrompt(true)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!installPrompt) {
      console.log("[v0] No install prompt available")
      return
    }

    console.log("[v0] Triggering install prompt")
    // Show the install prompt
    installPrompt.prompt()

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
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    console.log("[v0] User dismissed custom install banner")
    setShowPrompt(false)
    // Remember dismissal for 7 days
    localStorage.setItem("pwa-install-dismissed", Date.now().toString())
  }

  useEffect(() => {
    // Check if user dismissed the prompt recently
    const dismissed = localStorage.getItem("pwa-install-dismissed")
    if (dismissed) {
      const dismissedTime = Number.parseInt(dismissed)
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      if (Date.now() - dismissedTime < sevenDays) {
        setShowPrompt(false)
      }
    }
  }, [])

  if (!showPrompt) return null

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-orange-600 text-white p-4 shadow-lg border-t-4 border-orange-700">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-white rounded-lg p-2 flex-shrink-0">
            <img src="/public/images/folk-logo.png" alt="FOLK Logo" className="w-10 h-10" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg">Install FOLK Chennai</h3>
            {isIos ? (
              <p className="text-sm text-orange-100">Tap the Share button, then {"'Add to Home Screen'"}</p>
            ) : (
              <p className="text-sm text-orange-100">Install the app for quick access and offline support</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!isIos && installPrompt && (
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 bg-white text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors"
            >
              Install
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="px-4 py-2 bg-orange-700 text-white font-semibold rounded-lg hover:bg-orange-800 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
