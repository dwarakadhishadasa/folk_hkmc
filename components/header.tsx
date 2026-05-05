"use client"

import Image from "next/image"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"

export function Header() {
  const { isLoggedIn, logout, isAdmin, isPreacher, username, role, isHydrated } = useAuth()

  if (!isHydrated) {
    return (
      <header className="bg-[#0F1E54] text-white shadow-lg">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="relative h-10 w-28 sm:h-12 sm:w-36 md:h-14 md:w-40 bg-white rounded-lg p-1">
              <Image src="/images/folk-logo.jpg" alt="FOLK Chennai Logo" fill className="object-contain" priority />
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="bg-[#0F1E54] text-white shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="relative h-10 w-28 sm:h-12 sm:w-36 md:h-14 md:w-40 bg-white rounded-lg p-1 flex-shrink-0"
          >
            <Image src="/images/folk-logo.jpg" alt="FOLK Chennai Logo" fill className="object-contain" priority />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4 md:gap-6">
            {!isLoggedIn && (
              <Link
                href="/"
                className="text-xs sm:text-sm text-white/90 hover:text-[#F98B1C] transition-colors font-medium"
              >
                Home
              </Link>
            )}
            {isLoggedIn && (
              <>
                <Link
                  href="/contact"
                  className="text-xs sm:text-sm text-white/90 hover:text-[#F98B1C] transition-colors font-medium"
                >
                  <span className="hidden xs:inline">Add </span>Contact
                </Link>
                {isPreacher && (
                  <>
                    <Link
                      href="/dashboard"
                      className="text-xs sm:text-sm text-white/90 hover:text-[#F98B1C] transition-colors font-medium"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/sessions"
                      className="text-xs sm:text-sm text-white/90 hover:text-[#F98B1C] transition-colors font-medium"
                    >
                      Sessions
                    </Link>
                    <Link
                      href="/volunteers"
                      className="text-xs sm:text-sm text-white/90 hover:text-[#F98B1C] transition-colors font-medium"
                    >
                      Invite
                    </Link>
                    <Link
                      href="/manage"
                      target="_blank"
                      rel="noopener noreferrer"
                      prefetch={false}
                      className="text-xs sm:text-sm text-white/90 hover:text-[#F98B1C] transition-colors font-medium"
                    >
                      Manage
                    </Link>
                  </>
                )}
              </>
            )}
            <a
              href="https://hkmchennai.org/folk/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:block text-xs sm:text-sm text-white/90 hover:text-[#F98B1C] transition-colors font-medium"
            >
              Website
            </a>
            {isLoggedIn ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="hidden md:inline text-xs text-white/70 capitalize">
                  {username} ({role})
                </span>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 text-xs sm:text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors font-medium"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-[#F98B1C] hover:bg-[#e07a10] rounded-lg transition-colors font-medium"
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}
