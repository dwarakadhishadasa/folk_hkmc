"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { programDay } from "@/lib/program-day"
import { cn } from "@/lib/utils"

const PLACEHOLDER_NAME = "Untitled campaign"
const DEFAULT_DAYS = 30

/** `YYYY-MM-DD` plus whole days, in UTC so the programme day cannot shift. */
function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * The Overview's create action, and the one the Reports and Dashboard empty
 * states share.
 *
 * There is no pre-id screen: choosing `New campaign` writes a DRAFT with a
 * placeholder name and a default end date, then opens the campaign's workspace,
 * where the details card, the survey, the assign-to pane and the grid are all
 * present. Renaming the placeholder is the first thing the details card invites.
 */
export function NewCampaignButton({
  label,
  size = "lg",
  className,
}: {
  label: string
  size?: "default" | "lg"
  className?: string
}) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (isCreating) {
      return
    }

    setError(null)
    setIsCreating(true)

    try {
      const response = await fetch("/api/dialer/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: PLACEHOLDER_NAME,
          description: null,
          campaignDate: addDays(programDay(), DEFAULT_DAYS),
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { campaign?: { id?: string }; error?: string }
        | null

      if (!response.ok) {
        setError(payload?.error ?? "Unable to create the campaign.")
        setIsCreating(false)
        return
      }

      if (!payload?.campaign?.id) {
        setError("The campaign was created but the server returned no id. Reload the campaign list.")
        setIsCreating(false)
        return
      }

      router.push(`/campaigns/${payload.campaign.id}/assign-contacts`)
    } catch {
      setError("Unable to reach the server. Your campaign was not created.")
      setIsCreating(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size={size}
        className={cn(size === "lg" ? "h-10 rounded-lg px-4" : undefined, className)}
        disabled={isCreating}
        onClick={() => {
          void create()
        }}
      >
        {isCreating ? "Creating…" : label}
      </Button>
      {error ? (
        <p role="alert" className="max-w-[260px] text-right text-[11px] text-[var(--destructive)]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
