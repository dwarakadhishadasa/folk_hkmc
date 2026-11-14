"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  CONTACT_FIELD_LABEL,
  CONTACT_FIELD_PATCH_KEY,
  type ContactFieldId,
} from "@/components/manage/manage-contact-fields"
import type {
  ManageContactComment,
  ManageContactCommentList,
} from "@/components/manage/manage-comment-types"
import type { ManageContactWriteResult } from "@/components/manage/manage-types"
import {
  isContactRecordReady,
  type CommentActions,
  type ContactRecordLoad,
  type ContactRecordPayload,
  type ContactRecordState,
  type ContactRecordViewState,
  type OpenContactRecordInput,
  type UseContactRecordResult,
} from "@/components/contacts/contact-record-types"
import { resolveRecordAnchor, resolveRecordStep } from "@/components/contacts/contact-record-sequence"

const RECORD_ENDPOINT = "/api/manage/contacts"
const COMMENT_ENDPOINT = "/api/manage/contacts/comments"
const REACTION_ENDPOINT = "/api/manage/contacts/comment-reactions"

interface PendingComments {
  contactId: string
  requestId: number
  load: ContactRecordLoad<ManageContactCommentList>
}

interface OpenState {
  contactId: string
  sequence: readonly string[]
  trigger: HTMLElement | null
  /** The clamped position used when the current id leaves the visible sequence. */
  anchor: number | null
}

function readError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value) {
      return value
    }
  }

  return fallback
}

function buildViewState(payload: ContactRecordPayload): ContactRecordViewState {
  return {
    contact: payload.contact,
    locations: payload.locations,
    locationOptions: payload.locationOptions,
    resolvers: {
      locationNameById: new Map(payload.locations.map((location) => [location.id, location.name])),
      staffNameById: new Map(Object.entries(payload.staffNames)),
    },
    sourceOptions: payload.sourceOptions,
    booksReadOptions: payload.booksReadOptions,
    history: { status: "ready", value: payload.history },
    comments: payload.capabilities.canComment ? { status: "loading" } : null,
    capabilities: payload.capabilities,
  }
}

function withCommentsLoad(
  state: ContactRecordState | null,
  contactId: string,
  load: ContactRecordLoad<ManageContactCommentList>,
): ContactRecordState | null {
  if (!state || !isContactRecordReady(state) || state.contact.id !== contactId) {
    return state
  }

  return { ...state, comments: load }
}

/** A record's comments as an editable list, or `null` when the read was skipped. */
function commentListOf(state: ContactRecordState | null): ManageContactCommentList | null {
  if (!state || !isContactRecordReady(state)) {
    return null
  }

  return state.comments?.status === "ready" ? state.comments.value : null
}

function withComments(
  state: ContactRecordState | null,
  contactId: string,
  update: (list: ManageContactCommentList) => ManageContactCommentList,
): ContactRecordState | null {
  if (
    !state ||
    !isContactRecordReady(state) ||
    state.contact.id !== contactId ||
    state.comments?.status !== "ready"
  ) {
    return state
  }

  return {
    ...state,
    comments: { status: "ready", value: update(state.comments.value) },
  }
}

/**
 * The one record hook both hosts use.
 *
 * It owns the open state, the single fetch per open, the abort on close or
 * switch, the view state the shared body renders, and the one write channel.
 * The provider uses it for its overlay; the Contacts grid's desktop and phone
 * hosts use their own instance. Nothing here prefetches or reads a global
 * contact set.
 */
