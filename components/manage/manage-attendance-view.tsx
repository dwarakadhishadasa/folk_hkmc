"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createColumnHelper } from "@tanstack/react-table"
import type { OnChangeFn, TableState } from "@tanstack/react-table"

import type { GridFilterCondition } from "@/components/grid/grid-filter-operators"
import { emptyCondition } from "@/components/grid/grid-filter-operators"
import {
  RECORD_REVIEW_DEFAULT_TABLE_STATE,
  RecordReview,
  RecordReviewCard,
  RecordReviewDetail,
  RecordReviewField,
  RecordReviewSection,
  type RecordReviewFieldDef,
} from "@/components/record-review"
import { ManageLocationFilter } from "@/components/manage/manage-location-filter"
import type { ManageAttendanceRecord, ManageContact, ManagePortalPayload } from "@/components/manage/manage-types"

/**
 * The URL key that carries the focused record.
 *
 * Airtable's interface puts the focused record in the URL — the page it opens
 * at `?jnA5D=rec…` — so a link names a record and not just a page. This is the
 * same affordance under a name that says what it holds. It is deliberately not
 * a grid parameter key: the grid owns `q`, `sort` and `f.*`, and a roster that
 * borrowed those keys would collide with the contacts table's own filters the
 * moment both surfaces were linked.
 */
const SELECTED_RECORD_PARAM = "rec"

const LOCATION_FIELD_ID = "location"

/**
 * The operator the location filter asks.
 *
 * "has any of" — a contact sits in at most one location
 * (`contacts.location_ids` carries a `CHECK (cardinality(…)) <= 1)` bound), so
 * the question is "is this contact's location one of the ticked ones". The
 * multiselect default is "has all of", which asks the contact to sit in EVERY
 * ticked location — a question no contact can answer — so the operator is
 * named rather than defaulted to.
 *
 * The constant is the registry's vocabulary: if the multiselect set ever
 * renames it, this constant and the operator labels in
 * `grid-filter-conditions.spec.ts` change together.
 */
const LOCATION_OPERATOR_ID = "hasAnyOf"

/**
 * A signed photo URL is short-lived, so it is refreshed before its TTL rather
 * than being left to expire under the operator. The value mirrors the TTL the
 * server mints with.
 */
const SIGNED_URL_REFRESH_MS = 50 * 60 * 1000

const columnHelper = createColumnHelper<ManageContact>()

/**
 * The Attendance tab as a record review: the roster of contacts on the left,
 * the focused contact's record on the right.
 *
 * This replaces the stacked list-then-detail table the tab used to render. The
 * arrangement is the Airtable interface's, and the reason to copy it is the
 * reason the two canvases are separate: the operator reads a contact's history
 * without losing their place in the list they are reading it from.
 *
 * What is carried over from the Airtable page it is modelled on:
 *
 * - a roster of **cards** — thumbnail, name, phone — rather than rows;
 * - a location filter and a search field above the roster;
 * - the roster sorted by sessions attended, descending, which is the order the
 *   Airtable page's list query used;
 * - a detail pane of **sections** — a summary, the records, the occupation —
 *   with a side-by-side label and value for each field;
 * - the focused record in the URL, so a link names a record.
 *
 * What is deliberately not carried over: the Airtable page's read-only
 * discipline. Its detail pane could not edit anything, and neither can this
 * one — the editing surface in this app is the contacts grid, and a second
 * write path for the same field would be the thing the grid pattern exists to
 * prevent.
 *
 * The location filter is NOT the Airtable page's condition builder, either.
 * The Airtable page asked for a field, an operator and a value; this tab
 * filters on one thing, and the list of locations IS the filter. The dropdown
 * writes the same condition the builder wrote, so the roster's filtering is
 * unchanged by the surface around it.
 *
 * WHAT THE DROPDOWN GIVES UP: the builder offered the whole multiselect
 * operator set, so an operator could ask "has none of these" or "is empty" —
 * "contacts with no location" was reachable before and is not reachable now.
 * That is the price of a filter that is one list of places, and it is a
 * price paid on purpose rather than by accident.
 */
