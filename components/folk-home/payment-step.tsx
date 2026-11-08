"use client"

import { useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Landmark,
  Loader2,
  Smartphone,
  Upload,
} from "lucide-react"
import {
  BANK_DETAILS,
  COURSE_FACTS,
  type PaymentMethod,
} from "@/components/folk-home/course-data"
import type { RegistrationDraft } from "@/components/folk-home/types"

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024

const copyableRows = [
  { label: "Account Name", value: BANK_DETAILS.accountName, key: "name" },
  { label: "Account Number", value: BANK_DETAILS.accountNumber, key: "account" },
  { label: "IFSC Code", value: BANK_DETAILS.ifscCode, key: "ifsc" },
  { label: "Bank Name", value: BANK_DETAILS.bankName, key: "bank" },
  { label: "Branch", value: BANK_DETAILS.branch, key: "branch" },
] as const

export function PaymentStep({
  draft,
  onBack,
  onSuccess,
}: {
  draft: RegistrationDraft
  onBack: () => void
  onSuccess: (registrationId: string) => void
}) {
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError("File size should be less than 5MB")
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setScreenshot(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError(null)
  }

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      setError("Unable to copy. Please copy the details manually.")
    }
  }

  const submit = async () => {
    if (!method || !screenshot) {
      setError("Please select a payment method and upload payment screenshot")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const body = new FormData()
      body.set("name", draft.name)
      body.set("mobileNo", draft.mobileNo)
      body.set("yourArea", draft.yourArea)
      body.set("areaToAttend", draft.areaToAttend)
      body.set("dateOfBirth", draft.dateOfBirth)
      body.set("collegeName", draft.collegeName)
      body.set("email", draft.email)
      body.set("paymentMethod", method)
      body.set("screenshot", screenshot)

      const response = await fetch("/api/gita-life/registration", { method: "POST", body })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        registrationId?: string
      }

      if (!response.ok || !data.registrationId) {
        throw new Error(data.error || "Something went wrong. Please try again.")
      }

      onSuccess(data.registrationId)
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setSubmitting(false)
    }
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
          Back to Form
        </button>

        <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="bg-gradient-to-r from-amber-700 to-orange-600 p-6 text-white">
            <h2 className="text-2xl font-bold">Complete Payment</h2>
            <p className="mt-1 text-amber-100">Course Fee: {COURSE_FACTS.fee}</p>
          </div>

          <div className="p-6">
            <h3 className="mb-4 font-semibold text-gray-800">Select Payment Method</h3>
            <div className="mb-6 grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setMethod("gpay")}
                className={`rounded-xl border-2 p-4 transition-all ${
                  method === "gpay"
                    ? "border-amber-500 bg-amber-50"
                    : "border-gray-200 hover:border-amber-300"
                }`}
              >
                <Smartphone
                  className={`mx-auto mb-2 h-8 w-8 ${
                    method === "gpay" ? "text-amber-600" : "text-gray-400"
                  }`}
                />
                <span className={`font-medium ${method === "gpay" ? "text-amber-700" : "text-gray-600"}`}>
                  GPay / UPI
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMethod("neft")}
                className={`rounded-xl border-2 p-4 transition-all ${
                  method === "neft"
                    ? "border-amber-500 bg-amber-50"
                    : "border-gray-200 hover:border-amber-300"
                }`}
              >
                <Landmark
                  className={`mx-auto mb-2 h-8 w-8 ${
                    method === "neft" ? "text-amber-600" : "text-gray-400"
                  }`}
                />
                <span className={`font-medium ${method === "neft" ? "text-amber-700" : "text-gray-600"}`}>
                  NEFT / IMPS
                </span>
              </button>
            </div>

            {method === "gpay" && (
              <div className="mb-6 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 p-6">
                <h4 className="mb-4 text-center font-semibold text-amber-900">Pay via GPay / UPI</h4>
                <div className="mb-4 rounded-lg bg-white p-4 shadow-inner">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/gita-life/payment-qr.jpeg"
                    alt="Payment QR Code"
                    width={720}
                    height={732}
                    className="mx-auto h-auto w-56 rounded-lg"
                  />
                </div>
                <p className="text-center text-sm text-gray-600">
                  Scan the QR code to pay {COURSE_FACTS.fee}
                </p>
              </div>
            )}

            {method === "neft" && (
              <div className="mb-6 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 p-6">
                <h4 className="mb-4 font-semibold text-amber-900">Bank Transfer Details</h4>
                <div className="space-y-3">
                  {copyableRows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between rounded-lg bg-white px-4 py-3"
                    >
                      <div>
                        <p className="text-xs text-gray-500">{row.label}</p>
                        <p className="font-medium text-gray-800">{row.value}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyValue(row.value, row.key)}
                        aria-label={`Copy ${row.label}`}
                        className="rounded-lg p-2 transition-colors hover:bg-amber-100"
                      >
                        {copiedKey === row.key ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4 text-amber-600" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {method && (
              <div className="mb-6">
                <h4 className="mb-3 font-semibold text-gray-800">Upload Payment Screenshot</h4>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {previewUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Payment screenshot"
                      className="h-48 w-full rounded-xl border-2 border-amber-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute right-2 bottom-2 rounded-lg bg-white/90 px-3 py-1 text-sm font-medium text-amber-700 backdrop-blur-sm transition-colors hover:bg-white"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 transition-colors hover:border-amber-500 hover:bg-amber-50"
                  >
                    <Upload className="h-8 w-8 text-amber-400" />
                    <span className="font-medium text-amber-600">Click to upload screenshot</span>
                    <span className="text-sm text-gray-400">PNG, JPG up to 5MB</span>
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!method || !screenshot || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 py-4 font-semibold text-white transition-colors hover:from-amber-500 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  Complete Registration
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
