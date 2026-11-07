"use client"

import { useEffect, useId, useRef, useState, type ComponentProps } from "react"
import {
  AlignLeft,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  GraduationCap,
  Hash,
  Image,
  Link2,
  MapPin,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Repeat,
  Star,
  Tag,
  Type,
  UserCheck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react"

import { CampaignStatusPill } from "@/components/campaign/campaign-status-pill"
import { formatCampaignDate, formatCampaignTimestamp } from "@/components/campaign/campaign-format"
import { ContactCommentsPane } from "@/components/manage/contact-comments-pane"
import { ManageContactFieldEditor } from "@/components/manage/manage-contact-field-editor"
import {
  CONTACT_DIALOG_SHADOW,
  CONTACT_FIELD_SHADOW,
} from "@/components/manage/contact-record-styles"
import {
  CONTACT_FIELD_IDS,
  CONTACT_FIELD_LABEL,
  CONTACT_FIELD_ORDER,
  contactFieldText,
  isContactFieldEditable,
  type ContactFieldId,
  type ContactFieldResolvers,
} from "@/components/manage/manage-contact-fields"
import type {
  ManageContact,
  ManageContactHistory,
  ManageLocation,
} from "@/components/manage/manage-types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

/**
 * The expanded record, over the grid.
 *
 * The frame is measured from the source product's detail view: a 1104px
 * dialog that grows to 800px when the comments column is collapsed, a 48px
 * toolbar, an 800px field column whose content is capped at 640px, and a
 * 304px comments column. The dialog starts under the page header and keeps a
 * 12px gutter on the other three sides rather than floating in the middle of
 * the viewport.
 *
 * The primary field is the one exception to the label-beside-value rule: the
 * name is the record's title, so its label sits above a 40px control while
 * every other field puts its label in a 160px column beside a 32px value.
 *
 * Two of the source's affordances are absent, and deliberately:
 *
 * - **Cell-level comments.** The table stores `cell_field_id` so the shape
 *   exists, but nothing in this app pins a comment to a field yet, and a
 *   control that only ever writes `null` is noise.
 * - **Reactions and reply threads.** Both need a second table each; see the
 *   note in `contact-comments-pane.tsx`.
 */
export interface ContactRecordDialogProps {
  contact: ManageContact
  locations: readonly ManageLocation[]
  resolvers: ContactFieldResolvers
  /** The values the source picker offers. */
  sourceOptions: readonly string[]
  /** The values the books-read picker offers. */
  booksReadOptions: readonly string[]
  onCommit: (fieldId: ContactFieldId, value: unknown) => void
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
  canGoPrevious: boolean
  canGoNext: boolean
}

/** The glyph the source product draws beside each field's label. */
const FIELD_ICON: Record<ContactFieldId, LucideIcon> = {
  [CONTACT_FIELD_IDS.name]: Type,
  [CONTACT_FIELD_IDS.phone]: Type,
  [CONTACT_FIELD_IDS.age]: Hash,
  [CONTACT_FIELD_IDS.college]: GraduationCap,
  [CONTACT_FIELD_IDS.company]: Building2,
  [CONTACT_FIELD_IDS.designation]: Briefcase,
  [CONTACT_FIELD_IDS.year]: CalendarDays,
  [CONTACT_FIELD_IDS.address]: MapPin,
  [CONTACT_FIELD_IDS.location]: Link2,
  [CONTACT_FIELD_IDS.source]: Tag,
  [CONTACT_FIELD_IDS.rounds]: Repeat,
  [CONTACT_FIELD_IDS.booksRead]: BookOpen,
  [CONTACT_FIELD_IDS.initialContact]: CalendarDays,
  [CONTACT_FIELD_IDS.dateOfBirth]: CalendarDays,
  [CONTACT_FIELD_IDS.totalAttendance]: Hash,
  [CONTACT_FIELD_IDS.past60DayAttendance]: Hash,
  [CONTACT_FIELD_IDS.lastContactedOn]: Clock,
  [CONTACT_FIELD_IDS.notes]: AlignLeft,
  [CONTACT_FIELD_IDS.collectedBy]: UserRound,
  [CONTACT_FIELD_IDS.assignedPreacher]: UserCheck,
  [CONTACT_FIELD_IDS.favorite]: Star,
  [CONTACT_FIELD_IDS.photo]: Image,
}

/**
 * The header's circular icon button.
 *
 * The hit area is the toolbar's full height, as in the source product; the
 * 24px circle is only the paint.
 */
function HeaderIconButton({
  label,
  active = false,
  children,
  ...props
}: ComponentProps<"button"> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      {...props}
      className="group flex h-12 w-6 items-center justify-center outline-none disabled:opacity-40"
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-foreground opacity-75 transition-[background-color,opacity] group-hover:bg-secondary group-hover:opacity-100 group-focus-visible:ring-1 group-focus-visible:ring-ring dark:group-hover:bg-field",
          active && "bg-secondary opacity-75 dark:bg-field",
        )}
      >
        {children}
      </span>
    </button>
  )
}

