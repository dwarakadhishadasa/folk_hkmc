"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { animate, useReducedMotion } from "framer-motion"
import { EASE_OUT_CUBIC } from "@/lib/motion"

export function PageTransitionController() {
  const pathname = usePathname()
  const shouldReduceMotion = useReducedMotion() ?? false

  useEffect(() => {
    const main = document.querySelector("main")

    if (!main || shouldReduceMotion) {
      return
    }

    const controls = animate(
      main,
      { opacity: [0.92, 1], y: [8, 0] },
      {
        duration: 0.22,
        ease: EASE_OUT_CUBIC,
        onComplete: () => {
          // A leftover inline transform would make <main> the containing block for fixed-position descendants.
          main.style.removeProperty("opacity")
          main.style.removeProperty("transform")
        },
      },
    )

    return () => {
      controls.stop()
    }
  }, [pathname, shouldReduceMotion])

  return null
}
