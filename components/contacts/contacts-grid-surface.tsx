"use client"

import { useContactsCountSetter } from "@/components/contacts/contacts-count-context"
import type { ContactsSectionPayload } from "@/components/contacts/contacts-types"
import { ManageContactsTable } from "@/components/manage/manage-contacts-table"

/**
 * The Contacts tab: the shipped Manage grid, in the section's frame.
 *
 * `hideInlineCreate` removes the toolbar's `+ Add record`; the section's one
 * create control is the header's `Add contact`, which opens the form. Delete
 * stays, because it lives on the same row lifecycle the grid needs for the
 * context menu.
 *
 * The count is reported to the section shell so a delete moves the scope line
 * with the table instead of waiting for a reload.
 */
export function ContactsGridSurface({ payload }: { payload: ContactsSectionPayload }) {
  const setCount = useContactsCountSetter()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ManageContactsTable
        payload={payload}
        onRowCountChange={setCount ?? undefined}
        hideInlineCreate
        views={payload.views}
        lastViewId={payload.lastViewId}
      />
    </div>
  )
}
