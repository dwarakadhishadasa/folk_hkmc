/**
 * Client-safe contract for the cross-surface contact record.
 *
 * This module imports only client-safe shapes, so a `"use client"` component
 * can hold the whole contract without reaching `@/lib/supabase/*` or
 * `@/lib/authz` at runtime. The server's `ContactRecordPayload` is built from
 * the same shapes in `lib/contacts/record.ts`; one type, one payload.
 */

import type {
  ContactFieldId,
  ContactFieldResolvers,
} from "@/components/manage/manage-contact-fields"
import type {
  ManageContact,
  ManageContactHistory,
  ManageContactWriteResult,
  ManageLocation,
} from "@/components/manage/manage-types"
import type {
  ManageContactComment,
  ManageContactCommentList,
} from "@/components/manage/manage-comment-types"

/**
 * The two capabilities the server derives.
 *
 * `canEdit` is true for every record the gateway produces — the full record is
 * not available outside the manage boundary. `canComment` is the patch
 * predicate: an Admin may edit a programme contact outside their patch but may
 * not comment on it, and the loader does not even read the comments in that
 * case.
 */
export interface ContactRecordCapabilities {
  canEdit: boolean
  canComment: boolean
}

/** Everything one record needs, delivered by the one gateway. */
export interface ContactRecordPayload {
  contact: ManageContact
  /** The programme's location lexicon, for naming a current value. */
  locations: ManageLocation[]
  /** The locations the picker may offer — the patch owner's own set. */
  locationOptions: ManageLocation[]
  /** Staff ids the record references, narrowed server-side. */
  staffNames: Record<string, string>
  sourceOptions: string[]
  booksReadOptions: string[]
  history: ManageContactHistory
  /** Always `null`: the frame fetches the comment list after the fields render. */
  comments: ManageContactCommentList | null
  capabilities: ContactRecordCapabilities
}

/** A lazily-loaded piece of a record, so a host can show its own loading state. */
export type ContactRecordLoad<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T }

/**
 * The one view state the shared body renders.
 *
 * A host builds this from the gateway's payload; the body never fetches and
 * never derives a capability. The resolvers are built here from the payload's
 * naming sets, so both frames resolve a location and a staff id identically.
 */
export interface ContactRecordViewState {
  contact: ManageContact
  locations: readonly ManageLocation[]
  locationOptions: readonly ManageLocation[]
  resolvers: ContactFieldResolvers
  sourceOptions: readonly string[]
  booksReadOptions: readonly string[]
  history: ContactRecordLoad<ManageContactHistory>
  comments: ContactRecordLoad<ManageContactCommentList> | null
  capabilities: ContactRecordCapabilities
}

/** The whole-record state: a ready view, or the frame's own loading/error. */
export type ContactRecordState =
  | ContactRecordViewState
  | { status: "loading" }
  | { status: "error"; message: string }

export function isContactRecordReady(state: ContactRecordState): state is ContactRecordViewState {
  return !("status" in state)
}

/**
 * The comment mutation channel.
 *
 * The pane is presentational, so every write is a callback supplied by the
 * hook that owns the record's view state. Each returns the row the server
 * wrote, so the hook can patch its state without a second read.
 */
export interface CommentActions {
  create(body: string, rootCommentId?: string | null): Promise<ManageContactComment>
  update(commentId: string, body: string): Promise<ManageContactComment>
  remove(commentId: string): Promise<void>
  react(commentId: string, emoji: string, active: boolean): Promise<void>
}

export interface OpenContactRecordInput {
  contactId: string
  /**
   * The source list's visible, in-scope ids in display order. Absent or
   * singleton disables both chevrons; the provider never invents a global
   * order.
   */
  sequence?: readonly string[]
  /** The control that opened the record, for focus restoration. */
  trigger?: HTMLElement | null
}

export interface UseContactRecordResult {
  state: ContactRecordState | null
  commit: (fieldId: ContactFieldId, value: unknown) => Promise<ManageContactWriteResult | null>
  applyWrite: (result: ManageContactWriteResult) => void
  comments: CommentActions | null
  close: () => void
  previous: () => void
  next: () => void
  canGoPrevious: boolean
  canGoNext: boolean
  /** Open (or switch to) a record. One fetch per open; the previous is aborted. */
  open: (input: OpenContactRecordInput) => void
  /** Re-anchor the open record's sequence after the source list is filtered. */
  updateSequence: (sequence: readonly string[]) => void
  /** The control that opened the current record, for focus restoration. */
  trigger: HTMLElement | null
  isOpen: boolean
}
