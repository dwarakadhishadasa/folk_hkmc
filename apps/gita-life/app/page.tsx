import Image from "next/image"
import Link from "next/link"
import { LogIn, UserPlus } from "lucide-react"

export default function GitaLifeHome() {
  return (
    <main className="min-h-screen bg-[#F8FBF7] text-[#16324A]">
      <section className="relative overflow-hidden bg-[#123A5A] text-white">
        <Image
          src="/images/image.png"
          alt="Gita Life program gathering"
          fill
          priority
          className="object-cover opacity-30"
          sizes="100vw"
        />
        <div className="relative mx-auto flex min-h-[88vh] max-w-5xl flex-col justify-end px-4 pb-12 pt-20 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#F7C663]">HKM Chennai</p>
          <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-poppins)] text-4xl font-bold leading-tight sm:text-6xl">
            Gita Life
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">
            A practical Bhagavad Gita learning community with registration, attendance, sessions, and staff workflows
            supported by the Gita Life Portal.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F7C663] px-5 text-sm font-semibold text-[#123A5A] transition-colors hover:bg-[#f9d37d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Gita Life Portal
            </Link>
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/70 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F7C663]"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Register
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-8 sm:grid-cols-3 sm:px-6">
        {["Public registration", "Session attendance", "Staff follow-up"].map((item) => (
          <div key={item} className="rounded-lg border border-[#123A5A]/10 bg-white p-5 shadow-sm">
            <h2 className="font-[family-name:var(--font-poppins)] text-lg font-semibold">{item}</h2>
            <p className="mt-2 text-sm leading-6 text-[#16324A]/70">
              Program-scoped workflows use the Gita Life Airtable base and shared Supabase staff identity.
            </p>
          </div>
        ))}
      </section>
    </main>
  )
}
