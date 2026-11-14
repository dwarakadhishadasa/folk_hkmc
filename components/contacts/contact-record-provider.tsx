"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"

import { useContactRecord } from "@/components/contacts/use-contact-record"
import { isContactRecordReady } from "@/components/contacts/contact-record-types"
import type { OpenContactRecordInput } from "@/components/contacts/contact-record-types"
import type { ContactFieldId } from "@/components/manage/manage-contact-fields"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import { useDeviceView } from "@/hooks/use-mobile"

/**
 * Lazy frames.
 *
 * The record is a dialog that most page views never open, so its body and its
 * two frames are a separate chunk loaded on first open. The provider itself is
 * small and always mounted; only the overlay is conditional.
 */
const ContactRecordDialog = dynamic(
  () =>
    import("@/components/contacts/contact-record-dialog").then(
      (module) => module.ContactRecordDialog,
    ),
  { ssr: false },
)

const ContactRecordPhoneFrame = dynamic(
  () =>
    import("@/components/contacts/contact-record-phone").then(
      (module) => module.ContactRecordPhoneFrame,
    ),
  { ssr: false },
)

let framesRequested = false

/**
 * Download the record frames before the operator opens one.
 *
 * Both frames are lazy chunks, so the first open of a session pays for the
 * download before it can paint "Loading contact". Hovering or focusing a
 * trigger is the operator declaring intent, and it happens early enough to hide
 * that cost. The import specifiers match the `dynamic()` calls above, so the
 * bundle is reused rather than fetched twice.
 */
export function preloadContactRecordFrames(): void {
  if (framesRequested) {
    return
  }

  framesRequested = true
  void import("@/components/contacts/contact-record-dialog")
  void import("@/components/contacts/contact-record-phone")
}

export interface ContactRecordContextValue {
  openContactRecord: (input: OpenContactRecordInput) => void
  closeContactRecord: () => void
  /**
   * Re-anchors the open record's Previous/Next sequence after the source list is
   * filtered. A no-op when no record is open.
   */
  updateContactRecordSequence: (sequence: readonly string[]) => void
  canOpenContactRecord: boolean
}

const ContactRecordContext = createContext<ContactRecordContextValue | null>(null)

/** The provider's one entry point. A surface without a provider gets `null`. */
export function useContactRecordContext(): ContactRecordContextValue | null {
  return useContext(ContactRecordContext)
}

/**
 * One record host per staff shell.
 *
 * It gates on `ClientStaff.canReadContacts`: a Volunteer never receives a
 * trigger, and if auth refreshes to a staff member without the flag the open
 * record closes. It always renders its children — only the overlay is
 * conditional — so a page never loses its content because the record is
 * unavailable.
 *
 * Each open owns one `AbortController` inside `useContactRecord`; closing or
 * stepping aborts the previous read. Nothing is prefetched, and the provider
 * never reads a contact set.
 */
export function ContactRecordProvider({ children }: { children: ReactNode }) {
  const { staff } = useAuth()
  const deviceView = useDeviceView()
  const pathname = usePathname()
  const canOpenContactRecord = staff?.canReadContacts === true

  const record = useContactRecord()
  const [notice, setNotice] = useState<string | null>(null)
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const [trigger, setTrigger] = useState<HTMLElement | null>(null)

  const close = useCallback(() => {
    setNotice(null)
    setErrorNotice(null)
    setTrigger(null)
    record.close()
  }, [record.close])

  const openContactRecord = useCallback(
    (input: OpenContactRecordInput) => {
      if (!canOpenContactRecord) {
        return
      }

      setNotice(null)
      setErrorNotice(null)
      setTrigger(input.trigger ?? null)
      record.open(input)
    },
    [canOpenContactRecord, record.open],
  )

  // An auth refresh that removes contact access must not leave a record open
  // over a page the caller can no longer use.
  useEffect(() => {
    if (!canOpenContactRecord && record.isOpen) {
      close()
    }
  }, [canOpenContactRecord, close, record.isOpen])

  /**
   * A failed read is reported outside the record frame and the frame closes.
   *
   * This is the matrix's out-of-scope case: a trigger rendered while the contact
   * was in scope can still 403 if the scope changed before the fetch. Showing an
   * empty record would be a lie; falling back to a summary would be a silent
   * scope change. The message is the fixed scope copy for a 403 (or the server's
   * message for another failure), the frame is gone, and the operator is left
   * with one acknowledgement.
   */
  useEffect(() => {
    if (record.state && "status" in record.state && record.state.status === "error") {
      setErrorNotice(record.state.message)
      record.close()
    }
  }, [record.close, record.state])

  // A write's message belongs to the contact it was written on; stepping to the
  // next record must not carry it along.
  const readyContactId =
    record.state && isContactRecordReady(record.state) ? record.state.contact.id : null

  useEffect(() => {
    setNotice(null)
  }, [readyContactId])

  // The overlay is a surface of the page it was opened from. A route change
  // closes it rather than leaving a record floating over the new page.
  useEffect(() => {
    setNotice(null)
    setErrorNotice(null)
    setTrigger(null)
    record.close()
  }, [pathname, record.close])

  const commit = useCallback(
    async (fieldId: ContactFieldId, value: unknown) => {
      try {
        await record.commit(fieldId, value)
        setNotice(null)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The change could not be saved.")
        // The shared field editor reverts its draft when the commit rejects;
        // the frame already has the message.
        throw error
      }
    },
    [record.commit],
  )

  const contextValue = useMemo<ContactRecordContextValue>(
    () => ({
      openContactRecord,
      closeContactRecord: close,
      updateContactRecordSequence: record.updateSequence,
      canOpenContactRecord,
    }),
    [canOpenContactRecord, close, openContactRecord, record.updateSequence],
  )

  const state = record.state
  const phone = deviceView === "mobile"

  return (
    <ContactRecordContext.Provider value={contextValue}>
      {children}

      {state === null ? null : phone ? (
        <ContactRecordPhoneFrame
          state={state}
          onCommit={commit}
          commentActions={record.comments}
          onClose={close}
          onPrevious={record.previous}
          onNext={record.next}
          canGoPrevious={record.canGoPrevious}
          canGoNext={record.canGoNext}
          returnFocusTo={trigger}
          notice={notice}
        />
      ) : (
        <ContactRecordDialog
          state={state}
          onCommit={commit}
          commentActions={record.comments}
          onClose={close}
          onPrevious={record.previous}
          onNext={record.next}
          canGoPrevious={record.canGoPrevious}
          canGoNext={record.canGoNext}
          returnFocusTo={trigger}
          notice={notice}
        />
      )}

      {errorNotice ? (
        <Dialog open onOpenChange={(open) => (!open ? setErrorNotice(null) : undefined)}>
          <DialogContent showCloseButton={false} data-contact-record-error="">
            <DialogTitle>Contact record unavailable</DialogTitle>
            <DialogDescription>{errorNotice}</DialogDescription>
            <DialogFooter>
              <Button type="button" onClick={() => setErrorNotice(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </ContactRecordContext.Provider>
  )
}
