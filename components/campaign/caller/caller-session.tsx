"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { ChevronDown, List, Megaphone, Phone } from "lucide-react"

import { CampaignEmptyState } from "@/components/campaign/campaign-empty-state"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { CampaignSubNav } from "@/components/campaign/campaign-sub-nav"
import { formatCampaignDate } from "@/components/campaign/campaign-format"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { createBrowserId } from "@/lib/browser-id"
import {
  dispositionGroupFor,
  isDispositionStatus,
  isReachedGroup,
  type DispositionStatus,
} from "@/lib/dialer/disposition"
import { callHref } from "@/lib/dialer/phone-link"
import type { StaffRole } from "@hkmc/data-contracts"

import { CallCard } from "./call-card"
import { DispositionScreen, type DispositionAnswer, type DispositionAnswers, type SaveReceipt } from "./disposition-screen"
import { QueueDrawer } from "./queue-drawer"
import { SessionSummary } from "./session-summary"
import type {
  CallerQueueEntry,
  CallerQueuePayload,
  CallerQueueRosterItem,
  CallerSessionSummary,
  CallerSurveyQuestion,
} from "./caller-types"

const LOCK_KEY = "dialer:session-lock"
const OFFLINE_KEY = "dialer:offline-queue"
const DRAFT_PREFIX = "dialer:disposition:"
const TAB_CHANNEL = "dialer-session"
const LOCK_TTL_MS = 12_000
const HEARTBEAT_MS = 4_000

type Phase = "card" | "disposition" | "summary" | "empty"

interface Draft {
  assignmentId: string
  attempt: number
  status: string | null
  notes: string
  answers: DispositionAnswers
  savedAt: number
}

interface OfflinePayload {
  assignmentId: string
  attempt: number
  dispositionStatus: string
  followUpNotes: string | null
  responses: Array<{ questionId: string; answer: string | null; answerValues: string[] | null }>
}

interface OfflineEntry {
  id: string
  payload: OfflinePayload
  savedAt: number
}

function draftKey(assignmentId: string, attempt: number): string {
  return `${DRAFT_PREFIX}${assignmentId}:${attempt}`
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A full or blocked localStorage is not a reason to lose the session; the
    // next action surfaces the failure through the receipt instead.
  }
}

function readDraft(assignmentId: string, attempt: number): Draft | null {
  const draft = readJson<Draft | null>(draftKey(assignmentId, attempt), null)
  if (!draft || draft.assignmentId !== assignmentId || draft.attempt !== attempt) {
    return null
  }

  return draft
}

function removeDraft(assignmentId: string, attempt: number): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.removeItem(draftKey(assignmentId, attempt))
  } catch {
    // Nothing can be done; the mismatch check keeps a stale draft from replaying.
  }
}

function readOffline(): OfflineEntry[] {
  const entries = readJson<OfflineEntry[]>(OFFLINE_KEY, [])
  return Array.isArray(entries) ? entries.filter((entry) => entry && entry.payload) : []
}

