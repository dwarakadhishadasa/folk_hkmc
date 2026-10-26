import { getStaffContext } from "@/lib/authz"
import { createQuestion, listCampaignQuestions, type CreateQuestionInput } from "@/lib/dialer/surveys"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

interface CampaignQuestionsContext {
  params: Promise<{ campaignId: string }>
}

export async function GET(request: Request, context: CampaignQuestionsContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const includeRetired = new URL(request.url).searchParams.get("includeRetired") === "true"
    const questions = await listCampaignQuestions(staff, campaignId, { includeRetired })
    return Response.json({ questions })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}

export async function POST(request: Request, context: CampaignQuestionsContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const body = (await readJsonBody(request)) as CreateQuestionInput
    const question = await createQuestion(staff, campaignId, {
      questionTitle: body.questionTitle,
      questionType: body.questionType,
      isRequired: body.isRequired,
      options: body.options,
    })

    return Response.json({ question }, { status: 201 })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
