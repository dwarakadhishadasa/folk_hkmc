"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"

import {
  SURVEY_QUESTION_TYPES,
  isChoiceQuestionType,
  type SurveyQuestionType,
  type SurveyQuestionView,
} from "@/components/campaign/campaign-survey-types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const PILL_CLASS = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.04em]"
const TYPE_PILL_CLASS = "bg-[var(--muted)] text-[var(--grid-linked-fg)]"
const REQUIRED_PILL_CLASS = "bg-[color-mix(in_oklab,var(--success)_12%,var(--card))] text-[var(--success)]"
const OPTIONAL_PILL_CLASS = "bg-[var(--muted)] text-[var(--muted-foreground)]"
const RETIRED_PILL_CLASS = "border border-[var(--border)] text-[var(--muted-foreground)]"
const CHIP_CLASS =
  "inline-flex items-center rounded-full border border-[var(--border)] bg-card px-2.5 py-0.5 text-[12px] text-[var(--program-text)]"

/**
 * A campaign being `COMPLETED` or `CANCELLED` is terminal, so the builder stops
 * offering writes there. The survey service does not refuse them itself (see
 * the story record), so this is a surface rule, not an enforced one.
 */
function surveyIsReadOnly(status: string): boolean {
  return status !== "DRAFT" && status !== "ACTIVE"
}

interface EditorOption {
  key: string
  id: string | null
  label: string
}

interface SurveyQuestionEditorProps {
  campaignId: string
  /** `null` creates a question; an existing question edits in place. */
  question: SurveyQuestionView | null
  onClose: () => void
  onSaved: () => void
}

/**
 * The question editor, shared by "Add question" and "Edit".
 *
 * Validation belongs to the route: a choice question saved with no options is
 * the server's `400 options_required`, shown in its own words rather than
 * blocked here, and a question with recorded answers renders its type as text
 * because the server refuses a type change with `409 question_type_locked`.
 */
