import { ContactsGridSurface } from "@/components/contacts/contacts-grid-surface"
import { ContactsAddContact } from "@/components/contacts/contacts-add-contact"
import { ContactsEmptyState } from "@/components/contacts/contacts-empty-state"
import { ContactsSectionFrame } from "@/components/contacts/contacts-section-frame"
import { sectionRedirectPath } from "@/components/contacts/contacts-types"
import { loadContactsSectionPage } from "@/lib/contacts/section-server"

export const dynamic = "force-dynamic"

interface ContactsGridPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ContactsGridPage({ searchParams }: ContactsGridPageProps) {
  const params = await searchParams
  const { staff, payload } = await loadContactsSectionPage({
    redirectTo: sectionRedirectPath("/contacts/grid", params),
  })

  return (
    <ContactsSectionFrame
      staff={staff}
      title="Contacts"
      payload={payload}
      headerAction={<ContactsAddContact />}
      phoneAction={<ContactsAddContact />}
    >
      {payload.contacts.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <ContactsEmptyState />
        </div>
      ) : (
        <ContactsGridSurface payload={payload} />
      )}
    </ContactsSectionFrame>
  )
}
