import { handleContactHistory } from "@/lib/manage/contact-history-handlers"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return handleContactHistory(request)
}
