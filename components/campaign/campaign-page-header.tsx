"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { SectionPageHeader } from "@/components/section-page-header"
import { Button } from "@/components/ui/button"

import { CampaignMenu } from "./campaign-menu"

/**
 * The title row every campaign page opens with.
 *
 * The shape lives in `SectionPageHeader`, so Campaigns, Sessions and the
 * Dashboard share one typography and one alignment. On a phone the title
 * carries the Campaign menu (frame 2217) with this page's own scope line as its
 * subtitle.
 */
export function CampaignPageHeader({
  title,
  subtitle,
  actionHref,
  actionLabel,
  action,
  filters,
}: {
  title: string
  subtitle: string
  actionHref?: string
  actionLabel?: string
  /** A control instead of a link, e.g. the New campaign popover. Takes precedence. */
  action?: ReactNode
  filters?: ReactNode
}) {
  return (
    <SectionPageHeader
      title={title}
      subtitle={subtitle}
      menu={<CampaignMenu subtitle={subtitle} />}
      filters={filters}
      action={
        action ??
        (actionHref && actionLabel ? (
          <Button asChild size="lg" className="h-10 rounded-lg px-4">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : undefined)
      }
    />
  )
}
