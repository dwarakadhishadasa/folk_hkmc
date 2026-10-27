/**
 * The caller session DTOs, mirrored from `lib/dialer/caller.ts`.
 *
 * The service module is `server-only`, so a client component cannot import its
 * values. The shapes are copied here deliberately: a field added to the service
 * payload must be added here before a client can render it, and that is a
 * smaller risk than importing a server boundary into the browser bundle.
 */

export interface CallerContactHistoryEntry {
  callLogId: string
  calledAt: string
  dispositionStatus: string
  statusGroup: string
  followUpNotes: string | null
  attempt: number
}

export interface CallerSurveyOption {
  label: string
  value: string
}

export interface CallerSurveyQuestion {
  id: string
  questionTitle: string
  questionType: "TEXT" | "DROPDOWN" | "RADIO" | "MULTI_SELECT" | "DATE"
  isRequired: boolean
  sortOrder: number
  options: CallerSurveyOption[]
}

export interface CallerContactProfile {
  centre: string | null
  level: string | null
  gender: string | null
  language: string | null
}

export interface CallerQueueEntry {
  assignmentId: string
  campaignId: string
  campaignName: string
  campaignDate: string
  campaignStatus: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED"
  campaignGapDuration: number
  contactId: string
  contactName: string
  phone: string
  sortOrder: number
  attempt: number
  maxAttempts: number
  history: CallerContactHistoryEntry[]
  profile: CallerContactProfile
  campaignProgress: { called: number; total: number }
}

export interface CallerQueueCounts {
  called: number
  reached: number
  noAnswer: number
  pending: number
}

export interface CallerQueueCampaign {
  id: string
  name: string
  campaignDate: string
  gapDuration: number
  maxAttempts: number
  total: number
  called: number
}

export interface CallerQueuePayload {
  caller: { id: string; displayName: string }
  entries: CallerQueueEntry[]
  counts: CallerQueueCounts
  campaigns: CallerQueueCampaign[]
  surveysByCampaign: Record<string, CallerSurveyQuestion[]>
}

export interface CallerSessionCounts {
  total: number
  called: number
  reached: number
  noAnswer: number
  wrongNumber: number
  skipped: number
  pending: number
  closedAfterCap: number
  recallable: number
}

export interface CallerSessionSummary {
  campaign: {
    id: string
    name: string
    campaignDate: string
    status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED"
    maxAttempts: number
  }
  counts: CallerSessionCounts
}

export interface DispositionResponseInput {
  questionId: string
  answer: string | null
  answerValues: string[] | null
}
