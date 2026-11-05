"use client"

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createColumnHelper } from "@tanstack/react-table"
import type { OnChangeFn, RowSelectionState, Table, TableState } from "@tanstack/react-table"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { ContactRecordDialog } from "@/components/manage/contact-record-dialog"
import type {
  ManageContact,
  ManageContactPatch,
  ManageContactPatchKey,
  ManageContactsPayload,
  ManageContactWriteResult,
} from "@/components/manage/manage-types"
import {
  CONTACT_FIELD_IDS,
  contactFieldValue,
  UNRESOLVED_LOCATION,
  UNRESOLVED_STAFF,
  type ContactFieldId,
} from "@/components/manage/manage-contact-fields"
import {
  describeContactCondition,
  filterContactsForPhone,
} from "@/components/manage/manage-contact-filter"
import { ManageContactList } from "@/components/manage/manage-contact-list"
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
import {
  createFilterGroup,
  filterGroupKey,
  filterGroupToSerialized,
  flattenConditions,
  type GridFilterGroup,
} from "@/components/grid/grid-filter-tree"
import {
  gridViewConfigToParams,
  type GridViewConfig,
} from "@/components/grid/grid-view-config"
import { applyGridParams, isGridParamKey } from "@/components/grid/grid-view-state"
import { useGridRowDragHandle } from "@/components/grid/grid-row-drag"
import { useGridRowPosition } from "@/components/grid/grid-row-position"
import { ManageViewsBar, type ViewSaveState } from "@/components/manage/manage-views-bar"
import {
  createContactViewRequest,
  deleteContactViewRequest,
  markContactViewUsed,
  updateContactViewRequest,
} from "@/components/manage/manage-views-client"
import {
  suggestContactViewName,
  type ContactViewVisibility,
  type ManageContactView,
} from "@/components/manage/manage-view-types"
import { useDeviceView } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { GripVertical, Maximize2, MessageSquareText } from "lucide-react"

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
const VIEW_SIDEBAR_STORAGE_KEY = "hkmc.contacts.viewSidebarConfig"
const NAME_COLUMN_ID = CONTACT_FIELD_IDS.name
const PHONE_COLUMN_ID = CONTACT_FIELD_IDS.phone
const LOCATION_COLUMN_ID = CONTACT_FIELD_IDS.location
const SOURCE_COLUMN_ID = "source"
const BOOKS_READ_COLUMN_ID = "booksRead"
const INITIAL_CONTACT_COLUMN_ID = CONTACT_FIELD_IDS.initialContact
const DATE_OF_BIRTH_COLUMN_ID = "dateOfBirth"
const TOTAL_COLUMN_ID = CONTACT_FIELD_IDS.totalAttendance
const PAST_60_COLUMN_ID = CONTACT_FIELD_IDS.past60DayAttendance
const LAST_CONTACTED_COLUMN_ID = "lastContactedOn"
const NOTES_COLUMN_ID = CONTACT_FIELD_IDS.notes
const COLLECTED_BY_COLUMN_ID = CONTACT_FIELD_IDS.collectedBy
const FAVORITE_COLUMN_ID = CONTACT_FIELD_IDS.favorite

/*
 * `UNRESOLVED_LOCATION` and `UNRESOLVED_STAFF` live in
 * `manage-contact-fields.ts` now, because the contact surface renders the same
 * two references and the marker has to be the same marker in both places.
 *
 * What a `locationIds` / `collectedById` reference that resolves to nothing
 * renders as is a marker, not the id and not a guess derived from it. A contact
 * with no location and a contact whose location row is gone are *different
 * facts*, and both the empty string and the raw UUID collapse them: one hides
 * the dangling reference entirely, the other prints a database identifier at an
 * operator and tells them nothing about what to do next.
 *
 * The wording lives outside the grid because the primitive has no vocabulary
 * for a location. `meta.grid.unresolvedText` carries the value to the `linked`
 * renderer, which marks the cell rather than matching a shape — so rewording
 * the string cannot silently stop the marker being recognised.
 */

/**
 * What the status line says when `+ Add record` appends a row no active filter
 * can match.
 *
 * A constant because two places have to agree on it: the report itself, and the
 * filter-change effect that clears it — and only it — when the state it
 * describes is gone.
 */
