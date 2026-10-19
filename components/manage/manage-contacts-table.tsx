"use client"

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { createColumnHelper } from "@tanstack/react-table"
import type { RowSelectionState, Table } from "@tanstack/react-table"

import type {
  ManageContact,
  ManageContactPatch,
  ManageContactPatchKey,
  ManageContactWriteResult,
  ManagePortalPayload,
} from "@/components/manage/manage-types"
import {
  Grid,
  GRID_DEFAULT_DENSITY,
  useGridRowLifecycle,
  useGridViewState,
  type GridCellCommit,
  type GridColumnDef,
  type GridDensity,
  type GridFieldType,
  type GridRowContextMenuProps,
  type GridRowLifecycle,
} from "@/components/grid"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"

const columnHelper = createColumnHelper<ManageContact>()

/**
 * Defensively narrows an unknown response body before its message is shown.
 *
 * Every fetch path in this component routes through this: a malformed payload
 * once meant a render crash.
 */
function readError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value) {
      return value
    }
  }

  return fallback
}

const SELECT_COLUMN_ID = "select"
const NAME_COLUMN_ID = "name"
const PHONE_COLUMN_ID = "phone"
const LOCATION_COLUMN_ID = "location"
const SOURCE_COLUMN_ID = "source"
const BOOKS_READ_COLUMN_ID = "booksRead"
const INITIAL_CONTACT_COLUMN_ID = "initialContact"
const DATE_OF_BIRTH_COLUMN_ID = "dateOfBirth"
const TOTAL_COLUMN_ID = "totalAttendanceCount"
const PAST_60_COLUMN_ID = "past60DayAttendanceCount"
const LAST_CONTACTED_COLUMN_ID = "lastContactedOn"
const NOTES_COLUMN_ID = "notes"
const COLLECTED_BY_COLUMN_ID = "collectedBy"
const FAVORITE_COLUMN_ID = "favorite"

/**
 * What a `locationIds` / `collectedById` reference that resolves to nothing
 * renders as.
 *
 * The honest answer is a marker, not the id and not a guess derived from it. A
 * contact with no location and a contact whose location row is gone are
 * *different facts*, and both the empty string and the raw UUID collapse them:
 * one hides the dangling reference entirely, the other prints a database
 * identifier at an operator and tells them nothing about what to do next.
 *
 * Wording lives here rather than in the grid because the primitive has no
 * vocabulary for a location. `meta.grid.unresolvedText` carries this value to
 * the `linked` renderer, which marks the cell rather than matching a shape — so
 * rewording this string cannot silently stop the marker being recognised.
 */
const UNRESOLVED_LOCATION = "Unknown location"
const UNRESOLVED_STAFF = "Unknown staff member"

/**
 * Display order, and the layout every later `/manage` table copies: the selection
 * control leads, the frozen identity column follows it, and the row's own
 * actions live in a right-click menu rather than in a trailing column. `name` is
 * frozen because `design-constraints.md` requires that scrolling right never
 * loses the row's identity, and the select column is in front of it — which is
 * why freezing is a marked run with cumulative offsets rather than "whichever
 * column happens to be first".
 *
 * `favorite` is the last column because it renders a value the operator toggles.
 * Delete is not a column at all: it acts on the selection, and a per-row bin
 * could only ever act on one row while spending a permanent 48px on every view.
 */
const COLUMN_IDS: readonly string[] = [
  SELECT_COLUMN_ID,
  NAME_COLUMN_ID,
  PHONE_COLUMN_ID,
  LOCATION_COLUMN_ID,
  SOURCE_COLUMN_ID,
  BOOKS_READ_COLUMN_ID,
  INITIAL_CONTACT_COLUMN_ID,
  DATE_OF_BIRTH_COLUMN_ID,
  TOTAL_COLUMN_ID,
  PAST_60_COLUMN_ID,
  LAST_CONTACTED_COLUMN_ID,
  NOTES_COLUMN_ID,
  COLLECTED_BY_COLUMN_ID,
  FAVORITE_COLUMN_ID,
]

/**
 * CAP-18's default field set: eight of the thirteen data fields, with these five
 * off until asked for.
 *
 * A **contacts** decision, so it lives here and not in `components/grid/` — the
 * primitive has no opinion about which of a table's fields matter, and
 * `/dev/grid-preview` passes no defaults and keeps all fifteen of its columns.
 *
 * Two are here for a reason rather than for width:
 * - `location` and `collectedBy` stay VISIBLE, because CAP-4's unresolved
 *   marker is a `linked` cell and an operator can only chase a location they
 *   can see.
 * - `lastContactedOn` is hidden (OQ-16) — the attendance rollups
 *   `totalAttendanceCount` / `past60DayAttendanceCount` carry the same question.
 *
 * **This is a default, not a lock, and the URL encoding is what makes it one.**
 * An absent `hide` key applies this set; a present key — including `hide=` with
 * nothing after it — replaces it entirely. Un-hiding a field from *Hide fields*
 * therefore writes the complete still-hidden list, and re-hiding it drops the
 * key so the defaults apply again. Without that, `serializeGridViewState` could
 * only ever write ids whose visibility is `false`, and "hide nothing" would be
 * inexpressible: the default set would be a one-way door.
 */
