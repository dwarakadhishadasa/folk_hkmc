import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { getCampaign } from "@/lib/dialer/campaigns"
import { requireCampaignAdmin } from "@/lib/dialer/scope"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { collectPagedRows, type PagingFailures } from "@/lib/supabase/paging"
import type { Database } from "@/lib/supabase/types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const QUESTION_TITLE_MAX_LENGTH = 200
const OPTION_LABEL_MAX_LENGTH = 120
const OPTION_VALUE_MAX_LENGTH = 120
const OPTION_QUERY_CHUNK_SIZE = 200

const QUESTION_COLUMNS =
  "id,program_id,campaign_id,question_title,question_type,sort_order,is_required,retired_at,created_at,updated_at"
const OPTION_COLUMNS = "id,program_id,question_id,label,value,sort_order,created_at,updated_at"

const PARTIAL_OPTION_WRITE_MESSAGE =
  "Unable to save the survey options; the question may have been partially updated."

export type SurveyQuestionType = "TEXT" | "DROPDOWN" | "RADIO" | "MULTI_SELECT" | "DATE"

export type SurveyQuestionRow = Database["public"]["Tables"]["dialer_survey_questions"]["Row"]
export type SurveyOptionRow = Database["public"]["Tables"]["dialer_survey_options"]["Row"]

export interface SurveyOption {
  id: string
  label: string
  value: string
  sortOrder: number
}

export interface SurveyQuestion {
  id: string
  campaignId: string
  questionTitle: string
  questionType: SurveyQuestionType
  sortOrder: number
  isRequired: boolean
  retiredAt: string | null
  responseCount: number
  options: SurveyOption[]
  createdAt: string
  updatedAt: string
}

export interface SurveyOptionInput {
  id?: string
  label: string
  value?: string
}

export interface CreateQuestionInput {
  questionTitle: string
  questionType: SurveyQuestionType
  isRequired?: boolean
  options?: SurveyOptionInput[]
}

export interface UpdateQuestionInput {
  questionTitle?: string
  questionType?: SurveyQuestionType
  isRequired?: boolean
  options?: SurveyOptionInput[]
}

export interface ListCampaignQuestionsOptions {
  includeRetired?: boolean
}

const QUESTION_TYPES = {
  TEXT: true,
  DROPDOWN: true,
  RADIO: true,
  MULTI_SELECT: true,
  DATE: true,
} as const satisfies Record<SurveyQuestionType, true>

const CHOICE_QUESTION_TYPES = {
  DROPDOWN: true,
  RADIO: true,
  MULTI_SELECT: true,
} as const satisfies Partial<Record<SurveyQuestionType, true>>

/**
 * A JSON body reaches these predicates as a plain string: `"constructor"` must
 * be a 400, not an `Object.prototype` lookup followed by a 500.
 */
function isSurveyQuestionType(value: string): value is SurveyQuestionType {
  return Object.prototype.hasOwnProperty.call(QUESTION_TYPES, value)
}

function isChoiceQuestionType(value: SurveyQuestionType): boolean {
  return Object.prototype.hasOwnProperty.call(CHOICE_QUESTION_TYPES, value)
}

function questionNotFound(): AuthzError {
  return new AuthzError(404, "question_not_found", "Question not found in this campaign.")
}

function assertQuestionIdShape(questionId: string): void {
  if (!UUID_PATTERN.test(questionId)) {
    throw questionNotFound()
  }
}

function invalidQuestionOrder(): AuthzError {
  return new AuthzError(
    400,
    "invalid_question_order",
    "The order must list every live question in this campaign exactly once.",
  )
}

const QUESTION_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "question_read_failed", "Unable to read the campaign survey."),
  truncated: () => new AuthzError(500, "survey_list_truncated", "The campaign survey read was truncated."),
}

const OPTION_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "option_read_failed", "Unable to read the survey options."),
  truncated: () => new AuthzError(500, "survey_list_truncated", "The campaign survey read was truncated."),
}

const RESPONSE_COUNT_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "response_count_read_failed", "Unable to count survey responses."),
  truncated: () => new AuthzError(500, "response_count_truncated", "The survey response count read was truncated."),
}

function requireQuestionTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : ""

  if (title.length < 1 || title.length > QUESTION_TITLE_MAX_LENGTH) {
    throw new AuthzError(
      400,
      "invalid_question_title",
      `Question title must be between 1 and ${QUESTION_TITLE_MAX_LENGTH} characters.`,
    )
  }

  return title
}

