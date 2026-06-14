import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Poppins } from "next/font/google"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "@/components/providers"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
})

export const metadata: Metadata = {
  title: "Gita Life Portal",
  description:
    "Gita Life portal for Bhagavad Gita registrations, session attendance, staff follow-up, and Airtable handoff.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gita Life Portal",
  },
  icons: {
    icon: [{ url: "/assets/activities/gita-life/Gita_life_logo.png", sizes: "500x500", type: "image/png" }],
    apple: [{ url: "/assets/activities/gita-life/Gita_life_logo.png", sizes: "500x500", type: "image/png" }],
  },
  applicationName: "Gita Life Portal",
  authors: [{ name: "HKM Chennai" }],
  creator: "HKM Chennai",
  publisher: "HKM Chennai",
}

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Gita Life Portal" />
        <link rel="apple-touch-icon" href="/assets/activities/gita-life/Gita_life_logo.png" />
      </head>
      <body className={`${inter.variable} ${poppins.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        <SpeedInsights />
      </body>
    </html>
  )
}
