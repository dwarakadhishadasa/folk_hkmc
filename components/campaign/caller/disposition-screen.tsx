"use client"

import { Check } from "lucide-react"

import type { StaffRole } from "@hkmc/data-contracts"
import {
  DISPOSITION_OPTIONS,
  dispositionGroupFor,
  isDispositionStatus,
  isReachedGroup,
  type DispositionStatus,
} from "@/lib/dialer/disposition"

import type { CallerQueueEntry, CallerSurveyQuestion } from "./caller-types"

export interface DispositionAnswer {
  answer: string
  answerValues: string[]
}

export type DispositionAnswers = Record<string, DispositionAnswer>

export interface SaveReceipt {
  kind: "saving" | "saved" | "queued" | "failed"
  text: string
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "required" | "optional" }) {
  return (
    <span
      className={
        tone === "required"
          ? "rounded-full bg-[#E8F5E9] px-1.5 py-0.5 text-[10px] font-normal text-[#15803D] dark:bg-[#12311F] dark:text-[#4ADE80]"
          : "rounded-full bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-normal text-[#64748B] dark:bg-[var(--secondary)] dark:text-[var(--muted-foreground)]"
      }
    >
      {children}
    </span>
  )
}

function SurveyField({
  question,
  value,
  onChange,
}: {
  question: CallerSurveyQuestion
  value: DispositionAnswer | undefined
  onChange: (next: DispositionAnswer) => void
}) {
  const answer = value?.answer ?? ""
  const values = value?.answerValues ?? []
  const fieldClass =
    "w-full rounded-xl border border-[#E2E8F0] bg-card px-3 py-2.5 text-[12px] text-[var(--program-text)] outline-none placeholder:text-[#91959C] focus:border-[var(--program-primary)] focus:ring-2 focus:ring-[var(--program-primary)]/20 dark:border-[var(--border)]"

  if (question.questionType === "TEXT") {
    return (
      <textarea
        aria-label={question.questionTitle}
        value={answer}
        onChange={(event) => onChange({ answer: event.target.value, answerValues: [] })}
        placeholder="Type the answer…"
        className={`${fieldClass} min-h-[70px] resize-y`}
      />
    )
  }

  if (question.questionType === "DATE") {
    return (
      <input
        aria-label={question.questionTitle}
        type="date"
        value={answer}
        onChange={(event) => onChange({ answer: event.target.value, answerValues: [] })}
        className={fieldClass}
      />
    )
  }

  if (question.questionType === "DROPDOWN") {
    return (
      <select
        aria-label={question.questionTitle}
        value={answer}
        onChange={(event) => onChange({ answer: event.target.value, answerValues: [] })}
        className={fieldClass}
      >
        <option value="">Select an option…</option>
        {question.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  if (question.questionType === "RADIO") {
    return (
      <div role="radiogroup" aria-label={question.questionTitle} className="flex flex-wrap gap-2">
        {question.options.map((option) => {
          const selected = answer === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ answer: option.value, answerValues: [] })}
              className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] ${
                selected
                  ? "border-transparent bg-[var(--program-primary)] font-semibold text-white"
                  : "border-[#E2E8F0] bg-card text-[var(--program-text)] hover:bg-[var(--secondary)] dark:border-[var(--border)]"
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div aria-label={question.questionTitle} className="flex flex-wrap gap-2">
      {question.options.map((option) => {
        const selected = values.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange({
                answer: "",
                answerValues: selected ? values.filter((item) => item !== option.value) : [...values, option.value],
              })
            }
            className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] ${
              selected
                ? "border-transparent bg-[var(--program-primary)] font-semibold text-white"
                : "border-[#E2E8F0] bg-card text-[var(--program-text)] hover:bg-[var(--secondary)] dark:border-[var(--border)]"
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The disposition screen — frame 2456, plus the required omissions.
 *
 * The 13 chips are the stored model, Notes always render, and the campaign
 * survey appears only when the selected status reached a conversation. The
 * receipt is persistent on this screen: `Saving…`, `Saved HH:MM`,
 * `Queued — will send`, `Save failed — try again`.
 */
export function DispositionScreen({
  entry,
  survey,
  role,
  status,
  notes,
  answers,
  receipt,
  failure,
  saving,
  onStatusChange,
  onNotesChange,
  onAnswerChange,
  onSave,
}: {
  entry: CallerQueueEntry
  survey: CallerSurveyQuestion[]
  role: StaffRole
  status: DispositionStatus | null
  notes: string
  answers: DispositionAnswers
  receipt: SaveReceipt | null
  failure: string | null
  saving: boolean
  onStatusChange: (status: DispositionStatus) => void
  onNotesChange: (notes: string) => void
  onAnswerChange: (questionId: string, next: DispositionAnswer) => void
  onSave: () => void
}) {
  const showSurvey = status !== null && isReachedGroup(dispositionGroupFor(status))
  const assistantWrongNumber = status === "WRONG_NUMBER" && role === "Assistant"

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 px-4">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-poppins)] text-[22px] leading-tight font-semibold text-[var(--program-text)]">
            How did it go?
          </h1>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        <p className="text-[13px] leading-4 text-[var(--muted-foreground)]">
          {entry.contactName} · {entry.campaignName}
        </p>

        <section className="mt-4" aria-labelledby="disposition-status-heading">
          <div className="flex items-center gap-2">
            <h2 id="disposition-status-heading" className="text-[13px] font-semibold text-[var(--program-text)]">
              Status
            </h2>
            <Pill tone="required">Required</Pill>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {DISPOSITION_OPTIONS.map((option) => {
              const selected = status === option.status
              return (
                <button
                  key={option.status}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onStatusChange(option.status)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] ${
                    selected
                      ? "border-transparent bg-[var(--program-primary)] font-semibold text-white"
                      : "border-[#E2E8F0] bg-card text-[var(--program-text)] hover:bg-[var(--secondary)] dark:border-[var(--border)]"
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-5" aria-labelledby="disposition-notes-heading">
          <div className="flex items-center gap-2">
            <h2 id="disposition-notes-heading" className="text-[13px] font-semibold text-[var(--program-text)]">
              Notes
            </h2>
            <Pill tone="optional">Optional</Pill>
          </div>
          <textarea
            aria-label="Notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Type the caller's words…"
            className="mt-2 min-h-[70px] w-full resize-y rounded-xl border border-[#E2E8F0] bg-card px-3 py-2.5 text-[12px] leading-4 text-[var(--program-text)] outline-none placeholder:text-[#91959C] focus:border-[var(--program-primary)] focus:ring-2 focus:ring-[var(--program-primary)]/20 dark:border-[var(--border)]"
          />
        </section>

        {showSurvey && survey.length > 0 ? (
          <section className="mt-5 flex flex-col gap-4" aria-label="Campaign survey">
            {survey.map((question) => (
              <div key={question.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-[var(--program-text)]">{question.questionTitle}</h3>
                  {question.isRequired ? <Pill tone="required">Required</Pill> : <Pill tone="optional">Optional</Pill>}
                </div>
                <SurveyField
                  question={question}
                  value={answers[question.id]}
                  onChange={(next) => onAnswerChange(question.id, next)}
                />
              </div>
            ))}
          </section>
        ) : null}

        {assistantWrongNumber ? (
          <p className="mt-4 rounded-xl bg-[#F1F5F9] px-3 py-2.5 text-[12px] leading-4 text-[var(--muted-foreground)] dark:bg-[var(--secondary)]">
            Ask an Admin or Preacher to correct this number.
          </p>
        ) : null}

        {failure ? (
          <p role="alert" className="mt-4 rounded-xl bg-[#FEF2F2] px-3 py-2.5 text-[12px] leading-4 text-[#B91C1C] dark:bg-[#3A1717] dark:text-[#FCA5A5]">
            {failure}
          </p>
        ) : null}
      </div>

      {receipt ? (
        <p
          role="status"
          aria-live="polite"
          className={`shrink-0 px-4 pb-1 text-[12px] ${
            receipt.kind === "failed"
              ? "font-semibold text-[#B91C1C] dark:text-[#FCA5A5]"
              : "text-[var(--muted-foreground)]"
          }`}
        >
          {receipt.text}
        </p>
      ) : null}

      <div className="sticky bottom-0 z-20 mt-auto shrink-0 border-t border-[#E2E8F0] bg-card px-4 py-4 dark:border-[var(--border)]">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !isDispositionStatus(status)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--program-primary)] text-[16px] font-semibold text-white transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="size-4" strokeWidth={2} aria-hidden="true" />
          {saving ? "Saving…" : "Save & continue"}
        </button>
      </div>
    </div>
  )
}
