"use client"

import { usePathname } from "next/navigation"
import { gsap, useGSAP } from "@/lib/gsap"

export function PageTransitionController() {
  const pathname = usePathname()

  useGSAP(
    () => {
      const main = document.querySelector("main")

      if (!main || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return
      }

      gsap.fromTo(
        main,
        { autoAlpha: 0.92, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          clearProps: "opacity,visibility,transform",
          duration: 0.22,
          ease: "power2.out",
        },
      )
    },
    { dependencies: [pathname] },
  )

  return null
}
