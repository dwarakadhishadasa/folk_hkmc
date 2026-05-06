"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarDays,
  Home,
  LogIn,
  LogOut,
  Send,
  Settings2,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

interface HeaderNavItem {
  href: string
  label: string
  icon: LucideIcon
  newTab?: boolean
  prefetch?: boolean
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavAnchor({
  item,
  active,
  className,
  children,
}: {
  item: HeaderNavItem
  active: boolean
  className: string
  children: ReactNode
}) {
  const commonProps = {
    className,
    "aria-current": active ? ("page" as const) : undefined,
    title: item.label,
  }

  return (
    <Link
      href={item.href}
      target={item.newTab ? "_blank" : undefined}
      rel={item.newTab ? "noopener noreferrer" : undefined}
      prefetch={item.prefetch}
      {...commonProps}
    >
      {children}
    </Link>
  )
}

function DesktopNavItem({ item, active }: { item: HeaderNavItem; active: boolean }) {
  const Icon = item.icon

  return (
    <NavAnchor
      item={item}
      active={active}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white/80 transition-colors",
        "hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F98B1C]",
        active && "bg-white text-[#0F1E54] shadow-sm hover:bg-white hover:text-[#0F1E54]",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{item.label}</span>
    </NavAnchor>
  )
}

function MobileNavItem({ item, active }: { item: HeaderNavItem; active: boolean }) {
  const Icon = item.icon

  return (
    <NavAnchor
      item={item}
      active={active}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold leading-none transition-colors",
        "text-[#24324A]/70 hover:bg-[#0F1E54]/5 hover:text-[#0F1E54] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F98B1C]",
        active && "bg-[#0F1E54] text-white shadow-md shadow-[#0F1E54]/20 hover:bg-[#0F1E54] hover:text-white",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{item.label}</span>
    </NavAnchor>
  )
}

export function Header() {
  const { isLoggedIn, logout, isPreacher, username, role, isHydrated } = useAuth()
  const pathname = usePathname()

  const navItems: HeaderNavItem[] = isLoggedIn
    ? [
        { href: "/", label: "Home", icon: Home },
        { href: "/contact", label: "Contact", icon: UserRoundPlus },
        ...(isPreacher
          ? [
              { href: "/sessions", label: "Sessions", icon: CalendarDays },
              { href: "/volunteers", label: "Invite", icon: Send },
              { href: "/manage", label: "Manage", icon: Settings2, newTab: true, prefetch: false },
            ]
          : []),
      ]
    : [
        { href: "/", label: "Home", icon: Home },
      ]

  if (!isHydrated) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0F1E54] text-white shadow-lg">
        <div className="container mx-auto px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="relative h-10 w-28 rounded-lg bg-white p-1 sm:h-12 sm:w-36 md:h-14 md:w-40">
              <Image src="/images/folk-logo.jpg" alt="FOLK Chennai Logo" fill className="object-contain" priority />
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0F1E54] text-white shadow-lg">
      <div className="container mx-auto px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="relative h-10 w-28 flex-shrink-0 rounded-lg bg-white p-1 ring-1 ring-white/20 sm:h-12 sm:w-36 md:h-14 md:w-40"
          >
            <Image src="/images/folk-logo.jpg" alt="FOLK Chennai Logo" fill className="object-contain" priority />
          </Link>
          <nav className="hidden items-center gap-1 rounded-lg bg-white/10 p-1 ring-1 ring-white/10 backdrop-blur md:flex">
            {navItems.map((item) => (
              <DesktopNavItem key={item.href} item={item} active={isActivePath(pathname, item.href)} />
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {isLoggedIn ? (
              <>
                <span className="hidden text-xs capitalize text-white/70 lg:inline">
                  {username} ({role})
                </span>
                <button
                  onClick={logout}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F98B1C] sm:text-sm"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#F98B1C] px-3 text-xs font-semibold text-[#0F1E54] transition-colors hover:bg-[#fab54d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-4 sm:text-sm"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
      {isLoggedIn && (
        <nav
          data-mobile-app-nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-[#0F1E54]/10 bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,30,84,0.12)] backdrop-blur md:hidden"
        >
          <div className="mx-auto flex max-w-md items-center gap-1">
            {navItems.map((item) => (
              <MobileNavItem key={item.href} item={item} active={isActivePath(pathname, item.href)} />
            ))}
          </div>
        </nav>
      )}
    </header>
  )
}
