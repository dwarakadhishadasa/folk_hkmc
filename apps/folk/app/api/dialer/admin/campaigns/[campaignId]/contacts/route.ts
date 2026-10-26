import { getStaffContext } from "@/lib/authz"
import { listAssignableContacts, type AssignableContactQuery } from "@/lib/dialer/assignments"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

interface CampaignContactsContext {
  params: Promise<{ campaignId: string }>
}

/**
 * The service owns page validation. A non-numeric value becomes `NaN` here and
 * `Number.isInteger` in `listAssignableContacts` refuses it with the named
 * `400 invalid_page` / `invalid_page_size`; nothing defaults to page 1.
 */
function readNumberParam(searchParams: URLSearchParams, key: string): number | undefined {
  const raw = searchParams.get(key)
  return raw === null ? undefined : Number(raw)
}

export async function GET(request: Request, context: CampaignContactsContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const searchParams = new URL(request.url).searchParams

    const query: AssignableContactQuery = {
      page: readNumberParam(searchParams, "page"),
      pageSize: readNumberParam(searchParams, "pageSize"),
      search: searchParams.get("search"),
      centre: searchParams.get("centre"),
      level: searchParams.get("level"),
      gender: searchParams.get("gender"),
      language: searchParams.get("language"),
    }

    const page = await listAssignableContacts(staff, campaignId, query)
    return Response.json(page)
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
