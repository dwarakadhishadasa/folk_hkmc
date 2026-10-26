import { getStaffContext } from "@/lib/authz"
import { deleteQuestion, updateQuestion, type UpdateQuestionInput } from "@/lib/dialer/surveys"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

interface CampaignQuestionContext {
  params: Promise<{ campaignId: string; questionId: string }>
}

export async function PATCH(request: Request, context: CampaignQuestionContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId, questionId } = await context.params
    const body = (await readJsonBody(request)) as UpdateQuestionInput
    const question = await updateQuestion(staff, campaignId, questionId, {
      questionTitle: body.questionTitle,
      questionType: body.questionType,
      isRequired: body.isRequired,
      options: body.options,
    })

    return Response.json({ question })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}

export async function DELETE(_request: Request, context: CampaignQuestionContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId, questionId } = await context.params
    await deleteQuestion(staff, campaignId, questionId)
    return new Response(null, { status: 204 })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
