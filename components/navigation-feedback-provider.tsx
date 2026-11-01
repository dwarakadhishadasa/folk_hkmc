"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"

interface NavigationFeedbackContextValue {
  isNavigating: boolean
  pendingPath: string | null
  startNavigation: (href: string, force?: boolean) => void
}

const NavigationFeedbackContext = createContext<NavigationFeedbackContextValue>({
  isNavigating: false,
  pendingPath: null,
  startNavigation: () => {},
})

function getLocalPathname(href: string): string | null {
  if (!href || href.startsWith("#")) {
    return null
  }

  try {
    const url = new URL(href, window.location.href)

    if (url.origin !== window.location.origin) {
      return null
    }

    return url.pathname || "/"
  } catch {
    return href.startsWith("/") ? href.split(/[?#]/)[0] || "/" : null
  }
}

function isSamePathOrChild(pathname: string, targetPath: string): boolean {
  if (targetPath === "/") {
    return pathname === "/"
  }

  return pathname === targetPath || pathname.startsWith(`${targetPath}/`)
}

export function NavigationFeedbackProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  const startNavigation = useCallback(
    (href: string, force = false) => {
      const targetPath = getLocalPathname(href)

      // A tab inside a section is a *sibling* of the current page, and the
      // parent-path rule below treats every child of `/contacts` as already
      // arrived at `/contacts`. `force` is for exactly that case: the caller
      // knows the navigation is real even though the path is a child.
      if (!targetPath || (!force && isSamePathOrChild(pathname, targetPath))) {
        return
      }

      setPendingPath(targetPath)
    },
    [pathname],
  )

  useEffect(() => {
    if (pendingPath && isSamePathOrChild(pathname, pendingPath)) {
      setPendingPath(null)
    }
  }, [pathname, pendingPath])

  useEffect(() => {
    if (!pendingPath) {
      return
    }

    const timeout = window.setTimeout(() => setPendingPath(null), 12000)

    return () => window.clearTimeout(timeout)
  }, [pendingPath])

  const value = useMemo(
    () => ({
      isNavigating: Boolean(pendingPath),
      pendingPath,
      startNavigation,
    }),
    [pendingPath, startNavigation],
  )

  return <NavigationFeedbackContext.Provider value={value}>{children}</NavigationFeedbackContext.Provider>
}

export function useNavigationFeedback() {
  return useContext(NavigationFeedbackContext)
}
