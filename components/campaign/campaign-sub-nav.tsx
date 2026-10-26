"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import type { StaffRole } from "@hkmc/data-contracts"

interface CampaignNavItem {
  href: string
  label: string
}

/**
 * The tabs every campaign admin sees.
 *
 * `Callers` and `Reports` are the design's own tabs (frame 32). Their routes
 * belong to later stories, so the links are live before the pages are.
 */
const ADMIN_NAV_ITEMS: CampaignNavItem[] = [
  { href: "/campaigns", label: "Overview" },
  { href: "/campaigns/callers", label: "Callers" },
  { href: "/campaigns/reports", label: "Reports" },
]

/** The caller tab. Only an active caller profile earns it. */
const ASSIGNMENTS_NAV_ITEM: CampaignNavItem = { href: "/campaigns/assignments", label: "Assignments" }

/**
 * The tabs a staff member may see.
 *
 * A Volunteer never sees the admin tabs — `requireCampaignAdmin` refuses them
 * at `/campaigns` — so the strip carries the caller tab alone for them. An
 * admin, preacher or assistant earns Assignments only with an active caller
 * profile, and it sits second because that is the order the phone Campaign
 * menu uses (frame 2217).
 */
function navItemsFor(role: StaffRole, hasActiveCallerProfile: boolean): CampaignNavItem[] {
  const items = role === "Volunteer" ? [] : [...ADMIN_NAV_ITEMS]

  if (hasActiveCallerProfile) {
    items.splice(1, 0, ASSIGNMENTS_NAV_ITEM)
  }

  return items
}

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The tab a pathname belongs to.
 *
 * The longest matching href wins: `/campaigns` is a prefix of
 * `/campaigns/assignments`, so a prefix test on its own would mark two tabs
 * as current at once.
 */
function activeHrefFor(pathname: string, items: CampaignNavItem[]): string | null {
  let active: string | null = null

  for (const item of items) {
    if (!matchesPath(pathname, item.href)) {
      continue
    }

    if (active === null || item.href.length > active.length) {
      active = item.href
    }
  }

  return active
}

/**
 * The Campaign sub-nav.
 *
 * An underline strip rather than a pill row, on the shared tab tokens: the
 * active tab is a 2px underline plus weight, never a new colour, so it stays
 * legible in both themes. It is a **desktop** control — the phone frame
 * (1752) carries the Campaign entry in the bottom nav instead, and five
 * labels wrap onto two rows at 390px.
 */
export function CampaignSubNav({
  role,
  hasActiveCallerProfile,
}: {
  role: StaffRole
  hasActiveCallerProfile: boolean
}) {
  const pathname = usePathname()
  const items = navItemsFor(role, hasActiveCallerProfile)

  if (items.length === 0) {
    return null
  }

  const activeHref = activeHrefFor(pathname, items)

  return (
    <nav aria-label="Campaign" className="hidden w-full shrink-0 md:block">
      <ul className="flex w-full flex-wrap items-start gap-x-6 gap-y-2 border-b border-[var(--tab-border)]">
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
