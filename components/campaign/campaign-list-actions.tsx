"use client"

import Link from "next/link"
import { MoreHorizontal, Pencil, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * The Overview row's actions.
 *
 * The two destinations answer the two questions the list raises: "work this
 * campaign" (Edit — the assign screen is the campaign's workspace) and "how did
 * it go" (View progress — the reports screen filtered to this campaign). They
 * live behind one trigger so the row does not spend a permanent column on two
 * links, and so the read-only progress path is not the row's only affordance.
 */
export function CampaignListActions({
  campaignId,
  campaignName,
}: {
  campaignId: string
  campaignName: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${campaignName}`}
          className="text-[var(--muted-foreground)] hover:text-[var(--program-text)]"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild className="gap-2 text-[13px]">
          <Link href={`/campaigns/${campaignId}/assign-contacts`}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2 text-[13px]">
          <Link href={`/campaigns/reports?campaign=${campaignId}`}>
            <TrendingUp className="size-3.5" aria-hidden="true" />
            View progress
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
