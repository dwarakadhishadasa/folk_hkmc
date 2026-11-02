import { DashboardRoute } from "@/components/dashboard/dashboard-route"

export const dynamic = "force-dynamic"

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <DashboardRoute searchParams={searchParams} />
}
