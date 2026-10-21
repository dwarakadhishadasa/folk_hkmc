"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The detail pane's body: a heading, the record's own identity, and a set of
 * sections under it.
 *
 * The two-canvas arrangement is the whole point of the primitive, so the detail
 * pane is not a slot the consumer fills with an arbitrary node — it is a
 * header plus a stack of sections, because that is the shape every record
 * review has. A consumer that wants something else between the header and the
 * sections passes it as `children` above the sections.
 */
export interface RecordReviewDetailProps {
  /** The record's identity. The big line at the top of the pane. */
  title: ReactNode
  /** The line under the identity. */
  subtitle?: ReactNode
  /** Rendered at the right of the header — a call to action, a status, a link. */
  actions?: ReactNode
  /** Anything between the header and the sections. */
  children?: ReactNode
  className?: string
}

export function RecordReviewDetail({
  title,
  subtitle,
  actions,
  children,
  className,
}: RecordReviewDetailProps) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  )
}

/**
 * One titled section of the detail pane.
 *
 * A section is a heading and a body. The Airtable interface this primitive
 * reproduces groups its detail into exactly these — a summary section, a
 * records section, an occupation section — and the grouping is what makes a
 * detail pane scannable rather than a wall of fields.
 */
export interface RecordReviewSectionProps {
  /** The section heading. */
  title: ReactNode
  /** The section body. */
  children: ReactNode
  className?: string
}

export function RecordReviewSection({ title, children, className }: RecordReviewSectionProps) {
  return (
    <section className={cn("border-b border-border bg-card px-5 py-4 last:border-b-0", className)}>
      {/*
        The display face, not the body face. The body face's uppercase pairs
        ("TT" in "ATTENDANCE") leave a visible gap under `tracking-wide`, and a
        section heading that reads as two words is a section heading that reads
        as a bug.
      */}
      <h3 className="mb-2.5 font-[family-name:var(--font-poppins)] text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * One labelled value inside a section.
 *
 * A `<dl>` with a `<dt>` and a `<dd>`, which is the pairing the Airtable
 * interface uses for its side-by-side label and value cells, and the pairing
 * that reads correctly to a screen reader. The label column is a fixed width
 * so a section of fields lines up into a table of facts without being a
 * table.
 */
export interface RecordReviewFieldProps {
  /** The field's label. */
  label: ReactNode
  /** The field's value. */
  children: ReactNode
  className?: string
}

export function RecordReviewField({ label, children, className }: RecordReviewFieldProps) {
  return (
    <dl className={cn("flex items-start gap-4 py-1.5", className)}>
      <dt className="w-56 shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-auto text-[13px] text-[var(--program-text)]">{children}</dd>
    </dl>
  )
}
