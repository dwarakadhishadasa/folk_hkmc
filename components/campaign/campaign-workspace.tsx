"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { AssignContactsDesktopGate } from "@/components/campaign/assign-contacts-desktop-gate"
import type {
  AssignableCallerView,
  AssignableContactView,
  LocationOption,
} from "@/components/campaign/assign-contacts-types"
import { CampaignAssignHeader } from "@/components/campaign/campaign-assign-header"
import { CampaignDetailsPanel } from "@/components/campaign/campaign-details-panel"
import { CampaignSurveyBuilder } from "@/components/campaign/campaign-survey-builder"
import type { SurveyQuestionView } from "@/components/campaign/campaign-survey-types"

/**
 * The campaign workspace, one scrollable page.
 *
 * Frame 212's two panes — details and survey — are the first screen; frame
 * 324's assignment surface follows below them in the same document, so the
 * page scrolls from "what this campaign is" into "who calls whom" the way the
 * two-pane reference does. The survey is always open, not a panel that slides
 * over the assignment controls.
 */
export function CampaignWorkspace({
  campaign,
  contacts,
  callers,
  locations,
  questions,
  today,
}: {
  campaign: {
    id: string
    name: string
    description: string | null
    campaignDate: string
    status: string
  }
  contacts: AssignableContactView[]
  callers: AssignableCallerView[]
  locations: LocationOption[]
  questions: SurveyQuestionView[]
  today: string
}) {
  const router = useRouter()
  const [name, setName] = useState(campaign.name)
  const [description, setDescription] = useState(campaign.description ?? "")
  const [campaignDate, setCampaignDate] = useState(campaign.campaignDate)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  /**
   * A property sheet, not a second form: the name and description save on blur
   * and the date as soon as a day is picked. A completed campaign is read as a
   * report instead, so this component only serves DRAFT and ACTIVE.
   */
  const save = async (nextName: string, nextDescription: string, nextDate: string) => {
    const trimmedName = nextName.trim()
    const trimmedDescription = nextDescription.trim()

    if (!trimmedName) {
      setError("Enter a campaign name.")
      setSaveState("error")
      return
    }

    if (
      trimmedName === campaign.name &&
      trimmedDescription === (campaign.description ?? "") &&
      nextDate === campaign.campaignDate
    ) {
      return
    }

    setSaveState("saving")
    setError(null)

    try {
      const response = await fetch(`/api/dialer/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription || null,
          campaignDate: nextDate,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setError(payload?.error ?? "Unable to save the campaign.")
        setSaveState("error")
        return
      }

      setSaveState("saved")
      router.refresh()
    } catch {
      setError("Unable to reach the server. The campaign was not saved.")
      setSaveState("error")
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <CampaignAssignHeader campaign={campaign} />

      <div className="grid items-stretch gap-5 lg:grid-cols-[520px_minmax(0,1fr)]">
        <CampaignDetailsPanel
          idPrefix="campaign-details"
          name={name}
          description={description}
          campaignDate={campaignDate}
          today={today}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onDateChange={(next) => {
            setCampaignDate(next)
            void save(name, description, next)
          }}
          onNameBlur={() => {
            void save(name, description, campaignDate)
          }}
          onDescriptionBlur={() => {
            void save(name, description, campaignDate)
          }}
          note={
            error ? (
              <p role="alert" className="text-[12px] text-[var(--destructive)]">
                {error}
              </p>
            ) : saveState === "saving" ? (
              <p className="text-[12px] text-[var(--muted-foreground)]">Saving…</p>
            ) : saveState === "saved" ? (
              <p className="text-[12px] text-[var(--chart-2)]">Saved</p>
            ) : null
          }
        />

        <CampaignSurveyBuilder
          campaignId={campaign.id}
          status={campaign.status}
          questions={questions}
        />
      </div>

      <AssignContactsDesktopGate
        campaignId={campaign.id}
        campaignStatus={campaign.status}
        contacts={contacts}
        callers={callers}
        locations={locations}
      />
    </div>
  )
}
