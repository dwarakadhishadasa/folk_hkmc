import type { StaffRole } from "@hkmc/data-contracts"

export interface CampaignNavItem {
  href: string
  label: string
}

export type CampaignNavSurface = "desktop" | "mobile"

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

/** The caller tab. The phone menu always carries it; the desktop strip never does. */
const ASSIGNMENTS_NAV_ITEM: CampaignNavItem = { href: "/campaigns/assignments", label: "Assignments" }

/**
 * The destinations a staff member may see, in the design's order.
 *
 * The two surfaces differ on purpose. Desktop keeps the admin strip and omits
 * Assignments; the phone menu always carries Assignments for every staff role,
 * because the phone is the surface a caller actually works from. A Volunteer
 * therefore has exactly one Campaign destination on a phone and none on a
 * desktop.
 */
export function campaignNavItems(role: StaffRole | null, surface: CampaignNavSurface): CampaignNavItem[] {
  if (role === null) {
    return []
  }

  const items = role === "Volunteer" ? [] : [...ADMIN_NAV_ITEMS]

  if (surface === "mobile") {
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
