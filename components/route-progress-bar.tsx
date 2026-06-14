"use client"

import { useEffect, useRef } from "react"
import { gsap } from "@/lib/gsap"
import { useNavigationFeedback } from "@/components/navigation-feedback-provider"
import { cn } from "@/lib/utils"

export function RouteProgressBar({ className }: { className?: string }) {
  const { isNavigating } = useNavigationFeedback()
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const delayRef = useRef<ReturnType<typeof gsap.delayedCall> | null>(null)
  const timelineRef = useRef<ReturnType<typeof gsap.timeline> | null>(null)
  const hasShownRef = useRef(false)

  useEffect(() => {
    const track = trackRef.current
    const fill = fillRef.current

    if (!track || !fill) {
      return
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    delayRef.current?.kill()
    timelineRef.current?.kill()
    gsap.killTweensOf([track, fill])

    if (!isNavigating) {
      if (!hasShownRef.current) {
        gsap.set(track, { autoAlpha: 0 })
        gsap.set(fill, { scaleX: 0, transformOrigin: "left center" })
        return
      }

      hasShownRef.current = false
      gsap.to(fill, {
        scaleX: 1,
        duration: prefersReducedMotion ? 0 : 0.16,
        ease: "power2.out",
      })
      gsap.to(track, {
        autoAlpha: 0,
        delay: prefersReducedMotion ? 0 : 0.12,
        duration: prefersReducedMotion ? 0 : 0.18,
        ease: "power1.out",
        onComplete: () => gsap.set(fill, { scaleX: 0, transformOrigin: "left center" }),
      })
      return
    }

    gsap.set(track, { autoAlpha: 0 })
    gsap.set(fill, { scaleX: 0, transformOrigin: "left center" })

    delayRef.current = gsap.delayedCall(0.15, () => {
      hasShownRef.current = true
      gsap.set(track, { autoAlpha: 1 })

      if (prefersReducedMotion) {
        gsap.set(fill, { scaleX: 1, transformOrigin: "left center" })
        return
      }

      timelineRef.current = gsap
        .timeline()
        .to(fill, { scaleX: 0.62, duration: 0.28, ease: "power2.out" })
        .to(fill, { scaleX: 0.86, duration: 1.15, ease: "power1.inOut" })
        .to(fill, { scaleX: 0.94, duration: 1.1, ease: "sine.inOut", repeat: -1, yoyo: true })
    })

    return () => {
      delayRef.current?.kill()
      timelineRef.current?.kill()
    }
  }, [isNavigating])

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
