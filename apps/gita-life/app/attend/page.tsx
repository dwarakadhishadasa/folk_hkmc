import { AttendanceForm } from "@/components/attendance-form"
import { Header } from "@/components/header"

export default async function AttendPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session } = await searchParams

  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto max-w-md px-4 py-6 sm:py-10">
        <div className="text-center mb-6">
          <h1 className="mb-2 font-[family-name:var(--font-poppins)] text-2xl font-bold text-[var(--program-text)] sm:text-3xl">
            Mark Attendance
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">Enter your mobile number to record your attendance</p>
        </div>
        <AttendanceForm sessionId={session || ""} />
      </main>
    </div>
  )
}
