"use client"

import { useEffect, useId, useState } from "react"
import { format, isValid, parseISO } from "date-fns"
import { CalendarDays, ChevronDown } from "lucide-react"

import {
  CONTACT_FIELD_IDS,
  CONTACT_FIELD_LABEL,
  formatContactDate,
  isContactFieldEditable,
  type ContactFieldId,
} from "@/components/manage/manage-contact-fields"
import type { ManageContact, ManageLocation } from "@/components/manage/manage-types"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  CONTACT_FIELD_FOCUS,
  CONTACT_FIELD_SHADOW,
} from "@/components/manage/contact-record-styles"
import { cn } from "@/lib/utils"

/**
 * The value Radix's `Select` cannot hold.
 *
 * A `Select.Item` may not have an empty value — Radix throws on it — so
 * "no location" needs a value that is not an id, and a name that cannot be
 * mistaken for one.
 */
const NO_LOCATION = "__no_location__"

/**
 * The value the source picker uses for "no source".
 *
 * The same reason as `NO_LOCATION`: Radix refuses an empty `Select.Item`
 * value, and a source can be cleared.
 */
const NO_SOURCE = "__no_source__"

/**
 * A rejected non-text commit is reported by the host; the control itself has
 * nothing to revert. The rejection still has to be observed or it surfaces as
 * an unhandled promise rejection in the browser.
 */
function ignoreRejectedCommit(result: void | Promise<void>): void {
  if (result && typeof result.then === "function") {
    void result.catch(() => {})
  }
}

/**
 * One field's editor, shared by the sheet and the expanded record.
 *
 * The Airtable sheet and the Airtable record view are the same control in two
 * frames: a label, and the value under it. That is why this is one component
 * rather than two — a sheet editor and a record editor that each owned their
 * own input would be two places for a field's edit rules to diverge.
 *
 * The edit rules are the grid's, not new ones:
 *
 * - a value is written when it **changes** and the field loses focus, and on
 *   `Enter` — so a stray click on an untouched field issues no request, which
 *   is the same "untouched issues no request" rule the grid's own editors
 *   follow;
 * - `Escape` puts the field back to the value it had, rather than writing the
 *   half-typed one.
 *
 * What this does **not** do is write. `onCommit` hands the new value to the
 * caller, which routes it through the grid's one write path, so there is a
 * single place where a contact is written and a single place where a rejected
 * write is reported.
 */
/**
 * How a field's control is drawn.
 *
 * `"field"` is the ordinary editor — a bordered control under a label, sized
 * for a thumb on the phone sheet.
 * `"record"` is the same control in the desktop record's dense frame: 32px
 * tall on the inset-control surface, matching the source product's record.
 * `"record-title"` is the desktop record's **name**: 40px and 23px type on the
 * same surface.
 * `"title"` is the phone record's name — a large, unbordered line in the
 * display face, which is what the mobile capture showed.
 */
export type ContactFieldAppearance = "field" | "record" | "record-title" | "title"

export interface ManageContactFieldEditorProps {
  contact: ManageContact
  fieldId: ContactFieldId
  /** The programme's locations, used to name a current value. */
  locations: readonly ManageLocation[]
  /**
   * The locations the picker may offer. Defaults to `locations`; a record passes
   * the patch owner's set here so a current out-of-patch location is named but
   * cannot be chosen as a new selection.
   */
  locationOptions?: readonly ManageLocation[]
  /** The values the source picker offers. */
  sourceOptions?: readonly string[]
  /** The values the books-read picker offers. */
  booksReadOptions?: readonly string[]
  /** Called with the new value. Only called for a field that can be written. */
  onCommit: (fieldId: ContactFieldId, value: unknown) => void | Promise<void>
  /** Focus the control when it mounts. */
  autoFocus?: boolean
  /** The id of the input, so a `<label htmlFor>` can name it. */
  inputId?: string
  /** How the control is drawn. Defaults to `"field"`. */
  appearance?: ContactFieldAppearance
}

