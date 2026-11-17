"use client"

// Markup mirrors https://hkmchennai.org/activities/folk so the FOLK app's public
// landing matches the main site. Images and the footer video stay on the HKMC CDN.

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, BookOpen, Coffee, Compass, Lightbulb, Phone, UserCheck, Users, Zap } from "lucide-react"
import { FolkClubFooter } from "@/components/folk-home/folk-club-footer"

const CDN = "https://pub-52c246542a924673ab52ddc511394567.r2.dev"
const FOLK_LOGO = `${CDN}/assets/activitysectionnewimgs/folklogo.png`
const INTERACTIVE_SESSION_IMAGE = `${CDN}/assets/folk-interactive-session.jpg`
const PRAYER_IMAGE = `${CDN}/activities/folk/folk-prayer.jpg`
const DINING_IMAGE = `${CDN}/activities/folk/folk-dining.png`
const YATRA_IMAGE = `${CDN}/assets/activities/folkyatraimg.png`
const NIWAS_LOGO = `${CDN}/assets/activities/folkniwas.png`

const PILGRIMAGE_SITES = [
  "Vrindavan Dham",
  "Jagannath Puri",
  "Mayapur Dham",
  "Ahobilam",
  "Sri Rangam",
  "Tirupati",
  "Haridwar",
  "Rishikesh",
] as const

function Reveal({
  children,
  className,
  delay = 0,
  x = 0,
  y = 24,
  scale = 1,
}: {
  children: ReactNode
  className?: string
  delay?: number
  x?: number
  y?: number
  scale?: number
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, x, y, scale }}
      whileInView={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}

