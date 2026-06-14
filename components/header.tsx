"use client"

import type { CSSProperties, MouseEvent, ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarDays,
  LayoutDashboard,
  LogIn,
  LogOut,
  Send,
  Settings2,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react"
import { PWAInstallPrompt } from "@/components/pwa-install-prompt"
import { RouteProgressBar } from "@/components/route-progress-bar"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"
import { currentProgramProfile } from "@/lib/current-program"
import { useNavigationFeedback } from "@/components/navigation-feedback-provider"
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

function shouldIgnoreNavigationClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}

function NavAnchor({
  item,
  active,
  pending,
  className,
  children,
}: {
  item: HeaderNavItem
  active: boolean
  pending: boolean
  className: string
  children: ReactNode
}) {
  const { startNavigation } = useNavigationFeedback()
  const commonProps = {
    className,
    "aria-current": active ? ("page" as const) : undefined,
    "aria-busy": pending || undefined,
    title: item.label,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (item.newTab || shouldIgnoreNavigationClick(event)) {
        return
      }

      startNavigation(item.href)
    },
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

function DesktopNavItem({
  item,
  active,
  navigationPending,
  pending,
}: {
  item: HeaderNavItem
  active: boolean
  navigationPending: boolean
  pending: boolean
}) {
  const Icon = item.icon

  return (
    <NavAnchor
      item={item}
      active={active}
      pending={pending}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[var(--header-nav-text)] transition-[background-color,box-shadow,color,transform] duration-150",
        "hover:-translate-y-0.5 hover:bg-[var(--header-nav-hover-bg)] hover:text-[var(--header-nav-hover-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)]",
        active &&
          !navigationPending &&
          "bg-[var(--header-nav-active-bg)] text-[var(--header-nav-active-text)] shadow-sm shadow-black/10 hover:bg-[var(--header-nav-active-bg)] hover:text-[var(--header-nav-active-text)]",
        pending &&
          "bg-[var(--header-nav-pending-bg)] text-[var(--header-nav-pending-text)] shadow-sm ring-1 ring-[var(--header-nav-pending-ring)] hover:bg-[var(--header-nav-pending-bg)]",
      )}
    >
      {pending ? (
        <Spinner className="h-4 w-4 shrink-0 text-[var(--header-nav-pending-spinner)]" aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{item.label}</span>
    </NavAnchor>
  )
}

function MobileNavItem({
  item,
  active,
  navigationPending,
  pending,
}: {
  item: HeaderNavItem
  active: boolean
  navigationPending: boolean
  pending: boolean
}) {
  const Icon = item.icon

  return (
    <NavAnchor
      item={item}
      active={active}
      pending={pending}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold leading-none transition-[background-color,box-shadow,color,transform] duration-150",
        "text-[var(--program-text)]/70 hover:bg-black/5 hover:text-[var(--program-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]",
        active &&
          !navigationPending &&
          "bg-[var(--program-primary)] text-white shadow-md shadow-black/15 hover:bg-[var(--program-primary)] hover:text-white",
        pending &&
          "bg-[#FFF3DF] text-[var(--program-primary)] shadow-sm ring-1 ring-[var(--program-accent)] hover:bg-[#FFF3DF]",
      )}
    >
      {pending ? (
        <Spinner className="h-5 w-5 shrink-0 text-[var(--program-accent)]" aria-hidden="true" />
      ) : (
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      )}
      <span>{item.label}</span>
    </NavAnchor>
  )
}

const headerThemeVars = {
  "--header-bg": "var(--program-header-bg, var(--program-primary))",
  "--header-text": "var(--program-header-text, #ffffff)",
  "--header-muted-text": "var(--program-header-muted-text, rgb(255 255 255 / 0.7))",
  "--header-border": "var(--program-header-border, rgb(255 255 255 / 0.1))",
  "--header-logo-bg": "var(--program-header-logo-bg, #ffffff)",
  "--header-logo-ring": "var(--program-header-logo-ring, rgb(255 255 255 / 0.2))",
  "--header-nav-bg": "var(--program-header-nav-bg, rgb(255 255 255 / 0.1))",
  "--header-nav-ring": "var(--program-header-nav-ring, rgb(255 255 255 / 0.1))",
  "--header-nav-text": "var(--program-header-nav-text, rgb(255 255 255 / 0.8))",
  "--header-nav-hover-bg": "var(--program-header-nav-hover-bg, rgb(255 255 255 / 0.1))",
  "--header-nav-hover-text": "var(--program-header-nav-hover-text, #ffffff)",
  "--header-nav-active-bg": "var(--program-header-nav-active-bg, #ffffff)",
  "--header-nav-active-text": "var(--program-header-nav-active-text, var(--program-primary))",
  "--header-nav-pending-bg": "var(--program-header-nav-pending-bg, rgb(255 255 255 / 0.15))",
  "--header-nav-pending-text": "var(--program-header-nav-pending-text, #ffffff)",
  "--header-nav-pending-ring": "var(--program-header-nav-pending-ring, var(--program-accent))",
  "--header-nav-pending-spinner": "var(--program-header-nav-pending-spinner, var(--program-accent))",
  "--header-action-bg": "var(--program-header-action-bg, rgb(255 255 255 / 0.1))",
  "--header-action-hover-bg": "var(--program-header-action-hover-bg, rgb(255 255 255 / 0.2))",
  "--header-action-text": "var(--program-header-action-text, #ffffff)",
  "--header-login-bg": "var(--program-header-login-bg, var(--program-accent))",
  "--header-login-hover-bg": "var(--program-header-login-hover-bg, var(--program-accent-dark))",
  "--header-login-text": "var(--program-header-login-text, #ffffff)",
  "--header-focus-ring": "var(--program-header-focus-ring, var(--program-accent))",
} as CSSProperties

