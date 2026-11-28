import type { Metadata } from "next"
import { FolkHome } from "@/components/folk-home/folk-home"

import { loadHomeLocations } from "./staff"

// The course venues are the programme's location rows, so the page reads them
// per request rather than baking the list into the build.
export const dynamic = "force-dynamic"

const shareTitle = "FOLK — Empower Your Youth with Spiritual Wisdom"
const shareDescription =
  "Join Chennai's most vibrant youth community. FOLK offers spiritual growth, leadership skills, and meaningful friendships for ages 13-30."
const shareImage = {
  url: "/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "FOLK Chennai — Youth Empowerment Club",
}

export const metadata: Metadata = {
  title: "FOLK — Youth Empowerment Program | Hare Krishna Movement Chennai",
  description:
    "Join FOLK (Friends of Lord Krishna), a dynamic youth empowerment program for ages 13-30. Engage in spiritual discussions, leadership development, cultural activities, and community service.",
  openGraph: {
    title: shareTitle,
    description: shareDescription,
    url: "/",
    siteName: "FOLK Chennai",
    locale: "en_IN",
    type: "website",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: shareTitle,
    description: shareDescription,
    images: [shareImage],
  },
}

export default async function Home() {
  const locations = await loadHomeLocations()
  const attendAreas = locations
    .filter((location) => location.status !== "Inactive")
    .map((location) => location.name)
    .sort((left, right) => left.localeCompare(right))

  return <FolkHome attendAreas={attendAreas} />
}
