import type { ReactNode } from "react"

import { CourseHeader } from "@/components/folk-home/course-header"

import { HomeAuthShell } from "./home-auth-shell"
import { loadHomeLocations, loadHomeStaff } from "./staff"

/**
 * The shared home chrome lives here, outside the page's loading boundary: the
 * shell is already hydrated before streamed page content arrives, so the page
 * transition controller's mutation of `<main>` cannot race hydration.
 */
export default async function HomeLayout({ children }: { children: ReactNode }) {
  void loadHomeLocations().catch(() => undefined)
  const staff = await loadHomeStaff()

  return (
    <HomeAuthShell staff={staff}>
      <CourseHeader />
      <main>{children}</main>
    </HomeAuthShell>
  )
}
