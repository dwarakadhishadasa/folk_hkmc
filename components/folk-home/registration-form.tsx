"use client"

import { useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react"
import { COURSE_FACTS } from "@/components/folk-home/course-data"
import type { RegistrationDraft, RegistrationErrors } from "@/components/folk-home/types"

const INITIAL_DRAFT: RegistrationDraft = {
  name: "",
  mobileNo: "",
  yourArea: "",
  areaToAttend: "",
  dateOfBirth: "",
  collegeName: "",
  email: "",
}

const MIN_AGE = 18
const MAX_AGE = 28

function ageOn(dateOfBirth: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dob = new Date(Date.UTC(year, month - 1, day))
  if (
    dob.getUTCFullYear() !== year ||
    dob.getUTCMonth() !== month - 1 ||
    dob.getUTCDate() !== day
  ) {
    return null
  }

  let age = today.getUTCFullYear() - year
  const monthDelta = today.getUTCMonth() - (month - 1)
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < day)) {
    age -= 1
  }
  return age
}

function validateFirstStep(draft: RegistrationDraft): RegistrationErrors {
  const errors: RegistrationErrors = {}

  if (!draft.name.trim()) {
    errors.name = "Name is required"
  }
  if (!draft.mobileNo.trim()) {
    errors.mobileNo = "Mobile number is required"
  } else if (!/^[6-9]\d{9}$/.test(draft.mobileNo)) {
    errors.mobileNo = "Enter a valid 10-digit mobile number"
  }
  if (!draft.yourArea.trim()) {
    errors.yourArea = "Please enter your area"
  }
  if (!draft.areaToAttend) {
    errors.areaToAttend = "Please select an area to attend"
  }

  return errors
}

function validateSecondStep(draft: RegistrationDraft): RegistrationErrors {
  const errors: RegistrationErrors = {}

  if (!draft.dateOfBirth.trim()) {
    errors.dateOfBirth = "Date of Birth is required"
  } else {
    const age = ageOn(draft.dateOfBirth)
    if (age === null) {
      errors.dateOfBirth = "Enter a valid date of birth"
    } else if (age < MIN_AGE || age > MAX_AGE) {
      errors.dateOfBirth = `This course is for youth aged ${MIN_AGE} to ${MAX_AGE}`
    }
  }
  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
    errors.email = "Enter a valid email address"
  }

  return errors
}

const fieldClass = (invalid: boolean) =>
  `w-full px-4 py-3 rounded-lg border bg-white text-gray-900 placeholder:text-gray-400 [color-scheme:light] ${
    invalid ? "border-red-500" : "border-gray-300"
  } focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all`

const labelClass = "flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"

