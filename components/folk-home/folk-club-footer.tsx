"use client"

import { ArrowRight, Clock, Facebook, Heart, Instagram, MapPin, Phone, Twitter, Youtube } from "lucide-react"

const CDN = "https://pub-52c246542a924673ab52ddc511394567.r2.dev"
const HKMC = "https://hkmchennai.org"

const PROGRAM_LINKS = [
  { label: "Gita Life", href: `${HKMC}/activities/gita-life` },
  { label: "ICVK (For Kids)", href: `${HKMC}/activities/icvk` },
  { label: "FOLK (For Youth)", href: "/" },
  { label: "Sunday Retreats", href: `${HKMC}/activities/sunday-retreats` },
] as const

const ABOUT_LINKS = [
  { label: "Our Mission", href: `${HKMC}/seven-purposes` },
  { label: "Srila Prabhupada", href: `${HKMC}/srila-prabhupada` },
  { label: "Our Team", href: `${HKMC}/about-hkm` },
  { label: "Spiritual Guidance", href: `${HKMC}/activities/spiritual-discourses` },
  { label: "Vaishnava Calendar", href: `${HKMC}/temple/vaishnava-calendar` },
] as const

const RESOURCE_LINKS = [
  { label: "Help Center", href: `${HKMC}/contact-us` },
  { label: "Contact Us", href: `${HKMC}/contact-us` },
  { label: "FAQ", href: `${HKMC}/philosophy/ask-any-question` },
  { label: "Privacy Policy", href: `${HKMC}/privacy-policy` },
  { label: "Terms & Conditions", href: `${HKMC}/terms-and-conditions` },
] as const

const SOCIAL_LINKS = [
  { label: "Facebook", href: "https://www.facebook.com/hkmcworld/", Icon: Facebook },
  { label: "Instagram", href: "https://www.instagram.com/hkm_chennai/?hl=en", Icon: Instagram },
  { label: "YouTube", href: "https://youtube.com/@hkmchennai?si=R9Zp5_nuV--UfX0Y", Icon: Youtube },
  { label: "X / Twitter", href: "https://x.com/ChennaiHare", Icon: Twitter },
] as const

const FOOTER_LINK_CLASS =
  "transition-all duration-300 flex items-center gap-2 text-sm uppercase tracking-wide text-gray-200 hover:text-[#FFB81C] hover:translate-x-1 font-medium"

const PILL_LINK_CLASS =
  "inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#FFB81C] to-[#FFD700] text-[#1a0800] font-extrabold text-xs uppercase tracking-widest shadow-[0_0_14px_rgba(255,184,28,0.35)] hover:shadow-[0_0_22px_rgba(255,215,0,0.55)] hover:scale-105 transition-all duration-300"

