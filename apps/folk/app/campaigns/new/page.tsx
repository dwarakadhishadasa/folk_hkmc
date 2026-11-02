import { redirect } from "next/navigation"

/**
 * `/campaigns/new` is retired: creating a campaign is the Overview's popover
 * (name + end date), which lands on the assign-contacts screen where the
 * call-outcome survey now lives. The old URL stays as a redirect so a bookmark
 * or an export link still lands somewhere useful.
 */
export default function NewCampaignPage() {
  redirect("/campaigns")
}
