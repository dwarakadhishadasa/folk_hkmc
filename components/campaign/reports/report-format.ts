/**
 * The reports screens' date and time strings.
 *
 * `formatCampaignDate` already owns the campaign date's UTC rule, so the
 * reports subtitle reuses it rather than opening a second date parser. The
 * activity time is the one the call log carries: `HH:MM`, the shape the design
 * prints, with an unreadable value shown as stored rather than blanked.
 */
import { formatCampaignDate } from "@/components/campaign/campaign-format"

const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export { formatCampaignDate }

export function formatReportTime(value: string): string {
  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? value : TIME_FORMATTER.format(parsed)
}
