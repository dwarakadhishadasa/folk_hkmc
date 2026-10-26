import { cache } from "react"

import { getStaffContext } from "@/lib/authz"

/**
 * The staff context for the campaign shell, resolved once per request.
 *
 * The layout and each page both need it: the layout to resolve which sub-nav
 * items a role may see, the page to apply its own boundary
 * (`requireCampaignAdmin` or `requireDialerCaller`). `getStaffContext()` is a
 * session read plus two table reads, and React's `cache` collapses the two
 * calls into one within a request.
 *
 * It is also what makes the two refusals agree. The layout tolerates an
 * unresolved context and lets the page own the refusal, so the redirect names
 * the page the reader actually asked for rather than the section root.
 */
export const getCampaignStaff = cache(() => getStaffContext())
