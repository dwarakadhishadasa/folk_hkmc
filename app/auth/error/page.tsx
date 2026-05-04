import Link from "next/link"
import { Header } from "@/components/header"

const messages: Record<string, string> = {
  "invalid-invite": "This invite link is missing required information.",
  "invite-verification-failed": "This invite link is invalid or has expired.",
  "staff-authorization-failed": "Your sign-in succeeded, but this email is not authorized as active staff.",
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams
  const message = messages[code || ""] || "We could not complete staff sign-in."

  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto max-w-md px-4 py-12">
        <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
          <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-[#24324A]">
            Sign-in Problem
          </h1>
          <p className="mt-3 text-sm text-[#24324A]/70">{message}</p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-xl bg-[#0F1E54] px-5 py-3 text-sm font-semibold text-white"
          >
            Back to Login
          </Link>
        </div>
      </main>
    </div>
  )
}
