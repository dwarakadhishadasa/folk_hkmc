"use client"

import { useId } from "react"
import {
  AlignLeft,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  Clock,
  GraduationCap,
  Hash,
  Image,
  Link2,
  MapPin,
  Megaphone,
  Repeat,
  Star,
  Tag,
  Type,
  UserCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import { CampaignStatusPill } from "@/components/campaign/campaign-status-pill"
import { formatCampaignDate, formatCampaignTimestamp } from "@/components/campaign/campaign-format"
import { ContactCommentsPane } from "@/components/manage/contact-comments-pane"
import { ManageContactFieldEditor } from "@/components/manage/manage-contact-field-editor"
import { CONTACT_FIELD_SHADOW } from "@/components/manage/contact-record-styles"
import {
  CONTACT_FIELD_IDS,
  CONTACT_FIELD_LABEL,
  CONTACT_FIELD_ORDER,
  contactFieldText,
  isContactFieldEditable,
  type ContactFieldId,
} from "@/components/manage/manage-contact-fields"
import type { ContactRecordViewState, CommentActions } from "@/components/contacts/contact-record-types"
import type { ManageContactHistory } from "@/components/manage/manage-types"
import { cn } from "@/lib/utils"

/**
 * The record's content.
 *
 * One component for both frames: the desktop dialog and the phone sheet render
 * the same fields, the same attendance and campaign sections and the same
 * comments pane. It **never fetches** and never derives a capability — the host
 * hands it one view state and one commit callback, and the server's
 * `capabilities` decide what is editable and what the comments pane may show.
 *
 * Sections start at `h2`; the frame owns the record's title.
 */
export interface ContactRecordBodyProps {
  state: ContactRecordViewState
  onCommit?: (fieldId: ContactFieldId, value: unknown) => void | Promise<void>
  commentActions?: CommentActions | null
  showComments?: boolean
  layout?: "desktop" | "phone"
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

function ReadOnlyValue({ text }: { text: string }) {
  return (
    <div
      className={cn(
        "flex min-h-8 items-center rounded-[6px] bg-field px-2 text-[13px] leading-[19.5px] text-foreground",
        CONTACT_FIELD_SHADOW,
      )}
    >
      <span className="truncate">{text || "—"}</span>
    </div>
  )
}

function PhotoValue({ contactName, photoUrl }: { contactName: string; photoUrl: string | null }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a signed URL, not an optimizable local asset
      <img
        src={photoUrl}
        alt={`${contactName}'s photo`}
        className="h-16 w-16 rounded-[6px] object-cover ring-1 ring-border"
      />
    )
  }

  return (
    <div
      className={cn(
        "flex h-8 items-center rounded-[6px] bg-field px-2 text-[13px] leading-[19.5px] text-muted-foreground",
        CONTACT_FIELD_SHADOW,
      )}
    >
      No photo
    </div>
  )
}

