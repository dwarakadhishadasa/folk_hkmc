"use client"

import type { FormEvent } from "react"
import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const DEFAULT_SESSION_DURATION_MINUTES = "15"
const MAX_SESSION_DURATION_MINUTES = 24 * 60

const FIELD_CLASS =
  "w-full rounded-lg border border-input bg-field px-3 py-2.5 text-sm text-foreground shadow-sm transition-all placeholder:text-muted-foreground/60 focus:border-[var(--program-accent)] focus:outline-none focus:ring-4 focus:ring-ring/15 disabled:bg-muted disabled:text-muted-foreground"
const LABEL_CLASS = "block text-[12px] font-semibold text-foreground"

/**
 * The creation flow, in a popover from the page's `+ New session` action.
 *
 * It still starts a session now, opens attendance immediately, closes it after
 * the duration and enables the public link; nothing is scheduled. A successful
 * create leaves the page for that session's live dashboard, so the form never
 * has to render a second state.
 */
export function NewSessionPopover({
  locations,
  campaigns = [],
  className,
}: {
  locations: Array<{ id: string; name: string }>
  campaigns?: Array<{ id: string; name: string; status: string; campaignDate: string }>
  className?: string
}) {
  const router = useRouter()
  const fieldId = useId()
  const nameId = `${fieldId}-name`
  const locationId = `${fieldId}-location`
  const campaignId = `${fieldId}-campaign`
  const durationId = `${fieldId}-duration`
  const defaultLocationId = locations[0]?.id ?? ""
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [location, setLocation] = useState(defaultLocationId)
  const [campaign, setCampaign] = useState("")
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_SESSION_DURATION_MINUTES)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  // ACTIVE first, then the most recent campaign date, then name. The dropdown
  // is optional: `No campaign` is the default and sends no link.
  const campaignOptions = [...campaigns].sort((left, right) => {
    const leftActive = left.status === "ACTIVE" ? 0 : 1
    const rightActive = right.status === "ACTIVE" ? 0 : 1

    if (leftActive !== rightActive) {
      return leftActive - rightActive
    }

    if (left.campaignDate !== right.campaignDate) {
      return right.campaignDate.localeCompare(left.campaignDate)
    }

    return left.name.localeCompare(right.name)
  })

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setMessage("")
      if (!locations.some((entry) => entry.id === location)) {
        setLocation(defaultLocationId)
      }
      if (!campaignOptions.some((entry) => entry.id === campaign)) {
        setCampaign("")
      }
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage("")

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, locationId: location, campaignId: campaign || null, durationMinutes }),
      })
      const data = (await response.json()) as { error?: string; session?: { id?: string } }

      if (!response.ok) {
        throw new Error(data.error || "Failed to start session.")
      }

      if (!data.session?.id) {
        throw new Error("The session was created but its id was not returned.")
      }

      setOpen(false)
      router.push(`/sessions/${data.session.id}/live`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to start session.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button size="lg" className={`h-10 rounded-lg px-4 ${className ?? ""}`}>
          <Plus className="size-4" aria-hidden="true" />
          New session
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        className="w-[min(92vw,380px)] p-4"
      >
        <div className="mb-3">
          <h2 className="font-[family-name:var(--font-poppins)] text-[16px] font-semibold text-[var(--program-text)]">
            New session
          </h2>
          <p className="mt-0.5 text-[12px] leading-4 text-[var(--muted-foreground)]">
            Attendance opens now and closes after the duration.
          </p>
        </div>

        {locations.length === 0 ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            No locations are available for this staff account.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="space-y-1">
              <label htmlFor={nameId} className={LABEL_CLASS}>
                Session name
              </label>
              <input
                id={nameId}
                data-session-name
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
                placeholder="Enter session name"
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor={locationId} className={LABEL_CLASS}>
                Location
              </label>
              <select
                id={locationId}
                data-session-location
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                required
                className={FIELD_CLASS}
              >
                {locations.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>

            {campaigns.length > 0 ? (
              <div className="space-y-1">
                <label htmlFor={campaignId} className={LABEL_CLASS}>
                  Campaign
                </label>
                <select
                  id={campaignId}
                  data-session-campaign
                  value={campaign}
                  onChange={(event) => setCampaign(event.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value="">No campaign</option>
                  {campaignOptions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} · {entry.campaignDate} · {entry.status}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] leading-4 text-[var(--muted-foreground)]">
                  Links this session to the campaign that invited people to it.
                </p>
              </div>
            ) : null}

            <div className="space-y-1">
              <label htmlFor={durationId} className={LABEL_CLASS}>
                Duration (minutes)
              </label>
              <input
                id={durationId}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_SESSION_DURATION_MINUTES}
                step={1}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                required
                className={FIELD_CLASS}
              />
            </div>

            {message ? (
              <p role="alert" className="text-[12px] leading-4 text-destructive">
                {message}
              </p>
            ) : null}

            <Button type="submit" disabled={isSubmitting} className="mt-1 h-10 w-full">
              {isSubmitting ? "Starting..." : "Start session"}
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  )
}
