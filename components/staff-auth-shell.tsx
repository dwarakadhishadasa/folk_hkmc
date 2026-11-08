"use client"

import type { ReactNode } from "react"
import { ContactRecordProvider } from "@/components/contacts/contact-record-provider"
import { AuthProvider } from "@/lib/auth-context"
import type { ClientStaff } from "@/lib/staff-dto"

/**
 * The staff shell.
 *
 * The contact record provider is mounted **once** here, inside `AuthProvider`:
 * every staff surface can open the same record, and the provider's gate reads
 * the client-safe `canReadContacts` flag from the auth context rather than
 * each page deciding for itself.
 */
export function StaffAuthShell({ children, staff }: { children: ReactNode; staff: ClientStaff }) {
  return (
    <AuthProvider initialStaff={staff}>
      <ContactRecordProvider>{children}</ContactRecordProvider>
    </AuthProvider>
  )
}
