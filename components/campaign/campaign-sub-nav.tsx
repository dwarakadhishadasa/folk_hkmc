"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import type { StaffRole } from "@hkmc/data-contracts"

import { activeHrefFor, campaignNavItems } from "./campaign-nav"

/**
 * The Campaign sub-nav.
 *
 * An underline strip rather than a pill row, on the shared tab tokens: the
 * active tab is a 2px underline plus weight, never a new colour, so it stays
 * legible in both themes. It is a **desktop** control — the phone frame
 * (1752) opens the Campaign menu from the page title instead, and five
 * labels wrap onto two rows at 390px.
 *
 * The destinations come from `campaign-nav.ts`, the same rule the phone menu
 * reads, so the two surfaces cannot disagree about who may see what.
 */
export function CampaignSubNav({
  role,
  hasActiveCallerProfile,
}: {
  role: StaffRole
  hasActiveCallerProfile: boolean
}) {
  const pathname = usePathname()
  const items = campaignNavItems(role, hasActiveCallerProfile)

  if (items.length === 0) {
    return null
  }

  const activeHref = activeHrefFor(pathname, items)

  return (
    <nav aria-label="Campaign" className="hidden w-full shrink-0 md:block">
      <ul className="flex w-full flex-wrap items-start gap-x-8 gap-y-2 border-b border-[var(--tab-border)]">
        {items.map((item) => {
          const isActive = item.href === activeHref

          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "border-b-2 border-transparent px-0 pb-2.5 text-[13px] font-medium whitespace-nowrap text-[var(--tab-inactive-text)] transition-colors hover:text-[var(--tab-active-text)]",
                  isActive && "border-[var(--tab-active-underline)] font-semibold text-[var(--tab-active-text)]",
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
