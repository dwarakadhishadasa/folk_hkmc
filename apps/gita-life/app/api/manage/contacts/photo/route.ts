import {
  handleManageContactPhotoUpload,
  handleManageContactPhotoUrl,
} from "@/lib/manage/api-handlers"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return handleManageContactPhotoUpload(request)
}

export async function GET(request: Request) {
  return handleManageContactPhotoUrl(request)
}