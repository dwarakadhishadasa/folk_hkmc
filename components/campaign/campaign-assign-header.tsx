"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { CampaignStatusPill } from "@/components/campaign/campaign-status-pill"
import { formatCampaignDate } from "@/components/campaign/campaign-format"
import { Button } from "@/components/ui/button"

/**
 * The campaign page's head: the name the report will be run against, its
 * status, its end date, and the one lifecycle action a DRAFT campaign has.
 *
 * Name, description and end date are edited in the details card below, so this
 * row never becomes a second form. A COMPLETED campaign renders the same head
 * with no action: its record is closed.
 */
export function CampaignAssignHeader({
  campaign,
}: {
  campaign: {
    id: string
    name: string
    description: string | null
    campaignDate: string
    status: string
  }
}) {
  const router = useRouter()
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canStart = campaign.status === "DRAFT"

  const startCampaign = async () => {
    if (isStarting) {
      return
    }

    setError(null)
    setIsStarting(true)

    try {
      const response = await fetch(`/api/dialer/admin/campaigns/${campaign.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; code?: string }
        | null

      if (!response.ok) {
        setError(payload?.error ?? "Unable to start the campaign.")
        setIsStarting(false)
        return
      }

      setIsStarting(false)
      // Starting is the end of the setup surface: the campaign now lives on
      // the Overview, where its status and counts are read.
      router.push("/campaigns")
    } catch {
      setError("Unable to reach the server. The campaign was not started.")
      setIsStarting(false)
    }
  }

  return (
    <div className="flex items-start gap-4">
      <Link
        href="/campaigns"
        aria-label="Back to campaigns"
        className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-card text-[var(--program-text)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
      >
        <ArrowLeft className="size-[18px]" aria-hidden="true" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="truncate font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
          {campaign.name}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <CampaignStatusPill status={campaign.status} />
          <span className="text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">
            Ends
          </span>
          <span className="text-[13px] text-[var(--program-text)]">
            {formatCampaignDate(campaign.campaignDate)}
          </span>
        </div>

        {error ? (
          <p role="alert" className="text-[12px] text-[var(--destructive)]">
            {error}
          </p>
        ) : null}
      </div>

      {canStart ? (
        <Button
          type="button"
          size="lg"
          className="h-10 shrink-0 rounded-lg px-4"
          disabled={isStarting}
          onClick={() => {
            void startCampaign()
          }}
        >
          {isStarting ? "Starting…" : "Start campaign"}
        </Button>
      ) : null}
    </div>
  )
}
