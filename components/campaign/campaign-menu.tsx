"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, ChevronRight, X } from "lucide-react"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import { useIsMobile } from "@/components/ui/use-mobile"
import { cn } from "@/lib/utils"

import { activeHrefFor, campaignNavItems } from "./campaign-nav"

const ASSIGNMENTS_HREF = "/campaigns/assignments"

/**
 * The phone Campaign menu — frame 2217.
 *
 * Every Campaign page's title carries the 18px chevron frame 1752/2263/2639
 * draw; tapping it opens a full-screen menu rather than a sheet, because that
 * is what the frame is: its own head with a close control, then the four
 * destinations and a bottom rule. Desktop keeps the sub-nav and never renders
 * the trigger.
 *
 * The destinations come from `campaign-nav.ts`, the same rule the sub-nav
 * reads with the mobile surface selected. Assignments is phone-only and always
 * present here; its badge carries the caller's pending-call count, refreshed
 * whenever the menu opens.
 */
export function CampaignMenu({ subtitle }: { subtitle: string }) {
  const isMobile = useIsMobile()
  const { staff } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const canSeeAssignments = staff?.hasActiveCallerProfile ?? false

  useEffect(() => {
    if (!isMobile || !canSeeAssignments) {
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch("/api/dialer/caller/pending-count", { cache: "no-store" })
        if (!response.ok) {
          return
        }

        const data = (await response.json()) as { pending?: unknown }
        if (!cancelled && typeof data.pending === "number") {
          setPendingCount(data.pending)
        }
      } catch {
        // A badge is not worth blocking the menu; the last count stays.
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isMobile, canSeeAssignments, refreshKey])

  if (!isMobile) {
    return null
  }

  const items = campaignNavItems(staff?.role ?? null, "mobile")
  const activeHref = activeHrefFor(pathname, items)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setRefreshKey((key) => key + 1)
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Open the Campaign menu"
          className="-ml-1 flex size-[18px] shrink-0 items-center justify-center rounded-full text-[var(--program-text)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)]"
        >
          <ChevronDown className="size-[18px]" strokeWidth={2} aria-hidden="true" />
        </button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 shadow-none"
      >
        <div className="flex shrink-0 flex-col gap-1 px-4 pt-5 pb-4">
          <div className="flex h-10 items-center justify-between gap-3">
            <DialogTitle className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight text-[var(--program-text)]">
              Campaign
            </DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Close the Campaign menu"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F2F4F7] text-[#24324A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] dark:bg-[var(--secondary)] dark:text-[var(--foreground)]"
              >
                <X className="size-3" strokeWidth={1.6} aria-hidden="true" />
              </button>
            </DialogClose>
          </div>
          <DialogDescription className="text-[13px] leading-4 text-[var(--muted-foreground)]">
            {subtitle}
          </DialogDescription>
        </div>

        <div className="h-px w-full shrink-0 bg-[var(--border)]" />

        <nav aria-label="Campaign" className="flex shrink-0 flex-col px-4 pt-2">
          {items.map((item) => {
            const isActive = item.href === activeHref
            const showBadge = item.href === ASSIGNMENTS_HREF && pendingCount > 0

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="flex h-14 items-center"
              >
                <span className="flex flex-1 items-start gap-3">
                  <span className="flex flex-col gap-1">
                    <span className="text-[15px] font-semibold leading-[18px] text-[var(--tab-active-text)]">
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        "h-0.5 w-full",
                        isActive ? "bg-[var(--tab-active-underline)]" : "bg-transparent",
                      )}
                    />
                  </span>
                  <span className="flex-1" />
                  {showBadge ? (
                    <span
                      aria-label={`${pendingCount} pending ${pendingCount === 1 ? "call" : "calls"}`}
                      className="mt-[1px] inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[11px] font-bold leading-none text-white"
                    >
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  ) : null}
                  <ChevronRight
                    className="mt-[5px] h-2 w-1 shrink-0 text-[#9195A0]"
                    strokeWidth={1.4}
                    aria-hidden="true"
                  />
                </span>
              </Link>
            )
          })}
        </nav>

        <div className="flex-1" />
        <div className="h-px w-full shrink-0 bg-[var(--border)]" />
      </DialogContent>
    </Dialog>
  )
}