const GRID_DEFAULT_HIDDEN_COLUMNS: readonly string[] = [
  SOURCE_COLUMN_ID,
  BOOKS_READ_COLUMN_ID,
  DATE_OF_BIRTH_COLUMN_ID,
  LAST_CONTACTED_COLUMN_ID,
  FAVORITE_COLUMN_ID,
]

const COLUMN_LABELS: Record<string, string> = {
  [NAME_COLUMN_ID]: "Name",
  [PHONE_COLUMN_ID]: "Phone",
  [LOCATION_COLUMN_ID]: "Location",
  [SOURCE_COLUMN_ID]: "Source",
  [BOOKS_READ_COLUMN_ID]: "Books Read",
  [INITIAL_CONTACT_COLUMN_ID]: "Initial Contact",
  [DATE_OF_BIRTH_COLUMN_ID]: "Date of Birth",
  [TOTAL_COLUMN_ID]: "Total Attendance",
  [PAST_60_COLUMN_ID]: "Past 60 Days",
  [LAST_CONTACTED_COLUMN_ID]: "Last Contacted On",
  [NOTES_COLUMN_ID]: "Notes",
  [COLLECTED_BY_COLUMN_ID]: "Collected By",
  [FAVORITE_COLUMN_ID]: "Favorite",
}

/**
 * The `source` values the local fixtures write, verbatim.
 *
 * A `select` editor rejects a value that is not one of its options, so the
 * option list has to be a superset of what the rows actually hold or every
 * existing row renders as "not an option" and a no-op commit is refused.
 * `scripts/seed-preview-fixtures.mjs` writes the first and
 * `scripts/bulk-contact-fixtures.mjs` writes the second; the values are unioned
 * with whatever the payload itself carries so a hand-written row is covered too.
 *
 * The catalog's "Pass Distribution" / "Public Registration" / "Old" were
 * Airtable-era values: no migration, seeder or fixture in this repository writes
 * them, and offering them would put three dead options in front of every
 * operator. Verified against the running local stack at this story's baseline:
 * `preview-fixture` on 4 rows and `preview-fixture-bulk` on 250, and nothing
 * else.
 */
const KNOWN_SOURCE_VALUES = ["preview-fixture", "preview-fixture-bulk"] as const

/**
 * The only columns an inline edit may write, mapped to their patch key.
 *
 * An id absent from this table rejects the commit rather than sending a patch:
 * the server's `MANAGE_CONTACT_PATCH_KEYS` allow-list is the real boundary, and
 * this map is what keeps a column that merely *looks* editable from reaching it.
 */
const PATCH_KEY_BY_COLUMN: Partial<Record<string, ManageContactPatchKey>> = {
  [NAME_COLUMN_ID]: "name",
  [PHONE_COLUMN_ID]: "phone",
  [SOURCE_COLUMN_ID]: "source",
  [BOOKS_READ_COLUMN_ID]: "booksRead",
  [INITIAL_CONTACT_COLUMN_ID]: "initialContact",
  [DATE_OF_BIRTH_COLUMN_ID]: "dateOfBirth",
  [NOTES_COLUMN_ID]: "notes",
  // Plural on the wire: the `linked` editor commits `[id]` (and `[]` to clear),
  // because a contact belongs to at most one location. Without this entry a
  // commit on the column throws before any request is sent.
  [LOCATION_COLUMN_ID]: "locationIds",
}

/** The same eight columns, in the order they are offered to the create write. */
const WRITABLE_COLUMN_IDS = Object.keys(PATCH_KEY_BY_COLUMN)

/**
 * The id prefix a client-side draft row carries until the server replaces it.
 *
 * `contacts.id` is server-generated, so a row that exists only in the grid has
 * to carry something that cannot collide with one. `~` is reserved by
 * `gridCellKey` and is deliberately avoided, which is why the prefix is a
 * word rather than a separator.
 */
const DRAFT_ROW_ID_PREFIX = "draft-"

let draftSequence = 0

/**
 * The blank row `+ Add record` appends.
 *
 * Every field is empty and both `NOT NULL` columns are the empty string, so the
 * create write is what turns it into a record — there is no half-populated row
 * written to the database by accident. Rollups start at zero because a row that
 * has never existed has no attendance.
 *
 * The id is client-generated and stable, which is what lets the grid address the
 * row, focus it, and key the operator's keystrokes to it before the server has
 * ever heard of it.
 */
function createDraftContact(): ManageContact {
  draftSequence += 1

  return {
    id: `${DRAFT_ROW_ID_PREFIX}${draftSequence}`,
    name: "",
    phone: "",
    college: null,
    company: null,
    rounds: null,
    source: null,
    booksRead: [],
    notes: null,
    initialContact: null,
    lastContactedOn: null,
    dateOfBirth: null,
    photoPath: null,
    isFavorite: false,
    locationIds: [],
    assignedPreacherId: null,
    collectedById: null,
    totalAttendanceCount: 0,
    past60DayAttendanceCount: 0,
  }
}