/** One field, label in a 160px column beside its 32px value. */
function RecordFieldRow({
  contact,
  fieldId,
  locations,
  resolvers,
  sourceOptions,
  booksReadOptions,
  photoUrl,
  onCommit,
}: {
  contact: ManageContact
  fieldId: ContactFieldId
  locations: readonly ManageLocation[]
  resolvers: ContactFieldResolvers
  sourceOptions: readonly string[]
  booksReadOptions: readonly string[]
  photoUrl: string | null
  onCommit: (fieldId: ContactFieldId, value: unknown) => void
}) {
  const inputId = useId()
  const Icon = FIELD_ICON[fieldId]
  const editable = isContactFieldEditable(fieldId)

  return (
    <div className="flex gap-4" data-contact-field={fieldId}>
      <div className="flex w-40 shrink-0 items-start pt-1">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <label htmlFor={inputId} className="text-[13px] leading-5 text-foreground/75">
          {CONTACT_FIELD_LABEL[fieldId]}
        </label>
      </div>
      <div className="min-w-0 flex-1">
        {fieldId === CONTACT_FIELD_IDS.photo ? (
          photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed URL, not an optimizable local asset
            <img
              src={photoUrl}
              alt={`${contact.name}'s photo`}
              className="h-16 w-16 rounded-[6px] object-cover ring-1 ring-border"
            />
          ) : (
            <div
              className={cn(
                "flex h-8 items-center rounded-[6px] bg-field px-2 text-[13px] leading-[19.5px] text-muted-foreground",
                CONTACT_FIELD_SHADOW,
              )}
            >
              No photo
            </div>
          )
        ) : editable ? (
          <ManageContactFieldEditor
            contact={contact}
            fieldId={fieldId}
            locations={locations}
            sourceOptions={sourceOptions}
            booksReadOptions={booksReadOptions}
            onCommit={onCommit}
            inputId={inputId}
            appearance="record"
          />
        ) : (
          <div
            className={cn(
              "flex h-8 items-center rounded-[6px] bg-field px-2 text-[13px] leading-[19.5px] text-foreground",
              CONTACT_FIELD_SHADOW,
            )}
          >
            <span className="truncate">{contactFieldText(contact, fieldId, resolvers) || "—"}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const HISTORY_ENDPOINT = "/api/manage/contacts/history"

type ContactHistoryState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; history: ManageContactHistory }

/**
 * The record's activity lists.
 *
 * Loaded per contact rather than with the grid: the contacts payload is every
 * row in the view, and neither list is needed until a record is opened. An
 * aborted request is not an error — it is the previous contact's request
 * finishing after the operator stepped to the next one.
 */
function useContactHistory(contactId: string): ContactHistoryState {
  const [state, setState] = useState<ContactHistoryState>({ kind: "loading" })

  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: "loading" })

    fetch(`${HISTORY_ENDPOINT}?contactId=${encodeURIComponent(contactId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load this contact's history.")
        }

        return (await response.json()) as ManageContactHistory
      })
      .then((history) => setState({ kind: "ready", history }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setState({
          kind: "error",
          message:
            error instanceof Error ? error.message : "Unable to load this contact's history.",
        })
      })

    return () => controller.abort()
  }, [contactId])

  return state
}

/** A titled block under the fields, with the same rhythm as a field row. */
function RecordSection({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string
  icon: LucideIcon
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium leading-5 text-foreground">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        {title}
        <span className="text-[11px] font-normal text-muted-foreground">{count}</span>
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

/** One card in an activity list, on the same surface as a field value. */
function HistoryCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[6px] bg-field px-3 py-2", CONTACT_FIELD_SHADOW)}>{children}</div>
  )
}

/** One attendance record: session, day, location. */
function AttendanceCard({ entry }: { entry: ManageContactHistory["attendance"][number] }) {
  return (
    <HistoryCard>
      <p className="text-[13px] leading-5 text-foreground">{entry.sessionName ?? "Session"}</p>
      <p className="mt-0.5 text-[11px] leading-[16.5px] text-muted-foreground">
        {entry.sessionDate ? formatCampaignDate(entry.sessionDate) : "No date"}
        {entry.locationName ? ` · ${entry.locationName}` : ""}
      </p>
    </HistoryCard>
  )
}

/** One campaign record: campaign, status, start date, caller and note. */
function CampaignCard({ entry }: { entry: ManageContactHistory["campaigns"][number] }) {
  const assignmentStatus =
    entry.assignmentStatus.charAt(0) + entry.assignmentStatus.slice(1).toLowerCase()

  return (
    <HistoryCard>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] leading-5 text-foreground">
          {entry.campaignName}
        </p>
        <CampaignStatusPill status={entry.campaignStatus} />
      </div>
      <dl className="mt-1 flex flex-col gap-0.5 text-[11px] leading-[16.5px]">
        <div className="flex gap-1">
          <dt className="shrink-0 text-muted-foreground">Status</dt>
          <dd className="min-w-0 text-foreground">{assignmentStatus}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="shrink-0 text-muted-foreground">Start date</dt>
          <dd className="min-w-0 text-foreground">
            {entry.startDate ? formatCampaignTimestamp(entry.startDate) : "—"}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="shrink-0 text-muted-foreground">Caller</dt>
          <dd className="min-w-0 text-foreground">{entry.callerName ?? "Unassigned"}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="shrink-0 text-muted-foreground">Notes</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-foreground">
            {entry.notes || "—"}
          </dd>
        </div>
      </dl>
    </HistoryCard>
  )
}

export function ContactRecordDialog({
  contact,
  locations,
  resolvers,
  sourceOptions,
  booksReadOptions,
  onCommit,
  onClose,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}: ContactRecordDialogProps) {
  const nameId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [commentsOpen, setCommentsOpen] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  /**
   * Where the dialog's top edge sits.
   *
   * The source product starts the dialog under its chrome rather than
   * centring it, so the offset is the page header's own bottom edge — not a
   * constant, because the header is 64px on the phone and 73px from `sm` up.
   */
  const [top, setTop] = useState(88)

  useEffect(() => {
    const header = [...document.querySelectorAll("header")].find(
      (element) => !element.closest("[data-contact-record-dialog]"),
    )

    const update = () => {
      setTop(header ? Math.round(header.getBoundingClientRect().bottom) : 88)
    }

    update()
    window.addEventListener("resize", update)

    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current)
      }
    },
    [],
  )

  /**
   * `Escape` closes the record, and the arrow keys step through records the way
   * the chevrons do. Both are captured here rather than on the document with a
   * guard, because the dialog is the only frame: when it is open, it owns the
   * keyboard.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key === "ArrowUp" && event.altKey && canGoPrevious) {
        event.preventDefault()
        onPrevious()
        return
      }

      if (event.key === "ArrowDown" && event.altKey && canGoNext) {
        event.preventDefault()
        onNext()
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => document.removeEventListener("keydown", onKeyDown)
  }, [canGoNext, canGoPrevious, onClose, onNext, onPrevious])

  const copy = (kind: string, value: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      return
    }

    void navigator.clipboard.writeText(value).then(() => {
      setCopied(kind)
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current)
      }
      copiedTimer.current = setTimeout(() => setCopied(null), 1500)
    })
  }

  const history = useContactHistory(contact.id)
  const orderedFields = CONTACT_FIELD_ORDER.filter(
    (fieldId) => fieldId !== CONTACT_FIELD_IDS.name,
  )

  return (
    <div className="fixed inset-0 z-50" data-contact-record-dialog="">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/25"
        onClick={onClose}
      />

      <div
        className="pointer-events-none fixed inset-x-3 bottom-3 flex justify-center"
        style={{ top }}
      >
        <div
          ref={rootRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Detail view dialog"
          className={cn(
            "pointer-events-auto flex h-full max-h-[800px] w-full flex-col overflow-hidden rounded-[6px] bg-card text-[13px] text-foreground outline-none",
            CONTACT_DIALOG_SHADOW,
            commentsOpen ? "max-w-[1104px]" : "max-w-[800px]",
          )}
        >
          <header className="flex h-12 shrink-0 items-center border-b border-border pl-5 pr-4">
            <div className="flex w-9 shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Previous contact"
                disabled={!canGoPrevious}
                onClick={onPrevious}
                className="flex h-12 w-4 items-center justify-center text-foreground opacity-75 outline-none hover:opacity-100 focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <ChevronUp aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Next contact"
                disabled={!canGoNext}
                onClick={onNext}
                className="flex h-12 w-4 items-center justify-center text-foreground opacity-75 outline-none hover:opacity-100 focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <ChevronDown aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="min-w-0 flex-1" />

            <div className="flex shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <HeaderIconButton label="More options">
                    <MoreHorizontal aria-hidden="true" className="size-4" />
                  </HeaderIconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuItem onSelect={() => copy("name", contact.name)}>
                    {copied === "name" ? <Check aria-hidden="true" /> : null}
                    Copy name
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => copy("phone", contact.phone)}>
                    {copied === "phone" ? <Check aria-hidden="true" /> : null}
                    Copy phone
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => copy("id", contact.id)}>
                    {copied === "id" ? <Check aria-hidden="true" /> : null}
                    Copy contact ID
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <HeaderIconButton
                label="Copy contact URL"
                onClick={() => copy("url", `${window.location.href.split("#")[0]}#contact-${contact.id}`)}
              >
                {copied === "url" ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <Link2 aria-hidden="true" className="size-4" />
                )}
              </HeaderIconButton>

              <HeaderIconButton
                label={
                  commentsOpen
                    ? "Hide comments and revision history"
                    : "Show comments and revision history"
                }
                active={commentsOpen}
                onClick={() => setCommentsOpen((open) => !open)}
              >
                <MessageSquare aria-hidden="true" className="size-4" />
              </HeaderIconButton>

              <span aria-hidden="true" className="mx-2 h-[15px] w-px bg-border" />

              <HeaderIconButton label="Close dialog" onClick={onClose}>
                <X aria-hidden="true" className="size-4" />
              </HeaderIconButton>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <div
              className="min-h-0 min-w-0 flex-1 overflow-y-auto px-10 pb-10 pt-8"
              data-contact-record-fields=""
            >
              <div className="mx-auto w-full max-w-[640px]">
                {/*
                  The primary field is the title. Its label sits above the
                  control, and the control bleeds 8px past the column on each
                  side so its text starts on the same x as the label.
                */}
                <div className="mt-2" data-contact-field={CONTACT_FIELD_IDS.name}>
                  <div className="mb-1 flex items-center">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                      <Type aria-hidden="true" className="size-4" />
                    </span>
                    <label htmlFor={nameId} className="text-[13px] leading-5 text-foreground/75">
                      {CONTACT_FIELD_LABEL.name}
                    </label>
                  </div>
                  <div className="-mx-2">
                    <ManageContactFieldEditor
                      contact={contact}
                      fieldId={CONTACT_FIELD_IDS.name}
                      locations={locations}
                      onCommit={onCommit}
                      inputId={nameId}
                      appearance="record-title"
                    />
                  </div>
                </div>

                <div className="mb-8 mt-4 h-px bg-border" />

                <div className="flex flex-col gap-6">
                  {orderedFields.map((fieldId) => (
                    <RecordFieldRow
                      key={fieldId}
                      contact={contact}
                      fieldId={fieldId}
                      locations={locations}
                      resolvers={resolvers}
                      sourceOptions={sourceOptions}
                      booksReadOptions={booksReadOptions}
                      photoUrl={history.kind === "ready" ? history.history.photoUrl : null}
                      onCommit={onCommit}
                    />
                  ))}
                </div>

                <div className="mb-8 mt-8 h-px bg-border" />

                {history.kind === "error" ? (
                  <p role="alert" className="text-[12px] text-destructive">
                    {history.message}
                  </p>
                ) : null}

                <RecordSection
                  title="Attendance"
                  icon={CalendarDays}
                  count={history.kind === "ready" ? history.history.attendance.length : 0}
                >
                  {history.kind === "loading" ? (
                    <p className="text-[12px] text-muted-foreground">Loading attendance…</p>
                  ) : null}
                  {history.kind === "ready" && history.history.attendance.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">No attendance recorded.</p>
                  ) : null}
                  {history.kind === "ready"
                    ? history.history.attendance.map((entry) => (
                        <AttendanceCard key={entry.id} entry={entry} />
                      ))
                    : null}
                </RecordSection>

                <RecordSection
                  title="Campaign history"
                  icon={Megaphone}
                  count={history.kind === "ready" ? history.history.campaigns.length : 0}
                >
                  {history.kind === "loading" ? (
                    <p className="text-[12px] text-muted-foreground">Loading campaign history…</p>
                  ) : null}
                  {history.kind === "ready" && history.history.campaigns.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      This contact has not been in a campaign yet.
                    </p>
                  ) : null}
                  {history.kind === "ready"
                    ? history.history.campaigns.map((entry) => (
                        <CampaignCard key={entry.id} entry={entry} />
                      ))
                    : null}
                </RecordSection>
              </div>
            </div>

            <div className={cn("w-[304px] shrink-0", commentsOpen ? "flex" : "hidden")}>
              <ContactCommentsPane contactId={contact.id} contactName={contact.name} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
