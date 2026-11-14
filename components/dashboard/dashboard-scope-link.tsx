"use client"

import Link, { useLinkStatus } from "next/link"
import type { CSSProperties, ReactNode } from "react"

import { AuroraRing } from "@/components/dashboard/aurora-ring"
import { cn } from "@/lib/utils"

const SCOPE_LINK_CLASS =
  "relative isolate rounded-full px-4 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"

const SCOPE_LINK_ACTIVE_CLASS =
  "relative isolate rounded-full bg-[var(--program-primary)] px-4 py-1.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"

/**
 * `useLinkStatus` only reports a navigation from inside the link it belongs to,
 * so the pill's contents are a separate component rendered as its child.
 *
 * The plate reads `--scope-pill-bg` rather than a prop so that it keeps matching
 * the pill while the ring fades out after the navigation has already switched
 * the link to its active fill.
 */
function ScopeLinkContents({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus()

  return (
    <>
      <AuroraRing active={pending} plateClassName="bg-[var(--scope-pill-bg)]" />
      <span aria-busy={pending} data-scope-pending={pending ? "true" : undefined}>
        {children}
      </span>
    </>
  )
}

/**
 * One option of the Admin's All/Own switch. The pill is the same on both
 * surfaces; the header only decides where the switch sits.
 */
export function DashboardScopeLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(active ? SCOPE_LINK_ACTIVE_CLASS : SCOPE_LINK_CLASS)}
      style={
        {
          "--scope-pill-bg": active ? "var(--program-primary)" : "var(--card)",
        } as CSSProperties
      }
    >
      <ScopeLinkContents>{children}</ScopeLinkContents>
    </Link>
  )
}