function requireQuestionType(value: unknown): SurveyQuestionType {
  if (typeof value !== "string" || !isSurveyQuestionType(value)) {
    throw new AuthzError(
      400,
      "invalid_question_type",
      "Question type must be TEXT, DROPDOWN, RADIO, MULTI_SELECT or DATE.",
    )
  }

  return value
}

function requireStoredQuestionType(value: string): SurveyQuestionType {
  if (!isSurveyQuestionType(value)) {
    throw new AuthzError(500, "question_read_failed", "A survey question has an unsupported type.")
  }

  return value
}

function requireIsRequired(value: unknown): boolean {
  if (value === undefined) {
    return true
  }

  if (typeof value !== "boolean") {
    throw new AuthzError(400, "invalid_is_required", "Required must be true or false.")
  }

  return value
}

function requireOptionLabel(value: unknown): string {
  const label = typeof value === "string" ? value.trim() : ""

  if (label.length < 1 || label.length > OPTION_LABEL_MAX_LENGTH) {
    throw new AuthzError(
      400,
      "invalid_option_label",
      `Option label must be between 1 and ${OPTION_LABEL_MAX_LENGTH} characters.`,
    )
  }

  return label
}

function requireOptionValue(value: unknown): string {
  const optionValue = typeof value === "string" ? value.trim() : ""

  if (optionValue.length < 1 || optionValue.length > OPTION_VALUE_MAX_LENGTH) {
    throw new AuthzError(
      400,
      "invalid_option_value",
      `Option value must be between 1 and ${OPTION_VALUE_MAX_LENGTH} characters.`,
    )
  }

  return optionValue
}

function slugHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function slugifyOptionLabel(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  if (slug.length > 0) {
    return slug.slice(0, OPTION_VALUE_MAX_LENGTH)
  }

  return `option_${slugHash(label)}`
}

interface NormalizedOption {
  id?: string
  label: string
  value: string
}

interface NormalizeOptionContext {
  allowIds: boolean
  existingById?: Map<string, SurveyOptionRow>
}

function normalizeOptionInputs(value: unknown, context: NormalizeOptionContext): NormalizedOption[] {
  if (value === undefined) {
    return []
  }

  if (!Array.isArray(value)) {
    throw new AuthzError(400, "invalid_options", "Options must be a list.")
  }

  const options = value.map((entry) => normalizeOptionInput(entry, context))
  assertUniqueOptionSet(options)
  return options
}

function normalizeOptionInput(value: unknown, context: NormalizeOptionContext): NormalizedOption {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AuthzError(400, "invalid_option_label", "An option must carry a label.")
  }

  const record = value as Record<string, unknown>
  const label = requireOptionLabel(record.label)

  let id: string | undefined
  if (record.id !== undefined && record.id !== null) {
    if (!context.allowIds) {
      throw new AuthzError(400, "invalid_option_id", "A new question's options cannot carry an id.")
    }

    if (typeof record.id !== "string" || !UUID_PATTERN.test(record.id)) {
      throw new AuthzError(400, "invalid_option_id", "An option id is not a uuid.")
    }

    if (!context.existingById?.has(record.id)) {
      throw new AuthzError(400, "invalid_option_id", "An option id does not belong to this question.")
    }

    id = record.id
  }

  const existing = id ? context.existingById?.get(id) : undefined
  const rawValue = record.value
  let optionValue: string

  if (rawValue === undefined || rawValue === null) {
    optionValue = existing?.value ?? slugifyOptionLabel(label)
  } else {
    optionValue = requireOptionValue(rawValue)
    if (existing && existing.value !== optionValue) {
      throw new AuthzError(
        409,
        "option_value_locked",
        "An existing option's value is its stable key and cannot change.",
      )
    }
  }

  return { ...(id ? { id } : {}), label, value: optionValue }
}

function assertUniqueOptionSet(options: NormalizedOption[]): void {
  const labels = new Set<string>()
  const values = new Set<string>()

  for (const option of options) {
    if (labels.has(option.label)) {
      throw new AuthzError(400, "duplicate_option_label", `Option label "${option.label}" is used twice.`)
    }
    labels.add(option.label)

    if (values.has(option.value)) {
      throw new AuthzError(
        400,
        "duplicate_option_value",
        `Two options resolve to the value "${option.value}"; supply a distinct value for one of them.`,
      )
    }
    values.add(option.value)
  }
}

