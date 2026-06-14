import Image from "next/image"
import Link from "next/link"
import {
  BookOpen,
  CalendarDays,
  Clock,
  Gift,
  MapPin,
  Phone,
  Send,
  Sparkles,
} from "lucide-react"
import { Header } from "@/components/header"

const infoCards = [
  {
    title: "Weekly Sessions",
    value: "Every Sunday",
    detail: "10:00 AM - 12:00 Noon",
    icon: Clock,
  },
  {
    title: "Venue",
    value: "Dakshina Dwaraka Dham",
    detail: "ISKCON Thiruvanmiyur",
    icon: MapPin,
  },
  {
    title: "Contact Us",
    value: "96009 67108",
    detail: "For registration and details",
    icon: Phone,
  },
  {
    title: "Special Offer",
    value: "Free for ICVK Parents",
    detail: "Join the community today",
    icon: Gift,
  },
]

const discussionTopics = [
  { title: "Purpose of Life", description: "What is the real purpose of life?" },
  { title: "Life After Death", description: "What happens after death?" },
  {
    title: "Modern Problems",
    description: "Why have problems increased even as science has advanced?",
  },
  { title: "Law of Karma", description: "How does karma work in everyday life?" },
]

export default function GitaLifeHome() {
  return (
    <div className="min-h-screen bg-[#FFF9F0] text-[#2D0A0A]">
      <Header />
      <main>
      <section className="relative overflow-hidden bg-[#2D0A0A] text-white">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.07]"
          style={{ backgroundImage: "url('/assets/5BlackWhiteMandalaPattern3.jpg')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#2D0A0A] via-[#3B0D0D] to-[#2D0A0A]" aria-hidden="true" />

        <div className="relative mx-auto grid min-h-[calc(100svh-4.5rem)] max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-14">
          <div>
            <div className="mb-8">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#FFB81C]">Dakshina Dwaraka Dham</p>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.24em] text-white/70">
                ISKCON Thiruvanmiyur Presents
              </p>
            </div>

            <Image
              src="/assets/activities/gita-life/Gita_life_logo.png"
              alt="Gita Life Logo"
              width={500}
              height={500}
              priority
              className="h-auto w-52 drop-shadow-2xl sm:w-64 lg:w-72"
            />

            <h1 className="mt-8 max-w-3xl font-[family-name:var(--font-poppins)] text-4xl font-bold leading-tight text-white sm:text-6xl">
              Foundational Concepts of the Gita
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
              An accessible programme for families to explore the timeless wisdom of the Bhagavad Gita and apply its
              principles in everyday life.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#EA580C] px-6 text-sm font-bold text-white shadow-lg shadow-black/20 transition-colors hover:bg-[#D97706] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB81C]"
              >
                Register Now
                <Send className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="tel:9600967108"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#FFB81C]/70 px-6 text-sm font-bold text-[#FFB81C] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB81C]"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                Call Coordinator
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-lg border border-[#FFB81C]/30 bg-white/5 shadow-2xl shadow-black/25">
              <Image
                src="/assets/about-hkm-krishna-arjuna.jpg"
                alt="Krishna and Arjuna"
                width={900}
                height={675}
                priority
                className="aspect-[4/3] h-auto w-full object-cover"
              />
              <div className="border-t border-white/10 bg-[#2D0A0A]/95 p-5">
                <p className="text-sm font-medium leading-6 text-[#FFB81C]">
                  &ldquo;Simply by knowing the science of Krishna, one becomes free.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-8 grid max-w-6xl gap-4 px-4 pb-10 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        {infoCards.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.title} className="relative rounded-lg border border-[#EA580C]/10 bg-white/95 p-5 shadow-lg shadow-[#2D0A0A]/5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF3DF] text-[#EA580C]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#D97706]">{item.title}</p>
              <h2 className="mt-2 text-xl font-bold text-[#2D0A0A]">{item.value}</h2>
              <p className="mt-1 text-sm leading-6 text-[#5F3B2E]/75">{item.detail}</p>
            </article>
          )
        })}
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#EA580C]/10 px-4 py-2 text-sm font-bold text-[#EA580C]">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Bhagavad Gita Study
          </div>
          <h2 className="mt-5 font-[family-name:var(--font-poppins)] text-3xl font-bold tracking-tight text-[#2D0A0A] sm:text-4xl">
            Unlock the Wisdom of Life
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[#5F3B2E]">
            Sessions are interactive. Participants are encouraged to ask questions and receive thoughtful answers. The
            Hare Krishna Mahamantra is introduced, and each session concludes with delicious prasadam.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {discussionTopics.map((topic) => (
              <article key={topic.title} className="rounded-lg border border-[#EA580C]/10 bg-white/95 p-5 shadow-sm">
                <div className="mb-3 h-2 w-2 rounded-full bg-[#EA580C]" />
                <h3 className="text-lg font-bold text-[#2D0A0A]">{topic.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5F3B2E]/75">{topic.description}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="self-start rounded-lg border border-[#EA580C]/15 bg-white/95 p-6 shadow-lg shadow-[#2D0A0A]/5">
          <div className="flex gap-5">
            <Image
              src="/assets/srila-prabhupada.png"
              alt="Srila Prabhupada"
              width={112}
              height={112}
              className="h-24 w-24 shrink-0 rounded-full border-2 border-[#EA580C] object-cover"
            />
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#D97706]">Based on the teachings of</p>
              <h2 className="mt-2 text-xl font-bold leading-tight text-[#2D0A0A]">
                His Divine Grace A.C. Bhaktivedanta Swami Prabhupada
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#5F3B2E]/75">
                Founder-Acharya of the International Society for Krishna Consciousness.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section className="border-t border-[#EA580C]/15 bg-white px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#D97706]">Participant registration</p>
            <h2 className="mt-2 text-2xl font-bold text-[#2D0A0A] sm:text-3xl">
              Joining Gita Life? Register first and our team will guide you.
            </h2>
          </div>
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#2D0A0A] px-6 text-sm font-bold text-[#FFB81C] transition-colors hover:bg-[#451010] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C]"
          >
            Register Now
            <Send className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="bg-[#FFF9F0] px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-2 text-sm font-medium text-[#5F3B2E]">
          <CalendarDays className="h-4 w-4 text-[#EA580C]" aria-hidden="true" />
          <span>Weekly Sunday sessions at Dakshina Dwaraka Dham.</span>
          <Sparkles className="h-4 w-4 text-[#EA580C]" aria-hidden="true" />
        </div>
      </section>
      </main>
    </div>
  )
}
