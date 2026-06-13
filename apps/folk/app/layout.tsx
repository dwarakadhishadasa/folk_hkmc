import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Poppins } from "next/font/google"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "@/components/providers"
import "../../../app/globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
})

export const metadata: Metadata = {
  title: "FOLK Portal - FOLK Chennai",
  description: "FOLK Chennai staff portal for registration, contacts, sessions, attendance, invites, and Airtable handoff.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FOLK Portal",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.jpg", sizes: "192x192", type: "image/jpeg" },
      { url: "/icons/icon-512x512.jpg", sizes: "512x512", type: "image/jpeg" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.jpg", sizes: "180x180", type: "image/jpeg" }],
  },
  applicationName: "FOLK Portal",
  authors: [{ name: "HKM Chennai" }],
  creator: "HKM Chennai",
  publisher: "HKM Chennai",
}

export const viewport: Viewport = {
  themeColor: "#0F1E54",
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
        <meta name="apple-mobile-web-app-title" content="FOLK Portal" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.jpg" />
      </head>
      <body className={`${inter.variable} ${poppins.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        <SpeedInsights />
      </body>
    </html>
  )
}