function assertOptionSetMatchesType(
  questionType: SurveyQuestionType,
  suppliedOptions: NormalizedOption[] | undefined,
  existingOptionCount: number,
): void {
  const finalCount = suppliedOptions ? suppliedOptions.length : existingOptionCount

  if (isChoiceQuestionType(questionType)) {
    if (finalCount === 0) {
      throw new AuthzError(400, "options_required", `A ${questionType} question needs at least one option.`)
    }
    return
  }

  if (suppliedOptions) {
    if (suppliedOptions.length > 0) {
      throw new AuthzError(400, "options_not_allowed", "A TEXT or DATE question cannot have options.")
    }
    return
  }

  if (existingOptionCount > 0) {
    throw new AuthzError(
      400,
      "options_not_allowed",
      "A TEXT or DATE question cannot keep options; send an empty options list to remove them.",
    )
  }
}

function toSurveyOptions(rows: SurveyOptionRow[]): SurveyOption[] {
  return [...rows]
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))
    .map((row) => ({ id: row.id, label: row.label, value: row.value, sortOrder: row.sort_order }))
}

function toSurveyQuestion(
  row: SurveyQuestionRow,
  options: SurveyOption[],
  responseCount: number,
): SurveyQuestion {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    questionTitle: row.question_title,
    questionType: requireStoredQuestionType(row.question_type),
    sortOrder: row.sort_order,
    isRequired: row.is_required,
    retiredAt: row.retired_at,
    responseCount,
    options,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function readQuestionRows(
  staff: StaffContext,
  campaignId: string,
  includeRetired: boolean,
): Promise<SurveyQuestionRow[]> {
  const supabaseAdmin = createSupabaseAdminClient()

  return collectPagedRows<SurveyQuestionRow>(async (from, to) => {
    let query = supabaseAdmin
      .from("dialer_survey_questions")
      .select(QUESTION_COLUMNS)
      .eq("program_id", staff.programId)
      .eq("campaign_id", campaignId)

    if (!includeRetired) {
      query = query.is("retired_at", null)
    }

    const response = await query
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)

    return { data: response.data, error: response.error }
  }, QUESTION_READ_FAILURES)
}

async function readQuestionRow(
  staff: StaffContext,
  campaignId: string,
  questionId: string,
): Promise<SurveyQuestionRow> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_survey_questions")
    .select(QUESTION_COLUMNS)
    .eq("id", questionId)
    .eq("campaign_id", campaignId)
    .eq("program_id", staff.programId)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "question_read_failed", "Unable to read the survey question.")
  }

  if (!data) {
    throw questionNotFound()
  }

  return data as SurveyQuestionRow
}

async function readOptionRows(staff: StaffContext, questionIds: string[]): Promise<SurveyOptionRow[]> {
  if (questionIds.length === 0) {
    return []
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const rows: SurveyOptionRow[] = []

  for (let offset = 0; offset < questionIds.length; offset += OPTION_QUERY_CHUNK_SIZE) {
    const chunk = questionIds.slice(offset, offset + OPTION_QUERY_CHUNK_SIZE)
    const chunkRows = await collectPagedRows<SurveyOptionRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_survey_options")
        .select(OPTION_COLUMNS)
        .eq("program_id", staff.programId)
        .in("question_id", chunk)
        .order("question_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, OPTION_READ_FAILURES)

    rows.push(...chunkRows)
  }

  return rows
}

interface SurveyResponsePage {
  data: unknown
  error: { code?: string } | null
}

interface SurveyResponseQuery {
  select(columns: string): SurveyResponseQuery
  eq(column: string, value: string): SurveyResponseQuery
  in(column: string, values: string[]): SurveyResponseQuery
  order(column: string, options: { ascending: boolean }): SurveyResponseQuery
  range(from: number, to: number): PromiseLike<SurveyResponsePage>
}

function isMissingRelation(error: SurveyResponsePage["error"]): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205"
}

/**
 * `dialer_survey_responses` arrives with story 2.3's disposition RPC, so it is
 * not in the generated `Database` yet — hence the one untyped read. Until the
 * relation exists no response row can exist, so 0 is the real count, not a default.
 */
async function readResponseCounts(
  staff: StaffContext,
  questionIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const questionId of questionIds) {
    counts.set(questionId, 0)
  }

  if (questionIds.length === 0) {
    return counts
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const responses = supabaseAdmin as unknown as {
    from(relation: string): SurveyResponseQuery
  }
  let relationMissing = false
  let countedRows = 0

  try {
    const rows = await collectPagedRows<{ question_id: string }>(async (from, to) => {
      const page = await responses
        .from("dialer_survey_responses")
        .select("question_id")
        .eq("program_id", staff.programId)
        .in("question_id", questionIds)
        .order("question_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)

      if (isMissingRelation(page.error)) {
        relationMissing = true
      }

      return { data: page.data, error: page.error }
    }, RESPONSE_COUNT_FAILURES)

    for (const row of rows) {
      counts.set(row.question_id, (counts.get(row.question_id) ?? 0) + 1)
    }
    countedRows = rows.length
  } catch (error) {
    if (relationMissing && countedRows === 0) {
      return counts
    }

    throw error
  }

  return counts
}

async function nextQuestionSortOrder(staff: StaffContext, campaignId: string): Promise<number> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_survey_questions")
    .select("sort_order")
    .eq("program_id", staff.programId)
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "question_read_failed", "Unable to read the campaign survey.")
  }

  return (data?.sort_order ?? -1) + 1
}