function ProgramFrame({
  imageSrc,
  imageAlt,
  imageLabel,
  imageCaption,
  rotation,
  imageClassName = "object-cover group-hover:scale-110 transition-transform duration-700",
}: {
  imageSrc: string
  imageAlt: string
  imageLabel: string
  imageCaption: string
  rotation: string
  imageClassName?: string
}) {
  return (
    <div className="relative flex flex-1 items-center justify-center py-10">
      <div
        className="relative w-full max-w-2xl cursor-pointer rounded-sm border border-gray-100 bg-white p-4 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] transition-all duration-700"
        style={{ transform: `rotate(${rotation})` }}
      >
        <div className="pointer-events-none absolute inset-2 z-20 border border-[#FFB81C]/30" />
        <div className="absolute -top-1 -left-1 z-20 h-4 w-4 border-t-2 border-l-2 border-[#FFB81C]" />
        <div className="absolute -right-1 -bottom-1 z-20 h-4 w-4 border-r-2 border-b-2 border-[#FFB81C]" />
        <div className="relative aspect-video w-full overflow-hidden bg-[#E0C9A6]/20">
          <img src={imageSrc} alt={imageAlt} loading="lazy" className={`absolute inset-0 h-full w-full ${imageClassName}`} />
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 via-transparent to-transparent p-6">
            <span className="text-lg font-bold tracking-widest text-[#FFB81C] uppercase">{imageLabel}</span>
            <span className="text-xs text-white opacity-70">{imageCaption}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function FolkClubLanding({ onRegister }: { onRegister: () => void }) {
  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <section className="relative flex min-h-[60vh] items-center justify-center overflow-hidden bg-[#2D0A0A] py-12 md:min-h-[75vh] md:py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-[#ea580c] via-[#b91c1c] to-[#7f1d1d] opacity-90" />
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 49px, #FFB81C 50px)" }}
        />
        <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-[#FFB81C] opacity-20 blur-[120px] md:h-[800px] md:w-[800px]" />

        <Reveal className="relative z-10 mx-auto w-full max-w-5xl px-4 text-center" scale={0.9} y={0}>
          <div className="mb-8 flex justify-center pt-4 md:mb-10 md:pt-8">
            <div className="flex h-36 w-36 items-center justify-center rounded-full border-4 border-[#FFB81C] bg-[#FFB81C]/10 p-2 shadow-[0_0_60px_rgba(255,184,28,0.5)] backdrop-blur-sm transition-transform duration-500 hover:scale-105 md:h-72 md:w-72 md:p-4">
              <img src={FOLK_LOGO} alt="FOLK Logo" width={450} height={450} className="h-full w-full object-contain drop-shadow-2xl" />
            </div>
          </div>
          <h1 className="mb-2 text-5xl font-bold tracking-tight text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] md:text-9xl">
            FOLK
          </h1>
          <h2 className="mb-8 inline-block rounded-full border border-[#FFB81C]/30 bg-[#2D0A0A]/30 px-8 py-2.5 text-sm font-bold tracking-widest text-[#FFB81C] uppercase shadow-lg backdrop-blur-sm md:text-3xl">
            Youth Empowerment Club
          </h2>
          <div className="mb-8 flex items-center justify-center gap-4">
            <div className="h-[2px] w-16 bg-gradient-to-l from-[#FFB81C] to-transparent md:w-32" />
            <div className="h-3 w-3 rotate-45 border-2 border-[#FFB81C] md:h-4 md:w-4" />
            <div className="h-[2px] w-16 bg-gradient-to-r from-[#FFB81C] to-transparent md:w-32" />
          </div>
          <p className="mx-auto max-w-4xl px-4 text-base leading-relaxed font-light text-[#ffe8cc] italic md:text-3xl">
            Friends Of Lord Krishna - Crystallizing the formative phase of the younger generation.
          </p>
        </Reveal>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 py-24 md:px-12">
        <div className="flex flex-col items-center gap-16 md:flex-row">
          <Reveal className="w-full space-y-8 md:w-1/2" x={-50} y={0}>
            <h2 className="text-4xl font-bold text-[#701a1a] md:text-5xl">
              Experience a <span className="text-[#ea580c]">Lifetime</span>
            </h2>
            <div className="h-1.5 w-24 rounded-full bg-[#ea580c]" />
            <p className="text-lg leading-relaxed font-medium text-[#5a5a5a]">
              FOLK is a vibrant youth outreach programme drawing students from premier institutions such as IIT
              Madras, Anna University, SRM College, and more. Participants receive subsidised accommodation and food,
              and are guided in living a disciplined, purposeful life through the principles of Bhakti Yoga.
            </p>
            <p className="text-lg leading-relaxed text-[#5a5a5a]">
              Value education sessions instil high moral and spiritual standards, helping young people make
              meaningful choices in their personal and professional lives.
            </p>
            <div className="relative rounded-xl border-l-[6px] border-[#FFB81C] bg-white p-8 shadow-xl">
              <div className="absolute top-4 left-4 text-4xl text-[#FFB81C] opacity-30">&quot;</div>
              <p className="pl-6 text-lg text-[#3A3A3A] italic">
                Nobody comes with a sealed guarantee that we might live up to a particular age. What is done in life
                earlier, especially if misguided, becomes impossible to be undone later in life.
              </p>
            </div>
          </Reveal>

          <Reveal
            className="relative h-[500px] w-full overflow-hidden rounded-t-full border-4 border-white shadow-2xl ring-1 ring-[#FFB81C]/30 md:w-1/2"
            scale={0.9}
            y={0}
          >
            <img
              src={INTERACTIVE_SESSION_IMAGE}
              alt="FOLK Interactive Session"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-110"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#2D0A0A] to-transparent p-10">
              <span className="text-xl font-bold tracking-widest text-[#FFB81C] uppercase">Interactive Sessions</span>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative bg-[#FFF9F0] py-24">
        <div className="relative z-10 mx-auto max-w-7xl px-6 md:px-12">
          <div className="mb-20 text-center">
            <h2 className="mb-6 text-4xl font-bold text-[#701a1a] drop-shadow-sm md:text-5xl">
              Why Join <span className="text-[#FFB81C]">FOLK?</span>
            </h2>
            <div className="mb-6 flex items-center justify-center gap-2">
              <div className="h-[1px] w-12 bg-[#701a1a]/30" />
              <div className="text-xl text-[#ea580c]">✦</div>
              <div className="h-[1px] w-12 bg-[#701a1a]/30" />
            </div>
            <p className="mx-auto max-w-2xl text-lg text-[#5a5a5a]">
              Based on the teachings of His Divine Grace A.C. Bhaktivedanta Swami Prabhupada, we present the treasure
              house of spiritual knowledge to youth.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            <Reveal className="group rounded-2xl border-t-[6px] border-[#ea580c] bg-white p-10 shadow-xl transition-all hover:shadow-2xl">
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF9F0] shadow-inner transition-colors duration-300 group-hover:bg-[#ea580c]">
                <Lightbulb className="h-8 w-8 text-[#ea580c] transition-colors duration-300 group-hover:text-white" />
              </div>
              <h3 className="mb-4 text-2xl font-bold text-[#701a1a] transition-colors group-hover:text-[#ea580c]">
                Interactive Sessions
              </h3>
              <p className="text-lg leading-relaxed text-[#5a5a5a]">
                Teaching how to apply Vedic wisdom to current world realities. Solutions to manage stress, improve
                memory, and excel in life.
              </p>
            </Reveal>

            <Reveal className="group rounded-2xl border-t-[6px] border-[#ea580c] bg-white p-10 shadow-xl transition-all hover:shadow-2xl" delay={0.1}>
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF9F0] shadow-inner transition-colors duration-300 group-hover:bg-[#ea580c]">
                <Users className="h-8 w-8 text-[#ea580c] transition-colors duration-300 group-hover:text-white" />
              </div>
              <h3 className="mb-4 text-2xl font-bold text-[#701a1a] transition-colors group-hover:text-[#ea580c]">
                Vibrant Community
              </h3>
              <p className="text-lg leading-relaxed text-[#5a5a5a]">
                A gala gathering every Sunday with spiritual classes, music, dance and delicious prasadam offered to
                Lord Krishna.
              </p>
            </Reveal>

            <Reveal className="group rounded-2xl border-t-[6px] border-[#ea580c] bg-white p-10 shadow-xl transition-all hover:shadow-2xl" delay={0.2}>
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF9F0] shadow-inner transition-colors duration-300 group-hover:bg-[#ea580c]">
                <UserCheck className="h-8 w-8 text-[#ea580c] transition-colors duration-300 group-hover:text-white" />
              </div>
              <h3 className="mb-4 text-2xl font-bold text-[#701a1a] transition-colors group-hover:text-[#ea580c]">
                Personality Enrichment
              </h3>
              <p className="text-lg leading-relaxed text-[#5a5a5a]">
                explore deeper selves and encourage introspection—a real need in today’s chaotic times.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 md:px-12">
        <h2 className="mb-20 text-center text-4xl font-bold text-[#701a1a] drop-shadow-sm md:text-6xl">
          FOLK Programs
        </h2>

        <div className="space-y-24">
          <div className="group flex flex-col items-center gap-16 md:flex-row">
            <Reveal className="order-2 flex-1 space-y-6 md:order-1" x={-40} y={0}>
              <div className="mb-2 inline-block rounded-full bg-[#FFB81C] px-5 py-2 text-sm font-bold text-[#2D0A0A] shadow-lg">
                2 SESSIONS
              </div>
              <h3 className="text-4xl font-bold text-[#701a1a]">1. AIM OF LIFE</h3>
              <div className="h-1 w-12 rounded-full bg-[#701a1a]" />
              <p className="text-lg leading-relaxed text-[#5a5a5a]">
                What is the real goal of life? An aimless person is like a ship that has lost its control over the sea.
                The Aim is defined as a strong will to achieve something. Every person must have a well-defined
                objective in life. It helps a person to understand the direction of his/her career. One will discover
                in these session the real aim of life which is ultimately going to help person and make his life
                peaceful and happy.
              </p>
            </Reveal>
            <div className="order-1 flex-1 md:order-2">
              <ProgramFrame
                imageSrc={PRAYER_IMAGE}
                imageAlt="Meditation"
                imageLabel="Aim of Life"
                imageCaption="Define Your Purpose"
                rotation="2deg"
              />
            </div>
          </div>

          <div className="group flex flex-col items-center gap-16 md:flex-row">
            <div className="order-1 flex-1">
              <ProgramFrame
                imageSrc={DINING_IMAGE}
                imageAlt="Discussion"
                imageLabel="Jijnasa"
                imageCaption="Discover the Missing Link"
                rotation="-2deg"
              />
            </div>
            <Reveal className="order-2 flex-1 space-y-6" x={40} y={0}>
              <div className="mb-2 inline-block rounded-full bg-[#ea580c] px-5 py-2 text-sm font-bold text-white shadow-lg">
                18 SESSIONS
              </div>
              <h3 className="text-4xl font-bold text-[#701a1a]">2. Jijnasa</h3>
              <div className="h-1 w-12 rounded-full bg-[#ea580c]" />
              <p className="text-lg leading-relaxed text-[#5a5a5a]">
                Despite the significant technological and medical advances mankind has been making in the last few
                decades, happiness in relationships and life seems to be on the downslide. Stress and dissatisfaction
                are apparently on the rise. The world seems to be missing something. What is that missing link? You can
                discover that missing link and many more things…
              </p>
            </Reveal>
          </div>

          <div className="group flex flex-col items-center gap-16 md:flex-row">
            <Reveal className="order-2 flex-1 space-y-6 md:order-1" x={-40} y={0}>
              <div className="mb-2 inline-block rounded-full bg-[#701a1a] px-5 py-2 text-sm font-bold tracking-widest text-[#FFB81C] uppercase shadow-lg">
                Annual Program
              </div>
              <h3 className="text-4xl font-bold text-[#701a1a]">3. FOLK Yatra: Soulful Adventure</h3>
              <div className="h-1 w-12 rounded-full bg-[#FFB81C]" />
              <p className="text-lg leading-relaxed text-[#5a5a5a]">
                Once we complete the courses, we take the youth to different spiritual places for an immersive
                experience. These yatras are not just trips but soulful adventures that deepen one&apos;s connection
                with spiritual roots and create lifelong memories with the community.
              </p>

              <div className="group/card relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#FFB81C]/20 to-[#ea580c]/20 opacity-50 blur-lg transition-opacity group-hover/card:opacity-100" />
                <div className="relative overflow-hidden rounded-2xl border border-white bg-white/80 p-8 shadow-xl backdrop-blur-sm">
                  <div className="relative z-10">
                    <div className="mb-6 flex items-center gap-3">
                      <Compass className="h-5 w-5 text-[#ea580c]" />
                      <h4 className="text-xs font-bold tracking-[0.2em] text-[#701a1a] uppercase">
                        A Soulful Pilgrimage to
                      </h4>
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                      {PILGRIMAGE_SITES.map((site) => (
                        <div key={site} className="group/item flex cursor-default items-center gap-3">
                          <div className="h-1.5 w-1.5 rounded-full bg-[#FFB81C] shadow-[0_0_8px_rgba(255,184,28,0.8)] transition-transform group-hover/item:scale-150" />
                          <span className="font-serif text-sm font-semibold text-[#4a4a4a] transition-colors group-hover/item:text-[#701a1a]">
                            {site}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-8 flex items-center gap-4 opacity-40">
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#ea580c]" />
                      <div className="h-1.5 w-1.5 rotate-45 border border-[#ea580c]" />
                      <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#ea580c]" />
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
            <div className="order-1 flex-1 md:order-2">
              <ProgramFrame
                imageSrc={YATRA_IMAGE}
                imageAlt="FOLK Yatra"
                imageLabel="Soulful Adventure"
                imageCaption="Experience the Divine"
                rotation="-2deg"
                imageClassName="object-cover opacity-80 transition-opacity duration-500 group-hover:opacity-100"
              />
            </div>
          </div>

          <div className="group flex flex-col items-center gap-16 md:flex-row">
            <div className="order-1 flex-1">
              <ProgramFrame
                imageSrc={PRAYER_IMAGE}
                imageAlt="Gita Life Foundation Course"
                imageLabel="Gita Life Course"
                imageCaption="Empower Your Youth"
                rotation="2deg"
              />
            </div>
            <Reveal className="order-2 flex-1 space-y-6" x={40} y={0}>
              <div className="mb-2 inline-block rounded-full bg-[#ea580c] px-5 py-2 text-sm font-bold tracking-widest text-white uppercase shadow-lg">
                8-Week Program
              </div>
              <h3 className="text-4xl font-bold text-[#701a1a]">4. Gita Life Foundation Course</h3>
              <div className="h-1 w-12 rounded-full bg-[#ea580c]" />
              <p className="text-lg leading-relaxed text-[#5a5a5a]">
                An 8-week Bhagavad-gita course designed specifically for young men (18-28) seeking clarity, purpose,
                and inner peace. Explore the timeless wisdom of the Gita to build strong character and resilience.
              </p>
              <button
                type="button"
                onClick={onRegister}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#701a1a] px-8 py-4 font-bold text-[#FFB81C] shadow-lg transition-colors hover:bg-[#5a1515]"
              >
                <span>Register Now</span>
                <ArrowRight className="h-[18px] w-[18px]" />
              </button>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 text-white">
        <div className="absolute inset-0 bg-[#2D0A0A]" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#2D0A0A] via-[#3d0e0e] to-[#1a0505] opacity-90" />
        <div className="pointer-events-none absolute top-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[#FFB81C] opacity-10 blur-[150px]" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-ping-slow absolute top-1/4 left-1/4 h-2 w-2 rounded-full bg-[#FFB81C] opacity-40" />
          <div className="animate-pulse-slow absolute top-3/4 right-1/4 h-3 w-3 rounded-full bg-[#ea580c] opacity-30 [animation-delay:700ms]" />
          <div className="animate-float-up absolute top-1/2 left-10 h-1 w-1 rounded-full bg-white opacity-50 [animation-delay:1000ms]" />
          <div className="animate-ping-slow absolute right-10 bottom-10 h-2 w-2 rounded-full bg-[#FFB81C] opacity-40 [animation-delay:500ms]" />
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
              backgroundSize: "50px 50px",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-6 md:px-12">
          <div className="mb-20 text-center">
            <div className="mb-12 flex justify-center">
              <Reveal className="group relative" scale={0.8} y={0}>
                <div className="absolute -inset-8 rounded-[2.75rem] bg-[#FFB81C]/18 opacity-0 blur-3xl transition-opacity duration-1000 group-hover:opacity-100" />
                <div className="relative h-48 w-44 rounded-[2.25rem] bg-gradient-to-br from-[#f4cf77] via-[#c98e2b] to-[#7a2a11] p-[3px] shadow-[0_24px_70px_rgba(20,5,5,0.32)] transition-all duration-700 group-hover:scale-[1.03] group-hover:shadow-[0_28px_90px_rgba(255,184,28,0.26)] md:h-72 md:w-64">
                  <div className="pointer-events-none absolute inset-[1px] rounded-[2.1rem] bg-gradient-to-b from-[#fff4d3]/60 to-transparent opacity-60" />
                  <div className="relative h-full w-full overflow-hidden rounded-[2.05rem] bg-[linear-gradient(160deg,#7c4318_0%,#8b4c1d_42%,#6d3314_100%)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,196,90,0.28),transparent_42%)]" />
                    <div className="pointer-events-none absolute inset-[10px] rounded-[1.65rem] border border-[#ffd277]/20" />
                    <div className="absolute top-4 left-4 h-8 w-8 rounded-xl border border-[#ffd277]/25 bg-white/5" />
                    <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl border border-[#ffd277]/20 bg-black/5" />
                    <div className="relative h-full w-full p-4 md:p-5">
                      <img
                        src={NIWAS_LOGO}
                        alt="FOLK Niwas Logo"
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-contain transition-transform duration-[1200ms] group-hover:scale-105"
                      />
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-tr from-transparent via-white/12 to-transparent transition-transform duration-[1500ms] ease-in-out group-hover:translate-x-full" />
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            <h2 className="mb-6 bg-gradient-to-r from-[#FFB81C] via-[#ffe8cc] to-[#FFB81C] bg-clip-text font-serif text-5xl font-bold text-transparent drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] md:text-7xl">
              FOLK Residency
            </h2>
            <div className="mb-8 flex items-center justify-center gap-4">
              <div className="h-[2px] w-24 bg-gradient-to-l from-[#ea580c] to-transparent" />
              <div className="h-3 w-3 rotate-45 bg-[#FFB81C] shadow-[0_0_10px_#FFB81C]" />
              <div className="h-[2px] w-24 bg-gradient-to-r from-[#ea580c] to-transparent" />
            </div>
            <p className="mx-auto max-w-4xl text-2xl leading-relaxed font-light text-[#ffe8cc] drop-shadow-md">
              &quot;Reintroducing today’s fast-tracked youth to the timeless concept of peaceful living.&quot;
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-20 lg:grid-cols-2">
            <div className="space-y-10">
              <div className="relative">
                <div className="absolute top-0 bottom-0 -left-4 w-1 bg-gradient-to-b from-[#FFB81C] to-transparent opacity-50" />
                <p className="pl-6 text-xl leading-relaxed font-light text-[#e0e0e0]">
                  Residencies in carefully chosen areas across Chennai and a few other Indian cities are maintained and
                  let out to bachelors who are either students or working professionals.{" "}
                  <span className="font-medium text-[#FFB81C]">
                    Closely following the teachings of His Divine Grace A.C. Bhaktivedanta Swami Prabhupada
                  </span>
                  , the Residency program invites youngsters to live with like-minded people.
                </p>
              </div>

              <div className="mt-8 space-y-6">
                <Reveal
                  className="group relative flex items-start gap-6 rounded-2xl border border-[#FFB81C]/20 bg-gradient-to-r from-white/10 to-transparent p-6 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-[#FFB81C]/60 hover:bg-white/15"
                  x={-30}
                  y={0}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#FFB81C] shadow-[0_0_20px_rgba(255,184,28,0.4)] transition-transform duration-300 group-hover:scale-110">
                    <UserCheck className="h-7 w-7 text-[#2D0A0A]" />
                  </div>
                  <div>
                    <h4 className="mb-1 text-lg font-bold text-[#FFB81C]">Balanced Living</h4>
                    <span className="text-lg leading-relaxed font-light text-[#f0f0f0]">
                      Companionship without compromising personal space
                    </span>
                  </div>
                </Reveal>

                <Reveal
                  className="group relative flex items-start gap-6 rounded-2xl border border-[#FFB81C]/20 bg-gradient-to-r from-white/10 to-transparent p-6 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-[#FFB81C]/60 hover:bg-white/15"
                  x={-30}
                  y={0}
                  delay={0.1}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#FFB81C] shadow-[0_0_20px_rgba(255,184,28,0.4)] transition-transform duration-300 group-hover:scale-110">
                    <Coffee className="h-7 w-7 text-[#2D0A0A]" />
                  </div>
                  <div>
                    <h4 className="mb-1 text-lg font-bold text-[#FFB81C]">Sattvic Prasadam</h4>
                    <span className="text-lg leading-relaxed font-light text-[#f0f0f0]">
                      Hygienic, nutritious, and 100% vegetarian food, thrice a day
                    </span>
                  </div>
                </Reveal>

                <Reveal
                  className="group relative flex items-start gap-6 rounded-2xl border border-[#FFB81C]/20 bg-gradient-to-r from-white/10 to-transparent p-6 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-[#FFB81C]/60 hover:bg-white/15"
                  x={-30}
                  y={0}
                  delay={0.2}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#FFB81C] shadow-[0_0_20px_rgba(255,184,28,0.4)] transition-transform duration-300 group-hover:scale-110">
                    <BookOpen className="h-7 w-7 text-[#2D0A0A]" />
                  </div>
                  <div>
                    <h4 className="mb-1 text-lg font-bold text-[#FFB81C]">Spiritual Culture</h4>
                    <span className="text-lg leading-relaxed font-light text-[#f0f0f0]">
                      Regular morning programs, meditation sessions, group discussions
                    </span>
                  </div>
                </Reveal>
              </div>
            </div>

            <Reveal className="relative" y={30}>
              <div className="animate-pulse-slow absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-[#ea580c] to-[#FFB81C] opacity-30 blur-2xl" />
              <div className="relative transform rounded-[2rem] bg-[#FFF9F0] p-2 text-[#3A3A3A] shadow-2xl transition-transform duration-500 hover:scale-[1.01]">
                <div className="h-full rounded-[1.8rem] border-2 border-[#ea580c] p-1">
                  <div className="relative h-full overflow-hidden rounded-[1.6rem] border border-[#ea580c]/30 p-8 md:p-10">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Zap className="h-[100px] w-[100px] rotate-12 text-[#ea580c]" />
                    </div>
                    <div className="relative z-10">
                      <div className="mb-4 inline-block rounded-full border border-[#ea580c]/20 bg-[#ea580c]/10 px-4 py-1 text-xs font-bold tracking-widest text-[#ea580c] uppercase">
                        Join the Community
                      </div>
                      <h3 className="mb-4 font-serif text-4xl font-bold text-[#701a1a]">Get Connected</h3>
                      <div className="mb-6 h-1 w-20 rounded-full bg-gradient-to-r from-[#ea580c] to-[#FFB81C]" />
                      <p className="mb-10 text-lg leading-relaxed font-medium text-[#5a5a5a]">
                        Sharing a house with diverse backgrounds gives you a chance to build relationships, learn life
                        skills, and grow as a compassionate, confident human being.
                      </p>
                      <div className="space-y-6">
                        <a
                          href="tel:+919789057101"
                          className="group flex w-full items-center justify-between rounded-xl border border-white/20 bg-gradient-to-r from-[#FFB81C] to-[#ea580c] p-5 text-lg font-bold text-white shadow-[0_10px_20px_rgba(234,88,12,0.3)] transition-all hover:-translate-y-1 hover:from-[#e5a810] hover:to-[#d97706] hover:shadow-[0_15px_30px_rgba(234,88,12,0.4)]"
                        >
                          <span className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                              <Phone className="h-4 w-4 fill-white" />
                            </span>
                            Call Us: +919789057101
                          </span>
                          <ArrowRight className="h-8 w-8 rounded-full bg-white p-1 text-[#ea580c] transition-transform group-hover:translate-x-2" />
                        </a>
                        <div className="rounded-xl border border-[#ea580c]/20 bg-white/80 p-6 text-center shadow-inner backdrop-blur">
                          <p className="mb-2 text-xs font-bold tracking-wide text-[#888] uppercase">
                            For more information
                          </p>
                          <a
                            href="mailto:connect@hkmchennai.org"
                            className="font-serif text-xl font-bold text-[#ea580c] transition-colors hover:text-[#701a1a]"
                          >
                            connect@hkmchennai.org
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <FolkClubFooter />
    </div>
  )
}
