"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { formatDistanceToNow } from "date-fns"
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
import {
  CONTACT_FIELD_SHADOW,
} from "@/components/manage/contact-record-styles"
import { cn } from "@/lib/utils"
import {
  CONTACT_COMMENT_MAX_LENGTH,
  CONTACT_REACTION_EMOJIS,
  type ManageCommentReaction,
  type ManageContactComment,
  type ManageContactCommentList,
} from "@/components/manage/manage-comment-types"

/**
 * The expanded record's activity pane.
 *
 * The source product put a comment list beside the field column, with replies
 * grouped under their thread, emoji reactions on each comment, inline editing,
 * and a composer at the bottom. This is that pane, backed by
 * `public.contact_comments` and `public.contact_comment_reactions`.
 *
 * **Threads are one level deep.** A reply stores the id of the thread's first
 * comment, so the pane groups with one pass and "N replies" is a count rather
 * than a tree walk. Replying to a reply targets the same root, which is what
 * keeps the depth at one.
 *
 * **Optimism is scoped.** A sent comment and a reaction both render before the
 * request resolves and roll back on failure; an edit does not, because a
 * half-typed correction appearing as fact is worse than a spinner.
 *
 * What is deliberately absent: resolvable threads, attachment uploads, mentions
 * and the AI composer. Each is its own feature behind a button, and a button
 * that opens nothing is worse than a frame that was never drawn.
 */
export interface ContactCommentsPaneProps {
  contactId: string
  /** Rendered in the empty state so an operator knows whose record this is. */
  contactName: string
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; comments: ManageContactComment[]; readerUserId: string; readerName: string }
  | { kind: "error"; message: string }

const COMMENT_ENDPOINT = "/api/manage/contacts/comments"
const REACTION_ENDPOINT = "/api/manage/contacts/comment-reactions"

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

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus()
    }
  }, [autoFocus])

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

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener("pointerdown", onPointerDown)

    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [onClose])

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