async function writeQuestionOrder(
  staff: StaffContext,
  campaignId: string,
  orderedIds: string[],
  failureMessage = "Unable to save the question order; it may be partially applied.",
): Promise<void> {
  const supabaseAdmin = createSupabaseAdminClient()

  for (const [index, questionId] of orderedIds.entries()) {
    const { error } = await supabaseAdmin
      .from("dialer_survey_questions")
      .update({ sort_order: index })
      .eq("id", questionId)
      .eq("campaign_id", campaignId)
      .eq("program_id", staff.programId)

    if (error) {
      throw new AuthzError(500, "question_reorder_failed", failureMessage)
    }
  }
}

async function readQuestionDto(
  staff: StaffContext,
  campaignId: string,
  questionId: string,
): Promise<SurveyQuestion> {
  const row = await readQuestionRow(staff, campaignId, questionId)
  const [optionRows, counts] = await Promise.all([
    readOptionRows(staff, [questionId]),
    readResponseCounts(staff, [questionId]),
  ])

  return toSurveyQuestion(row, toSurveyOptions(optionRows), counts.get(questionId) ?? 0)
}

async function rollbackQuestionInsert(staff: StaffContext, questionId: string): Promise<boolean> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { error: optionsError } = await supabaseAdmin
    .from("dialer_survey_options")
    .delete()
    .eq("question_id", questionId)
    .eq("program_id", staff.programId)
  const { error: questionError } = await supabaseAdmin
    .from("dialer_survey_questions")
    .delete()
    .eq("id", questionId)
    .eq("program_id", staff.programId)

  return !optionsError && !questionError
}

export async function listCampaignQuestions(
  staff: StaffContext,
  campaignId: string,
  options: ListCampaignQuestionsOptions = {},
): Promise<SurveyQuestion[]> {
  requireCampaignAdmin(staff)
  await getCampaign(staff, campaignId)

  const questionRows = await readQuestionRows(staff, campaignId, options.includeRetired === true)
  const questionIds = questionRows.map((row) => row.id)
  const [optionRows, counts] = await Promise.all([
    readOptionRows(staff, questionIds),
    readResponseCounts(staff, questionIds),
  ])

  const optionsByQuestion = new Map<string, SurveyOptionRow[]>()
  for (const optionRow of optionRows) {
    const list = optionsByQuestion.get(optionRow.question_id) ?? []
    list.push(optionRow)
    optionsByQuestion.set(optionRow.question_id, list)
  }

  return questionRows.map((row) =>
    toSurveyQuestion(
      row,
      toSurveyOptions(optionsByQuestion.get(row.id) ?? []),
      counts.get(row.id) ?? 0,
    ),
  )
}

