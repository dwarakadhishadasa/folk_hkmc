import { handleSavedViewDelete, handleSavedViewUpdate } from "@/lib/saved-views/view-handlers"

export const dynamic = "force-dynamic"

interface ManageViewContext {
  params: Promise<{ viewId: string }>
}

export async function PATCH(request: Request, context: ManageViewContext) {
  const { viewId } = await context.params

  return handleSavedViewUpdate(request, viewId, "contacts")
}

export async function DELETE(_request: Request, context: ManageViewContext) {
  const { viewId } = await context.params

  return handleSavedViewDelete(viewId, "contacts")
}
