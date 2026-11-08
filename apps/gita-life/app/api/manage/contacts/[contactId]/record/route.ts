import { handleContactRecord } from "@/lib/contacts/record-handlers"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const { contactId } = await params
  return handleContactRecord(request, contactId)
}
