"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { motion, useReducedMotion } from "framer-motion"
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CornerUpLeft,
  Loader2,
  MessageCircle,
  Pencil,
  Search,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { CONTACT_FIELD_SHADOW } from "@/components/manage/contact-record-styles"
import { cn } from "@/lib/utils"
import {
  CONTACT_COMMENT_MAX_LENGTH,
  CONTACT_REACTION_EMOJIS,
  type ManageContactComment,
} from "@/components/manage/manage-comment-types"
import type {
  CommentActions,
  ContactRecordLoad,
} from "@/components/contacts/contact-record-types"
import type { ManageContactCommentList } from "@/components/manage/manage-comment-types"

/**
 * The record's activity pane.
 *
 * It is **presentational**: the comments arrive as a load state, the
 * capabilities arrive from the server, and every write is a callback supplied
 * by the hook that owns the record's view state. It never reads on mount and
 * never fetches. When the server did not read the comments — because the
 * contact is outside the reader's patch — it says why rather than rendering an
 * empty thread.
 *
 * The source product's structure is kept: replies grouped one level under their
 * thread, emoji reactions, inline editing, search and a composer. Optimism for
 * a *new* comment is deliberately not kept: the pane is one render of a state
 * another component owns, and a second local list would be a second source of
 * truth for what a thread contains. The reaction pill still moves immediately
 * because the hook owns that optimistic patch and rolls it back on failure.
 */
export interface ContactCommentsPaneProps {
  contactName: string
  comments: ContactRecordLoad<ManageContactCommentList> | null
  canComment: boolean
  actions: CommentActions | null
}

function initials(name: string | null): string {
  if (!name) {
    return "?"
  }

  const parts = name.trim().split(/\s+/).slice(0, 2)

  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?"
}

function authorLabel(comment: ManageContactComment): string {
  if (comment.isOwn) {
    return "You"
  }

  return comment.authorName ?? "Former staff member"
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return ""
  }
}

/**
 * The comments skeleton. The record's fields render first and this fills the
 * pane while the separate comment read is in flight. The sheen is one soft
 * pass across the block, not a bouncing spinner, so it reads as a quiet placeholder
 * in an office view; reduced motion keeps the same shapes without the sweep.
 */
