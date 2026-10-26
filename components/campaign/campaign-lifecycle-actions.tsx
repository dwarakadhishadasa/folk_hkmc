"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

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
import { cn } from "@/lib/utils"

type LifecycleAction = "start" | "complete" | "cancel"

interface ActionDefinition {
  action: LifecycleAction
  label: string
  dialogTitle: string
  dialogDescription: string
  confirmLabel: string
  dismissLabel: string
  destructive?: boolean
}

const START_ACTION: ActionDefinition = {
  action: "start",
  label: "Start campaign",
  dialogTitle: "Start this campaign?",
  dialogDescription:
    "An active campaign is callable: its pending assignments reach a caller's queue from this moment.",
  confirmLabel: "Start campaign",
  dismissLabel: "Not now",
}

const COMPLETE_ACTION: ActionDefinition = {
  action: "complete",
  label: "Complete",
  dialogTitle: "Complete this campaign?",
  dialogDescription: "Completed is terminal. The campaign cannot be started, completed or cancelled again.",
  confirmLabel: "Complete campaign",
  dismissLabel: "Not now",
}

const CANCEL_ACTION: ActionDefinition = {
  action: "cancel",
  label: "Cancel",
  dialogTitle: "Cancel this campaign?",
  dialogDescription: "Cancelled is terminal. The campaign can never be started again and leaves every new queue.",
  confirmLabel: "Cancel campaign",
  dismissLabel: "Keep campaign",
  destructive: true,
}

/**
 * AD-12's transition matrix, and nothing else: a `DRAFT` offers one start, an
 * `ACTIVE` offers complete and cancel, and a terminal campaign offers no
 * control at all. The status column is `string` — the database CHECK is what
 * narrows it — so an unrecognised value offers nothing rather than guessing a
 * transition the server would refuse.
 */
function actionsFor(status: string): ActionDefinition[] {
  switch (status) {
    case "DRAFT":
      return [START_ACTION]
    case "ACTIVE":
      return [COMPLETE_ACTION, CANCEL_ACTION]
    default:
      return []
  }
}

/**
 * The lifecycle controls.
 *
 * Every action confirms before it writes, because each one moves a campaign
 * into a state the surface cannot undo — `COMPLETED` and `CANCELLED` are
 * terminal, and `ACTIVE` makes the campaign callable. The confirmation is the
 * design system's alert dialog rather than `window.confirm`, so the consequence
 * is stated in the campaign's own words.
 *
 * A refused transition leaves the rendered status alone: the page is only
 * refreshed after a successful response, and the server's message is shown
 * verbatim so a `409` names the status the campaign actually holds.
 */
export function CampaignLifecycleActions({ campaignId, status }: { campaignId: string; status: string }) {
  const router = useRouter()
  const actions = actionsFor(status)
  const [pending, setPending] = useState<ActionDefinition | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (actions.length === 0) {
    return null
  }

  const confirm = async () => {
    if (!pending) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/dialer/admin/campaigns/${campaignId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pending.action }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setPending(null)
        setIsSubmitting(false)
        setError(payload?.error ?? "The campaign could not be updated.")
        return
      }

      setPending(null)
      setIsSubmitting(false)
      router.refresh()
    } catch {
      setPending(null)
      setIsSubmitting(false)
      setError("Unable to reach the server. The campaign status is unchanged.")
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {actions.map((definition) => (
          <Button
            key={definition.action}
            type="button"
            size="sm"
            variant={definition.destructive ? "destructive" : definition.action === "start" ? "default" : "outline"}
            onClick={() => {
              setError(null)
              setPending(definition)
            }}
          >
            {definition.label}
          </Button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setPending(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{pending?.dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">{pending?.dialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]" disabled={isSubmitting}>
              {pending?.dismissLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "text-[13px]",
                pending?.destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
              disabled={isSubmitting}
              onClick={(event) => {
                // The write resolves after this handler returns; closing on the
                // click would unmount the dialog before the outcome is known.
                event.preventDefault()
                void confirm()
              }}
            >
              {isSubmitting ? "Working…" : pending?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
