"use client"

import { useMemo, useState } from "react"
import { createColumnHelper } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Grid, type GridColumnDef } from "@/components/grid/grid"
import { GRID_DEFAULT_DENSITY } from "@/components/grid/grid-row"
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
  /** The checkbox column the `Space` toggle and the `checkbox` editor act on. */
  flagged: boolean
  /** Currency, in minor units — what the `currency` editor parses to and stores. */
  amount: number
  quantity: number
  website: string
  emailAddress: string
  /** A `public.users`-shaped id; the `user` editor resolves it against `users`. */
  assignee: string | null
  /**
   * An id the `site` accessor resolves against `SITE_NAMES`.
   *
   * Never read directly: the column is an `accessorFn`, so what the grid holds is
   * the resolved label. `site-missing` resolves to nothing on purpose.
   */
  site: string
}

/** One person the `user` editor can pick. Supplied by the route, like the rows. */
export interface GridPreviewUser {
  id: string
  name: string
}

const columnHelper = createColumnHelper<GridPreviewRow>()

/**
 * `id` is declared on every def so the preview's URL state and the grid's own
 * column ids cannot drift apart; the grid resolves an id the same way TanStack
 * would, but pinning them here keeps the harness readable.
 *
 * A factory rather than a constant because the `user` editor's option list is
 * data: it comes from the route alongside the rows, the same way a real table's
 * staff list comes from its payload. Column *ids* do not depend on it, so
 * `PREVIEW_COLUMN_IDS` below is still a module-level constant.
 *
 * `flagged` stays last. `grid-keyboard.spec.ts` addresses it as the grid's last
 * cell for `End` and `Tab`, so a column added after it would silently move that.
 *
 * This harness is also where the *joined accessor* case is demonstrable. The
 * contacts table's `location` column cannot carry an unresolvable reference in a
 * test, because `bulk-fixtures.spec.ts:571` asserts every seeded contact's
 * location resolves to a real row — planting a dangling id there to prove a
 * display rule would break a live data invariant. `site` below is the same
 * shape, with the dangling case built in.
 */
