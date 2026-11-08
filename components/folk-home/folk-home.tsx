"use client"

import { useEffect, useState } from "react"
import { CourseLanding } from "@/components/folk-home/landing"
import { PaymentStep } from "@/components/folk-home/payment-step"
import { RegistrationForm } from "@/components/folk-home/registration-form"
import { RegistrationSuccess } from "@/components/folk-home/registration-success"
import type { RegistrationDraft } from "@/components/folk-home/types"

type CourseView = "landing" | "registration" | "payment" | "success"

export function FolkHome({ attendAreas }: { attendAreas: string[] }) {
  const [view, setView] = useState<CourseView>("landing")
  const [draft, setDraft] = useState<RegistrationDraft | null>(null)
  const [registrationId, setRegistrationId] = useState("")

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [view])

  if (view === "registration") {
    return (
      <RegistrationForm
        attendAreas={attendAreas}
        onBack={() => setView("landing")}
        onProceed={(nextDraft) => {
          setDraft(nextDraft)
          setView("payment")
        }}
      />
    )
  }

  if (view === "payment" && draft) {
    return (
      <PaymentStep
        draft={draft}
        onBack={() => setView("registration")}
        onSuccess={(id) => {
          setRegistrationId(id)
          setView("success")
        }}
      />
    )
  }

  if (view === "success") {
    return (
      <RegistrationSuccess
        registrationId={registrationId}
        onBackToHome={() => {
          setDraft(null)
          setRegistrationId("")
          setView("landing")
        }}
      />
    )
  }

  return <CourseLanding onRegister={() => setView("registration")} />
}
