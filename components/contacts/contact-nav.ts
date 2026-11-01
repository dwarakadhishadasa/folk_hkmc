/**
 * The section's two destinations, in one list.
 *
 * The desktop underline strip and the phone takeover read the same array, so
 * the two shapes cannot drift in order, label or target.
 */

export interface ContactsSectionTab {
  href: string
  label: string
}

export const CONTACTS_SECTION_TABS: readonly ContactsSectionTab[] = [
  { href: "/contacts", label: "Overview" },
  { href: "/contacts/grid", label: "Contacts" },
]

/** Exact, because `/contacts` is a prefix of the other two. */
export function isContactsTabActive(pathname: string, href: string): boolean {
  return pathname === href
}
