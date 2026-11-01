import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * The section's own empty state.
 *
 * Distinct from the grid's filtered-empty body: this one means the reader's
 * scope holds no contacts at all, so it offers the only action that changes
 * that fact — the form.
 */
export function ContactsEmptyState() {
  return (
    <Empty className="border border-dashed border-[var(--border)] bg-card">
      <EmptyHeader>
        <EmptyTitle>No contacts yet</EmptyTitle>
        <EmptyDescription>
          Contacts assigned to you appear here once they are collected.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/contact">Add contact</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