export function RegistrationForm({
  attendAreas,
  onBack,
  onProceed,
}: {
  attendAreas: string[]
  onBack: () => void
  onProceed: (draft: RegistrationDraft) => void
}) {
  const [draft, setDraft] = useState<RegistrationDraft>(INITIAL_DRAFT)
  const [errors, setErrors] = useState<RegistrationErrors>({})
  const [step, setStep] = useState(1)

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target
    setDraft((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => ({ ...previous, [name]: undefined }))
  }

  const goToPayment = () => {
    if (step === 1) {
      const firstStepErrors = validateFirstStep(draft)
      if (Object.keys(firstStepErrors).length > 0) {
        setErrors(firstStepErrors)
        return
      }
      setErrors({})
      setStep(2)
      return
    }

    const secondStepErrors = validateSecondStep(draft)
    if (Object.keys(secondStepErrors).length > 0) {
      setErrors(secondStepErrors)
      return
    }
    setErrors({})
    onProceed(draft)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-amber-700 transition-colors hover:text-amber-900"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to Home
        </button>

        <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="bg-gradient-to-r from-amber-700 to-orange-600 p-6 text-white">
            <h2 className="text-2xl font-bold">Registration Form</h2>
            <p className="mt-1 text-amber-100">{COURSE_FACTS.title}</p>
            <div className="mt-4 flex gap-2">
              <div
                className={`h-2 flex-1 rounded-full ${step >= 1 ? "bg-amber-300" : "bg-white/30"}`}
              />
              <div
                className={`h-2 flex-1 rounded-full ${step >= 2 ? "bg-amber-300" : "bg-white/30"}`}
              />
            </div>
            <p className="mt-2 text-sm text-amber-200">Step {step} of 2</p>
          </div>

          <div className="p-6">
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label htmlFor="name" className={labelClass}>
                    <User className="h-4 w-4 text-amber-600" />
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    name="name"
                    value={draft.name}
                    onChange={handleChange}
                    placeholder="Enter your full name"
                    className={fieldClass(Boolean(errors.name))}
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
                </div>

                <div>
                  <label htmlFor="mobileNo" className={labelClass}>
                    <Phone className="h-4 w-4 text-amber-600" />
                    Mobile Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="mobileNo"
                    type="tel"
                    name="mobileNo"
                    value={draft.mobileNo}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, "").slice(0, 10)
                      setDraft((previous) => ({ ...previous, mobileNo: value }))
                      setErrors((previous) => ({ ...previous, mobileNo: undefined }))
                    }}
                    placeholder="Enter 10-digit mobile number"
                    maxLength={10}
                    className={fieldClass(Boolean(errors.mobileNo))}
                  />
                  {errors.mobileNo && (
                    <p className="mt-1 text-sm text-red-500">{errors.mobileNo}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="yourArea" className={labelClass}>
                    <MapPin className="h-4 w-4 text-amber-600" />
                    Your Area <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="yourArea"
                    type="text"
                    name="yourArea"
                    value={draft.yourArea}
                    onChange={handleChange}
                    placeholder="Enter your area (e.g., Velachery, Adyar)"
                    className={fieldClass(Boolean(errors.yourArea))}
                  />
                  {errors.yourArea && (
                    <p className="mt-1 text-sm text-red-500">{errors.yourArea}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="areaToAttend" className={labelClass}>
                    <MapPin className="h-4 w-4 text-amber-600" />
                    Area You Want to Attend <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="areaToAttend"
                    name="areaToAttend"
                    value={draft.areaToAttend}
                    onChange={handleChange}
                    className={fieldClass(Boolean(errors.areaToAttend))}
                  >
                    <option value="">Select area to attend</option>
                    {attendAreas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                  {errors.areaToAttend && (
                    <p className="mt-1 text-sm text-red-500">{errors.areaToAttend}</p>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label htmlFor="dateOfBirth" className={labelClass}>
                    <CalendarDays className="h-4 w-4 text-amber-600" />
                    Date of Birth <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="dateOfBirth"
                    type="date"
                    name="dateOfBirth"
                    value={draft.dateOfBirth}
                    onChange={handleChange}
                    className={fieldClass(Boolean(errors.dateOfBirth))}
                  />
                  {errors.dateOfBirth ? (
                    <p className="mt-1 text-sm text-red-500">{errors.dateOfBirth}</p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">
                      This course is for youth aged {MIN_AGE} to {MAX_AGE}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="collegeName" className={labelClass}>
                    <GraduationCap className="h-4 w-4 text-amber-600" />
                    College Name <span className="text-gray-400">(Optional)</span>
                  </label>
                  <input
                    id="collegeName"
                    type="text"
                    name="collegeName"
                    value={draft.collegeName}
                    onChange={handleChange}
                    placeholder="Enter your college name"
                    className={fieldClass(false)}
                  />
                </div>

                <div>
                  <label htmlFor="email" className={labelClass}>
                    <Mail className="h-4 w-4 text-amber-600" />
                    Email <span className="text-gray-400">(Optional)</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={draft.email}
                    onChange={handleChange}
                    placeholder="Enter your email address"
                    className={fieldClass(Boolean(errors.email))}
                  />
                  {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
                </div>
              </div>
            )}

            <div className="mt-8 flex gap-3">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-amber-600 px-6 py-3 font-semibold text-amber-700 transition-colors hover:bg-amber-50"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Previous
                </button>
              )}
              <button
                type="button"
                onClick={goToPayment}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-500 px-6 py-3 font-semibold text-white transition-colors hover:from-amber-500 hover:to-orange-400"
              >
                {step === 1 ? "Next" : "Proceed to Payment"}
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
