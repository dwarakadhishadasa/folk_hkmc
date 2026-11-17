"use client"

import type { CSSProperties } from "react"
import Image from "next/image"
import Link from "next/link"
import { LogIn, LogOut } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/lib/auth-context"
import { currentProgramProfile } from "@/lib/current-program"

const HKMC_HEADER_LOGO =
  "https://pub-52c246542a924673ab52ddc511394567.r2.dev/assets/iskcon-logo-updated-transparent.png"

const headerThemeVars = {
  "--header-action-bg": "#f3f4f6",
  "--header-action-hover-bg": "#e5e7eb",
  "--header-action-text": "#374151",
  "--header-login-bg": "#701a1a",
  "--header-login-hover-bg": "#5a1515",
  "--header-login-text": "#ffffff",
  "--header-focus-ring": "#701a1a",
} as CSSProperties

export function CourseHeader() {
  const { isLoggedIn, logout, isAdmin, isPreacher, isAssistant, isVolunteer, username, role, isHydrated } =
    useAuth()
  const { branding } = currentProgramProfile

  const isStaffMember = isAdmin || isPreacher || isAssistant
  const portalHref = !isStaffMember && isVolunteer ? "/contact" : "/dashboard"

  return (
    <header
      className="sticky top-0 z-50 bg-white/95 px-3 py-2 text-neutral-900 shadow-md backdrop-blur-xl sm:px-5"
      style={headerThemeVars}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <Link
          href="/"
          aria-label={`${branding.shortName} home`}
          className="relative flex h-12 w-40 shrink-0 items-center justify-center transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)] sm:h-14 sm:w-44"
        >
          <Image
            src={HKMC_HEADER_LOGO}
            alt="ISKCON Chennai logo"
            width={1017}
            height={385}
            className="h-full w-full object-contain"
            priority
            unoptimized
          />
        </Link>

        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />

          {isHydrated &&
            (isLoggedIn ? (
              <>
                <span className="hidden text-xs capitalize text-neutral-500 lg:inline">
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
