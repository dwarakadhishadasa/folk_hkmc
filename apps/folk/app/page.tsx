import type { Metadata } from "next"
import { CourseHeader } from "@/components/folk-home/course-header"
import { FolkHome } from "@/components/folk-home/folk-home"
import { listLocations } from "@/lib/supabase/data"

// The course venues are the programme's location rows, so the page reads them
// per request rather than baking the list into the build.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Gita Life Foundation Course | FOLK Chennai",
  description:
    "Learn the fundamental principles of Bhagavad Gita with the Gita Life Foundation Course, a project by Hare Krishna Movement Chennai.",
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
