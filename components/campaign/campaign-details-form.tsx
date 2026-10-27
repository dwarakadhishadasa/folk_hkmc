"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface CampaignDetailsResponse {
  campaign?: { id?: string }
  error?: string
}

/**
 * The edit page's editable half: the same three fields frame 212 asks for when
 * a campaign is created.
 *
 * The Save control lives in the page's header beside "Reassign contacts", so it
 * submits this form by id rather than by wrapping the header in a second form
 * (a `<form>` may not be nested, and the button is nowhere near the fields).
 *
 * Status is not editable here. Starting, completing and cancelling are
 * lifecycle actions with their own matrix on the campaign page; this saves the
 * details the design lets an admin change without moving the campaign's state.
 */
export function CampaignDetailsForm({
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
  const [description, setDescription] = useState(campaign.description ?? "")
  const [campaignDate, setCampaignDate] = useState(campaign.campaignDate)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSaved(false)

    if (isSaving) {
      return
    }

    if (!name.trim()) {
      setError("Enter a campaign name.")
      return
    }

    if (!campaignDate) {
      setError("Choose a campaign end date.")
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(`/api/dialer/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          campaignDate,
        }),
      })
      const payload = (await response.json().catch(() => null)) as CampaignDetailsResponse | null

      if (!response.ok) {
        setError(payload?.error ?? "Unable to save the campaign.")
        setIsSaving(false)
        return
      }

      setIsSaving(false)
      setSaved(true)
      router.refresh()
    } catch {
      setError("Unable to reach the server. The campaign was not saved.")
      setIsSaving(false)
    }
  }

  return (
    <form id="campaign-details-form" onSubmit={handleSubmit} noValidate className="grid gap-4 p-4 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="campaign-name" className="text-[13px] font-semibold text-[var(--program-text)]">
          Campaign name
        </Label>
        <Input
          id="campaign-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Weekend Camp 2026"
          maxLength={120}
          autoComplete="off"
          className="h-10 rounded-lg"
        />
      </div>

      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="campaign-description" className="text-[13px] font-semibold text-[var(--program-text)]">
          Description
        </Label>
        <Textarea
          id="campaign-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="rounded-lg"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="campaign-end-date" className="text-[13px] font-semibold text-[var(--program-text)]">
          Campaign end date
        </Label>
        <Input
          id="campaign-end-date"
          type="date"
          value={campaignDate}
          onChange={(event) => setCampaignDate(event.target.value)}
          className="h-10 rounded-lg"
        />
      </div>

      <div className="sm:col-span-2" aria-live="polite">
        {saved && !isSaving ? (
          <p role="status" className="text-[13px] font-medium text-[var(--success)]">
            Campaign saved.
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--destructive)] sm:col-span-2">
          {error}
        </p>
      ) : null}
    </form>
  )
}
