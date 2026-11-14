"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

/*
 * Copied from the Studio panel's "creating" tile in Gemini Notebook (REA
 * capture of the Slide Deck button). The tile paints a 200%-wide conic aurora
 * behind a 2px inset plate. A conic mask turns a ~25° window every 2.25s while
 * the gradient itself turns once per 6.75s, so the arc sweeps the pill and the
 * colours drift as it goes.
 */
const AURORA_GRADIENT =
  "conic-gradient(from 0deg, rgb(46, 100, 222) 34%, rgb(60, 143, 227) 37%, rgb(126, 143, 230) 39%, rgb(152, 123, 233) 41%, rgb(152, 123, 233) 48%, rgb(126, 143, 230) 50%, rgb(60, 143, 227) 52%, rgb(60, 143, 227) 56%, rgb(60, 143, 227) 58%, rgb(60, 143, 227) 61%, rgb(60, 143, 227) 65%, rgb(126, 143, 230) 70%, rgb(152, 123, 233) 72%, rgb(126, 143, 230) 73%, rgb(46, 100, 222) 83%, rgb(46, 100, 222) 100%)"

const ARC_MASK =
  "conic-gradient(from 0deg, transparent 0%, transparent 50%, #000 68%, #000 75%, transparent 89%, transparent 100%)"

/**
 * The wait ring around a control whose navigation is in flight.
 *
 * `plateClassName` must paint the control's own surface: the plate hides the
 * centre of the aurora and leaves the ring visible at the edge. The parent must
 * be `relative isolate` so the ring sits above the control's background and
 * below its content.
 */
export function AuroraRing({
  active,
  plateClassName = "bg-card",
}: {
  active: boolean
  plateClassName?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence>
      {active ? (
        <motion.span
          aria-hidden="true"
          data-loading-ring
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.05, 0.7, 0.1, 1] }}
        >
          <span className="absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2">
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{
                maskImage: reduceMotion ? undefined : ARC_MASK,
                WebkitMaskImage: reduceMotion ? undefined : ARC_MASK,
                willChange: "transform",
              }}
              animate={reduceMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 2.25, ease: "linear", repeat: Infinity }}
            >
              {/*
                The gradient turns 6.75s in the page's frame: the outer mask
                already turns once per 2.25s, so this child turns the other way
                once per 3.375s and the two add up to 6.75s.
              */}
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ backgroundImage: AURORA_GRADIENT, willChange: "transform" }}
                animate={reduceMotion ? undefined : { rotate: -360 }}
                transition={{ duration: 3.375, ease: "linear", repeat: Infinity }}
              />
            </motion.span>
          </span>
          <span className={cn("absolute inset-[2px] rounded-[inherit]", plateClassName)} />
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}
