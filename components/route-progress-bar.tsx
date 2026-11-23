"use client"

import { useEffect, useRef } from "react"
import { animate, useReducedMotion } from "framer-motion"
import { useNavigationFeedback } from "@/components/navigation-feedback-provider"
import { EASE_IN_OUT_QUAD, EASE_IN_OUT_SINE, EASE_OUT_CUBIC, EASE_OUT_QUAD } from "@/lib/motion"
import { cn } from "@/lib/utils"

const REVEAL_DELAY_MS = 150

type Animation = ReturnType<typeof animate>

export function RouteProgressBar({ className }: { className?: string }) {
  const { isNavigating } = useNavigationFeedback()
  const shouldReduceMotion = useReducedMotion() ?? false
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const animationsRef = useRef<Animation[]>([])
  const revealTimerRef = useRef<number | null>(null)
  const hasShownRef = useRef(false)

  useEffect(() => {
    const track = trackRef.current
    const fill = fillRef.current

    if (!track || !fill) {
      return
    }

    const play = (animation: Animation) => {
      animationsRef.current.push(animation)
      return animation
    }

    if (!isNavigating) {
      if (hasShownRef.current) {
        hasShownRef.current = false
        play(animate(fill, { scaleX: 1 }, { duration: shouldReduceMotion ? 0 : 0.16, ease: EASE_OUT_CUBIC }))
        play(
          animate(
            track,
            { opacity: 0 },
            {
              delay: shouldReduceMotion ? 0 : 0.12,
              duration: shouldReduceMotion ? 0 : 0.18,
              ease: EASE_OUT_QUAD,
              onComplete: () => play(animate(fill, { scaleX: 0 }, { duration: 0 })),
            },
          ),
        )
      } else {
        play(animate(track, { opacity: 0 }, { duration: 0 }))
        play(animate(fill, { scaleX: 0 }, { duration: 0 }))
      }
    } else {
      play(animate(track, { opacity: 0 }, { duration: 0 }))
      play(animate(fill, { scaleX: 0 }, { duration: 0 }))

      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null
        hasShownRef.current = true
        play(animate(track, { opacity: 1 }, { duration: 0 }))

        if (shouldReduceMotion) {
          play(animate(fill, { scaleX: 1 }, { duration: 0 }))
          return
        }

        play(
          animate([
            [fill, { scaleX: 0.62 }, { duration: 0.28, ease: EASE_OUT_CUBIC }],
            [fill, { scaleX: 0.86 }, { duration: 1.15, ease: EASE_IN_OUT_QUAD }],
            [
              fill,
              { scaleX: 0.94 },
              { duration: 1.1, ease: EASE_IN_OUT_SINE, repeat: Infinity, repeatType: "reverse" },
            ],
          ]),
        )
      }, REVEAL_DELAY_MS)
    }

    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current)
        revealTimerRef.current = null
      }

      animationsRef.current.forEach((animation) => animation.stop())
      animationsRef.current = []
    }
  }, [isNavigating, shouldReduceMotion])

  return (
    <div
      ref={trackRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden opacity-0", className)}
    >
      <div
        ref={fillRef}
        className="h-full w-full origin-left scale-x-0 bg-[var(--program-accent)] shadow-[0_0_12px_rgba(0,0,0,0.2)]"
      />
    </div>
  )
}
