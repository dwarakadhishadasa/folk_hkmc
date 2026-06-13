"use client"

import Link from "next/link"
import { LogIn, UserPlus } from "lucide-react"
import { Header } from "@/components/header"

const courseTopics = [
  {
    icon: "🙏",
    title: "God - Imagination or Reality?",
    description: "Explore the existence of a supernatural power through philosophy and science.",
  },
  {
    icon: "📖",
    title: "Explore Gita",
    description: "Journey into timeless wisdom that remains profoundly relevant today.",
  },
  {
    icon: "🧘",
    title: "Yoga for Modern Age",
    description: "Discover the deeper meaning of yoga beyond physical practice.",
  },
  {
    icon: "⚡",
    title: "The Power of Habits",
    description: "Learn the science of habits and laws for lasting transformation.",
  },
  {
    icon: "🔬",
    title: "Science & Spirituality",
    description: "Bridge modern science with ancient Vedic wisdom.",
  },
  {
    icon: "🏆",
    title: "Handling Competition",
    description: "Transform competition into a tool for personal empowerment.",
  },
  {
    icon: "⚖️",
    title: "The Law of Karma",
    description: "Understand how actions shape your destiny and live responsibly.",
  },
  {
    icon: "🧠",
    title: "Self-Management",
    description: "Master your emotions and discover your true identity.",
  },
]

const testimonials = [
  {
    quote:
      "If there's one club you want to be part of as a youth, it is FOLK. The last 7 months brought drastic transformations in my life. I got clarity on the purpose of my life and made meditation a daily habit.",
    name: "Dhanush Raj G N",
    role: "Communications Skills Coach",
  },
  {
    quote:
      "The program has been life-changing. I have learned spiritual concepts that helped me let go of bad habits. I used to struggle with anxiety, but now I feel more peaceful and calm than ever before.",
    name: "Bhaskar J",
    role: "Engineering Student",
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-[#0F1E54] via-[#1a2d6d] to-[#0F1E54] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 bg-[#F98B1C] rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-40 h-40 bg-[#F98B1C] rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-20 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block px-4 py-1.5 bg-[#F98B1C]/20 text-[#F98B1C] rounded-full text-sm font-medium mb-4">
              Youth Empowerment Program
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight font-[family-name:var(--font-poppins)]">
              Friends Of Lord Krishna
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/80 mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed">
              Crystallizing the formative phase of the younger generation with key values through the timeless wisdom of
              Bhagavad Gita
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F98B1C] px-5 text-sm font-semibold text-[#0F1E54] transition-colors hover:bg-[#fab54d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                FOLK Portal
              </Link>
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/70 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F98B1C]"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Register
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#FFF9F0] to-transparent" />
      </section>

      <main className="container mx-auto px-4 sm:px-6 py-10 sm:py-16 max-w-6xl">
        {/* About Section */}
        <section className="mb-12 sm:mb-20">
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-10 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-8 bg-[#F98B1C] rounded-full" />
              <h2 className="text-2xl sm:text-3xl font-bold text-[#24324A] font-[family-name:var(--font-poppins)]">
                Secrets of Success
              </h2>
            </div>
            <p className="text-[#24324A]/80 leading-relaxed mb-4 text-sm sm:text-base">
              FOLK runs a comprehensive program with vital and practical knowledge inherited from time-tested Vedic
              wisdom. Eight relevant and interesting topics are taught over 8 Sundays, covering everything from
              understanding God to mastering self-management.
            </p>
            <div className="flex flex-wrap gap-3 sm:gap-4 mt-6">
              <div className="flex items-center gap-2 text-sm text-[#24324A]/70">
                <span className="text-[#F98B1C]">✓</span> Meditation Kit
              </div>
              <div className="flex items-center gap-2 text-sm text-[#24324A]/70">
                <span className="text-[#F98B1C]">✓</span> Course Certificate
              </div>
              <div className="flex items-center gap-2 text-sm text-[#24324A]/70">
                <span className="text-[#F98B1C]">✓</span> Youth Festivals
              </div>
              <div className="flex items-center gap-2 text-sm text-[#24324A]/70">
                <span className="text-[#F98B1C]">✓</span> Fun Excursions
              </div>
            </div>
          </div>
        </section>

        {/* Course Topics */}
        <section className="mb-12 sm:mb-20">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#24324A] mb-3 font-[family-name:var(--font-poppins)]">
              8-Week Course Topics
            </h2>
            <p className="text-[#24324A]/70 max-w-2xl mx-auto text-sm sm:text-base">
              Each Sunday, explore a new dimension of life through the lens of ancient wisdom
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {courseTopics.map((topic, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-5 sm:p-6 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 group hover:-translate-y-1"
              >
                <div className="w-12 h-12 bg-[#0F1E54]/5 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#F98B1C]/10 transition-colors">
                  <span className="text-2xl">{topic.icon}</span>
                </div>
                <h3 className="font-semibold text-[#24324A] mb-2 text-sm sm:text-base font-[family-name:var(--font-poppins)]">
                  {topic.title}
                </h3>
                <p className="text-[#24324A]/60 text-xs sm:text-sm leading-relaxed">{topic.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section className="mb-12 sm:mb-20">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#24324A] mb-3 font-[family-name:var(--font-poppins)]">
              Transformations
            </h2>
            <p className="text-[#24324A]/70 text-sm sm:text-base">
              Hear from those whose lives have been touched by FOLK
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-[#0F1E54] to-[#1a2d6d] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden"
              >
                <div className="absolute top-4 right-4 text-6xl text-white/10 font-serif">&quot;</div>
                <p className="text-white/90 mb-6 leading-relaxed text-sm sm:text-base relative z-10">
                  {testimonial.quote}
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F98B1C] rounded-full flex items-center justify-center font-bold">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{testimonial.name}</p>
                    <p className="text-white/60 text-xs">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gradient-to-r from-[#F98B1C] to-[#fab54d] rounded-2xl p-6 sm:p-10 text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3 font-[family-name:var(--font-poppins)]">
            Ready to Transform Your Life?
          </h2>
          <p className="text-white/90 max-w-xl mx-auto text-sm sm:text-base">
            Join thousands of youth who have discovered their purpose through FOLK. Contact your nearest FOLK center to
            get started.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#0F1E54] text-white py-8 sm:py-12">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <p className="text-white/60 text-sm mb-4">A Youth Initiative by Hare Krishna Movement Chennai</p>
          <div className="flex justify-center gap-4 sm:gap-6">
            <a
              href="https://hkmchennai.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-[#F98B1C] text-sm transition-colors"
            >
              HKM Chennai
            </a>
            <a
              href="https://hkmchennai.org/activities/folk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-[#F98B1C] text-sm transition-colors"
            >
              About FOLK
            </a>
          </div>
          <p className="text-white/40 text-xs mt-6">© {new Date().getFullYear()} FOLK Chennai. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