export function ContactCommentsPane({ contactId, contactName }: ContactCommentsPaneProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" })
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
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    setState({ kind: "loading" })

    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(
          `${COMMENT_ENDPOINT}?contactId=${encodeURIComponent(contactId)}`,
          { signal: controller.signal, headers: { accept: "application/json" } },
        )

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? "Unable to load the comments.")
        }

        const payload = (await response.json()) as ManageContactCommentList

        if (!cancelled.current) {
          setState({
            kind: "ready",
            comments: payload.comments,
            readerUserId: payload.readerUserId,
            readerName: payload.readerName,
          })
        }
      } catch (error) {
        if (cancelled.current || controller.signal.aborted) {
          return
        }

        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Unable to load the comments.",
        })
      }
    }

    void load()

    return () => {
      cancelled.current = true
      controller.abort()
    }
  }, [contactId])

  const { roots, repliesByRoot } = useMemo(() => {
    if (state.kind !== "ready") {
      return { roots: [] as ManageContactComment[], repliesByRoot: new Map<string, ManageContactComment[]>() }
    }

    const grouped = new Map<string, ManageContactComment[]>()

    for (const comment of state.comments) {
      if (comment.rootCommentId) {
        const list = grouped.get(comment.rootCommentId) ?? []
        list.push(comment)
        grouped.set(comment.rootCommentId, list)
      }
    }

    return {
      roots: state.comments.filter((comment) => comment.rootCommentId === null),
      repliesByRoot: grouped,
    }
  }, [state])

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

  const scrollToEnd = useCallback(() => {    const node = listRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [])

  const patchComment = useCallback((commentId: string, next: ManageContactComment) => {
    setState((current) => {
      if (current.kind !== "ready") {
        return current
      }

      return {
        ...current,
        comments: current.comments.map((comment) => (comment.id === commentId ? next : comment)),
      }
    })
  }, [])

  const send = useCallback(async () => {
    const body = draft.trim()

    if (body.length === 0 || sending || state.kind !== "ready") {
      return
    }

    const tempId = `temp-${Date.now()}`
    const optimistic: ManageContactComment = {
      id: tempId,
      contactId,
      authorUserId: state.readerUserId,
      authorName: state.readerName,
      body,
      cellFieldId: null,
      rootCommentId: null,
      editedAt: null,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reactions: [],
      isOwn: true,
    }

    setSending(true)
    setNotice(null)
    setDraft("")
    setState({ ...state, comments: [...state.comments, optimistic] })

    try {
      const response = await fetch(COMMENT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, body }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? "Unable to save the comment.")
      }

      const payload = (await response.json()) as { comment: ManageContactComment }

      setState((current) => {
        if (current.kind !== "ready") {
          return current
        }

        return {
          ...current,
          comments: current.comments.map((comment) =>
            comment.id === tempId ? payload.comment : comment,
          ),
        }
      })
      scrollToEnd()
    } catch (error) {
      setState((current) => {
        if (current.kind !== "ready") {
          return current
        }

        return {
          ...current,
          comments: current.comments.filter((comment) => comment.id !== tempId),
        }
      })
      setDraft(body)
      setNotice(error instanceof Error ? error.message : "Unable to save the comment.")
    } finally {
      setSending(false)
    }
  }, [contactId, draft, scrollToEnd, sending, state])

  const sendReply = useCallback(
    async (rootId: string) => {
      const body = replyDraft.trim()

      if (body.length === 0 || replySending || state.kind !== "ready") {
        return
      }

      const tempId = `temp-${Date.now()}`
      const optimistic: ManageContactComment = {
        id: tempId,
        contactId,
        authorUserId: state.readerUserId,
        authorName: state.readerName,
        body,
        cellFieldId: null,
        rootCommentId: rootId,
        editedAt: null,
        resolvedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reactions: [],
        isOwn: true,
      }

      setReplySending(true)
      setNotice(null)
      setReplyDraft("")
      setReplyingTo(null)
      setExpandedThreads((current) => new Set(current).add(rootId))
      setState({ ...state, comments: [...state.comments, optimistic] })

      try {
        const response = await fetch(COMMENT_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId, body, rootCommentId: rootId }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? "Unable to save the reply.")
        }

        const payload = (await response.json()) as { comment: ManageContactComment }

        setState((current) => {
          if (current.kind !== "ready") {
            return current
          }

          return {
            ...current,
            comments: current.comments.map((comment) =>
              comment.id === tempId ? payload.comment : comment,
            ),
          }
        })
      } catch (error) {
        setState((current) => {
          if (current.kind !== "ready") {
            return current
          }

          return {
            ...current,
            comments: current.comments.filter((comment) => comment.id !== tempId),
          }
        })
        setReplyDraft(body)
        setReplyingTo(rootId)
        setNotice(error instanceof Error ? error.message : "Unable to save the reply.")
      } finally {
        setReplySending(false)
      }
    },
    [contactId, replyDraft, replySending, state],
  )

  const saveEdit = useCallback(
    async (commentId: string) => {
      const body = editDraft.trim()

      if (body.length === 0 || editSending) {
        return
      }

      setEditSending(true)
      setNotice(null)

      try {
        const response = await fetch(COMMENT_ENDPOINT, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId, commentId, body }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? "Unable to save the comment.")
        }

        const payload = (await response.json()) as { comment: ManageContactComment }
        patchComment(commentId, payload.comment)
        setEditing(null)
        setEditDraft("")
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Unable to save the comment.")
      } finally {
        setEditSending(false)
      }
    },
    [contactId, editDraft, editSending, patchComment],
  )

  const remove = useCallback(
    async (commentId: string) => {
      setNotice(null)

      const removed =
        state.kind === "ready"
          ? (state.comments.find((comment) => comment.id === commentId) ?? null)
          : null

      setState((current) => {
        if (current.kind !== "ready") {
          return current
        }

        return {
          ...current,
          comments: current.comments.filter((comment) => comment.id !== commentId),
        }
      })

      try {
        const response = await fetch(COMMENT_ENDPOINT, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId, commentId }),
        })

        if (!response.ok && response.status !== 204) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? "Unable to delete the comment.")
        }
      } catch (error) {
        if (removed) {
          const restore = removed
          setState((current) => {
            if (current.kind !== "ready") {
              return current
            }

            const next = [...current.comments, restore].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            )

            return { ...current, comments: next }
          })
        }

        setNotice(error instanceof Error ? error.message : "Unable to delete the comment.")
      }
    },
    [contactId, state],
  )

  /**
   * A reaction is optimistic in both directions: the pill moves on click and
   * the request carries the desired state, so a retry cannot double-count. On
   * failure the previous reaction list is restored exactly.
   */
  const react = useCallback(
    async (comment: ManageContactComment, emoji: string) => {
      setPickerFor(null)

      const existing = comment.reactions.find((reaction) => reaction.emoji === emoji)
      const active = !existing?.mine
      const previous = comment.reactions

      const next: ManageCommentReaction[] = active
        ? existing
          ? previous.map((reaction) =>
              reaction.emoji === emoji
                ? { ...reaction, count: reaction.count + 1, mine: true }
                : reaction,
            )
          : [...previous, { emoji, count: 1, mine: true }]
        : previous
            .map((reaction) =>
              reaction.emoji === emoji
                ? { ...reaction, count: reaction.count - 1, mine: false }
                : reaction,
            )
            .filter((reaction) => reaction.count > 0)

      patchComment(comment.id, { ...comment, reactions: next })

      try {
        const response = await fetch(REACTION_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId, commentId: comment.id, emoji, active }),
        })

        if (!response.ok && response.status !== 204) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? "Unable to save the reaction.")
        }
      } catch (error) {
        patchComment(comment.id, { ...comment, reactions: previous })
        setNotice(error instanceof Error ? error.message : "Unable to save the reaction.")
      }
    },
    [contactId, patchComment],
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
      {/*
        The pane header is two rows in the source product: the "All comments"
        selector with the search control, then the followers line. This app has
        no follow/subscribe model, so the second row is not drawn — a count of
        people who are not actually following would be a lie. Search is real:
        it filters the loaded threads.
      */}
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

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {state.kind === "loading" ? (
          <div className="flex items-center gap-2 px-2 text-[12px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            Loading comments
          </div>
        ) : null}

        {state.kind === "error" ? (
          <p role="alert" className="px-2 text-[12px] text-destructive">
            {state.message}
          </p>
        ) : null}

        {state.kind === "ready" && roots.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            {/*
              Two overlapping speech bubbles, as in the source product's empty
              state: the front one white, the one behind it a step quieter.
            */}
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
            <p className="text-[13px] leading-[16.25px] text-foreground">
              Start a conversation
            </p>
            <p className="mt-1 max-w-[270px] text-[11px] leading-[16.5px] text-muted-foreground">
              Leave a note about {contactName} for the rest of the team.
            </p>
          </div>
        ) : null}

        {state.kind === "ready" && roots.length > 0 && shownRoots.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-muted-foreground">
            No comments match “{query.trim()}”.
          </p>
        ) : null}

        {state.kind === "ready" && shownRoots.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {shownRoots.map((comment) => (
              <li key={comment.id}>{renderRow(comment, false)}</li>
            ))}
          </ul>
        ) : null}
      </div>

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
    </section>
  )
}