export function ManageContactFieldEditor({
  contact,
  fieldId,
  locations,
  locationOptions,
  sourceOptions = [],
  booksReadOptions = [],
  onCommit,
  autoFocus = false,
  inputId,
  appearance = "field",
}: ManageContactFieldEditorProps) {
  const generatedId = useId()
  const controlId = inputId ?? generatedId

  if (!isContactFieldEditable(fieldId)) {
    return null
  }

  if (fieldId === CONTACT_FIELD_IDS.location) {
    return (
      <LocationFieldEditor
        contact={contact}
        controlId={controlId}
        locations={locations}
        locationOptions={locationOptions}
        onCommit={onCommit}
        appearance={appearance}
      />
    )
  }

  if (fieldId === CONTACT_FIELD_IDS.source) {
    return (
      <SourceFieldEditor
        contact={contact}
        controlId={controlId}
        options={sourceOptions}
        onCommit={onCommit}
        appearance={appearance}
      />
    )
  }

  if (fieldId === CONTACT_FIELD_IDS.booksRead) {
    return (
      <BooksReadFieldEditor
        contact={contact}
        options={booksReadOptions}
        onCommit={onCommit}
        appearance={appearance}
      />
    )
  }

  if (fieldId === CONTACT_FIELD_IDS.rounds) {
    return (
      <NumberFieldEditor
        contact={contact}
        fieldId={fieldId}
        controlId={controlId}
        onCommit={onCommit}
        appearance={appearance}
      />
    )
  }

  if (
    fieldId === CONTACT_FIELD_IDS.initialContact ||
    fieldId === CONTACT_FIELD_IDS.dateOfBirth
  ) {
    return (
      <DateFieldEditor
        contact={contact}
        fieldId={fieldId}
        controlId={controlId}
        onCommit={onCommit}
        appearance={appearance}
      />
    )
  }

  if (fieldId === CONTACT_FIELD_IDS.notes) {
    return (
      <TextFieldEditor
        contact={contact}
        fieldId={fieldId}
        controlId={controlId}
        onCommit={onCommit}
        autoFocus={autoFocus}
        multiline
        appearance={appearance}
      />
    )
  }

  return (
    <TextFieldEditor
      contact={contact}
      fieldId={fieldId}
      controlId={controlId}
      onCommit={onCommit}
      autoFocus={autoFocus}
      appearance={appearance}
    />
  )
}

/**
 * The text-shaped fields: the name, the phone and the notes.
 *
 * One component for all three because they differ only in the control they
 * draw, and a second implementation of "commit on blur, revert on Escape"
 * would be a second set of rules to keep in step with the first.
 */
function TextFieldEditor({
  contact,
  fieldId,
  controlId,
  onCommit,
  autoFocus,
  multiline = false,
  appearance = "field",
}: {
  contact: ManageContact
  fieldId: ContactFieldId
  controlId: string
  onCommit: ManageContactFieldEditorProps["onCommit"]
  autoFocus: boolean
  multiline?: boolean
  appearance?: ContactFieldAppearance
}) {
  const committed = readText(contact, fieldId)
  const [draft, setDraft] = useState(committed)

  /**
   * The draft follows the stored value, but only when the stored value
   * actually changes.
   *
   * A write the server accepted comes back as a new row, and a write it
   * refused comes back as the old one; both are the value the field holds
   * again, so the draft follows. What the draft must **not** do is follow the
   * row on every render — an operator typing into a field would have their
   * keystrokes overwritten by the re-render that followed the click that
   * focused the field.
   */
  useEffect(() => {
    setDraft(committed)
  }, [committed])

  const commit = () => {
    if (draft === committed) {
      return
    }

    const result = onCommit(fieldId, draft)

    // A refused write is the one case where the draft must go back to the
    // stored value without the stored value changing: the host has already
    // reported the server's message, and leaving the rejected text in the
    // control would make the field look saved. A successful write comes back
    // as a new contact row, and the effect above follows it.
    if (result && typeof result.then === "function") {
      void result.catch(() => setDraft(committed))
    }
  }

  const label = CONTACT_FIELD_LABEL[fieldId]

  if (multiline) {
    return (
      <Textarea
        id={controlId}
        value={draft}
        autoFocus={autoFocus}
        aria-label={label}
        placeholder={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            setDraft(committed)
          }
        }}
        className={cn(
          "resize-y rounded-[6px] text-[13px]",
          appearance === "record"
            ? cn(
                "min-h-20 border-0 bg-field px-2 py-[6px] leading-[19.5px] text-foreground dark:bg-field",
                CONTACT_FIELD_SHADOW,
                CONTACT_FIELD_FOCUS,
                "focus-visible:ring-0",
              )
            : "min-h-24 border-border bg-card",
        )}
      />
    )
  }

  return (
    <Input
      id={controlId}
      value={draft}
      autoFocus={autoFocus}
      aria-label={label}
      placeholder={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
          return
        }

        if (event.key === "Escape") {
          event.preventDefault()
          setDraft(committed)
        }
      }}
      className={cn(
        appearance === "record-title" &&
          cn(
            "h-10 rounded-[6px] border-0 bg-field px-2 py-1 text-[23px] leading-8 text-foreground dark:bg-field",
            CONTACT_FIELD_SHADOW,
            CONTACT_FIELD_FOCUS,
            "focus-visible:ring-0",
          ),
        appearance === "record" &&
          cn(
            "h-8 rounded-[6px] border-0 bg-field px-2 py-[6px] text-[13px] leading-[19.5px] text-foreground dark:bg-field",
            CONTACT_FIELD_SHADOW,
            CONTACT_FIELD_FOCUS,
            "focus-visible:ring-0",
          ),
        appearance === "title" &&
          "h-12 border-0 bg-transparent px-0 font-[family-name:var(--font-poppins)] text-[22px] font-bold text-[var(--program-text)] shadow-none focus-visible:ring-0",
        appearance === "field" && "h-12 rounded-[6px] border-border bg-card text-[13px]",
      )}
    />
  )
}

