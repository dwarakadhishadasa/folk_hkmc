"use client"

import { useEffect, useRef, useState } from "react"
import { animate, useReducedMotion } from "framer-motion"

import { formatCount } from "@/lib/dashboard/format"

/**
 * A stat figure that counts from its previous value when the period changes.
 *
 * The first paint is the final value, not zero: a reader, a test and a
 * server-rendered snapshot all see the measured number. Only a change animates,
 * and reduced motion jumps straight to it.
 */
export function AnimatedCount({ value, className }: { value: number; className?: string }) {
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(value)
  const previous = useRef(value)

  useEffect(() => {
    const from = previous.current
    previous.current = value

    if (from === value) {
      return
    }

    if (reduceMotion) {
      setDisplay(value)
      return
    }

    const controls = animate(from, value, {
      duration: 0.85,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    })

    return () => controls.stop()
  }, [value, reduceMotion])

  return (
    <span className={className} data-value={value}>
      {formatCount(display)}
    </span>
  )
}
