"use client"

import { createContext, useContext } from "react"

/**
 * The section header's live contact count.
 *
 * The count is server-rendered from the payload, but the grid can delete a row
 * without a navigation. The shell owns the number and the grid reports through
 * this setter, so the scope line never contradicts the table beneath it.
 */
interface ContactsCountContextValue {
  setCount: (count: number) => void
}

const ContactsCountContext = createContext<ContactsCountContextValue | null>(null)

export const ContactsCountProvider = ContactsCountContext.Provider

export function useContactsCountSetter(): ((count: number) => void) | null {
  return useContext(ContactsCountContext)?.setCount ?? null
}