export function ManageAttendanceView({ payload }: { payload: ManagePortalPayload }) {
  const searchParams = useSearchParams()

  /**
   * The table state: the sort, the filter conditions and the search text.
   *
   * The roster owns none of it — `RecordReview` is controlled, exactly as the
   * grid is — so this is where the view state lives. It is per-visit rather
   * than in the URL, because the Airtable interface's own URL carries the
   * focused record and nothing else: its search text and its sort are not in
   * the link either.
   */
  const [tableState, setTableState] = useState<TableState>(() => ({
    ...RECORD_REVIEW_DEFAULT_TABLE_STATE,
    // Airtable's list query sorted by total attendance, descending. The order
    // is the point: the roster is a "who has been slipping" list, and the
    // contacts with the fewest sessions are the ones an operator is looking for.
    sorting: [{ id: "attendance", desc: true }],
  }))

  /**
   * The focused record.
   *
   * Seeded from the URL so a shared link opens on the record it names, and
   * mirrored back into the URL so the link the operator copies names it too.
   * The write is `replaceState`, not a router navigation: a record change must
   * not re-run the server component, and `/manage` resolves the whole portal
   * payload on every navigation.
   */
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get(SELECTED_RECORD_PARAM))

  const handleSelectedIdChange = useCallback((next: string | null) => {
    setSelectedId(next)

    try {
      const url = new URL(window.location.href)
      if (next) {
        url.searchParams.set(SELECTED_RECORD_PARAM, next)
      } else {
        url.searchParams.delete(SELECTED_RECORD_PARAM)
      }
      window.history.replaceState(null, "", url.toString())
    } catch {
      // A history failure must never break the selection.
    }
  }, [])

  const locationNameById = useMemo(
    () => new Map(payload.locations.map((location) => [location.id, location.name])),
    [payload.locations],
  )

  const recordsByContact = useMemo(() => {
    const grouped = new Map<string, ManageAttendanceRecord[]>()
    for (const record of payload.attendance) {
      const bucket = grouped.get(record.contactId)
      if (bucket) {
        bucket.push(record)
      } else {
        grouped.set(record.contactId, [record])
      }
    }
    return grouped
  }, [payload.attendance])

  /**
   * The roster's view fields.
   *
   * These are what the roster can sort and filter on, and they are declared
   * once here so the sort control, the filter chip and the table model cannot
   * disagree about what a field is called.
   */
  const fields = useMemo<RecordReviewFieldDef<ManageContact>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        fieldType: "text",
        column: columnHelper.accessor("name", { id: "name" }),
      },
      {
        id: "phone",
        label: "Phone",
        fieldType: "text",
        column: columnHelper.accessor("phone", { id: "phone" }),
      },
      {
        id: "attendance",
        label: "Sessions attended",
        fieldType: "number",
        column: columnHelper.accessor((contact) => recordsByContact.get(contact.id)?.length ?? 0, {
          id: "attendance",
        }),
      },
      {
        id: LOCATION_FIELD_ID,
        label: "Location",
        fieldType: "multiselect",
        column: columnHelper.accessor(
          (contact) =>
            contact.locationIds
              .map((id) => locationNameById.get(id))
              .filter((name): name is string => typeof name === "string"),
          { id: LOCATION_FIELD_ID },
        ),
      },
    ],
    [locationNameById, recordsByContact],
  )

  /**
   * The location names the filter offers.
   *
   * De-duplicated, because `locations` carries no uniqueness constraint: two
   * rows may legitimately share a name, and the filter matches on NAME. Two
   * checkboxes reading the same name would tick together and read as one
   * location the operator chose twice.
   *
   * Ordered by name, because the payload arrives in `locations.id` order —
   * arbitrary to a reader — and a picker over human-named places is a list
   * someone reads. Blank names are dropped: a checkbox with no label is a
   * checkbox the operator cannot identify.
   */
  const locationNames = useMemo(
    () =>
      [...new Set(payload.locations.map((location) => location.name))]
        .filter((name) => name.trim().length > 0)
        .sort((left, right) => left.localeCompare(right)),
    [payload.locations],
  )

  /**
   * The ticked locations, read back out of the table state.
   *
   * TanStack splits a condition in two — the column id on the entry, the rest
   * of it in the value — and this is where the two are reunited, so the
   * dropdown reads the same condition the table filters on.
   *
   * The OPERATOR is checked before the value is read. A condition written with
   * a different operator is not this filter's condition, and showing its names
   * as ticked would be the dropdown claiming a state the roster does not have.
   */
  const selectedLocations = useMemo<string[]>(() => {
    const entry = (tableState.columnFilters ?? []).find((filter) => filter.id === LOCATION_FIELD_ID)
    const condition = entry?.value as GridFilterCondition | undefined

    if (!condition || condition.operator !== LOCATION_OPERATOR_ID) {
      return []
    }

    return Array.isArray(condition.value) ? condition.value : []
  }, [tableState.columnFilters])

  /**
   * The location selection, written into the table state.
   *
   * The condition is the same one the condition builder wrote — `hasAnyOf` over
   * the ticked names — so the roster filters exactly as it did before the
   * dropdown replaced the popover. An empty selection writes no condition at
   * all, rather than a condition with an empty list: a list is not a filter,
   * and a filter that matches everything while claiming to filter is the shape
   * this encoding exists to prevent.
   *
   * Only THIS tab's filter is touched. A roster that grows a second filter
   * must not have it cleared by a location change.
   */
  const handleLocationChange = useCallback((names: string[]) => {
    setTableState((previous) => ({
      ...previous,
      columnFilters: [
        ...(previous.columnFilters ?? []).filter((filter) => filter.id !== LOCATION_FIELD_ID),
        ...(names.length === 0
          ? []
          : [
              {
                id: LOCATION_FIELD_ID,
                value: {
                  ...emptyCondition(LOCATION_FIELD_ID, "multiselect", LOCATION_OPERATOR_ID),
                  value: names,
                },
              },
            ]),
      ],
    }))
  }, [])

  /**
   * The state write.
   *
   * `RecordReview` resolves an updater against the table's own state and
   * forwards the resolved object, so the object form is the one that arrives.
   * The updater form is handled too, and resolved against a complete state
   * rather than a partial one, because the updaters TanStack builds read keys
   * a partial does not carry.
   */
  const handleStateChange = useCallback<OnChangeFn<TableState>>((updater) => {
    setTableState((previous) => {
      if (typeof updater === "function") {
        return updater(previous)
      }

      return { ...previous, ...updater }
    })
  }, [])

  /**
   * The selected contact's photo.
   *
   * Photos live in a private bucket, so the URL is a short-lived signed one
   * minted per contact. Minting one per card would mean a request per card in
   * the roster, so only the focused record's photo is fetched — the roster
   * shows the placeholder tile the Airtable interface also shows for a record
   * with no photo, and the photo follows the focus.
   */
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoUrlVersion, setPhotoUrlVersion] = useState(0)

  const selectedContact = useMemo(
    () => payload.contacts.find((contact) => contact.id === selectedId) ?? null,
    [payload.contacts, selectedId],
  )

  useEffect(() => {
    let cancelled = false

    if (!selectedContact?.photoPath) {
      setPhotoUrl(null)
      return () => {
        cancelled = true
      }
    }

    const load = async () => {
      try {
        const response = await fetch(
          `/api/manage/contacts/photo?contactId=${encodeURIComponent(selectedContact.id)}`,
          { cache: "no-store" },
        )

        if (!response.ok) {
          if (!cancelled) {
            setPhotoUrl(null)
          }
          return
        }

        const body = (await response.json()) as { url?: string }
        if (cancelled) {
          return
        }

        if (typeof body.url === "string" && body.url) {
          setPhotoUrl(body.url)
        } else {
          setPhotoUrl(null)
        }
      } catch {
        if (!cancelled) {
          setPhotoUrl(null)
        }
      }
    }

    void load()

    /*
      The refresh is a version bump rather than a state write. The effect's
      dependencies are the record and the version, so writing a state the effect
      depends on would re-enter the effect forever; bumping the version re-runs
      it once, which mints a fresh URL.
    */
    const refreshTimer = window.setTimeout(() => {
      setPhotoUrlVersion((version) => version + 1)
    }, SIGNED_URL_REFRESH_MS)

    return () => {
      cancelled = true
      window.clearTimeout(refreshTimer)
    }
  }, [selectedContact?.id, selectedContact?.photoPath, photoUrlVersion])

  const renderCard = useCallback(
    (contact: ManageContact) => {
      const isFocused = contact.id === selectedId

      return (
        <RecordReviewCard
          title={contact.name}
          subtitle={contact.phone || "No phone"}
          thumbnail={
            isFocused && photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                className="size-9 rounded-[6px] object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="size-9 rounded-[6px] bg-muted"
              />
            )
          }
        />
      )
    },
    [photoUrl, selectedId],
  )

  const renderDetail = useCallback(
    (contact: ManageContact | null) => {
      if (!contact) {
        return null
      }

      const records = recordsByContact.get(contact.id) ?? []
      const locations = contact.locationIds
        .map((id) => locationNameById.get(id))
        .filter((name): name is string => typeof name === "string")

      return (
        <RecordReviewDetail
          title={contact.name}
          subtitle={[contact.phone || "No phone", locations.length > 0 ? locations.join(", ") : "No location"]
            .filter((part) => part.length > 0)
            .join(" · ")}
        >
          <RecordReviewSection title="Attendance">
            <RecordReviewField label="Number of sessions attended in past 2 months">
              {contact.past60DayAttendanceCount.toLocaleString("en-IN")}
            </RecordReviewField>
            <RecordReviewField label="Total sessions attended">
              {contact.totalAttendanceCount.toLocaleString("en-IN")}
            </RecordReviewField>
          </RecordReviewSection>

          <RecordReviewSection title="Records">
            {records.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No attendance records for this contact.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {records.map((record) => (
                  <li key={record.id} className="flex items-center justify-between gap-4 py-1.5">
                    <span className="truncate text-[13px] text-[var(--program-text)]">
                      {record.sessionName ?? "Untitled session"}
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                      {record.sessionDate ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </RecordReviewSection>

          <RecordReviewSection title="Occupation">
            <RecordReviewField label="College">{contact.college || "—"}</RecordReviewField>
            <RecordReviewField label="Company">{contact.company || "—"}</RecordReviewField>
          </RecordReviewSection>
        </RecordReviewDetail>
      )
    },
    [locationNameById, recordsByContact],
  )

  return (
    <RecordReview
      title="Attendance"
      listLabel="Contacts"
      items={payload.contacts}
      fields={fields}
      state={tableState}
      onStateChange={handleStateChange}
      selectedId={selectedId}
      onSelectedIdChange={handleSelectedIdChange}
      renderCard={renderCard}
      renderDetail={renderDetail}
      searchPlaceholder="Search name or phone"
      toolbar={
        <ManageLocationFilter
          locations={locationNames}
          selected={selectedLocations}
          onChange={handleLocationChange}
        />
      }
      emptyList="No contacts match the current filters."
      emptyDetail={
        <p className="p-6 text-[13px] text-muted-foreground">
          Select a contact to see its attendance records.
        </p>
      }
    />
  )
}
