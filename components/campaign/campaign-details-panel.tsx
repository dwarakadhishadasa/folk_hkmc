"use client"

import type { ReactNode } from "react"

import { CampaignDateField } from "@/components/campaign/campaign-date-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * Frame 212's left pane: the campaign's own properties, one card.
 *
 * The panel is controlled and knows nothing about persistence; the campaign
 * workspace owns the values and saves them as the fields change.
 */
export function CampaignDetailsPanel({
  idPrefix,
  name,
  description,
  campaignDate,
  today,
  onNameChange,
  onDescriptionChange,
  onDateChange,
  onNameBlur,
  onDescriptionBlur,
  note,
  className,
}: {
  /** Keeps the three field ids unique when two panels ever share a page. */
  idPrefix: string
  name: string
  description: string
  campaignDate: string
  /** `YYYY-MM-DD`; the picker refuses an earlier day. */
  today?: string
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onDateChange: (value: string) => void
  onNameBlur?: () => void
  onDescriptionBlur?: () => void
  /** The saving indicator or a named refusal, under the fields. */
  note?: ReactNode
  className?: string
}) {
  return (
    <section
      aria-labelledby={`${idPrefix}-details-heading`}
      className={cn("rounded-xl border border-[var(--border)] bg-card p-4 md:p-5", className)}
    >
      <div className="mb-3">
        <h2
          id={`${idPrefix}-details-heading`}
          className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]"
        >
          Campaign details
        </h2>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label
            htmlFor={`${idPrefix}-name`}
            className="text-[13px] font-semibold text-[var(--program-text)]"
          >
            Campaign name
          </Label>
          <Input
            id={`${idPrefix}-name`}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            onBlur={onNameBlur}
            placeholder="Weekend Camp 2026"
            maxLength={120}
            autoComplete="off"
            className="h-10 rounded-lg"
          />
        </div>

        <div className="grid gap-1.5">
          <Label
            htmlFor={`${idPrefix}-description`}
            className="text-[13px] font-semibold text-[var(--program-text)]"
          >
            Description
          </Label>
          <Textarea
            id={`${idPrefix}-description`}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            onBlur={onDescriptionBlur}
            rows={3}
            className="rounded-lg"
          />
        </div>

        <CampaignDateField
          id={`${idPrefix}-date`}
          label="Campaign end date"
          value={campaignDate}
          onChange={onDateChange}
          disabledBefore={today}
        />
      </div>

      {note ? <div className="mt-3">{note}</div> : null}
    </section>
  )
}
