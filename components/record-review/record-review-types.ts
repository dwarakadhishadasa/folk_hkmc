/**
 * Shared, entity-agnostic shapes for the record-review primitive.
 *
 * Type-only: no runtime imports and no `"use client"`. Everything under
 * `components/record-review/` is a client component set, and
 * `scripts/verify-monorepo-guardrails.mjs:542-596` walks the whole transitive
 * runtime import graph of every client root, so this module deliberately
 * contributes zero edges.
 *
 * Nothing here knows about contacts, sessions, attendance or any other
 * `/manage` entity. A record-review primitive is consumed by more than one
 * surface; the moment a shape here becomes contacts-shaped it stops being a
 * primitive.
 */

import type { ReactNode } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import type { GridFieldType } from "@/components/grid/grid-types"

/**
 * The minimum a record must carry: a stable id.
 *
 * The id is the *only* thing the primitive needs to know about a record. It
 * addresses the record in the roster, it is the selected id the consumer hands
 * back, and it is what a shared link carries. Everything else — the name, the
 * phone, the counts — reaches the primitive through the consumer's render
 * functions, so a second surface can show a different set of facts about the
 * same record shape.
 */
export type RecordReviewItem = {
  id: string
}

/**
 * A column the roster can sort and filter on.
 *
 * The `column` is a TanStack column def because the roster is a real table
 * model underneath the cards: sorting and filtering run through TanStack's
 * `getSortedRowModel` and `getFilteredRowModel` rather than through a
 * hand-rolled comparator, which is the same rule the `/manage` grid follows.
 * A card list that sorted itself would be the same defect the grid exists to
 * prevent, wearing a different hat.
 *
 * `fieldType` decides the filter operator set, exactly as it does in the grid,
 * and `label` is what the sort and filter affordances name.
 */
export interface RecordReviewFieldDef<TItem extends RecordReviewItem> {
  /** Stable id. The sort control, the filter conditions and the URL name a field by this. */
  id: string
  /** Human label for the sort and filter affordances. */
  label: string
  /** What the field holds. Decides the filter operator set. */
  fieldType: GridFieldType
  /** The TanStack column def: the accessor the sort and the filter read. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: ColumnDef<TItem, any>
}

/** What the consumer's card renderer needs to know about the card it is drawing. */
export interface RecordReviewCardState {
  /** True when this card is the focused record. */
  selected: boolean
}

/**
 * The card body.
 *
 * The primitive owns the card's *frame* — its position in the list, its
 * selection state, its focus ring and its click target — and the consumer owns
 * the content. A surface that wants a different card shape renders a different
 * body here without forking the list.
 */
export type RecordReviewRenderCard<TItem extends RecordReviewItem> = (
  item: TItem,
  state: RecordReviewCardState,
) => ReactNode

/**
 * The detail body for the focused record, or `null` when nothing is focused.
 *
 * `null` is passed rather than an empty node so the consumer can tell "no
 * record is focused" from "the focused record has no detail".
 */
export type RecordReviewRenderDetail<TItem extends RecordReviewItem> = (item: TItem | null) => ReactNode
