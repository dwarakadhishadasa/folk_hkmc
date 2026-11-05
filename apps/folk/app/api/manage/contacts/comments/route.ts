import {
  handleContactCommentCreate,
  handleContactCommentDelete,
  handleContactCommentList,
  handleContactCommentUpdate,
} from "@/lib/manage/comment-handlers"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return handleContactCommentList(request)
}

export async function POST(request: Request) {
  return handleContactCommentCreate(request)
}

export async function PATCH(request: Request) {
  return handleContactCommentUpdate(request)
}

export async function DELETE(request: Request) {
  return handleContactCommentDelete(request)
}
