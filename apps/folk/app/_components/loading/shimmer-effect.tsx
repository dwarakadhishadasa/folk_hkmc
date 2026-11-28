"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

/**
 * A single soft pass across a skeleton block.
 *
 * The parent must be positioned and clipped. `useReducedMotion()` reads the
 * media query during the first client render, which would disagree with the
 * server's `false`; the mounted gate keeps both renders identical until the
 * preference is known. `motion-reduce:hidden` covers the frame before that.
 */
export function ShimmerEffect({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (mounted && reduceMotion) {
    return null
  }

  return (
    <motion.span
      aria-hidden="true"
      data-shimmer=""
      className={cn(
        "pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-foreground/10 to-transparent motion-reduce:hidden",
        className,
      )}
      initial={{ x: "-120%" }}
      animate={{ x: "320%" }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
  )
}
