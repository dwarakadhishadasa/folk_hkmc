"use client"

import { useMemo, useState } from "react"
import { createColumnHelper } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Grid } from "@/components/grid/grid"
import type { GridDensity, GridPanelState } from "@/components/grid/grid-types"
import { useGridViewState } from "@/components/grid/use-grid-view-state"

/** Synthetic and generic: no `Manage*` type, no contacts shape. */
export interface GridPreviewRow {
  id: string
  ref: string
  owner: string
  region: string
  status: string
  volume: number
  score: number
  updatedAt: string
  notes: string
}

const columnHelper = createColumnHelper<GridPreviewRow>()

/**
 * `id` is declared on every def so the preview's URL state and the grid's own
 * column ids cannot drift apart; the grid resolves an id the same way TanStack
 * would, but pinning them here keeps the harness readable.
 */
const PREVIEW_COLUMNS = [
  columnHelper.accessor("ref", {
    id: "ref",
    header: "Reference",
    size: 140,
    // The frozen first column: this is what preserves row identity while
    // scrolling right, so it is deliberately not editable.
    meta: { grid: { align: "left" as const } },
  }),
  columnHelper.accessor("owner", {
    id: "owner",
    header: "Owner",
    size: 200,
    meta: { grid: { editable: true, filter: "text" as const } },
  }),
  columnHelper.accessor("region", {
    id: "region",
    header: "Region",
    size: 130,
    meta: { grid: { filter: "text" as const } },
  }),
  columnHelper.accessor("status", {
    id: "status",
    header: "Status",
    size: 120,
    meta: { grid: { filter: "text" as const } },
  }),
  columnHelper.accessor("volume", {
    id: "volume",
    header: "Volume",
    size: 120,
    meta: { grid: { filter: "number" as const, align: "right" as const, tabular: true } },
  }),
  columnHelper.accessor("score", {
    id: "score",
    header: "Score",
    size: 110,
    meta: { grid: { align: "right" as const, tabular: true } },
  }),
  columnHelper.accessor("updatedAt", {
    id: "updatedAt",
    header: "Updated",
    size: 130,
  }),
  columnHelper.accessor("notes", {
    id: "notes",
    header: "Notes",
    size: 260,
    // Editable and long: this is the column that shows the fixed row height
    // contract truncating on one line rather than wrapping.
    meta: { grid: { editable: true } },
  }),
]

const PREVIEW_COLUMN_IDS = PREVIEW_COLUMNS.map(
  (definition) => definition.id,
).filter((id): id is string => typeof id === "string")

/** Writes aimed at this reference reject, so the visible revert is observable. */
const GRID_PREVIEW_FAILING_REF = "REF-0250"

type PreviewPanelKey = "ready" | "loading" | "error" | "empty" | "filtered-empty"

const PANEL_OPTIONS: Array<{ key: PreviewPanelKey; label: string }> = [
  { key: "ready", label: "Ready (derived)" },
  { key: "loading", label: "Loading" },
  { key: "error", label: "Error" },
  { key: "empty", label: "No records" },
  { key: "filtered-empty", label: "Filtered empty" },
]

/**
 * CAP-9 review harness. Not a shipped surface: the route that mounts it 404s in
 * production unless `MANAGE_GRID_PREVIEW=1`.
 *
 * It forces each panel variant so loading, both empty flavours and the error
 * state are reachable on demand, and supplies a real in-memory commit so the
 * edit / commit / revert path runs end to end. The rows arrive as props, which is
 * also the proof of the props-in / no-Supabase boundary.
 */
export function GridPreview({ rows }: { rows: GridPreviewRow[] }) {
  // Local row state, not grid state: it is what an in-memory commit mutates, and
  // it is seeded from the server-generated rows so nothing is fetched here.
  const [data, setData] = useState(rows)
  const [density, setDensity] = useState<GridDensity>("default")
  const [panelKey, setPanelKey] = useState<PreviewPanelKey>("ready")
  const [retryCount, setRetryCount] = useState(0)

  const {
    state,
    onStateChange,
    clearFilters,
    beginTransientChange,
    commitTransientChange,
    cancelTransientChange,
  } = useGridViewState({ columnIds: PREVIEW_COLUMN_IDS })

  const forcedPanel = useMemo<GridPanelState | undefined>(() => {
    switch (panelKey) {
      case "ready":
        // "Ready" is the absence of a panel, so the grid derives it from the row
        // set exactly as a real table does. Forcing it would hide the derived
        // path, which is the one every `/manage` table will actually take.
        return undefined
      case "loading":
        return { kind: "loading" }
      case "error":
        return {
          kind: "error",
          message: `The rows service returned 503 on attempt ${retryCount}.`,
          onRetry: () => {
            setRetryCount((count) => count + 1)
            setPanelKey("ready")
          },
        }
      case "empty":
        return { kind: "empty", reason: "no-records" }
      case "filtered-empty":
        return { kind: "empty", reason: "no-matches" }
    }
  }, [panelKey, retryCount])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Force panel state"
          className="flex items-center gap-1 rounded-md border border-border p-0.5"
        >
          {PANEL_OPTIONS.map((option) => (
            <Button
              key={option.key}
              type="button"
              size="sm"
              variant={panelKey === option.key ? "secondary" : "ghost"}
              aria-pressed={panelKey === option.key}
              onClick={() => {
                setPanelKey(option.key)
              }}
              className="h-7 px-2 text-[13px]"
            >
              {option.label}
            </Button>
          ))}
        </div>

        <p className="text-muted-foreground text-[13px]">
          Edits to <span className="font-mono">{GRID_PREVIEW_FAILING_REF}</span> reject, so the
          visible revert is observable without a server.
        </p>
      </div>

      <Grid<GridPreviewRow>
        rows={data}
        columns={PREVIEW_COLUMNS}
        getRowId={(row) => row.id}
        state={state}
        onStateChange={onStateChange}
        ariaLabel="Grid preview rows"
        density={density}
        onDensityChange={setDensity}
        transient={{
          begin: beginTransientChange,
          commit: commitTransientChange,
          cancel: cancelTransientChange,
        }}
        onClearFilters={clearFilters}
        panel={forcedPanel}
        onCellCommit={(commit) => {
          if (commit.value === commit.previousValue) {
            return
          }

          if (data.find((row) => row.id === commit.rowId)?.ref === GRID_PREVIEW_FAILING_REF) {
            return Promise.reject(
              new Error(`Refusing to save ${GRID_PREVIEW_FAILING_REF}: this row is locked in the harness.`),
            )
          }

          setData((current) =>
            current.map((row) =>
              row.id === commit.rowId
                ? ({ ...row, [commit.columnId]: commit.value } as GridPreviewRow)
                : row,
            ),
          )
        }}
      />
    </div>
  )
}
