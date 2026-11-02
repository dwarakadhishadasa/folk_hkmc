"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { CampaignDateField } from "@/components/campaign/campaign-date-field"

/**
 * The assign-contacts header: the campaign's own name, editable in place, with
 * its end date beneath it. Both save on their own — the name when the field
 * loses focus, the date as soon as a day is picked — because this header is a
 * property sheet, not a second form with a Save button.
 */
export function CampaignAssignHeader({
  campaign,
}: {
  campaign: {
    id: string
    name: string
    description: string | null
    campaignDate: string
  }
}) {
  const router = useRouter()
  const [name, setName] = useState(campaign.name)
  const [campaignDate, setCampaignDate] = useState(campaign.campaignDate)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const save = async (nextName: string, nextDate: string) => {
    const trimmed = nextName.trim()

    if (!trimmed) {
      setError("Enter a campaign name.")
      setStatus("error")
      return
    }

    if (trimmed === campaign.name && nextDate === campaign.campaignDate) {
      return
    }

    setStatus("saving")
    setError(null)

    try {
      const response = await fetch(`/api/dialer/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          description: campaign.description,
          campaignDate: nextDate,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setError(payload?.error ?? "Unable to save the campaign.")
        setStatus("error")
        return
      }

      setStatus("saved")
      router.refresh()
    } catch {
      setError("Unable to reach the server. The campaign was not saved.")
      setStatus("error")
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
        <input
          aria-label="Campaign name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            void save(name, campaignDate)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
          maxLength={120}
          autoComplete="off"
          className="-ml-1 w-full truncate rounded-md bg-transparent px-1 py-0.5 font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)] transition-colors hover:bg-foreground/5 focus:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">
            Ends
          </span>
          <CampaignDateField
            compact
            value={campaignDate}
            onChange={(next) => {
              setCampaignDate(next)
              void save(name, next)
            }}
          />
          {status === "saving" ? (
            <span className="text-[11px] text-[var(--muted-foreground)]">Saving…</span>
          ) : status === "saved" ? (
            <span className="text-[11px] text-[var(--chart-2)]">Saved</span>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-[12px] text-[var(--destructive)]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
