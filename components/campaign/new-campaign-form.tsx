"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/** AD-12's gap bounds and frame 212's default, mirrored from the service. */
const GAP_PRESETS = [5, 10, 20, 30, 60] as const
const GAP_MIN = 5
const GAP_MAX = 300
const GAP_DEFAULT = 20
const MAX_ATTEMPTS_MIN = 1
const MAX_ATTEMPTS_MAX = 10
const MAX_ATTEMPTS_DEFAULT = 3

/**
 * The plain `{ error }` envelope every dialer route answers a refusal with.
 * `null` covers a response whose body is not JSON at all — the fallback message
 * is then the honest one.
 */
interface CreateCampaignResponse {
  campaign?: { id?: string }
  error?: string
}

/**
 * Frame 212's campaign form, with designing omission 12 and UX-DR18 filled in.
 *
 * The frame carries name, description and an end date, and hands the rest of
 * the campaign to a survey step owned by Story 1.5. The gap duration, the
 * attempt cap and the lifecycle controls are required now, so the form holds
 * the three fields the frame does not. There is no survey section here: a
 * builder that does not exist is not a control.
 *
 * Hand-written state and handlers, per the story: the JSON body is the route's
 * shape, and the route's own named message is what a refusal shows — the client
 * never restates a validation rule in the server's place.
 */
export function NewCampaignForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [campaignDate, setCampaignDate] = useState("")
  const [campaignTime, setCampaignTime] = useState("")
  const [gapDuration, setGapDuration] = useState(String(GAP_DEFAULT))
  const [maxAttempts, setMaxAttempts] = useState(String(MAX_ATTEMPTS_DEFAULT))
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const gapValue = Number(gapDuration)
  const selectedPreset = GAP_PRESETS.find((preset) => preset === gapValue) ?? null

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Enter a campaign name.")
      return
    }

    if (!campaignDate) {
      setError("Choose a campaign end date.")
      return
    }

    if (!Number.isInteger(gapValue) || gapValue < GAP_MIN || gapValue > GAP_MAX) {
      setError(`Gap duration must be a whole number between ${GAP_MIN} and ${GAP_MAX} seconds.`)
      return
    }

    const attemptsValue = Number(maxAttempts)
    if (!Number.isInteger(attemptsValue) || attemptsValue < MAX_ATTEMPTS_MIN || attemptsValue > MAX_ATTEMPTS_MAX) {
      setError(`Max attempts must be a whole number between ${MAX_ATTEMPTS_MIN} and ${MAX_ATTEMPTS_MAX}.`)
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/dialer/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          campaignDate,
          campaignTime: campaignTime || null,
          gapDuration: gapValue,
          maxAttempts: attemptsValue,
        }),
      })

      const payload = (await response.json().catch(() => null)) as CreateCampaignResponse | null

      if (!response.ok) {
        setError(payload?.error ?? "Unable to create the campaign.")
        setIsSubmitting(false)
        return
      }

      const campaignId = payload?.campaign?.id
      if (!campaignId) {
        setError("The campaign was created but the server returned no id. Reload the campaign list.")
        setIsSubmitting(false)
        return
      }

      router.push(`/campaigns/${campaignId}`)
    } catch {
      setError("Unable to reach the server. Your campaign was not created.")
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-2xl">
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-card">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]">
            Campaign details
          </h2>
        </div>

        <div className="grid gap-5 p-4">
          <div className="grid gap-2">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input
              id="campaign-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Weekend Camp 2026"
              maxLength={120}
              autoComplete="off"
              className="h-10"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="campaign-description">Description</Label>
            <Textarea
              id="campaign-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="campaign-end-date">Campaign end date</Label>
              <Input
                id="campaign-end-date"
                type="date"
                value={campaignDate}
                onChange={(event) => setCampaignDate(event.target.value)}
                className="h-10"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="campaign-time">Time</Label>
              <Input
                id="campaign-time"
                type="time"
                value={campaignTime}
                onChange={(event) => setCampaignTime(event.target.value)}
                className="h-10"
              />
              <p className="text-xs text-[var(--muted-foreground)]">Optional.</p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="campaign-gap-duration">Gap duration (seconds)</Label>
            <div className="flex flex-wrap items-center gap-2">
              {GAP_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={selectedPreset === preset ? "default" : "outline"}
                  aria-pressed={selectedPreset === preset}
                  onClick={() => setGapDuration(String(preset))}
                >
                  {preset}s
                </Button>
              ))}
              <Input
                id="campaign-gap-duration"
                type="number"
                inputMode="numeric"
                min={GAP_MIN}
                max={GAP_MAX}
                step={1}
                value={gapDuration}
                onChange={(event) => setGapDuration(event.target.value)}
                className="h-10 w-24"
              />
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              {GAP_MIN}–{GAP_MAX} seconds. A caller waits this long between calls in this campaign.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="campaign-max-attempts">Max attempts</Label>
            <Input
              id="campaign-max-attempts"
              type="number"
              inputMode="numeric"
              min={MAX_ATTEMPTS_MIN}
              max={MAX_ATTEMPTS_MAX}
              step={1}
              value={maxAttempts}
              onChange={(event) => setMaxAttempts(event.target.value)}
              className="h-10 w-24"
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              {MAX_ATTEMPTS_MIN}–{MAX_ATTEMPTS_MAX}. A contact closes after this many attempts.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-[13px] text-[var(--destructive)]">
              {error}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={isSubmitting} className="h-10 rounded-lg px-4">
              {isSubmitting ? "Creating…" : "Create campaign"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
