import Link from "next/link"
import { ArrowLeft } from "lucide-react"

/**
 * The form's way out.
 *
 * A link, not `router.back()`: a direct load — the Volunteers' and Assistants'
 * landing page — has no in-app history entry, and a history call there lands on
 * the browser's blank page. The destination is the section for the roles that
 * read it and the home page for the roles that do not.
 */
export function BackButton({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back
    </Link>
  )
}
