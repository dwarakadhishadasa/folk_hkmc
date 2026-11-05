import { handleManageViewCreate, handleManageViewsList } from "@/lib/manage/view-handlers"

export const dynamic = "force-dynamic"

export async function GET() {
  return handleManageViewsList()
}

export async function POST(request: Request) {
  return handleManageViewCreate(request)
}
