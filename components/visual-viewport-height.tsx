"use client"

import { useEffect } from "react"

/**
 * Keeps the app's viewport variables in step with the visual viewport.
 *
 * Chrome Android honours `interactive-widget=resizes-content`; iOS Safari and
 * Firefox do not, so a fixed-height shell would stay behind the on-screen
 * keyboard. The visual viewport is the part the keyboard leaves visible; the
 * shells and mobile dialogs read these variables with a `100dvh` fallback.
 *
 * `offsetTop` is the visual viewport's offset from the layout viewport when the
 * page pans for a focused field; a full-screen frame uses it so it stays over
 * the visible area rather than the layout origin.
 */
export function VisualViewportHeight() {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    let frame = 0

    const apply = () => {
      frame = 0
      const height = viewport?.height ?? window.innerHeight
      const offsetTop = viewport?.offsetTop ?? 0

      root.style.setProperty("--app-viewport-height", `${Math.round(height)}px`)
      root.style.setProperty("--app-viewport-offset-top", `${Math.round(offsetTop)}px`)
    }

    const schedule = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(apply)
      }
    }

    apply()
    viewport?.addEventListener("resize", schedule)
    viewport?.addEventListener("scroll", schedule)
    window.addEventListener("resize", schedule)
    window.addEventListener("orientationchange", schedule)

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame)
      }

      viewport?.removeEventListener("resize", schedule)
      viewport?.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      window.removeEventListener("orientationchange", schedule)
      root.style.removeProperty("--app-viewport-height")
      root.style.removeProperty("--app-viewport-offset-top")
    }
  }, [])

  return null
}