/** One field in the desktop frame: a 160px label column beside its value. */
function DesktopFieldRow({
  state,
  fieldId,
  photoUrl,
  onCommit,
}: {
  state: ContactRecordViewState
  fieldId: ContactFieldId
  photoUrl: string | null
  onCommit?: ContactRecordBodyProps["onCommit"]
}) {
  const inputId = useId()
  const Icon = FIELD_ICON[fieldId]
  const editable = isContactFieldEditable(fieldId) && state.capabilities.canEdit

  return (
    <div className="flex gap-4" data-contact-field={fieldId}>
      <div className="flex w-40 shrink-0 items-start pt-1">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        {editable ? (
          <label htmlFor={inputId} className="text-[13px] leading-5 text-foreground/75">
            {CONTACT_FIELD_LABEL[fieldId]}
          </label>
        ) : (
          <span className="text-[13px] leading-5 text-foreground/75">
            {CONTACT_FIELD_LABEL[fieldId]}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {fieldId === CONTACT_FIELD_IDS.photo ? (
          <PhotoValue contactName={state.contact.name} photoUrl={photoUrl} />
        ) : editable && onCommit ? (
          <ManageContactFieldEditor
            contact={state.contact}
            fieldId={fieldId}
            locations={state.locations}
            locationOptions={state.locationOptions}
            sourceOptions={state.sourceOptions}
            booksReadOptions={state.booksReadOptions}
            onCommit={onCommit}
            inputId={inputId}
            appearance="record"
          />
        ) : (
          <ReadOnlyValue text={contactFieldText(state.contact, fieldId, state.resolvers)} />
        )}
      </div>
    </div>
  )
}

/** One field in the phone frame: a label above its value. */
function PhoneFieldRow({
  state,
  fieldId,
  photoUrl,
  onCommit,
}: {
  state: ContactRecordViewState
  fieldId: ContactFieldId
  photoUrl: string | null
  onCommit?: ContactRecordBodyProps["onCommit"]
}) {
  const inputId = useId()
  const editable = isContactFieldEditable(fieldId) && state.capabilities.canEdit

  return (
    <div className="flex flex-col gap-1.5" data-contact-field={fieldId}>
      {editable ? (
        <label htmlFor={inputId} className="text-[13px] font-medium text-[var(--program-text)]">
          {CONTACT_FIELD_LABEL[fieldId]}
        </label>
      ) : (
        <span className="text-[13px] font-medium text-[var(--program-text)]">
          {CONTACT_FIELD_LABEL[fieldId]}
        </span>
      )}
      <div className="min-w-0">
        {fieldId === CONTACT_FIELD_IDS.photo ? (
          <PhotoValue contactName={state.contact.name} photoUrl={photoUrl} />
        ) : editable && onCommit ? (
          <ManageContactFieldEditor
            contact={state.contact}
            fieldId={fieldId}
            locations={state.locations}
            locationOptions={state.locationOptions}
            sourceOptions={state.sourceOptions}
            booksReadOptions={state.booksReadOptions}
            onCommit={onCommit}
            inputId={inputId}
            appearance="field"
          />
        ) : (
          <span className="text-[13px] text-[var(--program-text)]">
            {contactFieldText(state.contact, fieldId, state.resolvers) || "—"}
          </span>
        )}
      </div>
    </div>
  )
}

/** A titled block under the fields. Its heading is an `h2`: the frame owns `h1`. */
function RecordSection({
  id,
  title,
  icon: Icon,
  count,
  children,
}: {
  id: string
  title: string
  icon: LucideIcon
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="mt-8" data-contact-section={id}>
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-medium leading-5 text-foreground">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        {title}
        <span className="text-[11px] font-normal text-muted-foreground">{count}</span>
      </h2>
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
      <div data-contact-attendance={entry.sessionName ?? ""}>
        <p className="text-[13px] leading-5 text-foreground">{entry.sessionName ?? "Session"}</p>
        <p className="mt-0.5 text-[11px] leading-[16.5px] text-muted-foreground">
          {entry.sessionDate ? formatCampaignDate(entry.sessionDate) : "No date"}
          {entry.locationName ? ` · ${entry.locationName}` : ""}
        </p>
      </div>
    </HistoryCard>
  )
}

/** One campaign record: campaign, status, start date, caller and note. */
function CampaignCard({ entry }: { entry: ManageContactHistory["campaigns"][number] }) {
  const assignmentStatus =
    entry.assignmentStatus.charAt(0) + entry.assignmentStatus.slice(1).toLowerCase()

  return (
    <HistoryCard>
      <div data-contact-campaign={entry.campaignName}>
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
      </div>
    </HistoryCard>
  )
}

function ActivitySections({ state }: { state: ContactRecordViewState }) {
  const history = state.history
  const attendance = history.status === "ready" ? history.value.attendance : []
  const campaigns = history.status === "ready" ? history.value.campaigns : []

  return (
    <>
      {history.status === "error" ? (
        <p role="alert" className="mt-8 text-[12px] text-destructive">
          {history.message}
        </p>
      ) : null}

      <RecordSection id="attendance" title="Attendance" icon={CalendarDays} count={attendance.length}>
        {history.status === "loading" ? (
          <p className="text-[12px] text-muted-foreground">Loading attendance…</p>
        ) : null}
        {history.status === "ready" && attendance.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No attendance recorded.</p>
        ) : null}
        {attendance.map((entry) => (
          <AttendanceCard key={entry.id} entry={entry} />
        ))}
      </RecordSection>

      <RecordSection
        id="campaigns"
        title="Campaign history"
        icon={Megaphone}
        count={campaigns.length}
      >
        {history.status === "loading" ? (
          <p className="text-[12px] text-muted-foreground">Loading campaign history…</p>
        ) : null}
        {history.status === "ready" && campaigns.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            This contact has not been in a campaign yet.
          </p>
        ) : null}
        {campaigns.map((entry) => (
          <CampaignCard key={entry.id} entry={entry} />
        ))}
      </RecordSection>
    </>
  )
}