/**
 * The location picker.
 *
 * A contact belongs to at most one location — `contacts.location_ids` carries
 * a `CHECK (cardinality(…)) <= 1)` bound — so the picker is a single choice
 * that can be cleared, and it commits the moment the choice is made rather
 * than waiting for a blur it may never get.
 */
function LocationFieldEditor({
  contact,
  controlId,
  locations,
  locationOptions,
  onCommit,
  appearance,
}: {
  contact: ManageContact
  controlId: string
  locations: readonly ManageLocation[]
  locationOptions?: readonly ManageLocation[]
  onCommit: ManageContactFieldEditorProps["onCommit"]
  appearance: ContactFieldAppearance
}) {
  const current = contact.locationIds[0] ?? NO_LOCATION
  const pickerLocations = locationOptions ?? locations
  const currentLocationId = contact.locationIds[0] ?? null
  const currentOutsidePicker =
    currentLocationId !== null && !pickerLocations.some((location) => location.id === currentLocationId)
  const currentLocationName = currentLocationId
    ? (locations.find((location) => location.id === currentLocationId)?.name ?? null)
    : null

  return (
    <Select
      value={current}
      onValueChange={(next) => {
        ignoreRejectedCommit(
          onCommit(CONTACT_FIELD_IDS.location, next === NO_LOCATION ? [] : [next]),
        )
      }}
    >
      <SelectTrigger
        id={controlId}
        aria-label={CONTACT_FIELD_LABEL.location}
        className={cn(
          "w-full rounded-[6px] text-[13px] [&_svg:last-child]:rotate-90",
          appearance === "record"
            ? cn(
                "h-8 border-0 bg-field px-2 py-[6px] leading-[19.5px] text-foreground dark:bg-field",
                CONTACT_FIELD_SHADOW,
                CONTACT_FIELD_FOCUS,
                "focus-visible:ring-0",
              )
            : "h-12 border-border bg-card",
        )}
      >
        <SelectValue placeholder="No location" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_LOCATION}>No location</SelectItem>
        {pickerLocations.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name}
          </SelectItem>
        ))}
        {currentOutsidePicker && currentLocationId && currentLocationName ? (
          <SelectItem value={currentLocationId} disabled>
            {currentLocationName}
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  )
}

/** The class string a value control uses in each frame. */
function controlClass(appearance: ContactFieldAppearance): string {
  if (appearance !== "record") {
    return "h-12 rounded-[6px] border-border bg-card text-[13px]"
  }

  return cn(
    "h-8 rounded-[6px] border-0 bg-field px-2 py-[6px] text-[13px] leading-[19.5px] text-foreground dark:bg-field",
    CONTACT_FIELD_SHADOW,
    CONTACT_FIELD_FOCUS,
    "focus-visible:ring-0",
  )
}

