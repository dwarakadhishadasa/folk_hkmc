/**
 * The campaign surfaces' date and duration formatting.
 *
 * `campaign_date` is a `DATE` column, so it arrives as `YYYY-MM-DD` with no
 * time zone. Parsing it at midnight UTC and formatting in UTC keeps the day the
 * admin picked on every machine — a local-zone parse would show the previous
 * day west of Greenwich.
 */
const CAMPAIGN_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

export function formatCampaignDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`)

  // A value the database holds but this formatter cannot read is shown as it
  // is stored rather than replaced by a placeholder that pretends it is absent.
  return Number.isNaN(parsed.getTime()) ? value : CAMPAIGN_DATE_FORMATTER.format(parsed)
}

export function formatGapDuration(seconds: number): string {
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`
}
