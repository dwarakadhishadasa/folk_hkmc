import { handleManageContactReorder } from "@/lib/manage/order-handlers"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return handleManageContactReorder(request)
}
