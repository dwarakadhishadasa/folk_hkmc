import { handleCommentReactionSet } from "@/lib/manage/comment-handlers"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return handleCommentReactionSet(request)
}
