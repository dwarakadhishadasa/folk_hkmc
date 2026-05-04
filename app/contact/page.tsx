"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { ContactForm } from "@/components/contact-form"
import { useAuth } from "@/lib/auth-context"

export default function ContactPage() {
  const { isLoggedIn, isHydrated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isHydrated && !isLoggedIn) {
      router.push("/login?redirect=/contact")
    }
  }, [isLoggedIn, isHydrated, router])

  if (!isHydrated || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-gray-600">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <ContactForm />
      </main>
    </div>
  )
}