/** True while a row is the client-side blank one, i.e. before the create lands. */
function isDraftRowId(rowId: string): boolean {
  return rowId.startsWith(DRAFT_ROW_ID_PREFIX)
}

/**
 * One writable column's current value on a draft.
 *
 * An explicit switch rather than an index signature so the compiler knows which
 * fields a create can carry. `default: undefined` is unreachable — the column
 * list and this switch are the same eight columns — and returning `undefined`
 * rather than throwing keeps a future column from failing the whole create.
 */
function draftValueForColumn(contact: ManageContact, columnId: string): unknown {
  switch (columnId) {
    case NAME_COLUMN_ID:
      return contact.name
    case PHONE_COLUMN_ID:
      return contact.phone
    case SOURCE_COLUMN_ID:
      return contact.source
    case BOOKS_READ_COLUMN_ID:
      return contact.booksRead
    case INITIAL_CONTACT_COLUMN_ID:
      return contact.initialContact
    case DATE_OF_BIRTH_COLUMN_ID:
      return contact.dateOfBirth
    case NOTES_COLUMN_ID:
      return contact.notes
    case LOCATION_COLUMN_ID:
      return contact.locationIds
    default:
      return undefined
  }
}

/**
 * The create body: every value the operator has put on the draft, plus the cell
 * being committed right now.
 *
 * `name` and `phone` are sent even while blank, deliberately. `parseContactPatch`
 * names the field that is missing only when the key is present and empty — omit
 * an empty required key and the handler answers `"No editable fields were
 * supplied."`, which tells an operator nothing about what to type.
 */
function buildCreatePatch(
  draft: ManageContact,
  columnId: string,
  value: unknown,
): ManageContactPatch {
  const patchKey = PATCH_KEY_BY_COLUMN[columnId]

  if (!patchKey) {
    throw new Error(`${COLUMN_LABELS[columnId] ?? columnId} cannot be edited here.`)
  }

  const patch: ManageContactPatch = { name: draft.name, phone: draft.phone }

  for (const id of WRITABLE_COLUMN_IDS) {
    if (id === columnId || id === NAME_COLUMN_ID || id === PHONE_COLUMN_ID) {
      continue
    }

    const key = PATCH_KEY_BY_COLUMN[id]

    if (!key) {
      continue
    }

    const current = draftValueForColumn(draft, id)

    // Absent rather than blank: the handler's own bounds are the only rule for
    // an optional field, and sending `""` for every unset column would put a
    // column into the audit event's `metadata.fields` that nobody wrote.
    if (current === null || current === undefined || current === "") {
      continue
    }

    if (Array.isArray(current) && current.length === 0) {
      continue
    }

    patch[key] = current
  }

  patch[patchKey] = value
  return patch
}

interface Notice {
  kind: "ok" | "error"
  message: string
}

/**
 * The two rollup fields the status bar aggregates.
 *
 * Declared as a pair with the column id *and* the row key rather than derived
 * from the column defs: `fieldType: "number"` describes how a cell renders, and
 * adding a third number column must not silently widen what a bar that claims to
 * aggregate "the number fields" adds up.
 */
const NUMBER_AGGREGATE_FIELDS = [
  { columnId: TOTAL_COLUMN_ID, key: "totalAttendanceCount" },
  { columnId: PAST_60_COLUMN_ID, key: "past60DayAttendanceCount" },
] as const satisfies ReadonlyArray<{ columnId: string; key: keyof ManageContact }>

/**
 * The header's select-all.
 *
 * Its state describes the rows currently in view rather than the whole selection,
 * so a mixed view renders "indeterminate" and names both counts. Toggling it acts
 * on the visible rows only, leaving rows selected outside the current filter
 * alone — narrowing a filter must not silently discard what the operator picked.
 */
function SelectAllControl({
  table,
  onToggle,
}: {
  table: Table<ManageContact>
  onToggle: (selected: boolean, visibleIds: readonly string[]) => void
}) {
  const visibleRows = table.getRowModel().rows
  const visibleIds = visibleRows.map((row) => row.id)
  const selectedInView = visibleRows.filter((row) => row.getIsSelected()).length

  return (
    <span
      className="flex justify-center"
      onPointerDown={(event) => {
        // Without this the cell takes the pointer, the grid moves cell focus to a
        // non-editable column, and the next double-click becomes a no-op.
        event.stopPropagation()
      }}
    >
      <Checkbox
        checked={
          selectedInView === 0 ? false : selectedInView === visibleIds.length ? true : "indeterminate"
        }
        disabled={visibleIds.length === 0}
        onCheckedChange={(checked) => {
          onToggle(checked === true, visibleIds)
        }}
        aria-label={
          selectedInView > 0
            ? `Select all rows in view (${selectedInView} of ${visibleIds.length} in view selected)`
            : "Select all rows in view"
        }
      />
    </span>
  )
}

