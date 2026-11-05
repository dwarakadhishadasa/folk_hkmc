import { handleSavedViewCreate, handleSavedViewsList } from "@/lib/saved-views/view-handlers"

export const dynamic = "force-dynamic"

export async function GET() {
  return handleSavedViewsList("contacts")
}

export async function POST(request: Request) {
  return handleSavedViewCreate(request, "contacts")
}
