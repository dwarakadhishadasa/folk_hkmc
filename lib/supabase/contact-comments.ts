import "server-only"

import { AuthzError, writeAuditEvent, type StaffContext } from "@/lib/authz"
import {
  CONTACT_COMMENT_MAX_LENGTH,
  type ManageCommentReaction,
  type ManageContactComment,
  type ManageContactCommentList,
} from "@/components/manage/manage-comment-types"
import { contactInPatch } from "@/lib/patch-scope"
import { assertManageContactInScope } from "@/lib/supabase/manage"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * Reads and writes for `public.contact_comments` and its reactions.
 *
 * Authorization lives in the route handler (`requireRole`) and in
 * `assertCommentContactInScope`, not here: this module is the table's only
 * owner and assumes both already ran. That is the same split
 * `lib/supabase/manage.ts` uses for contact writes.
 *
 * The tables are readable by `authenticated` under RLS, but every read below
 * goes through the service role — the admin client is what lets the pane
 * resolve an author's display name, which `public.users` does not expose to a
 * peer's session. The scope check is therefore load-bearing, not defence in
 * depth: it is the only thing standing between a caller and another patch's
 * comments.
 */

const COMMENT_COLUMNS =
  "id, contact_id, author_user_id, body, cell_field_id, root_comment_id, edited_at, resolved_at, created_at, updated_at"

