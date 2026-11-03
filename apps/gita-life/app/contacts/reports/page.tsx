import { ContactsEmptyState } from "@/components/contacts/contacts-empty-state"
import { ContactsPeriodSelect } from "@/components/contacts/contacts-period-select"
import { ContactsReports } from "@/components/contacts/contacts-reports"
import { ContactsSectionFrame } from "@/components/contacts/contacts-section-frame"
import { sectionRedirectPath } from "@/components/contacts/contacts-types"
import { buildReportsMetrics, parseMetricPeriod } from "@/lib/contacts/metrics"
import { loadContactsSectionPage } from "@/lib/contacts/section-server"
import { programDay } from "@/lib/program-day"

export const dynamic = "force-dynamic"

interface ContactsReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function ContactsReportsPage({ searchParams }: ContactsReportsPageProps) {
  const params = await searchParams
  const period = parseMetricPeriod(firstValue(params.period))

  const { staff, payload } = await loadContactsSectionPage({
    redirectTo: sectionRedirectPath("/contacts/reports", params),
  })

  const metrics = buildReportsMetrics({
    contacts: payload.contacts,
    locationNameById: new Map(payload.locations.map((location) => [location.id, location.name])),
    staffNameById: new Map(Object.entries(payload.staffNames)),
    today: programDay(),
    period,
  })

  return (
    <ContactsSectionFrame
      staff={staff}
      title="Reports"
      payload={payload}
      headerAction={<ContactsPeriodSelect />}
    >
      {payload.contacts.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <ContactsEmptyState unassigned={payload.scope.patchOwnerId === null} />
        </div>
      ) : (
        <ContactsReports metrics={metrics} periodSelect={<ContactsPeriodSelect />} />
      )}
    </ContactsSectionFrame>
  )
}