function writeOffline(entries: OfflineEntry[]): void {
  writeJson(OFFLINE_KEY, entries)
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

function payloadFor(
  entry: CallerQueueEntry,
  status: DispositionStatus,
  notes: string,
  answers: DispositionAnswers,
  survey: CallerSurveyQuestion[],
): OfflinePayload {
  const group = dispositionGroupFor(status)
  const responses: OfflinePayload["responses"] = []

  if (isReachedGroup(group)) {
    for (const question of survey) {
      const answer = answers[question.id]
      if (!answer) {
        continue
      }

      if (question.questionType === "MULTI_SELECT") {
        if (answer.answerValues.length > 0) {
          responses.push({ questionId: question.id, answer: null, answerValues: answer.answerValues })
        }
        continue
      }

      const text = answer.answer.trim()
      if (text.length > 0) {
        responses.push({ questionId: question.id, answer: text, answerValues: null })
      }
    }
  }

  return {
    assignmentId: entry.assignmentId,
    attempt: entry.attempt,
    dispositionStatus: status,
    followUpNotes: notes.trim().length > 0 ? notes.trim() : null,
    responses,
  }
}

function namedSaveFailure(code: string | undefined, fallback: string): string {
  switch (code) {
    case "caller_deactivated":
      return "Caller deactivated — the call was not saved"
    case "assignment_reassigned":
      return "Assignment reassigned — the call was not saved"
    case "campaign_not_active":
      return "This campaign is no longer active — the call was not saved"
    case "assignment_not_pending":
      return "This assignment has already been completed"
    case "disposition_conflict":
      return "A different answer was already saved for this attempt"
    case "attempt_conflict":
      return "This attempt was already saved"
    case "disposition_validation_failed":
      return "Check the required survey answers"
    case "phone_missing":
      return "This contact has no phone number"
    default:
      return fallback
  }
}

function resolveInitialCurrentId(
  queue: CallerQueuePayload,
  initialAssignmentId: string | null,
  initialCampaignId: string | null,
): string | null {
  if (initialAssignmentId && queue.entries.some((entry) => entry.assignmentId === initialAssignmentId)) {
    return initialAssignmentId
  }

  if (initialCampaignId) {
    const first = queue.entries.find((entry) => entry.campaignId === initialCampaignId)
    if (first) {
      return first.assignmentId
    }
  }

  return queue.entries[0]?.assignmentId ?? null
}

function resolveInitialPhase(
  queue: CallerQueuePayload,
  initialAssignmentId: string | null,
  initialCampaignId: string | null,
  requested: string | null,
): Phase {
  if (requested === "disposition" && initialAssignmentId) {
    return queue.entries.some((entry) => entry.assignmentId === initialAssignmentId) ? "disposition" : "card"
  }

  if (requested === "summary" && initialCampaignId) {
    return "summary"
  }

  if (queue.entries.length > 0) {
    return "card"
  }

  return initialCampaignId ? "summary" : "empty"
}

/**
 * The caller session.
 *
 * One component owns the queue position, the pacing target, the single-tab
 * lock, the in-flight disposition and the receipt. The URL carries the
 * campaign and assignment so a reload refetches the same contact; the draft is
 * localStorage, keyed by assignment and attempt, so it can never replay against
 * the wrong row.
 */
export function CallerSession({
  initialQueue,
  role,
  initialCampaignId,
  initialAssignmentId,
  initialPhase,
}: {
  initialQueue: CallerQueuePayload
  role: StaffRole
  initialCampaignId: string | null
  initialAssignmentId: string | null
  initialPhase: string | null
}) {
  const pathname = usePathname()
  const [entries, setEntries] = useState<CallerQueueEntry[]>(initialQueue.entries)
  const [roster, setRoster] = useState<CallerQueueRosterItem[]>(initialQueue.roster)
  const [counts, setCounts] = useState(initialQueue.counts)
  const [campaigns, setCampaigns] = useState(initialQueue.campaigns)
  const [surveysByCampaign, setSurveysByCampaign] = useState(initialQueue.surveysByCampaign)
  const [currentId, setCurrentId] = useState<string | null>(() =>
    resolveInitialCurrentId(initialQueue, initialAssignmentId, initialCampaignId),
  )
  const [phase, setPhase] = useState<Phase>(() =>
    resolveInitialPhase(initialQueue, initialAssignmentId, initialCampaignId, initialPhase),
  )
  const [callStarted, setCallStarted] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [tabConflict, setTabConflict] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [status, setStatus] = useState<DispositionStatus | null>(null)
  const [notes, setNotes] = useState("")
  const [answers, setAnswers] = useState<DispositionAnswers>({})
  const [receipt, setReceipt] = useState<SaveReceipt | null>(null)
  const [sessionReceipt, setSessionReceipt] = useState<SaveReceipt | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [callError, setCallError] = useState<string | null>(null)
  const [draftNotice, setDraftNotice] = useState(false)
  const [notice, setNotice] = useState<{ entry: CallerQueueEntry } | null>(null)
  const [summary, setSummary] = useState<CallerSessionSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryFailure, setSummaryFailure] = useState<string | null>(null)
  const [recalling, setRecalling] = useState(false)

  const tabIdRef = useRef("")
  const callStartedAtRef = useRef(0)
  const leftAppRef = useRef(false)
  const [lastCampaignId, setLastCampaignId] = useState<string | null>(initialCampaignId)
  const copyTimerRef = useRef<number | null>(null)

  const currentIndex = entries.findIndex((entry) => entry.assignmentId === currentId)
  const current = currentIndex >= 0 ? entries[currentIndex] : null
  const currentCampaign = current ? campaigns.find((campaign) => campaign.id === current.campaignId) ?? null : null
  const survey = current ? surveysByCampaign[current.campaignId] ?? [] : []
  const summaryCampaignId = current?.campaignId ?? lastCampaignId ?? initialCampaignId ?? campaigns[0]?.id ?? null

  useEffect(() => {
    document.body.dataset.callerSession = "ready"

    return () => {
      delete document.body.dataset.callerSession
    }
  }, [])

  useEffect(() => {
    if (!currentId && entries.length > 0) {
      setCurrentId(entries[0].assignmentId)
      setPhase("card")
    }
  }, [currentId, entries])

  useEffect(() => {
    if (current) {
      setLastCampaignId(current.campaignId)
    }
  }, [current])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const tabId = createBrowserId()
    tabIdRef.current = tabId
    let conflicted = false
    let channel: BroadcastChannel | null = null

    const readLock = (): { id: string; ts: number } | null => {
      try {
        const raw = window.localStorage.getItem(LOCK_KEY)
        if (!raw) {
          return null
        }
        const parsed = JSON.parse(raw) as { id?: unknown; ts?: unknown }
        return typeof parsed.id === "string" && typeof parsed.ts === "number"
          ? { id: parsed.id, ts: parsed.ts }
          : null
      } catch {
        return null
      }
    }

    const writeLock = () => {
      try {
        window.localStorage.setItem(LOCK_KEY, JSON.stringify({ id: tabId, ts: Date.now() }))
      } catch {
        // The BroadcastChannel below is the fallback when storage is blocked.
      }
    }

    const setConflict = () => {
      conflicted = true
      setTabConflict(true)
    }

    const existing = readLock()
    if (existing && existing.id !== tabId && Date.now() - existing.ts < LOCK_TTL_MS) {
      setConflict()
    } else {
      writeLock()
    }

    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(TAB_CHANNEL)
      channel.onmessage = (event: MessageEvent<{ type?: string; id?: string }>) => {
        const data = event.data
        if (!data || typeof data.id !== "string" || data.id === tabId) {
          return
        }

        if (data.type === "hello") {
          channel?.postMessage({ type: "occupied", id: tabId })
        } else if (data.type === "occupied") {
          setConflict()
        }
      }
      channel.postMessage({ type: "hello", id: tabId })
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== LOCK_KEY || !event.newValue) {
        return
      }

      try {
        const parsed = JSON.parse(event.newValue) as { id?: unknown; ts?: unknown }
        if (
          typeof parsed.id === "string" &&
          parsed.id !== tabId &&
          typeof parsed.ts === "number" &&
          Date.now() - parsed.ts < LOCK_TTL_MS
        ) {
          setConflict()
        }
      } catch {
        // A malformed lock is not evidence of another tab.
      }
    }

    window.addEventListener("storage", onStorage)

    const heartbeat = window.setInterval(() => {
      const lock = readLock()
      if (!lock || lock.id === tabId || Date.now() - lock.ts >= LOCK_TTL_MS) {
        if (!conflicted) {
          writeLock()
        }
      } else {
        setConflict()
      }
    }, HEARTBEAT_MS)

    const release = () => {
      const lock = readLock()
      if (lock?.id === tabId) {
        try {
          window.localStorage.removeItem(LOCK_KEY)
        } catch {
          // Nothing to release.
        }
      }
      channel?.postMessage({ type: "bye", id: tabId })
    }

    window.addEventListener("beforeunload", release)

    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("beforeunload", release)
      release()
      channel?.close()
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const params = new URLSearchParams(window.location.search)
    if (currentCampaign) {
      params.set("campaign", currentCampaign.id)
    } else {
      params.delete("campaign")
    }

    if (current) {
      params.set("assignment", current.assignmentId)
    } else {
      params.delete("assignment")
    }

    if (phase === "disposition") {
      params.set("phase", "disposition")
    } else if (phase === "summary") {
      params.set("phase", "summary")
    } else {
      params.delete("phase")
    }

    const query = params.toString()
    const next = query ? `${pathname}?${query}` : pathname
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, "", next)
    }
  }, [pathname, currentCampaign, current, phase])

  useEffect(() => {
    if (phase !== "disposition" || !current) {
      return
    }

    const draft = readDraft(current.assignmentId, current.attempt)
    if (!draft) {
      return
    }

    setStatus(isDispositionStatus(draft.status) ? draft.status : null)
    setNotes(draft.notes)
    setAnswers(draft.answers)
  }, [phase, current])

  useEffect(() => {
    if (!current) {
      setDraftNotice(false)
      return
    }

    setDraftNotice(readDraft(current.assignmentId, current.attempt) !== null)
  }, [current])

  useEffect(() => {
    if (phase !== "disposition" || !current) {
      return
    }

    const hasContent = status !== null || notes.trim().length > 0 || Object.keys(answers).length > 0
    if (!hasContent) {
      return
    }

    writeJson(draftKey(current.assignmentId, current.attempt), {
      assignmentId: current.assignmentId,
      attempt: current.attempt,
      status,
      notes,
      answers,
      savedAt: Date.now(),
    } satisfies Draft)
  }, [phase, current, status, notes, answers])

  const refreshMeta = useCallback(async () => {
    try {
      const response = await fetch("/api/dialer/caller/queue", { cache: "no-store" })
      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as CallerQueuePayload
      setCounts(data.counts)
      setCampaigns(data.campaigns)
      setSurveysByCampaign(data.surveysByCampaign)
      return data
    } catch {
      return null
    }
  }, [])

  const refreshQueue = useCallback(async (): Promise<CallerQueuePayload | null> => {
    try {
      const response = await fetch("/api/dialer/caller/queue", { cache: "no-store" })
      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as CallerQueuePayload
      setEntries(data.entries)
      setRoster(data.roster)
      setCounts(data.counts)
      setCampaigns(data.campaigns)
      setSurveysByCampaign(data.surveysByCampaign)
      return data
    } catch {
      return null
    }
  }, [])

  const drainOffline = useCallback(async () => {
    const queued = readOffline()
    if (queued.length === 0) {
      return
    }

    const remaining: OfflineEntry[] = []

    for (const entry of queued) {
      try {
        const response = await fetch("/api/dialer/caller/disposition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.payload),
        })

        if (response.ok) {
          removeDraft(entry.payload.assignmentId, entry.payload.attempt)
        } else if (response.status === 202 || response.status === 409 || response.status === 400) {
          // 202 is accepted by the service worker, 409 is a permanent refusal,
          // and 400 is a malformed entry: all three must drain rather than wedge
          // the queue. The draft survives a permanent refusal; only a confirmed
          // write removes it.
        } else {
          remaining.push(entry)
        }
      } catch {
        remaining.push(entry)
      }
    }

    writeOffline(remaining)
  }, [])

  useEffect(() => {
    void drainOffline()

    const onOnline = () => void drainOffline()
    window.addEventListener("online", onOnline)
    const timer = window.setInterval(() => void drainOffline(), 30_000)

    return () => {
      window.removeEventListener("online", onOnline)
      window.clearInterval(timer)
    }
  }, [drainOffline])

  const loadSummary = useCallback(async (campaignId: string) => {
    setSummaryLoading(true)
    setSummaryFailure(null)

    try {
      const response = await fetch(
        `/api/dialer/caller/session/summary?campaignId=${encodeURIComponent(campaignId)}`,
        { cache: "no-store" },
      )

      if (!response.ok) {
        setSummaryFailure("Your session summary could not be loaded.")
        return
      }

      setSummary((await response.json()) as CallerSessionSummary)
    } catch {
      setSummaryFailure("Your session summary could not be loaded.")
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (phase === "summary" && summaryCampaignId) {
      void loadSummary(summaryCampaignId)
    }
  }, [phase, summaryCampaignId, loadSummary])

  const advance = useCallback(
    (
      from: CallerQueueEntry,
      counted: boolean,
      statusGroup: string | undefined,
      outcome: { status: "COMPLETED"; dispositionStatus: string | null },
    ) => {
      const index = entries.findIndex((entry) => entry.assignmentId === from.assignmentId)
      const remaining = entries.filter((entry) => entry.assignmentId !== from.assignmentId)
      const next = index >= 0 ? entries[index + 1] ?? remaining[0] ?? null : remaining[0] ?? null

      setEntries(remaining)
      setRoster((previous) =>
        previous.map((row) =>
          row.assignmentId === from.assignmentId
            ? {
                ...row,
                status: outcome.status,
                latestDispositionStatus: outcome.dispositionStatus ?? row.latestDispositionStatus,
                latestStatusGroup: statusGroup ?? row.latestStatusGroup,
                actionable: false,
              }
            : row,
        ),
      )
      setCounts((previous) => ({
        ...previous,
        pending: Math.max(0, previous.pending - 1),
        called: previous.called + (counted && from.attempt === 1 ? 1 : 0),
        reached: previous.reached + (counted && statusGroup && isReachedGroup(statusGroup) ? 1 : 0),
        noAnswer: previous.noAnswer + (counted && statusGroup === "NOT_REACHABLE" ? 1 : 0),
      }))
      setCampaigns((previous) =>
        previous.map((campaign) =>
          campaign.id === from.campaignId && counted && from.attempt === 1
            ? { ...campaign, called: campaign.called + 1 }
            : campaign,
        ),
      )
      setStatus(null)
      setNotes("")
      setAnswers({})
      setReceipt(null)
      setFailure(null)
      setCallStarted(false)
      setCopyState("idle")
      setCallError(null)
      setPickerOpen(false)
      leftAppRef.current = false

      if (next) {
        setCurrentId(next.assignmentId)
        setPhase("card")

        if (next.campaignId !== from.campaignId) {
          setNotice({ entry: next })
        }
      } else {
        setCurrentId(null)
        setPhase("summary")
      }
    },
    [entries],
  )

  const openDisposition = useCallback(() => {
    if (!current) {
      return
    }

    const draft = readDraft(current.assignmentId, current.attempt)
    if (draft) {
      setStatus(isDispositionStatus(draft.status) ? draft.status : null)
      setNotes(draft.notes)
      setAnswers(draft.answers)
    } else {
      setStatus(null)
      setNotes("")
      setAnswers({})
    }

    setReceipt(null)
    setFailure(null)
    setCallError(null)
    setPhase("disposition")
  }, [current])

  // The phone app takes focus for the duration of a `tel:` call, so the tab
  // leaving and coming back is the return signal. The listeners are only
  // attached while a call is in flight; a scheduled disposition change from
  // anywhere else (a resume-draft tap, a reload) never passes through here.
  useEffect(() => {
    if (!callStarted || phase !== "card") {
      return
    }

    if (document.visibilityState === "hidden") {
      leftAppRef.current = true
    }

    const openIfReturned = () => {
      if (leftAppRef.current) {
        openDisposition()
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        leftAppRef.current = true
        return
      }

      openIfReturned()
    }

    const onBlur = () => {
      if (Date.now() - callStartedAtRef.current < 1_000) {
        return
      }

      leftAppRef.current = true
    }

    const onPageHide = () => {
      leftAppRef.current = true
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("blur", onBlur)
    window.addEventListener("focus", openIfReturned)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("pageshow", openIfReturned)

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focus", openIfReturned)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("pageshow", openIfReturned)
    }
  }, [callStarted, phase, openDisposition])

  function resumeDraft() {
    openDisposition()
  }

  function dismissNotice() {
    if (!notice) {
      return
    }

    setNotice(null)
    setCallStarted(false)
  }

  async function copyPhone(phone: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(phone)
      return true
    } catch {
      try {
        const area = document.createElement("textarea")
        area.value = phone
        area.style.position = "fixed"
        area.style.opacity = "0"
        document.body.appendChild(area)
        area.select()
        const copied = document.execCommand("copy")
        document.body.removeChild(area)
        return copied
      } catch {
        return false
      }
    }
  }

  async function handleCall() {
    if (!current || tabConflict || notice || callStarted) {
      return
    }

    if (current.phone.trim().length === 0) {
      setCallError("This contact has no phone number. Ask an Admin or Preacher to correct it.")
      return
    }

    setCallError(null)
    const copied = await copyPhone(current.phone)
    setCopyState(copied ? "copied" : "failed")
    callStartedAtRef.current = Date.now()
    leftAppRef.current = false
    setCallStarted(true)

    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2_500)

    if (!copied) {
      setCallError("The number could not be copied. Dial the number shown above.")
    }

    window.location.href = callHref(current.phone, navigator.userAgent)
  }

  async function handleCopy() {
    if (!current) {
      return
    }

    if (current.phone.trim().length === 0) {
      setCallError("This contact has no phone number. Ask an Admin or Preacher to correct it.")
      return
    }

    const copied = await copyPhone(current.phone)
    setCopyState(copied ? "copied" : "failed")
    if (!copied) {
      setCallError("The number could not be copied. Dial the number shown above.")
    }

    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2_500)
  }

  async function handleSave() {
    if (!current || !status || saving) {
      return
    }

    setSaving(true)
    setFailure(null)
    setReceipt({ kind: "saving", text: "Saving…" })

    const payload = payloadFor(current, status, notes, answers, survey)
    const group = dispositionGroupFor(status)

    try {
      const response = await fetch("/api/dialer/caller/disposition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.status === 202) {
        const queued = readOffline().filter(
          (entry) =>
            entry.payload.assignmentId !== payload.assignmentId || entry.payload.attempt !== payload.attempt,
        )
        queued.push({ id: createBrowserId(), payload, savedAt: Date.now() })
        writeOffline(queued)
        setReceipt({ kind: "queued", text: "Queued — will send" })
        setSessionReceipt({ kind: "queued", text: "Queued — will send" })
        setSaving(false)
        advance(current, false, group, { status: "COMPLETED", dispositionStatus: status })
        return
      }

      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { receipt?: { statusGroup?: string } } | null
        const text = `Saved ${formatTime(new Date())}`
        setReceipt({ kind: "saved", text })
        setSessionReceipt({ kind: "saved", text })
        removeDraft(current.assignmentId, current.attempt)
        setSaving(false)
        advance(current, true, body?.receipt?.statusGroup ?? group, {
          status: "COMPLETED",
          dispositionStatus: status,
        })
        void refreshMeta()
        return
      }

      const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null
      const message = namedSaveFailure(body?.code, body?.message ?? "Save failed — try again")
      setFailure(message)
      setReceipt({ kind: "failed", text: "Save failed — try again" })
      setSessionReceipt({ kind: "failed", text: "Save failed — try again" })
      setSaving(false)
    } catch {
      const queued = readOffline().filter(
        (entry) =>
          entry.payload.assignmentId !== payload.assignmentId || entry.payload.attempt !== payload.attempt,
      )
      queued.push({ id: createBrowserId(), payload, savedAt: Date.now() })
      writeOffline(queued)
      setReceipt({ kind: "queued", text: "Queued — will send" })
      setSessionReceipt({ kind: "queued", text: "Queued — will send" })
      setSaving(false)
      advance(current, false, group, { status: "COMPLETED", dispositionStatus: status })
    }
  }

  async function handleRecall() {
    const campaignId = summary?.campaign.id ?? summaryCampaignId
    if (!campaignId || recalling) {
      return
    }

    setRecalling(true)
    setSummaryFailure(null)

    try {
      const response = await fetch("/api/dialer/caller/session/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null
        setSummaryFailure(body?.message ?? "The re-queue was refused.")
        setRecalling(false)
        return
      }

      const queue = await refreshQueue()
      const first = queue?.entries.find((entry) => entry.campaignId === campaignId) ?? queue?.entries[0] ?? null

      if (first) {
        setCurrentId(first.assignmentId)
        setPhase("card")
        setCallStarted(false)
        setSessionReceipt({ kind: "saved", text: "Re-queued — your unreachable contacts are back" })
      } else {
        await loadSummary(campaignId)
      }
    } catch {
      setSummaryFailure("The re-queue could not be sent.")
    } finally {
      setRecalling(false)
    }
  }

  async function handleDone() {
    const queue = await refreshQueue()
    const first = queue?.entries[0] ?? null

    if (first) {
      setCurrentId(first.assignmentId)
      setPhase("card")
      setCallStarted(false)
      setSessionReceipt(null)
    } else {
      setEntries([])
      setPhase("empty")
    }
  }

  function jumpTo(entry: CallerQueueEntry) {
    setCurrentId(entry.assignmentId)
    setPhase("card")
    setQueueOpen(false)
    setCallStarted(false)
    setCallError(null)
    setReceipt(null)
    setFailure(null)
    setStatus(null)
    setNotes("")
    setAnswers({})
    setDraftNotice(readDraft(entry.assignmentId, entry.attempt) !== null)
    setSessionReceipt(null)
    leftAppRef.current = false
  }

  function jumpToId(assignmentId: string) {
    const entry = entries.find((candidate) => candidate.assignmentId === assignmentId)
    if (entry) {
      jumpTo(entry)
    }
  }

  function selectCampaign(campaignId: string) {
    const first = entries.find((entry) => entry.campaignId === campaignId)
    setPickerOpen(false)
    if (first) {
      jumpTo(first)
    }
  }

  const subtitle = useMemo(() => {
    if (currentCampaign) {
      return `${currentCampaign.name} · ${currentCampaign.total} contacts`
    }

    if (campaigns.length > 1) {
      return `${entries.length} contacts across ${campaigns.length} campaigns`
    }

    return "Your call queue"
  }, [currentCampaign, campaigns.length, entries.length])

  if (tabConflict) {
    return (
      <div className="-m-6 flex min-h-full flex-1 flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold text-[var(--program-text)]">
          Another tab is using this queue
        </h1>
        <p role="alert" className="max-w-sm text-[13px] leading-5 text-[var(--muted-foreground)]">
          Close the other tab, then reload this one. Two tabs would write the same attempt twice; this tab has stopped
          rather than risk losing a call.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-11 rounded-xl bg-[var(--program-primary)] px-4 text-[13px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] focus-visible:ring-offset-2"
        >
          Reload this tab
        </button>
      </div>
    )
  }

  if (phase === "disposition" && current) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-background md:mx-auto md:max-w-[430px] md:border-x md:border-[#E2E8F0] dark:md:border-[var(--border)]">
        <DispositionScreen
          entry={current}
          survey={survey}
          role={role}
          status={status}
          notes={notes}
          answers={answers}
          receipt={receipt}
          failure={failure}
          saving={saving}
          onStatusChange={setStatus}
          onNotesChange={setNotes}
          onAnswerChange={(questionId: string, next: DispositionAnswer) =>
            setAnswers((previous) => ({ ...previous, [questionId]: next }))
          }
          onSave={() => void handleSave()}
        />
      </div>
    )
  }

  if (phase === "summary") {
    return (
      <div className="-m-6 flex min-h-full flex-1 flex-col bg-background md:mx-auto md:my-0 md:max-w-[430px] md:border-x md:border-[#E2E8F0] dark:md:border-[var(--border)]">
        <div className="hidden px-4 pt-4 md:block">
          <CampaignSubNav role={role} />
        </div>
        <SessionSummary
          summary={summary}
          loading={summaryLoading}
          recalling={recalling}
          failure={summaryFailure}
          receipt={sessionReceipt}
          onRecall={() => void handleRecall()}
          onDone={() => void handleDone()}
        />
      </div>
    )
  }

  if (phase === "empty" || !current) {
    return (
      <div className="-m-6 flex min-h-full flex-1 flex-col bg-background">
        <div className="hidden px-4 pt-4 md:block">
          <CampaignSubNav role={role} />
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <CampaignPageHeader title="Assignments" subtitle="Your call queue" />
          <CampaignEmptyState
            title="No calls assigned yet"
            description="An Admin or Preacher assigns contacts to you. Your next call appears here as soon as one is assigned."
          />
        </div>
      </div>
    )
  }

  const callBlocked = notice !== null

  return (
    <div className="-m-6 flex min-h-full flex-1 flex-col bg-background md:mx-auto md:my-0 md:max-w-[430px] md:border-x md:border-[#E2E8F0] dark:md:border-[var(--border)]">
      <div className="hidden w-full px-4 pt-4 md:block">
        <CampaignSubNav role={role} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4 pb-5">
        <CampaignPageHeader title="Assignments" subtitle={subtitle} />

        {campaigns.length > 0 ? (
          <div className="relative mt-3">
            <button
              type="button"
              onClick={() => setPickerOpen((open) => !open)}
              aria-expanded={pickerOpen}
              className="flex h-[54px] w-full items-center gap-2.5 rounded-[10px] border border-[#E2E8F0] bg-card px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] dark:border-[var(--border)]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#EEF1F8] dark:bg-[var(--secondary)]">
                <Megaphone className="size-4 text-[var(--program-primary)]" strokeWidth={1.35} aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[10px] font-semibold text-[#64748B]">Campaign</span>
                <span className="truncate text-[14px] font-semibold text-[var(--program-text)]">
                  {currentCampaign?.name ?? "Choose a campaign"}
                </span>
              </span>
              <span className="flex-1" />
              <ChevronDown className="size-2.5 text-[var(--muted-foreground)]" strokeWidth={1.5} aria-hidden="true" />
            </button>

            {pickerOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close the campaign list"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setPickerOpen(false)}
                />
                <div className="absolute inset-x-0 top-[58px] z-20 overflow-hidden rounded-[10px] border border-[#E2E8F0] bg-card shadow-lg dark:border-[var(--border)]">
                  {campaigns.map((campaign) => (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => selectCampaign(campaign.id)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] hover:bg-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] ${
                        campaign.id === currentCampaign?.id
                          ? "font-semibold text-[var(--program-primary)]"
                          : "text-[var(--program-text)]"
                      }`}
                    >
                      <span className="truncate">{campaign.name}</span>
                      <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                        {campaign.called} of {campaign.total} called
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {currentCampaign ? (
          <div className="mt-3 flex h-8 items-center gap-2">
            <span className="shrink-0 text-[12px] font-semibold text-[var(--muted-foreground)]">
              {currentCampaign.called} of {currentCampaign.total} called
            </span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-[var(--border)]">
              <span
                className="block h-full rounded-full bg-[var(--program-primary)]"
                style={{
                  width: `${currentCampaign.total > 0 ? Math.round((currentCampaign.called / currentCampaign.total) * 100) : 0}%`,
                }}
              />
            </span>
            <button
              type="button"
              onClick={() => setQueueOpen(true)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-card px-3 text-[12px] font-semibold text-[var(--program-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] dark:border-[var(--border)]"
            >
              <List className="size-3" strokeWidth={1.35} aria-hidden="true" />
              Queue
            </button>
          </div>
        ) : null}

        <div className="mt-3">
          <CallCard
            entry={current}
            callStarted={callStarted}
            copyState={copyState}
            draftNotice={draftNotice}
            receipt={sessionReceipt}
            onCopy={() => void handleCopy()}
            onResumeDraft={resumeDraft}
          />
        </div>

        {callError ? (
          <p role="alert" className="mt-3 rounded-xl bg-[#FEF2F2] px-3 py-2.5 text-[12px] leading-4 text-[#B91C1C] dark:bg-[#3A1717] dark:text-[#FCA5A5]">
            {callError}
          </p>
        ) : null}

        {current.profile.language || current.profile.level || current.profile.centre ? (
          <p className="mt-3 text-[11px] text-[var(--muted-foreground)]">
            {[current.profile.language, current.profile.level, current.profile.centre].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-[var(--mobile-app-nav-inset,0px)] z-20 mt-auto shrink-0 border-t border-[#E2E8F0] bg-card px-4 py-4 dark:border-[var(--border)]">
        <p className="mb-2 text-center text-[11px] leading-4 text-[var(--muted-foreground)]">
          {notice
            ? "Dismiss the campaign notice to continue"
            : callStarted
              ? "Call in progress — come back to this tab to record the outcome"
              : "Ready to call"}
        </p>
        <button
          type="button"
          onClick={() => void handleCall()}
          disabled={callBlocked || callStarted}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--program-primary)] text-[16px] font-semibold text-white transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Phone className="size-4" strokeWidth={1.5} aria-hidden="true" />
          {callStarted ? "Call in progress" : `Call ${firstName(current.contactName)}`}
        </button>
      </div>

      <QueueDrawer
        open={queueOpen}
        onOpenChange={setQueueOpen}
        roster={roster}
        counts={counts}
        currentId={currentId}
        onJump={jumpToId}
      />

      <Dialog open={notice !== null} onOpenChange={(open) => (!open ? dismissNotice() : undefined)}>
        <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-sm">
          <DialogTitle className="font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-[var(--program-text)]">
            Next campaign
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-5 text-[var(--muted-foreground)]">
            {notice ? (
              <>
                You are moving to <strong className="text-[var(--program-text)]">{notice.entry.campaignName}</strong> on{" "}
                {formatCampaignDate(notice.entry.campaignDate)}. Continue when you are ready for the next call.
              </>
            ) : null}
          </DialogDescription>
          <button
            type="button"
            onClick={dismissNotice}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--program-primary)] text-[14px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] focus-visible:ring-offset-2"
          >
            Continue to {notice ? notice.entry.campaignName : "the campaign"}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
