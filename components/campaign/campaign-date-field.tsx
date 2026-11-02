"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"
import { CalendarDays, ChevronDown } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const ISO = "yyyy-MM-dd"
const DISPLAY = "d MMM yyyy"

/**
 * The campaign end date as a shadcn date picker: a trigger that names the day
 * and a single-month calendar in a popover.
 *
 * `compact` is the header's shape — it sits under the campaign name rather
 * than in a labelled form field.
 */
export function CampaignDateField({
  id,
  label,
  value,
  onChange,
  disabledBefore,
  compact = false,
  className,
}: {
  id?: string
  label?: string
  value: string
  onChange: (value: string) => void
  /** `YYYY-MM-DD`; earlier days are disabled. */
  disabledBefore?: string
  compact?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : undefined

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="text-[13px] font-semibold text-[var(--program-text)]">
          {label}
        </label>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-label={label ? `${label}: ${value || "choose a date"}` : "Campaign end date"}
            className={cn(
              "relative flex items-center gap-2 rounded-lg border border-[var(--border)] bg-card px-3 text-left text-[var(--program-text)] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              compact ? "h-8 text-[12px]" : "h-10 w-full text-[13px]",
            )}
          >
            <CalendarDays
              aria-hidden="true"
              className="size-4 shrink-0 text-[var(--muted-foreground)]"
            />
            <span className={cn("truncate", !value && "text-[var(--muted-foreground)]")}>
              {value ? format(selected!, DISPLAY) : "Choose a date"}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            defaultMonth={selected}
            selected={selected}
            onSelect={(day) => {
              if (!day) {
                return
              }

              onChange(format(day, ISO))
              setOpen(false)
            }}
            disabled={disabledBefore ? { before: parseISO(disabledBefore) } : undefined}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
