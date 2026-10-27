import Link from "next/link"

import { CampaignStatusPill } from "@/components/campaign/campaign-status-pill"
import { formatCampaignDate } from "@/components/campaign/campaign-format"
import type { CampaignOverviewEntry } from "@/lib/dialer/progress"

/**
 * Frame 1752's phone Overview: the ACTIVE campaigns as cards, then the
 * terminal and draft ones as a compact list.
 *
 * The card carries every count the desktop row carries, in the frame's three
 * cells plus Attempted and Confirmed: the phone is the only Overview a caller-
 * adjacent role gets, so it may not show fewer numbers than the table.
 *
 * Everything here is a `md:hidden` sibling of the desktop table rather than a
 * client-side viewport check — the page stays a server component, and the two
 * arrangements are the same rows in two shapes.
 */
export function CampaignOverviewCards({ entries }: { entries: CampaignOverviewEntry[] }) {
  const active = entries.filter((entry) => entry.campaign.status === "ACTIVE")
  const others = entries.filter((entry) => entry.campaign.status !== "ACTIVE")

  return (
    <div className="flex flex-col gap-5 md:hidden">
      {active.length > 0 ? (
        <section aria-label="Active campaigns" className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--muted-foreground)]">Active</h2>
          {active.map((entry) => (
            <CampaignCard key={entry.campaign.id} entry={entry} />
          ))}
        </section>
      ) : null}

      {others.length > 0 ? (
        <section aria-label="Other campaigns" className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--muted-foreground)]">Other campaigns</h2>
          <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-card">
            {others.map(({ campaign, summary }) => (
              <li
                key={campaign.id}
                className="border-b border-[var(--border)] px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/campaigns/${campaign.id}/edit`}
                    className="text-[13px] font-medium text-[var(--program-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                  >
                    {campaign.name}
                  </Link>
                  <CampaignStatusPill status={campaign.status} />
                </div>
                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                  Ends {formatCampaignDate(campaign.campaign_date)} · {summary.assigned} assigned · {summary.reached}{" "}
                  reached · {summary.confirmed} confirmed · {summary.neverAttempted} never attempted
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function CampaignCard({ entry }: { entry: CampaignOverviewEntry }) {
  const { campaign, summary } = entry
  const counts = [
    { label: "Assigned", value: summary.assigned },
    { label: "Attempted", value: summary.attempted },
    { label: "Reached", value: summary.reached },
    { label: "Confirmed", value: summary.confirmed },
    { label: "Never attempted", value: summary.neverAttempted },
  ]

  return (
    <article className="rounded-xl border border-[var(--border)] bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-medium text-[var(--program-text)]">
          <Link
            href={`/campaigns/${campaign.id}`}
            className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
          >
            {campaign.name}
          </Link>
        </h3>
        <CampaignStatusPill status={campaign.status} />
      </div>

      <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
        Ends {formatCampaignDate(campaign.campaign_date)}
      </p>

      <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
        {counts.map((count) => (
          <div key={count.label}>
            <dt className="text-[10px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">
              {count.label}
            </dt>
            <dd className="text-[16px] font-semibold text-[var(--program-text)]">{count.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
