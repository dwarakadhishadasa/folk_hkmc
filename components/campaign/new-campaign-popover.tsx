"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { CampaignDateField } from "@/components/campaign/campaign-date-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface CreateCampaignResponse {
  campaign?: { id?: string }
  error?: string
}

/**
 * Frame 212's first step, in a popover: name the campaign and choose when it
 * ends. The call-outcome survey is no longer staged here — it lives on the
 * assign-contacts screen, where the campaign exists and the reader can write
 * questions against it.
 *
 * Both Overview entry points (`New campaign` and the empty state's `Create
 * campaign`) render this same control, so the two paths cannot drift.
 */
export function NewCampaignPopover({
  label,
  today,
}: {
  label: string
  /** The programme day, so the picker cannot choose a day before it. */
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [campaignDate, setCampaignDate] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

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
      const response = await fetch("/api/dialer/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: null,
          campaignDate,
        }),
      })
      const payload = (await response.json().catch(() => null)) as CreateCampaignResponse | null

      if (!response.ok) {
        setError(payload?.error ?? "Unable to create the campaign.")
        setIsSaving(false)
        return
      }

      const campaignId = payload?.campaign?.id
      if (!campaignId) {
        setError("The campaign was created but the server returned no id. Reload the campaign list.")
        setIsSaving(false)
        return
      }

      setOpen(false)
      router.push(`/campaigns/${campaignId}/assign-contacts`)
    } catch {
      setError("Unable to reach the server. Your campaign was not created.")
      setIsSaving(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setError(null)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="lg" className="h-10 rounded-lg px-4">
          {label}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" collisionPadding={8} className="w-[340px] p-4">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]">
              New campaign
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              Name it and choose when it ends. The survey comes next.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="new-campaign-name" className="text-[13px] font-semibold text-[var(--program-text)]">
              Campaign name
            </Label>
            <Input
              id="new-campaign-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Weekend Camp 2026"
              maxLength={120}
              autoComplete="off"
              className="h-10 rounded-lg"
            />
          </div>

          <CampaignDateField
            id="new-campaign-date"
            label="End date"
            value={campaignDate}
            onChange={setCampaignDate}
            disabledBefore={today}
          />

          {error ? (
            <p role="alert" className="text-[13px] text-[var(--destructive)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={isSaving} className="h-10 w-full">
            {isSaving ? "Creating…" : "Create campaign"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
