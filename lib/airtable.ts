function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

const AIRTABLE_API_TOKEN = requireEnv("AIRTABLE_API_TOKEN")
const AIRTABLE_BASE_ID = requireEnv("AIRTABLE_BASE_ID")
// Table IDs are base-specific, so allow overriding them and fall back to stable table names.
const AIRTABLE_CONTACTS_TABLE = process.env.AIRTABLE_CONTACTS_TABLE_ID || process.env.AIRTABLE_CONTACTS_TABLE_NAME || "Contacts"
const AIRTABLE_ATTENDANCE_TABLE =
  process.env.AIRTABLE_ATTENDANCE_TABLE_ID || process.env.AIRTABLE_ATTENDANCE_TABLE_NAME || "Attendance"

const AIRTABLE_CONTACTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_CONTACTS_TABLE)}`
const AIRTABLE_ATTENDANCE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_ATTENDANCE_TABLE)}`

export interface AirtableRecord {
  id: string
  fields: {
    Name?: string
    Phone?: string
    Year?: string
    Source?: string
    Age?: number
    Location?: string
  }
}

export interface AttendanceRecord {
  id: string
  fields: {
    Phone?: string
    Name?: string
    "Attendance Date"?: string
  }
}

// Check if user exists by phone number
export async function findUserByPhone(phone: string): Promise<AirtableRecord | null> {
  if (!AIRTABLE_API_TOKEN) {
    console.error("[v0] AIRTABLE_API_TOKEN not configured")
    return null
  }

  try {
    // Try numeric comparison first (no quotes) since Phone might be stored as number
    const filterFormula = `{Phone}=${phone}`
    const encodedFilter = encodeURIComponent(filterFormula)
    const url = `${AIRTABLE_CONTACTS_URL}?filterByFormula=${encodedFilter}`

    console.log("[v0] Phone number being searched:", phone)
    console.log("[v0] Filter formula:", filterFormula)
    console.log("[v0] Full URL:", url)

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    })

    console.log("[v0] Airtable response status:", res.status)

    const responseText = await res.text()
    console.log("[v0] Airtable raw response:", responseText)

    if (!res.ok) {
      console.error("[v0] Airtable API error:", responseText)
      return null
    }

    const data = JSON.parse(responseText)
    console.log("[v0] Parsed records count:", data.records?.length || 0)

    if (data.records && data.records.length > 0) {
      console.log("[v0] Found user:", JSON.stringify(data.records[0].fields))
      return data.records[0]
    }

    // If no records found with numeric, try string comparison
    console.log("[v0] Trying string comparison...")
    const stringFilterFormula = `{Phone}='${phone}'`
    const stringEncodedFilter = encodeURIComponent(stringFilterFormula)
    const stringUrl = `${AIRTABLE_CONTACTS_URL}?filterByFormula=${stringEncodedFilter}`

    console.log("[v0] String filter formula:", stringFilterFormula)

    const stringRes = await fetch(stringUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    })

    const stringData = await stringRes.json()
    console.log("[v0] String comparison records count:", stringData.records?.length || 0)

    if (stringData.records && stringData.records.length > 0) {
      console.log("[v0] Found user with string match:", JSON.stringify(stringData.records[0].fields))
      return stringData.records[0]
    }

    console.log("[v0] No records found for phone:", phone)
    return null
  } catch (error) {
    console.error("[v0] Failed to query Airtable:", error)
    return null
  }
}

export async function createAttendanceRecord(data: {
  phone: string
  name: string
}): Promise<AttendanceRecord | null> {
  if (!AIRTABLE_API_TOKEN) {
    console.error("AIRTABLE_API_TOKEN not configured")
    return null
  }

  try {
    // Format current date as YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0]

    const res = await fetch(AIRTABLE_ATTENDANCE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            fields: {
              Phone: data.phone,
              Name: data.name,
              "Attendance Date": today,
            },
          },
        ],
      }),
    })

    if (!res.ok) {
      console.error("Airtable Attendance API error:", await res.text())
      return null
    }

    const result = await res.json()
    return result.records && result.records.length > 0 ? result.records[0] : null
  } catch (error) {
    console.error("Failed to create attendance record:", error)
    return null
  }
}

// Create a new registration record
export async function createRegistrationRecord(data: {
  name: string
  phone: string
  age: number
  year: string
  source: string
  location?: string
}): Promise<AirtableRecord | null> {
  if (!AIRTABLE_API_TOKEN) {
    console.error("AIRTABLE_API_TOKEN not configured")
    return null
  }

  try {
    const res = await fetch(AIRTABLE_CONTACTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            fields: {
              Name: data.name,
              Phone: data.phone,
              Age: data.age,
              Year: data.year,
              Source: data.source,
              Location: data.location || "",
            },
          },
        ],
      }),
    })

    if (!res.ok) {
      console.error("Airtable API error:", await res.text())
      return null
    }

    const result = await res.json()
    return result.records && result.records.length > 0 ? result.records[0] : null
  } catch (error) {
    console.error("Failed to create Airtable record:", error)
    return null
  }
}

export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  if (!AIRTABLE_API_TOKEN) {
    console.error("[v0] AIRTABLE_API_TOKEN not configured")
    return []
  }

  try {
    const filterFormula = `AND({Attendance Date} >= "${date}", {Attendance Date} < DATEADD("${date}", 1, 'day'))`
    const encodedFilter = encodeURIComponent(filterFormula)
    const url = `${AIRTABLE_ATTENDANCE_URL}?filterByFormula=${encodedFilter}`

    console.log("[v0] Fetching ALL attendance records to debug date format")
    console.log("[v0] Target date:", date)

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    console.log("[v0] Response status:", res.status)

    if (!res.ok) {
      const errorText = await res.text()
      console.error("[v0] Airtable Attendance fetch error:", errorText)
      return []
    }

    const data = await res.json()
    console.log("[v0] Total records in table:", data.records?.length || 0)
    return data.records || []
  } catch (error) {
    console.error("[v0] Failed to fetch attendance:", error)
    return []
  }
}

export async function hasAttendanceToday(phone: string, date: string): Promise<boolean> {
  if (!AIRTABLE_API_TOKEN) {
    console.error("[v0] AIRTABLE_API_TOKEN not configured")
    return false
  }

  try {
    const filterFormula = `AND({Phone}=${phone}, {Attendance Date} >= "${date}", {Attendance Date} < DATEADD("${date}", 1, 'day'))`
    const encodedFilter = encodeURIComponent(filterFormula)
    const url = `${AIRTABLE_ATTENDANCE_URL}?filterByFormula=${encodedFilter}`

    console.log("[v0] Checking duplicate attendance for phone:", phone)
    console.log("[v0] Filter formula:", filterFormula)

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      console.error("[v0] Duplicate check error:", await res.text())
      return false
    }

    const data = await res.json()
    const hasRecord = data.records && data.records.length > 0
    console.log("[v0] Duplicate attendance found:", hasRecord)

    return hasRecord
  } catch (error) {
    console.error("[v0] Failed to check duplicate attendance:", error)
    return false
  }
}