function buildPreviewColumns(users: readonly GridPreviewUser[]): GridColumnDef<GridPreviewRow>[] {
  return [
    columnHelper.accessor("ref", {
      id: "ref",
      header: "Reference",
      size: 140,
      // The frozen first column: this is what preserves row identity while
      // scrolling right, so it is deliberately not editable.
      meta: { grid: { fieldType: "text", align: "left" as const } },
    }),
    columnHelper.accessor("owner", {
      id: "owner",
      header: "Owner",
      size: 200,
      meta: { grid: { editable: true, fieldType: "text", filter: "text" as const } },
    }),
    columnHelper.accessor("region", {
      id: "region",
      header: "Region",
      size: 130,
      meta: { grid: { fieldType: "text", filter: "text" as const } },
    }),
    columnHelper.accessor("status", {
      id: "status",
      header: "Status",
      size: 120,
      meta: { grid: { fieldType: "text", filter: "text" as const } },
    }),
    columnHelper.accessor("volume", {
      id: "volume",
      header: "Volume",
      size: 120,
      meta: {
          grid: {
            fieldType: "number",
            filter: "number" as const,
            align: "right" as const,
            tabular: true,
          },
        },
    }),
    columnHelper.accessor("score", {
      id: "score",
      header: "Score",
      size: 110,
      meta: { grid: { fieldType: "number", align: "right" as const, tabular: true } },
    }),
    columnHelper.accessor("updatedAt", {
      id: "updatedAt",
      header: "Updated",
      size: 130,
      meta: { grid: { fieldType: "date" } },
    }),
    columnHelper.accessor("notes", {
      id: "notes",
      header: "Notes",
      size: 260,
      // Editable and long: this is the column that shows the fixed row height
      // contract truncating on one line rather than wrapping.
      meta: { grid: { editable: true, fieldType: "longtext" } },
    }),
    // The five editors with no writable real-world column: a schema change to
    // demonstrate them on real data is forbidden, so they ship here instead of as
    // stubs. Inserted before `flagged`, which stays last.
    columnHelper.accessor("amount", {
      id: "amount",
      header: "Amount",
      size: 140,
      meta: {
        grid: {
          editable: true,
          editor: "currency",
          fieldType: "number",
          align: "right",
          tabular: true,
          filter: "number",
        },
      },
    }),

    columnHelper.accessor("quantity", {
      id: "quantity",
      header: "Quantity",
      size: 120,
      meta: {
        grid: {
          editable: true,
          editor: "number",
          fieldType: "number",
          align: "right",
          tabular: true,
          filter: "number",
        },
      },
    }),

    columnHelper.accessor("website", {
      id: "website",
      header: "Website",
      size: 220,
      meta: { grid: { editable: true, editor: "url", fieldType: "text" } },
    }),

    columnHelper.accessor("emailAddress", {
      id: "emailAddress",
      header: "Email",
      size: 220,
      meta: { grid: { editable: true, editor: "email", fieldType: "text" } },
    }),

    columnHelper.accessor("assignee", {
      id: "assignee",
      header: "Assignee",
      size: 170,
      meta: {
        grid: {
          editable: true,
          editor: "user",
          fieldType: "linked",
          // The `user` editor resolves the id itself, so this column's own
          // display never shows a raw id and never needs a marker.
          unresolvedText: "Unknown person",
          editorOptions: { users },
        },
      },
    }),

    // The joined-accessor case: no editor, no stored value, a label resolved at
    // render time from an id. This is the shape that renders nothing at all when a
    // renderer is keyed on the editor alone, and it is why it lives here rather
    // than in the contacts table — see the factory's doc comment.
    //
    // `SITE_NAMES` deliberately omits `site-missing`, so one row in three is a
    // dangling reference and proves the unresolved marker without a fixture
    // having to plant one.
    columnHelper.accessor((row) => SITE_NAMES.get(row.site) ?? UNRESOLVED_SITE, {
      id: "site",
      header: "Site",
      size: 170,
      meta: { grid: { fieldType: "linked", unresolvedText: UNRESOLVED_SITE, filter: "text" } },
    }),

    columnHelper.accessor("flagged", {
      id: "flagged",
      header: "Flagged",
      size: 110,
      // `editor: "checkbox"` is what the `Space` toggle reads, and the registry
      // supplies the display widget — the one editor whose control is the cell
      // itself, so it commits on click as well as on `Space`.
      //
      // Last, because `grid-keyboard.spec.ts` addresses it as the grid's final
      // cell for `End` and `Tab`. Anything added after it moves that silently.
      meta: { grid: { editable: true, editor: "checkbox", fieldType: "boolean" } },
    }),
  ]
}

/**
 * The lookup a joined accessor resolves against, and the marker for a miss.
 *
 * The wording is this harness's, exactly as a real table's would be: the grid's
 * `linked` renderer receives the marker through `meta.grid.unresolvedText`
 * rather than recognising a shape, so nothing here has to match anything there.
 */
const UNRESOLVED_SITE = "Unknown site"

const SITE_NAMES: ReadonlyMap<string, string> = new Map([
  ["site-north", "North Annexe"],
  ["site-quarry-road", "Quarry Road"],
  // The id `site-missing` points at is deliberately absent.
])

/** The URL codec's list, derived so it cannot drift from the defs above. */
const PREVIEW_COLUMN_IDS = buildPreviewColumns([])
  .map((definition) => definition.id)
  .filter((id): id is string => typeof id === "string")

/** Writes aimed at this reference reject, so the visible revert is observable. */
const GRID_PREVIEW_FAILING_REF = "REF-0250"

/**
 * Writes aimed at this reference resolve *late*.
 *
 * Every other row commits synchronously, which is fine for the panel variants
 * and useless for the optimistic display: a value that appears instantly is
 * indistinguishable from a value that appeared because the write had already
 * resolved. This row stalls instead, and stamps `notes` when it lands, so a spec
 * can prove the edited cell showed the new value while the write was still in
 * flight — the preview-harness equivalent of holding a PATCH open.
 *
 * Row 400, not row 1: `grid-keyboard.spec.ts`, `grid-clipboard.spec.ts` and
 * `grid-cell-range.spec.ts` all commit against rows 0–7 of the unfiltered
 * window, so a slow write there would be a shared row and each suite's timing
 * would depend on the other's edits. The failing row above is `REF-0250`,
 * because *rejecting* a write has no effect on any other test.
 */
