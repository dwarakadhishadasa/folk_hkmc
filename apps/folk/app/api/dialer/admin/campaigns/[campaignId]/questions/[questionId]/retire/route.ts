import { getStaffContext } from "@/lib/authz"
import { retireQuestion } from "@/lib/dialer/surveys"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

interface CampaignQuestionRetireContext {
  params: Promise<{ campaignId: string; questionId: string }>
}

export async function POST(_request: Request, context: CampaignQuestionRetireContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId, questionId } = await context.params
    const question = await retireQuestion(staff, campaignId, questionId)
    return Response.json({ question })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
