"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createBrowserId } from "@/lib/browser-id"
import { cn } from "@/lib/utils"

type QuestionType = "TEXT" | "DROPDOWN" | "RADIO" | "MULTI_SELECT" | "DATE"

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "RADIO", label: "Radio" },
  { value: "MULTI_SELECT", label: "Multi-select" },
  { value: "DATE", label: "Date" },
]

const CHOICE_TYPES: readonly QuestionType[] = ["DROPDOWN", "RADIO", "MULTI_SELECT"]

interface DraftQuestion {
  key: string
  title: string
  type: QuestionType
  required: boolean
  options: string[]
}

interface CreateCampaignResponse {
  campaign?: { id?: string }
  error?: string
}

function emptyQuestion(): DraftQuestion {
  return { key: createBrowserId(), title: "", type: "TEXT", required: true, options: [] }
}

function isChoice(type: QuestionType): boolean {
  return CHOICE_TYPES.includes(type)
}

/**
 * Frame 212's single screen: Campaign details on the left, the Call-outcome
 * survey on the right, one Next action.
 *
 * The survey is staged here because the campaign does not exist yet — the
 * design asks for one screen, so the questions are collected first and written
 * after the campaign is created. A question that fails to write leaves the
 * campaign on its detail page, named in the message, where the builder can
 * finish it; a partial write is never reported as success.
 *
 * Frame 212's own prototype sends Next to frame 324, so the campaign lands on
 * its assign-contacts screen: a DRAFT campaign with nobody to call is not a
 * finished step.
 */
