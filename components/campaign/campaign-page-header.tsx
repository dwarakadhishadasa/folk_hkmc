"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"

import { CampaignMenu } from "./campaign-menu"

/**
 * The title row every campaign page opens with: the page's own name, the
 * scope line beneath it, and the page's primary action on the right.
 *
 * The title is Poppins 22px and the scope line is Inter 12px in the muted ink,
 * which is the pairing the Campaign frame (32) and the manage portal both
 * use — one optical unit, the action aligned to its baseline rather than to a
 * label of its own.
 *
 * On a phone the title carries the 18px chevron frame 1752 draws; it opens the
 * Campaign menu (frame 2217) with this page's own scope line as its subtitle.
 */
export function CampaignPageHeader({
  title,
  subtitle,
  actionHref,
  actionLabel,
}: {
  title: string
  subtitle: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
            {title}
          </h1>
          <CampaignMenu subtitle={subtitle} />
        </div>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{subtitle}</p>
      </div>

      {actionHref && actionLabel ? (
        <Button asChild size="lg" className="h-10 self-start rounded-lg px-4 sm:self-auto">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  )
}
