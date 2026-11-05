/**
 * The contacts surface's names for the shared saved-view shapes.
 *
 * The implementation lives in `components/grid/saved-view-types.ts`, because a
 * saved view is a grid fact rather than a contacts one. These aliases keep the
 * contacts call sites reading in their own vocabulary.
 */

import {
  SAVED_VIEW_TYPES,
  SAVED_VIEW_TYPE_LABELS,
  SAVED_VIEW_VISIBILITIES,
  SAVED_VIEW_VISIBILITY_HINTS,
  SAVED_VIEW_VISIBILITY_LABELS,
  canEditSavedView,
  isSavedViewType,
  isSavedViewVisibility,
  suggestSavedViewName,
  type SavedGridView,
  type SavedViewType,
  type SavedViewVisibility,
} from "@/components/grid/saved-view-types"

export const CONTACT_VIEW_TYPES = SAVED_VIEW_TYPES

export type ContactViewType = SavedViewType

export const CONTACT_VIEW_TYPE_LABELS = SAVED_VIEW_TYPE_LABELS

export function isContactViewType(value: unknown): value is ContactViewType {
  return isSavedViewType(value)
}

export type ContactViewVisibility = SavedViewVisibility

export const CONTACT_VIEW_VISIBILITIES = SAVED_VIEW_VISIBILITIES

export const CONTACT_VIEW_VISIBILITY_LABELS = SAVED_VIEW_VISIBILITY_LABELS

export const CONTACT_VIEW_VISIBILITY_HINTS = SAVED_VIEW_VISIBILITY_HINTS

export function isContactViewVisibility(value: unknown): value is ContactViewVisibility {
  return isSavedViewVisibility(value)
}

export type ManageContactView = SavedGridView

export const canEditContactView = canEditSavedView

export const suggestContactViewName = suggestSavedViewName
