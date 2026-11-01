"use client"

import { useSyncExternalStore } from "react"

const WIDE_QUERY = "(min-width: 768px)"

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY)
  query.addEventListener("change", onChange)

  return () => query.removeEventListener("change", onChange)
}

function getSnapshot() {
  return window.matchMedia(WIDE_QUERY).matches
}

/** The server does not know the viewport, so it renders the chart-less shape. */
function getServerSnapshot() {
  return false
}

/**
 * True on the desktop/tablet frame, false on the phone.
 *
 * Charts are the one part of Overview that cannot render inside a `display:
 * none` card — Recharts measures its container and warns at width 0 — so they
 * mount only where the layout actually gives them a box. The figures and their
 * links do not depend on this hook; only the drawing does.
 */
export function useWideViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
