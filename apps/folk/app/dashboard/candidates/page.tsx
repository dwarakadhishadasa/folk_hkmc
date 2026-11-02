import { DashboardCandidatesRoute } from "@/components/dashboard/candidates-route"

export const dynamic = "force-dynamic"

export default function DashboardCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <DashboardCandidatesRoute searchParams={searchParams} />
}
