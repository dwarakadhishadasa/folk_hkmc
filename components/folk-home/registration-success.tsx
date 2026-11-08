"use client"

import { CalendarDays, CheckCircle2, Clock, MapPin, Phone } from "lucide-react"
import { COURSE_FACTS } from "@/components/folk-home/course-data"

export function RegistrationSuccess({
  registrationId,
  onBackToHome,
}: {
  registrationId: string
  onBackToHome: () => void
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="bg-gradient-to-r from-green-600 to-emerald-500 p-8 text-center text-white">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h2 className="text-2xl font-bold">Registration Successful!</h2>
            <p className="mt-2 text-green-100">Your registration has been received</p>
          </div>

          <div className="p-6">
            <div className="mb-6 rounded-xl bg-amber-50 p-4">
              <p className="mb-1 text-sm text-amber-700">Registration ID</p>
              <p className="font-mono text-lg font-bold break-all text-amber-900">
                {registrationId.slice(0, 8).toUpperCase()}
              </p>
            </div>

            <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
              <p className="mb-2 font-medium text-orange-800">Payment Verification</p>
              <p className="text-sm text-orange-700">
                Your payment screenshot has been submitted for verification. You will receive a
                confirmation once approved.
              </p>
            </div>

            <div className="mb-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Course Details</h3>
              <div className="flex items-center gap-3 text-gray-600">
                <CalendarDays className="h-5 w-5 text-amber-600" />
                <span>{COURSE_FACTS.days}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Clock className="h-5 w-5 text-amber-600" />
                <span>{COURSE_FACTS.time}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <MapPin className="h-5 w-5 text-amber-600" />
                <span>{COURSE_FACTS.areas}</span>
              </div>
            </div>

            <div className="mb-6 rounded-xl bg-gray-50 p-4">
              <p className="mb-2 text-sm text-gray-600">For any queries, contact:</p>
              <a
                href={COURSE_FACTS.phoneHref}
                className="flex items-center gap-2 font-semibold text-amber-700 transition-colors hover:text-amber-800"
              >
                <Phone className="h-5 w-5" />
                {COURSE_FACTS.phone}
              </a>
            </div>

            <button
              type="button"
              onClick={onBackToHome}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 py-4 font-semibold text-white transition-colors hover:from-amber-500 hover:to-orange-400"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
