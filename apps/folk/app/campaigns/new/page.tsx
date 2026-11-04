import { redirect } from "next/navigation"

/**
 * `/campaigns/new` is retired: `New campaign` writes a DRAFT and opens the
 * campaign's own workspace, so details, survey, assign-to and grid are all
 * present without a pre-id screen. The old URL stays as a redirect so a
 * bookmark still lands somewhere useful.
 */
export default function NewCampaignPage() {
  redirect("/campaigns")
}
