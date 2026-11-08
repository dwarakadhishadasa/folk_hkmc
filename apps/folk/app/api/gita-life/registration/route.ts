import { randomUUID } from "node:crypto"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  createContact,
  findActivePreacherForLocation,
  findContactByPhone,
  findLocationByAreaName,
  normalizeMobile,
  type ContactAttachment,
} from "@/lib/supabase/data"
import { PAYMENT_METHODS } from "@/components/folk-home/course-data"

export const dynamic = "force-dynamic"

const BUCKET = "gita-life-payment-screenshots"
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
const MIN_AGE = 18
const MAX_AGE = 28

const SCREENSHOT_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

interface RegistrationFields {
  name: string
  mobile: string
  yourArea: string
  areaToAttend: string
  dateOfBirth: string
  collegeName?: string
  email?: string
  paymentMethod: "gpay" | "neft"
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : ""
}

function ageOn(dateOfBirth: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dob = new Date(Date.UTC(year, month - 1, day))
  if (dob.getUTCFullYear() !== year || dob.getUTCMonth() !== month - 1 || dob.getUTCDate() !== day) {
    return null
  }

  let age = today.getUTCFullYear() - year
  const monthDelta = today.getUTCMonth() - (month - 1)
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < day)) {
    age -= 1
  }
  return age
}

function matchesImageSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  }
  if (contentType === "image/webp") {
    const ascii = (from: number, length: number) =>
      String.fromCharCode(...bytes.slice(from, from + length))
    return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP"
  }
  return false
}

function parseRegistration(form: FormData): { fields?: RegistrationFields; error?: string } {
  const name = text(form.get("name"))
  const rawMobile = text(form.get("mobileNo"))
  const yourArea = text(form.get("yourArea"))
  const areaToAttend = text(form.get("areaToAttend"))
  const dateOfBirth = text(form.get("dateOfBirth"))
  const collegeName = text(form.get("collegeName"))
  const email = text(form.get("email"))
  const rawPaymentMethod = text(form.get("paymentMethod"))

  if (!name || name.length > 120) {
    return { error: "Name is required." }
  }

  const mobile = normalizeMobile(rawMobile)
  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
    return { error: "Enter a valid 10-digit mobile number." }
  }

  if (!yourArea || yourArea.length > 120) {
    return { error: "Please enter your area." }
  }

  if (!areaToAttend) {
    return { error: "Please select an area to attend." }
  }

  if (!dateOfBirth) {
    return { error: "Date of Birth is required." }
  }

  const age = ageOn(dateOfBirth)
  if (age === null) {
    return { error: "Enter a valid date of birth." }
  }

  if (age < MIN_AGE || age > MAX_AGE) {
    return { error: `This course is for youth aged ${MIN_AGE} to ${MAX_AGE}.` }
  }

  if (collegeName.length > 200) {
    return { error: "College name is too long." }
  }

  if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { error: "Enter a valid email address." }
  }

  const paymentMethod = PAYMENT_METHODS.find((method) => method.id === rawPaymentMethod)?.id
  if (!paymentMethod) {
    return { error: "Please select a payment method." }
  }

  return {
    fields: {
      name,
      mobile,
      yourArea,
      areaToAttend,
      dateOfBirth,
      collegeName: collegeName || undefined,
      email: email || undefined,
      paymentMethod,
    },
  }
}

function registrationNotes(fields: RegistrationFields): string {
  const lines = [`Area to attend: ${fields.areaToAttend}`]
  if (fields.email) {
    lines.push(`Email: ${fields.email}`)
  }
  return lines.join("\n")
}

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: "The registration form is required." }, { status: 400 })
  }

  const parsed = parseRegistration(form)
  if (!parsed.fields) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const fields = parsed.fields

  const screenshot = form.get("screenshot")
  if (!(screenshot instanceof File) || screenshot.size === 0) {
    return Response.json({ error: "A payment screenshot is required." }, { status: 400 })
  }

  if (screenshot.size > MAX_SCREENSHOT_BYTES) {
    return Response.json({ error: "File size should be less than 5MB." }, { status: 400 })
  }

  const extension = SCREENSHOT_EXTENSIONS[screenshot.type]
  const bytes = new Uint8Array(await screenshot.arrayBuffer())
  if (!extension || !matchesImageSignature(screenshot.type, bytes)) {
    return Response.json({ error: "Upload a JPEG, PNG or WebP image." }, { status: 400 })
  }

  try {
    const existing = await findContactByPhone(fields.mobile)
    if (existing) {
      return Response.json(
        { error: "This mobile number is already registered." },
        { status: 409 },
      )
    }

    const location = await findLocationByAreaName(fields.areaToAttend)
    if (!location) {
      return Response.json({ error: "Please select an area to attend." }, { status: 400 })
    }

    const preacher = await findActivePreacherForLocation(location.id)

    const supabaseAdmin = createSupabaseAdminClient()
    const objectPath = `registrations/${randomUUID()}.${extension}`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, bytes, { contentType: screenshot.type, upsert: false })

    if (uploadError) {
      console.error("[folk-home] failed to store the payment screenshot", uploadError)
      return Response.json({ error: "Unable to store the payment screenshot." }, { status: 500 })
    }

    const attachment: ContactAttachment = {
      kind: "payment_screenshot",
      path: objectPath,
      contentType: screenshot.type,
      size: screenshot.size,
      uploadedAt: new Date().toISOString(),
      metadata: {
        paymentMethod: fields.paymentMethod,
        paymentStatus: "pending",
      },
    }

    try {
      const contact = await createContact({
        name: fields.name,
        phone: fields.mobile,
        dateOfBirth: fields.dateOfBirth,
        college: fields.collegeName,
        address: fields.yourArea,
        comments: registrationNotes(fields),
        source: "Online registration",
        locationId: location.id,
        assignedPreacherUserId: preacher?.id,
        collectedByUserId: preacher?.id,
        attachments: [attachment],
      })

      return Response.json({ registrationId: contact.id }, { status: 201 })
    } catch (contactError) {
      await supabaseAdmin.storage.from(BUCKET).remove([objectPath])
      throw contactError
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate key")) {
      return Response.json(
        { error: "This mobile number is already registered." },
        { status: 409 },
      )
    }

    console.error("[folk-home] registration failed", error)
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
