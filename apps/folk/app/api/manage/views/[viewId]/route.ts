import { handleManageViewDelete, handleManageViewUpdate } from "@/lib/manage/view-handlers"

export const dynamic = "force-dynamic"

interface ManageViewContext {
  params: Promise<{ viewId: string }>
}

export async function PATCH(request: Request, context: ManageViewContext) {
  const { viewId } = await context.params

  return handleManageViewUpdate(request, viewId)
}

export async function DELETE(_request: Request, context: ManageViewContext) {
  const { viewId } = await context.params

  return handleManageViewDelete(viewId)
}
