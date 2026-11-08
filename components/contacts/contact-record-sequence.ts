/**
 * Where an open record sits in its source list after that list changes.
 *
 * The record's chevrons step through the ids the source list was rendering when
 * the record opened. A filter, a search or a live row-set change can remove the
 * contact currently on screen; the nearest surviving index is the row that took
 * its place, so Previous/Next continue from there instead of jumping to an
 * unrelated end of the list. When nothing survives, both chevrons disable.
 *
 * Pure and exported so the clamp can be tested without mounting the hook.
 */
export function resolveRecordAnchor(params: {
  contactId: string
  previousSequence: readonly string[]
  nextSequence: readonly string[]
  /** The anchor already in force when the contact was absent on an earlier change. */
  currentAnchor?: number | null
}): number | null {
  const { contactId, previousSequence, nextSequence, currentAnchor = null } = params

  // Still visible: the current index is the anchor, so no fallback is needed.
  if (nextSequence.includes(contactId)) {
    return null
  }

  const previousIndex = previousSequence.indexOf(contactId)

  // The contact left an earlier change and the list still has survivors: keep
  // the position it was clamped to, so a second filter does not reset the
  // chevrons to the start of the list.
  if (previousIndex < 0) {
    return currentAnchor === null || nextSequence.length === 0
      ? null
      : Math.min(currentAnchor, nextSequence.length - 1)
  }

  // Never was in the list, or the list emptied: there is no nearest survivor.
  if (nextSequence.length === 0) {
    return null
  }

  // Clamp to the last survivor when the removed row was at the tail.
  return Math.min(previousIndex, nextSequence.length - 1)
}

/**
 * The id one chevron step lands on.
 *
 * When the contact is still visible, Previous/Next are the rows either side of
 * it. When it has left the list, `anchor` is the row that took its place:
 * Previous is the row before that position and Next is that row itself.
 */
export function resolveRecordStep(params: {
  contactId: string
  sequence: readonly string[]
  anchor: number
  direction: "previous" | "next"
}): string | null {
  const { contactId, sequence, anchor, direction } = params

  if (anchor < 0) {
    return null
  }

  if (direction === "previous") {
    return anchor > 0 ? (sequence[anchor - 1] ?? null) : null
  }

  const targetIndex = sequence.indexOf(contactId) >= 0 ? anchor + 1 : anchor

  return targetIndex < sequence.length ? (sequence[targetIndex] ?? null) : null
}