function SurveyQuestionEditor({ campaignId, question, onClose, onSaved }: SurveyQuestionEditorProps) {
  const [questionTitle, setQuestionTitle] = useState(question?.questionTitle ?? "")
  const [questionType, setQuestionType] = useState<SurveyQuestionType>(question?.questionType ?? "TEXT")
  const [isRequired, setIsRequired] = useState(question?.isRequired ?? true)
  const [options, setOptions] = useState<EditorOption[]>(
    (question?.options ?? []).map((option) => ({ key: option.id, id: option.id, label: option.label })),
  )
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const optionKeyCounter = useRef(0)

  const typeLocked = (question?.responseCount ?? 0) > 0

  const addOption = () => {
    optionKeyCounter.current += 1
    setOptions((current) => [...current, { key: `new-${optionKeyCounter.current}`, id: null, label: "" }])
  }

  const updateOptionLabel = (index: number, label: string) => {
    setOptions((current) => current.map((option, position) => (position === index ? { ...option, label } : option)))
  }

  const removeOption = (index: number) => {
    setOptions((current) => current.filter((_option, position) => position !== index))
  }

  const moveOption = (index: number, direction: -1 | 1) => {
    setOptions((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) {
        return current
      }

      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(
        question
          ? `/api/dialer/admin/campaigns/${campaignId}/questions/${question.id}`
          : `/api/dialer/admin/campaigns/${campaignId}/questions`,
        {
          method: question ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionTitle: questionTitle.trim(),
            questionType,
            isRequired,
            // A TEXT or DATE question must send an empty list explicitly, or a
            // type change away from a choice type leaves the old options behind.
            options: isChoiceQuestionType(questionType)
              ? options.map((option) => ({
                  ...(option.id ? { id: option.id } : {}),
                  label: option.label.trim(),
                }))
              : [],
          }),
        },
      )

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setError(payload?.error ?? "The question could not be saved.")
        setIsSaving(false)
        return
      }

      setIsSaving(false)
      onSaved()
    } catch {
      setError("Unable to reach the server. The question was not saved.")
      setIsSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-3 grid gap-3 rounded-lg border border-[var(--border)] bg-card p-3"
    >
      <div className="grid gap-2">
        <Label htmlFor="survey-question-title">Question title</Label>
        <Input
          id="survey-question-title"
          value={questionTitle}
          onChange={(event) => setQuestionTitle(event.target.value)}
          placeholder="How did it go?"
          maxLength={200}
          autoComplete="off"
          className="h-10"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="survey-question-type">Question type</Label>
        {typeLocked ? (
          <>
            <p className="text-[13px] font-medium text-[var(--program-text)]">{questionType}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              This question already has recorded answers, so its type cannot change.
            </p>
          </>
        ) : (
          <select
            id="survey-question-type"
            value={questionType}
            onChange={(event) => setQuestionType(event.target.value as SurveyQuestionType)}
            className="focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border border-[var(--border)] bg-transparent px-3 text-[13px] text-[var(--program-text)] outline-none focus-visible:ring-[3px]"
          >
            {SURVEY_QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="survey-question-required"
          aria-label="Required"
          checked={isRequired}
          onCheckedChange={(checked) => setIsRequired(checked === true)}
        />
        <Label htmlFor="survey-question-required" className="text-[13px] font-normal">
          Required
        </Label>
      </div>

      {isChoiceQuestionType(questionType) ? (
        <fieldset className="grid gap-2">
          <legend className="text-[13px] font-medium text-[var(--program-text)]">Options</legend>

          {options.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Add at least one option. A {questionType} question cannot be saved without one.
            </p>
          ) : null}

          {options.map((option, index) => (
            <div key={option.key} className="flex items-center gap-1.5">
              <Input
                aria-label={`Option ${index + 1} label`}
                value={option.label}
                onChange={(event) => updateOptionLabel(index, event.target.value)}
                maxLength={120}
                autoComplete="off"
                className="h-9"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Move option ${index + 1} up`}
                disabled={index === 0}
                onClick={() => moveOption(index, -1)}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Move option ${index + 1} down`}
                disabled={index === options.length - 1}
                onClick={() => moveOption(index, 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove option ${index + 1}`}
                onClick={() => removeOption(index)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}

          <div>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addOption}>
              <Plus aria-hidden="true" />
              Add option
            </Button>
          </div>
        </fieldset>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">A {questionType} question has no options.</p>
      )}

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSaving} className="h-9 rounded-lg px-4">
          {isSaving ? "Saving…" : "Save question"}
        </Button>
        <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

interface ConfirmingAction {
  question: SurveyQuestionView
  action: "retire" | "delete"
}

/**
 * Frame 279's survey panel, with UX-DR13's retire-not-delete states filled in.
 *
 * The design shows one RADIO card with the 13 disposition chips as options. That
 * is the frame's known defect: the disposition is the only status, so this
 * builder never seeds or offers a `Status?` question. A question's controls are
 * driven by its recorded response count — zero answers may be deleted, one or
 * more may only be retired, and a retired question is read-only history.
 */
export function CampaignSurveyBuilder({
  campaignId,
  status,
  questions,
}: {
  campaignId: string
  status: string
  questions: SurveyQuestionView[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<{ questionId: string | null } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isReordering, setIsReordering] = useState(false)
  const [confirming, setConfirming] = useState<ConfirmingAction | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  const readOnly = surveyIsReadOnly(status)
  const liveQuestions = questions.filter((question) => question.retiredAt === null)

  const moveQuestion = async (question: SurveyQuestionView, direction: -1 | 1) => {
    const orderedIds = liveQuestions.map((entry) => entry.id)
    const index = orderedIds.indexOf(question.id)
    const target = index + direction

    if (index < 0 || target < 0 || target >= orderedIds.length) {
      return
    }

    const nextOrder = [...orderedIds]
    nextOrder.splice(index, 1)
    nextOrder.splice(target, 0, question.id)

    setIsReordering(true)
    setActionError(null)

    try {
      const response = await fetch(`/api/dialer/admin/campaigns/${campaignId}/questions/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: nextOrder }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setActionError(payload?.error ?? "The question order could not be saved.")
        setIsReordering(false)
        return
      }

      setIsReordering(false)
      router.refresh()
    } catch {
      setActionError("Unable to reach the server. The question order was not saved.")
      setIsReordering(false)
    }
  }

  const applyConfirmation = async () => {
    if (!confirming) {
      return
    }

    setIsConfirming(true)
    setActionError(null)

    const { question, action } = confirming

    try {
      const response = await fetch(
        action === "delete"
          ? `/api/dialer/admin/campaigns/${campaignId}/questions/${question.id}`
          : `/api/dialer/admin/campaigns/${campaignId}/questions/${question.id}/retire`,
        { method: action === "delete" ? "DELETE" : "POST" },
      )

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        setActionError(
          payload?.error ??
            (action === "delete" ? "The question could not be deleted." : "The question could not be retired."),
        )
        setConfirming(null)
        setIsConfirming(false)
        return
      }

      setConfirming(null)
      setIsConfirming(false)
      router.refresh()
    } catch {
      setActionError(
        action === "delete"
          ? "Unable to reach the server. The question was not deleted."
          : "Unable to reach the server. The question was not retired.",
      )
      setConfirming(null)
      setIsConfirming(false)
    }
  }

  return (
    <section
      aria-labelledby="campaign-survey-heading"
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-card"
    >
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2
          id="campaign-survey-heading"
          className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]"
        >
          Call-outcome survey
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          Every caller records these answers, for this campaign only.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {readOnly ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            This campaign is closed, so its survey is read-only here.
          </p>
        ) : null}

        {actionError ? (
          <p role="alert" className="text-[13px] text-[var(--destructive)]">
            {actionError}
          </p>
        ) : null}

        {questions.length === 0 ? (
          <p className="text-[13px] text-[var(--muted-foreground)]">No questions yet</p>
        ) : (
          <ol aria-label="Survey questions" className="flex list-none flex-col gap-2">
            {questions.map((question) => {
              const isRetired = question.retiredAt !== null
              const liveIndex = liveQuestions.findIndex((entry) => entry.id === question.id)
              const isEditing = editing?.questionId === question.id

              return (
                <li
                  key={question.id}
                  className="rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--muted)_35%,var(--card))] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      {isRetired ? null : (
                        <span className="mt-0.5 w-4 shrink-0 text-right text-[12px] font-semibold text-[var(--muted-foreground)]">
                          {liveIndex + 1}
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[var(--program-text)]">
                          {question.questionTitle}
                        </p>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={cn(PILL_CLASS, TYPE_PILL_CLASS)}>{question.questionType}</span>
                          {isRetired ? (
                            <span className={cn(PILL_CLASS, RETIRED_PILL_CLASS)}>Retired</span>
                          ) : (
                            <span
                              className={cn(
                                PILL_CLASS,
                                question.isRequired ? REQUIRED_PILL_CLASS : OPTIONAL_PILL_CLASS,
                              )}
                            >
                              {question.isRequired ? "Required" : "Optional"}
                            </span>
                          )}
                        </div>

                        {isChoiceQuestionType(question.questionType) && question.options.length > 0 ? (
                          <ul aria-label={`${question.questionTitle} options`} className="mt-2 flex flex-wrap gap-1.5">
                            {question.options.map((option) => (
                              <li key={option.id} className={CHIP_CLASS}>
                                {option.label}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {!isRetired && question.responseCount > 0 ? (
                          <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
                            {question.responseCount} recorded{" "}
                            {question.responseCount === 1 ? "answer" : "answers"}. Retiring keeps them.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {readOnly || isRetired || isEditing ? null : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Move ${question.questionTitle} up`}
                          disabled={isReordering || liveIndex <= 0}
                          onClick={() => void moveQuestion(question, -1)}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Move ${question.questionTitle} down`}
                          disabled={isReordering || liveIndex === liveQuestions.length - 1}
                          onClick={() => void moveQuestion(question, 1)}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActionError(null)
                            setEditing({ questionId: question.id })
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActionError(null)
                            setConfirming({ question, action: "retire" })
                          }}
                        >
                          Retire
                        </Button>
                        {question.responseCount > 0 ? null : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-[var(--destructive)]"
                            onClick={() => {
                              setActionError(null)
                              setConfirming({ question, action: "delete" })
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <SurveyQuestionEditor
                      key={question.id}
                      campaignId={campaignId}
                      question={question}
                      onClose={() => setEditing(null)}
                      onSaved={() => {
                        setEditing(null)
                        router.refresh()
                      }}
                    />
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}

        {editing?.questionId === null ? (
          <SurveyQuestionEditor
            key="new"
            campaignId={campaignId}
            question={null}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              router.refresh()
            }}
          />
        ) : null}

        {readOnly ? null : (
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full gap-1.5 rounded-lg"
            onClick={() => {
              setActionError(null)
              setEditing({ questionId: null })
            }}
          >
            <Plus aria-hidden="true" />
            Add question
          </Button>
        )}
      </div>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !isConfirming) {
            setConfirming(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {confirming?.action === "delete" ? "Delete this question?" : "Retire this question?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              {confirming?.action === "delete"
                ? "This question has no responses, so deleting it loses nothing. This cannot be undone."
                : confirming && confirming.question.responseCount > 0
                  ? `This question has ${confirming.question.responseCount} recorded ${
                      confirming.question.responseCount === 1 ? "answer" : "answers"
                    }; retiring keeps them and stops the question appearing in new call outcomes.`
                  : "The question stops appearing in new call outcomes and stays in the campaign's history."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]" disabled={isConfirming}>
              {confirming?.action === "delete" ? "Keep question" : "Not now"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "text-[13px]",
                confirming?.action === "delete" &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
              disabled={isConfirming}
              onClick={(event) => {
                // The write resolves after this handler returns; closing on the
                // click would unmount the dialog before the outcome is known.
                event.preventDefault()
                void applyConfirmation()
              }}
            >
              {isConfirming
                ? "Working…"
                : confirming?.action === "delete"
                  ? "Delete question"
                  : "Retire question"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
