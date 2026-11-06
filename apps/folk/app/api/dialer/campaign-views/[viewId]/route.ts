import { handleSavedViewDelete, handleSavedViewUpdate } from "@/lib/saved-views/view-handlers"

export const dynamic = "force-dynamic"

interface CampaignViewContext {
  params: Promise<{ viewId: string }>
}

export async function PATCH(request: Request, context: CampaignViewContext) {
  const { viewId } = await context.params

  return handleSavedViewUpdate(request, viewId, "campaigns")
}

export async function DELETE(_request: Request, context: CampaignViewContext) {
  const { viewId } = await context.params

  return handleSavedViewDelete(viewId, "campaigns")
}
