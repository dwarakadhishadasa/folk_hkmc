"use client"

import { Maximize2, MessageSquareText } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The leading-gutter expand affordance shared by both grids.
 *
 * The source product revealed a 24×24 expand icon at a row's left edge on
 * hover; the Contacts grid added a permanent comment count beside it. This is
 * that control, generic: a real button labelled with the person's name, marked
 * with `data-grid-row-expand` for tests, stopping pointer and click propagation
 * so it never becomes a cell focus change or a row selection, and keeping the
 * grid's `tabIndex={-1}` modality.
 *
 * The keyboard route to the same record is the row context menu's "Expand
 * record" (Shift+F10 or the Menu key). Making in-cell controls Tab-reachable
 * would require fixing the grid's pre-existing Tab trap and is deliberately
 * out of scope.
 */
export interface GridRowExpandControlProps {
  /** The accessible label, e.g. `Expand Asha Raman`. */
  label: string
  onExpand: (trigger: HTMLElement | null) => void
  /**
   * The record's comment count, when the grid has one. A positive count renders
   * permanently visible with a speech-bubble glyph; zero renders the hover-only
   * expand arrow.
   */
  count?: number
  className?: string
}

export function GridRowExpandControl({
  label,
  onExpand,
  count,
  className,
}: GridRowExpandControlProps) {
  const hasCount = typeof count === "number" && count > 0
  const accessibleLabel = hasCount
    ? `${label} to see ${count} ${count === 1 ? "comment" : "comments"}`
    : label

  return (
    <button
      type="button"
      tabIndex={-1}
      data-grid-row-expand=""
      aria-label={accessibleLabel}
      title={accessibleLabel}
      onPointerDown={(event) => {
        // The cell's own pointerdown moves cell focus; the expand control is an
        // action, not a cell selection.
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
        event.preventDefault()
        onExpand(event.currentTarget)
      }}
      className={cn(
        "flex h-6 shrink-0 items-center justify-center rounded text-muted-foreground",
        hasCount
          ? "gap-1 px-1 text-[11px] leading-none hover:bg-muted hover:text-[var(--program-text)]"
          : "w-6 opacity-0 transition-opacity [tr:hover_&]:opacity-100",
        "hover:bg-muted hover:text-[var(--program-text)]",
        "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {hasCount ? (
        <>
          <span className="tabular-nums">{count}</span>
          <MessageSquareText aria-hidden="true" className="size-4" />
        </>
      ) : (
        <Maximize2 aria-hidden="true" className="size-3.5" strokeWidth={2} />
      )}
    </button>
  )
}