export function ContactRecordBody({
  state,
  onCommit,
  commentActions = null,
  showComments = true,
  layout = "desktop",
}: ContactRecordBodyProps) {
  const nameId = useId()
  const photoUrl = state.history.status === "ready" ? state.history.value.photoUrl : null
  const orderedFields = CONTACT_FIELD_ORDER.filter((fieldId) => fieldId !== CONTACT_FIELD_IDS.name)
  const editableName = state.capabilities.canEdit && onCommit

  const fields =
    layout === "desktop" ? (
      <div className="mx-auto w-full max-w-[640px]">
        {/*
          The primary field is the title. Its label sits above the control, and
          the control bleeds 8px past the column on each side so its text starts
          on the same x as the label.
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
            {editableName ? (
              <ManageContactFieldEditor
                contact={state.contact}
                fieldId={CONTACT_FIELD_IDS.name}
                locations={state.locationOptions}
                onCommit={onCommit}
                inputId={nameId}
                appearance="record-title"
              />
            ) : (
              <ReadOnlyValue text={state.contact.name} />
            )}
          </div>
        </div>

        <div className="mb-8 mt-4 h-px bg-border" />

        <div className="flex flex-col gap-6">
          {orderedFields.map((fieldId) => (
            <DesktopFieldRow
              key={fieldId}
              state={state}
              fieldId={fieldId}
              photoUrl={photoUrl}
              onCommit={onCommit}
            />
          ))}
        </div>

        <div className="mb-8 mt-8 h-px bg-border" />
        <ActivitySections state={state} />
      </div>
    ) : (
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
        <div data-contact-field={CONTACT_FIELD_IDS.name}>
          {editableName ? (
            <label htmlFor={nameId} className="sr-only">
              {CONTACT_FIELD_LABEL.name}
            </label>
          ) : (
            <span className="sr-only">{CONTACT_FIELD_LABEL.name}</span>
          )}
          {editableName ? (
            <ManageContactFieldEditor
              contact={state.contact}
              fieldId={CONTACT_FIELD_IDS.name}
              locations={state.locations}
              onCommit={onCommit}
              inputId={nameId}
              appearance="title"
            />
          ) : (
            <p className="text-[22px] font-bold text-[var(--program-text)]">{state.contact.name}</p>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {orderedFields.map((fieldId) => (
            <PhoneFieldRow
              key={fieldId}
              state={state}
              fieldId={fieldId}
              photoUrl={photoUrl}
              onCommit={onCommit}
            />
          ))}
        </div>

        <ActivitySections state={state} />
      </div>
    )

  if (layout === "phone") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4" data-contact-record-fields="">
          {fields}
        </div>
        {showComments ? (
          <div className="min-h-[280px] shrink-0 border-t border-border" data-contact-record-comments="">
            <ContactCommentsPane
              contactName={state.contact.name}
              comments={state.comments}
              canComment={state.capabilities.canComment}
              actions={commentActions}
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-10 pb-10 pt-8" data-contact-record-fields="">
        {fields}
      </div>
      {showComments ? (
        <div className="flex w-[304px] shrink-0" data-contact-record-comments="">
          <ContactCommentsPane
            contactName={state.contact.name}
            comments={state.comments}
            canComment={state.capabilities.canComment}
            actions={commentActions}
          />
        </div>
      ) : null}
    </div>
  )
}