export function Header() {
  const { isLoggedIn, logout, isAdmin, isPreacher, username, role, isHydrated } = useAuth()
  const pathname = usePathname()
  const { isNavigating, pendingPath } = useNavigationFeedback()
  const { branding } = currentProgramProfile

  const navItems: HeaderNavItem[] = isLoggedIn
    ? [
        ...(isPreacher ? [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
        { href: "/contact", label: "Contact", icon: UserRoundPlus },
        ...(isPreacher
          ? [
              { href: "/sessions", label: "Sessions", icon: CalendarDays },
              { href: isAdmin ? "/admin/invite" : "/volunteers", label: "Invite", icon: Send },
              { href: "/manage", label: "Manage", icon: Settings2, newTab: true, prefetch: false },
            ]
          : []),
      ]
    : []

  if (!isHydrated) {
    return (
      <header
        className="sticky top-0 z-50 border-b border-[var(--header-border)] bg-[var(--header-bg)] text-[var(--header-text)] shadow-lg shadow-black/10"
        style={headerThemeVars}
      >
        <div className="container mx-auto px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="relative h-10 w-28 rounded-xl bg-[var(--header-logo-bg)] p-1 shadow-sm ring-1 ring-[var(--header-logo-ring)] sm:h-12 sm:w-36 md:h-14 md:w-40">
              <Image src={branding.logoSrc} alt={branding.logoAlt} fill className="object-contain" priority />
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-[var(--header-border)] bg-[var(--header-bg)] text-[var(--header-text)] shadow-lg shadow-black/10"
        style={headerThemeVars}
      >
        <div className="container mx-auto px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="relative h-10 w-28 flex-shrink-0 rounded-xl bg-[var(--header-logo-bg)] p-1 shadow-sm ring-1 ring-[var(--header-logo-ring)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)] sm:h-12 sm:w-36 md:h-14 md:w-40"
            >
              <Image src={branding.logoSrc} alt={branding.logoAlt} fill className="object-contain" priority />
            </Link>
            {navItems.length > 0 && (
              <nav className="hidden items-center gap-1 rounded-full bg-[var(--header-nav-bg)] p-1 ring-1 ring-[var(--header-nav-ring)] backdrop-blur md:flex">
                {navItems.map((item) => {
                  const pending = pendingPath ? isActivePath(pendingPath, item.href) : false

                  return (
                    <DesktopNavItem
                      key={item.href}
                      item={item}
                      active={isActivePath(pathname, item.href)}
                      navigationPending={isNavigating}
                      pending={pending}
                    />
                  )
                })}
              </nav>
            )}
            <div className="flex items-center gap-2 sm:gap-3">
              {isLoggedIn ? (
                <>
                  <span className="hidden text-xs capitalize text-[var(--header-muted-text)] lg:inline">
                    {username} ({role})
                  </span>
                  <button
                    onClick={logout}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--header-action-bg)] px-3 text-xs font-semibold text-[var(--header-action-text)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-[var(--header-action-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)] sm:text-sm"
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--header-login-bg)] px-4 text-xs font-semibold text-[var(--header-login-text)] shadow-sm shadow-black/15 transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-[var(--header-login-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--header-focus-ring)] sm:text-sm"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
        {navItems.length > 0 && (
          <nav
            data-mobile-app-nav
            className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_36px_rgba(45,10,10,0.12)] backdrop-blur md:hidden"
          >
            <div className="mx-auto flex max-w-md items-center gap-1">
              {navItems.map((item) => {
                const pending = pendingPath ? isActivePath(pendingPath, item.href) : false

                return (
                  <MobileNavItem
                    key={item.href}
                    item={item}
                    active={isActivePath(pathname, item.href)}
                    navigationPending={isNavigating}
                    pending={pending}
                  />
                )
              })}
            </div>
          </nav>
        )}
        <RouteProgressBar />
      </header>
      <PWAInstallPrompt />
    </>
  )
}