export async function createQuestion(
  staff: StaffContext,
  campaignId: string,
  input: CreateQuestionInput,
): Promise<SurveyQuestion> {
  requireCampaignAdmin(staff)
  await getCampaign(staff, campaignId)

  const questionTitle = requireQuestionTitle(input.questionTitle)
  const questionType = requireQuestionType(input.questionType)
  const isRequired = requireIsRequired(input.isRequired)
  const options = normalizeOptionInputs(input.options, { allowIds: false })

  assertOptionSetMatchesType(questionType, options, 0)

  const sortOrder = await nextQuestionSortOrder(staff, campaignId)
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_survey_questions")
    .insert({
      program_id: staff.programId,
      campaign_id: campaignId,
      question_title: questionTitle,
      question_type: questionType,
      sort_order: sortOrder,
      is_required: isRequired,
    })
    .select(QUESTION_COLUMNS)
    .single()

  if (error || !data) {
    throw new AuthzError(500, "question_write_failed", "Unable to create the question.")
  }

  const question = data as SurveyQuestionRow

  if (options.length === 0) {
    return toSurveyQuestion(question, [], 0)
  }

  const { data: optionData, error: optionError } = await supabaseAdmin
    .from("dialer_survey_options")
    .insert(
      options.map((option, index) => ({
        program_id: staff.programId,
        question_id: question.id,
        label: option.label,
        value: option.value,
        sort_order: index,
      })),
    )
    .select(OPTION_COLUMNS)

  if (optionError || !optionData) {
    // PostgREST has no transaction across these two statements: removing the
    // question is the rollback, so a failed option write cannot leave a choice
    // question the builder would render as unanswerable.
    const rolledBack = await rollbackQuestionInsert(staff, question.id)

    if (!rolledBack) {
      throw new AuthzError(
        500,
        "question_write_rollback_failed",
        `Unable to save the question options, and the incomplete question ${question.id} could not be removed.`,
      )
    }

    throw new AuthzError(
      500,
      "question_write_rolled_back",
      "Unable to save the question options; the question was rolled back.",
    )
  }

  return toSurveyQuestion(question, toSurveyOptions(optionData as SurveyOptionRow[]), 0)
}

export async function updateQuestion(
  staff: StaffContext,
  campaignId: string,
  questionId: string,
  input: UpdateQuestionInput,
): Promise<SurveyQuestion> {
  requireCampaignAdmin(staff)
  await getCampaign(staff, campaignId)
  assertQuestionIdShape(questionId)

  const question = await readQuestionRow(staff, campaignId, questionId)

  if (question.retired_at) {
    throw new AuthzError(409, "question_retired", "A retired question cannot be edited.")
  }

  const currentType = requireStoredQuestionType(question.question_type)
  const existingOptions = await readOptionRows(staff, [questionId])
  const existingById = new Map(existingOptions.map((row) => [row.id, row]))

  const questionTitle =
    input.questionTitle === undefined ? question.question_title : requireQuestionTitle(input.questionTitle)
  const questionType = input.questionType === undefined ? currentType : requireQuestionType(input.questionType)
  const isRequired = input.isRequired === undefined ? question.is_required : requireIsRequired(input.isRequired)
  const suppliedOptions =
    input.options === undefined
      ? undefined
      : normalizeOptionInputs(input.options, { allowIds: true, existingById })

  const responseCount = (await readResponseCounts(staff, [questionId])).get(questionId) ?? 0

  if (questionType !== currentType && responseCount > 0) {
    throw new AuthzError(
      409,
      "question_type_locked",
      "This question already has responses; its type cannot change.",
    )
  }

  assertOptionSetMatchesType(questionType, suppliedOptions, existingOptions.length)

  const supabaseAdmin = createSupabaseAdminClient()
  const questionChanged =
    input.questionTitle !== undefined || input.questionType !== undefined || input.isRequired !== undefined

  if (questionChanged) {
    const { error } = await supabaseAdmin
      .from("dialer_survey_questions")
      .update({
        question_title: questionTitle,
        question_type: questionType,
        is_required: isRequired,
      })
      .eq("id", questionId)
      .eq("campaign_id", campaignId)
      .eq("program_id", staff.programId)

    if (error) {
      throw new AuthzError(500, "question_write_failed", "Unable to update the question.")
    }
  }

  if (suppliedOptions) {
    const suppliedIds = new Set<string>()
    for (const option of suppliedOptions) {
      if (option.id) {
        suppliedIds.add(option.id)
      }
    }

    const removedIds = existingOptions
      .filter((row) => !suppliedIds.has(row.id))
      .map((row) => row.id)

    if (removedIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("dialer_survey_options")
        .delete()
        .in("id", removedIds)
        .eq("question_id", questionId)
        .eq("program_id", staff.programId)

      if (error) {
        throw new AuthzError(500, "option_write_failed", PARTIAL_OPTION_WRITE_MESSAGE)
      }
    }

    for (const [index, option] of suppliedOptions.entries()) {
      if (!option.id) {
        continue
      }

      const { error } = await supabaseAdmin
        .from("dialer_survey_options")
        .update({ label: option.label, value: option.value, sort_order: index })
        .eq("id", option.id)
        .eq("question_id", questionId)
        .eq("program_id", staff.programId)

      if (error) {
        throw new AuthzError(500, "option_write_failed", PARTIAL_OPTION_WRITE_MESSAGE)
      }
    }

    const inserts = suppliedOptions
      .map((option, index) => ({ option, index }))
      .filter((entry) => !entry.option.id)

    if (inserts.length > 0) {
      const { error } = await supabaseAdmin.from("dialer_survey_options").insert(
        inserts.map(({ option, index }) => ({
          program_id: staff.programId,
          question_id: questionId,
          label: option.label,
          value: option.value,
          sort_order: index,
        })),
      )

      if (error) {
        throw new AuthzError(500, "option_write_failed", PARTIAL_OPTION_WRITE_MESSAGE)
      }
    }
  }

  return readQuestionDto(staff, campaignId, questionId)
}