/**
 * The grid's footer row: the readout under the identity column, each number
 * field's total under its own column.
 *
 * **Why below the scroller, not inside it.** A bar that sits among the rows
 * scrolls away with them, and a count nobody can see is not a count. Below the
 * scroll container it stays put while the rows move under it — the pattern the
 * reference implementation (Airtable's summary bar) uses, and the one the
 * operator's eye already knows: the totals stay under their fields, and the
 * record count sits at the left of the same strip.
 *
 * **One number, one basis.** The readout swaps from the record count to the
 * selection when a row is selected, and the totals are summed over the same
 * rows — never the total in scope while the readout claims the selection.
 */
function renderFooterCell(
  columnId: string,
  summaryLabel: string,
  aggregateByColumnId: Map<string, number>,
): ReactNode {
  if (columnId === NAME_COLUMN_ID) {
    return (
      <span
        data-manage-status-count=""
        className="text-[var(--program-text)] font-medium tabular-nums"
      >
        {summaryLabel}
      </span>
    )
  }

  const sum = aggregateByColumnId.get(columnId)

  if (sum === undefined) {
    return null
  }

  return (
    <span
      data-manage-status-aggregate={columnId}
      className="text-foreground block w-full text-right tabular-nums"
    >
      Sum {sum.toLocaleString("en-IN")}
    </span>
  )
}

/**
 * The contacts row menu.
 *
 * One item today — delete every selected row — because the star already owns the
 * favourite toggle. The grid resolves the target set (the selection, or the row
 * that replaced it); this component owns the verbs, which is what keeps contacts
 * vocabulary out of `components/grid/`.
 *
 * The count lives in the label rather than in the item's text: the item's name
 * is the operator's requirement, and a label that changed with the selection
 * would rename the control between two right-clicks.
 */
function ContactsRowContextMenu({ rowIds }: GridRowContextMenuProps) {
  const lifecycle = useGridRowLifecycle()
  const count = rowIds.length

  return (
    <>
      <ContextMenuLabel className="text-[13px]">
        {count} selected row{count === 1 ? "" : "s"}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        className="text-[13px]"
        disabled={!lifecycle}
        onSelect={() => {
          lifecycle?.requestDeleteMany(rowIds)
        }}
      >
        Delete all selected records
      </ContextMenuItem>
    </>
  )
}

/**
 * `ManagePortal`'s page header reads the row count of the table it is showing,
 * so a create or a delete is reflected there without a reload. The payload's
 * own count can only move when the server re-reads, which makes it the seed
 * rather than the source.
 */
function useReportRowCount(onRowCountChange: ((count: number) => void) | undefined, count: number): void {
  useEffect(() => {
    onRowCountChange?.(count)
  }, [count, onRowCountChange])
}

