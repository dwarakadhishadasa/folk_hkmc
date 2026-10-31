"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BarChart3, ChevronDown, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { reportFileName } from "@/lib/dialer/reports"
import { cn } from "@/lib/utils"

export interface ReportCampaignOption {
  id: string
  name: string
  status: string
}

/**
 * The campaign selector the design frames do not show.
 *
 * A report is per campaign — `campaign_progress` answers one campaign at a time
 * and the design's subtitle names one — so the screen needs a way to choose it.
 * The choice lives in the URL, like the Overview's status filter, so a reload
 * and a shared link land on the same report.
 */
export function ReportCampaignPicker({
  campaigns,
  selectedId,
}: {
  campaigns: ReportCampaignOption[]
  selectedId: string
}) {
  const router = useRouter()

  return (
    <label className="relative flex h-10 max-w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-card pl-3 pr-2 text-[13px]">
      <BarChart3 className="size-[15px] shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
      <select
        aria-label="Campaign"
        value={selectedId}
        onChange={(event) => {
          router.push(`/campaigns/reports?campaign=${encodeURIComponent(event.target.value)}`)
        }}
        className="max-w-[11rem] appearance-none truncate bg-transparent pr-5 text-[13px] font-medium text-[var(--program-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)] sm:max-w-[16rem]"
      >
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name} — {campaign.status}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 size-[15px] text-[var(--muted-foreground)]"
        aria-hidden="true"
      />
    </label>
  )
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) {
    return null
  }

  const match = /filename="([^"]+)"/i.exec(header)
  return match?.[1] ?? null
}

/**
 * `Export CSV` as a real download, not a navigation to the API.
 *
 * A plain link would let a failed request paint JSON or save an empty file and
 * call it a success. Reading the response first means a transient failure is a
 * named message on the screen and no file. The export itself is what the route
 * already owns; this control only decides when to ask for it.
 */
export function ReportExportButton({
  campaignId,
  campaignName,
  fullWidth = false,
  variant = "default",
}: {
  campaignId: string
  campaignName: string
  fullWidth?: boolean
  /** The desktop frame draws a filled button; the phone frame draws an outline. */
  variant?: "default" | "outline"
}) {
  const [state, setState] = useState<{ status: "idle" | "working" | "failed"; message?: string }>({
    status: "idle",
  })

  async function download() {
    setState({ status: "working" })

    try {
      const response = await fetch(`/api/dialer/admin/campaigns/${campaignId}/export`, {
        cache: "no-store",
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null

        throw new Error(body?.error ?? body?.code ?? `The export failed (${response.status}).`)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = filenameFromDisposition(response.headers.get("content-disposition"))
        ?? reportFileName(campaignName)
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      setState({ status: "idle" })
    } catch (error) {
      setState({
        status: "failed",
        message: error instanceof Error ? error.message : "The export failed.",
      })
    }
  }

  return (
    <div className={cn("flex flex-col gap-1", fullWidth && "w-full")}>
      <Button
        type="button"
        size="lg"
        variant={variant}
        onClick={() => void download()}
        disabled={state.status === "working"}
        className={cn("h-10 rounded-lg px-4", fullWidth && "w-full")}
      >
        <Download className="size-4" aria-hidden="true" />
        {state.status === "working" ? "Exporting…" : "Export CSV"}
      </Button>
      {state.status === "failed" ? (
        <p role="alert" className="text-[12px] text-[var(--destructive)]">
          {state.message}
        </p>
      ) : null}
    </div>
  )
}
