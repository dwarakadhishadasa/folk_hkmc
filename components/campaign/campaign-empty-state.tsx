"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/**
 * The empty state a campaign surface shows when it has nothing to list.
 *
 * The design has no empty frames (design-coverage item 8), so the state has
 * to say what is missing **and** what to do about it: the action names the
 * next step and links to it. An empty state that only says "nothing here"
 * leaves the reader to work out what they were supposed to do.
 *
 * `action` is for a control that cannot be a link — the Sessions popover is
 * one — and takes precedence over `actionHref`/`actionLabel`.
 */
export function CampaignEmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  action,
}: {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
  action?: ReactNode
}) {
  return (
    <Empty className="border border-dashed border-[var(--border)] bg-card">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>

      {action ? (
        <EmptyContent>{action}</EmptyContent>
      ) : actionHref && actionLabel ? (
        <EmptyContent>
          <Button asChild>
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
