import {
  handleManageContactCreate,
  handleManageContactDelete,
  handleManageContactUpdate,
} from "@/lib/manage/api-handlers"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return handleManageContactCreate(request)
}

export async function PATCH(request: Request) {
  return handleManageContactUpdate(request)
}

export async function DELETE(request: Request) {
  return handleManageContactDelete(request)
}
