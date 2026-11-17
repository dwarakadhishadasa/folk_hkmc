"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Cake, PartyPopper } from "lucide-react"

import { DashboardCard } from "@/components/dashboard/dashboard-card"
import type { UpcomingBirthday } from "@/lib/dashboard/birthdays"
import { cn } from "@/lib/utils"

const BRAND_GRADIENT = "linear-gradient(135deg, #9a3412 0%, #ea580c 100%)"
const TODAY_ROW_GRADIENT =
  "linear-gradient(90deg, rgba(234, 88, 12, 0.14), rgba(255, 184, 28, 0.04) 60%, transparent 92%)"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return "?"
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function countdownLabel(daysUntil: number): string {
  if (daysUntil === 0) {
    return "Today"
  }
  if (daysUntil === 1) {
    return "Tomorrow"
  }
  return `in ${daysUntil} days`
}

/**
 * The end-of-dashboard birthday board: who has a cake day coming up in the
 * preacher's patch, soonest first. The card is deliberately the page's one
 * playful surface — warm brand gradient, drifting confetti and a pulsing ring
 * on anyone whose birthday is today — while the rows keep the dashboard's type
 * scale and tokens.
 */
export function DashboardBirthdaysCard({ birthdays }: { birthdays: UpcomingBirthday[] }) {
  const reduceMotion = useReducedMotion()

  return (
    <DashboardCard
      title="Upcoming birthdays"
      subtitle="Cake days in the next 60 days, across your contacts"
      action={
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide text-white uppercase shadow-sm"
          style={{ backgroundImage: BRAND_GRADIENT }}
        >
          <PartyPopper className="size-3.5" aria-hidden="true" />
          {birthdays.length} lined up
        </span>
      }
      className="relative isolate"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-b-xl">
        <div className="animate-pulse-slow absolute -top-20 -right-16 size-56 rounded-full bg-[#ea580c] opacity-15 blur-3xl" />
        <div className="animate-pulse-slow absolute -bottom-24 -left-10 size-48 rounded-full bg-[#9a3412] opacity-10 blur-3xl [animation-delay:900ms]" />
        <span className="animate-float-up absolute bottom-10 left-6 size-1.5 rounded-full bg-[#ea580c] opacity-60" />
        <span className="animate-float-up absolute right-10 bottom-16 size-1 rounded-full bg-[#FFB81C] opacity-50 [animation-delay:1200ms]" />
        <span className="animate-ping-slow absolute top-6 right-24 size-2 rounded-full bg-[#FFB81C] opacity-50" />
        <span className="animate-ping-slow absolute top-16 left-1/3 size-1 rounded-full bg-[#ea580c] opacity-40 [animation-delay:600ms]" />
      </div>

      {birthdays.length === 0 ? (
        <div className="relative flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
            <Cake className="size-7" aria-hidden="true" />
          </span>
          <p className="text-sm text-[var(--muted-foreground)]">No birthdays in the next 60 days.</p>
        </div>
      ) : (
        <ul className="relative divide-y divide-[var(--border)]">
          {birthdays.map((birthday, index) => (
            <motion.li
              key={birthday.contactId}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
              className={cn(
                "group relative flex items-center gap-3 py-3 first:pt-1 last:pb-1",
                birthday.isToday && "rounded-xl px-2",
              )}
              style={birthday.isToday ? { backgroundImage: TODAY_ROW_GRADIENT } : undefined}
            >
              <span
                className="relative grid size-10 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white shadow-sm ring-2 ring-[var(--card)] transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: BRAND_GRADIENT }}
              >
                {initials(birthday.name)}
                {birthday.isToday ? (
                  <span
                    className="animate-ping-slow absolute inset-0 rounded-full border-2 border-[#ea580c]"
                    aria-hidden="true"
                  />
                ) : null}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--program-text)]">{birthday.name}</p>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {birthday.label}
                  {birthday.turningAge !== null ? ` · turns ${birthday.turningAge}` : ""}
                </p>
              </div>

              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap",
                  birthday.isToday
                    ? "text-white shadow-sm"
                    : birthday.daysUntil <= 7
                      ? "bg-[var(--muted)] text-[var(--program-primary)]"
                      : "text-[var(--muted-foreground)]",
                )}
                style={birthday.isToday ? { backgroundImage: BRAND_GRADIENT } : undefined}
              >
                {birthday.isToday ? (
                  <span className="inline-flex items-center gap-1">
                    <Cake className="size-3 animate-bounce" aria-hidden="true" />
                    Today
                  </span>
                ) : (
                  countdownLabel(birthday.daysUntil)
                )}
              </span>
            </motion.li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
