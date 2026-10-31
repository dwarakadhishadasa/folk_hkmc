import { getStaffContext } from "@/lib/authz"
import { getCampaign } from "@/lib/dialer/campaigns"
import { getCampaignProgress } from "@/lib/dialer/progress"
import { buildCampaignReportCsv, reportFileName } from "@/lib/dialer/reports"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

interface CampaignExportContext {
  params: Promise<{ campaignId: string }>
}

/**
 * AD-5's one reporting read, rendered as a file.
 *
 * The export is not a second computation: it reads `campaign_progress` with the
 * same scope arguments as the reports screen and hands the payload to the same
 * formatter. The campaign read happens first so a missing or foreign campaign is
 * a 404 before the RPC runs, exactly as the screen's page does.
 *
 * `campaign_progress` returns the aggregate in one payload, so there is no
 * PostgREST page to concatenate here. The paged reads this feature does use go
 * through `lib/supabase/paging`, which fails loudly rather than truncating
 * (AD-16); a transient read error is a named JSON error, never an empty file
 * that looks like a successful export.
 */
export async function GET(_request: Request, context: CampaignExportContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params

    const campaign = await getCampaign(staff, campaignId)
    const progress = await getCampaignProgress(staff, campaignId)
    const csv = buildCampaignReportCsv(campaign, progress)

    return new Response(csv, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${reportFileName(campaign.name)}"`,
      },
    })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
