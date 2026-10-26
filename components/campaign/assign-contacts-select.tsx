"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, X } from "lucide-react"

import {
  CONTACT_FACET_KEYS,
  EMPTY_FACETS,
  FACET_LABELS,
  type AssignableCallerView,
  type AssignableContactPageView,
  type AssignableContactView,
  type AssignmentConflictView,
  type AssignmentPrecheckView,
  type AssignmentSplitEntryView,
  type AssignmentWriteModeView,
  type AssignmentWriteResultView,
  type ContactFacetKey,
  type LocationOption,
} from "@/components/campaign/assign-contacts-types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25
const PREVIEW_DEBOUNCE_MS = 250

interface PickerEntry {
  userId: string
  name: string
  /** Held as text so a half-typed weight does not become `NaN` in state. */
  weight: string
}

interface PreviewState {
  /** The selection and weights this split was computed for. */
  key: string
  split: AssignmentSplitEntryView[]
  total: number
}

interface ContactQuery {
  page: number
  search: string
  filters: Record<ContactFacetKey, string>
  /** Bumped by Retry; it makes a failed query re-runnable without changing the query. */
  nonce: number
}

/** The pre-check that was actually run, so the panel never guesses a conflict count. */
interface PrecheckSnapshot {
  /** The selection this answer describes. */
  key: string
  conflicts: AssignmentConflictView[]
  assignableCount: number
}

/**
 * An explicit skip/move choice, bound to the exact conflict list it was made
 * against: a concurrent assignment that changes that list requires a fresh
 * choice rather than silently applying the old one.
 */
interface WriteDecision {
  key: string
  mode: AssignmentWriteModeView
  assignableCount: number
}

const EMPTY_FILTERS: Record<ContactFacetKey, string> = {
  centre: "",
  level: "",
  gender: "",
  language: "",
}

const SELECT_CLASS =
  "focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-2 text-[13px] text-[var(--program-text)] outline-none focus-visible:ring-[3px]"

function contactsUrl(campaignId: string, query: ContactQuery): string {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(PAGE_SIZE) })
  const search = query.search.trim()

  if (search.length > 0) {
    params.set("search", search)
  }

  for (const key of CONTACT_FACET_KEYS) {
    const value = query.filters[key]
    if (value.length > 0) {
      params.set(key, value)
    }
  }

  return `/api/dialer/admin/campaigns/${campaignId}/contacts?${params.toString()}`
}

function assignmentsUrl(campaignId: string): string {
  return `/api/dialer/admin/campaigns/${campaignId}/assignments`
}

function precheckUrl(campaignId: string): string {
  return `/api/dialer/admin/campaigns/${campaignId}/assignments/precheck`
}

/**
 * The server's named refusal, never a generic failure: the dialer routes answer
 * `{ error, code }`, and `invalid_page` is the code the operator needs to see.
 */
function errorMessage(payload: { error?: string; code?: string } | null): string {
  if (!payload) {
    return "The server refused the request."
  }

  if (payload.code && payload.error) {
    return `${payload.code} — ${payload.error}`
  }

  return payload.error ?? payload.code ?? "The server refused the request."
}

function parseWeight(value: string): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
}

/** `1 contact` / `3 contacts`, so no line on this screen reads "1 contacts". */
function contactCountLabel(count: number): string {
  return count === 1 ? "1 contact" : `${count} contacts`
}

function decisionKey(selectionKey: string, conflicts: AssignmentConflictView[]): string {
  return `${selectionKey}|${conflicts
    .map((conflict) => conflict.contactId)
    .sort()
    .join(",")}`
}

/**
 * Frame 324's selection surface: the scoped contact grid, the four facet
 * filters, the caller picker with write-only weights, and the live split.
 *
 * Selection is a `Set` of contact ids rather than a per-page list, because the
 * only honest count on this screen is over everything the admin ticked. A page
 * change or a facet filter therefore never drops a tick, and the footer names
 * the part of the selection the current page cannot show.
 */
