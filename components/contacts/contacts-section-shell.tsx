"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, ChevronRight, X } from "lucide-react"

import {
  CONTACTS_SECTION_TABS,
  isContactsTabActive,
} from "@/components/contacts/contact-nav"
import {
  ContactsCountProvider,
} from "@/components/contacts/contacts-count-context"
import { useNavigationFeedback } from "@/components/navigation-feedback-provider"

/**
 * The section's chrome: title, scope line, and the two navigation shapes.
 *
 * Desktop is the underline strip beneath the title; the phone is the chevron
 * and a full-screen takeover. The shapes are chosen with `md:` classes rather
 * than with `useDeviceView`, so the server and the first client render agree
 * and neither shape flashes on the other's screen.
 *
 * The phone's heading stays a heading; the chevron is its own control, because
 * one target that reads as "the title" and acts as "the menu" is two jobs
 * wearing one label.
 */
export function ContactsSectionShell({
  title,
  contactCount,
  locationCount,
  headerAction,
  phoneAction,
  children,
}: {
  title: string
  contactCount: number
  locationCount: number
  /** Desktop control to the right of the title, e.g. the Reports period select. */
  headerAction?: ReactNode
  /** Phone control on the title row, e.g. `Add contact`. */
  phoneAction?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const { startNavigation } = useNavigationFeedback()
  const [count, setCount] = useState(contactCount)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setCount(contactCount)
  }, [contactCount])

  // A menu is a way *between* pages, so a completed navigation closes it.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [menuOpen])

  const scopeLine = `${count.toLocaleString("en-IN")} contacts · ${locationCount.toLocaleString("en-IN")} locations`

  return (
    <ContactsCountProvider value={{ setCount }}>
      <div className="flex min-h-0 flex-1 flex-col" data-contact-section="">
        <div className="flex shrink-0 flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1">
                <h1 className="truncate font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
                  {title}
                </h1>
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={menuOpen}
                  aria-label="Open contacts menu"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--program-text)] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)] md:hidden"
                >
                  <ChevronDown aria-hidden="true" className="size-4" />
                </button>
                {phoneAction ? <span className="ml-auto md:hidden">{phoneAction}</span> : null}
              </div>
              <p className="mt-1 text-[13px] text-[var(--muted-foreground)] md:text-xs">
                {scopeLine}
              </p>
            </div>

            {headerAction ? (
              <div className="hidden shrink-0 items-center gap-3 md:flex">{headerAction}</div>
            ) : null}
          </div>

          <nav
            aria-label="Contacts sections"
            className="hidden w-full max-w-full shrink-0 flex-wrap items-center justify-start gap-x-8 gap-y-2 border-b border-[var(--tab-border)] md:flex"
          >
            {CONTACTS_SECTION_TABS.map((tab) => {
              const active = isContactsTabActive(pathname, tab.href)

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => startNavigation(tab.href, true)}
                  className={
                    active
                      ? "border-b-2 border-[var(--tab-active-underline)] pb-2.5 text-[13px] font-semibold whitespace-nowrap text-[var(--tab-active-text)]"
                      : "border-b-2 border-transparent pb-2.5 text-[13px] font-medium whitespace-nowrap text-[var(--tab-inactive-text)] transition-colors hover:text-[var(--tab-active-text)]"
                  }
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>

      {menuOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Contacts menu"
          data-contact-section-menu=""
          className="fixed inset-0 z-[80] flex flex-col bg-card"
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-6">
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight text-[var(--program-text)]">
                Contacts
              </p>
              <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">{scopeLine}</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close contacts menu"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--program-text)] transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          <div className="h-px shrink-0 bg-[var(--border)]" />

          <nav aria-label="Contacts sections" className="flex flex-col">
            {CONTACTS_SECTION_TABS.map((tab) => {
              const active = isContactsTabActive(pathname, tab.href)

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    startNavigation(tab.href, true)
                    setMenuOpen(false)
                  }}
                  className="flex h-14 items-center justify-between px-5 text-[15px] font-semibold text-[var(--program-text)] focus-visible:bg-foreground/5 focus-visible:outline-none"
                >
                  <span
                    className={
                      active
                        ? "border-b-2 border-[var(--tab-active-underline)] pb-0.5"
                        : "border-b-2 border-transparent pb-0.5"
                    }
                  >
                    {tab.label}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 text-[var(--muted-foreground)]"
                  />
                </Link>
              )
            })}
          </nav>

          <div className="flex-1" />
          <div className="h-px shrink-0 bg-[var(--border)]" />
        </div>
      ) : null}
    </ContactsCountProvider>
  )
}