/** The source picker: a select whose options are the values the table carries. */
function SourceFieldEditor({
  contact,
  controlId,
  options,
  onCommit,
  appearance,
}: {
  contact: ManageContact
  controlId: string
  options: readonly string[]
  onCommit: ManageContactFieldEditorProps["onCommit"]
  appearance: ContactFieldAppearance
}) {
  const current = contact.source ?? NO_SOURCE
  const allOptions =
    contact.source && !options.includes(contact.source)
      ? [contact.source, ...options]
      : options

  return (
    <Select
      value={current}
      onValueChange={(next) => {
        ignoreRejectedCommit(onCommit(CONTACT_FIELD_IDS.source, next === NO_SOURCE ? null : next))
      }}
    >
      <SelectTrigger
        id={controlId}
        aria-label={CONTACT_FIELD_LABEL.source}
        className={cn(
          "w-full rounded-[6px] text-[13px] [&_svg:last-child]:rotate-90",
          controlClass(appearance),
        )}
      >
        <SelectValue placeholder="No source" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_SOURCE}>No source</SelectItem>
        {allOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * The books-read picker.
 *
 * A popover of checkboxes rather than a text field: the column is a `string[]`
 * and the option list is the table's own, so a typed comma-separated value
 * would let the dialog write a title the grid's picker cannot offer. Each tick
 * commits the whole array, the same shape the grid's multiselect writes.
 */
function BooksReadFieldEditor({
  contact,
  options,
  onCommit,
  appearance,
}: {
  contact: ManageContact
  options: readonly string[]
  onCommit: ManageContactFieldEditorProps["onCommit"]
  appearance: ContactFieldAppearance
}) {
  const selected = contact.booksRead
  const allOptions = [...new Set([...options, ...selected])]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={CONTACT_FIELD_LABEL.booksRead}
          className={cn(
            "flex w-full items-center justify-between gap-2 text-left",
            controlClass(appearance),
          )}
        >
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
            {selected.length > 0 ? selected.join(", ") : "Select books"}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="max-h-64 overflow-y-auto">
          {allOptions.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground">No books in this table.</p>
          ) : (
            allOptions.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-secondary"
              >
                <Checkbox
                  checked={selected.includes(option)}
                  onCheckedChange={(checked) => {
                    ignoreRejectedCommit(
                      onCommit(
                        CONTACT_FIELD_IDS.booksRead,
                        checked === true
                          ? [...selected, option]
                          : selected.filter((value) => value !== option),
                      ),
                    )
                  }}
                />
                <span>{option}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** `contacts.rounds` is a `smallint`; an empty box writes no number at all. */
function NumberFieldEditor({
  contact,
  fieldId,
  controlId,
  onCommit,
  appearance,
}: {
  contact: ManageContact
  fieldId: ContactFieldId
  controlId: string
  onCommit: ManageContactFieldEditorProps["onCommit"]
  appearance: ContactFieldAppearance
}) {
  const committed = contact.rounds
  const [draft, setDraft] = useState(committed === null ? "" : String(committed))

  useEffect(() => {
    setDraft(committed === null ? "" : String(committed))
  }, [committed])

  const commit = () => {
    const trimmed = draft.trim()

    const revert = () => setDraft(committed === null ? "" : String(committed))

    if (trimmed === "") {
      if (committed !== null) {
        const result = onCommit(fieldId, null)
        if (result && typeof result.then === "function") {
          void result.catch(revert)
        }
      }
      return
    }

    const next = Number(trimmed)

    if (!Number.isFinite(next) || next === committed) {
      return
    }

    const result = onCommit(fieldId, next)
    if (result && typeof result.then === "function") {
      void result.catch(revert)
    }
  }

  return (
    <Input
      id={controlId}
      type="number"
      inputMode="numeric"
      value={draft}
      aria-label={CONTACT_FIELD_LABEL[fieldId]}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
          return
        }

        if (event.key === "Escape") {
          event.preventDefault()
          setDraft(committed === null ? "" : String(committed))
        }
      }}
      className={controlClass(appearance)}
    />
  )
}

/** A `YYYY-MM-DD` field, edited with the calendar the grid uses. */
function DateFieldEditor({
  contact,
  fieldId,
  controlId,
  onCommit,
  appearance,
}: {
  contact: ManageContact
  fieldId: ContactFieldId
  controlId: string
  onCommit: ManageContactFieldEditorProps["onCommit"]
  appearance: ContactFieldAppearance
}) {
  const value = readText(contact, fieldId)
  const parsed = value ? parseISO(value) : null
  const selected = parsed && isValid(parsed) ? parsed : undefined

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={controlId}
          aria-label={CONTACT_FIELD_LABEL[fieldId]}
          className={cn(
            "flex w-full items-center justify-between gap-2 text-left",
            controlClass(appearance),
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? formatContactDate(value) : "Set date"}
          </span>
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(next) => {
            if (next) {
              ignoreRejectedCommit(onCommit(fieldId, format(next, "yyyy-MM-dd")))
            }
          }}
        />
        {value ? (
          <button
            type="button"
            onClick={() => ignoreRejectedCommit(onCommit(fieldId, null))}
            className="mt-1 w-full rounded px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Clear date
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** The text a field currently holds, as the string the editor works on. */
function readText(contact: ManageContact, fieldId: ContactFieldId): string {
  switch (fieldId) {
    case CONTACT_FIELD_IDS.name:
      return contact.name
    case CONTACT_FIELD_IDS.phone:
      return contact.phone
    case CONTACT_FIELD_IDS.college:
      return contact.college ?? ""
    case CONTACT_FIELD_IDS.company:
      return contact.company ?? ""
    case CONTACT_FIELD_IDS.notes:
      return contact.notes ?? ""
    case CONTACT_FIELD_IDS.initialContact:
      return contact.initialContact ?? ""
    case CONTACT_FIELD_IDS.dateOfBirth:
      return contact.dateOfBirth ?? ""
    default:
      return ""
  }
}
