import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gita Life Portal",
    short_name: "Gita Life",
    description: "Registration, attendance, and contact management for Gita Life.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF9F0",
    theme_color: "#2D0A0A",
    orientation: "portrait-primary",
    scope: "/",
    icons: [
      {
        src: "/assets/activities/gita-life/Gita_life_logo.png",
        sizes: "500x500",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["education", "lifestyle", "utilities"],
    lang: "en",
    dir: "ltr",
    display_override: ["standalone", "minimal-ui"],
    shortcuts: [
      {
        name: "Mark Attendance",
        short_name: "Attend",
        description: "Mark attendance for the active Gita Life session.",
        url: "/attend",
      },
      {
        name: "Sessions",
        short_name: "Sessions",
        description: "Manage Gita Life sessions and live attendance.",
        url: "/sessions",
      },
    ],
  }
}