export function ManageContactsTable({
  payload,
  onRowCountChange,
}: {
  payload: ManagePortalPayload
  onRowCountChange?: (count: number) => void
}) {
  const [density, setDensity] = useState<GridDensity>(GRID_DEFAULT_DENSITY)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pendingContactId, setPendingContactId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  /**
   * The committed rows, mirrored from the payload so a write can be applied
   * optimistically without a round trip.
   *
   * A new payload identity replaces the mirror wholesale. That is the only thing
   * that can change scope or carry a re-read row, and resetting during render
   * rather than in an effect is what keeps the previous scope's rows from being
   * painted even for one frame.
   */
  const [mirror, setContacts] = useState<{ source: ManageContact[]; rows: ManageContact[] }>(
    () => ({ source: payload.contacts, rows: payload.contacts }),
  )

  if (mirror.source !== payload.contacts) {
    setContacts({ source: payload.contacts, rows: payload.contacts })
  }

  const contacts = mirror.rows

  useReportRowCount(onRowCountChange, contacts.length)


  const locationNameById = useMemo(
    () => new Map(payload.locations.map((location) => [location.id, location.name])),
    [payload.locations],
  )

  /**
   * The `linked` editor's record list for `location`.
   *
   * `payload.locations` is already the caller's scoped set — RLS narrowed it on
   * the read path — so the options and the scope cannot disagree. `detail` is the
   * location's status: the list shows a name and a status and nothing else.
   */
  const locationRecords = useMemo(
    () =>
      payload.locations.map((location) => ({
        id: location.id,
        label: location.name,
        detail: location.status ?? undefined,
      })),
    [payload.locations],
  )

  /**
   * The `select` editor's option list for `source`.
   *
   * The seeded values first, in a fixed order, then whatever else the rows
   * carry — so the list is a superset of every stored value and an existing row
   * is never "not an option".
   */
  const sourceOptions = useMemo(() => {
    const options = new Set<string>(KNOWN_SOURCE_VALUES)

    for (const contact of contacts) {
      if (typeof contact.source === "string" && contact.source.length > 0) {
        options.add(contact.source)
      }
    }

    return [...options]
  }, [contacts])

  const applyWrite = useCallback((written: ManageContactWriteResult) => {
    setContacts((current) => ({
      ...current,
      rows: current.rows.map((contact) =>
        contact.id === written.id ? { ...contact, ...written } : contact,
      ),
    }))
  }, [])

  /**
   * The one write path an inline edit and a row action both take.
   *
   * It throws with the server's message, because `use-grid-keyboard` resolves a
   * rejected commit into a visible revert and a status line — a second error
   * surface here would be a third thing to keep in step.
   */
  const patchContact = useCallback(async (contactId: string, patch: ManageContactPatch) => {
    let response: Response

    try {
      response = await fetch("/api/manage/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, ...patch }),
      })
    } catch (cause) {
      // Named rather than passed through: a raw `TypeError: fetch failed` is not
      // something an operator can act on.
      throw new Error("Unable to reach the server.", { cause })
    }

    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(readError(body, "The change could not be saved."))
    }

    const written = (body as { contact?: ManageContactWriteResult } | null)?.contact

    if (!written || typeof written !== "object") {
      throw new Error("The server did not return the saved row.")
    }

    return written
  }, [])

  /**
   * The create write.
   *
   * `201` and a full row, which is what the grid needs: a draft row has no
   * server id, so the response *is* how the row stops being a draft. A `200`
   * with no `contact` is treated as the failure it is rather than promoted.
   */
  const createContact = useCallback(async (patch: ManageContactPatch) => {
    let response: Response

    try {
      response = await fetch("/api/manage/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
    } catch (cause) {
      throw new Error("Unable to reach the server.", { cause })
    }

    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      // The handler's own wording — `Name is required.`, `Phone is required.` —
      // rather than a client-side guess. One validation story, one message.
      throw new Error(readError(body, "The record could not be created."))
    }

    const written = (body as { contact?: ManageContactWriteResult } | null)?.contact

    if (!written || typeof written !== "object" || typeof written.id !== "string") {
      throw new Error("The server did not return the new record.")
    }

    return written
  }, [])

  /**
   * The delete write.
   *
   * Rejects with the server's message so the grid's per-row report can name the
   * row and the reason rather than a summary. Only the caller applies the result.
   */
  const deleteContact = useCallback(async (contactId: string) => {
    let response: Response

    try {
      response = await fetch("/api/manage/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      })
    } catch (cause) {
      throw new Error("Unable to reach the server.", { cause })
    }

    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(readError(body, "The record could not be deleted."))
    }

    const deleted = (body as { deleted?: { id?: unknown } } | null)?.deleted

    // A response that cannot be verified is a failure, not a success: claiming a
    // row is gone when the server never said so is the one claim that cannot be
    // walked back.
    if (!deleted || typeof deleted.id !== "string") {
      throw new Error("The server did not confirm the deletion.")
    }

    return deleted.id
  }, [])

  const handleCellCommit = useCallback(
    async (commit: GridCellCommit<ManageContact>) => {
      const patchKey = PATCH_KEY_BY_COLUMN[commit.columnId]

      if (!patchKey) {
        const label = COLUMN_LABELS[commit.columnId] ?? commit.columnId
        throw new Error(`${label} cannot be edited here.`)
      }

      if (isDraftRowId(commit.rowId)) {
        // A commit on a draft row *is* the create. Nothing branches around the
        // commit path, so the create inherits the optimistic override, the
        // destructive revert and the status line that every other write has.
        const draft = commit.row
        const patch = buildCreatePatch(draft, commit.columnId, commit.value)

        // Accumulated *before* the request, not after it succeeds. `name` and
        // `phone` are both `NOT NULL`, so one commit can never satisfy both: the
        // handler answers `Phone is required.` for the first field and the record
        // cannot exist until the second commit carries the first field's value
        // along. Rolling back on failure instead would make a two-field record
        // impossible to create at all.
        setContacts((current) => ({
          ...current,
          rows: current.rows.map((contact) =>
            contact.id === commit.rowId
              ? ({ ...contact, [commit.columnId]: commit.value } as ManageContact)
              : contact,
          ),
        }))

        const written = await createContact(patch)

        // Promoted in place: the draft row is replaced by the row the server
        // made, keeping its position, so the operator's focus — which the grid
        // re-keys onto the new id — does not jump.
        setContacts((current) => ({
          ...current,
          rows: current.rows.map((contact) =>
            contact.id === commit.rowId ? { ...contact, ...written } : contact,
          ),
        }))

        return
      }
      applyWrite(await patchContact(commit.rowId, { [patchKey]: commit.value }))
    },
    [applyWrite, createContact, patchContact],
  )

  const toggleFavorite = useCallback(
    async (contact: ManageContact) => {
      setPendingContactId(contact.id)
      setNotice(null)

      try {
        const written = await patchContact(contact.id, { isFavorite: !contact.isFavorite })
        applyWrite(written)
        setNotice({
          kind: "ok",
          message: `${written.name} ${written.isFavorite ? "added to" : "removed from"} favorites.`,
        })
      } catch (cause) {
        setNotice({
          kind: "error",
          message: cause instanceof Error ? cause.message : "Unable to save the favorite.",
        })
      } finally {
        setPendingContactId(null)
      }
    },
    [applyWrite, patchContact],
  )

  const setVisibleSelection = useCallback((selected: boolean, visibleIds: readonly string[]) => {
    setRowSelection((current) => {
      const next: RowSelectionState = { ...current }

      for (const id of visibleIds) {
        if (selected) {
          next[id] = true
        } else {
          delete next[id]
        }
      }

      return next
    })
  }, [])

  const columns = useMemo<GridColumnDef<ManageContact>[]>(() => {
    return [
      columnHelper.display({
        id: SELECT_COLUMN_ID,
        header: ({ table }) => (
          <SelectAllControl table={table} onToggle={setVisibleSelection} />
        ),
        cell: ({ row }) => (
          <span
            className="flex justify-center"
            onPointerDown={(event) => {
              // Without this the cell takes the pointer, the grid moves cell focus
              // to a non-editable column, and the next double-click becomes a no-op.
              event.stopPropagation()
            }}
          >
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => {
                row.toggleSelected(checked === true)
              }}
              aria-label={`Select ${row.original.name}`}
            />
          </span>
        ),
        size: 40,
        // Pinned to a narrow gutter: the grid's shared `minSize` would otherwise
        // widen a one-checkbox column to 72px, and the width is what the next
        // column's pinned offset is computed from.
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableHiding: false,
        meta: { grid: { selectable: true, align: "center" } },
      }),

      columnHelper.accessor("name", {
        id: NAME_COLUMN_ID,
        header: COLUMN_LABELS[NAME_COLUMN_ID],
        size: 200,
        // Pinned: scrolling right must never lose the row's identity. `hideable:
        // false` because a column that cannot scroll away cannot be hidden either.
        meta: {
          grid: {
            frozen: true,
            editable: true,
            editor: "text",
            fieldType: "text",
            // The one visual emphasis a row carries. Weight and space, never a
            // colour: a second accent would compete with selection and focus,
            // which `design-constraints.md` reserves outright.
            emphasis: true,
            hideable: false,
          },
        },
      }),

      columnHelper.accessor("phone", {
        id: PHONE_COLUMN_ID,
        header: COLUMN_LABELS[PHONE_COLUMN_ID],
        size: 140,
        meta: { grid: { editable: true, editor: "text", fieldType: "text" } },
      }),

      // Joined rather than an array so the per-column text filter and the sort
      // order read the same value the operator sees in the cell.
      //
      // An id the lookup misses becomes `UNRESOLVED_LOCATION`, never the id: this
      // used to fall back to `?? id`, which printed a raw UUID into the cell, into
      // its `title`, and out through the clipboard. `fieldType: "linked"` is what
      // gets the cell a label at all — without it this column has no renderer to
      // key on and falls through to bare text.
      //
      // `editor: "linked"` is the single-record picker. It commits `[id]` because
      // `location_ids` is plural, and because a contact belongs to at most one
      // location the picker is offered only when the field is empty: a set cell
      // shows its chip and a `×`.
      columnHelper.accessor(
        (contact) =>
          contact.locationIds
            .map((id) => locationNameById.get(id) ?? UNRESOLVED_LOCATION)
            .join(", "),
        {
          id: LOCATION_COLUMN_ID,
          header: COLUMN_LABELS[LOCATION_COLUMN_ID],
          size: 180,
          meta: {
            grid: {
              fieldType: "linked",
              unresolvedText: UNRESOLVED_LOCATION,
              editable: true,
              editor: "linked",
              editorOptions: { records: locationRecords },
            },
          },
        },
      ),

      // `select`: a free-text column that only ever holds one of a known set.
      // The option list is a superset of what the rows carry, so an existing
      // value is always selectable and a no-op commit is never refused.
      columnHelper.accessor("source", {
        id: SOURCE_COLUMN_ID,
        header: COLUMN_LABELS[SOURCE_COLUMN_ID],
        size: 180,
        meta: {
          grid: {
            editable: true,
            editor: "select",
            fieldType: "select",
            editorOptions: { options: sourceOptions },
          },
        },
      }),

      // `multiselect`: already a `string[]` on the row and already writable
      // server-side, so this needs no plumbing at all — only the option list,
      // which the payload resolved.
      columnHelper.accessor("booksRead", {
        id: BOOKS_READ_COLUMN_ID,
        header: COLUMN_LABELS[BOOKS_READ_COLUMN_ID],
        size: 200,
        meta: {
          grid: {
            editable: true,
            editor: "multiselect",
            fieldType: "multiselect",
            editorOptions: { options: payload.booksReadOptions },
          },
        },
      }),

      // `date`: both are writable free-text strings the server already accepts as
      // `YYYY-MM-DD`, so the calendar needs no server change at all.
      columnHelper.accessor("initialContact", {
        id: INITIAL_CONTACT_COLUMN_ID,
        header: COLUMN_LABELS[INITIAL_CONTACT_COLUMN_ID],
        size: 150,
        meta: { grid: { editable: true, editor: "date", fieldType: "date" } },
      }),

      columnHelper.accessor("dateOfBirth", {
        id: DATE_OF_BIRTH_COLUMN_ID,
        header: COLUMN_LABELS[DATE_OF_BIRTH_COLUMN_ID],
        size: 140,
        meta: { grid: { editable: true, editor: "date", fieldType: "date" } },
      }),

      columnHelper.accessor("totalAttendanceCount", {
        id: TOTAL_COLUMN_ID,
        header: COLUMN_LABELS[TOTAL_COLUMN_ID],
        size: 130,
        meta: { grid: { fieldType: "number", align: "right", tabular: true } },
      }),

      columnHelper.accessor("past60DayAttendanceCount", {
        id: PAST_60_COLUMN_ID,
        header: COLUMN_LABELS[PAST_60_COLUMN_ID],
        size: 110,
        meta: { grid: { fieldType: "number", align: "right", tabular: true } },
      }),

      // Read as an ISO date by the server, so it sorts correctly as text.
      columnHelper.accessor("lastContactedOn", {
        id: LAST_CONTACTED_COLUMN_ID,
        header: COLUMN_LABELS[LAST_CONTACTED_COLUMN_ID],
        size: 140,
        meta: { grid: { fieldType: "date" } },
      }),

      // Truncates to one line at the fixed row height; the cell's `title` carries
      // the full text, because reintroducing wrapping would break the density
      // contract the whole grid is built on.
      columnHelper.accessor("notes", {
        id: NOTES_COLUMN_ID,
        header: COLUMN_LABELS[NOTES_COLUMN_ID],
        size: 240,
        // `longtext`: the control is a popover precisely because a textarea
        // cannot fit a 32px row without pushing the virtualized list out of
        // alignment.
        meta: { grid: { editable: true, editor: "longtext", fieldType: "longtext" } },
      }),

      // Degrades the same way as `location`: a staff id that resolves to nothing
      // is `UNRESOLVED_STAFF`, and an absent `collectedById` is nothing at all.
      // It used to fall back to `""`, which made a dangling reference
      // indistinguishable from a contact nobody collected \u2014 the same collapse
      // `location` had, in the other direction.
      columnHelper.accessor(
        (contact) =>
          contact.collectedById
            ? (payload.staffNames[contact.collectedById] ?? UNRESOLVED_STAFF)
            : "",
        {
          id: COLLECTED_BY_COLUMN_ID,
          header: COLUMN_LABELS[COLLECTED_BY_COLUMN_ID],
          size: 160,
          meta: {
            grid: { fieldType: "linked", unresolvedText: UNRESOLVED_STAFF },
          },
        },
      ),

      columnHelper.display({
        id: FAVORITE_COLUMN_ID,
        header: COLUMN_LABELS[FAVORITE_COLUMN_ID],
        cell: ({ row }) => (
          <span
            className="flex justify-center"
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
          >
            <button
              type="button"
              disabled={pendingContactId === row.original.id}
              aria-pressed={row.original.isFavorite}
              aria-label={
                row.original.isFavorite
                  ? `Remove ${row.original.name} from favorites`
                  : `Add ${row.original.name} to favorites`
              }
              onClick={() => {
                void toggleFavorite(row.original)
              }}
              className="text-[var(--program-accent)] text-lg leading-none disabled:opacity-40"
            >
              {row.original.isFavorite ? "★" : "☆"}
            </button>
          </span>
        ),
        size: 48,
        minSize: 48,
        maxSize: 48,
        enableSorting: false,
        meta: { grid: { align: "center" } },
      }),
    ]
  }, [
    locationNameById,
    locationRecords,
    payload.booksReadOptions,
    payload.staffNames,
    pendingContactId,
    setVisibleSelection,
    sourceOptions,
    toggleFavorite,
  ])
  /**
   * Column ids to their `meta.grid.fieldType`, read off the defs. The URL codec
   * needs this to give a bare, operator-less token the right meaning; declaring
   * it again here would be a second place for the same fact to go stale.
   */
  const fieldTypes = useMemo(
    () =>
      columns.reduce<Record<string, GridFieldType>>((types, definition, index) => {
        const id = definition.id ?? COLUMN_IDS[index]
        const fieldType = definition.meta?.grid?.fieldType

        if (fieldType && id) {
          types[id] = fieldType
        }

        return types
      }, {}),
    [columns],
  )


  /**
   * URL-backed grid state. Declared after the column defs because the codec reads
   * their `fieldType` to give a bare, operator-less filter token its meaning, and
   * nothing between here and there reads the state it produces.
   */
  const {
    state: viewState,
    filterConnective,
    onStateChange,
    setFilterConnective,
    clearFilters,
    beginTransientChange,
    commitTransientChange,
    cancelTransientChange,
  } = useGridViewState({
    columnIds: COLUMN_IDS,
    fieldTypes,
    defaultHiddenColumnIds: GRID_DEFAULT_HIDDEN_COLUMNS,
  })

  const selectedCount = useMemo(
    () =>
      contacts.reduce(
        (total, contact) => total + (rowSelection[contact.id] === true ? 1 : 0),
        0,
      ),
    [contacts, rowSelection],
  )

  /**
   * The row lifecycle the grid renders against.
   *
   * `createRow` appends to this component's own mirror rather than to anything
   * the grid holds: `rows` is a prop, so the grid cannot append to it, and a
   * second row set inside the primitive would be a second source of truth for
   * what the operator is looking at.
   *
   * `createRow` returns the draft's client-side id, which is what the grid
   * focuses. The row is promoted to a server id by `handleCellCommit` when the
   * create resolves, in place, so the position the operator is looking at does
   * not move under them.
   */
  const rowLifecycle = useMemo<GridRowLifecycle<ManageContact>>(
    () => ({
      createRow: () => {
        const row = createDraftContact()

        setContacts((current) => ({ ...current, rows: [...current.rows, row] }))

        return { id: row.id, row }
      },
      getRowLabel: (contact) => contact.name,
      onDeleteRow: async (contact) => {
        // A draft row was never written, so removing it is local work and must
        // not issue a request against an id the database has never seen.
        if (isDraftRowId(contact.id)) {
          return
        }

        await deleteContact(contact.id)
      },
      // Disabled rather than absent while a draft is open: one blank row at a
      // time, because two would race for the same missing required fields and
      // the operator would have no way to tell which one the create failed on.
      canCreate: !contacts.some((contact) => isDraftRowId(contact.id)),
    }),
    [contacts, deleteContact],
  )

  const handleRowRemoved = useCallback((rowId: string) => {
    setContacts((current) => ({
      ...current,
      rows: current.rows.filter((contact) => contact.id !== rowId),
    }))
    // A deleted row cannot stay selected: the selection is keyed by the same id
    // the row had, and leaving it would make the header count a row that is gone.
    setRowSelection((current) => {
      if (current[rowId] === undefined) {
        return current
      }

      const next = { ...current }
      delete next[rowId]
      return next
    })
  }, [])

  /**
   * The status row's readout, derived from the same mirror the grid holds.
   *
   * **One number, one basis.** At rest it is the record count the table holds;
   * the moment a row is selected that same spot carries the selection, because
   * two counts side by side is a comparison the operator did not ask to make.
   * The totals follow the same basis, so the attendance total is the total in
   * scope or the total of what is selected — never a mixture of the two.
   */
  const statusSummary = useMemo(() => {
    if (selectedCount > 0) {
      return {
        label: `${selectedCount} selected`,
        rows: contacts.filter((contact) => rowSelection[contact.id] === true),
      }
    }

    return { label: `${contacts.length} records`, rows: contacts }
  }, [contacts, rowSelection, selectedCount])

  /** The number-field totals, over the rows the readout is describing. */
  const aggregateByColumnId = useMemo(() => {
    const sums = new Map<string, number>()

    for (const { columnId, key } of NUMBER_AGGREGATE_FIELDS) {
      sums.set(
        columnId,
        // The ids double as the row keys, which is why no cast is needed: both
        // number fields are already numbers on `ManageContact`.
        statusSummary.rows.reduce((total, row) => total + row[key], 0),
      )
    }

    return sums
  }, [statusSummary])

  /*
   * `flex min-h-0 flex-1 flex-col` — the last hop before the grid, and the one
   * that makes the grid's `flex-1` mean anything. `space-y-3` → `gap-3` is the
   * same rhythm. The `role="status"` notice is *above* the grid, so it stays
   * visible in a bounded layout rather than scrolling out with the rows. The
   * status row is the grid's own footer: see `renderFooterCell` for why it
   * cannot live below the table.
   */
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {notice ? (
        <p
          role="status"
          className={
            notice.kind === "error"
              ? "shrink-0 text-sm font-medium text-red-700"
              : "shrink-0 text-sm font-medium text-[var(--muted-foreground)]"
          }
        >
          {notice.message}
        </p>
      ) : null}

      <Grid<ManageContact>
        rows={contacts}
        columns={columns}
        getRowId={(contact) => contact.id}
        state={{ ...viewState, rowSelection }}
        onStateChange={onStateChange}
        filterConnective={filterConnective}
        onFilterConnectiveChange={setFilterConnective}
        onRowSelectionChange={setRowSelection}
        ariaLabel="Contacts"
        density={density}
        onDensityChange={setDensity}
        transient={{
          begin: beginTransientChange,
          commit: commitTransientChange,
          cancel: cancelTransientChange,
        }}
        onCellCommit={handleCellCommit}
        onClearFilters={clearFilters}
        tableFooter={(column) =>
          renderFooterCell(column.columnId, statusSummary.label, aggregateByColumnId)
        }
        rowLifecycle={rowLifecycle}
        onRowRemoved={handleRowRemoved}
        rowContextMenu={ContactsRowContextMenu}
      />
    </div>
  )
}
