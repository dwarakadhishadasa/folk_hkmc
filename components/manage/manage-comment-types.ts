/**
 * Client-safe shapes for the record-comment pane.
 *
 * Client-safe in the same sense as `manage-types.ts`: this module imports
 * nothing, so a `"use client"` component can hold it without reaching
 * `@/lib/supabase/*` or `@/lib/authz` at runtime.
 */

/** One emoji's tally on one comment, already resolved for the reader. */
export interface ManageCommentReaction {
  emoji: string
  count: number
  /** Whether the signed-in staff member is one of the `count`. */
  mine: boolean
}

/** Who a comment is by, flattened to what the pane renders. */
export interface ManageContactComment {
  id: string
  contactId: string
  authorUserId: string
  /**
   * The author's display name. Resolved server-side from `public.users`, and
   * `null` when the row outlived the staff record — the pane falls back to a
   * neutral label rather than inventing one.
   */
  authorName: string | null
  body: string
  /** Set when the comment is pinned to one field instead of the whole record. */
  cellFieldId: string | null
  /**
   * The thread this reply belongs to — the id of the thread's first comment.
   * `null` on a root comment. Threads are one level deep, which is why the pane
   * can group with a single pass instead of walking a tree.
   */
  rootCommentId: string | null
  /** Set once the body has been rewritten; the pane renders "(edited)". */
  editedAt: string | null
  /** A resolved thread is dimmed and its reply box is gone. */
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  reactions: ManageCommentReaction[]
  /** Whether the signed-in staff member wrote it — the pane gates edit/delete on this. */
  isOwn: boolean
}

/** What the pane needs to render itself, delivered with its reads. */
export interface ManageContactCommentList {
  comments: ManageContactComment[]
  /**
   * The signed-in staff member. Sent with the list because "is this mine" has
   * to be answered the same way in the list and in a freshly created row.
   */
  readerUserId: string
  /**
   * The reader's display name, so an optimistic comment carries the right
   * initials before the server row arrives. Without it the pending row renders
   * a `?` avatar that corrects itself a moment later, which reads as a glitch.
   */
  readerName: string
}

export const CONTACT_COMMENT_MAX_LENGTH = 4000

/**
 * The reaction palette.
 *
 * The source product opened a full `emoji-mart` picker with search and twelve
 * categories. This is a fixed palette instead: the pane's reactions are a
 * quick acknowledgement, and shipping an 1,800-emoji index to say "thumbs up"
 * is a dependency the feature does not earn. Every entry is a single character,
 * so the database's `emoji` column and the rendered pill agree without a
 * codepoint table.
 */
export const CONTACT_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "🎉",
  "😮",
  "😢",
  "🙏",
  "👏",
  "🔥",
  "✅",
  "👀",
  "💯",
] as const
