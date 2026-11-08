"use client"

import { useState } from "react"
import Image from "next/image"
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock,
  Facebook,
  Gift,
  HelpCircle,
  Instagram,
  Mail,
  MapPin,
  Phone,
  Youtube,
} from "lucide-react"
import {
  BIG_QUESTIONS,
  COURSE_CHAPTERS,
  COURSE_FACTS,
  EXPERIENCE_ITEMS,
} from "@/components/folk-home/course-data"
import { currentProgramProfile } from "@/lib/current-program"

export function CourseLanding({ onRegister }: { onRegister: () => void }) {
  const [openChapter, setOpenChapter] = useState<number | null>(null)
  const { branding } = currentProgramProfile

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 z-10 bg-gradient-to-br from-amber-900/90 to-orange-800/90" />
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: "url('/gita-life/session-8.png')" }}
        />
        <div className="relative z-20 mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="mb-8 flex justify-center md:mb-6">
            <div className="rounded-lg bg-white/95 p-2 shadow-lg">
              <Image
                src="/gita-life/iskcon-logo.png"
                alt="ISKCON Logo"
                width={1017}
                height={385}
                className="h-12 w-auto object-contain md:h-16"
              />
            </div>
          </div>
          <div className="text-center text-white">
            <div className="mb-4 inline-block rounded-full bg-amber-500/30 px-3 py-1 text-xs text-amber-100 backdrop-blur-sm sm:text-sm">
              {COURSE_FACTS.audience}
            </div>
            <h2 className="mb-4 text-4xl font-bold md:text-6xl">
              Gita Life
              <span className="block text-amber-300">Foundation Course</span>
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-xl text-amber-100">{COURSE_FACTS.tagline}</p>
            <div className="mb-8 flex flex-wrap justify-center gap-4">
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 backdrop-blur-sm">
                <Clock className="h-5 w-5 text-amber-300" />
                <span>{COURSE_FACTS.time}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 backdrop-blur-sm">
                <CalendarDays className="h-5 w-5 text-amber-300" />
                <span>{COURSE_FACTS.days}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 backdrop-blur-sm">
                <MapPin className="h-5 w-5 text-amber-300" />
                <span>{COURSE_FACTS.areas}</span>
              </div>
            </div>
            <div className="mb-8 inline-block rounded-xl bg-white/10 px-6 py-3 backdrop-blur-sm">
              <span className="text-sm text-amber-200">Course Fee</span>
              <div className="text-3xl font-bold text-white">{COURSE_FACTS.fee}</div>
            </div>
            <button
              type="button"
              onClick={onRegister}
              className="mx-auto flex transform items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-4 text-lg font-bold text-white shadow-lg transition-all hover:-translate-y-1 hover:from-amber-400 hover:to-orange-400 hover:shadow-xl"
            >
              Register Now
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <h3 className="mb-12 text-center text-3xl font-bold text-amber-900">
            What You Will Experience
          </h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {EXPERIENCE_ITEMS.map((item) => (
              <div
                key={item.title}
                className="group overflow-hidden rounded-2xl bg-white shadow-lg transition-shadow hover:shadow-xl"
              >
                <div className="h-48 overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.title}
                    width={item.width}
                    height={item.height}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-5">
                  <h4 className="mb-2 text-lg font-bold text-amber-900">{item.title}</h4>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-gradient-to-br from-amber-900 via-orange-800 to-amber-800 px-4 py-20">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 h-40 w-40 rounded-full border border-amber-300" />
          <div className="absolute right-20 bottom-20 h-60 w-60 rounded-full border border-amber-300" />
          <div className="absolute top-1/2 left-1/4 h-20 w-20 rounded-full border border-amber-300" />
        </div>
        <div className="relative z-10 mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-4 py-2 text-sm text-amber-200 backdrop-blur-sm">
              <HelpCircle className="h-4 w-4" />
              Life&apos;s Biggest Questions
            </div>
            <h3 className="mb-4 text-3xl font-bold text-white md:text-4xl">Do You Want to Know...</h3>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {BIG_QUESTIONS.map((question) => (
              <div
                key={question}
                className="group rounded-2xl border border-amber-400/20 bg-white/10 p-6 backdrop-blur-sm transition-all hover:scale-[1.02] hover:border-amber-400/40"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 transition-colors group-hover:bg-amber-400">
                    <HelpCircle className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-xl leading-relaxed font-medium text-white">{question}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-lg text-amber-200">
            Discover answers to these questions and more in our comprehensive course
          </p>
        </div>
      </section>

      <section className="bg-gradient-to-b from-amber-50 to-orange-100 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm text-white">
              <BookOpen className="h-4 w-4" />
              Course Curriculum
            </div>
            <h3 className="mb-4 text-3xl font-bold text-amber-900 md:text-4xl">
              18 Transformative Chapters
            </h3>
            <p className="mx-auto max-w-2xl text-gray-600">
              Learn Bhagavad Gita philosophy for real practical life in a structured way
            </p>
          </div>
          <div className="grid gap-3">
            {COURSE_CHAPTERS.map((chapter, index) => {
              const isOpen = openChapter === index
              return (
                <div
                  key={chapter.title}
                  className="overflow-hidden rounded-xl bg-white shadow-md transition-all duration-300 hover:shadow-lg"
                >
                  <button
                    type="button"
                    onClick={() => setOpenChapter(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    className="group flex w-full items-center justify-between px-6 py-4 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-sm font-bold text-white">
                        {index + 1}
                      </div>
                      <h4 className="font-semibold text-amber-900 transition-colors group-hover:text-amber-700">
                        {chapter.title}
                      </h4>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-amber-600 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-40" : "max-h-0"}`}
                  >
                    <div className="px-6 pb-4 pl-20">
                      <p className="border-l-4 border-amber-400 pl-4 text-gray-600 italic">
                        {chapter.question}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-amber-700 to-orange-600 px-4 py-12">
        <div className="mx-auto max-w-4xl text-center text-white">
          <div className="mb-4 flex items-center justify-center gap-3">
            <Gift className="h-8 w-8 text-amber-200" />
            <h3 className="text-2xl font-bold">Free Gita Life Kit</h3>
          </div>
          <p className="mb-6 text-amber-100">Collect your exclusive Gita Life Kit at the first session!</p>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="rounded-lg bg-white/10 px-6 py-3 backdrop-blur-sm">
              Bhagavad-Gita As It Is (Book)
            </div>
            <div className="rounded-lg bg-white/10 px-6 py-3 backdrop-blur-sm">Mantra Meditation Kit</div>
          </div>
        </div>
      </section>

      <section className="bg-amber-50 px-4 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h3 className="mb-6 text-3xl font-bold text-amber-900">Secure Your Spot Today!</h3>
          <p className="mb-8 text-gray-600">
            Limited seats available. Register now to begin your journey into the timeless wisdom of
            Bhagavad Gita.
          </p>
          <button
            type="button"
            onClick={onRegister}
            className="transform rounded-full bg-gradient-to-r from-amber-600 to-orange-500 px-8 py-4 text-lg font-bold text-white shadow-lg transition-all hover:-translate-y-1 hover:from-amber-500 hover:to-orange-400 hover:shadow-xl"
          >
            Register Now - {COURSE_FACTS.fee}
          </button>
        </div>
      </section>

      <footer className="bg-amber-900 px-4 py-12 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 grid gap-8 md:grid-cols-3">
            <div className="text-center md:text-left">
              <h4 className="mb-4 text-lg font-bold text-amber-200">{COURSE_FACTS.title}</h4>
              <p className="mb-2 text-sm text-amber-300">A Project by Hare Krishna Movement Chennai</p>
              <p className="text-sm text-amber-400">Affiliated to ISKCON Bangalore</p>
            </div>
            <div className="text-center">
              <h4 className="mb-4 text-lg font-bold text-amber-200">Contact Us</h4>
              <div className="space-y-2">
                <a
                  href={COURSE_FACTS.phoneHref}
                  className="flex items-center justify-center gap-2 transition-colors hover:text-amber-300"
                >
                  <Phone className="h-4 w-4" />
                  <span>{COURSE_FACTS.phone}</span>
                </a>
                <a
                  href={`mailto:${COURSE_FACTS.email}`}
                  className="flex items-center justify-center gap-2 text-sm transition-colors hover:text-amber-300"
                >
                  <Mail className="h-4 w-4" />
                  <span>{COURSE_FACTS.email}</span>
                </a>
              </div>
            </div>
            <div className="text-center md:text-right">
              <h4 className="mb-4 text-lg font-bold text-amber-200">Visit Us</h4>
              <a
                href="https://www.google.com/maps?q=Hare+Krishna+Movement+Chennai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm leading-relaxed text-amber-300 transition-colors hover:text-white"
              >
                <div className="flex items-start justify-center gap-2 md:justify-end">
                  <MapPin className="mt-1 h-4 w-4 flex-shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Dakshina Dwaraka Dham</p>
                    <p className="text-xs text-amber-400">
                      Cultural Complex to Preserve and Promote Indian Heritage
                    </p>
                    <p className="mt-1">63, 1st Seaward Road, Valmiki Nagar,</p>
                    <p>Thiruvanmiyur, Chennai - 600041</p>
                  </div>
                </div>
              </a>
            </div>
          </div>
          <div className="border-t border-amber-800 pt-8">
            <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
              <div className="flex items-center gap-6">
                <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white">
                  <Image
                    src={branding.headerLogoSrc ?? branding.logoSrc}
                    alt={branding.headerLogoAlt ?? branding.logoAlt}
                    width={900}
                    height={900}
                    className="h-full w-full object-contain"
                  />
                </span>
                <Image
                  src="/gita-life/dwaraka-dham-logo.png"
                  alt="Dakshina Dwaraka Dham Logo"
                  width={500}
                  height={500}
                  className="h-16 w-auto object-contain"
                />
              </div>
              <div className="flex items-center gap-4">
                <a
                  href="https://www.facebook.com/hkmcworld/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-800 transition-colors hover:bg-amber-700"
                >
                  <Facebook className="h-5 w-5" />
                </a>
                <a
                  href="https://www.instagram.com/hkm_chennai/?hl=en"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-800 transition-colors hover:bg-amber-700"
                >
                  <Instagram className="h-5 w-5" />
                </a>
                <a
                  href="https://youtube.com/@hkmchennai?si=R9Zp5_nuV--UfX0Y"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-800 transition-colors hover:bg-amber-700"
                >
                  <Youtube className="h-5 w-5" />
                </a>
                <a
                  href="https://whatsapp.com/channel/0029Vaa2fjKEVccFHx5YDt1O"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-800 transition-colors hover:bg-amber-700"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </a>
              </div>
              <p className="text-sm text-amber-400">www.hkmchennai.org</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
