import { formatPercent } from "@/lib/sessions/format"

const TILE_CLASS = "flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-card p-3 md:p-5"
const LABEL_CLASS =
  "text-[10px] font-semibold tracking-[0.02em] text-[#64748b] uppercase md:text-[11px] dark:text-[var(--muted-foreground)]"
const VALUE_CLASS =
  "block font-[family-name:var(--font-poppins)] text-[24px] leading-none font-bold text-[var(--program-text)] md:text-[32px]"
const CAPTION_CLASS = "hidden text-[12px] text-[#64748b] md:block dark:text-[var(--muted-foreground)]"

/**
 * The detail screen's three figures. First-timers and Returning are defined
 * against the attendee's own first visible session, so they cannot disagree
 * with the contact record's history: a first-timer is an attendee whose first
 * session is this one.
 */
export function SessionDetailStats({
  attended,
  firstTimers,
  returning,
}: {
  attended: number
  firstTimers: number
  returning: number
}) {
  const tiles = [
    { label: "Attended", value: String(attended), caption: "This session" },
    {
      label: "First-timers",
      value: String(firstTimers),
      caption: `${formatPercent(attended === 0 ? 0 : firstTimers / attended)} of attendees`,
    },
    {
      label: "Returning",
      value: String(returning),
      caption: `${formatPercent(attended === 0 ? 0 : returning / attended)} of attendees`,
    },
  ]

  return (
    <section aria-label="Session attendance totals">
      <dl className="grid grid-cols-3 gap-2 md:gap-4">
        {tiles.map((tile) => (
          <div key={tile.label} data-session-detail-stat={tile.label} className={TILE_CLASS}>
            <dt className={LABEL_CLASS}>{tile.label}</dt>
            <dd>
              <span className={VALUE_CLASS} data-session-detail-stat-value={tile.value}>
                {tile.value}
              </span>
              <span className={`mt-1.5 ${CAPTION_CLASS}`}>{tile.caption}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
