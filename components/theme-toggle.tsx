"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

/**
 * The app's light/dark control.
 *
 * Renders `null` until mounted: `next-themes` cannot know the theme during SSR
 * or on the first client render, so an icon chosen from that value would be a
 * server-rendered icon that disagrees with the client — a hydration mismatch of
 * its own, on top of the `<html>` one.
 *
 * The accessible name is fixed and the icon is `aria-hidden`, so the button is
 * addressable by one stable handle before and after the swap, and the icon
 * carries no semantics of its own.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--header-action-bg)] text-[var(--header-action-text)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-[var(--header-action-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)]"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  )
}