interface CommentRow {
  id: string
  contact_id: string
  author_user_id: string
  body: string
  cell_field_id: string | null
  root_comment_id: string | null
  edited_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

interface ReactionRow {
  comment_id: string
  user_id: string
  emoji: string
}

/**
 * The contact must be in the caller's patch.
 *
 * `assertManageContactInScope` is not sufficient on its own. It reads through
 * the RLS-scoped server client, and the contacts policy gives an Admin the
 * whole programme — so for an Admin it answers "the contact exists in this
 * programme", not "the contact is yours". `contactInPatch` closes that gap for
 * every role: Admin and Preacher resolve the patch to themselves, an Assistant
 * to their assigned supervisor, and a comment has to live where its contact
 * lives.
 *
 * A 403 rather than a 404: the caller is authenticated and the feature exists;
 * what they lack is the record.
 */
async function assertCommentContactInScope(
  staff: StaffContext,
  contactId: string,
): Promise<void> {
  const contact = await assertManageContactInScope(staff, contactId)

  if (!contactInPatch(contact.assigned_preacher_id, staff.patchOwner?.userId ?? null)) {
    throw new AuthzError(
      403,
      "contact_comment_out_of_patch",
      "That record is outside your patch.",
    )
  }
}

function toComment(
  row: CommentRow,
  names: Map<string, string | null>,
  readerUserId: string,
  reactions: ManageCommentReaction[],
): ManageContactComment {
  return {
    id: row.id,
    contactId: row.contact_id,
    authorUserId: row.author_user_id,
    authorName: names.get(row.author_user_id) ?? null,
    body: row.body,
    cellFieldId: row.cell_field_id,
    rootCommentId: row.root_comment_id,
    editedAt: row.edited_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reactions,
    isOwn: row.author_user_id === readerUserId,
  }
}

async function resolveAuthorNames(
  authorIds: readonly string[],
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>()
  const unique = [...new Set(authorIds)]

  if (unique.length === 0) {
    return names
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.from("users").select("id, name").in("id", unique)

  if (error) {
    throw new AuthzError(500, "contact_comment_author_read_failed", "Unable to read comment authors.")
  }

  for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) {
    names.set(row.id, row.name)
  }

  return names
}

/**
 * Reactions for the given comments, grouped per comment and per emoji, with
 * the reader's own involvement resolved.
 *
 * Counted here rather than in SQL because the pane needs "did I react" in the
 * same breath as "how many", and a grouped subquery plus a second membership
 * query would be two round trips to answer one question about a handful of
 * rows.
 */
async function loadReactions(
  commentIds: readonly string[],
  readerUserId: string,
): Promise<Map<string, ManageCommentReaction[]>> {
  const byComment = new Map<string, ManageCommentReaction[]>()

  if (commentIds.length === 0) {
    return byComment
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contact_comment_reactions")
    .select("comment_id, user_id, emoji")
    .in("comment_id", [...commentIds])

  if (error) {
    throw new AuthzError(500, "contact_comment_reaction_read_failed", "Unable to read reactions.")
  }

  const tallies = new Map<string, { count: number; mine: boolean }>()

  for (const row of (data ?? []) as ReactionRow[]) {
    const key = `${row.comment_id}\u0000${row.emoji}`
    const current = tallies.get(key) ?? { count: 0, mine: false }
    current.count += 1
    current.mine = current.mine || row.user_id === readerUserId
    tallies.set(key, current)
  }

  for (const [key, value] of tallies) {
    const [commentId, emoji] = key.split("\u0000")
    const list = byComment.get(commentId) ?? []
    list.push({ emoji, count: value.count, mine: value.mine })
    byComment.set(commentId, list)
  }

  // Stable order so a pill does not move when someone else reacts.
  for (const list of byComment.values()) {
    list.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
  }

  return byComment
}

/**
 * The record's comments, oldest first, replies included.
 *
 * The pane groups replies under their root with a single pass over
 * `rootCommentId`; this returns them interleaved by time so a thread's replies
 * stay in the order they were written.
 */
export async function listManageContactComments(params: {
  staff: StaffContext
  contactId: string
}): Promise<ManageContactCommentList> {
  const { staff, contactId } = params
  const supabaseAdmin = createSupabaseAdminClient()

  // The scope probe and the list are independent reads, so they travel
  // together. `Promise.all` still rejects when the probe does, which is what
  // keeps an out-of-patch caller from ever seeing a row: the list is discarded
  // rather than returned.
  const [{ data, error }] = await Promise.all([
    supabaseAdmin
      .from("contact_comments")
      .select(COMMENT_COLUMNS)
      .eq("contact_id", contactId)
      .eq("program_id", staff.programId)
      .order("created_at", { ascending: true }),
    assertCommentContactInScope(staff, contactId),
  ])

  if (error) {
    throw new AuthzError(500, "contact_comment_read_failed", "Unable to read the comments.")
  }

  const rows = (data ?? []) as unknown as CommentRow[]
  const [names, reactions] = await Promise.all([
    resolveAuthorNames(rows.map((row) => row.author_user_id)),
    loadReactions(
      rows.map((row) => row.id),
      staff.userId,
    ),
  ])

  return {
    comments: rows.map((row) =>
      toComment(row, names, staff.userId, reactions.get(row.id) ?? []),
    ),
    readerUserId: staff.userId,
    readerName: staff.name,
  }
}

/**
 * A comment's id is minted here, before the insert, for the same reason the
 * source product minted it in the browser: the composer inserts the row it is
 * about to save and reconciles against this id instead of against list
 * position. Returning the id lets the client keep the row it already rendered.
 */
export async function createManageContactComment(params: {
  staff: StaffContext
  contactId: string
  body: string
  cellFieldId?: string | null
  rootCommentId?: string | null
}): Promise<ManageContactComment> {
  const { staff, contactId, body, cellFieldId = null, rootCommentId = null } = params
  await assertCommentContactInScope(staff, contactId)

  const trimmed = body.trim()

  if (trimmed.length === 0) {
    throw new AuthzError(400, "contact_comment_empty", "A comment needs some text.")
  }

  if (trimmed.length > CONTACT_COMMENT_MAX_LENGTH) {
    throw new AuthzError(400, "contact_comment_too_long", "That comment is too long.")
  }

  const supabaseAdmin = createSupabaseAdminClient()

  if (rootCommentId) {
    const { data: root, error: rootError } = await supabaseAdmin
      .from("contact_comments")
      .select("id, contact_id, root_comment_id")
      .eq("id", rootCommentId)
      .eq("contact_id", contactId)
      .eq("program_id", staff.programId)
      .maybeSingle()

    if (rootError) {
      throw new AuthzError(500, "contact_comment_read_failed", "Unable to read the thread.")
    }

    if (!root) {
      throw new AuthzError(404, "contact_comment_not_found", "That comment no longer exists.")
    }

    if ((root as { root_comment_id: string | null }).root_comment_id !== null) {
      throw new AuthzError(400, "contact_comment_nested_reply", "Replies are one level deep.")
    }
  }

  const { data, error } = await supabaseAdmin
    .from("contact_comments")
    .insert({
      program_id: staff.programId,
      contact_id: contactId,
      author_user_id: staff.userId,
      body: trimmed,
      rich_text: [{ insert: `${trimmed}\n` }],
      cell_field_id: cellFieldId,
      root_comment_id: rootCommentId,
    })
    .select(COMMENT_COLUMNS)
    .single()

  if (error || !data) {
    throw new AuthzError(500, "contact_comment_create_failed", "Unable to save the comment.")
  }

  await writeAuditEvent({
    programId: staff.programId,
    actorSupabaseUserId: staff.supabaseUserId,
    actorRole: staff.role,
    action: rootCommentId ? "manage.contact.comment.reply" : "manage.contact.comment.create",
    targetId: contactId,
    source: "manage-portal",
    syncState: "ok",
    metadata: { commentId: (data as unknown as CommentRow).id },
  })

  // The author is the caller, so the row comes back named from the staff
  // context rather than from a second `users` read.
  return toComment(
    data as unknown as CommentRow,
    new Map([[staff.userId, staff.name]]),
    staff.userId,
    [],
  )
}

/**
 * Rewrites a comment's body. Author-only: a Preacher and an Assistant in the
 * same patch both have the role, and neither should be able to put words in the
 * other's mouth. `edited_at` is stamped here so the pane's "(edited)" is a fact
 * rather than a text comparison.
 */
export async function updateManageContactComment(params: {
  staff: StaffContext
  contactId: string
  commentId: string
  body: string
}): Promise<ManageContactComment> {
  const { staff, contactId, commentId, body } = params
  await assertCommentContactInScope(staff, contactId)

  const trimmed = body.trim()

  if (trimmed.length === 0) {
    throw new AuthzError(400, "contact_comment_empty", "A comment needs some text.")
  }

  if (trimmed.length > CONTACT_COMMENT_MAX_LENGTH) {
    throw new AuthzError(400, "contact_comment_too_long", "That comment is too long.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data: existing, error: readError } = await supabaseAdmin
    .from("contact_comments")
    .select("id, author_user_id")
    .eq("id", commentId)
    .eq("contact_id", contactId)
    .eq("program_id", staff.programId)
    .maybeSingle()

  if (readError) {
    throw new AuthzError(500, "contact_comment_read_failed", "Unable to read the comment.")
  }

  if (!existing) {
    throw new AuthzError(404, "contact_comment_not_found", "That comment no longer exists.")
  }

  if ((existing as { author_user_id: string }).author_user_id !== staff.userId) {
    throw new AuthzError(403, "contact_comment_not_author", "Only the author can edit a comment.")
  }

  const { data, error } = await supabaseAdmin
    .from("contact_comments")
    .update({
      body: trimmed,
      rich_text: [{ insert: `${trimmed}\n` }],
      edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", commentId)
    .eq("contact_id", contactId)
    .eq("program_id", staff.programId)
    .select(COMMENT_COLUMNS)
    .single()

  if (error || !data) {
    throw new AuthzError(500, "contact_comment_update_failed", "Unable to save the comment.")
  }

  const row = data as unknown as CommentRow
  const reactions = await loadReactions([row.id], staff.userId)

  return toComment(
    row,
    new Map([[staff.userId, staff.name]]),
    staff.userId,
    reactions.get(row.id) ?? [],
  )
}

/**
 * Deletes one comment. Only its author may delete it — the route enforces the
 * role, and this enforces authorship. Replies to a deleted root go with it,
 * because that is what the foreign key says and what the thread means.
 */
export async function deleteManageContactComment(params: {
  staff: StaffContext
  contactId: string
  commentId: string
}): Promise<void> {
  const { staff, contactId, commentId } = params
  await assertCommentContactInScope(staff, contactId)

  const supabaseAdmin = createSupabaseAdminClient()
  const { data: existing, error: readError } = await supabaseAdmin
    .from("contact_comments")
    .select("id, author_user_id")
    .eq("id", commentId)
    .eq("contact_id", contactId)
    .eq("program_id", staff.programId)
    .maybeSingle()

  if (readError) {
    throw new AuthzError(500, "contact_comment_read_failed", "Unable to read the comment.")
  }

  if (!existing) {
    throw new AuthzError(404, "contact_comment_not_found", "That comment no longer exists.")
  }

  if ((existing as { author_user_id: string }).author_user_id !== staff.userId) {
    throw new AuthzError(403, "contact_comment_not_author", "Only the author can delete a comment.")
  }

  const { error } = await supabaseAdmin
    .from("contact_comments")
    .delete()
    .eq("id", commentId)
    .eq("contact_id", contactId)
    .eq("program_id", staff.programId)

  if (error) {
    throw new AuthzError(500, "contact_comment_delete_failed", "Unable to delete the comment.")
  }
}

/**
 * Adds or removes the caller's own reaction.
 *
 * Idempotent in both directions: the unique key makes a double-add a no-op and
 * the delete is keyed by the same tuple, so a double-click cannot leave two
 * rows or an orphan. `active` is the desired state, not a toggle, so a retry
 * after a dropped response converges instead of flipping twice.
 */
export async function setManageCommentReaction(params: {
  staff: StaffContext
  contactId: string
  commentId: string
  emoji: string
  active: boolean
}): Promise<void> {
  const { staff, contactId, commentId, emoji, active } = params
  await assertCommentContactInScope(staff, contactId)

  const trimmed = emoji.trim()

  if (trimmed.length === 0 || trimmed.length > 32) {
    throw new AuthzError(400, "contact_comment_reaction_invalid", "That reaction is not valid.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data: comment, error: commentError } = await supabaseAdmin
    .from("contact_comments")
    .select("id")
    .eq("id", commentId)
    .eq("contact_id", contactId)
    .eq("program_id", staff.programId)
    .maybeSingle()

  if (commentError) {
    throw new AuthzError(500, "contact_comment_read_failed", "Unable to read the comment.")
  }

  if (!comment) {
    throw new AuthzError(404, "contact_comment_not_found", "That comment no longer exists.")
  }

  if (active) {
    const { error } = await supabaseAdmin.from("contact_comment_reactions").upsert(
      {
        program_id: staff.programId,
        comment_id: commentId,
        user_id: staff.userId,
        emoji: trimmed,
      },
      { onConflict: "comment_id,user_id,emoji", ignoreDuplicates: true },
    )

    if (error) {
      throw new AuthzError(500, "contact_comment_reaction_failed", "Unable to save the reaction.")
    }

    return
  }

  const { error } = await supabaseAdmin
    .from("contact_comment_reactions")
    .delete()
    .eq("comment_id", commentId)
    .eq("user_id", staff.userId)
    .eq("emoji", trimmed)
    .eq("program_id", staff.programId)

  if (error) {
    throw new AuthzError(500, "contact_comment_reaction_failed", "Unable to remove the reaction.")
  }
}
