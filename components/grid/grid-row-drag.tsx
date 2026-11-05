"use client"

import { createContext, useContext } from "react"
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core"

/**
 * Row dragging for `Grid`, on `@dnd-kit/sortable` — the same behaviour as the
 * TanStack row-dnd example: the row itself translates, neighbours slide by one
 * row height on a 200ms transition, and the dragged row is held at
 * `opacity: 0.8` above its neighbours. No drag overlay; nothing floats.
 *
 * The split is deliberate. `GridRow` owns `useSortable` because the row is both
 * the draggable node and the droppable slot, and both have to be the same DOM
 * element for the strategy's rects to line up. The **handle** is still the
 * consumer's, so the row exposes its activator props through this context and
 * the consumer only decides where the grip lives.
 *
 * Ids are namespaced because rows and columns share one `DndContext`.
 */
export const GRID_ROW_DRAG_PREFIX = "grid-row:"

export interface GridRowDragHandle {
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
}

export const GridRowDragContext = createContext<GridRowDragHandle | null>(null)

/** The grip side. Returns `null` when the grid was not given `onRowReorder`. */
export function useGridRowDragHandle(): GridRowDragHandle | null {
  return useContext(GridRowDragContext)
}
