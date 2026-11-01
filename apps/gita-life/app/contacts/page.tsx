import { ContactsEmptyState } from "@/components/contacts/contacts-empty-state"
import { ContactsOverview } from "@/components/contacts/contacts-overview"
import { ContactsSectionFrame } from "@/components/contacts/contacts-section-frame"
import { sectionRedirectPath } from "@/components/contacts/contacts-types"
import { buildOverviewMetrics } from "@/lib/contacts/metrics"
import { loadContactsSectionPage } from "@/lib/contacts/section-server"
import { programDay } from "@/lib/program-day"

export const dynamic = "force-dynamic"

interface ContactsOverviewPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ContactsOverviewPage({ searchParams }: ContactsOverviewPageProps) {
  const params = await searchParams
  const { staff, payload } = await loadContactsSectionPage({
    redirectTo: sectionRedirectPath("/contacts", params),
  })

  const metrics = buildOverviewMetrics({
    contacts: payload.contacts,
    locationNameById: new Map(payload.locations.map((location) => [location.id, location.name])),
    today: programDay(),
  })

  return (
    <ContactsSectionFrame staff={staff} title="Overview" payload={payload}>
      {payload.contacts.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <ContactsEmptyState />
        </div>
      ) : (
        <ContactsOverview metrics={metrics} />
      )}
    </ContactsSectionFrame>
  )
}
