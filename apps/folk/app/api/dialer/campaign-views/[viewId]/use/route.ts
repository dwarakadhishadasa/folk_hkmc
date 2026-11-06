import { handleSavedViewUse } from "@/lib/saved-views/view-handlers"

export const dynamic = "force-dynamic"

interface CampaignViewContext {
  params: Promise<{ viewId: string }>
}

export async function POST(_request: Request, context: CampaignViewContext) {
  const { viewId } = await context.params

  return handleSavedViewUse(viewId, "campaigns")
}
