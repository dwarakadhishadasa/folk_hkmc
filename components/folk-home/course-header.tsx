"use client"

import type { CSSProperties } from "react"
import Image from "next/image"
import Link from "next/link"
import { LogIn, LogOut, Mail, Phone } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { COURSE_FACTS } from "@/components/folk-home/course-data"
import { useAuth } from "@/lib/auth-context"
import { currentProgramProfile } from "@/lib/current-program"

const headerThemeVars = {
  "--header-action-bg": "rgb(255 255 255 / 0.12)",
  "--header-action-hover-bg": "rgb(255 255 255 / 0.22)",
  "--header-action-text": "#ffffff",
  "--header-login-bg": "#ffffff",
  "--header-login-hover-bg": "#ffedd5",
  "--header-login-text": "#7c2d12",
  "--header-focus-ring": "#fcd34d",
} as CSSProperties

export function CourseHeader() {
  const { isLoggedIn, logout, isAdmin, isPreacher, isAssistant, isVolunteer, username, role, isHydrated } =
    useAuth()
  const { branding } = currentProgramProfile

  const isStaffMember = isAdmin || isPreacher || isAssistant
  const portalHref = !isStaffMember && isVolunteer ? "/contact" : "/dashboard"

  return (
    <header
      className="sticky top-0 z-50 bg-gradient-to-r from-amber-800 to-orange-700 px-3 py-2 text-white shadow-lg shadow-black/10 sm:px-5 sm:py-3"
      style={headerThemeVars}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <Link
          href="/"
          aria-label={`${branding.shortName} home`}
          className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/10 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)] sm:h-16 sm:w-16"
        >
          <Image
            src={branding.headerLogoSrc ?? branding.logoSrc}
            alt={branding.headerLogoAlt ?? branding.logoAlt}
            width={900}
            height={900}
            className="h-full w-full object-contain"
            priority
          />
        </Link>

        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          <a
            href={`mailto:${COURSE_FACTS.email}`}
            className="hidden items-center gap-2 text-sm text-amber-200 transition-colors hover:text-white md:flex"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            <span>{COURSE_FACTS.email}</span>
          </a>
          <a
            href={COURSE_FACTS.phoneHref}
            aria-label={`Call ${COURSE_FACTS.phone}`}
            className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-3 transition-colors hover:bg-white/20"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{COURSE_FACTS.phone}</span>
          </a>

          <ThemeToggle />

          {isHydrated &&
            (isLoggedIn ? (
              <>
                <span className="hidden text-xs capitalize text-amber-200 lg:inline">
                  {username} ({role})
                </span>
                <Link
                  href={portalHref}
                  className="inline-flex h-10 items-center rounded-full bg-[var(--header-login-bg)] px-4 text-xs font-semibold whitespace-nowrap text-[var(--header-login-text)] shadow-sm shadow-black/15 transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-[var(--header-login-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)] sm:text-sm"
                >
                  Portal
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  title="Logout"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--header-action-bg)] px-3 text-xs font-semibold text-[var(--header-action-text)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-[var(--header-action-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)] sm:text-sm"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--header-login-bg)] px-3 text-xs font-semibold whitespace-nowrap text-[var(--header-login-text)] shadow-sm shadow-black/15 transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-[var(--header-login-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)] min-[360px]:px-4 sm:text-sm"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span className="hidden min-[360px]:inline">Staff Login</span>
              </Link>
            ))}
        </div>
      </div>
    </header>
  )
}
