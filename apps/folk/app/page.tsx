import type { Metadata } from "next"
import { CourseHeader } from "@/components/folk-home/course-header"
import { FolkHome } from "@/components/folk-home/folk-home"
import { listLocations } from "@/lib/supabase/data"

// The course venues are the programme's location rows, so the page reads them
// per request rather than baking the list into the build.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "FOLK — Youth Empowerment Program | Hare Krishna Movement Chennai",
  description:
    "Join FOLK (Friends of Lord Krishna), a dynamic youth empowerment program for ages 13-30. Engage in spiritual discussions, leadership development, cultural activities, and community service.",
}

export default async function Home() {
  const locations = await listLocations()
  const attendAreas = locations
    .filter((location) => location.status !== "Inactive")
    .map((location) => location.name)
    .sort((left, right) => left.localeCompare(right))

  return (
    <>
      <CourseHeader />
      <main>
        <FolkHome attendAreas={attendAreas} />
      </main>
    </>
  )
}
