import { AttendanceForm } from "@/components/attendance-form"
import { Header } from "@/components/header"

export default function AttendPage() {
  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto px-4 py-6 sm:py-10 max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#24324A] mb-2 font-[family-name:var(--font-poppins)]">
            Mark Attendance
          </h1>
          <p className="text-[#24324A]/70 text-sm">Enter your mobile number to record your attendance</p>
        </div>
        <AttendanceForm />
      </main>
    </div>
  )
}