const FILTERED_DRAFT_NOTICE =
  "The new record is hidden by the current filters. Clear the filters to edit it."

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
function createDraftContact(assignedPreacherId: string, collectedById: string): ManageContact {
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
    // The create stamps ownership and attribution separately: the contact
    // belongs to the patch owner and records the actor as its collector.
    assignedPreacherId,
    collectedById,
    totalAttendanceCount: 0,
    past60DayAttendanceCount: 0,
    // A row that has never existed has no thread either.
    commentCount: 0,
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

/**
 * Whether a draft carries enough to be written.
 *
 * `name` and `phone` are both `NOT NULL`, and `parseContactPatch` is the
 * authority that refuses a create missing either. This mirrors that rule —
 * trim, then require a non-empty string — so the client does not send a create
 * that can only come back `400`. It is a **gate, not a validation story**: the
 * server's wording is still the only message an operator ever sees, because a
 * draft that fails this check is not sent at all.
 */
function isDraftComplete(patch: ManageContactPatch): boolean {
  return (
    typeof patch.name === "string" &&
    patch.name.trim().length > 0 &&
    typeof patch.phone === "string" &&
    patch.phone.trim().length > 0
  )
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
        className="rounded-[3px]"
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
        className="text-[var(--grid-footer-ink)] font-normal tabular-nums"
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
      className="text-[var(--grid-footer-ink)] block w-full text-right tabular-nums"
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
/**
 * Opens a record from a row. `Grid` renders `rowContextMenu` without props, so
 * the verb reaches the menu through context rather than through a prop the
 * primitive has no vocabulary for.
 */
/**
 * The row's expand affordance, in the leading gutter cell.
 *
 * The source product revealed a 24×24 `ArrowsOut` icon at the row's left edge
 * on hover, at `opacity: 0` the rest of the time, with the row number still
 * visible beside it. This is that icon: zero-opacity until the row is hovered,
 * and never removed from the accessibility tree.
 *
 * The reveal is an arbitrary variant on the ancestor `tr` rather than a
 * `group-hover` class, because adding `group` to the shared row would touch the
 * grid primitive for a consumer's affordance.
 */
function RowExpandButton({
  contactId,
  contactName,
  commentCount,
  onExpand,
}: {
  contactId: string
  contactName: string
  commentCount: number
  onExpand: (contactId: string) => void
}) {
  /**
   * A record with comments shows a count beside a speech bubble, permanently
   * visible — the source product kept that badge at `opacity: 1` while the
   * plain expand arrow stayed hover-only, because a count is information you
   * scan for rather than an action you go looking for. Both open the same
   * dialog; only the label changes.
   */
  const hasComments = commentCount > 0
  const label = hasComments
    ? `Expand to see ${commentCount} ${commentCount === 1 ? "comment" : "comments"}`
    : `Expand ${contactName}`

  return (
    <button
      type="button"
      // Pointer-only, like the source product's `expandRowWrapper` anchor:
      // `tabindex="-1"`, so Tab keeps moving between cells. The keyboard route
      // to the same dialog is the row context menu's "Expand record", which is
      // reachable with Shift+F10 / the Menu key.
      tabIndex={-1}
      aria-label={label}
      title={label}
      onClick={() => onExpand(contactId)}
      className={cn(
        "flex h-6 shrink-0 items-center justify-center rounded text-muted-foreground",
        hasComments
          ? "gap-1 px-1 text-[11px] leading-none hover:bg-muted hover:text-[var(--program-text)]"
          : "w-6 opacity-0 transition-opacity [tr:hover_&]:opacity-100",
        "hover:bg-muted hover:text-[var(--program-text)]",
        "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {hasComments ? (
        <>
          <span className="tabular-nums">{commentCount}</span>
          <MessageSquareText aria-hidden="true" className="size-4" />
        </>
      ) : (
        <Maximize2 aria-hidden="true" className="size-3.5" strokeWidth={2} />
      )}
    </button>
  )
}

/**
 * The grip that starts a row drag.
 *
 * `@dnd-kit/core`'s draggable rather than a hand-rolled pointer handler: the
 * grid already runs one `DndContext` for column drags, and a second gesture
 * system on the same surface would fight it for the pointer.
 *
 * Hidden until the row is hovered, like the source product's grab handle, so
 * the row number owns that space at rest.
 */
function RowDragHandle({
  contactName,
  disabled,
}: {
  contactName: string
  disabled: boolean
}) {
  /**
   * The activator lives on the row, not here: `GridRow` calls `useSortable`
   * because the row has to be both the draggable node and its own drop slot.
   * This grip only receives the props that start the gesture, so the row never
   * drags from a text selection or a cell click.
   */
  const drag = useGridRowDragHandle()
  const isDisabled = disabled || drag === null

  return (
    <button
      {...(drag?.attributes ?? {})}
      {...(drag?.listeners ?? {})}
      type="button"
      tabIndex={-1}
      aria-label={`Reorder ${contactName}`}
      title={disabled ? "Clear the sort to reorder rows" : "Drag to reorder"}
      disabled={isDisabled}
      className={cn(
        "flex w-3 shrink-0 items-center justify-center text-muted-foreground",
        "opacity-0 transition-opacity [tr:hover_&]:opacity-100",
        // A restricted gesture has to look restricted: the grip is still
        // visible on hover so the cursor says *why* nothing happens, rather
        // than the handle vanishing and leaving the operator to guess.
        isDisabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
      )}
    >
      <GripVertical aria-hidden="true" className="size-3" />
    </button>
  )
}

/**
 * The gutter's serial: the row's position in the current view.
 *
 * A component only because the position arrives through context and a column
 * definition's `cell` is a render callback, not a component.
 */
function RowSerial({ fallback }: { fallback: number }) {
  const position = useGridRowPosition()
  return <>{position ?? fallback}</>
}

const ContactRecordOpenContext = createContext<((contactId: string) => void) | null>(null)

function ContactsRowContextMenu({ rowIds }: GridRowContextMenuProps) {
  const lifecycle = useGridRowLifecycle()
  const openRecord = useContext(ContactRecordOpenContext)
  const count = rowIds.length

  return (
    <>
      <ContextMenuLabel className="text-[13px]">
        {count} selected row{count === 1 ? "" : "s"}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      {/*
        One row only: an expanded record is a single record, so offering the verb
        over a multi-row selection would need a choice the menu cannot make.
      */}
      {count === 1 && openRecord ? (
        <ContextMenuItem className="text-[13px]" onSelect={() => openRecord(rowIds[0])}>
          Expand record
        </ContextMenuItem>
      ) : null}
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
/**
 * Folds a server payload into the in-memory view list without discarding a
 * write the client has already made.
 *
 * A navigation re-renders the server component, and that read can finish before
 * an autosave it raced with lands. Replacing the list wholesale would then put
 * the view's *old* configuration back in memory: the grid keeps showing what the
 * URL says, but the next switch to that view writes the stale copy over it.
 * Newest `updatedAt` wins. A view created moments ago and not yet in the payload
 * is kept; one deleted here is never resurrected by an older payload.
 */
function mergeContactViews(
  current: readonly ManageContactView[],
  incoming: readonly ManageContactView[],
  removed: ReadonlySet<string>,
): ManageContactView[] {
  const localById = new Map(current.map((view) => [view.id, view]))
  const incomingIds = new Set(incoming.map((view) => view.id))
  const now = Date.now()

  const merged = incoming
    .filter((view) => !removed.has(view.id))
    .map((view) => {
      const local = localById.get(view.id)

      if (!local) {
        return view
      }

      return Date.parse(local.updatedAt) > Date.parse(view.updatedAt) ? local : view
    })

  for (const view of current) {
    if (incomingIds.has(view.id) || removed.has(view.id)) {
      continue
    }

    if (now - Date.parse(view.createdAt) > 30_000) {
      continue
    }

    merged.push(view)
  }

  return merged
}

function useReportRowCount(onRowCountChange: ((count: number) => void) | undefined, count: number): void {
  useEffect(() => {
    onRowCountChange?.(count)
  }, [count, onRowCountChange])
}

export function ManageContactsTable({
  payload,
  onRowCountChange,
  hideInlineCreate = false,
  views: viewsProp,
  lastViewId = null,
}: {
  payload: ManageContactsPayload
  onRowCountChange?: (count: number) => void
  /**
   * Whether the toolbar's `+ Add record` is rendered.
   *
   * The Contacts section has one create control — `Add contact`, which opens
   * the form — so it hides this one. The flag exists rather than the section
   * passing no `rowLifecycle` because delete lives on the same object; dropping
   * it to remove a create button would take the row context menu with it.
   */
  hideInlineCreate?: boolean
  /**
   * Saved views for this grid, in display order.
   *
   * Absent means the surface has no views: the bar is not rendered and the grid
   * behaves exactly as it did before views existed. Present-but-empty is a real
   * state — the programme has saved none yet — and still renders the bar, so
   * the create control has somewhere to live.
   */
  views?: ManageContactView[]
  /**
   * The view this person last opened, from the server. Used once, to reopen it
   * on a bare `/contacts/grid` — including on a machine this account has never
   * signed in from.
   */
  lastViewId?: string | null
}) {
  const [density, setDensity] = useState<GridDensity>(GRID_DEFAULT_DENSITY)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pendingContactId, setPendingContactId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  /**
   * Whether the saved-views sidebar is showing. Desktop only; the phone never
   * mounts it. Local to the visit rather than URL state because it is a way of
   * looking at the grid, not part of the shareable arrangement.
   */
  const [viewsSidebarOpen, setViewsSidebarOpen] = useState(true)

  /*
   * Airtable persists this preference across reloads. The shape mirrors the
   * reference's `{version, shouldExpandOnBaseOpen}` record so the two read the
   * same way; the read runs after mount, because reading storage during the
   * first render would make the server and client markup disagree.
   */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIEW_SIDEBAR_STORAGE_KEY)
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw) as { shouldExpandOnBaseOpen?: unknown }
      if (typeof parsed.shouldExpandOnBaseOpen === "boolean") {
        setViewsSidebarOpen(parsed.shouldExpandOnBaseOpen)
      }
    } catch {
      // A corrupt or unavailable store falls back to the default, open.
    }
  }, [])

  const toggleViewsSidebar = () => {
    setViewsSidebarOpen((open) => {
      const next = !open
      try {
        window.localStorage.setItem(
          VIEW_SIDEBAR_STORAGE_KEY,
          JSON.stringify({ version: 2, shouldExpandOnBaseOpen: next }),
        )
      } catch {
        // The preference is a convenience; a blocked store must not stop the
        // toggle from working for this visit.
      }
      return next
    })
  }
  /**
   * The record shown in the expanded dialog, if any.
   *
   * Held as an id rather than as the row, so a write that replaces the mirrored
   * row is reflected in the open dialog instead of leaving a stale copy behind
   * it. `null` means the grid is the whole surface.
   */
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null)

  /**
   * Which of the two contacts views this device takes.
   *
   * The viewport decides, and the decision is made *before* any of this
   * component's state: the grid is a spreadsheet of thirteen columns and the
   * contact list is a phone-shaped two-column stack, and only one of them can
   * be the right thing on a given screen. A phone cannot use the grid, and a
   * desktop does not want the list, so the operator is not asked to choose —
   * a button that offered the choice was the thing this replaced.
   *
   * `null` is the third answer: the server cannot know the viewport, so the
   * first render shows neither view rather than the wrong one, and the
   * container keeps its box while it waits.
   */
  const deviceView = useDeviceView()

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

  /**
   * The open record, resolved from the mirror on every render.
   *
   * `expandedIndex` is the row's position in the *current* order, which is what
   * makes the chevrons step through "records in view order" rather than through
   * the order the payload happened to arrive in.
   */
  const expandedIndex = expandedContactId
    ? contacts.findIndex((contact) => contact.id === expandedContactId)
    : -1
  const expandedContact = expandedIndex >= 0 ? contacts[expandedIndex] : null

  /**
   * The create in flight for a draft row.
   *
   * A draft keeps its client id until the create answers, so a commit that
   * lands in that window still looks like a draft commit. Picking a location
   * right after the phone field starts the create is exactly that case, and
   * sending a second create from it is what made the location look
   * unselectable: the server answered `409 duplicate`, the revert landed on a
   * row id that no longer existed, and the value vanished without a message.
   * One create at a time — values committed meanwhile become a follow-up patch
   * against the id the server assigns.
   */
  const draftCreateRef = useRef<{
    rowId: string
    promise: Promise<ManageContactWriteResult>
    /** Values committed while the create was on the wire, keyed by patch key. */
    queued: ManageContactPatch
    /** Those cells' values before their commits, so a failed follow-up reverts. */
    previous: ManageContactPatch
  } | null>(null)

  useReportRowCount(onRowCountChange, contacts.length)


  const locationNameById = useMemo(
    () => new Map(payload.locations.map((location) => [location.id, location.name])),
    [payload.locations],
  )

  /**
   * `collectedById` -> display name, with the actor and the patch owner always
   * present.
   *
   * `payload.staffNames` only covers ids the *loaded rows* reference, and a new
   * program can have no contact that references its first operator. The draft
   * row carries both the owner and the collector, so without this the cell
   * would render the unresolved marker for the person looking at it. The scope
   * entries are written last so they always win.
   */
  const staffNameById = useMemo(
    () =>
      new Map([
        ...Object.entries(payload.staffNames),
        ...(payload.scope.patchOwnerId
          ? [[payload.scope.patchOwnerId, payload.scope.patchOwnerName ?? payload.scope.patchOwnerId] as const]
          : []),
        [payload.scope.actorUserId, payload.scope.actorName] as const,
      ]),
    [
      payload.scope.actorName,
      payload.scope.actorUserId,
      payload.scope.patchOwnerId,
      payload.scope.patchOwnerName,
      payload.staffNames,
    ],
  )

  /**
   * The `linked` editor's record list for `location`.
   *
   * `payload.locations` is already the caller's scoped set — RLS narrowed it on
   * the read path — so the options and the scope cannot disagree. `detail` is the
   * location's status: the list shows a name and a status and nothing else.
   *
   * `locationOptions` is the section's narrower picker set: the section resolves
   * every program location for display but keeps the picker on the reader's own
   * locations, which is what `/manage?mode=preacher` did.
   */
  const locationRecords = useMemo(
    () =>
      (payload.locationOptions ?? payload.locations).map((location) => ({
        id: location.id,
        label: location.name,
        detail: location.status ?? undefined,
      })),
    [payload.locationOptions, payload.locations],
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
        // A commit on a draft row is how the row gets built, not how it gets
        // written: `name` and `phone` are both `NOT NULL`, so one commit can
        // never satisfy both and a create sent on the first field could only
        // come back `400 Phone is required.` — which is exactly the behaviour
        // that made the row look uneditable. Every value is buffered in the
        // mirror instead, and the create is sent by the commit that completes
        // the two required fields.
        const draft = commit.row
        const patch = buildCreatePatch(draft, commit.columnId, commit.value)

        // Accumulated *before* the completeness check, not after it: a buffered
        // value has to survive until a later commit carries it into the create.
        //
        // Keyed by the **patch key**, not the column id. `location` is the column
        // whose two names differ — its patch key is `locationIds` — and writing
        // `contact.location` used to leave `locationIds` untouched, so a
        // location picked on a draft never reached the create body.
        setContacts((current) => ({
          ...current,
          rows: current.rows.map((contact) =>
            contact.id === commit.rowId
              ? ({ ...contact, [patchKey]: commit.value } as ManageContact)
              : contact,
          ),
        }))

        // No request, no error, and the optimistic override stays: the cell
        // shows what was typed while the row is still local. `parseContactPatch`
        // remains the one place the required-field rules live — this only
        // decides when there is enough to send.
        if (!isDraftComplete(patch)) {
          return
        }

        // A create is already carrying this row. The body is on the wire, so
        // this value cannot join it; queue it for a patch against the id the
        // create is about to return rather than sending a second create. The
        // second create is what the server refuses as a duplicate phone — and
        // the refusal used to land on the draft id after promotion, so the
        // operator saw the pick disappear with no message at all.
        const inFlight = draftCreateRef.current

        if (inFlight?.rowId === commit.rowId) {
          inFlight.queued[patchKey] = commit.value

          if (!(patchKey in inFlight.previous)) {
            inFlight.previous[patchKey] = draftValueForColumn(draft, commit.columnId)
          }

          return
        }

        // The value this cell had *before* the commit, read from the draft the
        // grid handed us. On a failed create the grid reverts the cell to what
        // it showed, so the mirror has to go back too — otherwise the next
        // commit would carry a value the operator can no longer see into
        // another create attempt.
        const previousDraftValue = draftValueForColumn(draft, commit.columnId)
        const create = {
          rowId: commit.rowId,
          promise: createContact(patch),
          queued: {} as ManageContactPatch,
          previous: {} as ManageContactPatch,
        }

        draftCreateRef.current = create

        try {
          const written = await create.promise

          // Promoted in place: the draft row is replaced by the row the server
          // made, keeping its position, so the operator's focus — which the grid
          // re-keys onto the new id — does not jump. `queued` is painted over
          // the response because it was committed after the body was built and
          // the server has not heard of it yet; without it the cells would blink
          // back while the follow-up request is on the wire.
          setContacts((current) => ({
            ...current,
            rows: current.rows.map((contact) =>
              contact.id === commit.rowId
                ? ({ ...contact, ...written, ...create.queued } as ManageContact)
                : contact,
            ),
          }))

          // Drained in a loop rather than once: a commit can still land on the
          // draft id between the response and the promotion's render, and it
          // must not be left in `queued` after this function lets go of it.
          while (Object.keys(create.queued).length > 0) {
            const queued = create.queued
            const previous = create.previous

            create.queued = {}
            create.previous = {}

            try {
              applyWrite(await patchContact(written.id, queued))
            } catch (cause) {
              // The row itself exists — only the values committed while the
              // create was in flight failed. Restore the cells to the server's
              // row and report; the grid's revert is keyed to the draft id,
              // which no longer names a row.
              setContacts((current) => ({
                ...current,
                rows: current.rows.map((contact) =>
                  contact.id === written.id
                    ? ({ ...contact, ...previous } as ManageContact)
                    : contact,
                ),
              }))
              setNotice({
                kind: "error",
                message:
                  cause instanceof Error ? cause.message : "The change could not be saved.",
              })
              break
            }
          }
        } catch (cause) {
          setContacts((current) => ({
            ...current,
            rows: current.rows.map((contact) =>
              contact.id === commit.rowId
                ? ({ ...contact, [patchKey]: previousDraftValue } as ManageContact)
                : contact,
            ),
          }))

          // Re-thrown unchanged: the grid's revert and status line are the one
          // error surface, and they need the server's own message.
          throw cause
        } finally {
          if (draftCreateRef.current === create) {
            draftCreateRef.current = null
          }
        }

        return
      }
      applyWrite(await patchContact(commit.rowId, { [patchKey]: commit.value }))
    },
    [applyWrite, createContact, patchContact],
  )

  /**
   * The contact list's write.
   *
   * It is a **commit**, not a request: the list hands the value to the
   * grid's own commit path, so the optimistic update, the request, the
   * rollback and the rejection are the grid's. A second write path here would
   * be a second place where a contact is written and a second place where a
   * refused write has to be reported — which is the thing the grid pattern
   * exists to prevent.
   *
   * The `previousValue` is the value the field held before the edit, read the
   * same way the grid reads it, so a refused write reverts to what the
   * operator was looking at rather than to a guess.
   */
  const handleListCommit = useCallback(
    async (contactId: string, fieldId: ContactFieldId, value: unknown) => {
      const contact = contacts.find((row) => row.id === contactId)

      if (!contact) {
        return
      }

      try {
        await handleCellCommit({
          rowId: contactId,
          columnId: fieldId,
          row: contact,
          previousValue: contactFieldValue(contact, fieldId),
          value,
        })
      } catch (cause) {
        // The grid's own commits report a refusal through `onEditError`, which
        // the grid turns into a cell revert and a status line. The list is
        // not a grid, so it reports here — on the same notice, in the same
        // words, so there is one error story rather than two.
        setNotice({
          kind: "error",
          message: cause instanceof Error ? cause.message : "The change could not be saved.",
        })
      }
    },
    [contacts, handleCellCommit],
  )

  const toggleFavorite = useCallback(
    async (contact: ManageContact) => {
      setPendingContactId(contact.id)
      setNotice(null)

      try {
        const written = await patchContact(contact.id, { isFavorite: !contact.isFavorite })
        applyWrite(written)
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
          // Three aligned slots: the grip, the checkbox, the expand control.
          // `w-full px-1` is load-bearing: the header's custom-header wrapper
          // centres its child inside `px-1`, while a body cell is `px-2`. Filling
          // the box and adding the missing 4px makes both start at the same
          // offset, so select-all sits exactly over the row checkboxes (and over
          // the serial numbers they replace).
          <span className="flex w-full items-center gap-1 px-1">
            <span aria-hidden="true" className="w-3 shrink-0" />
            <span className="flex w-4 shrink-0 justify-center">
              <SelectAllControl table={table} onToggle={setVisibleSelection} />
            </span>
            <span aria-hidden="true" className="w-8 shrink-0" />
          </span>
        ),
        cell: ({ row, table }) => {
          const selected = row.getIsSelected()
          // A sorted view owns row placement, so a manual drop cannot be shown:
          // the grip stays put and refuses, which is a clearer answer than a
          // drag that silently changes an order nobody can see.
          const sortActive = (table.getState().sorting?.length ?? 0) > 0

          return (
            <span
              className="flex items-center gap-1"
              onPointerDown={(event) => {
                // Without this the cell takes the pointer, the grid moves cell focus
                // to a non-editable column, and the next double-click becomes a no-op.
                event.stopPropagation()
              }}
            >
              <RowDragHandle contactName={row.original.name} disabled={sortActive} />

              {/*
                The source product's gutter holds one 16px slot, not two: the
                row number at rest, the selection checkbox once the row is
                hovered or selected. Both were measured at the same x.
              */}
              {selected ? (
                <span className="flex w-4 shrink-0 justify-center">
                  <Checkbox
                    className="rounded-[3px]"
                    checked
                    onCheckedChange={(checked) => {
                      row.toggleSelected(checked === true)
                    }}
                    aria-label={`Select ${row.original.name}`}
                  />
                </span>
              ) : (
                <>
                  <span className="w-4 shrink-0 text-center text-[12px] tabular-nums text-[var(--grid-row-number-ink)] [tr:hover_&]:hidden">
                    <RowSerial fallback={row.index + 1} />
                  </span>
                  <span className="hidden w-4 shrink-0 justify-center [tr:hover_&]:flex">
                    <Checkbox
                      className="rounded-[3px]"
                      checked={false}
                      onCheckedChange={(checked) => {
                        row.toggleSelected(checked === true)
                      }}
                      aria-label={`Select ${row.original.name}`}
                    />
                  </span>
                </>
              )}

              <span className="flex w-8 shrink-0 justify-center">
                <RowExpandButton
                  contactId={row.original.id}
                  contactName={row.original.name}
                  commentCount={row.original.commentCount}
                  onExpand={setExpandedContactId}
                />
              </span>
            </span>
          )
        },
        // Padding (16) + grip (12) + slot (16) + expand (32) and two 4px gaps.
        // 84 matches the source product's row-actions cell, and the fixed value
        // is what the next column's pinned offset is computed from.
        size: 84,
        minSize: 84,
        maxSize: 84,
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
            ? (staffNameById.get(contact.collectedById) ?? UNRESOLVED_STAFF)
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
              className="text-[var(--grid-star)] text-lg leading-none disabled:opacity-40"
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
    pendingContactId,
    setExpandedContactId,
    setVisibleSelection,
    sourceOptions,
    staffNameById,
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


  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /**
   * The view the operator is working in.
   *
   * Set the moment a view is chosen, not when the navigation lands: a grid edit
   * made during that round trip still belongs to the view that was picked, and
   * `searchParams` will not name it yet.
   */
  const [selectedViewId, setSelectedViewId] = useState<string | null>(() => searchParams.get("view"))

  /** The view id every grid write must keep, whatever its `searchParams` snapshot says. */
  const stickyParams = useMemo(
    () => (selectedViewId ? { view: selectedViewId } : undefined),
    [selectedViewId],
  )

  /**
   * URL-backed grid state. Declared after the column defs because the codec reads
   * their `fieldType` to give a bare, operator-less filter token its meaning, and
   * nothing between here and there reads the state it produces.
   */
  const {
    state: viewState,
    filterTree,
    onStateChange,
    onFilterTreeChange,
    clearFilters,
    beginTransientChange,
    commitTransientChange,
    cancelTransientChange,
  } = useGridViewState({
    columnIds: COLUMN_IDS,
    fieldTypes,
    defaultHiddenColumnIds: GRID_DEFAULT_HIDDEN_COLUMNS,
    stickyParams,
  })

  /*
   * Saved views.
   *
   * The URL stays the single source of truth for what the grid is showing; a
   * saved view is a snapshot written into it. Selecting a view therefore
   * *replaces* every grid-owned key with that view's, rather than merging: a
   * merge would let the sort of the view you just left survive into the one you
   * opened, which is the same as not having per-view sort at all.
   */
  const viewsAvailable = viewsProp !== undefined

  const [views, setViews] = useState<ManageContactView[]>(() => viewsProp ?? [])
  const [viewsSource, setViewsSource] = useState<ManageContactView[] | undefined>(viewsProp)
  const [saveState, setSaveState] = useState<ViewSaveState>("idle")
  /** Views deleted here, so a payload read before the delete cannot bring one back. */
  const removedViewIdsRef = useRef<Set<string>>(new Set())

  if (viewsProp !== viewsSource) {
    setViewsSource(viewsProp)
    setViews((current) => mergeContactViews(current, viewsProp ?? [], removedViewIdsRef.current))
  }

  const activeViewId = searchParams.get("view")
  const activeView = activeViewId
    ? views.find((view) => view.id === activeViewId) ?? null
    : null

  /**
   * Which view's configuration the URL was last seeded from.
   *
   * Claimed only after the effect has seen that view in `searchParams` — never
   * when a navigation is merely requested. Claiming on request was the defect:
   * if the push to the new view was superseded (a late render re-ran this
   * effect while the URL still named the old view), the guard was already
   * pointing at the new id, the effect saw a mismatch, and it re-applied the
   * OLD view's stored configuration over the URL — which the autosave then
   * wrote back to that view, erasing the change the operator had just made.
   */
  const hydratedViewRef = useRef<string | null>(null)
  /**
   * Whether the landing URL carried grid keys of its own.
   *
   * A link with `?f.status=contains:Invited&view=…` is a shared arrangement of
   * that view, and the first hydration must not overwrite it — that is the whole
   * point of the link. Read once, so a later switch still replaces everything.
   */
  const landingHadGridKeysRef = useRef<boolean | null>(null)

  if (landingHadGridKeysRef.current === null) {
    landingHadGridKeysRef.current = [...searchParams.keys()].some(isGridParamKey)
  }

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * The edit the operator has made and the view it belongs to.
   *
   * Recorded by the edit handlers themselves, not by an effect watching the
   * URL. Both `useSearchParams` and `window.location` lag `router.push` by a
   * server round trip, so at the moment a view is switched away from, neither
   * can be trusted to hold the sort or filter the operator just applied. The
   * handler is the only place that knows the arrangement for certain.
   */
  const pendingSaveRef = useRef<{ viewId: string; config: GridViewConfig } | null>(null)

  /**
   * Writes a config to the view it belongs to.
   *
   * One function for the debounced save and the flush, so a flushed save and a
   * settled one cannot disagree about what "saved" means.
   */
  const saveViewConfig = useCallback(async (viewId: string, config: GridViewConfig) => {
    try {
      const updated = await updateContactViewRequest(viewId, { config })

      setViews((current) => current.map((view) => (view.id === updated.id ? updated : view)))
      setSaveState("saved")
    } catch {
      setSaveState("error")
    }
  }, [])

  /**
   * Queues the arrangement the operator just produced.
   *
   * `autosaveMs` is the quiet period before it is written. The queue holds one
   * entry: the newest edit replaces the one before it, because a view stores a
   * whole configuration and only the last one is true.
   */
  const scheduleSave = useCallback(
    (config: GridViewConfig, viewId: string | null = selectedViewId) => {
      if (!viewId) {
        return
      }

      pendingSaveRef.current = { viewId, config }

      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
      }

      setSaveState("saving")

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        const pending = pendingSaveRef.current
        pendingSaveRef.current = null

        if (pending) {
          void saveViewConfig(pending.viewId, pending.config)
        }
      }, 800)
    },
    [saveViewConfig, selectedViewId],
  )

  /**
   * Writes whatever is queued, right now.
   *
   * Called when the operator leaves a view and when the surface unmounts: the
   * edit already happened, and moving to another view is not a reason to drop
   * it back to the stored one.
   */
  const flushPendingSave = useCallback(() => {
    const pending = pendingSaveRef.current

    pendingSaveRef.current = null

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (pending) {
      void saveViewConfig(pending.viewId, pending.config)
    }
  }, [saveViewConfig])

  const currentConfig = useMemo<GridViewConfig>(
    () => ({
      sorting: viewState.sorting ?? [],
      globalFilter: typeof viewState.globalFilter === "string" ? viewState.globalFilter : "",
      filter: flattenConditions(filterTree).length > 0 ? filterGroupToSerialized(filterTree) : null,
      columnOrder: viewState.columnOrder ?? [],
      hiddenColumnIds: Object.keys(viewState.columnVisibility ?? {}).filter(
        (id) => viewState.columnVisibility?.[id] === false,
      ),
      columnSizing: viewState.columnSizing ?? {},
      density,
    }),
    [density, filterTree, viewState],
  )

  const viewHref = useCallback(
    (view: ManageContactView) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("view", view.id)

      const query = applyGridParams(
        params,
        gridViewConfigToParams(view.config, COLUMN_IDS, {
          fieldTypes,
          defaultHiddenColumnIds: GRID_DEFAULT_HIDDEN_COLUMNS,
        }),
      ).toString()

      return query.length > 0 ? `${pathname}?${query}` : pathname
    },
    [fieldTypes, pathname, searchParams],
  )

  /**
   * Opens a view: its config replaces the grid's, and its row height its own.
   *
   * This writes the URL but does **not** mark the view as hydrated. Hydration
   * is a fact about what `searchParams` shows, and only the effect below can
   * observe it. Re-running the hydration for a view whose URL already matches is
   * harmless — the effect compares the href before writing — so the extra pass
   * costs nothing and the guard can never be wrong about a navigation that has
   * not landed yet.
   */
  const activateView = useCallback(
    (view: ManageContactView, mode: "push" | "replace" = "push") => {
      // The view being left may still owe a write; flush it before its URL is
      // replaced, or the edit dies with the timer that was going to send it.
      flushPendingSave()
      setSelectedViewId(view.id)
      setDensity(view.config.density)
      setSaveState("saved")
      markContactViewUsed(view.id)

      if (mode === "push") {
        router.push(viewHref(view), { scroll: false })
      } else {
        router.replace(viewHref(view), { scroll: false })
      }
    },
    [flushPendingSave, router, viewHref],
  )

  /*
   * Seeding the URL from the selected view.
   *
   * Skipped on the one landing that carried its own grid keys, and skipped once
   * a view has already been hydrated, so this is not a second writer racing the
   * one in `activateView`.
   */
  useEffect(() => {
    if (!viewsAvailable || !activeViewId || hydratedViewRef.current === activeViewId) {
      return
    }

    const view = views.find((entry) => entry.id === activeViewId)

    if (!view) {
      return
    }

    hydratedViewRef.current = view.id
    setSelectedViewId(view.id)
    setDensity(view.config.density)
    setSaveState("saved")
    markContactViewUsed(view.id)

    if (landingHadGridKeysRef.current) {
      landingHadGridKeysRef.current = false
      return
    }

    const href = viewHref(view)
    const current = searchParams.toString()

    if (href !== `${pathname}${current.length > 0 ? `?${current}` : ""}`) {
      router.replace(href, { scroll: false })
    }
  }, [activeViewId, pathname, payload.scope.programId, router, searchParams, viewHref, views, viewsAvailable])

  const selectView = useCallback(
    (viewId: string) => {
      const view = views.find((entry) => entry.id === viewId)

      if (view) {
        activateView(view)
      }
    },
    [activateView, views],
  )

  /** Back to the unsaved arrangement: no `view` and no grid keys at all. */
  const selectUnsaved = useCallback(() => {
    flushPendingSave()
    hydratedViewRef.current = null
    setSelectedViewId(null)
    setSaveState("idle")
    setDensity(GRID_DEFAULT_DENSITY)

    // `view` must go with the grid keys: leaving it would keep the view
    // selected, and the hydration effect would write its arrangement straight
    // back over the one the operator just asked for.
    const params = applyGridParams(new URLSearchParams(searchParams.toString()), {})
    params.delete("view")

    const query = params.toString()

    router.push(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [flushPendingSave, pathname, router, searchParams])

  const createView = useCallback(
    async (name: string, visibility: ContactViewVisibility) => {
      const created = await createContactViewRequest({ name, config: currentConfig, visibility })

      setViews((current) => [...current, created])
      activateView(created)
    },
    [activateView, currentConfig],
  )

  const renameView = useCallback(
    async (viewId: string, name: string) => {
      const updated = await updateContactViewRequest(viewId, { name })

      setViews((current) => current.map((view) => (view.id === updated.id ? updated : view)))
      setSaveState("saved")
    },
    [],
  )

  const duplicateView = useCallback(
    async (viewId: string) => {
      const source = views.find((view) => view.id === viewId)

      if (!source) {
        return
      }

      const created = await createContactViewRequest({
        name: `${source.name} copy`,
        config: currentConfig,
        // A copy belongs to whoever made it, even when the source is shared.
        visibility: source.visibility,
      })

      setViews((current) => [...current, created])
      activateView(created)
    },
    [activateView, currentConfig, views],
  )

  const deleteView = useCallback(
    async (viewId: string) => {
      // Nothing to flush *to* once the view is gone; a pending write would 404.
      pendingSaveRef.current = null

      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      await deleteContactViewRequest(viewId)
      removedViewIdsRef.current.add(viewId)

      const remaining = views.filter((view) => view.id !== viewId)
      setViews(remaining)

      if (activeViewId === viewId) {
        if (remaining.length > 0) {
          activateView(remaining[0], "replace")
        } else {
          selectUnsaved()
        }
      }
    },
    [activateView, activeViewId, selectUnsaved, views],
  )

  /*
   * The last view this operator opened, restored on a bare `/contacts/grid`.
   *
   * A landing link with grid keys is left alone: it is an arrangement, not a
   * request for "wherever I was last". Runs once per mount — the ref, not the
   * dependency list, is what guarantees that.
   */
  const restoredLastViewRef = useRef(false)

  useEffect(() => {
    if (!viewsAvailable || restoredLastViewRef.current) {
      return
    }

    restoredLastViewRef.current = true

    if (activeViewId || landingHadGridKeysRef.current) {
      return
    }

    const lastId = lastViewId

    if (!lastId) {
      return
    }

    const view = views.find((entry) => entry.id === lastId)

    if (view) {
      activateView(view, "replace")
    }
  }, [activateView, activeViewId, lastViewId, views, viewsAvailable])

  /*
   * A pending edit has to survive leaving the page, not just leaving the view.
   * The component is going away, so this writes directly and takes no state
   * with it.
   */
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
      }

      const pending = pendingSaveRef.current
      pendingSaveRef.current = null

      if (pending) {
        void updateContactViewRequest(pending.viewId, { config: pending.config }).catch(() => {})
      }
    }
  }, [])

  /**
   * A table state as the configuration a view stores.
   *
   * `currentConfig` reads the URL-derived state, which is right whenever it is
   * rendered but a beat behind an edit. This builds from the state the handler
   * was handed, which is the edit itself.
   */
  const configForState = useCallback(
    (
      state: Partial<TableState>,
      tree: GridFilterGroup,
      nextDensity: GridDensity = density,
    ): GridViewConfig => ({
      sorting: state.sorting ?? [],
      globalFilter: typeof state.globalFilter === "string" ? state.globalFilter : "",
      filter: flattenConditions(tree).length > 0 ? filterGroupToSerialized(tree) : null,
      columnOrder: state.columnOrder ?? [],
      hiddenColumnIds: Object.keys(state.columnVisibility ?? {}).filter(
        (id) => state.columnVisibility?.[id] === false,
      ),
      columnSizing: state.columnSizing ?? {},
      density: nextDensity,
    }),
    [density],
  )

  /**
   * Every edit path queues its own save, because every edit path knows the
   * configuration it produced. `onStateChange` covers sort, field visibility,
   * column order and width, search and row density; the filter tree and
   * "Clear all" have writers of their own and are queued here too.
   */
  const handleGridStateChange = useCallback<OnChangeFn<TableState>>(
    (updater) => {
      const resolved =
        typeof updater === "function"
          ? (updater as (previous: Partial<TableState>) => Partial<TableState>)(viewState)
          : updater

      scheduleSave(configForState(resolved, filterTree))
      onStateChange(updater)
    },
    [configForState, filterTree, onStateChange, scheduleSave, viewState],
  )

  const handleDensityChange = useCallback(
    (next: GridDensity) => {
      scheduleSave(configForState(viewState, filterTree, next))
      setDensity(next)
    },
    [configForState, filterTree, scheduleSave, viewState],
  )

  const handleFilterTreeChange = useCallback<typeof onFilterTreeChange>(
    (next, immediate) => {
      scheduleSave(configForState(viewState, next))
      onFilterTreeChange(next, immediate)
    },
    [configForState, onFilterTreeChange, scheduleSave, viewState],
  )

  const handleClearFilters = useCallback(() => {
    const cleared = configForState(viewState, createFilterGroup())

    scheduleSave({ ...cleared, sorting: [], globalFilter: "", filter: null })
    clearFilters()
  }, [clearFilters, configForState, scheduleSave, viewState])

  const selectedCount = useMemo(
    () =>
      contacts.reduce(
        (total, contact) => total + (rowSelection[contact.id] === true ? 1 : 0),
        0,
      ),
    [contacts, rowSelection],
  )

  /**
   * The phone list's rows: the same conditions the grid's row models apply,
   * evaluated over the same contact columns.
   *
   * The list is not a table, so this is the one place the two shapes share a
   * definition instead of a row model. A metric's row count is the invariant,
   * and a list that ignored the arriving `f.*` would report the whole scope.
   */
  const phoneRows = useMemo(
    () =>
      filterContactsForPhone({
        contacts,
        query: typeof viewState.globalFilter === "string" ? viewState.globalFilter : "",
        filterTree,
        fieldTypes,
        resolvers: { locationNameById, staffNameById },
      }),
    [contacts, fieldTypes, filterTree, locationNameById, staffNameById, viewState],
  )

  /** The chip's one-sentence-per-condition description. */
  const phoneFilterLabels = useMemo(() => {
    const labels = flattenConditions(filterTree)
      .map((condition) =>
        describeContactCondition(condition.columnId, condition, fieldTypes[condition.columnId]),
      )
      .filter((label): label is string => Boolean(label))

    const query = typeof viewState.globalFilter === "string" ? viewState.globalFilter.trim() : ""

    return query.length > 0 ? [`Search: ${query}`, ...labels] : labels
  }, [fieldTypes, filterTree, viewState])

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
        // Prefilled from the scope: the owner and the collector the server is
        // about to store, instead of values that only appear after a reload.
        const row = createDraftContact(
          payload.scope.patchOwnerId ?? payload.scope.actorUserId,
          payload.scope.actorUserId,
        )

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
      canCreate:
        Boolean(payload.scope.patchOwnerId) && !contacts.some((contact) => isDraftRowId(contact.id)),
    }),
    [
      contacts,
      deleteContact,
      payload.scope.actorUserId,
      payload.scope.patchOwnerId,
    ],
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
   * A completed row drag.
   *
   * The write carries **neighbours**, not a list: the server seats the row
   * between them and nothing else moves. The local mirror is reordered first so
   * the row stays where it was dropped while the request is in flight, and a
   * failure puts the whole previous order back rather than leaving the grid
   * claiming an order the database does not have.
   */
  const handleRowReorder = useCallback(
    (draggedId: string, targetId: string, placement: "before" | "after") => {
      const from = contacts.findIndex((contact) => contact.id === draggedId)
      const to = contacts.findIndex((contact) => contact.id === targetId)

      if (from < 0 || to < 0 || from === to) {
        return
      }

      const without = contacts.filter((contact) => contact.id !== draggedId)
      const targetIndex = without.findIndex((contact) => contact.id === targetId)
      const insertAt = placement === "before" ? targetIndex : targetIndex + 1

      const beforeId = without[insertAt - 1]?.id ?? null
      const afterId = without[insertAt]?.id ?? null
      const previous = contacts

      const reordered = [...without]
      reordered.splice(insertAt, 0, contacts[from])

      setContacts((current) => ({ ...current, rows: reordered }))

      void (async () => {
        try {
          const response = await fetch("/api/manage/contacts/order", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contactId: draggedId, beforeId, afterId }),
          })

          if (!response.ok && response.status !== 204) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null
            throw new Error(readError(payload, "Unable to save the new order."))
          }
        } catch (cause) {
          setContacts((current) => ({ ...current, rows: previous }))
          setNotice({
            kind: "error",
            message:
              cause instanceof Error ? cause.message : "Unable to save the new order.",
          })
        }
      })()
    },
    [contacts],
  )

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

  /**
   * The filtered-draft report.
   *
   * Stable identity is load-bearing: `Grid`'s pending-focus effect lists
   * `onUnreachableNewRow` as a dependency, and the effect can only report by
   * setting this notice — so a fresh closure each render would re-run the
   * effect on the render the notice caused, report again, and loop.
   */
  const handleUnreachableNewRow = useCallback(() => {
    // The row was appended but no filter can match it, so it is on screen
    // nowhere and cannot be filled in — and because `canCreate` is false while a
    // draft exists, the operator would otherwise be stuck with an add control
    // that does nothing. Naming the cause is the only action available from
    // here; clearing the filters is one click away in the toolbar.
    setNotice({ kind: "error", message: FILTERED_DRAFT_NOTICE })
  }, [])

  /**
   * A filter change invalidates the filtered-draft notice.
   *
   * The notice describes a state — "a filter is hiding your new row" — and the
   * moment that state changes it is stale. Only that notice is cleared: a
   * failed write's message is about a write, not about the filters, and
   * discarding it because the operator typed in the search box would hide the
   * one thing they need to read. Keyed on a signature rather than on the state
   * objects because `useGridViewState` hands back fresh arrays, and a
   * dependency on those would fire on every render.
   */
  const filterSignature = `${viewState.globalFilter}\u0000${filterGroupKey(filterTree)}`

  useEffect(() => {
    setNotice((current) => (current?.message === FILTERED_DRAFT_NOTICE ? null : current))
  }, [filterSignature])

  /*
   * One row: the saved-views sidebar beside the grid, as the reference lays it
   * out. The sidebar is rendered only on desktop, so the phone keeps the
   * single-column list it had. The inner column is the last hop before the
   * grid, and `min-w-0` is what lets the grid shrink beside a fixed-width
   * sidebar instead of forcing the page wider.
   *
   * The `role="status"` notice stays *above* whichever view is showing, so it
   * remains visible in a bounded layout rather than scrolling out with the
   * rows. The status row is the grid's own footer: see `renderFooterCell` for
   * why it cannot live below the table.
   *
   * The container keeps its box whatever the device view is, so the page does
   * not jump while the viewport is still being found.
   */
  return (
    <div className="relative flex min-h-0 flex-1">
      {viewsAvailable && deviceView === "desktop" ? (
        <ManageViewsBar
          views={views}
          activeView={activeView}
          saveState={saveState}
          defaultName={suggestContactViewName(views)}
          onSelectView={selectView}
          onSelectUnsaved={selectUnsaved}
          onCreateView={createView}
          onRenameView={renameView}
          onDuplicateView={duplicateView}
          onDeleteView={deleteView}
          currentUserId={payload.scope.actorUserId}
          open={viewsSidebarOpen}
          onToggle={toggleViewsSidebar}
        />
      ) : null}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col gap-3",
          hideInlineCreate && "[&_[data-grid-add-record]]:hidden",
        )}
      >
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

        {/*
          The desktop view: the grid, untouched.

          Same columns, same write path, same keyboard model as before — the
          device detection only decides *which* view is on the screen, never
          what the grid does.
        */}
        {deviceView === "desktop" ? (
          <ContactRecordOpenContext.Provider value={setExpandedContactId}>
            <Grid<ManageContact>
              rows={contacts}
              columns={columns}
              getRowId={(contact) => contact.id}
              state={{ ...viewState, rowSelection }}
              onStateChange={handleGridStateChange}
              filterTree={filterTree}
              onFilterTreeChange={handleFilterTreeChange}
              onRowSelectionChange={setRowSelection}
              ariaLabel="Contacts"
              density={density}
              onDensityChange={handleDensityChange}
              transient={{
                begin: beginTransientChange,
                commit: commitTransientChange,
                cancel: cancelTransientChange,
              }}
              onCellCommit={handleCellCommit}
              onClearFilters={handleClearFilters}
              onUnreachableNewRow={handleUnreachableNewRow}
              tableFooter={(column) =>
                renderFooterCell(column.columnId, statusSummary.label, aggregateByColumnId)
              }
              rowLifecycle={rowLifecycle}
              onRowRemoved={handleRowRemoved}
              rowContextMenu={ContactsRowContextMenu}
              onRowReorder={handleRowReorder}
              className={
                viewsSidebarOpen ? undefined : "[&_[data-grid-toolbar]]:pl-[292px]"
              }
            />
          </ContactRecordOpenContext.Provider>
        ) : null}

        {/*
          The expanded record, over the grid. Rendered after the grid so it paints
          above it, and only on desktop — the phone view has its own record frame
          in `ManageContactList`, and two of them would be two answers to one
          question.
        */}
        {deviceView === "desktop" && expandedContact ? (
          <ContactRecordDialog
            contact={expandedContact}
            locations={payload.locationOptions ?? payload.locations}
            resolvers={{ locationNameById, staffNameById }}
            onCommit={(fieldId, value) => {
              void handleListCommit(expandedContact.id, fieldId, value)
            }}
            onClose={() => setExpandedContactId(null)}
            onPrevious={() => {
              if (expandedIndex > 0) {
                setExpandedContactId(contacts[expandedIndex - 1].id)
              }
            }}
            onNext={() => {
              if (expandedIndex >= 0 && expandedIndex < contacts.length - 1) {
                setExpandedContactId(contacts[expandedIndex + 1].id)
              }
            }}
            canGoPrevious={expandedIndex > 0}
            canGoNext={expandedIndex >= 0 && expandedIndex < contacts.length - 1}
          />
        ) : null}

        {/*
          The phone view: the contact list, and nothing else.

          The grid is **not mounted** underneath it — not hidden, not covered —
          so none of the grid's rows, its keyboard model or its virtualization
          reaches the accessibility tree or the tab order behind the list.

          The wrapper is `relative flex-1` so the list's `absolute inset-0` root
          fills the space under the notice line, and so the sheet and the record
          — both positioned against the list's own frame — still resolve
          against it.
        */}
        {deviceView === "mobile" ? (
          <div className="relative flex min-h-0 flex-1 flex-col">
            <ManageContactList
              contacts={phoneRows}
              locations={payload.locationOptions ?? payload.locations}
              resolvers={{ locationNameById, staffNameById }}
              onCommit={handleListCommit}
              activeFilters={phoneFilterLabels}
              onClearFilters={handleClearFilters}
              emptyScope={contacts.length === 0}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
