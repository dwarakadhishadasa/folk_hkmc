import { getStaffContext } from "@/lib/authz"
import { reorderQuestions } from "@/lib/dialer/surveys"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

interface CampaignQuestionsOrderContext {
  params: Promise<{ campaignId: string }>
}

// A static segment outranks the sibling `[questionId]`; that route exports only PATCH/DELETE, so no method collision.
export async function POST(request: Request, context: CampaignQuestionsOrderContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const { orderedIds } = (await readJsonBody(request)) as { orderedIds: string[] }
    const questions = await reorderQuestions(staff, campaignId, orderedIds)
    return Response.json({ questions })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