export function AssignContactsSelect({
  campaignId,
  callers,
  locations,
}: {
  campaignId: string
  callers: AssignableCallerView[]
  locations: LocationOption[]
}) {
  const [page, setPage] = useState(1)
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState<Record<ContactFacetKey, string>>(EMPTY_FILTERS)
  const [reloadToken, setReloadToken] = useState(0)
  const [data, setData] = useState<AssignableContactPageView | null>(null)
  const [scopeTotal, setScopeTotal] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [picker, setPicker] = useState<PickerEntry[]>([])
  const [callerToAdd, setCallerToAdd] = useState("")
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  const [lastPrecheck, setLastPrecheck] = useState<PrecheckSnapshot | null>(null)
  const [lastDecision, setLastDecision] = useState<WriteDecision | null>(null)
  const [conflictPrompt, setConflictPrompt] = useState<PrecheckSnapshot | null>(null)
  const [isPrechecking, setIsPrechecking] = useState(false)
  const [inFlightMode, setInFlightMode] = useState<AssignmentWriteModeView | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [writeReceipt, setWriteReceipt] = useState<Pick<AssignmentWriteResultView, "written" | "skipped"> | null>(
    null,
  )

  const query = useMemo<ContactQuery>(
    () => ({ page, search, filters, nonce: reloadToken }),
    [page, search, filters, reloadToken],
  )

  const hasActiveQuery =
    query.search.trim().length > 0 || CONTACT_FACET_KEYS.some((key) => query.filters[key].length > 0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    setIsLoading(true)
    setLoadError(null)

    void (async () => {
      try {
        const response = await fetch(contactsUrl(campaignId, query), { signal: controller.signal })
        const payload = (await response.json().catch(() => null)) as
          | (AssignableContactPageView & { error?: string; code?: string })
          | null

        if (cancelled) {
          return
        }

        if (!response.ok || !payload || !Array.isArray(payload.rows)) {
          setData(null)
          setLoadError(errorMessage(payload))
          setIsLoading(false)
          return
        }

        setData(payload)
        // The whole-set total is only observable on an unfiltered read; keeping
        // it means the selected count's denominator does not shrink when a facet
        // filters the list underneath a selection made across pages.
        if (!hasActiveQuery) {
          setScopeTotal(payload.total)
        }
        setIsLoading(false)
      } catch {
        if (cancelled || controller.signal.aborted) {
          return
        }

        setData(null)
        setLoadError("Unable to reach the server. The contact list did not load.")
        setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [campaignId, query, hasActiveQuery])

  const locationNames = useMemo(() => new Map(locations.map((location) => [location.id, location.name])), [locations])

  const pageRows = data?.rows ?? []
  const pageIds = pageRows.map((row) => row.contactId)
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length
  const selectedCount = selectedIds.size
  const hiddenCount = selectedCount - selectedOnPage
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length
  const someOnPageSelected = selectedOnPage > 0 && !allOnPageSelected
  const facets = data?.facets ?? EMPTY_FACETS
  const totalPages = data?.totalPages ?? 0
  const rangeStart = !data || data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1
  const rangeEnd = !data ? 0 : Math.min(data.page * data.pageSize, data.total)
  const showingLine = `Showing ${rangeStart}–${rangeEnd} of ${data?.total ?? 0}`

  const selectionFingerprint = useMemo(() => [...selectedIds].sort().join(","), [selectedIds])
  const weightsKey = picker.map((entry) => `${entry.userId}:${entry.weight}`).join("|")
  const previewKey = `${selectedCount}|${selectionFingerprint}|${weightsKey}`
  const allWeightsValid = picker.every((entry) => parseWeight(entry.weight) !== null)
  const currentPreview = preview && preview.key === previewKey ? preview : null

  // A pre-check answers for one exact selection; anything else on screen is
  // stale and is treated as if it had never been asked.
  const snapshot = lastPrecheck && lastPrecheck.key === selectionFingerprint ? lastPrecheck : null
  const snapshotKey = snapshot === null ? null : decisionKey(snapshot.key, snapshot.conflicts)
  const decision =
    snapshotKey !== null && lastDecision !== null && lastDecision.key === snapshotKey ? lastDecision : null
  const isWriting = inFlightMode !== null
  const isBusy = isPrechecking || isWriting
  // The button carries the confirmed-set size for the decision in force, and the
  // selection size while no conflict decision exists — never a skipped count the
  // admin has not chosen.
  const writeCount = decision?.mode === "skip" ? decision.assignableCount : selectedCount
  const assignLabel =
    isPrechecking
      ? "Checking conflicts…"
      : isWriting
        ? `Assigning ${contactCountLabel(writeCount)}…`
        : `Assign ${contactCountLabel(writeCount)}`

  useEffect(() => {
    if (selectedCount === 0 || picker.length === 0 || !allWeightsValid) {
      setPreview(null)
      setPreviewError(null)
      setIsPreviewing(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setIsPreviewing(true)

      void (async () => {
        try {
          const response = await fetch(`/api/dialer/admin/campaigns/${campaignId}/assignments/preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              total: selectedCount,
              // The picker's identity is the staff user, not `dialer_callers.id`:
              // AD-13's auto-promote means most eligible callers have no profile
              // row until their first assignment writes one.
              callers: picker.map((entry) => ({ callerId: entry.userId, weight: parseWeight(entry.weight) })),
            }),
            signal: controller.signal,
          })

          const payload = (await response.json().catch(() => null)) as
            | { split?: AssignmentSplitEntryView[]; error?: string; code?: string }
            | null

          if (controller.signal.aborted) {
            return
          }

          if (!response.ok || !payload || !Array.isArray(payload.split)) {
            setPreview(null)
            setPreviewError(errorMessage(payload))
            setIsPreviewing(false)
            return
          }

          setPreview({
            key: previewKey,
            split: payload.split,
            total: payload.split.reduce((sum, entry) => sum + entry.count, 0),
          })
          setPreviewError(null)
          setIsPreviewing(false)
        } catch {
          if (controller.signal.aborted) {
            return
          }

          setPreview(null)
          setPreviewError("Unable to reach the server. The split was not previewed.")
          setIsPreviewing(false)
        }
      })()
    }, PREVIEW_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [campaignId, picker, selectedCount, allWeightsValid, previewKey])

  const toggleRows = (ids: string[], select: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)

      for (const id of ids) {
        if (select) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }

      return next
    })
  }

  const updateFilter = (key: ContactFacetKey, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  const applySearch = () => {
    setSearch(searchDraft)
    setPage(1)
  }

  const availableCallers = callers.filter((caller) => !picker.some((entry) => entry.userId === caller.userId))

  const addCaller = () => {
    const caller = callers.find((entry) => entry.userId === callerToAdd)

    if (!caller) {
      return
    }

    setPicker((current) => [...current, { userId: caller.userId, name: caller.name, weight: "1" }])
    setCallerToAdd("")
  }

  const updateWeight = (userId: string, weight: string) => {
    setPicker((current) => current.map((entry) => (entry.userId === userId ? { ...entry, weight } : entry)))
  }

  const removeCaller = (userId: string) => {
    setPicker((current) => current.filter((entry) => entry.userId !== userId))
  }

  const locationLabel = (row: AssignableContactView): string => {
    const names = row.locationIds
      .map((id) => locationNames.get(id))
      .filter((name): name is string => typeof name === "string" && name.length > 0)

    if (names.length > 0) {
      return names.join(", ")
    }

    // A contact whose stored id has no row in this programme's lexicon is
    // surfaced as unknown, never silently rendered as "no location".
    return row.locationIds.length > 0 ? "Unknown location" : "—"
  }

  const currentCallers = (): { userId: string; weight: number }[] | null => {
    const entries: { userId: string; weight: number }[] = []

    for (const entry of picker) {
      const weight = parseWeight(entry.weight)

      if (weight === null) {
        return null
      }

      entries.push({ userId: entry.userId, weight })
    }

    return entries
  }

  const runWrite = async (mode: AssignmentWriteModeView) => {
    const callers = currentCallers()

    if (callers === null || callers.length === 0) {
      setWriteError("Add at least one caller with a whole-number weight before assigning.")
      return
    }

    setInFlightMode(mode)
    setWriteError(null)
    setWriteReceipt(null)

    try {
      const response = await fetch(assignmentsUrl(campaignId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [...selectedIds], callers, mode }),
      })
      const payload = (await response.json().catch(() => null)) as
        | (AssignmentWriteResultView & { error?: string; code?: string })
        | null

      if (!response.ok || !payload || typeof payload.written !== "number") {
        setInFlightMode(null)
        setWriteError(errorMessage(payload))
        return
      }

      setInFlightMode(null)
      setConflictPrompt(null)
      setLastPrecheck(null)
      setLastDecision(null)
      setWriteReceipt({ written: payload.written, skipped: payload.skipped })
      setSelectedIds(new Set())
      setPicker([])
      setCallerToAdd("")
      setPreview(null)
      setReloadToken((value) => value + 1)
    } catch {
      setInFlightMode(null)
      setWriteError(
        "Unable to reach the server. Nothing was assigned; your selection and callers are unchanged.",
      )
    }
  }

  const chooseConflict = (mode: AssignmentWriteModeView) => {
    if (!conflictPrompt) {
      return
    }

    setLastDecision({
      key: decisionKey(conflictPrompt.key, conflictPrompt.conflicts),
      mode,
      assignableCount: conflictPrompt.assignableCount,
    })
    setConflictPrompt(null)
    void runWrite(mode)
  }

  /**
   * The write is always preceded by the server's pre-check, on every click: the
   * conflict list is re-read here, and the write re-reads it again inside its
   * transaction. A decision already recorded for an identical conflict list is
   * honoured; a different list is a new choice, never an inherited one.
   */
  const beginAssignment = async () => {
    if (selectedCount === 0 || isBusy) {
      return
    }

    setWriteError(null)
    setWriteReceipt(null)

    if (picker.length === 0) {
      setWriteError("Add at least one caller before assigning.")
      return
    }

    if (!allWeightsValid) {
      setWriteError("Weights must be whole numbers of 1 or more.")
      return
    }

    const key = selectionFingerprint
    setIsPrechecking(true)

    try {
      const response = await fetch(precheckUrl(campaignId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [...selectedIds] }),
      })
      const payload = (await response.json().catch(() => null)) as
        | (AssignmentPrecheckView & { error?: string; code?: string })
        | null

      if (!response.ok || !payload || !Array.isArray(payload.conflicts)) {
        setIsPrechecking(false)
        setWriteError(errorMessage(payload))
        return
      }

      const precheck: PrecheckSnapshot = {
        key,
        conflicts: payload.conflicts,
        assignableCount: payload.assignableCount,
      }

      setIsPrechecking(false)
      setLastPrecheck(precheck)

      if (precheck.conflicts.length === 0) {
        await runWrite("move")
        return
      }

      if (lastDecision !== null && lastDecision.key === decisionKey(precheck.key, precheck.conflicts)) {
        await runWrite(lastDecision.mode)
        return
      }

      setConflictPrompt(precheck)
    } catch {
      setIsPrechecking(false)
      setWriteError(
        "Unable to reach the server. Nothing was assigned; your selection and callers are unchanged.",
      )
    }
  }

  const receiptLine =
    writeReceipt === null
      ? null
      : `Assigned ${contactCountLabel(writeReceipt.written)}${
          writeReceipt.skipped > 0 ? ` · ${writeReceipt.skipped} skipped` : ""
        }`

  // The dialog's body keeps the last pre-check while it animates closed, so the
  // counts do not flip to zero for the fraction of a second it is still on screen.
  const prompt = conflictPrompt ?? lastPrecheck
  const promptConflicts = prompt?.conflicts ?? []

  const hintLine =
    selectedCount === 0
      ? "Select contacts to assign."
      : isWriting
        ? "Writing the confirmed set in one transaction."
        : decision?.mode === "skip"
          ? `Skipping the ${contactCountLabel(selectedCount - decision.assignableCount)} already assigned in this campaign; ${contactCountLabel(writeCount)} will be written.`
          : decision?.mode === "move"
            ? `Moving the already-assigned contacts to the new split; ${contactCountLabel(writeCount)} will be written.`
            : snapshot !== null && snapshot.conflicts.length > 0
            ? `${contactCountLabel(snapshot.conflicts.length)} of the ${contactCountLabel(selectedCount)} selected ${
                snapshot.conflicts.length === 1 ? "is" : "are"
              } already assigned in this campaign. Choosing assign asks whether to skip or move ${
                snapshot.conflicts.length === 1 ? "it" : "them"
              }.`
            : snapshot !== null
              ? "None of the selected contacts is assigned in this campaign yet."
              : "The conflict check runs before anything is written."

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-labelledby="assign-contacts-grid-heading" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="assign-contacts-grid-heading"
              className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]"
            >
              Contacts in scope
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{showingLine}</p>
          </div>

          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              applySearch()
            }}
          >
            <Input
              aria-label="Search contacts"
              placeholder="Search name or phone"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              autoComplete="off"
              className="h-9 w-56"
            />
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CONTACT_FACET_KEYS.map((key) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">
                {FACET_LABELS[key]}
              </span>
              <select
                aria-label={FACET_LABELS[key]}
                value={filters[key]}
                onChange={(event) => updateFilter(key, event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Any {FACET_LABELS[key].toLowerCase()}</option>
                {facets[key].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--muted)_35%,var(--card))] px-3 py-2">
          <p className="text-[13px] font-medium text-[var(--program-text)]">
            {scopeTotal === null ? `${selectedCount} selected` : `${selectedCount} of ${scopeTotal} selected`}
          </p>
          {hiddenCount > 0 ? (
            <p className="text-xs font-medium text-[var(--program-text)]">+ {hiddenCount} hidden selected</p>
          ) : null}
        </div>

        {loadError ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--destructive)] px-3 py-2">
            <p role="alert" className="text-[13px] text-[var(--destructive)]">
              {loadError}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setReloadToken((value) => value + 1)}>
              Try again
            </Button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-card">
          <Table aria-busy={isLoading}>
            <TableHeader>
              <TableRow className="bg-[var(--muted)] hover:bg-[var(--muted)]">
                <TableHead className="w-10 px-3">
                  <Checkbox
                    aria-label="Select all contacts on this page"
                    checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                    disabled={pageIds.length === 0}
                    onCheckedChange={(checked) => toggleRows(pageIds, checked === true)}
                  />
                </TableHead>
                {["Name", "Phone", "Location", "Centre", "Level", "Gender", "Language"].map((label) => (
                  <TableHead
                    key={label}
                    className="px-3 text-xs font-semibold tracking-[0.04em] text-[var(--muted-foreground)] whitespace-nowrap uppercase"
                  >
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-3 py-6 text-center text-[13px] text-[var(--muted-foreground)]">
                    {isLoading ? "Loading contacts…" : "No contacts match this filter."}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => {
                  const isSelected = selectedIds.has(row.contactId)

                  return (
                    <TableRow key={row.contactId} data-state={isSelected ? "selected" : undefined}>
                      <TableCell className="px-3">
                        <Checkbox
                          aria-label={`Select ${row.name}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => toggleRows([row.contactId], checked === true)}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-[13px] font-medium text-[var(--program-text)]">
                        {row.name}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-[13px] whitespace-nowrap text-[var(--muted-foreground)]">
                        {row.phone}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-[13px] text-[var(--program-text)]">
                        {locationLabel(row)}
                      </TableCell>
                      {CONTACT_FACET_KEYS.map((key) => (
                        <TableCell key={key} className="px-3 py-2.5 text-[13px] whitespace-nowrap text-[var(--program-text)]">
                          {row.profile[key] ?? "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isLoading || totalPages === 0 || page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Page {page} of {Math.max(totalPages, 1)}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="assign-contacts-callers-heading"
        className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-card p-4"
      >
        <div>
          <h2
            id="assign-contacts-callers-heading"
            className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]"
          >
            Assign to
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Higher weight gets more contacts. Equal weights split evenly.
          </p>
        </div>

        {picker.length === 0 ? (
          <p className="text-[13px] text-[var(--muted-foreground)]">No callers chosen yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-1 text-[11px] tracking-[0.04em] uppercase">Caller</TableHead>
                <TableHead className="px-1 text-[11px] tracking-[0.04em] uppercase">Weight</TableHead>
                <TableHead className="px-1 text-[11px] tracking-[0.04em] uppercase">Contacts</TableHead>
                <TableHead className="w-8 px-1">
                  <span className="sr-only">Remove</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {picker.map((entry) => {
                const count = currentPreview?.split.find((part) => part.callerId === entry.userId)?.count

                return (
                  <TableRow key={entry.userId}>
                    <TableCell className="px-1 py-2 text-[13px] font-medium text-[var(--program-text)]">
                      {entry.name}
                    </TableCell>
                    <TableCell className="px-1 py-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        aria-label={`Weight for ${entry.name}`}
                        value={entry.weight}
                        onChange={(event) => updateWeight(entry.userId, event.target.value)}
                        className={cn("h-8 w-16 px-2 text-[13px]")}
                      />
                    </TableCell>
                    <TableCell className="px-1 py-2 text-[13px] text-[var(--program-text)]">
                      {typeof count === "number" ? count : "—"}
                    </TableCell>
                    <TableCell className="px-1 py-2">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${entry.name}`}
                        onClick={() => removeCaller(entry.userId)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Add caller"
            value={callerToAdd}
            onChange={(event) => setCallerToAdd(event.target.value)}
            disabled={availableCallers.length === 0}
            className={cn(SELECT_CLASS, "w-auto min-w-40 flex-1")}
          >
            <option value="">
              {availableCallers.length === 0 ? "Every caller is chosen" : "Select a caller"}
            </option>
            {availableCallers.map((caller) => (
              <option key={caller.userId} value={caller.userId}>
                {caller.name}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="outline" disabled={callerToAdd === ""} onClick={addCaller}>
            <Plus aria-hidden="true" />
            Add caller
          </Button>
        </div>

        {!allWeightsValid ? (
          <p role="alert" className="text-[13px] text-[var(--destructive)]">
            Weights must be whole numbers of 1 or more.
          </p>
        ) : null}

        {previewError ? (
          <p role="alert" className="text-[13px] text-[var(--destructive)]">
            {previewError}
          </p>
        ) : null}

        <div className="border-t border-[var(--border)] pt-3">
          <p className="text-[13px] font-medium text-[var(--program-text)]">
            Preview:{" "}
            {currentPreview === null
              ? "—"
              : `${currentPreview.total} contacts across ${picker.length} ${
                  picker.length === 1 ? "caller" : "callers"
                }`}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {selectedCount === 0
              ? "Select contacts to preview the split."
              : picker.length === 0
                ? "Add a caller to preview the split."
                : !allWeightsValid
                  ? "Fix the weights to preview the split."
                  : isPreviewing
                    ? "Previewing…"
                    : "The split comes from the assignment service, not this screen."}
          </p>
        </div>

        {writeError ? (
          <p role="alert" className="rounded-md border border-[var(--destructive)] px-3 py-2 text-[13px] text-[var(--destructive)]">
            {writeError}
          </p>
        ) : null}

        {receiptLine ? (
          <p
            role="status"
            className="rounded-md border border-[var(--border)] bg-[color-mix(in_oklab,var(--muted)_35%,var(--card))] px-3 py-2 text-[13px] font-medium text-[var(--program-text)]"
          >
            {receiptLine}
          </p>
        ) : null}

        <Button
          type="button"
          className="h-10 w-full"
          disabled={selectedCount === 0 || isBusy}
          aria-describedby="assign-contacts-write-hint"
          onClick={() => {
            void beginAssignment()
          }}
        >
          {assignLabel}
        </Button>
        <p
          id="assign-contacts-write-hint"
          className={cn(
            "text-xs",
            snapshot !== null && snapshot.conflicts.length > 0 && decision === null
              ? // The design's amber warning ink is the only warning colour token in
                // the app, so it is reused rather than a second amber invented here.
                "text-[var(--grid-warning-ink)]"
              : "text-[var(--muted-foreground)]",
          )}
        >
          {hintLine}
        </p>

        <Dialog
          open={conflictPrompt !== null}
          onOpenChange={(open) => {
            if (!open) {
              setConflictPrompt(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base">Some contacts are already assigned</DialogTitle>
              <DialogDescription className="text-[13px]">
                {promptConflicts.length === 0
                  ? ""
                  : `${promptConflicts.length} of the ${selectedCount} selected contacts already ${
                      promptConflicts.length === 1 ? "has" : "have"
                    } a caller in this campaign. Choose what happens to ${
                      promptConflicts.length === 1 ? "it" : "them"
                    }; closing this dialog writes nothing.`}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
              <Table aria-label="Contacts already assigned">
                <TableHeader>
                  <TableRow className="bg-[var(--muted)] hover:bg-[var(--muted)]">
                    {["Contact", "Currently assigned to", "Status"].map((label) => (
                      <TableHead
                        key={label}
                        className="px-3 text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] whitespace-nowrap uppercase"
                      >
                        {label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promptConflicts.map((conflict) => (
                    <TableRow key={conflict.contactId}>
                      <TableCell className="px-3 py-2 text-[13px] font-medium text-[var(--program-text)]">
                        {conflict.contactName}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-[13px] text-[var(--program-text)]">
                        {conflict.callerName}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-[13px] text-[var(--muted-foreground)]">
                        {conflict.status}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
              <Button type="button" size="sm" variant="ghost" onClick={() => setConflictPrompt(null)}>
                Cancel
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isWriting}
                  onClick={() => chooseConflict("skip")}
                >
                  {`Skip them · assign ${contactCountLabel(prompt?.assignableCount ?? 0)}`}
                </Button>
                <Button type="button" size="sm" disabled={isWriting} onClick={() => chooseConflict("move")}>
                  {`Move them · assign ${contactCountLabel(selectedCount)}`}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  )
}
