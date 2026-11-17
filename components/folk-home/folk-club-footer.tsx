"use client"

import { ArrowRight, Clock, Heart, Mail, MapPin, Phone } from "lucide-react"
import { COURSE_FACTS } from "@/components/folk-home/course-data"

const CDN = "https://pub-52c246542a924673ab52ddc511394567.r2.dev"
const HKMC = "https://hkmchennai.org"
const DIRECTIONS_URL = "https://www.google.com/maps?q=Hare+Krishna+Movement+Chennai"

const PILL_LINK_CLASS =
  "inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#FFB81C] to-[#FFD700] text-[#1a0800] font-extrabold text-xs uppercase tracking-widest shadow-[0_0_14px_rgba(255,184,28,0.35)] hover:shadow-[0_0_22px_rgba(255,215,0,0.55)] hover:scale-105 transition-all duration-300"

const COLUMN_TITLE_CLASS =
  "mb-6 inline-block border-b border-[#FFB81C]/50 pb-2 font-serif text-base font-bold tracking-widest text-[#FFB81C]"

export function FolkClubFooter() {
  return (
    <footer className="relative z-10 overflow-hidden border-t border-[#FFB81C]/30 bg-black text-white/90 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
      <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-[#FFB81C] to-transparent opacity-80 shadow-[0_0_15px_#FFB81C]" />
      <div className="pointer-events-none absolute right-[-10%] bottom-[-20%] h-[600px] w-[600px] rounded-full bg-[#FFB81C] opacity-15 blur-[150px]" />
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <video autoPlay loop muted playsInline className="absolute inset-0 h-full w-full scale-y-[-1] object-cover opacity-80">
          <source src={`${CDN}/assets/oceanvideo.mp4`} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/40" />
      </div>

      <div className="relative z-20 mx-auto max-w-[1380px] px-6 pt-16 pb-8 lg:pr-6 lg:pl-10 xl:pr-8 xl:pl-14">
        <div className="mb-16 grid grid-cols-1 gap-10 lg:grid-cols-12 xl:gap-12">
          <div className="relative lg:col-span-4 lg:pl-[140px]">
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="relative h-40 w-40 drop-shadow-[0_0_15px_rgba(255,184,28,0.3)] sm:h-52 sm:w-52">
                <img
                  src={`${CDN}/assets/dakshina-dwaraka-dham.png`}
                  alt="Dakshina Dwaraka Dham"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
            </div>
            <div className="absolute top-[-48px] right-[calc(100%-130px)] z-20 hidden h-72 w-72 drop-shadow-[0_0_15px_rgba(255,184,28,0.3)] transition-all duration-500 hover:scale-105 lg:block">
              <img
                src={`${CDN}/assets/dakshina-dwaraka-dham.png`}
                alt="Dakshina Dwaraka Dham"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
            <div className="flex-1 text-center lg:text-left">
              <div className="mb-6">
                <span className="block bg-gradient-to-r from-white via-[#FFB81C] to-white bg-clip-text font-serif text-3xl leading-tight font-extrabold tracking-tight text-transparent drop-shadow-md">
                  DAKSHINA DWARAKA DHAM
                </span>
                <span className="mt-2 block text-sm font-bold tracking-wide text-[#FFB81C] uppercase">
                  Project by Hare Krishna Movement Chennai
                </span>
                <span className="mt-1 block text-sm font-medium text-gray-300">
                  (Affiliated to ISKCON Bangalore Regn. S-49/78-79)
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed font-medium">
                <span className="bg-gradient-to-r from-[#FFD700] via-[#FDB931] to-[#FFD700] bg-clip-text px-1 text-transparent drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                  Dakshina Dwaraka Dham — Cultural Complex to Preserve and Promote Indian Heritage.
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-3 xl:gap-12">
            <div>
              <h3 className={COLUMN_TITLE_CLASS}>CONTACT US</h3>
              <ul className="space-y-4 text-sm text-gray-200">
                <li>
                  <a
                    href={COURSE_FACTS.phoneHref}
                    className="flex items-start gap-3 leading-relaxed transition-colors hover:text-[#FFB81C]"
                  >
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB81C]" />
                    <span>Ph: {COURSE_FACTS.phone}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${COURSE_FACTS.email}`}
                    className="flex items-start gap-3 break-all leading-relaxed transition-colors hover:text-[#FFB81C]"
                  >
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB81C]" />
                    <span>Email: {COURSE_FACTS.email}</span>
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className={COLUMN_TITLE_CLASS}>HOW TO REACH</h3>
              <div className="flex items-start gap-3 text-sm leading-relaxed text-gray-200">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB81C]" />
                <span>63, 1st Seaward Road, Valmiki Nagar, Thiruvanmiyur, Chennai - 600041</span>
              </div>
              <a className={`${PILL_LINK_CLASS} mt-6`} href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
                Get Directions
                <ArrowRight className="h-[13px] w-[13px] shrink-0" />
              </a>
            </div>

            <div>
              <h3 className={COLUMN_TITLE_CLASS}>TEMPLE DARSHAN TIMINGS</h3>
              <ul className="mb-5 space-y-2.5">
                {["4:30 AM – 4:55 AM", "7:15 AM – 1:00 PM", "4:15 PM – 8:15 PM"].map((timing) => (
                  <li key={timing} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFD700]" />
                    <span className="font-bold text-[#FFD700]">{timing}</span>
                  </li>
                ))}
              </ul>
              <a className={PILL_LINK_CLASS} href={`${HKMC}/temple`}>
                <Clock className="h-[13px] w-[13px] shrink-0" />
                Full Schedule
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-[#FFB81C]/30 pt-8 text-center md:mt-12 md:flex-row md:text-left">
          <div className="flex flex-col items-center gap-4 md:flex-row">
            <p className="text-sm text-gray-400">© 2026 Hare Krishna Movement Chennai. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs font-bold text-gray-300">
              <a className="transition-colors hover:text-[#FFB81C]" href={`${HKMC}/privacy-policy`}>
                Privacy Policy
              </a>
              <a className="transition-colors hover:text-[#FFB81C]" href={`${HKMC}/terms-and-conditions`}>
                Terms &amp; Conditions
              </a>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 text-sm font-medium text-gray-300 md:flex-row md:gap-2">
            <div className="flex items-center gap-1">
              <span>Made with</span>
              <Heart className="h-4 w-4 animate-pulse fill-red-500 text-red-500" />
              <span>by</span>
            </div>
            <a
              href="https://www.talentronaut.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold whitespace-nowrap text-[#FFD700] drop-shadow-[0_0_5px_rgba(255,215,0,0.6)] transition-all duration-300 hover:scale-105 hover:text-[#FFEC8B] hover:drop-shadow-[0_0_10px_rgba(255,236,139,0.8)]"
            >
              Talentronaut Technologies Pvt Ltd
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