export function useContactRecord(options: {
  /**
   * Called whenever the open record's comment count changes, so a grid host can
   * keep its mirror's gutter badge true without a second read.
   */
  onCommentsChange?: (contactId: string, count: number) => void
} = {}): UseContactRecordResult {
  const { onCommentsChange } = options
  const [state, setState] = useState<ContactRecordState | null>(null)
  const [openState, setOpenState] = useState<OpenState | null>(null)

  const openStateRef = useRef<OpenState | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const requestRef = useRef(0)
  /**
   * A comment read that finished before its record did.
   *
   * The comment request and the record request start together, so either can
   * land first. The hook's state only exists once the record is ready, so a
   * comment result is parked here and merged the moment the record arrives.
   */
  const pendingCommentsRef = useRef<PendingComments | null>(null)

  // The hook can unmount while a read is in flight; abort it rather than let a
  // response land on a component that no longer exists.
  useEffect(() => {
    return () => {
      requestRef.current += 1
      controllerRef.current?.abort()
    }
  }, [])

  const loadComments = useCallback(
    async (contactId: string, requestId: number, controller: AbortController) => {
      try {
        const response = await fetch(
          `${COMMENT_ENDPOINT}?contactId=${encodeURIComponent(contactId)}`,
          {
            cache: "no-store",
            headers: { accept: "application/json" },
            signal: controller.signal,
          },
        )

        const body: unknown = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(readError(body, "Unable to load this contact's comments."))
        }

        if (requestId !== requestRef.current) {
          return
        }

        const load: ContactRecordLoad<ManageContactCommentList> = {
          status: "ready",
          value: body as ManageContactCommentList,
        }

        pendingCommentsRef.current = { contactId, requestId, load }
        setState((current) => withCommentsLoad(current, contactId, load))
      } catch (error) {
        if (controller.signal.aborted || requestId !== requestRef.current) {
          return
        }

        const load: ContactRecordLoad<ManageContactCommentList> = {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load this contact's comments.",
        }

        pendingCommentsRef.current = { contactId, requestId, load }
        setState((current) => withCommentsLoad(current, contactId, load))
      }
    },
    [],
  )

  const loadRecord = useCallback(
    async (contactId: string, mode: "show-loading" | "silent"): Promise<ContactRecordViewState | null> => {
      requestRef.current += 1
      const requestId = requestRef.current

      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      if (mode === "show-loading") {
        setState({ status: "loading" })
      }

      // The comment read does not depend on this payload: its endpoint runs its
      // own scope check and the pane decides whether to show the result. Start
      // both together instead of chaining comments behind the record, and park
      // an early comment result until there is a record state to attach it to.
      pendingCommentsRef.current = null
      const commentsRead = loadComments(contactId, requestId, controller)

      try {
        const response = await fetch(
          `${RECORD_ENDPOINT}/${encodeURIComponent(contactId)}/record`,
          {
            cache: "no-store",
            headers: { accept: "application/json" },
            signal: controller.signal,
          },
        )

        const body: unknown = await response.json().catch(() => null)

        if (!response.ok) {
          if (response.status === 403) {
            throw new Error("This record is outside your contact scope.")
          }

          throw new Error(readError(body, "Unable to load this contact's record."))
        }

        if (requestId !== requestRef.current) {
          return null
        }

        const view = buildViewState(body as ContactRecordPayload)
        setState(view)

        if (view.comments?.status === "loading") {
          const pending = pendingCommentsRef.current as PendingComments | null

          if (
            pending &&
            pending.contactId === contactId &&
            pending.requestId === requestId
          ) {
            setState((current) => withCommentsLoad(current, contactId, pending.load))
          }
        }

        // A record the caller cannot comment on drops the speculative read;
        // the pane renders its fixed "outside your patch" copy instead.
        pendingCommentsRef.current = null
        void commentsRead

        return view
      } catch (error) {
        if (controller.signal.aborted || requestId !== requestRef.current) {
          return null
        }

        // A silent re-read after a rejected write must not replace a readable
        // record with an error screen: the write's own message is the one the
        // operator needs, and the host reports it.
        if (mode === "silent") {
          return null
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load this contact's record.",
        })
        return null
      }
    },
    [loadComments],
  )

  const open = useCallback(
    (input: OpenContactRecordInput) => {
      const next: OpenState = {
        contactId: input.contactId,
        sequence: input.sequence ?? [],
        trigger: input.trigger ?? null,
        anchor: null,
      }

      openStateRef.current = next
      setOpenState(next)
      void loadRecord(input.contactId, "show-loading")
    },
    [loadRecord],
  )

  const close = useCallback(() => {
    requestRef.current += 1
    controllerRef.current?.abort()
    controllerRef.current = null
    pendingCommentsRef.current = null
    openStateRef.current = null
    setOpenState(null)
    setState(null)
  }, [])

  const updateSequence = useCallback((sequence: readonly string[]) => {
    const current = openStateRef.current

    if (!current) {
      return
    }

    const anchor = resolveRecordAnchor({
      contactId: current.contactId,
      previousSequence: current.sequence,
      nextSequence: sequence,
      currentAnchor: current.anchor,
    })

    const next = { ...current, sequence, anchor }
    openStateRef.current = next
    setOpenState(next)
  }, [])

  const stepTo = useCallback(
    (contactId: string) => {
      const current = openStateRef.current

      if (!current) {
        return
      }

      const next = { ...current, contactId, anchor: null }
      openStateRef.current = next
      setOpenState(next)
      void loadRecord(contactId, "show-loading")
    },
    [loadRecord],
  )

  const currentIndex = openState ? openState.sequence.indexOf(openState.contactId) : -1
  const anchor = currentIndex >= 0 ? currentIndex : (openState?.anchor ?? -1)
  const previousTarget = openState
    ? resolveRecordStep({
        contactId: openState.contactId,
        sequence: openState.sequence,
        anchor,
        direction: "previous",
      })
    : null
  const nextTarget = openState
    ? resolveRecordStep({
        contactId: openState.contactId,
        sequence: openState.sequence,
        anchor,
        direction: "next",
      })
    : null
  const canGoPrevious = previousTarget !== null
  const canGoNext = nextTarget !== null

  const previous = useCallback(() => {
    if (previousTarget) {
      stepTo(previousTarget)
    }
  }, [previousTarget, stepTo])

  const next = useCallback(() => {
    if (nextTarget) {
      stepTo(nextTarget)
    }
  }, [nextTarget, stepTo])

  const applyWrite = useCallback((written: ManageContactWriteResult) => {
    setState((current) => {
      if (!current || !isContactRecordReady(current) || current.contact.id !== written.id) {
        return current
      }

      // Spread, never enumerate: the write result omits the photo path, the
      // last-contacted date and the rollups, and a merge that rebuilt the row
      // from the result's keys would blank them.
      return { ...current, contact: { ...current.contact, ...written } }
    })
  }, [])

  const commit = useCallback(
    async (fieldId: ContactFieldId, value: unknown): Promise<ManageContactWriteResult | null> => {
      if (!state || !isContactRecordReady(state)) {
        return null
      }

      const contact = state.contact
      const patchKey = CONTACT_FIELD_PATCH_KEY[fieldId]

      if (!patchKey) {
        throw new Error(`${CONTACT_FIELD_LABEL[fieldId]} cannot be edited here.`)
      }

      let response: Response

      try {
        response = await fetch(RECORD_ENDPOINT, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId: contact.id, [patchKey]: value }),
        })
      } catch (cause) {
        throw new Error("Unable to reach the server.", { cause })
      }

      const body: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        const message = readError(body, "The change could not be saved.")
        // Re-read before reporting: a rejected write must leave the hook on the
        // server's row, not on the optimistic value the operator typed. Only do
        // it if the operator is still on this contact — a silent re-read must
        // never hijack the record they stepped to while the write was in flight.
        if (openStateRef.current?.contactId === contact.id) {
          await loadRecord(contact.id, "silent")
        }
        throw new Error(message)
      }

      const written = (body as { contact?: ManageContactWriteResult } | null)?.contact

      if (!written || typeof written !== "object") {
        throw new Error("The server did not return the saved row.")
      }

      applyWrite(written)
      return written
    },
    [applyWrite, loadRecord, state],
  )

  /**
   * The comments channel.
   *
   * Every mutation goes through the existing comment endpoints and patches the
   * one view state; the presentational pane never fetches. `react` is optimistic
   * in both directions and restores the previous list on failure, which is the
   * same behaviour the pane had when it owned the list.
   */
  const comments = useMemo<CommentActions | null>(() => {
    if (!state || !isContactRecordReady(state) || !state.capabilities.canComment) {
      return null
    }

    const contactId = state.contact.id

    const patchComment = (commentId: string, next: ManageContactComment) => {
      setState((current) =>
        withComments(current, contactId, (list) => ({
          ...list,
          comments: list.comments.map((comment) => (comment.id === commentId ? next : comment)),
        })),
      )
    }

    return {
      create: async (body, rootCommentId = null) => {
        const response = await fetch(COMMENT_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId, body, rootCommentId }),
        })

        const payload: unknown = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(readError(payload, "Unable to save the comment."))
        }

        const comment = (payload as { comment?: ManageContactComment } | null)?.comment

        if (!comment) {
          throw new Error("The server did not return the saved comment.")
        }

        setState((current) =>
          withComments(current, contactId, (list) => ({
            ...list,
            comments: [...list.comments, comment],
          })),
        )

        return comment
      },

      update: async (commentId, body) => {
        const response = await fetch(COMMENT_ENDPOINT, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId, commentId, body }),
        })

        const payload: unknown = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(readError(payload, "Unable to save the comment."))
        }

        const comment = (payload as { comment?: ManageContactComment } | null)?.comment

        if (!comment) {
          throw new Error("The server did not return the saved comment.")
        }

        patchComment(commentId, comment)
        return comment
      },

      remove: async (commentId) => {
        const response = await fetch(COMMENT_ENDPOINT, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId, commentId }),
        })

        if (!response.ok && response.status !== 204) {
          const payload: unknown = await response.json().catch(() => null)
          throw new Error(readError(payload, "Unable to delete the comment."))
        }

        // The server cascades a thread's replies when its root is deleted, so
        // the local list drops them with it rather than waiting for a re-read.
        setState((current) =>
          withComments(current, contactId, (list) => ({
            ...list,
            comments: list.comments.filter(
              (comment) => comment.id !== commentId && comment.rootCommentId !== commentId,
            ),
          })),
        )
      },

      react: async (commentId, emoji, active) => {
        const list = commentListOf(state)
        const comment = list?.comments.find((entry) => entry.id === commentId)

        if (!comment) {
          return
        }

        const previous = comment.reactions
        const next = active
          ? previous.some((reaction) => reaction.emoji === emoji)
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

        patchComment(commentId, { ...comment, reactions: next })

        try {
          const response = await fetch(REACTION_ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contactId, commentId, emoji, active }),
          })

          if (!response.ok && response.status !== 204) {
            const payload: unknown = await response.json().catch(() => null)
            throw new Error(readError(payload, "Unable to save the reaction."))
          }
        } catch (error) {
          patchComment(commentId, { ...comment, reactions: previous })
          throw error
        }
      },
    }
  }, [state])

  /**
   * Keep the host's mirror in step with the record's comments.
   *
   * The ready list's length is the count (replies included); when the read was
   * skipped, the server's own `commentCount` is still the truth. The host uses
   * this for the grid gutter badge, so a comment written in the record cannot
   * leave a stale count behind it.
   */
  useEffect(() => {
    if (!onCommentsChange || !state || !isContactRecordReady(state)) {
      return
    }

    const count =
      state.comments?.status === "ready"
        ? state.comments.value.comments.length
        : state.contact.commentCount

    onCommentsChange(state.contact.id, count)
  }, [onCommentsChange, state])

  return {
    state,
    commit,
    applyWrite,
    comments,
    close,
    previous,
    next,
    canGoPrevious,
    canGoNext,
    open,
    updateSequence,
    trigger: openState?.trigger ?? null,
    isOpen: openState !== null,
  }
}