export function NewCampaignForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [campaignDate, setCampaignDate] = useState("")
  const [questions, setQuestions] = useState<DraftQuestion[]>([])
  const [draft, setDraft] = useState<DraftQuestion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [partialHref, setPartialHref] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const saveDraft = () => {
    if (!draft) {
      return
    }

    const title = draft.title.trim()
    if (!title) {
      setError("Give the question a title before adding it.")
      return
    }

    const options = draft.options.map((option) => option.trim()).filter(Boolean)
    if (isChoice(draft.type) && options.length === 0) {
      setError("A choice question needs at least one option.")
      return
    }

    setError(null)
    setQuestions((current) => {
      const next: DraftQuestion = { ...draft, title, options }
      const index = current.findIndex((question) => question.key === draft.key)
      if (index === -1) {
        return [...current, next]
      }

      return current.map((question) => (question.key === draft.key ? next : question))
    })
    setDraft(null)
  }

  const removeQuestion = (key: string) => {
    setQuestions((current) => current.filter((question) => question.key !== key))
    setDraft((current) => (current?.key === key ? null : current))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPartialHref(null)

    if (!name.trim()) {
      setError("Enter a campaign name.")
      return
    }

    if (!campaignDate) {
      setError("Choose a campaign end date.")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/dialer/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          campaignDate,
        }),
      })

      const payload = (await response.json().catch(() => null)) as CreateCampaignResponse | null

      if (!response.ok) {
        setError(payload?.error ?? "Unable to create the campaign.")
        setIsSubmitting(false)
        return
      }

      const campaignId = payload?.campaign?.id
      if (!campaignId) {
        setError("The campaign was created but the server returned no id. Reload the campaign list.")
        setIsSubmitting(false)
        return
      }

      for (const [index, question] of questions.entries()) {
        const questionResponse = await fetch(`/api/dialer/admin/campaigns/${campaignId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionTitle: question.title,
            questionType: question.type,
            isRequired: question.required,
            ...(isChoice(question.type) ? { options: question.options.map((label) => ({ label })) } : {}),
          }),
        })

        if (!questionResponse.ok) {
          const questionPayload = (await questionResponse.json().catch(() => null)) as { error?: string } | null
          setError(
            `The campaign was created, but question ${index + 1} (“${question.title}”) failed: ` +
              `${questionPayload?.error ?? "the server refused it"}. Finish it on the campaign page.`,
          )
          setPartialHref(`/campaigns/${campaignId}`)
          setIsSubmitting(false)
          return
        }
      }

      router.push(`/campaigns/${campaignId}/assign-contacts`)
    } catch {
      setError("Unable to reach the server. Your campaign was not created.")
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-5">
      <div className="flex h-[50px] items-center gap-4">
        <Link
          href="/campaigns"
          aria-label="Back to campaigns"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-card text-[var(--program-text)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
        >
          <ArrowLeft className="size-[18px]" aria-hidden="true" />
        </Link>

        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
            New campaign
          </h1>
          <p className="text-xs text-[var(--muted-foreground)]">
            Name it, choose when it ends, and define the call-outcome survey.
          </p>
        </div>

        <div className="flex-1" />

        <Button type="submit" disabled={isSubmitting} className="h-10 rounded-lg px-4">
          {isSubmitting ? "Saving…" : "Next"}
        </Button>
      </div>

      <div className="flex items-start gap-5">
        <section className="w-[520px] shrink-0 rounded-xl border border-[var(--border)] bg-card p-5">
          <div className="rounded-xl bg-[var(--program-primary)] px-5 py-4">
            <h2 className="font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-white">
              Campaign details
            </h2>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="campaign-name" className="text-[13px] font-semibold text-[var(--program-text)]">
                Campaign name
              </Label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Weekend Camp 2026"
                maxLength={120}
                autoComplete="off"
                className="h-10 rounded-lg"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="campaign-description" className="text-[13px] font-semibold text-[var(--program-text)]">
                Description
              </Label>
              <Textarea
                id="campaign-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="rounded-lg"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="campaign-end-date" className="text-[13px] font-semibold text-[var(--program-text)]">
                Campaign end date
              </Label>
              <Input
                id="campaign-end-date"
                type="date"
                value={campaignDate}
                onChange={(event) => setCampaignDate(event.target.value)}
                className="h-10 rounded-lg"
              />
            </div>
          </div>
        </section>

        <section className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-card p-5">
          <div className="rounded-xl bg-[var(--program-primary)] px-5 py-4">
            <h2 className="font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-white">
              Call-outcome survey
            </h2>
            <p className="mt-0.5 text-[15px] text-white">Every caller records these answers, for this campaign only.</p>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {questions.map((question, index) => (
              <div
                key={question.key}
                className="rounded-lg border border-[var(--border)] bg-[#f8fafc] p-4 dark:bg-[var(--secondary)]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-bold text-[var(--muted-foreground)]">{index + 1}</span>
                  <span className="truncate text-[14px] font-semibold text-[var(--program-text)]">
                    {question.title}
                  </span>
                  <span className="flex-1" />
                  <span className="rounded-full bg-[#e2e8f0] px-2 py-[3px] text-[11px] text-[#3b3f4b] dark:bg-[var(--border)] dark:text-[var(--foreground)]">
                    {question.type}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-[3px] text-[11px]",
                      question.required
                        ? "bg-[#e8f5ec] text-[#15803d] dark:bg-[#10331c] dark:text-[#7ee2a3]"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                    )}
                  >
                    {question.required ? "Required" : "Optional"}
                  </span>
                </div>

                {question.options.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {question.options.map((option) => (
                      <span
                        key={option}
                        className="rounded-full border border-[var(--border)] bg-card px-3 py-1 text-xs text-[var(--program-text)]"
                      >
                        {option}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setDraft(question)}
                    className="font-semibold text-[var(--program-primary)] underline-offset-2 hover:underline dark:text-[var(--ring)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(question.key)}
                    className="font-semibold text-[var(--destructive)] underline-offset-2 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            {draft ? (
              <div className="rounded-lg border border-[var(--border)] bg-[#f8fafc] p-4 dark:bg-[var(--secondary)]">
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="question-title" className="text-[13px] font-semibold text-[var(--program-text)]">
                      Question title
                    </Label>
                    <Input
                      id="question-title"
                      value={draft.title}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      placeholder="How was the session?"
                      maxLength={200}
                      className="h-10 rounded-lg"
                    />
                  </div>

                  <div className="flex flex-wrap items-end gap-4">
                    <div className="grid gap-1.5">
                      <Label htmlFor="question-type" className="text-[13px] font-semibold text-[var(--program-text)]">
                        Type
                      </Label>
                      <select
                        id="question-type"
                        value={draft.type}
                        onChange={(event) =>
                          setDraft({ ...draft, type: event.target.value as QuestionType, options: [] })
                        }
                        className="h-10 rounded-lg border border-[var(--border)] bg-card px-3 text-sm"
                      >
                        {QUESTION_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <label className="flex h-10 items-center gap-2 text-[13px] font-medium text-[var(--program-text)]">
                      <input
                        type="checkbox"
                        checked={draft.required}
                        onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
                        className="size-4 rounded border-[var(--border)]"
                      />
                      Required
                    </label>
                  </div>

                  {isChoice(draft.type) ? (
                    <div className="grid gap-2">
                      <span className="text-[13px] font-semibold text-[var(--program-text)]">Options</span>
                      {draft.options.map((option, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={option}
                            aria-label={`Option ${index + 1}`}
                            onChange={(event) => {
                              const options = [...draft.options]
                              options[index] = event.target.value
                              setDraft({ ...draft, options })
                            }}
                            placeholder={`Option ${index + 1}`}
                            className="h-9 rounded-lg"
                          />
                          <button
                            type="button"
                            aria-label={`Remove option ${index + 1}`}
                            onClick={() =>
                              setDraft({ ...draft, options: draft.options.filter((_, i) => i !== index) })
                            }
                            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted-foreground)]"
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDraft({ ...draft, options: [...draft.options, ""] })}
                        className="w-fit"
                      >
                        Add option
                      </Button>
                    </div>
                  ) : null}

                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={saveDraft}>
                      Save question
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDraft(emptyQuestion())}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-card text-[14px] font-semibold text-[var(--program-text)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add question
              </button>
            )}
          </div>
        </section>
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--destructive)]">
          {error}{" "}
          {partialHref ? (
            <Link href={partialHref} className="font-semibold underline underline-offset-2">
              Open the campaign
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  )
}
