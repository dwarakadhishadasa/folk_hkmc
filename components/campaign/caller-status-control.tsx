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

/**
 * AD-2's Admin-only status switch, rendered by the roster and nowhere else.
 *
 * Deactivation asks first because it removes the caller from every assignment
 * picker and refuses their next disposition; reactivation has no such
 * consequence and writes on the click. A refused write leaves the rendered
 * status alone — the page refreshes only after a successful response — and the
 * server's own message is shown so a `403` or `404` names the reason.
 */
export function CallerStatusControl({
  callerId,
  name,
  isActive,
}: {
  callerId: string
  name: string
  isActive: boolean
}) {
  const router = useRouter()
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const write = async (nextActive: boolean) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/dialer/admin/callers/${callerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setIsConfirming(false)
        setIsSubmitting(false)
        setError(payload?.error ?? "The caller status could not be updated.")
        return
      }

      setIsConfirming(false)
      setIsSubmitting(false)
      router.refresh()
    } catch {
      setIsConfirming(false)
      setIsSubmitting(false)
      setError("Unable to reach the server. The caller status is unchanged.")
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={isActive ? "outline" : "default"}
        disabled={isSubmitting}
        onClick={() => {
          setError(null)

          if (isActive) {
            setIsConfirming(true)
            return
          }

          void write(true)
        }}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </Button>

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      <AlertDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setIsConfirming(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Deactivate {name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              A deactivated caller keeps their history on this roster, but leaves every assignment picker and cannot
              record a new call. You can reactivate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]" disabled={isSubmitting}>
              Keep caller active
            </AlertDialogCancel>
            <AlertDialogAction
              className="text-[13px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isSubmitting}
              onClick={(event) => {
                // The write resolves after this handler returns; closing on the
                // click would unmount the dialog before the outcome is known.
                event.preventDefault()
                void write(false)
              }}
            >
              {isSubmitting ? "Working…" : "Deactivate caller"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