const GRID_PREVIEW_SLOW_REF = "REF-0400"

/** Long enough that the assertion is never racing the resolve, short enough to run. */
const GRID_PREVIEW_SLOW_MS = 1_500

/** The stamp written when the slow commit resolves. */
const GRID_PREVIEW_SETTLED_NOTE = "settled by the harness"

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
export function GridPreview({
  rows,
  users = [],
}: {
  rows: GridPreviewRow[]
  users?: readonly GridPreviewUser[]
}) {
  // Local row state, not grid state: it is what an in-memory commit mutates, and
  // it is seeded from the server-generated rows so nothing is fetched here.
  const [data, setData] = useState(rows)
  const [density, setDensity] = useState<GridDensity>(GRID_DEFAULT_DENSITY)
  const [panelKey, setPanelKey] = useState<PreviewPanelKey>("ready")
  const [retryCount, setRetryCount] = useState(0)
  // Keyboard-operation notices: a copy the browser refused, a paste that skipped
  // read-only cells. The grid renders no status strip of its own — see
  // `Grid`'s `onNotice` — so the harness is what puts them on screen.
  const [notice, setNotice] = useState<string | null>(null)

  const {
    state,
    onStateChange,
    clearFilters,
    beginTransientChange,
    commitTransientChange,
    cancelTransientChange,
  } = useGridViewState({ columnIds: PREVIEW_COLUMN_IDS })

  const columns = useMemo(() => buildPreviewColumns(users), [users])

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

  /*
   * Bounded like `/manage`, for the same reason and with the same chain. The
   * harness renders 500 rows, so without a bound the grid is ~16,000px tall and
   * the page — not the grid — is what scrolls: `sticky top-0` has no scrollport,
   * and the horizontal scrollbar lands 15,000px down. This is the second of the
   * two `<Grid>` call sites, so it is the second place the frame has to be
   * established.
   */
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
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
          visible revert is observable without a server. Edits to{" "}
          <span className="font-mono">{GRID_PREVIEW_SLOW_REF}</span> resolve after{" "}
          {GRID_PREVIEW_SLOW_MS}ms and stamp <span className="font-mono">Notes</span>, so the
          optimistic display is observable too.
        </p>
      </div>

      <Grid<GridPreviewRow>
        rows={data}
        columns={columns}
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
        onNotice={setNotice}
        onCellCommit={(commit) => {
          if (commit.value === commit.previousValue) {
            return
          }

          const ref = data.find((row) => row.id === commit.rowId)?.ref

          if (ref === GRID_PREVIEW_FAILING_REF) {
            return Promise.reject(
              new Error(`Refusing to save ${GRID_PREVIEW_FAILING_REF}: this row is locked in the harness.`),
            )
          }

          if (ref === GRID_PREVIEW_SLOW_REF) {
            return new Promise<void>((resolve) => {
              setTimeout(() => {
                setData((current) =>
                  current.map((row) =>
                    row.id === commit.rowId
                      ? ({
                          ...row,
                          [commit.columnId]: commit.value,
                          notes: GRID_PREVIEW_SETTLED_NOTE,
                        } as GridPreviewRow)
                      : row,
                  ),
                )
                resolve()
              }, GRID_PREVIEW_SLOW_MS)
            })
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

      {/*
        At the foot of the page, not above the column headers where the grid's
        old strip sat: the grid itself owns no reporting surface any more, so
        this is the preview's, and its position is deliberate rather than
        incidental.
      */}
      <p
        data-grid-notice=""
        role="status"
        aria-live="polite"
        className="text-muted-foreground min-h-[20px] shrink-0 text-[13px]"
      >
        {notice ?? ""}
      </p>
    </div>
  )
}
