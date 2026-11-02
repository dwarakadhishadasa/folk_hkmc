"use client"

import { useSyncExternalStore } from "react"

import { AssignContactsSelect } from "@/components/campaign/assign-contacts-select"
import type {
  AssignableCallerView,
  AssignableContactView,
  LocationOption,
} from "@/components/campaign/assign-contacts-types"
import type { SurveyQuestionView } from "@/components/campaign/campaign-survey-types"

const DESKTOP_QUERY = "(min-width: 768px)"

function subscribeToViewport(onStoreChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener("change", onStoreChange)
  return () => query.removeEventListener("change", onStoreChange)
}

function isDesktopViewport(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches
}

/** The server snapshot is the narrowed state, so the grid never mounts during SSR. */
function isDesktopOnServer(): boolean {
  return false
}

/**
 * UX-DR9/UX-DR10: assignment is desktop-only, so a narrow viewport gets an
 * explicit state instead of a squeezed grid. The contact surface is not mounted
 * at all below `md` — hiding it in CSS would still run its fetches and its
 * selection state behind a display rule.
 */
export function AssignContactsDesktopGate({
  campaignId,
  campaignStatus,
  contacts,
  callers,
  locations,
  questions,
}: {
  campaignId: string
  campaignStatus: string
  contacts: AssignableContactView[]
  callers: AssignableCallerView[]
  locations: LocationOption[]
  questions: SurveyQuestionView[]
}) {
  const isDesktop = useSyncExternalStore(subscribeToViewport, isDesktopViewport, isDesktopOnServer)

  if (!isDesktop) {
    return (
      <section
        aria-labelledby="assign-contacts-desktop-heading"
        className="rounded-xl border border-[var(--border)] bg-card p-4"
      >
        <h2
          id="assign-contacts-desktop-heading"
          className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]"
        >
          Open this on a desktop
        </h2>
        <p className="mt-1 max-w-prose text-[13px] text-[var(--muted-foreground)]">
          Choosing contacts needs the full-width contact grid and the caller panel beside it. The phone
          layout does not carry either, so open this page on a desktop to assign contacts.
        </p>
      </section>
    )
  }

  return (
    <AssignContactsSelect
      campaignId={campaignId}
      campaignStatus={campaignStatus}
      contacts={contacts}
      callers={callers}
      locations={locations}
      questions={questions}
    />
  )
}