export async function reorderQuestions(
  staff: StaffContext,
  campaignId: string,
  orderedIds: string[],
): Promise<SurveyQuestion[]> {
  requireCampaignAdmin(staff)
  await getCampaign(staff, campaignId)

  const current = await readQuestionRows(staff, campaignId, false)

  if (!Array.isArray(orderedIds)) {
    throw invalidQuestionOrder()
  }

  const currentIds = new Set(current.map((row) => row.id))
  const seen = new Set<string>()

  for (const questionId of orderedIds) {
    if (typeof questionId !== "string" || !currentIds.has(questionId) || seen.has(questionId)) {
      throw invalidQuestionOrder()
    }
    seen.add(questionId)
  }

  if (seen.size !== currentIds.size) {
    throw invalidQuestionOrder()
  }

  await writeQuestionOrder(staff, campaignId, orderedIds)
  return listCampaignQuestions(staff, campaignId)
}

export async function retireQuestion(
  staff: StaffContext,
  campaignId: string,
  questionId: string,
): Promise<SurveyQuestion> {
  requireCampaignAdmin(staff)
  await getCampaign(staff, campaignId)
  assertQuestionIdShape(questionId)

  const question = await readQuestionRow(staff, campaignId, questionId)

  if (question.retired_at) {
    return readQuestionDto(staff, campaignId, questionId)
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { error } = await supabaseAdmin
    .from("dialer_survey_questions")
    .update({ retired_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("campaign_id", campaignId)
    .eq("program_id", staff.programId)
    .is("retired_at", null)

  if (error) {
    throw new AuthzError(500, "question_write_failed", "Unable to retire the question.")
  }

  return readQuestionDto(staff, campaignId, questionId)
}

export async function deleteQuestion(
  staff: StaffContext,
  campaignId: string,
  questionId: string,
): Promise<void> {
  requireCampaignAdmin(staff)
  await getCampaign(staff, campaignId)
  assertQuestionIdShape(questionId)

  await readQuestionRow(staff, campaignId, questionId)

  const responseCount = (await readResponseCounts(staff, [questionId])).get(questionId) ?? 0

  if (responseCount > 0) {
    throw new AuthzError(
      409,
      "question_has_responses",
      `This question has ${responseCount} response${responseCount === 1 ? "" : "s"}; retire it instead of deleting it.`,
    )
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_survey_questions")
    .delete()
    .eq("id", questionId)
    .eq("campaign_id", campaignId)
    .eq("program_id", staff.programId)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "question_write_failed", "Unable to delete the question.")
  }

  if (!data) {
    throw questionNotFound()
  }

  const remaining = await readQuestionRows(staff, campaignId, false)
  await writeQuestionOrder(
    staff,
    campaignId,
    remaining.map((row) => row.id),
    "The question was deleted, but the remaining order could not be saved.",
  )
}