function CommentsLoading() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="relative overflow-hidden px-2 py-1" role="status" aria-live="polite">
      <span className="sr-only">Loading comments</span>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <motion.div
            key={row}
            className="flex items-start gap-2"
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: row * 0.07, duration: 0.28, ease: "easeOut" }}
          >
            <span className="size-6 shrink-0 rounded-full bg-foreground/10" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              <span className="h-2 w-20 rounded-full bg-foreground/10" />
              <span className="h-2 w-full rounded-full bg-foreground/10" />
              <span className="h-2 w-3/5 rounded-full bg-foreground/10" />
            </span>
          </motion.div>
        ))}
      </div>

      {reduceMotion ? null : (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10"
          initial={{ x: "-120%" }}
          animate={{ x: "320%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <p className="pt-3 text-[11px] leading-4 text-muted-foreground">Loading conversation…</p>
    </div>
  )
}

/** One composer, used for a new comment and for a reply. */
function Composer({
  placeholder,
  value,
  onChange,
  onSubmit,
  onCancel,
  sending,
  autoFocus,
  submitLabel,
}: {
  placeholder: string
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  onCancel?: () => void
  sending: boolean
  autoFocus?: boolean
  submitLabel: string
}) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement | null>(null)

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div
        className={cn(
          "relative rounded-[6px] bg-field",
          CONTACT_FIELD_SHADOW,
          "focus-within:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_1px_var(--ring)]",
        )}
      >
        <textarea
          ref={ref}
          id={id}
          value={value}
          rows={1}
          maxLength={CONTACT_COMMENT_MAX_LENGTH}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }

            if (event.key === "Escape" && onCancel) {
              event.preventDefault()
              onCancel()
            }
          }}
          className="max-h-32 min-h-10 w-full resize-none bg-transparent px-2 py-2.5 pr-10 text-[13px] leading-[19px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        {value.trim().length > 0 ? (
          <button
            type="button"
            aria-label={submitLabel}
            disabled={sending}
            onClick={onSubmit}
            className="absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-[4px] bg-primary text-primary-foreground disabled:opacity-60"
          >
            {sending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ArrowUp aria-hidden="true" className="size-4" />
            )}
          </button>
        ) : null}
      </div>
      {onCancel ? (
        <div className="mt-1.5 flex items-center justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-7 text-[12px]"
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** The palette, anchored to the button that opened it. */
function ReactionPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    },
    [onClose],
  )

  // Bound only while the picker is open, and removed with it: an always-on
  // document listener per reaction button would be one listener per comment.
  useDocumentPointerDown(onPointerDown)

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Add reaction"
      className="absolute right-0 top-7 z-20 grid w-[168px] grid-cols-6 gap-0.5 rounded-md border border-border bg-popover p-1.5 shadow-lg"
    >
      {CONTACT_REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitem"
          aria-label={`React with ${emoji}`}
          onClick={() => onPick(emoji)}
          className="flex size-6 items-center justify-center rounded text-[15px] leading-none hover:bg-muted"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

function useDocumentPointerDown(handler: (event: PointerEvent) => void): void {
  const ref = useRef(handler)

  useEffect(() => {
    ref.current = handler
  }, [handler])

  // A small effect rather than a raw addEventListener in render: the listener
  // is installed once per mount and always calls the latest handler.
  useEffect(() => {
    const listener = (event: PointerEvent) => ref.current(event)
    document.addEventListener("pointerdown", listener)

    return () => document.removeEventListener("pointerdown", listener)
  }, [])
}

export function ContactCommentsPane({
  contactName,
  comments,
  canComment,
  actions,
}: ContactCommentsPaneProps) {
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")

  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState("")
  const [replySending, setReplySending] = useState(false)

  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [editSending, setEditSending] = useState(false)

  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())

  const listRef = useRef<HTMLDivElement | null>(null)

  const ready = comments?.status === "ready" ? comments.value : null

  const { roots, repliesByRoot } = useMemo(() => {
    if (!ready) {
      return {
        roots: [] as ManageContactComment[],
        repliesByRoot: new Map<string, ManageContactComment[]>(),
      }
    }

    const grouped = new Map<string, ManageContactComment[]>()

    for (const comment of ready.comments) {
      if (comment.rootCommentId) {
        const list = grouped.get(comment.rootCommentId) ?? []
        list.push(comment)
        grouped.set(comment.rootCommentId, list)
      }
    }

    return {
      roots: ready.comments.filter((comment) => comment.rootCommentId === null),
      repliesByRoot: grouped,
    }
  }, [ready])

  /**
   * The thread list after the search box, if one is open.
   *
   * Filtering the roots rather than every comment keeps a reply attached to a
   * root that matched; a reply that matched on its own would otherwise appear
   * without the question it answers.
   */
  const shownRoots = useMemo(() => {
    const needle = query.trim().toLowerCase()

    if (!needle) {
      return roots
    }

    return roots.filter((comment) =>
      `${authorLabel(comment)} ${comment.body}`.toLowerCase().includes(needle),
    )
  }, [query, roots])

  const scrollToEnd = useCallback(() => {
    const node = listRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [])

  const send = useCallback(async () => {
    const body = draft.trim()

    if (body.length === 0 || sending || !actions) {
      return
    }

    setSending(true)
    setNotice(null)
    setDraft("")

    try {
      await actions.create(body)
      scrollToEnd()
    } catch (error) {
      setDraft(body)
      setNotice(error instanceof Error ? error.message : "Unable to save the comment.")
    } finally {
      setSending(false)
    }
  }, [actions, draft, scrollToEnd, sending])

  const sendReply = useCallback(
    async (rootId: string) => {
      const body = replyDraft.trim()

      if (body.length === 0 || replySending || !actions) {
        return
      }

      setReplySending(true)
      setNotice(null)
      setReplyDraft("")
      setReplyingTo(null)
      setExpandedThreads((current) => new Set(current).add(rootId))

      try {
        await actions.create(body, rootId)
      } catch (error) {
        setReplyDraft(body)
        setReplyingTo(rootId)
        setNotice(error instanceof Error ? error.message : "Unable to save the reply.")
      } finally {
        setReplySending(false)
      }
    },
    [actions, replyDraft, replySending],
  )

  const saveEdit = useCallback(
    async (commentId: string) => {
      const body = editDraft.trim()

      if (body.length === 0 || editSending || !actions) {
        return
      }

      setEditSending(true)
      setNotice(null)

      try {
        await actions.update(commentId, body)
        setEditing(null)
        setEditDraft("")
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Unable to save the comment.")
      } finally {
        setEditSending(false)
      }
    },
    [actions, editDraft, editSending],
  )

  const remove = useCallback(
    async (commentId: string) => {
      if (!actions) {
        return
      }

      setNotice(null)

      try {
        await actions.remove(commentId)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Unable to delete the comment.")
      }
    },
    [actions],
  )

  const react = useCallback(
    async (comment: ManageContactComment, emoji: string) => {
      setPickerFor(null)

      if (!actions) {
        return
      }

      const existing = comment.reactions.find((reaction) => reaction.emoji === emoji)

      try {
        await actions.react(comment.id, emoji, !existing?.mine)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Unable to save the reaction.")
      }
    },
    [actions],
  )

  const renderRow = (comment: ManageContactComment, isReply: boolean) => {
    const isEditing = editing === comment.id
    const threadRootId = comment.rootCommentId ?? comment.id
    const replies = repliesByRoot.get(comment.id) ?? []
    const expanded = expandedThreads.has(comment.id)

    return (
      <div className={isReply ? "pl-8" : undefined}>
        <div
          className="group flex items-start gap-2"
          data-contact-comment={comment.id}
          data-contact-comment-reply={isReply ? "true" : undefined}
        >
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-[var(--program-text)]"
          >
            {initials(comment.authorName)}
          </span>

          <div className="relative min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="font-medium text-[var(--program-text)]">{authorLabel(comment)}</span>
              <span aria-hidden="true">·</span>
              <span>{relativeTime(comment.createdAt)}</span>
              {comment.editedAt ? <span className="italic">(edited)</span> : null}
            </div>

            {isEditing ? (
              <div className="mt-1">
                <Composer
                  placeholder="Edit comment"
                  value={editDraft}
                  onChange={setEditDraft}
                  onSubmit={() => void saveEdit(comment.id)}
                  onCancel={() => {
                    setEditing(null)
                    setEditDraft("")
                  }}
                  sending={editSending}
                  autoFocus
                  submitLabel="Save"
                />
              </div>
            ) : (
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-snug text-[var(--program-text)]">
                {comment.body}
              </p>
            )}

            {comment.reactions.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {comment.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    type="button"
                    aria-label={`${reaction.mine ? "Remove your" : "Add"} ${reaction.emoji} reaction`}
                    aria-pressed={reaction.mine}
                    disabled={!actions}
                    onClick={() => void react(comment, reaction.emoji)}
                    className={
                      reaction.mine
                        ? "flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[12px] leading-none"
                        : "flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[12px] leading-none hover:bg-muted"
                    }
                  >
                    <span aria-hidden="true" className="text-[13px] leading-none">
                      {reaction.emoji}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{reaction.count}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-1 flex items-center gap-1">
              {replies.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedThreads((current) => {
                      const next = new Set(current)
                      if (next.has(comment.id)) {
                        next.delete(comment.id)
                      } else {
                        next.add(comment.id)
                      }
                      return next
                    })
                  }
                  className="flex items-center gap-1 rounded px-1 py-0.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-[var(--program-text)]"
                >
                  {expanded ? (
                    <ChevronDown aria-hidden="true" className="size-3" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="size-3" />
                  )}
                  {replies.length} {replies.length === 1 ? "reply" : "replies"}
                </button>
              ) : null}
            </div>

            {/*
              The hover toolbar. Kept in the DOM at zero opacity rather than
              mounted on hover, so hovering does not shift the row and a
              keyboard user reaches the same controls by tabbing.
            */}
            <div className="absolute right-0 top-0 flex items-center gap-0.5 rounded-md bg-card opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Add reaction"
                title="Add reaction"
                aria-expanded={pickerFor === comment.id}
                disabled={!actions}
                onClick={() => setPickerFor(pickerFor === comment.id ? null : comment.id)}
                className="size-6"
              >
                <SmilePlus aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Reply to thread"
                title="Reply to thread"
                disabled={!actions}
                onClick={() => {
                  setReplyingTo(threadRootId)
                  setReplyDraft("")
                  setExpandedThreads((current) => new Set(current).add(threadRootId))
                }}
                className="size-6"
              >
                <CornerUpLeft aria-hidden="true" className="size-3.5" />
              </Button>
              {comment.isOwn ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Edit comment"
                    title="Edit comment"
                    disabled={!actions}
                    onClick={() => {
                      setEditing(comment.id)
                      setEditDraft(comment.body)
                    }}
                    className="size-6"
                  >
                    <Pencil aria-hidden="true" className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete comment"
                    title="Delete comment"
                    disabled={!actions}
                    onClick={() => void remove(comment.id)}
                    className="size-6"
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </Button>
                </>
              ) : null}
            </div>

            {pickerFor === comment.id ? (
              <ReactionPicker
                onPick={(emoji) => void react(comment, emoji)}
                onClose={() => setPickerFor(null)}
              />
            ) : null}
          </div>
        </div>

        {replies.length > 0 && expanded ? (
          <div className="mt-2 flex flex-col gap-2">
            {replies.map((reply) => (
              <div key={reply.id}>{renderRow(reply, true)}</div>
            ))}
          </div>
        ) : null}

        {replyingTo === comment.id ? (
          <div className="mt-2 pl-8">
            <Composer
              placeholder="Add a reply"
              value={replyDraft}
              onChange={setReplyDraft}
              onSubmit={() => void sendReply(comment.id)}
              onCancel={() => {
                setReplyingTo(null)
                setReplyDraft("")
              }}
              sending={replySending}
              autoFocus
              submitLabel="Reply"
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section
      aria-label="Comments"
      className="flex h-full min-h-0 w-full flex-col border-l border-border"
      data-contact-comments=""
    >
      {canComment ? (
        <header className="flex shrink-0 flex-col gap-2 px-4 py-3">
        <div className="flex h-7 items-center justify-between">
          <span className="-ml-2 flex items-center rounded-[3px] px-2 py-1 text-[13px] leading-[19.5px] text-muted-foreground">
            All comments
          </span>
          <button
            type="button"
            aria-label="Search comments"
            aria-pressed={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open)
              setQuery("")
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-[6px] text-foreground opacity-75 outline-none hover:bg-secondary hover:opacity-100 focus-visible:ring-1 focus-visible:ring-ring dark:hover:bg-field",
              searchOpen && "bg-secondary opacity-75 dark:bg-field",
            )}
          >
            <Search aria-hidden="true" className="size-4" />
          </button>
        </div>

        {searchOpen ? (
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search comments"
            aria-label="Search comments"
            className={cn(
              "h-8 w-full rounded-[6px] bg-field px-2 text-[13px] leading-[19.5px] text-foreground outline-none placeholder:text-muted-foreground",
              CONTACT_FIELD_SHADOW,
              "focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_1px_var(--ring)]",
            )}
          />
        ) : null}
      </header>
      ) : null}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!canComment ? (
          <div className="px-2 py-3" data-contact-comments-unavailable="">
            <p className="text-[13px] leading-5 text-foreground">Comments are not available.</p>
            <p className="mt-1 text-[12px] leading-[18px] text-muted-foreground">
              This contact is outside your patch. You can read and edit the record, but comments
              stay with the person who owns it.
            </p>
          </div>
        ) : comments === null || comments.status === "loading" ? (
          <CommentsLoading />
        ) : comments.status === "error" ? (
          <p role="alert" className="px-2 text-[12px] text-destructive">
            {comments.message}
          </p>
        ) : roots.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <span aria-hidden="true" className="relative mb-4 block size-10">
              <MessageCircle
                strokeWidth={0}
                className="absolute bottom-0 right-0 size-7 fill-foreground/20 dark:fill-white/75"
              />
              <MessageCircle
                strokeWidth={0}
                className="absolute left-0 top-0 size-7 fill-foreground/15 dark:fill-white"
              />
            </span>
            <p className="text-[13px] leading-[16.25px] text-foreground">Start a conversation</p>
            <p className="mt-1 max-w-[270px] text-[11px] leading-[16.5px] text-muted-foreground">
              Leave a note about {contactName} for the rest of the team.
            </p>
          </div>
        ) : shownRoots.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-muted-foreground">
            No comments match “{query.trim()}”.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {shownRoots.map((comment) => (
              <li key={comment.id}>{renderRow(comment, false)}</li>
            ))}
          </ul>
        )}
      </div>

      {canComment && actions && comments?.status === "ready" ? (
        <div className="shrink-0 border-t border-border p-4">
          {notice ? (
            <div className="mb-2 flex items-start justify-between gap-2">
              <p role="alert" className="text-[12px] text-destructive">
                {notice}
              </p>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setNotice(null)}
                className="text-muted-foreground hover:text-[var(--program-text)]"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ) : null}
          <Composer
            placeholder="Leave a comment"
            value={draft}
            onChange={setDraft}
            onSubmit={() => void send()}
            sending={sending}
            submitLabel="Comment"
          />
        </div>
      ) : null}
    </section>
  )
}
