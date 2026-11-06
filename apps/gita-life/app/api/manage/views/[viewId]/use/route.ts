import { handleSavedViewUse } from "@/lib/saved-views/view-handlers"

export const dynamic = "force-dynamic"

interface ManageViewContext {
  params: Promise<{ viewId: string }>
}

export async function POST(_request: Request, context: ManageViewContext) {
  const { viewId } = await context.params

  return handleSavedViewUse(viewId, "contacts")
}
