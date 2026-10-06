import { handleManageContactUpdate } from "@/lib/manage/api-handlers"

export const dynamic = "force-dynamic"

export async function PATCH(request: Request) {
  return handleManageContactUpdate(request)
}