/**
 * The browser-safe shape of a campaign survey, mirrored from
 * `lib/dialer/surveys.ts`.
 *
 * The builder is a client component and the service module is `server-only`, so
 * the DTO is declared here rather than imported from there: the page passes the
 * service's own objects, which are structurally these, and the client graph
 * never reaches `lib/dialer/*`.
 */

export const SURVEY_QUESTION_TYPES = ["TEXT", "DROPDOWN", "RADIO", "MULTI_SELECT", "DATE"] as const

export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number]

const CHOICE_QUESTION_TYPES: ReadonlyArray<SurveyQuestionType> = ["DROPDOWN", "RADIO", "MULTI_SELECT"]

export function isChoiceQuestionType(type: SurveyQuestionType): boolean {
  return CHOICE_QUESTION_TYPES.includes(type)
}

export interface SurveyOptionView {
  id: string
  label: string
  value: string
  sortOrder: number
}

export interface SurveyQuestionView {
  id: string
  campaignId: string
  questionTitle: string
  questionType: SurveyQuestionType
  sortOrder: number
  isRequired: boolean
  retiredAt: string | null
  responseCount: number
  options: SurveyOptionView[]
  createdAt: string
  updatedAt: string
}
