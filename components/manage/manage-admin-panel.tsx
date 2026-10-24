"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"

import type { ManageView } from "@/components/manage/manage-types"
import { Button } from "@/components/ui/button"

/**
 * The Admin Panel: the phone's way into the portal's five pages.
 *
 * On a desktop the `/manage` portal shows its pages as a **tab strip** under
 * the page title. That strip does not survive a phone: five labels at 13px
 * with 24px between them wrap onto two rows at 390px, and a two-row strip
 * costs a third of the screen a list of contacts needs.
 *
 * So on a phone the strip is replaced by a **panel**, and the page title
 * becomes its handle. The panel is the Airtable mobile app's drawer, reduced
 * to what this portal actually has: the same five pages, the active one
 * marked, and a close button.
 *
 * It is a full-screen takeover rather than a sheet, because the panel has
 * nothing to reveal — it is navigation, and navigation replaces the surface
 * it navigates.
 */
export interface ManageAdminPanelProps {
  /** The pages the portal shows, in the order the panel lists them. */
  views: readonly { value: ManageView; label: string }[]
  /** The page the portal is showing. */
  activeView: ManageView
  /** Switch to a page. */
  onSelect: (view: ManageView) => void
  /** Close the panel. */
  onClose: () => void
}

export function ManageAdminPanel({
  views,
  activeView,
  onSelect,
  onClose,
}: ManageAdminPanelProps) {
  /**
   * The panel takes the focus when it opens.
   *
   * It covers the whole page, so the frame that is on top has to be the one
   * holding the focus — otherwise `Escape` would reach the page behind it and
   * close the list's sheet instead.
   */
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  /**
   * `Escape` closes the panel.
   *
   * The panel is modal, and a modal frame that ignores `Escape` is a frame an
   * operator has to find the close button for.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Admin Panel"
      data-admin-panel=""
      className="fixed inset-0 z-[60] flex flex-col bg-card outline-none"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3">
        <h2 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
          Admin Panel
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close Admin Panel"
          onClick={onClose}
          className="-mr-2 size-10 text-[var(--program-text)]"
        >
          <X aria-hidden="true" className="size-3" strokeWidth={2} />
        </Button>
      </header>

      <nav aria-label="Admin Panel pages" className="flex flex-col px-4 pt-6">
        {views.map((view) => {
          const active = view.value === activeView

          return (
            <button
              key={view.value}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(view.value)}
              className="flex h-12 items-start justify-start text-left text-[13px] text-[var(--program-text)] transition-colors hover:text-[var(--program-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
            >
              {/*
                The active marker is a rule under the label, and it is the
                label's own width rather than the row's: the panel marks the
                page, not the column.
              */}
              <span
                className={
                  active
                    ? "border-b-2 border-[var(--program-primary)] pb-[2px]"
                    : "border-b-2 border-transparent pb-[2px]"
                }
              >
                {view.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
