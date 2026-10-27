import type { StaffRole } from "@hkmc/data-contracts"

export interface CampaignNavItem {
  href: string
  label: string
}

/**
 * The tabs every campaign admin sees.
 *
 * `Callers` and `Reports` are the design's own tabs (frame 32). `Reports` links
 * to a route Epic 3 owns; the link is live before the page is.
 */
const ADMIN_NAV_ITEMS: CampaignNavItem[] = [
  { href: "/campaigns", label: "Overview" },
  { href: "/campaigns/callers", label: "Callers" },
  { href: "/campaigns/reports", label: "Reports" },
]

/** The caller tab. Only an active caller profile earns it. */
const ASSIGNMENTS_NAV_ITEM: CampaignNavItem = { href: "/campaigns/assignments", label: "Assignments" }

/**
 * The destinations a staff member may see, in the design's order.
 *
 * The desktop sub-nav and the phone menu both read this: a role gate written
 * twice drifts, and the two surfaces are the same promise (FR45, AD-2). A
 * Volunteer never sees the admin tabs — `requireCampaignAdmin` refuses them at
 * `/campaigns` — so the strip carries the caller tab alone for them. An
 * admin, preacher or assistant earns Assignments only with an active caller
 * profile, second in the list because that is frame 2217's order.
 */
export function campaignNavItems(role: StaffRole | null, hasActiveCallerProfile: boolean): CampaignNavItem[] {
  const items = role === null || role === "Volunteer" ? [] : [...ADMIN_NAV_ITEMS]

  if (hasActiveCallerProfile) {
    items.splice(1, 0, ASSIGNMENTS_NAV_ITEM)
  }

  return items
}

export function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The tab a pathname belongs to.
 *
 * The longest matching href wins: `/campaigns` is a prefix of
 * `/campaigns/assignments`, so a prefix test on its own would mark two tabs
 * as current at once.
 */
export function activeHrefFor(pathname: string, items: CampaignNavItem[]): string | null {
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
