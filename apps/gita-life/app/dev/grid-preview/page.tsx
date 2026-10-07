import { notFound } from "next/navigation"

import { GridPreview } from "@/components/grid/grid-preview"
import type { GridPreviewRow } from "@/components/grid/grid-preview"

/**
 * `useSearchParams` in the mounted client component triggers a prerender bailout,
 * so this route must stay dynamic exactly like `/manage`.
 */
export const dynamic = "force-dynamic"

/**
 * Past the CAP-1 threshold on purpose: enough rows that a bounded `<tr>` count
 * is obvious while scrolling the whole set.
 *
 * Declared here rather than imported from the client module: every runtime
 * export of a `"use client"` file becomes a client reference when a server
 * component imports it, so `500` would arrive as an opaque object and
 * `buildPreviewRows` would quietly produce nothing.
 */
const PREVIEW_ROW_COUNT = 500

const REGIONS = ["north", "south", "east", "west", "central"]
const STATUSES = ["active", "paused", "archived"]
const OWNER_INITIALS = "ABCDEFGHIJKLMNOPRSTVW"
const NOTE_FRAGMENTS = [
  "Reviewed during the weekly sweep.",
  "Awaiting confirmation from the regional desk.",
  "Escalated once; no response recorded.",
  "Routine check, nothing outstanding.",
  "Flagged for a second pass before quarter close, pending sign-off from the regional desk.",
]

/**
 * Deterministic so a reload shows the same set and the review is reproducible.
 * Uses no clock and no randomness: a diff between two loads should be empty.
 */
function buildPreviewRows(count: number): GridPreviewRow[] {
  const rows: GridPreviewRow[] = []

  for (let index = 1; index <= count; index += 1) {
    const first = OWNER_INITIALS[index % OWNER_INITIALS.length]
    const second = OWNER_INITIALS[(index * 7) % OWNER_INITIALS.length]

    rows.push({
      id: `row-${index}`,
      ref: `REF-${String(index).padStart(4, "0")}`,
      owner: `${first}. ${second}ane`,
      region: REGIONS[index % REGIONS.length],
      status: STATUSES[index % STATUSES.length],
      volume: (index * 37) % 980,
      score: Math.round(((index * 53) % 1000) / 10),
      updatedAt: `2026-0${(index % 9) + 1}-${String((index % 27) + 1).padStart(2, "0")}`,
      notes: NOTE_FRAGMENTS[index % NOTE_FRAGMENTS.length],
    })
  }

  return rows
}

export default function GridPreviewPage() {
  // An unreviewed surface must not ship. `MANAGE_GRID_PREVIEW=1` is the
  // deliberate opt-in for reviewing it on a preview deployment.
  if (process.env.NODE_ENV === "production" && process.env.MANAGE_GRID_PREVIEW !== "1") {
    notFound()
  }

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Grid preview</h1>
        <p className="text-muted-foreground text-sm">
          Review harness for the shared grid primitives. {PREVIEW_ROW_COUNT} synthetic rows, no
          data access. Sort, filter, move, hide and resize columns: each one writes to the URL and
          survives a reload. Press <kbd className="font-mono">j</kbd> /{" "}
          <kbd className="font-mono">k</kbd> to move, <kbd className="font-mono">e</kbd> to edit,{" "}
          <kbd className="font-mono">Enter</kbd> to commit and{" "}
          <kbd className="font-mono">Escape</kbd> to cancel.
        </p>
      </header>

      <GridPreview rows={buildPreviewRows(PREVIEW_ROW_COUNT)} />
    </main>
  )
}
