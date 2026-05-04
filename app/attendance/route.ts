import { NextResponse } from "next/server"
import { findUserByPhone, createAttendanceRecord, getAttendanceByDate, hasAttendanceToday } from "@/lib/airtable"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("[v0] Received body:", JSON.stringify(body))

    const mobile = body.mobile?.replace(/\D/g, "").slice(-10)
    console.log("[v0] Cleaned mobile number:", mobile)

    if (!mobile || mobile.length !== 10) {
      console.log("[v0] Invalid mobile - length:", mobile?.length)
      return NextResponse.json({ error: "Invalid mobile number" }, { status: 400 })
    }

    console.log("[v0] Looking up user with phone:", mobile)
    const airtableUser = await findUserByPhone(mobile)
    console.log("[v0] Airtable user result:", airtableUser ? "Found" : "Not Found")

    if (!airtableUser) {
      return NextResponse.json(
        { error: "User not found. Please register first.", notRegistered: true },
        { status: 404 },
      )
    }

    const userName = airtableUser.fields.Name || "Unknown"

    const today = new Date().toISOString().split("T")[0]
    const alreadyMarked = await hasAttendanceToday(mobile, today)

    if (alreadyMarked) {
      console.log("[v0] Duplicate attendance detected for:", mobile)
      return NextResponse.json(
        {
          error: "Attendance already marked for today",
          duplicate: true,
          userName: userName,
        },
        { status: 409 },
      )
    }

    const attendanceRecord = await createAttendanceRecord({
      phone: mobile,
      name: userName,
    })

    if (!attendanceRecord) {
      return NextResponse.json({ error: "Failed to record attendance in Airtable" }, { status: 500 })
    }

    return NextResponse.json(
      {
        id: attendanceRecord.id,
        mobile: mobile,
        userName: userName,
        createdAt: new Date().toISOString(),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[v0] Attendance error:", error)
    return NextResponse.json({ error: "Failed to mark attendance" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") || new Date().toISOString().split("T")[0]

  console.log("[v0] GET /attendance called with date:", date)

  try {
    const airtableRecords = await getAttendanceByDate(date)
    console.log("[v0] Airtable records received:", airtableRecords?.length || 0)

    const attendanceList = (airtableRecords || []).map((record) => ({
      id: record.id,
      mobile: String(record.fields.Phone || ""),
      userName: record.fields.Name || "Unknown",
      createdAt: record.fields["Attendance Date"] || date,
    }))

    console.log("[v0] Mapped attendance list count:", attendanceList.length)

    return NextResponse.json(attendanceList, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    })
  } catch (error) {
    console.error("[v0] Failed to fetch attendance:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch attendance", details: errorMessage }, { status: 500 })
  }
}