function FooterColumn({ title, links }: { title: string; links: readonly { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="mb-6 inline-block border-b border-[#FFB81C]/50 pb-2 font-serif text-base font-bold tracking-widest text-[#FFB81C]">
        {title}
      </h3>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <a className={FOOTER_LINK_CLASS} href={link.href}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFB81C]/70" />
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

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
              <div className="mt-4 flex items-start gap-3 text-sm text-gray-300">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#FFB81C]" />
                <span className="cursor-pointer leading-relaxed transition-colors hover:text-[#FFB81C]">
                  63, 1st Seaward Road, Valmiki Nagar, Thiruvanmiyur, Chennai- 600041
                </span>
              </div>
              <div className="flex flex-nowrap items-center justify-center gap-3 pt-6 lg:justify-start">
                {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    style={{ width: 42, height: 42, minWidth: 42 }}
                    className="flex shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/90 transition-all duration-300 hover:scale-110 hover:border-[#FFB81C] hover:bg-[#FFB81C] hover:text-[#1a0505] hover:shadow-[0_0_16px_rgba(255,184,28,0.55)] active:scale-95"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                ))}
                <a
                  href="https://api.whatsapp.com/send/?phone=919789057101"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  title="WhatsApp"
                  style={{ width: 42, height: 42, minWidth: 42 }}
                  className="flex shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/90 transition-all duration-300 hover:scale-110 hover:border-[#FFB81C] hover:bg-[#FFB81C] hover:text-[#1a0505] hover:shadow-[0_0_16px_rgba(255,184,28,0.55)] active:scale-95"
                >
                  <svg className="h-[17px] w-[17px]" fill="currentColor" viewBox="0 0 448 512" aria-hidden="true">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.7 17.8 69.4 27.2 106.2 27.2h.1c122.3 0 222-99.6 222-222 0-59.3-23-115.1-65.1-157.1zM223.9 445.9c-33.1 0-65.7-8.9-93.9-25.7l-6.7-4-69.8 18.3 18.7-68.1-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 54 81.2 54 130.5 0 101.8-82.7 184.6-184.4 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18s-8.8-2.8-12.5 2.8-14.3 18-17.6 21.8-6.5 4.2-12 1.4c-5.5-2.8-23.2-8.5-44.2-27.2-16.3-14.5-27.3-32.5-30.5-37.9s-.3-8.4 2.4-11.1c2.4-2.4 5.5-6.5 8.2-9.7 2.8-3.3 3.7-5.5 5.5-9.2s.9-6.9-.5-9.7-12.5-30.1-17.1-41.2c-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2s-9.7 1.4-14.8 6.9-19.4 19-19.4 46.3 20 53.6 22.8 57.3c2.8 3.7 39.4 60.2 95.5 84.4 13.3 5.8 23.7 9.2 31.9 11.9 13.4 4.3 25.7 3.7 35.4 2.2 10.8-1.6 32.8-13.4 37.4-26.4s4.6-24.1 3.2-26.4c-1.3-2.5-5-3.9-10.5-6.6z" />
                  </svg>
                </a>
                <a
                  href="tel:+919789057101"
                  aria-label="Show phone contacts"
                  title="Call Us"
                  style={{ width: 42, height: 42, minWidth: 42 }}
                  className="flex shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/90 transition-all duration-300 hover:scale-110 hover:border-[#FFB81C] hover:bg-[#FFB81C] hover:text-[#1a0505] hover:shadow-[0_0_16px_rgba(255,184,28,0.55)] active:scale-95"
                >
                  <Phone className="h-[18px] w-[18px]" />
                </a>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-[1fr_1fr_1fr_1.25fr_1.45fr] xl:gap-10">
            <FooterColumn title="PROGRAMS" links={PROGRAM_LINKS} />
            <FooterColumn title="ABOUT" links={ABOUT_LINKS} />
            <div>
              <FooterColumn title="RESOURCES" links={RESOURCE_LINKS} />
              <a className={`${PILL_LINK_CLASS} mt-1`} href={`${HKMC}/donate`}>
                <Heart className="h-[13px] w-[13px] shrink-0 fill-[#1a0800] text-[#1a0800]" />
                Donate
                <ArrowRight className="h-[13px] w-[13px] shrink-0" />
              </a>
            </div>
            <div className="lg:pr-2">
              <h3 className="mb-6 inline-block border-b border-[#FFD700]/50 pb-2 bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] bg-clip-text font-serif text-lg font-extrabold tracking-widest text-transparent drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]">
                PLAN YOUR VISIT
              </h3>
              <p className="mb-6 text-sm leading-relaxed text-gray-300">
                Darshan timings, dress code, directions &amp; more for your visit.
              </p>
              <a className={PILL_LINK_CLASS} href={`${HKMC}/blog/visitor-guide`}>
                Visitor Guide
                <ArrowRight className="h-[13px] w-[13px] shrink-0" />
              </a>
            </div>
            <div className="lg:pl-10 xl:pl-14">
              <h3 className="mb-6 inline-block border-b border-[#FFB81C]/50 pb-2 font-serif text-base font-bold tracking-widest text-[#FFB81C]">
                TEMPLE DARSHAN TIMINGS
              </h3>
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
